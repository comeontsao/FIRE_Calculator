# Implementation Plan: Multi-Strategy Withdrawal Optimizer

**Branch**: `008-multi-strategy-withdrawal-optimizer` | **Date**: 2026-04-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-multi-strategy-withdrawal-optimizer/spec.md`

## Summary

Simulate seven named withdrawal strategies on every recalc, score each under the user-selected objective ("Leave more behind" or "Retire sooner / pay less tax"), and display the winner as the primary Lifetime Withdrawal Strategy view. Non-winners live in a collapsed sub-panel that reveals a ranked-table comparison on click; selecting any non-winner previews its strategy across the Lifetime Withdrawal chart, the main Full Portfolio Lifecycle chart, the pinnable sidebar mirror, and the KPI ribbon — with a one-click restore to the auto-selected winner.

**Technical approach**: add a new `calc/strategies.js` module (transitional inline `<script>` block inside each HTML file) that declares the seven strategies as pure functions conforming to a single `StrategyPolicy` contract; refactor `taxOptimizedWithdrawal` to accept an injected `StrategyPolicy` rather than hard-coding bracket-fill; add a `scoreStrategies(inp, fireAge)` harness that runs all seven full-lifecycle simulations in parallel-by-loop and returns a ranked `StrategyResult[]`. **Architecture B (fixed FIRE age)** is chosen to meet the 250 ms budget — the Safe/Exact/DWZ solver runs once up front using the current Bracket-Fill Smoothed strategy, fixing `effectiveFireAge`, then the seven strategies only vary per-year withdrawals at that fixed age. One-shot "what FIRE age could this strategy hit?" is deferred to a v2 feature (see research.md).

## Technical Context

**Language/Version**: Vanilla JavaScript (ES2020+, no transpile) — same runtime as the rest of the codebase
**Primary Dependencies**: Chart.js via CDN (already loaded); no new runtime dependencies
**Storage**: `localStorage` key `fire_withdrawalObjective` (new, defaults to `"leave-more-behind"`); per-recalc cached `_lastStrategyResults` module-scope variable (same pattern as existing `_lastKpiSnapshot`)
**Testing**: Node `--test` harness (existing `tests/unit/*.test.js`) + new `tests/unit/strategies.test.js` + new fixture file `tests/fixtures/strategies/` covering all seven strategies × three scenario profiles (young saver, spanning-three-phases retiree, Coast-FIRE edge). Browser smoke test extended to assert the collapsed comparison sub-panel renders with the expected 6 non-winner rows.
**Target Platform**: modern Chrome/Edge/Firefox/Safari (desktop + mobile-responsive) — matches current target
**Project Type**: single-file HTML app (no client/server split) — per Constitution Principle V
**Performance Goals**: full recalc including seven-strategy scoring MUST stay under 250 ms on a mid-range laptop. Opening the collapsed compare panel MUST render under 500 ms (reads already-computed results; no re-simulation).
**Constraints**: zero-build delivery preserved (Constitution Principle V); bilingual EN + zh-TW for every new string (Principle VII); lockstep between RR and Generic (Principle I); no new global mutable variables unless justified; Safe-mode feasibility must still be computed using `projectFullLifecycle` for chart-consistency (established in feature 007 fix — unchanged).
**Scale/Scope**: 7 strategies × up to ~60 retirement years × per-year tax compute = ~420 `taxOptimizedWithdrawal` invocations per recalc (vs ~60 today). Each invocation is O(5) iterations for the LTCG fixed-point + O(1) bracket tax → negligible per-call; total budget headroom fits comfortably inside 250 ms.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|:---:|-------|
| I. Dual-Dashboard Lockstep | ✅ PASS | FR-015 mandates identical ship to RR + Generic. Tasks will split frontend/i18n work into symmetric task pairs (T-RR / T-Generic). |
| II. Pure Calculation Modules with Declared Contracts | ✅ PASS | The seven strategies are pure functions `(poolBalances, age, spendNeed, brackets, rmd, opts) → PerYearWithdrawalMix`. No DOM access. Contract header declared in `contracts/strategy-module.contract.md`. |
| III. Single Source of Truth for Interactive State | ✅ PASS | New state: `chartState.previewStrategyId` (null when showing winner) + `localStorage.fire_withdrawalObjective`. All chart renderers read `previewStrategyId ?? winningStrategyId`. No separate chart-private FIRE age re-derivation. |
| IV. Gold-Standard Regression Coverage | ✅ PASS | `tests/fixtures/strategies/` locks the seven strategies × three canonical scenarios. Scoring-consistency fixture asserts the winner ID is deterministic for each (scenario, objective) pair. Parity fixture ensures RR and Generic produce byte-identical `StrategyResult[]` for matching inputs. |
| V. Zero-Build, Zero-Dependency Delivery | ✅ PASS | Implemented as inline `<script>` in both HTML files (transitional pattern per Principle II). No new libraries. |
| VI. Explicit Chart ↔ Module Contracts | ✅ PASS | Lifetime Withdrawal Strategy chart renderer comment updated to declare `strategies` module as an additional upstream (in addition to `withdrawal`). Main lifecycle chart renderer comment updated to declare preview-strategy dependency. Contract deltas captured in `contracts/chart-dependencies.contract.md` (referenced by both updates). |
| VII. Bilingual First-Class (EN + zh-TW) | ✅ PASS | Every new string — 7 × strategy name + 7 × one-line description + objective selector labels + collapse-toggle label + preview banner + restore action — ships with zh-TW translation in the same commit. Translation Catalog (`FIRE-Dashboard Translation Catalog.md`) updated in-scope. |

**Gate result**: all 7 principles pass. No `Complexity Tracking` entries needed. No constitution violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/008-multi-strategy-withdrawal-optimizer/
├── plan.md                                        # This file (/speckit.plan output)
├── spec.md                                        # Feature specification (/speckit.specify + /speckit.clarify)
├── research.md                                    # Phase 0 output — Architecture A vs B, algorithm choices
├── data-model.md                                  # Phase 1 output — Strategy / StrategyResult / Objective / Winner
├── quickstart.md                                  # Phase 1 output — how to build + test this feature locally
├── contracts/
│   ├── strategy-module.contract.md                # Phase 1 — the StrategyPolicy interface all 7 implementations satisfy
│   ├── strategy-comparison.contract.md            # Phase 1 — scoreStrategies harness + tiebreaker semantics
│   ├── ui-comparison-panel.contract.md            # Phase 1 — collapsed sub-panel + preview wiring
│   └── chart-dependencies.contract.md             # Phase 1 — updated chart ↔ module annotations (Principle VI)
├── checklists/
│   └── requirements.md                            # Spec-quality gate (existing, all items passing)
└── tasks.md                                       # Phase 2 — /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
# Existing layout — this feature adds inline code to the two HTML files and
# new test fixtures. No new top-level directories.

FIRE-Dashboard.html                  # RR dashboard (modified: new <script> strategies block + UI + i18n)
FIRE-Dashboard-Generic.html          # Public dashboard (modified: identical changes per Principle I)
FIRE-Dashboard Translation Catalog.md  # Updated: new strategy names + UI strings

calc/                                # Existing extracted-calc dir (untouched by this feature)
├── withdrawal.js                    # (existing — unchanged; separate migration track)
└── …

tests/
├── unit/
│   └── strategies.test.js           # NEW — unit tests for each of the 7 strategies + scoring harness
├── fixtures/
│   └── strategies/                  # NEW dir
│       ├── young-saver.json         # Scenario 1: accumulation-only, no retirement phase
│       ├── three-phase-retiree.json # Scenario 2: all 3 retirement phases exercised
│       ├── coast-fire-edge.json     # Scenario 3: Coast-FIRE (no contribs needed)
│       └── expected/                # One file per (scenario × strategy) = 21 expected-output fixtures
└── baseline/
    └── browser-smoke.test.js        # Modified: assert collapsed sub-panel + objective selector present in both HTMLs
```

**Structure Decision**: single-project / single-file delivery preserved. Inline `<script>` module pattern matches feature 007's bracket-fill approach (the code ships inside each HTML file as a fenced block with its Inputs/Outputs/Consumers header per Principle II). No bundler introduced.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. Table intentionally empty.
