import https from "node:https";
import http from "node:http";
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
  if (error instanceof ExternalServiceError && error.details?.statusCode) {
    return error.details.statusCode >= 500 || error.details.statusCode === 429;
  }
  // Retry network errors (ECONNRESET, ETIMEDOUT, etc.)
  return true;
}

/**
 * Performs an HTTPS/HTTP request using Node built-in modules.
 * Follows up to 5 redirects. Compatible with Node 16+.
 */
const DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; UKFinCompare/1.0; +https://github.com/uk-financial-compare)",
  "Accept": "application/json,text/csv,text/plain,*/*"
};

function nodeRequest(method, urlStr, body, headers, timeoutMs, redirectCount = 0) {
  if (redirectCount > 5) {
    return Promise.reject(new ExternalServiceError("Too many redirects", { url: urlStr }));
  }

  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const isHttps = parsed.protocol === "https:";
    const transport = isHttps ? https : http;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: { ...DEFAULT_HEADERS, ...headers },
      timeout: timeoutMs
    };

    if (body) {
      options.headers["Content-Length"] = Buffer.byteLength(body);
    }

    const req = transport.request(options, (res) => {
      // Follow redirects
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume(); // drain to free socket
        const redirectUrl = res.headers.location.startsWith("http")
          ? res.headers.location
          : `${parsed.protocol}//${parsed.host}${res.headers.location}`;
        resolve(nodeRequest(method === "POST" && res.statusCode === 303 ? "GET" : method,
          redirectUrl, body, headers, timeoutMs, redirectCount + 1));
        return;
      }

      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const responseBody = Buffer.concat(chunks).toString("utf8");
        if (res.statusCode >= 400) {
          reject(new ExternalServiceError("External request failed", {
            statusCode: res.statusCode,
            statusText: res.statusMessage,
            body: responseBody.slice(0, 600),
            url: urlStr
          }));
        } else {
          resolve(responseBody);
        }
      });
      res.on("error", reject);
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new ExternalServiceError("External request timed out", { url: urlStr, timeoutMs }));
    });

    req.on("error", (err) => {
      reject(new ExternalServiceError("External request error", { url: urlStr, message: err.message }));
    });

    if (body) req.write(body);
    req.end();
  });
}

export class HttpClient {
  constructor({ timeoutMs, retryAttempts, retryBaseDelayMs }) {
    this.timeoutMs = timeoutMs;
    this.retryAttempts = retryAttempts;
    this.retryBaseDelayMs = retryBaseDelayMs;
  }

  async getJson(baseUrl, path, query = {}, headers = {}) {
    const body = await this.request("GET", baseUrl, path, null, query, {
      Accept: "application/json",
      ...headers
    });
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
      () => nodeRequest(method, url, body, headers, this.timeoutMs),
      {
        attempts: this.retryAttempts,
        baseDelayMs: this.retryBaseDelayMs,
        shouldRetry
      }
    );
  }
}
