import { ValidationError } from "../../core/errors.js";
import { CATEGORY_MORTGAGES, SUPPORTED_CATEGORIES } from "../constants/categories.js";

function parseCriteria(criteriaRaw) {
  if (!criteriaRaw) {
    return { type: "text", value: "General UK household comparison preferences" };
  }

  const trimmed = String(criteriaRaw).trim();
  if (!trimmed) {
    return { type: "text", value: "General UK household comparison preferences" };
  }

  if (trimmed.length > 1200) {
    throw new ValidationError("criteria query parameter exceeds max length 1200");
  }

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new ValidationError("criteria JSON must be an object");
      }
      return { type: "json", value: parsed };
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ValidationError("criteria JSON is invalid");
    }
  }

  return { type: "text", value: trimmed };
}

export function validateRecommendationsQuery(queryStringParameters = {}) {
  const categoryRaw = String(queryStringParameters.category || CATEGORY_MORTGAGES).trim().toLowerCase();
  if (!SUPPORTED_CATEGORIES.has(categoryRaw)) {
    throw new ValidationError("category is not supported");
  }

  return {
    category: categoryRaw,
    criteria: parseCriteria(queryStringParameters.criteria),
    includeAi: String(queryStringParameters.includeAi || "true").toLowerCase() !== "false"
  };
}

