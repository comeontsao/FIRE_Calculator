/*
 * Unit tests for calc/shims.js — the Node-testable glue layer.
 *
 * Feature: 005-canonical-public-launch (FR-003).
 *
 * Signatures mirror the HTML call sites byte-for-byte (FR-002):
 *   - yearsToFIRE(inp, annualSpend)
 *   - findFireAgeNumerical(inp, annualSpend, mode)
 *   - _evaluateFeasibilityAtAge(inp, annualSpend, age, mode)
 *   - findMinAccessibleAtFireNumerical(inp, annualSpend, fireAge, mode)
 *
 * Strategy: stub `globalThis.window.getCanonicalInputs` (the first thing every
 * shim touches) to throw; invoke the shim; assert (a) returned value matches
 * documented fallback, (b) console.error was called exactly once, (c) first
 * arg of that call matches /^\[shim-name\] canonical threw:/.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  yearsToFIRE,
  findFireAgeNumerical,
  _evaluateFeasibilityAtAge,
  findMinAccessibleAtFireNumerical,
} from '../../calc/shims.js';

// Helper: capture console.error calls and restore on cleanup.
function captureConsoleError() {
  const calls = [];
  const originalError = console.error;
  console.error = (...args) => calls.push(args);
  return {
    calls,
    restore: () => { console.error = originalError; },
  };
}

// Helper: stub a named canonical fn on window to throw; return teardown.
// Supports stubbing multiple function names in a single call by passing an
// array. Stubbing `getCanonicalInputs` is the cleanest universal stub point
// since every shim goes through `_toCanonical` first.
function stubWindowToThrow(fnNames) {
  const names = Array.isArray(fnNames) ? fnNames : [fnNames];
  const prev = globalThis.window;
  const stubs = {};
  for (const name of names) {
    stubs[name] = () => { throw new Error(`${name} test-throw`); };
  }
  globalThis.window = {
    ...(prev ?? {}),
    ...stubs,
  };
  return () => {
    if (prev === undefined) { delete globalThis.window; }
    else { globalThis.window = prev; }
  };
}

// Minimal valid inline-shape `inp` — only needed so the shim has SOMETHING
// to pass to canonical helpers before the stubbed throw fires. The content is
// irrelevant to the fallback behavior; the test's point is that whatever
// canonical fn throws, the shim catches and returns the documented fallback.
const MINIMAL_INP = Object.freeze({
  ageRoger: 35,
  annualIncome: 100_000,
  monthlySavings: 1_000,
  returnRate: 0.07,
  inflationRate: 0.03,
  selectedScenario: 'us',
  fireMode: 'safe',
  endAge: 95,
  ssClaimAge: 67,
  bufferUnlock: 2,
  bufferSS: 3,
});

const ANNUAL_SPEND = 40_000;

// ---------------------------------------------------------------------------
// T010 — yearsToFIRE(inp, annualSpend)
// ---------------------------------------------------------------------------

test('yearsToFIRE returns NaN and logs [yearsToFIRE] prefix when canonical throws', () => {
  // Stub getCanonicalInputs — every shim hits `_toCanonical` first, so a throw
  // here fires before any downstream canonical helper is touched.
  const teardown = stubWindowToThrow('getCanonicalInputs');
  const spy = captureConsoleError();
  try {
    const result = yearsToFIRE(MINIMAL_INP, ANNUAL_SPEND);
    assert.ok(
      Number.isNaN(result),
      `yearsToFIRE should return NaN on canonical throw; got ${JSON.stringify(result)}`,
    );
    assert.equal(
      spy.calls.length,
      1,
      `console.error should be called exactly once; got ${spy.calls.length} calls`,
    );
    assert.match(
      spy.calls[0][0],
      /^\[yearsToFIRE\] canonical threw:/,
      `first console.error arg should match prefix; got ${JSON.stringify(spy.calls[0][0])}`,
    );
  } finally {
    spy.restore();
    teardown();
  }
});

// ---------------------------------------------------------------------------
// T011 — findFireAgeNumerical(inp, annualSpend, mode)
// ---------------------------------------------------------------------------

test('findFireAgeNumerical returns {years:NaN, months:NaN, endBalance:NaN, sim:[], feasible:false} and logs [findFireAgeNumerical] prefix when canonical throws', () => {
  const teardown = stubWindowToThrow('getCanonicalInputs');
  const spy = captureConsoleError();
  try {
    const result = findFireAgeNumerical(MINIMAL_INP, ANNUAL_SPEND, 'safe');
    // Shape check — cannot deepEqual NaN directly; inspect each field.
    assert.ok(result && typeof result === 'object', 'result should be an object');
    assert.ok(Number.isNaN(result.years), `years should be NaN; got ${result.years}`);
    assert.ok(Number.isNaN(result.months), `months should be NaN; got ${result.months}`);
    assert.ok(Number.isNaN(result.endBalance), `endBalance should be NaN; got ${result.endBalance}`);
    assert.deepEqual(result.sim, [], `sim should be []; got ${JSON.stringify(result.sim)}`);
    assert.equal(result.feasible, false, `feasible should be false; got ${result.feasible}`);

    assert.equal(
      spy.calls.length,
      1,
      `console.error should be called exactly once; got ${spy.calls.length} calls`,
    );
    assert.match(
      spy.calls[0][0],
      /^\[findFireAgeNumerical\] canonical threw:/,
      `first console.error arg should match prefix; got ${JSON.stringify(spy.calls[0][0])}`,
    );
  } finally {
    spy.restore();
    teardown();
  }
});

// ---------------------------------------------------------------------------
// T012 — _evaluateFeasibilityAtAge(inp, annualSpend, age, mode)
// ---------------------------------------------------------------------------

test('_evaluateFeasibilityAtAge returns false and logs [_evaluateFeasibilityAtAge] prefix when canonical throws', () => {
  const teardown = stubWindowToThrow('getCanonicalInputs');
  const spy = captureConsoleError();
  try {
    const result = _evaluateFeasibilityAtAge(MINIMAL_INP, ANNUAL_SPEND, 65, 'safe');
    assert.equal(result, false, `result should be false; got ${result}`);
    assert.equal(
      spy.calls.length,
      1,
      `console.error should be called exactly once; got ${spy.calls.length} calls`,
    );
    assert.match(
      spy.calls[0][0],
      /^\[_evaluateFeasibilityAtAge\] canonical threw:/,
      `first console.error arg should match prefix; got ${JSON.stringify(spy.calls[0][0])}`,
    );
  } finally {
    spy.restore();
    teardown();
  }
});

// ---------------------------------------------------------------------------
// T013 — findMinAccessibleAtFireNumerical(inp, annualSpend, fireAge, mode)
// ---------------------------------------------------------------------------

test('findMinAccessibleAtFireNumerical returns NaN and logs [findMinAccessibleAtFireNumerical] prefix when canonical throws', () => {
  const teardown = stubWindowToThrow('getCanonicalInputs');
  const spy = captureConsoleError();
  try {
    const result = findMinAccessibleAtFireNumerical(MINIMAL_INP, ANNUAL_SPEND, 65, 'safe');
    assert.ok(
      Number.isNaN(result),
      `findMinAccessibleAtFireNumerical should return NaN on canonical throw; got ${JSON.stringify(result)}`,
    );
    assert.equal(
      spy.calls.length,
      1,
      `console.error should be called exactly once; got ${spy.calls.length} calls`,
    );
    assert.match(
      spy.calls[0][0],
      /^\[findMinAccessibleAtFireNumerical\] canonical threw:/,
      `first console.error arg should match prefix; got ${JSON.stringify(spy.calls[0][0])}`,
    );
  } finally {
    spy.restore();
    teardown();
  }
});
