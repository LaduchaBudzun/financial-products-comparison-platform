import { InMemoryCacheRepository } from "./inMemoryCacheRepository.js";
import { DynamoCacheRepository } from "./dynamoCacheRepository.js";
import { logger } from "../../core/logger.js";

let singleton;

export function createCacheRepository(env) {
  if (singleton) {
    return singleton;
  }

  if (env.cacheProvider === "dynamodb") {
    singleton = new DynamoCacheRepository({ tableName: env.cacheTableName });
    return singleton;
  }

  if (env.cacheProvider === "memory" || env.cacheProvider === "inmemory") {
    singleton = new InMemoryCacheRepository();
    return singleton;
  }

  logger.warn("Unknown cache provider. Falling back to in-memory cache.", {
    configuredProvider: env.cacheProvider
  });
  singleton = new InMemoryCacheRepository();
  return singleton;
}

