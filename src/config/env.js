const DEFAULTS = {
  NODE_ENV: "development",
  LOG_LEVEL: "info",
  CACHE_TABLE_NAME: "financial-products-cache",
  CACHE_TTL_SECONDS: "3600",
  CACHE_PROVIDER: "memory",
  BOE_BASE_URL: "https://www.bankofengland.co.uk",
  ONS_BASE_URL: "https://www.ons.gov.uk",  // legacy api.ons.gov.uk retired Nov 2024
  GEMINI_BASE_URL: "https://generativelanguage.googleapis.com",
  GEMINI_MODEL: "gemini-2.0-flash",
  DEFAULT_LOOKBACK_MONTHS: "24",
  REQUEST_TIMEOUT_MS: "5000",
  RETRY_ATTEMPTS: "2",
  RETRY_BASE_DELAY_MS: "250",
  ENABLE_EXCHANGE_DATA: "false",
  EXCHANGE_RATE_API_BASE_URL: "https://api.exchangerate.host",
  EXCHANGE_RATE_FALLBACK_BASE_URL: "https://api.frankfurter.app",
  ALLOWED_ORIGINS: "*"
};

function read(key) {
  const value = process.env[key];
  if (value === undefined || value === null || value === "") {
    return DEFAULTS[key];
  }
  return value;
}

function toInt(key, min, max) {
  const raw = read(key);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`Invalid integer value for ${key}: ${raw}`);
  }
  return parsed;
}

function toBool(key) {
  const raw = String(read(key)).trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

function toList(key) {
  const raw = read(key);
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

let cached;

export function getEnv() {
  if (cached) {
    return cached;
  }

  cached = {
    nodeEnv: read("NODE_ENV"),
    logLevel: read("LOG_LEVEL").toLowerCase(),
    cacheTableName: read("CACHE_TABLE_NAME"),
    cacheTtlSeconds: toInt("CACHE_TTL_SECONDS", 60, 86400),
    cacheProvider: read("CACHE_PROVIDER").toLowerCase(),
    boeBaseUrl: read("BOE_BASE_URL"),
    onsBaseUrl: read("ONS_BASE_URL"),
    geminiBaseUrl: read("GEMINI_BASE_URL"),
    geminiApiKey: process.env.GEMINI_API_KEY || "",
    geminiModel: read("GEMINI_MODEL"),
    defaultLookbackMonths: toInt("DEFAULT_LOOKBACK_MONTHS", 3, 120),
    requestTimeoutMs: toInt("REQUEST_TIMEOUT_MS", 500, 15000),
    retryAttempts: toInt("RETRY_ATTEMPTS", 0, 5),
    retryBaseDelayMs: toInt("RETRY_BASE_DELAY_MS", 50, 2000),
    enableExchangeData: toBool("ENABLE_EXCHANGE_DATA"),
    exchangeRateApiBaseUrl: read("EXCHANGE_RATE_API_BASE_URL"),
    exchangeRateApiKey: process.env.EXCHANGE_RATE_API_KEY || "",
    exchangeRateFallbackBaseUrl: read("EXCHANGE_RATE_FALLBACK_BASE_URL"),
    allowedOrigins: toList("ALLOWED_ORIGINS")
  };

  return cached;
}

