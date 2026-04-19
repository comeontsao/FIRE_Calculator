/**
 * Real-vs-nominal boundary discipline fixture (per data-model.md §9,
 * FR-017, contracts/lifecycle.contract.md).
 *
 * Purpose: deliberately supply a healthcare cost as a NOMINAL value with a
 * known inflation rate and horizon, so that lifecycle.js must route it
 * through inflation.toReal() at the module boundary before integrating it
 * into the year-indexed cost curve. If lifecycle silently treats the
 * nominal value as real, the test fails because the lifecycle record at
 * the horizon year shows a materially different number than the expected
 * real-dollar equivalent.
 *
 * Analytical math:
 *   inflationRate  = 0.03
 *   horizonYears   = 10
 *   nominalCost    = 10_000   (supplied to healthcare scenario as nominal)
 *   expectedReal   = 10_000 / 1.03^10 ≈ 7_440.939148967481
 *
 * The implementer wires lifecycle so that when a healthcare override is
 * supplied in nominal dollars, it is converted via `inflation.toReal(
 * nominalCost, baseYear + horizonYears)` before being subtracted from the
 * withdrawable income for that year. The expected real-dollar value is
 * what the lifecycle record's `healthcareCostReal` (or equivalent field
 * surfaced in the record) must match.
 *
 * Qualitative invariant (what the test checks even before exact values lock):
 * - lifecycle record at age (currentAgePrimary + horizonYears) includes
 *   a healthcare cost whose REAL value ≈ nominalCost / (1 + inflationRate)^horizonYears,
 *   NOT the nominal number itself.
 *
 * @typedef {import('./types.js').FixtureCase} FixtureCase
 */

const baseYear = 2026;
const inflationRate = 0.03;
const horizonYears = 10;
const currentAgePrimary = 50;
const horizonAge = currentAgePrimary + horizonYears; // 60
const nominalHealthcareCost = 10_000;
const expectedRealAtHorizon =
  nominalHealthcareCost / Math.pow(1 + inflationRate, horizonYears);

/** @type {FixtureCase} */
const fixture = Object.freeze({
  name: 'real-nominal-check — $10k nominal healthcare at 2026 → real at age 60',
  kind: 'unit',
  inputs: Object.freeze({
    currentAgePrimary,
    endAge: 95,

    portfolioPrimary: Object.freeze({
      trad401kReal: 500_000,
      rothIraReal: 200_000,
      taxableStocksReal: 800_000,
      cashReal: 100_000,
      annualContributionReal: 0,
    }),

    annualSpendReal: 50_000,
    returnRateReal: 0.05,
    returnRateCashReal: 0.01,
    inflationRate,
    baseYear,

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
      // Healthcare override deliberately supplied as NOMINAL dollars.
      // lifecycle.js MUST route this through inflation.toReal(nominal, year)
      // at the module boundary before subtracting from income.
      healthcareOverrideNominal: nominalHealthcareCost,
      healthcareOverrideNominalYear: baseYear + horizonYears,
    }),
    colleges: Object.freeze([]),
    ssStartAgePrimary: 67,
  }),
  expected: Object.freeze({
    horizonAge,
    horizonYear: baseYear + horizonYears,
    nominalHealthcareCost,
    // The load-bearing assertion. At age 60, real healthcare cost must equal
    // the discounted nominal. A silent real/nominal mix would show ~$10_000.
    expectedHealthcareRealAtHorizon: expectedRealAtHorizon,
    // Tolerance absorbs float arithmetic drift only.
    tolerance: 1e-6,
    realNominalDisciplineInvariant:
      'lifecycle record @ horizonAge: real healthcare cost ≈ nominal / (1+i)^years, NOT nominal',
  }),
  notes:
    'Deliberately mismatched numbers: nominal $10k at year 2036 should become real ' +
    '~$7441 at age 60. A lifecycle that silently treats nominal as real produces ' +
    '~$10k and fails this fixture visibly. Locks FR-017 at the lifecycle boundary.',
});

export default fixture;
