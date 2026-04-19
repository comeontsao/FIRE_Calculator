/*
 * tests/unit/mortgage-ownership.test.js — RED tests for the US2b Mortgage
 * ownership-mode contract (TB07).
 *
 * Covers the three fixture classes from
 *   specs/001-modular-calc-engine/contracts/mortgage.contract.md §Fixtures:
 *     1. ownership === 'buying-now'   — down-payment at currentAgePrimary.
 *     2. ownership === 'already-own'  — no down-payment; balance at today's
 *                                       age matches closed-form amortized
 *                                       balance given yearsPaid.
 *     3. ownership === 'buying-in'    — zero housing outflow years 0..(k-1);
 *                                       outflow at year k (purchaseAge -
 *                                       currentAgePrimary).
 *
 * RED PHASE: calc/mortgage.js currently exports only `computeMortgage`. The
 * high-level ownership-aware helper `resolveMortgage` is added by TB13 —
 * until then, the import below will throw SyntaxError (no such export),
 * causing every test to fail.
 *
 * Expected values are analytically derived (closed-form amortization math
 * a textbook reader could reproduce with a spreadsheet).
 *
 * Contract invariants (mortgage.contract.md §Invariants — ownership modes):
 *   - perYear.length === endAge - currentAgePrimary + 1 (full lifecycle).
 *   - Down-payment outflow appears exactly once — at purchaseAge (or never
 *     for 'already-own').
 *   - paymentReal === 0 for years before purchaseAge (buying-in) and years
 *     after payoffYear.
 *   - Standard amortization math — balance monotonically non-increasing
 *     within the loan window.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * `resolveMortgage` is added by US2b task TB13. Until then, importing it
 * from calc/mortgage.js raises SyntaxError at module-load time. We use a
 * dynamic import inside each test so the failure shows up per-test (one
 * RED per scenario) instead of as a single file-level load failure.
 */
async function loadResolveMortgage() {
  const mod = await import('../../calc/mortgage.js');
  if (typeof mod.resolveMortgage !== 'function') {
    throw new Error(
      'calc/mortgage.js must export `resolveMortgage` per contract (TB13). ' +
        'Currently exports: ' + Object.keys(mod).join(', '),
    );
  }
  return mod.resolveMortgage;
}

/**
 * Closed-form standard monthly payment for a fixed-rate amortizing loan.
 * Used to build analytical expected values inside these tests.
 */
function monthlyPayment(principal, annualRate, termYears) {
  const r = annualRate / 12;
  const n = termYears * 12;
  if (r === 0) return principal / n;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

/**
 * Closed-form remaining balance after monthsElapsed months of payments.
 * (Standard mortgage amortization identity.)
 */
function remainingBalanceAfterMonths(principal, annualRate, termYears, monthsElapsed) {
  const r = annualRate / 12;
  const n = termYears * 12;
  if (r === 0) return principal * (1 - monthsElapsed / n);
  const pmt = monthlyPayment(principal, annualRate, termYears);
  return principal * Math.pow(1 + r, monthsElapsed)
       - pmt * (Math.pow(1 + r, monthsElapsed) - 1) / r;
}

test('mortgage-ownership: buying-now — down-payment outflow at currentAgePrimary; first P&I year is purchase year', async () => {
  const resolveMortgage = await loadResolveMortgage();
  const currentAgePrimary = 40;
  const endAge = 70;
  const fireAge = 60;
  const homePrice = 500_000;
  const downPayment = 100_000;
  const closingCost = 15_000;
  const annualRate = 0.03; // real
  const termYears = 30;

  const result = resolveMortgage({
    mortgage: {
      ownership: 'buying-now',
      homePriceReal: homePrice,
      downPaymentReal: downPayment,
      closingCostReal: closingCost,
      annualRateReal: annualRate,
      termYears,
      destiny: 'live-in',
    },
    currentAgePrimary,
    endAge,
    fireAge,
  });

  assert.ok(Array.isArray(result.perYear), 'perYear is an array');
  assert.equal(
    result.perYear.length,
    endAge - currentAgePrimary + 1,
    'perYear covers full lifecycle',
  );

  // Down-payment outflow at age === currentAgePrimary.
  const purchaseYearEntry = result.perYear.find((r) => r.age === currentAgePrimary);
  assert.ok(purchaseYearEntry, 'entry for purchase year exists');
  assert.ok(
    Math.abs(purchaseYearEntry.oneTimeOutflowReal - (downPayment + closingCost)) < 1e-6,
    `buying-now down-payment outflow must equal downPayment + closingCost at currentAgePrimary; ` +
      `got ${purchaseYearEntry.oneTimeOutflowReal}, expected ${downPayment + closingCost}`,
  );

  // Analytical first-year P&I: 12 × monthly payment on principal = homePrice - downPayment.
  const principal = homePrice - downPayment;
  const expectedAnnualPI = monthlyPayment(principal, annualRate, termYears) * 12;
  assert.ok(
    Math.abs(purchaseYearEntry.paymentReal - expectedAnnualPI) < 0.01,
    `first-year P&I must equal analytical annual payment; got ${purchaseYearEntry.paymentReal}, expected ${expectedAnnualPI}`,
  );

  // No entry has oneTimeOutflowReal > 0 other than the purchase year.
  const otherOutflows = result.perYear.filter(
    (r) => r.age !== currentAgePrimary && (r.oneTimeOutflowReal || 0) > 0,
  );
  assert.equal(
    otherOutflows.length,
    0,
    'exactly one year has a non-zero down-payment outflow (the purchase year)',
  );
});

test('mortgage-ownership: already-own — no down-payment outflow; remaining balance at currentAge matches analytical amortized balance', async () => {
  const resolveMortgage = await loadResolveMortgage();
  const currentAgePrimary = 50;
  const endAge = 85;
  const fireAge = 65;
  const homePrice = 600_000;
  const downPayment = 120_000;
  const closingCost = 20_000;
  const annualRate = 0.035;
  const termYears = 30;
  const yearsPaid = 10; // purchased at age 40

  const result = resolveMortgage({
    mortgage: {
      ownership: 'already-own',
      homePriceReal: homePrice,
      downPaymentReal: downPayment,
      closingCostReal: closingCost,
      annualRateReal: annualRate,
      termYears,
      yearsPaid,
      destiny: 'live-in',
    },
    currentAgePrimary,
    endAge,
    fireAge,
  });

  assert.ok(Array.isArray(result.perYear));
  assert.equal(result.perYear.length, endAge - currentAgePrimary + 1);

  // No oneTimeOutflowReal from the primary mortgage in any year — the
  // down-payment + closing-cost happened BEFORE currentAgePrimary and
  // must not appear on any lifecycle record.
  for (const rec of result.perYear) {
    assert.ok(
      (rec.oneTimeOutflowReal || 0) < 1e-6,
      `already-own ⇒ no down-payment outflow on any year; got ${rec.oneTimeOutflowReal} at age ${rec.age}`,
    );
  }

  // Remaining balance at currentAgePrimary = analytical balance after
  // yearsPaid × 12 months of amortization on the original loan principal.
  const principal = homePrice - downPayment;
  const monthsPaidBeforeToday = yearsPaid * 12;
  const expectedBalanceToday = remainingBalanceAfterMonths(
    principal,
    annualRate,
    termYears,
    monthsPaidBeforeToday,
  );
  const todayEntry = result.perYear.find((r) => r.age === currentAgePrimary);
  assert.ok(todayEntry, 'entry at currentAgePrimary exists');
  // The record's end-of-year balance is 1 year further along; compare
  // against the START-of-year balance by looking at last year's closing
  // balance or accept the residual within a close tolerance.
  const expectedBalanceEndOfFirstRecordedYear = remainingBalanceAfterMonths(
    principal,
    annualRate,
    termYears,
    (yearsPaid + 1) * 12,
  );
  assert.ok(
    Math.abs(todayEntry.balanceRemainingReal - expectedBalanceEndOfFirstRecordedYear) < 1,
    `already-own: balance at end of currentAge record must equal analytical balance at ` +
      `(yearsPaid+1)*12 months; got ${todayEntry.balanceRemainingReal}, ` +
      `expected ${expectedBalanceEndOfFirstRecordedYear}`,
  );

  // Annual P&I during the mortgage window matches the original loan's payment.
  const expectedAnnualPI = monthlyPayment(principal, annualRate, termYears) * 12;
  assert.ok(
    Math.abs(todayEntry.paymentReal - expectedAnnualPI) < 0.01,
    `already-own: P&I during mortgage window matches original amortization; ` +
      `got ${todayEntry.paymentReal}, expected ${expectedAnnualPI}`,
  );
});

test('mortgage-ownership: buying-in — zero housing outflow for years 0..4; outflow at purchaseAge (year 5)', async () => {
  const resolveMortgage = await loadResolveMortgage();
  const currentAgePrimary = 35;
  const endAge = 80;
  const fireAge = 60;
  const homePrice = 400_000;
  const downPayment = 80_000;
  const closingCost = 10_000;
  const annualRate = 0.04;
  const termYears = 30;
  const yearsUntilPurchase = 5;
  const purchaseAge = currentAgePrimary + yearsUntilPurchase; // 40

  const result = resolveMortgage({
    mortgage: {
      ownership: 'buying-in',
      homePriceReal: homePrice,
      downPaymentReal: downPayment,
      closingCostReal: closingCost,
      annualRateReal: annualRate,
      termYears,
      purchaseAge,
      destiny: 'live-in',
    },
    currentAgePrimary,
    endAge,
    fireAge,
  });

  assert.ok(Array.isArray(result.perYear));
  assert.equal(result.perYear.length, endAge - currentAgePrimary + 1);

  // Years 0..4 (ages currentAgePrimary..purchaseAge-1): zero housing outflow.
  for (let age = currentAgePrimary; age < purchaseAge; age++) {
    const rec = result.perYear.find((r) => r.age === age);
    assert.ok(rec, `entry for age ${age} exists`);
    assert.ok(
      (rec.paymentReal || 0) < 1e-6,
      `buying-in: paymentReal must be 0 before purchaseAge; got ${rec.paymentReal} at age ${age}`,
    );
    assert.ok(
      (rec.oneTimeOutflowReal || 0) < 1e-6,
      `buying-in: oneTimeOutflowReal must be 0 before purchaseAge; got ${rec.oneTimeOutflowReal} at age ${age}`,
    );
  }

  // Year at purchaseAge: one-time outflow = downPayment + closingCost.
  const purchaseYearEntry = result.perYear.find((r) => r.age === purchaseAge);
  assert.ok(purchaseYearEntry, 'entry at purchaseAge exists');
  assert.ok(
    Math.abs(purchaseYearEntry.oneTimeOutflowReal - (downPayment + closingCost)) < 1e-6,
    `buying-in outflow at purchaseAge must equal downPayment + closingCost; ` +
      `got ${purchaseYearEntry.oneTimeOutflowReal}, expected ${downPayment + closingCost}`,
  );

  // First P&I year starts at purchaseAge.
  const principal = homePrice - downPayment;
  const expectedAnnualPI = monthlyPayment(principal, annualRate, termYears) * 12;
  assert.ok(
    Math.abs(purchaseYearEntry.paymentReal - expectedAnnualPI) < 0.01,
    `buying-in: first-year P&I at purchaseAge must equal analytical annual payment; ` +
      `got ${purchaseYearEntry.paymentReal}, expected ${expectedAnnualPI}`,
  );
});
