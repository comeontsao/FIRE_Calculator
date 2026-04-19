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
 *                                each year until payoffYear.
 *   - mortgageVerdict panel    — compares FIRE age with vs without accelerated
 *                                payoff (see FIRE-Dashboard{,-Generic}.html).
 *
 * Invariants:
 *   - Standard amortization math. `balanceRemainingReal` is monotonically
 *     non-increasing year over year.
 *   - `perYear.length === payoffYear - 0 + 1` (0-indexed year numbering).
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
