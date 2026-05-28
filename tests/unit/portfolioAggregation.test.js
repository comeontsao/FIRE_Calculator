/*
 * tests/unit/portfolioAggregation.test.js — locks the RR Plan-tab portfolio
 * aggregation contract for feature 032 (Roth IRA Accounts).
 *
 * The two new Roth IRA balances (rogerRothIra, rebeccaRothIra) are LOCKED
 * until age 59.5 per FR-019. This test pins that semantic at the calc layer:
 *   - computeAccessible(inp) MUST NOT include either Roth IRA balance.
 *   - computeLocked(inp)     MUST include the Roth IRA sum on top of the
 *                            existing 401K (Trad + Roth) pool.
 *   - computeNetWorth(inp)   MUST equal accessible + locked.
 *
 * The HTML inline calcAccessible / calcLocked / calcNetWorth functions
 * MUST mirror this module's behavior — it is the SOURCE-OF-TRUTH.
 *
 * Contract reference: specs/032-roth-ira-accounts/spec.md (FR-005, FR-006, FR-019)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAccessible,
  computeLocked,
  computeNetWorth,
} from '../../calc/portfolioAggregation.js';

function makeInp(overrides = {}) {
  return {
    roger401kTrad: 25_000,
    roger401kRoth: 58_000,
    rogerStocks: 190_000,
    rebeccaStocks: 200_000,
    cashSavings: 0,
    otherAssets: 0,
    rogerRothIra: 0,
    rebeccaRothIra: 59_021,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// FR-006 — Accessible sub-label MUST NOT include either Roth IRA balance.
// ---------------------------------------------------------------------------
test('computeAccessible: excludes Roth IRA balances (locked per FR-019) — feature 032 T010', () => {
  const inp = makeInp({ rogerRothIra: 50_000, rebeccaRothIra: 50_000 });
  const accessible = computeAccessible(inp);
  // Accessible = rogerStocks + rebeccaStocks + cash + other only.
  assert.equal(accessible, 190_000 + 200_000 + 0 + 0,
    `Accessible must NOT include Roth IRA balances; got ${accessible}`);
});

test('computeAccessible: zero-Roth-IRA case identical to pre-feature baseline — feature 032 T010', () => {
  const inp = makeInp({ rogerRothIra: 0, rebeccaRothIra: 0 });
  assert.equal(computeAccessible(inp), 190_000 + 200_000);
});

// ---------------------------------------------------------------------------
// FR-005 — Locked sub-label MUST include both Roth IRA balances.
// ---------------------------------------------------------------------------
test('computeLocked: includes 401K Trad + Roth + both Roth IRA balances — feature 032 T010', () => {
  const inp = makeInp({ rogerRothIra: 10_000, rebeccaRothIra: 20_000 });
  const locked = computeLocked(inp);
  // Locked = roger401kTrad + roger401kRoth + rogerRothIra + rebeccaRothIra.
  assert.equal(locked, 25_000 + 58_000 + 10_000 + 20_000,
    `Locked must include both Roth IRA balances; got ${locked}`);
});

test('computeLocked: with Roger=0/Rebecca=59021 default — sums to 401K + 59021 — feature 032 T010', () => {
  const inp = makeInp();
  assert.equal(computeLocked(inp), 25_000 + 58_000 + 0 + 59_021);
});

// ---------------------------------------------------------------------------
// FR-004 — Whole Portfolio Net Worth = accessible + locked.
// ---------------------------------------------------------------------------
test('computeNetWorth: equals computeAccessible + computeLocked — feature 032 T010', () => {
  const inp = makeInp({ rogerRothIra: 25_000, rebeccaRothIra: 25_000 });
  const nw = computeNetWorth(inp);
  assert.equal(nw, computeAccessible(inp) + computeLocked(inp));
});

test('computeNetWorth: increasing rogerRothIra by $X raises net worth by exactly $X — feature 032 T010', () => {
  const baseInp = makeInp({ rogerRothIra: 0, rebeccaRothIra: 0 });
  const bumpedInp = makeInp({ rogerRothIra: 50_000, rebeccaRothIra: 0 });
  assert.equal(
    computeNetWorth(bumpedInp) - computeNetWorth(baseInp),
    50_000,
    'Bumping rogerRothIra by $50K must raise net worth by exactly $50K',
  );
});
