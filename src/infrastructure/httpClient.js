import { ExternalServiceError } from "../core/errors.js";
import { withRetry } from "../utils/retry.js";

function buildUrl(baseUrl, path, query = {}) {
  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function shouldRetry(error) {
  if (error.name === "AbortError") {
    return true;
  }
  if (error instanceof ExternalServiceError && error.details?.statusCode) {
    return error.details.statusCode >= 500 || error.details.statusCode === 429;
  }
  return true;
}

export class HttpClient {
  constructor({ timeoutMs, retryAttempts, retryBaseDelayMs }) {
    this.timeoutMs = timeoutMs;
    this.retryAttempts = retryAttempts;
    this.retryBaseDelayMs = retryBaseDelayMs;
  }

  async getJson(baseUrl, path, query = {}, headers = {}) {
    const body = await this.request("GET", baseUrl, path, null, query, { Accept: "application/json", ...headers });
    try {
      return JSON.parse(body);
    } catch {
      throw new ExternalServiceError("Failed to parse JSON response", { baseUrl, path });
    }
  }

  async getText(baseUrl, path, query = {}, headers = {}) {
    return this.request("GET", baseUrl, path, null, query, headers);
  }

  async postJson(baseUrl, path, payload, query = {}, headers = {}) {
    const body = await this.request(
      "POST",
      baseUrl,
      path,
      JSON.stringify(payload),
      query,
      { "Content-Type": "application/json", Accept: "application/json", ...headers }
    );
    try {
      return JSON.parse(body);
    } catch {
      throw new ExternalServiceError("Failed to parse JSON response", { baseUrl, path });
    }
  }

  async request(method, baseUrl, path, body = null, query = {}, headers = {}) {
    const url = buildUrl(baseUrl, path, query);

    return withRetry(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
          const response = await fetch(url, {
            method,
            headers,
            body,
            signal: controller.signal
          });
          const responseBody = await response.text();
          if (!response.ok) {
            throw new ExternalServiceError("External request failed", {
              statusCode: response.status,
              statusText: response.statusText,
              body: responseBody.slice(0, 600),
              url
            });
          }
          return responseBody;
        } catch (error) {
          if (error.name === "AbortError") {
            throw new ExternalServiceError("External request timed out", { url, timeoutMs: this.timeoutMs });
          }
          if (error instanceof ExternalServiceError) {
            throw error;
          }
          throw new ExternalServiceError("External request error", { url, message: error.message });
        } finally {
          clearTimeout(timeout);
        }
      },
      {
        attempts: this.retryAttempts,
        baseDelayMs: this.retryBaseDelayMs,
        shouldRetry
      }
    );
  }
}

