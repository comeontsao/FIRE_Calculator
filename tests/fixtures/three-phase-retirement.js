/**
 * Three-phase retirement fixture (per constitution Principle IV).
 *
 * Spans accumulation → preUnlock (taxable-only) → unlocked (post-59.5) →
 * ssActive. Drives lifecycle + fireCalculator + withdrawal + SS + tax.
 *
 * Complex fixture: `expected` values are placeholders locked during T038
 * (lifecycle.js TDD cycle). The oracle for this fixture is the lifecycle
 * engine itself — no closed-form ground truth is available because taxes,
 * phase boundaries, and SS all interact. The qualitative invariants in
 * `notes` are what code reviewers validate until T038 locks the numbers.
 *
 * @typedef {import('./types.js').FixtureCase} FixtureCase
 */

/** @type {FixtureCase} */
const fixture = Object.freeze({
  name: 'three-phase retirement — single age 45, $1.2M portfolio',
  kind: 'unit',
  inputs: Object.freeze({
    currentAgePrimary: 45,
    endAge: 95,

    portfolioPrimary: Object.freeze({
      trad401kReal: 600_000,
      rothIraReal: 200_000,
      taxableStocksReal: 300_000,
      cashReal: 100_000,
      annualContributionReal: 30_000,
    }),

    annualSpendReal: 60_000,
    returnRateReal: 0.05,
    returnRateCashReal: 0.01,
    inflationRate: 0.03,

    tax: Object.freeze({
      ordinaryBrackets: Object.freeze([
        Object.freeze({ threshold: 0, rate: 0.10 }),
        Object.freeze({ threshold: 11_600, rate: 0.12 }),
        Object.freeze({ threshold: 47_150, rate: 0.22 }),
        Object.freeze({ threshold: 100_525, rate: 0.24 }),
      ]),
      ltcgBrackets: Object.freeze([
        Object.freeze({ threshold: 0, rate: 0.00 }),
        Object.freeze({ threshold: 47_025, rate: 0.15 }),
        Object.freeze({ threshold: 518_900, rate: 0.20 }),
      ]),
      rmdAgeStart: 73,
    }),
    solverMode: 'exact',
    buffers: Object.freeze({
      bufferUnlockMultiple: 2,
      bufferSSMultiple: 2,
    }),

    scenario: Object.freeze({
      country: 'US',
      healthcareScenario: 'aca',
    }),
    colleges: Object.freeze([]),
    ssStartAgePrimary: 67,
  }),
  expected: Object.freeze({
    // Locked 2026-04-19 (T046/T047) — lifecycle+solver output becomes the
    // ground truth for this complex fixture. Tolerances on balance
    // checkpoints (2%) absorb float-drift across lifecycle-engine refactors.
    // Solver fields (consumed by fireCalculator test): solver-found fireAge=52.
    yearsToFire: 7,
    fireAge: 52,
    feasible: true,
    endBalanceReal: 1_820_434.13,
    balanceAtUnlockReal: 1_965_889.61,
    balanceAtSSReal: 2_226_066.49,
    // Lifecycle checkpoints (consumed by lifecycle test): captured at the
    // test's hardcoded fireAge=53 (see tests/unit/lifecycle.test.js:94), which
    // differs from the solver's 52. Both are equally valid projections — the
    // lifecycle test asserts structural invariants at a pinned fireAge; the
    // fireCalculator test asserts the solver picks the earliest feasible age.
    lifecycleCheckpoints: Object.freeze([
      Object.freeze({ age: 55, totalReal: 1_965_426.82, tolerance: 0.02 }),
      Object.freeze({ age: 62, totalReal: 2_179_328.30, tolerance: 0.02 }),
      Object.freeze({ age: 85, totalReal: 3_083_437.99, tolerance: 0.02 }),
    ]),
  }),
  notes:
    'Complex fixture — numeric expected values locked 2026-04-19 in T046 (lifecycle) ' +
    'and T047 (fireCalculator) TDD cycles. Locks the phase transitions ' +
    'at 59.5 (401(k) unlock) and 67 (SS start). Qualitative invariants: ' +
    '(a) feasible must be true at solver-found fireAge; ' +
    '(b) lifecycle must transit accumulation → preUnlock at fireAge, ' +
    'preUnlock → unlocked at age 60 (59.5 rounded), unlocked → ssActive at 67; ' +
    '(c) ssIncomeReal > 0 only in ssActive years; ' +
    '(d) withdrawalReal > 0 only in retirement phases, contributionReal > 0 only ' +
    'in accumulation; ' +
    '(e) totalReal monotonically non-decreasing through accumulation. ' +
    'Solver-found fireAge 52 = 7 years to FIRE from currentAgePrimary 45.',
});

export default fixture;
