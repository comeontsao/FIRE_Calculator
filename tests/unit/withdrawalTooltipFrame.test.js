// ==================== UNIT TESTS: withdrawalTooltipFrame =================
// Feature 031 — Lifecycle Strategy Parity, User Story 4 (Defect 3).
// Spec:     specs/031-lifecycle-strategy-parity/spec.md (FR-005)
// Contract: specs/031-lifecycle-strategy-parity/contracts/lifecycle-strategy-parity.contract.md (C4)
//
// THE BUG: in renderRothLadder's tooltip, the per-pool draw BARS render the
// Book-Value (nominal) series (wTradBookValue, wRothBookValue, ...), but the
// afterBody "Total drawn" and "Ordinary income" lines were computed from RAW
// real-$ fields (r.wTrad+r.wRoth+r.wStocks+r.wCash, r.ordIncome). So the bars
// (nominal) didn't sum to "Total drawn" (real-$), and ordinary income looked
// smaller than the Trad bar. Two frames stacked in one tooltip.
//
// THE FIX (C4): per-pool lines + "Total drawn" + "ordinary income" share ONE
// frame (Book-Value, matching the bars) and reconcile within rounding.
// Purchasing power MAY appear but as a CLEARLY-LABELED separate comparison —
// never presented as the sum of the displayed bars.
//
// All tests are pure-Node — no DOM, no browser globals.
// Module under test: calc/withdrawalTooltipFrame.js
// =========================================================================

import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const tooltipMod = require(
  path.resolve(__dirname, '..', '..', 'calc', 'withdrawalTooltipFrame.js'),
);
const displayConverter = require(
  path.resolve(__dirname, '..', '..', 'calc', 'displayConverter.js'),
);

const { _buildWithdrawalTooltipLines } = tooltipMod;
const { toBookValue } = displayConverter;

// ---------------------------------------------------------------------------
// Shared fixture — a retirement-year row 11 years out (age 53, currentAge 42,
// 3% inflation). Real-$ draw pools roughly mirror the bug report:
//   Trad real $80k, Roth real $79k, Stocks real $0, Cash real $0
// Book-Value factor at 11y @3% = 1.03^11 ≈ 1.38423, so:
//   Trad BV ≈ $110.7k, Roth BV ≈ $109.4k  →  totalDrawn BV ≈ $220.1k
//   totalDrawn real-$ (purchasing power) = $159k
// The whole point: the displayed bars (BV) must sum to the displayed total (BV),
// while purchasing power ($159k) is a SEPARATE labeled comparison.
// ---------------------------------------------------------------------------
const CURRENT_AGE = 42;
const INFLATION = 0.03;

function makeRow(overrides = {}) {
  const age = overrides.age ?? 53;
  const base = {
    age,
    wTrad: 80000, wRoth: 79000, wStocks: 0, wCash: 0,
    ordIncome: 80000,
    taxOwed: 12000,
    effRate: 0.15,
    rmd: 0,
    shortfall: 0,
  };
  const r = { ...base, ...overrides };
  // Book-Value companions, exactly as recalcAll attaches them (see RR :12880-12883).
  r.wTradBookValue   = toBookValue(r.wTrad,   r.age, CURRENT_AGE, INFLATION);
  r.wRothBookValue   = toBookValue(r.wRoth,   r.age, CURRENT_AGE, INFLATION);
  r.wStocksBookValue = toBookValue(r.wStocks, r.age, CURRENT_AGE, INFLATION);
  r.wCashBookValue   = toBookValue(r.wCash,   r.age, CURRENT_AGE, INFLATION);
  return r;
}

const FRAME_OPTS = {
  toBookValue,
  currentAge: CURRENT_AGE,
  inflationRate: INFLATION,
};

// ---------------------------------------------------------------------------
// Case 1: per-pool lines + total drawn share ONE frame and reconcile.
// This is the core C4 guarantee.
// ---------------------------------------------------------------------------
test('case 1: per-pool Book-Value lines sum to the Book-Value "total drawn" within rounding', () => {
  const r = makeRow();
  const out = _buildWithdrawalTooltipLines(r, FRAME_OPTS);

  // Per-pool lines must be in Book-Value (matches the chart bars).
  const poolSum =
    out.pools.trad + out.pools.roth + out.pools.stocks + out.pools.cash;

  assert.ok(
    Math.abs(poolSum - out.totalDrawn) < 1,
    `Book-Value pools (${poolSum.toFixed(2)}) must reconcile with totalDrawn ` +
    `(${out.totalDrawn.toFixed(2)}) within rounding`,
  );

  // And those pool values must equal the bar series (the *BookValue fields),
  // proving the tooltip total is in the SAME frame the bars render.
  assert.strictEqual(out.pools.trad, r.wTradBookValue);
  assert.strictEqual(out.pools.roth, r.wRothBookValue);
  assert.strictEqual(out.pools.stocks, r.wStocksBookValue);
  assert.strictEqual(out.pools.cash, r.wCashBookValue);
});

// ---------------------------------------------------------------------------
// Case 2: "total drawn" must NOT equal the raw real-$ sum (the old bug).
// At 11 years @3% the Book-Value total is ~38% larger than the real-$ sum.
// ---------------------------------------------------------------------------
test('case 2: totalDrawn is Book-Value, NOT the raw real-$ pool sum (regression of the frame-mix bug)', () => {
  const r = makeRow();
  const out = _buildWithdrawalTooltipLines(r, FRAME_OPTS);

  const rawRealSum = r.wTrad + r.wRoth + r.wStocks + r.wCash; // 159000
  assert.ok(
    out.totalDrawn > rawRealSum + 1000,
    `Book-Value totalDrawn (${out.totalDrawn.toFixed(0)}) must exceed the ` +
    `real-$ sum (${rawRealSum}) at 11 years of 3% inflation`,
  );
});

// ---------------------------------------------------------------------------
// Case 3: ordinary income is in the SAME frame as the Trad bar (no longer
// "smaller than the Trad bar" by an inflation factor).
// ---------------------------------------------------------------------------
test('case 3: ordinary income is Book-Value, consistent with the Trad bar frame', () => {
  const r = makeRow();
  const out = _buildWithdrawalTooltipLines(r, FRAME_OPTS);

  const expectedOrdBV = toBookValue(r.ordIncome, r.age, CURRENT_AGE, INFLATION);
  assert.ok(
    Math.abs(out.ordIncome - expectedOrdBV) < 1,
    `ordIncome (${out.ordIncome.toFixed(2)}) must be Book-Value ` +
    `(${expectedOrdBV.toFixed(2)})`,
  );
  // ordIncome (real $80k) equals the Trad real draw ($80k), so in Book-Value
  // they must also match — proving same-frame consistency with the Trad bar.
  assert.ok(
    Math.abs(out.ordIncome - out.pools.trad) < 1,
    `ordIncome BV (${out.ordIncome.toFixed(0)}) should match Trad bar BV ` +
    `(${out.pools.trad.toFixed(0)}) for this fixture`,
  );
});

// ---------------------------------------------------------------------------
// Case 4: purchasing power is a SEPARATE, clearly-labeled comparison field —
// it equals the raw real-$ sum and is NOT the displayed-bar total.
// ---------------------------------------------------------------------------
test('case 4: purchasing power is a labeled separate field equal to the real-$ sum', () => {
  const r = makeRow();
  const out = _buildWithdrawalTooltipLines(r, FRAME_OPTS);

  assert.ok(out.purchasingPower, 'purchasingPower field must exist');
  const rawRealSum = r.wTrad + r.wRoth + r.wStocks + r.wCash;
  assert.ok(
    Math.abs(out.purchasingPower.value - rawRealSum) < 1,
    `purchasingPower.value (${out.purchasingPower.value}) must equal the ` +
    `real-$ pool sum (${rawRealSum})`,
  );
  // It must be flagged as a comparison, never the bar total.
  assert.strictEqual(out.purchasingPower.isComparison, true);
  assert.notStrictEqual(
    out.purchasingPower.value, out.totalDrawn,
    'purchasing power must not be presented as the displayed-bar total',
  );
});

// ---------------------------------------------------------------------------
// Case 5: identity at age === currentAge — Book-Value equals real-$, so the
// total and the purchasing-power comparison coincide (no inflation gap yet).
// ---------------------------------------------------------------------------
test('case 5: at age === currentAge, totalDrawn equals purchasing power (zero years out)', () => {
  const r = makeRow({ age: CURRENT_AGE });
  const out = _buildWithdrawalTooltipLines(r, FRAME_OPTS);

  assert.ok(
    Math.abs(out.totalDrawn - out.purchasingPower.value) < 1,
    `At currentAge the Book-Value total (${out.totalDrawn}) and purchasing ` +
    `power (${out.purchasingPower.value}) must coincide`,
  );
});

// ---------------------------------------------------------------------------
// Case 6: tax owed is converted to Book-Value too (same-frame discipline).
// ---------------------------------------------------------------------------
test('case 6: taxOwed is Book-Value', () => {
  const r = makeRow();
  const out = _buildWithdrawalTooltipLines(r, FRAME_OPTS);

  const expectedTaxBV = toBookValue(r.taxOwed, r.age, CURRENT_AGE, INFLATION);
  assert.ok(
    Math.abs(out.taxOwed - expectedTaxBV) < 1,
    `taxOwed (${out.taxOwed.toFixed(2)}) must be Book-Value (${expectedTaxBV.toFixed(2)})`,
  );
});
