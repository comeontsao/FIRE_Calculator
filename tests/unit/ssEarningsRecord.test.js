/*
 * tests/unit/ssEarningsRecord.test.js — locks the calc/ssEarningsRecord.js contract.
 *
 * Ref: specs/012-ssa-earnings-pre-2020/contracts/ss-earnings-record.contract.md §Test coverage
 *
 * Covers:
 *   - Phase 2 foundational: isValidRow, sortedAscendingUnique
 *   - Phase 3 US1: prependPriorYear (default / floor / empty / immutability)
 *   - Phase 4 US2: setEarliestYear (normal / noop / clamped-to-floor / empty)
 *   - Phase 5 US3: invalid target handling, invariant preservation under mixed ops
 *   - Phase 7 polish: integration cross-check against calc/socialSecurity.js (SC-002)
 *
 * Harness: Node built-in node:test runner. No third-party framework.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EARLIEST_ALLOWED_YEAR,
  isValidRow,
  sortedAscendingUnique,
  prependPriorYear,
  setEarliestYear,
} from '../../calc/ssEarningsRecord.js';
import { projectSS } from '../../calc/socialSecurity.js';
import {
  ssEarnings1995to2025,
  ssEarnings2020to2025,
} from '../fixtures/ss-earnings-1995-2025.js';

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function defaultRecord() {
  // Matches the seeded ssEarningsHistory in FIRE-Dashboard-Generic.html line 3369.
  return [
    { year: 2020, earnings: 50000, credits: 4 },
    { year: 2021, earnings: 55000, credits: 4 },
    { year: 2022, earnings: 60000, credits: 4 },
    { year: 2023, earnings: 70000, credits: 4 },
    { year: 2024, earnings: 80000, credits: 4 },
    { year: 2025, earnings: 90000, credits: 4 },
  ];
}

// ----------------------------------------------------------------------------
// T004 — RED: isValidRow
// ----------------------------------------------------------------------------

test('isValidRow: accepts a well-shaped row', () => {
  assert.equal(isValidRow({ year: 2020, earnings: 50000, credits: 4 }), true);
  assert.equal(isValidRow({ year: 1995, earnings: 0, credits: 0 }), true);
  assert.equal(isValidRow({ year: 2020, earnings: 0.5, credits: 4 }), true);
});

test('isValidRow: rejects non-integer year', () => {
  assert.equal(isValidRow({ year: 2020.5, earnings: 50000, credits: 4 }), false);
  assert.equal(isValidRow({ year: '2020', earnings: 50000, credits: 4 }), false);
  assert.equal(isValidRow({ year: NaN, earnings: 50000, credits: 4 }), false);
});

test('isValidRow: rejects negative or non-finite earnings', () => {
  assert.equal(isValidRow({ year: 2020, earnings: -1, credits: 4 }), false);
  assert.equal(isValidRow({ year: 2020, earnings: NaN, credits: 4 }), false);
  assert.equal(isValidRow({ year: 2020, earnings: Infinity, credits: 4 }), false);
  assert.equal(isValidRow({ year: 2020, earnings: -Infinity, credits: 4 }), false);
});

test('isValidRow: rejects missing fields', () => {
  assert.equal(isValidRow({ earnings: 50000, credits: 4 }), false);
  assert.equal(isValidRow({ year: 2020, credits: 4 }), false);
  assert.equal(isValidRow({ year: 2020, earnings: 50000 }), false);
  assert.equal(isValidRow({}), false);
  assert.equal(isValidRow(null), false);
  assert.equal(isValidRow(undefined), false);
  assert.equal(isValidRow(42), false);
});

test('isValidRow: rejects non-integer credits or credits outside [0,4]', () => {
  assert.equal(isValidRow({ year: 2020, earnings: 50000, credits: 2.5 }), false);
  assert.equal(isValidRow({ year: 2020, earnings: 50000, credits: -1 }), false);
  assert.equal(isValidRow({ year: 2020, earnings: 50000, credits: 5 }), false);
  assert.equal(isValidRow({ year: 2020, earnings: 50000, credits: '4' }), false);
});

// ----------------------------------------------------------------------------
// T005 — RED: sortedAscendingUnique
// ----------------------------------------------------------------------------

test('sortedAscendingUnique: sorts a shuffled history ascending by year', () => {
  const shuffled = [
    { year: 2022, earnings: 60000, credits: 4 },
    { year: 2020, earnings: 50000, credits: 4 },
    { year: 2021, earnings: 55000, credits: 4 },
  ];
  const out = sortedAscendingUnique(shuffled);
  assert.deepEqual(out.map(r => r.year), [2020, 2021, 2022]);
});

test('sortedAscendingUnique: deduplicates with last-write-wins semantics', () => {
  const withDupes = [
    { year: 2020, earnings: 50000, credits: 4 },
    { year: 2019, earnings: 40000, credits: 4 },
    { year: 2020, earnings: 99999, credits: 4 }, // should win over 50000
  ];
  const out = sortedAscendingUnique(withDupes);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map(r => r.year), [2019, 2020]);
  assert.equal(out[1].earnings, 99999, 'last-write-wins');
});

test('sortedAscendingUnique: returns a new array (input identity preserved)', () => {
  const original = [
    { year: 2020, earnings: 50000, credits: 4 },
    { year: 2019, earnings: 40000, credits: 4 },
  ];
  const originalCopy = original.map(r => ({ ...r }));
  const out = sortedAscendingUnique(original);
  assert.notEqual(out, original, 'must return a new array reference');
  assert.deepEqual(original, originalCopy, 'input array must not be mutated');
});

// ----------------------------------------------------------------------------
// T008 — RED: prependPriorYear on default record
// ----------------------------------------------------------------------------

test('prependPriorYear: default record (2020..2025) → prepends 2019 row', () => {
  const history = defaultRecord();
  const out = prependPriorYear(history);
  assert.equal(out.reason, null);
  assert.equal(out.history.length, 7);
  assert.deepEqual(out.history[0], { year: 2019, earnings: 0, credits: 4 });
  // Verify strict ascending order preserved.
  for (let i = 0; i < out.history.length - 1; i += 1) {
    assert.ok(out.history[i].year < out.history[i + 1].year,
      `strictly ascending violated at index ${i}`);
  }
});

// ----------------------------------------------------------------------------
// T009 — RED: prependPriorYear at floor
// ----------------------------------------------------------------------------

test('prependPriorYear: at floor → sameRef + reason floorReached', () => {
  const atFloor = [
    { year: EARLIEST_ALLOWED_YEAR, earnings: 0, credits: 4 },
    { year: EARLIEST_ALLOWED_YEAR + 1, earnings: 10000, credits: 4 },
  ];
  const out = prependPriorYear(atFloor);
  assert.equal(out.reason, 'floorReached');
  assert.equal(out.history, atFloor, 'must return the same array reference when no-op');
});

// ----------------------------------------------------------------------------
// T010 — RED: prependPriorYear empty record
// ----------------------------------------------------------------------------

test('prependPriorYear: empty record with currentYear 2026 → single row at 2025', () => {
  const out = prependPriorYear([], { currentYear: 2026 });
  assert.equal(out.reason, null);
  assert.equal(out.history.length, 1);
  assert.deepEqual(out.history[0], { year: 2025, earnings: 0, credits: 4 });
});

// ----------------------------------------------------------------------------
// T011 — RED: prependPriorYear immutability
// ----------------------------------------------------------------------------

test('prependPriorYear: immutability — input array unchanged on success', () => {
  const original = defaultRecord();
  const originalCopy = original.map(r => ({ ...r }));
  const out = prependPriorYear(original);
  assert.deepEqual(original, originalCopy, 'input array must not be mutated');
  assert.notEqual(out.history, original, 'successful prepend must return a new array reference');
  assert.equal(original.length, 6, 'original length unchanged');
});

// ----------------------------------------------------------------------------
// T018 — RED: setEarliestYear normal case
// ----------------------------------------------------------------------------

test('setEarliestYear: default record, target 2015 → 11 rows with 2015..2025', () => {
  const history = defaultRecord();
  const out = setEarliestYear(history, 2015);
  assert.equal(out.reason, null);
  assert.equal(out.history.length, 11);
  assert.equal(out.history[0].year, 2015);
  assert.equal(out.history[4].year, 2019);
  assert.equal(out.history[5].year, 2020);
  assert.equal(out.history[10].year, 2025);
  // New rows default to earnings:0, credits:4.
  assert.deepEqual(out.history[0], { year: 2015, earnings: 0, credits: 4 });
  assert.deepEqual(out.history[4], { year: 2019, earnings: 0, credits: 4 });
  // Original rows preserved.
  assert.equal(out.history[5].earnings, 50000);
  assert.equal(out.history[10].earnings, 90000);
});

// ----------------------------------------------------------------------------
// T019 — RED: setEarliestYear already covered
// ----------------------------------------------------------------------------

test('setEarliestYear: target >= firstYear → sameRef + reason noopAlreadyCovered', () => {
  const history = defaultRecord();
  const out = setEarliestYear(history, 2025);
  assert.equal(out.reason, 'noopAlreadyCovered');
  assert.equal(out.history, history, 'must return same reference on no-op');

  // Also test with a target strictly greater than firstYear.
  const out2 = setEarliestYear(history, 2030);
  assert.equal(out2.reason, 'noopAlreadyCovered');
  assert.equal(out2.history, history);
});

// ----------------------------------------------------------------------------
// T020 — RED: setEarliestYear clamped to floor
// ----------------------------------------------------------------------------

test('setEarliestYear: target below floor → clamped to floor, length = 66', () => {
  const history = defaultRecord();
  const out = setEarliestYear(history, 1950);
  assert.equal(out.reason, 'clampedToFloor');
  assert.equal(out.history[0].year, EARLIEST_ALLOWED_YEAR); // 1960
  // Expected length: original 6 rows + (2019 - 1960 + 1) = 6 + 60 = 66.
  assert.equal(out.history.length, 66);
  // Strict ascending and no dupes.
  for (let i = 0; i < out.history.length - 1; i += 1) {
    assert.ok(out.history[i].year < out.history[i + 1].year,
      `strict ascending violated at index ${i}: ${out.history[i].year} >= ${out.history[i+1].year}`);
  }
  // Original rows preserved at the tail.
  assert.equal(out.history[out.history.length - 1].year, 2025);
  assert.equal(out.history[out.history.length - 1].earnings, 90000);
});

// ----------------------------------------------------------------------------
// T021 — RED: setEarliestYear on empty history
// ----------------------------------------------------------------------------

test('setEarliestYear: empty history, target 1995 → single row at 1995', () => {
  const out = setEarliestYear([], 1995, { currentYear: 2026 });
  assert.equal(out.reason, null);
  assert.equal(out.history.length, 1);
  assert.deepEqual(out.history[0], { year: 1995, earnings: 0, credits: 4 });
});

// ----------------------------------------------------------------------------
// T027 — RED: setEarliestYear invalid targets
// ----------------------------------------------------------------------------

test('setEarliestYear: NaN / fractional / string / Infinity → invalidTarget, sameRef', () => {
  const history = defaultRecord();

  const outNaN = setEarliestYear(history, NaN);
  assert.equal(outNaN.reason, 'invalidTarget');
  assert.equal(outNaN.history, history);

  const outFrac = setEarliestYear(history, 2015.5);
  assert.equal(outFrac.reason, 'invalidTarget');
  assert.equal(outFrac.history, history);

  const outStr = setEarliestYear(history, 'abc');
  assert.equal(outStr.reason, 'invalidTarget');
  assert.equal(outStr.history, history);

  const outInf = setEarliestYear(history, Infinity);
  assert.equal(outInf.reason, 'invalidTarget');
  assert.equal(outInf.history, history);

  const outNegInf = setEarliestYear(history, -Infinity);
  assert.equal(outNegInf.reason, 'invalidTarget');
  assert.equal(outNegInf.history, history);

  const outNeg = setEarliestYear(history, -5);
  assert.equal(outNeg.reason, 'invalidTarget');
  assert.equal(outNeg.history, history);
});

// ----------------------------------------------------------------------------
// T028 — RED: invariant preservation under mixed operations
// ----------------------------------------------------------------------------

test('invariant preservation: prepend 3× → setEarliestYear(2005) → manual append', () => {
  // Start from default and apply successive operations, simulating user clicks.
  let history = defaultRecord();

  // Prepend three times: expect 2019, 2018, 2017 at the top.
  let result = prependPriorYear(history);
  assert.equal(result.reason, null);
  history = result.history;
  result = prependPriorYear(history);
  history = result.history;
  result = prependPriorYear(history);
  history = result.history;

  // Simulate a user-entered earnings value mid-chain (immutably — as the UI's
  // updateSSEarning handler does via direct assignment, but here we copy).
  const userEditedYear = 2018;
  const editedIdx = history.findIndex(r => r.year === userEditedYear);
  assert.ok(editedIdx >= 0, 'expected 2018 in history after 3 prepends');
  // Replace that row immutably.
  history = [
    ...history.slice(0, editedIdx),
    { ...history[editedIdx], earnings: 62000 },
    ...history.slice(editedIdx + 1),
  ];

  // Now setEarliestYear(2005). Existing 2018 earnings=62000 must be preserved.
  result = setEarliestYear(history, 2005);
  assert.equal(result.reason, null);
  history = result.history;

  // Simulate addSSYear-style append (lastYear + 1, earnings 100000).
  const lastYear = history[history.length - 1].year;
  history = [
    ...history,
    { year: lastYear + 1, earnings: 100000, credits: 4 },
  ];

  // Final assertions:
  // 1. Strictly ascending.
  for (let i = 0; i < history.length - 1; i += 1) {
    assert.ok(history[i].year < history[i + 1].year,
      `ascending violated at ${i}: ${history[i].year} >= ${history[i + 1].year}`);
  }
  // 2. No duplicates.
  const years = new Set(history.map(r => r.year));
  assert.equal(years.size, history.length, 'duplicate years detected');
  // 3. All rows valid.
  for (const row of history) {
    assert.ok(isValidRow(row), `invalid row: ${JSON.stringify(row)}`);
  }
  // 4. User's mid-chain edit preserved.
  const preservedRow = history.find(r => r.year === userEditedYear);
  assert.ok(preservedRow, '2018 row must survive setEarliestYear + append');
  assert.equal(preservedRow.earnings, 62000, 'mid-chain earnings edit must be preserved');
  // 5. Appended year present.
  const appendedRow = history.find(r => r.year === lastYear + 1);
  assert.ok(appendedRow, 'appended row must survive');
  assert.equal(appendedRow.earnings, 100000);
});

// ----------------------------------------------------------------------------
// T029 — RED: behaviour on malformed input
// ----------------------------------------------------------------------------

test('isValidRow: rejects a row with NaN earnings', () => {
  assert.equal(isValidRow({ year: 2020, earnings: NaN, credits: 4 }), false);
});

test('sortedAscendingUnique: passes malformed rows through without throwing', () => {
  // Documented behaviour: sortedAscendingUnique does NOT validate row shape.
  // Malformed rows are passed through (useful for defensive test scenarios
  // where we want to detect that bad data is arriving upstream).
  // The utility places rows with non-numeric years at the end (NaN - x === NaN
  // which never satisfies < 0 in the comparator).
  const mixed = [
    { year: 2020, earnings: 50000, credits: 4 },
    { year: 2019, earnings: NaN, credits: 4 }, // malformed (NaN earnings)
  ];
  const out = sortedAscendingUnique(mixed);
  // Both rows pass through; they remain sorted by year.
  assert.equal(out.length, 2);
  assert.equal(out[0].year, 2019);
  assert.equal(out[1].year, 2020);
  // The malformed row is still malformed in the output (not silently repaired).
  assert.equal(Number.isNaN(out[0].earnings), true);
});

// ----------------------------------------------------------------------------
// T036 — Polish: integration cross-check against calc/socialSecurity.js (SC-002)
// ----------------------------------------------------------------------------

test('integration: projectSS benefit strictly higher with full 1995-2025 vs truncated 2020-2025', () => {
  const inflationRate = 0.03;

  const fullResult = projectSS({
    currentAge: 45,
    ssStartAge: 67,
    earnings: ssEarnings1995to2025,
    inflationRate,
  });

  const truncatedResult = projectSS({
    currentAge: 45,
    ssStartAge: 67,
    earnings: ssEarnings2020to2025,
    inflationRate,
  });

  assert.ok(
    fullResult.annualBenefitReal > truncatedResult.annualBenefitReal,
    `SC-002 direction: full history benefit must exceed truncated. ` +
    `full=${fullResult.annualBenefitReal}, truncated=${truncatedResult.annualBenefitReal}`,
  );
  // Both benefits must be finite and positive (no NaN cascade, no zero).
  assert.ok(Number.isFinite(fullResult.annualBenefitReal));
  assert.ok(fullResult.annualBenefitReal > 0);
  assert.ok(Number.isFinite(truncatedResult.annualBenefitReal));
  assert.ok(truncatedResult.annualBenefitReal > 0);
});
