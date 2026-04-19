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
    yearsToFire: 'TBD_LOCK_IN_T038',
    fireAge: 'TBD_LOCK_IN_T038',
    feasible: 'TBD_LOCK_IN_T038',
    endBalanceReal: 'TBD_LOCK_IN_T038',
    balanceAtUnlockReal: 'TBD_LOCK_IN_T038',
    balanceAtSSReal: 'TBD_LOCK_IN_T038',
    lifecycleCheckpoints: Object.freeze([
      Object.freeze({ age: 55, totalReal: 'TBD_LOCK_IN_T038', tolerance: 0.02 }),
      Object.freeze({ age: 62, totalReal: 'TBD_LOCK_IN_T038', tolerance: 0.02 }),
      Object.freeze({ age: 85, totalReal: 'TBD_LOCK_IN_T038', tolerance: 0.02 }),
    ]),
  }),
  notes:
    'Complex fixture — expected values are placeholders. Locks the phase transitions ' +
    'at 59.5 (401(k) unlock) and 67 (SS start). Qualitative invariants until T038: ' +
    '(a) feasible must be true at solver-found fireAge; ' +
    '(b) lifecycle must transit accumulation → preUnlock at fireAge, ' +
    'preUnlock → unlocked at age 60 (59.5 rounded), unlocked → ssActive at 67; ' +
    '(c) ssIncomeReal > 0 only in ssActive years; ' +
    '(d) withdrawalReal > 0 only in retirement phases, contributionReal > 0 only ' +
    'in accumulation; ' +
    '(e) totalReal monotonically non-decreasing through accumulation. ' +
    'Expected numeric values locked during T038 TDD cycle when lifecycle.js is ' +
    'implemented and tested — its output becomes the ground truth for this case.',
});

export default fixture;
