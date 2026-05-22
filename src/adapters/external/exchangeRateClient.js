import { ExternalServiceError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";

function normalizeRates(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const rates = payload.rates;
  if (!rates || typeof rates !== "object") {
    return null;
  }

  const normalized = {};
  for (const [currency, rate] of Object.entries(rates)) {
    const numeric = Number(rate);
    if (Number.isFinite(numeric)) {
      normalized[currency] = numeric;
    }
  }
  if (!Object.keys(normalized).length) {
    return null;
  }

  return {
    base: payload.base || payload.source || "GBP",
    date: payload.date || new Date().toISOString().slice(0, 10),
    rates: normalized
  };
}

export class ExchangeRateClient {
  constructor({ httpClient, primaryBaseUrl, fallbackBaseUrl, apiKey = "" }) {
    this.httpClient = httpClient;
    this.primaryBaseUrl = primaryBaseUrl;
    this.fallbackBaseUrl = fallbackBaseUrl;
    this.apiKey = apiKey;
  }

  async getLatest(base = "GBP", symbols = ["USD", "EUR"]) {
    const query = {
      base,
      symbols: symbols.join(",")
    };
    if (this.apiKey) {
      query.access_key = this.apiKey;
    }

    try {
      const primary = await this.httpClient.getJson(this.primaryBaseUrl, "/latest", query);
      const normalized = normalizeRates(primary);
      if (normalized) {
        return {
          source: "exchangerate.host",
          ...normalized
        };
      }
      logger.warn("exchangerate.host returned invalid payload; trying fallback");
    } catch (error) {
      logger.warn("exchangerate.host unavailable; trying fallback", { message: error.message });
    }

    try {
      const fallback = await this.httpClient.getJson(this.fallbackBaseUrl, "/latest", {
        from: base,
        to: symbols.join(",")
      });
      const normalized = normalizeRates(fallback);
      if (normalized) {
        return {
          source: "Frankfurter (ECB)",
          ...normalized
        };
      }
    } catch (error) {
      throw new ExternalServiceError("Failed to fetch exchange rates", { message: error.message });
    }

    throw new ExternalServiceError("Exchange rate providers returned invalid payload");
  }
}

