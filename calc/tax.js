/*
 * calc/tax.js — bracket-aware US-style income + LTCG tax calculation.
 *
 * Inputs:
 *   params: {
 *     ordinaryIncomeReal: number — Trad withdrawals + taxable SS + other ordinary income.
 *     ltcgIncomeReal:     number — realized long-term capital gains from taxable-stock sales.
 *     age:                number — integer years (senior-deduction hooks, RMD context).
 *     tax:                TaxConfig — real-dollar brackets + rmdAgeStart (types.js §TaxConfig).
 *   }
 *
 * Outputs: TaxResult (data-model.md §6)
 *   {
 *     ordinaryOwedReal: number,
 *     ltcgOwedReal:     number,
 *     totalOwedReal:    number,  // === ordinaryOwedReal + ltcgOwedReal
 *     effectiveRate:    number,  // totalOwedReal / (ordinaryIncomeReal + ltcgIncomeReal); 0 when both are 0
 *   }
 *
 * Consumers:
 *   - calc/withdrawal.js — sizes Trad draws accounting for tax drag.
 *   - rothLadderChart renderer — surfaces effectiveRate in the Roth-ladder view.
 *
 * Invariants:
 *   - Marginal-bracket arithmetic: each dollar in a bracket is taxed at that bracket's rate,
 *     NOT a single effective rate applied to the whole income.
 *   - LTCG is taxed by a SEPARATE schedule (`tax.ltcgBrackets`) independent of ordinary.
 *   - totalOwedReal === ordinaryOwedReal + ltcgOwedReal (sum identity).
 *   - Zero income in both fields ⇒ zeros out, effectiveRate === 0 (no division by zero).
 *   - All thresholds and outputs are real dollars — no nominal conversion happens here.
 *     Callers convert at the boundary via calc/inflation.js (FR-017).
 *
 * Purity: no DOM, no Chart.js, no globals, no I/O, no module-scope mutation.
 *
 * Simplifications (tracked for future refinement):
 *   - No standard deduction or senior-age extra deduction applied yet. `age` is
 *     accepted in the input contract so future revisions can add age-gated
 *     deductions without breaking call sites. Current tests treat `age` as
 *     context-only; no branch in the formula depends on it.
 *   - No state-tax layer. US federal only.
 *   - LTCG bracketing stacks on top of ordinary income in real US law; this
 *     simplification taxes LTCG by its own schedule on its own dollars.
 *     Accurate enough for FIRE projections; documented here so the audit trail
 *     is clear when a future feature tightens this.
 *
 * FRAME (feature 022 / FR-009):
 *   Dominant frame: real-$ (income, brackets, owed amounts — all in today's $
 *     per existing invariant; FR-017 boundary is upstream in calc/inflation.js).
 *   Frame-conversion sites: NONE.
 */

/**
 * @typedef {import('../tests/fixtures/types.js').TaxBracket} TaxBracket
 * @typedef {import('../tests/fixtures/types.js').TaxConfig}  TaxConfig
 */

/**
 * Apply a set of marginal brackets to a non-negative income.
 *
 * Brackets are assumed sorted by ascending `threshold`, with threshold 0
 * present as the lowest bracket. Income below the lowest threshold yields 0.
 *
 * @param {number} income                 real dollars, must be finite and >= 0
 * @param {readonly TaxBracket[]} brackets ascending-threshold marginal brackets
 * @returns {number}                      tax owed in real dollars
 */
function applyMarginalBrackets(income, brackets) {
  if (!(income > 0)) return 0;
  let owed = 0;
  for (let i = 0; i < brackets.length; i += 1) {
    const lower = brackets[i].threshold;
    if (income <= lower) break;
    const upper = i + 1 < brackets.length ? brackets[i + 1].threshold : Infinity;
    const taxableInThisBracket = Math.min(income, upper) - lower;
    owed += taxableInThisBracket * brackets[i].rate;
  }
  return owed;
}

/**
 * Compute federal-style income + LTCG tax for a single tax year.
 *
 * @param {{
 *   ordinaryIncomeReal: number,
 *   ltcgIncomeReal:     number,
 *   age:                number,
 *   tax:                TaxConfig,
 * }} params
 * @returns {{
 *   ordinaryOwedReal: number,
 *   ltcgOwedReal:     number,
 *   totalOwedReal:    number,
 *   effectiveRate:    number,
 * }}
 */
export function computeTax(params) {
  const { ordinaryIncomeReal, ltcgIncomeReal, tax } = params;

  const ordinaryOwedReal = applyMarginalBrackets(ordinaryIncomeReal, tax.ordinaryBrackets);
  const ltcgOwedReal = applyMarginalBrackets(ltcgIncomeReal, tax.ltcgBrackets);
  const totalOwedReal = ordinaryOwedReal + ltcgOwedReal;

  const totalIncome = ordinaryIncomeReal + ltcgIncomeReal;
  const effectiveRate = totalIncome > 0 ? totalOwedReal / totalIncome : 0;

  return Object.freeze({
    ordinaryOwedReal,
    ltcgOwedReal,
    totalOwedReal,
    effectiveRate,
  });
}
