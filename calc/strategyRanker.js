/**
 * calc/strategyRanker.js — STRATEGY RANKING + SORT-KEY DISPATCH
 *
 * Pure module per Constitution II. Currently exposes:
 *   - computeCumulativeFederalTax(perYearRows): rounded sum of federalTax
 *     (or row.taxOrdinary + row.taxLTCG fallback for legacy row shapes)
 *   - computeResidualArea(perYearRows): rounded sum of total
 *   - _newWinnerBeats(prevWinner, newContender, mode, objective,
 *                    annualSpend, planYears?) → boolean
 *     Hysteresis gate added in feature 021 US4 (B-020-4 carry-forward).
 *     A new contender must beat the prior winner by more than
 *     HYSTERESIS_YEARS (0.05) of equivalent score margin to flip the winner.
 *   - HYSTERESIS_YEARS: numeric constant (0.05) per FR-018 + research R5.
 *
 * Inputs:  perYearRows arrays from simulateLifecycle() (US6) or
 *          projectFullLifecycle (Wave A bridge); per-strategy result objects
 *          (`{ strategyId, endOfPlanNetWorthReal, cumulativeFederalTaxReal,
 *             residualAreaReal, perYearRows }`) for the hysteresis gate.
 * Outputs: numeric scalars for sort-key comparison; boolean for hysteresis.
 *
 * Consumers:
 *   - calc/calcAudit.js (US4 — populates auditSnapshot.strategyRanking.activeSortKey)
 *   - FIRE-Dashboard.html / FIRE-Dashboard-Generic.html ranker code
 *     (calls _newWinnerBeats inside scoreAndRank for hysteresis gate)
 *   - tests/unit/sortKeyHelpers.test.js (this module's regression tests)
 *   - tests/unit/strategyRankerHysteresis.test.js (US4 hysteresis tests)
 *
 * Pure: no DOM, no globals, no localStorage. Node-importable for unit tests.
 *
 * FRAME (feature 022 / FR-009):
 *   Dominant frame: real-$ (sums federalTax / total over real-$ perYearRows
 *     produced by accumulateToFire / projectFullLifecycle; comparison scalars
 *     are unitless margins of real-$ aggregates).
 *   Frame-conversion sites: NONE — every scalar consumed lives in real-$.
 */

'use strict';

/**
 * Sum the per-year federal tax burden across the rows. Rounds to nearest
 * dollar (per research R8) so floating-point drift cannot produce flickering
 * tie-break flips across recalcs.
 *
 * Accepts both new (`row.federalTax`) and legacy (`row.taxOrdinary +
 * row.taxLTCG`) row shapes for backward compat with existing fixtures.
 *
 * @param {Array<Object>} perYearRows
 * @returns {number} integer dollars; 0 if no rows or no tax fields present
 */
function computeCumulativeFederalTax(perYearRows) {
  if (!Array.isArray(perYearRows) || perYearRows.length === 0) return 0;
  let sum = 0;
  for (const row of perYearRows) {
    if (!row || typeof row !== 'object') continue;
    if (typeof row.federalTax === 'number' && Number.isFinite(row.federalTax)) {
      sum += row.federalTax;
      continue;
    }
    // Legacy fallback: ordinary + LTCG components
    const ord = (typeof row.taxOrdinary === 'number' && Number.isFinite(row.taxOrdinary)) ? row.taxOrdinary : 0;
    const ltcg = (typeof row.taxLTCG === 'number' && Number.isFinite(row.taxLTCG)) ? row.taxLTCG : 0;
    sum += ord + ltcg;
  }
  return Math.round(sum);
}

/**
 * Sum per-year `total` across the rows ("residual area under the wealth
 * curve"). Higher = more wealth on the books across more years = better
 * for "Preserve estate" objective. Rounded to nearest dollar.
 *
 * @param {Array<Object>} perYearRows
 * @returns {number} integer dollars; 0 if no rows
 */
function computeResidualArea(perYearRows) {
  if (!Array.isArray(perYearRows) || perYearRows.length === 0) return 0;
  let sum = 0;
  for (const row of perYearRows) {
    if (!row || typeof row !== 'object') continue;
    const t = (typeof row.total === 'number' && Number.isFinite(row.total)) ? row.total : 0;
    sum += t;
  }
  return Math.round(sum);
}

// ---------------------------------------------------------------------------
// Feature 021 US4 — Strategy Ranker Hysteresis (B-020-4 carry-forward)
//
// Per FR-018 + research R5: a new contender must beat the previous winner
// by more than ±0.05 years' equivalent score margin to flip the winner.
// Without this guard, integer-age-boundary perturbations (e.g., ±0.01yr)
// can cause the ranker winner to oscillate between strategies whose primary
// metric values are within numerical noise. Documented failure mode: the
// feature 020 audit's drag-invariants.test.js E3 invariant flagged 17 LOW
// findings across the 92-persona matrix.
//
// Threshold rationale (research R5):
//   - 0.01yr noise band drives all 17 audit findings.
//   - 0.5–1.0+ yr margins are the typical "real" winner-change delta.
//   - 0.05yr cleanly separates noise from signal.
//
// Sort-key normalization to "years equivalent" (research R5):
//   endBalance desc:
//     deltaYears = (newContender.endBalance − prevWinner.endBalance) / annualSpend
//     ("how many years of spending does the contender's higher end balance buy?")
//   cumulativeFederalTax asc:
//     deltaYears = (prevWinner.cumulativeFederalTax − newContender.cumulativeFederalTax)
//                  / annualFederalTax_avg
//     where annualFederalTax_avg = prevWinner.cumulativeFederalTax / planYears
//     (fallback to annualSpend × 0.15 if planYears unavailable).
//   residualArea desc (DWZ + estate objective):
//     deltaYears = (newContender.residualArea − prevWinner.residualArea)
//                  / (annualSpend × planYears)
// ---------------------------------------------------------------------------

const HYSTERESIS_YEARS = 0.05;

/**
 * Resolve the active primary sort key for a (mode, objective) pair.
 *
 * Mirrors the dispatch table in
 *   specs/015-calc-debt-cleanup/contracts/mode-objective-orthogonality.contract.md §1
 * which is implemented in HTML's `rankByObjective`. Mode and Objective are
 * orthogonal (Constitution Principle IX): mode = end-state constraint,
 * objective = path-shape sort key.
 *
 *   safe + estate          → endBalance desc
 *   safe + tax             → cumulativeFederalTax asc
 *   exact + estate         → endBalance desc
 *   exact + tax            → cumulativeFederalTax asc
 *   dieWithZero + estate   → residualArea desc
 *   dieWithZero + tax      → cumulativeFederalTax asc
 *
 * The objective string accepts both legacy ("leave-more-behind",
 * "retire-sooner-pay-less-tax") and short-form ("estate", "tax") values.
 *
 * @param {string} mode      'safe' | 'exact' | 'dieWithZero'
 * @param {string} objective 'leave-more-behind' | 'retire-sooner-pay-less-tax' | 'estate' | 'tax'
 * @returns {{ key: 'endBalance'|'cumulativeFederalTax'|'residualArea', dir: 'asc'|'desc' }}
 */
function _resolvePrimarySortKey(mode, objective) {
  const isDWZ = mode === 'dieWithZero';
  const obj = (objective === 'retire-sooner-pay-less-tax' || objective === 'tax')
    ? 'tax'
    : 'estate';
  if (obj === 'tax') {
    return { key: 'cumulativeFederalTax', dir: 'asc' };
  }
  if (isDWZ) {
    return { key: 'residualArea', dir: 'desc' };
  }
  return { key: 'endBalance', dir: 'desc' };
}

/**
 * Convert a primary-sort-key score delta to "years-equivalent" units so a
 * single threshold (HYSTERESIS_YEARS = 0.05) can govern hysteresis across
 * heterogeneous sort keys.
 *
 * Returns a positive number when the contender beats the prior winner;
 * zero or negative when the contender does NOT beat (or ties).
 *
 * @param {Object} prevWinner   per-strategy result (must have the relevant score field)
 * @param {Object} newContender per-strategy result (must have the relevant score field)
 * @param {{ key: string, dir: string }} sortKey  resolved by _resolvePrimarySortKey
 * @param {number} annualSpend  user's plan annual spend (for endBalance/residual normalization)
 * @param {number} [planYears]  number of retirement years; falls back to perYearRows length
 * @returns {number} delta in years-equivalent units (positive = contender ahead)
 */
function _scoreDeltaToYears(prevWinner, newContender, sortKey, annualSpend, planYears) {
  const safeAnnualSpend = (typeof annualSpend === 'number' && Number.isFinite(annualSpend) && annualSpend > 0)
    ? annualSpend
    : 1; // avoid divide-by-zero; degenerate persona returns 0 below
  // Estimate planYears from perYearRows length if not explicitly passed.
  let years = planYears;
  if (typeof years !== 'number' || !Number.isFinite(years) || years <= 0) {
    const lp = (prevWinner && Array.isArray(prevWinner.perYearRows)) ? prevWinner.perYearRows.length : 0;
    const lc = (newContender && Array.isArray(newContender.perYearRows)) ? newContender.perYearRows.length : 0;
    years = Math.max(lp, lc, 1);
  }

  if (sortKey.key === 'endBalance') {
    const a = (prevWinner && typeof prevWinner.endOfPlanNetWorthReal === 'number')
      ? prevWinner.endOfPlanNetWorthReal : 0;
    const b = (newContender && typeof newContender.endOfPlanNetWorthReal === 'number')
      ? newContender.endOfPlanNetWorthReal : 0;
    // dir = desc → contender ahead when b > a
    return (b - a) / safeAnnualSpend;
  }

  if (sortKey.key === 'cumulativeFederalTax') {
    const a = (prevWinner && typeof prevWinner.cumulativeFederalTaxReal === 'number')
      ? prevWinner.cumulativeFederalTaxReal
      : (prevWinner && typeof prevWinner.lifetimeFederalTaxReal === 'number'
          ? prevWinner.lifetimeFederalTaxReal : 0);
    const b = (newContender && typeof newContender.cumulativeFederalTaxReal === 'number')
      ? newContender.cumulativeFederalTaxReal
      : (newContender && typeof newContender.lifetimeFederalTaxReal === 'number'
          ? newContender.lifetimeFederalTaxReal : 0);
    // Estimate average annual tax from prevWinner. Fall back to a 15%
    // effective rate × annualSpend when prevWinner's tax field is missing
    // or zero, so the hysteresis still has a sensible normalization.
    let annualFederalTaxAvg = a / years;
    if (!Number.isFinite(annualFederalTaxAvg) || annualFederalTaxAvg <= 0) {
      annualFederalTaxAvg = safeAnnualSpend * 0.15;
    }
    if (annualFederalTaxAvg <= 0) annualFederalTaxAvg = 1;
    // dir = asc → contender ahead when b < a (tax saving)
    return (a - b) / annualFederalTaxAvg;
  }

  if (sortKey.key === 'residualArea') {
    const a = (prevWinner && typeof prevWinner.residualAreaReal === 'number')
      ? prevWinner.residualAreaReal : 0;
    const b = (newContender && typeof newContender.residualAreaReal === 'number')
      ? newContender.residualAreaReal : 0;
    const denom = safeAnnualSpend * years;
    if (denom <= 0) return 0;
    // dir = desc → contender ahead when b > a
    return (b - a) / denom;
  }

  // Unknown sort key — be conservative and report no margin.
  return 0;
}

/**
 * Hysteresis gate for the strategy ranker. Returns true when the new
 * contender beats the previous winner by more than HYSTERESIS_YEARS of
 * equivalent score margin under the active sort key. Returns true (no
 * hysteresis) when prevWinner is null/undefined (first-call path).
 *
 * Per FR-018: the strategy ranker MUST add hysteresis to its scoring; a
 * winner change requires the new contender to beat the previous winner
 * by more than ±0.05 years' equivalent score margin.
 *
 * @param {Object|null|undefined} prevWinner   per-strategy result for current winner
 * @param {Object}                newContender per-strategy result for the candidate
 * @param {string}                mode         'safe' | 'exact' | 'dieWithZero'
 * @param {string}                objective    'leave-more-behind' | 'retire-sooner-pay-less-tax' | 'estate' | 'tax'
 * @param {number}                annualSpend  user's plan annual spend
 * @param {number}                [planYears]  optional plan-years override
 * @returns {boolean} true → contender wins; false → keep prev winner
 */
function _newWinnerBeats(prevWinner, newContender, mode, objective, annualSpend, planYears) {
  if (!prevWinner) return true;        // first ranking call — no hysteresis
  if (!newContender) return false;     // degenerate
  if (prevWinner.strategyId && newContender.strategyId
      && prevWinner.strategyId === newContender.strategyId) {
    // Same strategy chosen → no flip; let caller treat as "winner unchanged"
    return false;
  }
  const sortKey = _resolvePrimarySortKey(mode, objective);
  const deltaYears = _scoreDeltaToYears(prevWinner, newContender, sortKey, annualSpend, planYears);
  return deltaYears > HYSTERESIS_YEARS;
}

// ---- Module exports ----

const _api = {
  computeCumulativeFederalTax,
  computeResidualArea,
  _newWinnerBeats,
  _scoreDeltaToYears,
  _resolvePrimarySortKey,
  HYSTERESIS_YEARS,
};

// CommonJS export (Node `require`)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = _api;
}

// Browser global registration (UMD-style classic-script load)
if (typeof globalThis !== 'undefined') {
  globalThis.computeCumulativeFederalTax = computeCumulativeFederalTax;
  globalThis.computeResidualArea = computeResidualArea;
  globalThis._newWinnerBeats = _newWinnerBeats;
  globalThis._scoreDeltaToYears = _scoreDeltaToYears;
  globalThis.HYSTERESIS_YEARS = HYSTERESIS_YEARS;
  globalThis.strategyRankerModule = _api;
}
