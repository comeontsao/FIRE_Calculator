/*
 * calc/cashSweep.js — Cash-sweep pure helper (Feature 030).
 *
 * Feature: 030-cash-sweep-stocks
 * Contract: specs/030-cash-sweep-stocks/contracts/cash-sweep.contract.md
 *
 * Inputs:
 *   - pCash:      number (real-$) — year-end cash balance (post-compounding, post-withdrawals)
 *   - pStocks:    number (real-$) — year-end stocks balance
 *   - threshold:  number (real-$) — cash floor to keep (clamped to >= 0 internally)
 *   - age:        number          — simulated age this iteration (may be fractional for partial-FIRE-year)
 *   - currentAge: number          — user's currentAge (inp.ageRoger or inp.agePerson1)
 *   - enabled:    boolean         — toggle state (inp.cashSweepEnabled)
 *
 * Output: { pCash: number, pStocks: number, swept: number }
 *
 * Behavior (canonical decision table from contract):
 *   - enabled === false → no-op (return inputs unchanged, swept = 0)
 *   - enabled && age <= currentAge → no-op (year-0 preservation per /speckit-clarify 2026-05-11)
 *   - enabled && age > currentAge && pCash <= threshold → no-op
 *   - enabled && age > currentAge && pCash > threshold → sweep excess:
 *       pCash = threshold; pStocks += (pCash - threshold); swept = pCash - threshold
 *   - NaN / Infinity inputs → defensive no-op
 *   - threshold < 0 → clamped to 0
 *
 * Consumers (Constitution Principle VI):
 *   - signedLifecycleEndBalance (FIRE-Dashboard.html + Generic)
 *   - simulateRetirementOnlySigned (FIRE-Dashboard.html + Generic)
 *   - _simulateStrategyLifetime (FIRE-Dashboard.html + Generic)
 *   - computeWithdrawalStrategy (FIRE-Dashboard.html + Generic)
 *   - accumulateToFire (calc/accumulateToFire.js)
 *   - tests/unit/cashSweepHelper.test.js (regression pin)
 *
 * Purity (Constitution II): no DOM, no globals, no module-scope mutation, deterministic.
 *
 * FRAME: real-$ — every numeric input/output is in today's purchasing power.
 *   Threshold is NEVER multiplied by an inflation factor.
 *
 * UMD wrapper per Constitution V — works under Node `require` AND under file://
 * classic <script>. Mirrors calc/calcAudit.js's pattern (lines ~1060-1074).
 */

function _applyCashSweep(pCash, pStocks, threshold, age, currentAge, enabled) {
  // Defensive guards: NaN / Infinity inputs → no-op preserves whatever state was passed in
  if (!Number.isFinite(pCash) || !Number.isFinite(pStocks)) {
    return { pCash, pStocks, swept: 0 };
  }

  // Disabled → no-op
  if (!enabled) {
    return { pCash, pStocks, swept: 0 };
  }

  // Year-0 preservation per clarification 2026-05-11:
  // starting cash is preserved even if it exceeds threshold.
  // age <= currentAge catches the year-0 case (age === currentAge) AND any
  // accidental pre-currentAge ages (defensive — shouldn't happen in normal flow).
  if (typeof age === 'number' && typeof currentAge === 'number' && age <= currentAge) {
    return { pCash, pStocks, swept: 0 };
  }

  // Threshold clamped to >= 0 (UI should reject negatives, but be defensive).
  const _threshold = Number.isFinite(threshold) ? Math.max(0, threshold) : 0;

  // Strict greater-than: pCash exactly equal to threshold → no-op.
  if (pCash <= _threshold) {
    return { pCash, pStocks, swept: 0 };
  }

  // Sweep fires.
  const swept = pCash - _threshold;
  return {
    pCash: _threshold,
    pStocks: pStocks + swept,
    swept: swept,
  };
}

// ---------------------------------------------------------------------------
// UMD wrapper — works under Node `require` AND under file:// classic <script>.
// Mirror calc/calcAudit.js lines ~1067-1073. Constitution Principle V.
// ---------------------------------------------------------------------------

const _api = { _applyCashSweep: _applyCashSweep };
if (typeof module !== 'undefined' && module && module.exports) {
  module.exports = _api;
}
if (typeof globalThis !== 'undefined') {
  globalThis._applyCashSweep = _applyCashSweep;
}
