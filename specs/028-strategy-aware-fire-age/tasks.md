---

description: "Task list for feature 028 — Strategy-Aware FIRE-Age Resolver + Verdict-Pill Stop-Gap"

---

# Tasks: Strategy-Aware FIRE-Age Resolver + Verdict-Pill Stop-Gap

**Input**: Design documents from `/specs/028-strategy-aware-fire-age/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/signed-sim-options.contract.md`, `quickstart.md`

**Tests**: REQUIRED. Spec FR-013 through FR-016 mandate test coverage; Constitution Principle IV makes regression coverage non-negotiable.

**Organization**: Tasks grouped by user story. US1 (stop-gap pill) ships first to close the misleading verdict immediately; US2 (root-cause strategy threading) ships next; US3 (audit visibility) ships alongside US2.

## Format

`- [ ] [TaskID] [P?] [Story?] Description with file path`

## Path Conventions

Single-file HTML app per Constitution Principle V. Calc modules at `calc/`, dashboards at repo root, tests at `tests/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Pre-flight checks and baseline test green confirmation.

- [ ] T001 Confirm clean working tree on branch `028-strategy-aware-fire-age` via `git status`; if dirty, ask user before proceeding
- [ ] T002 Run `npm run test:unit` and confirm baseline = 493 passing, 0 failing (any deviation BLOCKS the rest of the feature — likely an environment issue, not a spec issue)
- [ ] T003 [P] Open both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` in a browser, reproduce the SC-027 case from `quickstart.md`, and confirm the misleading "On Track" pill state in both files. Capture a screenshot to `specs/028-strategy-aware-fire-age/before.png` for the closeout

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish the strategy-resolution helper used by both stop-gap and root-cause fix.

**⚠️ CRITICAL**: T004 and T005 MUST complete before US1 or US2 can begin.

- [ ] T004 Audit existing `getActiveChartStrategyOptions()` in `FIRE-Dashboard.html` (locate via `grep -n "getActiveChartStrategyOptions" FIRE-Dashboard.html`). Confirm it returns `{ strategyOverride, thetaOverride }` and reads `_previewStrategyId` then `_lastStrategyResults.winnerId`. Document line range in a code comment for traceability. If function is missing or differs in shape, file blocker
- [ ] T005 [P] Repeat T004 audit in `FIRE-Dashboard-Generic.html`. Confirm parity with RR. If functions diverge, file lockstep violation and pause for resolution per Constitution Principle I
- [ ] T006 [P] Audit `_lastChartLifecycleEndBalance`, `_lastChartHasShortfall`, and `_lastResolverResult` publish points in both HTMLs. Confirm each is published at the end of the relevant render path (lifecycle render, resolver wrapper). If `_lastResolverResult` does not yet exist, schedule it as part of T011 (US1 stop-gap implementation depends on it)

**Checkpoint**: Strategy-resolution helper and signal publishers confirmed in both HTMLs. US1 and US2 implementation can begin.

---

## Phase 3: User Story 1 — Verdict pill cannot ship a false "On Track" (Priority: P1) 🎯 MVP

**Goal**: Stop-gap guard in `renderFireStatus()` (and Generic equivalent) forces the pill to an infeasible state when (a) winner is non-default AND (b) chart says infeasible AND (c) resolver says feasible. This closes the user-visible misleading verdict immediately, before the root-cause threading lands in US2.

**Independent Test**: Reload either HTML with the SC-027 reproducer (Mode = DWZ, Aggressive winner). The pill MUST NOT contain "On Track" / "正在達標". Pill class list MUST contain `fire-status behind` or `fire-status warning`. The chart's red infeasibility shading remains visible. Toggle to a feasible scenario (Mode = Safe with bracket-fill default) and confirm pill correctly returns to "On Track" — proving no false negatives.

### Tests for User Story 1 (TDD — write FIRST, confirm RED, then implement)

- [ ] T007 [P] [US1] Create `tests/unit/verdictPillStopGap.test.js` with three cases: (a) non-default winner + infeasible chart + feasible resolver → pill string MUST be infeasible; (b) default winner + same conditions → pill string follows normal logic (no override); (c) non-default winner + feasible chart → pill string follows normal logic (no override / no false negative). Use minimal pure-JS stubs for the relevant globals; the test file exports the override-decision function as a pure helper for direct testability
- [ ] T008 [US1] Run new test file via `node --test tests/unit/verdictPillStopGap.test.js` and confirm RED (because the helper does not exist yet)

### Implementation for User Story 1

- [ ] T009 [P] [US1] Extract the stop-gap decision logic into a pure helper `_shouldOverrideStatusToInfeasible({ winnerId, chartEndBalance, chartHasShortfall, resolverFeasible }) → boolean` near the top of `FIRE-Dashboard.html`'s status block. The helper returns true iff `winnerId && winnerId !== 'bracket-fill-smoothed' && (chartEndBalance < 0 || chartHasShortfall === true) && resolverFeasible === true`. Export via `window._shouldOverrideStatusToInfeasible` for the unit test
- [ ] T010 [P] [US1] Mirror T009 helper into `FIRE-Dashboard-Generic.html` at the equivalent location (per Constitution Principle I)
- [ ] T011 [US1] In `renderFireStatus()` (or equivalent in both HTMLs), after the existing verdict computation but BEFORE the pill DOM write, call `_shouldOverrideStatusToInfeasible({...})`. When true, replace the pill text with the existing infeasible i18n key (`dyn.statusBehindLongTimeline` or shortfall variant), set the class to `fire-status behind`, and log a single console.warn with `[stop-gap] forcing pill infeasible due to chart/resolver mismatch — winner=${winnerId} mode=${mode}` for diagnostic visibility. If `_lastResolverResult` is not yet published, add a 1-line publish at the end of the resolver wrapper before reading it
- [ ] T012 [US1] Re-run `node --test tests/unit/verdictPillStopGap.test.js` and confirm GREEN (3/3 cases passing)
- [ ] T013 [US1] Manual browser smoke per `quickstart.md` — load SC-027 reproducer in BOTH HTMLs, confirm pill is no longer "On Track". Toggle to a feasible scenario, confirm pill returns to "On Track" without false negative. Capture `specs/028-strategy-aware-fire-age/after-stopgap.png` for the closeout

**Checkpoint**: US1 complete. The misleading "On Track" pill state is closed. The root cause is still latent (resolver still uses bracket-fill), but the user-facing symptom is gone.

---

## Phase 4: User Story 2 — FIRE-age search evaluates the displayed strategy (Priority: P1)

**Goal**: Extend `simulateRetirementOnlySigned` to accept `options.strategyOverride` and `options.thetaOverride`, route the per-year withdrawal step through the same strategy router `projectFullLifecycle` uses, and thread the active strategy from `getActiveChartStrategyOptions()` into the resolver wrapper. After this lands, the chart and the resolver agree by construction and the US1 stop-gap becomes inert (kept as safety net).

**Independent Test**: With SC-027 reproducer (DWZ + aggressive-bracket-fill), the resolver MUST return `feasible: false`. Switching Mode = Safe vs Exact vs DWZ MUST produce at least two distinct resolver outcomes (different ages, or one feasible / one infeasible) — proving Mode selectivity is restored. All 8 strategies' end-balance from `simulateRetirementOnlySigned` MUST match `projectFullLifecycle`'s end-balance within $1.

### Tests for User Story 2 (TDD — write FIRST, confirm RED, then implement)

- [ ] T014 [P] [US2] Create `tests/unit/signedSimStrategyOptions.test.js` covering all 8 registered strategies (`bracket-fill-smoothed`, `aggressive-bracket-fill`, `roth-ladder`, `trad-last-preserve`, `conventional`, `tax-optimized-search` at θ ∈ {0.1, 0.5, 0.9}, `trad-first`, `proportional`). For each: assert `|simulateRetirementOnlySigned(..., {strategyOverride}).endBalance − projectFullLifecycle(..., {strategyOverride}).rows[lastRow].total| ≤ $1`. Use the SC-027 input fixture from `quickstart.md`. Mirror the test structure in `tests/unit/aggressiveBracketFill.test.js` (feature 027) so reviewers can follow the pattern
- [ ] T015 [P] [US2] Create `tests/unit/fireAgeResolverStrategyAware.test.js`. Three pinning cases per `contracts/signed-sim-options.contract.md` Test Contract:
  - SC-027 reproducer + DWZ + `strategyOverride: 'aggressive-bracket-fill'` → `{ feasible: false, years: -1, searchMethod: 'none' }`
  - Same fixture + DWZ + `strategyOverride: 'bracket-fill-smoothed'` (or omitted) → `{ feasible: true, years: 53, searchMethod: 'integer-year' or 'month-precision' }` (proving the test fixture preserves the pre-fix bracket-fill verdict)
  - Same fixture + Exact + `strategyOverride: 'aggressive-bracket-fill'` → resolves to a DIFFERENT age than DWZ does under bracket-fill (or also `feasible: false` with different `searchMethod` annotation), proving Mode selectivity is restored
- [ ] T016 [US2] Run both test files; confirm RED (current `simulateRetirementOnlySigned` does not accept options, so the strategy override silently has no effect → tests fail)

### Implementation for User Story 2

- [ ] T017 [US2] Extend `simulateRetirementOnlySigned` in `FIRE-Dashboard.html` (search via `grep -n "function simulateRetirementOnlySigned" FIRE-Dashboard.html`, currently ~line 9606): add `options` as the 8th parameter; default to `undefined`. Document the new parameter in the function header comment per `contracts/signed-sim-options.contract.md`. Inside the per-year retirement loop, when `options?.strategyOverride` is set AND not `'bracket-fill-smoothed'`, dispatch the withdrawal step through the same strategy router that `projectFullLifecycle` uses (find the dispatch site by grepping `projectFullLifecycle` for `STRATEGY_BY_ID[strategyOverride]` or equivalent and reuse that pattern). Pre-FIRE accumulation phase MUST remain unaffected
- [ ] T018 [US2] Mirror T017 in `FIRE-Dashboard-Generic.html` per Constitution Principle I. Use the same line-range and same structural change. Verify with `diff <(grep -A 80 "function simulateRetirementOnlySigned" FIRE-Dashboard.html) <(grep -A 80 "function simulateRetirementOnlySigned" FIRE-Dashboard-Generic.html)` — should be identical modulo `ageRoger` vs `agePerson1`
- [ ] T019 [P] [US2] Extend `signedLifecycleEndBalance` in `FIRE-Dashboard.html` (~line 8968) to accept the same `options` parameter and plumb it into its inner `simulateRetirementOnlySigned` call. No other behavior change
- [ ] T020 [P] [US2] Mirror T019 in `FIRE-Dashboard-Generic.html`
- [ ] T021 [US2] Update both HTMLs' wrapper around `findEarliestFeasibleAge` (the resolver entry point — search for `findEarliestFeasibleAge` in each file). Read `getActiveChartStrategyOptions()` and pass `options.strategyOverride` + `options.thetaOverride` into the resolver via the existing `options` chain. Inject the same options into the `isFireAgeFeasible` gate function so the resolver's Stage 1 scan AND its Stage 2 interpolation both consume the active strategy
- [ ] T022 [US2] Run `tests/unit/signedSimStrategyOptions.test.js` and `tests/unit/fireAgeResolverStrategyAware.test.js`; confirm GREEN (all cases passing)
- [ ] T023 [US2] Run full unit suite via `npm run test:unit`; confirm 493 (existing) + new tests = ≥ 500 passing, 0 failing. If any pre-existing test regressed, treat as a strategy-routing bug in T017/T018 and fix before proceeding (do NOT update tests to absorb the regression — Principle IV)

**Checkpoint**: US2 complete. The chart and the resolver evaluate the same strategy. The US1 stop-gap should now never fire on real scenarios; verify by re-running the SC-027 reproducer and confirming the pill is infeasible WITHOUT the stop-gap's `console.warn` firing (i.e., the resolver itself returns infeasible).

---

## Phase 5: User Story 3 — Cross-validation panel surfaces strategy-mismatch warnings (Priority: P2)

**Goal**: Extend `crossValidationWarnings` entry shape for `endBalance-mismatch` to include `activeStrategyId`, `mode`, `chartEndBalance`, `signedEndBalance`, and `delta` fields. Post-fix, the SC-027 reproducer's audit dump MUST emit zero `endBalance-mismatch` rows (because the two sims now agree).

**Independent Test**: Inspect the audit dump (Copy Debug button) for the SC-027 reproducer — `crossValidationWarnings` array filtered to `kind === 'endBalance-mismatch'` MUST be empty. For an artificial test scenario that forces a divergence, the warning entry MUST include all five new fields.

### Tests for User Story 3 (TDD — write FIRST)

- [ ] T024 [P] [US3] Create `tests/unit/crossValidationWarningsExtended.test.js`. Two cases:
  - SC-027 reproducer with full feature applied → `crossValidationWarnings.filter(w => w.kind === 'endBalance-mismatch').length === 0`
  - Artificial fixture: force `chartEndBalance = 100000`, `signedEndBalance = -50000` → resulting warning entry has `activeStrategyId`, `mode`, `chartEndBalance`, `signedEndBalance`, `delta` populated (in addition to the back-compat `valueA`, `valueB`, `delta`)
- [ ] T025 [US3] Run new test file; confirm RED

### Implementation for User Story 3

- [ ] T026 [US3] Locate the `crossValidationWarnings` builder in `calc/calcAudit.js` (or wherever the SC-027 dump's warning is emitted — `grep -n "endBalance-mismatch" calc/*.js FIRE-Dashboard*.html`). Add `activeStrategyId`, `mode`, `chartEndBalance`, `signedEndBalance` to the emitted entry alongside the existing fields. The `delta` field already exists; verify it equals `chartEndBalance − signedEndBalance` (sign convention)
- [ ] T027 [US3] Update both HTMLs' audit-dump assembly to read the new fields if they emit independently of `calc/calcAudit.js` (parity check via `grep -n "endBalance-mismatch" FIRE-Dashboard.html FIRE-Dashboard-Generic.html`)
- [ ] T028 [US3] Run `tests/unit/crossValidationWarningsExtended.test.js`; confirm GREEN

**Checkpoint**: US3 complete. Audit panel now surfaces all the diagnostic fields. After this checkpoint, all three user stories pass independently.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: E2E verification, lockstep diff audit, performance check, documentation, and closeout.

- [ ] T029 [P] Create `tests/e2e/strategy-aware-pill.spec.ts` per `contracts/signed-sim-options.contract.md` "Stop-gap test" section. Drive the SC-027 reproducer in both HTMLs; assert pill text does NOT contain "On Track" / "正在達標"; assert pill class includes `fire-status behind` or `fire-status warning`; assert chart's red shading is present
- [ ] T030 [P] Run `npx playwright test tests/e2e/strategy-aware-pill.spec.ts`; confirm GREEN on Chromium for both HTMLs (4 test cases — 2 HTMLs × 2 modes / objectives)
- [ ] T031 Lockstep diff audit: `git diff main...HEAD -- FIRE-Dashboard.html FIRE-Dashboard-Generic.html | grep -E "^[+-]" | grep -vE "(ageRoger|agePerson1|rebecca|person2|Roger|Rebecca|Person 1|Person 2)" | wc -l`. Expected output: every non-personal-content line that differs MUST appear paired (one line removed in RR, one added in Generic, or both edited symmetrically). Manually inspect the diff and confirm Constitution Principle I compliance
- [ ] T032 Performance smoke: open `FIRE-Dashboard.html`, load SC-027 reproducer, open DevTools Performance tab, click `Plan` tab, drag the FIRE marker. Confirm total recalc per drag ≤ 200 ms (per `research.md` R-2 budget). If exceeded, file follow-up to add per-recalc memoization in resolver wrapper
- [ ] T033 [P] Update `CLAUDE.md`'s active feature line: change status from `PLAN COMPLETE — TASKS PENDING` to `IMPLEMENTATION COMPLETE — AWAITING BROWSER SMOKE` with the new test counts (493 baseline → 493 + N new) and any noted regressions / clean run
- [ ] T034 [P] Append a new bullet to `BACKLOG.md` (or remove/check the existing item if this feature was already pre-listed) documenting feature 028 as in-progress / merged
- [ ] T035 Browser smoke (manual gate per CLAUDE.md "Browser smoke before claiming a feature done"): open both HTMLs in real browser, run through `quickstart.md` post-fix verification steps, confirm SC-028-A through F. Capture `specs/028-strategy-aware-fire-age/after-full-fix.png` for the closeout. THIS IS A USER-DRIVEN GATE — Claude reports readiness; user runs the smoke
- [ ] T036 Author `specs/028-strategy-aware-fire-age/CLOSEOUT.md` with: implementation summary, test counts before/after, SC-028 verification status, screenshots referenced, lockstep diff audit result, performance budget result, any deferred follow-ups (R-A hover debounce risk from `research.md`, R-2 memoization watchpoint, US3 audit field naming), and merge readiness statement
- [ ] T037 Final unit + E2E run: `npm run test:unit && npx playwright test tests/e2e/strategy-aware-pill.spec.ts`. Both must be GREEN before tagging the branch ready for merge. If either is RED, return to the failing US's checkpoint

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately.
- **Phase 2 (Foundational)**: T004, T005, T006 depend on Phase 1 completion. T005 + T006 can run in parallel after T004. T006 may require pre-publishing `_lastResolverResult` if it's missing — that work is folded into T011 (Phase 3) so it does not block US2.
- **Phase 3 (US1)**: Depends on Phase 2 completion. Self-contained — does NOT depend on US2 or US3.
- **Phase 4 (US2)**: Depends on Phase 2 completion. Independent of US1; in practice US1 ships first because it's MVP (closes the misleading pill immediately).
- **Phase 5 (US3)**: Depends on Phase 2. Can run in parallel with US2; integrates with US2's strategy threading for the post-fix "no warning" assertion (T024 case 1).
- **Phase 6 (Polish)**: Depends on US1 + US2 + US3 all complete. T031 lockstep audit is the final consistency gate before T035 browser smoke.

### Within Each User Story

- Tests (T007, T014, T015, T024) MUST be written FIRST and confirmed RED before any implementation task.
- Helpers before consumers (T009 helper before T011 wiring; T017/T018 sim extension before T021 resolver wrapper update).
- Both HTML files edited in lockstep within the same task pair — never let RR land and Generic lag, or vice versa.

### Parallel Opportunities

- T003 (browser repro) parallel to T002 (npm test).
- T005 + T006 parallel after T004.
- T007 (US1 test) + T014 (US2 test) + T015 (US2 test) + T024 (US3 test) can be authored in parallel (different files).
- T009 (RR helper) + T010 (Generic helper) parallel.
- T019 (RR signedLifecycleEndBalance) + T020 (Generic) parallel.
- T029 (E2E) + T033 (CLAUDE.md) + T034 (BACKLOG.md) parallel.
- Different user stories (Phases 3, 4, 5) can be developed in parallel by different agents AFTER Phase 2 checkpoint, with the caveat that lockstep on the HTML files requires careful merge.

---

## Parallel Example: User Story 1

```text
# Spawn three Engineers in parallel after T008 (RED test confirmed):
Engineer A (Frontend):    T009  — RR _shouldOverrideStatusToInfeasible helper
Engineer B (Frontend):    T010  — Generic _shouldOverrideStatusToInfeasible helper
Engineer C (Frontend):    T011  — renderFireStatus wiring in BOTH HTMLs (this engineer
                                  needs both A and B output before final wiring; in
                                  practice Manager dispatches A+B, waits, then C)
```

## Parallel Example: User Story 2 + User Story 3 concurrent

```text
# After Phase 2 + Phase 3 checkpoint, two engineers run in parallel:
Engineer A (Backend):     T014–T023  — sim extension + resolver threading
Engineer B (Backend):     T024–T028  — crossValidationWarnings extension

# Both touch calc-layer surface but in disjoint locations:
#   A: simulateRetirementOnlySigned, signedLifecycleEndBalance, resolver wrapper
#   B: calc/calcAudit.js, audit-dump assembly in HTMLs

# Manager merges output and runs T029 (E2E) once both report green.
```

---

## Implementation Strategy

### MVP (US1 only) — ship fast to close misleading pill

1. Phases 1 + 2 (Setup + Foundational).
2. Phase 3 (US1) — stop-gap pill guard.
3. **STOP and validate**: SC-027 reproducer no longer shows green "On Track". Browser smoke. Capture screenshot. This is shippable as a hot-fix to main if the user wants it merged independently of US2/US3.

### Full feature delivery

1. Phases 1 + 2.
2. Phase 3 (US1) — MVP stop-gap.
3. Phases 4 + 5 (US2 + US3) — root-cause threading + audit visibility.
4. Phase 6 (Polish) — E2E, lockstep audit, perf check, docs, closeout.
5. Browser smoke (T035) is the merge gate — user-driven per CLAUDE.md "Browser smoke before claiming done".

### Parallel team strategy (3 engineers, 1 manager)

- Manager runs Phases 1 + 2 alone.
- After Phase 2 checkpoint, dispatch three Engineers in parallel:
  - Engineer A: US1 (T007–T013)
  - Engineer B: US2 (T014–T023)
  - Engineer C: US3 (T024–T028)
- Manager runs Phase 6 alone (lockstep audit, browser smoke, closeout).

Time estimate (single engineer): ~2.5 hours implementation + ~30 min smoke + closeout. Parallel: ~1.5 hours.

---

## Notes

- `[P]` markers indicate file-disjoint tasks safe to parallelize.
- `[US?]` labels map every story-phase task back to spec.md user stories for traceability.
- Tests precede implementation in every story phase per Constitution IV + standard TDD.
- Commit after each Checkpoint (end of Phase 2, end of US1, end of US2+US3, end of Polish). Use `feat(028):` prefix per existing commit conventions.
- `_shouldOverrideStatusToInfeasible` and the `simulateRetirementOnlySigned` options thread are KEPT after US2 lands — the helper becomes inert in normal operation but remains a safety net for any future strategy that someone adds without threading.
- If T032 performance check fails (recalc > 200 ms), do NOT roll back — file a follow-up task and ship; the user is materially better off with a slow correct verdict than a fast misleading one.
- Constitution Principle I (lockstep) is enforced at T031 via a mechanical diff audit. Do not skip.
