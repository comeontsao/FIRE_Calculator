/**
 * Fixture cases for calc/inflation.js.
 *
 * Analytical fixture: values below are closed-form computed and locked here.
 * Any change to calc/inflation.js that shifts these values must update both
 * this file and the module in the same commit (Principle IV).
 *
 * @typedef {import('./types.js').FixtureCase} FixtureCase
 */

/**
 * Cases share:
 *   inflationRate = 0.03  (3% annual)
 *   baseYear      = 2026
 *
 * Expected sub-cases:
 *   identity            — amount at base year converts to itself.
 *   roundTrip           — toNominal(toReal(x, y), y) ≈ x for each tuple.
 *   threePercentTenYear — $100 real at 2026 → $100 * 1.03^10 nominal at 2036.
 */
const inflationRate = 0.03;
const baseYear = 2026;
const tolerance = 1e-9;

/** @type {FixtureCase} */
const fixture = Object.freeze({
  name: 'inflation — 3% base year 2026',
  kind: 'unit',
  inputs: Object.freeze({
    inflationRate,
    baseYear,
  }),
  expected: Object.freeze({
    identity: Object.freeze({
      year: 2026,
      amount: 100,
      realExpected: 100,
      nominalExpected: 100,
    }),
    roundTrip: Object.freeze({
      tolerance,
      pairs: Object.freeze([
        Object.freeze({ amount: 100, year: 2030 }),
        Object.freeze({ amount: 5000, year: 2026 }),
        Object.freeze({ amount: 250, year: 2050 }),
        Object.freeze({ amount: 1, year: 2020 }), // before base year
        Object.freeze({ amount: 42.42, year: 2075 }),
      ]),
    }),
    threePercentTenYear: Object.freeze({
      realAtBaseYear: 100,
      yearAtHorizon: 2036,
      // 100 * 1.03^10 = 134.39163793...
      nominalExpected: 100 * Math.pow(1.03, 10),
      tolerance,
    }),
  }),
  notes:
    'Identity, round-trip, and 10-year 3% compound inflation — all derivable ' +
    'from closed-form compound-interest formulas.',
});

export default fixture;
