import { ExternalServiceError } from "../../core/errors.js";
import { parseCsv } from "../../utils/csvUtils.js";

const MONTH_ABBREV = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const METADATA_MARKERS = new Set(["Title", "CDID", "Source dataset ID", "PreUnit", "Unit", "Release date", "Next release", "Important notes"]);

function parseOnsLabel(label) {
  const cleaned = String(label || "").replace(/^"|"$/g, "").trim();

  // Monthly: "2026 APR"
  const monthlyMatch = cleaned.match(/^(\d{4})\s+([A-Z]{3})$/i);
  if (monthlyMatch) {
    const monthIdx = MONTH_ABBREV.indexOf(monthlyMatch[2].toUpperCase());
    if (monthIdx >= 0) {
      return new Date(Date.UTC(Number(monthlyMatch[1]), monthIdx, 1));
    }
  }

  // Annual: "2024"
  const annualMatch = cleaned.match(/^(\d{4})$/);
  if (annualMatch) {
    return new Date(Date.UTC(Number(annualMatch[1]), 0, 1));
  }

  // Quarterly: "2024 Q1"
  const quarterlyMatch = cleaned.match(/^(\d{4})\s+Q(\d)$/i);
  if (quarterlyMatch) {
    const quarter = Number(quarterlyMatch[2]);
    return new Date(Date.UTC(Number(quarterlyMatch[1]), (quarter - 1) * 3, 1));
  }

  return null;
}

function parseOnsRows(csv) {
  const observations = [];
  for (const row of csv) {
    const labelKey = Object.keys(row)[0];
    const valueKey = Object.keys(row)[1];
    if (!labelKey || !valueKey) continue;

    const labelRaw = row[labelKey];
    if (METADATA_MARKERS.has(labelRaw)) continue;

    const date = parseOnsLabel(labelRaw);
    if (!date) continue;

    const numValue = Number(row[valueKey]);
    if (!Number.isFinite(numValue)) continue;

    observations.push({
      date: date.toISOString().slice(0, 10),
      value: numValue
    });
  }
  return observations.sort((a, b) => a.date.localeCompare(b.date));
}

export class OnsClient {
  constructor({ httpClient, baseUrl }) {
    this.httpClient = httpClient;
    this.baseUrl = baseUrl;
  }

  async getTimeSeries(seriesId) {
    // ONS website generator endpoint (the legacy timeseries API was retired Nov 2024).
    // NOTE: The `uri` query param contains literal forward-slashes that must NOT be
    // percent-encoded (%2F).  We embed the full query string in the path so that
    // URLSearchParams never touches it.
    const encodedId = encodeURIComponent(seriesId.toLowerCase());
    const path = `/generator?format=csv&uri=/economy/inflationandpriceindices/timeseries/${encodedId}/mm23`;

    const raw = await this.httpClient.getText(this.baseUrl, path);
    const rows = parseCsv(raw);

    if (!rows.length) {
      throw new ExternalServiceError("ONS returned empty data", { seriesId });
    }

    const observations = parseOnsRows(rows);
    if (!observations.length) {
      throw new ExternalServiceError("ONS returned no parseable observations", { seriesId });
    }

    return {
      source: "Office for National Statistics",
      observations
    };
  }
}
