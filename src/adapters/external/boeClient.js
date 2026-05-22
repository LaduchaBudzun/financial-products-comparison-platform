import { ExternalServiceError } from "../../core/errors.js";
import { parseCsv } from "../../utils/csvUtils.js";
import { isoDate, toBoeDate } from "../../utils/dateUtils.js";

const MONTH_INDEX = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11
};

function parseBoeDate(rawDate) {
  const value = String(rawDate || "").trim();
  if (!value) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00.000Z`);
  }

  // "31/Jan/2025" (slash-separated)
  const slashMatch = value.match(/^(\d{1,2})\/([A-Za-z]{3})\/(\d{4})$/);
  if (slashMatch) {
    const [, dayRaw, monthRaw, yearRaw] = slashMatch;
    const month = MONTH_INDEX[monthRaw.toLowerCase()];
    if (month !== undefined) {
      return new Date(Date.UTC(Number(yearRaw), month, Number(dayRaw)));
    }
  }

  // "31 Jan 2025" (space-separated) — actual BoE CSV format
  const spaceMatch = value.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (spaceMatch) {
    const [, dayRaw, monthRaw, yearRaw] = spaceMatch;
    const month = MONTH_INDEX[monthRaw.toLowerCase()];
    if (month !== undefined) {
      return new Date(Date.UTC(Number(yearRaw), month, Number(dayRaw)));
    }
  }

  const yearMonthMatch = value.match(/^(\d{4})\s+([A-Za-z]{3})$/);
  if (yearMonthMatch) {
    const [, yearRaw, monthRaw] = yearMonthMatch;
    const month = MONTH_INDEX[monthRaw.toLowerCase()];
    if (month !== undefined) {
      return new Date(Date.UTC(Number(yearRaw), month, 1));
    }
  }

  const monthYearMatch = value.match(/^([A-Za-z]{3})\s+(\d{4})$/);
  if (monthYearMatch) {
    const [, monthRaw, yearRaw] = monthYearMatch;
    const month = MONTH_INDEX[monthRaw.toLowerCase()];
    if (month !== undefined) {
      return new Date(Date.UTC(Number(yearRaw), month, 1));
    }
  }

  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) {
    return direct;
  }

  return null;
}

function parseSeriesValue(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  if (!normalized || normalized === "." || normalized === "na") {
    return null;
  }
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function resolveColumnKey(record, seriesCode) {
  const target = String(seriesCode || "").toLowerCase();
  const keys = Object.keys(record || {});
  const exact = keys.find((key) => key.toLowerCase() === target);
  if (exact) {
    return exact;
  }
  const contains = keys.find((key) => key.toLowerCase().includes(target));
  if (contains) {
    return contains;
  }
  return null;
}

function normalizeSeries(records, seriesCodes) {
  const normalized = {};
  for (const code of seriesCodes) {
    normalized[code] = [];
  }

  for (const record of records) {
    const dateRaw = record.DATE ?? record.Date ?? record.date ?? record[""] ?? Object.values(record)[0];
    const date = parseBoeDate(dateRaw);
    if (!date) {
      continue;
    }

    for (const code of seriesCodes) {
      const explicitValue = parseSeriesValue(record[code]);
      const lowerCaseValue = explicitValue === null ? parseSeriesValue(record[code.toLowerCase()]) : explicitValue;
      const resolvedKey = lowerCaseValue === null ? resolveColumnKey(record, code) : null;
      const resolvedValue = resolvedKey ? parseSeriesValue(record[resolvedKey]) : null;
      const finalValue = resolvedValue === null ? lowerCaseValue : resolvedValue;

      if (finalValue === null) {
        continue;
      }
      normalized[code].push({
        date: isoDate(date),
        value: finalValue
      });
    }
  }

  for (const code of seriesCodes) {
    normalized[code].sort((a, b) => a.date.localeCompare(b.date));
  }

  return normalized;
}

export class BoeClient {
  constructor({ httpClient, baseUrl }) {
    this.httpClient = httpClient;
    this.baseUrl = baseUrl;
  }

  async fetchSeries(seriesCodes, { fromDate, toDate }) {
    if (!Array.isArray(seriesCodes) || !seriesCodes.length) {
      throw new ExternalServiceError("Series codes are required for BoE request");
    }

    const query = {
      "csv.x": "yes",
      Datefrom: toBoeDate(fromDate),
      Dateto: toBoeDate(toDate),
      SeriesCodes: seriesCodes.join(","),
      CSVF: "TN",
      UsingCodes: "Y",
      VPD: "Y",
      VFD: "N"
    };

    const csv = await this.httpClient.getText(this.baseUrl, "/boeapps/iadb/fromshowcolumns.asp", query);
    const rows = parseCsv(csv);
    if (!rows.length) {
      throw new ExternalServiceError("BoE returned an empty dataset", { seriesCodes });
    }

    const series = normalizeSeries(rows, seriesCodes);
    return {
      source: "Bank of England",
      series
    };
  }
}
