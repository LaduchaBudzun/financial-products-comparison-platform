export const BOE_SERIES_CODES = {
  mortgages: {
    fixed2y: "IUMBV34",  // 2yr fixed mortgage (75% LTV) — verified live
    fixed3y: "IUMBV37",  // 3yr fixed mortgage (75% LTV) — verified live
    fixed5y: "IUMBV42"   // 5yr fixed mortgage (75% LTV) — verified live
  },
  // Bank Rate effective date series — IUMABEDR is primary, IUDBEDR legacy fallback
  bankRateCandidates: ["IUMABEDR", "IUDBEDR"],
  savings: {
    fixedIsa2y: "IUMZID2"  // 2yr fixed cash ISA rate — verified live
  },
  creditCards: {
    // IUMCCTL: credit card interest rate (all accounts) — verified live; replaces wrong HSDG
    interestChargingBalances: "IUMCCTL"
  }
};

// d7g7 = CPI Annual Rate, All Items — verified working via ons.gov.uk/generator
export const ONS_SERIES = {
  cpiAnnualRate: {
    id: "d7g7"
  }
};

