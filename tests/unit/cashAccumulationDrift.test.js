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
// Expected post-fix: all three simulators report identical pCash entering FIRE.
// Expected pre-fix:   the two buggy paths diverge by ~$84,500.
// ==================================================================================

import { test } from 'node:test';
import assert from 'node:assert';

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
// Path B — _simulateStrategyLifetime (BUGGY).
// Mirrors FIRE-Dashboard.html lines 10602–10614 verbatim. No buy-in handling.
// ----------------------------------------------------------------------
function accumulate_simulateStrategyLifetime() {
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
// Path C — computeWithdrawalStrategy (BUGGY — same shape as Path B).
// Mirrors FIRE-Dashboard.html lines 11032–11041 verbatim.
// ----------------------------------------------------------------------
function accumulate_computeWithdrawalStrategy() {
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

test('REPRO: cash-balance drift across simulator paths', () => {
  const A = accumulate_projectFullLifecycle();
  const B = accumulate_simulateStrategyLifetime();
  const C = accumulate_computeWithdrawalStrategy();

  // For the user's audit-data check, we expect the canonical Lifecycle path
  // to drain pCash to ~0 by FIRE (buy-in $137k drains $80k cash + $57k stocks
  // at age 44, then 9 years of 0.5%/yr growth on $0 stays $0).
  assert.strictEqual(
    Math.round(A.pCash),
    0,
    `projectFullLifecycle should drain pCash to 0 by FIRE; got $${Math.round(A.pCash)}`
  );

  // The two buggy paths should each be carrying a phantom ~$84.5k.
  const expectedPhantom = 80000 * Math.pow(1.005, 11);
  assert.ok(
    B.pCash > 80000 && Math.abs(B.pCash - expectedPhantom) < 100,
    `_simulateStrategyLifetime carries phantom cash ≈ $${Math.round(expectedPhantom)}; got $${Math.round(B.pCash)}`
  );
  assert.ok(
    C.pCash > 80000 && Math.abs(C.pCash - expectedPhantom) < 100,
    `computeWithdrawalStrategy carries phantom cash ≈ $${Math.round(expectedPhantom)}; got $${Math.round(C.pCash)}`
  );

  // The drift between Path A and Path B/C must be > $80k for the user's scenario.
  const driftAB = Math.abs(A.pCash - B.pCash);
  const driftAC = Math.abs(A.pCash - C.pCash);
  assert.ok(driftAB > 80000, `Drift A↔B must exceed $80k; got $${Math.round(driftAB)}`);
  assert.ok(driftAC > 80000, `Drift A↔C must exceed $80k; got $${Math.round(driftAC)}`);
});

test('POST-FIX SENTINEL (currently expected to FAIL): all three sims agree on pCash', () => {
  const A = accumulate_projectFullLifecycle();
  const B = accumulate_simulateStrategyLifetime();
  const C = accumulate_computeWithdrawalStrategy();

  // Once the fix lands, A === B === C (within rounding). This sentinel will
  // pass once `accumulateToFire` is shared across all three call sites.
  // PRE-FIX: this assertion FAILS — that's the proof.
  const tolerance = 1; // dollar
  assert.ok(
    Math.abs(A.pCash - B.pCash) < tolerance,
    `pCash mismatch A vs B: A=$${Math.round(A.pCash)} B=$${Math.round(B.pCash)} drift=$${Math.round(Math.abs(A.pCash - B.pCash))}`
  );
  assert.ok(
    Math.abs(A.pCash - C.pCash) < tolerance,
    `pCash mismatch A vs C: A=$${Math.round(A.pCash)} C=$${Math.round(C.pCash)} drift=$${Math.round(Math.abs(A.pCash - C.pCash))}`
  );
});
