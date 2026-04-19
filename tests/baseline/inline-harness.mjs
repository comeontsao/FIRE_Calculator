/**
 * tests/baseline/inline-harness.mjs — Node-runnable port of the RR + Generic
 * inline FIRE engine (the half of it needed to produce the US2b baseline KPIs).
 *
 * PURPOSE
 * =======
 * The US2b phase needs baseline numbers (fireAge, yearsToFire, balance-at-
 * unlock, balance-at-SS, endBalance) from the PRE-refactor inline engine for
 * two canonical input sets (RR + Generic). Capturing these by hand in a
 * browser is (a) slow, (b) non-reproducible, and (c) hard to lock into CI.
 *
 * Instead, this harness ports the small set of inline-engine functions that
 * actually drive those KPIs — the solver + its simulator — into a pure,
 * Node-runnable ES module that the project's zero-dep `node --test` runner
 * can execute deterministically.
 *
 * SCOPE
 * =====
 * Ported faithfully (byte-for-byte equivalent math) from FIRE-Dashboard.html
 * and FIRE-Dashboard-Generic.html:
 *   - calcRealisticSSA(inp, fireAge)          — SS PIA from earnings history
 *   - getSSAnnual(inp, claimAge, fireAge)     — SS annual benefit adjusted
 *   - calcMortgagePayment(...)                — monthly P&I
 *   - calcRemainingBalance(...)               — remaining loan balance
 *   - getSecondHomeAnnualCarryAtYear(...)     — Home #2 carry (uses rental)
 *   - getSecondHomeSaleAtFire(...)            — Home #2 sale proceeds at FIRE
 *   - calcMortgageImpactAtYear(...)           — home equity / net proceeds
 *   - getMortgageAdjustedRetirement(...)      — retirement spend / sale
 *   - getHealthcareFamilySizeFactor(...)      — family-size healthcare scaling
 *   - getHealthcareMonthly(...)               — per-country monthly healthcare
 *   - getHealthcareDeltaAnnual(...)           — delta vs $400/mo baseline
 *   - getKidYearExpense(...) + amortizedAnnualPayment(...)  — college + loans
 *   - getTotalCollegeCostForYear(...)         — all-kids annual college spend
 *   - taxAwareWithdraw(...)                   — proportional tax-aware draw
 *   - signedLifecycleEndBalance(inp, annualSpend, fireAge)  — signed simulator
 *   - isFireAgeFeasible(sim, inp, annualSpend, mode)        — mode-aware gate
 *   - findFireAgeNumerical(inp, annualSpend, mode)          — earliest-age solver
 *
 * EXPOSED
 * =======
 * runInlineLifecycle(inputs) → {
 *   fireAge, yearsToFire, feasible,
 *   balanceAtUnlockReal, balanceAtSSReal, endBalanceReal,
 *   sim        // raw { endBalance, balanceAtUnlock, balanceAtSS }
 * }
 *
 * INPUTS SHAPE
 * ============
 * The harness accepts the inline engine's NATIVE legacy shape (what
 * FIRE-Dashboard.html's getInputs() / FIRE-Dashboard-Generic.html's
 * getInputs() produce), plus a small "environment" block for globals the
 * inline engine reads from DOM / browser state (selectedScenario, fireMode,
 * mortgageEnabled, secondHomeEnabled, today's year, current calendar age,
 * ssEarningsHistory). This is flat by design — an adapter layer translates
 * to the canonical Inputs shape later in US2b.
 *
 * NOT PORTED (and why)
 * ====================
 * - projectFullLifecycle() — renders the lifecycle CHART and is a ~500-line
 *   year-by-year simulator. Its outputs (per-year records) are NOT needed
 *   for the baseline KPIs: those all come from the solver's `sim` object
 *   (endBalance, balanceAtUnlock, balanceAtSS) via findFireAgeNumerical.
 *   Including projectFullLifecycle would double the surface area without
 *   changing any baseline number. If a future US2b task needs per-year
 *   lifecycle records as an oracle, it's a separate port.
 * - simulateRetirementOnlySigned / findMinAccessibleAtFireNumerical — only
 *   used for the "accessible at FIRE" KPI card, not the baseline set.
 * - calcThreePhaseFireNumber — closed-form FIRE number for display cards,
 *   superseded by the numerical solver for the values we care about.
 * - tax-optimized withdrawal (taxOptimizedWithdrawal / getTaxBrackets) —
 *   used only by simulateRetirementOnlySigned and by chart rendering.
 * - All UI / chart rendering code.
 *
 * AUDIT BUGS PRESERVED (by design)
 * ================================
 * The harness is a FAITHFUL port, not a corrected engine:
 *   - Healthcare delta uses per-year $/mo × 12 directly (inline's path).
 *     Any real/nominal mixing that happens on the real HTML side via user-
 *     entered override fields isn't reachable here because we don't expose
 *     those override fields in the canonical input set — but if future
 *     inputs populate them, the harness replicates the inline behavior
 *     (no inflation.toReal conversion).
 *   - Signed pools: when all retirement pools go negative, the harness
 *     silently absorbs the shortfall into pStocks (matches inline's
 *     FIRE-Dashboard.html:3829 + :3845). Canonical engine's typed
 *     {feasible:false, deficitReal} path is NOT implemented here.
 *   - Generic's ignore-secondary-person bug: we DO include pStocks2 in the
 *     starting portfolio (because the canonical input set here names the
 *     secondary pool explicitly — it's the Generic SOLVER that ignored it
 *     by reading only person1_401k+person1Stocks+cashSavings+otherAssets
 *     and the baseline fixture's §B has person2Stocks=0 anyway, so this
 *     is inert for the baseline case). See baseline-rr-inline.md §C.4.
 *
 * LINE REFERENCES
 * ===============
 * Cited inline when a decision is non-obvious; format `(HTML:line)`.
 */

// ============================================================================
// CONSTANTS — copied verbatim from FIRE-Dashboard.html (no per-file drift).
// ============================================================================

// SSA cap for 2026 (approximate — adjusts annually).  (RR HTML:1930, Generic:2012)
const SS_EARNINGS_CAP = 168_600;

// SS 2026 bend points — used by calcRealisticSSA's PIA calc.  (RR:3301, Generic:3077)
const SS_BEND1 = 1174;
const SS_BEND2 = 7078;

// Healthcare baseline — $/mo already implicit in scenario.annualSpend.
// delta = (country rate − baseline) × 12.  (RR:2446, Generic:2517)
const HC_BASELINE_MONTHLY = 400;

// Kids drop off family health plan at 22.  (RR:2467, Generic:2538)
const HC_KID_OFF_PLAN_AGE = 22;

// The "401K unlock age" — pre-unlock retirement draws only from taxable.  (RR:3712)
const UNLOCK_AGE = 59.5;

// Cash pool grows at 0.5%/yr regardless of inflation (inline's approximation).
// (RR:3814, Generic:3569)
const CASH_ANNUAL_GROWTH = 1.005;

// Default rent fallback when neither inputs.rentMonthly nor HTML exp_0 present.
const DEFAULT_RENT_MONTHLY = 2690;

// Per-country healthcare $/mo.  (RR:2447, Generic:2519)
const HEALTHCARE_BY_COUNTRY = Object.freeze({
  us:          { pre65: 1800, post65: 700 },
  taiwan:      { pre65: 250,  post65: 100 },
  japan:       { pre65: 300,  post65: 200 },
  thailand:    { pre65: 700,  post65: 600 },
  malaysia:    { pre65: 350,  post65: 250 },
  singapore:   { pre65: 1650, post65: 1100 },
  vietnam:     { pre65: 1040, post65: 700 },
  philippines: { pre65: 400,  post65: 300 },
  mexico:      { pre65: 600,  post65: 400 },
  costarica:   { pre65: 500,  post65: 350 },
  portugal:    { pre65: 300,  post65: 200 },
});

// Per-country selling cost pct (used only by calcMortgageImpactAtYear and
// getSecondHomeSaleAtFire — both irrelevant when mortgageEnabled=false).
// Copied as-is for completeness.  (RR:2530ff)
const HOME_SELLING_COST_PCT = Object.freeze({
  us: 0.07, taiwan: 0.04, japan: 0.06, thailand: 0.06, malaysia: 0.05,
  singapore: 0.04, vietnam: 0.06, philippines: 0.07, mexico: 0.08,
  costarica: 0.06, portugal: 0.06,
});

// Per-country college costs.  (RR:2557, Generic:2627)
const COLLEGE_BY_COUNTRY = Object.freeze({
  'none':         { cost: 0,     years: 0 },
  'us-private':   { cost: 85000, years: 4 },
  'us-public':    { cost: 28000, years: 4 },
  'us-public-oos':{ cost: 48000, years: 4 },
  'taiwan':       { cost: 12000, years: 4 },
  'uk':           { cost: 52000, years: 3 },
  'canada':       { cost: 40000, years: 4 },
  'australia':    { cost: 48000, years: 3 },
  'singapore':    { cost: 35000, years: 4 },
  'japan':        { cost: 20000, years: 4 },
  'netherlands':  { cost: 26000, years: 3 },
  'germany':      { cost: 14000, years: 3 },
});

// Scenarios — only the fields the harness touches (annualSpend, relocation,
// visaCostAnnual). Every field below matches RR HTML:2383-2439.
const SCENARIOS_BY_ID = Object.freeze({
  us:          { annualSpend: 120000, relocationCost: 0,     visaCostAnnual: 0 },
  taiwan:      { annualSpend: 60000,  relocationCost: 15000, visaCostAnnual: 100 },
  japan:       { annualSpend: 72000,  relocationCost: 20000, visaCostAnnual: 700 },
  thailand:    { annualSpend: 45600,  relocationCost: 10000, visaCostAnnual: 5200 },
  malaysia:    { annualSpend: 42000,  relocationCost: 12000, visaCostAnnual: 1700 },
  singapore:   { annualSpend: 102000, relocationCost: 20000, visaCostAnnual: 2000 },
  vietnam:     { annualSpend: 36000,  relocationCost: 8000,  visaCostAnnual: 200 },
  philippines: { annualSpend: 38400,  relocationCost: 10000, visaCostAnnual: 500 },
  mexico:      { annualSpend: 48000,  relocationCost: 8000,  visaCostAnnual: 600 },
  costarica:   { annualSpend: 54000,  relocationCost: 10000, visaCostAnnual: 200 },
  portugal:    { annualSpend: 62400,  relocationCost: 15000, visaCostAnnual: 200 },
});

// Generic dashboard's scenario table — `us` differs (78000 vs RR's 120000).
// (Generic HTML:2443)
const SCENARIOS_GENERIC_BY_ID = Object.freeze({
  ...SCENARIOS_BY_ID,
  us:          { annualSpend: 78000,  relocationCost: 0,     visaCostAnnual: 0 },
  taiwan:      { annualSpend: 36000,  relocationCost: 0,     visaCostAnnual: 0 },
});

// ============================================================================
// HELPER FUNCTIONS — ports of the individual inline helpers.
// ============================================================================

/**
 * Family-size factor for pre-65 healthcare. Kids drop off family plan at 22.
 * Returns 0.67 (couple-only), 0.835 (couple + 1 kid), or 1.00 (couple + 2 kids).
 * Post-65 rates are already couple-rate, so returns 1.0.
 * (RR HTML:2468-2480, Generic:2540-2551)
 */
function getHealthcareFamilySizeFactor(env, age) {
  if (age >= 65) return 1.0;
  const yrsFromNow = age - env.currentAgePrimaryInput;
  const kidAges = env.kidAgesInput || [];
  let kidsOnPlan = 0;
  for (const k of kidAges) {
    if (!isNaN(k) && (k + yrsFromNow) < HC_KID_OFF_PLAN_AGE) kidsOnPlan++;
  }
  return 0.67 + 0.165 * kidsOnPlan;
}

/**
 * Per-country monthly healthcare cost at a given age, with optional user
 * override and family-size scaling. (RR:2484-2498, Generic:2556-2568)
 */
function getHealthcareMonthly(env, age) {
  const hc = HEALTHCARE_BY_COUNTRY[env.selectedScenario] || HEALTHCARE_BY_COUNTRY.us;
  const isPost65 = age >= 65;
  // Override: inputs.hcOverridePre65 / hcOverridePost65 — same semantics as
  // document.getElementById('hcOverridePre65'/'hcOverridePost65').value.
  let base;
  const overrideVal = isPost65 ? env.hcOverridePost65 : env.hcOverridePre65;
  if (overrideVal != null) {
    const v = parseFloat(overrideVal);
    if (!isNaN(v) && v > 0) base = v;
  }
  if (base === undefined) base = isPost65 ? hc.post65 : hc.pre65;
  if (!isPost65) base *= getHealthcareFamilySizeFactor(env, age);
  return base;
}

/**
 * Annual healthcare delta vs $400/mo baseline. Added to scenario.annualSpend
 * during retirement draw. (RR:2502-2504, Generic:2572-2574)
 */
function getHealthcareDeltaAnnual(env, age) {
  return (getHealthcareMonthly(env, age) - HC_BASELINE_MONTHLY) * 12;
}

/**
 * Standard monthly P&I payment. (RR:2250-2255, Generic matches)
 */
function calcMortgagePayment(loanAmount, annualRate, termYears) {
  const r = annualRate / 12;
  const n = termYears * 12;
  if (r === 0) return loanAmount / n;
  return loanAmount * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

/**
 * Remaining mortgage balance after yearsElapsed of payments. (RR:2258-2265)
 */
function calcRemainingBalance(loanAmount, annualRate, termYears, yearsElapsed) {
  const r = annualRate / 12;
  const p = yearsElapsed * 12;
  if (r === 0) return loanAmount * (1 - p / (termYears * 12));
  const payment = calcMortgagePayment(loanAmount, annualRate, termYears);
  return loanAmount * Math.pow(1 + r, p) - payment * (Math.pow(1 + r, p) - 1) / r;
}

/**
 * Per-country selling-cost pct lookup. (RR:2549-2551)
 */
function getSellingCostPct(countryId) {
  return HOME_SELLING_COST_PCT[countryId] ?? 0.07;
}

/**
 * Standard amortization → annual payment. (RR:2585-2592, Generic:2655-2662)
 */
function amortizedAnnualPayment(principal, annualRate, termYears) {
  if (principal <= 0 || termYears <= 0) return 0;
  if (annualRate <= 0) return principal / termYears;
  const r = annualRate / 12;
  const n = termYears * 12;
  const monthly = principal * r / (1 - Math.pow(1 + r, -n));
  return monthly * 12;
}

/**
 * Per-kid annual college expense at a given kid age, including loan-
 * repayment phase. Federal Direct Subsidized model (no in-school interest).
 * (RR:2596-2615, Generic:2636-2657)
 */
function getKidYearExpense(kidAge, countryId, loanPct, parentPct, loanRate, loanTerm, startAge = 18) {
  if (kidAge == null || !countryId) return 0;
  const d = COLLEGE_BY_COUNTRY[countryId] || COLLEGE_BY_COUNTRY['us-private'];
  if (d.years <= 0 || d.cost <= 0) return 0;
  const pctFinanced = Math.max(0, Math.min(100, loanPct || 0)) / 100;
  const pctParent = Math.max(0, Math.min(100, parentPct ?? 100)) / 100;
  const gradAge = startAge + d.years;
  let cost = 0;
  if (kidAge >= startAge && kidAge < gradAge) {
    cost += d.cost * (1 - pctFinanced);
  }
  if (pctFinanced > 0 && kidAge >= gradAge && kidAge < gradAge + loanTerm) {
    const principal = d.cost * pctFinanced * d.years;
    const annualPmt = amortizedAnnualPayment(principal, loanRate, loanTerm);
    cost += annualPmt * pctParent;
  }
  return cost;
}

/**
 * Total all-kids annual college cost. This one differs slightly between
 * dashboards: RR has hardcoded kid1/kid2 fields; Generic has arrays. Unified
 * here via inp.kidAges[] / inp.kidCollegePlans[] / inp.kidLoanPcts[] /
 * inp.kidLoanParentPcts[]. (RR:2619-2626, Generic:2673-2686)
 */
function getTotalCollegeCostForYear(inp, yearsFromNow) {
  const kidAges = inp.kidAges || [];
  const kidCollegePlans = inp.kidCollegePlans || [];
  const kidLoanPcts = inp.kidLoanPcts || [];
  const kidLoanParentPcts = inp.kidLoanParentPcts || [];
  const rate = (inp.loanRate ?? 6.53) / 100;
  const term = inp.loanTerm ?? 10;
  let total = 0;
  for (let i = 0; i < kidAges.length; i++) {
    const kidAgeThen = (kidAges[i] || 0) + yearsFromNow;
    const plan = kidCollegePlans[i] || 'us-private';
    const loanPct = kidLoanPcts[i] || 0;
    const parentPct = kidLoanParentPcts[i] != null ? kidLoanParentPcts[i] : 100;
    total += getKidYearExpense(kidAgeThen, plan, loanPct, parentPct, rate, term);
  }
  return total;
}

/**
 * SSA earnings history projected forward to fireYear.
 * (RR:1984-2006, Generic:2067-2089)
 *
 * DOM-dependence: the inline engine calls `calcAge(BIRTHDATES.roger)` +
 * `new Date().getFullYear()`. We pin those via env.currentYear and
 * env.currentAgePrimaryCalendar so this is deterministic in tests.
 */
function getFullEarningsHistory(env, fireAge) {
  const currentAge = env.currentAgePrimaryCalendar;
  const currentYear = env.currentYear;
  const fireYear = currentYear + (fireAge - currentAge);
  const allEarnings = env.ssEarningsHistory.map(r => ({ year: r.year, earnings: r.earnings }));
  const lastRecorded = allEarnings.length > 0
    ? allEarnings[allEarnings.length - 1]
    : { year: currentYear - 1, earnings: 100_000 };
  for (let y = lastRecorded.year + 1; y < fireYear; y++) {
    const yearsOut = y - lastRecorded.year;
    const projected = Math.min(
      Math.round(lastRecorded.earnings * Math.pow(1.03, yearsOut)),
      SS_EARNINGS_CAP,
    );
    allEarnings.push({ year: y, earnings: projected });
  }
  return allEarnings;
}

/**
 * Realistic SSA PIA calculator: top-35 earnings → AIME → bend-point PIA.
 * Supports spousal (50% of primary or spouse's own, whichever higher).
 * (RR:3272-3333, Generic:3048-3108)
 */
function calcRealisticSSA(env, inp, fireAge) {
  const allEarnings = getFullEarningsHistory(env, fireAge);
  const yearsWorked = allEarnings.length;

  const actualCredits = env.ssEarningsHistory.reduce((s, r) => s + r.credits, 0);
  const projectedYears = Math.max(0, yearsWorked - env.ssEarningsHistory.length);
  const totalCredits = actualCredits + (projectedYears * 4);
  const qualifies = totalCredits >= 40;

  const earningsValues = allEarnings.map(r => r.earnings).sort((a, b) => b - a);
  const top35 = [];
  for (let i = 0; i < 35; i++) {
    top35.push(i < earningsValues.length ? earningsValues[i] : 0);
  }
  const totalEarnings = top35.reduce((s, e) => s + e, 0);
  const aime = totalEarnings / (35 * 12);

  let pia = 0;
  if (aime <= SS_BEND1) {
    pia = aime * 0.90;
  } else if (aime <= SS_BEND2) {
    pia = SS_BEND1 * 0.90 + (aime - SS_BEND1) * 0.32;
  } else {
    pia = SS_BEND1 * 0.90 + (SS_BEND2 - SS_BEND1) * 0.32 + (aime - SS_BEND2) * 0.15;
  }

  // Spousal: RR uses inp.ssRebeccaOwn; Generic uses inp.ssSpouseOwn. Both are
  // the secondary person's own PIA; take max(50% × primary PIA, own PIA).
  const secondaryOwn = inp.ssSpouseOwn ?? inp.ssRebeccaOwn ?? 0;
  const secondaryPIA = Math.max(pia * 0.5, secondaryOwn);

  return { qualifies, rogerPIA: pia, rebeccaPIA: secondaryPIA };
}

/**
 * Annual SS benefit adjusted for claim age. Primary gets full early/late
 * adjustment; spousal gets early reduction but no delayed credits.
 * (RR:3336-3358, Generic:3112-3134)
 */
function getSSAnnual(env, inp, claimAge, fireAge) {
  const ssa = calcRealisticSSA(env, inp, fireAge);
  if (!ssa.qualifies) return 0;

  let primaryMonthly = ssa.rogerPIA;
  let secondaryMonthly = ssa.rebeccaPIA;

  if (claimAge === 62) {
    primaryMonthly *= 0.70;
    secondaryMonthly *= 0.65;
  } else if (claimAge === 65) {
    primaryMonthly *= 0.867;
    secondaryMonthly *= 0.833;
  } else if (claimAge === 70) {
    primaryMonthly *= 1.24;
  }
  // 67 = FRA, no adjustment.

  return (primaryMonthly + secondaryMonthly) * 12;
}

/**
 * Mortgage impact at a specific year — used by getMortgageAdjustedRetirement's
 * sell-at-FIRE path. (RR:2302-2328)
 */
function calcMortgageImpactAtYear(mtg, yearsOfAppreciation, yearsOfPayments) {
  const loanAmount = mtg.homePrice - mtg.downPayment;
  const homeValue = mtg.homePrice * Math.pow(1 + mtg.appreciation, yearsOfAppreciation);
  const remainingBalance = Math.max(
    0,
    calcRemainingBalance(loanAmount, mtg.rate, mtg.term, Math.min(yearsOfPayments, mtg.term)),
  );
  const equity = homeValue - remainingBalance;
  const sellingCostPct = getSellingCostPct(mtg.homeLocation || 'us');
  const sellingCosts = homeValue * sellingCostPct;
  const netProceeds = equity - sellingCosts;
  return { netProceeds };
}

/**
 * Per-year Home #2 carry: annual P&I + tax + other − rental income. Zero
 * outside the purchase→sale window. (RR:2142-2152, Generic matches)
 */
function getSecondHomeAnnualCarryAtYear(h2, yearsFromNow, fireYrsFromNow) {
  if (yearsFromNow < h2.buyInYears) return 0;
  if (h2.destiny === 'sell' && yearsFromNow > fireYrsFromNow) return 0;
  const yearsIntoMortgage = yearsFromNow - h2.buyInYears;
  let annualPI = 0;
  if (yearsIntoMortgage < h2.term && h2.rate > 0 && h2.homePrice > h2.downPayment) {
    const loanAmt = h2.homePrice - h2.downPayment;
    annualPI = calcMortgagePayment(loanAmt, h2.rate, h2.term) * 12;
  }
  return annualPI + h2.propertyTax + h2.otherCarry - h2.rentalIncome;
}

/**
 * Net sale proceeds if Home #2 is sold at FIRE. (RR:2162-2178)
 */
function getSecondHomeSaleAtFire(h2, fireYrsFromNow) {
  if (h2.destiny !== 'sell') return 0;
  if (fireYrsFromNow < h2.buyInYears) return 0;
  const yearsOfApprec = fireYrsFromNow - h2.buyInYears;
  const futureValue = h2.homePrice * Math.pow(1 + h2.appreciation, yearsOfApprec);
  const sellingCostPct = getSellingCostPct(h2.location);
  const yearsIntoMortgage = fireYrsFromNow - h2.buyInYears;
  let remainingLoan = 0;
  if (h2.rate > 0 && yearsIntoMortgage < h2.term && h2.homePrice > h2.downPayment) {
    const loanAmt = h2.homePrice - h2.downPayment;
    const r = h2.rate / 12;
    const N = h2.term * 12;
    const n = yearsIntoMortgage * 12;
    remainingLoan = loanAmt * (Math.pow(1 + r, N) - Math.pow(1 + r, n)) / (Math.pow(1 + r, N) - 1);
  }
  return Math.max(0, futureValue * (1 - sellingCostPct) - remainingLoan);
}

/**
 * Mortgage-adjusted retirement spend + one-time sale proceeds.
 * (RR:4889-4945, Generic matches at mirrored line)
 */
function getMortgageAdjustedRetirement(env, inp, scenarioAnnualSpend, yrsToFire) {
  if (!env.mortgageEnabled) return { annualSpend: scenarioAnnualSpend, saleProceeds: 0 };
  const mtg = env.mortgage;
  const currentRent = (inp.rentMonthly ?? env.rentMonthly ?? DEFAULT_RENT_MONTHLY);
  const annualRent = currentRent * 12;

  let yearsIntoMortgageAtFire;
  let yearsOfAppreciationAtFire;
  if (mtg.ownership === 'already-own') {
    yearsIntoMortgageAtFire = mtg.yearsPaid + yrsToFire;
    yearsOfAppreciationAtFire = mtg.yearsPaid + yrsToFire;
  } else if (mtg.ownership === 'buying-in') {
    if (yrsToFire <= mtg.buyInYears) {
      return { annualSpend: scenarioAnnualSpend, saleProceeds: 0 };
    }
    yearsIntoMortgageAtFire = yrsToFire - mtg.buyInYears;
    yearsOfAppreciationAtFire = yrsToFire - mtg.buyInYears;
  } else {
    yearsIntoMortgageAtFire = yrsToFire;
    yearsOfAppreciationAtFire = yrsToFire;
  }

  if (mtg.sellAtFire) {
    const impact = calcMortgageImpactAtYear(mtg, yearsOfAppreciationAtFire, yearsIntoMortgageAtFire);
    return { annualSpend: scenarioAnnualSpend, saleProceeds: Math.max(0, impact.netProceeds) };
  }

  const remainingMortgageYears = Math.max(0, mtg.term - yearsIntoMortgageAtFire);
  const loanAmount = mtg.homePrice - mtg.downPayment;
  const monthlyPI = remainingMortgageYears > 0
    ? calcMortgagePayment(loanAmount, mtg.rate, mtg.term)
    : 0;
  const monthlyHousing = monthlyPI + (mtg.propertyTax / 12) + (mtg.insurance / 12) + mtg.hoa;
  const annualHousing = monthlyHousing * 12;
  const isSameCountry = (mtg.homeLocation || 'us') === env.selectedScenario;
  const adjustedSpend = isSameCountry
    ? scenarioAnnualSpend - annualRent + annualHousing
    : scenarioAnnualSpend + annualHousing;
  return { annualSpend: Math.max(0, adjustedSpend), saleProceeds: 0 };
}

/**
 * Proportional tax-aware withdrawal across (pTrad, pRoth, pStocks, pCash).
 * Grosses up by Trad's tax drag.  (RR:3571-3585, Generic:3341-3355)
 */
function taxAwareWithdraw(netSpend, pTrad, pRoth, pStocks, pCash, taxTrad) {
  const posT = Math.max(0, pTrad);
  const posR = Math.max(0, pRoth);
  const posS = Math.max(0, pStocks);
  const posC = Math.max(0, pCash);
  const posTotal = posT + posR + posS + posC;
  if (posTotal <= 0 || netSpend <= 0) {
    return { gross: 0, gTrad: 0, gRoth: 0, gStocks: 0, gCash: 0 };
  }
  const wT = posT / posTotal;
  const wR = posR / posTotal;
  const wS = posS / posTotal;
  const wC = posC / posTotal;
  const effRate = 1 - wT * taxTrad;
  const gross = effRate > 1e-9 ? netSpend / effRate : netSpend;
  return { gross, gTrad: gross * wT, gRoth: gross * wR, gStocks: gross * wS, gCash: gross * wC };
}

// ============================================================================
// SIGNED LIFECYCLE SIMULATOR — port of FIRE-Dashboard.html:3705-3862
// and its Generic twin (agePerson1/person1_401k-prefixed).
// ============================================================================

/**
 * Year-by-year signed simulator: no clamping of pools to ≥0, so shortfalls
 * show up as the signed end-of-plan balance. Returns the 3 balance snapshots
 * the solver uses for feasibility checks.
 *
 * Inputs (legacy shape, normalized):
 *   inp.ageRoger          — primary person age (RR: ageRoger; Generic: agePerson1)
 *   inp.roger401kTrad     — (Generic: person1_401kTrad)
 *   inp.roger401kRoth     — (Generic: person1_401kRoth)
 *   inp.rogerStocks       — (Generic: person1Stocks)
 *   inp.rebeccaStocks     — (Generic: person2Stocks)
 *   inp.cashSavings, inp.otherAssets
 *   inp.contrib401kTrad, inp.contrib401kRoth, inp.empMatch
 *   inp.monthlySavings
 *   inp.returnRate, inp.return401k, inp.inflationRate
 *   inp.taxTrad           — trad withdrawal tax drag (fraction)
 *   inp.endAge, inp.ssClaimAge
 *   inp.kidAges[], inp.kidCollegePlans[], inp.kidLoanPcts[],
 *     inp.kidLoanParentPcts[], inp.loanRate, inp.loanTerm
 *
 * env:
 *   selectedScenario, mortgageEnabled, secondHomeEnabled,
 *   mortgage (optional), secondHome (optional),
 *   ssEarningsHistory[], currentYear, currentAgePrimaryCalendar,
 *   currentAgePrimaryInput, kidAgesInput[], hcOverridePre65?, hcOverridePost65?,
 *   rentMonthly (optional)
 */
function signedLifecycleEndBalance(env, inp, annualSpend, fireAge) {
  const realReturnStocks = inp.returnRate - inp.inflationRate;
  const realReturn401k = inp.return401k - inp.inflationRate;
  const tradContrib = inp.contrib401kTrad + inp.empMatch;
  const rothContrib = inp.contrib401kRoth;
  const endAge = inp.endAge || 95;
  const taxTrad = inp.taxTrad;
  const ssAnnual = getSSAnnual(env, inp, inp.ssClaimAge, fireAge);
  const yrsToFire = fireAge - inp.ageRoger;
  const mtgAdj = getMortgageAdjustedRetirement(env, inp, annualSpend, yrsToFire);
  const retireSpend = mtgAdj.annualSpend;
  const scenario = SCENARIOS_BY_ID[env.selectedScenario] || SCENARIOS_BY_ID.us;
  const relocationCost = env.relocationCost ?? scenario.relocationCost ?? 0;

  let pTrad = inp.roger401kTrad;
  let pRoth = inp.roger401kRoth;
  let pStocks = inp.rogerStocks + inp.rebeccaStocks;
  let pCash = inp.cashSavings + inp.otherAssets;

  // Primary-home upfront handling
  const mtg = env.mortgageEnabled ? env.mortgage : null;
  let mtgPurchased = false;
  let mtgPurchaseYear = 0;
  if (env.mortgageEnabled && mtg) {
    if (mtg.ownership === 'buying-now') {
      mtgPurchased = true;
      mtgPurchaseYear = 0;
      pCash -= (mtg.downPayment + mtg.closingCosts);
    } else if (mtg.ownership === 'already-own') {
      mtgPurchased = true;
      mtgPurchaseYear = -mtg.yearsPaid;
    }
  }

  // Second-home setup
  const h2 = env.secondHomeEnabled ? env.secondHome : null;
  let h2Purchased = false;
  let h2SaleAdded = false;
  if (env.secondHomeEnabled && h2 && h2.buyInYears === 0) {
    pCash -= (h2.downPayment + h2.closingCosts);
    h2Purchased = true;
  }

  let saleAdded = false;
  let relocDeducted = false;
  let balanceAtUnlock = null;
  let balanceAtSS = null;
  const effBal = () => pTrad * (1 - taxTrad) + pRoth + pStocks + pCash;

  for (let age = inp.ageRoger; age < endAge; age++) {
    const yearsFromNow = age - inp.ageRoger;

    if (env.mortgageEnabled && mtg && mtg.ownership === 'buying-in'
        && !mtgPurchased && yearsFromNow >= mtg.buyInYears) {
      pCash -= (mtg.downPayment + mtg.closingCosts);
      mtgPurchased = true;
      mtgPurchaseYear = mtg.buyInYears;
    }
    if (env.secondHomeEnabled && h2 && !h2Purchased && yearsFromNow >= h2.buyInYears) {
      pCash -= (h2.downPayment + h2.closingCosts);
      h2Purchased = true;
    }

    const isRetired = age >= fireAge;
    const is401kUnlocked = age >= UNLOCK_AGE;
    const ssActive = age >= inp.ssClaimAge;
    const ssThisYear = ssActive ? ssAnnual : 0;

    // Phase-transition balance snapshots — post-retirement only. (RR:3774-3778)
    if (isRetired) {
      if (balanceAtUnlock === null && is401kUnlocked) balanceAtUnlock = effBal();
      if (balanceAtSS === null && ssActive) balanceAtSS = effBal();
    }

    if (isRetired && !saleAdded && mtgAdj.saleProceeds > 0) {
      pStocks += mtgAdj.saleProceeds;
      saleAdded = true;
    }
    if (isRetired && !relocDeducted && relocationCost > 0) {
      pStocks -= relocationCost;
      relocDeducted = true;
    }
    if (env.secondHomeEnabled && h2 && isRetired && !h2SaleAdded && h2.destiny === 'sell') {
      pStocks += getSecondHomeSaleAtFire(h2, yrsToFire);
      h2SaleAdded = true;
    }
    const h2Carry = (env.secondHomeEnabled && h2 && h2Purchased)
      ? getSecondHomeAnnualCarryAtYear(h2, yearsFromNow, yrsToFire)
      : 0;

    // Mortgage-vs-rent delta during both phases
    let mtgAdjust = 0;
    if (env.mortgageEnabled && mtgPurchased && mtg) {
      const yearsIntoPurchase = yearsFromNow - mtgPurchaseYear;
      const rent = (inp.rentMonthly ?? env.rentMonthly ?? DEFAULT_RENT_MONTHLY);
      if (yearsIntoPurchase < mtg.term) {
        const loanAmount = mtg.homePrice - mtg.downPayment;
        const monthlyPI = calcMortgagePayment(loanAmount, mtg.rate, mtg.term);
        mtgAdjust = ((monthlyPI + mtg.propertyTax / 12 + mtg.insurance / 12 + mtg.hoa) - rent) * 12;
      } else {
        mtgAdjust = ((mtg.propertyTax / 12 + mtg.insurance / 12 + mtg.hoa) - rent) * 12;
      }
    }

    const collegeCostThisYear = getTotalCollegeCostForYear(inp, yearsFromNow);

    if (!isRetired) {
      // Accumulation phase — contributions, returns, savings.  (RR:3808-3814)
      pTrad = pTrad * (1 + realReturn401k) + tradContrib;
      pRoth = pRoth * (1 + realReturn401k) + rothContrib;
      const effAnnualSavings = Math.max(
        0,
        inp.monthlySavings * 12 - mtgAdjust - collegeCostThisYear - h2Carry,
      );
      pStocks = pStocks * (1 + realReturnStocks) + effAnnualSavings;
      pCash *= CASH_ANNUAL_GROWTH;
    } else {
      // Retirement phase — pools allowed to go NEGATIVE (FR/audit-identified).
      //                   (RR:3815-3851)
      const hcDelta = getHealthcareDeltaAnnual(env, age);
      const netSpend = Math.max(0, retireSpend + hcDelta + collegeCostThisYear + h2Carry - ssThisYear);

      if (!is401kUnlocked) {
        // Phase 1: only taxable can fund. (RR:3821-3832)
        const posTax = Math.max(0, pStocks) + Math.max(0, pCash);
        if (posTax > 0) {
          const sR = Math.max(0, pStocks) / Math.max(1e-9, posTax);
          pStocks -= netSpend * sR;
          pCash -= netSpend * (1 - sR);
        } else {
          pStocks -= netSpend;
        }
        pTrad *= (1 + realReturn401k);
        pRoth *= (1 + realReturn401k);
      } else {
        // Phase 2/3: all pools available with tax gross-up on Trad share.
        //            (RR:3834-3849)
        const pos = Math.max(0, pTrad) + Math.max(0, pRoth)
                  + Math.max(0, pStocks) + Math.max(0, pCash);
        if (pos > 0) {
          const w = taxAwareWithdraw(netSpend, pTrad, pRoth, pStocks, pCash, taxTrad);
          pTrad -= w.gTrad;
          pRoth -= w.gRoth;
          pStocks -= w.gStocks;
          pCash -= w.gCash;
        } else {
          pStocks -= netSpend / Math.max(1e-9, 1 - taxTrad);
        }
        pTrad *= (1 + realReturn401k);
        pRoth *= (1 + realReturn401k);
      }
      pStocks *= (1 + realReturnStocks);
      pCash *= CASH_ANNUAL_GROWTH;
    }
  }

  const endBalance = pTrad * (1 - taxTrad) + pRoth + pStocks + pCash;
  if (balanceAtUnlock === null) balanceAtUnlock = fireAge >= UNLOCK_AGE ? endBalance : 0;
  if (balanceAtSS === null) balanceAtSS = fireAge >= inp.ssClaimAge ? endBalance : 0;
  return { endBalance, balanceAtUnlock, balanceAtSS };
}

/**
 * Mode-aware feasibility gate. (RR:3875-3890, Generic:3622-3637)
 */
function isFireAgeFeasible(sim, inp, annualSpend, mode, terminalBufferYears = 0) {
  if (mode === 'dieWithZero') return sim.endBalance >= 0;
  if (mode === 'exact') return sim.endBalance >= terminalBufferYears * annualSpend;
  // safe
  const bufUnlock = (inp.bufferUnlock || 0) * annualSpend;
  const bufSS = (inp.bufferSS || 0) * annualSpend;
  return sim.balanceAtUnlock >= bufUnlock
    && sim.balanceAtSS >= bufSS
    && sim.endBalance >= 0;
}

/**
 * Earliest-age feasibility solver. Scans integer years [0..maxYrs]; for DWZ
 * does month-precise interpolation across the crossing boundary. For Safe
 * and Exact uses integer-year precision.
 * (RR:3901-3942, Generic:3643-3683)
 */
function findFireAgeNumerical(env, inp, annualSpend, mode, terminalBufferYears = 0) {
  const endAge = inp.endAge || 95;
  const ageP1 = inp.ageRoger;
  const maxYrs = Math.min(45, Math.max(0, endAge - ageP1 - 1));
  let prevSim = null;

  for (let y = 0; y <= maxYrs; y++) {
    const sim = signedLifecycleEndBalance(env, inp, annualSpend, ageP1 + y);
    if (isFireAgeFeasible(sim, inp, annualSpend, mode, terminalBufferYears)) {
      if (mode === 'dieWithZero' && y > 0 && prevSim !== null) {
        const span = sim.endBalance - prevSim.endBalance;
        const f = span > 0 ? Math.max(0, Math.min(1, -prevSim.endBalance / span)) : 0;
        const totalMonths = Math.max(
          0,
          Math.min(maxYrs * 12, Math.ceil((y - 1) * 12 + f * 12)),
        );
        return {
          totalMonths,
          years: Math.floor(totalMonths / 12),
          months: totalMonths % 12,
          endBalance: sim.endBalance,
          sim,
          feasible: true,
        };
      }
      return {
        totalMonths: y * 12,
        years: y,
        months: 0,
        endBalance: sim.endBalance,
        sim,
        feasible: true,
      };
    }
    prevSim = sim;
  }
  return {
    totalMonths: maxYrs * 12,
    years: maxYrs,
    months: 0,
    endBalance: prevSim ? prevSim.endBalance : 0,
    sim: prevSim,
    feasible: false,
  };
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Normalize the two legacy shapes (RR field names vs Generic field names)
 * into a single internal shape the simulator consumes. Callers can provide
 * either. This does NOT produce the US2b canonical Inputs shape — that's a
 * separate adapter.
 */
function normalizeInlineInputs(raw) {
  const inp = { ...raw };
  // Primary age
  if (inp.ageRoger == null && inp.agePerson1 != null) inp.ageRoger = inp.agePerson1;
  // 401k Trad/Roth
  if (inp.roger401kTrad == null && inp.person1_401kTrad != null) inp.roger401kTrad = inp.person1_401kTrad;
  if (inp.roger401kRoth == null && inp.person1_401kRoth != null) inp.roger401kRoth = inp.person1_401kRoth;
  // Stocks
  if (inp.rogerStocks == null && inp.person1Stocks != null) inp.rogerStocks = inp.person1Stocks;
  if (inp.rebeccaStocks == null && inp.person2Stocks != null) inp.rebeccaStocks = inp.person2Stocks;
  // Defaults
  inp.roger401kTrad ??= 0;
  inp.roger401kRoth ??= 0;
  inp.rogerStocks ??= 0;
  inp.rebeccaStocks ??= 0;
  inp.cashSavings ??= 0;
  inp.otherAssets ??= 0;
  inp.contrib401kTrad ??= 0;
  inp.contrib401kRoth ??= 0;
  inp.empMatch ??= 0;
  inp.taxTrad ??= 0.15;
  inp.bufferUnlock ??= 0;
  inp.bufferSS ??= 0;
  inp.ssClaimAge ??= 67;
  return inp;
}

/**
 * Run the inline engine against a canonical input bundle and return the
 * baseline KPIs. No DOM, no Chart.js, no globals mutated.
 *
 * @param {object} bundle
 * @param {object} bundle.inputs        — legacy-shape user inputs (RR or Generic)
 * @param {object} bundle.env           — browser-state surrogate
 * @param {string} [bundle.mode]        — 'safe' | 'exact' | 'dieWithZero' (default 'safe')
 * @param {number} [bundle.terminalBufferYears] — Exact-mode buffer (default 0)
 * @param {number} [bundle.annualSpend] — override; if absent, computed from scenario
 * @returns {object} { fireAge, yearsToFire, feasible, endBalanceReal,
 *                    balanceAtUnlockReal, balanceAtSSReal, sim, annualSpend }
 */
export function runInlineLifecycle(bundle) {
  if (!bundle || typeof bundle !== 'object') {
    throw new TypeError('runInlineLifecycle: bundle must be an object');
  }
  const { inputs, env } = bundle;
  if (!inputs) throw new TypeError('runInlineLifecycle: bundle.inputs is required');
  if (!env) throw new TypeError('runInlineLifecycle: bundle.env is required');
  const mode = bundle.mode || 'safe';
  const terminalBufferYears = bundle.terminalBufferYears || 0;

  const inp = normalizeInlineInputs(inputs);

  // Scenarios table differs slightly between RR and Generic dashboards.
  const scenarioTable = env.dashboard === 'generic' ? SCENARIOS_GENERIC_BY_ID : SCENARIOS_BY_ID;
  const scenario = scenarioTable[env.selectedScenario] || scenarioTable.us;
  const baseAnnualSpend = bundle.annualSpend != null
    ? bundle.annualSpend
    : scenario.annualSpend + (scenario.visaCostAnnual || 0);

  // env.relocationCost can also be overridden; otherwise pull from the
  // dashboard-specific scenarios table.
  const resolvedEnv = {
    ...env,
    relocationCost: env.relocationCost ?? scenario.relocationCost ?? 0,
  };

  const r = findFireAgeNumerical(resolvedEnv, inp, baseAnnualSpend, mode, terminalBufferYears);
  const fireAge = inp.ageRoger + r.years;
  return {
    fireAge,
    yearsToFire: r.years,
    feasible: r.feasible,
    endBalanceReal: r.sim ? r.sim.endBalance : 0,
    balanceAtUnlockReal: r.sim ? r.sim.balanceAtUnlock : 0,
    balanceAtSSReal: r.sim ? r.sim.balanceAtSS : 0,
    sim: r.sim,
    annualSpend: baseAnnualSpend,
  };
}

/**
 * Lower-level exports — used by the regression test to lock any intermediate
 * value the baseline depends on.
 */
export {
  signedLifecycleEndBalance,
  isFireAgeFeasible,
  findFireAgeNumerical,
  taxAwareWithdraw,
  calcRealisticSSA,
  getSSAnnual,
  getHealthcareDeltaAnnual,
  getHealthcareFamilySizeFactor,
  getTotalCollegeCostForYear,
  getKidYearExpense,
  calcMortgagePayment,
  calcRemainingBalance,
  getSecondHomeAnnualCarryAtYear,
  getSecondHomeSaleAtFire,
  getMortgageAdjustedRetirement,
  normalizeInlineInputs,
  // Tables (frozen) — exported for reference / assertion.
  HEALTHCARE_BY_COUNTRY,
  COLLEGE_BY_COUNTRY,
  SCENARIOS_BY_ID,
  SCENARIOS_GENERIC_BY_ID,
};
