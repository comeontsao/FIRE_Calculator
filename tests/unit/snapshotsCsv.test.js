/*
 * tests/unit/snapshotsCsv.test.js — feature 009 T037.
 *
 * Locks snapshotsToCSV / csvToSnapshots round-trip semantics per
 *   specs/009-single-person-mode/contracts/snapshots.contract.md §§1–3, §7.
 *
 * The functions live inline in FIRE-Dashboard-Generic.html; they are pure
 * CSV-munging (no DOM). Mirrored here verbatim following the feature 009
 * 20-column schema extension (header[19] === 'Adults').
 *
 * Invariants pinned:
 *   - Header always 20 columns after feature 009.
 *   - adults=1 round-trips cleanly.
 *   - 19-column legacy rows parse with adults defaulted to 2.
 *   - Garbage / out-of-range column 19 clamps to 2.
 *   - Integer column 19 clamps to [1, 2].
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  snapshotRowFixtures,
  legacyCsvRows,
} from '../fixtures/single-person-mode.js';

// Mirror of FIRE-Dashboard-Generic.html CSV_HEADERS after feature 009.
const CSV_HEADERS = [
  'Date', 'Net Worth', 'Accessible', '401K', 'Person 1 Stocks', 'Person 2 Stocks',
  'Cash', 'Other Assets', 'Annual Income', 'Monthly Spend', '401K Contrib',
  'Employer Match', 'Monthly Savings', 'Savings Rate %', 'FIRE Target',
  'Years to FIRE', 'Target Country', 'Target Country ID', 'Locked', 'Adults',
];

function snapshotsToCSV(all) {
  let csv = CSV_HEADERS.join(',') + '\n';
  all.forEach((s) => {
    csv += [
      s.date,
      s.netWorth, s.accessible, s.person1_401k, s.person1Stocks, s.person2Stocks,
      s.cashSavings, s.otherAssets || 0, s.annualIncome, s.monthlySpend,
      s.contrib401k, s.empMatch, s.monthlySavings, s.savingsRate,
      s.fireTarget, s.yearsToFire,
      '"' + (s.targetCountry || '').replace(/"/g, '""') + '"',
      s.targetCountryId || '',
      s.locked || 0,
      s.adults ?? 2,
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
    const adultsRaw = parseInt(cols[19], 10);
    const adults = Number.isInteger(adultsRaw)
      ? Math.max(1, Math.min(2, adultsRaw))
      : 2;
    return {
      date: cols[0] || new Date().toISOString(),
      netWorth: parseFloat(cols[1]) || 0,
      accessible: parseFloat(cols[2]) || 0,
      person1_401k: parseFloat(cols[3]) || 0,
      person1Stocks: parseFloat(cols[4]) || 0,
      person2Stocks: parseFloat(cols[5]) || 0,
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
      adults,
    };
  }).filter((s) => s.date);
}

for (const fx of snapshotRowFixtures) {
  test(`CSV round-trip — ${fx.name}`, () => {
    const csv = snapshotsToCSV([fx.row]);
    const back = csvToSnapshots(csv);
    assert.equal(back.length, 1);
    assert.equal(back[0].adults, fx.row.adults);
    assert.equal(back[0].netWorth, fx.row.netWorth);
    assert.equal(back[0].person2Stocks, fx.row.person2Stocks);
    assert.equal(back[0].targetCountry, fx.row.targetCountry);
    assert.equal(back[0].targetCountryId, fx.row.targetCountryId);
  });
}

for (const lc of legacyCsvRows) {
  test(`CSV legacy read — ${lc.name}`, () => {
    // Build header with 19 columns (pre-feature-009) to mirror legacy files.
    const csv = CSV_HEADERS.slice(0, 19).join(',') + '\n' + lc.line + '\n';
    const back = csvToSnapshots(csv);
    assert.equal(back.length, 1);
    assert.equal(back[0].adults, lc.expectedAdults);
  });
}

test('CSV header always has 20 columns after feature 009', () => {
  const csv = snapshotsToCSV([]);
  const header = csv.split('\n')[0].split(',');
  assert.equal(header.length, 20);
  assert.equal(header[19], 'Adults');
});

test('CSV serialize — missing adults field emits default 2', () => {
  const rowWithoutAdults = {
    date: '2026-04-23T00:00:00.000Z',
    netWorth: 1000, accessible: 500, person1_401k: 400,
    person1Stocks: 50, person2Stocks: 25,
    cashSavings: 10, otherAssets: 5,
    annualIncome: 80000, monthlySpend: 3000,
    contrib401k: 100, empMatch: 5, monthlySavings: 500, savingsRate: 20,
    fireTarget: 1000000, yearsToFire: 15,
    targetCountry: 'US', targetCountryId: 'us', locked: 400,
    // adults deliberately omitted
  };
  const csv = snapshotsToCSV([rowWithoutAdults]);
  const back = csvToSnapshots(csv);
  assert.equal(back.length, 1);
  assert.equal(back[0].adults, 2);
});
