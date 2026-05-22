function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry(
  fn,
  { attempts = 2, baseDelayMs = 250, shouldRetry = () => true } = {}
) {
  let lastError;

  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !shouldRetry(error, attempt)) {
        throw error;
      }
      const jitter = Math.floor(Math.random() * 50);
      const delay = baseDelayMs * 2 ** attempt + jitter;
      await sleep(delay);
    }
  }

  throw lastError;
}

