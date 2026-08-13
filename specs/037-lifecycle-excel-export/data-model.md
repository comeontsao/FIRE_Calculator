# Phase 1 Data Model: Year-by-Year Lifecycle Spreadsheet Export

**Feature**: 037-lifecycle-excel-export
**Date**: 2026-08-13
**Depends on**: [research.md](./research.md) R2 (union topology), R3 (frames), R4 (tax gap)

---

## 1. Entities

### 1.1 `ExportColumn`

One column in the projection sheet. The column registry is the feature's contract with the user's
eyes — its order is stable across exports (FR-015b) so two files can be diffed or stacked.

| Field | Meaning |
|---|---|
| `key` | Stable identifier; never reused for a different meaning |
| `header` | Human-readable heading, localised per active language (R8) |
| `group` | One of `identity`, `balance`, `income`, `tax`, `spending`, `contribution`, `withdrawal`, `diagnostic` |
| `frame` | `none` (identity/flags), `money`, or `purchasingPower` |
| `source` | `lifecycle`, `strategy`, or `derived` — which array the value is read from |
| `phases` | Which phases populate it: `accumulation`, `retirement`, or `both` |
| `numFmt` | `integer`, `currency`, or `text` |

### 1.2 `ExportRow`

One calendar year. Produced by merging the phase-appropriate lifecycle row with the age-matched
strategy row, then attaching money-frame companions.

### 1.3 `ExportSettings`

The provenance block, written to its own sheet (FR-011c). Fields: FIRE mode, active withdrawal
strategy id and display name, objective, mortgage strategy, retirement status and transition year,
plan end age, inflation rate assumed, active language, dashboard variant (RR / Generic), export
timestamp, and the app/spec version that produced the file.

### 1.4 `ExportWorkbook`

Two sheets: **Projection** (header + ordered `ExportRow`s, frozen header row, frozen identity
columns, set widths, number formats) and **Settings** (label/value pairs from `ExportSettings`).

---

## 2. Source topology (the union, from R2)

```
projectFullLifecycle(...)  ──> lifecycle[]  ─┬─ accumulation rows (27 fields, cash-flow rich)
                                             └─ retirement  rows (15 fields, balances only)
                                                        │
_lastStrategyResults (ACTIVE strategy) ──> strategy[] ───┤  join on `age`
                                                        │
_extendRowsWithBookValues(...)  ────────────────────────┴─> <field>BookValue companions
```

**Join rule**: `strategyRow = strategy.find(r => r.age === lifecycleRow.age)`. A missing match
leaves withdrawal columns blank — never zero, since zero asserts "withdrew nothing" and blank
asserts "not applicable / unknown".

**Group population is categorical, keyed off `phase`** *(amended 2026-08-13 — §3 originally
labelled `contribution` accumulation-only and `withdrawal` retirement-only, while both
`contribution` and `withdrawal` in fact exist on **both** row shapes. That made §3 contradict the
blank-vs-zero table below. §2 is authoritative: the resolution is categorical.)*

- The **whole `contribution` group** emits `0` in retirement years — contributions are a live
  concept there and the answer is genuinely zero.
- The **whole `withdrawal` group** emits **blank** in accumulation years — withdrawals are not a
  concept yet.
- Phase is detected via `row.phase === 'accumulation'`, falling back to the presence of
  `grossIncome` when `phase` is absent.

**Blank vs zero (FR-015c)** — the distinction is load-bearing:

| Situation | Cell | Why |
|---|---|---|
| Accumulation year, withdrawal column | **blank** | Withdrawals are not a concept yet |
| Retirement year, employment-income column | **blank** | No employment income by definition |
| Retirement year, contribution column | `0` | Contributions are a live concept, and the answer is genuinely zero |
| Any year, a pool the user holds nothing in | `0` | Real measured zero; column stays present (FR-015b) |
| Retirement year, federal tax, if R4 not implemented | **blank** | Not computed — must not read as "paid no tax" |

---

## 3. Column registry (v1)

Order below **is** the shipped order (FR-015a). `M` = money, `PP` = purchasing power; a `M/PP` entry
means two adjacent columns.

### Group `identity` — frozen, always visible (FR-011d)

| # | key | Header | Frame | Phases |
|---|---|---|---|---|
| 1 | `year` | Year | none | both |
| 2 | `age` | Age | none | both |
| 3 | `phase` | Plan phase | none | both |
| 4 | `is401kUnlocked` | 401K unlocked | none | both |
| 5 | `hasShortfall` | Shortfall this year | none | both |

### Group `balance` — M/PP pairs, both phases

`total`, `p401k`, `p401kTrad`, `p401kRoth`, `pRothIra`, `pStocks`, `pCash`, `accessible`
→ 8 measures × 2 frames = 16 columns. All eight already have `BookValue` companions today (R3).

### Group `income`

| key | Frame | Phases | Source |
|---|---|---|---|
| `grossIncome` | M/PP | accumulation | lifecycle |
| `ssIncome` | M/PP | both | lifecycle |

### Group `tax`

| key | Frame | Phases | Source | Note |
|---|---|---|---|---|
| `federalTax` | M/PP | accumulation | lifecycle | |
| `ficaTax` | M/PP | accumulation | lifecycle | |
| `retirementFederalTax` | M/PP | retirement | lifecycle | **Requires R4**; blank if not implemented |

### Group `spending`

| key | Frame | Phases | Source |
|---|---|---|---|
| `annualSpending` | M/PP | accumulation | lifecycle |
| `grossSpend` | M/PP | retirement | strategy |

### Group `contribution` — accumulation only

`contribution` (total), `pretax401kEmployee`, `empMatchToTrad`, `stockContribution`,
`stockContributionActual`, `cashFlowToCash` → each M/PP.

### Group `withdrawal` — retirement only, joined from strategy rows

`withdrawal` (total, lifecycle), `wTrad`, `wRoth`, `wRothIra`, `wStocks`, `wCash`,
`syntheticConversion` → each M/PP.

### Group `diagnostic`

| key | Frame | Phases | Note |
|---|---|---|---|
| `fundedFromCash` | M/PP | accumulation | Funding-ladder rung 2 |
| `fundedFromStocks` | M/PP | accumulation | Funding-ladder rung 3 |
| `cashFlowWarning` | none | accumulation | Flag |
| `shortfall` | M/PP | retirement | From strategy row |
| `signedTotal` | M/PP | retirement | **Added 2026-08-13.** The un-clamped total (INV-8). `projectFullLifecycle` writes `total: Math.max(0, total)` onto the row, so the export receives an already-clamped value and no pure module can recover the sign. Requires the Phase 7 calc addition; renders **blank** (not `0`) when the field is absent, so the export works with or without it. |

**Actual total as shipped**: 5 identity + 16 balance + 4 income + 6 tax + 4 spending + 12
contribution + 14 withdrawal + **9** diagnostic = **70 columns** *(was estimated at ≈68; the
`signedTotal` money/purchasing-power pair took `diagnostic` from 7 to 9)*. Wide by design — this is
what "everything" means, and why FR-011d (frozen identity columns) is a requirement rather than a
nicety. Frozen-pane `xSplit` = the identity count = **5**, guaranteed first and contiguous.

---

## 4. Invariants

- **INV-1 — Chart parity.** For every row, the money-frame `total` equals the Lifecycle chart's
  plotted value at that year. Any divergence is a defect in the export (SC-002).
- **INV-2 — One row per year, no gaps.** Years ascend by exactly 1 from the current year to plan end
  (FR-005, FR-006, SC-003).
- **INV-3 — Frame ordering.** For any measure and any year with positive inflation: the two frames
  carry the **same sign**, and the money frame's **magnitude never shrinks** —
  `sign(money) === sign(purchasingPower)` and `|money| ≥ |purchasingPower|`, with equality only in
  the current year.
  *(Corrected 2026-08-13.)* This originally read `money ≥ purchasingPower`, which is **false for
  negative values**: inflating a debt makes it more negative, so a depleted year gives
  money `−57,964` against purchasing power `−50,000` at 3% over 5 years — verified against
  `calc/displayConverter.toBookValue`. `signedTotal` is the first column that can be negative, which
  is what exposed it. The magnitude form is correct for both signs.
- **INV-4 — Stable columns.** The column set and order depend only on the registry version, never on
  the user's data. A pool holding nothing still gets its columns (FR-015b).
- **INV-5 — Active-settings fidelity.** Values derive from the cached chart projection under the
  active mode/strategy/mortgage/retirement settings — never a recompute under defaults (FR-019, R6).
- **INV-6 — Read-only.** Producing the workbook mutates no input, no `state`, no `localStorage`, no
  chart (FR-022).
- **INV-7 — Blank ≠ zero.** Per the table in §2. A blank never means "measured zero".
- **INV-8 — Depletion visible.** A year whose underlying signed balance is negative is identifiable,
  not shown as a clamped `0` (FR-018). The chart clamps at zero for display; the export must not
  inherit that clamp silently.
  *(Amended 2026-08-13.)* The pure module cannot satisfy this alone — it receives a value already
  clamped by `projectFullLifecycle` (`total: Math.max(0, total)`). INV-8 is therefore met by
  **three** columns together: `hasShortfall` (identity flag), `shortfall` (diagnostic amount), and
  `signedTotal` (the un-clamped total, added additively in Phase 7). With Phase 7 skipped, the first
  two still distinguish a depleted year from a solvent one, but only as a proxy.

---

## 5. State transitions

The workbook is stateless and single-shot: **click → resolve cached projection → build rows →
lazy-load ExcelJS → write bytes → download**. No persisted state, no lifecycle beyond the click.

The only failure states are: projection unavailable (FR-024 → refuse, message, no file) and library
load failure (R1 → refuse, message, no file). Neither leaves a partial artifact (FR-025).
