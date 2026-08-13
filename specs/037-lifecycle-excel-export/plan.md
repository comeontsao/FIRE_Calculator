# Implementation Plan: Year-by-Year Lifecycle Spreadsheet Export

**Branch**: `037-lifecycle-excel-export` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/037-lifecycle-excel-export/spec.md`

## Summary

Add one button to **History → Snapshots** that downloads a real `.xlsx` workbook with **one row per
calendar year** from the current year to the plan's end, carrying every per-year figure the
Lifecycle projection computes, in both money and purchasing-power frames, exactly matching the
chart on screen.

**Technical approach**: a new pure module `calc/lifecycleExport.js` transforms the *already-cached*
chart projection into a column model (Node-testable, no DOM, no library). A thin browser handler
lazy-loads **ExcelJS 4.4.0** from cdnjs on first click, writes two sheets, and downloads. The
exporter never recomputes the plan — it reads the same cached lifecycle and active-strategy options
the chart rendered, because an export that recomputes is a second source of truth that will
eventually disagree with the chart.

**The one structural surprise** (research.md R2): `projectFullLifecycle` does not emit a uniform row
shape. Accumulation rows carry 27 fields including full cash-flow detail; retirement rows carry 15
and no cash-flow detail; withdrawals-by-source live on the *strategy* rows entirely. "All the
numbers" is therefore a **union of three sources joined by age**, not a dump of one array. This
drives most of the task breakdown.

## Technical Context

**Language/Version**: ES2020 vanilla JavaScript, no transpile. Classic `<script>` only.
**Primary Dependencies**: Chart.js 4.4.1 (existing, cdnjs) + **ExcelJS 4.4.0 (new, cdnjs, MIT, 926 KB,
classic UMD, lazy-loaded on first export)**.
**Storage**: None new. Export is read-only; no `localStorage` key, no CSV schema change.
**Testing**: Node `node --test` for the pure module; Playwright E2E driving both dashboards and
unzipping the produced `.xlsx` to assert on sheet XML.
**Target Platform**: Desktop browsers, including `file://` double-click. Export additionally needs
network on first click per session.
**Project Type**: Zero-build single-file dashboards (×2, lockstep) + `calc/` module layer.
**Performance Goals**: Cold load unchanged (lazy load is the mechanism). Export completes in under
~2 s for a ~70-row × ~68-column workbook, excluding first-time library fetch.
**Constraints**: Constitution Principles I–IX; no build step; no ES modules; the export must never
disagree with the Lifecycle chart.
**Scale/Scope**: ~50–70 rows × ~68 columns. Wide, not long — no streaming or pagination.

## Constitution Check

*GATE: must pass before Phase 0 research. Re-checked after Phase 1 design.*

| # | Principle | Verdict | Notes |
|---|---|---|---|
| I | Dual-Dashboard Lockstep (NON-NEGOTIABLE) | ✅ PASS | Ships to both files identically. No divergence planned — the export reads whatever each dashboard's projection produced. Every E2E case runs against both (SC-009). |
| II | Pure Calc Modules with Declared Contracts | ✅ PASS | New `calc/lifecycleExport.js` is pure — no DOM, no `window`, no ExcelJS, no `Date.now()` (timestamp injected). Fenced `Inputs:`/`Outputs:`/`Consumers:` header required. |
| III | Single Source of Truth for Interactive State | ✅ PASS | Reads the cached chart projection and resolves strategy via `getActiveChartStrategyOptions()` / `getActiveMortgageStrategyOptions()`. Conversion stays in `calc/displayConverter.js` — the exporter never does inflation maths. |
| IV | Gold-Standard Regression Coverage (NON-NEGOTIABLE) | ✅ PASS | Unit fixtures for the union, the join, blank-vs-zero, and all error paths; E2E unzips the artifact. Conditional calc change (C-3) carries a byte-identical-when-unread fixture. |
| V | Zero-Build, Zero-Dependency Delivery | ⚠️ **PASS WITH APPROVED EXCEPTION** | Adds the project's first non-Chart.js runtime dependency. **User approved 2026-08-13.** Verified compliant: classic UMD, zero ESM syntax, cdnjs delivery matching the Chart.js precedent, no bundler, no `npm install` for end users. See Complexity Tracking. |
| VI | Explicit Chart ↔ Module Contracts | ✅ PASS | The export is a new consumer of the lifecycle projection; `Consumers:` lists must be updated in the same commit. |
| VII | Bilingual First-Class (NON-NEGOTIABLE) | ✅ PASS | Button, progress state, four failure messages, **and workbook column headers** ship EN + zh-TW in both files and the catalog, same commit. |
| VIII | Spending Funded First (NON-NEGOTIABLE) | ✅ PASS | No change to funding logic. The export *reports* the funding ladder; it does not alter it. |
| IX | Mode and Objective are Orthogonal | ✅ PASS | The export records both and composes them; it never overrides either. |

**Gate result: PASS.** One exception, explicitly approved and justified below.

**Re-check after Phase 1 design: PASS, unchanged.** The design strengthened II and IV by pushing all
logic into the pure module, leaving the untestable surface as a thin write-and-download shim.

## Project Structure

### Documentation (this feature)

```text
specs/037-lifecycle-excel-export/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 — library decision, source topology, tax gap
├── data-model.md        # Phase 1 — column registry, union rules, invariants
├── quickstart.md        # Phase 1 — manual verification script
├── checklists/
│   └── requirements.md  # Spec quality checklist (16/16)
├── contracts/
│   └── lifecycle-export.contract.md   # Phase 1 — C-1 pure module, C-2 browser path
└── tasks.md             # Phase 2 — NOT created by /speckit.plan
```

### Source Code (repository root)

```text
calc/
└── lifecycleExport.js          # NEW — pure model builder (C-1). UMD const: _lifecycleExportApi

FIRE-Dashboard.html             # MODIFIED — button, handler, lazy loader, i18n (lockstep)
FIRE-Dashboard-Generic.html     # MODIFIED — identical changes

FIRE-Dashboard Translation Catalog.md   # MODIFIED — new key block

tests/
├── unit/
│   ├── lifecycleExport.test.js         # NEW — C-1 fixtures
│   └── globalScopeCollision.test.js    # MODIFIED — guard the new module
└── e2e/
    └── lifecycle-export.spec.ts        # NEW — download, unzip, assert; both dashboards
```

**Structure Decision**: follows the established pattern — pure logic in `calc/` as a classic UMD
script, DOM wiring inline in both HTML files in lockstep, unit tests in `tests/unit/`, E2E in
`tests/e2e/`. No new directory. Deliberately **no** `vendor/` directory: ExcelJS loads from cdnjs
like Chart.js, and vendoring one library while the other stays on CDN buys nothing (research.md R1).

## Implementation Phases

**Phase A — Pure model (no UI).** Build `calc/lifecycleExport.js` and its fixtures TDD-first. The
union, the age join, blank-vs-zero, frame pairing, error paths. Fully verifiable in Node before any
HTML is touched. Add to the global-scope collision guard.

**Phase B — Button + happy path (US1 MVP).** Add the button to both files' History action row, the
lazy loader, the workbook writer, and the download. Ships the P1 story end-to-end.

**Phase C — Frames (US2).** Extend the `_extendRowsWithBookValues` field list from 8 balance fields
to the full numeric set; pair columns; verify INV-3.

**Phase D — Fidelity (US3).** Thread active-strategy resolution; build the Settings sheet; assert
no-recompute and no side effects.

**Phase E — Transitions (US4).** Phase column, shortfall flags, depletion visibility (INV-8).

**Phase F — Conditional calc change (R4).** Surface retirement-year federal tax additively, with the
byte-identical-when-unread fixture. **Skippable** — if skipped, those cells stay blank and the
Settings sheet says so.

**Phase G — Gate.** Full unit + FULL Playwright suite + console-probe on both + smoke, then the
human Excel check.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **New runtime dependency (ExcelJS 4.4.0, 926 KB)** — Principle V exception | The user explicitly chose a true `.xlsx` workbook over CSV (spec Q1), and FR-011a–d (number formats, frozen header, frozen identity columns, separate settings sheet) cannot be expressed in CSV at all. Principle V permits a library with user approval + a no-build path; both conditions are met and the delivery mechanism matches the existing Chart.js precedent exactly. | **CSV** — rejected by the user with the trade-off stated. **SheetJS CE** — freeze panes are Pro-only, so it cannot meet FR-011b/FR-011d. **Hand-rolled minimal XLSX writer** — genuinely attractive (zero dependency, unit-testable, better Principle II/IV fit) but risks Excel's repair prompt, which SC-011 explicitly forbids, and we cannot verify real-Excel acceptance from CI here. Logged as a backlog candidate, not dismissed. |
| **Calc-layer touch for retirement-year tax (Phase F)** | "Every per-year figure" (FR-015) is unsatisfiable for retirement years otherwise — tax is computed inside `taxOptimizedWithdrawal` and never surfaced (research.md R4). Without it the user sees withdrawals but not the tax that sized them, in exactly the half of the plan they care most about. | **Leave blank** — cheapest and still available as a fallback, but guts the value of the "everything" answer. **Re-derive in the exporter** — rejected outright: a second tax computation that can disagree with the chart is a Principle III violation and a guaranteed future drift bug. |

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Global-scope collision silently kills the new module | **High** — this exact failure shipped twice (`cashSweep.js`, `withdrawalTooltipFrame.js`, dead in every real browser for a full feature cycle) | Unique UMD const `_lifecycleExportApi`; add to `globalScopeCollision.test.js` in the same commit; console-probe both files before merge |
| Export and chart disagree | **High** — destroys the feature's credibility (SC-002) | Read the cached chart projection; never recompute; E2E asserts a sampled year against the rendered chart |
| Excel repair prompt on open | **High** — SC-011 forbids it | Use a mature library rather than hand-rolled OOXML; human Excel check is a merge gate, not optional |
| 68 columns unusable in practice | Medium | Frozen identity columns + grouped, stable order + set widths; validate in the human pass |
| Lazy load fails (offline / CDN blocked) | Medium | Explicit caught failure with a translated message and no file (FR-024/025); E2E covers the blocked case |
| Phase F destabilises the calc layer | Medium | Purely additive sibling field; byte-identical-when-unread fixture; phase is skippable |
| Full E2E suite currently flakes under parallel load | Medium — 4 spec files exceed 5 min; 4 tests failed the last full run but passed in isolation | Known and characterised (see CLAUDE.md); run the new spec in isolation too; do not let a new flake hide in the noise |

## Open Questions (non-blocking)

1. **Localised workbook column headers** — recommended **yes** (research.md R8).
2. **Phase F** — recommended **do it**; skippable if zero calc risk is preferred.
3. **Vendoring** — deferred; revisit only jointly with Chart.js.

None blocks Phase A or B. The P1 MVP depends on none of them.
