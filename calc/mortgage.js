/*
 * calc/mortgage.js — amortization schedule for a fixed-rate mortgage in
 * real dollars.
 *
 * Inputs:
 *   params: {
 *     principalReal:    number — loan principal in real (baseYear) dollars.
 *     annualRateReal:   number — decimal real rate (nominal mortgage rate
 *                                minus inflation). Zero and negative values
 *                                are handled correctly.
 *     termYears:        number — integer scheduled duration (e.g., 30).
 *     startAge:         number — borrower's age at origination; year indices
 *                                map `age = startAge + i`.
 *     extraPaymentReal: number — extra principal paid per year, in real
 *                                dollars. 0 ⇒ standard amortization.
 *   }
 *
 * Outputs: MortgageSchedule (data-model.md §6)
 *   {
 *     perYear: Array<{
 *       year:                  number,  // 0-indexed year from startAge
 *       age:                   number,  // startAge + year
 *       paymentReal:           number,  // scheduled + extra principal applied this year
 *       balanceRemainingReal:  number,  // end-of-year balance
 *       interestReal:          number,  // interest paid during the year
 *       principalReal:         number,  // principal reduction during the year
 *     }>,
 *     payoffYear:           number,     // absolute year index (0-based) when balance hits 0
 *     totalInterestPaidReal: number,    // sum of interestReal across perYear
 *   }
 *
 * Consumers:
 *   - calc/lifecycle.js        — subtracts paymentReal from withdrawable income
 *                                each year until payoffYear; calls the
 *                                ownership-aware helper `resolveMortgage` for
 *                                full lifecycle-indexed housing outflow +
 *                                carry + sale proceeds.
 *   - mortgageVerdict panel    — compares FIRE age with vs without accelerated
 *                                payoff (see FIRE-Dashboard{,-Generic}.html).
 *   - calc/studentLoan.js      — wraps `computeMortgage` (shared amortization).
 *
 * Additional export (US2b): `resolveMortgage({mortgage, currentAgePrimary,
 * endAge, fireAge, rentAlternativeReal?, homeLocation?})` returns a full
 * MortgageLifecycleBundle covering every year of the plan, honoring the
 * three ownership modes (buying-now, already-own, buying-in) and the three
 * destiny modes (sell, live-in, inherit). See
 * `specs/001-modular-calc-engine/contracts/mortgage.contract.md` for the
 * authoritative contract.
 *
 * Invariants:
 *   - Standard amortization math. `balanceRemainingReal` is monotonically
 *     non-increasing year over year.
 *   - `perYear.length === payoffYear - 0 + 1` (0-indexed year numbering) for
 *     `computeMortgage`; `perYear.length === endAge - currentAgePrimary + 1`
 *     for `resolveMortgage` (lifecycle-indexed, zero-padded).
 *   - Final year's `balanceRemainingReal` is within 1e-6 of zero.
 *   - All numeric values are real dollars — inflation conversion happens
 *     at the boundary via calc/inflation.js (FR-017). The caller is
 *     responsible for supplying a real rate (nominal rate − inflation).
 *   - Annual-granularity schedule — each perYear entry aggregates 12 months
 *     of interest/principal at the effective monthly rate.
 *
 * Purity: no DOM, no Chart.js, no globals, no I/O, no module-scope mutation.
 */

const MONTHS_PER_YEAR = 12;

/**
 * Compute the fixed monthly payment for a standard amortizing loan.
 * Handles the zero-rate edge case by falling back to principal / numMonths.
 *
 * @param {number} principal    real dollars
 * @param {number} monthlyRate  decimal monthly rate
 * @param {number} numMonths    integer total months
 * @returns {number}            fixed monthly payment in real dollars
 */
function monthlyPayment(principal, monthlyRate, numMonths) {
  if (numMonths <= 0) return 0;
  if (Math.abs(monthlyRate) < 1e-12) {
    return principal / numMonths;
  }
  const growth = Math.pow(1 + monthlyRate, numMonths);
  return (principal * monthlyRate * growth) / (growth - 1);
}

/**
 * Compute a year-level amortization schedule in real dollars.
 *
 * @param {{
 *   principalReal:    number,
 *   annualRateReal:   number,
 *   termYears:        number,
 *   startAge:         number,
 *   extraPaymentReal: number,
 * }} params
 * @returns {{
 *   perYear: Array<{year:number, age:number, paymentReal:number, balanceRemainingReal:number, interestReal:number, principalReal:number}>,
 *   payoffYear: number,
 *   totalInterestPaidReal: number,
 * }}
 */
export function computeMortgage(params) {
  const {
    principalReal,
    annualRateReal,
    termYears,
    startAge,
    extraPaymentReal,
  } = params;

  if (!(principalReal >= 0)) {
    throw new Error(`mortgage: principalReal must be >= 0, got ${principalReal}`);
  }
  if (!(termYears > 0)) {
    throw new Error(`mortgage: termYears must be > 0, got ${termYears}`);
  }

  const monthlyRate = annualRateReal / MONTHS_PER_YEAR;
  const numMonths = termYears * MONTHS_PER_YEAR;
  const scheduledMonthly = monthlyPayment(principalReal, monthlyRate, numMonths);
  const extraPerMonth = extraPaymentReal / MONTHS_PER_YEAR;

  /** @type {Array<{year:number, age:number, paymentReal:number, balanceRemainingReal:number, interestReal:number, principalReal:number}>} */
  const perYear = [];
  let balance = principalReal;
  let totalInterest = 0;
  let year = 0;

  // Guard against pathological inputs that would never amortize. Standard
  // amortization guarantees scheduledMonthly > monthlyInterest at origination
  // when rate >= 0. Extra-payment cases always pay down strictly faster.
  const MAX_YEARS = Math.max(termYears, 1) + 2;

  while (balance > 1e-6 && year < MAX_YEARS) {
    let yearInterest = 0;
    let yearPrincipal = 0;
    let yearPayment = 0;

    for (let m = 0; m < MONTHS_PER_YEAR && balance > 1e-6; m += 1) {
      const interest = balance * monthlyRate;
      // Cap the principal portion so we don't overshoot the balance.
      const scheduledPrincipal = Math.min(
        Math.max(0, scheduledMonthly - interest),
        balance,
      );
      const extraPrincipal = Math.min(extraPerMonth, balance - scheduledPrincipal);
      const principalThisMonth = scheduledPrincipal + extraPrincipal;
      const paymentThisMonth = interest + principalThisMonth;

      balance -= principalThisMonth;
      yearInterest += interest;
      yearPrincipal += principalThisMonth;
      yearPayment += paymentThisMonth;
    }

    // Snap a negligible residual to 0 to preserve the "final balance ≈ 0"
    // invariant without introducing floating-point fuzz downstream.
    if (balance < 1e-6) balance = 0;

    perYear.push(Object.freeze({
      year,
      age: startAge + year,
      paymentReal: yearPayment,
      balanceRemainingReal: balance,
      interestReal: yearInterest,
      principalReal: yearPrincipal,
    }));
    totalInterest += yearInterest;
    year += 1;
  }

  const payoffYear = perYear.length > 0 ? perYear[perYear.length - 1].year : 0;

  return Object.freeze({
    perYear: Object.freeze(perYear),
    payoffYear,
    totalInterestPaidReal: totalInterest,
  });
}

/**
 * Per-country selling-cost percent used when `destiny === 'sell'`. Defaults
 * to the US rate when location is unknown.
 */
const SELLING_COST_PCT_BY_LOCATION = Object.freeze({
  us: 0.07,
  tw: 0.04,
  jp: 0.06,
});

function sellingCostPct(location) {
  if (typeof location !== 'string') return SELLING_COST_PCT_BY_LOCATION.us;
  const key = location.toLowerCase();
  const pct = SELLING_COST_PCT_BY_LOCATION[key];
  return typeof pct === 'number' ? pct : SELLING_COST_PCT_BY_LOCATION.us;
}

/**
 * Resolve a high-level `Mortgage` input into a full lifecycle-indexed bundle.
 *
 * Honors ownership mode (buying-now, already-own, buying-in) and destiny
 * (sell, live-in, inherit). See `contracts/mortgage.contract.md` for the
 * authoritative contract and `data-model.md §1b` for the Mortgage typedef.
 *
 * @param {{
 *   mortgage: object,
 *   currentAgePrimary: number,
 *   endAge: number,
 *   fireAge: number,
 *   rentAlternativeReal?: number,
 *   homeLocation?: string,
 * }} params
 * @returns {{
 *   perYear: ReadonlyArray<{
 *     year: number,
 *     age: number,
 *     paymentReal: number,
 *     propertyTaxReal: number,
 *     insuranceReal: number,
 *     hoaAnnualReal: number,
 *     balanceRemainingReal: number,
 *     interestReal: number,
 *     principalReal: number,
 *     buyVsRentDeltaReal: number,
 *     oneTimeOutflowReal: number,
 *     saleProceedsReal: number,
 *   }>,
 *   payoffYear: number,
 *   totalInterestPaidReal: number,
 *   legacyValueAtEndReal: number,
 * }}
 */
export function resolveMortgage(params) {
  const {
    mortgage,
    currentAgePrimary,
    endAge,
    fireAge,
    rentAlternativeReal = 0,
    homeLocation,
  } = params;

  if (!mortgage || typeof mortgage !== 'object') {
    throw new Error('resolveMortgage: mortgage param is required');
  }
  if (!Number.isFinite(currentAgePrimary)) {
    throw new Error('resolveMortgage: currentAgePrimary must be a finite number');
  }
  if (!(endAge >= currentAgePrimary)) {
    throw new Error(
      `resolveMortgage: endAge (${endAge}) must be >= currentAgePrimary (${currentAgePrimary})`,
    );
  }

  const {
    ownership,
    homePriceReal,
    downPaymentReal,
    closingCostReal,
    annualRateReal,
    termYears,
    purchaseAge: purchaseAgeInput,
    yearsPaid,
    propertyTaxReal = 0,
    insuranceReal = 0,
    hoaMonthlyReal = 0,
    appreciationReal = 0,
    extraPaymentReal = 0,
    destiny = 'live-in',
    location,
  } = mortgage;

  if (
    ownership !== 'buying-now' &&
    ownership !== 'already-own' &&
    ownership !== 'buying-in'
  ) {
    throw new Error(
      `resolveMortgage: mortgage.ownership must be one of buying-now|already-own|buying-in; got '${ownership}'`,
    );
  }
  if (!(homePriceReal >= downPaymentReal)) {
    throw new Error(
      `resolveMortgage: homePriceReal (${homePriceReal}) must be >= downPaymentReal (${downPaymentReal})`,
    );
  }
  if (destiny !== 'sell' && destiny !== 'live-in' && destiny !== 'inherit') {
    throw new Error(
      `resolveMortgage: mortgage.destiny must be one of sell|live-in|inherit; got '${destiny}'`,
    );
  }

  // Resolve ownership-mode specifics.
  let purchaseAge;
  let includeDownPayment;
  let amortOffsetYears; // years of amortization already consumed before currentAgePrimary
  if (ownership === 'buying-now') {
    purchaseAge =
      typeof purchaseAgeInput === 'number' ? purchaseAgeInput : currentAgePrimary;
    includeDownPayment = true;
    amortOffsetYears = 0;
  } else if (ownership === 'already-own') {
    if (!Number.isFinite(yearsPaid) || yearsPaid < 0 || yearsPaid > termYears) {
      throw new Error(
        `resolveMortgage: ownership='already-own' requires yearsPaid in [0, termYears]; got ${yearsPaid}`,
      );
    }
    purchaseAge = currentAgePrimary - yearsPaid;
    includeDownPayment = false;
    amortOffsetYears = yearsPaid;
  } else {
    // 'buying-in'
    if (!Number.isFinite(purchaseAgeInput) || purchaseAgeInput <= currentAgePrimary) {
      throw new Error(
        `resolveMortgage: ownership='buying-in' requires purchaseAge > currentAgePrimary; got ${purchaseAgeInput}`,
      );
    }
    purchaseAge = purchaseAgeInput;
    includeDownPayment = true;
    amortOffsetYears = 0;
  }

  const loanPrincipal = homePriceReal - downPaymentReal;

  // Run the base amortization schedule starting at the virtual purchase age.
  const schedule = computeMortgage({
    principalReal: loanPrincipal,
    annualRateReal,
    termYears,
    startAge: purchaseAge,
    extraPaymentReal,
  });

  const hoaAnnualReal = hoaMonthlyReal * MONTHS_PER_YEAR;
  const rentAnnualReal = rentAlternativeReal * MONTHS_PER_YEAR;
  const sellPct = sellingCostPct(homeLocation || location);

  // Index amortization entries by absolute age for O(1) lookup.
  /** @type {Map<number, {paymentReal:number, balanceRemainingReal:number, interestReal:number, principalReal:number}>} */
  const byAge = new Map();
  for (const rec of schedule.perYear) {
    byAge.set(rec.age, rec);
  }

  /** @type {Array<object>} */
  const perYear = [];
  let totalInterestAfterToday = 0;
  let alreadySold = false;

  for (let age = currentAgePrimary; age <= endAge; age += 1) {
    const year = age - currentAgePrimary; // 0-indexed offset into lifecycle
    const isPurchaseYear = age === purchaseAge;
    const inOwnershipWindow = age >= purchaseAge;
    const amortRec = byAge.get(age);

    // Housing-cost fields default to 0 before purchase or after sale.
    let paymentReal = 0;
    let balanceRemainingReal = 0;
    let interestReal = 0;
    let principalPaidReal = 0;
    let propertyTaxThisYear = 0;
    let insuranceThisYear = 0;
    let hoaThisYear = 0;
    let oneTimeOutflowReal = 0;
    let saleProceedsReal = 0;

    if (inOwnershipWindow && !alreadySold) {
      // Carry costs persist as long as the property is owned.
      propertyTaxThisYear = propertyTaxReal;
      insuranceThisYear = insuranceReal;
      hoaThisYear = hoaAnnualReal;
      if (amortRec) {
        paymentReal = amortRec.paymentReal;
        balanceRemainingReal = amortRec.balanceRemainingReal;
        interestReal = amortRec.interestReal;
        principalPaidReal = amortRec.principalReal;
        totalInterestAfterToday += interestReal;
      }
    }

    if (isPurchaseYear && includeDownPayment) {
      oneTimeOutflowReal = downPaymentReal + closingCostReal;
    }

    if (age === fireAge && destiny === 'sell' && inOwnershipWindow && !alreadySold) {
      const yearsOfAppreciation = age - purchaseAge;
      const homeValue = homePriceReal * Math.pow(1 + appreciationReal, yearsOfAppreciation);
      const remainingBalance = amortRec ? amortRec.balanceRemainingReal : 0;
      saleProceedsReal = Math.max(0, homeValue * (1 - sellPct) - remainingBalance);
      alreadySold = true;
    }

    const annualHousingCost =
      paymentReal + propertyTaxThisYear + insuranceThisYear + hoaThisYear;
    const buyVsRentDeltaReal = annualHousingCost - rentAnnualReal;

    perYear.push(Object.freeze({
      year,
      age,
      paymentReal,
      propertyTaxReal: propertyTaxThisYear,
      insuranceReal: insuranceThisYear,
      hoaAnnualReal: hoaThisYear,
      balanceRemainingReal,
      interestReal,
      principalReal: principalPaidReal,
      buyVsRentDeltaReal,
      oneTimeOutflowReal,
      saleProceedsReal,
    }));

    if (alreadySold) {
      // From the year after sale onward, zero everything out.
      // The current iteration already set non-zero values for the sale year
      // itself (paymentReal, carry) which is the desired behavior per
      // contract: sale proceeds arrive at fireAge, carry drops AFTER.
    }
  }

  // Determine absolute payoff-year index (lifecycle-relative, 0-indexed from
  // currentAgePrimary). payoffAge = purchaseAge + schedule.payoffYear. If
  // that falls before currentAgePrimary (e.g., an already-own loan that is
  // fully amortized before today), clamp to the first lifecycle year.
  const payoffAge = purchaseAge + schedule.payoffYear;
  const payoffYear = Math.max(0, payoffAge - currentAgePrimary);

  // Legacy value for destiny === 'inherit'.
  let legacyValueAtEndReal = 0;
  if (destiny === 'inherit') {
    const yearsHeld = endAge - purchaseAge;
    legacyValueAtEndReal = homePriceReal * Math.pow(1 + appreciationReal, yearsHeld);
  }

  // totalInterestPaidReal here reflects interest paid FROM currentAgePrimary
  // onward (what actually hits the household's lifecycle). Interest paid
  // pre-today for 'already-own' loans is not the household's forward-looking
  // cost. Use amortOffsetYears to confirm (referenced for future audits).
  void amortOffsetYears;

  return Object.freeze({
    perYear: Object.freeze(perYear),
    payoffYear,
    totalInterestPaidReal: totalInterestAfterToday,
    legacyValueAtEndReal,
  });
}
