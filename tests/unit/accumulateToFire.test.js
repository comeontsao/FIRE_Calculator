// ==================== UNIT TESTS: accumulateToFire ====================
// Feature 019 — Accumulation Drift Fix.
// Spec: specs/019-accumulation-drift-fix/spec.md §7.2 (14 test cases + invariants).
//
// All tests are pure-Node — no DOM, no browser globals.
// The helper under test: calc/accumulateToFire.js
// ======================================================================

import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const { accumulateToFire } = require(path.resolve(__dirname, '..', '..', 'calc', 'accumulateToFire.js'));

// ---------------------------------------------------------------------------
// Minimal fixture builders
// ---------------------------------------------------------------------------

/** Minimal valid inp with no mortgage, no H2, no college. */
function baseInp(overrides) {
  return Object.assign({
    ageRoger: 42,
    roger401kTrad: 50000,
    roger401kRoth: 30000,
    rogerStocks: 100000,
    rebeccaStocks: 50000,
    cashSavings: 20000,
    otherAssets: 0,
    returnRate: 0.07,
    return401k: 0.07,
    inflationRate: 0.03,
    monthlySavings: 1000,
    contrib401kTrad: 16500,
    contrib401kRoth: 2900,
    empMatch: 7200,
    endAge: 95,
    taxTrad: 0.22,
    stockGainPct: 0.6,
    raiseRate: 0.03,
    annualIncome: 120000,
    ssClaimAge: 67,
  }, overrides || {});
}

/** Minimal options with no optional features. */
function baseOptions(overrides) {
  return Object.assign({
    mortgageEnabled: false,
    mortgageInputs: null,
    secondHomeEnabled: false,
    secondHomeInputs: null,
    rentMonthly: 0,
    collegeFn: null,
    payoffVsInvestFn: null,
  }, overrides || {});
}

// ---------------------------------------------------------------------------
// T-019-02-01: Clean accumulation (no mortgage, no H2, no college)
// Matches closed-form compound interest for stocks + 401k + cash.
// ---------------------------------------------------------------------------
test('T-01: clean accumulation matches closed-form compound interest', () => {
  const inp = baseInp();
  const opts = baseOptions();
  const fireAge = 52; // 10 years
  const result = accumulateToFire(inp, fireAge, opts);

  const { end, perYearRows } = result;

  // Validate return shape
  assert.ok(end, 'result.end must exist');
  assert.ok(Array.isArray(perYearRows), 'result.perYearRows must be an array');
  assert.strictEqual(perYearRows.length, fireAge - inp.ageRoger, 'perYearRows.length === fireAge - currentAge');

  const realReturnStocks = inp.returnRate - inp.inflationRate;
  const realReturn401k = inp.return401k - inp.inflationRate;
  const tradContrib = inp.contrib401kTrad + inp.empMatch;
  const rothContrib = inp.contrib401kRoth;
  const annualSavings = inp.monthlySavings * 12;
  const years = fireAge - inp.ageRoger;

  // Closed-form for stocks (geometric series): S*r^n + savings*(r^n - 1)/(r - 1)
  const r = 1 + realReturnStocks;
  const pStocks0 = inp.rogerStocks + inp.rebeccaStocks;
  const expectedStocks = pStocks0 * Math.pow(r, years) + annualSavings * (Math.pow(r, years) - 1) / realReturnStocks;

  // Cash grows at 1.005^n (no contributions)
  const pCash0 = inp.cashSavings + inp.otherAssets;
  const expectedCash = pCash0 * Math.pow(1.005, years);

  // 401k Trad: same recurrence
  const r401k = 1 + realReturn401k;
  const expectedTrad = inp.roger401kTrad * Math.pow(r401k, years) + tradContrib * (Math.pow(r401k, years) - 1) / realReturn401k;
  const expectedRoth = inp.roger401kRoth * Math.pow(r401k, years) + rothContrib * (Math.pow(r401k, years) - 1) / realReturn401k;

  assert.ok(Math.abs(end.pStocks - expectedStocks) < 1, `pStocks closed-form: expected ~${Math.round(expectedStocks)}, got ${Math.round(end.pStocks)}`);
  assert.ok(Math.abs(end.pCash - expectedCash) < 1, `pCash closed-form: expected ~${Math.round(expectedCash)}, got ${Math.round(end.pCash)}`);
  assert.ok(Math.abs(end.pTrad - expectedTrad) < 1, `pTrad closed-form: expected ~${Math.round(expectedTrad)}, got ${Math.round(end.pTrad)}`);
  assert.ok(Math.abs(end.pRoth - expectedRoth) < 1, `pRoth closed-form: expected ~${Math.round(expectedRoth)}, got ${Math.round(end.pRoth)}`);
});

// ---------------------------------------------------------------------------
// T-019-02-02: Mortgage buying-now → upfront deduction at year 0
// ---------------------------------------------------------------------------
test('T-02: mortgage buying-now deducts upfront cost from cash at year 0', () => {
  const downPayment = 80000;
  const closingCosts = 15000;
  const upfront = downPayment + closingCosts; // 95000
  const cashSavings = 100000; // > upfront
  const inp = baseInp({ cashSavings });
  const opts = baseOptions({
    mortgageEnabled: true,
    mortgageInputs: {
      ownership: 'buying-now',
      downPayment,
      closingCosts,
      homePrice: 400000,
      rate: 0.065,
      term: 30,
      yearsPaid: 0,
      buyInYears: 0,
      propertyTax: 6000,
      insurance: 1200,
      hoa: 0,
      sellAtFire: false,
    },
    rentMonthly: 2000,
  });
  const fireAge = 52;
  const result = accumulateToFire(inp, fireAge, opts);
  const { perYearRows } = result;

  // First row should snapshot pools BEFORE mutations AND growth.
  // The buying-now deduction happens PRE-LOOP (before the first iteration),
  // so the first row's pCash should reflect the deduction.
  const firstRow = perYearRows[0];
  assert.ok(firstRow, 'perYearRows[0] must exist');
  assert.ok(
    Math.abs(firstRow.pCash - (cashSavings - upfront)) < 1,
    `buying-now: firstRow.pCash should be cashSavings - upfront = ${cashSavings - upfront}, got ${Math.round(firstRow.pCash)}`
  );
});

// ---------------------------------------------------------------------------
// T-019-02-03: Mortgage already-own → no deduction
// ---------------------------------------------------------------------------
test('T-03: mortgage already-own makes no upfront deduction', () => {
  const cashSavings = 50000;
  const inp = baseInp({ cashSavings });
  const opts = baseOptions({
    mortgageEnabled: true,
    mortgageInputs: {
      ownership: 'already-own',
      downPayment: 100000,
      closingCosts: 15000,
      homePrice: 400000,
      rate: 0.065,
      term: 30,
      yearsPaid: 5,
      buyInYears: 0,
      propertyTax: 6000,
      insurance: 1200,
      hoa: 0,
      sellAtFire: false,
    },
    rentMonthly: 2000,
  });
  const fireAge = 52;
  const result = accumulateToFire(inp, fireAge, opts);
  const { perYearRows } = result;

  // already-own: no upfront deduction; pCash at start of first row = cashSavings + otherAssets
  const firstRow = perYearRows[0];
  assert.ok(
    Math.abs(firstRow.pCash - (cashSavings + inp.otherAssets)) < 1,
    `already-own: no upfront deduction; firstRow.pCash should be ${cashSavings}, got ${Math.round(firstRow.pCash)}`
  );
});

// ---------------------------------------------------------------------------
// T-019-02-04: Mortgage buying-in → delayed deduction at buyInYears
// ---------------------------------------------------------------------------
test('T-04: mortgage buying-in deducts at buyInYears', () => {
  const cashSavings = 200000;
  const downPayment = 120000;
  const closingCosts = 17000;
  const upfront = downPayment + closingCosts;
  const buyInYears = 3;
  const inp = baseInp({ cashSavings, otherAssets: 0 });
  const opts = baseOptions({
    mortgageEnabled: true,
    mortgageInputs: {
      ownership: 'buying-in',
      downPayment,
      closingCosts,
      buyInYears,
      homePrice: 500000,
      rate: 0.065,
      term: 30,
      yearsPaid: 0,
      propertyTax: 6000,
      insurance: 1200,
      hoa: 0,
      sellAtFire: false,
    },
    rentMonthly: 2000,
  });
  const fireAge = 52;
  const result = accumulateToFire(inp, fireAge, opts);
  const { perYearRows } = result;

  // Rows before buyInYears should still have cash (no deduction yet)
  // Row at index buyInYears should show the deduction
  // Row at index < buyInYears: cash should still be the initial amount (grown at 1.005 each year)
  // We look for the purchase flag
  const rowBeforePurchase = perYearRows[buyInYears - 1]; // age 44 (yearsFromNow=2)
  const rowAtPurchase = perYearRows[buyInYears];         // age 45 (yearsFromNow=3)

  assert.ok(rowBeforePurchase && !rowBeforePurchase.mtgPurchasedThisYear,
    'row before buyInYears should not have mtgPurchasedThisYear');
  assert.ok(rowAtPurchase && rowAtPurchase.mtgPurchasedThisYear,
    'row at buyInYears should have mtgPurchasedThisYear === true');
});

// ---------------------------------------------------------------------------
// T-019-02-05: Mortgage buying-in with buyInYears=0 ≡ buying-now
// ---------------------------------------------------------------------------
test('T-05: mortgage buying-in with buyInYears=0 equivalent to buying-now', () => {
  const cashSavings = 200000;
  const downPayment = 80000;
  const closingCosts = 15000;
  const mtgBase = {
    downPayment,
    closingCosts,
    homePrice: 400000,
    rate: 0.065,
    term: 30,
    yearsPaid: 0,
    propertyTax: 6000,
    insurance: 1200,
    hoa: 0,
    sellAtFire: false,
  };
  const inp = baseInp({ cashSavings });
  const fireAge = 52;

  const resultBuyingNow = accumulateToFire(inp, fireAge, baseOptions({
    mortgageEnabled: true,
    mortgageInputs: { ...mtgBase, ownership: 'buying-now', buyInYears: 0 },
    rentMonthly: 2000,
  }));
  const resultBuyingIn0 = accumulateToFire(inp, fireAge, baseOptions({
    mortgageEnabled: true,
    mortgageInputs: { ...mtgBase, ownership: 'buying-in', buyInYears: 0 },
    rentMonthly: 2000,
  }));

  // End pools should be identical
  assert.ok(Math.abs(resultBuyingNow.end.pCash - resultBuyingIn0.end.pCash) < 1,
    `buying-now pCash (${Math.round(resultBuyingNow.end.pCash)}) should equal buying-in/0 (${Math.round(resultBuyingIn0.end.pCash)})`);
  assert.ok(Math.abs(resultBuyingNow.end.pStocks - resultBuyingIn0.end.pStocks) < 1,
    `pStocks should match`);
});

// ---------------------------------------------------------------------------
// T-019-02-06: Buy-in cost > pCash → spillover to pStocks
// ---------------------------------------------------------------------------
test('T-06: buy-in cost > pCash drains residual from pStocks', () => {
  const cashSavings = 50000;
  const downPayment = 120000;
  const closingCosts = 17000; // upfront = 137000, cash only has 50000
  const inp = baseInp({ cashSavings, rogerStocks: 200000, rebeccaStocks: 0 });
  const opts = baseOptions({
    mortgageEnabled: true,
    mortgageInputs: {
      ownership: 'buying-now',
      downPayment,
      closingCosts,
      homePrice: 500000,
      rate: 0.065,
      term: 30,
      yearsPaid: 0,
      buyInYears: 0,
      propertyTax: 6000,
      insurance: 1200,
      hoa: 0,
      sellAtFire: false,
    },
    rentMonthly: 2000,
  });
  const fireAge = 52;
  const result = accumulateToFire(inp, fireAge, opts);

  const firstRow = result.perYearRows[0];
  // Cash exhausted → 0
  assert.strictEqual(Math.round(firstRow.pCash), 0, `pCash should be drained to 0; got ${Math.round(firstRow.pCash)}`);
  // Stocks reduced by (upfront - cashSavings) = 137000 - 50000 = 87000
  const expectedStocksAfterDrain = 200000 - (137000 - 50000); // 113000
  assert.ok(
    Math.abs(firstRow.pStocks - expectedStocksAfterDrain) < 1,
    `pStocks after spillover: expected ~${expectedStocksAfterDrain}, got ${Math.round(firstRow.pStocks)}`
  );
});

// ---------------------------------------------------------------------------
// T-019-02-07: Buy-in cost > pCash + pStocks → both clamped to 0
// ---------------------------------------------------------------------------
test('T-07: buy-in exceeds total liquid; both pools clamped to 0', () => {
  const cashSavings = 5000;
  const rogerStocks = 10000;
  const downPayment = 100000; // upfront > cash + stocks
  const closingCosts = 10000;
  const inp = baseInp({ cashSavings, rogerStocks, rebeccaStocks: 0 });
  const opts = baseOptions({
    mortgageEnabled: true,
    mortgageInputs: {
      ownership: 'buying-now',
      downPayment,
      closingCosts,
      homePrice: 400000,
      rate: 0.065,
      term: 30,
      yearsPaid: 0,
      buyInYears: 0,
      propertyTax: 6000,
      insurance: 1200,
      hoa: 0,
      sellAtFire: false,
    },
    rentMonthly: 2000,
  });
  const fireAge = 52;
  const result = accumulateToFire(inp, fireAge, opts);

  const firstRow = result.perYearRows[0];
  assert.strictEqual(Math.round(firstRow.pCash), 0, 'pCash must be clamped to 0');
  assert.strictEqual(Math.round(firstRow.pStocks), 0, 'pStocks must be clamped to 0');
});

// ---------------------------------------------------------------------------
// T-019-02-08: Home #2 buying-now (buyInYears=0) → upfront deduction
// ---------------------------------------------------------------------------
test('T-08: H2 buying-now deducts upfront from cash at year 0', () => {
  const cashSavings = 200000;
  const h2Down = 60000;
  const h2Closing = 8000;
  const h2Upfront = h2Down + h2Closing; // 68000
  const inp = baseInp({ cashSavings });
  const opts = baseOptions({
    secondHomeEnabled: true,
    secondHomeInputs: {
      buyInYears: 0,
      downPayment: h2Down,
      closingCosts: h2Closing,
      homePrice: 300000,
      rate: 0.065,
      term: 30,
      propertyTax: 4000,
      insurance: 1000,
      hoa: 0,
      destiny: 'keep',
    },
  });
  const fireAge = 52;
  const result = accumulateToFire(inp, fireAge, opts);
  const firstRow = result.perYearRows[0];

  assert.ok(
    Math.abs(firstRow.pCash - (cashSavings - h2Upfront)) < 1,
    `H2 buying-now: pCash after deduction = ${cashSavings - h2Upfront}, got ${Math.round(firstRow.pCash)}`
  );
  // Note: buyInYears=0 fires the pre-loop path, so h2PurchasedThisYear is false
  // in the first row (no in-loop trigger fires). The deduction is visible via pCash.
  assert.strictEqual(firstRow.h2PurchasedThisYear, false,
    'Pre-loop H2 purchase does not set h2PurchasedThisYear on the first row (that flag is for in-loop delayed purchases only)');
});

// ---------------------------------------------------------------------------
// T-019-02-09: Home #2 buying-in (buyInYears > 0) → delayed deduction
// ---------------------------------------------------------------------------
test('T-09: H2 buying-in deducts at buyInYears', () => {
  const cashSavings = 200000;
  const h2Down = 60000;
  const h2Closing = 8000;
  const buyInYears = 4;
  const inp = baseInp({ cashSavings });
  const opts = baseOptions({
    secondHomeEnabled: true,
    secondHomeInputs: {
      buyInYears,
      downPayment: h2Down,
      closingCosts: h2Closing,
      homePrice: 300000,
      rate: 0.065,
      term: 30,
      propertyTax: 4000,
      insurance: 1000,
      hoa: 0,
      destiny: 'keep',
    },
  });
  const fireAge = 52;
  const result = accumulateToFire(inp, fireAge, opts);
  const { perYearRows } = result;

  const rowBeforeH2 = perYearRows[buyInYears - 1];
  const rowAtH2 = perYearRows[buyInYears];

  assert.ok(!rowBeforeH2.h2PurchasedThisYear, 'row before buyInYears should not have h2PurchasedThisYear');
  assert.ok(rowAtH2.h2PurchasedThisYear, 'row at buyInYears should have h2PurchasedThisYear');
});

// ---------------------------------------------------------------------------
// T-019-02-10: Combined mortgage + H2 buy-ins
// ---------------------------------------------------------------------------
test('T-10: combined mortgage buying-now + H2 buying-in both drain correctly', () => {
  const cashSavings = 300000;
  const mtgDown = 100000;
  const mtgClose = 15000;
  const h2Down = 60000;
  const h2Close = 8000;
  const h2BuyIn = 3;
  const inp = baseInp({ cashSavings });
  const opts = baseOptions({
    mortgageEnabled: true,
    mortgageInputs: {
      ownership: 'buying-now',
      downPayment: mtgDown,
      closingCosts: mtgClose,
      homePrice: 500000,
      rate: 0.065,
      term: 30,
      yearsPaid: 0,
      buyInYears: 0,
      propertyTax: 6000,
      insurance: 1200,
      hoa: 0,
      sellAtFire: false,
    },
    rentMonthly: 2000,
    secondHomeEnabled: true,
    secondHomeInputs: {
      buyInYears: h2BuyIn,
      downPayment: h2Down,
      closingCosts: h2Close,
      homePrice: 300000,
      rate: 0.065,
      term: 30,
      propertyTax: 4000,
      insurance: 1000,
      hoa: 0,
      destiny: 'keep',
    },
  });
  const fireAge = 52;
  const result = accumulateToFire(inp, fireAge, opts);
  const { perYearRows } = result;

  // Year 0: mortgage deduction fires
  const row0 = perYearRows[0];
  const expectedCashAfterMtg = cashSavings - (mtgDown + mtgClose);
  assert.ok(Math.abs(row0.pCash - expectedCashAfterMtg) < 1,
    `row0.pCash after mtg deduction: expected ~${expectedCashAfterMtg}, got ${Math.round(row0.pCash)}`);

  // Year h2BuyIn: H2 deduction fires
  const rowH2 = perYearRows[h2BuyIn];
  assert.ok(rowH2.h2PurchasedThisYear, 'H2 should fire at its buyInYears row');
});

// ---------------------------------------------------------------------------
// T-019-02-11: College drain reduces savings via collegeFn
// ---------------------------------------------------------------------------
test('T-11: college drain via collegeFn reduces effectiveAnnualSavings', () => {
  const inp = baseInp();
  const collegeDrainPerYear = 15000;
  // collegeFn returns 15000 for years 5-8 (kid college years)
  const collegeFn = (_inp, yearsFromNow) =>
    (yearsFromNow >= 5 && yearsFromNow <= 8) ? collegeDrainPerYear : 0;

  const optsNoCollege = baseOptions({ collegeFn: null });
  const optsWithCollege = baseOptions({ collegeFn });
  const fireAge = 52;

  const resNoCollege = accumulateToFire(inp, fireAge, optsNoCollege);
  const resWithCollege = accumulateToFire(inp, fireAge, optsWithCollege);

  // With college drain, pStocks at end should be lower
  assert.ok(
    resWithCollege.end.pStocks < resNoCollege.end.pStocks,
    `College drain should reduce pStocks. Without: ${Math.round(resNoCollege.end.pStocks)}, with: ${Math.round(resWithCollege.end.pStocks)}`
  );

  // Check that college drain rows have lower effectiveAnnualSavings
  const collegeDrainRow = resWithCollege.perYearRows[5];
  assert.ok(
    collegeDrainRow.collegeDrain > 0,
    `Row at yearsFromNow=5 should have collegeDrain > 0; got ${collegeDrainRow.collegeDrain}`
  );
});

// ---------------------------------------------------------------------------
// T-019-02-12: Effective savings clamped at 0 (mtgSavingsAdjust > monthlySavings*12)
// ---------------------------------------------------------------------------
test('T-12: effectiveAnnualSavings clamped to 0 when mortgage costs exceed savings', () => {
  // Very high mortgage cost, very low savings
  const inp = baseInp({ monthlySavings: 500 }); // 6000/yr
  const opts = baseOptions({
    mortgageEnabled: true,
    mortgageInputs: {
      ownership: 'already-own', // no upfront deduction
      downPayment: 100000,
      closingCosts: 0,
      homePrice: 500000,
      rate: 0.065,
      term: 30,
      yearsPaid: 2,
      buyInYears: 0,
      propertyTax: 18000, // $1500/mo
      insurance: 3600,    // $300/mo
      hoa: 500,           // $500/mo
      sellAtFire: false,
    },
    rentMonthly: 500, // very cheap rent baseline → big mtgSavingsAdjust
  });
  const fireAge = 52;
  const result = accumulateToFire(inp, fireAge, opts);

  // All effectiveAnnualSavings entries should be >= 0
  for (const row of result.perYearRows) {
    assert.ok(
      row.effectiveAnnualSavings >= 0,
      `effectiveAnnualSavings must be >= 0; row age ${row.age} got ${row.effectiveAnnualSavings}`
    );
  }
});

// ---------------------------------------------------------------------------
// T-019-02-13: invest-lump-sum with pre-FIRE lump-sum age → drains pStocks
// ---------------------------------------------------------------------------
test('T-13: invest-lump-sum with pre-FIRE lumpSumEvent drains pStocks', () => {
  const inp = baseInp({ rogerStocks: 200000, rebeccaStocks: 0 });
  const lumpSumAge = 46; // < fireAge=52
  const brokerageBefore = 180000;
  const brokerageAfter = 50000; // drain = 130000
  const drain = brokerageBefore - brokerageAfter;

  // Mock payoffVsInvestFn that returns a lumpSumEvent
  const mockPviOut = {
    disabledReason: null,
    amortizationSplit: {
      invest: [],
    },
    lumpSumEvent: {
      age: lumpSumAge,
      brokerageBefore,
      brokerageAfter,
      actualDrawdown: drain,
    },
    homeSaleEvent: null,
    postSaleBrokerageAtFire: null,
  };
  const payoffVsInvestFn = () => mockPviOut;

  const opts = baseOptions({
    mortgageEnabled: true,
    mortgageStrategyOverride: 'invest-lump-sum',
    mortgageInputs: {
      ownership: 'buying-now',
      downPayment: 80000,
      closingCosts: 10000,
      homePrice: 400000,
      rate: 0.065,
      term: 30,
      yearsPaid: 0,
      buyInYears: 0,
      propertyTax: 6000,
      insurance: 1200,
      hoa: 0,
      sellAtFire: false,
    },
    rentMonthly: 2000,
    payoffVsInvestFn,
  });
  const fireAge = 52;

  // Run without lump sum for comparison
  const baseResult = accumulateToFire(inp, fireAge, baseOptions());
  const lumpSumResult = accumulateToFire(inp, fireAge, opts);

  // The row at lumpSumAge should have lumpSumDrainThisYear > 0
  const lumpSumYearsFromNow = lumpSumAge - inp.ageRoger;
  const lumpSumRow = lumpSumResult.perYearRows[lumpSumYearsFromNow];
  assert.ok(
    lumpSumRow && lumpSumRow.lumpSumDrainThisYear > 0,
    `Row at lumpSumAge should have lumpSumDrainThisYear > 0; got ${lumpSumRow && lumpSumRow.lumpSumDrainThisYear}`
  );
  // Drain should equal brokerageBefore - brokerageAfter
  assert.ok(
    Math.abs(lumpSumRow.lumpSumDrainThisYear - drain) < 1,
    `lumpSumDrainThisYear should equal ${drain}; got ${lumpSumRow.lumpSumDrainThisYear}`
  );
});

// ---------------------------------------------------------------------------
// T-019-02-14: User audit regression — the bug scenario
// cashSavings=80000, mtgBuyInYears=2, mtgDown=120000, mtgClose=17000, age=42, fireAge=53
// Expected: result.end.pCash === 0
// ---------------------------------------------------------------------------
test('T-14: user audit regression — pCash === 0 at FIRE after buy-in drains cash', () => {
  const inp = baseInp({
    ageRoger: 42,
    cashSavings: 80000,
    otherAssets: 0,
    rogerStocks: 215000,
    rebeccaStocks: 230000,
    roger401kTrad: 26454,
    roger401kRoth: 58000,
    monthlySavings: 1000,
    contrib401kTrad: 16500,
    contrib401kRoth: 2900,
    empMatch: 7200,
  });
  const opts = baseOptions({
    mortgageEnabled: true,
    mortgageInputs: {
      ownership: 'buying-in',
      buyInYears: 2,
      downPayment: 120000,
      closingCosts: 17000,
      homePrice: 500000,
      rate: 0.065,
      term: 30,
      yearsPaid: 0,
      propertyTax: 6000,
      insurance: 1200,
      hoa: 0,
      sellAtFire: false,
    },
    rentMonthly: 2690,
  });
  const fireAge = 53;
  const result = accumulateToFire(inp, fireAge, opts);

  // The buy-in at year 2 costs 137000. Cash = 80000, so all cash is gone
  // and 57000 drains from stocks. Then 9 years of 0.5%/yr growth on $0 = $0.
  assert.strictEqual(
    Math.round(result.end.pCash),
    0,
    `pCash at FIRE should be 0; got $${Math.round(result.end.pCash)}`
  );
});

// ---------------------------------------------------------------------------
// Invariant checks
// ---------------------------------------------------------------------------

test('INV-01: all end pools are finite numbers', () => {
  const result = accumulateToFire(baseInp(), 52, baseOptions());
  const { end } = result;
  for (const [key, val] of Object.entries(end)) {
    assert.ok(Number.isFinite(val), `end.${key} must be finite; got ${val}`);
  }
});

test('INV-02: all end pools >= 0', () => {
  const result = accumulateToFire(baseInp(), 52, baseOptions());
  const { end } = result;
  for (const [key, val] of Object.entries(end)) {
    assert.ok(val >= 0, `end.${key} must be >= 0; got ${val}`);
  }
});

test('INV-03: perYearRows.length === fireAge - currentAge', () => {
  const inp = baseInp({ ageRoger: 40 });
  const fireAge = 55;
  const result = accumulateToFire(inp, fireAge, baseOptions());
  assert.strictEqual(result.perYearRows.length, fireAge - 40);
});

test('INV-04: perYearRows[0].pCash === inp.cashSavings + inp.otherAssets (no upfront deduction case)', () => {
  const inp = baseInp({ cashSavings: 30000, otherAssets: 5000 });
  const result = accumulateToFire(inp, 52, baseOptions());
  const firstRow = result.perYearRows[0];
  assert.ok(
    Math.abs(firstRow.pCash - (30000 + 5000)) < 1,
    `firstRow.pCash should be 35000 (no deductions); got ${firstRow.pCash}`
  );
});

test('INV-05: pStocks in every row is finite and >= 0', () => {
  const result = accumulateToFire(baseInp(), 52, baseOptions());
  for (const row of result.perYearRows) {
    assert.ok(Number.isFinite(row.pStocks), `pStocks must be finite at age ${row.age}`);
    assert.ok(row.pStocks >= 0, `pStocks must be >= 0 at age ${row.age}`);
  }
});

test('INV-06: pCash in every row is finite and >= 0', () => {
  const result = accumulateToFire(baseInp(), 52, baseOptions());
  for (const row of result.perYearRows) {
    assert.ok(Number.isFinite(row.pCash), `pCash must be finite at age ${row.age}`);
    assert.ok(row.pCash >= 0, `pCash must be >= 0 at age ${row.age}`);
  }
});

test('INV-07: agePerson1 fallback resolves to same result as ageRoger', () => {
  const rrInp = baseInp({ ageRoger: 40 });
  const genericInp = { ...rrInp, agePerson1: 40 };
  delete genericInp.ageRoger;

  const resultRR = accumulateToFire(rrInp, 52, baseOptions());
  const resultGeneric = accumulateToFire(genericInp, 52, baseOptions());

  assert.ok(Math.abs(resultRR.end.pCash - resultGeneric.end.pCash) < 1,
    'agePerson1 fallback should produce same result as ageRoger');
  assert.ok(Math.abs(resultRR.end.pStocks - resultGeneric.end.pStocks) < 1,
    'agePerson1 fallback should produce same pStocks');
});

test('INV-08: person1Stocks / person2Stocks fallback works (Generic dashboard)', () => {
  const genericInp = {
    agePerson1: 42,
    person1_401kTrad: 50000,
    person1_401kRoth: 30000,
    person1Stocks: 100000,
    person2Stocks: 50000,
    cashSavings: 20000,
    otherAssets: 0,
    returnRate: 0.07,
    return401k: 0.07,
    inflationRate: 0.03,
    monthlySavings: 1000,
    contrib401kTrad: 16500,
    contrib401kRoth: 2900,
    empMatch: 7200,
    endAge: 95,
    taxTrad: 0.22,
    stockGainPct: 0.6,
    raiseRate: 0.03,
    annualIncome: 120000,
    ssClaimAge: 67,
  };
  const result = accumulateToFire(genericInp, 52, baseOptions());
  assert.ok(result && result.end, 'Generic inp fallback should produce valid result');
  assert.ok(Number.isFinite(result.end.pStocks) && result.end.pStocks > 0,
    'Generic pStocks should be positive finite');
});
