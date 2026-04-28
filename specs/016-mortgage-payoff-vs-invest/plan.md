# Implementation Plan: Mortgage Payoff vs. Invest Comparison

**Branch**: `016-mortgage-payoff-vs-invest` | **Date**: 2026-04-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/016-mortgage-payoff-vs-invest/spec.md`

## Summary

Adds a new **read-only** Plan sub-pill (`Payoff vs Invest`) sitting between Mortgage and Expenses, with three new charts that visualize whether prepaying the mortgage or investing extra after-tax cash yields more wealth year-by-year. The user already has every input we need (mortgage rate / balance / term, expected stocks return, inflation, LTCG-equivalent tax drag, ages); this feature only adds three local state values (`extraMonthly`, optional `plannedRefi`, optional `effectiveRateOverride`) and never modifies any existing chart, KPI, or calculation.

Implementation rests on **one new pure calc module** (`calc/payoffVsInvest.js`) that takes a `PrepayInvestComparisonInputs` snapshot and returns two year-indexed `WealthPath` arrays plus a `Verdict`, a `Factor[]` list, an optional `CrossoverPoint`, and per-year amortization splits — all the data the three new Chart.js views need. The module is independently unit-testable (no DOM, no Chart.js, no globals), shipped UMD-style classic script per Constitution Principle V, and consumed by a thin `renderPayoffVsInvest*()` renderer in each HTML file. Both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` ship in lockstep per Principle I.

## Technical Context

**Language/Version**: Vanilla JavaScript ES2020+ (Constitution Principle V — no transpiler).
**Primary Dependencies**: Chart.js (already loaded from CDN). No new runtime dependencies.
**Storage**: `localStorage` for the three new slider/input values, via the existing `saveState` / `restoreState` pattern in both HTML files. CSV snapshot history is **not** extended — this feature is exploratory analysis, not a tracked snapshot dimension.
**Testing**: Node `--test` for the new calc module (`tests/unit/payoffVsInvest.test.js`); contract assertions for the input/output shape; the existing browser smoke harness covers no-regression on other charts (SC-004).
**Target Platform**: Modern desktop + tablet browsers (Chrome / Edge / Safari / Firefox). MUST work under `file://` per Principle V's expanded file-protocol rule.
**Project Type**: Single-file HTML app + `calc/` sidecar modules (the project's established structure as of feature 015).
**Performance Goals**: First chart paint < 2 s on pill open (SC-001); slider-driven re-render < 200 ms (SC-001); zero impact on Lifecycle / Strategy / Audit chart render times (SC-004).
**Constraints**: Read-only relative to existing dashboard state — no FIRE-age, FIRE-number, scenario, snapshot CSV, or strategy-ranker side effects (FR-002, SC-004). Bilingual at merge per Principle VII (FR-013). UMD-style classic-script load per Principle V (FR-015 requires module purity; the file-protocol rule requires no `export` keyword at module scope).
**Scale/Scope**: ~50-year horizon × 1 user × 3 charts × ≤ 12 month-step iterations per year = trivial. The calc module's worst-case work is O(months × strategies) ≈ 1,200 iterations per recompute — well under any perf budget.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution version checked against: **v1.2.0** ([`.specify/memory/constitution.md`](../../.specify/memory/constitution.md)).

| Principle | Applies? | Status | Note |
|-----------|----------|--------|------|
| **I. Dual-Dashboard Lockstep** (NON-NEGOTIABLE) | Yes | ✅ Pass | Every change ships to both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` in the same change set. The new calc module is shared (loaded by both via `<script src="calc/payoffVsInvest.js">`). Personal-only divergence is limited to default extra-monthly amount if the two files seed different values. |
| **II. Pure Calculation Modules with Declared Contracts** | Yes | ✅ Pass | `calc/payoffVsInvest.js` will be pure (no DOM, no `window`, no `localStorage`, no Chart.js), with a contract header declaring `Inputs:` / `Outputs:` / `Consumers:`. Audit-observability sub-requirement: the calc emits ordered `subSteps` (e.g., "amortize → apply extra → compound investments → apply refi at year N → split principal/interest → score verdict") so the Audit tab can list them when surfaced. |
| **III. Single Source of Truth for Interactive State** | Yes | ✅ Pass | The feature does NOT introduce new shared cross-chart state. The three new local values (`extraMonthly`, `plannedRefi`, `effectiveRateOverride`) are read from DOM at render time (matching the existing input-reading pattern). They are never consumed by any other chart. The pill's chart reads `effectiveFireAge` / `endAge` / mortgage inputs from existing module-scope state (read-only). |
| **IV. Gold-Standard Regression Coverage** (NON-NEGOTIABLE) | Yes | ✅ Pass | Fixture-locked unit tests in `tests/unit/payoffVsInvest.test.js` covering: prepay-clearly-wins case, invest-clearly-wins case, tie-calibration case, refi-mid-window case, override-shifts-toward-invest case (SC-008, SC-009, SC-010). Plus a no-regression assertion in the existing browser smoke harness verifying that opening the pill does not change any other chart's data series (SC-004). |
| **V. Zero-Build, Zero-Dependency Delivery** | Yes | ✅ Pass | No new deps. `calc/payoffVsInvest.js` ships as classic UMD-loadable script: top-level `const`/`function` declarations, `if (typeof module !== 'undefined' && module.exports) { module.exports = {...} }` for Node tests, `if (typeof globalThis !== 'undefined') { globalThis.X = X }` for browser. NO `export` keyword. file:// double-click compatibility preserved. |
| **VI. Explicit Chart ↔ Module Contracts** | Yes | ✅ Pass | Each of the 3 new charts (`Wealth Trajectory`, `Where each dollar goes`, optional small `Verdict mini-chart`) gets a renderer comment naming `calc/payoffVsInvest.js` as its data source and listing the named output fields it reads. The calc module's `Consumers:` list names all three renderers. |
| **VII. Bilingual First-Class — EN + zh-TW** (NON-NEGOTIABLE) | Yes | ✅ Pass | Every new user-visible string (pill label, slider labels, verdict banner template, Factor Breakdown row labels, refi inputs, override slider, explainer card text, chart legend labels) lands in both `TRANSLATIONS.en` and `TRANSLATIONS.zh` in the same change set. Catalog sync entry added to `FIRE-Dashboard Translation Catalog.md`. |
| **VIII. Spending Funded First** (NON-NEGOTIABLE) | Yes | ✅ Pass — N/A by design | Feature is read-only relative to withdrawal strategies. The Prepay path uses the contractual P&I; the Invest path's investment account is separate from retirement-spending withdrawal strategies. No `computePerYearMix` or `_drawByPoolOrder` change. |
| **IX. Mode and Objective are Orthogonal** | Yes | ✅ Pass — N/A by design | Feature doesn't touch the strategy ranker. Verdict semantics are local to this pill (winner = "prepay" / "invest" / "tie"), separate from the dashboard's `mode` × `objective` orthogonal axes. |

**Sticky-Chrome Discipline**: the new pill plugs into the existing Plan tab's pill-bar; no new sticky band is introduced. No z-index hierarchy change.

**Spending-Funded-First gate** (review gate #6): N/A — no changes to `taxOptimizedWithdrawal`, `_drawByPoolOrder`, or any strategy's `computePerYearMix`.

**Sort-key orthogonality gate** (review gate #7): N/A — no changes to `rankByObjective`, `scoreAndRank`, or `getActiveSortKey`.

**Verdict**: ✅ All gates pass. No complexity exceptions needed.

## Project Structure

### Documentation (this feature)

```text
specs/016-mortgage-payoff-vs-invest/
├── plan.md                  # This file
├── spec.md                  # Feature specification (drafted + clarified)
├── research.md              # Phase 0 — open technical questions resolved
├── data-model.md            # Phase 1 — entity shapes
├── contracts/               # Phase 1 — calc-module + chart-renderer contracts
│   ├── payoffVsInvest-calc.contract.md
│   ├── payoffVsInvest-charts.contract.md
│   └── payoffVsInvest-state.contract.md
├── quickstart.md            # Phase 1 — implementer onboarding
├── checklists/
│   └── requirements.md      # Spec quality checklist (already exists)
└── tasks.md                 # Phase 2 — created by /speckit-tasks
```

### Source Code (repository root)

```text
FIRE-Dashboard.html                          # RR — adds Payoff vs Invest pill
FIRE-Dashboard-Generic.html                  # Generic — adds Payoff vs Invest pill (lockstep)

calc/
├── tabRouter.js                              # existing — adds 'payoff-invest' to Plan tab pill list
├── chartState.js                             # existing — UNCHANGED (read-only consumer)
├── calcAudit.js                              # existing — UNCHANGED (no audit-stage addition in v1)
├── inflation.js                              # existing — UNCHANGED
└── payoffVsInvest.js                         # NEW — pure calc module per Principle II/V

tests/
├── unit/
│   ├── payoffVsInvest.test.js               # NEW — 5+ fixture cases (SC-008/009/010)
│   └── ... (existing unit tests untouched)
└── baseline/
    └── browser-smoke.test.js                # existing — extended with no-regression assertion (SC-004)

FIRE-Dashboard Translation Catalog.md         # extended with Payoff-vs-Invest section
```

**Structure Decision**: Single calc module under `calc/`, two HTML files in lockstep. Matches the established post-feature-001 structure. No new top-level directories.

## Phase 0 — Outline & Research

See [`research.md`](./research.md) for full detail. Resolved questions:

1. **Compounding frequency** — monthly. Matches the cadence of mortgage P&I payments and the slider semantics; ~0.4% accuracy gain over annual at typical rates with negligible perf cost.
2. **Home appreciation default** — real-zero (uses `inflationRate` as the proxy nominal rate). Conservative; avoids artificially boosting the Prepay path's home-equity component. Configurable via the existing scenario data — but in v1 no new slider is added.
3. **LTCG tax drag application** — continuous drag on the real return rate (cleaner year-by-year visualization than terminal-only tax). The drag = `inp.ltcgRate × inp.stockGainPct`, identical to how `signedLifecycleEndBalance` already models stock returns.
4. **Effective-rate override semantics** — override applies ONLY to the Verdict / Factor calculation, NOT to the amortization schedule (banks bill at the contractual rate). The schedule, P&I, and balance evolution use the nominal rate; the user's "economic interest cost" used in the verdict's spread calculation uses the override.
5. **Refi mechanics** — at refi-year, the remaining balance carries forward, the new term resets the amortization clock to month 1 of `(newTerm × 12)` payments, and a new monthly P&I is computed. Both Prepay and Invest paths experience the refi.

## Phase 1 — Design & Contracts

See:
- [`data-model.md`](./data-model.md) — entity shapes for `PrepayInvestComparisonInputs`, `WealthPath`, `Verdict`, `Factor`, `CrossoverPoint`, `RefiAnnotation`.
- [`contracts/payoffVsInvest-calc.contract.md`](./contracts/payoffVsInvest-calc.contract.md) — input/output contract for the pure calc module.
- [`contracts/payoffVsInvest-charts.contract.md`](./contracts/payoffVsInvest-charts.contract.md) — Chart.js dataset + tooltip + axis contracts for the three new charts.
- [`contracts/payoffVsInvest-state.contract.md`](./contracts/payoffVsInvest-state.contract.md) — DOM-input contract + `localStorage` persistence keys + recalcAll integration boundary.
- [`quickstart.md`](./quickstart.md) — onboarding doc for the implementer.

**Agent context update**: `CLAUDE.md` plan reference is updated below to point at this plan file.

## Complexity Tracking

> No constitutional violations to justify. Table left empty intentionally.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_  | _(none)_   | _(none)_                            |
