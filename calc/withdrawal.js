/*
 * calc/withdrawal.js — tax-aware single-year retirement withdrawal strategy.
 *
 * Replaces the audit-flagged silent-shortfall absorption (FR-013): this
 * module NEVER pushes a pool negative. If the year's spend + tax cannot be
 * covered by accessible pools, the result returns `{feasible: false,
 * deficitReal: positive}` and lets the caller surface that as infeasibility.
 *
 * Inputs:
 *   params: {
 *     annualSpendReal: number — real-dollar target spend for the year.
 *     pools: {
 *       trad401kReal, rothIraReal, taxableStocksReal, cashReal
 *     } — real-dollar START-OF-YEAR balances. Not mutated.
 *     phase: 'preUnlock' | 'unlocked' | 'ssActive' — gates trad access and SS income.
 *     ssIncomeReal:    number — 0 unless phase === 'ssActive'.
 *     age:             number — integer years (drives RMD).
 *     tax:             TaxConfig — brackets + rmdAgeStart (types.js §TaxConfig).
 *                      Optional: tax.stockCostBasisFraction (defaults to 0.7).
 *     strategy:        'roth-ladder' | 'trad-first' | 'tax-optimized' | 'trad-last'.
 *   }
 *
 * Outputs: single-year WithdrawalResult shape (see data-model.md §5)
 *   {
 *     feasible:        boolean,
 *     fromTradReal:    number,
 *     fromRothReal:    number,
 *     fromTaxableReal: number,
 *     fromCashReal:    number,
 *     fromSSReal:      number,
 *     taxOwedReal:     number,
 *     netSpendReal:    number,  // === annualSpendReal when feasible
 *     deficitReal?:    number,  // present iff !feasible, always > 0
 *   }
 *
 * Consumers:
 *   - calc/lifecycle.js — invoked once per retirement-phase year.
 *   - rothLadderChart renderer — shows the per-year withdrawal split.
 *
 * Invariants:
 *   - feasible=true  ⇒ netSpendReal === annualSpendReal.
 *   - feasible=false ⇒ deficitReal === annualSpendReal - netSpendReal, strictly > 0.
 *   - sum(fromTrad + fromRoth + fromTaxable + fromCash + fromSS) ===
 *     annualSpendReal + taxOwedReal  when feasible.
 *   - RMD enforced when age ≥ tax.rmdAgeStart AND trad401kReal > 0 AND trad is
 *     accessible (phase ∈ {'unlocked','ssActive'}): at least the IRS Uniform
 *     Lifetime Table minimum is drawn from trad, regardless of strategy.
 *   - No pool ever goes negative. Attempts to do so flip feasibility to false.
 *
 * Purity: no DOM, no Chart.js, no globals, no I/O, no module-scope mutation.
 *
 * Simplifications (tracked for future refinement):
 *   - Taxable-stock LTCG basis: assumed tax.stockCostBasisFraction (default 0.7),
 *     i.e., 30% of any taxable sale is realized LTCG. Real cost-basis tracking
 *     would require lot-level accounting; deferred to a later feature.
 *   - SS taxation: 85% of ssIncomeReal treated as ordinary income (IRS upper
 *     bound for high-income retirees). Real formula phases this in.
 *   - Tax convergence: up to 8 gross-up iterations to settle the
 *     withdrawal-creates-tax-creates-more-withdrawal fixed point. Residual
 *     drift is absorbed by an extra draw pass before feasibility is decided.
 */

import { computeTax } from './tax.js';

/**
 * @typedef {import('../tests/fixtures/types.js').TaxConfig} TaxConfig
 * @typedef {import('../tests/fixtures/types.js').Phase}     Phase
 */

/** Canonical pool keys. Frozen, ordered so callers can rely on iteration. */
const POOL_KEYS = Object.freeze(['cash', 'taxable', 'roth', 'trad']);

/** Strategy → priority order of pool keys. Pools not listed are skipped. */
const STRATEGY_ORDER = Object.freeze({
  'roth-ladder':   Object.freeze(['roth', 'taxable', 'cash', 'trad']),
  'trad-first':    Object.freeze(['trad', 'taxable', 'cash', 'roth']),
  'tax-optimized': Object.freeze(['cash', 'taxable', 'roth', 'trad']),
  'trad-last':     Object.freeze(['cash', 'taxable', 'roth', 'trad']),
});

/**
 * IRS Uniform Lifetime Table factors (post-SECURE 2.0) for RMD calculation.
 * RMD = trad401kReal / factor(age). Ages outside 73..100 clamp to the boundary
 * factor — sufficient for FIRE projections. Values per IRS Publication 590-B.
 */
const UNIFORM_LIFETIME_TABLE = Object.freeze({
  73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1,
  80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2,
  87: 14.4, 88: 13.7, 89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1,
  94: 9.5,  95: 8.9,  96: 8.4,  97: 7.8,  98: 7.3,  99: 6.8,  100: 6.4,
});

/**
 * Look up the RMD divisor for a given age, clamping to the table bounds.
 *
 * @param {number} age
 * @returns {number}
 */
function rmdFactor(age) {
  if (age < 73) return Infinity; // no RMD required — divisor effectively infinite
  if (age > 100) return UNIFORM_LIFETIME_TABLE[100];
  return UNIFORM_LIFETIME_TABLE[age] ?? UNIFORM_LIFETIME_TABLE[100];
}

/**
 * Which pools are accessible in a given phase. Trad is locked pre-59.5.
 *
 * @param {Phase} phase
 * @returns {ReadonlySet<string>}
 */
function accessiblePools(phase) {
  if (phase === 'preUnlock') {
    return new Set(['cash', 'taxable', 'roth']);
  }
  return new Set(POOL_KEYS);
}

/**
 * Draw `amount` from the first pools in `order` that still have balance.
 * Mutates only the passed-in `remaining` and `drawn` locals (owned by caller).
 *
 * @param {number} amount                   real dollars to draw
 * @param {readonly string[]} order         pool-key priority
 * @param {ReadonlySet<string>} accessible  which pools are open this phase
 * @param {Record<string, number>} remaining  mutable per-call balance map
 * @param {Record<string, number>} drawn      mutable per-call draw accumulator
 * @returns {number}                        amount actually drawn (≤ requested)
 */
function drawFromPools(amount, order, accessible, remaining, drawn) {
  let need = amount;
  for (const key of order) {
    if (need <= 1e-9) break;
    if (!accessible.has(key)) continue;
    const available = remaining[key];
    if (available <= 0) continue;
    const take = Math.min(available, need);
    remaining[key] -= take;
    drawn[key] += take;
    need -= take;
  }
  return amount - need;
}

/**
 * Compute tax-aware withdrawals for a single retirement-phase year.
 *
 * @param {{
 *   annualSpendReal: number,
 *   pools: { trad401kReal: number, rothIraReal: number, taxableStocksReal: number, cashReal: number },
 *   phase: Phase,
 *   ssIncomeReal: number,
 *   age: number,
 *   tax: TaxConfig & { stockCostBasisFraction?: number },
 *   strategy: keyof typeof STRATEGY_ORDER,
 * }} params
 * @returns {{
 *   feasible: boolean,
 *   fromTradReal: number,
 *   fromRothReal: number,
 *   fromTaxableReal: number,
 *   fromCashReal: number,
 *   fromSSReal: number,
 *   taxOwedReal: number,
 *   netSpendReal: number,
 *   deficitReal?: number,
 * }}
 */
export function computeWithdrawal(params) {
  const {
    annualSpendReal,
    pools,
    phase,
    ssIncomeReal,
    age,
    tax,
    strategy,
  } = params;

  const order = STRATEGY_ORDER[strategy] ?? STRATEGY_ORDER['tax-optimized'];
  const accessible = accessiblePools(phase);
  const basisFraction = typeof tax.stockCostBasisFraction === 'number'
    ? tax.stockCostBasisFraction
    : 0.7;

  // Remaining balances + running draws. Both mutable locals — ok per Principle II
  // (no module-scope state; each call scope is its own world).
  const remaining = {
    cash:    pools.cashReal,
    taxable: pools.taxableStocksReal,
    roth:    pools.rothIraReal,
    trad:    pools.trad401kReal,
  };
  const drawn = { cash: 0, taxable: 0, roth: 0, trad: 0 };

  // SS income (if any) is "free" cash toward the spend need — phase-gated.
  const fromSSReal = phase === 'ssActive' ? ssIncomeReal : 0;

  // RMD first (if applicable) — forces a trad draw even if strategy would skip it.
  if (age >= tax.rmdAgeStart && accessible.has('trad') && remaining.trad > 0) {
    const rmdAmount = remaining.trad / rmdFactor(age);
    drawFromPools(rmdAmount, ['trad'], accessible, remaining, drawn);
  }

  // Spend need after SS offset. Portfolio must cover this + resulting tax.
  const spendNeedAfterSS = Math.max(0, annualSpendReal - fromSSReal);

  // Iterate: draw to cover (spend + estimated tax), recompute tax, repeat until
  // convergence or pools exhaust. Tax drag converges quickly because brackets
  // are piecewise-linear.
  let estimatedTax = 0;
  for (let iter = 0; iter < 8; iter += 1) {
    const totalDrawnSoFar = drawn.cash + drawn.taxable + drawn.roth + drawn.trad;
    const targetTotal = spendNeedAfterSS + estimatedTax;
    const gap = targetTotal - totalDrawnSoFar;
    if (gap > 1e-6) {
      drawFromPools(gap, order, accessible, remaining, drawn);
    }
    const ordinaryIncomeReal =
      drawn.trad + 0.85 * fromSSReal;
    const ltcgIncomeReal = drawn.taxable * (1 - basisFraction);
    const taxResult = computeTax({
      ordinaryIncomeReal,
      ltcgIncomeReal,
      age,
      tax,
    });
    const newTax = taxResult.totalOwedReal;
    if (Math.abs(newTax - estimatedTax) < 1e-6) {
      estimatedTax = newTax;
      break;
    }
    estimatedTax = newTax;
  }

  // Final tax (after last loop pass). One more top-up if tax drifted upward.
  const totalDrawn = drawn.cash + drawn.taxable + drawn.roth + drawn.trad;
  const required = spendNeedAfterSS + estimatedTax;
  if (totalDrawn + 1e-6 < required) {
    drawFromPools(required - totalDrawn, order, accessible, remaining, drawn);
  }

  // Re-score final tax against final draws (covers any top-up that pushed
  // a pool's realization higher).
  const finalOrdinaryIncome = drawn.trad + 0.85 * fromSSReal;
  const finalLtcgIncome = drawn.taxable * (1 - basisFraction);
  const finalTaxResult = computeTax({
    ordinaryIncomeReal: finalOrdinaryIncome,
    ltcgIncomeReal: finalLtcgIncome,
    age,
    tax,
  });
  const taxOwedReal = finalTaxResult.totalOwedReal;

  const finalTotalDrawn = drawn.cash + drawn.taxable + drawn.roth + drawn.trad;
  // netSpendReal is what the household actually got to spend AFTER paying tax,
  // PLUS SS. Portfolio contribution toward spend = finalTotalDrawn - tax.
  const netSpendReal = Math.min(
    annualSpendReal,
    finalTotalDrawn - taxOwedReal + fromSSReal,
  );
  const feasible =
    finalTotalDrawn + 1e-6 >= spendNeedAfterSS + taxOwedReal &&
    netSpendReal + 1e-6 >= annualSpendReal;

  /** @type {{
   *   feasible: boolean,
   *   fromTradReal: number, fromRothReal: number, fromTaxableReal: number,
   *   fromCashReal: number, fromSSReal: number,
   *   taxOwedReal: number, netSpendReal: number, deficitReal?: number,
   * }} */
  const base = {
    feasible,
    fromTradReal:    drawn.trad,
    fromRothReal:    drawn.roth,
    fromTaxableReal: drawn.taxable,
    fromCashReal:    drawn.cash,
    fromSSReal,
    taxOwedReal,
    netSpendReal: feasible ? annualSpendReal : netSpendReal,
  };

  if (!feasible) {
    const deficitReal = annualSpendReal - base.netSpendReal;
    return Object.freeze({ ...base, deficitReal });
  }
  return Object.freeze(base);
}
