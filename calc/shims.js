/*
 * calc/shims.js — Node-importable glue layer (NOT a pure calc module).
 *
 * Feature: 005-canonical-public-launch (FR-001 / FR-009)
 *
 * Inputs:  legacy inline-shape arguments from existing HTML call sites
 *          (signatures below match the actual in-file call sites byte-for-byte
 *          per FR-002 — DO NOT change the argument order without auditing
 *          every HTML call site in both FIRE-Dashboard.html and
 *          FIRE-Dashboard-Generic.html).
 * Outputs: inline-shape return values (number | {years,months,endBalance,sim,feasible} | boolean)
 * Consumers: FIRE-Dashboard.html, FIRE-Dashboard-Generic.html — ~10 call sites each
 *
 * Exported signatures (match HTML call sites exactly):
 *   - yearsToFIRE(inp, annualSpend)                                 → number
 *   - findFireAgeNumerical(inp, annualSpend, mode)                  → { years, months, endBalance, sim, feasible }
 *   - _evaluateFeasibilityAtAge(inp, annualSpend, age, mode)        → boolean
 *   - findMinAccessibleAtFireNumerical(inp, annualSpend, fireAge, mode) → number
 *
 * Glue-layer rationale (research.md §R1): this module reads `window._solveFireAge`,
 * `window._evaluateFeasibility`, `window._runLifecycle` and `window.getCanonicalInputs`
 * at call time and wraps each with try/catch + documented fallback +
 * console.error prefix. It delegates 100% of formulas to the pure canonical
 * modules — no calculations live here.
 *
 * Per Principle II's glue-layer allowlist (see tests/meta/module-boundaries.test.js),
 * `calc/shims.js` is exempt from the "no window access" rule of pure calc modules.
 *
 * Each exported shim's documented fallback (for when the canonical helper throws):
 *   - yearsToFIRE                      → NaN
 *   - findFireAgeNumerical             → { years: NaN, months: NaN, endBalance: NaN, sim: [], feasible: false }
 *   - _evaluateFeasibilityAtAge        → false
 *   - findMinAccessibleAtFireNumerical → NaN
 *
 * Unit tests in tests/unit/shims.test.js MUST stub the canonical helper (or
 * `getCanonicalInputs`) to throw and assert each fallback + `[shim-name] canonical threw:` prefix.
 */

/**
 * Internal helper: bridge from legacy inline `inp` to canonical `Inputs` via
 * `window.getCanonicalInputs` (which the HTML bootstrap exposes alongside the
 * shims). Kept private to this module — tests stub either this or the
 * downstream canonical helper; either path triggers the shim's catch.
 *
 * @param {object} inp  legacy inline-shape inputs
 * @returns {object}    canonical `Inputs` (Object.frozen by the adapter)
 */
function _toCanonical(inp) {
  const adapter = globalThis.window?.getCanonicalInputs;
  if (typeof adapter !== 'function') {
    throw new Error(
      'window.getCanonicalInputs is not wired; HTML bootstrap must expose it before calling shims',
    );
  }
  return adapter(inp);
}

/**
 * Resolve a canonical helper from `window.*` at call time. Throws if missing,
 * which lets the caller's try/catch return the documented fallback.
 *
 * @param {string} name  canonical helper name on `window`
 * @returns {Function}
 */
function _getCanonical(name) {
  const fn = globalThis.window?.[name];
  if (typeof fn !== 'function') {
    throw new Error(`window.${name} is not wired; HTML bootstrap must expose the canonical helper`);
  }
  return fn;
}

/**
 * yearsToFIRE — legacy signature `(inp, annualSpend) → number`.
 *
 * Happy path: delegates to `findFireAgeNumerical(inp, annualSpend, mode)` and
 * returns its `years` field. The `mode` is read from `globalThis.window.fireMode`
 * at call time (the inline dashboard exposes the currently selected mode
 * there). Falls back to `'safe'` if not present.
 *
 * Fallback on any throw: NaN.
 *
 * @param {object} inp          legacy inline-shape inputs
 * @param {number} annualSpend  retirement-phase annual spend (real $)
 * @returns {number}
 */
export function yearsToFIRE(inp, annualSpend) {
  try {
    const inputs = _toCanonical(inp);
    const mode = globalThis.window?.fireMode ?? 'safe';
    const overridden = { ...inputs, solverMode: mode };
    const solveFireAge = _getCanonical('_solveFireAge');
    const result = solveFireAge({ inputs: overridden, helpers: {} });
    return result.yearsToFire;
  } catch (err) {
    console.error('[yearsToFIRE] canonical threw:', err, { annualSpend });
    return NaN;
  }
}

/**
 * findFireAgeNumerical — legacy signature `(inp, annualSpend, mode) → FireNumericalResult`.
 *
 * Returns `{years, months, endBalance, sim, feasible}` derived from the
 * canonical `FireSolverResult`. The legacy inline engine exposed "months" as
 * the fractional years × 12 remainder; the canonical solver returns integer
 * fireAge values, so months is 0 on the happy path (preserved for shape
 * parity with the pre-canonical call sites).
 *
 * The `mode` argument is applied to the canonical `Inputs` via immutable
 * spread (`{ ...inputs, solverMode: mode }`) so caller-supplied mode wins over
 * whatever the adapter derived.
 *
 * Fallback on any throw: `{years: NaN, months: NaN, endBalance: NaN, sim: [], feasible: false}`.
 *
 * @param {object} inp
 * @param {number} annualSpend
 * @param {string} mode  'safe' | 'exact' | 'dieWithZero'
 * @returns {{years: number, months: number, endBalance: number, sim: Array, feasible: boolean}}
 */
export function findFireAgeNumerical(inp, annualSpend, mode) {
  try {
    const inputs = _toCanonical(inp);
    // Immutable override: preserve pure adapter output; apply caller's mode.
    const overridden = { ...inputs, solverMode: mode };
    const solveFireAge = _getCanonical('_solveFireAge');
    const result = solveFireAge({ inputs: overridden, helpers: {} });
    return {
      years: result.yearsToFire,
      months: 0,
      endBalance: result.endBalanceReal,
      sim: result.lifecycle,
      feasible: result.feasible,
    };
  } catch (err) {
    console.error('[findFireAgeNumerical] canonical threw:', err, { annualSpend, mode });
    return { years: NaN, months: NaN, endBalance: NaN, sim: [], feasible: false };
  }
}

/**
 * _evaluateFeasibilityAtAge — legacy signature `(inp, annualSpend, age, mode) → boolean`.
 *
 * Thin wrapper over canonical `_evaluateFeasibility({inputs, fireAge, helpers})`.
 * The caller-supplied `mode` is applied to the canonical inputs via immutable
 * spread before the canonical call.
 *
 * Fallback on any throw: `false` (conservative — treat as infeasible).
 *
 * @param {object} inp
 * @param {number} annualSpend
 * @param {number} age
 * @param {string} mode  'safe' | 'exact' | 'dieWithZero'
 * @returns {boolean}
 */
export function _evaluateFeasibilityAtAge(inp, annualSpend, age, mode) {
  try {
    const inputs = _toCanonical(inp);
    const overridden = { ...inputs, solverMode: mode };
    const evaluateFeasibility = _getCanonical('_evaluateFeasibility');
    return evaluateFeasibility({ inputs: overridden, fireAge: age, helpers: {} });
  } catch (err) {
    console.error('[_evaluateFeasibilityAtAge] canonical threw:', err, { age, mode });
    return false;
  }
}

/**
 * findMinAccessibleAtFireNumerical — legacy signature `(inp, annualSpend, fireAge, mode) → number`.
 *
 * Returns the minimum "accessible" (totalReal) balance observed at or after
 * the supplied `fireAge`. Implementation runs a canonical lifecycle (pinning
 * the fireAge + mode via immutable spread) and scans the post-FIRE slice for
 * the minimum totalReal.
 *
 * Fallback on any throw: NaN.
 *
 * @param {object} inp
 * @param {number} annualSpend
 * @param {number} fireAge
 * @param {string} mode  'safe' | 'exact' | 'dieWithZero'
 * @returns {number}
 */
export function findMinAccessibleAtFireNumerical(inp, annualSpend, fireAge, mode) {
  try {
    const inputs = _toCanonical(inp);
    const overridden = { ...inputs, solverMode: mode };
    const runLifecycle = _getCanonical('_runLifecycle');
    const lifecycle = runLifecycle({ inputs: overridden, fireAge, helpers: {} });
    // Scan lifecycle for records at/after fireAge; return minimum totalReal.
    let min = Infinity;
    for (const rec of lifecycle) {
      if (typeof rec?.agePrimary === 'number' && rec.agePrimary >= fireAge) {
        const bal = rec.totalReal;
        if (typeof bal === 'number' && bal < min) min = bal;
      }
    }
    return Number.isFinite(min) ? min : NaN;
  } catch (err) {
    console.error('[findMinAccessibleAtFireNumerical] canonical threw:', err, { fireAge, mode });
    return NaN;
  }
}
