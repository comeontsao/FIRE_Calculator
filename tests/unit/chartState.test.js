/*
 * tests/unit/chartState.test.js — locks the chartState contract (T017).
 *
 * Covers the seven scenarios enumerated in
 *   specs/001-modular-calc-engine/contracts/chartState.contract.md
 *   §"Fixtures that lock this module".
 *
 * Each test exercises a single observable behavior. Tests follow the
 * Arrange / Act / Assert pattern. No mocks — chartState is a pure module
 * under Principle II, so we drive it directly.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
// Feature 015 follow-up — chartState.js converted from ES module to UMD-style
// classic script (so it loads under file:// without CORS errors). Use
// createRequire to import the CommonJS export.
const require = createRequire(import.meta.url);
const { chartState } = require('../../calc/chartState.js');

/**
 * The module under test exposes a singleton. To keep tests independent we
 * reset its observable state at the start of every test by clearing any
 * override and applying a known-good calculated baseline. This is a test-
 * only concern; production code never needs to "reset" because each
 * setCalculated call atomically wipes overrides anyway.
 *
 * NOTE: we attach listeners AFTER the reset so reset notifications never
 * leak into per-test event counts.
 */
function resetChartState() {
  chartState.clearOverride();
  chartState.setCalculated(0, true);
}

test('chartState: setCalculated emits one change event with calculated source', () => {
  resetChartState();
  /** @type {object[]} */
  const seen = [];
  const unsubscribe = chartState.onChange((s) => seen.push(s));

  chartState.setCalculated(50, true);

  assert.equal(seen.length, 1, 'listener should fire exactly once');
  assert.equal(seen[0].calculatedFireAge, 50);
  assert.equal(seen[0].overrideFireAge, null);
  assert.equal(seen[0].effectiveFireAge, 50);
  assert.equal(seen[0].source, 'calculated');
  assert.equal(seen[0].feasible, true);

  unsubscribe();
});

test('chartState: setOverride switches source to override and updates effective age', () => {
  resetChartState();
  chartState.setCalculated(50, true);
  /** @type {object[]} */
  const seen = [];
  const unsubscribe = chartState.onChange((s) => seen.push(s));

  chartState.setOverride(45);

  assert.equal(seen.length, 1);
  assert.equal(seen[0].calculatedFireAge, 50);
  assert.equal(seen[0].overrideFireAge, 45);
  assert.equal(seen[0].effectiveFireAge, 45);
  assert.equal(seen[0].source, 'override');

  unsubscribe();
});

test('chartState: setCalculated wipes any active override (FR-014)', () => {
  resetChartState();
  chartState.setCalculated(50, true);
  chartState.setOverride(45);

  /** @type {object[]} */
  const seen = [];
  const unsubscribe = chartState.onChange((s) => seen.push(s));

  chartState.setCalculated(51, true);

  assert.equal(seen.length, 1, 'listener should fire exactly once');
  assert.equal(seen[0].calculatedFireAge, 51);
  assert.equal(seen[0].overrideFireAge, null, 'override must be wiped');
  assert.equal(seen[0].effectiveFireAge, 51);
  assert.equal(seen[0].source, 'calculated');
  assert.equal(seen[0].feasible, true);

  unsubscribe();
});

test('chartState: clearOverride returns to calculated source', () => {
  resetChartState();
  chartState.setCalculated(50, true);
  chartState.setOverride(45);

  /** @type {object[]} */
  const seen = [];
  const unsubscribe = chartState.onChange((s) => seen.push(s));

  chartState.clearOverride();

  assert.equal(seen.length, 1);
  assert.equal(seen[0].calculatedFireAge, 50);
  assert.equal(seen[0].overrideFireAge, null);
  assert.equal(seen[0].effectiveFireAge, 50);
  assert.equal(seen[0].source, 'calculated');

  unsubscribe();
});

test('chartState: unsubscribe detaches listener (no further notifications)', () => {
  resetChartState();
  chartState.setCalculated(50, true);

  let callCount = 0;
  const unsubscribe = chartState.onChange(() => {
    callCount += 1;
  });

  chartState.setCalculated(51, true);
  assert.equal(callCount, 1, 'listener should have fired once before unsubscribe');

  unsubscribe();

  chartState.setCalculated(52, true);
  chartState.setOverride(40);
  chartState.clearOverride();

  assert.equal(callCount, 1, 'listener must not fire after unsubscribe');
});

test('chartState: revalidateFeasibilityAt preserves override and only updates feasible (FR-015)', () => {
  resetChartState();
  chartState.setCalculated(50, true);
  chartState.setOverride(45);

  /** @type {object[]} */
  const seen = [];
  const unsubscribe = chartState.onChange((s) => seen.push(s));

  chartState.revalidateFeasibilityAt(45, false);

  assert.equal(seen.length, 1, 'revalidateFeasibilityAt should fire once');
  const post = seen[0];
  assert.equal(post.calculatedFireAge, 50, 'calculatedFireAge must NOT change');
  assert.equal(post.overrideFireAge, 45, 'override must be preserved');
  assert.equal(post.effectiveFireAge, 45, 'effectiveFireAge must NOT change');
  assert.equal(post.source, 'override', 'source must remain override');
  assert.equal(post.feasible, false, 'feasible must reflect new evaluation');

  unsubscribe();
});

test('chartState: consecutive mutations produce two atomic, fully-consistent snapshots (SC-009)', () => {
  resetChartState();
  chartState.setCalculated(50, true);

  /** @type {object[]} */
  const seen = [];
  const unsubscribe = chartState.onChange((s) => {
    // Capture a defensive copy so any later "mutation" of internal state
    // would not retro-corrupt our recorded snapshot.
    seen.push({
      calculatedFireAge: s.calculatedFireAge,
      overrideFireAge: s.overrideFireAge,
      effectiveFireAge: s.effectiveFireAge,
      source: s.source,
      feasible: s.feasible,
    });
  });

  chartState.setOverride(45);
  chartState.setCalculated(51, true);

  assert.equal(seen.length, 2, 'two mutations must yield exactly two notifications');

  // Snapshot 1: setOverride(45)
  assert.deepEqual(seen[0], {
    calculatedFireAge: 50,
    overrideFireAge: 45,
    effectiveFireAge: 45,
    source: 'override',
    feasible: true,
  });

  // Snapshot 2: setCalculated(51, true) wipes the override atomically
  assert.deepEqual(seen[1], {
    calculatedFireAge: 51,
    overrideFireAge: null,
    effectiveFireAge: 51,
    source: 'calculated',
    feasible: true,
  });

  unsubscribe();
});
