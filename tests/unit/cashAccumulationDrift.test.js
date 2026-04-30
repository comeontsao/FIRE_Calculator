// ==================== REPRO: cash-balance drift across simulators ====================
// Bug: `_simulateStrategyLifetime` (line ~10602) and `computeWithdrawalStrategy`
// (line ~11035) skip the home buy-in event during their inline accumulation
// loops, producing a phantom cash balance entering FIRE. Meanwhile
// `projectFullLifecycle` (line ~9349 / 9452) handles the buy-in correctly,
// drawing pCash to ~0.
//
// Repro inputs come straight from the user's audit dump (2026-04-30):
//   cashSavings=80000, mtgBuyInYears=2, mtgDownPayment=120000,
//   mtgClosingCosts=17000, ageRoger=42, fireAge=53.
//
// POST-FIX (feature 019 Step 3): both buggy paths now delegate to accumulateToFire.
// The sentinel confirms accumulateToFire (canonical) agrees with the reference
// projectFullLifecycle-style accumulation path.
// ==================================================================================

import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const { accumulateToFire } = require(path.join(REPO_ROOT, 'calc', 'accumulateToFire.js'));

// User's exact scenario from the audit dump.
const inp = {
  ageRoger: 42,
  fireAge: 53,
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
  // Mortgage
  mortgageEnabled: true,
  mtg: {
    ownership: 'buying-in',
    buyInYears: 2,
    downPayment: 120000,
    closingCosts: 17000,
  },
  // Real returns (matches the calc — nominal 7%, infl 3%, hence ~3.88%; for
  // this repro the precise rate doesn't matter, only that all three sims use
  // the SAME rate, which they do).
  realReturn401k: 0.07 / 1.03 - 1,
  realReturnStocks: 0.07 / 1.03 - 1,
};

const yrsToFire = inp.fireAge - inp.ageRoger; // 11

// ----------------------------------------------------------------------
// Path A — projectFullLifecycle (canonical, correct).
// Mirrors FIRE-Dashboard.html lines 9333–9475 (accumulation portion only).
// ----------------------------------------------------------------------
function accumulate_projectFullLifecycle() {
  let pTrad = inp.roger401kTrad;
  let pRoth = inp.roger401kRoth;
  let pStocks = inp.rogerStocks + inp.rebeccaStocks;
  let pCash = inp.cashSavings + inp.otherAssets;

  const mtg = inp.mtg;
  let mtgPurchased = false;
  const tradContrib = inp.contrib401kTrad + inp.empMatch;
  const rothContrib = inp.contrib401kRoth;
  const annualSavings = inp.monthlySavings * 12;

  for (let age = inp.ageRoger; age < inp.fireAge; age++) {
    const yearsFromNow = age - inp.ageRoger;

    // Delayed-purchase deduction (line 9452–9463 in HTML).
    if (mtg.ownership === 'buying-in' && !mtgPurchased && yearsFromNow >= mtg.buyInYears) {
      const upfrontCost = mtg.downPayment + mtg.closingCosts;
      if (pCash >= upfrontCost) {
        pCash -= upfrontCost;
      } else {
        const remainder = upfrontCost - Math.max(0, pCash);
        pCash = 0;
        pStocks = Math.max(0, pStocks - remainder);
      }
      mtgPurchased = true;
    }

    // Accumulation step (line 9635–9638).
    pTrad = pTrad * (1 + inp.realReturn401k) + tradContrib;
    pRoth = pRoth * (1 + inp.realReturn401k) + rothContrib;
    pStocks = pStocks * (1 + inp.realReturnStocks) + annualSavings;
    pCash *= 1.005;
  }
  return { pTrad, pRoth, pStocks, pCash };
}

// ----------------------------------------------------------------------
// Path B — _simulateStrategyLifetime (PRE-FIX reference — buggy inline).
// Preserved as-was to document the bug; tested only in REPRO test.
// Lines formerly at FIRE-Dashboard.html ~10602–10614, no buy-in handling.
// ----------------------------------------------------------------------
function accumulate_buggy_simulateStrategyLifetime() {
  let pTrad = inp.roger401kTrad;
  let pRoth = inp.roger401kRoth;
  let pStocks = inp.rogerStocks + inp.rebeccaStocks;
  let pCash = inp.cashSavings + (inp.otherAssets || 0);

  const tradContrib = (inp.contrib401kTrad || 0) + (inp.empMatch || 0);
  const rothContrib = inp.contrib401kRoth || 0;
  const effAnnualSavings = (inp.monthlySavings || 0) * 12;

  for (let y = 0; y < yrsToFire; y++) {
    pTrad = pTrad * (1 + inp.realReturn401k) + tradContrib;
    pRoth = pRoth * (1 + inp.realReturn401k) + rothContrib;
    pStocks = pStocks * (1 + inp.realReturnStocks) + effAnnualSavings;
    pCash *= 1.005;
  }
  return { pTrad, pRoth, pStocks, pCash };
}

// ----------------------------------------------------------------------
// Path C — computeWithdrawalStrategy (PRE-FIX reference — buggy inline).
// Preserved as-was to document the bug; tested only in REPRO test.
// Lines formerly at FIRE-Dashboard.html ~11032–11041, no buy-in handling.
// ----------------------------------------------------------------------
function accumulate_buggy_computeWithdrawalStrategy() {
  let pTrad = inp.roger401kTrad;
  let pRoth = inp.roger401kRoth;
  let pStocks = inp.rogerStocks + inp.rebeccaStocks;
  let pCash = inp.cashSavings + inp.otherAssets;

  const tradContrib = inp.contrib401kTrad + inp.empMatch;
  const rothContrib = inp.contrib401kRoth;

  for (let y = 0; y < yrsToFire; y++) {
    pTrad = pTrad * (1 + inp.realReturn401k) + tradContrib;
    pRoth = pRoth * (1 + inp.realReturn401k) + rothContrib;
    pStocks = pStocks * (1 + inp.realReturnStocks) + inp.monthlySavings * 12;
    pCash *= 1.005;
  }
  return { pTrad, pRoth, pStocks, pCash };
}

// ----------------------------------------------------------------------
// Path B_fixed / C_fixed — post-fix: both delegate to accumulateToFire.
// Matches what _simulateStrategyLifetime and computeWithdrawalStrategy now do
// in the HTML after feature 019 Step 3. Uses the same options bundle shape
// (no mortgage → buying-in buy-in fires via accumulateToFire internal loop).
// ----------------------------------------------------------------------
function accumulate_fixed_via_accumulateToFire() {
  // Mirrors the options passed by resolveAccumulationOptions in the no-college,
  // no-home2 browser context, but with mortgage enabled + buying-in to exercise
  // the buy-in logic that was previously missing.
  const opts = {
    mortgageEnabled: true,
    mortgageInputs: inp.mtg,
    mortgageStrategyOverride: 'invest-keep-paying',
    secondHomeEnabled: false,
    rentMonthly: 0,
  };
  // Provide return rates in the inp fields accumulateToFire reads.
  const inpFixed = Object.assign({}, inp, {
    returnRate: inp.realReturnStocks + (inp.inflationRate || 0),
    return401k: inp.realReturn401k + (inp.inflationRate || 0),
    inflationRate: inp.inflationRate || 0,
    agePerson1: inp.ageRoger,
  });
  return accumulateToFire(inpFixed, inp.fireAge, opts).end;
}

test('REPRO: pre-fix buggy paths carry phantom cash vs canonical accumulation', () => {
  const A = accumulate_projectFullLifecycle();
  const B = accumulate_buggy_simulateStrategyLifetime();
  const C = accumulate_buggy_computeWithdrawalStrategy();

  // For the user's audit-data check, we expect the canonical Lifecycle path
  // to drain pCash to ~0 by FIRE (buy-in $137k drains $80k cash + $57k stocks
  // at age 44, then 9 years of 0.5%/yr growth on $0 stays $0).
  assert.strictEqual(
    Math.round(A.pCash),
    0,
    `projectFullLifecycle should drain pCash to 0 by FIRE; got $${Math.round(A.pCash)}`
  );

  // The two buggy inline paths each carry a phantom ~$84.5k (not fixed yet in
  // these reference functions — they are preserved to document pre-fix behavior).
  const expectedPhantom = 80000 * Math.pow(1.005, 11);
  assert.ok(
    B.pCash > 80000 && Math.abs(B.pCash - expectedPhantom) < 100,
    `buggy _simulateStrategyLifetime carries phantom cash ≈ $${Math.round(expectedPhantom)}; got $${Math.round(B.pCash)}`
  );
  assert.ok(
    C.pCash > 80000 && Math.abs(C.pCash - expectedPhantom) < 100,
    `buggy computeWithdrawalStrategy carries phantom cash ≈ $${Math.round(expectedPhantom)}; got $${Math.round(C.pCash)}`
  );

  // The drift between Path A and the buggy paths must be > $80k for this scenario.
  const driftAB = Math.abs(A.pCash - B.pCash);
  const driftAC = Math.abs(A.pCash - C.pCash);
  assert.ok(driftAB > 80000, `Drift A↔buggy-B must exceed $80k; got $${Math.round(driftAB)}`);
  assert.ok(driftAC > 80000, `Drift A↔buggy-C must exceed $80k; got $${Math.round(driftAC)}`);
});

test('POST-FIX SENTINEL: accumulateToFire agrees with projectFullLifecycle on pCash', () => {
  // 019: SENTINEL now PASSES. _simulateStrategyLifetime and computeWithdrawalStrategy
  // both delegate to accumulateToFire, which handles the mortgage buy-in correctly.
  // This test confirms accumulateToFire produces the same pCash as the canonical
  // projectFullLifecycle accumulation path (Path A) for the user's audit scenario.
  const A = accumulate_projectFullLifecycle();
  const fixed = accumulate_fixed_via_accumulateToFire();

  const tolerance = 1; // dollar
  assert.ok(
    Math.abs(A.pCash - fixed.pCash) < tolerance,
    `pCash mismatch: canonical=$${Math.round(A.pCash)} accumulateToFire=$${Math.round(fixed.pCash)} drift=$${Math.round(Math.abs(A.pCash - fixed.pCash))}`
  );
});
