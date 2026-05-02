/*
 * calc/college.js — merge per-child college cost windows into a single
 * year-indexed cost curve, optionally with a Federal-Direct-Subsidized
 * loan-financing overlay that models post-graduation repayment.
 *
 * Inputs:
 *   params: {
 *     kids: Array<{
 *       name:             string,
 *       currentAge:       number,  // age TODAY (relative to currentYear)
 *       fourYearCostReal: number,  // total 4-year cost in real dollars
 *       startAge?:        number,  // defaults to 18
 *
 *       // US2b loan-financing overlay (defaults preserve legacy behavior
 *       // when any field is omitted or pctFinanced === 0):
 *       pctFinanced?:     number,  // 0..1 — share of tuition amortized as a loan
 *       parentPayPct?:    number,  // 0..1 — share of loan payments the parent covers
 *       loanRateReal?:    number,  // decimal real rate, default 0.0353
 *       loanTermYears?:   number,  // integer, default 10
 *     }>,
 *     currentYear: number,         // calendar baseline; year offsets are
 *                                  // computed as `currentYear + (startAge - currentAge)`.
 *   }
 *
 * Outputs: CollegeSchedule (data-model.md §6; contracts/college.contract.md)
 *   {
 *     perYear: Array<{
 *       year:              number,  // absolute calendar year
 *       age:               number,  // representative kid age that year (earliest starter wins)
 *       costReal:          number,  // summed across overlapping kids
 *       kidNames:          string[],// every kid contributing that calendar year
 *       inSchoolShareReal?: number, // portion of costReal from in-school tuition
 *       loanShareReal?:    number,  // portion of costReal from post-grad loan amortization
 *     }>
 *   }
 *   Only years with nonzero cost are emitted. `perYear` is sorted ascending by year.
 *
 * Consumers:
 *   - calc/lifecycle.js         — subtracts costReal from withdrawable income
 *                                 in the relevant years (both accumulation
 *                                 and retirement phases).
 *   - timelineChart renderer    — displays per-kid college windows
 *                                 (FIRE-Dashboard{,-Generic}.html).
 *   - collegeLoanImpact panel   — reads loanShareReal to show post-grad vs
 *                                 in-school split.
 *
 * Invariants:
 *   - Default `startAge = 18` when a kid omits it.
 *   - In-school window: tuition applies to years `[startAge, startAge+3]` inclusive.
 *   - Per-year in-school cost per kid = `(fourYearCostReal / 4) × (1 − pctFinanced)`.
 *   - Loan window: `[startAge+4, startAge+4+loanTermYears−1]` inclusive.
 *   - Per-year loan payment per kid = `amortized(fourYearCostReal × pctFinanced,
 *                                     loanRateReal, loanTermYears) × parentPayPct`.
 *     (Federal Direct Subsidized: no in-school interest accrual.)
 *   - Overlapping windows (two kids simultaneously OR one kid's in-school
 *     years colliding with another's loan-repayment) sum correctly in `costReal`.
 *   - Empty `kids` array produces `perYear: []`.
 *   - `pctFinanced === 0` (default) ⇒ output shape is byte-identical to the
 *     pre-US2b module output (regression safety for legacy fixtures).
 *   - All values real dollars — no inflation conversion happens here.
 *
 * Purity: no DOM, no Chart.js, no globals, no I/O, no module-scope mutation.
 *
 * Simplifications (tracked for future refinement):
 *   - Flat 4-year total split evenly across in-school years. Tuition
 *     inflation within the college window is not modeled here; callers can
 *     pre-inflate `fourYearCostReal` before calling.
 *   - Federal Direct Subsidized model: loan principal = pctFinanced × total
 *     tuition; no interest accrues during the 4-year in-school window.
 *
 * FRAME (feature 022 / FR-009):
 *   Dominant frame: real-$ (every $ field — fourYearCostReal, costReal,
 *     loanShareReal, inSchoolShareReal — lives in today's purchasing power).
 *   Frame-conversion sites: NONE — callers pre-inflate before calling, per
 *     existing invariant.
 */

const DEFAULT_START_AGE = 18;
const COLLEGE_DURATION_YEARS = 4;
const DEFAULT_LOAN_RATE_REAL = 0.0353;
const DEFAULT_LOAN_TERM_YEARS = 10;
const DEFAULT_PARENT_PAY_PCT = 1;
const MONTHS_PER_YEAR = 12;

/**
 * Closed-form annual payment on a standard amortizing loan.
 * Falls back to principal / termYears when the rate is effectively zero.
 */
function annualLoanPayment(principal, annualRate, termYears) {
  if (!(principal > 0) || !(termYears > 0)) return 0;
  if (Math.abs(annualRate) < 1e-12) return principal / termYears;
  const r = annualRate / MONTHS_PER_YEAR;
  const n = termYears * MONTHS_PER_YEAR;
  const monthly = (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  return monthly * MONTHS_PER_YEAR;
}

/**
 * Compute a merged year-indexed college cost schedule.
 *
 * @param {{
 *   kids: Array<{name: string, currentAge: number, fourYearCostReal: number, startAge?: number}>,
 *   currentYear: number,
 * }} params
 * @returns {{
 *   perYear: Array<{year:number, age:number, costReal:number, kidNames:string[]}>,
 * }}
 */
export function computeCollegeCosts(params) {
  const { kids, currentYear } = params;

  if (!Array.isArray(kids)) {
    throw new Error('college: kids must be an array');
  }
  if (!Number.isFinite(currentYear)) {
    throw new Error(`college: currentYear must be a finite number, got ${currentYear}`);
  }

  if (kids.length === 0) {
    return Object.freeze({ perYear: Object.freeze([]) });
  }

  /**
   * Per-year accumulator. `inSchoolShareReal` and `loanShareReal` track the
   * split reported back to the loan-impact UI; `costReal` is their sum.
   * `anyLoanFinanced` tracks whether we ever saw a kid with pctFinanced > 0;
   * when false, the module emits the legacy shape (no new fields) so the
   * pre-US2b output is byte-identical.
   *
   * @type {Map<number, {
   *   year: number,
   *   age: number,
   *   inSchoolShareReal: number,
   *   loanShareReal: number,
   *   kidNames: string[],
   * }>}
   */
  const byYear = new Map();
  let anyLoanFinanced = false;

  const bump = (year, age, kidName, inSchool, loan) => {
    const existing = byYear.get(year);
    if (existing) {
      byYear.set(year, {
        year,
        // Preserve the earlier-starting kid's age for stability — this
        // field is informational; cost-math uses costReal only.
        age: Math.min(existing.age, age),
        inSchoolShareReal: existing.inSchoolShareReal + inSchool,
        loanShareReal: existing.loanShareReal + loan,
        kidNames: [...existing.kidNames, kidName],
      });
    } else {
      byYear.set(year, {
        year,
        age,
        inSchoolShareReal: inSchool,
        loanShareReal: loan,
        kidNames: [kidName],
      });
    }
  };

  for (const kid of kids) {
    const startAge = typeof kid.startAge === 'number' ? kid.startAge : DEFAULT_START_AGE;
    if (!(kid.fourYearCostReal >= 0)) {
      throw new Error(
        `college: kid '${kid.name}' fourYearCostReal must be >= 0, got ${kid.fourYearCostReal}`,
      );
    }
    const pctFinanced = typeof kid.pctFinanced === 'number' ? kid.pctFinanced : 0;
    const parentPayPct =
      typeof kid.parentPayPct === 'number' ? kid.parentPayPct : DEFAULT_PARENT_PAY_PCT;
    const loanRateReal =
      typeof kid.loanRateReal === 'number' ? kid.loanRateReal : DEFAULT_LOAN_RATE_REAL;
    const loanTermYears =
      typeof kid.loanTermYears === 'number' ? kid.loanTermYears : DEFAULT_LOAN_TERM_YEARS;

    const annualTuitionBase = kid.fourYearCostReal / COLLEGE_DURATION_YEARS;
    const annualInSchoolCost = annualTuitionBase * (1 - pctFinanced);
    const yearsUntilStart = startAge - kid.currentAge;

    // In-school window: ages [startAge, startAge+3].
    for (let i = 0; i < COLLEGE_DURATION_YEARS; i += 1) {
      const age = startAge + i;
      const year = currentYear + yearsUntilStart + i;
      bump(year, age, kid.name, annualInSchoolCost, 0);
    }

    // Loan-repayment window: ages [startAge+4, startAge+4+loanTermYears-1].
    // Federal Direct Subsidized: no in-school interest accrual ⇒ loan
    // principal is simply pctFinanced × fourYearCostReal.
    if (pctFinanced > 0 && loanTermYears > 0) {
      anyLoanFinanced = true;
      const loanPrincipal = kid.fourYearCostReal * pctFinanced;
      const annualLoanCost =
        annualLoanPayment(loanPrincipal, loanRateReal, loanTermYears) * parentPayPct;
      for (let i = 0; i < loanTermYears; i += 1) {
        const age = startAge + COLLEGE_DURATION_YEARS + i;
        const year = currentYear + yearsUntilStart + COLLEGE_DURATION_YEARS + i;
        bump(year, age, kid.name, 0, annualLoanCost);
      }
    }
  }

  const perYear = Array.from(byYear.values())
    .map((rec) => ({
      ...rec,
      costReal: rec.inSchoolShareReal + rec.loanShareReal,
    }))
    .filter((rec) => rec.costReal > 0)
    .sort((a, b) => a.year - b.year)
    .map((rec) => {
      // Byte-identical legacy shape when no kid is loan-financed (pctFinanced=0
      // default across every kid). Otherwise emit the extended shape with
      // the split fields, as downstream consumers (collegeLoanImpact panel)
      // expect.
      if (!anyLoanFinanced) {
        return Object.freeze({
          year: rec.year,
          age: rec.age,
          costReal: rec.costReal,
          kidNames: Object.freeze([...rec.kidNames]),
        });
      }
      return Object.freeze({
        year: rec.year,
        age: rec.age,
        costReal: rec.costReal,
        kidNames: Object.freeze([...rec.kidNames]),
        inSchoolShareReal: rec.inSchoolShareReal,
        loanShareReal: rec.loanShareReal,
      });
    });

  return Object.freeze({ perYear: Object.freeze(perYear) });
}
