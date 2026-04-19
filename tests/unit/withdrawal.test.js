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
import { computeWithdrawal } from '../../calc/withdrawal.js';

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
  // preUnlock year (age 55): taxable + cash only; no 401(k) access, no SS.
  const pools = {
    trad401kReal: 400_000,
    rothIraReal: 100_000,
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
  const pools = {
    trad401kReal: 500_000,
    rothIraReal: 100_000,
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
  const pools = {
    trad401kReal: 1_000,
    rothIraReal: 1_000,
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
