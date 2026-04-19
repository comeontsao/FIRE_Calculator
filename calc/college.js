/*
 * calc/college.js — merge per-child college cost windows into a single
 * year-indexed cost curve.
 *
 * Inputs:
 *   params: {
 *     kids: Array<{
 *       name:             string,
 *       currentAge:       number,  // age TODAY (relative to currentYear)
 *       fourYearCostReal: number,  // total 4-year cost in real dollars
 *       startAge?:        number,  // defaults to 18
 *     }>,
 *     currentYear: number,         // calendar baseline; year offsets are
 *                                  // computed as `currentYear + (startAge - currentAge)`.
 *   }
 *
 * Outputs: CollegeSchedule (data-model.md §6)
 *   {
 *     perYear: Array<{
 *       year:     number,          // absolute calendar year
 *       age:      number,          // representative kid age that year (earliest starter wins)
 *       costReal: number,          // summed across overlapping kids
 *       kidNames: string[],        // every kid attending that calendar year
 *     }>
 *   }
 *   Only years with nonzero cost are emitted. `perYear` is sorted ascending by year.
 *
 * Consumers:
 *   - calc/lifecycle.js         — subtracts costReal from withdrawable income
 *                                 in the relevant years.
 *   - timelineChart renderer    — displays per-kid college windows
 *                                 (FIRE-Dashboard{,-Generic}.html).
 *
 * Invariants:
 *   - Default `startAge = 18` when a kid omits it.
 *   - Four-year window: costs apply to years `[startAge, startAge+3]` inclusive.
 *   - Annual cost per kid = `fourYearCostReal / 4`.
 *   - Overlapping windows (two kids attending the same calendar year) have
 *     their per-year costs summed and both names captured in `kidNames`.
 *   - Empty `kids` array produces `perYear: []`.
 *   - All values real dollars — no inflation conversion happens here.
 *
 * Purity: no DOM, no Chart.js, no globals, no I/O, no module-scope mutation.
 *
 * Simplifications (tracked for future refinement):
 *   - Flat 4-year total split evenly across years. Tuition inflation within
 *     the college window is not modeled here; callers can pre-inflate
 *     `fourYearCostReal` before calling if they need age-of-attendance
 *     adjustment.
 */

const DEFAULT_START_AGE = 18;
const COLLEGE_DURATION_YEARS = 4;

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

  /** @type {Map<number, {year:number, age:number, costReal:number, kidNames:string[]}>} */
  const byYear = new Map();

  for (const kid of kids) {
    const startAge = typeof kid.startAge === 'number' ? kid.startAge : DEFAULT_START_AGE;
    if (!(kid.fourYearCostReal >= 0)) {
      throw new Error(
        `college: kid '${kid.name}' fourYearCostReal must be >= 0, got ${kid.fourYearCostReal}`,
      );
    }
    const perYearCost = kid.fourYearCostReal / COLLEGE_DURATION_YEARS;
    const yearsUntilStart = startAge - kid.currentAge;

    for (let i = 0; i < COLLEGE_DURATION_YEARS; i += 1) {
      const age = startAge + i;
      const year = currentYear + yearsUntilStart + i;
      const existing = byYear.get(year);
      if (existing) {
        byYear.set(year, {
          year,
          // Preserve the earlier-starting kid's age for stability — this
          // field is informational; cost-math uses costReal only.
          age: Math.min(existing.age, age),
          costReal: existing.costReal + perYearCost,
          kidNames: [...existing.kidNames, kid.name],
        });
      } else {
        byYear.set(year, {
          year,
          age,
          costReal: perYearCost,
          kidNames: [kid.name],
        });
      }
    }
  }

  const perYear = Array.from(byYear.values())
    .filter((rec) => rec.costReal > 0)
    .sort((a, b) => a.year - b.year)
    .map((rec) => Object.freeze({
      year: rec.year,
      age: rec.age,
      costReal: rec.costReal,
      kidNames: Object.freeze([...rec.kidNames]),
    }));

  return Object.freeze({ perYear: Object.freeze(perYear) });
}
