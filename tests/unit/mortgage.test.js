/*
 * tests/unit/mortgage.test.js — locks the calc/mortgage.js contract (T035).
 *
 * Covers the two fixture classes from
 *   specs/001-modular-calc-engine/contracts/mortgage.contract.md §Fixtures:
 *     1. 30-year fixed, $500k principal, 3% real rate — standard amortization.
 *     2. Same loan + $500/mo extra principal — reduced payoff year.
 *
 * RED phase: calc/mortgage.js does not yet exist. The import below will
 * fail with ERR_MODULE_NOT_FOUND — expected until T043.
 *
 * Contract invariants (mortgage.contract.md §Invariants):
 *   - Standard amortization math — balance monotonically decreases.
 *   - `perYear.length === payoffYear - startYear + 1`.
 *   - All values in real dollars.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMortgage } from '../../calc/mortgage.js';

const BASE_LOAN = Object.freeze({
  principalReal: 500_000,
  annualRateReal: 0.03,
  termYears: 30,
  startAge: 45,
  extraPaymentReal: 0,
});

test('mortgage: 30-year fixed $500k @ 3% real produces standard amortization', () => {
  const result = computeMortgage(BASE_LOAN);

  assert.equal(typeof result, 'object');
  assert.ok(Array.isArray(result.perYear), 'perYear is an array');
  assert.ok(result.perYear.length > 0, 'perYear has entries');

  // Structural invariants from contract.
  assert.equal(typeof result.payoffYear, 'number');
  assert.equal(typeof result.totalInterestPaidReal, 'number');
  assert.ok(result.totalInterestPaidReal > 0, 'total interest on a 3% 30y loan must be > 0');

  // Balance monotonically decreases.
  for (let i = 1; i < result.perYear.length; i++) {
    const prev = result.perYear[i - 1];
    const curr = result.perYear[i];
    assert.ok(
      curr.balanceRemainingReal <= prev.balanceRemainingReal + 1e-6,
      `balance must be monotonically decreasing at year index ${i}: prev=${prev.balanceRemainingReal}, curr=${curr.balanceRemainingReal}`,
    );
  }

  // Final year must drive the balance to (approximately) zero.
  const last = result.perYear[result.perYear.length - 1];
  assert.ok(
    Math.abs(last.balanceRemainingReal) < 1,
    `final balance must be ≈ 0, got ${last.balanceRemainingReal}`,
  );

  // With no extra payments, payoff happens on schedule at termYears.
  const expectedYears = BASE_LOAN.termYears;
  assert.ok(
    Math.abs(result.perYear.length - expectedYears) <= 1,
    `standard amortization ⇒ perYear length ≈ termYears (${expectedYears}), got ${result.perYear.length}`,
  );
});

test('mortgage: $500/mo extra principal reduces payoff year', () => {
  const baseline = computeMortgage(BASE_LOAN);
  const accelerated = computeMortgage({
    ...BASE_LOAN,
    extraPaymentReal: 6_000, // $500/mo × 12
  });

  assert.ok(
    accelerated.payoffYear < baseline.payoffYear,
    `extra-payment must bring payoffYear earlier: baseline=${baseline.payoffYear}, accelerated=${accelerated.payoffYear}`,
  );
  assert.ok(
    accelerated.totalInterestPaidReal < baseline.totalInterestPaidReal,
    `accelerated payoff must pay less total interest: baseline=${baseline.totalInterestPaidReal}, accelerated=${accelerated.totalInterestPaidReal}`,
  );
  assert.ok(
    accelerated.perYear.length < baseline.perYear.length,
    `accelerated schedule must be shorter than baseline`,
  );
});
