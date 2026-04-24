/*
 * tests/unit/perChildAllowance.test.js — feature 010 T009.
 *
 * Locks calcPerChildAllowance and allowanceForAge per:
 *   specs/010-country-budget-scaling/contracts/child-allowance.contract.md
 *
 * Both helpers are mirrored inline (standalone — no HTML import).
 * Uses FIRE_YEAR_DEFAULT = 2030 throughout, matching the contract's notation.
 *
 * RED state is expected until Backend's T008 lands; these tests pass
 * immediately because the kernel is mirrored inline.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { FIRE_YEAR_DEFAULT } from '../fixtures/country-budget-scaling.js';

// ---------------------------------------------------------------------------
// Inline mirror of allowanceForAge per child-allowance.contract.md
// Schedule:
//   age <= 12  → 2000
//   age == 13  → 2500
//   age == 14  → 3000
//   age == 15  → 4000
//   age == 16  → 5000
//   age >= 17  → 6000  (cap)
// ---------------------------------------------------------------------------
function allowanceForAge(age) {
  if (age <= 12) return 2000;
  if (age === 13) return 2500;
  if (age === 14) return 3000;
  if (age === 15) return 4000;
  if (age === 16) return 5000;
  return 6000; // age >= 17 cap
}

// ---------------------------------------------------------------------------
// Inline mirror of calcPerChildAllowance per child-allowance.contract.md
// Algorithm:
//   1. projectionYear < fireYear → return 0
//   2. for each child:
//        childBirthYear = parseInt(child.date)
//        childAge       = projectionYear - childBirthYear
//        if childAge < 0: continue  (unborn guard)
//        collegeStart   = child.collegeStartYear ?? (childBirthYear + 18)
//        if projectionYear >= collegeStart: continue  (college-takeover)
//        total += allowanceForAge(childAge)
//   3. return total
// ---------------------------------------------------------------------------
function calcPerChildAllowance(childrenList, projectionYear, fireYear) {
  if (projectionYear < fireYear) return 0;
  let total = 0;
  for (const child of childrenList) {
    const childBirthYear = parseInt(child.date.slice(0, 4), 10);
    const childAge = projectionYear - childBirthYear;
    if (childAge < 0) continue; // unborn child guard
    const collegeStart = child.collegeStartYear ?? (childBirthYear + 18);
    if (projectionYear >= collegeStart) continue; // college-takeover
    total += allowanceForAge(childAge);
  }
  return total;
}

const FIRE_YEAR = FIRE_YEAR_DEFAULT; // 2030

// ---------------------------------------------------------------------------
// Fixture 1 — pre-FIRE zero-out
// calcPerChildAllowance([{date:'2020-01-01',college:'us-private'}], 2025, 2030) → 0
// ---------------------------------------------------------------------------
test('calcPerChildAllowance — pre-FIRE year (2025 < 2030) returns 0', () => {
  const child = { date: '2020-01-01', college: 'us-private' };
  assert.equal(calcPerChildAllowance([child], 2025, FIRE_YEAR), 0);
});

// ---------------------------------------------------------------------------
// Fixture 2 — age 0–12 flat → 2000
// Child born 2020-01-01 is age 10 in 2030, age 11 in 2031, age 12 in 2032
// ---------------------------------------------------------------------------
test('calcPerChildAllowance — age 10 (born 2020, year 2030) returns 2000', () => {
  const child = { date: '2020-01-01', college: 'us-private' };
  assert.equal(calcPerChildAllowance([child], 2030, FIRE_YEAR), 2000);
});

test('calcPerChildAllowance — age 11 (born 2020, year 2031) returns 2000', () => {
  const child = { date: '2020-01-01', college: 'us-private' };
  assert.equal(calcPerChildAllowance([child], 2031, FIRE_YEAR), 2000);
});

test('calcPerChildAllowance — age 12 (born 2020, year 2032) returns 2000', () => {
  const child = { date: '2020-01-01', college: 'us-private' };
  assert.equal(calcPerChildAllowance([child], 2032, FIRE_YEAR), 2000);
});

// ---------------------------------------------------------------------------
// Fixture 3 — age 13 → 2500
// Child born 2020-01-01 is age 13 in 2033
// ---------------------------------------------------------------------------
test('calcPerChildAllowance — age 13 (born 2020, year 2033) returns 2500', () => {
  const child = { date: '2020-01-01', college: 'us-private' };
  assert.equal(calcPerChildAllowance([child], 2033, FIRE_YEAR), 2500);
});

// ---------------------------------------------------------------------------
// Fixture 4 — ages 14, 15, 16, 17 → 3000, 4000, 5000, 6000
// Child born 2020-01-01; college starts 2038 (2020+18)
// ---------------------------------------------------------------------------
test('calcPerChildAllowance — age 14 (born 2020, year 2034) returns 3000', () => {
  const child = { date: '2020-01-01', college: 'us-private' };
  assert.equal(calcPerChildAllowance([child], 2034, FIRE_YEAR), 3000);
});

test('calcPerChildAllowance — age 15 (born 2020, year 2035) returns 4000', () => {
  const child = { date: '2020-01-01', college: 'us-private' };
  assert.equal(calcPerChildAllowance([child], 2035, FIRE_YEAR), 4000);
});

test('calcPerChildAllowance — age 16 (born 2020, year 2036) returns 5000', () => {
  const child = { date: '2020-01-01', college: 'us-private' };
  assert.equal(calcPerChildAllowance([child], 2036, FIRE_YEAR), 5000);
});

test('calcPerChildAllowance — age 17 (born 2020, year 2037) returns 6000', () => {
  const child = { date: '2020-01-01', college: 'us-private' };
  assert.equal(calcPerChildAllowance([child], 2037, FIRE_YEAR), 6000);
});

// ---------------------------------------------------------------------------
// Fixture 5 — cap: delayed college at age 18 still returns 6000
// Child born 2020-01-01, collegeStartYear=2040 (delayed to age 20)
// At year 2038: age 18, college not yet started → 6000 (cap, not college-takeover)
// ---------------------------------------------------------------------------
test('calcPerChildAllowance — age 18 with delayed collegeStart=2040 returns 6000 (cap)', () => {
  const child = { date: '2020-01-01', college: 'us-private', collegeStartYear: 2040 };
  assert.equal(calcPerChildAllowance([child], 2038, FIRE_YEAR), 6000);
});

// ---------------------------------------------------------------------------
// Fixture 6 — college-takeover: default collegeStart = 2020+18 = 2038
// At year 2038: age 18 >= collegeStart=2038 → 0
// ---------------------------------------------------------------------------
test('calcPerChildAllowance — age 18 with default collegeStart=2038 (year 2038) returns 0 (college-takeover)', () => {
  const child = { date: '2020-01-01', college: 'us-private' };
  assert.equal(calcPerChildAllowance([child], 2038, FIRE_YEAR), 0);
});

// ---------------------------------------------------------------------------
// Fixture 7 — multi-child summation: age 10 + age 14 = 2000 + 3000 = 5000
// Child A born 2020-01-01 (age 10 in 2030), Child B born 2016-01-01 (age 14 in 2030)
// Both college starts: 2038 and 2034 — neither started in 2030
// ---------------------------------------------------------------------------
test('calcPerChildAllowance — two children age 10 + age 14 in 2030 returns 5000', () => {
  const childA = { date: '2020-01-01', college: 'us-private' }; // age 10
  const childB = { date: '2016-01-01', college: 'us-private' }; // age 14
  assert.equal(calcPerChildAllowance([childA, childB], 2030, FIRE_YEAR), 5000);
});

// ---------------------------------------------------------------------------
// Fixture 8 — unborn child: child born 2032, projected year 2030
// childAge = 2030 - 2032 = -2 < 0 → guard skips → 0
// ---------------------------------------------------------------------------
test('calcPerChildAllowance — unborn child (born 2032, year 2030) returns 0', () => {
  const child = { date: '2032-01-01', college: 'us-private' };
  assert.equal(calcPerChildAllowance([child], 2030, FIRE_YEAR), 0);
});

// ---------------------------------------------------------------------------
// Fixture 9 — mixed pre-college + in-college
// Child A born 2020-01-01 (age 10 in 2030, pre-college) → 2000
// Child B born 2009-01-01 (collegeStart=2027, year 2030 >= 2027) → 0
// Total: 2000
// ---------------------------------------------------------------------------
test('calcPerChildAllowance — one pre-college (age 10) + one in-college returns 2000', () => {
  const childA = { date: '2020-01-01', college: 'us-private' }; // age 10, college 2038
  const childB = { date: '2009-01-01', college: 'us-private' }; // age 21, college 2027
  assert.equal(calcPerChildAllowance([childA, childB], 2030, FIRE_YEAR), 2000);
});

// ---------------------------------------------------------------------------
// Fixture 10 — empty list
// ---------------------------------------------------------------------------
test('calcPerChildAllowance — empty childrenList returns 0', () => {
  assert.equal(calcPerChildAllowance([], 2040, FIRE_YEAR), 0);
});

// ---------------------------------------------------------------------------
// Fixture 11 — T024 full-trajectory year-by-year lock.
// Child born 2020-01-01, fireYear=2030, default collegeStart=2038.
// Expected trajectory per year:
//   2025–2029 (pre-FIRE)  → 0
//   2030 (age 10)         → 2000
//   2031 (age 11)         → 2000
//   2032 (age 12)         → 2000
//   2033 (age 13)         → 2500
//   2034 (age 14)         → 3000
//   2035 (age 15)         → 4000
//   2036 (age 16)         → 5000
//   2037 (age 17)         → 6000
//   2038–2045 (college)   → 0 (college-takeover at collegeStart=2038)
// ---------------------------------------------------------------------------
test('calcPerChildAllowance — full trajectory 2025–2045 for child born 2020 at fireYear=2030', () => {
  const child = { date: '2020-01-01', college: 'us-private' };
  const fy = 2030;
  const expected = {
    2025: 0, 2026: 0, 2027: 0, 2028: 0, 2029: 0,
    2030: 2000, 2031: 2000, 2032: 2000,
    2033: 2500, 2034: 3000, 2035: 4000, 2036: 5000, 2037: 6000,
    2038: 0, 2039: 0, 2040: 0, 2041: 0, 2042: 0, 2043: 0, 2044: 0, 2045: 0,
  };
  for (let year = 2025; year <= 2045; year++) {
    assert.equal(
      calcPerChildAllowance([child], year, fy),
      expected[year],
      `trajectory mismatch at year=${year}`
    );
  }
});
