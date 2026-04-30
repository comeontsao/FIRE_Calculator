/*
 * =============================================================================
 * MODULE: calc/accumulateToFire.js
 *
 * Feature: 019-accumulation-drift-fix
 * Spec: specs/019-accumulation-drift-fix/spec.md
 *
 * Inputs: inp (dashboard state record), fireAge (number), options (object)
 *   See spec §4.2–4.3 for the full field list. Key inp fields:
 *   - ageRoger / agePerson1          — current age (dual fallback for RR vs Generic)
 *   - roger401kTrad / person1_401kTrad
 *   - roger401kRoth / person1_401kRoth
 *   - rogerStocks + rebeccaStocks / person1Stocks + person2Stocks
 *   - cashSavings, otherAssets
 *   - returnRate, return401k, inflationRate
 *   - monthlySavings, contrib401kTrad, contrib401kRoth, empMatch
 *   - raiseRate (income trajectory, not returned but advanced per canonical loop)
 *   options fields:
 *   - mortgageEnabled, mortgageInputs (MortgageShape)
 *   - mortgageStrategyOverride ('invest-keep-paying' | 'prepay-extra' | 'invest-lump-sum')
 *   - secondHomeEnabled, secondHomeInputs (SecondHomeShape)
 *   - rentMonthly (number) — baseline rent used in mtgSavingsAdjust
 *   - collegeFn (inp, yearsFromNow) => number — annual college cost during accumulation
 *   - payoffVsInvestFn (inputs) => PvIOutputs | null — injected for strategy-aware P&I
 *   - mfjStatus ('mfj' | 'single') — passed to PvI invocation
 *   - pviExtraMonthly (number) — extra monthly payment passed to PvI
 *
 * Outputs: { end: { pTrad, pRoth, pStocks, pCash }, perYearRows: [...] }
 *   end — post-loop pool state entering the FIRE year (pre-retirement-phase simulation)
 *   perYearRows — one row per accumulation year (age = currentAge..fireAge-1):
 *     { age, pTrad, pRoth, pStocks, pCash, mtgPurchasedThisYear, h2PurchasedThisYear,
 *       lumpSumDrainThisYear, contributions, effectiveAnnualSavings, mtgSavingsAdjust,
 *       collegeDrain, h2Drain }
 *   Each row is a snapshot AT THE START of that age (pre-mutations, pre-growth).
 *
 * Consumers:
 *   1. FIRE-Dashboard.html → projectFullLifecycle (canonical accumulation branch,
 *      lines 9333–9475 + 9632–9638). Step 2 of feature 019 rewires this.
 *   2. FIRE-Dashboard.html → _simulateStrategyLifetime (lines 10595–10614). Step 3.
 *   3. FIRE-Dashboard.html → computeWithdrawalStrategy (lines 11031–11041). Step 3.
 *   (and the corresponding lines in FIRE-Dashboard-Generic.html — lockstep mirror)
 *
 * Policy:
 *   - PURE. No DOM, no window/document/localStorage, no global mutable state.
 *   - Node-importable via CommonJS module.exports (matches calc/payoffVsInvest.js pattern).
 *   - Byte-exact arithmetic with projectFullLifecycle accumulation branch.
 *   - Cash growth: 1.005/yr (hardcoded — locked decision per plan §6 item 2).
 *   - Stocks/401k: real return (nominal − inflation).
 *
 * Constitution Principles:
 *   II  — pure module, contract-documented.
 *   V   — CommonJS (no `export` keyword; UMD-style globalThis assign for browser compat).
 *   VI  — Consumers list above is canonical.
 * =============================================================================
 */

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
  const inflationRate = inp.inflationRate || 0;
  const realReturnStocks = inp.returnRate - inflationRate;
  const realReturn401k = inp.return401k - inflationRate;

  // --- Contribution constants (line 9320–9322) ---
  const tradContrib = (inp.contrib401kTrad || 0) + (inp.empMatch || 0);
  const rothContrib = inp.contrib401kRoth || 0;

  // --- Starting pools (lines 9333–9336, with Generic fallbacks) ---
  let pTrad = (inp.person1_401kTrad != null ? inp.person1_401kTrad : inp.roger401kTrad) || 0;
  let pRoth = (inp.person1_401kRoth != null ? inp.person1_401kRoth : inp.roger401kRoth) || 0;
  let pStocks = (inp.person1Stocks != null
    ? (inp.person1Stocks || 0) + (inp.person2Stocks || 0)
    : (inp.rogerStocks || 0) + (inp.rebeccaStocks || 0));
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
    const effectiveAnnualSavings = Math.max(
      0,
      (inp.monthlySavings || 0) * 12 - mtgSavingsAdjust - collegeDrain - h2Drain
    );

    // --- Snapshot row (pre-mutation, pre-growth) ---
    perYearRows.push({
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
    });

    // --- Accumulation arithmetic (lines 9632–9638) ---
    // Note: raiseRate advances income (not tracked as a pool, so not returned).
    pTrad = pTrad * (1 + realReturn401k) + tradContrib;
    pRoth = pRoth * (1 + realReturn401k) + rothContrib;
    pStocks = pStocks * (1 + realReturnStocks) + effectiveAnnualSavings;
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
