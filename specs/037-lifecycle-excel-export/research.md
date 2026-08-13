# Phase 0 Research: Year-by-Year Lifecycle Spreadsheet Export

**Feature**: 037-lifecycle-excel-export
**Date**: 2026-08-13
**Input**: [spec.md](./spec.md)

All findings below were verified against the live codebase or the live network on 2026-08-13.
Nothing here is asserted from memory.

---

## R1 — Which spreadsheet-writing library

**Decision**: **ExcelJS 4.4.0**, loaded as a classic `<script>` from cdnjs, **lazily at first export
click** rather than on page load.

**Verified facts** (measured, not recalled):

| Property | Finding | How verified |
|---|---|---|
| Bundle | `exceljs.min.js` **926 KB** | Downloaded from cdnjs 2026-08-13 |
| Module format | Classic **UMD** — `typeof exports` / `typeof define` / falls back to `window.ExcelJS` | Read the bundle's first 400 bytes |
| ES-module syntax | **Zero** top-level `export` and zero dynamic `import()` | `grep -c "^export \|import(" → 0` |
| Build date stamp | `/*! ExcelJS 19-10-2023 */` | Bundle header |
| Licence | MIT | cdnjs API + project README |
| cdnjs availability | 4.4.0 and 4.3.0 both return HTTP 200 | `curl -sIL` |
| Freeze panes | `worksheet.views = [{state:'frozen', xSplit, ySplit}]` | Project README |
| Number formats | `cell.numFmt = '...'` | Project README |
| Column widths | `worksheet.columns = [{header, key, width}]` | Project README |

**Why this satisfies Constitution Principle V**: the principle permits a third-party library with
user approval and "an equivalent no-build delivery path (CDN or vendored single file)". ExcelJS is
classic UMD, so it loads under `file://` exactly like Chart.js does, and it explicitly does **not**
use the ES-module pattern the principle prohibits. No bundler, no `npm install` for end users.

**Correction to the spec's Dependency Decision section**: that section asserted a CDN script
"fails offline" and implied vendoring was near-mandatory. That over-tightened the constitution.
The project **already loads Chart.js from cdnjs only** —
`<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js">` is the sole
external script, and there is no `vendor/` or `lib/` directory in the repo. So the dashboard's
charts *already* do not render offline. Requiring the export to work offline while the chart it
must match does not is incoherent. CDN is the constitution-compliant, precedent-matching choice.

**Alternatives considered**:

- **SheetJS Community Edition — REJECTED.** Freeze panes on write are a **Pro-only** feature in
  SheetJS; the Community Edition cannot produce FR-011b (frozen header) or FR-011d (frozen identity
  columns). Rejecting it on a capability gap, not on preference. (SheetJS CE is also no longer
  published to npm at current versions, adding a supply-path wrinkle.)
- **Hand-rolled minimal XLSX writer — REJECTED for v1, worth revisiting.** An `.xlsx` is a ZIP of
  XML, and a ZIP can use STORE (no compression), so a ~200–300 line pure module could emit
  `[Content_Types].xml` + `workbook.xml` + `sheet1.xml` + `styles.xml` and cover number formats,
  freeze panes, widths, and multiple sheets with **zero dependency** — and unlike a 926 KB blob it
  would be Node-unit-testable, fitting Principles II and IV far better. Rejected for v1 on risk:
  SC-011 forbids Excel's repair prompt, Excel is unforgiving about malformed OOXML, and we cannot
  verify "Excel opens it cleanly" from CI on this machine. The cost of being wrong is the one
  outcome the spec explicitly prohibits. Logged as a backlog candidate.
- **Vendoring ExcelJS into the repo — DEFERRED, not rejected.** Adds 926 KB of opaque third-party
  code to a repo whose entire value proposition is auditability, to fix an offline case that is
  already broken for charts. If the user later wants true offline, vendoring both Chart.js and
  ExcelJS is one coherent change — doing it for ExcelJS alone buys nothing.

**Lazy loading is the important half of this decision.** 926 KB is roughly the weight of the entire
rest of the page. Injecting the `<script>` on the first export click means: cold load is unchanged,
users who never export pay nothing, and an offline user loses only the export button rather than the
dashboard. It also gives FR-024/FR-025 a natural home — a load failure is a caught, reported error
instead of a silent no-op.

---

## R2 — Where the per-year numbers actually live (the structural finding)

**Decision**: the export reads a **union of three sources joined by age**, not one array. This is
the single biggest deviation from what the spec's plain reading implies, and it drives the task
breakdown.

**What the audit found** — `projectFullLifecycle` does **not** emit one uniform row shape. It has
two distinct `data.push({...})` sites with materially different fields:

**Accumulation-phase rows** (RR ~11614) — 27 fields, rich in cash-flow detail:

```
year, age, total, p401k, p401kTrad, p401kRoth, pRothIra, pStocks, pCash, accessible,
phase, ssIncome, withdrawal, contribution, is401kUnlocked,
grossIncome, federalTax, annualSpending, pretax401kEmployee, empMatchToTrad,
stockContribution, cashFlowToCash, cashFlowWarning,
stockContributionActual, fundedFromCash, fundedFromStocks,
ficaTax, federalTaxBreakdown, ficaBreakdown
```

**Retirement-phase rows** (RR ~11884) — only 15 fields, **no cash-flow detail at all**:

```
year, age, total, p401k, p401kTrad, p401kRoth, pRothIra, pStocks, pCash, accessible,
phase, ssIncome, withdrawal, contribution, is401kUnlocked
```

**Withdrawals-by-source are on neither.** `wTrad` / `wRoth` / `wRothIra` / `wStocks` / `wCash` /
`syntheticConversion` live on the **withdrawal-strategy** rows (`_lastStrategyResults`, the array
extended at RR ~16249), keyed by `age`.

**Consequences for the plan**:

1. The exporter must build a **union column set** and populate it per phase. FR-015c already
   anticipates this ("inapplicable years MUST be unambiguously empty or zero") — the plan honours it
   by treating phase-inapplicable cells as a deliberate blank, distinct from a missing value.
2. Withdrawal columns require a **join by age** onto the active strategy's rows — and per the
   project's strategy-parity rule, it must be the *same* strategy the chart renders, not the default.
3. Contribution columns populate only in accumulation years; withdrawal columns only in retirement
   years. That is correct and expected, not a bug — the column headers must make it obvious.

---

## R3 — Money vs purchasing power for the wide column set

**Decision**: reuse the existing `_extendRowsWithBookValues` helper, extended to the full numeric
field list; do **not** write new conversion maths.

**Findings**: the helper already exists (RR ~14249) and mechanically populates a `<field>BookValue`
companion for every field in a supplied list, using `calc/displayConverter.toBookValue(realValue,
age, currentAge, inflationRate)`. Today the lifecycle call site (RR ~18323) passes only **eight
balance fields**: `['total','p401k','pStocks','pCash','pRoth','p401kTrad','p401kRoth','pRothIra']`.

So the money-frame companions the chart uses already exist for balances, and extending them to the
flow fields (income, taxes, spending, contributions, withdrawals) is a **list change, not new
math** — the converter is already unit-tested and frame-annotated.

**Rationale**: FR-014 requires both frames for every figure. Deriving them anywhere other than the
one audited converter would create a second source of truth for inflation — precisely what
Principle III forbids.

**Alternative rejected**: converting inside the export module. It would duplicate conversion logic
and risk drifting from the chart's own numbers, breaking SC-002.

---

## R4 — The retirement-year tax gap (a real hole in "all the numbers")

> ### ⚠️ R4 WAS WRONG — corrected 2026-08-13 during implementation
>
> The conclusion below ("tax is never surfaced onto any row, so a calc change is needed") is
> **incorrect**. It was reached by inspecting the two **lifecycle** row shapes and the
> `options._trajectory` rows — all three of which genuinely lack a tax field. It missed the
> **withdrawal-strategy** `perYearRows`, which are built as `Object.assign(rowBase, mix)` where
> `mix` already carries **`taxOwed`** (ordinary + LTCG, verified in the mix return shape alongside
> `wTrad`/`wRoth`/`syntheticConversion`/`shortfall`).
>
> Since the export already joins those rows to populate the withdrawal columns, retirement-year tax
> comes free from the same source — and sourcing the tax from the same rows as the withdrawals it
> explains is *more* internally consistent than the separate calc path R4 proposed.
>
> **Effect**: Phase 7's calc-behaviour change (T033/T034) is cancelled. The feature ships with
> **zero changes to projection behaviour**. Only `signedTotal` (T034a) remains as an additive field,
> because no existing row anywhere carries an un-clamped total.
>
> **Lesson worth keeping**: "this figure doesn't exist" is a claim about *every* array in the
> pipeline, not the two you happened to open. The audit should have enumerated all per-year row
> producers before concluding a gap existed.

**Original (superseded) finding**: **per-year federal tax does not exist for retirement years.** In accumulation years the
row carries `federalTax` and `ficaTax`. In retirement years, tax is computed and paid *inside*
`taxOptimizedWithdrawal` and never surfaced onto any row — the strategy trajectory rows carry
`wTrad/wRoth/wStocks/wCash/shortfall/synth/ssThisYear/grossSpend` but **no tax field**.

The spec anticipated exactly this: *"If a figure the user expects turns out not to exist in the
projection, that is a finding for the plan, not a silent omission."* This is that finding.

**Decision**: surface it, additively. Have the withdrawal path return the tax it already computes
and thread it onto the retirement row behind an absent-safe guard, so a missing field degrades to
blank rather than throwing. This mirrors the project's established additive-field pattern (feature
018's `actualDrawdown` sibling-field lesson: add a new field, never redefine an existing one).

**Rationale**: without it, a user scanning "why did 2043 drop?" sees withdrawals but not the tax
that drove their size — which is most of the point of the full column set they asked for.

**Alternatives considered**:
- *Leave retirement tax blank* — cheapest, but guts the value of Q2's "everything" answer for
  exactly the half of the plan the user cares most about.
- *Re-derive tax in the exporter* — rejected outright. A second tax computation that could disagree
  with the chart's own is a Principle III violation and a future drift bug.

**Risk flag**: this is the only part of the feature that touches calc-layer behaviour. It must be
purely additive and covered by a fixture asserting the absent-descriptor path is byte-identical —
the same discipline feature 036 applied to its optional descriptor.

---

## R5 — Control placement and UI

**Decision**: a button in the **History → Snapshots** action row, beside the existing
`📤 Export CSV`, visually distinct and separately labelled.

**Findings**: the History tab has two pills — `snapshots` and `analytics`. The Snapshots pill
already has an action row (RR ~4584) holding `📂 Link CSV File`, `📥 Import CSV`, and
`📤 Export CSV`, wired to `exportSnapshotsCSV()` which downloads via an existing `downloadCSV()`
helper. That is a proven in-browser download path in the exact place the user pointed at.

**Rationale**: FR-002 asks for one destination; the action row is literally "where the records are".
Reusing the established row means no new layout, no sticky-chrome or z-index question, and no nav
change — which also keeps this feature clear of the `#navRail` chrome that feature 035 just rewired.

**Distinctness (FR-023a)**: the existing button says "Export CSV" and emits recorded history; the
new one must not read as a variant of it. Proposed labels — EN "📊 Export Projection (Excel)",
zh-TW "📊 匯出預測（Excel）" — final wording is a task-time decision, but the two must not be
confusable.

**Alternative rejected**: a third History pill. Heavier than a one-click action warrants, and the
user asked for "a new function button", not a new screen.

---

## R6 — Fidelity to the on-screen plan

**Decision**: the exporter must not call `projectFullLifecycle` itself with fresh options. It reads
the **same resolved projection and the same active-strategy options the chart just rendered**.

**Findings**: the codebase already has the machinery and a hard-won rule about it. CLAUDE.md's
Process Lessons record that a gate evaluating a different strategy than the chart renders produces
exactly the class of drift this feature must avoid ("On Track — FIRE at 48" beside a chart depleting
to zero). The helpers exist: `getActiveChartStrategyOptions()` and
`getActiveMortgageStrategyOptions()`. Feature 036 additionally caches the authoritative chart
lifecycle (RR ~18310, "cache the authoritative chart lifecycle") for its verdict probe — the same
cache is the correct source here.

**Rationale**: FR-019 and SC-002 are the feature's credibility. An export that recomputes is a
second source of truth and will eventually disagree with the chart.

**Consequence**: if the cached chart lifecycle is unavailable, the export **fails** per FR-024
rather than falling back to a recompute. A refusal is recoverable; a plausible wrong file is not.

---

## R7 — Testing approach

**Decision**: three layers, with the intelligence in a pure module so most coverage is cheap Node
tests.

1. **Pure unit (Node)** — a new `calc/lifecycleExport.js` transforms
   `(lifecycleRows, strategyRows, settings) → {columns, rows}`. No DOM, no ExcelJS, no workbook
   bytes. This is where column order, the phase union, the age join, blank-vs-zero semantics, and
   both-frame pairing get locked down by fixtures. Satisfies Principles II and IV.
2. **E2E (Playwright)** — click the button, capture the download, **unzip the `.xlsx` and assert on
   the sheet XML**: row count equals the plan range, header row present, freeze panes declared, two
   sheets, settings values match the dashboard. Playwright can read the downloaded artifact, so this
   is verifiable, not eyeballed.
3. **Cross-check** — assert a sampled year's total in the file equals the chart's rendered value for
   that year, which is SC-002 mechanised.

**Note on the global-scope rule**: per CLAUDE.md, every browser-loaded script shares one lexical
scope, and a duplicate top-level `const` silently kills the second script. The new calc module must
use a unique UMD export name (e.g. `_lifecycleExportApi`, never `_api`) and be added to
`tests/unit/globalScopeCollision.test.js`. This exact mistake shipped broken twice before.

---

## R8 — Filename, i18n, and side-effect freedom

- **Filename** (FR-011): `FIRE-Lifecycle-Projection-YYYY-MM-DD.xlsx`, mirroring the existing CSV
  export's naming habit. Date-stamped satisfies "distinct per export"; if two exports land on one
  day the browser's own `(1)` suffix handles collision.
- **i18n** (FR-004): the button label, the loading state, and every failure message need EN + zh-TW
  in both dashboards and in the catalog, in the same commit — Principle VII is non-negotiable.
  **Open question for the plan**: should the *column headers inside the workbook* also localise?
  Recommendation: **yes**, follow the dashboard's active language, since a zh-TW user exporting an
  English-only sheet is a jarring half-translation.
- **Side-effect freedom** (FR-022): the export reads the cached projection and writes a file. It
  must not call `recalcAll()`, mutate `state`, touch `localStorage`, or re-render a chart. Worth an
  explicit assertion in E2E, since "export quietly triggered a recalc" is an easy accident.

---

## Open questions carried into the plan

1. **Localised column headers** — recommended yes (R8). Cheap to do, jarring to omit.
2. **Retirement-year tax** — recommended surface-it (R4). This is the only calc-layer change in the
   feature; if the user prefers zero calc risk, the fallback is leaving those cells blank and saying
   so in the workbook.
3. **Vendoring** — deferred (R1). Revisit only as a joint decision with Chart.js.

None of these block starting: US1 (the P1 MVP) depends on none of them.
