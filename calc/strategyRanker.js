/**
 * calc/strategyRanker.js — STRATEGY RANKING + SORT-KEY DISPATCH
 *
 * Pure module per Constitution II. Currently exposes:
 *   - computeCumulativeFederalTax(perYearRows): rounded sum of federalTax
 *     (or row.taxOrdinary + row.taxLTCG fallback for legacy row shapes)
 *   - computeResidualArea(perYearRows): rounded sum of total
 *
 * Will gain in feature 015 Wave B (US3 + US4):
 *   - getActiveSortKey({mode, objective}) → ActiveSortKeyChain
 *   - makeChainedComparator(chain) → comparator
 *   - scoreAndRank(perStrategyResults, sortKey) → ranked PerStrategyResult[]
 *
 * Inputs:  perYearRows arrays from simulateLifecycle() (US6) or projectFullLifecycle (Wave A bridge)
 * Outputs: numeric scalars for sort-key comparison
 *
 * Consumers:
 *   - calc/calcAudit.js (US4 — populates auditSnapshot.strategyRanking.activeSortKey)
 *   - FIRE-Dashboard.html / FIRE-Dashboard-Generic.html ranker code (US4 — sort dispatch)
 *   - tests/unit/sortKeyHelpers.test.js (this module's regression tests)
 *
 * Pure: no DOM, no globals, no localStorage. Node-importable for unit tests.
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

// ---- Module exports ----

const _api = { computeCumulativeFederalTax, computeResidualArea };

// CommonJS export (Node `require`)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = _api;
}

// Browser global registration (UMD-style classic-script load)
if (typeof globalThis !== 'undefined') {
  globalThis.computeCumulativeFederalTax = computeCumulativeFederalTax;
  globalThis.computeResidualArea = computeResidualArea;
  globalThis.strategyRankerModule = _api;
}
