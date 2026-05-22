import { validateRecommendationsQuery } from "../domain/validators/recommendationValidator.js";

function criteriaToStructured(criteria) {
  if (criteria.type === "json") {
    return criteria.value;
  }
  return {
    objective: criteria.value,
    riskTolerance: "medium"
  };
}

export async function recommendationsHandler({ event, services }) {
  const query = validateRecommendationsQuery(event.queryStringParameters || {});
  const criteria = criteriaToStructured(query.criteria);

  const categoryData = await services.marketDataService.getCategoryProducts(query.category);
  const comparison = services.comparisonService.compare(categoryData, criteria);
  const recommendation = await services.recommendationService.generate({
    categoryData,
    criteria,
    comparison,
    includeAi: query.includeAi
  });

  return {
    category: query.category,
    criteria,
    recommendation,
    comparisonPreview: comparison.winner,
    disclaimers: [
      "AI output is generated text and can be imperfect.",
      "Decisions should include independent affordability checks."
    ]
  };
}

