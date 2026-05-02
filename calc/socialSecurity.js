/*
 * calc/socialSecurity.js — Social Security projection in real dollars.
 *
 * Two modes:
 *   1. Generic (earnings == null) — applies the published SSA claiming-age
 *      adjustment curve to a policy-anchored baseline PIA. Sufficient for
 *      Generic dashboard users who don't upload an earnings history.
 *   2. Actual-earnings (earnings != null) — computes 35-year-indexed AIME
 *      per SSA methodology, applies 2026 bend points to derive PIA, then
 *      adjusts for claim age via the same curve.
 *
 * Inputs:
 *   params: {
 *     currentAge:     number,                 // integer years today
 *     ssStartAge:     number,                 // integer 62..70 — claim age
 *     earnings:       SSEarnings | null,      // null ⇒ generic mode
 *     inflationRate:  number,                 // decimal, used for wage-indexation in actual mode
 *   }
 *
 *   SSEarnings (types.js §1):
 *     {
 *       annualEarningsNominal: number[],      // oldest → newest, max 35 entries used
 *       latestEarningsYear:    number,
 *     }
 *
 * Outputs: SSProjection (data-model.md §6)
 *   {
 *     ssAgeStart:         number,             // echoes ssStartAge
 *     annualBenefitReal:  number,             // real-dollar annual benefit at claim
 *     indexedEarnings?:   number,             // actual-earnings mode only
 *   }
 *
 * Consumers:
 *   - calc/lifecycle.js      — adds ssIncomeReal to retirement years starting
 *                              at ssAgeStart.
 *   - ssChart renderer       — with-vs-without-SS portfolio curves
 *                              (FIRE-Dashboard{,-Generic}.html).
 *   - FIRE-Dashboard-Generic.html inline `calcRealisticSSA` — wraps this
 *     module's PIA output with a spousal add-on when adultCount === 2, and
 *     suppresses the add-on (spousePIA = 0) when adultCount === 1
 *     (feature 009, FR-012/FR-013).
 *
 * Invariants:
 *   - `annualBenefitReal` is in real (today-dollar) purchasing power. SSA
 *     COLA is assumed to track inflation exactly, so a benefit's real value
 *     is constant once claimed. This keeps FR-017 intact: no nominal bleed.
 *   - Generic mode returns a curve matching current SSA claiming-age
 *     adjustments:
 *         62 → 0.70, 63 → 0.75, 64 → 0.80, 65 → 0.867, 66 → 0.933,
 *         67 → 1.00 (FRA), 68 → 1.08, 69 → 1.16, 70 → 1.24.
 *     Claim ages outside 62..70 are clamped at the boundary factor.
 *   - Actual-earnings mode:
 *       · Indexes each year's nominal earnings to the
 *         (latestEarningsYear - 2)-dollar level using the supplied
 *         `inflationRate` as a wage-index proxy.
 *       · Picks the top-35 indexed years (pads with zero if fewer given).
 *       · AIME = sum(top-35 indexed) / 420 months.
 *       · PIA = 90% of AIME up to first bend + 32% between first and
 *         second bends + 15% above second bend.
 *       · Bend points are the published 2026 values; document version here.
 *       · `indexedEarnings` returned alongside is the 35-year indexed AVERAGE
 *         of annual earnings (AIME × 12), which is what SSA calls the
 *         "Average Indexed Monthly Earnings × 12".
 *   - `earnings === null || earnings === undefined` ⇒ generic mode. Any
 *     other value is treated as actual-earnings mode.
 *
 * Purity: no DOM, no Chart.js, no globals, no I/O, no module-scope mutation.
 *
 * Policy anchors (2026):
 *   - BASELINE_FRA_PIA_ANNUAL_REAL: $30,000/yr (~$2,500/mo). A deliberately
 *     round anchor representing a median single-earner PIA at FRA. Generic
 *     mode scales this by the claim-age curve. Adjust here when SSA
 *     publishes a new trustee-report midpoint.
 *   - BEND_POINT_1: $1,170/mo (monthly). 2026 figure.
 *   - BEND_POINT_2: $7,078/mo (monthly). 2026 figure.
 *     Replace both when SSA publishes 2027 bend points.
 *
 * Simplifications (tracked for future refinement):
 *   - Wage indexation in actual mode uses `inflationRate` as a stand-in for
 *     SSA's average-wage-index (AWI) series. AWI typically outpaces CPI by
 *     ~1%/yr; a future enhancement could accept a separate wageGrowthRate.
 *   - No spousal or survivor benefit modeling.
 *   - No taxation-of-SS layer; calc/withdrawal.js treats 85% as ordinary
 *     income per current IRS upper bound.
 *   - Claim age is assumed integer. Month-level claim granularity (e.g.,
 *     FRA + 3 months) is not supported.
 *
 * FRAME (feature 022 / FR-009):
 *   Dominant frame: real-$ output (annualBenefitReal in today's purchasing power).
 *   Frame-conversion sites:
 *     - Lines 166–177 (indexEarnings): nominal annual earnings × (1+inflationRate)^N
 *       converts each year's nominal-$ earnings to real-$ at latestEarningsYear
 *       (i.e., lifts old nominal $ to today's $ frame, NOT compounding forward).
 *       FR-017-clean: this is THE only nominal→real conversion in the SS module.
 *     - Line 210, 242: inflationRate is forwarded as wage-index proxy (pure-data).
 */

/** SSA claiming-age adjustment factors (FRA = 67). */
const CLAIM_AGE_FACTORS = Object.freeze({
  62: 0.70,
  63: 0.75,
  64: 0.80,
  65: 0.867,
  66: 0.933,
  67: 1.00,
  68: 1.08,
  69: 1.16,
  70: 1.24,
});

/**
 * Baseline FRA-PIA annual real-dollar anchor for GENERIC mode. A deliberately
 * round placeholder; actual-earnings mode overrides this derivation entirely.
 */
const BASELINE_FRA_PIA_ANNUAL_REAL = 30_000;

/** 2026 SSA bend points in MONTHLY dollars (applied to AIME). */
const BEND_POINT_1_MONTHLY = 1_170;
const BEND_POINT_2_MONTHLY = 7_078;

/** PIA formula marginal rates per SSA. */
const PIA_RATE_BELOW_BP1 = 0.90;
const PIA_RATE_BP1_TO_BP2 = 0.32;
const PIA_RATE_ABOVE_BP2 = 0.15;

/** Maximum number of earnings years that count toward AIME. */
const AIME_WINDOW_YEARS = 35;
const MONTHS_IN_AIME_WINDOW = AIME_WINDOW_YEARS * 12;

/**
 * Return the SSA claim-age adjustment factor, clamping to the 62..70 band.
 *
 * @param {number} ssStartAge
 * @returns {number}
 */
function claimAgeFactor(ssStartAge) {
  if (ssStartAge <= 62) return CLAIM_AGE_FACTORS[62];
  if (ssStartAge >= 70) return CLAIM_AGE_FACTORS[70];
  // Table is indexed by integer years; non-integer claims round down.
  const floored = Math.floor(ssStartAge);
  return CLAIM_AGE_FACTORS[floored];
}

/**
 * Apply the PIA formula to a monthly AIME figure.
 *
 * @param {number} aimeMonthly  average indexed monthly earnings, real dollars
 * @returns {number}            monthly PIA in real dollars
 */
function piaFromAime(aimeMonthly) {
  if (aimeMonthly <= 0) return 0;
  let pia = 0;
  const tier1 = Math.min(aimeMonthly, BEND_POINT_1_MONTHLY);
  pia += tier1 * PIA_RATE_BELOW_BP1;
  if (aimeMonthly > BEND_POINT_1_MONTHLY) {
    const tier2 = Math.min(aimeMonthly, BEND_POINT_2_MONTHLY) - BEND_POINT_1_MONTHLY;
    pia += tier2 * PIA_RATE_BP1_TO_BP2;
  }
  if (aimeMonthly > BEND_POINT_2_MONTHLY) {
    const tier3 = aimeMonthly - BEND_POINT_2_MONTHLY;
    pia += tier3 * PIA_RATE_ABOVE_BP2;
  }
  return pia;
}

/**
 * Index a series of nominal annual earnings to the (latestEarningsYear)
 * real-dollar level using `inflationRate` as a wage-index proxy.
 *
 * @param {readonly number[]} annualEarningsNominal  oldest → newest
 * @param {number} latestEarningsYear
 * @param {number} inflationRate
 * @returns {number[]}  indexed earnings in real (latestEarningsYear) dollars
 */
// FRAME: conversion (signature site — body lifts nominal-$ earnings → real-$
//        at latestEarningsYear via wage-index proxy = inflationRate).
function indexEarnings(annualEarningsNominal, latestEarningsYear, inflationRate) {
  const n = annualEarningsNominal.length;
  if (n === 0) return [];
  // Each entry is `ageYearsBack` years before `latestEarningsYear`.
  // Newest (index n-1) has 0 years of indexation; oldest (index 0) has (n-1).
  const indexed = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const ageYearsBack = (n - 1) - i;
    // FRAME: conversion (nominal → real at latestEarningsYear) — wage indexation
    const factor = Math.pow(1 + inflationRate, ageYearsBack);
    indexed[i] = annualEarningsNominal[i] * factor;
  }
  return indexed;
}

/**
 * Compute AIME (average indexed monthly earnings) from a list of indexed
 * annual earnings: keep the top AIME_WINDOW_YEARS, pad with zeros if fewer
 * given, divide by 420 months.
 *
 * @param {readonly number[]} indexedAnnualEarnings
 * @returns {number}  monthly AIME in real dollars
 */
function computeAime(indexedAnnualEarnings) {
  const sorted = [...indexedAnnualEarnings].sort((a, b) => b - a);
  const top = sorted.slice(0, AIME_WINDOW_YEARS);
  // Pad with zeros to enforce the 35-year denominator.
  while (top.length < AIME_WINDOW_YEARS) top.push(0);
  const totalAnnual = top.reduce((acc, v) => acc + v, 0);
  return totalAnnual / MONTHS_IN_AIME_WINDOW;
}

/**
 * Project a person's annual Social Security benefit at claim time, in real
 * dollars. See module header for mode semantics.
 *
 * @param {{
 *   currentAge: number,
 *   ssStartAge: number,
 *   earnings: {annualEarningsNominal: number[], latestEarningsYear: number} | null | undefined,
 *   inflationRate: number,
 * }} params
 * @returns {{ssAgeStart: number, annualBenefitReal: number, indexedEarnings?: number}}
 */
export function projectSS(params) {
  // FRAME: pure-data — inflationRate destructured as wage-index proxy
  const { ssStartAge, earnings, inflationRate } = params;

  if (!Number.isFinite(ssStartAge)) {
    throw new Error(`socialSecurity: ssStartAge must be finite, got ${ssStartAge}`);
  }

  const adjustment = claimAgeFactor(ssStartAge);

  // Generic mode: scale the policy anchor by the claim-age factor.
  if (earnings === null || earnings === undefined) {
    const annualBenefitReal = BASELINE_FRA_PIA_ANNUAL_REAL * adjustment;
    return Object.freeze({
      ssAgeStart: ssStartAge,
      annualBenefitReal,
    });
  }

  // Actual-earnings mode.
  if (!Array.isArray(earnings.annualEarningsNominal)) {
    throw new Error(
      'socialSecurity: earnings.annualEarningsNominal must be an array of numbers',
    );
  }
  if (!Number.isFinite(earnings.latestEarningsYear)) {
    throw new Error(
      `socialSecurity: earnings.latestEarningsYear must be finite, got ${earnings.latestEarningsYear}`,
    );
  }

  // FRAME: conversion (boundary call — nominal-$ earnings → real-$ via indexEarnings)
  const indexed = indexEarnings(
    earnings.annualEarningsNominal,
    earnings.latestEarningsYear,
    inflationRate,
  );
  const aimeMonthly = computeAime(indexed);
  const piaMonthlyAtFra = piaFromAime(aimeMonthly);
  const annualBenefitReal = piaMonthlyAtFra * 12 * adjustment;
  // indexedEarnings: SSA-style annualized average (AIME × 12). Useful for
  // rendering the earnings history in the ssChart.
  const indexedEarningsAnnual = aimeMonthly * 12;

  return Object.freeze({
    ssAgeStart: ssStartAge,
    annualBenefitReal,
    indexedEarnings: indexedEarningsAnnual,
  });
}
