import { ValidationError } from "../../core/errors.js";
import { ensureObject, ensureOptionalNumber, ensureOptionalString } from "./shared.js";
import { SUPPORTED_CATEGORIES, CATEGORY_MORTGAGES } from "../constants/categories.js";

function normalizeRiskTolerance(value) {
  if (value === undefined || value === null || value === "") {
    return "medium";
  }
  const normalized = String(value).trim().toLowerCase();
  if (!["low", "medium", "high"].includes(normalized)) {
    throw new ValidationError("criteria.riskTolerance must be one of: low, medium, high");
  }
  return normalized;
}

export function validateComparePayload(payload) {
  ensureObject(payload, "payload");
  const rawCategory = String(payload.category || CATEGORY_MORTGAGES).trim().toLowerCase();
  if (!SUPPORTED_CATEGORIES.has(rawCategory)) {
    throw new ValidationError("category is not supported");
  }

  const criteriaInput = payload.criteria ?? {};
  ensureObject(criteriaInput, "criteria");

  const criteria = {
    riskTolerance: normalizeRiskTolerance(criteriaInput.riskTolerance),
    loanAmount: ensureOptionalNumber(criteriaInput.loanAmount, "criteria.loanAmount", 1000, 5000000),
    ltv: ensureOptionalNumber(criteriaInput.ltv, "criteria.ltv", 1, 100),
    horizonMonths: ensureOptionalNumber(criteriaInput.horizonMonths, "criteria.horizonMonths", 1, 480),
    monthlySpend: ensureOptionalNumber(criteriaInput.monthlySpend, "criteria.monthlySpend", 1, 100000),
    foreignSpendPercent: ensureOptionalNumber(criteriaInput.foreignSpendPercent, "criteria.foreignSpendPercent", 0, 100),
    objective: ensureOptionalString(criteriaInput.objective, "criteria.objective", 300),
    needs: ensureOptionalString(criteriaInput.needs, "criteria.needs", 300)
  };

  return {
    category: rawCategory,
    criteria
  };
}

