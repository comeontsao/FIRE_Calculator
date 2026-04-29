# Implementation Plan: Merge Payoff-vs-Invest into Full Portfolio Lifecycle

**Branch**: `018-lifecycle-payoff-merge` | **Date**: 2026-04-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/018-lifecycle-payoff-merge/spec.md`

## Summary

Threads the user's chosen mortgage strategy (Prepay-extra / Invest-keep-paying / Invest-lump-sum) from the Payoff-vs-Invest calc module through the rest of the dashboard so the **Full Portfolio Lifecycle chart**, **sidebar KPIs**, **FIRE-age search/verdict**, **strategy ranker**, **Audit tab**, and **Copy Debug payload** all show one coherent story. Adds sell-at-FIRE composition (Section 121 capital gains, two-event interaction with lump-sum) and the `HomeSaleEvent` domain object.

Technical approach: extend the existing pure `calc/payoffVsInvest.js` v2 with sell-at-FIRE handling (new `homeSaleEvent` output, FIRE-truncated handoff value); modify the lifecycle simulator's inline `<script>` blocks in both HTML dashboards to read the resolved `mortgageStrategy` and consume the calc module's outputs as the canonical mortgage trajectory; add Section 121 exclusion math; auto-move FIRE marker on strategy change; surface state in the Audit `subSteps` array and the `copyDebugInfo()` JSON payload. Lockstep across both HTMLs; bilingual for all new strings.

## Technical Context

**Language/Version**: JavaScript (ES2017+ subset compatible with classic-script `<script src="...">` loading under file://)
**Primary Dependencies**: Chart.js 4.4.1 (CDN, already loaded). NO new dependencies. NO new bundler. NO new framework.
**Storage**: `localStorage` blob `state._payoffVsInvest` (existing) extended with new key `mortgageStrategy`.
**Testing**: Node `node:test` for calc-module fixtures; new fixtures locking the 8-scenario interaction matrix; manual browser smoke per `quickstart.md` for the lifecycle/UI integration.
**Target Platform**: Modern browsers (Chrome / Firefox / Safari / Edge) under both `file://` (double-click) and `http://` delivery modes. Mobile-responsive.
**Project Type**: Zero-build single-file HTML dashboard with extracted pure calc modules — same as features 014–017.
**Performance Goals**:
- Lifecycle recompute on strategy toggle: < 100 ms (the existing baseline).
- FIRE-age search re-run: < 500 ms (the existing FIRE-marker drag baseline).
- PvI calc-module compute (now including sell-at-FIRE event): < 50 ms (unchanged from feature 017).
**Constraints**:
- `file://` compatibility (Constitution Principle V) — no ES modules in calc; UMD-classic-script preserved.
- Lockstep across `FIRE-Dashboard.html` AND `FIRE-Dashboard-Generic.html` (Principle I).
- Bilingual EN + zh-TW (Principle VII) — every new user-visible string.
- Backwards compat (SC-004): saved states without `mortgageStrategy` default to `invest-keep-paying`, producing byte-identical output to feature 017's `lumpSumPayoff: false` baseline.
- The lifecycle simulator currently lives as inline `<script>` in the HTML files. We modify it in place; extracting to `calc/lifecycle.js` is OUT OF SCOPE (noted in spec §"Out of Scope").
**Scale/Scope**:
- 1 calc module (`calc/payoffVsInvest.js` 1090ish lines + ~150 new for sell-at-FIRE handling).
- 2 HTML files (~17K lines each, ~+200 lines each: PvI radio + sidebar indicator + sell-marker chart annotation + audit subSteps + copyDebug payload + state plumbing + ~25 translation keys).
- 1 test file (`tests/unit/payoffVsInvest.test.js`) gains ~12 new fixture cases (8 from the interaction matrix + 4 for Section 121 boundary cases). NEW test file `tests/unit/lifecyclePayoffMerge.test.js` covers the lifecycle handoff value (the simulator integration is browser-tested, but the calc-side handoff is unit-testable).
- 1 translation catalog (~14 new entries: 7 keys × 2 languages).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (see end of doc).*

| Principle | Relevance | Status | Notes |
|---|---|---|---|
| **I. Dual-Dashboard Lockstep** (NON-NEGOTIABLE) | Yes | ✅ PASS | FR-001 onwards all explicitly require both HTMLs. The selector, sidebar indicator, sell-marker, audit subSteps, copyDebug payload — all lockstep. |
| **II. Pure Calculation Modules with Declared Contracts** | Yes | ✅ PASS | All NEW calc work goes into `calc/payoffVsInvest.js` (extends v2 → v3 in this feature). The lifecycle simulator's inline blocks remain inline (per spec out-of-scope), but their NEW behavior is fully driven by the calc module's outputs. Audit observability satisfied via FR-008's enumerated subSteps. |
| **III. Single Source of Truth for Interactive State** | Yes | ✅ PASS | `mortgageStrategy` flows: PvI tab radio (FR-010) → `state._payoffVsInvest.mortgageStrategy` → input to PvI calc → consumed by lifecycle simulator + sidebar + FIRE-age search + ranker + audit + copyDebug. No re-derivation. |
| **IV. Gold-Standard Regression Coverage** (NON-NEGOTIABLE) | Yes | ✅ PASS | Feature 017's parity helper extends to feature 018. New fixture cases lock the 8-scenario interaction matrix. SC-010 specifies worked numeric examples for Section 121. Strategy-Matrix sub-requirement N/A (this isn't a withdrawal strategy). |
| **V. Zero-Build, Zero-Dependency Delivery** | Yes | ✅ PASS | No new dependencies. UMD-classic-script preserved in calc. The home-sale event uses pure JS arithmetic. |
| **VI. Explicit Chart ↔ Module Contracts** | Yes | ✅ PASS | The PvI chart's renderer comment + the lifecycle chart's renderer comment both gain new declared-fields entries (`homeSaleEvent`, `mortgageStrategy`, `postSaleBrokerageAtFire`). The calc module's `Consumers:` list expands to include "lifecycle simulator (handoff value)". |
| **VII. Bilingual First-Class — EN + zh-TW** (NON-NEGOTIABLE) | Yes | ✅ PASS | All ~7 new user-visible strings ship with both languages in the same change set + catalog sync. |
| **VIII. Spending Funded First** (NON-NEGOTIABLE) | Yes | ✅ PASS (no impact) | The mortgage-strategy change shifts cash flow timing but does not relax the spending floor. The withdrawal strategies' floor pass continues to apply unchanged. The HomeSaleEvent's brokerage injection at FIRE *helps* the floor (more headroom). |
| **IX. Mode and Objective are Orthogonal** | Yes | ✅ PASS (no impact) | Mortgage strategy is a THIRD axis, fully orthogonal to Mode (Safe/Exact/DWZ) and Objective (Preserve/MinimizeTax). The strategy ranker dispatches `getActiveSortKey({mode, objective})` once per recalc; mortgage strategy changes the lifecycle simulation that feeds the ranker, not the ranker's dispatch. No collision. |

**Gate result:** PASS. No `Complexity Tracking` entries required. The most sensitive areas (per existing process lessons) are: (a) the FIRE-age feasibility probe — it MUST consume the resolved mortgage strategy when re-running, mirroring the feature-014 lesson "FIRE-mode gates MUST evaluate the displayed strategy"; and (b) the lifecycle simulator's inline modification scope — high blast radius, mitigated by the new fixture-locked tests.

## Project Structure

### Documentation (this feature)

```text
specs/018-lifecycle-payoff-merge/
├── plan.md              # This file
├── spec.md              # Authored 2026-04-29 (Q1–Q6 resolved)
├── research.md          # Phase 0 — this command
├── data-model.md        # Phase 1 — this command
├── quickstart.md        # Phase 1 — this command
├── contracts/           # Phase 1 — this command
│   ├── payoffVsInvest-calc-v3.contract.md
│   └── lifecycle-mortgage-handoff.contract.md
├── checklists/
│   └── requirements.md  # validation green
└── tasks.md             # Phase 2 — created later by /speckit-tasks
```

### Source Code (repository root)

```text
calc/
└── payoffVsInvest.js                       # +~150 lines: sell-at-FIRE handling, homeSaleEvent
                                            #   output, Section 121 helper, lifecycle handoff
                                            #   value (postSaleBrokerageAtFire). UMD preserved.

FIRE-Dashboard.html                          # +~200 lines:
                                            #   - PvI tab: Prepay/Invest radio (FR-010)
                                            #   - PvI chart: sell-event marker (FR-015, FR-017)
                                            #   - Sidebar indicator (FR-005)
                                            #   - Lifecycle simulator: thread mortgageStrategy
                                            #     through pre-FIRE accumulation; consume
                                            #     postSaleBrokerageAtFire as retirement seed
                                            #   - FIRE-age search consumes mortgage strategy
                                            #   - FIRE-marker auto-move on strategy change
                                            #   - Audit subSteps emission (FR-008)
                                            #   - copyDebugInfo() payload extension (FR-019)
                                            #   - state._payoffVsInvest.mortgageStrategy
                                            #     persistence
FIRE-Dashboard-Generic.html                  # +~200 lines: identical lockstep mirror.

FIRE-Dashboard Translation Catalog.md        # +~14 lines: 7 new keys × 2 languages.

tests/unit/
├── payoffVsInvest.test.js                  # +~250 lines: 8 interaction-matrix fixtures,
│                                            #   4 Section 121 boundary cases, sell-event
│                                            #   regression locks
└── lifecyclePayoffMerge.test.js            # NEW (~150 lines): pure-function tests for
                                            #   the lifecycle handoff value computation
                                            #   (postSaleBrokerageAtFire, capGainsTax,
                                            #   homeSaleEvent shape).
```

**Structure Decision**: Single project, in-place modification of the lifecycle simulator's inline `<script>` blocks in both HTML files. Calc-module changes go to the existing `calc/payoffVsInvest.js` (extending v2 → v3). One new test file covers the calc-side handoff value; the lifecycle simulator's UI integration is verified via `quickstart.md` browser smoke (per project process lesson "Browser smoke before claiming a feature 'done'").

## Complexity Tracking

> No Constitution Check violations. This section intentionally empty.

## Risk Register

Not strictly part of the spec-kit template, but flagging for the planner:

| Risk | Likelihood | Mitigation |
|---|---|---|
| Lifecycle simulator's inline modification breaks an unrelated chart | Medium | Run full E2E browser-smoke on quickstart.md S1–S15 (extended from feature 017's S1–S9). Inspect every KPI card after every fixture toggle. |
| FIRE-age feasibility probe and chart drift apart (the feature-014 / feature-008 lesson) | Medium | The probe MUST consume the resolved mortgage strategy via the same input pipeline as the chart — verified by an explicit test: `feasibilityProbe.activeMortgageStrategy === outputs.mortgageStrategy`. |
| Section 121 calculation differs from user expectation under uncommon scenarios (rental-property carve-outs, partial-exclusions for short ownership) | Low | Spec FR-016 explicitly limits to primary-residence + full exclusion-or-no-exclusion; out-of-scope cases noted. |
| Backwards-compat regression (saved states without mortgageStrategy field) | High if untested | SC-004 + a new regression test that loads a v017-era saved state and confirms byte-identical lifecycle output. |
| Lump-sum vs. sell-at-FIRE precedence inverted | Low | FR-014 explicit; new fixture case "lump-sum trigger met post-FIRE → suppressed". |

## Post-Design Constitution Re-Check

*Performed after Phase 1 artifacts written.*

After authoring `data-model.md`, `contracts/payoffVsInvest-calc-v3.contract.md`, `contracts/lifecycle-mortgage-handoff.contract.md`, and `quickstart.md`:

- Principle II re-check: contract header in `calc/payoffVsInvest.js` is updated to v3 declaring `homeSaleEvent` output and the `postSaleBrokerageAtFire` handoff. Audit subSteps enumerated in spec FR-008 traceable to data-model.md events. ✅
- Principle VI re-check: chart renderer comments + the lifecycle simulator's input-assembly comment now declare consumed fields. ✅
- Principle VII re-check: 7 new keys with EN+zh-TW drafts in data-model.md. ✅
- Principle IX re-check: mortgage strategy threaded through `projectFullLifecycle` as an option override (consistent with feature 008's `strategyOverride` / `thetaOverride` pattern). The strategy ranker still dispatches `getActiveSortKey({mode, objective})` unchanged; the new option just flows through the lifecycle inputs. ✅

**Post-design gate result:** PASS. Proceeding to Phase 2 (`/speckit-tasks`).
