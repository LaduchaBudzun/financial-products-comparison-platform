import test from "node:test";
import assert from "node:assert/strict";
import { validateComparePayload } from "../../src/domain/validators/compareValidator.js";
import { validateRecommendationsQuery } from "../../src/domain/validators/recommendationValidator.js";

test("validateComparePayload normalizes valid payload", () => {
  const payload = validateComparePayload({
    category: "mortgages",
    criteria: {
      riskTolerance: "HIGH",
      loanAmount: 250000,
      ltv: 75,
      objective: "Remortgage and stability"
    }
  });

  assert.equal(payload.category, "mortgages");
  assert.equal(payload.criteria.riskTolerance, "high");
  assert.equal(payload.criteria.loanAmount, 250000);
});

test("validateComparePayload throws on unsupported category", () => {
  assert.throws(
    () =>
      validateComparePayload({
        category: "crypto",
        criteria: {}
      }),
    /supported/
  );
});

test("validateRecommendationsQuery parses text and json criteria", () => {
  const textMode = validateRecommendationsQuery({
    category: "savings",
    criteria: "Need inflation-beating savings option"
  });
  assert.equal(textMode.criteria.type, "text");

  const jsonMode = validateRecommendationsQuery({
    category: "mortgages",
    criteria: JSON.stringify({ riskTolerance: "low", horizonMonths: 24 })
  });
  assert.equal(jsonMode.criteria.type, "json");
});

