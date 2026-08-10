/*
 * tests/unit/snapshotCsv.test.js — feature 032 T040, T041.
 *
 * Locks the RR (FIRE-Dashboard.html) snapshotsToCSV / csvToSnapshots
 * round-trip semantics after feature 032 appends two Roth IRA columns to
 * CSV_HEADERS. The functions live inline in FIRE-Dashboard.html; they are
 * pure CSV munging (no DOM), mirrored here verbatim so the contract can
 * be unit-tested in Node.
 *
 * Invariants pinned:
 *   - Header always 23 columns: 19 legacy + 2 Roth IRA (feature 032) + 2
 *     Traditional-401K funding-source columns.
 *   - Round-trip: rogerRothIra + rebeccaRothIra survive save->parse.
 *   - Round-trip: roger401kSelf + roger401kMatch survive save->parse, and the
 *     combined '401K' column (cols[3]) stays the Trad+Roth TOTAL it always was
 *     — the split columns describe the Traditional half only.
 *   - Legacy short-row tolerance: pre-032 19-column rows AND pre-split
 *     21-column rows parse cleanly with the missing fields defaulting to 0
 *     (via parseFloat(cols[N]) || 0 where cols[N] is undefined -> NaN -> 0).
 *     The loader MUST NOT throw or skip the row.
 *
 * Spec refs:
 *   - specs/032-roth-ira-accounts/spec.md US5, FR-013/014/015/023/023a/023b
 *   - specs/032-roth-ira-accounts/data-model.md §8 (CSV snapshot schema)
 *   - specs/032-roth-ira-accounts/tasks.md T040, T041
 *   - CLAUDE.md DB Engineer constitution (append-only)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// Mirror of FIRE-Dashboard.html CSV_HEADERS.
// RR variant: 19 legacy + 2 Roth IRA (feature 032) + 2 Trad-401K split = 23.
const CSV_HEADERS = [
  'Date', 'Net Worth', 'Accessible', '401K', 'Roger Stocks', 'Rebecca Stocks',
  'Cash', 'Other Assets', 'Annual Income', 'Monthly Spend', '401K Contrib',
  'Employer Match', 'Monthly Savings', 'Savings Rate %', 'FIRE Target',
  'Years to FIRE', 'Target Country', 'Target Country ID', 'Locked',
  'Roger Roth IRA', 'Rebecca Roth IRA',
  'Roger 401K Trad Self', 'Roger 401K Trad Match',
];

function snapshotsToCSV(all) {
  let csv = CSV_HEADERS.join(',') + '\n';
  all.forEach((s) => {
    csv += [
      s.date,
      s.netWorth, s.accessible, s.roger401k, s.rogerStocks, s.rebeccaStocks,
      s.cashSavings, s.otherAssets || 0, s.annualIncome, s.monthlySpend,
      s.contrib401k, s.empMatch, s.monthlySavings, s.savingsRate,
      s.fireTarget, s.yearsToFire,
      '"' + (s.targetCountry || '').replace(/"/g, '""') + '"',
      s.targetCountryId || '',
      s.locked || 0,
      s.rogerRothIra || 0,
      s.rebeccaRothIra || 0,
      s.roger401kSelf || 0,
      s.roger401kMatch || 0,
    ].join(',') + '\n';
  });
  return csv;
}

function csvToSnapshots(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];
  return lines.slice(1).map((line) => {
    const cols = [];
    let inQuote = false;
    let field = '';
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { cols.push(field); field = ''; continue; }
      field += ch;
    }
    cols.push(field);
    return {
      date: cols[0] || new Date().toISOString(),
      netWorth: parseFloat(cols[1]) || 0,
      accessible: parseFloat(cols[2]) || 0,
      roger401k: parseFloat(cols[3]) || 0,
      rogerStocks: parseFloat(cols[4]) || 0,
      rebeccaStocks: parseFloat(cols[5]) || 0,
      cashSavings: parseFloat(cols[6]) || 0,
      otherAssets: parseFloat(cols[7]) || 0,
      annualIncome: parseFloat(cols[8]) || 0,
      monthlySpend: parseFloat(cols[9]) || 0,
      contrib401k: parseFloat(cols[10]) || 0,
      empMatch: parseFloat(cols[11]) || 0,
      monthlySavings: parseFloat(cols[12]) || 0,
      savingsRate: parseFloat(cols[13]) || 0,
      fireTarget: parseFloat(cols[14]) || 0,
      yearsToFire: parseInt(cols[15], 10) || 0,
      targetCountry: cols[16] || '',
      targetCountryId: cols[17] || '',
      locked: parseFloat(cols[18]) || 0,
      rogerRothIra: parseFloat(cols[19]) || 0,
      rebeccaRothIra: parseFloat(cols[20]) || 0,
      roger401kSelf: parseFloat(cols[21]) || 0,
      roger401kMatch: parseFloat(cols[22]) || 0,
    };
  }).filter((s) => s.date);
}

// ---------------------------------------------------------------------------
// T040 — round-trip save-and-load preserves Roth IRA fields.
// ---------------------------------------------------------------------------
test('feature 032: CSV round-trip preserves rogerRothIra and rebeccaRothIra', () => {
  const row = {
    date: '2026-05-28T00:00:00.000Z',
    netWorth: 1500000, accessible: 900000,
    roger401k: 400000, rogerStocks: 200000, rebeccaStocks: 250000,
    cashSavings: 50000, otherAssets: 10000,
    annualIncome: 200000, monthlySpend: 6000,
    contrib401k: 22500, empMatch: 8000, monthlySavings: 3000,
    savingsRate: 35,
    fireTarget: 2000000, yearsToFire: 7,
    targetCountry: 'United States', targetCountryId: 'us',
    locked: 600000,
    rogerRothIra: 25000,
    rebeccaRothIra: 60000,
  };
  const csv = snapshotsToCSV([row]);
  const back = csvToSnapshots(csv);
  assert.equal(back.length, 1);
  assert.equal(back[0].rogerRothIra, 25000);
  assert.equal(back[0].rebeccaRothIra, 60000);
  // Spot check unrelated fields are unchanged.
  assert.equal(back[0].netWorth, 1500000);
  assert.equal(back[0].targetCountry, 'United States');
  assert.equal(back[0].locked, 600000);
});

test('feature 032: Roth IRA columns stay at index 19/20 (append-only, never moved)', () => {
  const csv = snapshotsToCSV([]);
  const header = csv.split('\n')[0].split(',');
  assert.equal(header[19], 'Roger Roth IRA');
  assert.equal(header[20], 'Rebecca Roth IRA');
});

// ---------------------------------------------------------------------------
// Traditional-401K funding-source split (RR-only).
//
// Roger's Traditional 401K is entered as two inputs — his own deferrals and the
// employer match — that sum to the single Traditional pool every calculation
// consumes. Snapshot history records both halves so each source can be tracked
// over time. The pre-existing '401K' column (cols[3]) is UNCHANGED: it remains
// the combined Trad + Roth total, so no historical row's meaning shifts.
// ---------------------------------------------------------------------------
test('Trad-401K split: CSV header has 23 columns ending in the two split columns', () => {
  const csv = snapshotsToCSV([]);
  const header = csv.split('\n')[0].split(',');
  assert.equal(header.length, 23);
  assert.equal(header[21], 'Roger 401K Trad Self');
  assert.equal(header[22], 'Roger 401K Trad Match');
});

test('Trad-401K split: round-trip preserves roger401kSelf and roger401kMatch', () => {
  const row = {
    date: '2026-08-07T00:00:00.000Z',
    netWorth: 1500000, accessible: 900000,
    // '401K' column = Trad (26000 + 8091) + Roth (67805) = 101896.
    roger401k: 101896, rogerStocks: 240000, rebeccaStocks: 255000,
    cashSavings: 80000, otherAssets: 0,
    annualIncome: 200000, monthlySpend: 6000,
    contrib401k: 11400, empMatch: 7200, monthlySavings: 3000,
    savingsRate: 35,
    fireTarget: 2000000, yearsToFire: 7,
    targetCountry: 'Taiwan', targetCountryId: 'tw',
    locked: 600000,
    rogerRothIra: 0, rebeccaRothIra: 59021,
    roger401kSelf: 26000,
    roger401kMatch: 8091,
  };
  const back = csvToSnapshots(snapshotsToCSV([row]));
  assert.equal(back.length, 1);
  assert.equal(back[0].roger401kSelf, 26000);
  assert.equal(back[0].roger401kMatch, 8091);
  // The split describes the Traditional half only — the combined column is
  // untouched, and the halves must sum to the Traditional balance (34091).
  assert.equal(back[0].roger401kSelf + back[0].roger401kMatch, 34091);
  assert.equal(back[0].roger401k, 101896);
  // Feature 032 fields must not shift when new columns are appended after them.
  assert.equal(back[0].rebeccaRothIra, 59021);
});

test('Trad-401K split: pre-split 21-column rows parse with both halves at 0', () => {
  // A row written before the split: 21 columns, no cols[21]/cols[22].
  const oldHeader = CSV_HEADERS.slice(0, 21).join(',');
  const oldRow = [
    '2026-06-01T00:00:00.000Z',
    1000000, 600000, 300000, 150000, 200000,
    40000, 5000, 180000, 5500,
    20000, 7000, 2500, 30,
    1800000, 10,
    '"Taiwan"', 'tw',
    500000,
    1000, 59021,
  ].join(',');
  const back = csvToSnapshots(oldHeader + '\n' + oldRow + '\n');
  assert.equal(back.length, 1, 'short-row tolerance: row must NOT be dropped');
  assert.equal(back[0].roger401kSelf, 0, 'missing roger401kSelf defaults to 0');
  assert.equal(back[0].roger401kMatch, 0, 'missing roger401kMatch defaults to 0');
  // Everything that existed before still parses identically.
  assert.equal(back[0].roger401k, 300000);
  assert.equal(back[0].rebeccaRothIra, 59021);
  assert.equal(back[0].targetCountry, 'Taiwan');
});

test('Trad-401K split: snapshot omitting the split fields serializes as 0', () => {
  const row = {
    date: '2026-08-07T00:00:00.000Z',
    netWorth: 1000, accessible: 500, roger401k: 400,
    rogerStocks: 50, rebeccaStocks: 25,
    cashSavings: 10, otherAssets: 5,
    annualIncome: 80000, monthlySpend: 3000,
    contrib401k: 100, empMatch: 5, monthlySavings: 500, savingsRate: 20,
    fireTarget: 1000000, yearsToFire: 15,
    targetCountry: 'US', targetCountryId: 'us', locked: 400,
    // roger401kSelf + roger401kMatch deliberately omitted
  };
  const back = csvToSnapshots(snapshotsToCSV([row]));
  assert.equal(back.length, 1);
  assert.equal(back[0].roger401kSelf, 0);
  assert.equal(back[0].roger401kMatch, 0);
});

// ---------------------------------------------------------------------------
// T041 — legacy short-row tolerance.
//
// Pre-032 CSV files have 19 columns. The loader MUST parse those rows with
// rogerRothIra + rebeccaRothIra defaulting to 0. The `parseFloat(cols[X]) || 0`
// pattern provides this: cols[19] and cols[20] are undefined on short rows;
// parseFloat(undefined) returns NaN; (NaN || 0) returns 0. This test is the
// regression guard that locks that behavior — if a future refactor switches
// to a strict-length check or throws on undefined, this test will fail.
// ---------------------------------------------------------------------------
test('feature 032: legacy 19-column rows parse with Roth IRA fields defaulting to 0', () => {
  // Build a pre-032 header (19 columns) + one 19-column data row.
  const legacyHeader = CSV_HEADERS.slice(0, 19).join(',');
  const legacyRow = [
    '2025-12-01T00:00:00.000Z',
    1000000, 600000, 300000, 150000, 200000,
    40000, 5000, 180000, 5500,
    20000, 7000, 2500, 30,
    1800000, 10,
    '"Taiwan"', 'tw',
    500000,
  ].join(',');
  const csv = legacyHeader + '\n' + legacyRow + '\n';
  const back = csvToSnapshots(csv);
  assert.equal(back.length, 1, 'short-row tolerance: row must NOT be dropped');
  assert.equal(back[0].rogerRothIra, 0, 'missing rogerRothIra defaults to 0');
  assert.equal(back[0].rebeccaRothIra, 0, 'missing rebeccaRothIra defaults to 0');
  // Sanity: existing fields still parse correctly on a short row.
  assert.equal(back[0].netWorth, 1000000);
  assert.equal(back[0].targetCountry, 'Taiwan');
  assert.equal(back[0].locked, 500000);
});

test('feature 032: snapshot with missing Roth IRA fields serializes as 0', () => {
  const rowWithoutRothIra = {
    date: '2026-05-28T00:00:00.000Z',
    netWorth: 1000, accessible: 500, roger401k: 400,
    rogerStocks: 50, rebeccaStocks: 25,
    cashSavings: 10, otherAssets: 5,
    annualIncome: 80000, monthlySpend: 3000,
    contrib401k: 100, empMatch: 5, monthlySavings: 500, savingsRate: 20,
    fireTarget: 1000000, yearsToFire: 15,
    targetCountry: 'US', targetCountryId: 'us', locked: 400,
    // rogerRothIra + rebeccaRothIra deliberately omitted
  };
  const csv = snapshotsToCSV([rowWithoutRothIra]);
  const back = csvToSnapshots(csv);
  assert.equal(back.length, 1);
  assert.equal(back[0].rogerRothIra, 0);
  assert.equal(back[0].rebeccaRothIra, 0);
});
