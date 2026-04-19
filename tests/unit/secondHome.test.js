/*
 * tests/unit/secondHome.test.js — RED tests for the US2b SecondHome contract
 * (TB08).
 *
 * Covers the four fixture classes from
 *   specs/001-modular-calc-engine/contracts/secondHome.contract.md §Fixtures:
 *     1. Cash-only purchase (rate === 0), destiny 'live-in' — carry each
 *        year = propertyTax + otherCarry - rentalIncome; no amortization.
 *     2. Mortgaged + destiny 'sell' at fireAge — oneTimeOutflowReal at
 *        purchaseAge; positive saleProceedsReal at fireAge; zero carry after.
 *     3. Rented-out (rentalIncomeReal > annual carry cost) — net negative
 *        carryReal (= net income) each year while owned.
 *     4. destiny 'inherit' — legacyValueAtEndReal > 0 at endAge; carry
 *        persists to end-of-plan; no sale proceeds.
 *
 * RED PHASE: calc/secondHome.js does not yet exist. The import below will
 * fail with ERR_MODULE_NOT_FOUND — expected until TB14.
 *
 * Expected values analytically derived. All math is closed-form.
 *
 * Contract invariants (secondHome.contract.md §Invariants):
 *   - perYear.length === endAge - currentAgePrimary + 1.
 *   - Exactly one year has oneTimeOutflowReal > 0 (the purchaseAge year).
 *   - At most one year has saleProceedsReal > 0 (fireAge year when
 *     destiny === 'sell' AND purchaseAge <= fireAge <= endAge).
 *   - Carry formula: carryReal = annualPI + propertyTaxReal + otherCarryReal
 *                                - rentalIncomeReal.
 *   - All values real dollars.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * `calc/secondHome.js` is created by US2b task TB14. Until then, the import
 * below throws ERR_MODULE_NOT_FOUND. Using a dynamic import inside each
 * test keeps each scenario as a distinct RED rather than a single file-
 * level load failure.
 */
async function loadResolveSecondHome() {
  const mod = await import('../../calc/secondHome.js');
  if (typeof mod.resolveSecondHome !== 'function') {
    throw new Error(
      'calc/secondHome.js must export `resolveSecondHome` per contract (TB14). ' +
        'Currently exports: ' + Object.keys(mod).join(', '),
    );
  }
  return mod.resolveSecondHome;
}

/** Closed-form monthly P&I payment. */
function monthlyPayment(principal, annualRate, termYears) {
  const r = annualRate / 12;
  const n = termYears * 12;
  if (r === 0) return principal / n;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

test('secondHome: cash-only purchase (rate 0), live-in — carry = tax + otherCarry - rentalIncome; no amortization', async () => {
  const resolveSecondHome = await loadResolveSecondHome();
  const currentAgePrimary = 45;
  const endAge = 85;
  const fireAge = 60;
  const purchaseAge = 45;
  const homePrice = 300_000;
  const downPayment = 300_000; // fully cash-funded ⇒ no loan
  const closingCost = 6_000;
  const propertyTax = 4_500;
  const otherCarry = 2_500;
  const rentalIncome = 0;

  const result = resolveSecondHome({
    secondHome: {
      homePriceReal: homePrice,
      downPaymentReal: downPayment,
      closingCostReal: closingCost,
      annualRateReal: 0,
      termYears: 0,
      propertyTaxReal: propertyTax,
      otherCarryReal: otherCarry,
      rentalIncomeReal: rentalIncome,
      purchaseAge,
      destiny: 'live-in',
    },
    currentAgePrimary,
    endAge,
    fireAge,
  });

  assert.ok(Array.isArray(result.perYear));
  assert.equal(
    result.perYear.length,
    endAge - currentAgePrimary + 1,
    'perYear covers full lifecycle',
  );

  // Purchase year: oneTimeOutflow === downPayment + closingCost.
  const purchaseEntry = result.perYear.find((r) => r.age === purchaseAge);
  assert.ok(purchaseEntry, 'entry at purchaseAge exists');
  assert.ok(
    Math.abs(purchaseEntry.oneTimeOutflowReal - (downPayment + closingCost)) < 1e-6,
    `cash-only purchase: oneTimeOutflow === downPayment + closingCost; got ${purchaseEntry.oneTimeOutflowReal}`,
  );

  // Years while owned: carryReal = tax + otherCarry - rentalIncome
  // (no P&I because rate === 0).
  const expectedCarry = propertyTax + otherCarry - rentalIncome;
  const ownedYears = result.perYear.filter((r) => r.owned === true);
  assert.ok(ownedYears.length > 0, 'at least one owned year');
  for (const rec of ownedYears) {
    assert.ok(
      Math.abs(rec.carryReal - expectedCarry) < 1e-6,
      `cash-only live-in carry each year === tax + otherCarry - rentalIncome = ${expectedCarry}; ` +
        `got ${rec.carryReal} at age ${rec.age}`,
    );
  }

  // No sale proceeds (destiny === 'live-in').
  const withSale = result.perYear.filter((r) => (r.saleProceedsReal || 0) > 0);
  assert.equal(withSale.length, 0, 'live-in ⇒ no sale proceeds');
  assert.ok(
    (result.legacyValueAtEndReal || 0) < 1e-6,
    `live-in ⇒ no legacyValueAtEndReal; got ${result.legacyValueAtEndReal}`,
  );
});

test('secondHome: mortgaged + destiny sell at fireAge — outflow at purchaseAge, saleProceeds at fireAge, zero carry after', async () => {
  const resolveSecondHome = await loadResolveSecondHome();
  const currentAgePrimary = 40;
  const endAge = 85;
  const fireAge = 55;
  const purchaseAge = 45;
  const homePrice = 400_000;
  const downPayment = 80_000;
  const closingCost = 8_000;
  const annualRate = 0.035;
  const termYears = 30;
  const appreciation = 0.02;
  const location = 'us';

  const result = resolveSecondHome({
    secondHome: {
      homePriceReal: homePrice,
      downPaymentReal: downPayment,
      closingCostReal: closingCost,
      annualRateReal: annualRate,
      termYears,
      propertyTaxReal: 6_000,
      otherCarryReal: 3_000,
      rentalIncomeReal: 0,
      appreciationReal: appreciation,
      purchaseAge,
      destiny: 'sell',
      location,
    },
    currentAgePrimary,
    endAge,
    fireAge,
  });

  // Exactly one purchase-year entry with oneTimeOutflow > 0.
  const purchaseEntries = result.perYear.filter((r) => (r.oneTimeOutflowReal || 0) > 0);
  assert.equal(purchaseEntries.length, 1, 'exactly one year with down-payment outflow');
  assert.equal(purchaseEntries[0].age, purchaseAge, 'outflow year === purchaseAge');

  // Sale proceeds appear exactly once, at fireAge.
  const saleEntries = result.perYear.filter((r) => (r.saleProceedsReal || 0) > 0);
  assert.equal(saleEntries.length, 1, 'exactly one year with sale proceeds');
  assert.equal(saleEntries[0].age, fireAge, 'sale-proceeds year === fireAge');

  // Analytical sale proceeds:
  //   homeValue = homePrice × (1 + appr)^(fireAge - purchaseAge)
  //   remainingLoan = analytical amortized balance at (fireAge - purchaseAge) × 12 months
  //   saleProceeds = max(0, homeValue × (1 - sellingCostPct) - remainingLoan)
  const yearsOwnedAtFire = fireAge - purchaseAge;
  const homeValueAtFire = homePrice * Math.pow(1 + appreciation, yearsOwnedAtFire);
  const principal = homePrice - downPayment;
  const r = annualRate / 12;
  const N = termYears * 12;
  const n = yearsOwnedAtFire * 12;
  const remainingLoan =
    (principal * (Math.pow(1 + r, N) - Math.pow(1 + r, n))) /
    (Math.pow(1 + r, N) - 1);
  const sellingCostPctUS = 0.07;
  const expectedSaleProceeds = Math.max(
    0,
    homeValueAtFire * (1 - sellingCostPctUS) - remainingLoan,
  );
  assert.ok(
    Math.abs(saleEntries[0].saleProceedsReal - expectedSaleProceeds) < 10,
    `sale proceeds analytical: ${expectedSaleProceeds}; got ${saleEntries[0].saleProceedsReal}`,
  );

  // Zero carry strictly after fireAge.
  const postFireEntries = result.perYear.filter((r) => r.age > fireAge);
  for (const rec of postFireEntries) {
    assert.ok(
      Math.abs(rec.carryReal || 0) < 1e-6,
      `post-sale carryReal must be 0; got ${rec.carryReal} at age ${rec.age}`,
    );
    assert.equal(
      rec.owned,
      false,
      `post-sale owned must be false at age ${rec.age}`,
    );
  }
});

test('secondHome: rented-out with rental income > annual carry ⇒ negative carry (net income)', async () => {
  const resolveSecondHome = await loadResolveSecondHome();
  const currentAgePrimary = 50;
  const endAge = 90;
  const fireAge = 65;
  const purchaseAge = 50;
  const homePrice = 250_000;
  const downPayment = 50_000;
  const annualRate = 0.04;
  const termYears = 30;
  const propertyTax = 3_000;
  const otherCarry = 1_500;

  // Choose rentalIncome > annualPI + tax + otherCarry.
  const principal = homePrice - downPayment;
  const annualPI = monthlyPayment(principal, annualRate, termYears) * 12;
  const rentalIncome = Math.ceil(annualPI + propertyTax + otherCarry + 6_000); // generous

  const result = resolveSecondHome({
    secondHome: {
      homePriceReal: homePrice,
      downPaymentReal: downPayment,
      closingCostReal: 5_000,
      annualRateReal: annualRate,
      termYears,
      propertyTaxReal: propertyTax,
      otherCarryReal: otherCarry,
      rentalIncomeReal: rentalIncome,
      purchaseAge,
      destiny: 'live-in',
    },
    currentAgePrimary,
    endAge,
    fireAge,
  });

  // Find a purely-amortizing year (year 2 of ownership, purchase year is
  // age === purchaseAge which has oneTimeOutflow attached — carry still
  // reflects year-one amortization; either year works for the negativity test).
  const sampleYear = result.perYear.find(
    (r) => r.age === purchaseAge + 1,
  );
  assert.ok(sampleYear, 'sample year (purchaseAge + 1) exists');
  assert.ok(sampleYear.owned, 'sample year is an owned year');

  const expectedCarry = annualPI + propertyTax + otherCarry - rentalIncome;
  assert.ok(
    expectedCarry < 0,
    'precondition: rentalIncome exceeds carrying costs ⇒ expected carry is negative',
  );
  assert.ok(
    Math.abs(sampleYear.carryReal - expectedCarry) < 1,
    `rented-out net income: carryReal must be ≈ ${expectedCarry} (negative = income); got ${sampleYear.carryReal}`,
  );
  assert.ok(
    sampleYear.carryReal < 0,
    `rented-out net-income case must produce negative carryReal; got ${sampleYear.carryReal}`,
  );
});

test('secondHome: destiny inherit — carry continues until endAge; no sale proceeds; legacyValueAtEndReal > 0', async () => {
  const resolveSecondHome = await loadResolveSecondHome();
  const currentAgePrimary = 50;
  const endAge = 90;
  const fireAge = 65;
  const purchaseAge = 50;
  const homePrice = 300_000;
  const downPayment = 60_000;
  const annualRate = 0.03;
  const termYears = 30;
  const appreciation = 0.015;

  const result = resolveSecondHome({
    secondHome: {
      homePriceReal: homePrice,
      downPaymentReal: downPayment,
      closingCostReal: 4_500,
      annualRateReal: annualRate,
      termYears,
      propertyTaxReal: 3_500,
      otherCarryReal: 2_000,
      rentalIncomeReal: 0,
      appreciationReal: appreciation,
      purchaseAge,
      destiny: 'inherit',
    },
    currentAgePrimary,
    endAge,
    fireAge,
  });

  // No sale proceeds anywhere in the schedule.
  const saleEntries = result.perYear.filter((r) => (r.saleProceedsReal || 0) > 0);
  assert.equal(saleEntries.length, 0, 'inherit ⇒ no sale proceeds');

  // After fireAge and within the mortgage window, carry must still be non-zero.
  const postFireWithinLoan = result.perYear.find(
    (r) => r.age === fireAge + 1 && (r.age - purchaseAge) < termYears,
  );
  assert.ok(postFireWithinLoan, 'post-FIRE, within-loan sample exists');
  assert.ok(
    postFireWithinLoan.carryReal > 0,
    `inherit: carry continues past fireAge within loan window; got ${postFireWithinLoan.carryReal} at age ${postFireWithinLoan.age}`,
  );
  assert.equal(
    postFireWithinLoan.owned,
    true,
    'inherit: still owned post-FIRE',
  );

  // Analytical legacy value: homePrice × (1 + appr)^(endAge - purchaseAge).
  const expectedLegacy = homePrice * Math.pow(1 + appreciation, endAge - purchaseAge);
  assert.ok(
    Math.abs(result.legacyValueAtEndReal - expectedLegacy) < 1,
    `inherit legacyValueAtEndReal analytical: ${expectedLegacy}; got ${result.legacyValueAtEndReal}`,
  );
  assert.ok(result.legacyValueAtEndReal > homePrice, 'appreciated legacy value > purchase price');
});
