/**
 * Infeasible case (per constitution Principle IV).
 *
 * $500k portfolio, $80k/yr spend, $0 contributions, retiring "now" at 45.
 * At 16% withdrawal rate (80k/500k) the money runs out in ~8-10 years well
 * before endAge. The solver MUST NOT silently round this away; it MUST
 * surface `feasible: false` with `deficitReal > 0` and let the banner
 * trigger (FR-004, FR-013).
 *
 * Complex fixture — numeric expected values locked during T037 (withdrawal)
 * and T038 (lifecycle) TDD cycles. Qualitative invariants in `notes`.
 *
 * @typedef {import('./types.js').FixtureCase} FixtureCase
 */

/** @type {FixtureCase} */
const fixture = Object.freeze({
  name: 'infeasible — single age 45, $500k portfolio, $80k spend, $0 contributions',
  kind: 'unit',
  inputs: Object.freeze({
    currentAgePrimary: 45,
    endAge: 95,

    portfolioPrimary: Object.freeze({
      trad401kReal: 200_000,
      rothIraReal: 100_000,
      taxableStocksReal: 150_000,
      cashReal: 50_000,
      annualContributionReal: 0,
    }),

    annualSpendReal: 80_000,
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
    feasible: false,
    // Representative deficit from the first infeasible lifecycle year
    // (retire-at-45 simulation). Locked 2026-04-19 in T046. The lifecycle
    // test asserts deficitReal > 0 on every infeasible record; this value
    // documents the first-year shortfall specifically.
    deficitReal: 34_194.875,
    deficitSignInvariant: 'deficitReal > 0',
    shortfallYearApprox: 'within 10-15y of retirement start (qualitative)',
    // Solver behavior note: with $500k + 5% real return + SS at 67, the solver
    // actually FINDS a feasible age (~65) by delaying retirement. This fixture
    // intentionally tests the retire-NOW-at-45 lifecycle via
    // runLifecycle({fireAge: currentAgePrimary}), not the solver — so the
    // fireAge/yearsToFire solver fields are not locked here.
  }),
  notes:
    'feasible must be false when retiring at currentAgePrimary=45; deficitReal > 0 ' +
    'by the time lifecycle runs out of taxable+cash pools (~year 4-5 at the ' +
    'listed withdrawal rate). deficitReal locked 2026-04-19 in T046 ' +
    '(lifecycle.js TDD cycle) as the first-infeasible-year shortfall value. ' +
    'Note: the solver (fireCalculator) does find a feasible retirement age ' +
    '(~65) for these inputs by delaying retirement and letting the portfolio ' +
    'grow; this fixture is scoped to LIFECYCLE infeasibility when retiring ' +
    'at currentAgePrimary, not to solver infeasibility.',
});

export default fixture;
