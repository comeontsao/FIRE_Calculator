// =============================================================================
// calc/assumptions.js — Feature 033 (math-assumptions-cleanup)
//
// THE single defining location for cross-simulator math assumptions.
// Contract of record: specs/033-math-assumptions-cleanup/contracts/assumptions.contract.md
//
// Inputs : none (pure constants + one pure function)
// Outputs: CASH_REAL_RETURN : number
//            FRAME: real-$ — the rate at which an UNDISTURBED cash pool's
//            purchasing power changes per simulated year. 0.0 = cash tracks
//            inflation exactly (statement dollars still rise with inflation in
//            Book-Value display). Locked to 0.0 by clarification Q1
//            (2026-06-05); SUPERSEDES feature 030 FR-016's hardcoded ×1.005,
//            whose comment also mislabeled the frame as "nominal" — the
//            multiplier always applied to a today's-$ pool.
//          realRate(nominal, inflation) : number
//            Fisher conversion of a statement-dollar (nominal) rate to a
//            purchasing-power (real) rate: (1 + nominal)/(1 + inflation) − 1.
//            Identities: realRate(x, 0) === x; realRate(x, x) === 0;
//            realRate(0.07, 0.04) ≈ 0.0288462 (NOT the 0.03 subtraction gives).
// Consumers: every lifecycle/accumulation/signed simulator in BOTH
//          FIRE-Dashboard.html and FIRE-Dashboard-Generic.html,
//          calc/accumulateToFire.js, calc/getCanonicalInputs.js,
//          tests/unit/mathAssumptions.test.js
//
// Loading rules (Constitution V + the 2026-06-05 global-scope lesson):
//   - UMD classic script; NO top-level `export` keyword.
//   - MUST be the FIRST <script src="calc/..."> tag in both HTML head blocks
//     so every later classic script and inline simulator can capture the
//     globals at evaluation time.
//   - Top-level lexical names are globally unique across all browser-loaded
//     calc scripts (guarded by tests/unit/globalScopeCollision.test.js).
// =============================================================================
'use strict';

// FRAME: real-$ — see Outputs contract above. Bounds-checked at load (fail
// fast: every simulator depends on this value; a typo'd 5.0 would silently
// corrupt every projection).
const CASH_REAL_RETURN = 0.0;

if (!Number.isFinite(CASH_REAL_RETURN) || CASH_REAL_RETURN < -0.05 || CASH_REAL_RETURN > 0.05) {
  throw new Error('[assumptions] CASH_REAL_RETURN out of bounds [-0.05, 0.05]: ' + CASH_REAL_RETURN);
}

/**
 * Fisher conversion: statement-dollar (nominal) rate → purchasing-power (real)
 * rate. Replaces the subtraction shortcut (`nominal − inflation`), which
 * overstates real growth by ≈ nominal×inflation (~0.115%/yr at 7%/4%) —
 * compounding into a material overstatement over a multi-decade horizon.
 *
 * @param {number} nominal   plain decimal rate (0.07 = 7%)
 * @param {number} inflation plain decimal rate (0.04 = 4%); must be > -1
 * @returns {number} real rate, plain decimal
 */
function realRate(nominal, inflation) {
  return (1 + nominal) / (1 + inflation) - 1;
}

// ---------------------------------------------------------------------------
// UMD wrapper — works under Node `require` AND under file:// classic <script>.
// NOTE: the const name must be UNIQUE across all browser-loaded calc/*.js —
// classic <script> tags share ONE global lexical scope, so a duplicate
// top-level `const` throws SyntaxError and silently kills the later module.
// ---------------------------------------------------------------------------
const _assumptionsApi = {
  CASH_REAL_RETURN: CASH_REAL_RETURN,
  realRate: realRate,
};
if (typeof module !== 'undefined' && module && module.exports) {
  module.exports = _assumptionsApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.CASH_REAL_RETURN = CASH_REAL_RETURN;
  globalThis.realRate = realRate;
}
