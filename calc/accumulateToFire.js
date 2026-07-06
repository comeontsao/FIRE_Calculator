/*
 * =============================================================================
 * MODULE: calc/accumulateToFire.js  (v8 — feature 036)
 *
 * Feature: 036-retirement-status (C-1: optional options.retirement descriptor).
 *          Extends 033 (v7 assumptions registry + shortfall funding ladder),
 *          032 (v6 Roth IRA pool), 023-accumulation-spend-separation (v5),
 *          021 progressive-bracket, 022 frame-fix, 020 v2 cash-flow rewrite,
 *          019 accumulation-drift fix.
 * Spec:    specs/036-retirement-status/data-model.md
 * Contract: specs/036-retirement-status/contracts/retirement-status.contract.md §C-1
 *
 * v8 changes vs v7 (feature 036):
 *   - NEW optional `options.retirement = { households: [{income, retirementAge}] }`.
 *     Backwards-compatible: absent/undefined ⇒ byte-identical to v7 (INV-1;
 *     multiplying by a contribution scale of exactly 1 is a no-op in IEEE754).
 *     When present:
 *       (1) Per-year employment income is masked: workingIncome(age) = Σ
 *           households[i].income where households[i].retirementAge > age.
 *           This REPLACES inp.annualIncome as the grossIncome trajectory base
 *           for that year (raise-rate/Fisher trajectory still applies).
 *       (2) Per-year contribution scale = workingIncome(age) / totalIncome
 *           (totalIncome = Σ households[i].income, pre-raise). Applied to
 *           contrib401kTrad, contrib401kRoth, empMatch, and the discretionary
 *           stockContribution. Fully-retired year ⇒ scale 0 ⇒ zero new
 *           contributions.
 *       (3) SS/pension are NOT modeled here (INV-3) — untouched, handled
 *           downstream in the retirement-phase drawdown loop via ssClaimAge.
 *     Caller contract (not enforced here): when options.retirement is
 *     present, `fireAge` MUST equal the household transition age
 *     (max of households[i].retirementAge) — see contract C-1.1.
 *
 * v7 changes vs v6 (feature 033):
 *   - US1: cash growth derives from calc/assumptions.js CASH_REAL_RETURN
 *     (single source; was a hardcoded half-percent/yr factor — now 0.0/yr per
 *     clarification Q1).
 *   - US2: shortfall funding ladder. When the accumulation-year residual is
 *     negative AND the cash-flow override is OFF, funding proceeds in EXACTLY:
 *       (1) cut the discretionary brokerage contribution down to $0;
 *       (2) draw from the cash pool down to $0;
 *       (3) draw from the brokerage pool at face value (D4 — no LTCG gross-up);
 *       (4) any remainder is `unfunded` → cashFlowWarning 'NEGATIVE_RESIDUAL'.
 *     A year fully funded by rungs 1–3 carries cashFlowWarning
 *     'CONTRIBUTION_REDUCED' (informational). Pre-tax 401(k) employee
 *     contributions and employer match are NEVER reduced. This removes the
 *     old silent-floor bug (`if (residual < 0) cashFlowToCash = 0`) that
 *     dropped the shortfall without recording how it was funded.
 *   - `stockContribution` KEEPS its v2 PLANNED meaning (sibling-field lesson,
 *     feature 018). New sibling row fields: stockContributionActual,
 *     fundedFromCash, fundedFromStocks (always present, numeric). The ACTUAL
 *     (post-ladder) contribution is what flows into pStocks each year.
 *
 * v5 changes vs v3 (v4 was the feature-022 internal frame fix):
 *   - Reads new options.accumulationSpend (real-$, optional) for the spending
 *     baseline that drives the cash-flow residual. 4-tier soft-fall preserves
 *     v3 backwards-compat:
 *       options.accumulationSpend → inp.annualSpend → inp.monthlySpend×12 → 0
 *   - Adds per-row `spendSource` diagnostic identifying which tier produced
 *     the row's `annualSpending` value.
 *   - Adds new `cashFlowWarning: 'MISSING_SPEND'` value for the final-tier
 *     fallback (latent-bug detection — surfaces in audit dump).
 *   - Closes the latent feature-023 bug where every caller relied on
 *     `inp.annualSpend` which was never assigned on the canonical inp object,
 *     causing pre-FIRE simulation to spend $0/year and inflate the cash bucket
 *     by ~$95k/year on RR-baseline.
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
 *   Key inp fields (v2 + v3 + v6):
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
 *   - rothIraReal (feature 032 / US2) — Roth IRA starting balance (real-$);
 *     dashboard fallback: (rogerRothIra + rebeccaRothIra) for RR or
 *     (person1RothIra + person2RothIra) for Generic; default 0.
 *   - rothIraContribReal (feature 032 / US2) — annual Roth IRA contribution
 *     (real-$/yr); dashboard fallback similar; default 0 until US4b ships
 *     the contribution-input UI.
 *   options fields: see Predecessor v2 contract.
 *   - options.retirement (feature 036, OPTIONAL) — {households: Array<{income,
 *     retirementAge}>}. See v8 changes note above + contract C-1. Absent ⇒
 *     no behavior change.
 *
 * Outputs: { end: { pTrad, pRoth, pStocks, pCash, pRothIra }, perYearRows: [...] }
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
 *     v6 fields (NEW — feature 032 US2):
 *       { pRothIra }
 *     v7 fields (NEW — feature 033 US2 shortfall funding ladder):
 *       { stockContributionActual, fundedFromCash, fundedFromStocks }
 *       stockContribution remains PLANNED; stockContributionActual is the
 *       post-ladder amount that flows into pStocks. fundedFromCash /
 *       fundedFromStocks are the ladder draw amounts (≥ 0). In surplus /
 *       override / no-income years: actual === planned, draws 0 (I5).
 *       cashFlowWarning gains 'CONTRIBUTION_REDUCED' (informational: ladder
 *       funded the year) alongside 'NEGATIVE_RESIDUAL' (now: unfunded
 *       remainder > 0 after all three rungs — genuine infeasibility).
 *
 * Consumers:
 *   1. FIRE-Dashboard.html → projectFullLifecycle (canonical accumulation branch) —
 *      reads perYearRows.pRothIra into per-year row.pRothIra, plus end.pRothIra
 *      seeds the retirement-phase portfolioRothIra (feature 032 US2).
 *   2. FIRE-Dashboard.html → _simulateStrategyLifetime. Consumes end only.
 *   3. FIRE-Dashboard.html → computeWithdrawalStrategy. Consumes end only.
 *   4. FIRE-Dashboard.html → signedLifecycleEndBalance. Consumes end only.
 *   5. FIRE-Dashboard.html → copyDebugInfo() audit dump — perYearRows v2 + v3 fields.
 *   6. FIRE-Dashboard.html → Plan-tab Expenses pill "Income tax" sub-row (US1, T036+).
 *      Reads (federalTax + ficaTax) / 12 → monthly $ for the row.
 *   7. FIRE-Dashboard.html → Lifecycle chart (feature 032 US2) — per-year
 *      pRothIra series rendered as a new stacked-area dataset with color
 *      --chart-rothIra (#a890ff).
 *   8. FIRE-Dashboard.html → FIRE feasibility gate effBal() (FR-021e) — sums
 *      pRothIra alongside pRoth/pTrad/pStocks/pCash. Missing this term silently
 *      de-syncs the verdict from the chart.
 *   9. calc/calcAudit.js composition snapshot — lockedRothIra audit field.
 *   (and the corresponding lines in FIRE-Dashboard-Generic.html — lockstep mirror)
 *
 * Policy:
 *   - PURE. No DOM, no window/document/localStorage, no global mutable state.
 *   - Node-importable via CommonJS module.exports.
 *   - Tax brackets + FICA constants imported from calc/taxBrackets.js (require for
 *     Node, globalThis.taxBrackets for browser — see UMD-classic-script pattern).
 *   - CASH_REAL_RETURN imported from calc/assumptions.js (same require/globalThis
 *     pattern; assumptions.js is the FIRST calc <script> tag — feature 033).
 *   - Cash growth: (1 + CASH_REAL_RETURN)/yr — single source: calc/assumptions.js (feature 033).
 *   - Federal tax: progressive brackets (auto) OR flat rate × (gross − pretax401k).
 *   - FICA: 0 in flat-rate mode; full SS+Medicare+addtlMedicare in auto mode.
 *
 * Conservation invariant (v7, feature 033 — supersedes the v3 form):
 *   For EVERY accumulation year (override OFF), the per-year identity (I6):
 *     grossIncome − federalTax − ficaTax − annualSpending − pretax401kEmployee
 *       − stockContributionActual − cashFlowToCash
 *       + fundedFromCash + fundedFromStocks === unfunded
 *   where `unfunded` is 0 for every non-NEGATIVE_RESIDUAL year and equals the
 *   still-unfunded remainder (> 0) on a genuinely infeasible year. In surplus
 *   years fundedFromCash = fundedFromStocks = 0 and stockContributionActual =
 *   stockContribution, so the LHS reduces to the pre-033 v3 form
 *   (=== cashFlowToCash) automatically. ficaTax = 0 in flat-rate mode.
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
 *       (1 + realRate(raiseRate, inflationRate))^t — real wage growth (Fisher).
 *     - Spending (real-$): annualSpendingReal === baseAnnualSpend (constant in today's $).
 *     - Tax (real-$): _computeYearTax invoked with grossIncomeReal; 2024 brackets
 *       and SSA wage base treated as today's-$ values per FR-015.
 *     - Cash-flow residual (real-$, single-frame): residual = grossIncomeReal
 *       − federalTax − ficaTax − pretax401kEmployee − annualSpendingReal − stockContribution.
 *     - Pool growth (real-$): pTrad/pRoth/pStocks at realReturn; pCash at
 *       CASH_REAL_RETURN/yr (today's-$, from calc/assumptions.js — feature 033).
 * =============================================================================
 */

// ---------------------------------------------------------------------------
// Tax brackets + FICA constants — imported from calc/taxBrackets.js (feature 021).
// Pattern: Node require() in tests, globalThis.taxBrackets in browser via UMD wrapper.
//
// HOTFIX (feature 022 post-021): Browser classic-script load shares a SINGLE
// global script scope across all <script src=> tags. calc/taxBrackets.js
// declares its constants as top-level `const BRACKETS_MFJ_2024 = ...` etc.
// If we ALSO declare top-level `const BRACKETS_MFJ_2024 = _taxBrackets.X`
// here, the browser throws SyntaxError "Identifier already declared" before
// any function runs — which cascades into "[_simulateStrategyLifetime]
// accumulateToFire is required" because this module never loads. Underscored
// local names sidestep the collision; behavior unchanged in Node tests
// (each module gets its own scope).
// ---------------------------------------------------------------------------
const _taxBrackets = (typeof require !== 'undefined')
  ? require('./taxBrackets.js')
  : (typeof globalThis !== 'undefined' ? globalThis.taxBrackets : null);
const _BRACKETS_MFJ_2024 = _taxBrackets && _taxBrackets.BRACKETS_MFJ_2024;
const _BRACKETS_SINGLE_2024 = _taxBrackets && _taxBrackets.BRACKETS_SINGLE_2024;
const _FICA_SS_RATE = _taxBrackets ? _taxBrackets.FICA_SS_RATE : 0.062;
const _FICA_SS_WAGE_BASE_2024 = _taxBrackets ? _taxBrackets.FICA_SS_WAGE_BASE_2024 : 168600;
const _FICA_MEDICARE_RATE = _taxBrackets ? _taxBrackets.FICA_MEDICARE_RATE : 0.0145;
const _FICA_ADDITIONAL_MEDICARE_RATE = _taxBrackets ? _taxBrackets.FICA_ADDITIONAL_MEDICARE_RATE : 0.009;
const _FICA_ADDITIONAL_MEDICARE_THRESHOLD_SINGLE = _taxBrackets
  ? _taxBrackets.FICA_ADDITIONAL_MEDICARE_THRESHOLD_SINGLE : 200000;
const _FICA_ADDITIONAL_MEDICARE_THRESHOLD_MFJ = _taxBrackets
  ? _taxBrackets.FICA_ADDITIONAL_MEDICARE_THRESHOLD_MFJ : 250000;

// Feature 033 — assumptions registry. Pattern matches `_taxBrackets`:
// Node `require` in tests; globalThis in browser (calc/assumptions.js is
// the FIRST calc script tag, so eval-time capture is safe — NOT the
// failed eval-time-capture _applyCashSweep pattern, which loaded later).
const _assumptions = (typeof require !== 'undefined')
  ? require('./assumptions.js')
  : (typeof globalThis !== 'undefined' ? globalThis : null);
const _CASH_REAL_RETURN = _assumptions && typeof _assumptions.CASH_REAL_RETURN === 'number'
  ? _assumptions.CASH_REAL_RETURN
  : (() => { throw new Error('[accumulateToFire] calc/assumptions.js not loaded — it must be the first calc <script> tag'); })();
// Feature 033 (US3) — Fisher real-rate helper from the same registry. Hard
// throw if missing (mirrors _CASH_REAL_RETURN above): a silent fallback would
// reintroduce the subtraction-form drift this feature removes.
const _realRate = _assumptions && typeof _assumptions.realRate === 'function'
  ? _assumptions.realRate
  : (() => { throw new Error('[accumulateToFire] calc/assumptions.js realRate not loaded — it must be the first calc <script> tag'); })();

// Feature 033 (US2) — half-cent rounding epsilon for the shortfall funding
// ladder. An unfunded remainder at or below this is treated as fully funded
// (floating-point dust). Written in exponent form (5e-3) rather than the
// decimal form so the cash-growth static guard in
// tests/unit/mathAssumptions.test.js stays clean of false positives.
const _UNFUNDED_EPSILON = 5e-3;

// Feature 030 — Cash-sweep helper. Pattern matches `_taxBrackets` above:
// Node `require` in tests; globalThis attachment in browser via UMD wrapper.
// Local underscored name avoids global-scope collision in browser classic-script load.
const _cashSweepMod = (typeof require !== 'undefined')
  ? (() => { try { return require('./cashSweep.js'); } catch (_e) { return null; } })()
  : null;
// Lazy resolver (browser-boot fix, 2026-06-05). The previous
// `const _applyCashSweep = … || globalThis._applyCashSweep` was doubly broken
// in the browser:
//   1. The top-level `const` collided with cashSweep.js's
//      `function _applyCashSweep` declaration (shared global lexical scope) →
//      SyntaxError killed cashSweep.js entirely.
//   2. Even without the collision, this module loads BEFORE cashSweep.js
//      (script-tag order), so globalThis._applyCashSweep was still undefined
//      at evaluation time — the const captured null forever.
// Resolving at CALL time fixes both. Node tests are unaffected (the require
// branch resolves immediately).
function _resolveApplyCashSweep() {
  if (_cashSweepMod && typeof _cashSweepMod._applyCashSweep === 'function') {
    return _cashSweepMod._applyCashSweep;
  }
  return (typeof globalThis !== 'undefined' && typeof globalThis._applyCashSweep === 'function')
    ? globalThis._applyCashSweep
    : null;
}

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
  const brackets = (filingStatus === 'mfj') ? _BRACKETS_MFJ_2024 : _BRACKETS_SINGLE_2024;
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
  const ssTaxablePerEarner = Math.min(incomePerEarner, _FICA_SS_WAGE_BASE_2024);
  const ssTax = ssTaxablePerEarner * _FICA_SS_RATE * earnerCount;
  const ssWageBaseHit = (incomePerEarner > _FICA_SS_WAGE_BASE_2024);

  const medicareTax = grossIncome * _FICA_MEDICARE_RATE;

  const additionalMedicareThreshold = (filingStatus === 'mfj')
    ? _FICA_ADDITIONAL_MEDICARE_THRESHOLD_MFJ
    : _FICA_ADDITIONAL_MEDICARE_THRESHOLD_SINGLE;
  const additionalMedicare = Math.max(0, grossIncome - additionalMedicareThreshold)
                             * _FICA_ADDITIONAL_MEDICARE_RATE;

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
  // FRAME: real-$ — stocks real return (Fisher: realRate)
  const realReturnStocks = _realRate(inp.returnRate, inflationRate);
  // FRAME: real-$ — 401k real return (Fisher: realRate)
  const realReturn401k = _realRate(inp.return401k, inflationRate);

  // --- Contribution constants (line 9320–9322) ---
  // v2: split employee vs employer for cash-flow conservation accounting.
  const emp401kTrad = inp.contrib401kTrad || 0;   // employee Trad deferral
  const emp401kRoth = inp.contrib401kRoth || 0;   // employee Roth deferral
  const empMatchAmt = inp.empMatch || 0;           // employer match (non-cash, pTrad only)
  // Feature 036 — renamed *Base: these are the FULL (unscaled) per-year totals.
  // The retirement descriptor (below) scales these down per-year when present;
  // absent ⇒ scale is always 1 ⇒ byte-identical to pre-036 tradContrib/rothContrib.
  const tradContribBase = emp401kTrad + empMatchAmt;   // total into pTrad (employee + match)
  const rothContribBase = emp401kRoth;                 // total into pRoth

  // --- Feature 036 (C-1) — optional retirement-status descriptor. ---
  // options.retirement = { households: Array<{income, retirementAge}> }.
  // Absent/undefined ⇒ _retirement stays null ⇒ every per-year scale below
  // resolves to exactly 1 (INV-1 off-revert-parity; multiplying by 1 is an
  // IEEE754 no-op, so the default path is provably unaffected).
  const _retirement = (opts.retirement && Array.isArray(opts.retirement.households))
    ? opts.retirement
    : null;
  // totalIncome (contract C-1.3): sum of ALL households' income, regardless
  // of retirement age — the denominator for the per-year contribution scale.
  const _retirementTotalIncome = _retirement
    ? _retirement.households.reduce((sum, h) => sum + (Number(h && h.income) || 0), 0)
    : 0;

  // --- v2 Cash-flow inputs ---
  const annualIncomeBase = inp.annualIncome || 0;   // gross annual income at currentAge
  const taxRate = (typeof inp.taxRate === 'number') ? inp.taxRate : 0;
  // FRAME: pure-data — raiseRate is a decimal scaling factor (non-$); combined
  //        with inflationRate at the income conversion site below to compute
  //        real wage growth = (1 + realRate(raiseRate, inflationRate))^t (Fisher).
  const raiseRate = (typeof inp.raiseRate === 'number') ? inp.raiseRate : 0;
  // Feature 023 (FR-006 / US1) — 4-tier fallback chain for accumulation-phase
  // spending baseline. Preferred path is options.accumulationSpend (real-$,
  // resolved by getAccumulationSpend(inp) inline-helper in both HTMLs). The
  // legacy chain inp.annualSpend → inp.monthlySpend×12 → 0 is preserved for
  // v3 backwards-compat with test fixtures and pre-023 audit-harness personas.
  // FRAME: real-$ — today's-$ value, constant across accumulation years.
  let baseAnnualSpend;
  let _spendSource;  // diagnostic: which fallback tier produced the value
  if (typeof opts.accumulationSpend === 'number' && opts.accumulationSpend >= 0) {
    baseAnnualSpend = opts.accumulationSpend;
    _spendSource = 'options.accumulationSpend';  // preferred (feature 023)
  } else if (typeof inp.annualSpend === 'number') {
    baseAnnualSpend = inp.annualSpend;
    _spendSource = 'inp.annualSpend';  // v3 backwards-compat
  } else if (typeof inp.monthlySpend === 'number') {
    baseAnnualSpend = inp.monthlySpend * 12;
    _spendSource = 'inp.monthlySpend×12';  // v1 backwards-compat
  } else {
    baseAnnualSpend = 0;
    _spendSource = 'MISSING';  // final fallback — surface in cashFlowWarning
  }

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
  // Feature 032 (US2) — Roth IRA pool. Prefer canonical `rothIraReal` if present
  // (set by calc/getCanonicalInputs.js); else fall back to summing the raw DOM
  // fields (rogerRothIra+rebeccaRothIra for RR, person1RothIra+person2RothIra
  // for Generic). Generic has no UI inputs so this naturally evaluates to 0.
  // FRAME: real-$ — seed in today's-$ frame, grows at realReturn401k below.
  let pRothIra;
  if (typeof inp.rothIraReal === 'number') {
    pRothIra = inp.rothIraReal;
  } else {
    pRothIra = ((inp.rogerRothIra || inp.person1RothIra || 0)
              + (inp.rebeccaRothIra || inp.person2RothIra || 0));
  }
  // Feature 032 (US2) — Roth IRA annual contribution. Same fallback pattern.
  // Will be 0 until US4b ships the contribution-input UI; that's expected.
  // FRAME: real-$/yr — constant in today's-$ across accumulation.
  const rothIraContrib = (typeof inp.rothIraContribReal === 'number')
    ? inp.rothIraContribReal
    : ((inp.rogerRothIraContrib || inp.person1RothIraContrib || 0)
     + (inp.rebeccaRothIraContrib || inp.person2RothIraContrib || 0));
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

    // --- Feature 036 (C-1) — per-year working-income mask + contribution scale. ---
    // Absent descriptor ⇒ _workingIncomeRaw stays null and _contribScale is
    // exactly 1 (IEEE754 no-op multiply below) ⇒ byte-identical to pre-036.
    let _workingIncomeRaw = null;
    let _contribScale = 1;
    if (_retirement) {
      _workingIncomeRaw = _retirement.households.reduce((sum, h) => {
        const stillWorking = h && typeof h.retirementAge === 'number' && h.retirementAge > age;
        return sum + (stillWorking ? (Number(h.income) || 0) : 0);
      }, 0);
      _contribScale = _retirementTotalIncome > 0 ? (_workingIncomeRaw / _retirementTotalIncome) : 0;
    }

    // --- Effective annual savings (line 9605) ---
    // v2: stockContribution is the taxable-brokerage deposit (formerly effectiveAnnualSavings).
    // Adjusted for mortgage/college/h2 carry drains (same as v1).
    // Feature 036 (C-1.3): scaled by the per-year contribution scale (1 when
    // the retirement descriptor is absent — no behavior change).
    const stockContribution = Math.max(
      0,
      (inp.monthlySavings || 0) * 12 - mtgSavingsAdjust - collegeDrain - h2Drain
    ) * _contribScale;
    // Keep v1 alias for backwards-compatible row field.
    const effectiveAnnualSavings = stockContribution;

    // Feature 036 (C-1.2/1.3) — per-year scaled 401(k) contributions. Scale is
    // 1 when the retirement descriptor is absent (byte-identical to pre-036
    // tradContribBase/rothContribBase).
    const tradContrib = tradContribBase * _contribScale;
    const rothContrib = rothContribBase * _contribScale;

    // --- v4 Cash-flow accounting (feature 022 US3 — single-frame real-$) ---
    // Step 1: Gross income in real-$ frame. (1 + realRate(raiseRate, inflation))^t
    //        is the real wage growth multiplier. raiseRate == inflationRate →
    //        constant; > → real growth; < → real wage cut. Per FR-012 / FR-013.
    // FRAME: real-$ — income converted from nominal to real before residual.
    // Feature 033 (US3) — real wage growth via Fisher realRate (was subtraction).
    // Feature 036 (C-1.2) — when the retirement descriptor is present, the
    // masked per-year working-income sum REPLACES annualIncomeBase as the
    // trajectory base; the raise-rate/Fisher trajectory still applies on top.
    const _incomeBaseForYear = _retirement ? _workingIncomeRaw : annualIncomeBase;
    const grossIncome = _incomeBaseForYear * Math.pow(1 + _realRate(raiseRate, inflationRate), yearsFromNow);

    // Step 2: Pre-tax 401(k) employee contributions.
    // FRAME: real-$ — 401k contribution caps are constant in today's $ (the
    //        slider sets contribution amount in today's purchasing power).
    // Feature 036 (C-1.3): scaled (1 when descriptor absent).
    const pretax401kEmployee = (emp401kTrad + emp401kRoth) * _contribScale;

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

    // Feature 033 (US2) — shortfall funding ladder (v7 sibling fields).
    // `stockContribution` KEEPS its v2 PLANNED meaning (sibling-field lesson,
    // feature 018). The ACTUAL contribution that flows into pStocks this year
    // is `stockContributionActual`; ladder draws are recorded in
    // `fundedFromCash` / `fundedFromStocks`. Surplus years: actual === planned,
    // draws 0. See specs/033-math-assumptions-cleanup/research.md §D3.
    let stockContributionActual = stockContribution; // default (surplus / override / no-income)
    let fundedFromCash = 0;
    let fundedFromStocks = 0;

    if (cashflowOverrideEnabled) {
      // Override active: bypass computed residual AND the ladder entirely
      // (spec edge case — the override replaces the residual, no draws).
      cashFlowToCash = cashflowOverrideValue;
    } else if (annualIncomeBase > 0 || taxRate > 0) {
      // v4 single-frame residual: gross - federalTax - ficaTax - 401k - spend - stock.
      // ficaTax = 0 in flat-rate mode → reduces to flat-rate formula automatically.
      const residual = grossIncome - federalTax - ficaTax - pretax401kEmployee
                       - annualSpending - stockContribution;
      if (residual < 0) {
        // Shortfall: run the NON-NEGOTIABLE funding ladder (contract §"Shortfall
        // funding ladder"). Order: (1) cut discretionary brokerage contribution
        // to $0; (2) draw cash to $0; (3) draw brokerage at face value (D4 — no
        // LTCG gross-up); (4) any remainder is `unfunded`. Pool draws apply HERE
        // (before this year's growth step), so the row snapshot below reflects
        // the drained pools and invariant I3 holds. Pre-tax 401(k) employee
        // contributions and employer match are NEVER reduced.
        let need = -residual;
        // Rung 1 — reduce discretionary contribution (down to $0).
        stockContributionActual = Math.max(0, stockContribution - need);
        need -= (stockContribution - stockContributionActual);
        // Rung 2 — draw from the cash pool (down to $0).
        fundedFromCash = Math.min(Math.max(0, pCash), need);
        need -= fundedFromCash;
        pCash -= fundedFromCash;
        // Rung 3 — draw from the brokerage pool (face value).
        fundedFromStocks = Math.min(Math.max(0, pStocks), need);
        need -= fundedFromStocks;
        pStocks -= fundedFromStocks;
        // Rung 4 — remainder is genuinely unfunded.
        const unfunded = need;
        cashFlowToCash = 0;
        // unfunded above a half-cent rounding epsilon (5e-3 == _UNFUNDED_EPSILON)
        // → genuine infeasibility (NEGATIVE_RESIDUAL); otherwise the ladder fully
        // funded the year (CONTRIBUTION_REDUCED, informational). Epsilon written
        // as 5e-3 to keep the cash-growth static guard (mathAssumptions) clean.
        cashFlowWarning = (unfunded > _UNFUNDED_EPSILON) ? 'NEGATIVE_RESIDUAL' : 'CONTRIBUTION_REDUCED';
      } else {
        cashFlowToCash = residual;
      }
    } else {
      // No income info provided (v1 backwards-compat): cash pool receives $0 residual.
      cashFlowToCash = 0;
    }

    // Feature 023 (FR-006) — surface MISSING_SPEND when the spend baseline fell
    // through to the final tier. NEGATIVE_RESIDUAL takes precedence (more
    // specific signal). MISSING_SPEND on every accumulation row is a red flag
    // for harness misconfig or a third-party caller that forgot the options bag.
    if (!cashFlowWarning && _spendSource === 'MISSING') {
      cashFlowWarning = 'MISSING_SPEND';
    }

    // --- Snapshot row (pre-mutation, pre-growth) ---
    perYearRows.push({
      // v1 fields (unchanged)
      age,
      pTrad: Math.max(0, pTrad),
      pRoth: Math.max(0, pRoth),
      // Feature 032 (US2) — Roth IRA pool snapshot (real-$).
      // FRAME: real-$ — chart consumer converts to nominal-$ via
      // _extendRowsWithBookValues at the FIRE-Dashboard.html chart-render site.
      pRothIra: Math.max(0, pRothIra),
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
      stockContribution,  // PLANNED discretionary brokerage contribution (v2 semantics)
      cashFlowToCash,
      cashFlowWarning,  // 'NEGATIVE_RESIDUAL' | 'MISSING_SPEND' (023) | 'CONTRIBUTION_REDUCED' (033) | undefined
      // v7 fields (NEW — feature 033 US2 shortfall funding ladder).
      // FRAME: real-$ — all in today's-$ (siblings of stockContribution).
      stockContributionActual,  // actual contribution after ladder reduction (=== planned in surplus years)
      fundedFromCash,           // shortfall amount drawn from cash this year (≥ 0)
      fundedFromStocks,         // shortfall amount drawn from brokerage this year (≥ 0, face value — D4)
      // v3 fields (NEW — feature 021 progressive-bracket + FICA)
      ficaTax,
      federalTaxBreakdown,
      ficaBreakdown,
      // v5 fields (NEW — feature 023 accumulation-spend separation)
      // FRAME: pure-data — diagnostic string, no $ value. Identifies which
      //        fallback tier produced the annualSpending value.
      spendSource: _spendSource,
    });

    // --- Accumulation arithmetic (steps 8–9 per v2 contract) ---
    // Step 8: Pool updates (order: pTrad/pRoth/pStocks absorb contributions, pCash absorbs cashFlow).
    // FRAME: real-$ — pTrad grows at realReturn401k; contributions in real-$
    pTrad = pTrad * (1 + realReturn401k) + tradContrib;
    // FRAME: real-$ — pRoth grows at realReturn401k; contributions in real-$
    pRoth = pRoth * (1 + realReturn401k) + rothContrib;
    // Feature 032 (US2) — pRothIra growth equation (contract Invariant I4).
    // FRAME: real-$ — pRothIra grows at the SAME real-return rate as the
    // Roth 401K pool (per data-model.md §5: "uses the SAME real return
    // assumption as the 401K pools"). Contribution in real-$.
    pRothIra = pRothIra * (1 + realReturn401k) + rothIraContrib;
    // FRAME: real-$ — pStocks grows at realReturnStocks; contributions in real-$.
    // Feature 033 (US2): the ACTUAL (post-ladder) contribution flows into pStocks,
    // not the planned amount. In surplus/override/no-income years
    // stockContributionActual === stockContribution (=== effectiveAnnualSavings),
    // so this is byte-identical to pre-033 behavior there. Any rung-3 brokerage
    // draw was already subtracted from pStocks above (before this growth step).
    pStocks = pStocks * (1 + realReturnStocks) + stockContributionActual;
    pCash = pCash + cashFlowToCash;

    // Step 9: Pool growth — cash at CASH_REAL_RETURN (today's-$ frame).
    // Note: pTrad/pRoth/pStocks growth is already applied in step 8 (multiply before add).
    // pCash grows at CASH_REAL_RETURN/yr — a purchasing-power (today's-$) rate,
    // NOT nominal. The old "0.5%/yr nominal" label mislabeled the frame: the
    // multiplier always applied to a today's-$ pool. FR-016's "hardcoded,
    // locked" lock is SUPERSEDED — single source is calc/assumptions.js
    // (see specs/033-math-assumptions-cleanup/contracts/assumptions.contract.md).
    pCash *= (1 + _CASH_REAL_RETURN);
    // Feature 030 — Cash-sweep integration (see calc/cashSweep.js + contracts/cash-sweep.contract.md)
    {
      // Resolve lazily (see _resolveApplyCashSweep above). The block-scoped
      // const keeps the canonical `_applyCashSweep(` call-site pattern from
      // contracts/cash-sweep.contract.md intact.
      const _applyCashSweep = _resolveApplyCashSweep();
      const _f030_sweep_ = (typeof _applyCashSweep === 'function')
        ? _applyCashSweep(pCash, pStocks, inp.cashSweepThreshold,
            age, currentAge, !!inp.cashSweepEnabled)
        : { pCash, pStocks, swept: 0 };
      pCash = _f030_sweep_.pCash;
      pStocks = _f030_sweep_.pStocks;
      if (options && Array.isArray(options.cashSweepTraces)) {
        options.cashSweepTraces.push({
          age, simulatorId: 'accumulateToFire',
          pCash, pStocks, swept: _f030_sweep_.swept,
        });
      }
    }
  }

  // --- End state — post-loop pools entering the FIRE year ---
  return {
    end: {
      pTrad: Math.max(0, pTrad),
      pRoth: Math.max(0, pRoth),
      // Feature 032 (US2) — Roth IRA pool end-state. Consumed by
      // FIRE-Dashboard.html projectFullLifecycle (line ~10588) to seed
      // portfolioRothIra entering the retirement-phase loop.
      pRothIra: Math.max(0, pRothIra),
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
