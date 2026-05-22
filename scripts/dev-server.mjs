/**
 * Local dev server — wraps Lambda handler as HTTP server (no Docker required).
 * Simulates API Gateway proxy events so the Lambda code runs unmodified.
 *
 * Usage:  node scripts/dev-server.mjs
 * Reads environment from sam.local.env.json > ApiFunction block.
 */
import http from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 3000);

// ── Load environment from sam.local.env.json ─────────────────────────────────
function loadSamEnv() {
  try {
    const raw = readFileSync(join(ROOT, "sam.local.env.json"), "utf8");
    const cfg = JSON.parse(raw);
    const vars = cfg?.ApiFunction || {};
    for (const [k, v] of Object.entries(vars)) {
      if (!process.env[k]) process.env[k] = String(v);
    }
    console.log("[dev-server] Loaded env from sam.local.env.json");
  } catch (err) {
    console.warn("[dev-server] Could not load sam.local.env.json:", err.message);
  }
}

loadSamEnv();

// ── Import Lambda handler AFTER env is set ────────────────────────────────────
const { handler } = await import(`file:///${join(ROOT, "src/app.js")}`);

// ── Parse incoming HTTP request → API Gateway proxy event ─────────────────────
function parseRequest(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function buildEvent(req, bodyStr) {
  const urlObj = new URL(req.url, `http://localhost:${PORT}`);
  // Extract path parameters — supports /products/{category}
  const pathParts = urlObj.pathname.replace(/^\//, "").split("/");
  const pathParameters = {};
  let resource = urlObj.pathname;

  if (pathParts[0] === "products" && pathParts[1]) {
    pathParameters.category = pathParts[1];
    resource = "/products/{category}";
  }

  // Convert URLSearchParams to plain object
  const queryStringParameters = {};
  for (const [k, v] of urlObj.searchParams.entries()) {
    queryStringParameters[k] = v;
  }

  return {
    httpMethod: req.method,
    path: urlObj.pathname,
    resource,
    pathParameters: Object.keys(pathParameters).length ? pathParameters : null,
    queryStringParameters: Object.keys(queryStringParameters).length ? queryStringParameters : null,
    headers: req.headers,
    body: bodyStr || null,
    isBase64Encoded: false,
    requestContext: { resourcePath: resource }
  };
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization"
    });
    res.end();
    return;
  }

  const bodyStr = await parseRequest(req).catch(() => "");
  const event = buildEvent(req, bodyStr);
  const context = { awsRequestId: `local-${Date.now()}` };

  const start = Date.now();
  try {
    const result = await handler(event, context);
    const duration = Date.now() - start;

    res.writeHead(result.statusCode, result.headers || {});
    res.end(result.body || "");

    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} → ${result.statusCode} (${duration}ms)`);
  } catch (err) {
    console.error(`[ERROR] ${req.method} ${req.url}:`, err.message);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("");
  console.log("╔══════════════════════════════════════════════════╗");
  console.log(`║  UK Financial Products — Local Dev Server         ║`);
  console.log(`║  API:  http://127.0.0.1:${PORT}                      ║`);
  console.log("║  No Docker required — Lambda runs directly        ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log("");
  console.log("Endpoints:");
  console.log(`  GET  http://127.0.0.1:${PORT}/products/mortgages`);
  console.log(`  GET  http://127.0.0.1:${PORT}/products/savings`);
  console.log(`  GET  http://127.0.0.1:${PORT}/products/credit-cards`);
  console.log(`  POST http://127.0.0.1:${PORT}/compare`);
  console.log(`  GET  http://127.0.0.1:${PORT}/recommendations?category=mortgages`);
  console.log("");
  console.log("Press Ctrl+C to stop.");
  console.log("");
});
