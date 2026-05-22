import { getEnv } from "../config/env.js";
import { logger } from "../core/logger.js";
import { HttpClient } from "./httpClient.js";
import { createCacheRepository } from "./cache/cacheFactory.js";
import { BoeClient } from "../adapters/external/boeClient.js";
import { OnsClient } from "../adapters/external/onsClient.js";
import { ExchangeRateClient } from "../adapters/external/exchangeRateClient.js";
import { GeminiClient } from "../adapters/external/geminiClient.js";
import { MarketDataService } from "../services/marketDataService.js";
import { ComparisonService } from "../services/comparisonService.js";
import { RecommendationService } from "../services/recommendationService.js";

let singleton;

export function getContainer() {
  if (singleton) {
    return singleton;
  }

  const env = getEnv();
  const httpClient = new HttpClient({
    timeoutMs: env.requestTimeoutMs,
    retryAttempts: env.retryAttempts,
    retryBaseDelayMs: env.retryBaseDelayMs
  });
  const cache = createCacheRepository(env);

  const boeClient = new BoeClient({
    httpClient,
    baseUrl: env.boeBaseUrl
  });
  const onsClient = new OnsClient({
    httpClient,
    baseUrl: env.onsBaseUrl  // https://www.ons.gov.uk — uses /generator CSV endpoint
  });
  const exchangeRateClient = new ExchangeRateClient({
    httpClient,
    primaryBaseUrl: env.exchangeRateApiBaseUrl,
    fallbackBaseUrl: env.exchangeRateFallbackBaseUrl,
    apiKey: env.exchangeRateApiKey
  });
  const geminiClient = new GeminiClient({
    httpClient,
    baseUrl: env.geminiBaseUrl,
    apiKey: env.geminiApiKey,
    model: env.geminiModel
  });

  const marketDataService = new MarketDataService({
    boeClient,
    onsClient,
    exchangeRateClient,
    cache,
    env,
    logger
  });
  const comparisonService = new ComparisonService();
  const recommendationService = new RecommendationService({
    geminiClient,
    logger
  });

  singleton = {
    env,
    logger,
    services: {
      marketDataService,
      comparisonService,
      recommendationService
    }
  };

  return singleton;
}

