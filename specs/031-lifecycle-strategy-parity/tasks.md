---
description: "Task list for feature 031 — Lifecycle Chart & Verdict Reflect the Active Winning Strategy"
---

# Tasks: Lifecycle Chart & Verdict Reflect the Active Winning Strategy

**Input**: Design documents from `specs/031-lifecycle-strategy-parity/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/lifecycle-strategy-parity.contract.md, quickstart.md

**Tests**: REQUIRED for this feature (Constitution IV — Gold-Standard Regression Coverage; contract Verification Hooks). Tests are written first and must FAIL before implementation.

**Lockstep (Constitution I)**: Every change to one dashboard MUST land identically in the other. Implementation tasks below explicitly name BOTH `FIRE-Dashboard.html` (RR) and `FIRE-Dashboard-Generic.html` (Generic). RR line numbers are from research.md; Generic mirrors ~+388 lines.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different file, no dependency on an incomplete task)
- **[Story]**: US1–US5 maps to the spec's user stories

---

## Phase 1: Setup (baseline capture)

**Purpose**: Lock the "before" state so intended changes (FIRE-age shifts, fixtures) are distinguishable from regressions.

- [ ] T001 Run `npm run test:unit` and record the baseline pass count and the names of the strategy/audit suites (`strategyMatrix`, `spendingFloorPass`, `modeObjectiveOrthogonality`, `cashSweepHelper`, `cashSweepSimulatorIntegration`, `cashSweepRrFixture`, `cashSweepAuditInvariant`, `calcAudit`) into the PR scratch notes.
- [ ] T002 [P] Capture the "before" reference for the bug scenario (RR, Exact + "Leave more behind"): the FIRE-age verdict, the winning `strategyId`, and the lifecycle Trad-401K balance at age 60, into the PR scratch notes (used to confirm the intended post-fix behavior and any deliberate FIRE-age shift).
- [ ] T003 [P] Record the current line offsets between RR and Generic at the key edit sites (`recalcAll`, `renderGrowthChart`, `renderRothLadder`, FIRE-marker drag handler, `projectFullLifecycle`, `findFireAgeNumerical`) so the implementer can locate the Generic equivalents.

---

## Phase 2: Foundational (shared test harness)

**Purpose**: Build the strategy-agreement test fixture every P1 story verifies against. BLOCKS US1–US3.

**⚠️ CRITICAL**: No user-story implementation begins until T004 exists and fails for the right reason.

- [ ] T004 Create `tests/unit/lifecycleStrategyParity.test.js` with a fixture in which a NON-bracket-fill strategy wins (e.g., Exact + "Leave more behind", large pTrad). Add a shared helper that runs the lifecycle simulation and the withdrawal-strategy simulation for the same inputs/winner and exposes per-year Trad draw + Trad balance for assertions. Leave the assertions for US1/US2/US3 to fill; commit it running (no assertions yet) so later tests extend it.

**Checkpoint**: Shared parity fixture available.

---

## Phase 3: User Story 1 — Lifecycle draws the same strategy as the Withdrawal chart (Priority: P1) 🎯 MVP

**Goal**: The Lifecycle chart consumes the resolved winner (post-rank), not the stale default bracket-fill.

**Independent Test**: For the non-default-winner fixture, the lifecycle per-year Trad balance reflects the winner's draws (declines from the winner's draw age), matching the Withdrawal Strategy chart.

### Tests (write first, must FAIL)

- [ ] T005 [P] [US1] In `tests/unit/lifecycleStrategyParity.test.js`, add a failing assertion: after a recalc where a non-bracket-fill strategy wins, the lifecycle dataset's per-year Trad balance equals the winner's running Trad balance (start + growth − winner draw) within rounding — NOT the bracket-fill trajectory. Confirm it FAILS against current code.

### Implementation

- [ ] T006 [US1] Add a post-rank `renderGrowthChart(...)` (+ the lifecycle sidebar render) immediately after `_lastStrategyResults = scoreAndRank(...)` (RR `FIRE-Dashboard.html:~13128`), mirroring the existing post-rank `renderRothLadder` at RR `:13122`. Apply identically in `FIRE-Dashboard-Generic.html` (~`:13512`). [lockstep]
- [ ] T007 [US1] Update the `renderGrowthChart` chart↔module contract comment in BOTH files to state it consumes the resolved winner (`_lastStrategyResults.winnerId` via `getActiveChartStrategyOptions()`); update any affected `Consumers:` lists (Constitution VI). [lockstep]
- [ ] T008 [US1] Run `tests/unit/lifecycleStrategyParity.test.js` → GREEN; run full `npm run test:unit` → confirm no regression vs T001 baseline (except intended).

**Checkpoint**: Lifecycle chart matches the displayed winner on every recalc — the headline fix (delivers the user's expected "balance falls from ~60" outcome via correctness).

---

## Phase 4: User Story 2 — Dragging the FIRE marker keeps surfaces in sync (Priority: P1)

**Goal**: Drag preview and commit keep Lifecycle, Withdrawal Strategy, and verdict on the same strategy for the previewed age.

**Independent Test**: Drag to several ages; all three surfaces reflect the same strategy throughout and after commit.

**Depends on**: US1 (post-rank render path).

### Tests (write first, must FAIL)

- [ ] T009 [P] [US2] Add `tests/e2e/lifecycle-strategy-parity-drag.spec.ts` (Playwright): with a non-default winner, drag the FIRE marker and assert the Lifecycle Trad series and the Withdrawal Strategy bars reflect the same strategy at the previewed age, and after release. Confirm it FAILS (or is skipped pending live server) against current code.

### Implementation

- [ ] T010 [US2] In the FIRE-marker drag-preview render (RR `:14911-14922`, esp. the `renderGrowthChart` call at `:14919`), thread the strategy resolved for `_previewFireAge` (or consistently preview one strategy across all three surfaces) so the lifecycle chart never threads a winner ranked at a different age. Apply identically in Generic (~`:15299-15310`). [lockstep]
- [ ] T011 [US2] Ensure the drag-commit path (mouseup → `recalcAll`) benefits from the US1 post-rank render (verify no separate stale render remains in the drag commit branch). Confirm in both files. [lockstep]
- [ ] T012 [US2] Run the drag E2E against a live server (`python -m http.server`) → GREEN for both dashboards.

**Checkpoint**: No mid-drag or post-commit divergence between the three surfaces.

---

## Phase 5: User Story 3 — Verdict judged on the displayed winner (Priority: P1)

**Goal**: The Safe/Exact/DWZ FIRE-age verdict evaluates the displayed winner, not pinned bracket-fill; audit stops suppressing the divergence.

**Independent Test**: For each Mode on a non-default-winner scenario, the verdict's feasibility + FIRE age are computed on the winner, and the verdict-vs-chart parity invariants pass on agreement.

**Depends on**: US1 (winner resolved before consumers).

### Tests (write first, must FAIL)

- [ ] T013 [P] [US3] In `tests/unit/lifecycleStrategyParity.test.js` (or a new `tests/unit/verdictStrategyParity.test.js`), add failing assertions: for the non-default-winner fixture, `findFireAgeNumerical`/`isFireAgeFeasible` evaluate the winner's trajectory (via `getActiveChartStrategyOptions()`) under each of Safe/Exact/DWZ. Confirm FAIL against current pinned-bracket-fill code.
- [ ] T014 [P] [US3] Add a failing assertion in `tests/unit/calcAudit.test.js`: `_invariantA` does NOT mark a lifecycle-vs-signed end-balance divergence as `expected` once both consume the winner (genuine agreement passes; genuine divergence flags). Confirm FAIL.

### Implementation

- [ ] T015 [US3] Make the FIRE-age search / verdict consume the displayed winner via `getActiveChartStrategyOptions()` (+ `getActiveMortgageStrategyOptions()`) instead of the pinned bracket-fill at RR `:13024-13029` / `findFireAgeNumerical` `:12053-12146`. Preserve Mode semantics (Safe/Exact/DWZ end-state) and Objective-as-sort-key (Constitution IX). Apply identically in Generic. [lockstep]
- [ ] T016 [US3] In `calc/calcAudit.js` (`_invariantA`, ~`:711-714`), remove the `strategyMismatch` → `expected = true` suppression for the lifecycle-vs-signed divergence now that both consume the winner; keep genuine-divergence flagging.
- [ ] T017 [US3] Update gold-standard fixtures for any intended FIRE-age shift caused by judging on the winner; document each change in the commit body (Constitution IV).
- [ ] T018 [US3] Regression: run `tests/unit/modeObjectiveOrthogonality.test.js`, `strategyMatrix.test.js`, `spendingFloorPass.test.js` → all GREEN (confirm ranking/allocator semantics unchanged). Run the US3 tests → GREEN.

**Checkpoint**: Verdict and charts can never describe different strategies; gates remain the gatekeeper, now on the displayed strategy.

---

## Phase 6: User Story 4 — Withdrawal Strategy tooltip reconciles (Priority: P2)

**Goal**: One frame per tooltip; purchasing power labeled as a comparison.

**Independent Test**: Per-pool draw lines sum to the displayed total within rounding; purchasing-power labeled; label translates EN↔中文.

**Independent of US1–US3** (different code region — `renderRothLadder` tooltip).

### Tests (write first, must FAIL)

- [ ] T019 [P] [US4] Add `tests/unit/withdrawalTooltipFrame.test.js`: for a per-year mix, the tooltip's per-pool lines and the "total drawn" line are in the same frame and reconcile within rounding (extract the tooltip number assembly into a pure helper if needed to test without the DOM). Confirm FAIL.

### Implementation

- [ ] T020 [US4] In `renderRothLadder`'s tooltip (RR `:14537-14551`, bar series `:14429/:14434`), make `afterBody` "Total drawn" and per-pool lines share one frame (all Book-Value or all real-$), and present purchasing power as a clearly labeled comparison. Apply identically in Generic (~`:14929`). [lockstep]
- [ ] T021 [US4] Add/relabel the purchasing-power tooltip string with EN + zh-TW in BOTH HTML `TRANSLATIONS` dicts and add the row to `FIRE-Dashboard Translation Catalog.md` (Constitution VII). [lockstep]
- [ ] T022 [US4] Run `tests/unit/withdrawalTooltipFrame.test.js` → GREEN.

**Checkpoint**: Tooltip numbers reconcile and the frame is unambiguous.

---

## Phase 7: User Story 5 — Cash-sweep parity in projectFullLifecycle (Priority: P3)

**Goal**: `projectFullLifecycle`'s retirement loop runs the feature-030 cash-sweep like the other five simulators.

**Independent Test**: With sweep enabled, retirement-year cash/stocks match the other sims per age; `_invariantF` green. Default OFF unchanged.

**Independent of US1–US4** (different code region — `projectFullLifecycle` retirement loop).

### Tests (write first, must FAIL)

- [ ] T023 [P] [US5] Extend `tests/unit/cashSweepSimulatorIntegration.test.js` (or `cashSweepAuditInvariant.test.js`): assert `projectFullLifecycle`'s retirement years apply the sweep so post-sweep (pCash, pStocks) match the other simulators per age. Confirm FAIL.

### Implementation

- [ ] T024 [US5] Add the `_applyCashSweep(...)` call to `projectFullLifecycle`'s retirement loop after all flows (RR `:~10843`), matching the other five sweep sites' invocation and frame. Apply identically in Generic. [lockstep]
- [ ] T025 [US5] Run `tests/unit/cashSweep*.test.js` and the `_invariantF` parity test → GREEN; confirm default-OFF behavior is byte-unchanged.

**Checkpoint**: All six simulators sweep consistently.

---

## Phase 8: Polish & Cross-Cutting

- [ ] T026 [P] Update chart↔module contract comments and `Consumers:` lists for `renderGrowthChart`, `renderRothLadder`, `findFireAgeNumerical`, and `projectFullLifecycle` in both files (Constitution VI).
- [ ] T027 Lockstep audit: diff the RR and Generic edit regions; confirm byte-identical insertions (record the +N / +N line delta) before merge (Constitution I).
- [ ] T028 Run the FULL suite `npm run test:unit` → all GREEN; explicitly include review-gate 6 (`strategyMatrix`, `spendingFloorPass`) and gate 7 (`modeObjectiveOrthogonality`).
- [ ] T029 Update `FIRE-Dashboard-Roadmap.md` to mark feature 031 complete (workflow review gate 5).
- [ ] T030 Manual browser smoke per `specs/031-lifecycle-strategy-parity/quickstart.md` on BOTH dashboards (Manager-executed merge gate): age-60 Trad decline, no manual-toggle dependency, drag sync, verdict-on-winner per Mode, tooltip reconciliation + EN↔中文, console hygiene.

---

## Dependencies & Execution Order

- **Setup (T001–T003)**: no dependencies.
- **Foundational (T004)**: after Setup; BLOCKS US1–US3.
- **US1 (T005–T008)**: after Foundational. The MVP and a prerequisite for US2 and US3 (winner must be resolved/consumed first).
- **US2 (T009–T012)**: after US1.
- **US3 (T013–T018)**: after US1.
- **US4 (T019–T022)**: independent (different region) — may proceed in parallel with US1–US3 by a separate engineer, but is same-file as US1–US3 so coordinate merges.
- **US5 (T023–T025)**: independent (different region) — same caveat as US4.
- **Polish (T026–T030)**: after all desired stories; T030 is the final manual merge gate.

### Parallel opportunities

- T002, T003 in parallel (Setup).
- All test-authoring tasks (T005, T009, T013, T014, T019, T023) are in separate test files → [P].
- US4 and US5 touch disjoint code regions from US1–US3; with the multi-agent dispatch pattern, one engineer can own the recalc-pipeline cluster (US1→US3) while another owns US4 (tooltip) and a third owns US5 (sweep) — provided merges into the two HTML files are coordinated to avoid same-file conflicts.

## Implementation Strategy

- **MVP** = Phase 1 + 2 + US1. Stop and validate: Lifecycle chart matches the winner (Trad falls from ~60). This alone resolves the user's reported symptom.
- **Then** US3 (verdict integrity — the user's explicit gatekeeper concern), US2 (drag), US4 (tooltip), US5 (sweep), each independently testable.
- Recommended at implement time: multi-agent dispatch (Backend owns recalc pipeline + verdict + sweep calc; Frontend owns tooltip + i18n + drag wiring; QA owns the parity tests + E2E + browser smoke), each given this tasks.md, the contract, and exact edit sites.

## Notes

- Verify each test FAILS before implementing (Constitution IV / TDD).
- Commit after each task or logical group; keep RR + Generic edits in the same commit (lockstep).
- Any FIRE-age verdict change from US3 is intended — document it; it is not a regression.
