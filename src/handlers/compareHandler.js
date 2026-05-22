import { parseJsonBody } from "../core/validation.js";
import { validateComparePayload } from "../domain/validators/compareValidator.js";

export async function compareHandler({ event, services }) {
  const rawPayload = parseJsonBody(event.body);
  const { category, criteria } = validateComparePayload(rawPayload);

  const categoryData = await services.marketDataService.getCategoryProducts(category);
  const comparison = services.comparisonService.compare(categoryData, criteria);
  const recommendation = await services.recommendationService.generate({
    categoryData,
    criteria,
    comparison,
    includeAi: true
  });

  return {
    category,
    criteria,
    comparison,
    recommendation,
    disclaimers: [
      "Comparison is model-based and for educational use.",
      "Always verify total costs, fees, and eligibility with providers."
    ]
  };
}

