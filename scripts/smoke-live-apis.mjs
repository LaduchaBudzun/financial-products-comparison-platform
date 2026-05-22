/**
 * Live integration smoke test — verifies all three external APIs respond correctly.
 * Run: node scripts/smoke-live-apis.mjs
 * Reads GEMINI_API_KEY from .env.local or environment.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal() {
  try {
    const lines = readFileSync(join(ROOT, ".env.local"), "utf8").split("\n");
    for (const line of lines) {
      const match = line.match(/^([A-Z_]+)=(.+)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim();
      }
    }
  } catch {}
}
loadEnvLocal();

const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
let passed = 0;
let failed = 0;

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

async function fetchText(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

console.log("\n=== Live API Smoke Test ===\n");

// BoE
console.log("Bank of England API:");
await check("2yr fixed mortgage (IUMBV34)", async () => {
  const csv = await fetchText(
    "https://www.bankofengland.co.uk/boeapps/iadb/fromshowcolumns.asp?csv.x=yes&Datefrom=01/Jan/2025&Dateto=01/May/2026&SeriesCodes=IUMBV34&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N"
  );
  const lines = csv.trim().split("\n").filter((l) => l && !l.startsWith("DATE"));
  if (!lines.length) throw new Error("No data rows returned");
  const last = lines[lines.length - 1].split(",");
  return `latest rate ${last[1]}% (${last[0]})`;
});

await check("5yr fixed mortgage (IUMBV42)", async () => {
  const csv = await fetchText(
    "https://www.bankofengland.co.uk/boeapps/iadb/fromshowcolumns.asp?csv.x=yes&Datefrom=01/Jan/2025&Dateto=01/May/2026&SeriesCodes=IUMBV42&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N"
  );
  const lines = csv.trim().split("\n").filter((l) => l && !l.startsWith("DATE"));
  const last = lines[lines.length - 1].split(",");
  return `latest rate ${last[1]}% (${last[0]})`;
});

await check("Bank Rate (IUMABEDR)", async () => {
  const csv = await fetchText(
    "https://www.bankofengland.co.uk/boeapps/iadb/fromshowcolumns.asp?csv.x=yes&Datefrom=01/Jan/2025&Dateto=01/May/2026&SeriesCodes=IUMABEDR&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N"
  );
  const lines = csv.trim().split("\n").filter((l) => l && !l.startsWith("DATE"));
  const last = lines[lines.length - 1].split(",");
  return `latest rate ${last[1]}% (${last[0]})`;
});

await check("Credit card APR (IUMCCTL)", async () => {
  const csv = await fetchText(
    "https://www.bankofengland.co.uk/boeapps/iadb/fromshowcolumns.asp?csv.x=yes&Datefrom=01/Jan/2025&Dateto=01/May/2026&SeriesCodes=IUMCCTL&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N"
  );
  const lines = csv.trim().split("\n").filter((l) => l && !l.startsWith("DATE"));
  const last = lines[lines.length - 1].split(",");
  return `latest rate ${last[1]}% (${last[0]})`;
});

await check("2yr ISA (IUMZID2)", async () => {
  const csv = await fetchText(
    "https://www.bankofengland.co.uk/boeapps/iadb/fromshowcolumns.asp?csv.x=yes&Datefrom=01/Jan/2025&Dateto=01/May/2026&SeriesCodes=IUMZID2&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N"
  );
  const lines = csv.trim().split("\n").filter((l) => l && !l.startsWith("DATE"));
  const last = lines[lines.length - 1].split(",");
  return `latest rate ${last[1]}% (${last[0]})`;
});

// ONS
console.log("\nONS API (via ons.gov.uk/generator):");
await check("CPI annual rate (D7G7)", async () => {
  const csv = await fetchText(
    "https://www.ons.gov.uk/generator?format=csv&uri=/economy/inflationandpriceindices/timeseries/d7g7/mm23"
  );
  const lines = csv.trim().split("\n").filter((l) => l && !l.match(/^"(Title|CDID|Source|PreUnit|Unit|Release|Next|Important)/));
  if (!lines.length) throw new Error("No data rows");
  const last = lines[lines.length - 1].replace(/"/g, "").split(",");
  return `latest CPI ${last[1]}% (${last[0]})`;
});

// Frankfurter (free, no key needed)
console.log("\nFrankfurter / ECB exchange rate API:");
await check("GBP/USD and GBP/EUR rates", async () => {
  const data = await fetchJson("https://api.frankfurter.app/latest?from=GBP&to=USD,EUR");
  if (!data.rates?.USD || !data.rates?.EUR) throw new Error("Missing rates in response");
  return `GBP/USD=${data.rates.USD} GBP/EUR=${data.rates.EUR} (${data.date})`;
});

// Gemini
console.log("\nGoogle Gemini API:");
if (!GEMINI_KEY) {
  console.log("  \x1b[33mSKIPPED\x1b[0m GEMINI_API_KEY not set in .env.local");
} else {
  await check("gemini-2.0-flash generateContent", async () => {
    const payload = {
      contents: [{ role: "user", parts: [{ text: "Reply with exactly: SMOKE_OK" }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 10 }
    };
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000)
      }
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    if (!text) throw new Error("Empty response from Gemini");
    return `responded: "${text}"`;
  });
}

console.log(`\n${"─".repeat(40)}`);
console.log(`Results: \x1b[32m${passed} passed\x1b[0m, \x1b[31m${failed} failed\x1b[0m`);
console.log(`${"─".repeat(40)}\n`);
if (failed > 0) process.exit(1);
