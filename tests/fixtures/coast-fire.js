/**
 * Coast-FIRE edge case (per constitution Principle IV).
 *
 * 50-year-old with $3M already saved, $60k/yr spend, 5% real return.
 * At a 2% SWR (60k/3M), this is already well below the 4% SWR rule-of-thumb;
 * even zero further contributions leave the portfolio growing indefinitely.
 * The solver must return yearsToFire = 0.
 *
 * Analytical fixture for the core solver output. Lifecycle balance checkpoints
 * live as placeholders — they depend on tax/withdrawal details not yet
 * implemented.
 *
 * @typedef {import('./types.js').FixtureCase} FixtureCase
 */

/** @type {FixtureCase} */
const fixture = Object.freeze({
  name: 'coast-FIRE — single age 50, $3M portfolio, $60k spend',
  kind: 'unit',
  inputs: Object.freeze({
    currentAgePrimary: 50,
    endAge: 95,

    portfolioPrimary: Object.freeze({
      trad401kReal: 1_500_000,
      rothIraReal: 500_000,
      taxableStocksReal: 900_000,
      cashReal: 100_000,
      annualContributionReal: 0, // coast — no further contribs
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
    yearsToFire: 0,
    fireAge: 50,
    feasible: true,
    // Closed-form sanity: 3M at 5% for 45 years with zero contribs grows to
    // ~27M before withdrawals. 60k/yr spend is only 2% SWR. Coast.
    coastHeadroom: 'FV(3M, 5%, 45y) ≈ 27M >> 45y * 60k = 2.7M cumulative spend',
    lifecycleCheckpoints: Object.freeze([
      Object.freeze({ age: 95, totalReal: 'TBD_LOCK_IN_T038', tolerance: 0.05 }),
    ]),
  }),
  notes:
    'Analytical fixture for solver headline (yearsToFire / fireAge / feasible). ' +
    'Portfolio at endAge placeholder — depends on tax / withdrawal details ' +
    'locked in T038. The defining invariant is: zero contributions + $3M + 5% ' +
    'real return + $60k spend = solver finds FIRE immediately.',
});

export default fixture;
