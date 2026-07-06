// ==================== UNIT TESTS: accumulateToFire — retirement descriptor ====================
// Feature 036 — Explicit Retirement Status.
// Spec: specs/036-retirement-status/contracts/retirement-status.contract.md §C-1, §C-5.
//       specs/036-retirement-status/data-model.md ("Per-year employment income",
//       "Per-year contribution scale", INV-1/INV-2/INV-3).
//
// All tests are pure-Node — no DOM, no browser globals.
// The helper under test: calc/accumulateToFire.js
//
// Fixture design note: raiseRate === inflationRate is used throughout so the
// Fisher real-wage-growth multiplier realRate(raiseRate, inflationRate) === 0
// exactly (see calc/assumptions.js identity realRate(x,x) === 0), collapsing
// (1+0)^t === 1 for every year. This makes grossIncome closed-form-exact
// (equal to the raw per-year working-income sum) without needing to model
// compounding wage growth in the expected values.
// ==================================================================================

import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const { accumulateToFire } = require(path.resolve(__dirname, '..', '..', 'calc', 'accumulateToFire.js'));
const { realRate } = require(path.resolve(__dirname, '..', '..', 'calc', 'assumptions.js'));

// ---------------------------------------------------------------------------
// Minimal fixture builders (mirrors tests/unit/accumulateToFire.test.js style)
// ---------------------------------------------------------------------------

/** Minimal valid inp with no mortgage, no H2, no college, flat tax rate. */
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
    taxRate: 0.22,       // flat-rate override path — deterministic tax
    taxTrad: 0.22,
    stockGainPct: 0.6,
    raiseRate: 0.03,     // === inflationRate → realRate(raiseRate, inflation) === 0
    annualIncome: 120000,
    annualSpend: 0,
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

const EPS = 0.01; // 1 cent — floating-point tolerance

// ---------------------------------------------------------------------------
// Fixture: retired-now (C-5)
// households:[{income, retirementAge === currentAge}] → transition age ===
// currentAge → accumulation loop produces ZERO years (for age = currentAge;
// age < fireAge===currentAge; ...) never executes.
// ---------------------------------------------------------------------------
test('retired-now: zero accumulation years, no working income, no growth', () => {
  const inp = baseInp();
  const opts = baseOptions({
    retirement: { households: [{ income: 100000, retirementAge: inp.ageRoger }] },
  });
  const result = accumulateToFire(inp, inp.ageRoger, opts);

  assert.strictEqual(result.perYearRows.length, 0, 'retired-now: no accumulation years should run');

  // End pools should be exactly the untouched starting pools (loop never ran).
  const expectedPTrad = inp.roger401kTrad;
  const expectedPRoth = inp.roger401kRoth;
  const expectedPStocks = inp.rogerStocks + inp.rebeccaStocks;
  const expectedPCash = inp.cashSavings + inp.otherAssets;

  assert.strictEqual(result.end.pTrad, expectedPTrad, 'pTrad unchanged with zero accumulation years');
  assert.strictEqual(result.end.pRoth, expectedPRoth, 'pRoth unchanged with zero accumulation years');
  assert.strictEqual(result.end.pStocks, expectedPStocks, 'pStocks unchanged with zero accumulation years');
  assert.strictEqual(result.end.pCash, expectedPCash, 'pCash unchanged with zero accumulation years');
});

// ---------------------------------------------------------------------------
// Fixture: off-revert-parity (INV-1, C-5)
// options.retirement absent/undefined → byte-identical to v7 behavior.
// ---------------------------------------------------------------------------
test('off-revert-parity: options.retirement absent vs explicitly undefined are byte-identical', () => {
  const inp = baseInp();
  const fireAge = 52;

  const optsNoKey = baseOptions();
  const optsUndefinedKey = baseOptions({ retirement: undefined });

  const resultNoKey = accumulateToFire(inp, fireAge, optsNoKey);
  const resultUndefinedKey = accumulateToFire(inp, fireAge, optsUndefinedKey);

  assert.deepStrictEqual(resultUndefinedKey, resultNoKey,
    'options.retirement undefined must be byte-identical to options.retirement absent (INV-1)');
});

test('off-revert-parity: default path (no retirement descriptor) matches pre-036 closed-form math', () => {
  // Reuses the exact closed-form check from tests/unit/accumulateToFire.test.js
  // T-01 to give this new file its own genuine regression net for the
  // untouched (options.retirement absent) code path — not just self-consistency.
  const inp = baseInp({ annualSpend: undefined }); // match legacy T-01 fixture (no annualSpend key)
  const opts = baseOptions();
  const fireAge = 52; // 10 years
  const result = accumulateToFire(inp, fireAge, opts);
  const { end, perYearRows } = result;

  assert.strictEqual(perYearRows.length, fireAge - inp.ageRoger);

  const realReturn401k = realRate(inp.return401k, inp.inflationRate);
  const tradContrib = inp.contrib401kTrad + inp.empMatch;
  const rothContrib = inp.contrib401kRoth;
  const years = fireAge - inp.ageRoger;

  const r401k = 1 + realReturn401k;
  const expectedTrad = inp.roger401kTrad * Math.pow(r401k, years) + tradContrib * (Math.pow(r401k, years) - 1) / realReturn401k;
  const expectedRoth = inp.roger401kRoth * Math.pow(r401k, years) + rothContrib * (Math.pow(r401k, years) - 1) / realReturn401k;

  assert.ok(Math.abs(end.pTrad - expectedTrad) < 1, `pTrad closed-form: expected ~${Math.round(expectedTrad)}, got ${Math.round(end.pTrad)}`);
  assert.ok(Math.abs(end.pRoth - expectedRoth) < 1, `pRoth closed-form: expected ~${Math.round(expectedRoth)}, got ${Math.round(end.pRoth)}`);
});

// ---------------------------------------------------------------------------
// Fixture: single-earner masking
// households:[{income:X, retirementAge:A}] with currentAge < A < (would-be
// later fireAge). Per contract C-1.1, caller passes fireAge === A (the
// transition age). Every accumulation year (age < A) must use the descriptor
// income X — NOT inp.annualIncome — with scale === 1 throughout (single
// earner never partially masked before their own retirement age).
// ---------------------------------------------------------------------------
test('single-earner masking: uses descriptor income (not inp.annualIncome), full scale until transition', () => {
  const retirementAge = 50;
  const descriptorIncome = 150000;
  const inp = baseInp({
    annualIncome: 999999, // decoy — must be ignored when retirement descriptor present
  });
  const opts = baseOptions({
    retirement: { households: [{ income: descriptorIncome, retirementAge }] },
  });

  const result = accumulateToFire(inp, retirementAge, opts);
  const { perYearRows } = result;

  assert.strictEqual(perYearRows.length, retirementAge - inp.ageRoger,
    'single-earner masking: accumulator stops at transition age (last year is A-1)');
  assert.strictEqual(perYearRows[perYearRows.length - 1].age, retirementAge - 1,
    'last accumulation year must be retirementAge - 1');

  const pretax401kEmployeeFull = inp.contrib401kTrad + inp.contrib401kRoth; // 19400
  const stockContributionFull = inp.monthlySavings * 12; // 12000 (no mortgage/college/h2 drains)

  for (const row of perYearRows) {
    // Full scale (===1) every year — single earner is still working for the
    // entire accumulation window (retirementAge > age holds for all age < A).
    assert.strictEqual(row.grossIncome, descriptorIncome,
      `grossIncome must equal descriptor income ${descriptorIncome} at age ${row.age}, not inp.annualIncome`);
    assert.strictEqual(row.pretax401kEmployee, pretax401kEmployeeFull,
      `pretax401kEmployee must be unscaled (full) at age ${row.age}`);
    assert.strictEqual(row.stockContribution, stockContributionFull,
      `stockContribution (planned) must be unscaled (full) at age ${row.age}`);
    assert.strictEqual(row.stockContributionActual, stockContributionFull,
      `stockContributionActual must equal planned (no shortfall) at age ${row.age}`);
  }
});

// ---------------------------------------------------------------------------
// Fixture: ss-independence (INV-3, C-5)
// accumulateToFire does not model SS/passive income at all — the descriptor
// must not change behavior based on ssClaimAge, and no SS-shaped field
// should appear on any row. SS is handled downstream (in the retirement-
// phase drawdown loop), not in this accumulation-only module.
// ---------------------------------------------------------------------------
test('ss-independence: retirement descriptor output is unaffected by ssClaimAge', () => {
  const retirementAge = 50;
  const opts = (ssClaimAge) => baseOptions({
    retirement: { households: [{ income: 150000, retirementAge }] },
  });

  const resultEarlySS = accumulateToFire(baseInp({ ssClaimAge: 62 }), retirementAge, opts(62));
  const resultLateSS = accumulateToFire(baseInp({ ssClaimAge: 70 }), retirementAge, opts(70));

  assert.deepStrictEqual(resultEarlySS, resultLateSS,
    'accumulateToFire output must be identical regardless of ssClaimAge (INV-3 — SS is downstream)');

  // Structural guard: the retirement descriptor must not add/remove any row
  // field (e.g. no new ssIncome-shaped field) relative to the non-retirement
  // (default) row schema — it only changes VALUES of income/contribution
  // fields that already exist. SS/passive income is handled entirely
  // downstream in the retirement-phase drawdown loop, never in this module.
  const inpNoRetirement = baseInp({ ssClaimAge: 62 });
  const resultNoRetirement = accumulateToFire(inpNoRetirement, retirementAge, baseOptions());
  const retiredRowKeys = Object.keys(resultEarlySS.perYearRows[0]).sort();
  const defaultRowKeys = Object.keys(resultNoRetirement.perYearRows[0]).sort();
  assert.deepStrictEqual(retiredRowKeys, defaultRowKeys,
    'retirement descriptor must not change the row schema (no SS-related field added)');
});

// ---------------------------------------------------------------------------
// Fixture: staggered-generic (INV-5, C-5)
// Two earners, Y1 < Y2, incomes A & B.
//   age < Y1:        workingIncome = A + B  (both working, scale === 1)
//   Y1 <= age < Y2:  workingIncome = B only (earner A retired, scale === B/(A+B))
//   age >= Y2:       no accumulation years (transition age === Y2)
// ---------------------------------------------------------------------------
test('staggered-generic: interim years mask to the still-working earner only', () => {
  const currentAge = 42;
  const incomeA = 100000; // earner 1 — retires first
  const incomeB = 80000;  // earner 2 — retires second
  const Y1 = currentAge + 3; // 45
  const Y2 = currentAge + 6; // 48 — household transition age

  const inp = baseInp({ ageRoger: currentAge, annualIncome: 999999 });
  const opts = baseOptions({
    retirement: {
      households: [
        { income: incomeA, retirementAge: Y1 },
        { income: incomeB, retirementAge: Y2 },
      ],
    },
  });

  const result = accumulateToFire(inp, Y2, opts);
  const { perYearRows } = result;

  assert.strictEqual(perYearRows.length, Y2 - currentAge, 'accumulator stops at the household transition age Y2');
  assert.strictEqual(perYearRows[perYearRows.length - 1].age, Y2 - 1);

  const pretax401kFull = inp.contrib401kTrad + inp.contrib401kRoth; // 19400
  const stockContribFull = inp.monthlySavings * 12; // 12000
  const totalIncome = incomeA + incomeB; // 180000
  const scaleB = incomeB / totalIncome; // 4/9

  for (const row of perYearRows) {
    if (row.age < Y1) {
      // Both earners working — full income, full scale.
      assert.strictEqual(row.grossIncome, totalIncome,
        `age ${row.age} (< Y1): grossIncome must be A+B = ${totalIncome}`);
      assert.strictEqual(row.pretax401kEmployee, pretax401kFull,
        `age ${row.age} (< Y1): pretax401kEmployee must be full (scale 1)`);
      assert.strictEqual(row.stockContribution, stockContribFull,
        `age ${row.age} (< Y1): stockContribution must be full (scale 1)`);
    } else {
      // Y1 <= age < Y2 — only earner B still working.
      assert.strictEqual(row.grossIncome, incomeB,
        `age ${row.age} (>= Y1): grossIncome must be B only = ${incomeB}`);
      assert.ok(Math.abs(row.pretax401kEmployee - pretax401kFull * scaleB) < EPS,
        `age ${row.age} (>= Y1): pretax401kEmployee must scale to B/(A+B); expected ~${pretax401kFull * scaleB}, got ${row.pretax401kEmployee}`);
      assert.ok(Math.abs(row.stockContribution - stockContribFull * scaleB) < EPS,
        `age ${row.age} (>= Y1): stockContribution must scale to B/(A+B); expected ~${stockContribFull * scaleB}, got ${row.stockContribution}`);
      assert.ok(Math.abs(row.stockContributionActual - row.stockContribution) < EPS,
        `age ${row.age}: no shortfall expected — stockContributionActual should equal planned`);
    }
  }
});
