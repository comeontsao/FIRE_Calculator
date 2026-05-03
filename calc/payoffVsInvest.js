/*
 * =============================================================================
 * MODULE: calc/payoffVsInvest.js (v3)
 *
 * Feature: 016-mortgage-payoff-vs-invest (v1) → 017-payoff-vs-invest-stages-and-lumpsum (v2) → 018-lifecycle-payoff-merge (v3)
 * Contract (v1): specs/016-mortgage-payoff-vs-invest/contracts/payoffVsInvest-calc.contract.md
 * Contract (v2): specs/017-payoff-vs-invest-stages-and-lumpsum/contracts/payoffVsInvest-calc-v2.contract.md
 * Contract (v3): specs/018-lifecycle-payoff-merge/contracts/payoffVsInvest-calc-v3.contract.md
 *
 * Inputs: PrepayInvestComparisonInputs (see data-model.md). Pure record;
 *          assembled by the renderer from existing dashboard state.
 *          v2 adds: lumpSumPayoff?: boolean (default false). When true, the
 *          Invest strategy fires a lump-sum payoff the first month its
 *          real-dollar brokerage equals the remaining real-dollar mortgage
 *          balance.
 *          v3 adds: mortgageStrategy?: 'prepay-extra' | 'invest-keep-paying' | 'invest-lump-sum'
 *          (canonical strategy, supersedes lumpSumPayoff). mfjStatus?: 'single' | 'mfj'.
 *          originalPurchasePrice?: number.
 * Outputs: PrepayInvestComparisonOutputs — { prepayPath, investPath,
 *          amortizationSplit, verdict, factors, crossover, refiAnnotation,
 *          subSteps, disabledReason?,
 *          lumpSumEvent (v2), stageBoundaries (v2) }.
 *          v3 adds: homeSaleEvent (HomeSaleEvent | null), postSaleBrokerageAtFire ({prepay, invest}),
 *          mortgageActivePayoffAge ({prepay, invest}).
 * Consumers:
 *   - FIRE-Dashboard.html → renderPayoffVsInvestBrokerageChart
 *       (reads liquidNetWorth, mortgageNaturalPayoff, mortgageFreedom.buyInAge,
 *        refiAnnotation, stageBoundaries (v2), lumpSumEvent (v2))
 *   - FIRE-Dashboard.html → renderPayoffVsInvestAmortizationChart
 *       (reads amortizationSplit)
 *   - FIRE-Dashboard.html → renderPayoffVsInvestVerdictBanner
 *       (reads mortgageNaturalPayoff, liquidNetWorth, lumpSumEvent (v2))
 *   - FIRE-Dashboard.html → renderPayoffVsInvestFactorBreakdown
 *       (reads factors)
 *   - FIRE-Dashboard-Generic.html → same four renderers (lockstep — Principle I)
 *   - tests/unit/payoffVsInvest.test.js → fixture-locked unit tests
 *   - Lifecycle simulator (FIRE-Dashboard.html / FIRE-Dashboard-Generic.html inline scripts)
 *       — consumes mortgageActivePayoffAge for sidebar, postSaleBrokerageAtFire as
 *         retirement-phase brokerage seed, lifecycle mortgage trajectory under active strategy.
 *
 * Policy : NO DOM access. NO Chart.js. NO localStorage. NO global mutable
 *          state. The renderer assembles inputs and consumes outputs; this
 *          module is one stateless transform.
 *
 * Constitution Principles:
 *   II  — pure module, contract-documented, audit-observable (subSteps).
 *   V   — UMD-style classic-script load (no `export` keyword).
 *   VI  — Consumers list above is canonical.
 *
 * v2 backwards compatibility (Inv-1): when `lumpSumPayoff === false` AND
 * `ownership !== 'buying-in'`, every output field is byte-identical to v1.
 * Locked by tests/unit/payoffVsInvest.test.js parity snapshots.
 *
 * v3 backwards compatibility (Inv-1, extends v2 Inv-1): when mortgageStrategy === 'invest-keep-paying'
 * (default) AND ownership !== 'buying-in' AND sellAtFire === false, every v2 output field is
 * byte-identical to v2. New v3 output fields (homeSaleEvent, postSaleBrokerageAtFire,
 * mortgageActivePayoffAge) are additive.
 *
 * FRAME (feature 022 / FR-009):
 *   Dominant frame: real-$ (every $ field — brokerage, mortgage balance,
 *     extra payment, lump-sum, home sale — lives in today's purchasing power
 *     per v3 contract). Aligns with the v3 module-header `real dollars`
 *     declarations on lines 14, 41, 50.
 *   Frame-conversion sites: NONE inside this module. Inflation rate enters
 *     as `inflation` config but is used only to derive the real return for
 *     stocks (nominal − inflation) — itself a real-$ rate.
 *
 * The 20% terminal-floor / Safe-mode logic in the rest of the project is
 * unrelated to this module — Payoff-vs-Invest is a side analysis that does
 * NOT participate in FIRE-age search or strategy ranking.
 * =============================================================================
 */

/**
 * @typedef {Object} LumpSumEvent
 * @property {number} age              The age (years) at which the trigger fired.
 * @property {number} monthInYear      0..11 — which month within the age year.
 * @property {number} brokerageBefore  Real $, rounded; brokerage immediately before the check.
 * @property {number} paidOff          Real $, rounded; remaining real-dollar mortgage balance at trigger
 *                                     (i.e., what the BANK receives — keeps v2 semantics).
 * @property {number} actualDrawdown   Real $, rounded; the brokerage drop including LTCG gross-up
 *                                     (= `paidOff × (1 + ltcgRate × stockGainPct)`). This is the true
 *                                     amount liquidated from the brokerage. v3 (feature 018, FR-011 / Q2=B).
 * @property {number} brokerageAfter   Real $, rounded; brokerage post-check (= brokerageBefore − actualDrawdown).
 */

/**
 * @typedef {Object} StageBoundaries
 * @property {number} windowStartAge       The age the comparison window begins at.
 * @property {number} firstPayoffAge       The age the first strategy becomes debt-free.
 * @property {'prepay'|'invest'} firstPayoffWinner  Which strategy got there first.
 * @property {number|null} secondPayoffAge The age the second strategy becomes debt-free, or null
 *                                         if it never reaches zero balance within the horizon.
 */

/**
 * @typedef {Object} HomeSaleEvent
 * @property {number} age                    The FIRE age at which the sale fires.
 * @property {number} homeValueAtFire        Real $, equal to homePrice under real-zero appreciation. Rounded.
 * @property {number} proceeds               homeValueAtFire * (1 - sellingCostPct), rounded.
 * @property {number} nominalGain            homeValueAtFire - originalPurchasePrice.
 * @property {number} section121Exclusion    250000 (single) or 500000 (mfj).
 * @property {number} taxableGain            max(0, nominalGain - section121Exclusion).
 * @property {number} capGainsTax            taxableGain * ltcgRate, rounded.
 * @property {number} netToBrokerage         proceeds - capGainsTax - remainingMortgageBalance, rounded.
 * @property {number} remainingMortgageBalance  Mortgage balance at FIRE under active strategy, rounded.
 */

const SAFE_TIE_FRACTION = 0.005; // 0.5% tie threshold per FR-007 / Verdict.isTie*

// ---------------------------------------------------------------------------
// Pure helpers (no closure, no side effects).
// ---------------------------------------------------------------------------

/**
 * Standard mortgage monthly payment formula.
 * @param {number} principal          dollars
 * @param {number} monthlyRate        decimal monthly rate (annualRate / 12)
 * @param {number} totalMonths        positive integer
 * @returns {number} monthly P&I payment in dollars; returns 0 if principal<=0 or totalMonths<=0
 */
function _pmt(principal, monthlyRate, totalMonths) {
  if (!Number.isFinite(principal) || principal <= 0) return 0;
  if (!Number.isFinite(totalMonths) || totalMonths <= 0) return 0;
  if (!Number.isFinite(monthlyRate) || monthlyRate <= 0) {
    // Zero-interest loan: equal principal portion each month.
    return principal / totalMonths;
  }
  const r = monthlyRate;
  const n = totalMonths;
  const factor = Math.pow(1 + r, n);
  return (principal * r * factor) / (factor - 1);
}

/**
 * Step a mortgage forward by one month. Pure: returns a new state record.
 *
 * @param {{balance:number, monthlyRate:number, monthlyPI:number}} state
 * @param {number} extraPrincipalThisMonth   extra applied to principal AFTER the regular P&I split
 * @returns {{balance:number, interestPaid:number, principalPaid:number, payoffThisMonth:boolean}}
 */
function _stepMonth(state, extraPrincipalThisMonth) {
  if (!state || state.balance <= 0) {
    return { balance: 0, interestPaid: 0, principalPaid: 0, payoffThisMonth: false };
  }
  const i = state.balance * state.monthlyRate;
  // Regular principal portion of P&I, capped at balance.
  let principalPortion = Math.max(0, state.monthlyPI - i);
  let totalPrincipal = principalPortion + Math.max(0, extraPrincipalThisMonth || 0);
  if (totalPrincipal > state.balance) totalPrincipal = state.balance;
  const newBalance = state.balance - totalPrincipal;
  return {
    balance: newBalance,
    interestPaid: i,
    principalPaid: totalPrincipal,
    payoffThisMonth: newBalance <= 1e-6 && state.balance > 1e-6,
  };
}

/**
 * Compute a real monthly compounding rate for the invested account.
 *
 * v1.2 (2026-04-28): NO annual tax drag. The Payoff-vs-Invest comparison
 * assumes BUY-AND-HOLD during the comparison window — stocks compound at the
 * full real return (returnRate − inflation) without realizing capital gains
 * year-over-year. This matches:
 *   1. The user's stated mental model ("constantly buy and don't sell").
 *   2. The rest of the dashboard's lifecycle simulator, which uses
 *      `realReturn = returnRate - inflationRate` directly (tax applies only
 *      at withdrawal via the active strategy's per-year mix, not annually).
 * Terminal LTCG would apply if/when the user actually sells the brokerage —
 * we don't model that here. The factor breakdown surfaces what the terminal
 * tax bite would be (`ltcgRate × stockGainPct`) so the user can mentally
 * adjust if their plan involves selling.
 *
 * @param {number} stocksReturn     nominal annual stocks return, e.g. 0.07
 * @param {number} inflation        annual inflation, e.g. 0.03
 * @returns {number} monthly real rate (no tax drag)
 */
function _monthlyRealReturn(stocksReturn, inflation) {
  const annualReal = (stocksReturn || 0) - (inflation || 0);
  return Math.pow(1 + annualReal, 1 / 12) - 1;
}
// Backwards-compat alias for any external caller (none expected, but safe).
const _monthlyRealReturnAfterTax = _monthlyRealReturn;

/**
 * Compound an investment account forward by one month. Pure.
 * @param {number} balance            current real-dollar balance
 * @param {number} contributionThisMonth     real-dollar contribution at start of month
 * @param {number} monthlyRealReturn  decimal monthly rate
 * @returns {number} new real-dollar balance
 */
function _compoundInvested(balance, contributionThisMonth, monthlyRealReturn) {
  const start = (Number.isFinite(balance) ? balance : 0)
              + (Number.isFinite(contributionThisMonth) ? contributionThisMonth : 0);
  const r = Number.isFinite(monthlyRealReturn) ? monthlyRealReturn : 0;
  return start * (1 + r);
}

/**
 * Find the first age in a wealth-path where the mortgage just hit zero (i.e.,
 * the row's `mortgageBalance <= 0` and the previous row was still positive).
 * Returns null if the mortgage never naturally pays off within the path's
 * horizon. Pure helper used by `_evaluateFactors` (cash-flow-head-start row)
 * and surfaced top-level as `mortgageNaturalPayoff` for the renderer.
 *
 * "Natural" here means "first time the row's nominal balance drops to zero" —
 * for the Prepay path this is the accelerated payoff age; for the Invest path
 * it's the bank's standard amortization end. Distinct from `mortgageFreedom`,
 * which uses `freeAndClearWealth >= 0` (cash-out crossover, not balance hit).
 *
 * @param {Array} path  wealth-path rows (prepayPath or investPath)
 * @returns {number|null} age at first natural payoff, or null
 */
function _firstNaturalPayoffAge(path) {
  for (let i = 0; i < path.length; i++) {
    if (path[i].mortgageBalance <= 0 && (i === 0 || path[i - 1].mortgageBalance > 0)) {
      return path[i].age;
    }
  }
  return null;
}

/**
 * Initialize a strategy's mortgage state from MortgageInputs at the start of
 * the comparison window (currentAge). Returns null if there's no mortgage to
 * simulate at all (e.g., already paid off).
 *
 * Important: for `already-own`, we fast-forward `yearsPaid * 12` months of
 * standard amortization to derive the current balance. We do NOT pretend the
 * user has been making extra payments before this comparison started.
 */
function _initMortgageState(mortgage) {
  if (!mortgage) return null;
  const annualRate = mortgage.rate;
  const monthlyRate = (annualRate || 0) / 12;
  const totalMonths = (mortgage.term || 30) * 12;

  if (mortgage.ownership === 'already-own') {
    const yearsPaid = Math.max(0, mortgage.yearsPaid || 0);
    if (yearsPaid >= (mortgage.term || 30)) {
      return null; // already paid off
    }
    const initialBalance = (mortgage.homePrice || 0) - (mortgage.downPayment || 0);
    const monthlyPI = _pmt(initialBalance, monthlyRate, totalMonths);
    // Fast-forward yearsPaid years of standard amortization.
    let bal = initialBalance;
    const monthsToFastForward = yearsPaid * 12;
    for (let m = 0; m < monthsToFastForward; m++) {
      const i = bal * monthlyRate;
      const p = Math.min(monthlyPI - i, bal);
      bal -= p;
      if (bal <= 0) { bal = 0; break; }
    }
    return {
      balance: bal,
      monthlyRate,
      monthlyPI,
      contractualRate: annualRate,
      contractualMonthlyPI: monthlyPI,
      monthsRemaining: Math.max(0, totalMonths - monthsToFastForward),
      buyInMonth: 0,         // already active
      hasStarted: true,
    };
  }

  if (mortgage.ownership === 'buying-in') {
    const buyInMonth = Math.max(0, (mortgage.buyInYears || 0) * 12);
    const initialBalance = (mortgage.homePrice || 0) - (mortgage.downPayment || 0);
    const monthlyPI = _pmt(initialBalance, monthlyRate, totalMonths);
    return {
      balance: initialBalance, // applied at buyInMonth
      monthlyRate,
      monthlyPI,
      contractualRate: annualRate,
      contractualMonthlyPI: monthlyPI,
      monthsRemaining: totalMonths,
      buyInMonth,
      hasStarted: false, // becomes true at buyInMonth
    };
  }

  // 'buying-now' (default)
  const initialBalance = (mortgage.homePrice || 0) - (mortgage.downPayment || 0);
  const monthlyPI = _pmt(initialBalance, monthlyRate, totalMonths);
  return {
    balance: initialBalance,
    monthlyRate,
    monthlyPI,
    contractualRate: annualRate,
    contractualMonthlyPI: monthlyPI,
    monthsRemaining: totalMonths,
    buyInMonth: 0,
    hasStarted: true,
  };
}

/**
 * Apply a planned refi to a mortgage state. Mutates a copy and returns it.
 * The refi resets the amortization clock: balance carries, term resets to
 * newTerm at newRate, P&I recomputed.
 */
function _applyRefi(state, plannedRefi) {
  if (!state || state.balance <= 0) return state; // no-op for paid-off mortgage
  const newAnnualRate = plannedRefi.newRate;
  const newMonthlyRate = newAnnualRate / 12;
  const newTotalMonths = plannedRefi.newTerm * 12;
  const newPI = _pmt(state.balance, newMonthlyRate, newTotalMonths);
  return Object.assign({}, state, {
    monthlyRate: newMonthlyRate,
    monthlyPI: newPI,
    contractualRate: newAnnualRate,
    contractualMonthlyPI: newPI,
    monthsRemaining: newTotalMonths,
  });
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function _validate(inputs) {
  if (!inputs || typeof inputs !== 'object') {
    return { ok: false, reason: 'invalid-ages' };
  }
  if (!Number.isFinite(inputs.currentAge) || !Number.isFinite(inputs.fireAge) || !Number.isFinite(inputs.endAge)) {
    return { ok: false, reason: 'invalid-ages' };
  }
  if (!(inputs.endAge > inputs.fireAge && inputs.fireAge > inputs.currentAge)) {
    return { ok: false, reason: 'invalid-ages' };
  }
  if (!inputs.mortgageEnabled || !inputs.mortgage) {
    return { ok: false, reason: 'no-mortgage' };
  }
  // Already-paid-off detection
  if (inputs.mortgage.ownership === 'already-own') {
    const yp = inputs.mortgage.yearsPaid || 0;
    const term = inputs.mortgage.term || 30;
    if (yp >= term) return { ok: false, reason: 'already-paid-off' };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

function computePayoffVsInvest(inputs) {
  const subSteps = ['validate inputs (mortgage state, ages, ranges)'];

  const v = _validate(inputs);
  if (!v.ok) {
    return {
      prepayPath: [],
      investPath: [],
      amortizationSplit: { prepay: [], invest: [] },
      verdict: null,
      factors: [],
      crossover: null,
      refiAnnotation: null,
      subSteps: [...subSteps, 'validation failed: ' + v.reason],
      disabledReason: v.reason,
    };
  }

  subSteps.push('initialize mortgage amortization for both strategies');

  const stateP = _initMortgageState(inputs.mortgage);
  const stateI = _initMortgageState(inputs.mortgage);
  if (!stateP || !stateI) {
    return {
      prepayPath: [],
      investPath: [],
      amortizationSplit: { prepay: [], invest: [] },
      verdict: null,
      factors: [],
      crossover: null,
      refiAnnotation: null,
      subSteps: [...subSteps, 'mortgage init returned null'],
      disabledReason: 'already-paid-off',
    };
  }

  // Window-start rule (v2, T008): for ownership='buying-in' with buyInYears>0,
  // the comparison window begins at currentAge + buyInYears (the age the user
  // actually takes on the mortgage). For all other cases it begins at currentAge.
  const isBuyingInDeferred = inputs.mortgage.ownership === 'buying-in' && (inputs.mortgage.buyInYears || 0) > 0;
  const windowStartAge = inputs.currentAge + (isBuyingInDeferred ? (inputs.mortgage.buyInYears || 0) : 0);
  if (isBuyingInDeferred) {
    subSteps.push('horizon starts at buy-in age (year offset ' + (inputs.mortgage.buyInYears || 0) + ')');
  }

  // Refi clamping: refiYear cannot precede mortgage start (buyInYears).
  let refi = null;
  let refiClampedNote = null;
  if (inputs.plannedRefi && inputs.plannedRefi.refiYear > 0) {
    const buyInYears = (inputs.mortgage.buyInYears || 0);
    let refiYear = inputs.plannedRefi.refiYear;
    if (refiYear < buyInYears) {
      refiYear = buyInYears;
      refiClampedNote = 'refi clamped to buy-in year';
    }
    refi = {
      refiYear,
      newRate: inputs.plannedRefi.newRate,
      newTerm: inputs.plannedRefi.newTerm,
    };
  }

  const strategy = _normalizeStrategy(inputs);
  const lumpSumPayoff = strategy === 'invest-lump-sum';

  // v3 (feature 018, T011): strategy-resolution subSteps — emitted early so
  // the audit trail reflects what strategy drives the entire simulation below.
  subSteps.push('resolve active mortgage strategy: ' + strategy + ' (from state._payoffVsInvest.mortgageStrategy)');
  subSteps.push('compute lifecycle mortgage trajectory under ' + strategy);

  const monthlyRealReturn = _monthlyRealReturn(inputs.stocksReturn, inputs.inflation);

  const extraMonthly = Math.max(0, Math.min(5000, inputs.extraMonthly || 0));

  let mortgageStateP = stateP;
  let mortgageStateI = stateI;
  let investedP = 0; // Prepay path's investment balance
  let investedI = 0; // Invest path's investment balance

  let lumpSumEvent = null; // v2 (feature 017): lump-sum trigger record, null until fired

  // v3 (feature 018, option 1 fold-in 2026-04-29): the home sale at FIRE is now
  // applied IN-LOOP at the fireAge year so prepayPath / investPath reflect the
  // brokerage injection and zeroed mortgage. Previously homeSaleEvent was a
  // post-loop metadata field and the chart's curve was drawn from natural
  // simulation only — visually inconsistent with the lifecycle chart's truncation.
  let homeSaleEvent = null;
  let saleApplied = false;

  // Track cumulative interest per strategy (for verdict + factor breakdown).
  let cumInterestP = 0;
  let cumInterestI = 0;

  const prepayPath = [];
  const investPath = [];
  const amortPrepay = [];
  const amortInvest = [];

  // Real-zero home appreciation: home value in real dollars stays equal to the
  // original purchase price (homePrice). Down payment + appreciation are
  // already-equity at start. For simplicity we use homePrice as the constant
  // real home value; when ownership === 'buying-in' the home value is $0
  // until buyInMonth.
  const homeValueReal = inputs.mortgage.homePrice || 0;
  // BUG FIX (2026-04-29): `buyInYears` is a 'buying-in'-only concept (the
  // user buys the home N years from now). For 'buying-now' and 'already-own',
  // the mortgage IS active from month 0 of the simulation. The dashboard's
  // form always renders the buyInYears slider (default 3), so reading it
  // unconditionally caused the calc to treat the first 36 months as
  // "pre-buy-in" — producing a row at age=currentAge with P&I=0, which the
  // lifecycle simulator's feature-018 strategy-aware lookup misinterpreted as
  // "mortgage already paid off" and zero'd out mtgSavingsAdjust. That made
  // Prepay's brokerage-contribution explode in early years.
  const buyInMonth = (inputs.mortgage.ownership === 'buying-in')
    ? Math.max(0, (inputs.mortgage.buyInYears || 0) * 12)
    : 0;

  subSteps.push('month-by-month: amortize Prepay path with extra principal');
  subSteps.push('month-by-month: amortize Invest path; deposit extra to brokerage');
  subSteps.push('month-by-month: compound brokerage at after-tax real return');

  if (refi) subSteps.push('apply planned refi at year ' + refi.refiYear);

  // Iterate by year (snapshot annually) but step monthly internally.
  // v2 (T008): start at windowStartAge (= currentAge + buyInYears for
  // deferred buying-in; = currentAge for all other ownership types).
  for (let age = windowStartAge; age <= inputs.endAge; age++) {
    const yearOffset = age - inputs.currentAge;

    let yearInterestP = 0;
    let yearInterestI = 0;
    let yearPrincipalP = 0;
    let yearPrincipalI = 0;
    // v1.4 (2026-04-28): track per-year brokerage contribution for the
    // "Where each dollar goes" chart. Captures the cash that goes to the
    // brokerage account each month, mirroring the same conditional branches
    // used by the existing `_compoundInvested` calls below. The apples-to-
    // apples invariant is:
    //   interest + principal + brokerageContrib (Prepay)
    //     === interest + principal + brokerageContrib (Invest)
    // for every row, because both strategies spend the same total cash each
    // month — only the destination (mortgage principal vs brokerage) differs.
    let yearBrokerageP = 0;
    let yearBrokerageI = 0;

    for (let monthInYear = 0; monthInYear < 12; monthInYear++) {
      const monthIndex = yearOffset * 12 + monthInYear;

      // Refi event handling — at the START of the refi month
      if (refi && monthIndex === refi.refiYear * 12) {
        mortgageStateP = _applyRefi(mortgageStateP, refi);
        mortgageStateI = _applyRefi(mortgageStateI, refi);
      }

      // Buy-in activation — start applying mortgage payments at buyInMonth
      const mortgageActiveThisMonth = monthIndex >= buyInMonth;

      // ----- Prepay strategy -----
      if (mortgageActiveThisMonth && mortgageStateP.balance > 0) {
        const stepP = _stepMonth(mortgageStateP, extraMonthly);
        mortgageStateP = Object.assign({}, mortgageStateP, { balance: stepP.balance });
        yearInterestP += stepP.interestPaid;
        yearPrincipalP += stepP.principalPaid;
        cumInterestP += stepP.interestPaid;
        // Brokerage contrib this month: 0 in normal active months (extra goes to
        // principal). EXCEPTION: in the payoff month itself, _stepMonth caps the
        // principal payment at the remaining balance, so the user's intended
        // monthly cash outlay (contractualPI + extraMonthly) overshoots the
        // actual mortgage payment by `(contractualPI + extraMonthly) - (interest
        // + principal_paid)`. That leftover cash is unspent on mortgage and is
        // attributed to the brokerage so that the apples-to-apples cash-outlay
        // invariant holds: P&I + brokerage_contrib (Prepay) ===
        // P&I + brokerage_contrib (Invest) for every row.
        const intendedOutlay = mortgageStateP.contractualMonthlyPI + extraMonthly;
        const actualMortgageOutlay = stepP.interestPaid + stepP.principalPaid;
        const leftover = Math.max(0, intendedOutlay - actualMortgageOutlay);
        yearBrokerageP += leftover;
        // Compound any existing invested balance (post-payoff this won't be entered)
        investedP = _compoundInvested(investedP, 0, monthlyRealReturn);
      } else {
        // Mortgage paid off — redirect (former P&I + extraMonthly) to investments
        const freedCashFlow = mortgageStateP.contractualMonthlyPI + extraMonthly;
        yearBrokerageP += freedCashFlow;
        investedP = _compoundInvested(investedP, freedCashFlow, monthlyRealReturn);
      }

      // ----- Invest strategy -----
      // v2 (feature 017): lump-sum trigger — Invest writes a check the moment its
      // real-dollar brokerage equals the remaining real-dollar mortgage balance.
      // See specs/017-.../data-model.md §"Lump-sum trigger algorithm".
      // v3 (feature 018, T028): Inv-3 extension — when sellAtFire===true, the trigger
      // was inhibited at age >= fireAge (home sale at FIRE retires the mortgage instead).
      // v5 (feature 024, B-024-2): Inv-3 extended further — when sellAtFire===true the
      // trigger is inhibited UNCONDITIONALLY (not just at age >= fireAge). The home
      // sale at FIRE will discharge the remaining mortgage from sale proceeds, so a
      // pre-FIRE lump-sum payoff would needlessly drain the brokerage AND incur
      // avoidable LTCG. Effective behavior in this scenario: invest-lump-sum
      // simulates as invest-keep-paying.
      var sellAtFireSet = inputs.mortgage && inputs.mortgage.sellAtFire === true && inputs.mortgageEnabled;
      if (lumpSumPayoff && lumpSumEvent === null && mortgageActiveThisMonth && mortgageStateI.balance > 0
          && !sellAtFireSet) {
        const yearOffsetForTrigger = age - inputs.currentAge;
        const inflationFactorAtTrigger = Math.pow(1 + (inputs.inflation || 0), yearOffsetForTrigger);
        const realBalance = mortgageStateI.balance / inflationFactorAtTrigger;
        // v3 (feature 018, T028): Inv-4 LTCG gross-up — brokerage drops by
        // realBalance × (1 + ltcgRate × stockGainPct) to cover BOTH the mortgage
        // payoff AND the LTCG tax owed when liquidating shares. The trigger threshold
        // is therefore `actualDrawdown`, not just `realBalance` — fire only when the
        // brokerage can cover the gross-up. Otherwise brokerageAfter would go negative.
        const grossUpFactor = 1 + ((inputs.ltcgRate || 0) * (inputs.stockGainPct || 0));
        const actualDrawdown = realBalance * grossUpFactor;
        if (investedI >= actualDrawdown) {
          const brokerageBefore = investedI;
          const paidOff = realBalance; // v2 semantics retained: what the bank receives.
          investedI = investedI - actualDrawdown;
          mortgageStateI = Object.assign({}, mortgageStateI, { balance: 0 });
          lumpSumEvent = {
            age: age,
            monthInYear: monthInYear,
            brokerageBefore: Math.round(brokerageBefore),
            paidOff: Math.round(paidOff),
            actualDrawdown: Math.round(actualDrawdown),
            brokerageAfter: Math.round(investedI),
          };
          // Fall through into the existing else branch (mortgage paid off → redirect freed cash flow + extra).
        }
      }
      if (mortgageActiveThisMonth && mortgageStateI.balance > 0) {
        const stepI = _stepMonth(mortgageStateI, 0);
        mortgageStateI = Object.assign({}, mortgageStateI, { balance: stepI.balance });
        yearInterestI += stepI.interestPaid;
        yearPrincipalI += stepI.principalPaid;
        cumInterestI += stepI.interestPaid;
        // Brokerage contrib this month: extraMonthly (mortgage gets only contractual P&I).
        yearBrokerageI += extraMonthly;
        // Deposit extra to brokerage AND compound
        investedI = _compoundInvested(investedI, extraMonthly, monthlyRealReturn);
      } else {
        // Mortgage paid off — redirect freed cash flow + extra to investments
        const freedCashFlow = mortgageStateI.contractualMonthlyPI + extraMonthly;
        yearBrokerageI += freedCashFlow;
        investedI = _compoundInvested(investedI, freedCashFlow, monthlyRealReturn);
      }
    }

    // v3 (feature 018, option 1 fold-in): apply home sale at end of fireAge year
    // BEFORE recording the snapshot so the snapshot at fireAge reflects post-sale
    // state. The sale runs once. Applying after the month loop means the user
    // pays one full year of mortgage P&I during the fireAge year (matches the
    // lifecycle simulator's pre-FIRE accumulation), then sells at year-end.
    if (
      !saleApplied
      && inputs.mortgageEnabled
      && inputs.mortgage
      && inputs.mortgage.sellAtFire === true
      && age === inputs.fireAge
    ) {
      const inflationFactorAtSale = Math.pow(1 + (inputs.inflation || 0), age - inputs.currentAge);
      const preSaleRemainingP_real = mortgageStateP.balance / inflationFactorAtSale;
      const preSaleRemainingI_real = mortgageStateI.balance / inflationFactorAtSale;

      const homeValueAtFire = inputs.mortgage.homePrice || 0;
      const originalPurchasePriceForSale =
        (typeof inputs.originalPurchasePrice === 'number' && Number.isFinite(inputs.originalPurchasePrice))
          ? inputs.originalPurchasePrice
          : (inputs.mortgage.homePrice || 0);
      const mfjStatusForSale = inputs.mfjStatus === 'single' ? 'single' : 'mfj';
      const sellingCostPctForSale = (typeof inputs.mortgage.sellingCostPct === 'number')
        ? inputs.mortgage.sellingCostPct : 0.06;
      const ltcgRateForSale = inputs.ltcgRate || 0;

      const proceedsAtSale = Math.round(homeValueAtFire * (1 - sellingCostPctForSale));
      const taxAtSale = _section121Tax(homeValueAtFire, originalPurchasePriceForSale, mfjStatusForSale, ltcgRateForSale);

      const netToBrokerageP = Math.round(proceedsAtSale - taxAtSale.capGainsTax - preSaleRemainingP_real);
      const netToBrokerageI = Math.round(proceedsAtSale - taxAtSale.capGainsTax - preSaleRemainingI_real);

      // Inject sale proceeds + zero mortgage state. The next year's month-loop
      // will see balance=0 and route freed cash flow (P&I + extra) to brokerage.
      investedP = investedP + netToBrokerageP;
      investedI = investedI + netToBrokerageI;
      mortgageStateP = Object.assign({}, mortgageStateP, { balance: 0 });
      mortgageStateI = Object.assign({}, mortgageStateI, { balance: 0 });

      const activeRemaining = (strategy === 'prepay-extra') ? preSaleRemainingP_real : preSaleRemainingI_real;
      const activeNetToBrokerage = (strategy === 'prepay-extra') ? netToBrokerageP : netToBrokerageI;

      homeSaleEvent = {
        age: inputs.fireAge,
        homeValueAtFire: Math.round(homeValueAtFire),
        proceeds: proceedsAtSale,
        nominalGain: Math.round(taxAtSale.nominalGain),
        section121Exclusion: taxAtSale.section121Exclusion,
        taxableGain: Math.round(taxAtSale.taxableGain),
        capGainsTax: taxAtSale.capGainsTax,
        netToBrokerage: activeNetToBrokerage,
        remainingMortgageBalance: Math.round(activeRemaining),
      };
      saleApplied = true;
    }

    // End of year — record snapshot
    // v3 (feature 018, option 1 fold-in): once `saleApplied` is true, the home
    // is no longer owned. Force homeValueThisYear to 0 so homeEquity / totalNetWorth
    // correctly reflect "house gone" for fireAge and all subsequent rows.
    const homeValueThisYear = (mortgageActiveOrPostStarted(buyInMonth, yearOffset) && !saleApplied) ? homeValueReal : 0;
    // CORRECTNESS FIX (v1.1, 2026-04-28): the mortgage balance evolves nominally
    // (it's a fixed-nominal liability — the bank doesn't deflate your debt for
    // inflation) but the home value is held constant in REAL dollars. To keep
    // home_equity as a real-dollar quantity, we MUST deflate the nominal balance
    // to today's purchasing power before subtracting from the real home value.
    // Skipping this step over-stated the Prepay path's apparent advantage by
    // denying both strategies the inflation-tailwind benefit on their remaining
    // fixed-nominal mortgage debt. See specs/016-mortgage-payoff-vs-invest/CLOSEOUT.md
    // §"v1.1 correctness fix" for the discussion.
    const inflationFactor = Math.pow(1 + (inputs.inflation || 0), yearOffset);
    const realMortgageBalanceP = mortgageStateP.balance / inflationFactor;
    const realMortgageBalanceI = mortgageStateI.balance / inflationFactor;
    const homeEquityP = Math.max(0, homeValueThisYear - realMortgageBalanceP);
    const homeEquityI = Math.max(0, homeValueThisYear - realMortgageBalanceI);

    const totalP = homeEquityP + investedP;
    const totalI = homeEquityI + investedI;

    // freeAndClearWealth (v1.5, 2026-04-28): real-dollar measure of
    // "could the user pay off the mortgage today and still have something
    // left over?". Computed as `invested - mortgageBalanceReal` so both
    // operands are in today's purchasing power. Crosses ≥ 0 the moment a
    // strategy reaches mortgage freedom — used for the new payoff-age
    // comparison chart and the `mortgageFreedom` summary below.
    //
    // v1.6 (2026-04-28): gate the mortgage subtraction on whether the
    // mortgage has actually started. For ownership='buying-in' with
    // buyInYears>0, the user has NOT yet taken on the loan during pre-buy-in
    // years — subtracting the (already-initialized) $400K balance produces
    // false negatives that show the chart starting at -$467K. Once the
    // mortgage is active (yearOffset*12 >= buyInMonth), the subtraction
    // applies as before. Note: we deliberately leave `mortgageBalance` and
    // `mortgageBalanceReal` row fields untouched — they are still the
    // truthful nominal/real liability and are consumed by `_computeVerdict`
    // (naturalPayoffYear) and `_evaluateFactors` (payoff-age detection).
    // Only freeAndClearWealth changes.
    const mortgageHasStarted = mortgageActiveOrPostStarted(buyInMonth, yearOffset);
    const effectiveMortgageRealP = mortgageHasStarted ? realMortgageBalanceP : 0;
    const effectiveMortgageRealI = mortgageHasStarted ? realMortgageBalanceI : 0;
    const freeAndClearP = Math.round(investedP - effectiveMortgageRealP);
    const freeAndClearI = Math.round(investedI - effectiveMortgageRealI);

    // v2 (T008): for the deferred buying-in case, the first path row at
    // windowStartAge is the OPENING snapshot (initial conditions before any
    // processing). This makes both strategies start at invested=0 on the chart,
    // which is the user-facing expectation: "at the moment you buy in, both
    // strategies have $0 in brokerage." The amort rows still capture the real
    // activity that happened during that year.
    // For all other cases (and all subsequent years), use the normal end-of-year
    // snapshot (post-processing). stateP / stateI are the ORIGINAL init states
    // (unchanged by Object.assign reassignments of mortgageStateP/I), so
    // stateP.balance is always the initial nominal balance at comparison start.
    if (isBuyingInDeferred && age === windowStartAge) {
      const openingRealBalP = stateP.balance / inflationFactor;
      const openingRealBalI = stateI.balance / inflationFactor;
      const openingHomeEquityP = Math.max(0, homeValueReal - openingRealBalP);
      const openingHomeEquityI = Math.max(0, homeValueReal - openingRealBalI);
      prepayPath.push({
        age,
        year: yearOffset,
        mortgageBalance: Math.round(stateP.balance),
        mortgageBalanceReal: Math.round(openingRealBalP),
        homeEquity: Math.round(openingHomeEquityP),
        invested: 0,
        totalNetWorth: Math.round(openingHomeEquityP),
        liquidNetWorth: 0,
        freeAndClearWealth: Math.round(0 - openingRealBalP),
      });
      investPath.push({
        age,
        year: yearOffset,
        mortgageBalance: Math.round(stateI.balance),
        mortgageBalanceReal: Math.round(openingRealBalI),
        homeEquity: Math.round(openingHomeEquityI),
        invested: 0,
        totalNetWorth: Math.round(openingHomeEquityI),
        liquidNetWorth: 0,
        freeAndClearWealth: Math.round(0 - openingRealBalI),
      });
    } else {
      prepayPath.push({
        age,
        year: yearOffset,
        mortgageBalance: Math.round(mortgageStateP.balance),         // nominal (what user owes the bank)
        mortgageBalanceReal: Math.round(realMortgageBalanceP),       // real (today's purchasing power)
        homeEquity: Math.round(homeEquityP),
        invested: Math.round(investedP),
        totalNetWorth: Math.round(totalP),
        liquidNetWorth: Math.round(investedP),
        freeAndClearWealth: freeAndClearP,
      });
      investPath.push({
        age,
        year: yearOffset,
        mortgageBalance: Math.round(mortgageStateI.balance),         // nominal
        mortgageBalanceReal: Math.round(realMortgageBalanceI),       // real
        homeEquity: Math.round(homeEquityI),
        invested: Math.round(investedI),
        totalNetWorth: Math.round(totalI),
        liquidNetWorth: Math.round(investedI),
        freeAndClearWealth: freeAndClearI,
      });
    }
    amortPrepay.push({
      age,
      year: yearOffset,
      interestPaidThisYear: Math.round(yearInterestP),
      principalPaidThisYear: Math.round(yearPrincipalP),
      brokerageContribThisYear: Math.round(yearBrokerageP),
      cumulativeInterest: Math.round(cumInterestP),
      cumulativePrincipal: 0, // computed below
    });
    amortInvest.push({
      age,
      year: yearOffset,
      interestPaidThisYear: Math.round(yearInterestI),
      principalPaidThisYear: Math.round(yearPrincipalI),
      brokerageContribThisYear: Math.round(yearBrokerageI),
      cumulativeInterest: Math.round(cumInterestI),
      cumulativePrincipal: 0,
    });
  }

  // Backfill cumulativePrincipal
  let cumPP = 0; let cumPI = 0;
  for (let i = 0; i < amortPrepay.length; i++) {
    cumPP += amortPrepay[i].principalPaidThisYear;
    cumPI += amortInvest[i].principalPaidThisYear;
    amortPrepay[i].cumulativePrincipal = Math.round(cumPP);
    amortInvest[i].cumulativePrincipal = Math.round(cumPI);
  }

  if (lumpSumPayoff) {
    subSteps.push('check lump-sum payoff trigger each month for Invest');
  }
  if (lumpSumEvent !== null) {
    subSteps.push('lump-sum fires at age ' + lumpSumEvent.age + ': brokerage drops from ' + lumpSumEvent.brokerageBefore + ' to ' + lumpSumEvent.brokerageAfter);
  }
  subSteps.push('aggregate monthly accruals into annual WealthPath rows');

  // ----- Detect crossover -----
  subSteps.push('detect crossover via linear interpolation (R6)');
  const framingKey = inputs.framing === 'liquidNetWorth' ? 'liquidNetWorth' : 'totalNetWorth';
  const crossover = _detectCrossover(prepayPath, investPath, framingKey);

  // ----- Verdict -----
  subSteps.push('compute verdict at fireAge + endAge');
  subSteps.push('compute mortgage-freedom age for each strategy (freeAndClearWealth ≥ 0 crossing)');
  const fireRowP = prepayPath.find((r) => r.age === inputs.fireAge);
  const fireRowI = investPath.find((r) => r.age === inputs.fireAge);
  const endRowP = prepayPath[prepayPath.length - 1];
  const endRowI = investPath[investPath.length - 1];
  const verdict = _computeVerdict(fireRowP, fireRowI, endRowP, endRowI, framingKey, prepayPath, investPath);

  // ----- Mortgage Freedom (v1.5) -----
  // The age each strategy first reaches "mortgage freedom" — defined as the
  // first row where freeAndClearWealth (= invested - mortgageBalanceReal) is
  // non-negative. For Prepay this is the natural payoff age (mortgage hits 0
  // and brokerage is non-negative). For Invest it's the age the brokerage
  // first equals or exceeds the remaining mortgage balance — i.e., the user
  // could sell stocks and write a check to retire the loan.
  const prepayFreedomAge = _firstFreedomAge(prepayPath, buyInMonth);
  const investFreedomAge = _firstFreedomAge(investPath, buyInMonth);
  let freedomWinner = 'tie';
  let freedomMarginYears = 0;
  if (prepayFreedomAge !== null && investFreedomAge !== null) {
    if (prepayFreedomAge < investFreedomAge) {
      freedomWinner = 'prepay';
      freedomMarginYears = investFreedomAge - prepayFreedomAge;
    } else if (investFreedomAge < prepayFreedomAge) {
      freedomWinner = 'invest';
      freedomMarginYears = prepayFreedomAge - investFreedomAge;
    }
  } else if (prepayFreedomAge !== null) {
    freedomWinner = 'prepay';
    freedomMarginYears = null; // invest never reaches freedom in horizon
  } else if (investFreedomAge !== null) {
    freedomWinner = 'invest';
    freedomMarginYears = null;
  }
  // v1.6 (2026-04-28): expose buyInAge so the chart can render an annotation
  // at the moment the mortgage actually appears in the comparison. Null for
  // ownership types where the loan starts at currentAge ('buying-now',
  // 'already-own').
  const buyInAge = (inputs.mortgage.ownership === 'buying-in' && inputs.mortgage.buyInYears > 0)
    ? inputs.currentAge + inputs.mortgage.buyInYears
    : null;
  subSteps.push('record buy-in age (or null) for chart annotation');
  const mortgageFreedom = {
    prepayAge: prepayFreedomAge,
    investAge: investFreedomAge,
    winner: freedomWinner,
    marginYears: freedomMarginYears,
    buyInAge,
  };

  // ----- Natural Mortgage Payoff (v1.7, 2026-04-28) -----
  // The age at which each strategy's mortgage balance naturally hits zero.
  // Distinct from mortgageFreedom (which is the freeAndClearWealth ≥ 0
  // crossover): this is purely "when did the bank stamp the loan PAID?".
  // Surfaced top-level so the brokerage-only chart can mark "house fully paid
  // off" events without recomputing.
  subSteps.push('record natural mortgage payoff ages for both strategies');
  const mortgageNaturalPayoff = {
    prepayAge: _firstNaturalPayoffAge(prepayPath),
    investAge: lumpSumEvent !== null ? lumpSumEvent.age : _firstNaturalPayoffAge(investPath),
  };

  // ----- Stage Boundaries (v2, T016) -----
  // stageBoundaries is always computed; the subStep entry is only emitted when
  // lumpSumPayoff===true to preserve Inv-1 backwards compatibility (v1 subSteps
  // array must be byte-identical when the switch is off).
  if (lumpSumPayoff) {
    subSteps.push('compute stageBoundaries from path inflection points');
  }
  const stageBoundaries = _findStageBoundaries(prepayPath, investPath, windowStartAge, lumpSumEvent);

  // v3 (feature 018, T010): per-strategy mortgage payoff age for the sidebar
  // mortgage indicator (FR-005) and lifecycle simulator mortgage trajectory.
  // Uses path-based natural-payoff detection — the first row where
  // mortgageBalance hits 0. For invest-lump-sum, _firstNaturalPayoffAge already
  // detects the payoff because the lump-sum trigger zeroes the path balance in
  // the same month. Both fields can be null (never paid off in horizon).
  const mortgageActivePayoffAge = {
    prepay: _firstNaturalPayoffAge(prepayPath),
    invest: _firstNaturalPayoffAge(investPath),
  };

  // v3 (feature 018, option 1 fold-in 2026-04-29): homeSaleEvent is now built
  // INSIDE the year loop (at age === fireAge) — see the saleApplied block
  // above. Both prepayPath / investPath rows at fireAge already reflect the
  // brokerage injection and zeroed mortgage; postSaleBrokerageAtFire therefore
  // simplifies to "the brokerage value already in the path row at fireAge".
  // No double-counting: the path's `invested` field IS the post-sale brokerage.
  var fireRowPPost = prepayPath.find(function(r) { return r.age === inputs.fireAge; });
  var fireRowIPost = investPath.find(function(r) { return r.age === inputs.fireAge; });
  var postSaleBrokerageAtFire = {
    prepay: fireRowPPost ? fireRowPPost.invested : 0,
    invest: fireRowIPost ? fireRowIPost.invested : 0,
  };

  // ----- Factors -----
  subSteps.push('score factors and assign favoredStrategy / magnitude');
  const factors = _evaluateFactors(inputs, prepayPath, investPath, cumInterestP, cumInterestI, verdict, refi);

  const refiAnnotation = refi ? {
    refiAge: inputs.currentAge + refi.refiYear,
    refiYear: refi.refiYear,
    oldRate: inputs.mortgage.rate,
    newRate: refi.newRate,
    newTerm: refi.newTerm,
  } : null;

  // v3 (feature 018, T030): audit subSteps for sell-at-FIRE event.
  if (homeSaleEvent !== null) {
    subSteps.push('evaluate sell-at-FIRE event at age ' + inputs.fireAge);
    subSteps.push('Section 121 exclusion: nominalGain=' + homeSaleEvent.nominalGain + ', exclusion=' + homeSaleEvent.section121Exclusion + ', taxableGain=' + homeSaleEvent.taxableGain);
    subSteps.push('home-sale capital gains tax: taxableGain × ltcgRate = ' + homeSaleEvent.capGainsTax);
  }
  subSteps.push('credit post-sale brokerage at FIRE = prepay:' + postSaleBrokerageAtFire.prepay + ', invest:' + postSaleBrokerageAtFire.invest);
  subSteps.push('lifecycle handoff: pre-FIRE simulator → retirement-phase simulator');

  return {
    prepayPath,
    investPath,
    amortizationSplit: { prepay: amortPrepay, invest: amortInvest },
    verdict,
    factors,
    crossover,
    refiAnnotation,
    refiClampedNote,
    mortgageFreedom,
    mortgageNaturalPayoff,
    lumpSumEvent,
    stageBoundaries,
    mortgageActivePayoffAge,
    homeSaleEvent,
    postSaleBrokerageAtFire,
    subSteps,
  };
}

/**
 * Find the first age in `path` where freeAndClearWealth >= 0. Returns null if
 * the path never crosses the threshold within its horizon. Pure helper used by
 * the mortgageFreedom summary.
 *
 * v1.6 (2026-04-28): skip pre-buy-in years. Without this guard, ownership=
 * 'buying-in' with buyInYears>0 would falsely report `currentAge` as the
 * freedom age — the gating fix above makes pre-buy-in `freeAndClearWealth`
 * equal to `invested` (≥ 0 immediately), but those years aren't truly
 * "mortgage-free", they're "pre-mortgage". The buy-in is a future obligation
 * the user has chosen to take on; freedom should be measured from it.
 *
 * @param {Array} path        wealth-path rows
 * @param {number} buyInMonth months from currentAge until the mortgage activates
 */
function _firstFreedomAge(path, buyInMonth) {
  const safeBuyInMonth = Number.isFinite(buyInMonth) && buyInMonth > 0 ? buyInMonth : 0;
  for (let i = 0; i < path.length; i++) {
    if (path[i].year * 12 < safeBuyInMonth) continue; // pre-buy-in: mortgage doesn't exist yet
    if (path[i].freeAndClearWealth >= 0) return path[i].age;
  }
  return null;
}

// Helper for "is the mortgage active or post-payoff this year" — used to
// gate home-equity inclusion before buy-in.
function mortgageActiveOrPostStarted(buyInMonth, yearOffset) {
  return yearOffset * 12 >= buyInMonth;
}

/**
 * Compute event-driven stage boundaries from the two amortization paths plus the
 * optional lump-sum event. Returns:
 *   { windowStartAge, firstPayoffAge, firstPayoffWinner, secondPayoffAge }
 * See specs/017-payoff-vs-invest-stages-and-lumpsum/data-model.md.
 *
 * @param {Array} prepayPath
 * @param {Array} investPath
 * @param {number} windowStartAge
 * @param {LumpSumEvent|null} lumpSumEvent  - present means Invest's payoff is the lump-sum age
 * @returns {StageBoundaries}
 */
function _findStageBoundaries(prepayPath, investPath, windowStartAge, lumpSumEvent) {
  const prepayPayoff = _firstNaturalPayoffAge(prepayPath);    // already exists in module
  var investPayoff;
  if (lumpSumEvent && Number.isFinite(lumpSumEvent.age)) {
    investPayoff = lumpSumEvent.age;                           // Invest pays off via lump sum
  } else {
    investPayoff = _firstNaturalPayoffAge(investPath);         // bank's amortization end
  }

  // Defensive: if both are null, still return a valid record (degenerate scenario).
  // firstPayoffAge: smaller of the two (or whichever is non-null).
  // firstPayoffWinner: 'prepay' or 'invest' based on who got there first; ties → 'prepay' (deterministic).
  var firstPayoffAge, firstPayoffWinner, secondPayoffAge;

  if (prepayPayoff !== null && investPayoff !== null) {
    if (prepayPayoff <= investPayoff) {
      firstPayoffAge = prepayPayoff;
      firstPayoffWinner = 'prepay';
      secondPayoffAge = (investPayoff > prepayPayoff) ? investPayoff : null;
    } else {
      firstPayoffAge = investPayoff;
      firstPayoffWinner = 'invest';
      secondPayoffAge = prepayPayoff;
    }
  } else if (prepayPayoff !== null) {
    firstPayoffAge = prepayPayoff;
    firstPayoffWinner = 'prepay';
    secondPayoffAge = null;
  } else if (investPayoff !== null) {
    firstPayoffAge = investPayoff;
    firstPayoffWinner = 'invest';
    secondPayoffAge = null;
  } else {
    // Neither paid off in horizon — degenerate. Use windowStartAge for firstPayoffAge to avoid undefined.
    firstPayoffAge = windowStartAge;
    firstPayoffWinner = 'prepay';     // arbitrary deterministic default
    secondPayoffAge = null;
  }

  return { windowStartAge: windowStartAge, firstPayoffAge: firstPayoffAge, firstPayoffWinner: firstPayoffWinner, secondPayoffAge: secondPayoffAge };
}

// ---------------------------------------------------------------------------
// Crossover, Verdict, Factors
// ---------------------------------------------------------------------------

function _detectCrossover(prepayPath, investPath, framingKey) {
  // v1.1 (2026-04-28): scan from END BACKWARDS to return the LAST crossover.
  // After the real-mortgage-balance fix, scenarios near the rate-tie boundary
  // can produce two crossovers — a tiny noise-level one at the very start
  // (sub-0.01% spread that flips sign once and back), then a meaningful
  // permanent-winner crossover later. The "permanent winner" transition is
  // what the user actually wants to know about; the noise-level early one
  // is distracting. Returning the LAST crossover gives the user the
  // long-term-decisive answer.
  for (let i = prepayPath.length - 1; i >= 1; i--) {
    const pp = prepayPath[i - 1][framingKey];
    const ii = investPath[i - 1][framingKey];
    const pn = prepayPath[i][framingKey];
    const iN = investPath[i][framingKey];
    const prevSign = Math.sign(pp - ii);
    const newSign = Math.sign(pn - iN);
    if (prevSign !== 0 && newSign !== 0 && prevSign !== newSign) {
      const dx1 = pp - ii;
      const dx2 = pn - iN;
      const t = Math.abs(dx1) / (Math.abs(dx1) + Math.abs(dx2));
      const ageBetween = prepayPath[i - 1].age + t;
      const totalAtCross = pp + (pn - pp) * t;
      return {
        age: ageBetween,
        ageRoundedDisplay: Math.round(ageBetween),
        year: prepayPath[i - 1].year + t,
        totalNetWorth: Math.round(totalAtCross),
      };
    }
  }
  return null;
}

function _computeVerdict(fireRowP, fireRowI, endRowP, endRowI, framingKey, fullPathP, fullPathI) {
  const fireP = fireRowP ? fireRowP[framingKey] : 0;
  const fireI = fireRowI ? fireRowI[framingKey] : 0;
  const endP = endRowP ? endRowP[framingKey] : 0;
  const endI = endRowI ? endRowI[framingKey] : 0;

  const maxAtFire = Math.max(Math.abs(fireP), Math.abs(fireI), 1);
  const maxAtEnd = Math.max(Math.abs(endP), Math.abs(endI), 1);

  const isTieAtFire = Math.abs(fireP - fireI) / maxAtFire < SAFE_TIE_FRACTION;
  const isTieAtEnd = Math.abs(endP - endI) / maxAtEnd < SAFE_TIE_FRACTION;

  let winnerAtFire = 'tie';
  if (!isTieAtFire) winnerAtFire = fireP > fireI ? 'prepay' : 'invest';
  let winnerAtEnd = 'tie';
  if (!isTieAtEnd) winnerAtEnd = endP > endI ? 'prepay' : 'invest';

  // Natural payoff year (Invest path's mortgage natural payoff)
  let naturalPayoffYear = null;
  for (let i = 0; i < fullPathI.length; i++) {
    if (fullPathI[i].mortgageBalance <= 0 && (i === 0 || fullPathI[i - 1].mortgageBalance > 0)) {
      naturalPayoffYear = fullPathI[i].age;
      break;
    }
  }

  return {
    winnerAtFire,
    marginAtFire: Math.round(Math.abs(fireP - fireI)),
    winnerAtEnd,
    marginAtEnd: Math.round(Math.abs(endP - endI)),
    isTieAtFire,
    isTieAtEnd,
    naturalPayoffYear,
  };
}

function _evaluateFactors(inputs, prepayPath, investPath, cumInterestP, cumInterestI, verdict, refi) {
  const factors = [];
  // v1.2 — buy-and-hold accumulation: stocks compound at full real return
  // (no annual tax drag). Terminal LTCG applies only on sale, which this
  // module doesn't model. The factor row below surfaces the terminal-tax-
  // if-sold bite for transparency.
  const realStocks = inputs.stocksReturn - inputs.inflation;
  const nominalRate = inputs.mortgage ? inputs.mortgage.rate : 0;
  const realMortgage = nominalRate - inputs.inflation;
  const effectiveRate = (inputs.effectiveRateOverride && inputs.effectiveRateOverride > 0)
    ? inputs.effectiveRateOverride : nominalRate;
  const realEffectiveMortgage = effectiveRate - inputs.inflation;
  const spread = realStocks - realEffectiveMortgage;
  const terminalLtcgBite = (inputs.ltcgRate || 0) * (inputs.stockGainPct || 0);

  factors.push({
    key: 'real-spread',
    i18nKey: 'pvi.factor.realSpread.label',
    valueDisplay: (spread * 100).toFixed(2) + '% real',
    rawValue: spread,
    favoredStrategy: spread > 0.005 ? 'invest' : (spread < -0.005 ? 'prepay' : 'neutral'),
    magnitude: Math.abs(spread) > 0.02 ? 'dominant' : (Math.abs(spread) > 0.005 ? 'moderate' : 'minor'),
    hint: null,
  });

  factors.push({
    key: 'nominal-mortgage-rate',
    i18nKey: 'pvi.factor.nominalRate.label',
    valueDisplay: (nominalRate * 100).toFixed(2) + '%',
    rawValue: nominalRate,
    favoredStrategy: 'neutral',
    magnitude: 'minor',
    hint: null,
  });

  if (inputs.effectiveRateOverride && inputs.effectiveRateOverride > 0
      && Math.abs(inputs.effectiveRateOverride - nominalRate) > 1e-6) {
    factors.push({
      key: 'effective-mortgage-rate',
      i18nKey: 'pvi.factor.effectiveRateOverride.label',
      valueDisplay: (inputs.effectiveRateOverride * 100).toFixed(2) + '% (Δ ' + ((inputs.effectiveRateOverride - nominalRate) * 100).toFixed(2) + '%)',
      rawValue: inputs.effectiveRateOverride,
      favoredStrategy: inputs.effectiveRateOverride < nominalRate ? 'invest' : 'prepay',
      magnitude: Math.abs(inputs.effectiveRateOverride - nominalRate) > 0.005 ? 'moderate' : 'minor',
      hint: 'override active',
    });
  }

  factors.push({
    key: 'expected-stocks-return',
    i18nKey: 'pvi.factor.stocksReal.label',
    valueDisplay: (realStocks * 100).toFixed(2) + '% real (buy & hold)',
    rawValue: realStocks,
    favoredStrategy: 'neutral',
    magnitude: 'moderate',
    hint: null,
  });

  const horizon = inputs.endAge - inputs.currentAge;
  factors.push({
    key: 'time-horizon-years',
    i18nKey: 'pvi.factor.timeHorizon.label',
    valueDisplay: horizon + ' yrs',
    rawValue: horizon,
    favoredStrategy: spread > 0 ? 'invest' : (spread < 0 ? 'prepay' : 'neutral'),
    magnitude: horizon > 30 ? 'dominant' : (horizon > 15 ? 'moderate' : 'minor'),
    hint: null,
  });

  // Mortgage years remaining
  const yearsRemaining = inputs.mortgage
    ? Math.max(0, (inputs.mortgage.term || 30) - (inputs.mortgage.yearsPaid || 0))
    : 0;
  factors.push({
    key: 'mortgage-years-remaining',
    i18nKey: 'pvi.factor.mortgageRemaining.label',
    valueDisplay: yearsRemaining + ' yrs',
    rawValue: yearsRemaining,
    favoredStrategy: yearsRemaining < 10 ? 'invest' : 'neutral',
    magnitude: 'moderate',
    hint: null,
  });

  factors.push({
    key: 'terminal-ltcg-if-sold',
    i18nKey: 'pvi.factor.terminalLtcg.label',
    valueDisplay: (terminalLtcgBite * 100).toFixed(2) + '% (only if you sell)',
    rawValue: terminalLtcgBite,
    favoredStrategy: 'neutral', // doesn't apply during buy-and-hold accumulation
    magnitude: 'minor',
    hint: null,
  });

  const naturalPayoffBeforeFire = verdict && verdict.naturalPayoffYear !== null && verdict.naturalPayoffYear <= inputs.fireAge;
  factors.push({
    key: 'mortgage-payoff-before-fire',
    i18nKey: 'pvi.factor.naturalPayoff.label',
    valueDisplay: naturalPayoffBeforeFire ? 'yes' : 'no',
    rawValue: naturalPayoffBeforeFire ? 1 : 0,
    favoredStrategy: naturalPayoffBeforeFire ? 'invest' : 'neutral',
    magnitude: 'minor',
    hint: null,
  });

  // v1.3 (2026-04-28): "Earlier mortgage payoff" cash-flow head-start factor.
  //
  // The other factors all reflect rate-spread arithmetic — they answer
  // "which compounding rate is higher?" But the simulation also captures a
  // dynamic effect that pure rate-spread doesn't: when Prepay pays off the
  // mortgage EARLIER than Invest, Prepay redirects the freed P&I + extra into
  // the brokerage for those extra years. This contribution head-start
  // compounds for the rest of the simulation and is the dominant driver of
  // late-life Prepay wins in scenarios where the rate spread is small.
  //
  // We surface it explicitly so the user understands what's pushing the
  // plan-end verdict when the rate-spread factors all favor Invest.
  const prepayPayoffAge = _firstNaturalPayoffAge(prepayPath);
  const investPayoffAge = _firstNaturalPayoffAge(investPath);
  if (prepayPayoffAge !== null && investPayoffAge !== null) {
    const headStartYears = investPayoffAge - prepayPayoffAge;
    let mag = 'minor';
    if (headStartYears >= 4) mag = 'dominant';
    else if (headStartYears >= 2) mag = 'moderate';
    let favored = 'neutral';
    if (headStartYears > 0) favored = 'prepay';
    else if (headStartYears < 0) favored = 'invest';
    factors.push({
      key: 'cash-flow-head-start',
      i18nKey: 'pvi.factor.cashFlowHeadStart.label',
      valueDisplay: headStartYears === 0
        ? 'same payoff year'
        : (headStartYears > 0
            ? '+' + headStartYears + ' yrs (Prepay finishes at age ' + prepayPayoffAge + ' vs Invest ' + investPayoffAge + ')'
            : (headStartYears) + ' yrs'),
      rawValue: headStartYears,
      favoredStrategy: favored,
      magnitude: mag,
      hint: null,
    });
  }

  if (refi) {
    factors.push({
      key: 'planned-refi-active',
      i18nKey: 'pvi.factor.plannedRefi.label',
      valueDisplay: 'year ' + refi.refiYear + ' → ' + (refi.newRate * 100).toFixed(2) + '%, ' + refi.newTerm + 'y',
      rawValue: refi.newRate,
      favoredStrategy: refi.newRate < nominalRate ? 'invest' : 'prepay',
      magnitude: 'moderate',
      hint: null,
    });
  }

  return factors;
}

// ---------------------------------------------------------------------------
// v3 helpers
// ---------------------------------------------------------------------------

/**
 * Compute Section 121 capital-gains tax on home sale (US primary residence).
 * @param {number} homeValueAtFire        Real $; the home's real-dollar value at sale.
 * @param {number} originalPurchasePrice  Real $; the original purchase price.
 * @param {string} mfjStatus              'single' | 'mfj'
 * @param {number} ltcgRate               Long-term capital gains rate (e.g., 0.15)
 * @returns {{ section121Exclusion: number, nominalGain: number, taxableGain: number, capGainsTax: number }}
 */
function _section121Tax(homeValueAtFire, originalPurchasePrice, mfjStatus, ltcgRate) {
  var section121Exclusion = mfjStatus === 'mfj' ? 500000 : 250000;
  var nominalGain = (homeValueAtFire || 0) - (originalPurchasePrice || 0);
  var taxableGain = Math.max(0, nominalGain - section121Exclusion);
  var capGainsTax = Math.round(taxableGain * (ltcgRate || 0));
  return {
    section121Exclusion: section121Exclusion,
    nominalGain: nominalGain,
    taxableGain: taxableGain,
    capGainsTax: capGainsTax,
  };
}

/**
 * Normalize the mortgage strategy from v3 input shape, with v2 lumpSumPayoff fallback.
 * @param {Object} inputs  PrepayInvestComparisonInputs (v2 or v3)
 * @returns {'prepay-extra' | 'invest-keep-paying' | 'invest-lump-sum'}
 */
function _normalizeStrategy(inputs) {
  // Inv-12 (v3 contract): when mortgageStrategy is present and valid, it WINS
  // over lumpSumPayoff. The UI's input handler clears lumpSumPayoff when setting
  // mortgageStrategy, so a "both-present" state from a deliberate v018 user
  // action shouldn't occur. The lumpSumPayoff fallback below handles v017-era
  // saved states that lack mortgageStrategy entirely.
  if (inputs && typeof inputs.mortgageStrategy === 'string') {
    if (inputs.mortgageStrategy === 'prepay-extra' ||
        inputs.mortgageStrategy === 'invest-keep-paying' ||
        inputs.mortgageStrategy === 'invest-lump-sum') {
      return inputs.mortgageStrategy;
    }
    // Unknown value: fall through to lumpSumPayoff fallback
  }
  if (inputs && inputs.lumpSumPayoff === true) {
    return 'invest-lump-sum';
  }
  return 'invest-keep-paying';   // v1 / v2 default
}

// ---------------------------------------------------------------------------
// _formatSidebarMortgageIndicator (Feature 018 T037, US2)
//
// Pure helper — produces an i18n template descriptor for the sidebar mortgage
// status row. Maps the active mortgage strategy string to its label key, and
// pairs it with the active payoff age. Consumed by both HTML dashboards via
// the `t(key, args)` helper.
//
// Inputs:
//   strategy         — 'prepay-extra' | 'invest-keep-paying' | 'invest-lump-sum'
//   activePayoffAge  — number (age at which the mortgage is fully paid for the
//                      currently active strategy)
//
// Output:
//   { key: 'sidebar.mortgageStatus.template', args: [strategyLabelKey, activePayoffAge] }
//
// Default (unknown strategy) falls back to 'pvi.strategy.investKeep' — the
// safest label since it implies no behavioral change.
// ---------------------------------------------------------------------------
function _formatSidebarMortgageIndicator(strategy, activePayoffAge) {
  let strategyLabelKey;
  switch (strategy) {
    case 'prepay-extra':
      strategyLabelKey = 'pvi.strategy.prepay';
      break;
    case 'invest-lump-sum':
      strategyLabelKey = 'pvi.strategy.investLumpSum';
      break;
    case 'invest-keep-paying':
    default:
      strategyLabelKey = 'pvi.strategy.investKeep';
      break;
  }
  return {
    key: 'sidebar.mortgageStatus.template',
    args: [strategyLabelKey, activePayoffAge],
  };
}

// ---------------------------------------------------------------------------
// UMD-style export — Constitution Principle V file-protocol compatibility.
// NO `export` keyword anywhere in this file.
// ---------------------------------------------------------------------------

const _payoffVsInvestApi = {
  computePayoffVsInvest,
  _pmt,
  _stepMonth,
  _monthlyRealReturnAfterTax,
  _compoundInvested,
  _firstNaturalPayoffAge,
  _findStageBoundaries,
  _initMortgageState,
  _applyRefi,
  _detectCrossover,
  _computeVerdict,
  _evaluateFactors,
  _normalizeStrategy,
  _section121Tax,
  _formatSidebarMortgageIndicator,
};

if (typeof module !== 'undefined' && module && module.exports) {
  module.exports = _payoffVsInvestApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.computePayoffVsInvest = computePayoffVsInvest;
  globalThis.payoffVsInvestModule = _payoffVsInvestApi;
}
