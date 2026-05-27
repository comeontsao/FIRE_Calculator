# Implementation Plan: Lifecycle Chart & Verdict Reflect the Active Winning Strategy

**Branch**: `031-lifecycle-strategy-parity` | **Date**: 2026-05-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/031-lifecycle-strategy-parity/spec.md`

## Summary

The Lifecycle chart renders during the `chartState.onChange` listener fired inside `_setCalculatedFire`
(RR `:13067`) — **before** `scoreAndRank` populates `_lastStrategyResults` (RR `:13081`) — and, unlike the
Withdrawal Strategy chart, gets no post-rank re-render. So it silently draws the default bracket-fill
strategy while every other surface draws the winner. The drag handler never re-ranks for the previewed
age. Additionally, the FIRE-age verdict is pinned to bracket-fill, and the Withdrawal Strategy tooltip
mixes nominal Book-Value bars with real-$ totals.

**Technical approach** (one source of truth, Constitution III): resolve the winning strategy once per
recalc, then render *all* strategy-dependent surfaces from it — (1) add a post-rank `renderGrowthChart`
(+ sidebar) call mirroring the existing post-rank `renderRothLadder`; (2) thread the resolved winner (for
the previewed age) into the drag-preview render; (3) make `findFireAgeNumerical`/the verdict evaluate the
displayed winner via the existing `getActiveChartStrategyOptions()` rather than pinned bracket-fill, and
stop suppressing the now-resolved divergence in `_invariantA`; (4) normalize the Withdrawal Strategy
tooltip to one frame; (5) add `_applyCashSweep` to `projectFullLifecycle`'s retirement loop. All edits
land byte-identically in both dashboards.

## Technical Context

**Language/Version**: ES2019-compatible vanilla JavaScript (classic `<script>`, no modules in HTML; UMD-classic for `calc/*.js`)  
**Primary Dependencies**: Chart.js (CDN) only — no new dependencies  
**Storage**: `localStorage` (existing keys only; no new keys this feature) + `FIRE-snapshots.csv` (untouched)  
**Testing**: Node `node --test tests/unit/*.test.js`; Playwright E2E (`tests/e2e`)  
**Target Platform**: Modern browsers, MUST work under `file://` (double-click) per Constitution V  
**Project Type**: Single-file zero-build web app (two parallel HTML dashboards) + extracted `calc/` modules  
**Performance Goals**: First meaningful chart < 1s cold; FIRE-marker drag ≥ 30 fps (Constitution perf floor)  
**Constraints**: No bundler/build step; dual-dashboard lockstep; bilingual EN+zh-TW for any new copy; preserve nominal/Book-Value frame (022), Mode×Objective orthogonality (IX), spending-funded-first (VIII), cash-sweep semantics (030)  
**Scale/Scope**: ~5 edit sites per HTML file (recalc post-rank render, drag-preview, verdict strategy threading, tooltip frame, projectFullLifecycle sweep) + audit-invariant adjustment + fixtures; two HTML files in lockstep

## Constitution Check

*GATE: evaluated against constitution v1.2.0 (9 principles).*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Dual-Dashboard Lockstep | PASS | Every edit lands in RR + Generic; lockstep audit at review. |
| II. Pure Calc Modules + Contracts | PASS | No new DOM access in calc. Sweep added to an existing sim; per-year mix stays pure. Update Consumers/contract comments where touched. |
| III. Single Source of Truth for Interactive State | **PASS — directly restored** | The feature's purpose: all retirement surfaces consume the one resolved winner. |
| IV. Gold-Standard Regression Coverage | PASS (action) | Verdict-on-winner may shift FIRE age for some scenarios; update fixtures in the same commit and document the change. New parity tests for lifecycle-vs-withdrawal strategy agreement. |
| V. Zero-Build, Zero-Dependency | PASS | No deps/build; remains file:// loadable. |
| VI. Explicit Chart ↔ Module Contracts | PASS (action) | Update renderGrowthChart / renderRothLadder comments to note they consume the resolved winner; update affected `calc` Consumers lists. |
| VII. Bilingual First-Class | PASS (action) | Tooltip fix may add/relabel a "purchasing power" string → add EN+zh-TW + Translation Catalog row. Reuse existing keys where possible. |
| VIII. Spending Funded First | PASS | Allocator unchanged; floor pass preserved. |
| IX. Mode & Objective Orthogonal | PASS | Gate change consumes the existing winner resolution; does NOT alter `getActiveSortKey`/ranking. Re-run `modeObjectiveOrthogonality.test.js` to confirm. |

**Review gates (workflow):** Gate 6 (strategyMatrix + spendingFloorPass) — not modifying `taxOptimizedWithdrawal`/`_drawByPoolOrder`/`computePerYearMix`, but run both suites as regression. Gate 7 (modeObjectiveOrthogonality) — not modifying `rankByObjective`/`getActiveSortKey`, but run as regression because the verdict path now consumes the winner.

**Complexity Tracking**: none. No new runtime dependency, build step, global mutable variable, or DOM-touching calc function is introduced.

## Project Structure

### Documentation (this feature)

```text
specs/031-lifecycle-strategy-parity/
├── plan.md              # This file
├── research.md          # Phase 0 — confirmed root cause + evidence
├── data-model.md        # Phase 1 — state/data entities
├── quickstart.md        # Phase 1 — manual verification (browser smoke)
├── contracts/
│   └── lifecycle-strategy-parity.contract.md   # Phase 1 — render-pipeline & gate contract
├── checklists/
│   └── requirements.md  # spec quality checklist
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root)

```text
FIRE-Dashboard.html              # RR — recalcAll pipeline, renderGrowthChart, renderRothLadder,
FIRE-Dashboard-Generic.html      # Generic — drag handler, findFireAgeNumerical, projectFullLifecycle
calc/
├── calcAudit.js                 # _invariantA suppression adjustment; gate recompute uses winner
├── accumulateToFire.js          # (reference — already sweeps in accumulation)
└── cashSweep.js                 # _applyCashSweep (reused, unchanged)
tests/
├── unit/                        # new lifecycle-vs-withdrawal parity tests; fixture updates;
│                                #   regression runs of strategyMatrix / spendingFloorPass /
│                                #   modeObjectiveOrthogonality / cashSweep* / calcAudit
└── e2e/                         # strategy-parity drag/render E2E
FIRE-Dashboard Translation Catalog.md   # any new/relabeled tooltip string (EN + zh-TW)
```

**Structure Decision**: Existing single-file dual-dashboard architecture is retained. The fix is
concentrated in the inline render-pipeline of both HTML files plus a targeted `calc/calcAudit.js`
adjustment; no files are created in the app itself (only spec docs and tests).

## Key edit sites (from research.md, RR; Generic mirrors ~+388 lines)

1. `recalcAll` post-rank render — add `renderGrowthChart(...)` (+ sidebar) after RR `:13128`, mirroring `renderRothLadder` at `:13122`. (FR-001, FR-002)
2. Drag-preview — RR `:14911-14922`: thread resolved winner for `_previewFireAge` (or consistently preview one strategy across all three surfaces). (FR-003)
3. FIRE-age verdict — RR `:13024-13029` / `findFireAgeNumerical` `:12053-12146`: evaluate displayed winner via `getActiveChartStrategyOptions()`. (FR-004)
4. Audit — `calc/calcAudit.js:711-714`: stop marking the lifecycle-vs-signed divergence "expected" once both consume the winner. (FR-004)
5. Tooltip — RR `:14537-14551` (+ bar series `:14429/:14434`): one frame; label purchasing power. (FR-005, VII)
6. `projectFullLifecycle` retirement loop — add `_applyCashSweep` after RR `:10843`. (FR-006)

## Phase 2 note

`/speckit-tasks` will decompose the above into TDD-ordered tasks (tests first per Constitution IV),
with explicit lockstep pairs (RR + Generic) and a manual browser-smoke gate per `quickstart.md`.
