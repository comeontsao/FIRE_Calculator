/*
 * calc/studentLoan.js — amortization schedule for a standalone household-level
 * student-loan or adult-debt obligation in real dollars.
 *
 * Inputs:
 *   params: {
 *     principalReal:    number — real dollars outstanding today.
 *     annualRateReal:   number — decimal real rate (nominal − inflation).
 *                                Zero is supported (interest-free loans).
 *     termYears:        number — integer remaining term in whole years.
 *     startAge:         number — age at which payments begin; year indices
 *                                map `age = startAge + i`.
 *     extraPaymentReal: number — annual extra principal (real dollars);
 *                                defaults to 0 when omitted.
 *   }
 *
 * Outputs: StudentLoanSchedule (contracts/studentLoan.contract.md)
 *   {
 *     perYear: Array<{
 *       year:                  number,  // 0-indexed from startAge
 *       age:                   number,  // startAge + year
 *       paymentReal:           number,  // scheduled P&I + any extra principal
 *       balanceRemainingReal:  number,  // end-of-year outstanding balance
 *       interestReal:          number,  // interest paid during the year
 *       principalReal:         number,  // principal reduction during the year
 *     }>,
 *     payoffYear:            number,    // 0-based index when balance hits 0
 *     totalInterestPaidReal: number,    // sum of interestReal across perYear
 *   }
 *
 * Consumers:
 *   - calc/lifecycle.js — sums paymentReal across all studentLoans[*] each
 *                         year and subtracts from withdrawable income.
 *
 * Invariants:
 *   - perYear.length === payoffYear + 1.
 *   - balanceRemainingReal monotonically non-increasing.
 *   - Final year's balanceRemainingReal within 1e-6 of zero.
 *   - paymentReal === interestReal + principalReal (year-internal).
 *   - All values real dollars — inflation conversion happens only at the
 *     boundary via calc/inflation.js (FR-017).
 *
 * Implementation note:
 *   The amortization math reduces exactly to `calc/mortgage.js::computeMortgage`
 *   with renamed parameters. Per contracts/studentLoan.contract.md, this
 *   module thinly wraps computeMortgage so both consumers see a semantically
 *   distinct import and tests fixture the two contracts independently.
 *
 * Purity: no DOM, no Chart.js, no globals, no I/O, no module-scope mutation.
 */

import { computeMortgage } from './mortgage.js';

/**
 * Compute a year-level amortization schedule for a household student loan.
 *
 * @param {{
 *   principalReal:     number,
 *   annualRateReal:    number,
 *   termYears:         number,
 *   startAge:          number,
 *   extraPaymentReal?: number,
 * }} params
 * @returns {{
 *   perYear: Array<{year:number, age:number, paymentReal:number, balanceRemainingReal:number, interestReal:number, principalReal:number}>,
 *   payoffYear: number,
 *   totalInterestPaidReal: number,
 * }}
 */
export function computeStudentLoan(params) {
  const {
    principalReal,
    annualRateReal,
    termYears,
    startAge,
    extraPaymentReal = 0,
  } = params;

  return computeMortgage({
    principalReal,
    annualRateReal,
    termYears,
    startAge,
    extraPaymentReal,
  });
}
