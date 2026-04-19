/*
 * tests/unit/studentLoan.test.js — RED tests for the US2b studentLoan
 * contract (TB09).
 *
 * Covers the four fixture classes from
 *   specs/001-modular-calc-engine/contracts/studentLoan.contract.md §Fixtures:
 *     1. 10-year term, $50k principal, 4% real rate — analytical annual
 *        payment and total interest.
 *     2. Extra-payment case — $2k/yr extra reduces payoffYear and total
 *        interest relative to baseline (monotonic comparison).
 *     3. Zero-rate loan — paymentReal === principal / termYears;
 *        interestReal === 0 every year.
 *     4. Short-term (2 years) — rapid payoff; 2 perYear entries;
 *        payment ≈ analytical.
 *
 * RED PHASE: calc/studentLoan.js does not yet exist. The import below will
 * fail with ERR_MODULE_NOT_FOUND — expected until TB15.
 *
 * Contract invariants (studentLoan.contract.md §Invariants):
 *   - perYear.length === payoffYear + 1.
 *   - balanceRemainingReal monotonically non-increasing.
 *   - Final balanceRemainingReal within 1e-6 of 0.
 *   - paymentReal === interestReal + principalReal (year-internal).
 *   - All values real dollars.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * `calc/studentLoan.js` is created by US2b task TB15. Until then, the import
 * below throws ERR_MODULE_NOT_FOUND. Using a dynamic import inside each
 * test keeps each scenario as a distinct RED rather than a single file-
 * level load failure.
 */
async function loadComputeStudentLoan() {
  const mod = await import('../../calc/studentLoan.js');
  if (typeof mod.computeStudentLoan !== 'function') {
    throw new Error(
      'calc/studentLoan.js must export `computeStudentLoan` per contract (TB15). ' +
        'Currently exports: ' + Object.keys(mod).join(', '),
    );
  }
  return mod.computeStudentLoan;
}

/**
 * Closed-form annual payment on a fixed-rate amortizing loan.
 * Identical form to mortgage math — shared amortization identity.
 */
function analyticalAnnualPayment(principal, annualRate, termYears) {
  if (annualRate === 0) return principal / termYears;
  const r = annualRate / 12;
  const n = termYears * 12;
  const monthly = (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  return monthly * 12;
}

test('studentLoan: 10-year term, $50k principal, 4% real rate — analytical per-year payment and total interest', async () => {
  const computeStudentLoan = await loadComputeStudentLoan();
  const principal = 50_000;
  const annualRate = 0.04;
  const termYears = 10;
  const startAge = 30;

  const result = computeStudentLoan({
    principalReal: principal,
    annualRateReal: annualRate,
    termYears,
    startAge,
    extraPaymentReal: 0,
  });

  assert.ok(Array.isArray(result.perYear));
  assert.equal(result.perYear.length, termYears, '10-year loan ⇒ 10 perYear entries');
  assert.equal(typeof result.payoffYear, 'number');
  assert.equal(typeof result.totalInterestPaidReal, 'number');

  // Balance monotonically non-increasing.
  for (let i = 1; i < result.perYear.length; i++) {
    assert.ok(
      result.perYear[i].balanceRemainingReal <=
        result.perYear[i - 1].balanceRemainingReal + 1e-6,
      `balance non-increasing at index ${i}`,
    );
  }

  // Final balance ≈ 0.
  const last = result.perYear[result.perYear.length - 1];
  assert.ok(
    Math.abs(last.balanceRemainingReal) < 1,
    `final balance ≈ 0; got ${last.balanceRemainingReal}`,
  );

  // Per-year payment ≈ analytical.
  const expectedAnnualPayment = analyticalAnnualPayment(
    principal,
    annualRate,
    termYears,
  );
  const firstYear = result.perYear[0];
  assert.ok(
    Math.abs(firstYear.paymentReal - expectedAnnualPayment) < 0.5,
    `first-year payment ≈ analytical (${expectedAnnualPayment}); got ${firstYear.paymentReal}`,
  );

  // paymentReal === interestReal + principalReal every year.
  for (const rec of result.perYear) {
    assert.ok(
      Math.abs(rec.paymentReal - (rec.interestReal + rec.principalReal)) < 0.01,
      `paymentReal === interestReal + principalReal at age ${rec.age}`,
    );
  }

  // Total interest positive and less than total payments.
  assert.ok(result.totalInterestPaidReal > 0, 'total interest > 0 on non-zero rate loan');
  const totalPayments = result.perYear.reduce((s, r) => s + r.paymentReal, 0);
  assert.ok(
    result.totalInterestPaidReal < totalPayments,
    'total interest < total payments',
  );
  // Analytical total interest = totalPayments - principal.
  const expectedTotalInterest = expectedAnnualPayment * termYears - principal;
  assert.ok(
    Math.abs(result.totalInterestPaidReal - expectedTotalInterest) < 5,
    `total interest analytical ≈ ${expectedTotalInterest}; got ${result.totalInterestPaidReal}`,
  );
});

test('studentLoan: extra-payment shortens payoff and reduces total interest', async () => {
  const computeStudentLoan = await loadComputeStudentLoan();
  const baseParams = {
    principalReal: 50_000,
    annualRateReal: 0.04,
    termYears: 10,
    startAge: 30,
  };

  const baseline = computeStudentLoan({ ...baseParams, extraPaymentReal: 0 });
  const accelerated = computeStudentLoan({
    ...baseParams,
    extraPaymentReal: 2_000, // $2k/yr extra principal
  });

  assert.ok(
    accelerated.payoffYear < baseline.payoffYear,
    `extra-payment shortens payoff: baseline=${baseline.payoffYear}, ` +
      `accelerated=${accelerated.payoffYear}`,
  );
  assert.ok(
    accelerated.totalInterestPaidReal < baseline.totalInterestPaidReal,
    `extra-payment reduces total interest: baseline=${baseline.totalInterestPaidReal}, ` +
      `accelerated=${accelerated.totalInterestPaidReal}`,
  );
  assert.ok(
    accelerated.perYear.length < baseline.perYear.length,
    'accelerated schedule is shorter than baseline',
  );
});

test('studentLoan: zero-rate ⇒ flat monthly principal; interestReal === 0 every year', async () => {
  const computeStudentLoan = await loadComputeStudentLoan();
  const principal = 30_000;
  const termYears = 6;
  const startAge = 25;

  const result = computeStudentLoan({
    principalReal: principal,
    annualRateReal: 0,
    termYears,
    startAge,
    extraPaymentReal: 0,
  });

  assert.equal(result.perYear.length, termYears);
  const expectedAnnualPrincipal = principal / termYears;

  for (const rec of result.perYear) {
    assert.ok(
      Math.abs(rec.interestReal) < 1e-9,
      `zero-rate ⇒ interestReal === 0; got ${rec.interestReal} at age ${rec.age}`,
    );
    assert.ok(
      Math.abs(rec.paymentReal - expectedAnnualPrincipal) < 1e-6,
      `zero-rate ⇒ paymentReal === principal/termYears = ${expectedAnnualPrincipal}; ` +
        `got ${rec.paymentReal} at age ${rec.age}`,
    );
    assert.ok(
      Math.abs(rec.principalReal - expectedAnnualPrincipal) < 1e-6,
      `zero-rate ⇒ principalReal === principal/termYears; got ${rec.principalReal}`,
    );
  }

  assert.ok(
    Math.abs(result.totalInterestPaidReal) < 1e-6,
    `zero-rate total interest === 0; got ${result.totalInterestPaidReal}`,
  );
});

test('studentLoan: short-term (2 years) — rapid payoff; 2 perYear entries; payment matches analytical', async () => {
  const computeStudentLoan = await loadComputeStudentLoan();
  const principal = 20_000;
  const annualRate = 0.05;
  const termYears = 2;
  const startAge = 35;

  const result = computeStudentLoan({
    principalReal: principal,
    annualRateReal: annualRate,
    termYears,
    startAge,
    extraPaymentReal: 0,
  });

  assert.equal(result.perYear.length, termYears, '2-year term ⇒ 2 perYear entries');

  const expectedAnnualPayment = analyticalAnnualPayment(
    principal,
    annualRate,
    termYears,
  );
  assert.ok(
    Math.abs(result.perYear[0].paymentReal - expectedAnnualPayment) < 0.5,
    `short-term first payment ≈ analytical (${expectedAnnualPayment}); ` +
      `got ${result.perYear[0].paymentReal}`,
  );

  // Final balance ≈ 0.
  const last = result.perYear[result.perYear.length - 1];
  assert.ok(
    Math.abs(last.balanceRemainingReal) < 1,
    `final balance ≈ 0 on a 2-year loan; got ${last.balanceRemainingReal}`,
  );

  // Age indexing: ages are startAge, startAge+1.
  assert.equal(result.perYear[0].age, startAge);
  assert.equal(result.perYear[1].age, startAge + 1);
});
