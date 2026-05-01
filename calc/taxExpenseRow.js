/*
 * =============================================================================
 * MODULE: calc/taxExpenseRow.js  (v1 — feature 021)
 *
 * Feature: 021-tax-category-and-audit-cleanup
 * Spec:    specs/021-tax-category-and-audit-cleanup/spec.md US1
 * Data model: specs/021-tax-category-and-audit-cleanup/data-model.md § TaxExpenseRow
 *
 * Inputs:
 *   - snapshot: an object containing per-year accumulation row data with the
 *     v3 fields produced by accumulateToFire.js. Expected shape:
 *       { federalTax: number, ficaTax: number, grossIncome: number }
 *     Also tolerates a fully missing snapshot (returns zeros, never NaN).
 *
 * Outputs:
 *   formatTaxIncomeRow(snapshot) → {
 *     type: 'income',
 *     monthlyAmount: number,         // integer dollars
 *     effectiveRate: number,         // one-decimal-place percent (e.g. 15.7)
 *     isLocked: true,                // always locked for 'income' rows
 *   }
 *
 * Consumers:
 *   - FIRE-Dashboard.html        → Plan-tab Expenses pill "Income tax" sub-row.
 *   - FIRE-Dashboard-Generic.html → same.
 *   - tests/unit/taxExpenseRow.test.js
 *
 * Policy:
 *   - PURE. No DOM, no globals, no side effects.
 *   - Constitution Principle II (pure module, contract-documented).
 *   - Constitution Principle V (UMD-classic-script: CommonJS for Node, globalThis
 *     for the browser inline script context).
 * =============================================================================
 */

/**
 * Format the displayed Income-tax sub-row from an accumulation snapshot.
 * Gracefully degrades to zeros when fields are missing or non-finite — the
 * caller's lock icon is still meaningful even when the calc engine has no
 * data yet (e.g., during the cold render pass before recalcAll completes).
 *
 * @param {object|null|undefined} snapshot
 *   Expected shape: { federalTax, ficaTax, grossIncome }. All optional.
 * @returns {{
 *   type: 'income',
 *   monthlyAmount: number,
 *   effectiveRate: number,
 *   isLocked: true,
 * }}
 */
function formatTaxIncomeRow(snapshot) {
  const fed = (snapshot && Number.isFinite(snapshot.federalTax)) ? snapshot.federalTax : 0;
  const fica = (snapshot && Number.isFinite(snapshot.ficaTax)) ? snapshot.ficaTax : 0;
  const gross = (snapshot && Number.isFinite(snapshot.grossIncome)) ? snapshot.grossIncome : 0;

  const totalAnnual = fed + fica;
  const monthlyAmount = Math.round(totalAnnual / 12);
  // Effective rate: round to one decimal place (e.g., 15.7%).
  // Defensive divide-by-zero — returns 0 when grossIncome is 0/blank.
  const effectiveRate = (gross > 0)
    ? Math.round((totalAnnual / gross) * 1000) / 10
    : 0;

  return {
    type: 'income',
    monthlyAmount,
    effectiveRate,
    isLocked: true,
  };
}

// ---------------------------------------------------------------------------
// Exports — UMD-classic-script pattern (matches calc/accumulateToFire.js).
// ---------------------------------------------------------------------------
const _taxExpenseRowApi = {
  formatTaxIncomeRow,
};

if (typeof module !== 'undefined' && module && module.exports) {
  module.exports = _taxExpenseRowApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.taxExpenseRow = _taxExpenseRowApi;
}
