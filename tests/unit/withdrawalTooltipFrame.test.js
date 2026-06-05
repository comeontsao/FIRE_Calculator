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

const { _buildWithdrawalTooltipLines, _buildWithdrawalTooltipFallback } = tooltipMod;
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

// ===========================================================================
// FALLBACK-PATH REGRESSION (Feature 031, US4 follow-up).
//
// THE NEW BUG: the renderRothLadder afterBody guards the US4 helper with
// `typeof _buildWithdrawalTooltipLines === 'function'`. When that global is
// unavailable at runtime, the code falls through to an inline FALLBACK branch
// that computed total/ordIncome from RAW real-$ fields, while the BARS always
// read *BookValue. So with the helper absent, the tooltip mixed frames again:
// stacked bars in Book-Value but "Total drawn"/"Ordinary income" in real-$.
//
// THE FIX: `_buildWithdrawalTooltipFallback(row, conv)` computes the SAME
// Book-Value numbers as the bars (and the primary helper), so the total
// reconciles with the bars whether or not the external helper loads. The HTML
// fallback branch calls this exact function.
//
// `conv` is the same Book-Value converter the helper uses, already bound to
// (age, currentAge, inflationRate); here we bind it from displayConverter so
// the test mirrors the runtime (globalThis.displayConverter.toBookValue).
// ===========================================================================
const makeConv = (currentAge, inflationRate) =>
  (val, age) => toBookValue(val, age, currentAge, inflationRate);

test('fallback case A: _buildWithdrawalTooltipFallback exists and returns Book-Value pools matching the bars', () => {
  assert.strictEqual(
    typeof _buildWithdrawalTooltipFallback, 'function',
    'fallback computation must be an exported pure helper so the HTML fallback ' +
    'branch can reuse it and tests can pin its frame',
  );
  const r = makeRow();
  const conv = makeConv(CURRENT_AGE, INFLATION);
  const out = _buildWithdrawalTooltipFallback(r, conv);

  // Pools equal the *BookValue bar fields — same frame the chart renders.
  assert.strictEqual(out.pools.trad, r.wTradBookValue);
  assert.strictEqual(out.pools.roth, r.wRothBookValue);
  assert.strictEqual(out.pools.stocks, r.wStocksBookValue);
  assert.strictEqual(out.pools.cash, r.wCashBookValue);
});

test('fallback case B: totalDrawn is Book-Value (sum of *BookValue bars), NOT the raw real-$ sum', () => {
  const r = makeRow();
  const conv = makeConv(CURRENT_AGE, INFLATION);
  const out = _buildWithdrawalTooltipFallback(r, conv);

  const barSum =
    r.wTradBookValue + r.wRothBookValue + r.wStocksBookValue + r.wCashBookValue;
  assert.ok(
    Math.abs(out.totalDrawn - barSum) < 1,
    `fallback totalDrawn (${out.totalDrawn.toFixed(0)}) must equal the displayed ` +
    `Book-Value bar sum (${barSum.toFixed(0)})`,
  );

  const rawRealSum = r.wTrad + r.wRoth + r.wStocks + r.wCash; // 159000
  assert.ok(
    out.totalDrawn > rawRealSum + 1000,
    `fallback totalDrawn (${out.totalDrawn.toFixed(0)}) must NOT be the raw real-$ ` +
    `sum (${rawRealSum}) — that was the frame-mix defect`,
  );
});

test('fallback case C: ordIncome is converted to Book-Value, consistent with the Trad bar', () => {
  const r = makeRow();
  const conv = makeConv(CURRENT_AGE, INFLATION);
  const out = _buildWithdrawalTooltipFallback(r, conv);

  const expectedOrdBV = toBookValue(r.ordIncome, r.age, CURRENT_AGE, INFLATION);
  assert.ok(
    Math.abs(out.ordIncome - expectedOrdBV) < 1,
    `fallback ordIncome (${out.ordIncome.toFixed(2)}) must be Book-Value ` +
    `(${expectedOrdBV.toFixed(2)}), not raw real-$ (${r.ordIncome})`,
  );
});

test('fallback case D: parity — fallback output equals the primary helper output within rounding', () => {
  const r = makeRow();
  const conv = makeConv(CURRENT_AGE, INFLATION);
  const fb = _buildWithdrawalTooltipFallback(r, conv);
  const primary = _buildWithdrawalTooltipLines(r, FRAME_OPTS);

  assert.ok(Math.abs(fb.totalDrawn - primary.totalDrawn) < 1, 'totalDrawn parity');
  assert.ok(Math.abs(fb.ordIncome - primary.ordIncome) < 1, 'ordIncome parity');
  assert.ok(Math.abs(fb.taxOwed - primary.taxOwed) < 1, 'taxOwed parity');
  assert.ok(
    Math.abs(fb.purchasingPower.value - primary.purchasingPower.value) < 1,
    'purchasing-power parity',
  );
});

test('fallback case E: purchasing power stays the labeled real-$ comparison, not the bar total', () => {
  const r = makeRow();
  const conv = makeConv(CURRENT_AGE, INFLATION);
  const out = _buildWithdrawalTooltipFallback(r, conv);

  const rawRealSum = r.wTrad + r.wRoth + r.wStocks + r.wCash;
  assert.ok(
    Math.abs(out.purchasingPower.value - rawRealSum) < 1,
    `fallback purchasingPower (${out.purchasingPower.value}) must equal the real-$ ` +
    `sum (${rawRealSum})`,
  );
  assert.notStrictEqual(
    out.purchasingPower.value, out.totalDrawn,
    'purchasing power must not be presented as the displayed-bar total',
  );
});

test('fallback case F: degrades to real-$ pools without crashing when converter is missing', () => {
  // Mirror the bars: when a *BookValue companion is non-finite, fall back to
  // the raw real-$ pool — never NaN.
  const r = makeRow();
  delete r.wTradBookValue; // simulate a missing companion
  const out = _buildWithdrawalTooltipFallback(r, null); // no converter
  assert.strictEqual(out.pools.trad, r.wTrad, 'missing companion falls back to real-$ pool');
  assert.ok(Number.isFinite(out.totalDrawn), 'totalDrawn must stay finite');
  assert.ok(Number.isFinite(out.ordIncome), 'ordIncome must stay finite');
});

// ===========================================================================
// Feature 032 — User Story 4 (T028): Roth IRA tooltip line.
// The tooltip's per-pool breakdown must include a `rothIra` Book-Value field,
// reading from `wRothIraBookValue` and falling back to raw real-$ `wRothIra`
// when the companion is non-finite (mirrors the existing pool patterns).
// ===========================================================================

test('feature 032: tooltip includes rothIra line in Book-Value frame', () => {
  // Row with explicit Roth IRA draw companions (typical post-Book-Value augmentation).
  const r = makeRow({ wRothIra: 5000, wRothIraBookValue: 5500 });
  const out = _buildWithdrawalTooltipLines(r, FRAME_OPTS);

  assert.ok(out.pools, 'pools object must exist');
  assert.strictEqual(
    out.pools.rothIra,
    5500,
    `pools.rothIra must equal wRothIraBookValue (Book-Value frame); got ${out.pools.rothIra}`,
  );
});

test('feature 032: tooltip rothIra falls back to real-$ wRothIra when Book-Value companion missing', () => {
  // Mirrors existing pool patterns: when the Book-Value companion is
  // non-finite (or absent), the tooltip falls back to the raw real-$ field
  // so the line still renders rather than producing NaN.
  const r = makeRow({ wRothIra: 4200 });
  delete r.wRothIraBookValue;
  const out = _buildWithdrawalTooltipLines(r, FRAME_OPTS);

  assert.strictEqual(
    out.pools.rothIra,
    4200,
    `pools.rothIra must fall back to wRothIra real-$ when companion missing; got ${out.pools.rothIra}`,
  );
});
