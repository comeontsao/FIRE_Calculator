/*
 * Feature 028 — US3 crossValidationWarnings extension.
 *
 * Verifies that the `endBalance-mismatch` entry in the audit dump's
 * crossValidationWarnings array carries the new diagnostic fields:
 *   activeStrategyId, mode, chartEndBalance, signedEndBalance
 * (in addition to back-compat valueA, valueB, delta, deltaPct, expected,
 * reason, dualBarSeries).
 *
 * Tests use calc/calcAudit.js's _invariantA via the public buildAuditSnapshot
 * entry point with mocked sim/chart inputs to force a divergence.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const calcAudit = require('../../calc/calcAudit.js');

// Minimal options shape for buildAuditSnapshot. We provide only what the
// invariant pipeline reads; everything else is best-effort.
function makeOptions(overrides) {
  const baseInputs = {
    ageRoger: 42,
    agePerson1: 42,
    endAge: 100,
    annualSpend: 73400,
    bufferUnlock: 1,
    bufferSS: 1,
    terminalBuffer: 1,
    safetyMargin: 0.05,
    inflationRate: 0.04,
    returnRate: 0.07,
    return401k: 0.07,
    irmaaThreshold: 212000,
    ssClaimAge: 70,
    ssCOLARate: 0.03,
    rule55: { enabled: false, separationAge: 54 },
    contrib401kTrad: 23500,
    contrib401kRoth: 0,
    empMatch: 7200,
    monthlySavings: 2000,
    annualIncome: 152000,
    raiseRate: 0.025,
    taxTrad: 0.12,
    stockGainPct: 0.6,
    roger401kTrad: 27659,
    roger401kRoth: 64737,
    rogerStocks: 235000,
    rebeccaStocks: 230000,
    cashSavings: 80000,
    otherAssets: 0,
  };
  return Object.assign({
    inputs: baseInputs,
    annualSpend: 73400,
    rawAnnualSpend: 73400,
    effectiveSpendByYear: [],
    fireAge: 53,
    fireMode: 'dieWithZero',
    objective: 'leave-more-behind',
    fireAgeCandidates: [],
    t: (key) => key, // i18n stub
    doc: null,
    getActiveChartStrategyOptions: () => ({ strategyOverride: 'aggressive-bracket-fill', thetaOverride: null }),
    // The harness needs these helpers for invariants to fire.
    signedLifecycleEndBalance: () => ({ endBalance: -50000, minBalancePhase1: 100000, minBalancePhase2: 200000, minBalancePhase3: 300000, balanceAtFire: 1000000 }),
    projectFullLifecycle: () => [
      { age: 53, total: 1000000, hasShortfall: false },
      { age: 100, total: 100000, hasShortfall: false },
    ],
    isFireAgeFeasible: () => true,
    accumulateToFire: () => ({ end: { pTrad: 521097, pRoth: 0, pStocks: 902336, pCash: 81098 } }),
    findEarliestFeasibleAge: () => ({ feasible: true, years: 53, months: 0, totalMonths: 53 * 12, searchMethod: 'integer-year' }),
    resolveAccumulationOptions: () => ({}),
    lastStrategyResults: {
      winnerId: 'aggressive-bracket-fill',
      rows: [
        { strategyId: 'aggressive-bracket-fill', isWinner: true, chosenTheta: null, endBalance: 100000, feasibleUnderCurrentMode: true, hasShortfall: false },
        { strategyId: 'bracket-fill-smoothed', isWinner: false, chosenTheta: null, endBalance: 50000, feasibleUnderCurrentMode: true, hasShortfall: false },
      ],
    },
    activeStrategyId: 'aggressive-bracket-fill',
  }, overrides);
}

test('endBalance-mismatch entry includes activeStrategyId, mode, chartEndBalance, signedEndBalance', () => {
  // Force a large divergence: signed-sim says -50k, chart says 100k.
  const options = makeOptions({
    signedLifecycleEndBalance: () => ({
      endBalance: -50000,
      minBalancePhase1: 100000,
      minBalancePhase2: 200000,
      minBalancePhase3: 300000,
      balanceAtFire: 1000000,
    }),
    projectFullLifecycle: () => [
      { age: 53, total: 1000000, hasShortfall: false },
      { age: 100, total: 100000, hasShortfall: false },
    ],
  });

  const snap = calcAudit.assembleAuditSnapshot(options);
  const warnings = (snap && snap.crossValidationWarnings) || [];
  const mismatch = warnings.find((w) => w.kind === 'endBalance-mismatch');

  assert.ok(mismatch, 'expected endBalance-mismatch entry to be emitted with forced divergence');
  // Back-compat fields (preserved):
  assert.ok('valueA' in mismatch, 'valueA preserved');
  assert.ok('valueB' in mismatch, 'valueB preserved');
  assert.ok('delta' in mismatch, 'delta preserved');
  assert.ok('expected' in mismatch, 'expected preserved');
  assert.ok('reason' in mismatch, 'reason preserved');
  // New diagnostic fields (FR-010):
  assert.strictEqual(mismatch.activeStrategyId, 'aggressive-bracket-fill',
    'activeStrategyId field must reflect the active winner');
  assert.strictEqual(mismatch.mode, 'dieWithZero',
    'mode field must reflect the current FIRE mode');
  assert.strictEqual(typeof mismatch.chartEndBalance, 'number',
    'chartEndBalance must be a number (alias for valueB)');
  assert.strictEqual(typeof mismatch.signedEndBalance, 'number',
    'signedEndBalance must be a number (alias for valueA)');
  assert.strictEqual(mismatch.chartEndBalance, mismatch.valueB,
    'chartEndBalance is semantic alias for valueB');
  assert.strictEqual(mismatch.signedEndBalance, mismatch.valueA,
    'signedEndBalance is semantic alias for valueA');
});

test('endBalance-mismatch is suppressed when sims agree (post-fix expectation)', () => {
  // After feature 028 US2 the signed sim threads strategy options, so under
  // the same strategy both sims should agree → no mismatch warning emitted.
  // We simulate this by having signed-sim and chart-sim return the same
  // end balance.
  const options = makeOptions({
    signedLifecycleEndBalance: () => ({ endBalance: 100000, minBalancePhase1: 100000, minBalancePhase2: 200000, minBalancePhase3: 300000, balanceAtFire: 1000000 }),
    projectFullLifecycle: () => [
      { age: 53, total: 1000000, hasShortfall: false },
      { age: 100, total: 100000, hasShortfall: false },
    ],
  });
  const snap = calcAudit.assembleAuditSnapshot(options);
  const warnings = (snap && snap.crossValidationWarnings) || [];
  const mismatches = warnings.filter((w) => w.kind === 'endBalance-mismatch');
  assert.strictEqual(mismatches.length, 0,
    'when signed-sim and chart-sim agree on end balance, no mismatch warning should fire');
});
