/*
 * tests/unit/college.test.js — locks the calc/college.js contract (T036).
 *
 * Covers the three fixture classes from
 *   specs/001-modular-calc-engine/contracts/college.contract.md §Fixtures:
 *     1. Two kids 5 years apart (Janet/Ian-like) — non-overlapping windows.
 *     2. Two kids 2 years apart — overlapping window with summed cost.
 *     3. No kids — empty schedule.
 *
 * RED phase: calc/college.js does not yet exist. The import below will
 * fail with ERR_MODULE_NOT_FOUND — expected until T044.
 *
 * Contract invariants (college.contract.md §Invariants):
 *   - Default `startAge = 18` when not provided.
 *   - 4-year window: costs apply to [startAge, startAge+3] inclusive.
 *   - Overlapping windows sum correctly in `costReal`.
 *   - Empty kids → empty perYear.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCollegeCosts } from '../../calc/college.js';

const currentYear = 2026;
const ANNUAL_COST = 40_000; // 4-year total = $160k
const FOUR_YEAR_TOTAL = ANNUAL_COST * 4;

test('college: two kids 5 years apart produce non-overlapping 4-year windows', () => {
  // Kid A age 10 today → college starts in 8 years at age 18 (2034).
  // Kid B age 5 today → college starts in 13 years at age 18 (2039).
  // Gap is 5 years ⇒ Kid A graduates (age 21, year 2037) before Kid B starts.
  const result = computeCollegeCosts({
    kids: [
      { name: 'Janet', currentAge: 10, fourYearCostReal: FOUR_YEAR_TOTAL },
      { name: 'Ian', currentAge: 5, fourYearCostReal: FOUR_YEAR_TOTAL },
    ],
    currentYear,
  });

  assert.equal(typeof result, 'object');
  assert.ok(Array.isArray(result.perYear));
  // 4 years of Janet + 4 years of Ian, no overlap ⇒ 8 distinct entries.
  assert.equal(result.perYear.length, 8, 'two 4-year windows, no overlap ⇒ 8 records');

  // Every record should carry a single kid name (non-overlap).
  for (const rec of result.perYear) {
    assert.ok(Array.isArray(rec.kidNames), 'kidNames is an array');
    assert.equal(rec.kidNames.length, 1, `non-overlap ⇒ exactly one kid per year, got ${JSON.stringify(rec.kidNames)}`);
    assert.ok(
      Math.abs(rec.costReal - ANNUAL_COST) < 1e-6,
      `each non-overlap year should cost ANNUAL_COST, got ${rec.costReal}`,
    );
  }
});

test('college: two kids 2 years apart produce overlapping window with summed cost', () => {
  // Kid A age 16 → college age 18 (2 years out).
  // Kid B age 14 → college age 18 (4 years out).
  // Both attend 2030 and 2031 simultaneously (ages A=20,21 / B=18,19) ⇒ 2 overlap years.
  const result = computeCollegeCosts({
    kids: [
      { name: 'Alpha', currentAge: 16, fourYearCostReal: FOUR_YEAR_TOTAL },
      { name: 'Beta', currentAge: 14, fourYearCostReal: FOUR_YEAR_TOTAL },
    ],
    currentYear,
  });

  // 4 + 4 = 8 kid-years across (4 - 2) = 6 distinct calendar years
  // with 2 overlap years contributing double cost.
  assert.equal(result.perYear.length, 6, 'two 4-year windows, 2-year overlap ⇒ 6 distinct records');

  // Find records with two kidNames — those are the overlap years and must cost 2× ANNUAL.
  const overlapRecs = result.perYear.filter((r) => r.kidNames.length === 2);
  assert.equal(overlapRecs.length, 2, 'expect exactly 2 overlap years');
  for (const rec of overlapRecs) {
    assert.ok(
      Math.abs(rec.costReal - 2 * ANNUAL_COST) < 1e-6,
      `overlap year cost must be doubled, got ${rec.costReal}`,
    );
  }

  // Non-overlap years cost exactly ANNUAL_COST.
  const soloRecs = result.perYear.filter((r) => r.kidNames.length === 1);
  assert.equal(soloRecs.length, 4, 'expect 4 non-overlap years');
  for (const rec of soloRecs) {
    assert.ok(Math.abs(rec.costReal - ANNUAL_COST) < 1e-6);
  }
});

test('college: empty kids array produces empty perYear', () => {
  const result = computeCollegeCosts({ kids: [], currentYear });
  assert.ok(Array.isArray(result.perYear));
  assert.equal(result.perYear.length, 0, 'no kids ⇒ no cost records');
});
