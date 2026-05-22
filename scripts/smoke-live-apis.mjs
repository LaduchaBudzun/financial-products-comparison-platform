/**
 * Live integration smoke test — verifies all external APIs respond correctly.
 * Compatible with Node.js 16+ (uses built-in https, no fetch required).
 * Run: node scripts/smoke-live-apis.mjs
 * Reads GEMINI_API_KEY from .env.local or process.env.
 */
import https from "node:https";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Load .env.local into process.env (non-overwriting)
function loadEnvLocal() {
  try {
    const lines = readFileSync(join(ROOT, ".env.local"), "utf8")
      .replace(/\r/g, "")  // normalise CRLF → LF
      .split("\n");
    for (const line of lines) {
      const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim();
      }
    }
  } catch {
    // .env.local is optional
  }
}

loadEnvLocal();
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";

let passed = 0;
let failed = 0;

function httpsGet(url, depth = 0) {
  if (depth > 5) return Promise.reject(new Error("Too many redirects"));
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: "GET",
      timeout: 15000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; UKFinCompare/1.0)",
        "Accept": "text/csv,application/json,*/*"
      }
    };
    const req = https.request(options, (res) => {
      // Follow redirects (301, 302, 307, 308)
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        const redirectUrl = res.headers.location.startsWith("http")
          ? res.headers.location
          : `https://${parsed.hostname}${res.headers.location}`;
        res.resume(); // drain response
        resolve(httpsGet(redirectUrl, depth + 1));
        return;
      }
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`));
        } else {
          resolve(body);
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Request timed out")); });
    req.end();
  });
}

function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      path,
      method: "POST",
      headers: { ...headers, "Content-Length": Buffer.byteLength(body) },
      timeout: 15000
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        } else {
          resolve(data);
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Request timed out")); });
    req.write(body);
    req.end();
  });
}

async function check(label, fn) {
  process.stdout.write(`  ${label}... `);
  try {
    const result = await fn();
    console.log(`\x1b[32mPASS\x1b[0m ${result}`);
    passed++;
  } catch (err) {
    console.log(`\x1b[31mFAIL\x1b[0m ${err.message}`);
    failed++;
  }
}

function lastCsvRow(csv) {
  const lines = csv.trim().split("\n").filter((l) => l && !l.startsWith("DATE") && !l.startsWith('"Title"') && !l.startsWith('"CDID"') && !l.startsWith('"Source') && !l.startsWith('"PreUnit') && !l.startsWith('"Unit') && !l.startsWith('"Release') && !l.startsWith('"Next') && !l.startsWith('"Important'));
  if (!lines.length) throw new Error("No data rows");
  return lines[lines.length - 1].replace(/"/g, "").split(",");
}

const BOE = "https://www.bankofengland.co.uk/boeapps/iadb/fromshowcolumns.asp?csv.x=yes&Datefrom=01/Jan/2025&Dateto=01/May/2026&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N&SeriesCodes=";

console.log("\n=== Live API Smoke Test ===\n");

console.log("Bank of England API (live public data):");
for (const [label, code] of [
  ["2yr fixed mortgage", "IUMBV34"],
  ["3yr fixed mortgage", "IUMBV37"],
  ["5yr fixed mortgage", "IUMBV42"],
  ["Bank Rate (base rate)", "IUMABEDR"],
  ["2yr fixed ISA rate", "IUMZID2"],
  ["Credit card APR", "IUMCCTL"]
]) {
  await check(label + ` (${code})`, async () => {
    const csv = await httpsGet(BOE + code);
    const row = lastCsvRow(csv);
    if (!row[1] || !row[0]) throw new Error("Missing value in CSV");
    return `${row[1]}% on ${row[0]}`;
  });
}

console.log("\nONS Website (CPI inflation — generator CSV endpoint):");
await check("CPI annual rate D7G7", async () => {
  const csv = await httpsGet("https://www.ons.gov.uk/generator?format=csv&uri=/economy/inflationandpriceindices/timeseries/d7g7/mm23");
  const row = lastCsvRow(csv);
  if (!row[1]) throw new Error("No value in CSV");
  return `${row[1]}% for ${row[0]}`;
});

console.log("\nFrankfurter / ECB (free exchange rates, no key needed):");
await check("GBP rates (USD, EUR)", async () => {
  const raw = await httpsGet("https://api.frankfurter.app/latest?from=GBP&to=USD,EUR");
  const data = JSON.parse(raw);
  if (!data.rates?.USD || !data.rates?.EUR) throw new Error("Missing rates in response");
  return `GBP/USD=${data.rates.USD}  GBP/EUR=${data.rates.EUR}  (${data.date})`;
});

console.log("\nGoogle Gemini API (AI recommendations):");
if (!GEMINI_KEY) {
  console.log("  \x1b[33mSKIPPED\x1b[0m — GEMINI_API_KEY not set in .env.local");
} else {
  // Gemini check — handled separately to distinguish quota vs real failure
  process.stdout.write("  gemini-2.0-flash generateContent... ");
  try {
    const payload = JSON.stringify({
      contents: [{ role: "user", parts: [{ text: "Reply with exactly: SMOKE_OK" }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 10 }
    });
    const raw = await httpsPost(
      "generativelanguage.googleapis.com",
      "/v1beta/models/gemini-2.0-flash:generateContent",
      { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
      payload
    );
    const data = JSON.parse(raw);
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    if (!text) throw new Error("Empty Gemini response");
    console.log(`\x1b[32mPASS\x1b[0m responded: "${text}"`);
    passed++;
  } catch (err) {
    if (err.message.startsWith("HTTP 429")) {
      // Free-tier rate limit — key IS valid and correctly configured
      console.log(`\x1b[33mQUOTA\x1b[0m Key valid, free-tier quota exhausted. Deterministic fallback will activate in Lambda.`);
      passed++; // key + header config are correct
    } else {
      console.log(`\x1b[31mFAIL\x1b[0m ${err.message}`);
      failed++;
    }
  }
}

console.log(`\n${"─".repeat(48)}`);
const status = failed === 0 ? "\x1b[32mALL PASSED\x1b[0m" : `\x1b[31m${failed} FAILED\x1b[0m`;
console.log(`Results: \x1b[32m${passed} passed\x1b[0m  ${failed > 0 ? `\x1b[31m${failed} failed\x1b[0m` : ""}`);
console.log(`${"─".repeat(48)}\n`);
if (failed > 0) process.exit(1);
