import { getEnv } from "../config/env.js";

const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

function resolveLevel(input) {
  const normalized = String(input || "").toLowerCase();
  return LEVELS[normalized] ? normalized : "info";
}

const minimumLevel = resolveLevel(getEnv().logLevel);

function shouldLog(level) {
  return LEVELS[level] >= LEVELS[minimumLevel];
}

function formatLog(level, message, meta = {}) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta
  });
}

function write(level, message, meta) {
  if (!shouldLog(level)) {
    return;
  }
  const payload = formatLog(level, message, meta);
  if (level === "error") {
    console.error(payload);
    return;
  }
  if (level === "warn") {
    console.warn(payload);
    return;
  }
  console.log(payload);
}

export const logger = {
  debug(message, meta = {}) {
    write("debug", message, meta);
  },
  info(message, meta = {}) {
    write("info", message, meta);
  },
  warn(message, meta = {}) {
    write("warn", message, meta);
  },
  error(message, meta = {}) {
    write("error", message, meta);
  }
};

