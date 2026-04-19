/*
 * tests/unit/socialSecurity.test.js — locks the calc/socialSecurity.js contract (T033).
 *
 * Covers the four fixture classes from
 *   specs/001-modular-calc-engine/contracts/socialSecurity.contract.md §Fixtures:
 *     1. Generic single-earner at age 45, claiming at 67 (FRA).
 *     2. Actual-earnings mode with a 35-year synthetic earnings history.
 *     3. Claim at 62 — early-claim reduction relative to FRA.
 *     4. Claim at 70 — delayed-retirement credit relative to FRA.
 *
 * RED phase: calc/socialSecurity.js does not yet exist. The import below
 * will fail with ERR_MODULE_NOT_FOUND — that is the expected state until T041.
 *
 * Contract invariants (socialSecurity.contract.md §Invariants):
 *   - Generic mode matches current SSA claim-age adjustments (62 reduction,
 *     70 delayed credit).
 *   - Actual-earnings mode computes 35-year-indexed earnings + 2026 bend points
 *     and returns `indexedEarnings` alongside the benefit.
 *   - `annualBenefitReal` is a real-dollar number (never nominal).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { projectSS } from '../../calc/socialSecurity.js';

const inflationRate = 0.03;

test('socialSecurity: generic curve at FRA (age 67) locks a positive real benefit', () => {
  const result = projectSS({
    currentAge: 45,
    ssStartAge: 67,
    earnings: null, // generic mode
    inflationRate,
  });

  assert.equal(typeof result, 'object', 'returns an object');
  assert.equal(result.ssAgeStart, 67, 'ssAgeStart echoes the claim age');
  assert.equal(typeof result.annualBenefitReal, 'number');
  assert.ok(
    result.annualBenefitReal > 0,
    `FRA generic benefit must be positive, got ${result.annualBenefitReal}`,
  );
  // Generic mode must NOT expose indexedEarnings (that field is actual-earnings only).
  assert.ok(
    result.indexedEarnings === undefined || result.indexedEarnings === null,
    'generic mode ⇒ no indexedEarnings field',
  );
});

test('socialSecurity: actual-earnings mode returns indexedEarnings alongside benefit', () => {
  // Synthetic 35-year nominal earnings — ascending pattern to exercise indexation.
  const annualEarningsNominal = Array.from({ length: 35 }, (_, i) => 30_000 + 1_500 * i);
  const latestEarningsYear = 2025;

  const result = projectSS({
    currentAge: 45,
    ssStartAge: 67,
    earnings: {
      annualEarningsNominal,
      latestEarningsYear,
    },
    inflationRate,
  });

  assert.equal(result.ssAgeStart, 67);
  assert.equal(typeof result.annualBenefitReal, 'number');
  assert.ok(result.annualBenefitReal > 0, 'actual-earnings benefit must be positive');
  assert.equal(
    typeof result.indexedEarnings,
    'number',
    'actual-earnings mode MUST expose indexedEarnings',
  );
  assert.ok(
    result.indexedEarnings > 0,
    `indexedEarnings must be positive, got ${result.indexedEarnings}`,
  );
});

test('socialSecurity: claiming at 62 produces a lower benefit than claiming at FRA', () => {
  const fra = projectSS({
    currentAge: 45,
    ssStartAge: 67,
    earnings: null,
    inflationRate,
  });
  const early = projectSS({
    currentAge: 45,
    ssStartAge: 62,
    earnings: null,
    inflationRate,
  });

  assert.equal(early.ssAgeStart, 62);
  assert.ok(
    early.annualBenefitReal < fra.annualBenefitReal,
    `claim at 62 must be lower than FRA benefit (got early=${early.annualBenefitReal}, fra=${fra.annualBenefitReal})`,
  );
  // SSA early-claim reduction is ~25-30% at age 62. Accept a broad sanity band.
  const ratio = early.annualBenefitReal / fra.annualBenefitReal;
  assert.ok(
    ratio >= 0.65 && ratio <= 0.85,
    `claim-at-62 / FRA ratio out of SSA-expected band [0.65, 0.85]: got ${ratio}`,
  );
});

test('socialSecurity: claiming at 70 produces a higher benefit than claiming at FRA', () => {
  const fra = projectSS({
    currentAge: 45,
    ssStartAge: 67,
    earnings: null,
    inflationRate,
  });
  const late = projectSS({
    currentAge: 45,
    ssStartAge: 70,
    earnings: null,
    inflationRate,
  });

  assert.equal(late.ssAgeStart, 70);
  assert.ok(
    late.annualBenefitReal > fra.annualBenefitReal,
    `claim at 70 must exceed FRA benefit (got late=${late.annualBenefitReal}, fra=${fra.annualBenefitReal})`,
  );
  // Delayed-retirement credit is ~8%/yr × 3y = ~24% between FRA and 70.
  const ratio = late.annualBenefitReal / fra.annualBenefitReal;
  assert.ok(
    ratio >= 1.15 && ratio <= 1.35,
    `claim-at-70 / FRA ratio out of SSA-expected band [1.15, 1.35]: got ${ratio}`,
  );
});
