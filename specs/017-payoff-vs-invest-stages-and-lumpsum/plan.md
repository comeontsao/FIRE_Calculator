# Implementation Plan: Payoff vs Invest — Stage Model & Lump-Sum Payoff Branch

**Branch**: `017-payoff-vs-invest-stages-and-lumpsum` | **Date**: 2026-04-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/017-payoff-vs-invest-stages-and-lumpsum/spec.md`

## Summary

Evolves Feature 016's Payoff-vs-Invest comparison to (a) skip pre-buy-in years entirely (window starts at buy-in age for `ownership='buying-in'`, eliminating the $45K Prepay-line artifact), and (b) add an opt-in lump-sum payoff branch where the Invest strategy writes a check the moment its real-dollar brokerage equals the remaining real-dollar mortgage. Stages are renamed event-driven ("Both paying" → "First-payoff" → "Both debt-free") and visualized as faint background bands on the brokerage chart. Switch defaults OFF — today's outputs remain byte-identical when the switch is unchecked.

Technical approach: extend the existing pure calc module (`calc/payoffVsInvest.js`) with one new boolean input (`lumpSumPayoff`), two new output records (`lumpSumEvent`, `stageBoundaries`), and a window-start adjustment for buying-in. Add a Chart.js plugin (no new dependency) for the shaded bands. Lockstep across both HTML files. Eight new bilingual translation keys.

## Technical Context

**Language/Version**: JavaScript (ES2017+ subset compatible with classic-script `<script src="...">` loading under file://)
**Primary Dependencies**: Chart.js 4.4.1 (CDN, already loaded). No new dependencies. Custom Chart.js plugin defined inline in the dashboard file.
**Storage**: `localStorage` key `pvi.lumpSumPayoff` (boolean) for switch state persistence.
**Testing**: Node `node:test` for unit tests on `calc/payoffVsInvest.js`; manual browser smoke per `CLOSEOUT.md` checklist for UI.
**Target Platform**: Modern browsers (Chrome / Firefox / Safari / Edge) loaded via either `file://` (double-click) or `http://` (local server). Mobile-responsive.
**Project Type**: Zero-build single-file HTML dashboard with extracted pure calc modules — no bundler, no npm runtime install.
**Performance Goals**: Chart redraw on switch toggle < 100ms on mid-range laptop; calc-module recompute < 30ms for 60-year horizon scenario.
**Constraints**: `file://` compatibility (Constitution Principle V); UMD-style classic-script load for calc module; lockstep across `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` (Principle I); bilingual EN + zh-TW for every user-visible string (Principle VII).
**Scale/Scope**: 2 HTML files (~17K lines each, ~+50 lines each for switch + banner + plugin), 1 calc module (`calc/payoffVsInvest.js` 927 lines + ~150 new), 1 test file (`tests/unit/payoffVsInvest.test.js` 670 lines + ~250 new), 1 translation catalog (~16 new entries — 8 keys × 2 languages).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (see end of doc).*

| Principle | Relevance | Status | Notes |
|---|---|---|---|
| **I. Dual-Dashboard Lockstep** (NON-NEGOTIABLE) | Yes | ✅ PASS | Spec §6 explicitly requires lockstep for switch UI, verdict banner, and chart band plugin. |
| **II. Pure Calculation Modules with Declared Contracts** | Yes | ✅ PASS | All logic stays in `calc/payoffVsInvest.js`. Module header `Inputs/Outputs/Consumers` block updated for new fields. New `subSteps` entries added for audit-observability ("apply lump-sum payoff trigger when condition met", "compute stageBoundaries from path inflection points"). |
| **III. Single Source of Truth for Interactive State** | Yes | ✅ PASS | `lumpSumPayoff` flows from one `localStorage` key → one input field on `PrepayInvestComparisonInputs` → consumed by one calc module. No re-derivation. |
| **IV. Gold-Standard Regression Coverage** (NON-NEGOTIABLE) | Yes | ✅ PASS | Spec §8 specifies a regression-lock test (byte-identical outputs when `lumpSumPayoff=false` AND `ownership!='buying-in'`) plus 7 new fixture cases (window start, lump-sum-after-Prepay, lump-sum-before-Prepay, never-fires, interest invariant, stage boundaries consistency, already-own backwards compat). Strategy-Matrix sub-requirement N/A — this is not a withdrawal strategy. |
| **V. Zero-Build, Zero-Dependency Delivery** | Yes | ✅ PASS | No new runtime dependency. Chart.js custom plugin defined inline (`beforeDatasetsDraw` hook painting rectangles). UMD-style export pattern in calc module preserved. |
| **VI. Explicit Chart ↔ Module Contracts** | Yes | ✅ PASS | `renderPayoffVsInvestBrokerageChart` comment header updated to declare consumption of new `lumpSumEvent` + `stageBoundaries` fields. `Consumers:` list in calc module header re-confirmed (no new consumers; existing four renderers extended in place). |
| **VII. Bilingual First-Class — EN + zh-TW** (NON-NEGOTIABLE) | Yes | ✅ PASS | Spec §6 enumerates 8 new translation keys; both EN and zh-TW translations land in the same change set in both `TRANSLATIONS.en` / `TRANSLATIONS.zh` blocks AND in `FIRE-Dashboard Translation Catalog.md`. |
| **VIII. Spending Funded First** (NON-NEGOTIABLE) | No | N/A | Feature does not touch withdrawal strategies, lifecycle simulator, or `taxOptimizedWithdrawal`. |
| **IX. Mode and Objective are Orthogonal** | No | N/A | Feature does not touch the strategy ranker, `getActiveSortKey`, or any (Mode × Objective) sort dispatch. |

**Gate result:** PASS. No `Complexity Tracking` entries required.

## Project Structure

### Documentation (this feature)

```text
specs/017-payoff-vs-invest-stages-and-lumpsum/
├── plan.md              # This file
├── spec.md              # Authored 2026-04-29 from brainstorm
├── research.md          # Phase 0 output (this command)
├── data-model.md        # Phase 1 output (this command)
├── quickstart.md        # Phase 1 output (this command)
├── contracts/           # Phase 1 output (this command)
│   └── payoffVsInvest-calc-v2.contract.md
└── tasks.md             # Phase 2 output — created later by /speckit-tasks
```

### Source Code (repository root)

```text
calc/
└── payoffVsInvest.js                       # +~150 lines: lumpSumPayoff input, lumpSumEvent output,
                                            #              stageBoundaries output, window-start
                                            #              adjustment for buying-in.
                                            #              UMD-style classic script preserved.

FIRE-Dashboard.html                          # +~50 lines: switch UI below extra-monthly slider,
                                            #              banner Line 3 logic, Chart.js bands plugin,
                                            #              localStorage persistence wiring.
FIRE-Dashboard-Generic.html                  # +~50 lines: identical lockstep mirror.

FIRE-Dashboard Translation Catalog.md        # +~16 lines: 8 new keys × 2 languages.

tests/unit/
└── payoffVsInvest.test.js                  # +~250 lines: regression-lock adaptation +
                                            #               7 new fixture cases.

specs/017-payoff-vs-invest-stages-and-lumpsum/
└── (this feature's docs as above)
```

**Structure Decision**: Single project with extracted pure calc modules — the established pattern from features 014/015/016. Calc logic lives in `calc/payoffVsInvest.js` (UMD-classic-script per Principle V); UI integration goes into both HTML dashboards in lockstep (Principle I); tests live in `tests/unit/` and run via Node's built-in test runner.

## Complexity Tracking

> No Constitution Check violations. This section intentionally empty.

## Post-Design Constitution Re-Check

*Performed after Phase 1 artifacts written.*

After authoring `data-model.md`, `contracts/payoffVsInvest-calc-v2.contract.md`, and `quickstart.md`:

- Principle II re-check: contract header in `calc/payoffVsInvest.js` will be updated to declare the new `lumpSumPayoff` input and the new `lumpSumEvent` / `stageBoundaries` outputs in the same commit as the implementation. Audit-observability `subSteps` entries enumerated in the data model. ✅
- Principle VI re-check: chart-renderer comment header in `renderPayoffVsInvestBrokerageChart` will be updated to list the new fields it reads. ✅
- Principle VII re-check: every UI string (switch label, switch help text, banner Line 3 template, never-reached note, four stage-band hover labels) has a paired EN + zh-TW translation enumerated in the data model. ✅

**Post-design gate result:** PASS. Proceeding to Phase 2 (`/speckit-tasks`).
