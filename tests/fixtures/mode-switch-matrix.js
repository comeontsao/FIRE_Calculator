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
        fireAge: 52,
        feasible: true,
        endBalanceReal: 1_820_434.13,
      }),
      exact: Object.freeze({
        inputs: withMode('exact'),
        fireAge: 52,
        feasible: true,
        endBalanceReal: 1_820_434.13,
      }),
      dieWithZero: Object.freeze({
        inputs: withMode('dieWithZero'),
        fireAge: 52,
        feasible: true,
        // Without a dedicated aggressive-spend strategy (out of scope for US2),
        // dieWithZero collapses to the earliest feasibility age — identical
        // to 'exact' for this fixture. The monotonic invariant
        // fireAge_safe >= fireAge_exact >= fireAge_dwz still holds (with
        // equality).
        endBalanceReal: 1_820_434.13,
      }),
    }),
  }),
  notes:
    'Locks the monotonic invariant fireAge_safe >= fireAge_exact >= fireAge_dwz. ' +
    'Per-mode values locked 2026-04-19 in T047 (fireCalculator.js TDD cycle). ' +
    'All three modes resolve to fireAge 52 for these inputs because (a) the ' +
    'safety buffer at unlock (2× spend = $120k) is dwarfed by the actual ' +
    'balance at age 60 (~$2.1M) and (b) dieWithZero has no aggressive-spend ' +
    'strategy yet, so it falls through to exact-mode feasibility. A future ' +
    'feature introducing a dedicated dieWithZero withdrawal path would ' +
    'produce a lower fireAge_dwz, still preserving the invariant.',
});

export default fixture;
