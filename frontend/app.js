/**
 * UK Financial Products Comparison Platform — Dashboard
 * All DOM mutations go through safe helpers (escHtml / setText / setHtml).
 * No direct innerHTML from API data except through escHtml-sanitised values.
 */

// ── State ────────────────────────────────────────────────────
const state = {
  category: "mortgages",
  productsData: null,
  trendChart: null
};

// ── DOM references ───────────────────────────────────────────
const el = {
  loadingOverlay: document.getElementById("loadingOverlay"),
  loadingLabel:   document.getElementById("loadingLabel"),
  apiBaseUrl:     document.getElementById("apiBaseUrl"),
  riskTolerance:  document.getElementById("riskTolerance"),
  loanAmount:     document.getElementById("loanAmount"),
  ltv:            document.getElementById("ltv"),
  horizonMonths:  document.getElementById("horizonMonths"),
  savingsAmount:  document.getElementById("savingsAmount"),
  monthlySpend:   document.getElementById("monthlySpend"),
  foreignSpendPercent: document.getElementById("foreignSpendPercent"),
  objective:      document.getElementById("objective"),
  charCount:      document.getElementById("charCount"),
  loadProductsBtn:document.getElementById("loadProductsBtn"),
  compareBtn:     document.getElementById("compareBtn"),
  statusBar:      document.getElementById("statusBar"),
  statusIcon:     document.getElementById("statusIcon"),
  statusText:     document.getElementById("statusText"),
  dataSourceBadge:document.getElementById("dataSourceBadge"),
  cacheBadge:     document.getElementById("cacheBadge"),
  chartPeriod:    document.getElementById("chartPeriod"),
  productsTableBody: document.getElementById("productsTableBody"),
  insightsPanel:  document.getElementById("insightsPanel"),
  insightsContent:document.getElementById("insightsContent"),
  aiModeBadge:    document.getElementById("aiModeBadge"),
  comparisonPanel:document.getElementById("comparisonPanel"),
  winnerCard:     document.getElementById("winnerCard"),
  rankingTable:   document.getElementById("rankingTable"),
  chartNote:      document.getElementById("chartNote"),
  trendChart:     document.getElementById("trendChart"),
  tabs:           document.querySelectorAll(".tab"),
  mortgageFields: document.getElementById("mortgageFields"),
  savingsFields:  document.getElementById("savingsFields"),
  creditCardFields: document.getElementById("creditCardFields")
};

// ── Security helpers ─────────────────────────────────────────
function escHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function setText(el, value) { el.textContent = String(value ?? ""); }
function setHtml(el, html) { el.innerHTML = html; } // only called with pre-sanitised content

// ── UI helpers ───────────────────────────────────────────────
function showLoading(message = "Loading…") {
  setText(el.loadingLabel, message);
  el.loadingOverlay.classList.remove("hidden");
  el.loadProductsBtn.disabled = true;
  el.compareBtn.disabled = true;
}
function hideLoading() {
  el.loadingOverlay.classList.add("hidden");
  el.loadProductsBtn.disabled = false;
  el.compareBtn.disabled = false;
}

function setStatus(message, type = "ok") {
  el.statusBar.classList.remove("hidden", "ok", "error", "loading");
  el.statusBar.classList.add(type);
  const icons = { ok: "✅", error: "❌", loading: "⏳" };
  setText(el.statusIcon, icons[type] || "ℹ️");
  setText(el.statusText, message);
}

function setBadge(badgeEl, text, extraClass = "") {
  badgeEl.className = "badge" + (extraClass ? " " + extraClass : "");
  setText(badgeEl, text);
}

function showPanel(panelEl) { panelEl.classList.remove("hidden"); }
function hidePanel(panelEl) { panelEl.classList.add("hidden"); }

// ── Category field switching ─────────────────────────────────
function updateFieldVisibility(category) {
  el.mortgageFields.classList.toggle("hidden", category !== "mortgages");
  el.savingsFields.classList.toggle("hidden", category !== "savings");
  el.creditCardFields.classList.toggle("hidden", category !== "credit-cards");
}

// ── API helpers ──────────────────────────────────────────────
function getApiBase() {
  const raw = el.apiBaseUrl.value.trim();
  return raw ? raw.replace(/\/+$/, "") : "";
}

function buildUrl(path) {
  const base = getApiBase();
  return base ? `${base}${path}` : path;
}

async function apiFetch(method, path, body) {
  const url = buildUrl(path);
  const options = {
    method,
    headers: { "Content-Type": "application/json" }
  };
  if (body !== undefined) options.body = JSON.stringify(body);
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `API error ${res.status}`);
  }
  return data;
}

// ── Criteria builder ─────────────────────────────────────────
function parsePosNum(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function collectCriteria() {
  const criteria = {
    riskTolerance: el.riskTolerance.value
  };
  const objective = el.objective.value.trim();
  if (objective) criteria.objective = objective;

  if (state.category === "mortgages") {
    criteria.loanAmount   = parsePosNum(el.loanAmount.value);
    criteria.ltv          = parsePosNum(el.ltv.value);
    criteria.horizonMonths = parsePosNum(el.horizonMonths.value);
  } else if (state.category === "savings") {
    criteria.loanAmount   = parsePosNum(el.savingsAmount.value);
  } else if (state.category === "credit-cards") {
    criteria.monthlySpend        = parsePosNum(el.monthlySpend.value);
    criteria.foreignSpendPercent = parsePosNum(el.foreignSpendPercent.value);
  }
  return criteria;
}

// ── Rate formatting ──────────────────────────────────────────
function fmtRate(value, suffix = "%") {
  if (value === null || value === undefined) return "—";
  return `${Number(value).toFixed(2)}${suffix}`;
}
function rateClass(value) {
  if (value === null || value === undefined) return "";
  return Number(value) >= 0 ? "rate-positive" : "rate-negative";
}
function fmtTerm(months) {
  if (!months) return "—";
  if (months >= 12 && months % 12 === 0) return `${months / 12}yr`;
  return `${months}m`;
}

// ── Products table ───────────────────────────────────────────
function renderProductsTable(data, winnerId = null) {
  const rows = data.products || [];
  if (!rows.length) {
    setHtml(el.productsTableBody, `<tr class="empty-row"><td colspan="6">No products returned</td></tr>`);
    return;
  }

  const html = rows.map((p) => {
    const isWinner = winnerId && p.id === winnerId;
    const rate = p.ratePercent ?? p.aprPercent ?? null;
    const realReturn = p.realReturnPercent ?? null;
    const notes = (p.assumptions || []).map((a) => escHtml(a)).join("; ");
    const winnerTag = isWinner ? `<span class="winner-tag">TOP PICK</span>` : "";

    return `<tr class="${isWinner ? "winner-row" : ""}">
      <td>${escHtml(p.label || p.id)}${winnerTag}</td>
      <td>${escHtml(p.type || "—")}</td>
      <td class="rate-value">${escHtml(fmtRate(rate))}</td>
      <td class="${rateClass(realReturn)}">${escHtml(fmtRate(realReturn))}</td>
      <td>${escHtml(fmtTerm(p.termMonths))}</td>
      <td class="col-notes">${notes || "—"}</td>
    </tr>`;
  }).join("");

  setHtml(el.productsTableBody, html);

  // Source badge
  const sources = data.sources || [];
  setBadge(el.dataSourceBadge, sources.join(" · "), "badge-boe");
  el.dataSourceBadge.classList.remove("hidden");

  // Cache badge
  const hit = data.cache?.hit;
  if (hit !== undefined) {
    setBadge(el.cacheBadge, hit ? "cached ⚡" : "live 🟢", hit ? "badge-cache" : "badge-live");
    el.cacheBadge.classList.remove("hidden");
  }
}

// ── Chart.js trend ───────────────────────────────────────────
const CHART_COLOURS = [
  { border: "#1a56db", bg: "rgba(26,86,219,0.08)" },
  { border: "#0a7f45", bg: "rgba(10,127,69,0.08)" },
  { border: "#c13f2a", bg: "rgba(193,63,42,0.08)" },
  { border: "#7c3aed", bg: "rgba(124,58,237,0.08)" }
];

const SERIES_LABELS = {
  fixed2y: "2yr Fixed",
  fixed3y: "3yr Fixed",
  fixed5y: "5yr Fixed",
  bankRate: "Bank Rate",
  fixedIsa2y: "2yr ISA",
  easyAccess: "Easy Access",
  inflation: "CPI Inflation",
  creditCardBenchmarkApr: "CC Avg APR"
};

function renderChart(trends) {
  const entries = Object.entries(trends || {}).filter(
    ([, pts]) => Array.isArray(pts) && pts.length >= 2
  );
  if (!entries.length) {
    el.chartNote.textContent = "Insufficient trend data available.";
    el.chartNote.classList.remove("hidden");
    return;
  }
  el.chartNote.classList.add("hidden");

  const labels = entries[0][1].map((p) => {
    const d = new Date(p.date);
    return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
  });

  const datasets = entries.map(([key, points], i) => {
    const colour = CHART_COLOURS[i % CHART_COLOURS.length];
    return {
      label: SERIES_LABELS[key] || key,
      data: points.map((p) => p.value),
      borderColor: colour.border,
      backgroundColor: colour.bg,
      borderWidth: 2.5,
      pointRadius: 2,
      pointHoverRadius: 5,
      tension: 0.3,
      fill: false
    };
  });

  if (state.trendChart) {
    state.trendChart.destroy();
    state.trendChart = null;
  }

  state.trendChart = new Chart(el.trendChart, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "bottom",
          labels: { boxWidth: 12, padding: 16, font: { size: 12 } }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)}%`
          }
        }
      },
      scales: {
        x: {
          grid: { color: "rgba(0,0,0,0.04)" },
          ticks: { font: { size: 11 }, maxTicksLimit: 12, maxRotation: 0 }
        },
        y: {
          grid: { color: "rgba(0,0,0,0.04)" },
          ticks: {
            font: { size: 11 },
            callback: (v) => `${v}%`
          }
        }
      }
    }
  });

  // Period label
  const allDates = entries.flatMap(([, pts]) => pts.map((p) => p.date));
  if (allDates.length >= 2) {
    const from = new Date(allDates[0]).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
    const to   = new Date(allDates[allDates.length - 1]).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
    setBadge(el.chartPeriod, `${from} – ${to}`, "badge-muted");
    el.chartPeriod.classList.remove("hidden");
  }
}

// ── Comparison winner card ────────────────────────────────────
function renderWinnerCard(winner, category) {
  if (!winner) { hidePanel(el.comparisonPanel); return; }

  const icons = { mortgages: "🏠", savings: "💰", "credit-cards": "💳" };
  const p = winner.product;
  const rate = p.ratePercent ?? p.aprPercent ?? null;
  const rateStr = rate !== null ? `${rate.toFixed(2)}%` : "";
  const scoreStr = `Score: ${winner.score}`;

  setHtml(el.winnerCard, `
    <div class="winner-card-icon">${escHtml(icons[category] || "🏆")}</div>
    <div class="winner-card-info">
      <h3>Top Pick</h3>
      <p>${escHtml(p.label || p.id)}</p>
      <p style="font-size:12px;color:var(--muted);">${escHtml(scoreStr)}</p>
    </div>
    ${rateStr ? `<div class="winner-card-rate">${escHtml(rateStr)}</div>` : ""}
  `);

  // Ranking table
  const rankHtml = `
    <table aria-label="Full product ranking">
      <thead><tr>
        <th>#</th><th>Product</th><th>Score</th><th>Rate / APR</th>
      </tr></thead>
      <tbody>${(winner._ranking || []).map((r, i) => {
    const rp = r.product.ratePercent ?? r.product.aprPercent ?? null;
    return `<tr>
      <td>${escHtml(i + 1)}</td>
      <td>${escHtml(r.product.label || r.product.id)}</td>
      <td>${escHtml(r.score)}</td>
      <td>${escHtml(fmtRate(rp))}</td>
    </tr>`;
  }).join("")}</tbody>
    </table>`;
  setHtml(el.rankingTable, rankHtml);
  showPanel(el.comparisonPanel);
}

// ── AI insights renderer ──────────────────────────────────────
function renderInsights(recommendation) {
  if (!recommendation) {
    setHtml(el.insightsContent, `<div class="insights-placeholder"><p>No recommendation available.</p></div>`);
    return;
  }

  const modeLabels = {
    ai: ["AI", "badge-ai"],
    "rules-only": ["Rules-based", "badge-muted"],
    "rules-fallback": ["AI fallback", "badge-fallback"]
  };
  const [modeText, modeClass] = modeLabels[recommendation.mode] || ["Unknown", "badge-muted"];
  setBadge(el.aiModeBadge, modeText, modeClass);
  el.aiModeBadge.classList.remove("hidden");

  if (recommendation.mode === "ai" && recommendation.aiText) {
    // Render AI text with section headings detected by pattern
    const lines = recommendation.aiText.split("\n").filter(Boolean);
    const parts = lines.map((line) => {
      const trimmed = line.trim();
      // Detect numbered section headers like "1) Recommendation", "2) Why", "3) Risks"
      if (/^[1-9]\)|^#+|^\*\*/.test(trimmed)) {
        return `<h4>${escHtml(trimmed.replace(/^[1-9]\)\s*|^#+\s*|\*\*/g, ""))}</h4>`;
      }
      return `<p>${escHtml(trimmed)}</p>`;
    }).join("");

    const fallbackNote = recommendation.fallback
      ? `<div class="insights-fallback">⚠️ Deterministic fallback also computed — shown if AI becomes unavailable.</div>`
      : "";

    setHtml(el.insightsContent, `<div class="insights-body">${parts}${fallbackNote}</div>`);
  } else {
    // Rules-based / fallback mode
    const summary = escHtml(recommendation.summary || "");
    const recs = (recommendation.recommendations || []).map((r) => `
      <h4>${escHtml(r.title)}</h4>
      <p>${escHtml(r.detail)}</p>
    `).join("");
    setHtml(el.insightsContent, `<div class="insights-body"><p>${summary}</p>${recs}</div>`);
  }
}

// ── Actions ──────────────────────────────────────────────────
async function loadProducts() {
  showLoading("Fetching market data from Bank of England…");
  setStatus("Loading live market data…", "loading");
  try {
    const res = await apiFetch("GET", `/products/${state.category}`);
    state.productsData = res.data;
    renderProductsTable(res.data);
    renderChart(res.data.trends);
    const count = res.data.products.length;
    const cacheHit = res.data.cache?.hit;
    setStatus(
      `Loaded ${count} products · Source: ${(res.data.sources || []).join(", ")} · ${cacheHit ? "From cache ⚡" : "Live data 🟢"}`,
      "ok"
    );
  } finally {
    hideLoading();
  }
}

async function compareAndRecommend() {
  if (!state.productsData) {
    setStatus("Load market data first before comparing.", "error");
    return;
  }
  showLoading("Running comparison & AI analysis…");
  setStatus("Comparing products and generating AI recommendation…", "loading");
  try {
    const res = await apiFetch("POST", "/compare", {
      category: state.category,
      criteria: collectCriteria()
    });

    // Attach ranking to winner for table rendering
    if (res.comparison?.winner) {
      res.comparison.winner._ranking = res.comparison.ranking || [];
    }

    renderProductsTable(state.productsData, res.comparison?.winner?.product?.id);
    renderWinnerCard(res.comparison?.winner, state.category);
    renderInsights(res.recommendation);
    showPanel(el.insightsPanel);

    const mode = res.recommendation?.mode || "unknown";
    setStatus(`Comparison complete · AI mode: ${mode}`, "ok");
  } finally {
    hideLoading();
  }
}

// ── Error wrapper ────────────────────────────────────────────
async function guarded(label, action) {
  try {
    await action();
  } catch (err) {
    hideLoading();
    setStatus(`${label} failed: ${err.message}`, "error");
    console.error(label, err);
  }
}

// ── Event wiring ──────────────────────────────────────────────
el.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    el.tabs.forEach((t) => {
      t.classList.remove("active");
      t.setAttribute("aria-selected", "false");
    });
    tab.classList.add("active");
    tab.setAttribute("aria-selected", "true");
    state.category = tab.dataset.category;
    state.productsData = null;
    updateFieldVisibility(state.category);
    // Reset UI
    setHtml(el.productsTableBody, `<tr class="empty-row"><td colspan="6">Select a category and click "Load market data"</td></tr>`);
    el.dataSourceBadge.classList.add("hidden");
    el.cacheBadge.classList.add("hidden");
    el.chartPeriod.classList.add("hidden");
    el.aiModeBadge.classList.add("hidden");
    hidePanel(el.comparisonPanel);
    setHtml(el.insightsContent, `<div class="insights-placeholder"><p>Load market data and click <strong>Compare &amp; get AI recommendation</strong> to see Gemini-powered analysis based on live rates.</p></div>`);
    if (state.trendChart) { state.trendChart.destroy(); state.trendChart = null; }
    el.statusBar.classList.add("hidden");
  });
});

el.loadProductsBtn.addEventListener("click", () => guarded("Load products", loadProducts));
el.compareBtn.addEventListener("click",    () => guarded("Compare", compareAndRecommend));

el.objective.addEventListener("input", () => {
  setText(el.charCount, el.objective.value.length);
});

// ── Init ─────────────────────────────────────────────────────
updateFieldVisibility(state.category);
