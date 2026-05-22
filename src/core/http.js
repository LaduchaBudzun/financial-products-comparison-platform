import { AppError } from "./errors.js";

const BASE_SECURITY_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none';"
};

function resolveCorsOrigin(requestOrigin, allowedOrigins) {
  if (!requestOrigin) {
    return allowedOrigins[0] === "*" ? "*" : allowedOrigins[0] || "*";
  }
  if (allowedOrigins.includes("*")) {
    return "*";
  }
  if (allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }
  return "null";
}

export function buildHeaders({ requestOrigin, allowedOrigins, requestId, additionalHeaders = {} }) {
  const origin = resolveCorsOrigin(requestOrigin, allowedOrigins);
  return {
    ...BASE_SECURITY_HEADERS,
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Requested-With",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Max-Age": "600",
    ...(requestId ? { "X-Request-ID": requestId } : {}),
    ...additionalHeaders
  };
}

export function jsonResponse(statusCode, body, options) {
  return {
    statusCode,
    headers: buildHeaders(options),
    body: JSON.stringify(body)
  };
}

export function noContentResponse(options) {
  return {
    statusCode: 204,
    headers: buildHeaders(options),
    body: ""
  };
}

export function errorResponse(error, options) {
  const normalized = error instanceof AppError ? error : new AppError("Internal server error", { expose: false });
  const safeDetails = normalized.code === "VALIDATION_ERROR" ? normalized.details : undefined;
  const safeMessage =
    normalized.code === "EXTERNAL_SERVICE_ERROR"
      ? "Upstream data source is temporarily unavailable. Please retry."
      : normalized.expose
        ? normalized.message
        : "Internal server error";
  return jsonResponse(
    normalized.statusCode,
    {
      error: {
        code: normalized.code,
        message: safeMessage,
        details: safeDetails
      }
    },
    options
  );
}
