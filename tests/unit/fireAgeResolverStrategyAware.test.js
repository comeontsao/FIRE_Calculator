/*
 * Feature 028 — US2 strategy-aware resolver wiring.
 *
 * The fire-age resolver (calc/fireAgeResolver.js) accepts injected `sim` and
 * `feas` helpers. The HTMLs' wrappers around findEarliestFeasibleAge MUST
 * thread the active strategy options into both injected helpers so the
 * resolver evaluates the strategy the chart renders.
 *
 * These tests use mocked `sim` and `feas` to verify:
 *   - The resolver passes options through unchanged.
 *   - When sim is mode-aware AND strategy-aware, the resolver returns the
 *     strategy-aware verdict (not the bracket-fill default).
 *   - When the active winner causes infeasibility under the user's mode,
 *     the resolver returns {feasible: false, years: -1, searchMethod: 'none'}.
 *
 * The actual HTML wrapper threading is verified structurally by separate
 * tests in this file (regex against the wrapper code), since the wrapper
 * lives inline and depends on getInputs/_lastStrategyResults globals that
 * a Node sandbox cannot easily replicate.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { findEarliestFeasibleAge } = require('../../calc/fireAgeResolver.js');

const HTML_PATHS = [
  { name: 'RR     ', file: path.join(__dirname, '..', '..', 'FIRE-Dashboard.html') },
  { name: 'Generic', file: path.join(__dirname, '..', '..', 'FIRE-Dashboard-Generic.html') },
];

// Common test inp covering both RR (ageRoger) and Generic (agePerson1).
function makeTestInp(currentAge, endAge) {
  return {
    ageRoger: currentAge,
    agePerson1: currentAge,
    endAge,
    ssClaimAge: 70,
    bufferUnlock: 1,
    bufferSS: 1,
    terminalBuffer: 1,
    safetyMargin: 0.05,
    inflationRate: 0.04,
    returnRate: 0.07,
    return401k: 0.07,
    irmaaThreshold: 212000,
  };
}

// Resolver smoke tests — confirm it correctly forwards strategy-aware
// behaviour from the injected sim+feas pair. We don't run the real sim here
// (that's covered structurally in signedSimStrategyOptions.test.js); we just
// verify the resolver returns whatever the injected helpers tell it.

test('resolver returns feasible:true when injected feas returns true at currentAge', () => {
  const inp = makeTestInp(42, 100);
  const sim = () => ({ endBalance: 1_000_000 });
  const feas = () => true; // always feasible
  const result = findEarliestFeasibleAge(inp, 'dieWithZero', {
    annualSpend: 73400,
    simulateRetirementOnlySigned: sim,
    isFireAgeFeasible: feas,
    pools: { pTrad: 521097, pRoth: 0, pStocks: 902336, pCash: 81098 },
  });
  assert.strictEqual(result.feasible, true);
  assert.strictEqual(result.years, 42, 'feasible at currentAge → return currentAge');
});

test('resolver returns feasible:false when injected feas always returns false (SC-027 scenario)', () => {
  // Simulates the SC-027 reproducer post-feature-028: when the resolver is
  // wired to the active strategy (aggressive-bracket-fill) under DWZ, it
  // can't find any feasible age — the strategy depletes by age 93 regardless
  // of fireAge candidate.
  const inp = makeTestInp(42, 100);
  const sim = () => ({ endBalance: -229755 });
  const feas = () => false;
  const result = findEarliestFeasibleAge(inp, 'dieWithZero', {
    annualSpend: 73400,
    simulateRetirementOnlySigned: sim,
    isFireAgeFeasible: feas,
    pools: { pTrad: 521097, pRoth: 0, pStocks: 902336, pCash: 81098 },
  });
  assert.strictEqual(result.feasible, false);
  assert.strictEqual(result.years, -1);
  assert.strictEqual(result.searchMethod, 'none');
});

test('resolver returns first feasible year from linear scan', () => {
  const inp = makeTestInp(42, 100);
  let probeCount = 0;
  // Mock: feasible only at age >= 53 (matches SC-027 fixture's bracket-fill verdict).
  const sim = (_inp, _spend, fireAge) => {
    probeCount++;
    return { endBalance: fireAge >= 53 ? 100_000 : -50_000 };
  };
  const feas = (s) => s.endBalance >= 0;
  const result = findEarliestFeasibleAge(inp, 'dieWithZero', {
    annualSpend: 73400,
    simulateRetirementOnlySigned: sim,
    isFireAgeFeasible: feas,
    pools: { pTrad: 521097, pRoth: 0, pStocks: 902336, pCash: 81098 },
  });
  assert.strictEqual(result.feasible, true);
  // Resolver returns either:
  //   - searchMethod='integer-year' with years=53 (Stage 1 only), OR
  //   - searchMethod='month-precision' with years=52 + months>0 (Stage 2 refinement).
  // Both are valid representations of "feasibility boundary between age 52 and 53".
  // We verify the totalMonths lands in the expected band [52*12, 53*12] inclusive.
  assert.ok(result.totalMonths >= 52 * 12 && result.totalMonths <= 53 * 12,
    `expected totalMonths in [624, 636]; got years=${result.years} months=${result.months} totalMonths=${result.totalMonths} method=${result.searchMethod}`);
  // Stage 1 scan ages 42..52 (11 probes), then 53 (12th, breaks).
  assert.ok(probeCount >= 12, `resolver should scan at least to age 53; ran ${probeCount} probes`);
});

// Structural tests — verify the inline HTML wrappers thread strategy options.

HTML_PATHS.forEach(({ name, file }) => {
  test(`${name}: wrapper around findEarliestFeasibleAge threads strategyOverride`, () => {
    const src = fs.readFileSync(file, 'utf8');
    // Find the actual call site (not the typeof check). The call passes
    // (inp, fireMode, {...}); we match that signature.
    const callRe = /findEarliestFeasibleAge\s*\(\s*inp\s*,\s*fireMode/;
    const callMatch = src.match(callRe);
    assert.ok(callMatch, 'findEarliestFeasibleAge(inp, fireMode, ...) call must exist in the HTML');
    const callIdx = callMatch.index;
    // Check the 1500-char window before the call for getActiveChartStrategyOptions threading.
    const start = Math.max(0, callIdx - 1500);
    const window = src.slice(start, callIdx);
    const readsActiveStrategy = /getActiveChartStrategyOptions\s*\(/.test(window);
    assert.ok(readsActiveStrategy,
      `${name}: findEarliestFeasibleAge call site must read getActiveChartStrategyOptions before invocation`);
    // The wrapper must construct a closure that injects strategy options into
    // simulateRetirementOnlySigned. Either it passes strategy options into the
    // simulateRetirementOnlySigned wrapper, or it does so via a closure variable
    // captured from getActiveChartStrategyOptions.
    const wrapsSim = /simulateRetirementOnlySigned\s*\([^)]*_resolverStrategyOpts|simulateRetirementOnlySigned\s*\([^)]*options\s*\)|function\s*\([^)]*\)\s*\{[\s\S]*?simulateRetirementOnlySigned/.test(window);
    assert.ok(wrapsSim,
      `${name}: simulateRetirementOnlySigned at call site must be wrapped to inject strategy options`);
  });
});
