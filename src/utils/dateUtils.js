function pad(value) {
  return String(value).padStart(2, "0");
}

const MONTH_ABBREV = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function toBoeDate(date) {
  return `${pad(date.getUTCDate())}/${MONTH_ABBREV[date.getUTCMonth()]}/${date.getUTCFullYear()}`;
}

export function monthsAgo(months) {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() - months);
  return date;
}

export function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

export function parseMonthYearLabel(label) {
  const normalized = String(label).trim();
  const parts = normalized.split(" ");
  if (parts.length !== 2) {
    return null;
  }
  const monthIndex = MONTH_ABBREV.findIndex((m) => m.toUpperCase() === parts[0].slice(0, 3).toUpperCase());
  const year = Number.parseInt(parts[1], 10);
  if (monthIndex < 0 || !Number.isFinite(year)) {
    return null;
  }
  return new Date(Date.UTC(year, monthIndex, 1));
}

