/*
 * tests/unit/withdrawal.test.js — locks the calc/withdrawal.js contract (T037).
 *
 * Covers the three fixture classes from
 *   specs/001-modular-calc-engine/contracts/withdrawal.contract.md §Fixtures:
 *     1. Three-phase canonical — one retirement year per phase.
 *     2. RMD-active — age 73 with Trad pool > 0; minimum distribution enforced.
 *     3. Infeasibility — tiny pools, large spend ⇒ feasible:false, deficitReal>0.
 *        **Locks FR-013** (silent-shortfall elimination).
 *
 * RED phase: calc/withdrawal.js does not yet exist. The import below will
 * fail with ERR_MODULE_NOT_FOUND — expected until T045.
 *
 * Contract invariants (withdrawal.contract.md §Invariants):
 *   - When feasible, netSpendReal === annualSpendReal.
 *   - When !feasible, deficitReal === annualSpendReal - netSpendReal (positive).
 *   - Sum of draws equals annualSpendReal + taxOwedReal when feasible.
 *   - RMD enforced at age ≥ rmdAgeStart if trad401kReal > 0.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeWithdrawal,
  POOL_KEYS,
  STRATEGY_ORDER,
} from '../../calc/withdrawal.js';

const TAX = Object.freeze({
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

test('withdrawal: three-phase canonical — preUnlock/unlocked/ssActive draws sum correctly', () => {
  // preUnlock year (age 55): taxable + cash + roth(401K) accessible; no trad
  // (locked), no SS. Feature 032: `roth401kReal` is the renamed legacy field;
  // `rothIraReal` is the NEW pool (set to 0 in this legacy fixture).
  const pools = {
    trad401kReal: 400_000,
    roth401kReal: 100_000,
    rothIraReal: 0,
    taxableStocksReal: 300_000,
    cashReal: 50_000,
  };
  const result = computeWithdrawal({
    annualSpendReal: 60_000,
    pools,
    phase: 'preUnlock',
    ssIncomeReal: 0,
    age: 55,
    tax: TAX,
    strategy: 'tax-optimized',
  });

  assert.equal(typeof result, 'object');
  assert.equal(result.feasible, true, 'ample taxable+cash ⇒ feasible');
  assert.ok(
    Math.abs(result.netSpendReal - 60_000) < 1e-6,
    `feasible ⇒ netSpend === annualSpend (got ${result.netSpendReal})`,
  );

  // Sum invariant: from{Trad+Roth+Taxable+Cash+SS} === annualSpend + taxOwed.
  const totalDraw =
    result.fromTradReal +
    result.fromRothReal +
    result.fromTaxableReal +
    result.fromCashReal +
    result.fromSSReal;
  assert.ok(
    Math.abs(totalDraw - (60_000 + result.taxOwedReal)) < 1e-6,
    `sum of draws must equal annualSpend + taxOwed; got ${totalDraw} vs ${60_000 + result.taxOwedReal}`,
  );

  // preUnlock phase: SS should be zero.
  assert.equal(result.fromSSReal, 0, 'preUnlock ⇒ fromSSReal === 0');
});

test('withdrawal: RMD-active at age 73 forces a minimum Trad draw regardless of strategy', () => {
  // Age 73, trad401kReal > 0. Even a strategy preferring taxable must pull RMD.
  // Feature 032: `roth401kReal` renamed from legacy `rothIraReal`; the new
  // Roth IRA pool is 0 here.
  const pools = {
    trad401kReal: 500_000,
    roth401kReal: 100_000,
    rothIraReal: 0,
    taxableStocksReal: 500_000,
    cashReal: 100_000,
  };
  const result = computeWithdrawal({
    annualSpendReal: 50_000,
    pools,
    phase: 'ssActive',
    ssIncomeReal: 20_000,
    age: 73,
    tax: TAX,
    // Deliberately pick a strategy that would avoid Trad if RMD weren't enforced.
    strategy: 'trad-last',
  });

  assert.equal(result.feasible, true);
  assert.ok(
    result.fromTradReal > 0,
    `age ≥ rmdAgeStart with trad401k>0 MUST draw from Trad (RMD enforcement); got fromTrad=${result.fromTradReal}`,
  );
});

test('withdrawal: infeasibility returns feasible:false with deficitReal > 0 (FR-013)', () => {
  // Tiny pools, large spend, no SS income — should NOT silently absorb into any pool.
  // Feature 032: `roth401kReal` renamed from legacy `rothIraReal`.
  const pools = {
    trad401kReal: 1_000,
    roth401kReal: 1_000,
    rothIraReal: 0,
    taxableStocksReal: 5_000,
    cashReal: 2_000,
  };
  const result = computeWithdrawal({
    annualSpendReal: 80_000,
    pools,
    phase: 'preUnlock',
    ssIncomeReal: 0,
    age: 55,
    tax: TAX,
    strategy: 'tax-optimized',
  });

  assert.equal(result.feasible, false, 'tiny pools vs $80k spend ⇒ feasible:false');
  assert.equal(typeof result.deficitReal, 'number', 'infeasible ⇒ deficitReal present');
  assert.ok(
    result.deficitReal > 0,
    `deficitReal MUST be > 0 when infeasible (FR-013 locks no silent absorption); got ${result.deficitReal}`,
  );
  // Contract: deficitReal === annualSpendReal - netSpendReal.
  assert.ok(
    Math.abs(result.deficitReal - (80_000 - result.netSpendReal)) < 1e-6,
    `deficit identity: deficitReal === annualSpend - netSpend; got ${result.deficitReal} vs ${80_000 - result.netSpendReal}`,
  );
});

// ---------------------------------------------------------------------------
// Feature 032 — Roth IRA pool wiring (T002, T003).
// ---------------------------------------------------------------------------

test('withdrawal: POOL_KEYS contains `rothIra` at index 3 (immediately after `roth`) — feature 032 T002', () => {
  assert.ok(Array.isArray(POOL_KEYS) || POOL_KEYS instanceof Array || typeof POOL_KEYS[Symbol.iterator] === 'function',
    'POOL_KEYS must be iterable / array-like');
  const keys = Array.from(POOL_KEYS);
  assert.deepEqual(
    keys,
    ['cash', 'taxable', 'roth', 'rothIra', 'trad'],
    `POOL_KEYS must be exactly ['cash','taxable','roth','rothIra','trad']; got ${JSON.stringify(keys)}`,
  );
  assert.equal(keys[3], 'rothIra', 'rothIra must sit at index 3 (immediately after roth)');
});

test('withdrawal: every STRATEGY_ORDER entry contains `rothIra` immediately after `roth` — feature 032 T003', () => {
  const strategies = Object.keys(STRATEGY_ORDER);
  assert.ok(strategies.length >= 1, 'STRATEGY_ORDER must have at least one strategy');

  for (const strategyName of strategies) {
    const order = Array.from(STRATEGY_ORDER[strategyName]);
    const rothIdx = order.indexOf('roth');
    const rothIraIdx = order.indexOf('rothIra');
    assert.notEqual(
      rothIdx,
      -1,
      `strategy "${strategyName}" must include 'roth'; got ${JSON.stringify(order)}`,
    );
    assert.notEqual(
      rothIraIdx,
      -1,
      `strategy "${strategyName}" must include 'rothIra'; got ${JSON.stringify(order)}`,
    );
    assert.equal(
      rothIraIdx,
      rothIdx + 1,
      `strategy "${strategyName}" must place 'rothIra' IMMEDIATELY after 'roth'; got ${JSON.stringify(order)} (roth@${rothIdx}, rothIra@${rothIraIdx})`,
    );
  }
});

// ---------------------------------------------------------------------------
// Feature 032 — User Story 4 (T027) — Roth IRA pool integration in
// computeWithdrawal. Locks Contract Invariants I1 (tax-free), I2 (RMD-exempt),
// I3 (locked pre-59.5). See specs/032-roth-ira-accounts/contracts/roth-ira-pool.contract.md
// ---------------------------------------------------------------------------

test('withdrawal: I1 — wRothIra draws do NOT add to ordinary income (tax-free)', () => {
  // Two parallel scenarios. Scenario A: only Roth IRA funds the spend.
  // Scenario B: only Trad funds the same spend. Scenario A's taxable
  // ordinary income must be < Scenario B's — proving Roth IRA draws are
  // tax-free (do not contribute to ordinary income).
  //
  // Strategy 'roth-ladder' draws Roth 401K first, then Roth IRA. With
  // roth401kReal=0 and rothIraReal large, the strategy draws purely from rothIra.
  const baseParams = {
    annualSpendReal: 40_000,
    phase: 'ssActive',
    ssIncomeReal: 0,
    age: 65,
    tax: TAX,
    strategy: 'roth-ladder',
  };

  const rothIraOnly = computeWithdrawal({
    ...baseParams,
    pools: {
      trad401kReal: 100_000,
      roth401kReal: 0,
      rothIraReal: 200_000,   // funds the spend tax-free
      taxableStocksReal: 0,
      cashReal: 0,
    },
  });

  const tradOnly = computeWithdrawal({
    ...baseParams,
    strategy: 'trad-first',
    pools: {
      trad401kReal: 200_000,
      roth401kReal: 0,
      rothIraReal: 0,
      taxableStocksReal: 0,
      cashReal: 0,
    },
  });

  // Roth IRA scenario must be feasible (tax-free → no convergence drift).
  assert.equal(rothIraOnly.feasible, true, 'Roth-IRA-only must be feasible at $40k spend');
  assert.ok(
    rothIraOnly.fromRothIraReal > 0,
    `Roth-IRA-only must draw from rothIra; got fromRothIraReal=${rothIraOnly.fromRothIraReal}`,
  );
  // Tax-free invariant: Roth IRA draws produce ZERO tax (no ordinary, no LTCG).
  assert.ok(
    rothIraOnly.taxOwedReal < 1e-6,
    `I1 violation: Roth IRA draws must be tax-free; got taxOwedReal=${rothIraOnly.taxOwedReal}`,
  );
  // Trad-only baseline owes non-trivial tax (sanity — proves taxation differential).
  assert.ok(
    tradOnly.taxOwedReal > 100,
    `Trad-only baseline must owe non-trivial tax; got ${tradOnly.taxOwedReal}`,
  );
});

test('withdrawal: I2 — RMD branch at age 75 draws ONLY from Trad, never from rothIra', () => {
  // Even at RMD age with both Trad and Roth IRA accessible, the RMD branch
  // is trad-only. drawn.rothIra may still be non-zero IF the strategy
  // ordering reaches rothIra to cover the rest of the spend — but the RMD
  // floor itself must not pull from rothIra.
  //
  // Strategy 'trad-last' would normally avoid Trad — but RMD overrides it.
  // With pTrad=$100k at age 75, RMD divisor 24.6 ⇒ RMD ≈ $4065.
  const result = computeWithdrawal({
    annualSpendReal: 0, // ZERO spend isolates the RMD draw from strategy-driven draws
    pools: {
      trad401kReal: 100_000,
      roth401kReal: 0,
      rothIraReal: 50_000,
      taxableStocksReal: 0,
      cashReal: 0,
    },
    phase: 'ssActive',
    ssIncomeReal: 0,
    age: 75,
    tax: TAX,
    strategy: 'trad-last',
  });

  // RMD forces a Trad draw even though spend=0 (RMD is a tax requirement,
  // not a spending need). Roth IRA must NOT be touched by the RMD branch.
  assert.ok(
    result.fromTradReal > 1_000,
    `I2 setup: RMD must force a non-trivial trad draw at age 75; got fromTradReal=${result.fromTradReal}`,
  );
  assert.equal(
    result.fromRothIraReal,
    0,
    `I2 violation: RMD branch must NEVER draw from rothIra; got fromRothIraReal=${result.fromRothIraReal}`,
  );
});

test('withdrawal: I3 — pre-59.5 lock: rothIra inaccessible, wRothIra === 0', () => {
  // Age 55 (pre-unlock). Even with $200k Roth IRA available and large spend,
  // the simulator must NOT draw from rothIra. The household relies on
  // taxable + cash instead. If those are insufficient, feasible:false with
  // deficitReal > 0 — never a silent draw from the locked rothIra pool.
  const result = computeWithdrawal({
    annualSpendReal: 40_000,
    pools: {
      trad401kReal: 0,
      roth401kReal: 0,
      rothIraReal: 200_000,    // present but locked
      taxableStocksReal: 50_000, // enough to fund the spend
      cashReal: 0,
    },
    phase: 'preUnlock',
    ssIncomeReal: 0,
    age: 55,
    tax: TAX,
    strategy: 'roth-ladder', // would prefer roth/rothIra if accessible
  });

  assert.equal(
    result.fromRothIraReal,
    0,
    `I3 violation: pre-59.5 (age 55, phase=preUnlock) must NOT draw from rothIra; got fromRothIraReal=${result.fromRothIraReal}`,
  );
  // Funding must come from accessible pools (taxable).
  assert.ok(
    result.fromTaxableReal > 0,
    `I3 sanity: with taxable available, the spend must be funded from taxable; got fromTaxableReal=${result.fromTaxableReal}`,
  );
});
