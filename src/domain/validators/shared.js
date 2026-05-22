import { ValidationError } from "../../core/errors.js";

export function ensureObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an object`);
  }
}

export function ensureOptionalNumber(value, fieldName, min, max) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new ValidationError(`${fieldName} must be a number in range ${min}..${max}`);
  }
  return parsed;
}

export function ensureOptionalString(value, fieldName, maxLength) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new ValidationError(`${fieldName} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new ValidationError(`${fieldName} exceeds max length ${maxLength}`);
  }
  return trimmed;
}

