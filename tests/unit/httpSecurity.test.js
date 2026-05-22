import test from "node:test";
import assert from "node:assert/strict";
import { buildHeaders, errorResponse } from "../../src/core/http.js";
import { ValidationError, ExternalServiceError, NotFoundError } from "../../src/core/errors.js";
import { parseJsonBody } from "../../src/core/validation.js";

const OPT = { requestOrigin: "https://example.com", allowedOrigins: ["*"] };

test("buildHeaders includes all required security headers", () => {
  const headers = buildHeaders(OPT);
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.ok(headers["Content-Security-Policy"]);
  assert.equal(headers["Cache-Control"], "no-store");
  assert.equal(headers["Referrer-Policy"], "no-referrer");
});

test("buildHeaders echoes X-Request-ID when provided", () => {
  const headers = buildHeaders({ ...OPT, requestId: "req-abc-123" });
  assert.equal(headers["X-Request-ID"], "req-abc-123");
});

test("buildHeaders omits X-Request-ID when not provided", () => {
  const headers = buildHeaders(OPT);
  assert.ok(!("X-Request-ID" in headers));
});

test("CORS: wildcard allowed origins returns *", () => {
  const headers = buildHeaders({ requestOrigin: "https://attacker.com", allowedOrigins: ["*"] });
  assert.equal(headers["Access-Control-Allow-Origin"], "*");
});

test("CORS: specific allowlist reflects origin when matched", () => {
  const headers = buildHeaders({
    requestOrigin: "https://mydomain.com",
    allowedOrigins: ["https://mydomain.com"]
  });
  assert.equal(headers["Access-Control-Allow-Origin"], "https://mydomain.com");
});

test("CORS: specific allowlist returns null for unrecognised origin", () => {
  const headers = buildHeaders({
    requestOrigin: "https://attacker.com",
    allowedOrigins: ["https://mydomain.com"]
  });
  assert.equal(headers["Access-Control-Allow-Origin"], "null");
});

test("errorResponse sanitises ExternalServiceError message", () => {
  const err = new ExternalServiceError("BoE is down", { internal: "details" });
  const response = errorResponse(err, OPT);
  const body = JSON.parse(response.body);
  assert.notEqual(body.error.message, "BoE is down");
  assert.ok(body.error.message.includes("unavailable"));
});

test("errorResponse sanitises unknown errors", () => {
  const err = new Error("Database password: hunter2");
  const response = errorResponse(err, OPT);
  const body = JSON.parse(response.body);
  assert.equal(body.error.message, "Internal server error");
  assert.ok(!response.body.includes("hunter2"));
});

test("errorResponse exposes ValidationError message", () => {
  const err = new ValidationError("category is not supported");
  const response = errorResponse(err, OPT);
  const body = JSON.parse(response.body);
  assert.equal(body.error.message, "category is not supported");
  assert.equal(body.error.code, "VALIDATION_ERROR");
});

test("parseJsonBody rejects oversized payload", () => {
  const oversized = JSON.stringify({ data: "x".repeat(52000) });
  assert.throws(() => parseJsonBody(oversized), /size/);
});

test("parseJsonBody accepts empty body as empty object", () => {
  assert.deepEqual(parseJsonBody(""), {});
  assert.deepEqual(parseJsonBody(null), {});
});

test("parseJsonBody rejects malformed JSON", () => {
  assert.throws(() => parseJsonBody("{bad json"), /valid JSON/);
});
