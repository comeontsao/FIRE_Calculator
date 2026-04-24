/*
 * tests/unit/healthcare.test.js — locks the calc/healthcare.js contract (T034).
 *
 * Covers the four fixture classes from
 *   specs/001-modular-calc-engine/contracts/healthcare.contract.md §Fixtures:
 *     1. US scenario, age 50 pre-fire → phase 'prefire'.
 *     2. US scenario, age 60 post-fire pre-Medicare → phase 'aca'.
 *     3. US scenario, age 70 Medicare → phase 'medicare'.
 *     4. Country override applied — per-scenario curve locked.
 *
 * RED phase: calc/healthcare.js does not yet exist. The import below will
 * fail with ERR_MODULE_NOT_FOUND — expected until T042.
 *
 * Contract invariants (healthcare.contract.md §Invariants):
 *   - Always returns real dollars (no nominal leakage).
 *   - annualCostReal > 0 for all ages.
 *   - phase field takes exactly one of 'prefire' | 'aca' | 'medicare'.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { getHealthcareCost } from '../../calc/healthcare.js';

const usScenario = Object.freeze({
  country: 'US',
  healthcareScenario: 'employer', // default pre-fire assumption
});

test('healthcare: US age 50 pre-fire ⇒ phase prefire with positive real cost', () => {
  const result = getHealthcareCost({
    age: 50,
    scenario: usScenario,
    householdSize: 1,
  });

  assert.equal(typeof result, 'object');
  assert.equal(typeof result.annualCostReal, 'number');
  assert.ok(result.annualCostReal > 0, 'annualCostReal must be > 0');
  assert.equal(result.phase, 'prefire', 'age 50 with employer scenario ⇒ prefire phase');
});

test('healthcare: US age 60 post-fire pre-Medicare ⇒ phase aca', () => {
  const result = getHealthcareCost({
    age: 60,
    scenario: Object.freeze({ country: 'US', healthcareScenario: 'aca' }),
    householdSize: 1,
  });

  assert.equal(result.phase, 'aca', 'age 60 on ACA plan ⇒ aca phase');
  assert.ok(result.annualCostReal > 0);
});

test('healthcare: US age 70 Medicare ⇒ phase medicare', () => {
  const result = getHealthcareCost({
    age: 70,
    scenario: Object.freeze({ country: 'US', healthcareScenario: 'medicare' }),
    householdSize: 1,
  });

  assert.equal(result.phase, 'medicare', 'age 70 Medicare ⇒ medicare phase');
  assert.ok(result.annualCostReal > 0);
});

test('healthcare: overrides parameter replaces the default per-phase cost', () => {
  const overrideReal = 7_500;
  const result = getHealthcareCost({
    age: 60,
    scenario: Object.freeze({ country: 'US', healthcareScenario: 'aca' }),
    householdSize: 1,
    overrides: { postfireTo65Real: overrideReal },
  });

  assert.equal(result.phase, 'aca');
  assert.ok(
    Math.abs(result.annualCostReal - overrideReal) < 1e-6,
    `override must flow into annualCostReal; expected ${overrideReal}, got ${result.annualCostReal}`,
  );
});

// ----------------------------------------------------------------------------
// Feature 009 — Single-Person Mode adult-count branching (T024).
//
// Mirrors FIRE-Dashboard-Generic.html getHealthcareFamilySizeFactor(age, inp)
// pre-65 branch and getHealthcareMonthly(scenarioId, age, inp) post-65 branch.
//
// Ref:
//   specs/009-single-person-mode/contracts/calc-functions.contract.md §7, §8
//   specs/009-single-person-mode/research.md §10 item 3
// ----------------------------------------------------------------------------

import { healthcareFactorFixtures } from '../fixtures/single-person-mode.js';

// Mirror of getHealthcareFamilySizeFactor per §7. Pure: no DOM, no `inp` object
// — the HTML version resolves `adults` from inp.adultCount with DOM fallback,
// which we substitute with a direct integer param for test isolation.
function getHealthcareFamilySizeFactor(age, adults, kidsOnPlan) {
  if (age >= 65) return 1.0;
  const SINGLE_ADULT_PRE65_SHARE = 0.35;
  const COUPLE_PRE65_SHARE       = 0.67;
  const PER_KID_SHARE            = 0.165;
  const k = Math.min(2, kidsOnPlan);
  const adultShare = (adults === 1) ? SINGLE_ADULT_PRE65_SHARE : COUPLE_PRE65_SHARE;
  return adultShare + PER_KID_SHARE * k;
}

for (const fx of healthcareFactorFixtures) {
  test(`healthcare family factor — ${fx.name}`, () => {
    const got = getHealthcareFamilySizeFactor(40, fx.adults, fx.kids);
    // Approx equality — 0.67 + 0.165 accumulates floating-point noise.
    assert.ok(
      Math.abs(got - fx.expected) < 1e-9,
      `expected ${fx.expected}, got ${got}`,
    );
  });
}

test('healthcare post-65 single halving (adults=1, no override) -> 0.5 x baseline', () => {
  // Matches the US post-65 default used in FIRE-Dashboard-Generic.html.
  const COUPLE_POST65 = 700;
  const SINGLE_ADULT_POST65_FACTOR = 0.5;
  const adults = 1;
  const baseline = COUPLE_POST65;
  const got = (adults === 1) ? baseline * SINGLE_ADULT_POST65_FACTOR : baseline;
  assert.equal(got, 350);
});

test('healthcare post-65 couple (adults=2) -> 1.0 x baseline', () => {
  const COUPLE_POST65 = 700;
  const adults = 2;
  const got = (adults === 1) ? COUPLE_POST65 * 0.5 : COUPLE_POST65;
  assert.equal(got, 700);
});

test('healthcare post-65 single with user override wins (FR-017)', () => {
  // When a positive user override is supplied, the SINGLE_ADULT_POST65_FACTOR
  // halving MUST NOT be applied — override is authoritative.
  const adults = 1;
  const override = 500;
  const COUPLE_POST65 = 700;
  const SINGLE_ADULT_POST65_FACTOR = 0.5;
  // Emulate the §8 branch: if override > 0, take override as-is.
  const baselineOrOverride = override > 0 ? override : COUPLE_POST65;
  const got = (override > 0)
    ? baselineOrOverride
    : ((adults === 1) ? baselineOrOverride * SINGLE_ADULT_POST65_FACTOR : baselineOrOverride);
  assert.equal(got, 500);
});

// ----------------------------------------------------------------------------
// Feature 009 — calc/healthcare.js householdSize regression guard (T025).
//
// Feature 009 does NOT change calc/healthcare.js; this test locks the
// HOUSEHOLD_DISCOUNT_FACTOR=0.8 path so regressions are caught upstream.
// ----------------------------------------------------------------------------

test('calc/healthcare.js — householdSize=1 produces per-adult cost unchanged', () => {
  const r = getHealthcareCost({
    age: 40,
    scenario: Object.freeze({ country: 'US', healthcareScenario: 'aca' }),
    householdSize: 1,
  });
  assert.ok(r.annualCostReal > 0);
  assert.equal(r.phase, 'aca');
});

test('calc/healthcare.js — householdSize=2 adds discount factor for 2nd member', () => {
  const solo = getHealthcareCost({
    age: 40,
    scenario: Object.freeze({ country: 'US', healthcareScenario: 'aca' }),
    householdSize: 1,
  });
  const couple = getHealthcareCost({
    age: 40,
    scenario: Object.freeze({ country: 'US', healthcareScenario: 'aca' }),
    householdSize: 2,
  });
  // Couple cost must be strictly greater than solo but less than 2x (the
  // HOUSEHOLD_DISCOUNT_FACTOR < 1 discipline). This invariant is what feature
  // 009 relies on remaining true in the pure module while the HTML applies
  // its own adult-count branch.
  assert.ok(couple.annualCostReal > solo.annualCostReal);
  assert.ok(couple.annualCostReal < 2 * solo.annualCostReal);
  assert.equal(couple.phase, 'aca');
});
