export function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function toFiniteNumber(input, fallback = 0) {
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : fallback;
}

