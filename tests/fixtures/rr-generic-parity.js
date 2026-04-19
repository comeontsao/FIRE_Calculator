/**
 * Canonical two-person household parity fixture (per constitution Principle I).
 *
 * Both people age 43, combined $800k portfolio, $72k/yr spend, $40k/yr
 * combined contributions. Drives `tests/parity/rr-vs-generic.test.js`: the
 * same inputs are run through RR's PersonalData adapter path and Generic's
 * direct pipeline; every FireSolverResult field must be byte-identical
 * EXCEPT those listed in `divergent` (where legitimate personal-data
 * divergence is expected — here, Roger's actual SS earnings vs Generic's
 * generic SS curve).
 *
 * @typedef {import('./types.js').FixtureCase} FixtureCase
 */

/** @type {FixtureCase} */
const fixture = Object.freeze({
  name: 'RR/Generic parity — couple age 43, $800k portfolio, $72k spend',
  kind: 'parity',
  inputs: Object.freeze({
    currentAgePrimary: 43,
    currentAgeSecondary: 43,
    endAge: 90,

    portfolioPrimary: Object.freeze({
      trad401kReal: 250_000,
      rothIraReal: 100_000,
      taxableStocksReal: 120_000,
      cashReal: 30_000,
      annualContributionReal: 25_000,
    }),
    portfolioSecondary: Object.freeze({
      trad401kReal: 150_000,
      rothIraReal: 80_000,
      taxableStocksReal: 50_000,
      cashReal: 20_000,
      annualContributionReal: 15_000,
    }),

    annualSpendReal: 72_000,
    returnRateReal: 0.05,
    returnRateCashReal: 0.01,
    inflationRate: 0.03,

    tax: Object.freeze({
      ordinaryBrackets: Object.freeze([
        Object.freeze({ threshold: 0, rate: 0.10 }),
        Object.freeze({ threshold: 23_200, rate: 0.12 }),
        Object.freeze({ threshold: 94_300, rate: 0.22 }),
        Object.freeze({ threshold: 201_050, rate: 0.24 }),
      ]),
      ltcgBrackets: Object.freeze([
        Object.freeze({ threshold: 0, rate: 0.00 }),
        Object.freeze({ threshold: 94_050, rate: 0.15 }),
        Object.freeze({ threshold: 583_750, rate: 0.20 }),
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
    ssStartAgeSecondary: 67,
  }),
  expected: Object.freeze({}), // parity test compares both paths pointwise
  divergent: Object.freeze([
    // RR injects Roger's actual earnings history; Generic uses the generic SS curve.
    // That is expected to produce different SS projections at the SS age — and
    // different lifecycle balances in ssActive years. The divergent list is the
    // explicit allow-list of field paths that may legitimately differ.
    'ssPrimary.annualEarningsNominal',
  ]),
  notes:
    'Parity fixture. tests/parity/rr-vs-generic.test.js loads this file, runs ' +
    'the inputs through both RR (via applyPersonalData) and Generic (direct), ' +
    'and asserts every FireSolverResult field is byte-identical EXCEPT the ' +
    'fields listed in `divergent`. Any unexpected divergence is a Principle I ' +
    'violation and a test failure. When secondary-person portfolio is doubled, ' +
    'yearsToFire must shift (SC-005 — confirms Generic solver uses secondary ' +
    'person; this sub-assertion lives in tests/unit/fireCalculator.test.js as ' +
    'an extension, not in the parity test itself).',
});

export default fixture;
