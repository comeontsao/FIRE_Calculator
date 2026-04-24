/*
 * tests/unit/filingStatus.test.js — feature 009 T014.
 *
 * Locks the branch semantics of detectMFJ(inp) per
 *   specs/009-single-person-mode/contracts/calc-functions.contract.md §1
 *   specs/009-single-person-mode/research.md §10 item 1.
 *
 * detectMFJ is inline inside FIRE-Dashboard-Generic.html (not ES-module
 * importable). This test mirrors the function verbatim — the same pattern
 * used by other unit tests that shadow inline HTML helpers. When the HTML
 * implementation drifts, this mirror must be updated in lockstep.
 *
 * Primary signal: Number.isInteger(inp.adultCount) ? inp.adultCount === 2 : fallback.
 * Fallback: agePerson2 is a positive finite number.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { filingStatusFixtures } from '../fixtures/single-person-mode.js';

// Mirror of FIRE-Dashboard-Generic.html detectMFJ (feature 009 extension).
function detectMFJ(inp) {
  if (Number.isInteger(inp.adultCount)) return inp.adultCount === 2;
  const age2 = inp.agePerson2;
  return age2 != null && age2 > 0 && !isNaN(age2);
}

for (const fx of filingStatusFixtures) {
  test(`detectMFJ — ${fx.name}`, () => {
    assert.equal(detectMFJ(fx.inp), fx.expected);
  });
}
