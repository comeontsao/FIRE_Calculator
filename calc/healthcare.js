/*
 * calc/healthcare.js — age- and scenario-sensitive healthcare cost for a
 * single simulated year.
 *
 * Inputs:
 *   params: {
 *     age:           number,                      // integer years
 *     scenario:      {                            // Scenario (types.js §Scenario)
 *       country:             string,              // e.g., 'US'
 *       healthcareScenario:  string,              // 'employer' | 'aca' | 'medicare' (drives phase)
 *     },
 *     householdSize: number,                      // integer >= 1
 *     overrides?:    {                            // all optional, per-phase real dollars
 *       prefireReal?:       number,
 *       postfireTo65Real?:  number,
 *       post65Real?:        number,
 *     }
 *   }
 *
 * Outputs: HealthcareCost (data-model.md §6, with phase enum)
 *   {
 *     annualCostReal: number,                     // > 0, real dollars
 *     phase:          'prefire' | 'aca' | 'medicare',
 *   }
 *
 * Consumers:
 *   - calc/lifecycle.js      — subtracts annualCostReal from withdrawable
 *                              income each year.
 *   - scenario card          — shows blended delta between two scenarios
 *                              (FIRE-Dashboard{,-Generic}.html).
 *   - countryChart renderer  — country-comparison chart.
 *   - FIRE-Dashboard-Generic.html inline — the dashboard's own
 *     `getHealthcareFamilySizeFactor` / `getHealthcareMonthly` mirror this
 *     module's `householdSize` semantic: `householdSize = adultCount` for the
 *     pre-65 adult-share portion, with per-kid scaling layered on top
 *     (feature 009, FR-014/FR-016).
 *
 * Invariants:
 *   - `annualCostReal > 0` for all supported inputs.
 *   - `phase` is one of 'prefire' | 'aca' | 'medicare'.
 *   - All cost values are real dollars. Overrides, scenario defaults, and
 *     outputs live in the same real-dollar space — no nominal conversion
 *     happens here (FR-017). Callers convert via calc/inflation.js at the
 *     boundary if they hold nominal inputs.
 *   - Phase selection prefers `scenario.healthcareScenario` when it names
 *     a known phase; otherwise falls back to age boundaries:
 *       age < 45           ⇒ prefire
 *       45 <= age < 65     ⇒ aca
 *       age >= 65          ⇒ medicare
 *     Once `age >= 65`, phase snaps to 'medicare' regardless of scenario
 *     (prevents ACA from being quoted to a Medicare-eligible household).
 *
 * Purity: no DOM, no Chart.js, no globals, no I/O, no module-scope mutation.
 *
 * Policy anchors (documented defaults — adjust via `overrides` or country
 * scenarios rather than editing constants):
 *   - US per-adult real-dollar baselines: prefire $3,000 (employee share of
 *     employer plan), aca $12,000 (individual market / Silver-tier premium
 *     less subsidy midpoint), medicare $6,000 (Part B + supplement + drugs).
 *     Sources cited inline; round to $100 — not a precision instrument.
 *   - Household scaling: second and subsequent members contribute 80% of
 *     the per-adult cost to reflect typical spousal/dependent bundling.
 *
 * Simplifications (tracked for future refinement):
 *   - Age-boundary-only phase selection is crude. A future feature may
 *     introduce smooth transitions (e.g., ACA subsidy cliffs, Medicare
 *     IRMAA tiers).
 *   - Only US is modeled in defaults. Non-US scenarios currently share the
 *     US defaults — add per-country baselines here when the scenario
 *     registry gains other countries.
 *
 * FRAME (feature 022 / FR-009):
 *   Dominant frame: real-$ (annualCostReal output and HEALTHCARE_BY_COUNTRY
 *     baselines all in today's USD per existing module comment).
 *   Frame-conversion sites: NONE — nominal→real conversion (when scenario
 *     supplies healthcareOverrideNominal) happens in calc/lifecycle.js's
 *     healthcareForYear() at the FR-017 boundary, not here.
 */

/** Per-adult real-dollar baselines by phase (US). */
const US_DEFAULTS = Object.freeze({
  prefire:  3_000,
  aca:      12_000,
  medicare: 6_000,
});

/** Age at which Medicare eligibility is assumed to override any other scenario. */
const MEDICARE_AGE = 65;

/** Crude fallback: prefire below this age when no scenario-named phase is supplied. */
const PREFIRE_AGE_CUTOFF = 45;

/** Discount applied to 2nd and subsequent household members. */
const HOUSEHOLD_DISCOUNT_FACTOR = 0.8;

/** Whitelist of scenario names that map 1:1 to a phase. */
const SCENARIO_TO_PHASE = Object.freeze({
  employer: 'prefire',
  prefire:  'prefire',
  aca:      'aca',
  medicare: 'medicare',
});

/** Phase → corresponding override key. */
const PHASE_TO_OVERRIDE = Object.freeze({
  prefire:  'prefireReal',
  aca:      'postfireTo65Real',
  medicare: 'post65Real',
});

/**
 * Resolve which phase applies this year.
 *
 * @param {number} age
 * @param {{healthcareScenario?: string}} scenario
 * @returns {'prefire' | 'aca' | 'medicare'}
 */
function resolvePhase(age, scenario) {
  if (age >= MEDICARE_AGE) return 'medicare';
  const named = scenario && SCENARIO_TO_PHASE[scenario.healthcareScenario];
  if (named) return named;
  if (age < PREFIRE_AGE_CUTOFF) return 'prefire';
  return 'aca';
}

/**
 * Compute the household healthcare cost for a single year.
 *
 * @param {{
 *   age: number,
 *   scenario: {country?: string, healthcareScenario?: string},
 *   householdSize: number,
 *   overrides?: {prefireReal?: number, postfireTo65Real?: number, post65Real?: number},
 * }} params
 * @returns {{annualCostReal: number, phase: 'prefire' | 'aca' | 'medicare'}}
 */
export function getHealthcareCost(params) {
  const { age, scenario, householdSize, overrides } = params;

  if (!(householdSize >= 1)) {
    throw new Error(
      `healthcare: householdSize must be >= 1, got ${householdSize}`,
    );
  }
  if (!Number.isFinite(age)) {
    throw new Error(`healthcare: age must be a finite number, got ${age}`);
  }

  const phase = resolvePhase(age, scenario ?? {});
  const overrideKey = PHASE_TO_OVERRIDE[phase];
  const overrideValue = overrides && typeof overrides[overrideKey] === 'number'
    ? overrides[overrideKey]
    : undefined;

  const perAdultCost = typeof overrideValue === 'number'
    ? overrideValue
    : US_DEFAULTS[phase];

  // Household scaling: first adult full cost, each additional member at a
  // discount. Guard against non-integer household sizes by rounding down.
  const additionalMembers = Math.max(0, Math.floor(householdSize) - 1);
  const annualCostReal = perAdultCost
    + additionalMembers * perAdultCost * HOUSEHOLD_DISCOUNT_FACTOR;

  if (!(annualCostReal > 0)) {
    throw new Error(
      `healthcare: annualCostReal must be > 0 but got ${annualCostReal} ` +
        `(phase=${phase}, perAdultCost=${perAdultCost})`,
    );
  }

  return Object.freeze({ annualCostReal, phase });
}
