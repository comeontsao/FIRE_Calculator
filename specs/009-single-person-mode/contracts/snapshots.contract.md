# Contract — Snapshot CSV Schema Delta

**Scope:** `FIRE-Dashboard-Generic.html` snapshot persistence — both the localStorage JSON cache and the `FIRE-snapshots-generic.csv` file. Governed by the DB Engineer constitution rule: "CSV is append-only; new columns appended, never inserted; never break old rows."

---

## 1. `CSV_HEADERS` — append one column

**Before (19 columns, today):**

```javascript
const CSV_HEADERS = [
  'Date','Net Worth','Accessible','401K','Person 1 Stocks','Person 2 Stocks',
  'Cash','Other Assets','Annual Income','Monthly Spend','401K Contrib',
  'Employer Match','Monthly Savings','Savings Rate %','FIRE Target',
  'Years to FIRE','Target Country','Target Country ID','Locked'
];
```

**After (20 columns):**

```javascript
const CSV_HEADERS = [
  'Date','Net Worth','Accessible','401K','Person 1 Stocks','Person 2 Stocks',
  'Cash','Other Assets','Annual Income','Monthly Spend','401K Contrib',
  'Employer Match','Monthly Savings','Savings Rate %','FIRE Target',
  'Years to FIRE','Target Country','Target Country ID','Locked',
  'Adults'   // Feature 009 — appended, never inserted.
];
```

---

## 2. `snapshotsToCSV(all)` — emit the 20th column

Append `s.adults ?? 2` at position 19 (0-indexed) in the per-row array:

```javascript
csv += [
  s.date,
  s.netWorth, s.accessible, s.person1_401k, s.person1Stocks, s.person2Stocks,
  s.cashSavings, s.otherAssets || 0, s.annualIncome, s.monthlySpend,
  s.contrib401k, s.empMatch, s.monthlySavings, s.savingsRate,
  s.fireTarget, s.yearsToFire,
  '"' + (s.targetCountry || '').replace(/"/g, '""') + '"',
  s.targetCountryId || '',
  s.locked || 0,
  s.adults ?? 2   // Feature 009 — default to 2 for in-memory snapshots loaded from legacy CSV.
].join(',') + '\n';
```

**Contract invariants:**
- The header row ALWAYS reflects the current `CSV_HEADERS` length.
- Every data row ALWAYS has exactly `CSV_HEADERS.length` comma-separated fields.
- `s.adults` is coerced to `2` if null/undefined via `??`, never emitted as empty.

---

## 3. `csvToSnapshots(csvText)` — backward-compatible read

Extend the per-row projection to read position 19, defaulting to `2` when absent (legacy 19-column rows):

```javascript
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
  yearsToFire: parseInt(cols[15]) || 0,
  targetCountry: cols[16] || '',
  targetCountryId: cols[17] || '',
  locked: parseFloat(cols[18]) || 0,
  adults: Math.max(1, Math.min(2, parseInt(cols[19]) || 2)),  // Feature 009 — default 2, clamp to [1,2].
};
```

**Contract invariants:**
- Missing column (19-column legacy row) ⇒ `adults = 2` (FR-024, SC-006).
- Present column with garbage value ⇒ `adults = 2` (clamp + default).
- `adults` is guaranteed to be the integer `1` or `2` after this function returns.

---

## 4. `saveSnapshot()` — capture `adultCount` on save

The snapshot-taking function (around line ~11960 in today's code) builds the in-memory snapshot object from the current DOM state. Extend that builder to read:

```javascript
const _acEl = document.getElementById('adultCount');
const adults = Math.max(1, Math.min(2, parseInt((_acEl || {}).value) || 2));
// ... inside the snapshot object:
{
  // ... existing fields ...
  locked: …,
  adults,   // Feature 009.
}
```

**Contract:** `adults` is recorded at snapshot-save time, not inferred later. Editing the counter after the snapshot is taken does not retroactively modify already-saved snapshots.

---

## 5. Snapshot history UI — row display

The snapshot history table gets a new `<th>` in the header (line ~2911 region) bearing `data-i18n="snap.adults"`, and each rendered row gets a `<td>` with the integer adult count. Styling for visual distinguishability between `1` and `2` rows is a Phase-2 polish task (see FR-025) — the contract guarantees only that the column renders with the correct integer.

Additionally, when `adultCount === 1`, the snapshot history UI hides or visually de-emphasizes the `Person 2 Stocks` column cells for any row whose `adults === 1` (FR-008). This is a display-only rule — the data is still in the snapshot object and is still emitted to CSV.

---

## 6. CSV file upgrade path (user-visible)

A user running the feature for the first time against an existing 19-column `FIRE-snapshots-generic.csv`:

1. **On Import** (reads existing file): each row parses to an in-memory snapshot with `adults = 2`. No error, no warning.
2. **On Save Snapshot** (triggers CSV write): the `CSV_HEADERS` row becomes 20-column; every data row (including the newly in-memory old ones) emits its `adults` value (legacy rows: `2`; new rows: user's current counter). Post-save, the on-disk file is in the new 20-column schema.
3. **Users who never re-save**: the file stays 19-column indefinitely; no data loss, no required migration.

This gradual upgrade path is intentional and matches the DB Engineer constitution's append-only rule.

---

## 7. Contract tests (Node)

Add `tests/unit/snapshotsCsv.test.js` (new file or extend an existing test) with at minimum:

1. **Round-trip new-schema row.** Build a snapshot with `adults=1`, serialize, parse, assert `adults===1`.
2. **Legacy-row read.** Feed a 19-column CSV line, parse, assert `adults===2` (default).
3. **Garbage tolerance.** Column 19 contains `"xyz"`, parse, assert `adults===2` (clamp-and-default).
4. **Header emits 20 columns.** Serialize an empty array plus one valid row; first line split on `,` has length 20.
5. **Clamp on save.** In-memory `adults=5` ⇒ serialized value is `2` (via `??` default is still `2`, or explicit clamp — either behavior is acceptable as long as the emitted column is in `{1,2}`).

---

## 8. Non-goals

- Re-ordering existing columns — FORBIDDEN by the append-only rule.
- Adding per-snapshot kids count to the CSV — out of scope for feature 009.
- Adding a schema-version row or file-header magic — out of scope; the 20-column count is self-documenting.
