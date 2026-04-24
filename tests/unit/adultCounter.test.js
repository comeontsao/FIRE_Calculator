/*
 * tests/unit/adultCounter.test.js — feature 009 T030.
 *
 * Locks changeAdultCount's clamp-to-[1,2] invariant per
 *   specs/009-single-person-mode/contracts/adult-count.contract.md §3
 *   specs/009-single-person-mode/research.md §10 item 4.
 *
 * changeAdultCount is inline in FIRE-Dashboard-Generic.html and touches the
 * DOM; we pull out just the arithmetic kernel here. A round-trip 2->1->2
 * test asserts the user can flip the counter without losing identity.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { adultCounterClampFixtures } from '../fixtures/single-person-mode.js';

// Mirrors changeAdultCount's clamp kernel in FIRE-Dashboard-Generic.html.
function clampAdultCount(current, delta) {
  return Math.max(1, Math.min(2, current + delta));
}

for (const fx of adultCounterClampFixtures) {
  test(`counter clamp — ${fx.name}`, () => {
    assert.equal(clampAdultCount(fx.current, fx.delta), fx.expected);
  });
}

test('counter clamp — round-trip 2->1->2->1->2 preserves identity', () => {
  let v = 2;
  v = clampAdultCount(v, -1); assert.equal(v, 1);
  v = clampAdultCount(v, +1); assert.equal(v, 2);
  v = clampAdultCount(v, -1); assert.equal(v, 1);
  v = clampAdultCount(v, +1); assert.equal(v, 2);
});

test('counter clamp — delta=0 is identity at both bounds', () => {
  assert.equal(clampAdultCount(1, 0), 1);
  assert.equal(clampAdultCount(2, 0), 2);
});
