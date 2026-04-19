/**
 * Accumulation-phase-only fixture (single 30-year-old, decades to FIRE).
 *
 * Analytical fixture: checkpoint balances derived from closed-form future-value
 *   FV(n) = PV * (1+r)^n + PMT * ((1+r)^n - 1) / r
 * with PV = 100_000, PMT = 20_000, r = 0.05, ages 30 → 35/45/55 (n = 5/15/25).
 *
 * Expected values locked now because no lifecycle engine is needed to derive
 * them; they are the mathematical ground truth that lifecycle.js will be
 * tested against in T038.
 *
 * @typedef {import('./types.js').FixtureCase} FixtureCase
 */

/** @type {FixtureCase} */
const fixture = Object.freeze({
  name: 'accumulation-only — single age 30, $100k portfolio, $24k spend, $20k contributions',
  kind: 'unit',
  inputs: Object.freeze({
    currentAgePrimary: 30,
    endAge: 90,

    portfolioPrimary: Object.freeze({
      trad401kReal: 0,
      rothIraReal: 0,
      taxableStocksReal: 100_000,
      cashReal: 0,
      annualContributionReal: 20_000,
    }),

    annualSpendReal: 24_000, // $2k/mo
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
      healthcareScenario: 'employer',
    }),
    colleges: Object.freeze([]),
    ssStartAgePrimary: 67,
  }),
  expected: Object.freeze({
    feasibleThroughoutAccumulation: true,
    monotonicGrowth: true,
    lifecycleCheckpoints: Object.freeze([
      Object.freeze({ age: 35, totalReal: 238_140.78, tolerance: 0.01 }),
      Object.freeze({ age: 45, totalReal: 639_464.09, tolerance: 0.01 }),
      Object.freeze({ age: 55, totalReal: 1_293_177.47, tolerance: 0.01 }),
    ]),
  }),
  notes:
    'Analytical fixture. Checkpoint balances computed from closed-form future-value ' +
    'formula at 5% real return, $20k annual contribution, $100k starting balance. ' +
    'Tolerance 1% absorbs lifecycle-engine integer-year granularity. ' +
    'During accumulation, feasible must be true every year and totalReal must be ' +
    'monotonically non-decreasing.',
});

export default fixture;
