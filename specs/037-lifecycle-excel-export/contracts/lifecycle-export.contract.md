# Contract: Lifecycle Export

**Feature**: 037-lifecycle-excel-export
**Date**: 2026-08-13
**Status**: Draft — binding on implementation

Two contracts: **C-1** the pure calc module (Node-testable, no DOM, no ExcelJS), and **C-2** the
browser export path (DOM, lazy library load, download). The split exists so the intelligence is
unit-testable and the untestable part is as thin as possible (Principle II).

---

## C-1 — `calc/lifecycleExport.js` (pure module)

### C-1.1 Module rules

- Classic UMD per Principle V: no `export` keyword, register on `globalThis`, provide
  `module.exports` for Node.
- **Unique UMD export const name** — `_lifecycleExportApi`. **Never `_api`.** Duplicate top-level
  `const`s across browser-loaded scripts share one lexical scope and silently kill the second
  script; this has shipped broken twice (`calc/cashSweep.js`, `calc/withdrawalTooltipFrame.js`).
  Add the module to `tests/unit/globalScopeCollision.test.js` in the same commit.
- Pure: no DOM, no `window`, no `localStorage`, no ExcelJS reference, no `Date.now()` — the
  timestamp is passed in.

### C-1.2 `buildLifecycleExport(input) → ExportModel`

**Input**:

| Field | Type | Required | Meaning |
|---|---|---|---|
| `lifecycleRows` | `Array<Object>` | yes | The cached chart projection rows, money companions already attached |
| `strategyRows` | `Array<Object>` | no | Active strategy's per-year rows; absent ⇒ withdrawal columns blank |
| `settings` | `Object` | yes | Provenance values (data-model §1.3) |
| `currentYear` | `number` | yes | First data row's year |
| `language` | `'en' \| 'zh'` | yes | Selects localised headers |

**Output** `ExportModel`:

```
{
  columns: Array<ExportColumn>,   // registry order, data-model §3
  rows:    Array<Array<number|string|null>>,  // parallel to columns; null = blank
  settings: Array<{label, value}>,
  meta:    { rowCount, firstYear, lastYear, columnCount, registryVersion }
}
```

**Guarantees**:

1. `rows.length === lastYear - firstYear + 1`, years strictly ascending by 1 (INV-2).
2. Every `rows[i].length === columns.length` (INV-4).
3. A cell is `null` **only** where data-model §2 says blank; measured zeros are `0` (INV-7).
4. Column order is a pure function of `registryVersion` and `language` — never of the data (INV-4).
5. No input object is mutated (INV-6). Callers may pass frozen objects.

**Errors** — throws a typed error, never returns a partial model:

| Condition | Behaviour |
|---|---|
| `lifecycleRows` empty / not an array | throw `LIFECYCLE_UNAVAILABLE` |
| Year sequence has a gap or duplicate | throw `YEAR_SEQUENCE_INVALID` |
| `settings` missing required provenance | throw `SETTINGS_INCOMPLETE` |

### C-1.3 Frame pairing

For every measure with `frame: money`, a sibling `purchasingPower` column is emitted immediately
after it. Money values are read from the pre-computed `<field>BookValue` companion; purchasing-power
values from the base field. The module **never converts** — conversion stays in
`calc/displayConverter.js`, the single audited source (Principle III, R3).

If a `<field>BookValue` companion is missing, the money cell falls back to the base field **and the
model records a `frameFallback` flag in `meta`** so the condition is observable rather than silent.

---

## C-2 — Browser export path

### C-2.1 `exportLifecycleProjectionXlsx()` — the click handler

Ordered steps; any failure aborts with a user-visible message and **no download** (FR-024/025):

1. **Resolve the cached chart projection.** Read the authoritative lifecycle cached by the chart
   render, plus the active strategy rows. **MUST NOT** call `projectFullLifecycle` with fresh
   options (INV-5, R6). Unavailable ⇒ abort with the "projection not ready" message.
2. **Resolve active settings** via `getActiveChartStrategyOptions()` and
   `getActiveMortgageStrategyOptions()` — the same helpers the chart uses. Reading
   `state._payoffVsInvest.mortgageStrategy` directly is prohibited.
3. **Build the model** via C-1. A thrown error aborts with the mapped message.
4. **Lazy-load ExcelJS** (R1) — inject the cdnjs `<script>` on first use only, awaiting load.
   Already loaded ⇒ skip. Load failure or timeout ⇒ abort with the "export library unavailable"
   message.
5. **Write the workbook** — two sheets, freeze panes, widths, number formats (C-2.2).
6. **Download** via the existing in-page download path, filename
   `FIRE-Lifecycle-Projection-YYYY-MM-DD.xlsx`.

**Side-effect prohibition (FR-022/INV-6)**: the handler MUST NOT call `recalcAll()`, write
`localStorage`, mutate `state`, or re-render a chart. E2E asserts this explicitly.

### C-2.2 Workbook shape

| Aspect | Requirement | FR |
|---|---|---|
| Sheets | `Projection` + `Settings`, in that order | FR-011c |
| Header | Row 1 = `columns[].header` | FR-007 |
| Frozen panes | `views:[{state:'frozen', xSplit:<identity count>, ySplit:1}]` | FR-011b, FR-011d |
| Number formats | currency → currency `numFmt`; year/age → integer | FR-011a |
| Widths | Set per column so no header truncates on open | FR-011b |
| Cell types | Numerics written as numbers, never pre-formatted strings | FR-009 |
| Blanks | Written as empty cells, not `0`, not `"-"`, not `"N/A"` | INV-7 |

### C-2.3 i18n

Button label, in-progress state, and all four failure messages ship EN + zh-TW in **both**
dashboards and the catalog, in the same commit (Principle VII). Workbook column headers follow the
active language (R8).

---

## C-3 — Calc-layer addition (retirement tax, R4) — conditional

Only if the R4 recommendation is taken.

- **Purely additive**: surface the already-computed retirement-year federal tax onto the retirement
  lifecycle row as a **new field** (`retirementFederalTax`). Do **not** redefine `federalTax`
  (feature 018's sibling-field lesson).
- **Absent-safe**: consumers guard on presence; a missing field yields a blank cell, never a throw.
- **Regression fixture required**: with the field unread, projection output must be byte-identical
  to today's — the same discipline feature 036 applied to its optional descriptor.
- If R4 is **not** taken, `retirementFederalTax` stays in the registry and renders blank for all
  retirement years, and the Settings sheet must state that retirement-year tax is not reported.

---

## C-4 — Test obligations

| Layer | Must cover |
|---|---|
| Unit (Node) | INV-2, INV-3, INV-4, INV-7; the phase union; the age join incl. missing-match; all three C-1.2 error paths; frame-fallback flag |
| Unit (static) | `globalScopeCollision.test.js` includes the new module |
| E2E (Playwright) | Download the file, unzip, assert sheet count, header row, row count = plan range, freeze panes present, settings values match the dashboard |
| E2E (parity) | A sampled year's money `total` equals the chart's rendered value (SC-002) |
| E2E (negative) | Export with projection unavailable ⇒ message, no file (SC-010) |
| E2E (purity) | Inputs, `localStorage`, and chart unchanged after export (INV-6) |
| Both dashboards | Every E2E case runs against RR and Generic (SC-009) |
