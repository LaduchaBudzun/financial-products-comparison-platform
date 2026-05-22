export class InMemoryCacheRepository {
  constructor() {
    this.store = new Map();
  }

  async get(key) {
    const entry = this.store.get(key);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.payload;
  }

  async set(key, payload, ttlSeconds) {
    this.store.set(key, {
      payload,
      expiresAt: Date.now() + ttlSeconds * 1000
    });
  }
}

