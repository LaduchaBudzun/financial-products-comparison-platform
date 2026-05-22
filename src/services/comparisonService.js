import { ValidationError } from "../core/errors.js";
import { round } from "../utils/mathUtils.js";
import { CATEGORY_CREDIT_CARDS, CATEGORY_MORTGAGES, CATEGORY_SAVINGS } from "../domain/constants/categories.js";

function pickBest(items, scoringFn) {
  if (!items.length) {
    return null;
  }
  return items
    .map((item) => ({ item, score: scoringFn(item) }))
    .sort((a, b) => b.score - a.score)[0];
}

function compareMortgages(products, criteria) {
  const relevant = products.filter((product) => Number.isFinite(product.ratePercent));
  if (!relevant.length) {
    throw new ValidationError("No mortgage products available for comparison");
  }

  const targetHorizon = criteria.horizonMonths || 36;
  const riskPenalty = criteria.riskTolerance === "low" ? 0.9 : criteria.riskTolerance === "high" ? 0.2 : 0.5;

  const scored = relevant.map((product) => {
    const rate = product.ratePercent;
    const termMismatch = product.termMonths ? Math.abs(product.termMonths - targetHorizon) / 60 : 0.5;
    const variablePenalty = product.type === "variable" ? riskPenalty : 0.1;
    const score = 100 - rate * 6 - termMismatch * 12 - variablePenalty * 10;
    return {
      product,
      score: round(score, 2),
      rationale: [
        `Rate impact: ${round(rate * 6, 2)} points`,
        `Term mismatch impact: ${round(termMismatch * 12, 2)} points`,
        `Variable-rate risk impact: ${round(variablePenalty * 10, 2)} points`
      ]
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return {
    winner: scored[0],
    ranking: scored
  };
}

function compareSavings(products, criteria) {
  const relevant = products.filter((product) => Number.isFinite(product.ratePercent));
  if (!relevant.length) {
    throw new ValidationError("No savings products available for comparison");
  }

  const objectiveRealReturnWeight = (criteria.objective || "").toLowerCase().includes("inflation") ? 0.7 : 0.5;
  const scored = relevant.map((product) => {
    const nominal = product.ratePercent;
    const real = Number.isFinite(product.realReturnPercent) ? product.realReturnPercent : nominal - 2;
    const liquidityPenalty = product.type === "fixed" ? 1.4 : 0.4;
    const score = nominal * (1 - objectiveRealReturnWeight) + real * objectiveRealReturnWeight - liquidityPenalty;
    return {
      product,
      score: round(score, 2),
      rationale: [
        `Nominal contribution: ${round(nominal * (1 - objectiveRealReturnWeight), 2)}`,
        `Real return contribution: ${round(real * objectiveRealReturnWeight, 2)}`,
        `Liquidity penalty: ${liquidityPenalty}`
      ]
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return {
    winner: scored[0],
    ranking: scored
  };
}

function compareCreditCards(products, criteria) {
  const relevant = products.filter((product) => Number.isFinite(product.aprPercent));
  if (!relevant.length) {
    throw new ValidationError("No credit card products available for comparison");
  }

  const monthlySpend = criteria.monthlySpend || 1500;
  const annualSpend = monthlySpend * 12;
  const revolvedBalance = annualSpend * 0.25;
  const foreignShare = (criteria.foreignSpendPercent || 0) / 100;

  const scored = relevant.map((product) => {
    const aprCost = (revolvedBalance * product.aprPercent) / 100;
    const annualFee = product.annualFeeGBP || 0;
    const fxCost = (annualSpend * foreignShare * (product.fxMarkupPercent || 0)) / 100;
    const cashbackValue = (annualSpend * (product.cashbackPercent || 0)) / 100;
    const transferFee = (revolvedBalance * (product.transferFeePercent || 0)) / 100;
    const totalCost = aprCost + annualFee + fxCost + transferFee - cashbackValue;
    const score = -totalCost;
    return {
      product,
      score: round(score, 2),
      totalEstimatedCostGBP: round(totalCost, 2),
      rationale: [
        `Interest cost: £${round(aprCost, 2)}`,
        `FX cost: £${round(fxCost, 2)}`,
        `Cashback benefit: £${round(cashbackValue, 2)}`,
        `Transfer fee cost: £${round(transferFee, 2)}`
      ]
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return {
    winner: scored[0],
    ranking: scored
  };
}

export class ComparisonService {
  compare(categoryData, criteria) {
    if (!categoryData || !Array.isArray(categoryData.products)) {
      throw new ValidationError("Invalid category data");
    }

    if (categoryData.category === CATEGORY_MORTGAGES) {
      return compareMortgages(categoryData.products, criteria);
    }
    if (categoryData.category === CATEGORY_SAVINGS) {
      return compareSavings(categoryData.products, criteria);
    }
    if (categoryData.category === CATEGORY_CREDIT_CARDS) {
      return compareCreditCards(categoryData.products, criteria);
    }

    throw new ValidationError(`Unsupported category for comparison: ${categoryData.category}`);
  }
}

