# Data Model — Single-Person Mode (Feature 009)

Entities, fields, validation rules, and state transitions introduced or modified by this feature. Only the Generic dashboard (`FIRE-Dashboard-Generic.html`) is in scope.

---

## Entity 1 — `AdultCount`

A single household-configuration scalar owning the adult head-count.

**Shape:** integer.

**Domain:** `[1, 2]`, closed interval. Values outside this range are rejected at write time (counter bounds enforcement) and coerced at read time (`Math.max(1, Math.min(2, parseInt(v) || 2))`).

**Default:** `2`. Applies to:
- New installs (no prior localStorage state).
- Legacy localStorage state from before feature 009 (`adultCount` key absent ⇒ `2`).
- Snapshot CSV rows from before feature 009 (19-column rows ⇒ `adults = 2`).

**Persistence:**
- DOM: a hidden `<input id="adultCount" value="2">` inside the Household composition block. Value is an integer literal as a string, e.g., `"2"` or `"1"`.
- localStorage: entry `adultCount` added to `PERSIST_IDS` so it round-trips via the existing `saveState` / `restoreState` pipeline.
- Snapshot CSV: emitted as the 20th column named `Adults`.

**State transitions:**

```text
    (disabled)      click dec              click inc      (disabled)
   ──────────────▶  ──────────▶ Adults=2 ◀────────────── ──────────
                   Adults=1              Adults=2
                   (dec disabled)        (inc disabled)
```

- Decrement from 2 → 1: hide Person 2 inputs, set `adultCount` to 1, re-run `applyFilingStatusDefaults(false)`, call `recalcAll()`, persist.
- Increment from 1 → 2: unhide Person 2 inputs, set `adultCount` to 2, re-run `applyFilingStatusDefaults(true)`, call `recalcAll()`, persist.
- No other transitions are legal. Click-on-disabled is a no-op (matches FR-003, SC-008).

**Validation rules:**
- At write time: clamp to `[1, 2]`.
- At read time (`getInputs`): `inp.adultCount = Math.max(1, Math.min(2, parseInt(el.value) || 2))`. A non-integer DOM value falls back to `2`.
- CSV import: same clamp; missing column ⇒ 2.

**Consumers:** `detectMFJ`, `calcNetWorth`, `calcAccessible`, `calcRealisticSSA`, `getSSAnnual`, `getHealthcareFamilySizeFactor`, `getHealthcareMonthly`, snapshot serialization/deserialization, snapshot history UI. Full contract in `contracts/calc-functions.contract.md`.

---

## Entity 2 — `Person2Inputs` (modified lifecycle)

Existing DOM inputs whose lifecycle changes as a result of this feature. No shape change; only visibility-gating change.

**Affected inputs:**

| DOM id | Meaning | Type | Default |
|--------|---------|------|---------|
| `bdPerson2` | Person 2 birthdate | `date` | `1990-01-01` |
| `agePerson2` | Person 2 age (derived from `bdPerson2`; hidden) | `number` | `36` |
| `person2Stocks` | Person 2 taxable stocks / brokerage balance | `number` | `0` |
| `ssSpouseOwn` | Spouse's own Social Security monthly benefit override | `number` | `0` |

**Lifecycle rule:**
- `adultCount === 2` ⇒ the `.input-group` wrappers of all four inputs are visible; their values flow into tax, SS, and portfolio math as today.
- `adultCount === 1` ⇒ the `.input-group` wrappers of all four inputs have `display: none`; their in-memory values are **preserved** (no DOM mutation; persistence continues to save & restore them). Read-time consumers see them suppressed via `adultCount`-gated logic (not by zeroing).

**Invariants:**
- Byte-level round-trip of Person 2 data across any sequence of `2 ↔ 1` transitions (FR-007, SC-005).
- `agePerson2` continues to be updated from `bdPerson2` on date changes (via `onBirthdateChange`) even while hidden — keeps the fallback branch of `detectMFJ` valid if `adultCount` is ever absent.

**Consumers that newly gate on `adultCount`:**
- `calcNetWorth(inp)` — `person2Stocks` contributes only when `adultCount === 2`.
- `calcAccessible(inp)` — same rule.
- `calcRealisticSSA(inp, fireAge)` — `spousePIA` becomes `0` when `adultCount === 1`; `ssSpouseOwn` is not applied.
- `getSSAnnual(inp, claimAge, fireAge)` — sums only `rogerMonthly` when `adultCount === 1`.
- Lifecycle simulators at the inline call sites (lines ~6692, 6790, 7305, 8665) — `portfolioStocks = inp.person1Stocks + (inp.adultCount === 2 ? inp.person2Stocks : 0)`.

---

## Entity 3 — `SnapshotRow` (CSV schema delta)

Append-only extension of the existing CSV snapshot row.

**Existing 19 columns (unchanged ordering):**

```text
 0  Date
 1  Net Worth
 2  Accessible
 3  401K
 4  Person 1 Stocks
 5  Person 2 Stocks
 6  Cash
 7  Other Assets
 8  Annual Income
 9  Monthly Spend
10  401K Contrib
11  Employer Match
12  Monthly Savings
13  Savings Rate %
14  FIRE Target
15  Years to FIRE
16  Target Country
17  Target Country ID
18  Locked
```

**New 20th column:**

```text
19  Adults
```

- Type: integer `1` or `2`.
- Default on append: the in-memory `adultCount` at snapshot-save time.
- Default on legacy-row import: `2`.

**Snapshot in-memory shape gains one field:**

```javascript
{
  date: "2026-04-23T12:34:56.789Z",
  netWorth: 123456.78,
  // ... existing 18 fields unchanged ...
  locked: 40000,
  adults: 2,                // ⬅ NEW
}
```

**Serialization rules (`snapshotsToCSV`):**
- Header always emits the 20-column form (`CSV_HEADERS` gains one entry `'Adults'`).
- Each data row emits `s.adults ?? 2` at position 19 — the nullish-coalesce protects against in-memory snapshots that predate this feature and were loaded from legacy CSV.

**Deserialization rules (`csvToSnapshots`):**
- Parses any row with ≥ 19 columns.
- `adults` field reads `parseInt(cols[19]) || 2`, clamped to `[1, 2]`. Legacy 19-column rows default to `2`.

**UI display:**
- Snapshot history table gets a new column header with `data-i18n="snap.adults"` (EN: "Adults", zh-TW: "成人").
- Each row displays the integer adult count. Rows with `adults === 1` render with a subtle visual distinguisher (e.g., an inline pill or text-dim) so cross-household-size comparisons are visually distinguishable (FR-025). Exact styling is a Phase-2 task; the data contract only guarantees the column is present and populated.

---

## Entity 4 — Filing-status view-state (derived, non-persisted)

Not a new entity, but an emergent view model worth capturing:

```javascript
const isMFJ = detectMFJ(inp);        // true iff inp.adultCount === 2 (or fallback)
const filingLabel = isMFJ ? 'MFJ' : 'Single';
```

- Rendered in the tax-planning section via the `tax.filingStatus.mfj` / `tax.filingStatus.single` i18n keys.
- Not persisted; always derived from `adultCount` on every render.
- Authoritative: every consumer of filing status reads through `detectMFJ(inp)`, not from a separate flag.

---

## Validation & invariants summary

| Invariant | Enforcement site |
|---|---|
| `adultCount ∈ {1, 2}` always | Write clamp in counter handler; read clamp in `getInputs`; import clamp in `csvToSnapshots`. |
| Person 2 values survive every `2 ↔ 1` transition byte-for-byte | CSS visibility gate; no DOM mutation on decrement; `saveState` persists hidden values unchanged. |
| `detectMFJ(inp)` is the sole source of filing-status truth | One function, called by every caller; `applyFilingStatusDefaults` wraps it for the defaults swap. |
| CSV rows always have `Adults` as the 20th column after feature-009 upgrade | `CSV_HEADERS` + `snapshotsToCSV` emit it every time; `csvToSnapshots` defaults missing values to 2. |
| Existing 19-column CSV files continue to load without error | Backward-compat read path; legacy rows coerced to `adults = 2` (FR-024, SC-006). |
| No state that drives filing-status math has a parallel source | Principle III; see Entity 4 above. |

No state-machine diagrams beyond the counter transition in Entity 1. No cross-entity foreign keys. No tombstones.
