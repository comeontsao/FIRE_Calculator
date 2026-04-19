/**
 * Solver-mode matrix fixture (per tasks.md T011).
 *
 * Same inputs under solverMode 'safe' | 'exact' | 'dieWithZero'. The monotonic
 * invariant is `fireAge_safe >= fireAge_exact >= fireAge_dieWithZero` because
 * 'safe' adds larger buffers, 'exact' requires exactly enough, and
 * 'dieWithZero' permits the portfolio to end at zero.
 *
 * Complex fixture — per-mode numeric expected values are placeholders locked
 * during T039 (fireCalculator TDD). Qualitative invariant in `notes`.
 *
 * @typedef {import('./types.js').FixtureCase} FixtureCase
 */

// Base inputs (lifted from three-phase-retirement fixture: single age 45,
// $1.2M split across accounts, $60k spend, $30k contributions).
const baseInputs = Object.freeze({
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
});

const withMode = (mode) => Object.freeze({ ...baseInputs, solverMode: mode });

/** @type {FixtureCase} */
const fixture = Object.freeze({
  name: 'solver-mode matrix — safe | exact | dieWithZero',
  kind: 'unit',
  // Use the 'exact' variant as the default `inputs` so this fixture still
  // conforms to the FixtureCase typedef (single `inputs` field). The matrix
  // variants live under expected.variants, which the fireCalculator test
  // iterates explicitly.
  inputs: withMode('exact'),
  expected: Object.freeze({
    monotonicInvariant: 'fireAge_safe >= fireAge_exact >= fireAge_dieWithZero',
    variants: Object.freeze({
      safe: Object.freeze({
        inputs: withMode('safe'),
        fireAge: 'TBD_LOCK_IN_T039',
        feasible: 'TBD_LOCK_IN_T039',
        endBalanceReal: 'TBD_LOCK_IN_T039',
      }),
      exact: Object.freeze({
        inputs: withMode('exact'),
        fireAge: 'TBD_LOCK_IN_T039',
        feasible: 'TBD_LOCK_IN_T039',
        endBalanceReal: 'TBD_LOCK_IN_T039',
      }),
      dieWithZero: Object.freeze({
        inputs: withMode('dieWithZero'),
        fireAge: 'TBD_LOCK_IN_T039',
        feasible: 'TBD_LOCK_IN_T039',
        // endBalanceReal ≈ 0 by definition of this mode (locked in T039)
        endBalanceReal: 'TBD_LOCK_IN_T039',
      }),
    }),
  }),
  notes:
    'Locks the monotonic invariant fireAge_safe >= fireAge_exact >= fireAge_dwz. ' +
    'Per-mode exact values placeholder until T039 (fireCalculator.js) is ' +
    'implemented. endBalanceReal for dieWithZero must approach zero within ' +
    'T039-specified tolerance; for exact, must satisfy safety buffers at ' +
    'phase boundaries; for safe, must maintain a larger margin throughout.',
});

export default fixture;
