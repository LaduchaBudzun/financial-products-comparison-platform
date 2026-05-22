import test from "node:test";
import assert from "node:assert/strict";
import { ComparisonService } from "../../src/services/comparisonService.js";

test("ComparisonService ranks fixed mortgage above variable for low risk tolerance", () => {
  const service = new ComparisonService();
  const categoryData = {
    category: "mortgages",
    products: [
      { id: "fix2", label: "2y fixed", type: "fixed", termMonths: 24, ratePercent: 4.9 },
      { id: "fix5", label: "5y fixed", type: "fixed", termMonths: 60, ratePercent: 4.7 },
      { id: "var", label: "tracker", type: "variable", termMonths: null, ratePercent: 4.6 }
    ]
  };

  const result = service.compare(categoryData, {
    riskTolerance: "low",
    horizonMonths: 36
  });

  assert.ok(result.winner);
  assert.notEqual(result.winner.product.id, "var");
  assert.equal(result.ranking.length, 3);
});

test("ComparisonService computes card total cost", () => {
  const service = new ComparisonService();
  const categoryData = {
    category: "credit-cards",
    products: [
      {
        id: "card-a",
        label: "Card A",
        type: "purchase",
        aprPercent: 22,
        annualFeeGBP: 0,
        cashbackPercent: 0.5,
        fxMarkupPercent: 2.99
      },
      {
        id: "card-b",
        label: "Card B",
        type: "travel",
        aprPercent: 20,
        annualFeeGBP: 0,
        cashbackPercent: 0,
        fxMarkupPercent: 0
      }
    ]
  };

  const result = service.compare(categoryData, {
    monthlySpend: 1500,
    foreignSpendPercent: 40
  });

  assert.ok(result.winner);
  assert.equal(result.ranking.length, 2);
  assert.ok(Number.isFinite(result.ranking[0].totalEstimatedCostGBP));
});

