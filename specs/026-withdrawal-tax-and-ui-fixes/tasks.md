---

description: "Task list for feature 026 — withdrawal-strategy tax investigation + header-zoom and FIRE-month display fixes"
---

# Tasks: Withdrawal-Strategy Tax Investigation + Header-Zoom and FIRE-Month Display Fixes

**Input**: Design documents from `/specs/026-withdrawal-tax-and-ui-fixes/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ (3 files) ✅, quickstart.md ✅

**Tests**: Tests are IN SCOPE — spec FR-005 / FR-010 / SC-001..SC-009 require unit + Playwright + manual browser-smoke coverage.

**Organization**: Tasks grouped by user story for independent implementation. **CRITICAL ordering caveat:** Phase 2 (Foundational) contains the three Phase-0 diagnosis decision gates. No US-phase fix task may begin until its corresponding Phase-2 gate is closed. This is unique to feature 026 because all three user stories require a "diagnose-first / decide-then-fix" path per the plan.

## Format: `- [ ] [TaskID] [P?] [Story?] Description with file path`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story label (US1, US2, US3); omitted on Setup / Foundational / Polish phases
- All file paths are repository-relative

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create directories and scaffolding that all three user stories use.

- [ ] T001 Create directory `tests/diagnostics/` (if not present) for the US1 sweep harness and the US2 counterfactual harness. Add a one-line `tests/diagnostics/README.md` explaining purpose ("ad-hoc Node-runnable diagnostic scripts; not part of `node --test` runs").
- [ ] T002 [P] Create directory `tests/fixtures/` if not present. (The repo already has `tests/unit/fixtures/`; `tests/fixtures/` is the conventional spot for cross-suite fixtures.) No content yet.
- [ ] T003 [P] Capture pre-fix 100%-zoom pixel snapshot of the header for SC-008 regression check. Save under `specs/026-withdrawal-tax-and-ui-fixes/snapshots/header-100pct-pre-fix.png` (RR file in EN). Repeat for `header-100pct-pre-fix-generic-en.png`. Manual snapshot via browser screenshot OK; Playwright capture preferred if quick.

**Checkpoint**: Phase 1 directories and baseline artifacts in place.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The three Phase-0 diagnoses + decisions. Each user story has a corresponding decision gate. **NO US-phase fix task may begin until its gate is closed.**

**⚠️ CRITICAL**: The order within Phase 2 is: build harness/fixture → run → record decision. Do not skip the "record decision" sub-step; the fix scope literally cannot be defined without it.

- [ ] T004 [P] Build US1 diagnostic sweep harness at `tests/diagnostics/us1-sweep.js`. The harness loads canonical RR inputs (read from a small in-script constant; do NOT depend on the HTML), calls `findEarliestFeasibleAge` from `calc/fireAgeResolver.js` across `monthlySaving ∈ [2000, 14000]` in $250 steps, and prints a 50-row table `{monthlySaving, years, months, totalMonths, searchMethod}`. Also calls the in-HTML simulator equivalent (re-implement the 5-line wrapper from `FIRE-Dashboard.html:12780–12806` against the same inputs) so the table compares Node-resolver vs. dashboard-resolver results side by side.
- [ ] T005 [P] Build SC-026-A fixture at `tests/fixtures/sc026a-counterfactual.js`. Frozen RR-default inputs at `fireAge=53, mode=dieWithZero, objective=leave-more-behind, ltcgGainPct=0.6, planEndAge=95`. Export the fixture as a CommonJS module so the US2 harness in T006 can `require` it.
- [ ] T006 [P] Build US2 counterfactual harness at `tests/diagnostics/us2-counterfactual.js`. Loads SC-026-A fixture (T005), runs the current "leave-more-behind" sequencer (`projectFullLifecycle` injection-style using existing `calc/withdrawal.js` + `calc/simulateLifecycle.js`), then runs the "10%-bracket-smoothed" counterfactual policy from `contracts/withdrawal-counterfactual.contract.md`, and prints all six required `research.md` Section 2 sub-tables (current trajectory, counterfactual trajectory, deltas, sensitivity at 3/5/7% real, constraint-breach audit, recommendation block scaffold).
- [ ] T007 Audit current header CSS rules in `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` — grep for `#siteHeader`, `.brand-block`, `.verdict-pill`, `.lang-toggle`, `.theme-toggle`, `.chart-mode-toggle`. Compile findings (current font-sizes, paddings, flex behavior, z-index) into `specs/026-withdrawal-tax-and-ui-fixes/research.md` Section 3 as "Current state" sub-section before evaluating the three Option A/B/C candidates.
- [ ] T008 **DECISION GATE — US1**: Run `node tests/diagnostics/us1-sweep.js`, paste output into `research.md` Section 1 hypotheses table, fill in the Status column for each of A/B/C/D, and write the Decision + Rationale + Recommended fix scope blocks. Until this is filled in, T013–T018 cannot start.
- [ ] T009 **DECISION GATE — US2**: Run `node tests/diagnostics/us2-counterfactual.js > /tmp/sc026a-output.txt`, paste output into `research.md` Section 2's six sub-tables, fill in the Recommendation block (`keep` / `change-spec-NNN` / `defer-with-reason`) per `contracts/withdrawal-counterfactual.contract.md`. Until this is filled in, T019–T021 cannot start.
- [ ] T010 **DECISION GATE — US3**: Choose CSS technique (Option A `clamp()`, Option B container queries, or Option C flex-wrap-only) per `research.md` Section 3. Fill in Decision + Rationale + Rejected alternatives. Until this is filled in, T022–T026 cannot start.

**Checkpoint**: All three decisions recorded in `research.md`. Fix scopes are now bounded.

---

## Phase 3: User Story 1 — FIRE-month display fix (Priority: P1) 🎯 MVP

**Goal**: The verdict pill displays a months value that varies with inputs. Acceptance per spec FR-002: ≥ 4 distinct months across a 25-step sweep; ≤ 80% concentration on any single bucket.

**Independent Test**: Sweep monthly savings across 25 positions; verdict-pill `months` value covers ≥ 4 distinct values in `{0..11}`. Both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html`.

**Prerequisites**: T008 closed (root-cause layer identified).

### Tests for User Story 1 (TDD — write FIRST, ensure they FAIL before T013/T014)

- [ ] T011 [P] [US1] Write unit test `tests/unit/fireAgeResolverSweep.test.js`. Asserts: across 25 evenly-spaced monthly-savings values, `findEarliestFeasibleAge` returns `≥ 4` distinct `months` values, no single bucket > 80%, every `searchMethod === 'integer-year'` result has `months === 0`, every `month-precision` result has `months ∈ {1..11}`. Run with `node --test`; expect FAIL pre-fix (or PASS pre-fix if the bug is NOT in the resolver — that itself is data for T013 fix scoping).
- [ ] T012 [P] [US1] Write Playwright E2E spec `tests/e2e/verdict-pill-sweep.spec.js`. Loads each HTML file, drives monthly-savings input through 10 positions, scrapes verdict-pill text after each, asserts ≥ 3 distinct `months` values across the sweep AND `(age N)` matches resolver's `R.years` exactly. Run; expect FAIL pre-fix.

### Implementation for User Story 1

- [ ] T013 [US1] Apply the fix to `FIRE-Dashboard.html` at the layer identified in T008. Likely candidates per `contracts/verdict-pill.contract.md`:
  - **If layer = verdict-pill wiring**: edit `FIRE-Dashboard.html:12950–12968` so both branches (`month-precision` and `integer-year`) source years/age from the SAME `R.years` (Constitution III). The `integer-year` branch must use `dyn.fireInYears`, NOT append "0 months" or stale months.
  - **If layer = simulator pro-rate**: edit the in-HTML `simulateRetirementOnlySigned` block to actually pro-rate the FIRE-year row by `(1 − m/12)` per the resolver's Edge-Case-4 doc.
  - **If layer = resolver**: edit `calc/fireAgeResolver.js` Stage-2 logic (least likely; 8 unit tests would have flagged a bug already).
  - **If layer = snapshot staleness**: ensure `_lastKpiSnapshot.fireAgeResult` is recomputed before the verdict-pill render block fires on partial-update paths (override drag, FIRE-mode switch).
- [ ] T014 [US1] Apply the SAME fix to `FIRE-Dashboard-Generic.html` in lockstep (Constitution I). Use the parallel line range in Generic — the fix line numbers will differ slightly because Generic uses `inp.agePerson1`.
- [ ] T015 [US1] If T013 touched `calc/fireAgeResolver.js`: update the module's `Consumers:` header comment to reflect the new acceptance rule (Constitution VI). Re-check that the file remains UMD-classic-script (Constitution V) — no `export` keywords introduced.
- [ ] T016 [US1] Run `node --test tests/unit/fireAgeResolverSweep.test.js` (T011) — must PASS. Run `node --test tests/unit/monthPrecisionResolver.test.js` — must STILL PASS (no regression in the existing 8 cases).
- [ ] T017 [US1] Run `npx playwright test tests/e2e/verdict-pill-sweep.spec.js` (T012) — must PASS in EN AND zh-TW for both HTML files.
- [ ] T018 [US1] zh-TW translation parity check. If T013 introduced any new string, both EN + zh-TW translations land in the same commit per Constitution VII. If no new strings, document this in the commit message.

**Checkpoint**: US1 fix complete. Verdict pill exhibits varying months across inputs. Both HTMLs in lockstep.

---

## Phase 4: User Story 2 — Withdrawal-strategy tax-cliff investigation (Priority: P1)

**Goal**: A written research deliverable in `research.md` Section 2 with all six required sub-sections, a recommendation (`keep` / `change-spec-NNN` / `defer-with-reason`), and the constraint-breach audit table. **No calc-layer behavior change ships in feature 026.**

**Independent Test**: `research.md` Section 2 satisfies every acceptance rule in `contracts/withdrawal-counterfactual.contract.md` "Acceptance test" block.

**Prerequisites**: T009 closed (recommendation recorded).

### Implementation for User Story 2

- [ ] T019 [US2] Verify `research.md` Section 2 against `contracts/withdrawal-counterfactual.contract.md`:
  1. All six sub-sections populated (fixture summary, current trajectory, counterfactual trajectory, deltas, sensitivity, recommendation).
  2. Recommendation is exactly one of `keep` / `change-spec-NNN` / `defer-with-reason`.
  3. If `change-spec-NNN`: lifetime-tax delta at 5% real ≥ $5K nominal (SC-005).
  4. Constraint-breach audit table covers IRMAA, ACA-PTC, AMT, surviving-spouse brackets, spending floor.
  5. All numbers reproducible via re-running T006's harness against T005's fixture.
- [ ] T020 [US2] If recommendation is `keep`: write a 1-paragraph "why the cliff is correct" note into `specs/026-withdrawal-tax-and-ui-fixes/research.md` Section 2's recommendation block, naming the dominant constraint or compounding mechanism per FR-009. No code change.
- [ ] T021 [US2] If recommendation is `change-spec-NNN`: scaffold the follow-up spec at `specs/NNN-withdrawal-bracket-fill-smoothing/spec.md` with the contract diff per FR-008 (named module, named inputs, named outputs, named consumers), AND add a back-link from `research.md` Section 2 to that spec. Do NOT implement the change in 026. Then write a 1-paragraph "deferred to NNN" note into `BACKLOG.md`.
- [ ] T022 [US2] If recommendation is `defer-with-reason`: write the deferral rationale into `BACKLOG.md` with the specific data point that's inconclusive and what additional fixtures would resolve it.

**Checkpoint**: US2 research deliverable accepted; recommendation routed (kept / new spec opened / deferred to BACKLOG).

---

## Phase 5: User Story 3 — Header zoom-resilient layout (Priority: P2)

**Goal**: Header holds layout across 75/100/125/150% browser zoom on 1920×1080 in both EN and zh-TW. No regression at 100%.

**Independent Test**: Playwright `header-zoom-matrix.spec.js` PASSES in EN + zh-TW for both HTML files; manual browser-smoke confirms visual contract.

**Prerequisites**: T010 closed (CSS technique chosen).

### Tests for User Story 3 (TDD — write FIRST, ensure they FAIL before T024/T025)

- [ ] T023 [P] [US3] Write Playwright spec `tests/e2e/header-zoom-matrix.spec.js`. Loads each HTML file in each language, sets browser zoom to 75/100/125/150%, asserts `#siteHeader.getBoundingClientRect().height` within bounds (75%: ≤150px; 100%: ≤200px; 125%: ≤280px; 150%: degrades to vertical stack with no horizontal clipping), no element overlap > 2px, 100%-zoom pixel diff vs. T003 baseline ≤ 2px (SC-008). Run; expect FAIL pre-fix at 125%/150%.

### Implementation for User Story 3

- [ ] T024 [US3] Apply CSS change to `FIRE-Dashboard.html` per T010 decision. Default expectation (Option A): `clamp()` typography on `.brand-block h1` and `.verdict-pill`, `flex-wrap: wrap` and `min-width: 0` on `#siteHeader` and `.brand-block`, `flex-shrink: 0` on the right-side toggle cluster. Inline a CSS comment near the rules: `/* Feature 026 US3 — header zoom resilience: clamp() typography + flex-wrap. See specs/026-.../contracts/header-layout.contract.md. */`.
- [ ] T025 [US3] Apply the SAME CSS change to `FIRE-Dashboard-Generic.html` in lockstep (Constitution I).
- [ ] T026 [US3] Verify the `--header-height` ResizeObserver still publishes a sane numeric (px) value at 75/100/125/150% zoom — open DevTools, inspect `getComputedStyle(document.documentElement).getPropertyValue('--header-height')` at each zoom level. Constitution Sticky-Chrome Discipline.
- [ ] T027 [US3] Run `npx playwright test tests/e2e/header-zoom-matrix.spec.js` (T023) — must PASS in EN AND zh-TW for both HTML files at all four zoom levels.

**Checkpoint**: US3 layout fix complete. Header holds across zoom matrix. No 100%-zoom regression.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final verification across all three user stories before merge.

- [ ] T028 [P] Run the FULL existing test suite (`node --test tests/unit/`) — must show baseline 557 passing + new tests from T011/T023 added; 0 failures. (Baseline per CLAUDE.md predecessor 025 closeout.)
- [ ] T029 Manual browser-smoke gate per CLAUDE.md "Browser smoke before claiming a feature done":
  1. Open `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` in a real browser at 100% zoom.
  2. Wait 2 seconds for cold load.
  3. Verify every KPI card shows a numeric value (no NaN, no "Calculating…", no $0).
  4. Open DevTools console — confirm zero red errors and zero `[<shim-name>] canonical threw:` messages.
  5. Sweep monthly-savings slider through 10 positions; verdict-pill `months` value MUST take ≥ 3 distinct values (US1).
  6. Toggle EN ↔ 中文; verify all header elements re-render in the new language.
  7. Step browser zoom 75 → 100 → 125 → 150% in each language; verify header bounds per `contracts/header-layout.contract.md` (US3).
  8. Drag the FIRE marker; confirm same-frame update (no NaN cascade).
- [ ] T030 [P] Update `BACKLOG.md` — mark US2 follow-up status (kept / new spec NNN opened / deferred). Cross-reference `specs/026-.../research.md` Section 2.
- [ ] T031 Write `specs/026-withdrawal-tax-and-ui-fixes/CLOSEOUT.md` summarizing: which root-cause layer was fixed for US1, what the US2 recommendation was, which CSS technique was chosen for US3, test count delta, browser-smoke verification date, and any deferred items. Follow the structure of `specs/024-deferred-fixes-cleanup/CLOSEOUT.md`.
- [ ] T032 Update CLAUDE.md SPECKIT block to indicate 026 status (e.g., "AWAITING BROWSER SMOKE" → "MERGED main" once T029 passes and merge happens).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No upstream dependencies. T001/T002/T003 can start immediately.
- **Foundational (Phase 2)**: Depends on Phase 1. Within Phase 2:
  - T004, T005, T006, T007 are mostly parallel (different files).
  - T008 depends on T004 running successfully.
  - T009 depends on T005 + T006 running successfully.
  - T010 depends on T007.
  - **All three decision gates (T008, T009, T010) MUST close before any US phase starts.**
- **US1 (Phase 3)**: Depends on T008.
- **US2 (Phase 4)**: Depends on T009.
- **US3 (Phase 5)**: Depends on T010.
- **Polish (Phase 6)**: Depends on US1 + US2 + US3 phases all complete.

### Within Each User Story

- **US1**: T011 + T012 (tests) BEFORE T013/T014 (impl); T013 + T014 in lockstep (same commit per Constitution I); T015 only if calc/ touched; T016/T017 (run tests) after impl; T018 (translation check) gates the commit.
- **US2**: No code change in 026. Tasks are document-and-route only. T019 verifies the deliverable; T020/T021/T022 are mutually exclusive (one fires based on recommendation).
- **US3**: T023 (Playwright spec) BEFORE T024/T025 (impl); T024 + T025 in lockstep; T026 (ResizeObserver check) after impl; T027 (run spec) after impl.

### Parallel Opportunities

**Phase 1**: T002 + T003 in parallel (different artifact types).
**Phase 2**: T004 + T005 + T006 + T007 in parallel — none depends on another. T008/T009/T010 are sequential after their respective harnesses run.
**Phase 3 (US1)**: T011 + T012 in parallel (different files).
**Phase 5 (US3)**: T023 can run in parallel with T011/T012 if Phase 2 is done.
**Cross-story**: Once Phase 2 closes, US1 + US2 + US3 implementation phases can run in parallel by different agents (file ownership is disjoint: US1 → verdict-pill block; US2 → research.md; US3 → CSS rules). Per CLAUDE.md "Multi-agent dispatch produces lockstep results when each agent gets the contract path".

---

## Parallel Example: Phase 2 Foundational (kicks off the feature)

```bash
# Parallel-dispatch four agents to build the diagnostic infrastructure:
Agent A: T004 → tests/diagnostics/us1-sweep.js
Agent B: T005 → tests/fixtures/sc026a-counterfactual.js
Agent C: T006 → tests/diagnostics/us2-counterfactual.js (depends on T005 — chain after Agent B finishes)
Agent D: T007 → research.md Section 3 "Current state" sub-section

# Then sequentially close decision gates:
T008 (US1 gate)  → fills in research.md Section 1
T009 (US2 gate)  → fills in research.md Section 2
T010 (US3 gate)  → fills in research.md Section 3 Decision block
```

## Parallel Example: User Story 1 (after T008)

```bash
# Tests in parallel:
Task: "Write unit test tests/unit/fireAgeResolverSweep.test.js"
Task: "Write Playwright spec tests/e2e/verdict-pill-sweep.spec.js"

# Then implementation in lockstep:
Task: "Apply fix to FIRE-Dashboard.html per T008 decision (verdict-pill render block)"
Task: "Apply same fix to FIRE-Dashboard-Generic.html in lockstep"
```

---

## Implementation Strategy

### MVP First (User Story 1 — verdict-pill fix)

1. Phase 1 → Phase 2 (close T008 gate only — T009/T010 can wait).
2. Phase 3 (US1) → ship.
3. **STOP and VALIDATE**: Browser-smoke US1 acceptance — sweep slider, see months vary.
4. If US2 / US3 must wait, document in CLAUDE.md SPECKIT block "US2/US3 in flight; US1 fix landed at commit XXX".

### Incremental Delivery

1. Setup + Phase 2 (close all three gates) → research.md complete and decisions recorded.
2. US1 fix → ship → demo.
3. US3 CSS fix → ship → demo.
4. US2 deliverable → reviewed → recommendation routed (no code change in 026).
5. Phase 6 polish + CLOSEOUT.

### Parallel Team Strategy

With agent dispatch (per CLAUDE.md Manager + Engineers model):

1. Manager spawns Phase 2 in parallel: Backend Engineer (T004 + T006), DB Engineer (T005), Frontend Engineer (T007), QA Engineer reviews on completion.
2. Manager closes the three decision gates one by one (Manager-only — these are decision points, not implementation).
3. Manager spawns Phase 3 + Phase 4 + Phase 5 in parallel: Backend or Frontend Engineer per US1 fix layer, Backend Engineer for US2 verification, Frontend Engineer for US3 CSS, QA Engineer for all three test specs.
4. Manager runs Phase 6 sequentially (T029 browser-smoke is Manager-executed per CLAUDE.md gate).

---

## Notes

- **Diagnose-then-fix discipline.** Phase 2 is unusually heavy because all three user stories depend on a Phase-0 decision. Skipping the diagnosis gates and jumping straight to "fix the verdict pill" or "rewrite leave-more-behind" risks the feature 004-class failure (per CLAUDE.md Process Lessons "Caller-audit before extraction").
- **No new calc module added in 026.** US1 fix at most touches one existing module + the two HTML files. US2 produces no calc change. US3 is CSS only. Expected file count delta: 4–6 source edits + 3 new test files + 1 fixture + 2 diagnostic harnesses + 7 spec files (already created).
- **Lockstep gate (Constitution I).** Every implementation task in US1 and US3 includes a paired RR + Generic edit task. The Manager rejects any single-file commit unless explicitly justified.
- **Browser-smoke is the merge gate.** T029 cannot be skipped per CLAUDE.md; it gates the merge to `main`.
- **Commit cadence.** Commit after each completed task or logical group. Avoid bundling US1 + US2 + US3 changes into one commit — they must remain disentanglable for blame and revert.
- **Constitution principles invoked by this feature**: I (lockstep), III (single source of truth), IV (regression coverage), V (zero-build), VI (chart/module contracts — only if calc/ touched), VII (bilingual), VIII (spending floor — US2 only), IX (mode/objective orthogonality — US2 evaluation only). Re-check before merge.
