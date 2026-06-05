/*
 * calc/portfolioAggregation.js — pure SOURCE-OF-TRUTH for the
 * Plan-tab Whole-Portfolio Net Worth + Accessible/Locked split.
 *
 * Feature: 032-roth-ira-accounts (FR-004, FR-005, FR-006, FR-019)
 *
 * Inputs:    legacy `inp` object (from FIRE-Dashboard.html getInputs())
 * Outputs:   { computeAccessible, computeLocked, computeNetWorth } — three
 *            scalar dollar totals.
 * Consumers: FIRE-Dashboard.html `calcAccessible(inp)`, `calcLocked(inp)`,
 *            `calcNetWorth(inp)` (inline) — those inline functions MUST mirror
 *            this module's behavior. This module is the unit-testable
 *            source-of-truth referenced from the inline code.
 *
 * Pure: no DOM, no globals, no side effects (Constitution Principle II).
 *
 * Locked semantics (FR-019): Roger's and Rebecca's Roth IRA balances are
 * fully locked until age 59.5, matching existing Roth 401K behavior. They
 * MUST NOT appear in the Accessible sub-label; they MUST appear in the
 * Locked sub-label; they MUST appear in the Whole Portfolio Net Worth total.
 *
 * FRAME: pure-data — these are nominal dollar balances entered by the user
 *        and rendered in the header at face value (no real/nominal
 *        conversion at this layer).
 */

/**
 * Sub-label total for the "Accessible Now" header chip — funds the user
 * could legally withdraw before age 59.5 without penalty.
 *
 * @param {object} inp
 * @returns {number} accessible USD total (nominal-$)
 */
export function computeAccessible(inp) {
  const rogerStocks   = Number(inp.rogerStocks)   || 0;
  const rebeccaStocks = Number(inp.rebeccaStocks) || 0;
  const cashSavings   = Number(inp.cashSavings)   || 0;
  const otherAssets   = Number(inp.otherAssets)   || 0;
  return rogerStocks + rebeccaStocks + cashSavings + otherAssets;
}

/**
 * Sub-label total for the "Locked" header chip — funds inaccessible
 * before age 59.5. Includes Roger's Traditional 401K, Roger's Roth 401K,
 * Roger's Roth IRA, and Rebecca's Roth IRA.
 *
 * @param {object} inp
 * @returns {number} locked USD total (nominal-$)
 */
export function computeLocked(inp) {
  const roger401kTrad = Number(inp.roger401kTrad) || 0;
  const roger401kRoth = Number(inp.roger401kRoth) || 0;
  const rogerRothIra   = Number(inp.rogerRothIra)   || 0;
  const rebeccaRothIra = Number(inp.rebeccaRothIra) || 0;
  return roger401kTrad + roger401kRoth + rogerRothIra + rebeccaRothIra;
}

/**
 * Whole Portfolio Net Worth = Accessible + Locked.
 *
 * @param {object} inp
 * @returns {number} net worth USD total (nominal-$)
 */
export function computeNetWorth(inp) {
  return computeAccessible(inp) + computeLocked(inp);
}
