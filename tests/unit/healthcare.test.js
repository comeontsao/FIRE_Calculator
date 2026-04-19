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
