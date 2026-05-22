import { ValidationError } from "../core/errors.js";
import { SUPPORTED_CATEGORIES } from "../domain/constants/categories.js";

export async function productsHandler({ event, services }) {
  const categoryFromPath = String(event.path || "").split("/").filter(Boolean).pop() || "";
  const category = String(event.pathParameters?.category || categoryFromPath).trim().toLowerCase();
  if (!category || !SUPPORTED_CATEGORIES.has(category)) {
    throw new ValidationError("Unsupported category in path");
  }

  const data = await services.marketDataService.getCategoryProducts(category);
  return {
    data,
    disclaimers: [
      "Informational tool only, not regulated financial advice.",
      "Rates are benchmarks and may differ from lender-specific offers."
    ]
  };
}
