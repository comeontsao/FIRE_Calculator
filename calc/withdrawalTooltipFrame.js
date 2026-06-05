/*
 * calc/withdrawalTooltipFrame.js — Withdrawal Strategy tooltip single-frame
 * assembly (Feature 031, User Story 4 / Defect 3).
 *
 * Feature:  031-lifecycle-strategy-parity
 * Contract: specs/031-lifecycle-strategy-parity/contracts/lifecycle-strategy-parity.contract.md (C4)
 * Spec:     specs/031-lifecycle-strategy-parity/spec.md (FR-005)
 *
 * WHY THIS EXISTS:
 *   The Withdrawal Strategy chart's per-pool BARS render the Book-Value
 *   (nominal) series — wTradBookValue, wRothBookValue, wStocksBookValue,
 *   wCashBookValue (see RR FIRE-Dashboard.html :12880-12883, :14493-14500).
 *   The tooltip's afterBody "Total drawn" / "Ordinary income" lines used to be
 *   computed from RAW real-$ fields, so the displayed bars (nominal) did not
 *   sum to the displayed total (real-$), and ordinary income looked smaller
 *   than the Trad bar. Two frames stacked in one tooltip.
 *
 *   This pure helper assembles all the tooltip numbers in ONE frame
 *   (Book-Value, matching the bars) so the per-pool lines and "Total drawn"
 *   reconcile within rounding. Purchasing power is returned as a SEPARATE,
 *   clearly-labeled comparison field — never the sum of the displayed bars.
 *
 * Inputs:
 *   - row: a Withdrawal Strategy per-year row. Reads:
 *       Book-Value pools: wTradBookValue, wRothBookValue, wRothIraBookValue,
 *                         wStocksBookValue, wCashBookValue (fall back to raw
 *                         real-$ if a companion is non-finite — mirrors the
 *                         bar series Number.isFinite guards).
 *                         `wRothIraBookValue` is the feature-032 Roth IRA
 *                         draw companion.
 *       real-$ fields:    wTrad, wRoth, wRothIra, wStocks, wCash (for purchasing
 *                         power), ordIncome, taxOwed (converted to Book-Value
 *                         here), age (for the inflation factor).
 *   - opts: {
 *       toBookValue: (val, age, currentAge, inflationRate) => number,  // pure converter (calc/displayConverter.js)
 *       currentAge:  number,
 *       inflationRate: number,
 *     }
 *
 * Output (structured, frame-tagged so callers + tests can reason about frames):
 *   {
 *     frame: 'bookValue',
 *     pools:  { trad, roth, rothIra, stocks, cash },   // Book-Value $ — equals the bar series
 *                                                       // `rothIra` is the feature-032 Roth IRA pool line
 *     totalDrawn,                             // Book-Value $ — sum of pools
 *     ordIncome,                              // Book-Value $
 *     taxOwed,                                // Book-Value $
 *     purchasingPower: { value, isComparison: true },  // real-$ today's-spending comparison
 *   }
 *
 * Consumers (Constitution Principle VI):
 *   - renderRothLadder tooltip afterBody (FIRE-Dashboard.html + Generic)
 *   - tests/unit/withdrawalTooltipFrame.test.js (regression pin)
 *
 * Purity (Constitution II): no DOM, no globals, no module-scope mutation,
 *   deterministic. The Book-Value converter is INJECTED so this stays
 *   Node-testable without the browser.
 *
 * FRAME: Book-Value (nominal) primary; purchasing power is the only real-$
 *   field and is explicitly flagged isComparison.
 *
 * UMD wrapper per Constitution V — works under Node `require` AND under file://
 * classic <script>. Mirrors calc/cashSweep.js.
 */

function _finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : (Number.isFinite(fallback) ? fallback : 0);
}

function _buildWithdrawalTooltipLines(row, opts) {
  const r = row || {};
  const o = opts || {};
  const toBV = typeof o.toBookValue === 'function' ? o.toBookValue : null;
  const currentAge = o.currentAge;
  const inflationRate = o.inflationRate;
  const age = r.age;

  // Pure converter — falls back to identity if the injected converter or the
  // age/currentAge/inflation context is missing, so a bad context degrades to
  // real-$ rather than NaN (mirrors the bar series' defensive posture).
  const conv = (val) => {
    if (toBV && typeof age === 'number' && typeof currentAge === 'number' &&
        typeof inflationRate === 'number') {
      const out = toBV(val, age, currentAge, inflationRate);
      return Number.isFinite(out) ? out : (Number.isFinite(val) ? val : 0);
    }
    return Number.isFinite(val) ? val : 0;
  };

  // Per-pool lines — read the SAME Book-Value series the bars render
  // (Number.isFinite fallback to raw real-$, mirroring RR :14493-14500).
  // Feature 032: `rothIra` is the NEW Roth IRA pool — fed by wRothIraBookValue
  // with real-$ wRothIra fallback (mirrors the existing pool patterns).
  const pools = {
    trad:    _finiteOr(r.wTradBookValue,    r.wTrad),
    roth:    _finiteOr(r.wRothBookValue,    r.wRoth),
    rothIra: _finiteOr(r.wRothIraBookValue, r.wRothIra),
    stocks:  _finiteOr(r.wStocksBookValue,  r.wStocks),
    cash:    _finiteOr(r.wCashBookValue,    r.wCash),
  };

  // Total drawn — sum of the displayed Book-Value pools so it reconciles with
  // the bars within rounding.
  const totalDrawn = pools.trad + pools.roth + pools.rothIra + pools.stocks + pools.cash;

  // Ordinary income + tax owed — converted to Book-Value so they sit in the
  // same frame as the Trad bar.
  const ordIncome = conv(_finiteOr(r.ordIncome, 0));
  const taxOwed = conv(_finiteOr(r.taxOwed, 0));

  // Purchasing power — the raw real-$ pool sum, kept as an explicitly-labeled
  // today's-spending comparison. NEVER presented as the displayed-bar total.
  // Feature 032: include `wRothIra` so the comparison stays consistent with the
  // displayed bars (sum of the same pool set, just in the real-$ frame).
  const purchasingPowerValue =
    _finiteOr(r.wTrad, 0) + _finiteOr(r.wRoth, 0) + _finiteOr(r.wRothIra, 0) +
    _finiteOr(r.wStocks, 0) + _finiteOr(r.wCash, 0);

  return {
    frame: 'bookValue',
    pools: pools,
    totalDrawn: totalDrawn,
    ordIncome: ordIncome,
    taxOwed: taxOwed,
    purchasingPower: { value: purchasingPowerValue, isComparison: true },
  };
}

// ---------------------------------------------------------------------------
// FALLBACK assembler (Feature 031, US4 follow-up / Defect 3b).
//
// WHY THIS EXISTS:
//   renderRothLadder's afterBody guards the primary helper above with
//   `typeof _buildWithdrawalTooltipLines === 'function'`. If that UMD global is
//   ever unavailable at runtime, the inline code used to fall through to a
//   branch that computed "Total drawn" / "Ordinary income" from RAW real-$
//   fields (r.wTrad+r.wRoth+..., r.ordIncome) — while the BARS always read the
//   *BookValue series. That re-introduced the exact frame-mix defect US4 fixed:
//   Book-Value bars but real-$ total in the same tooltip.
//
//   This helper computes the SAME Book-Value numbers as the bars (and as the
//   primary helper), so the total reconciles with the bars whether or not the
//   external helper loads. The HTML fallback branch calls this exact function.
//
// Inputs:
//   - row: the same per-year strategy row the bars read.
//   - conv: a Book-Value converter ALREADY bound to (currentAge, inflationRate),
//           called as conv(realValue, age) → Book-Value number. In the browser
//           this wraps globalThis.displayConverter.toBookValue; pass null to
//           degrade gracefully to real-$ (mirrors the bar series' Number.isFinite
//           fallback — never NaN).
//
// Output: identical shape to _buildWithdrawalTooltipLines (frame: 'bookValue').
//
// Purity (Constitution II): no DOM, no globals, deterministic.
// FRAME: Book-Value (nominal) primary; purchasing power is the only real-$
//   field and is explicitly flagged isComparison.
// ---------------------------------------------------------------------------
function _buildWithdrawalTooltipFallback(row, conv) {
  const r = row || {};
  // Same converter posture as the primary helper: identity when missing/non-finite.
  const toBV = (val, age) => {
    if (typeof conv === 'function' && typeof age === 'number') {
      const out = conv(_finiteOr(val, 0), age);
      return Number.isFinite(out) ? out : _finiteOr(val, 0);
    }
    return _finiteOr(val, 0);
  };

  // Pools — read the SAME *BookValue series the bars render, with the same
  // Number.isFinite → raw real-$ fallback (mirrors RR :14513-14520).
  // Feature 032: `rothIra` is the NEW Roth IRA pool — same fallback posture.
  const pools = {
    trad:    _finiteOr(r.wTradBookValue,    r.wTrad),
    roth:    _finiteOr(r.wRothBookValue,    r.wRoth),
    rothIra: _finiteOr(r.wRothIraBookValue, r.wRothIra),
    stocks:  _finiteOr(r.wStocksBookValue,  r.wStocks),
    cash:    _finiteOr(r.wCashBookValue,    r.wCash),
  };

  const totalDrawn = pools.trad + pools.roth + pools.rothIra + pools.stocks + pools.cash;
  const ordIncome = toBV(r.ordIncome, r.age);
  const taxOwed = toBV(r.taxOwed, r.age);

  const purchasingPowerValue =
    _finiteOr(r.wTrad, 0) + _finiteOr(r.wRoth, 0) + _finiteOr(r.wRothIra, 0) +
    _finiteOr(r.wStocks, 0) + _finiteOr(r.wCash, 0);

  return {
    frame: 'bookValue',
    pools: pools,
    totalDrawn: totalDrawn,
    ordIncome: ordIncome,
    taxOwed: taxOwed,
    purchasingPower: { value: purchasingPowerValue, isComparison: true },
  };
}

// ---------------------------------------------------------------------------
// UMD wrapper — works under Node `require` AND under file:// classic <script>.
// Mirror calc/cashSweep.js. Constitution Principle V.
// ---------------------------------------------------------------------------

// NOTE: the const name must be UNIQUE across all browser-loaded calc/*.js —
// classic <script> tags share ONE global lexical scope, so a duplicate
// top-level `const` throws SyntaxError and silently kills the entire module
// (pre-fix: `_api` here collided with calcAudit.js's `_api`).
const _withdrawalTooltipFrameApi = {
  _buildWithdrawalTooltipLines: _buildWithdrawalTooltipLines,
  _buildWithdrawalTooltipFallback: _buildWithdrawalTooltipFallback,
};
if (typeof module !== 'undefined' && module && module.exports) {
  module.exports = _withdrawalTooltipFrameApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis._buildWithdrawalTooltipLines = _buildWithdrawalTooltipLines;
  globalThis._buildWithdrawalTooltipFallback = _buildWithdrawalTooltipFallback;
}
