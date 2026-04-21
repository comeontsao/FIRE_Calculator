# Implementation Plan: Bracket-Fill Tax Smoothing

**Branch**: `007-bracket-fill-tax-smoothing` | **Date**: 2026-04-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/007-bracket-fill-tax-smoothing/spec.md`

## Summary

Replace the current "cover-spend-only" Traditional 401(k) withdrawal logic with a proactive **bracket-fill** strategy that is the new default. Every retirement year with accessible Traditional balance, the engine draws Trad up to `(stdDed + top12) × (1 − safetyMargin)` of ordinary taxable income (minus taxable SS and RMD that already fill part of the bracket). Excess Traditional drawn above spending need routes into the taxable stocks pool at the next-year boundary (a "synthetic conversion"). Lifetime federal tax drops materially; the age-73 Traditional balance shrinks; RMD cliff softens.

Secondary scope — caveats the user explicitly requires to be visible on the chart: Social Security provisional-income reduction of bracket headroom from the claim age onward; IRMAA Tier 1 cap from age 63 onward; optional Rule of 55 unlock dropping the Trad accessible age to 55 (with a separate visible marker); 5-year Roth conversion clock warning when synthetic conversions would occur below age 59.5 without Rule of 55 enabled. Each caveat is surfaced on the Lifetime Withdrawal Strategy chart or the Full Portfolio Lifecycle chart the moment it binds.

Tertiary scope — repair feature 006's regression that hardcoded `getTaxBrackets(true)` in Generic's signed lifecycle simulator; route every bracket lookup on Generic through the existing `detectMFJ(inputs)` helper so Single-filer scenarios compute the correct (smaller) brackets. RR stays hardcoded MFJ because Roger & Rebecca are married.

Three call sites currently consume the withdrawal algorithm: `projectFullLifecycle` (chart renderer), `signedLifecycleEndBalance` (Safe/Exact/DWZ solver), and `computeWithdrawalStrategy` (Lifetime Withdrawal Strategy chart data generator). Feature 007 must update all three consistently — the same way feature 006 unified the first two.

## Technical Context

**Language/Version**: Vanilla JavaScript (ES2020+), HTML5, CSS3. No transpilation. Zero-build constraint from Constitution Principle V.

**Primary Dependencies**: Chart.js (already loaded via CDN — unchanged). No new libraries.

**Storage**: `localStorage`. Three new persisted values per dashboard file, wired through the existing `PERSIST_IDS` convention (DOM input IDs are automatically serialised/restored):
  - `#safetyMargin` — slider 0–10, default 5
  - `#rule55Enabled` — checkbox, default unchecked
  - `#rule55SeparationAge` — integer input 50–65, default = current FIRE age
  - `#irmaaThreshold` — integer input (dollars), default 212000 (MFJ) / 106000 (Single, Generic auto-selects)

  No standalone keys needed — the `PERSIST_IDS` / `STATE_KEY` mechanism from feature 005 covers everything. Generic's `GENERIC_VERSION` wipe continues to apply.

**Testing**: Node `--test tests/unit/*.test.js` for calc-module unit tests. Browser smoke harness `tests/baseline/browser-smoke.test.js` for DOM-contract and canonical-path sanity. One new test file `tests/unit/bracketFill.test.js` with ≥10 new tests.

**Target Platform**: Desktop browsers (Chrome, Edge, Safari, Firefox — current and one version prior) plus mobile viewports ≥375px wide. Offline / `file://` opening remains supported. No server runtime.

**Project Type**: Single-file HTML dashboard, delivered as two parallel files kept in lockstep per Constitution Principle I. Legacy dashboard excluded.

**Performance Goals**:
  - Bracket-fill algorithm is O(1) per retirement year — no new solver passes, no nested recalculations.
  - Per-year retirement computation stays within one `taxOptimizedWithdrawal` call (as it is today). The algorithm gets more logic inside the function but remains a single call per year per simulator pass.
  - Scroll + slider-drag responsiveness stays at 60fps on a mid-range laptop.
  - FIRE-marker drag holds ≥30fps (Constitution performance floor).
  - Cold page-load first meaningful paint < 1s on a mid-range laptop.

**Constraints**:
  - Zero-build, inline CSS/JS only.
  - No new third-party libraries. Chart.js stays the only external dep.
  - Existing CSS-variable dark theme preserved; only additions.
  - Mobile-responsive at ≥375px.
  - Honor `prefers-reduced-motion: reduce` for any new CSS transitions.
  - Preserve the feature-006 invariant: `projectFullLifecycle`, `signedLifecycleEndBalance`, and `computeWithdrawalStrategy` must all use the same withdrawal algorithm (otherwise Safe/Exact feasibility regresses). Feature 007 updates the one algorithm; all three call sites automatically stay in sync.
  - Backwards compatibility for existing `PERSIST_IDS` / `GENERIC_VERSION` / `STATE_KEY` users — no breaking localStorage changes.
  - Legacy dashboard (`FIRE-Dashboard - Legacy.html`) stays untouched.

**Scale/Scope**:
  - 2 HTML files modified (~9,800 lines each after feature 006); Legacy excluded.
  - ~20 Chart.js instances per file. Only the Lifetime Withdrawal Strategy chart gets new legend entries + annotations. The Full Portfolio Lifecycle chart gets one new Rule-of-55 marker.
  - ~100 input controls per file; 4 new inputs added (safety-margin slider, Rule-of-55 checkbox, separation-age input, IRMAA threshold input).
  - 2 languages (EN + zh-TW); ~15–20 new i18n keys expected.
  - ≥10 new unit tests; zero regressions on the existing 65.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against `.specify/memory/constitution.md` v1.1.0.

| # | Principle | Status | Notes |
|---|-----------|--------|-------|
| I | Dual-Dashboard Lockstep | **PASS (with documented exception)** | Bracket-fill algorithm, UI controls, and chart annotations ship to both files in lockstep per spec FR-071. Exception: RR hardcodes MFJ via `getTaxBrackets(true)` (personal content — married); Generic routes through `detectMFJ(inputs)`. Spec FR-067 and the checklist call this out explicitly. |
| II | Pure Calculation Modules | **PASS** | All changes stay in the existing calc layer (`taxOptimizedWithdrawal`, `projectFullLifecycle`, `signedLifecycleEndBalance`, `computeWithdrawalStrategy`). No DOM reads from inside calc functions. Chart rendering stays separate. |
| III | Single Source of Truth | **PASS** | Feature 007 preserves the feature-006 invariant: all three simulators route through the same `taxOptimizedWithdrawal` update. The new safety-margin, Rule-of-55, and IRMAA parameters flow through `getInputs()` exactly once per recalc and propagate to every consumer. |
| IV | Gold-Standard Regression Coverage | **PASS (with action)** | 65 existing unit tests must stay green. ≥10 new tests exercise the bracket-fill algorithm across the scenarios enumerated in spec FR-081. A new baseline fixture for the primary RR scenario is added to `tests/unit/`. Any existing test that implicitly encoded the retired cover-spend behavior is updated in the same commit — Phase 0 research enumerates them. |
| V | Zero-Build, Zero-Dependency Delivery | **PASS** | No new libraries, no bundler, no transpile. Inline JS + CSS only. Chart.js stays the sole external dep. |
| VI | Explicit Chart ↔ Module Contracts | **ACTION REQUIRED — addressed in plan** | `computeWithdrawalStrategy` (the Lifetime Withdrawal Strategy chart's data generator) gets new output fields: synthetic-conversion amount, IRMAA-capped flag, SS-reduction flag, Rule-of-55 flag, 5-year-Roth-warning flag. The consumer chart renderer's `Consumers:` comment must name each new field and how it's rendered. Same for the Full Portfolio Lifecycle chart (Rule-of-55 marker). |
| VII | Bilingual First-Class (EN + zh-TW) | **ACTION REQUIRED — addressed in plan** | ~15–20 new user-visible strings. All ship in EN and zh-TW in the same commit. Translation catalog updated. Task list enforces this. |

**No unresolved violations.** Items VI and VII are well-understood gates the task list will make explicit. Complexity Tracking section below is empty.

## Project Structure

### Documentation (this feature)

```text
specs/007-bracket-fill-tax-smoothing/
├── plan.md                                    # This file
├── spec.md                                    # Feature spec
├── research.md                                # Phase 0 output
├── data-model.md                              # Phase 1 output
├── quickstart.md                              # Phase 1 output
├── contracts/                                 # Phase 1 output
│   ├── bracket-fill-algorithm.contract.md     # Core withdrawal algorithm
│   ├── ui-controls.contract.md                # Four new UI inputs + persistence
│   └── chart-transparency.contract.md         # Chart annotations + legends + captions
├── checklists/
│   └── requirements.md                        # Spec quality checklist (done)
└── tasks.md                                   # Phase 2 output (/speckit-tasks — NOT here)
```

### Source Code (repository root)

```text
FIRE_Calculator/
├── FIRE-Dashboard.html                        # RR — modified in lockstep (MFJ hardcoded per FR-067)
├── FIRE-Dashboard-Generic.html                # Generic — modified in lockstep (filing-status via detectMFJ)
├── FIRE-Dashboard - Legacy.html               # EXCLUDED
├── FIRE-Dashboard Translation Catalog.md      # Updated with new i18n keys (both EN + zh-TW)
└── tests/
    ├── unit/
    │   ├── bracketFill.test.js                # NEW — ≥10 new tests
    │   └── (existing tests untouched or minimally updated per FR-080)
    └── baseline/
        └── browser-smoke.test.js              # Extended with feature-007 DOM assertions
```

**Structure Decision**: Single-project structure (existing layout). Feature introduces no new source directories, no new calc modules, no new test harness. It adds:
  - Inline JS logic in both HTML files for the bracket-fill algorithm, Rule-of-55 unlock parameter, IRMAA cap, SS adjustment, 5-year-Roth warning.
  - Four new DOM controls + matching CSS.
  - New chart annotations / legend entries / caption text on the Lifetime Withdrawal Strategy chart and Full Portfolio Lifecycle chart.
  - Closed-by-default info panel explaining bracket-fill in plain English.
  - ~15–20 new i18n keys per dict per file.
  - One new test file `tests/unit/bracketFill.test.js`.
  - ~6 lines of extension to the smoke harness for new DOM contracts.
  - One bug-fix edit to Generic's signed lifecycle simulator: `getTaxBrackets(true)` → `getTaxBrackets(detectMFJ(inp))` (FR-069a).

## Complexity Tracking

*No constitution violations to justify. Section intentionally empty.*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| _(none)_  | _(n/a)_    | _(n/a)_                              |
