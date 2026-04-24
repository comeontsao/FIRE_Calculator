/*
 * tests/unit/adultCountPersist.test.js — feature 009 T016.
 *
 * Round-trip test for the clamp-and-default behavior applied to adultCount
 * in FIRE-Dashboard-Generic.html getInputs() (ref
 *   specs/009-single-person-mode/contracts/persistence.contract.md §7
 *   specs/009-single-person-mode/contracts/calc-functions.contract.md §9).
 *
 * The logic under test is a pure read-and-clamp; no DOM is required. We mirror
 * the clamp expression verbatim so the contract is pinned independent of the
 * HTML file's current line number.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// Mirror of FIRE-Dashboard-Generic.html getInputs() adultCount read.
// Input is the raw string value (or undefined) from the hidden #adultCount
// element. Output is an integer clamped to [1, 2] with default 2.
function readAdultCount(rawValue) {
  const raw = parseInt(rawValue, 10);
  return Math.max(1, Math.min(2, Number.isInteger(raw) ? raw : 2));
}

test('adultCount persist — restores 1 byte-for-byte', () => {
  assert.equal(readAdultCount('1'), 1);
});

test('adultCount persist — restores 2', () => {
  assert.equal(readAdultCount('2'), 2);
});

test('adultCount persist — missing value defaults to 2', () => {
  assert.equal(readAdultCount(undefined), 2);
});

test('adultCount persist — out-of-range 0 clamps to 1', () => {
  assert.equal(readAdultCount('0'), 1);
});

test('adultCount persist — out-of-range 5 clamps to 2', () => {
  assert.equal(readAdultCount('5'), 2);
});

test('adultCount persist — non-numeric "abc" defaults to 2', () => {
  assert.equal(readAdultCount('abc'), 2);
});

test('adultCount persist — empty string defaults to 2', () => {
  assert.equal(readAdultCount(''), 2);
});

test('adultCount persist — negative "-3" clamps to 1', () => {
  assert.equal(readAdultCount('-3'), 1);
});
