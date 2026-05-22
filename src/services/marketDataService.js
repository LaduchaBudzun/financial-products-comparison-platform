import { ExternalServiceError } from "../core/errors.js";
import {
  CATEGORY_CREDIT_CARDS,
  CATEGORY_MORTGAGES,
  CATEGORY_SAVINGS
} from "../domain/constants/categories.js";
import { BOE_SERIES_CODES, ONS_SERIES } from "../domain/constants/seriesCodes.js";
import { monthsAgo } from "../utils/dateUtils.js";
import { round } from "../utils/mathUtils.js";

function latestValue(points) {
  if (!Array.isArray(points) || !points.length) {
    return null;
  }
  return points[points.length - 1];
}

function compactTrend(points, maxPoints = 24) {
  if (!Array.isArray(points) || points.length <= maxPoints) {
    return points || [];
  }
  const step = Math.ceil(points.length / maxPoints);
  return points.filter((_, idx) => idx % step === 0);
}

export class MarketDataService {
  constructor({ boeClient, onsClient, exchangeRateClient, cache, env, logger }) {
    this.boeClient = boeClient;
    this.onsClient = onsClient;
    this.exchangeRateClient = exchangeRateClient;
    this.cache = cache;
    this.env = env;
    this.logger = logger;
  }

  async getCategoryProducts(category) {
    const cacheKey = `products:${category}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return { ...cached, cache: { hit: true } };
    }

    let payload;
    if (category === CATEGORY_MORTGAGES) {
      payload = await this.buildMortgageProducts();
    } else if (category === CATEGORY_SAVINGS) {
      payload = await this.buildSavingsProducts();
    } else if (category === CATEGORY_CREDIT_CARDS) {
      payload = await this.buildCreditCardProducts();
    } else {
      throw new ExternalServiceError("Unsupported category");
    }

    await this.cache.set(cacheKey, payload, this.env.cacheTtlSeconds);
    return { ...payload, cache: { hit: false } };
  }

  async buildMortgageProducts() {
    const now = new Date();
    const from = monthsAgo(this.env.defaultLookbackMonths);
    const seriesCodes = [
      BOE_SERIES_CODES.mortgages.fixed2y,
      BOE_SERIES_CODES.mortgages.fixed3y,
      BOE_SERIES_CODES.mortgages.fixed5y,
      ...BOE_SERIES_CODES.bankRateCandidates
    ];

    const data = await this.boeClient.fetchSeries(seriesCodes, { fromDate: from, toDate: now });
    const fixed2y = data.series[BOE_SERIES_CODES.mortgages.fixed2y] || [];
    const fixed3y = data.series[BOE_SERIES_CODES.mortgages.fixed3y] || [];
    const fixed5y = data.series[BOE_SERIES_CODES.mortgages.fixed5y] || [];

    const bankRateSeries =
      data.series[BOE_SERIES_CODES.bankRateCandidates[0]]?.length
        ? data.series[BOE_SERIES_CODES.bankRateCandidates[0]]
        : data.series[BOE_SERIES_CODES.bankRateCandidates[1]] || [];

    const latestBankRate = latestValue(bankRateSeries)?.value;
    const trackerEstimate = latestBankRate !== null && latestBankRate !== undefined ? round(latestBankRate + 1.15) : null;

    return {
      category: CATEGORY_MORTGAGES,
      asOf: new Date().toISOString(),
      sources: ["Bank of England"],
      products: [
        {
          id: "mortgage_fixed_2y_75_ltv",
          label: "2-year fixed mortgage (75% LTV)",
          type: "fixed",
          termMonths: 24,
          ratePercent: latestValue(fixed2y)?.value ?? null
        },
        {
          id: "mortgage_fixed_3y_75_ltv",
          label: "3-year fixed mortgage (75% LTV)",
          type: "fixed",
          termMonths: 36,
          ratePercent: latestValue(fixed3y)?.value ?? null
        },
        {
          id: "mortgage_fixed_5y_75_ltv",
          label: "5-year fixed mortgage (75% LTV)",
          type: "fixed",
          termMonths: 60,
          ratePercent: latestValue(fixed5y)?.value ?? null
        },
        {
          id: "mortgage_tracker_proxy",
          label: "Tracker mortgage proxy (Bank Rate + 1.15%)",
          type: "variable",
          termMonths: null,
          ratePercent: trackerEstimate,
          assumptions: [
            "Proxy benchmark for comparison only",
            "Actual lender spread varies by risk profile"
          ]
        }
      ],
      trends: {
        fixed2y: compactTrend(fixed2y),
        fixed3y: compactTrend(fixed3y),
        fixed5y: compactTrend(fixed5y),
        bankRate: compactTrend(bankRateSeries)
      }
    };
  }

  async buildSavingsProducts() {
    const now = new Date();
    const from = monthsAgo(this.env.defaultLookbackMonths);
    const boeCodes = [
      BOE_SERIES_CODES.savings.fixedIsa2y,
      ...BOE_SERIES_CODES.bankRateCandidates
    ];

    const boeData = await this.boeClient.fetchSeries(boeCodes, { fromDate: from, toDate: now });
    const isaSeries = boeData.series[BOE_SERIES_CODES.savings.fixedIsa2y] || [];

    const bankRateSeries =
      boeData.series[BOE_SERIES_CODES.bankRateCandidates[0]]?.length
        ? boeData.series[BOE_SERIES_CODES.bankRateCandidates[0]]
        : boeData.series[BOE_SERIES_CODES.bankRateCandidates[1]] || [];

    const latestBankRate = latestValue(bankRateSeries)?.value ?? null;
    const easyAccessProxy = latestBankRate === null ? null : round(Math.max(0, latestBankRate - 0.75));
    const noticeProxy = latestBankRate === null ? null : round(Math.max(0, latestBankRate - 0.35));

    let latestInflation = null;
    let inflationHistory = [];
    try {
      const inflation = await this.onsClient.getTimeSeries(ONS_SERIES.cpiAnnualRate.id);
      inflationHistory = inflation.observations;
      latestInflation = latestValue(inflation.observations)?.value ?? null;
    } catch (error) {
      this.logger.warn("ONS CPI unavailable; real return will be omitted", { message: error.message });
    }

    const realReturn = (rate) =>
      latestInflation === null || rate === null || rate === undefined ? null : round(rate - latestInflation);

    return {
      category: CATEGORY_SAVINGS,
      asOf: new Date().toISOString(),
      sources: latestInflation !== null ? ["Bank of England", "Office for National Statistics"] : ["Bank of England"],
      inflationRatePercent: latestInflation,
      products: [
        {
          id: "savings_2y_fixed_isa",
          label: "2-year fixed cash ISA",
          type: "fixed",
          termMonths: 24,
          ratePercent: latestValue(isaSeries)?.value ?? null,
          realReturnPercent: realReturn(latestValue(isaSeries)?.value ?? null)
        },
        {
          id: "savings_easy_access_proxy",
          label: "Easy-access savings proxy",
          type: "variable",
          termMonths: null,
          ratePercent: easyAccessProxy,
          realReturnPercent: realReturn(easyAccessProxy),
          assumptions: ["Proxy based on Bank Rate minus 0.75 percentage points"]
        },
        {
          id: "savings_notice_proxy",
          label: "Notice savings proxy",
          type: "variable",
          termMonths: null,
          ratePercent: noticeProxy,
          realReturnPercent: realReturn(noticeProxy),
          assumptions: ["Proxy based on Bank Rate minus 0.35 percentage points"]
        }
      ],
      trends: {
        fixedIsa2y: compactTrend(isaSeries),
        bankRate: compactTrend(bankRateSeries),
        inflation: compactTrend(inflationHistory)
      }
    };
  }

  async buildCreditCardProducts() {
    const now = new Date();
    const from = monthsAgo(this.env.defaultLookbackMonths);
    const boeCodes = [
      BOE_SERIES_CODES.creditCards.interestChargingBalances,
      ...BOE_SERIES_CODES.bankRateCandidates
    ];
    const boeData = await this.boeClient.fetchSeries(boeCodes, { fromDate: from, toDate: now });
    const creditRateSeries = boeData.series[BOE_SERIES_CODES.creditCards.interestChargingBalances] || [];
    const latestCreditRate = latestValue(creditRateSeries)?.value ?? null;

    const bankRateSeries =
      boeData.series[BOE_SERIES_CODES.bankRateCandidates[0]]?.length
        ? boeData.series[BOE_SERIES_CODES.bankRateCandidates[0]]
        : boeData.series[BOE_SERIES_CODES.bankRateCandidates[1]] || [];
    const latestBankRate = latestValue(bankRateSeries)?.value ?? 4;

    const products = [
      {
        id: "card_purchase_cashback",
        label: "Purchase cashback card archetype",
        type: "purchase",
        aprPercent: latestCreditRate ?? round(latestBankRate + 18.5),
        annualFeeGBP: 0,
        cashbackPercent: 0.5,
        fxMarkupPercent: 2.99
      },
      {
        id: "card_balance_transfer",
        label: "Balance transfer card archetype",
        type: "balance-transfer",
        aprPercent: round(latestBankRate + 8.9),
        annualFeeGBP: 0,
        transferFeePercent: 2.9,
        introAprMonths: 20
      },
      {
        id: "card_travel_no_fx",
        label: "Travel no-FX-fee card archetype",
        type: "travel",
        aprPercent: round(latestBankRate + 17.9),
        annualFeeGBP: 0,
        cashbackPercent: 0.0,
        fxMarkupPercent: 0
      }
    ];

    let fxSnapshot = null;
    if (this.env.enableExchangeData) {
      try {
        fxSnapshot = await this.exchangeRateClient.getLatest("GBP", ["USD", "EUR"]);
      } catch (error) {
        this.logger.warn("Exchange rate enrichment unavailable", { message: error.message });
      }
    }

    return {
      category: CATEGORY_CREDIT_CARDS,
      asOf: new Date().toISOString(),
      sources: fxSnapshot ? ["Bank of England", fxSnapshot.source] : ["Bank of England"],
      products,
      trends: {
        creditCardBenchmarkApr: compactTrend(creditRateSeries),
        bankRate: compactTrend(bankRateSeries)
      },
      fxSnapshot
    };
  }
}
