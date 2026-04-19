/*
 * tests/unit/tax.test.js — locks the calc/tax.js contract (T032).
 *
 * Covers the three fixture classes enumerated in
 *   specs/001-modular-calc-engine/contracts/tax.contract.md §Fixtures:
 *     1. Bracket-boundary — income exactly at a bracket threshold.
 *     2. LTCG 0% bracket — LTCG within the zero-rate bracket.
 *     3. Empty case — all zeros.
 *
 * RED phase: calc/tax.js does not yet exist. The import below will fail
 * with ERR_MODULE_NOT_FOUND. That is the expected state until T040.
 *
 * Contract-locked invariants (tax.contract.md §Invariants):
 *   - Marginal brackets used correctly (not a single effective rate).
 *   - totalOwedReal === ordinaryOwedReal + ltcgOwedReal.
 *   - All zeros in ⇒ all zeros out with effectiveRate: 0.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTax } from '../../calc/tax.js';

// Canonical single-filer brackets used across the fixture suite.
const brackets = Object.freeze({
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
});

test('tax: bracket-boundary — marginal bracket arithmetic (not a single effective rate)', () => {
  // Income placed exactly at the top of the 12% bracket threshold ($47_150).
  // Analytical tax (single-filer marginal):
  //   first $11_600 @ 10% = $1_160
  //   next $35_550 @ 12%  = $4_266
  //   total ordinary = $5_426
  const result = computeTax({
    ordinaryIncomeReal: 47_150,
    ltcgIncomeReal: 0,
    age: 40,
    tax: brackets,
  });

  assert.equal(typeof result, 'object', 'returns an object');
  assert.equal(typeof result.ordinaryOwedReal, 'number');
  assert.equal(typeof result.ltcgOwedReal, 'number');
  assert.equal(typeof result.totalOwedReal, 'number');
  assert.equal(typeof result.effectiveRate, 'number');

  // Marginal arithmetic — NOT a flat 12% on $47_150 (which would be $5_658).
  assert.ok(
    Math.abs(result.ordinaryOwedReal - 5_426) < 1e-6,
    `expected ordinaryOwed ≈ 5426, got ${result.ordinaryOwedReal}`,
  );
  assert.equal(result.ltcgOwedReal, 0, 'no LTCG income ⇒ zero LTCG tax');
  assert.ok(
    Math.abs(result.totalOwedReal - (result.ordinaryOwedReal + result.ltcgOwedReal)) < 1e-9,
    'totalOwedReal === ordinaryOwedReal + ltcgOwedReal (contract invariant)',
  );
});

test('tax: LTCG 0% bracket — LTCG within zero-rate bracket produces zero LTCG tax', () => {
  // $40_000 LTCG, zero ordinary. $40k is below the $47_025 0%-bracket ceiling.
  const result = computeTax({
    ordinaryIncomeReal: 0,
    ltcgIncomeReal: 40_000,
    age: 40,
    tax: brackets,
  });

  assert.equal(result.ltcgOwedReal, 0, 'LTCG within 0% bracket ⇒ zero LTCG tax');
  assert.ok(
    Math.abs(result.totalOwedReal - (result.ordinaryOwedReal + result.ltcgOwedReal)) < 1e-9,
    'sum invariant',
  );
});

test('tax: empty case — all zeros in ⇒ all zeros out with effectiveRate 0', () => {
  const result = computeTax({
    ordinaryIncomeReal: 0,
    ltcgIncomeReal: 0,
    age: 40,
    tax: brackets,
  });

  assert.equal(result.ordinaryOwedReal, 0);
  assert.equal(result.ltcgOwedReal, 0);
  assert.equal(result.totalOwedReal, 0);
  assert.equal(result.effectiveRate, 0, 'zero income ⇒ effectiveRate 0 (no division-by-zero)');
});
