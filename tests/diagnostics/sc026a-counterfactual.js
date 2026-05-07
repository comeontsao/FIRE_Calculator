/**
 * SC-026-A — Withdrawal-strategy counterfactual fixture (research-only).
 *
 * Frozen RR-default-derived inputs for the feature-026 US2 investigation.
 * Per spec.md SC-026-A: RR-default + FIRE age 53 + Die-With-Zero +
 * "Leave more behind" objective + LTCG 60% gain pct + plan-end age 95.
 *
 * Pool balances at FIRE age 53 are BACK-COMPUTED from RR cold-load defaults
 * by accumulating from current age 42 to age 53 at 7% nominal / 3% inflation.
 * The accumulation math is documented in tests/diagnostics/us2-counterfactual.js.
 *
 * This fixture is consumed only by tests/diagnostics/us2-counterfactual.js
 * and the research deliverable in specs/026-.../research.md Section 2.
 * Not part of `node --test` runs; CommonJS export so the diagnostic harness
 * can require() it without ESM interop.
 *
 * Sources: FIRE-Dashboard.html cold-load defaults (today = 2026-05-07)
 *   - rogerStocks: $190,000; rebeccaStocks: $200,000
 *   - cashSavings: $0
 *   - roger401k (Trad): $25,000; roger401kRoth: $58,000
 *   - returns: stocks 7% nominal, 401k 7% nominal, inflation 3%
 *   - swr: 4% (informational; not used by DWZ)
 *   - monthlySavings: $2,000 → $24,000/yr taxable
 *   - contrib401k Trad: $8,550/yr; contrib401kRoth: $2,850/yr
 *   - empMatch (Trad): $7,200/yr
 *   - taxTrad: 15% (effective blended; not used here — fixture uses MFJ 2024)
 *   - monthlySpend: $6,490 (sum of defaultExpenses) → $77,880/yr real
 *   - SS Roger: $30K/yr nominal-base, claim age 67
 *   - SS Rebecca: $20K/yr nominal-base, claim age 67
 */
'use strict';

const SC_026_A = Object.freeze({
  fixtureName: 'SC-026-A',
  description:
    'RR-default + FIRE 53 + Die-With-Zero + leave-more-behind + LTCG 60% + plan-end 95',

  // ----- Persona -----
  ageRoger: 42,
  ageRebecca: 41,
  endAge: 95,
  fireAge: 53,
  fireMode: 'dieWithZero',
  withdrawalObjective: 'leave-more-behind',

  // ----- Today balances (nominal $) -----
  initialPools: Object.freeze({
    trad401k: 25_000,
    roth401k: 58_000,
    taxableStocks: 390_000,    // rogerStocks 190K + rebeccaStocks 200K
    cash: 0,
    otherAssets: 0,
  }),

  // ----- Annual contributions (nominal-fixed during accumulation) -----
  annualContributions: Object.freeze({
    tradPlusMatch: 15_750,     // 8,550 + 7,200 employer match
    roth: 2_850,
    taxable: 24_000,           // monthlySavings × 12
  }),

  // ----- Returns / inflation -----
  returns: Object.freeze({
    stocksNominal: 0.07,
    k401kNominal: 0.07,
    inflation: 0.03,
    realReturn: 0.0388,        // (1.07/1.03 - 1)
  }),

  // ----- Spend (real-$) -----
  annualSpendReal: 77_880,     // sum of defaultExpenses × 12

  // ----- Pools at FIRE age 53 (BACK-COMPUTED, nominal $) -----
  // Method: nominal-$ FV of starting balance at 7% over 11 years +
  // nominal-fixed annuity of contributions at 7% annuity factor 15.7836.
  // (1.07)^11 = 2.10485; ((1.07)^11 - 1)/0.07 = 15.78360.
  poolsAtFire: Object.freeze({
    trad401k:      301_200,    // 25,000 × 2.10485 + 15,750 × 15.78360
    roth401k:      167_100,    // 58,000 × 2.10485 + 2,850  × 15.78360
    taxableStocks: 1_199_800,  // 390,000 × 2.10485 + 24,000 × 15.78360
    cash:          0,
    totalNominal:  1_668_100,
    totalReal:     1_205_000,  // deflated by (1.03)^11 = 1.38423
  }),

  // ----- Annual spend at FIRE in nominal $ -----
  annualSpendNominalAtFire: 107_798, // 77,880 × 1.38423

  // ----- SS (real-$) -----
  ss: Object.freeze({
    rogerAnnualReal: 30_000,
    rebeccaAnnualReal: 20_000,
    claimAgeRoger: 67,
    claimAgeRebecca: 67,
  }),

  // ----- Tax model (federal MFJ 2024) -----
  tax: Object.freeze({
    filingStatus: 'mfj',
    standardDeductionMFJ: 29_200,
    standardDeductionSingle: 14_600,
    ordinaryBracketsMFJ: Object.freeze([
      Object.freeze({ rate: 0.10, upperBound: 23_200 }),
      Object.freeze({ rate: 0.12, upperBound: 94_300 }),
      Object.freeze({ rate: 0.22, upperBound: 201_050 }),
      Object.freeze({ rate: 0.24, upperBound: 383_900 }),
    ]),
    ordinaryBracketsSingle: Object.freeze([
      Object.freeze({ rate: 0.10, upperBound: 11_600 }),
      Object.freeze({ rate: 0.12, upperBound: 47_150 }),
      Object.freeze({ rate: 0.22, upperBound: 100_525 }),
      Object.freeze({ rate: 0.24, upperBound: 191_950 }),
    ]),
    rmdAgeStart: 73,
    irmaaTier1ThresholdMFJ: 212_000,
    acaPtcCliff400FPL: 80_000,
    ltcgGainPct: 0.60,
  }),

  // ----- Smoothing window (counterfactual policy) -----
  smoothingWindow: Object.freeze({
    nominalRange: Object.freeze({ start: 60, end: 68 }),
    effectiveRange: Object.freeze({ start: 65, end: 68 }),
    excluded: 'ages 60-64 (ACA-PTC 400% FPL cliff at ~$80K MFJ ordinary income)',
    perYearSmoothAmount: 52_400,
    perYearTaxOnSmooth: 2_320,
    perYearAfterTaxResidual: 50_080,
  }),
});

module.exports = { SC_026_A };
