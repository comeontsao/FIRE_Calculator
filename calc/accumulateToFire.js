/*
 * =============================================================================
 * MODULE: calc/accumulateToFire.js  (v3 — feature 021)
 *
 * Feature: 021-tax-category-and-audit-cleanup (extends 020 v2 cash-flow rewrite,
 *          which extended 019 accumulation-drift fix).
 * Spec:    specs/021-tax-category-and-audit-cleanup/spec.md US3
 * Contract: specs/021-tax-category-and-audit-cleanup/contracts/accumulateToFire-v3.contract.md
 *
 * v3 changes vs v2:
 *   - Adds progressive-bracket federal tax computation when inp.taxRate is blank/0
 *     (auto path) using IRS 2024 brackets imported from calc/taxBrackets.js.
 *   - Adds FICA tax (Social Security + Medicare + additional Medicare) on the same
 *     auto path.
 *   - Adds per-row fields: ficaTax, federalTaxBreakdown, ficaBreakdown.
 *   - The flat-rate path (inp.taxRate > 0) is preserved byte-identical for
 *     backwards compatibility — see _computeYearTax() override branch.
 *
 * Inputs: inp (dashboard state record), fireAge (number), options (object)
 *   Key inp fields (v2 + v3):
 *   - ageRoger / agePerson1          — current age (dual fallback for RR vs Generic)
 *   - roger401kTrad / person1_401kTrad
 *   - roger401kRoth / person1_401kRoth
 *   - rogerStocks + rebeccaStocks / person1Stocks + person2Stocks
 *   - cashSavings, otherAssets
 *   - returnRate, return401k, inflationRate
 *   - monthlySavings, contrib401kTrad, contrib401kRoth, empMatch
 *   - raiseRate (income trajectory — used in grossIncome)
 *   - annualIncome — gross annual income
 *   - taxRate — when > 0, flat-rate override (v2 path); when 0/blank, auto path (v3)
 *   - adultCount — 1 (single) or 2 (mfj); v3 uses for filing status detection
 *   - annualSpend / monthlySpend — annual spending (inflation-adjusted)
 *   - pviCashflowOverrideEnabled / pviCashflowOverride
 *   options fields: see Predecessor v2 contract.
 *
 * Outputs: { end: { pTrad, pRoth, pStocks, pCash }, perYearRows: [...] }
 *   perYearRows v3 fields (additive over v2):
 *     v1 fields (unchanged):
 *       { age, pTrad, pRoth, pStocks, pCash, mtgPurchasedThisYear, h2PurchasedThisYear,
 *         lumpSumDrainThisYear, contributions, effectiveAnnualSavings, mtgSavingsAdjust,
 *         collegeDrain, h2Drain }
 *     v2 fields (preserved):
 *       { grossIncome, federalTax, annualSpending, pretax401kEmployee,
 *         empMatchToTrad, stockContribution, cashFlowToCash, cashFlowWarning }
 *     v3 fields (NEW — feature 021):
 *       { ficaTax, federalTaxBreakdown, ficaBreakdown }
 *
 * Consumers:
 *   1. FIRE-Dashboard.html → projectFullLifecycle (canonical accumulation branch).
 *   2. FIRE-Dashboard.html → _simulateStrategyLifetime. Consumes end only.
 *   3. FIRE-Dashboard.html → computeWithdrawalStrategy. Consumes end only.
 *   4. FIRE-Dashboard.html → signedLifecycleEndBalance. Consumes end only.
 *   5. FIRE-Dashboard.html → copyDebugInfo() audit dump — perYearRows v2 + v3 fields.
 *   6. FIRE-Dashboard.html → Plan-tab Expenses pill "Income tax" sub-row (US1, T036+).
 *      Reads (federalTax + ficaTax) / 12 → monthly $ for the row.
 *   (and the corresponding lines in FIRE-Dashboard-Generic.html — lockstep mirror)
 *
 * Policy:
 *   - PURE. No DOM, no window/document/localStorage, no global mutable state.
 *   - Node-importable via CommonJS module.exports.
 *   - Tax brackets + FICA constants imported from calc/taxBrackets.js (require for
 *     Node, globalThis.taxBrackets for browser — see UMD-classic-script pattern).
 *   - Cash growth: 1.005/yr.
 *   - Federal tax: progressive brackets (auto) OR flat rate × (gross − pretax401k).
 *   - FICA: 0 in flat-rate mode; full SS+Medicare+addtlMedicare in auto mode.
 *
 * Conservation invariant (v3, FR-015.2 extended):
 *   For non-clamped years (auto OR flat-rate):
 *   grossIncome − federalTax − ficaTax − annualSpending − pretax401kEmployee
 *     − stockContribution === cashFlowToCash (within ±$1)
 *   (v2 invariant remains valid — ficaTax = 0 in flat-rate mode means the LHS
 *    reduces to the v2 formula automatically.)
 *
 * Constitution Principles:
 *   II  — pure module, contract-documented.
 *   V   — CommonJS (UMD-style globalThis assign for browser compat).
 *   VI  — Consumers list above is canonical.
 *   VIII — Spending Funded First is a RETIREMENT-phase contract; not modified here.
 *
 * FRAME (feature 022 / FR-009):
 *   Dominant frame: real-$ (POST-US3 / Wave 3 fix — single-frame residual).
 *   All accumulation arithmetic — pool growth, contributions, income, spending,
 *   tax, and cash-flow residual — is performed in today's-$ frame. Display-time
 *   conversion to nominal/Book Value happens centrally in recalcAll() via
 *   calc/displayConverter.js (feature 022 US1).
 *   Frame-conversion sites:
 *     - Line ~301 (PvI passthrough): inflation rate forwarded to payoffVsInvest;
 *       not a $-conversion site itself.
 *     - Lines ~351–355: inflationRate / realReturnStocks / realReturn401k —
 *       real-return constants in real-$ frame.
 *     - Line ~370: raiseRate read — used at the income-real conversion site below.
 *     - Income (real-$ at conversion site below): grossIncomeReal computed via
 *       (1 + raiseRate − inflationRate)^t — real wage growth.
 *     - Spending (real-$): annualSpendingReal === baseAnnualSpend (constant in today's $).
 *     - Tax (real-$): _computeYearTax invoked with grossIncomeReal; 2024 brackets
 *       and SSA wage base treated as today's-$ values per FR-015.
 *     - Cash-flow residual (real-$, single-frame): residual = grossIncomeReal
 *       − federalTax − ficaTax − pretax401kEmployee − annualSpendingReal − stockContribution.
 *     - Pool growth (real-$): pTrad/pRoth/pStocks at realReturn; pCash at 0.5%/yr.
 * =============================================================================
 */

// ---------------------------------------------------------------------------
// Tax brackets + FICA constants — imported from calc/taxBrackets.js (feature 021).
// Pattern: Node require() in tests, globalThis.taxBrackets in browser via UMD wrapper.
// ---------------------------------------------------------------------------
const _taxBrackets = (typeof require !== 'undefined')
  ? require('./taxBrackets.js')
  : (typeof globalThis !== 'undefined' ? globalThis.taxBrackets : null);
const BRACKETS_MFJ_2024 = _taxBrackets && _taxBrackets.BRACKETS_MFJ_2024;
const BRACKETS_SINGLE_2024 = _taxBrackets && _taxBrackets.BRACKETS_SINGLE_2024;
const FICA_SS_RATE = _taxBrackets ? _taxBrackets.FICA_SS_RATE : 0.062;
const FICA_SS_WAGE_BASE_2024 = _taxBrackets ? _taxBrackets.FICA_SS_WAGE_BASE_2024 : 168600;
const FICA_MEDICARE_RATE = _taxBrackets ? _taxBrackets.FICA_MEDICARE_RATE : 0.0145;
const FICA_ADDITIONAL_MEDICARE_RATE = _taxBrackets ? _taxBrackets.FICA_ADDITIONAL_MEDICARE_RATE : 0.009;
const FICA_ADDITIONAL_MEDICARE_THRESHOLD_SINGLE = _taxBrackets
  ? _taxBrackets.FICA_ADDITIONAL_MEDICARE_THRESHOLD_SINGLE : 200000;
const FICA_ADDITIONAL_MEDICARE_THRESHOLD_MFJ = _taxBrackets
  ? _taxBrackets.FICA_ADDITIONAL_MEDICARE_THRESHOLD_MFJ : 250000;

/**
 * v3 tax computation helper (feature 021). Pure: no I/O.
 *
 * Two paths:
 *   - Override (flat-rate): inp.taxRate > 0 → v2 byte-identical output, ficaTax = 0,
 *     breakdowns empty. Backwards compatibility for personas with pinned taxRate.
 *   - Auto (progressive brackets + FICA): default path when taxRate is 0/blank.
 *     Uses IRS 2024 brackets and SSA 2024 FICA constants from calc/taxBrackets.js.
 *
 * Filing status detection: inp.adultCount === 1 → single; otherwise (2 or undefined)
 * → MFJ. RR dashboard never sets adultCount and is always couple → MFJ default.
 *
 * FICA model: income split equally between earners for MFJ; SS wage-base cap applies
 * per individual; Medicare on full grossIncome; additional Medicare above threshold.
 *
 * @param {number} grossIncome
 * @param {number} pretax401kEmployee
 * @param {object} inp  Dashboard state record.
 * @returns {{
 *   federalTax: number,
 *   ficaTax: number,
 *   federalTaxBreakdown: object,
 *   ficaBreakdown: object,
 *   computedFromBrackets: boolean,
 * }}
 */
function _computeYearTax(grossIncome, pretax401kEmployee, inp) {
  // Flat-rate override path: preserves v2 behavior.
  if (Number.isFinite(inp.taxRate) && inp.taxRate > 0) {
    return {
      federalTax: Math.max(0, (grossIncome - pretax401kEmployee) * inp.taxRate),
      ficaTax: 0,
      federalTaxBreakdown: {},
      ficaBreakdown: {},
      computedFromBrackets: false,
    };
  }

  // Auto path — progressive brackets + FICA.
  const filingStatus = (inp.adultCount === 1) ? 'single' : 'mfj';
  const brackets = (filingStatus === 'mfj') ? BRACKETS_MFJ_2024 : BRACKETS_SINGLE_2024;
  const stdDed = brackets.standardDeduction;
  const taxableIncome = Math.max(0, grossIncome - pretax401kEmployee - stdDed);

  // Walk brackets; accumulate per-bracket dollars.
  const breakdown = {
    bracket10: 0, bracket12: 0, bracket22: 0, bracket24: 0,
    bracket32: 0, bracket35: 0, bracket37: 0,
    standardDeduction: stdDed,
    taxableIncome,
  };
  let federalTax = 0;
  let prevBound = 0;
  for (const b of brackets.brackets) {
    if (taxableIncome <= prevBound) break;
    const inThisBracket = Math.min(taxableIncome, b.upperBound) - prevBound;
    if (inThisBracket > 0) {
      const taxFromThisBracket = inThisBracket * b.rate;
      const key = 'bracket' + Math.round(b.rate * 100);
      breakdown[key] = Math.round(taxFromThisBracket);
      federalTax += taxFromThisBracket;
    }
    prevBound = b.upperBound;
  }

  // FICA: split income equally between earners for MFJ; SS cap applies per individual.
  const earnerCount = (filingStatus === 'mfj') ? 2 : 1;
  const incomePerEarner = grossIncome / earnerCount;
  const ssTaxablePerEarner = Math.min(incomePerEarner, FICA_SS_WAGE_BASE_2024);
  const ssTax = ssTaxablePerEarner * FICA_SS_RATE * earnerCount;
  const ssWageBaseHit = (incomePerEarner > FICA_SS_WAGE_BASE_2024);

  const medicareTax = grossIncome * FICA_MEDICARE_RATE;

  const additionalMedicareThreshold = (filingStatus === 'mfj')
    ? FICA_ADDITIONAL_MEDICARE_THRESHOLD_MFJ
    : FICA_ADDITIONAL_MEDICARE_THRESHOLD_SINGLE;
  const additionalMedicare = Math.max(0, grossIncome - additionalMedicareThreshold)
                             * FICA_ADDITIONAL_MEDICARE_RATE;

  const ficaTax = ssTax + medicareTax + additionalMedicare;
  const ficaBreakdown = {
    socialSecurity: Math.round(ssTax),
    medicare: Math.round(medicareTax),
    additionalMedicare: Math.round(additionalMedicare),
    ssWageBaseHit,
  };

  return {
    federalTax: Math.round(federalTax),
    ficaTax: Math.round(ficaTax),
    federalTaxBreakdown: breakdown,
    ficaBreakdown,
    computedFromBrackets: true,
  };
}

/**
 * Pure monthly-payment calculator.
 * Mirror of FIRE-Dashboard.html calcMortgagePayment (line 4700).
 * @param {number} loanAmount
 * @param {number} annualRate  e.g. 0.065
 * @param {number} termYears
 * @returns {number} monthly payment
 */
function _calcMortgagePayment(loanAmount, annualRate, termYears) {
  const r = annualRate / 12;
  const n = termYears * 12;
  if (r === 0) return loanAmount / n;
  return loanAmount * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

/**
 * Annual carry cost for Home #2 during accumulation.
 * Mirror of FIRE-Dashboard.html getSecondHomeAnnualCarryAtYear (line 4587).
 * @param {object} h2   secondHomeInputs
 * @param {number} yearsFromNow
 * @param {number} fireYrsFromNow
 * @returns {number}
 */
function _h2AnnualCarryAtYear(h2, yearsFromNow, fireYrsFromNow) {
  if (yearsFromNow < h2.buyInYears) return 0;
  if (h2.destiny === 'sell' && yearsFromNow > fireYrsFromNow) return 0;
  const yearsIntoMortgage = yearsFromNow - h2.buyInYears;
  let annualPI = 0;
  if (yearsIntoMortgage < h2.term && h2.rate > 0 && h2.homePrice > h2.downPayment) {
    const loanAmt = h2.homePrice - h2.downPayment;
    annualPI = _calcMortgagePayment(loanAmt, h2.rate, h2.term) * 12;
  }
  return annualPI + (h2.propertyTax || 0) + (h2.otherCarry || 0) - (h2.rentalIncome || 0);
}

/**
 * Apply an upfront buy-in cost, draining cash first then stocks (both clamped ≥ 0).
 * Mirror of the canonical clamping pattern (spec §4.5 invariant 2).
 * Returns new { pCash, pStocks } — does NOT mutate inputs.
 * @param {number} pCash
 * @param {number} pStocks
 * @param {number} upfrontCost
 * @returns {{ pCash: number, pStocks: number }}
 */
function _applyBuyIn(pCash, pStocks, upfrontCost) {
  if (pCash >= upfrontCost) {
    return { pCash: pCash - upfrontCost, pStocks };
  }
  const remainder = upfrontCost - Math.max(0, pCash);
  return {
    pCash: 0,
    pStocks: Math.max(0, pStocks - remainder),
  };
}

/**
 * Pre-compute PvI amortization split + lump-sum event using the injected function.
 * Returns { pviAmort: Map<age, row> | null, pviLumpSumEvent: object | null }.
 * Mirrors HTML lines 9408–9446. Falls back gracefully on error (spec §4.5 inv 6).
 *
 * @param {object} inp
 * @param {number} currentAge
 * @param {number} fireAge
 * @param {object} mtg
 * @param {string} mortgageStrategy
 * @param {boolean} sellAtFire
 * @param {object} options
 * @returns {{ pviAmort: Map|null, pviLumpSumEvent: object|null, pviHomeSaleEvent: object|null, pviPostSaleAtFire: object|null }}
 */
function _fetchPviData(inp, currentAge, fireAge, mtg, mortgageStrategy, sellAtFire, options) {
  const pviNull = { pviAmort: null, pviLumpSumEvent: null, pviHomeSaleEvent: null, pviPostSaleAtFire: null };
  const payoffVsInvestFn = options.payoffVsInvestFn;
  if (!payoffVsInvestFn || typeof payoffVsInvestFn !== 'function') return pviNull;
  if (mortgageStrategy === 'invest-keep-paying' && !sellAtFire) return pviNull;

  try {
    const pviExtra = typeof options.pviExtraMonthly === 'number' ? options.pviExtraMonthly : 0;
    const mfjStatus = options.mfjStatus || 'mfj';
    const ltcgRate = inp.taxTrad ? Math.min(0.20, inp.taxTrad) : 0.15;
    const pviInputs = {
      currentAge,
      fireAge,
      endAge: inp.endAge || 99,
      mortgageEnabled: true,
      mortgage: mtg,
      sellAtFire,
      mfjStatus,
      stocksReturn: inp.returnRate,
      // FRAME: pure-data — inflationRate forwarded to payoffVsInvest config
      inflation: inp.inflationRate,
      ltcgRate,
      stockGainPct: typeof inp.stockGainPct === 'number' ? inp.stockGainPct : 0.6,
      extraMonthly: pviExtra,
      framing: options.framing || 'liquidNetWorth',
      mortgageStrategy,
      lumpSumPayoff: (mortgageStrategy === 'invest-lump-sum'),
    };
    const pviOut = payoffVsInvestFn(pviInputs);
    if (!pviOut || pviOut.disabledReason || !pviOut.amortizationSplit) return pviNull;

    const amortKey = (mortgageStrategy === 'prepay-extra') ? 'prepay' : 'invest';
    const rows = pviOut.amortizationSplit[amortKey] || [];
    const pviAmort = new Map();
    for (const r of rows) {
      if (r && typeof r.age === 'number') pviAmort.set(r.age, r);
    }
    return {
      pviAmort,
      pviLumpSumEvent: pviOut.lumpSumEvent || null,
      pviHomeSaleEvent: pviOut.homeSaleEvent || null,
      pviPostSaleAtFire: pviOut.postSaleBrokerageAtFire || null,
    };
  } catch (err) {
    console.error('[accumulateToFire] PvI threw:', err);
    return pviNull;
  }
}

/**
 * Pure pre-FIRE accumulation helper.
 *
 * Extracts the canonical accumulation loop from projectFullLifecycle so it can
 * be shared across all three call sites (projectFullLifecycle, _simulateStrategyLifetime,
 * computeWithdrawalStrategy) without each maintaining its own copy.
 *
 * @param {object} inp  Dashboard state record. See header for field list.
 * @param {number} fireAge  Target FIRE age (exclusive: last accumulation year is fireAge-1).
 * @param {object} [options]  Optional configuration. See header for field list.
 * @returns {{ end: { pTrad, pRoth, pStocks, pCash }, perYearRows: Array }}
 */
function accumulateToFire(inp, fireAge, options) {
  const opts = options || {};

  // --- Age resolution: RR dashboard uses ageRoger; Generic uses agePerson1 ---
  const currentAge = inp.agePerson1 != null ? inp.agePerson1 : inp.ageRoger;

  // --- Real returns (line 9318–9319 in HTML) ---
  // FRAME: real-$ — real-frame return constants; pool growth at these
  //        rates keeps balances in today's purchasing power.
  const inflationRate = inp.inflationRate || 0;
  // FRAME: real-$ — stocks real return (nominal − inflation)
  const realReturnStocks = inp.returnRate - inflationRate;
  // FRAME: real-$ — 401k real return (nominal − inflation)
  const realReturn401k = inp.return401k - inflationRate;

  // --- Contribution constants (line 9320–9322) ---
  // v2: split employee vs employer for cash-flow conservation accounting.
  const emp401kTrad = inp.contrib401kTrad || 0;   // employee Trad deferral
  const emp401kRoth = inp.contrib401kRoth || 0;   // employee Roth deferral
  const empMatchAmt = inp.empMatch || 0;           // employer match (non-cash, pTrad only)
  const tradContrib = emp401kTrad + empMatchAmt;   // total into pTrad (employee + match)
  const rothContrib = emp401kRoth;                 // total into pRoth

  // --- v2 Cash-flow inputs ---
  const annualIncomeBase = inp.annualIncome || 0;   // gross annual income at currentAge
  const taxRate = (typeof inp.taxRate === 'number') ? inp.taxRate : 0;
  // FRAME: pure-data — raiseRate is a decimal scaling factor (non-$); combined
  //        with inflationRate at the income conversion site below to compute
  //        real wage growth = (1 + raiseRate − inflationRate)^t.
  const raiseRate = (typeof inp.raiseRate === 'number') ? inp.raiseRate : 0;
  // Base annual spend: prefer inp.annualSpend (explicit), fall back to monthlySpend*12,
  // then fall back to 0 (backwards-compatible — v1 callers may not supply these fields).
  const baseAnnualSpend = (typeof inp.annualSpend === 'number') ? inp.annualSpend
    : (typeof inp.monthlySpend === 'number') ? inp.monthlySpend * 12
    : 0;

  // v2 override inputs
  const cashflowOverrideEnabled = !!(inp.pviCashflowOverrideEnabled);
  const cashflowOverrideValue = (typeof inp.pviCashflowOverride === 'number') ? inp.pviCashflowOverride : 0;

  // --- Starting pools (lines 9333–9336, with Generic fallbacks) ---
  // Feature 009: in Generic dashboard, person2Stocks is preserved in memory
  // when a user toggles adultCount 2→1 (no DOM mutation per data-model.md
  // §"Visibility model"). Read-time consumers MUST gate person2 on
  // adultCount === 2 — matches projectFullLifecycle's canonical pattern
  // (FIRE-Dashboard-Generic.html line 9902). RR dashboard is always couple
  // (no adultCount), so its branch sums both unconditionally.
  let pTrad = (inp.person1_401kTrad != null ? inp.person1_401kTrad : inp.roger401kTrad) || 0;
  let pRoth = (inp.person1_401kRoth != null ? inp.person1_401kRoth : inp.roger401kRoth) || 0;
  let pStocks;
  if (inp.person1Stocks != null) {
    // Generic dashboard — gate person2 on adultCount.
    const _adultCount = (typeof inp.adultCount === 'number') ? inp.adultCount : 2;
    pStocks = (inp.person1Stocks || 0) + (_adultCount === 2 ? (inp.person2Stocks || 0) : 0);
  } else {
    // RR dashboard — always couple.
    pStocks = (inp.rogerStocks || 0) + (inp.rebeccaStocks || 0);
  }
  let pCash = (inp.cashSavings || 0) + (inp.otherAssets || 0);

  // --- Mortgage setup (mirrors lines 9340–9363) ---
  const mortgageEnabled = !!(opts.mortgageEnabled && opts.mortgageInputs);
  const mtg = mortgageEnabled ? opts.mortgageInputs : null;
  let mtgPurchased = false;
  let mtgPurchaseYear = 0;

  if (mortgageEnabled && mtg) {
    if (mtg.ownership === 'buying-now') {
      // Pre-loop upfront deduction (line 9345–9356)
      mtgPurchased = true;
      mtgPurchaseYear = 0;
      const upfrontCost = (mtg.downPayment || 0) + (mtg.closingCosts || 0);
      const bought = _applyBuyIn(pCash, pStocks, upfrontCost);
      pCash = bought.pCash;
      pStocks = bought.pStocks;
    } else if (mtg.ownership === 'already-own') {
      // Already purchased — no deduction (line 9357–9361)
      mtgPurchased = true;
      mtgPurchaseYear = -(mtg.yearsPaid || 0);
    }
    // buying-in: mtgPurchased stays false; triggered in loop
  }

  // --- Home #2 setup (mirrors lines 9366–9380) ---
  const secondHomeEnabled = !!(opts.secondHomeEnabled && opts.secondHomeInputs);
  const h2 = secondHomeEnabled ? opts.secondHomeInputs : null;
  let h2Purchased = false;

  if (secondHomeEnabled && h2 && (h2.buyInYears === 0 || h2.buyInYears == null)) {
    // Pre-loop upfront deduction at year 0
    const upfrontH2 = (h2.downPayment || 0) + (h2.closingCosts || 0);
    const bought = _applyBuyIn(pCash, pStocks, upfrontH2);
    pCash = bought.pCash;
    pStocks = bought.pStocks;
    h2Purchased = true;
  }

  // --- Mortgage strategy resolution ---
  const mortgageStrategy = (opts.mortgageStrategyOverride && typeof opts.mortgageStrategyOverride === 'string')
    ? opts.mortgageStrategyOverride
    : 'invest-keep-paying';

  const sellAtFire = !!(mortgageEnabled && mtg && mtg.sellAtFire === true);
  const yrsToFire = fireAge - currentAge;

  // --- PvI prefetch (mirrors lines 9387–9446) ---
  const { pviAmort, pviLumpSumEvent, pviHomeSaleEvent } = _fetchPviData(
    inp, currentAge, fireAge, mtg, mortgageStrategy, sellAtFire, opts
  );
  let pviLumpSumDrained = false; // single-shot guard

  // --- Rent baseline for mtgSavingsAdjust ---
  const rent = typeof opts.rentMonthly === 'number' ? opts.rentMonthly : 0;

  // --- Per-year accumulation loop ---
  const perYearRows = [];

  for (let age = currentAge; age < fireAge; age++) {
    const yearsFromNow = age - currentAge;

    // --- Delayed mortgage buy-in (lines 9452–9463) ---
    let mtgPurchasedThisYear = false;
    if (mortgageEnabled && mtg && mtg.ownership === 'buying-in' && !mtgPurchased
        && yearsFromNow >= (mtg.buyInYears || 0)) {
      const upfrontCost = (mtg.downPayment || 0) + (mtg.closingCosts || 0);
      const bought = _applyBuyIn(pCash, pStocks, upfrontCost);
      pCash = bought.pCash;
      pStocks = bought.pStocks;
      mtgPurchased = true;
      mtgPurchaseYear = mtg.buyInYears || 0;
      mtgPurchasedThisYear = true;
    }

    // --- Delayed Home #2 buy-in (lines 9465–9475) ---
    let h2PurchasedThisYear = false;
    if (secondHomeEnabled && h2 && !h2Purchased && yearsFromNow >= (h2.buyInYears || 0)) {
      const upfrontH2 = (h2.downPayment || 0) + (h2.closingCosts || 0);
      const bought = _applyBuyIn(pCash, pStocks, upfrontH2);
      pCash = bought.pCash;
      pStocks = bought.pStocks;
      h2Purchased = true;
      h2PurchasedThisYear = true;
    }

    // --- Lump-sum drain (lines 9552–9557) ---
    // Only fires during accumulation if lumpSumEvent.age < fireAge.
    let lumpSumDrainThisYear = 0;
    if (mortgageStrategy === 'invest-lump-sum' && pviLumpSumEvent && !pviLumpSumDrained
        && typeof pviLumpSumEvent.age === 'number' && age >= pviLumpSumEvent.age) {
      const drain = (pviLumpSumEvent.brokerageBefore || 0) - (pviLumpSumEvent.brokerageAfter || 0);
      if (drain > 0) {
        pStocks = Math.max(0, pStocks - drain);
        lumpSumDrainThisYear = drain;
      }
      pviLumpSumDrained = true;
    }

    // --- mtgSavingsAdjust (mirrors lines 9559–9598) ---
    let mtgSavingsAdjust = 0;
    // Once home is sold at FIRE, mortgage cash-flow ceases. But this helper is
    // accumulation-only (age < fireAge), so the _mortgageRetiredBySale gate from
    // the canonical loop (which checks age >= homeSaleEvent.age) can only apply
    // at FIRE-year itself — which is outside our range. No suppression needed here.
    if (mortgageEnabled && mtgPurchased && mtg) {
      const yearsIntoPurchase = yearsFromNow - mtgPurchaseYear;
      // Strategy-aware P&I lookup (lines 9577–9597)
      const pviRow = pviAmort ? pviAmort.get(age) : null;
      const useStrategy = !!pviRow;
      const strategyMonthlyPI = useStrategy
        ? ((pviRow.principalPaidThisYear || 0) + (pviRow.interestPaidThisYear || 0)) / 12
        : null;
      const stillPayingStrategy = useStrategy
        ? (strategyMonthlyPI > 0)
        : (yearsIntoPurchase < (mtg.term || 30));

      if (stillPayingStrategy) {
        const loanAmount = (mtg.homePrice || 0) - (mtg.downPayment || 0);
        const monthlyPI = useStrategy
          ? strategyMonthlyPI
          : _calcMortgagePayment(loanAmount, mtg.rate, mtg.term);
        const totalMonthly = monthlyPI + (mtg.propertyTax || 0) / 12
          + (mtg.insurance || 0) / 12 + (mtg.hoa || 0);
        mtgSavingsAdjust = (totalMonthly - rent) * 12;
      } else {
        // Paid off — just tax + ins + HOA
        const ongoingMonthly = (mtg.propertyTax || 0) / 12
          + (mtg.insurance || 0) / 12 + (mtg.hoa || 0);
        mtgSavingsAdjust = (ongoingMonthly - rent) * 12;
      }
    }

    // --- College drain (lines 9600–9602) ---
    const collegeDrain = opts.collegeFn ? (opts.collegeFn(inp, yearsFromNow) || 0) : 0;

    // --- Home #2 carry (line 9511–9513) ---
    const h2Drain = (secondHomeEnabled && h2 && h2Purchased)
      ? _h2AnnualCarryAtYear(h2, yearsFromNow, yrsToFire)
      : 0;

    // --- Effective annual savings (line 9605) ---
    // v2: stockContribution is the taxable-brokerage deposit (formerly effectiveAnnualSavings).
    // Adjusted for mortgage/college/h2 carry drains (same as v1).
    const stockContribution = Math.max(
      0,
      (inp.monthlySavings || 0) * 12 - mtgSavingsAdjust - collegeDrain - h2Drain
    );
    // Keep v1 alias for backwards-compatible row field.
    const effectiveAnnualSavings = stockContribution;

    // --- v4 Cash-flow accounting (feature 022 US3 — single-frame real-$) ---
    // Step 1: Gross income in real-$ frame. (1 + raiseRate − inflationRate)^t
    //        is the real wage growth multiplier. raiseRate == inflationRate →
    //        constant; > → real growth; < → real wage cut. Per FR-012 / FR-013.
    // FRAME: real-$ — income converted from nominal to real before residual.
    const grossIncome = annualIncomeBase * Math.pow(1 + raiseRate - inflationRate, yearsFromNow);

    // Step 2: Pre-tax 401(k) employee contributions.
    // FRAME: real-$ — 401k contribution caps are constant in today's $ (the
    //        slider sets contribution amount in today's purchasing power).
    const pretax401kEmployee = emp401kTrad + emp401kRoth;

    // Step 3: Tax computation in real-$ frame.
    // FRAME: real-$ — _computeYearTax invoked with REAL income. 2024 IRS brackets
    //        and SSA wage base ($168,600) treated as today's-$ values per
    //        FR-015. Mirrors real-world bracket inflation indexing, which
    //        roughly tracks wage inflation. ficaTax = 0 in flat-rate mode.
    const taxResult = _computeYearTax(grossIncome, pretax401kEmployee, inp);
    const federalTax = taxResult.federalTax;
    const ficaTax = taxResult.ficaTax;
    const federalTaxBreakdown = taxResult.federalTaxBreakdown;
    const ficaBreakdown = taxResult.ficaBreakdown;

    // Step 4: Annual spending in real-$ frame.
    // FRAME: real-$ — spend stays constant in today's-$ (slider input is in
    //        today's purchasing power). Per-spec FR-014.
    const annualSpending = baseAnnualSpend;

    // Step 5: Stock contribution (already computed above as effectiveAnnualSavings).
    // FRAME: real-$ — savings amount is constant in today's $.

    // Step 6: Cash flow residual — single-frame (real-$).
    // FRAME: real-$ — every term on the RHS is in today's-$; residual feeds
    //        pCash which already grows at real-return frame. No cross-frame
    //        contamination. Per-spec FR-016 + research R4.
    let cashFlowToCash;
    let cashFlowWarning;

    if (cashflowOverrideEnabled) {
      // Override active: bypass computed residual.
      cashFlowToCash = cashflowOverrideValue;
    } else if (annualIncomeBase > 0 || taxRate > 0) {
      // v4 single-frame residual: gross - federalTax - ficaTax - 401k - spend - stock.
      // ficaTax = 0 in flat-rate mode → reduces to flat-rate formula automatically.
      const residual = grossIncome - federalTax - ficaTax - pretax401kEmployee
                       - annualSpending - stockContribution;
      if (residual < 0) {
        cashFlowToCash = 0;
        cashFlowWarning = 'NEGATIVE_RESIDUAL';
      } else {
        cashFlowToCash = residual;
      }
    } else {
      // No income info provided (v1 backwards-compat): cash pool receives $0 residual.
      cashFlowToCash = 0;
    }

    // --- Snapshot row (pre-mutation, pre-growth) ---
    perYearRows.push({
      // v1 fields (unchanged)
      age,
      pTrad: Math.max(0, pTrad),
      pRoth: Math.max(0, pRoth),
      pStocks: Math.max(0, pStocks),
      pCash: Math.max(0, pCash),
      mtgPurchasedThisYear,
      h2PurchasedThisYear,
      lumpSumDrainThisYear,
      contributions: effectiveAnnualSavings + tradContrib + rothContrib,
      effectiveAnnualSavings,
      mtgSavingsAdjust,
      collegeDrain,
      h2Drain,
      // v2 fields (NEW — feature 020 cash-flow accounting)
      grossIncome,
      federalTax,
      annualSpending,
      pretax401kEmployee,
      empMatchToTrad: empMatchAmt,
      stockContribution,
      cashFlowToCash,
      cashFlowWarning,  // 'NEGATIVE_RESIDUAL' | undefined
      // v3 fields (NEW — feature 021 progressive-bracket + FICA)
      ficaTax,
      federalTaxBreakdown,
      ficaBreakdown,
    });

    // --- Accumulation arithmetic (steps 8–9 per v2 contract) ---
    // Step 8: Pool updates (order: pTrad/pRoth/pStocks absorb contributions, pCash absorbs cashFlow).
    // FRAME: real-$ — pTrad grows at realReturn401k; contributions in real-$
    pTrad = pTrad * (1 + realReturn401k) + tradContrib;
    // FRAME: real-$ — pRoth grows at realReturn401k; contributions in real-$
    pRoth = pRoth * (1 + realReturn401k) + rothContrib;
    // FRAME: real-$ — pStocks grows at realReturnStocks; contributions in real-$
    pStocks = pStocks * (1 + realReturnStocks) + effectiveAnnualSavings;
    pCash = pCash + cashFlowToCash;

    // Step 9: Pool growth (real return for 401k; nominal 0.5% for cash).
    // Note: pTrad/pRoth/pStocks growth is already applied in step 8 (multiply before add).
    // pCash grows at 0.5%/yr nominal (FR-016 — hardcoded, locked).
    pCash *= 1.005;
  }

  // --- End state — post-loop pools entering the FIRE year ---
  return {
    end: {
      pTrad: Math.max(0, pTrad),
      pRoth: Math.max(0, pRoth),
      pStocks: Math.max(0, pStocks),
      pCash: Math.max(0, pCash),
    },
    perYearRows,
  };
}

// ---------------------------------------------------------------------------
// Exports (CommonJS — matches calc/payoffVsInvest.js pattern)
// Also exposes on globalThis for the browser inline-script use case.
// ---------------------------------------------------------------------------
const _accumulateToFireApi = { accumulateToFire };

if (typeof module !== 'undefined' && module && module.exports) {
  module.exports = _accumulateToFireApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.accumulateToFire = accumulateToFire;
  globalThis.accumulateToFireModule = _accumulateToFireApi;
}
