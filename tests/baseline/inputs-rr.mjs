/**
 * tests/baseline/inputs-rr.mjs — Canonical RR input set.
 *
 * Matches `specs/001-modular-calc-engine/baseline-rr-inline.md §A` exactly.
 * These are the values Roger's personal dashboard loads when opened cold
 * (hidden-input + range-slider defaults in FIRE-Dashboard.html).
 *
 * Shape: legacy "inline" shape — what FIRE-Dashboard.html's getInputs()
 * returns when every HTML default is untouched. NOT the canonical Inputs
 * shape (data-model.md §1a) — that's a post-adapter concern.
 *
 * Immutable — frozen at module load to rule out harness-side mutation.
 */

/**
 * SS earnings history default — copied verbatim from FIRE-Dashboard.html:1920-1928.
 * These are Roger's actual historical earnings records that seed the SSA PIA
 * calculation. If the RR dashboard ever updates this default, this fixture
 * needs a matching update and the baseline needs a re-capture.
 */
const ssEarningsHistoryRR = Object.freeze([
  Object.freeze({ year: 2019, earnings: 44_037,  credits: 4 }),
  Object.freeze({ year: 2020, earnings: 77_957,  credits: 4 }),
  Object.freeze({ year: 2021, earnings: 80_783,  credits: 4 }),
  Object.freeze({ year: 2022, earnings: 83_714,  credits: 4 }),
  Object.freeze({ year: 2023, earnings: 94_786,  credits: 4 }),
  Object.freeze({ year: 2024, earnings: 125_753, credits: 4 }),
  Object.freeze({ year: 2025, earnings: 148_272, credits: 4 }),
]);

/**
 * Legacy-shape inputs — mirrors what document.getElementById(...).value
 * parses into for each field on a cold load of FIRE-Dashboard.html.
 */
const inputs = Object.freeze({
  // Ages (baseline §A)
  ageRoger: 43,
  ageRebecca: 42,
  ageKid1: 10,
  ageKid2: 4,

  // Income (accumulation-phase)
  annualIncome: 150_000,
  raiseRate: 0.02,
  taxRate: 0.25, // RR default #taxRate — unused by signed solver but kept for parity

  // Portfolios (real dollars — all inline fields are already-real per inline convention)
  roger401kTrad: 25_000,
  roger401kRoth: 58_000,   // merges into "Roth 401K" pool
  rogerStocks: 190_000,
  rebeccaStocks: 200_000,
  cashSavings: 0,
  otherAssets: 0,

  // Returns / inflation
  returnRate: 0.07,
  return401k: 0.07,
  inflationRate: 0.03,
  swr: 0.04, // display only

  // Contributions
  monthlySavings: 2_000,
  contrib401kTrad: 8_550,
  contrib401kRoth: 2_850,
  taxTrad: 0.15,
  empMatch: 7_200, // always Traditional

  // SS settings
  ssWorkStart: 22,
  ssAvgEarnings: 100_000,
  ssRebeccaOwn: 0, // RR-specific name; Generic uses ssSpouseOwn

  // Buffers + plan horizon
  bufferUnlock: 2,
  bufferSS: 3,
  endAge: 95,
  ssClaimAge: 67,

  // Kids' college plans (RR default: two kids, both us-private, no loan financing)
  // (Unified array shape that the harness consumes — RR's HTML uses scalar
  //  ageKid1/collegeKid1/loanPctKid1 fields, but the harness normalizes via
  //  kidAges[]/kidCollegePlans[]/kidLoanPcts[]/kidLoanParentPcts[].)
  kidAges: Object.freeze([10, 4]),
  kidCollegePlans: Object.freeze(['us-private', 'us-private']),
  kidLoanPcts: Object.freeze([0, 0]),
  kidLoanParentPcts: Object.freeze([100, 100]),
  loanRate: 6.53,
  loanTerm: 10,
});

/**
 * Browser-state surrogate. These are the DOM/globals the inline engine reads
 * that AREN'T part of the legacy inputs object.
 */
const env = Object.freeze({
  dashboard: 'rr',
  selectedScenario: 'taiwan',     // RR's cold-load default
  fireMode: 'safe',               // RR's cold-load default

  // Feature toggles — both OFF by default at cold load
  mortgageEnabled: false,
  secondHomeEnabled: false,

  // Date pinning — harness must be deterministic. On 2026-04-19 (today per env),
  // calcAge(BIRTHDATES.roger = 1983-05-19) is 42 (pre-birthday). currentYear is
  // 2026. These directly feed getFullEarningsHistory.
  currentYear: 2026,
  currentAgePrimaryCalendar: 42,   // May-19 birthday, today's date 2026-04-19
  currentAgePrimaryInput: 43,      // matches inputs.ageRoger — for family-size factor
  kidAgesInput: Object.freeze([10, 4]),  // for family-size factor (pre-65 healthcare)

  // SS earnings history (see above)
  ssEarningsHistory: ssEarningsHistoryRR,

  // No mortgage / second home / healthcare overrides in the canonical set
  mortgage: null,
  secondHome: null,
  hcOverridePre65: null,
  hcOverridePost65: null,
  rentMonthly: 2690, // RR's default #exp_0; irrelevant when mortgageEnabled=false
});

export default Object.freeze({ inputs, env });
export { inputs, env, ssEarningsHistoryRR };
