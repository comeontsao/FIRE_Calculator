/**
 * calc/simulateLifecycle.js — UNIFIED LIFECYCLE SIMULATOR (Wave C, Step 1)
 *
 * Pure module per Constitution II. Single entry point that subsumes
 * `signedLifecycleEndBalance`, `projectFullLifecycle`, and the inline
 * `_simulateStrategyLifetime` once the migration sequence (research R11)
 * completes.
 *
 * Inputs:  SimulateLifecycleInputs (per data-model §6 / contract §1)
 * Outputs: SimulateLifecycleOutput (per data-model §7 / contract §1)
 *
 * Consumers:
 *   - calc/findFireAgeNumerical.js (per-strategy bisection — US3)
 *   - calc/strategyRanker.js (scoreAndRank — US4)
 *   - FIRE-Dashboard.html lifecycle chart renderer
 *   - FIRE-Dashboard-Generic.html lifecycle chart renderer (lockstep)
 *   - calc/calcAudit.js (assembleAuditSnapshot — feature 014)
 *
 * Reserved hook: options.noiseModel (default null) — future Monte Carlo
 * extension point. Throws if non-null in feature 015. See JSDoc on
 * simulateLifecycle().
 *
 * **MIGRATION STATUS (Wave C, Step 1 — 2026-04-27)**:
 * - This is the "build alongside" step per research R11.
 * - The three legacy simulators remain in place; this module delegates to
 *   them via injected dependencies passed in `options._legacySimulators`.
 * - Steps 2-4 (parity test, flip call sites, delete retired sims) are
 *   tracked as follow-up work in tasks.md (T082-T089).
 * - The `noiseModel` reservation IS shipped now so future Monte Carlo work
 *   can drop in without re-touching this signature.
 */

'use strict';

/**
 * Single source of truth for lifecycle simulation. Pure function — no DOM
 * access, no global reads, no Chart.js. All inputs explicit.
 *
 * @param {Object} options
 * @param {Object} options.scenarioInputs - dashboard `inp` object
 * @param {number} options.fireAge - age at which FIRE begins
 * @param {number} options.planAge - age at which simulation ends (e.g., 95)
 * @param {string} [options.strategyOverride] - 'bracket-fill-smoothed' | 'tax-optimized-search' | etc.
 * @param {number} [options.thetaOverride] - 0..1 for tax-opt-search
 * @param {Object} [options.overlays] - { mortgage: bool, college: bool, home2: bool }
 * @param {Object|null} options.noiseModel - RESERVED. Must be null in feature 015.
 *   Future Monte Carlo will populate this with:
 *   {
 *     returns: { distribution: 'normal' | 'lognormal', mean: number, std: number },
 *     inflation: { distribution: 'normal', mean: number, std: number },
 *     lifespan: { distribution: 'normal', meanAge: number, stdAge: number },
 *     samples: number,    // e.g., 1000 trials
 *     seed?: number,      // optional deterministic seed
 *   }
 *   The implementation will run `samples` trials and return percentile aggregates.
 * @param {Object} [options._legacySimulators] - injected during Wave C Step 1 migration.
 *   Shape: { projectFullLifecycle, signedLifecycleEndBalance }. Once the call sites
 *   are flipped (Wave C Step 3) this parameter goes away.
 *
 * @returns {Object} SimulateLifecycleOutput per the unified-simulator contract.
 * @throws {Error} when noiseModel is non-null (feature 015 ships deterministic-only).
 */
function simulateLifecycle(options) {
  const opts = options || {};
  if (opts.noiseModel !== null && opts.noiseModel !== undefined) {
    throw new Error(
      'simulateLifecycle: noiseModel is reserved for future Monte Carlo support ' +
      'and must be null in this build (feature 015).'
    );
  }
  const {
    scenarioInputs,
    fireAge,
    planAge,
    strategyOverride,
    thetaOverride,
    overlays,
    _legacySimulators,
  } = opts;

  // Wave C Step 1 — delegate to the legacy simulators via injected deps. Once
  // call sites are flipped (Step 3), the legacy simulators are deleted (Step 4)
  // and this function's body is replaced with the consolidated implementation.
  if (!_legacySimulators || typeof _legacySimulators.projectFullLifecycle !== 'function') {
    // No legacy injection — return a deterministic empty result. This shape
    // matches SimulateLifecycleOutput so callers can rely on the contract.
    return {
      perYearRows: [],
      endBalance: 0,
      hasShortfall: false,
      shortfallYearAges: [],
      floorViolations: [],
      cumulativeFederalTax: 0,
      residualArea: 0,
    };
  }

  const annualSpend = (scenarioInputs && scenarioInputs.annualSpend) || 0;
  const _options = {};
  if (strategyOverride) _options.strategyOverride = strategyOverride;
  if (typeof thetaOverride === 'number') _options.thetaOverride = thetaOverride;

  // Delegate to projectFullLifecycle for the per-year trajectory. Overlays
  // (mortgage/college/home2) are read from scenarioInputs by the legacy
  // simulator — Wave C Step 1 doesn't change that wiring.
  const perYearRows = _legacySimulators.projectFullLifecycle(
    scenarioInputs, annualSpend, fireAge, true, _options
  ) || [];

  const endBalance = perYearRows.length > 0
    ? (perYearRows[perYearRows.length - 1].total || 0)
    : 0;

  const shortfallYearAges = [];
  let cumulativeFederalTax = 0;
  let residualArea = 0;
  for (const row of perYearRows) {
    if (row && row.hasShortfall === true && typeof row.age === 'number') {
      shortfallYearAges.push(row.age);
    }
    if (row && typeof row.federalTax === 'number') cumulativeFederalTax += row.federalTax;
    if (row && typeof row.total === 'number') residualArea += row.total;
  }

  return {
    perYearRows,
    endBalance,
    hasShortfall: shortfallYearAges.length > 0,
    shortfallYearAges,
    floorViolations: [], // legacy projectFullLifecycle doesn't surface these directly
    cumulativeFederalTax: Math.round(cumulativeFederalTax),
    residualArea: Math.round(residualArea),
  };
}

// ---- Module exports ----

const _api = { simulateLifecycle };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _api;
}

if (typeof globalThis !== 'undefined') {
  globalThis.simulateLifecycle = simulateLifecycle;
  globalThis.simulateLifecycleModule = _api;
}
