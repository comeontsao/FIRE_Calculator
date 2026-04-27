# Implementation Plan: Calculation-Engine Debt Cleanup

**Branch**: `015-calc-debt-cleanup` | **Date**: 2026-04-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/015-calc-debt-cleanup/spec.md`

## Summary

Six structural fixes to the calc engine, shipped together in priority order P1 → P3. The fixes eliminate the "θ=0 wins because zero withdrawals → zero tax" pathology (US1 + US2), eliminate the FIRE-age ↔ strategy oscillation by adopting per-strategy FIRE ages (US3 Option B with measured fallback to Option A), restore the orthogonality of Mode and Objective so DWZ no longer silently overrides the user's path-shape choice (US4 Option E), align objective labels with actual behavior (US5), and consolidate the three simulators behind one unified entry point with a reserved `noiseModel` hook for future Monte Carlo (US6 Option A).

The work is sequenced in three waves inside this feature:

- **Wave A (P1) — US1 + US2**: shortfall visibility on the chart + audit + Copy Debug; θ-sweep feasibility-first.
- **Wave B (P2) — US3 + US4**: per-strategy FIRE age finder with drag-skip guard; Mode/Objective orthogonal sort-key dispatch.
- **Wave C (P3) — US5 + US6**: objective label verification + conditional rename; single unified simulator replacing `signedLifecycleEndBalance`, `projectFullLifecycle`, and `_simulateStrategyLifetime`.

Zero new runtime dependencies. All changes ship to both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` in lockstep. Every new user-visible string (US1 caption, US4 audit labels, US5 rename if it fires) ships with EN + zh-TW.

## Technical Context

**Language/Version**: JavaScript (ES2020+), HTML5, CSS3 — single-file HTML app
**Primary Dependencies**: Chart.js (existing, CDN). No new runtime dependencies.
**Storage**: None new. No localStorage schema changes (Out of Scope).
**Testing**: Node `--test` for pure calc modules (`calc/*.js` + `tests/unit/*.test.js`); Playwright for E2E (`tests/e2e/*.spec.ts`).
**Target Platform**: Modern browsers (Chrome / Edge / Firefox / Safari), desktop + mobile (≤767px), `file://` supported.
**Project Type**: Single-file HTML web application — zero build step (Constitution V).
**Performance Goals**: Recalc budget ≤ 250ms for the user's default scenario (FR-012). Drag interaction sustains ≥ 30 fps (constitution Performance Floor). US3 Option B's per-strategy finder MUST be measured against the 250ms budget BEFORE adoption is finalized; if exceeded, fall back to Option A (iterate-to-convergence, cap 3 cycles).
**Constraints**:
- Lockstep across both HTML files (Principle I).
- Bilingual EN + zh-TW for every new user-visible string (Principle VII).
- Backward compat for prior Copy Debug payloads (no key removals; `audit.lifecycleProjection.rows` GAINS a `hasShortfall` boolean — additive only).
- Three simulators (`signedLifecycleEndBalance`, `projectFullLifecycle`, `_simulateStrategyLifetime`) are RETIRED in Wave C; their public call sites migrate to the new unified `simulateLifecycle(...)` entry point preserving byte-equivalent outputs for existing fixtures.
- The unified simulator's input contract reserves a `noiseModel` parameter (default `null` = deterministic). NO noise sampling code ships in 015.
**Scale/Scope**:
- 6 user stories, 23 functional requirements, 9 success criteria.
- ~5 calc-module touch points: `calc/strategyRanker.js` (or wherever `scoreAndRank` lives today — verify in research), `calc/findFireAgeNumerical.js`, `calc/projectFullLifecycle.js`, `calc/signedLifecycleEndBalance.js`, plus a NEW `calc/simulateLifecycle.js` (the unified entry).
- ~2 new HTML touch points per dashboard: lifecycle chart shortfall overlay rendering + caption; audit-tab Strategy Ranking section labels + per-row shortfall row class (already partially exists from feature 014).
- ~6–10 new i18n key pairs (US1 caption + variants; US4 audit Strategy Ranking section labels for active sort key + tie-breaker chain + mode constraint; US5 conditional rename if verification fails).
- ~4–6 new regression test files (per-story).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against the 7 principles in `.specify/memory/constitution.md` v1.1.0.

| Principle | Status | Justification |
|-----------|--------|---------------|
| **I. Dual-Dashboard Lockstep (NON-NEGOTIABLE)** | ✅ PASS | Every UI change (US1 chart overlay + caption; US4 audit Strategy Ranking labels; US5 conditional rename) lands in both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` in the same change set. Lockstep verified by an automated DOM-diff Playwright test on the touched regions, plus the parity fixture cases per Principle IV. |
| **II. Pure Calculation Modules with Declared Contracts** | ✅ PASS | The new `calc/simulateLifecycle.js` (US6) is a pure module: inputs are `{scenarioInputs, fireAge, planAge, strategyOverride, thetaOverride, overlays, noiseModel}`; outputs are `{perYearRows[], endBalance, hasShortfall, shortfallYearAges[], floorViolations[]}`. Standard `Inputs / Outputs / Consumers` fenced header lists `findFireAgeNumerical`, `scoreAndRank`, lifecycle chart renderer, and `calc/calcAudit.js`. The retired simulators are deleted in Wave C only after all call sites are migrated and fixtures stay byte-equivalent. |
| **III. Single Source of Truth for Interactive State** | ✅ PASS | US3 centralizes per-strategy FIRE age computation — each strategy publishes `{strategyId, perStrategyFireAge, perStrategyTrajectory}` once into `_lastStrategyResults`; chart, audit, KPI cards all read from there. `getActiveChartStrategyOptions()` is retired or reduced to a getter on the centralized state. US4 unifies sort-key resolution: one `getActiveSortKey({mode, objective})` function returns the active primary sort + tie-breaker chain, consumed by the ranker and the audit's Strategy Ranking section identically. |
| **IV. Gold-Standard Regression Coverage (NON-NEGOTIABLE)** | ✅ PASS | Each story ships with regression fixtures (Edge Cases bullet "Test coverage"). US1: planted shortfall scenario asserts `hasShortfall === true` on N specific rows. US2: planted θ-sweep scenario asserts `chosenTheta > 0` and `shortfallYears === 0`. US3: 2-recalc convergence fixture; cross-strategy boundary fixture. US4: same-input-different-objective DWZ fixture asserting trajectories differ ≥ $100 on at least one row AND `endBalance ≈ $0`. US5: verification fixture covering both label-keep and label-rename paths. US6: parity fixtures replaying every Wave A+B test case against the unified simulator with byte-equivalent outputs. SC-007 retains all 211 unit + 95 Playwright tests passing. |
| **V. Zero-Build, Zero-Dependency Delivery** | ✅ PASS | The shortfall overlay (US1) is implemented as a custom Chart.js plugin defined inline in the HTML files — no new CDN, no annotation-plugin dependency. The unified simulator is plain JS. No bundler, no transpiler, no build step. |
| **VI. Explicit Chart ↔ Module Contracts** | ✅ PASS | The lifecycle chart's render function (in both HTML files) gains a comment header listing the new shortfall overlay's data source (`auditSnapshot.lifecycleProjection.rows[i].hasShortfall`). The audit Strategy Ranking section's render function declares it consumes `auditSnapshot.strategyRanking.activeSortKey` (NEW field). `calc/simulateLifecycle.js`'s `Consumers:` header names every consumer: chart renderer, audit assembler, finder, ranker. |
| **VII. Bilingual First-Class — EN + zh-TW (NON-NEGOTIABLE)** | ✅ PASS | New i18n keys (US1 caption, US4 audit Strategy Ranking active-sort-key labels, US5 conditional rename) ship with EN + zh-TW values in BOTH HTML files' `TRANSLATIONS` dicts AND in `FIRE-Dashboard Translation Catalog.md` in the same commit. No hardcoded English in any new DOM text or template literal. |

**Result:** All gates PASS. No `Complexity Tracking` entries required.

## Project Structure

### Documentation (this feature)

```text
specs/015-calc-debt-cleanup/
├── plan.md              # This file
├── research.md          # Phase 0 — design decisions
├── data-model.md        # Phase 1 — sort-key entities + per-strategy result shape + unified-sim contract
├── quickstart.md        # Phase 1 — manual verification walkthrough per wave
├── contracts/
│   ├── shortfall-visualization.contract.md     # US1 — chart overlay + audit row class + Copy Debug shape
│   ├── theta-sweep-feasibility.contract.md     # US2 — tax-optimized-search filter-then-rank API
│   ├── per-strategy-fire-age.contract.md       # US3 — per-strategy finder + drag-skip + budget fallback
│   ├── mode-objective-orthogonality.contract.md # US4 — sort-key dispatch + audit labels
│   └── unified-simulator.contract.md           # US6 — simulateLifecycle() input/output + noiseModel hook
├── checklists/
│   └── requirements.md  # Spec quality checklist (already passes)
└── tasks.md             # Phase 2 — generated by /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
FIRE-Dashboard.html              # RR — Wave A overlay + caption; Wave B audit labels; Wave C simulator wiring
FIRE-Dashboard-Generic.html      # Generic — same as RR (lockstep)
FIRE-Dashboard Translation Catalog.md   # ~6–10 new key pairs documented
calc/
├── tabRouter.js                 # (existing — feature 013)
├── ssEarningsRecord.js          # (existing — feature 012)
├── calcAudit.js                 # (existing — feature 014; gains `audit.strategyRanking.activeSortKey` field for US4)
├── simulateLifecycle.js         # NEW (Wave C) — unified pure simulator; consumers: finder, ranker, chart, audit
├── findFireAgeNumerical.js      # MODIFIED (Wave B) — per-strategy entry; drag-skip guard; consumes simulateLifecycle
├── strategyRanker.js            # MODIFIED (Wave B) — sort-key dispatch by Objective; orthogonal to Mode
├── strategyTaxOptSearch.js      # MODIFIED (Wave A) — θ-sweep filters infeasible candidates BEFORE ranking by tax
└── (retired in Wave C: signedLifecycleEndBalance, _simulateStrategyLifetime, projectFullLifecycle internals merged into simulateLifecycle.js)
tests/
├── unit/
│   ├── shortfallVisibility.test.js    # NEW — US1 fixture: planted shortfall scenario asserts hasShortfall row flags
│   ├── thetaSweepFeasibility.test.js  # NEW — US2 fixture: filter-then-rank produces chosenTheta > 0 + shortfallYears === 0
│   ├── perStrategyFireAge.test.js     # NEW — US3 fixture: 2-recalc convergence + drag-skip behavior
│   ├── modeObjectiveOrthogonality.test.js # NEW — US4 fixture: same-input-different-objective DWZ trajectories differ
│   ├── unifiedSimulator.test.js       # NEW — US6 fixture: parity vs the three retired simulators
│   ├── calcAudit.test.js              # MODIFIED — US4: assert activeSortKey field; US1: assert hasShortfall propagation
│   └── (existing) shims.test.js, ssEarningsRecord.test.js, tabRouter.test.js, etc.
└── e2e/
    ├── shortfall-overlay.spec.ts      # NEW — US1 visual: red-fill overlay + caption + audit row class
    ├── strategy-orthogonality.spec.ts # NEW — US4 behavior: DWZ + Preserve vs DWZ + Minimize Tax differ
    ├── recalc-convergence.spec.ts     # NEW — US3 stability: 2-recalc identical Copy Debug audit blocks
    ├── (existing) calc-audit.spec.ts, tab-navigation.spec.ts, file-protocol.spec.ts, responsive-header.spec.ts
```

**Structure Decision**: Continue the established pattern — calc modules live as classic-script files in `calc/` (Node-importable for unit tests, included via `<script src="calc/...">` in both HTML files). Wave C consolidates three simulators into one new pure module `calc/simulateLifecycle.js` and retires the other two only after byte-parity is verified across all migrated fixtures. The HTML files only gain UI wiring (chart overlay plugin definition, audit labels, i18n keys) — no inline calc logic is added.

## Phase 0 — Outline & Research

See [research.md](./research.md). Key resolved questions:

1. **US1 — Chart.js shortfall overlay rendering**: implemented as an inline custom Chart.js plugin (no `chartjs-plugin-annotation` CDN added — Constitution V). Plugin paints a `rgba(255, 80, 80, 0.18)` vertical band over the canvas region corresponding to shortfall year ranges. Plugin reads from `chart.options.shortfallRanges = [{xMin: age, xMax: age}, ...]` set per-recalc by the chart's render function from `auditSnapshot.lifecycleProjection.rows`.

2. **US1 — Audit row class location**: feature 014 already renders the per-year Lifecycle Projection table; Wave A adds a `has-shortfall` CSS class to `<tr>` elements when `row.hasShortfall === true`. Tint matches the chart's overlay (`rgba(255, 80, 80, 0.10)` for the row to keep text legible).

3. **US2 — θ-sweep filter point**: the sweep lives inside the `tax-optimized-search` strategy implementation. The current shape is "for each θ in 11 values, simulate, push result, sort by lifetimeFederalTax ascending, pick first." The fix splits into two passes: pass 1 simulate all 11, pass 2 filter `where r.hasShortfall === false && r.floorViolations.length === 0`, pass 3 sort survivors by tax, pick first. If pass 2 yields zero survivors, the strategy reports `feasibleUnderCurrentMode: false` and stores the lowest-tax overall candidate's θ in a diagnostic-only field.

4. **US3 — Per-strategy FIRE age algorithm**: `findFireAgeNumerical` becomes a per-strategy function — for each strategy in `STRATEGY_REGISTRY`, run the existing bisection over candidate ages with that strategy's options threaded through. Output: `{[strategyId]: perStrategyFireAge}` map. The dashboard's displayed FIRE age is the winner's `perStrategyFireAge` (winner selected by ranker per US4 sort-key dispatch).

5. **US3 — Drag-skip guard**: the FIRE marker drag handler sets `window._userDraggedFireAge = true` (and clears it on input change). When `recalcAll` runs, if `_userDraggedFireAge === true`, the per-strategy finder is skipped entirely — all strategies share the user-dragged age. The ranker still runs at that age. This decouples drag interactivity (≥ 30fps target) from finder cost.

6. **US3 — Budget measurement**: instrument `recalcAll` with `performance.now()` markers around the per-strategy finder call. Measure 10 cold runs of the user's default scenario (4 strategies × bisection). Threshold: median < 200ms (50ms headroom on the 250ms budget). If exceeded, automatically fall back to Option A (iterate-to-convergence, cap 3 cycles, stable when 2 consecutive cycles produce same `(fireAge, winnerStrategyId)`).

7. **US4 — Sort-key dispatch**: introduce `getActiveSortKey({mode, objective}) → {primary: SortKey, tieBreakers: [SortKey, SortKey]}` where `SortKey = {field, direction, label}`. Mode contributes only the feasibility filter (Safe/Exact/DWZ end-state constraint); Objective contributes the sort. The "smallest end balance" silent override under DWZ is removed; "smallest end balance" survives only as a generic tie-breaker available to any sort key.

8. **US4 — `residualArea` formula**: `residualArea = sum(perYearRow.total) for years from FIRE age inclusive through plan age exclusive`. Higher = more wealth on books across more years. Single scalar, deterministic, $1-precision (rounded to nearest dollar to avoid floating-point tie-flicker).

9. **US4 — `cumulativeFederalTax` formula**: `cumulativeFederalTax = sum(perYearRow.federalTax) for years from FIRE age inclusive through plan age exclusive`. Lower = better. $1-precision rounding.

10. **US5 — Verification protocol**: after Wave B ships, plant 3 realistic scenarios (young saver / mid-career / pre-retirement). Toggle Objective between "Preserve estate" and "Minimize lifetime tax" with each Mode. If at least one of the 3 × 3 = 9 cells produces a different `displayed FIRE age` between the two objectives, the existing label is preserved. If zero cells differ, rename to "Minimize lifetime tax" in EN + zh-TW.

11. **US6 — Unified simulator API**: `simulateLifecycle({scenarioInputs, fireAge, planAge, strategyOverride, thetaOverride, overlays: {mortgage, college, home2}, noiseModel = null}) → {perYearRows[], endBalance, hasShortfall, shortfallYearAges[], floorViolations[], cumulativeFederalTax, residualArea}`. The three retired simulators are eliminated only after every test case in `tests/unit/` and `tests/e2e/` produces byte-equivalent results against the unified entry.

12. **US6 — Migration order**: (a) write the unified simulator alongside the three existing ones, (b) write parity tests asserting byte-equivalent outputs for every existing fixture, (c) flip call sites one at a time (chart first, then audit, then ranker, then finder), (d) delete the three retired simulators only when all call sites are flipped AND parity tests stay green.

13. **US6 — `noiseModel` reservation**: the parameter exists in the function signature with a `JSDoc` comment specifying the planned shape: `{returns: {distribution: 'normal' | 'lognormal', mean: number, std: number}, inflation: {...}, lifespan: {...}}`. The function body asserts `noiseModel === null` and throws if non-null is passed (so future Monte Carlo code is forced to extend the simulator explicitly, not silently no-op).

14. **Wave-by-wave smoke gate**: each wave (A → B → C) closes with a Manager-driven browser smoke walk on both HTML files (the standard 5-step gate from `CLAUDE.md > Browser smoke before claiming a feature "done"`) BEFORE the next wave begins. This bounds blast radius if Wave A's chart plugin breaks something Wave B would have to debug around.

**Output:** [research.md](./research.md) with all decisions resolved.

## Phase 1 — Design & Contracts

### Entities → [data-model.md](./data-model.md)

- **`SortKey`**: `{field: 'residualArea' | 'cumulativeFederalTax' | 'endBalance' | 'absEndBalance' | 'strategyId', direction: 'asc' | 'desc', label: string}` — the atomic unit of sort-key dispatch.
- **`ActiveSortKeyChain`**: `{primary: SortKey, tieBreakers: [SortKey, SortKey], modeConstraintLabel: string, objectiveLabel: string}` — published into `auditSnapshot.strategyRanking.activeSortKey` for the audit's plain-text display (FR-016).
- **`PerStrategyResult`**: `{strategyId, perStrategyFireAge, perStrategyTrajectory: PerYearRow[], endBalance, hasShortfall, shortfallYearAges, floorViolations, cumulativeFederalTax, residualArea, feasibleUnderCurrentMode: boolean, sortScore: number}` — one entry per strategy in `_lastStrategyResults.perStrategyResults[]`.
- **`PerYearRow`**: existing entity from feature 014; GAINS a new field `hasShortfall: boolean` (FR-004).
- **`SimulateLifecycleInputs`** / **`SimulateLifecycleOutput`**: input/output contracts for `calc/simulateLifecycle.js` per FR-020 / FR-021.
- **`LifecycleChartRenderHints`**: `{shortfallRanges: [{xMin: number, xMax: number}], captionKey: string | null}` — passed via `chart.options` so the inline plugin can paint correctly without re-querying the audit snapshot.

### Contracts → [contracts/](./contracts/)

- **`shortfall-visualization.contract.md`** — Wave A. Defines: the inline Chart.js plugin's API surface, the `has-shortfall` CSS class, the bilingual caption keys, the `auditSnapshot.lifecycleProjection.rows[].hasShortfall` Copy Debug field shape, the false-positive guard for zero-shortfall scenarios.
- **`theta-sweep-feasibility.contract.md`** — Wave A. Defines: the new 3-pass θ-sweep API (simulate → filter → rank), the `feasibleUnderCurrentMode` semantics when zero candidates survive, the diagnostic-only `lowestTaxOverallTheta` field for the audit.
- **`per-strategy-fire-age.contract.md`** — Wave B. Defines: `findPerStrategyFireAge(strategyId, scenarioInputs, mode) → age`, the `_lastStrategyResults.perStrategyResults[].perStrategyFireAge` field, the `_userDraggedFireAge` global flag, the budget-measurement protocol with the auto-fallback to Option A (cap 3 cycles).
- **`mode-objective-orthogonality.contract.md`** — Wave B. Defines: `getActiveSortKey({mode, objective}) → ActiveSortKeyChain`, the `auditSnapshot.strategyRanking.activeSortKey` field shape, the residualArea + cumulativeFederalTax formula precision rules ($1 rounding), the deterministic tie-breaker chain.
- **`unified-simulator.contract.md`** — Wave C. Defines: `simulateLifecycle(...)` signature with the `noiseModel` reservation (default `null`, throws on non-null), the migration sequence (write alongside, parity-test, flip call sites, delete retired sims), the byte-equivalence acceptance criteria for parity, the `Consumers:` list naming finder + ranker + chart + audit.

### Quickstart → [quickstart.md](./quickstart.md)

Step-by-step manual verification organized by wave:

- **Wave A** (US1 + US2): plant the user's θ=0 shortfall scenario, observe red overlay on lifecycle chart + caption + Audit table row tinting; verify Copy Debug `audit.lifecycleProjection.rows[*].hasShortfall` matches; verify `tax-optimized-search` selects θ > 0 in the same scenario; verify audit Strategy Ranking row shows `chosenTheta > 0` and `shortfallYears === 0`.
- **Wave B** (US3 + US4): run `recalcAll` twice with no input change, verify byte-identical Copy Debug `audit` blocks; toggle Objective between Preserve / Minimize Tax under DWZ, verify per-year trajectories differ on at least one row by ≥ $100 AND both reach `endBalance ≈ $0`; verify the audit's Strategy Ranking section text labels the active sort key + tie-breaker chain + mode constraint.
- **Wave C** (US5 + US6): run the verification fixture for US5; verify final audit's Cross-Validation section emits zero `expected: true` warnings about "different sim contracts"; verify chart per-year totals match audit per-year totals match `endOfPlanNetWorthReal` within $1.

### Agent context update

Update the SPECKIT block in `CLAUDE.md` to point Active feature at `015-calc-debt-cleanup` (link to plan + spec + tasks).

**Output:** data-model.md, contracts/*.md, quickstart.md, CLAUDE.md SPECKIT block updated.

## Post-Design Constitution Re-check

Re-evaluating the 7 principles after Phase 1 design:

- **I.** ✅ Both HTML files modified in lockstep across all three waves. Lockstep DOM-diff E2E test in `tests/e2e/strategy-orthogonality.spec.ts` covers Wave B's audit-section change; existing feature 014 lockstep tests cover the audit table changes from Wave A.
- **II.** ✅ All calc changes happen in pure modules: `calc/simulateLifecycle.js` (NEW), `calc/strategyRanker.js` (MODIFIED — sort-key dispatch is a pure helper), `calc/findFireAgeNumerical.js` (MODIFIED — per-strategy entry is pure), `calc/strategyTaxOptSearch.js` (MODIFIED — 3-pass filter is pure). All have `Inputs / Outputs / Consumers` fenced headers.
- **III.** ✅ `_lastStrategyResults.perStrategyResults[]` is the canonical per-strategy state; chart, audit, KPI cards all read from there. `getActiveSortKey()` is the single sort-key resolver consumed identically by ranker and audit.
- **IV.** ✅ Six new regression tests (one per story) pin each fix's behavior. Wave C parity tests assert byte-equivalence vs the retired simulators on every existing fixture before deletion. SC-007 retains 211 unit + 95 Playwright.
- **V.** ✅ Zero new runtime dependencies. The shortfall overlay is an inline custom Chart.js plugin, NOT `chartjs-plugin-annotation`. No bundler, no transpiler.
- **VI.** ✅ Lifecycle chart's render comment lists the new shortfall overlay's data source. Audit Strategy Ranking section's render comment lists `auditSnapshot.strategyRanking.activeSortKey`. `calc/simulateLifecycle.js` `Consumers:` header names finder + ranker + chart + audit.
- **VII.** ✅ All new strings (US1 caption + variants; US4 audit Strategy Ranking labels for active sort key, mode constraint, tie-breaker chain; US5 conditional rename keys) ship with EN + zh-TW values in both HTML files' `TRANSLATIONS` dicts AND in `FIRE-Dashboard Translation Catalog.md` in the same commit.

**Result:** Post-design check still PASSES. No violations introduced during design.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. Section intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| (none)    | (none)     | (none)                               |
