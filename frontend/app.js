const state = {
  productsData: null
};

function escHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const el = {
  apiBaseUrl: document.getElementById("apiBaseUrl"),
  category: document.getElementById("category"),
  riskTolerance: document.getElementById("riskTolerance"),
  loanAmount: document.getElementById("loanAmount"),
  ltv: document.getElementById("ltv"),
  horizonMonths: document.getElementById("horizonMonths"),
  monthlySpend: document.getElementById("monthlySpend"),
  foreignSpendPercent: document.getElementById("foreignSpendPercent"),
  objective: document.getElementById("objective"),
  loadProductsBtn: document.getElementById("loadProductsBtn"),
  compareBtn: document.getElementById("compareBtn"),
  statusText: document.getElementById("statusText"),
  productsTableBody: document.querySelector("#productsTable tbody"),
  insightsText: document.getElementById("insightsText"),
  trendCanvas: document.getElementById("trendCanvas")
};

function setStatus(message, isError = false) {
  el.statusText.textContent = message;
  el.statusText.style.color = isError ? "#c13f2a" : "#62738a";
}

function parseNumber(value, fallback = undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getApiBaseUrl() {
  const explicit = el.apiBaseUrl.value.trim();
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }
  return "";
}

function buildUrl(path) {
  const base = getApiBaseUrl();
  return base ? `${base}${path}` : path;
}

async function apiGet(path) {
  const response = await fetch(buildUrl(path));
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error?.message || "API request failed");
  }
  return body;
}

async function apiPost(path, payload) {
  const response = await fetch(buildUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error?.message || "API request failed");
  }
  return body;
}

function renderProductsTable(data) {
  const rows = data.products || [];
  el.productsTableBody.innerHTML = "";
  for (const product of rows) {
    const tr = document.createElement("tr");
    const rate = product.ratePercent ?? product.aprPercent ?? null;
    tr.innerHTML = `
      <td>${escHtml(product.label || product.id)}</td>
      <td>${escHtml(product.type || "-")}</td>
      <td>${rate === null ? "-" : `${escHtml(rate)}%`}</td>
      <td>${product.realReturnPercent == null ? "-" : `${escHtml(product.realReturnPercent)}%`}</td>
      <td>${product.termMonths ? `${escHtml(product.termMonths)}m` : "-"}</td>
    `;
    el.productsTableBody.appendChild(tr);
  }
}

function drawTrend(data) {
  const ctx = el.trendCanvas.getContext("2d");
  const width = el.trendCanvas.width;
  const height = el.trendCanvas.height;
  ctx.clearRect(0, 0, width, height);

  const trendSeries = Object.entries(data.trends || {}).filter(([, values]) => Array.isArray(values) && values.length >= 2);
  if (!trendSeries.length) {
    ctx.fillStyle = "#62738a";
    ctx.font = "16px sans-serif";
    ctx.fillText("No trend data available", 20, 30);
    return;
  }

  const colors = ["#0e4bb3", "#0a7f45", "#c13f2a", "#7a52c7"];
  const allValues = trendSeries.flatMap(([, values]) => values.map((point) => Number(point.value)).filter(Number.isFinite));
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const span = Math.max(0.5, max - min);

  const padding = { top: 18, right: 16, bottom: 30, left: 42 };
  ctx.strokeStyle = "#cbd5e1";
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, height - padding.bottom);
  ctx.lineTo(width - padding.right, height - padding.bottom);
  ctx.stroke();

  trendSeries.forEach(([name, values], index) => {
    const color = colors[index % colors.length];
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    values.forEach((point, pointIndex) => {
      const x =
        padding.left +
        (pointIndex / (values.length - 1)) * (width - padding.left - padding.right);
      const y =
        padding.top +
        (1 - (Number(point.value) - min) / span) * (height - padding.top - padding.bottom);
      if (pointIndex === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = "12px sans-serif";
    ctx.fillText(name, padding.left + 8 + index * 160, height - 8);
  });
}

function collectCriteria() {
  return {
    riskTolerance: el.riskTolerance.value,
    loanAmount: parseNumber(el.loanAmount.value),
    ltv: parseNumber(el.ltv.value),
    horizonMonths: parseNumber(el.horizonMonths.value),
    monthlySpend: parseNumber(el.monthlySpend.value),
    foreignSpendPercent: parseNumber(el.foreignSpendPercent.value),
    objective: el.objective.value.trim()
  };
}

async function loadProducts() {
  const category = el.category.value;
  setStatus("Loading products...");
  const response = await apiGet(`/products/${category}`);
  state.productsData = response.data;
  renderProductsTable(response.data);
  drawTrend(response.data);
  setStatus(`Loaded ${response.data.products.length} products (${response.data.cache?.hit ? "cache" : "live"})`);
}

async function compare() {
  const category = el.category.value;
  setStatus("Running comparison and recommendations...");
  const payload = {
    category,
    criteria: collectCriteria()
  };
  const response = await apiPost("/compare", payload);

  const lines = [];
  lines.push(`Mode: ${response.recommendation.mode}`);
  lines.push("");
  if (response.recommendation.aiText) {
    lines.push(response.recommendation.aiText);
  } else {
    lines.push(response.recommendation.summary);
    lines.push("");
    for (const rec of response.recommendation.recommendations || []) {
      lines.push(`- ${rec.title}: ${rec.detail}`);
    }
  }
  lines.push("");
  const winner = response.comparison?.winner;
  if (winner) {
    lines.push(`Top option by score: ${winner.product.label} (${winner.score})`);
  }
  el.insightsText.textContent = lines.join("\n");
  setStatus("Comparison complete.");
}

async function guarded(action) {
  try {
    await action();
  } catch (error) {
    setStatus(error.message, true);
  }
}

el.loadProductsBtn.addEventListener("click", () => guarded(loadProducts));
el.compareBtn.addEventListener("click", () => guarded(compare));
el.category.addEventListener("change", () => {
  el.insightsText.textContent = "No insights yet.";
});

setStatus("Ready. Choose category and load data.");

