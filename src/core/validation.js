import { ValidationError } from "./errors.js";

const MAX_BODY_BYTES = 51_200; // 50 KB — enough for any valid payload, blocks oversized attacks

export function parseJsonBody(body) {
  if (!body) {
    return {};
  }
  if (Buffer.byteLength(String(body), "utf8") > MAX_BODY_BYTES) {
    throw new ValidationError("Request body exceeds maximum allowed size");
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new ValidationError("Request body must be valid JSON");
  }
}
