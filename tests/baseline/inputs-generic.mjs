/**
 * tests/baseline/inputs-generic.mjs — Canonical Generic input set.
 *
 * Matches `specs/001-modular-calc-engine/baseline-rr-inline.md §B` exactly.
 * These are the values the Generic dashboard loads cold (hidden-input +
 * range-slider defaults in FIRE-Dashboard-Generic.html).
 *
 * Shape: legacy "inline" shape (Generic's variant — person1/person2/child
 * naming instead of the RR variant's primary/secondary/kid1/kid2 naming).
 *
 * Infeasibility expected: §B.analytical concludes this cold-load scenario
 * is NOT solvable under Safe mode — the zero starting portfolio can't
 * compound fast enough to fund US's $78k/yr retirement spend. The harness
 * should return `feasible: false` with fireAge pinned at `maxYrs` (i.e.
 * inp.ageRoger + min(45, endAge - ageRoger - 1)).
 *
 * Immutable — frozen at module load to rule out harness-side mutation.
 */

/**
 * Generic's default SS earnings history — copied verbatim from
 * FIRE-Dashboard-Generic.html:2004-2010.
 */
const ssEarningsHistoryGeneric = Object.freeze([
  Object.freeze({ year: 2020, earnings: 50_000, credits: 4 }),
  Object.freeze({ year: 2021, earnings: 55_000, credits: 4 }),
  Object.freeze({ year: 2022, earnings: 60_000, credits: 4 }),
  Object.freeze({ year: 2023, earnings: 70_000, credits: 4 }),
  Object.freeze({ year: 2024, earnings: 80_000, credits: 4 }),
  Object.freeze({ year: 2025, earnings: 90_000, credits: 4 }),
]);

/**
 * Legacy-shape inputs (Generic variant).
 *
 * Note: the harness's normalizeInlineInputs() accepts either shape —
 * agePerson1 → ageRoger, person1_401kTrad → roger401kTrad, etc. We populate
 * the person* field names here to exercise that adapter path in passing.
 */
const inputs = Object.freeze({
  // Ages (baseline §B)
  agePerson1: 36,
  agePerson2: 36,
  // No children on cold load — childrenList defaults to 2 entries with
  // BIRTHDATES but the baseline §B scenario explicitly assumes empty.
  kidAges: Object.freeze([]),
  kidCollegePlans: Object.freeze([]),
  kidLoanPcts: Object.freeze([]),
  kidLoanParentPcts: Object.freeze([]),

  // Income
  annualIncome: 80_000,
  raiseRate: 0.02,
  taxRate: 0.25,

  // Portfolios (all zero on cold load — the whole point of Generic's
  // infeasibility case). Note: Generic HTML's startup populates some defaults,
  // but baseline §B documents a true zero-portfolio scenario.
  person1_401kTrad: 0,
  person1_401kRoth: 0,
  person1Stocks: 0,
  person2Stocks: 0,
  cashSavings: 0,
  otherAssets: 0,

  // Returns / inflation
  returnRate: 0.07,
  return401k: 0.07,
  inflationRate: 0.03,
  swr: 0.04,

  // Contributions
  monthlySavings: 500,
  contrib401kTrad: 3_000,
  contrib401kRoth: 0,
  taxTrad: 0.15,
  empMatch: 1_500,

  ssWorkStart: 22,
  ssAvgEarnings: 60_000,
  ssSpouseOwn: 0,

  bufferUnlock: 2,
  bufferSS: 3,
  endAge: 95,
  ssClaimAge: 67,

  loanRate: 6.53,
  loanTerm: 10,
});

/**
 * Browser-state surrogate for the Generic dashboard cold load.
 *
 * NOTE: baseline-rr-inline.md §B documents scenario `us` with annualSpend
 * $78 000 — the spec treats that as "the user has selected US". The HTML's
 * in-memory default is actually `taiwan`, but the spec section is authoritative
 * for baseline capture. We honor the spec.
 */
const env = Object.freeze({
  dashboard: 'generic',
  selectedScenario: 'us',        // per baseline §B
  fireMode: 'safe',

  mortgageEnabled: false,
  secondHomeEnabled: false,

  // On 2026-04-19, BIRTHDATES.person1 = 1990-01-01 → calcAge = 36.
  currentYear: 2026,
  currentAgePrimaryCalendar: 36,
  currentAgePrimaryInput: 36,
  kidAgesInput: Object.freeze([]),

  ssEarningsHistory: ssEarningsHistoryGeneric,

  mortgage: null,
  secondHome: null,
  hcOverridePre65: null,
  hcOverridePost65: null,
  rentMonthly: 2690,
});

export default Object.freeze({ inputs, env });
export { inputs, env, ssEarningsHistoryGeneric };
