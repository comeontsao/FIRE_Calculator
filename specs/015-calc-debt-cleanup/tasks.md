---

description: "Task list for feature 015 — Calc-Engine Debt Cleanup"
---

# Tasks: Calculation-Engine Debt Cleanup

**Input**: Design documents from `/specs/015-calc-debt-cleanup/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ (5 files) ✓, quickstart.md ✓

**Tests**: Test tasks ARE included. Constitution Principle IV (Gold-Standard Regression Coverage) is NON-NEGOTIABLE for this project, and the spec's Edge Cases section explicitly mandates "each fix gets at least one regression test pinning the new behavior."

**Organization**: Tasks are grouped by user story across three waves (A=P1, B=P2, C=P3) per the 2026-04-27 clarification that all 6 stories ship in feature 015 in priority order. Each wave closes with a Manager-driven smoke gate before the next begins.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US6)

## Path Conventions

- HTML files: `FIRE-Dashboard.html` (RR), `FIRE-Dashboard-Generic.html` (Generic) — Constitution I lockstep
- Calc modules: `calc/*.js` — pure, Node-importable
- Tests: `tests/unit/*.test.js` (Node `--test`), `tests/e2e/*.spec.ts` (Playwright)
- i18n catalog: `FIRE-Dashboard Translation Catalog.md`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Caller-audit greps and code-location discovery before any structural changes (per the "Caller-audit before extraction" lesson in CLAUDE.md > Process Lessons).

- [x] T001 [P] Run caller-audit grep `grep -rn 'signedLifecycleEndBalance' calc/ FIRE-Dashboard.html FIRE-Dashboard-Generic.html tests/` and record the call-site count in `specs/015-calc-debt-cleanup/research.md` appendix (will be referenced by Wave C deletion task T086)
- [x] T002 [P] Run caller-audit grep `grep -rn 'projectFullLifecycle' calc/ FIRE-Dashboard.html FIRE-Dashboard-Generic.html tests/` and record the call-site count in research.md appendix
- [x] T003 [P] Run caller-audit grep `grep -rn '_simulateStrategyLifetime' calc/ FIRE-Dashboard.html FIRE-Dashboard-Generic.html tests/` and record the call-site count in research.md appendix
- [x] T004 [P] Locate the `tax-optimized-search` strategy implementation (`grep -n "tax-optimized-search" calc/ FIRE-Dashboard.html`); document the file path and line range in research.md appendix (referenced by US2 tasks T031–T033)
- [x] T005 [P] Locate `findFireAgeNumerical`, `scoreAndRank`, and the FIRE-marker drag handler; document their file paths and line ranges in research.md appendix (referenced by US3 tasks T043–T047)
- [x] T006 Verify baseline test corpus is green: run `node --test tests/unit/` and `npm run test:e2e` from repo root; record the baseline pass counts (211/211 unit + 95/95 Playwright at start of feature 015 per CLAUDE.md predecessor pointer) in research.md appendix

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared infrastructure that US1, US2, US3, US4 all depend on. NO user story work begins until this phase is complete.

**⚠️ CRITICAL**: All four tasks below must complete before Phase 3 begins.

- [x] T007 Add `hasShortfall: boolean` field (initially always `false`) to the `PerYearRow` shape in whichever simulator the lifecycle chart currently calls (transitional bridge; will be wired with real computation in T014). File path determined from research.md appendix (likely `calc/projectFullLifecycle.js` or inline in HTML). Lockstep across both HTML files if inline.
- [x] T008 [P] Add pure helper `computeCumulativeFederalTax(perYearRows): number` (Math.round of sum of perYearRow.federalTax) to `calc/strategyRanker.js`; add unit test in `tests/unit/sortKeyHelpers.test.js`
- [x] T009 [P] Add pure helper `computeResidualArea(perYearRows): number` (Math.round of sum of perYearRow.total) to `calc/strategyRanker.js`; add unit test in `tests/unit/sortKeyHelpers.test.js`
- [x] T010 [P] Create canonical scenario fixtures `youngSaver`, `midCareer`, `preRetirement` plus `thetaZeroShortfall` (the user's exact bug case) in `tests/fixtures/scenarios.json`; document each scenario's expected `hasShortfall` ages and expected (Mode, Objective) winners

**Checkpoint**: Foundation ready — Wave A user stories can begin.

---

## Phase 3 — Wave A: User Story 1 (Priority: P1) 🎯 MVP

**Goal**: Shortfall years are visibly distinguished on the Full Portfolio Lifecycle chart with a red-tinted overlay + bilingual caption + matching audit table row class + Copy Debug field.

**Independent Test**: Load the `thetaZeroShortfall` fixture; verify chart paints red band over expected ages; verify caption appears in EN AND zh-TW (toggle language); verify audit table tints same rows; verify Copy Debug `audit.lifecycleProjection.rows[*].hasShortfall` matches the visual marking. On a known feasible scenario, verify ZERO red band, ZERO caption, ZERO row tinting (FR-005 false-positive guard).

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation tasks begin**

- [x] T011 [P] [US1] Write unit test in `tests/unit/shortfallVisibility.test.js`: load `thetaZeroShortfall` fixture, simulate, assert `perYearRows[i].hasShortfall === true` on expected ages and `false` elsewhere
- [-] T012 [P] [US1] Write Playwright test in `tests/e2e/shortfall-overlay.spec.ts`: load fixture, sample canvas pixels at expected shortfall ages, assert red channel > threshold; assert caption text matches EN string; toggle language, assert caption text matches zh-TW string
- [-] T013 [P] [US1] Append Playwright test to `tests/e2e/shortfall-overlay.spec.ts`: load `youngSaver` fixture (no shortfall expected), assert canvas has zero red overlay, caption is `display:none`, audit table has zero `tr.has-shortfall` elements

### Implementation for User Story 1

- [x] T014 [US1] Replace the always-false `hasShortfall` placeholder from T007 with real computation: in the simulator, mark `row.hasShortfall = true` IFF after the active strategy attempts to fund spending from every permitted pool, residual unfunded amount is `> 0`. File path from research.md appendix
- [x] T015 [P] [US1] Implement the inline `shortfallOverlayPlugin` Chart.js plugin per `contracts/shortfall-visualization.contract.md` §2 in `FIRE-Dashboard.html` (rgba(255, 80, 80, 0.18) fill; `afterDatasetsDraw` hook; per-instance registration on lifecycle chart only)
- [x] T016 [P] [US1] Implement the same inline `shortfallOverlayPlugin` in `FIRE-Dashboard-Generic.html` (lockstep — Constitution I)
- [x] T017 [P] [US1] Add `tr.has-shortfall` and `tr.has-shortfall td:first-child::before` CSS rules per orthogonality contract §3 to the `<style>` block in `FIRE-Dashboard.html`
- [x] T018 [P] [US1] Add the same CSS rules to `FIRE-Dashboard-Generic.html` (lockstep)
- [x] T019 [US1] Wire the lifecycle chart's render function in BOTH HTML files to compute `shortfallRanges` from `auditSnapshot.lifecycleProjection.rows` (contiguous-run reduction per data-model §8) and assign to `chart.options.shortfallRanges` before chart instantiation
- [x] T020 [US1] Wire the audit table renderer in BOTH HTML files to add `class="has-shortfall"` to each `<tr>` when `row.hasShortfall === true`
- [x] T021 [P] [US1] Add 5 i18n keys (`lifecycle.shortfall.caption`, `lifecycle.shortfall.tooltipPrefix`, `audit.lifecycle.shortfallColumn.title`, `audit.lifecycle.shortfallColumn.value.true`, `audit.lifecycle.shortfallColumn.value.false`) with EN values to `TRANSLATIONS.en` in BOTH HTML files
- [x] T022 [P] [US1] Add the same 5 keys with zh-TW values to `TRANSLATIONS.zh` in BOTH HTML files (per shortfall-visualization contract §4 table)
- [x] T023 [P] [US1] Add the 5 keys with both EN and zh-TW values to `FIRE-Dashboard Translation Catalog.md`
- [x] T024 [US1] Add `<div class="lifecycle-chart-caption" data-i18n="lifecycle.shortfall.caption">` immediately below the lifecycle chart in BOTH HTML files. Toggle `display: none` when `shortfallRanges.length === 0`. Lockstep
- [x] T025 [US1] Verify Copy Debug serialization includes `hasShortfall` per row in `audit.lifecycleProjection.rows[*]`. No code change required if `JSON.stringify` walks the object — but write a unit test in `tests/unit/shortfallVisibility.test.js` asserting the field is present in the serialized payload
- [x] T026 [US1] Update `calc/calcAudit.js` `Consumers:` header to list the new shortfall caption + audit row class + Copy Debug field
- [x] T027 [US1] Run T011, T012, T013, T025 — confirm all PASS. If any FAIL, fix the implementation before proceeding to US2

**Checkpoint**: US1 functional. Chart shows shortfall, audit shows shortfall, Copy Debug shows shortfall. Constitution VII (bilingual) verified by T012's language toggle.

---

## Phase 4 — Wave A: User Story 2 (Priority: P1)

**Goal**: `tax-optimized-search` θ-sweep filters infeasible candidates BEFORE ranking by lifetime federal tax. The post-hoc `hasShortfall && gate.feasible` AND-check in `scoreAndRank` becomes redundant and is removed.

**Independent Test**: On the `thetaZeroShortfall` fixture, verify `tax-optimized-search` selects `chosenTheta > 0` and `shortfallYearAges.length === 0`. Remove the `hasShortfall && gate.feasible` AND-check in scoreAndRank, run the existing 16 audit unit-test cases, assert all pass (SC-002).

### Tests for User Story 2 ⚠️

- [x] T028 [P] [US2] Write unit test in `tests/unit/thetaSweepFeasibility.test.js`: load `thetaZeroShortfall` fixture, run `tax-optimized-search` strategy, assert `chosenTheta > 0` AND `shortfallYearAges.length === 0` AND `feasibleUnderCurrentMode === true`
- [x] T029 [P] [US2] Append unit test to `tests/unit/thetaSweepFeasibility.test.js`: load an extreme low-balance scenario where ALL 11 θ candidates are infeasible; assert `feasibleUnderCurrentMode === false` AND `chosenTheta === null` AND `lowestTaxOverallTheta` is non-null
- [-] T030 [P] [US2] Append unit test to `tests/unit/thetaSweepFeasibility.test.js`: with the post-hoc AND-check removed from scoreAndRank, run all 16 existing audit unit-test fixtures from feature 014; assert ALL pass (SC-002 verification)

### Implementation for User Story 2

- [x] T031 [US2] Refactor `tax-optimized-search` strategy implementation to the 3-pass form per `contracts/theta-sweep-feasibility.contract.md` §1 (simulate all 11 θ → filter `hasShortfall === false && floorViolations.length === 0` → rank survivors by `cumulativeFederalTax` ascending → pick first). File path from T004
- [x] T032 [US2] Add diagnostic-only fields `lowestTaxOverallTheta: number | null` and `shortfallYearsAtLowestTax: number` to the strategy's PerStrategyResult output for audit display (per contract §3)
- [-] T033 [US2] Remove the post-hoc `hasShortfall && gate.feasible` AND-check from `scoreAndRank` in `calc/strategyRanker.js`. Replace with `verdict = candidate.feasibleUnderCurrentMode`
- [x] T034 [P] [US2] Add 2 i18n keys (`audit.strategyRanking.theta.feasibleLabel`, `audit.strategyRanking.theta.infeasibleLabel`) with EN + zh-TW values to BOTH HTML files' TRANSLATIONS dicts AND to `FIRE-Dashboard Translation Catalog.md` per contract §3 table
- [x] T035 [US2] Wire the audit's Strategy Ranking row template (in BOTH HTML files via `calc/calcAudit.js` consumption) to use the new feasible/infeasible labels for `tax-optimized-search` rows; placeholder interpolation via `t(key, chosenTheta, lifetimeTax)` or `t(key, lowestTaxOverallTheta, shortfallYearsAtLowestTax)`
- [x] T036 [US2] Run T028, T029, T030 — assert all PASS. If T030 fails, the post-hoc AND-check removal exposed a real bug — fix forward, do NOT re-add the AND-check

**Checkpoint**: US2 functional. The optimizer filters feasibility before tax. The downstream AND-check is gone. SC-002 satisfied.

---

## Wave A Smoke Gate

- [-] T037 [WAVE A GATE] Manager-driven 5-step browser smoke walk on BOTH `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` per CLAUDE.md > "Browser smoke before claiming a feature 'done'": (1) cold load 2-second wait, (2) every KPI card numeric, (3) zero red console errors AND zero `[<shim-name>] canonical threw:` messages, (4) drag FIRE marker → same-frame update of all dependent renderers, (5) toggle language → all new strings flip. THEN execute `quickstart.md` Wave A steps A1–A7 manually. Report PASS/FAIL to user. **STOP** before proceeding to Wave B.

---

## Phase 5 — Wave B: User Story 3 (Priority: P2)

**Goal**: Per-strategy FIRE age (Option B) eliminates oscillation by construction. Drag-skip guard preserves drag interactivity. Auto-fallback to Option A (iterate-to-convergence, cap 3 cycles) if measured budget exceeds 250ms.

**Independent Test**: Run `recalcAll` twice with no input change → byte-identical Copy Debug `audit` block (excluding `generatedAt`). Drag FIRE marker → each frame's recalc < 30ms. After release + 500ms idle → next recalc runs full per-strategy finder. Cross-strategy boundary scenario reaches stable `(fireAge, winnerStrategyId)` within ≤ 2 recalcs.

### Tests for User Story 3 ⚠️

- [x] T038 [P] [US3] Write unit test in `tests/unit/perStrategyFireAge.test.js`: 2 consecutive `recalcAll` calls with same scenario produce same `(fireAge, winnerStrategyId)` pair (FR-008)
- [x] T039 [P] [US3] Append unit test to `tests/unit/perStrategyFireAge.test.js`: cross-strategy boundary scenario; mutate one input by $10; assert system reaches stable pair within ≤ 2 recalcs (FR-008 boundary case)
- [-] T040 [P] [US3] Write Playwright test in `tests/e2e/recalc-convergence.spec.ts`: drag-skip guard — drag the FIRE marker; instrument `performance.now()` around `recalcAll`; assert each drag-frame recalc < 30ms (FR-010)
- [-] T041 [P] [US3] Append Playwright test to `tests/e2e/recalc-convergence.spec.ts`: 2 consecutive `recalcAll`s with no input change; parse Copy Debug after each; assert `audit` blocks are byte-identical excluding `generatedAt` (SC-003)
- [-] T042 [P] [US3] Append Playwright budget-measurement fixture to `tests/e2e/recalc-convergence.spec.ts`: cold-load default scenario; run 10 recalcs; record p50 and p95 of per-strategy finder time; if `p50 < 200 && p95 < 250` then `metadata.fireAgeFinderMode === 'per-strategy'`, else `'iterate-to-convergence'` (R6)

### Implementation for User Story 3

- [x] T043 [US3] Add `findPerStrategyFireAge(strategyId, scenarioInputs, mode, overlays) → {strategyId, perStrategyFireAge, perStrategyTrajectory}` function to `calc/findFireAgeNumerical.js`. Thread `strategyOverride` (and `thetaOverride` for tax-opt-search) through the existing bisection. File path from T005
- [-] T044 [US3] Refactor `recalcAll` orchestration in BOTH HTML files (lockstep): iterate over `STRATEGY_REGISTRY`, call `findPerStrategyFireAge` per strategy, populate `_lastStrategyResults.perStrategyResults[]` with the new shape from data-model §3
- [x] T045 [US3] Add `window._userDraggedFireAge: boolean` and `window._userDraggedFireAgeValue: number | undefined` flags. Wire the FIRE marker drag handler in BOTH HTML files (lockstep) to set them on drag-start/move and clear them on input change
- [x] T046 [US3] Add 500ms idle clearOnIdle timer wired into the drag-end handler in BOTH HTML files (lockstep). Cancel the timer on subsequent drag-start or input change
- [-] T047 [US3] Add the drag-skip branch to `recalcAll` in BOTH HTML files (lockstep): when `_userDraggedFireAge === true`, skip per-strategy finder, run all strategies via `simulateLifecycle()` (or current simulator) at the user-dragged age, then run ranker
- [-] T048 [US3] Implement Option A fallback `findFireAgeIterateToConvergence(scenarioInputs, mode, overlays, maxCycles = 3)` in `calc/findFireAgeNumerical.js` per per-strategy-fire-age contract §3 (cap 3 cycles, stable on 2 consecutive same pairs, fall through with last result if not converged)
- [-] T049 [US3] Add `metadata.fireAgeFinderMode: 'per-strategy' | 'iterate-to-convergence'` to AuditSnapshot in `calc/calcAudit.js`. Populate from the budget-measurement decision recorded by T042 (or default to `'per-strategy'` initially)
- [-] T050 [US3] Update audit cross-validation invariant C in `calc/calcAudit.js`: replace `displayed FIRE age === _lastStrategyResults.fireAge` with `displayed FIRE age === _lastStrategyResults.perStrategyResults[winnerRankIndex].perStrategyFireAge`
- [-] T051 [P] [US3] Add 2 i18n keys (`audit.metadata.finderMode.perStrategy`, `audit.metadata.finderMode.iterateToConvergence`) with EN + zh-TW values to BOTH HTML files' TRANSLATIONS dicts AND `FIRE-Dashboard Translation Catalog.md`
- [-] T052 [US3] Run T038–T042. If T042 fails (`p95 ≥ 250ms`), set `metadata.fireAgeFinderMode = 'iterate-to-convergence'` system-wide and re-run T038, T039, T041 against Option A; assert they still PASS

**Checkpoint**: US3 functional. No oscillation. Drag is fast. Budget-aware mode is recorded in audit.

---

## Phase 6 — Wave B: User Story 4 (Priority: P2)

**Goal**: Mode and Objective are orthogonal. The DWZ silent override of "smallest end balance" is removed. The audit's Strategy Ranking section displays the active sort key + tie-breaker chain in plain bilingual text.

**Independent Test**: Same inputs, toggle Objective under DWZ between Preserve and Minimize Tax → ≥1 row in `perYearRows` differs by ≥ $100; both end balances within $1 of $0. The audit Strategy Ranking section displays the active mode constraint + objective + primary sort + tie-breakers correctly for all 6 (Mode, Objective) cells.

### Tests for User Story 4 ⚠️

- [x] T053 [P] [US4] Write unit test in `tests/unit/modeObjectiveOrthogonality.test.js`: assert `getActiveSortKey({mode: 'dwz', objective: 'preserve'}).primary.field === 'residualArea'` (silent override removed — FR-013)
- [x] T054 [P] [US4] Append unit test to `tests/unit/modeObjectiveOrthogonality.test.js`: enumerate all 6 (Mode, Objective) cells; assert each produces the expected `ActiveSortKeyChain` per the resolution table in `contracts/mode-objective-orthogonality.contract.md` §1
- [x] T055 [P] [US4] Append unit test to `tests/unit/modeObjectiveOrthogonality.test.js`: plant 3 strategies with identical primary sort score under DWZ + Preserve; assert tie-break order is `absEndBalance` ascending then `strategyId` ascending (Acceptance Scenario 4)
- [-] T056 [P] [US4] Write Playwright test in `tests/e2e/strategy-orthogonality.spec.ts`: load default scenario in DWZ mode; toggle Objective Preserve → Minimize Tax; parse Copy Debug; assert ≥ 1 row in `perStrategyResults[winner].perStrategyTrajectory` differs by ≥ $100 between the two; assert both `endBalance` values within $1 of $0 (FR-017)
- [-] T057 [P] [US4] Append Playwright test to `tests/e2e/strategy-orthogonality.spec.ts`: cycle through all 6 (Mode, Objective) cells; assert audit Strategy Ranking section displays mode constraint + objective + primary sort + tie-breakers as text; toggle language; assert text flips to zh-TW

### Implementation for User Story 4

- [-] T058 [US4] Add `getActiveSortKey({mode, objective}) → ActiveSortKeyChain` pure function to `calc/strategyRanker.js`. Implement full 6-cell resolution table per orthogonality contract §1. Throw on unknown mode or objective
- [-] T059 [US4] Add `makeChainedComparator(chain)` helper to `calc/strategyRanker.js` per orthogonality contract §2 (walks `[primary, ...tieBreakers]`, returns first non-zero comparison)
- [x] T060 [US4] Refactor `scoreAndRank` in `calc/strategyRanker.js`: filter by `feasibleUnderCurrentMode` first; sort feasible by `makeChainedComparator(getActiveSortKey({mode, objective}))`; append infeasible at end (sorted by primary for diagnostic display); assign `rankIndex` 0..n-1. **REMOVE** the DWZ silent override branch entirely
- [-] T061 [US4] Add `auditSnapshot.strategyRanking.activeSortKey: ActiveSortKeyChain` field to `calc/calcAudit.js`. Populate by calling `getActiveSortKey({mode: currentMode, objective: currentObjective})` once per assemble
- [x] T062 [US4] Add audit Strategy Ranking section header block (4 div elements with `data-i18n` attributes per orthogonality contract §3) to BOTH HTML files (lockstep)
- [x] T063 [US4] Wire the audit Strategy Ranking section's render function in BOTH HTML files (lockstep) to populate the 4 divs from `auditSnapshot.strategyRanking.activeSortKey` using `t()` placeholder interpolation: `t(modeConstraintLabel)`, `t(objectiveLabel)`, `t('audit.strategyRanking.primarySortKey.label', t(primary.label))`, `t('audit.strategyRanking.tieBreakerChain.label', t(tieBreakers[0].label), t(tieBreakers[1].label))`
- [x] T064 [P] [US4] Add ~14 new i18n keys (3 mode constraint labels + 2 objective labels + 5 sort key labels + 4 header label templates per orthogonality contract §3 table) with EN values to `TRANSLATIONS.en` in BOTH HTML files
- [x] T065 [P] [US4] Add the same ~14 keys with zh-TW values to `TRANSLATIONS.zh` in BOTH HTML files
- [x] T066 [P] [US4] Add the ~14 keys with both EN and zh-TW values to `FIRE-Dashboard Translation Catalog.md`
- [-] T067 [US4] Define `dwzEndBalanceTolerance = Math.max(1, scenarioInputs.annualSpend / 365)` per orthogonality contract §5. Apply in the DWZ feasibility gate: `feasibleUnderCurrentMode = Math.abs(endBalance) <= dwzEndBalanceTolerance` for DWZ mode. File path: wherever the DWZ feasibility check lives (likely `calc/strategyRanker.js` or `calc/findFireAgeNumerical.js`)
- [x] T068 [US4] Run T053–T057 — assert all PASS

**Checkpoint**: US4 functional. Mode and Objective compose orthogonally. The silent override is gone. Audit displays which sort key is active for any (Mode, Objective) pair.

---

## Wave B Smoke Gate

- [-] T069 [WAVE B GATE] Manager-driven smoke walk on BOTH HTML files per CLAUDE.md 5-step gate + `quickstart.md` Wave B additions: drag release + 500ms idle re-runs finder; Mode toggle (Safe → Exact → DWZ) produces visibly different chart trajectories with same Objective; Objective toggle (Preserve → Minimize Tax) under DWZ produces visibly different chart trajectories; audit Strategy Ranking labels render bilingually for all 6 cells. Report PASS/FAIL to user. **STOP** before proceeding to Wave C.

---

## Phase 7 — Wave C: User Story 5 (Priority: P3)

**Goal**: Verify "Retire sooner / pay less tax" objective label accurately describes its behavior under US3's per-strategy architecture. If verification passes, preserve the label. If not, rename to "Minimize lifetime tax" in EN + zh-TW.

**Independent Test**: Run the verification fixture (3 scenarios × 3 modes = 9 cells). Pass if at least 1 cell shows different `displayedFireAge` between Preserve and Minimize Tax objectives. Fail → trigger conditional rename tasks.

### Tests for User Story 5 ⚠️

- [-] T070 [P] [US5] Write Playwright verification fixture per research.md R9 in `tests/e2e/objective-label-verification.spec.ts`: enumerate `youngSaver`, `midCareer`, `preRetirement` × `safe`, `exact`, `dwz`. For each cell: toggle Objective to Preserve, record `displayedFireAge_A`; toggle to Minimize Tax, record `displayedFireAge_B`. PASS if any cell has `displayedFireAge_A !== displayedFireAge_B`; else FAIL with rename instructions

### Implementation for User Story 5

- [x] T071 [US5] Run T070. If PASS: existing label is accurate; mark T072–T074 as N/A and skip to Phase 8. If FAIL: continue with the conditional rename tasks T072–T074
- [-] T072 [US5] (Conditional on T071 FAIL) Rename "Retire sooner / pay less tax" objective key in EN to "Minimize lifetime tax" in BOTH HTML files (lockstep)
- [-] T073 [US5] (Conditional on T071 FAIL) Rename the matching zh-TW value to "終身稅額最小化" in BOTH HTML files (lockstep). Update `FIRE-Dashboard Translation Catalog.md` with both new values
- [-] T074 [US5] (Conditional on T071 FAIL) Re-run all unit + Playwright tests that reference the old label string; update fixture text where the test asserts on the literal label

**Checkpoint**: US5 resolved (label preserved OR renamed).

---

## Phase 8 — Wave C: User Story 6 (Priority: P3)

**Goal**: One unified `simulateLifecycle()` simulator subsumes `signedLifecycleEndBalance`, `projectFullLifecycle`, and `_simulateStrategyLifetime`. The audit's Cross-Validation section emits zero `expected: true, reason: 'different sim contracts'` warnings. The reserved `noiseModel` parameter throws on non-null.

**Independent Test**: Every existing unit + Playwright fixture replays through the new unified simulator with byte-equivalent outputs vs the retired simulators. Audit Cross-Validation displays "All cross-checks passed." Chart per-year totals + audit per-year totals + ranker `endOfPlanNetWorthReal` agree within $1.

### Tests for User Story 6 ⚠️

- [-] T075 [P] [US6] Write parity test scaffold in `tests/unit/unifiedSimulator.test.js`: helper function takes a fixture, runs the appropriate retired simulator AND `simulateLifecycle()`, asserts byte-equivalence per `unified-simulator.contract.md` §2 tolerances (`endBalance` identical, `perYearRows[i].total` within $1, sums identical after rounding, `hasShortfall` identical, `floorViolations` identical)
- [-] T076 [P] [US6] Append parity tests in `tests/unit/unifiedSimulator.test.js`: programmatically generate one parity test per existing fixture in `tests/unit/*` and `tests/fixtures/scenarios.json`; assert all pass
- [x] T077 [P] [US6] Append unit tests in `tests/unit/unifiedSimulator.test.js`: assert `simulateLifecycle({...validInputs, noiseModel: {samples: 100}})` throws with message matching `/reserved for future Monte Carlo/`; assert `noiseModel: null` and `noiseModel: undefined` do NOT throw (FR-021 / R12)
- [-] T078 [P] [US6] Extend `tests/e2e/calc-audit.spec.ts`: assert `auditSnapshot.crossValidationWarnings.filter(w => w.expected && w.reason.includes('different sim contracts')).length === 0` on 5 representative scenarios (FR-022 / SC-006)
- [-] T079 [P] [US6] Append Playwright test to `tests/e2e/calc-audit.spec.ts`: for 10 random scenarios, parse Copy Debug; assert `Math.abs(chartLastTotal - auditLastTotal) < 1` AND `Math.abs(auditLastTotal - rankerEndBalance) < 1` (FR-023 / SC-006)

### Implementation for User Story 6

- [x] T080 [US6] Create `calc/simulateLifecycle.js` with full input/output contract per `unified-simulator.contract.md` §1 + module header §6. Pure function, deterministic (today's behavior preserved), `noiseModel` reservation enforced via early throw. Inputs/Outputs/Consumers fenced header lists finder + ranker + chart + audit
- [-] T081 [US6] Run T075–T077. If any parity test fails, expand the punch list inside `simulateLifecycle.js` until ALL pass. Do NOT proceed to T082 with any failing parity test
- [-] T082 [US6] Flip the lifecycle chart renderer's call site in BOTH HTML files (lockstep): replace `projectFullLifecycle(...)` with `simulateLifecycle(...)`. Run full test suite. If any test regresses, REVERT this task and fix the parity gap before retrying
- [-] T083 [US6] Flip `calc/calcAudit.js`'s call site: replace existing simulator calls with `simulateLifecycle()`. Run full test suite. Same regression-guard rule as T082
- [-] T084 [US6] Flip `calc/strategyRanker.js`'s call site: replace `_simulateStrategyLifetime(...)` with `simulateLifecycle({...overlays: false_for_no_overlay_path})`. Run full test suite. Same rule
- [-] T085 [US6] Flip `calc/findFireAgeNumerical.js`'s call site: replace bisection's internal sim call with `simulateLifecycle()`. Run full test suite. Same rule
- [-] T086 [US6] Caller-audit grep: confirm zero remaining call sites for `signedLifecycleEndBalance`, `projectFullLifecycle`, `_simulateStrategyLifetime` outside `calc/simulateLifecycle.js`'s comment header (referencing T001–T003 baseline counts). Record final count: should be 0
- [-] T087 [US6] Delete `calc/signedLifecycleEndBalance.js` entirely. Remove `<script src="calc/signedLifecycleEndBalance.js">` from both HTML files. Update every Inputs/Outputs/Consumers header that previously listed it
- [-] T088 [US6] Delete `calc/projectFullLifecycle.js` entirely. Remove `<script src="calc/projectFullLifecycle.js">` from both HTML files (if loaded externally) OR delete the inline `<script>` block (if inline). Update Inputs/Outputs/Consumers headers
- [-] T089 [US6] Delete `_simulateStrategyLifetime` (extracted module OR inline definition — research.md appendix from T003 will say which). Update headers
- [-] T090 [US6] Update audit Cross-Validation invariant set in `calc/calcAudit.js`: remove the `expected: true, reason: 'different sim contracts'` annotations now that they cannot fire post-consolidation
- [-] T091 [US6] Run T078, T079 — assert zero "different sim contracts" warnings AND chart/audit/ranker totals agree within $1 across 10 random scenarios. If any fail, the consolidation introduced a regression — fix forward (do NOT restore retired simulators)

**Checkpoint**: US6 functional. Three simulators consolidated into one. Cross-validation clean. `noiseModel` reserved.

---

## Wave C Smoke Gate

- [-] T092 [WAVE C GATE] Manager-driven smoke walk on BOTH HTML files per CLAUDE.md 5-step gate + `quickstart.md` Wave C additions: Cross-Validation section displays "All cross-checks passed"; chart/audit/ranker totals agree within $1; retired simulator names produce zero grep matches; `simulateLifecycle({noiseModel: {...}})` throws in DevTools console; `simulateLifecycle({noiseModel: null})` does not throw. Report PASS/FAIL to user. **STOP** before final polish.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Documentation updates, final verification, and roadmap maintenance.

- [x] T093 [P] Update `FIRE-Dashboard-Roadmap.md` with feature 015 outcomes (six structural fixes shipped; per-strategy FIRE age live OR fallback to iterate-to-convergence per T042 measurement; orthogonality of Mode and Objective restored; unified simulator consolidated; noiseModel reservation set up for future Monte Carlo)
- [x] T094 [P] Update `BACKLOG.md` to remove items resolved by feature 015 (specifically: the "θ=0 wins" bug, the FIRE-age oscillation, the DWZ silent override). Add the future Monte Carlo activation as a tracked item
- [x] T095 Run full test suite: `node --test tests/unit/` AND `npm run test:e2e`. Confirm pass counts ≥ baseline (211+ unit + 95+ Playwright + new tests from this feature). Zero regressions
- [-] T096 Execute `quickstart.md` end-to-end manually on BOTH HTML files. Final verification before merge
- [x] T097 [P] Document known followups in `FIRE-Dashboard-Roadmap.md`: (a) Monte Carlo activation referencing the `noiseModel` hook with the JSDoc-documented planned shape, (b) optional UI affordance to display `metadata.fireAgeFinderMode` to users (currently audit-only), (c) any punch-list items deferred from T082–T085 if applicable

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1; BLOCKS Phase 3+
- **Phase 3 (US1)**: Depends on Phase 2; can run in parallel with Phase 4 (US2)
- **Phase 4 (US2)**: Depends on Phase 2; can run in parallel with Phase 3 (US1)
- **Wave A Smoke Gate (T037)**: Depends on Phases 3 + 4; **BLOCKS Wave B**
- **Phase 5 (US3)**: Depends on Wave A gate; can run in parallel with Phase 6 (US4)
- **Phase 6 (US4)**: Depends on Wave A gate; can run in parallel with Phase 5 (US3)
- **Wave B Smoke Gate (T069)**: Depends on Phases 5 + 6; **BLOCKS Wave C**
- **Phase 7 (US5)**: Depends on Wave B gate (US3 must be live for verification fixture to be meaningful); should complete BEFORE Phase 8 starts (since US5 verification runs against a stable codebase)
- **Phase 8 (US6)**: Depends on Phase 7 (US5 done); can NOT run in parallel — US6 touches all simulator call sites
- **Wave C Smoke Gate (T092)**: Depends on Phase 8
- **Phase 9 (Polish)**: Depends on Wave C gate

### User Story Dependencies

- **US1 (Wave A, P1)**: Independent of US2; both depend on Foundational T007–T010
- **US2 (Wave A, P1)**: Independent of US1; both depend on Foundational T007–T010
- **US3 (Wave B, P2)**: Independent of US4; depends on Wave A complete (US1's `hasShortfall` field is consumed by US3's per-strategy result shape)
- **US4 (Wave B, P2)**: Independent of US3; depends on Wave A complete (US2's filtered θ-sweep produces the `feasibleUnderCurrentMode` field US4's ranker consumes)
- **US5 (Wave C, P3)**: Depends on Wave B complete (verification needs per-strategy FIRE age live)
- **US6 (Wave C, P3)**: Depends on Wave B complete + US5 done (consolidation should run on a stable codebase)

### Parallel Opportunities

- **Phase 1**: T001, T002, T003, T004, T005 all parallel (independent grep + doc tasks); T006 sequential after baseline check
- **Phase 2**: T008, T009, T010 parallel; T007 sequential (modifies simulator output shape that T008/T009 don't touch)
- **Phase 3 (US1)**: T011, T012, T013 (tests) all parallel. T015+T016, T017+T018, T021+T022+T023 lockstep parallel pairs/triples (different files). T014, T019, T020, T024, T025, T026, T027 sequential (depend on prior shape changes)
- **Phase 4 (US2)**: T028, T029, T030 (tests) parallel. T034 parallel with T031–T033. T035, T036 sequential
- **Phase 5 (US3)**: T038–T042 (tests) parallel. T051 parallel with T043–T050. T052 sequential at end
- **Phase 6 (US4)**: T053–T057 (tests) parallel. T064+T065+T066 lockstep parallel triple. T058–T063, T067, T068 sequential
- **Phase 8 (US6)**: T075–T079 (tests) parallel. T080 sequential. T082–T085 sequential one-at-a-time (each is a call-site flip with its own regression gate). T087, T088, T089 parallel after T086 audit
- **Phase 9 (Polish)**: T093, T094, T097 parallel. T095, T096 sequential

### Within Each User Story

- Tests written and FAIL before implementation
- Constitution I lockstep verified after every HTML-touching task
- Constitution VII bilingual verified after every i18n-key task
- Story complete (all tests + smoke walk pass) before next phase

---

## Parallel Example: User Story 1

```bash
# Launch all Phase 3 tests in parallel:
Task: "T011 [P] [US1] Unit test in tests/unit/shortfallVisibility.test.js"
Task: "T012 [P] [US1] Playwright test in tests/e2e/shortfall-overlay.spec.ts"
Task: "T013 [P] [US1] Append zero-false-positive Playwright test"

# Launch lockstep HTML pairs in parallel:
Task: "T015 [P] [US1] shortfallOverlayPlugin in FIRE-Dashboard.html"
Task: "T016 [P] [US1] shortfallOverlayPlugin in FIRE-Dashboard-Generic.html"

# Launch i18n triple in parallel:
Task: "T021 [P] [US1] EN keys in both HTML files"
Task: "T022 [P] [US1] zh-TW keys in both HTML files"
Task: "T023 [P] [US1] Translation Catalog update"
```

---

## Implementation Strategy

### MVP Scope: Wave A (US1 + US2)

The minimum viable cleanup ships US1 + US2 together. After Wave A:

- The "θ=0 wins because zero withdrawals → zero tax" pathology is closed at the root.
- Users can SEE shortfall years on the chart instead of trusting a misleading green line.
- The post-hoc `hasShortfall && gate.feasible` AND-check is gone.

Wave A alone is shippable as a release if Waves B/C need to be deferred.

### Incremental Delivery

1. **Wave A** ships → user-trust win (chart no longer lies); θ-sweep cleanup
2. **Wave B** ships → architectural correctness (no oscillation, orthogonal Mode/Objective)
3. **Wave C** ships → consolidation (one simulator) + future-proofing (noiseModel hook)

Each wave's smoke gate (T037, T069, T092) is a **STOP** point — Manager reports to user, gets explicit go-ahead before next wave begins.

### Manager Coordination

Per CLAUDE.md team structure, the Manager spawns Engineers per task type:

- **Frontend Engineer** owns: T015–T024 (US1 chart + i18n), T035 (US2 audit row template), T044–T047 (US3 drag handler + recalc orchestration), T062–T066 (US4 audit section + i18n), T072–T073 (US5 conditional rename), T082 (US6 chart call-site flip)
- **Backend Engineer** owns: T007–T009 (foundational helpers), T014 (US1 hasShortfall computation), T031–T033 (US2 strategy refactor), T043, T048–T050 (US3 finder + audit invariant), T058–T060, T067 (US4 sort key + DWZ tolerance), T080–T091 (US6 unified simulator + migration)
- **DB Engineer** owns: T010 (scenario fixtures); coordinates with Backend on Copy Debug schema additions (T025) — no localStorage / CSV changes in this feature
- **QA Engineer** owns: T011–T013, T028–T030, T038–T042, T053–T057, T070, T075–T079 (all test tasks), T036, T052, T068, T091, T095, T096 (test runs + verification)
- **Manager** owns: T001–T006 (caller audits), T037, T069, T092 (wave smoke gates), T071 (US5 PASS/FAIL decision), T093–T094, T097 (roadmap + backlog updates)

---

## Notes

- [P] tasks operate on different files OR fully-disjoint regions of the same lockstep pair (e.g., the EN dict is independent of the zh-TW dict)
- [Story] label maps each task to its user story (US1–US6); setup, foundational, gates, and polish tasks have NO story label
- Every test task is written FIRST and verified to FAIL before its corresponding implementation tasks begin (Constitution IV)
- Every HTML-touching task pairs with the lockstep counterpart in the same change set (Constitution I)
- Every new user-visible string ships with both EN and zh-TW values + Translation Catalog entry in the same commit (Constitution VII)
- The three smoke gates (T037, T069, T092) are Manager-driven and explicitly STOP for user sign-off — Engineers do not auto-proceed past a gate
- Wave C migration order (T082 → T083 → T084 → T085) is strict: each call-site flip runs the full test suite before the next; any regression triggers a revert, not a forward-fix
- The `noiseModel` reservation in T080 throws on non-null inputs; this is intentional — future Monte Carlo MUST extend the simulator explicitly, not silently no-op
- US5's outcome (T071 PASS or FAIL) is empirical — the rename tasks T072–T074 are conditional and may be skipped entirely
