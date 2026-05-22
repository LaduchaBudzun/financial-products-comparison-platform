import test from "node:test";
import assert from "node:assert/strict";
import { MarketDataService } from "../../src/services/marketDataService.js";
import { InMemoryCacheRepository } from "../../src/infrastructure/cache/inMemoryCacheRepository.js";

function createService({ enableExchangeData = false } = {}) {
  const boeClient = {
    async fetchSeries(seriesCodes) {
      const today = "2026-04-01";
      const previous = "2026-03-01";
      const series = {};
      for (const code of seriesCodes) {
        if (code === "IUMBV34") {
          series[code] = [
            { date: previous, value: 4.85 },
            { date: today, value: 4.82 }
          ];
        } else if (code === "IUMBV37") {
          series[code] = [
            { date: previous, value: 4.78 },
            { date: today, value: 4.75 }
          ];
        } else if (code === "IUMBV42") {
          series[code] = [
            { date: previous, value: 4.66 },
            { date: today, value: 4.64 }
          ];
        } else if (code === "IUMZID2") {
          series[code] = [
            { date: previous, value: 4.2 },
            { date: today, value: 4.15 }
          ];
        } else if (code === "IUMCCTL") {
          series[code] = [
            { date: previous, value: 24.65 },
            { date: today, value: 24.65 }
          ];
        } else if (code === "IUMABEDR" || code === "IUDBEDR") {
          series[code] = [
            { date: previous, value: 4.0 },
            { date: today, value: 3.75 }
          ];
        } else {
          series[code] = [];
        }
      }
      return { source: "Bank of England", series };
    }
  };

  const onsClient = {
    async getTimeSeries(_seriesId) {
      return {
        source: "ONS",
        observations: [
          { date: "2026-03-01", value: 3.4 },
          { date: "2026-04-01", value: 3.3 }
        ]
      };
    }
  };

  const exchangeRateClient = {
    async getLatest() {
      return {
        source: "Frankfurter",
        base: "GBP",
        date: "2026-05-01",
        rates: { USD: 1.33, EUR: 1.17 }
      };
    }
  };

  return new MarketDataService({
    boeClient,
    onsClient,
    exchangeRateClient,
    cache: new InMemoryCacheRepository(),
    env: {
      cacheTtlSeconds: 300,
      defaultLookbackMonths: 24,
      enableExchangeData
    },
    logger: {
      warn() {},
      info() {},
      error() {}
    }
  });
}

test("MarketDataService returns mortgage products and cache hit on second call", async () => {
  const service = createService();
  const first = await service.getCategoryProducts("mortgages");
  const second = await service.getCategoryProducts("mortgages");

  assert.equal(first.cache.hit, false);
  assert.equal(second.cache.hit, true);
  assert.equal(first.products.length, 4);
  assert.ok(first.products.find((p) => p.id === "mortgage_fixed_2y_75_ltv"));
});

test("MarketDataService calculates savings real return", async () => {
  const service = createService();
  const result = await service.getCategoryProducts("savings");
  const fixed = result.products.find((p) => p.id === "savings_2y_fixed_isa");

  assert.ok(fixed);
  assert.equal(result.inflationRatePercent, 3.3);
  assert.equal(typeof fixed.realReturnPercent, "number");
});

test("MarketDataService adds fx snapshot when exchange enrichment enabled", async () => {
  const service = createService({ enableExchangeData: true });
  const result = await service.getCategoryProducts("credit-cards");
  assert.ok(result.fxSnapshot);
  assert.equal(result.fxSnapshot.base, "GBP");
});

