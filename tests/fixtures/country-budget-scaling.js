/*
 * tests/fixtures/country-budget-scaling.js — feature 010 T006.
 *
 * Gold-standard fixture constants for feature 010 — Country Budget Scaling.
 * Locked against specs/010-country-budget-scaling/contracts/scaling-formula.contract.md,
 * child-allowance.contract.md, and persistence.contract.md.
 *
 * Confirmed 12 scenarios from FIRE-Dashboard-Generic.html lines 3739–3802.
 * (No 13th scenario was found; the list ends at china.)
 *
 * These fixtures drive:
 *   - tests/unit/adultsOnlyFactor.test.js    (T007)
 *   - tests/unit/perChildAllowance.test.js   (T009)
 *   - tests/unit/scenarioOverride.test.js    (T012)
 */

/**
 * Frozen snapshot of the 12 country scenarios' hardcoded baseline spend values
 * as of feature 010 branch start. Locked from FIRE-Dashboard-Generic.html
 * lines 3739–3802.
 *
 * Fields per scenario:
 *   id              — matches scenarios[].id in the HTML
 *   annualSpend     — lean/baseline annual spend (USD)
 *   normalSpend     — normal tier annual spend (USD)
 *   comfortableSpend — comfortable tier annual spend (USD)
 *
 * @type {ReadonlyArray<{id:string, annualSpend:number, normalSpend:number, comfortableSpend:number}>}
 */
export const SCENARIOS_SNAPSHOT = Object.freeze([
  { id: 'us',          annualSpend:  78000, normalSpend:  78000, comfortableSpend: 120000 },
  { id: 'taiwan',      annualSpend:  36000, normalSpend:  36000, comfortableSpend:  60000 },
  { id: 'japan',       annualSpend:  42000, normalSpend:  42000, comfortableSpend:  72000 },
  { id: 'thailand',    annualSpend:  24000, normalSpend:  24000, comfortableSpend:  45600 },
  { id: 'malaysia',    annualSpend:  22000, normalSpend:  22000, comfortableSpend:  42000 },
  { id: 'singapore',   annualSpend:  56000, normalSpend:  56000, comfortableSpend: 102000 },
  { id: 'vietnam',     annualSpend:  18000, normalSpend:  18000, comfortableSpend:  36000 },
  { id: 'philippines', annualSpend:  20000, normalSpend:  20000, comfortableSpend:  38400 },
  { id: 'mexico',      annualSpend:  26000, normalSpend:  26000, comfortableSpend:  48000 },
  { id: 'costarica',   annualSpend:  30000, normalSpend:  30000, comfortableSpend:  54000 },
  { id: 'portugal',    annualSpend:  35000, normalSpend:  35000, comfortableSpend:  62400 },
  { id: 'china',       annualSpend:  33000, normalSpend:  33000, comfortableSpend:  66000 },
]);

/**
 * Two children: ages 8 and 5 as of 2026.
 * Birth dates: 2018-01-01 (age 8 in 2026) and 2021-01-01 (age 5 in 2026).
 * Both have us-private college plan (default collegeStart = birthYear + 18).
 *
 * @type {ReadonlyArray<{date:string, college:string}>}
 */
export const CHILDREN_FIXTURE_A = Object.freeze([
  { date: '2018-01-01', college: 'us-private' },
  { date: '2021-01-01', college: 'us-private' },
]);

/**
 * One child: age 13 as of 2026.
 * Birth date: 2013-01-01 (age 13 in 2026).
 * us-private college plan (default collegeStart = 2031 = 2013 + 18).
 *
 * @type {ReadonlyArray<{date:string, college:string}>}
 */
export const CHILDREN_FIXTURE_B = Object.freeze([
  { date: '2013-01-01', college: 'us-private' },
]);

/**
 * No children.
 *
 * @type {ReadonlyArray<never>}
 */
export const CHILDREN_FIXTURE_EMPTY = Object.freeze([]);

/**
 * Projection years used in integration fixtures.
 *
 * @type {ReadonlyArray<number>}
 */
export const PROJECTION_YEARS = Object.freeze([2026, 2030, 2040, 2050]);

/**
 * Default FIRE year for per-child allowance fixtures.
 * Matches the fireYear used in all child-allowance contract fixtures.
 */
export const FIRE_YEAR_DEFAULT = 2030;

/*
 * Default export — meta-wrapper satisfying tests/meta/fixture-shapes.test.js
 * FixtureCase shape contract { name, kind, inputs, expected }.
 *
 * Individual test files import the named exports above directly.
 */

/** @type {{ name: string, kind: string, inputs: object, expected: object }} */
const fixture = Object.freeze({
  name: 'country-budget-scaling — fixture constants for feature 010',
  kind: 'unit',
  notes:
    'Gold-standard fixture data for country-budget scaling helpers. '
    + 'Locked against scaling-formula.contract.md, child-allowance.contract.md, '
    + 'and persistence.contract.md. 12 scenarios confirmed from HTML lines 3739–3802.',
  inputs: Object.freeze({
    SCENARIOS_SNAPSHOT,
    CHILDREN_FIXTURE_A,
    CHILDREN_FIXTURE_B,
    CHILDREN_FIXTURE_EMPTY,
    PROJECTION_YEARS,
    FIRE_YEAR_DEFAULT,
  }),
  expected: Object.freeze({
    scenarioCount: 12,
    childrenFixtureACount: 2,
    childrenFixtureBCount: 1,
    childrenFixtureEmptyCount: 0,
    projectionYearCount: 4,
  }),
});

export default fixture;
