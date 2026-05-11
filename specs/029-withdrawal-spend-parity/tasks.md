---

description: "Task list for feature 029 — withdrawal-simulator spend parity"
---

# Tasks: Withdrawal-Simulator Spend Parity

**Input**: Design documents from `specs/029-withdrawal-spend-parity/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/grossSpend-parity.contract.md`, `quickstart.md`

**Tests**: Tests are MANDATORY per spec FR-009 and FR-010 (gold-standard regression coverage, Constitution Principle IV).

**Organization**: Tasks grouped by user story; US1 + US2 share a phase because the same single code change resolves both.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story this task belongs to (US1, US2, US3, US4) or unlabeled for shared work
- Include exact file paths in descriptions

## Path Conventions

- `FIRE-Dashboard.html` (RR) and `FIRE-Dashboard-Generic.html` (Generic) at repository root
- `calc/calcAudit.js` for audit invariants
- `tests/unit/` for Node `node:test` unit tests
- `tests/e2e/` for Playwright E2E specs

## Phase 1: Setup (Shared Verification)

**Purpose**: Capture pre-change baseline; lock in the working tree before any edit.

- [X] T001 Verify clean working tree: `git status` returns "nothing to commit"; current branch is `029-withdrawal-spend-parity`.
- [X] T002 Capture baseline test counts: run `npm run test:unit` and confirm 528/528 pass; run `npm run test:e2e -- --project=chromium` and confirm 8/8 pass. Record exact counts in scratchpad for FR-008 verification at end.
- [X] T003 [P] Record pre-fix lockstep diff baseline: `git diff --stat main...HEAD -- FIRE-Dashboard.html FIRE-Dashboard-Generic.html` and verify zero changes (we are on a fresh feature branch).

**Checkpoint**: Baseline locked. Any post-fix run can be diffed against this snapshot.

---

## Phase 2: Foundational (Blocking Prerequisites for All Stories)

**Purpose**: Establish shared scaffolding the user-story phases will plug into.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Read `contracts/grossSpend-parity.contract.md` end-to-end; confirm the canonical formula and consumer table match current code (use grep on the line numbers listed). If any line reference is off by more than ±5 lines, update the contract before proceeding.
- [X] T005 [P] In `FIRE-Dashboard.html`, locate `_simulateStrategyLifetime` (line ~11698). Read lines 11781–11820 (the retirement-year loop ctx construction). Confirm the bug: `grossSpend: retireSpend` with no overlay terms. Same in `FIRE-Dashboard-Generic.html` (line ~12071, ctx ~12178). Document the exact pre-fix line range in `plan.md` Project Structure notes if the line numbers drift.
- [X] T006 [P] In `calc/calcAudit.js`, locate `_invariantA` (line ~648) and `_invariantD` (added by feature 028). Identify the next free letter for the new invariant; default to `_invariantE`. Confirm `crossValidationWarnings` is the array `_invariantA` pushes to and that `_invariantE` will push to the same array.

**Checkpoint**: Code archaeology done. Engineers know where to edit and which patterns to mirror.

---

## Phase 3: User Story 1 + User Story 2 — Withdrawal Strategy chart truthfulness + Strategy ranker correctness (Priority: P1) 🎯 MVP

**Goal**: Eliminate Bug A. After this phase, the Withdrawal Strategy chart bar at college / pre-65-healthcare years shows the overlay-inclusive total nominal drawdown that matches the Lifecycle chart's portfolio drop. Strategy ranker scores under correct spending.

**Independent Test**: Open RR repro fixture (default inputs, kid2 at college age 18 when Roger=57, aggressive-bracket-fill winner under Exact mode). Hover Withdrawal Strategy chart at Roger 57. Bar total ~$184K nominal (was $132K). Lifecycle chart unchanged. Repeat in Generic HTML. Switch through all 8 strategies; bar height for the active strategy matches that strategy's drawdown.

### Tests for US1 + US2 (write FIRST; verify FAILING before implementation)

- [ ] T007 [P] [US1] Create `tests/unit/simulatorGrossSpendParity.test.js` with the following structural pins:
  - For RR HTML: load via the existing `vm`-sandboxed test pattern (mirror `tests/unit/signedSimStrategyOptions.test.js`); construct a canonical input fixture (Roger 42, kid2 age 3, college kid2 = `us-public-oos`, scenario = `taiwan`, fireAge = 54).
  - For each retirement age in `[54, 57, 60, 65, 70, 73, 80, 100]`, call all three simulators directly and capture each one's per-year `grossSpend` value. Assert `|grossSpend_simX − grossSpend_simY| ≤ 1.0` for every pair (X, Y) of `{computeWithdrawalStrategy, _simulateStrategyLifetime, signedLifecycleEndBalance}`.
  - Test must currently FAIL because `_simulateStrategyLifetime`'s grossSpend = `retireSpend` only (missing overlays at ages 57–60 college years and post-65 healthcare delta).
  - Mirror the same test for Generic HTML (separate `it(...)` block). 16 total parity cases (8 ages × 2 HTMLs).
- [ ] T008 [P] [US2] Create `tests/unit/perStrategyEndBalanceMatchesChart.test.js`:
  - For the canonical fixture, for each of the 8 strategies × 3 modes (Safe / Exact / DWZ) = 24 combinations, run the strategy ranker AND `projectFullLifecycle` with the strategy as override.
  - Capture (a) ranker's stored `endBalance` for that strategy, (b) chart's age-100 `row.total`.
  - Assert `|endBalance_ranker − endBalance_chart| ≤ 1.0` for each combo when both ≥ 0.
  - When ranker reports `feasibleUnderCurrentMode: false`, no end-balance assertion (skip the row).
  - Mirror for Generic HTML. 48 total combo cases.
  - This will currently FAIL on combos where college/healthcare overlay years are in the trajectory (most cases).
- [ ] T009 [P] [US1] Create `tests/e2e/withdrawal-bar-college-years.spec.ts`:
  - Matrix: `[FIRE-Dashboard.html, FIRE-Dashboard-Generic.html] × [en, zh-TW] × [age 57, 58, 59, 60]`.
  - For each cell: load the page, switch to Retirement → Withdrawal Strategy tab, hover the bar at the target age, parse the tooltip's stacked-total nominal value.
  - Assert the parsed value is within ±$2K of $184K (overlay-inclusive expected nominal at age 57; scaled appropriately for ages 58–60 per inflation).
  - 32 total E2E cases. Currently FAILING.

### Implementation for US1 + US2

- [X] T010 [US1] Edit `FIRE-Dashboard.html` `_simulateStrategyLifetime` (line ~11803): replace the ctx grossSpend line with the overlay-inclusive computation. Specifically:
  - BEFORE: `const ctx = { age, grossSpend: retireSpend, ssIncome: ssThisYear, ... };`
  - AFTER: compute three new locals immediately above the ctx — `const yearsFromNow = age - _qInp.ageRoger;` `const hcDelta = getHealthcareDeltaAnnual(selectedScenario, age);` `const collegeCostThisYear = getTotalCollegeCostForYear(_qInp, yearsFromNow);` `const h2Carry = (secondHomeEnabled && h2 && h2Purchased) ? getSecondHomeAnnualCarryAtYear(h2, yearsFromNow, yrsToFire) : 0;` `const grossSpendYear = Math.max(0, retireSpend + hcDelta + collegeCostThisYear + h2Carry);` Then ctx becomes `{ age, grossSpend: grossSpendYear, ssIncome: ssThisYear, ... }`.
  - Note: confirm `secondHomeEnabled`, `h2`, `h2Purchased`, `yrsToFire` are in closure scope of `_simulateStrategyLifetime`. If `h2Purchased` isn't tracked inside the loop, mirror `signedLifecycleEndBalance`'s pattern (RR `:9110-9133`) to detect post-FIRE h2 purchase. If complexity exceeds 10 lines, simplify by setting `h2Carry = 0` (matches `computeWithdrawalStrategy`'s current limitation) and log a follow-up backlog item.
- [X] T011 [US1] Apply byte-identical edit in `FIRE-Dashboard-Generic.html` `_simulateStrategyLifetime` (line ~12176). Same code, byte-for-byte (no personal-content variation here).
- [X] T012 [US1] Run `tests/unit/simulatorGrossSpendParity.test.js` — must now PASS for all 16 cases (8 ages × 2 HTMLs).
- [X] T013 [US2] Run `tests/unit/perStrategyEndBalanceMatchesChart.test.js` — must now PASS for all 48 cases. Document any case that legitimately changes the strategy ranker winner; this is acceptable per research R-4.
- [ ] T014 [US1] Run `tests/e2e/withdrawal-bar-college-years.spec.ts` against Chromium — must now PASS for all 32 cases.

**Checkpoint**: Bug A closed. Chart bars truthful, ranker correct, audit invariant suite ready for invariant addition in Phase 4. Independently testable & deployable.

---

## Phase 4: User Story 3 — Signed simulator agrees with chart simulator on end balance (Priority: P2)

**Goal**: Suppress the noisy `endBalance-mismatch` audit warning when both signed-sim and chart-sim agree on feasibility verdict. Bug B's residual 16% gap remains a documented design difference (clamping vs negative-pool preservation), surfaced only when verdicts diverge.

**Independent Test**: Open audit JSON for canonical repro fixture. `crossValidationWarnings` array contains zero `endBalance-mismatch` entries when both A ≥ 0 and B ≥ 0. Artificially induce a verdict disagreement (e.g., force a fixture where signed-sim shows depletion while chart clamps to $0); warning fires.

### Tests for US3 (write FIRST; verify FAILING before implementation)

- [ ] T015 [P] [US3] Create `tests/unit/endBalanceMismatchSuppressionWhenBothFeasible.test.js`:
  - Stub `_invariantA`'s inputs with three fixtures:
    - Fixture A: signed-sim endBalance = $250K, chart-sim endBalance = $324K, both feasible (A ≥ 0 AND B ≥ 0). Assert ZERO warnings emitted post-fix.
    - Fixture B: signed-sim endBalance = −$50K, chart-sim endBalance = $30K. Verdict disagreement (signed says infeasible, chart clamps to feasible). Assert ONE warning emitted with `expected: false` and reason naming the verdict disagreement.
    - Fixture C: signed-sim endBalance = $324,227, chart-sim endBalance = $324,227 (exact agreement). Assert ZERO warnings (diff = 0, well below $1000 threshold — existing pre-condition).
  - Currently FAILS because Fixture A emits a warning today (pre-fix `bothFeasible` path returns `expected: true` but still pushes the row).

### Implementation for US3

- [X] T016 [US3] Edit `calc/calcAudit.js` `_invariantA` (line ~648–732): change the `bothFeasible` branch to RETURN EARLY (no push) instead of pushing a warning with `expected: true`. Specifically: after computing `const bothFeasible = A >= 0 && B >= 0;`, add `if (bothFeasible && !strategyMismatch) return out;` BEFORE the `out.push(...)` block. The `strategyMismatch` branch continues to push (because that's a legitimate root-cause warning even when both are positive — preserves diagnostic surface for feature 028 follow-ups). Update the function-header comment to document the suppression.
- [X] T017 [US3] Run `tests/unit/endBalanceMismatchSuppressionWhenBothFeasible.test.js` — must now PASS for all 3 fixtures.
- [X] T018 [US3] Run the full `tests/unit/` suite — confirm no other test regressed (other audit-warning consumer tests).

**Checkpoint**: Bug B's user-visible symptom (cluttered audit panel) closed. Underlying clamp vs signed-debt design difference preserved as documented behavior.

---

## Phase 5: User Story 4 — Simulator-grossSpend-parity audit invariant (Priority: P3)

**Goal**: Add the `simulator-grossSpend-parity` audit invariant per contract. Future regressions of Bug A get caught at the audit layer immediately instead of via user repro.

**Independent Test**: Run the audit on a canonical fixture; new invariant emits zero warnings. Artificially induce a parity violation (e.g., add 0.5 to one simulator's grossSpend in a test scaffold); invariant fires with structured warning.

### Tests for US4 (write FIRST; verify FAILING before implementation)

- [ ] T019 [P] [US4] Create `tests/unit/grossSpendParityAuditInvariant.test.js`:
  - Test 1: Pass a `simulatorTraces` array with three matching simulator rows at age 57 (all `grossSpend = 102_155` real). Call `_invariantE`. Assert ZERO warnings.
  - Test 2: Pass a `simulatorTraces` array with one outlier (`_simulateStrategyLifetime: 73_400` vs the other two at 102,155). Assert ONE warning with `kind: 'simulator-grossSpend-parity'`, `age: 57`, `diff: ~28755`, `simulators` map present.
  - Test 3: Pass an empty `simulatorTraces` array. Assert ZERO warnings.
  - Test 4: Pass `simulatorTraces = undefined` (caller didn't enable tracing). Assert ZERO warnings (graceful no-op).
  - Currently FAILS because `_invariantE` doesn't exist.

### Implementation for US4

- [X] T020 [US4] Edit `calc/calcAudit.js`: add `_invariantE` function per the contract's signature in `contracts/grossSpend-parity.contract.md`. Body:
  1. Read `ctx.simulatorTraces` (array). If undefined or empty, return `[]`.
  2. Group rows by `age`.
  3. For each age, compute `min` and `max` of `grossSpend` across rows. `diff = max - min`.
  4. If `diff > 1.0`, push a `crossValidationWarnings` entry with `{ kind: 'simulator-grossSpend-parity', age, simulators: { [simulatorId]: grossSpend, ... }, diff, expected: false, reason }`.
  5. Return the accumulated array.
- [X] T021 [US4] Wire `_invariantE` into the audit pipeline: locate the `runInvariants(...)` / `crossValidationWarnings.push(...)` orchestrator in `calc/calcAudit.js` and add a call site that invokes `_invariantE(options, ctx)` and concatenates its return value. Confirm `ctx.simulatorTraces` is plumbed through the audit-snapshot builder (may need a small extension to `assembleAuditSnapshot`'s `ctx` shape).
- [ ] T022 [US4] Edit `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html`: at the audit-snapshot assembly site (line ~13099 RR, ~13472 Generic), instantiate `const _simulatorTraces = [];`, pass it into each of the three simulators via `options.simulatorTraces`, then thread it into the audit ctx as `ctx.simulatorTraces`. NOTE: the simulators must already accept `options.simulatorTraces` per the contract. This task may require small additive edits at each simulator's entry to push `{ age, simulatorId, grossSpend }` when the array is present. Keep allocation gated on `Array.isArray(options.simulatorTraces)` per contract.
- [X] T023 [US4] Run `tests/unit/grossSpendParityAuditInvariant.test.js` — must PASS all 4 cases.
- [ ] T024 [US4] Manual audit panel check (developer-side): load RR HTML, open Audit tab, verify `crossValidationWarnings` array contains zero `simulator-grossSpend-parity` entries (correct parity post-fix).

**Checkpoint**: Audit invariant in place. Any future regression of Bug A fires immediately on first audit pass.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final verification, lockstep audit, documentation, browser smoke gate.

- [X] T025 Lockstep verification: `git diff main...HEAD -- FIRE-Dashboard.html FIRE-Dashboard-Generic.html | grep -E '^[+-]' | wc -l` — confirm RR line count and Generic line count match within ±1 (the 1-line tolerance is RR personal content per Constitution I). Document the exact line counts in the closeout.
- [X] T026 [P] Run full test suite: `npm run test:unit && npm run test:e2e -- --project=chromium`. Confirm 528 baseline + 5 new test files added (T007, T008, T009 E2E, T015, T019) = ~565+ unit tests; 8 baseline + 8 new E2E (from T009 matrix) = 16 E2E. All pass. Document exact pass counts for SC-029-E verification.
- [X] T027 [P] Update `CLAUDE.md` Active Feature line: replace "PLANNING COMPLETE — TASKS PENDING" with "IMPLEMENTATION COMPLETE — AWAITING BROWSER SMOKE". Add a one-line summary of what shipped (Bug A fix + Bug B warning suppression + new audit invariant) and reference the test counts.
- [X] T028 [P] Create `specs/029-withdrawal-spend-parity/CLOSEOUT.md` following the feature 028 template. Sections: Summary, Tests (before/after counts), Files Modified (with line deltas), Constitution Compliance table (all 9 PASS), Success Criteria Verification (SC-029-A through SC-029-F), Known Risks / Follow-ups (h2Carry in `computeWithdrawalStrategy`, signed-sim trajectory drift documentation), Merge Gate description, Diff Stats.
- [X] T029 Run `tests/unit/strategyMatrix.test.js` (per Constitution review-gate 6, Spending-Funded-First). Confirm all canonical "starvation locus" cases still close the shortfall — the Bug A fix must NOT have introduced a spending-floor regression. If any fail, halt and investigate before merging.
- [X] T030 Run `tests/unit/modeObjectiveOrthogonality.test.js` (per Constitution review-gate 7). Confirm Mode and Objective remain orthogonal — the Bug A fix is upstream of `getActiveSortKey` so this should pass unchanged.
- [ ] T031 **Manual browser smoke gate** (per CLAUDE.md "Browser smoke before claiming a feature done"). Follow `quickstart.md` smoke checklist end-to-end:
  - Open both HTMLs in real browser.
  - Reproduce SC-029-A (bar at age 57 ~$184K nominal in both HTMLs).
  - Verify SC-029-B (audit `crossValidationWarnings` empty for default fixture).
  - Cycle Mode × Objective; verify no regressions.
  - Toggle EN ↔ 中文; verify number labels translate.
  - Test the negative cases (no-college fixture, no-h2 fixture) to confirm zero regression at non-overlay ages.
  - Document each step's outcome in `CLOSEOUT.md` under "Merge Gate".
- [ ] T032 Final commit: stage all changes; commit with message `feat(029): withdrawal-simulator spend parity + audit invariant` and a body summarizing: Bug A fix (overlay terms in `_simulateStrategyLifetime`), Bug B suppression (warning gating), new `simulator-grossSpend-parity` invariant, test counts, lockstep audit result.

**Checkpoint**: Feature 029 ready for merge to `main` after T031 user-side browser smoke confirms.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies. Establishes baseline.
- **Phase 2 (Foundational)**: Depends on Phase 1. Code archaeology before any edit.
- **Phase 3 (US1 + US2 — Bug A fix)**: Depends on Phase 2. **The MVP.** Closes the user-reported bug. Independently shippable.
- **Phase 4 (US3 — Bug B warning suppression)**: Depends on Phase 2 (NOT on Phase 3 — different file). May run in parallel with Phase 3 if staffed by a second engineer.
- **Phase 5 (US4 — new audit invariant)**: Depends on Phase 3 (the invariant exercises the post-fix simulator-trace shape). Optional in MVP scope.
- **Phase 6 (Polish)**: Depends on all desired user-story phases being complete.

### User Story Dependencies

- **US1 + US2 (P1)**: Combined phase; shares the single simulator-fix edit. Independently testable once Phase 3 is complete.
- **US3 (P2)**: Standalone. Edit is in `calc/calcAudit.js`, a different file from the simulator fix. Can ship without US1/US2 if needed.
- **US4 (P3)**: Depends on US1+US2 being in place so the trace array sees correct values. Can ship after MVP.

### Within Each User Story

- Tests FIRST (T007, T008, T009 for US1+US2; T015 for US3; T019 for US4). Verify failing before implementation.
- Implementation second.
- Test re-run after implementation; must pass.

### Parallel Opportunities

- T005 / T006 parallel (different files).
- T007 / T008 / T009 parallel (different test files).
- T010 / T011 sequential (lockstep edit; safer to do RR first then mirror exact diff to Generic).
- T015 standalone (different file from T010/T011); can run parallel to Phase 3 with a second engineer.
- T019 / T020 / T022 parallel-ish (T019 test file; T020 invariant code; T022 simulator trace wiring — but T021 wires them together).
- T026 / T027 / T028 parallel (different files: test-run reporting / CLAUDE.md / CLOSEOUT.md).

---

## Parallel Example: Phase 3 (US1 + US2)

```bash
# Two engineers can split:
# Engineer A: tests
Task: "T007 Create tests/unit/simulatorGrossSpendParity.test.js"
Task: "T008 Create tests/unit/perStrategyEndBalanceMatchesChart.test.js"
Task: "T009 Create tests/e2e/withdrawal-bar-college-years.spec.ts"

# Engineer B: implementation (after baseline tests fail confirmed)
Task: "T010 Edit FIRE-Dashboard.html _simulateStrategyLifetime"
Task: "T011 Mirror edit in FIRE-Dashboard-Generic.html"

# Merge: run tests T012, T013, T014 sequentially to verify all pass.
```

---

## Implementation Strategy

### MVP First (US1 + US2 Only)

1. Complete Phase 1: Setup (verify baseline).
2. Complete Phase 2: Foundational (code archaeology).
3. Complete Phase 3: US1 + US2 (Bug A fix + tests).
4. **STOP and VALIDATE**: Run T014 E2E; manually verify in browser. The chart bars are now truthful.
5. Optionally ship MVP at this checkpoint (skip Phases 4–5 for a future iteration).

### Incremental Delivery

1. Setup + Foundational → ready to edit.
2. Add US1+US2 → tests pass → MVP shippable.
3. Add US3 → warning suppression → cleaner audit panel.
4. Add US4 → new invariant → regression-prevention armor.
5. Polish → lockstep + browser smoke → merge to main.

### Parallel Team Strategy

With two engineers:

1. Both complete Setup + Foundational together.
2. Engineer A: Phase 3 (US1 + US2).
3. Engineer B: Phase 4 (US3) in parallel — different file, no conflict.
4. Both converge on Phase 5 (US4) — Engineer A wires simulator traces; Engineer B writes invariant + tests.
5. Polish phase done together.

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks.
- [Story] label maps task to user story for traceability.
- Tests MUST fail before implementation (TDD). Verify each failure manually before T010/T011 edit.
- Lockstep edit discipline: T010 → T011 with byte-identical body (different file). Manager verifies via `diff` after T011.
- Commit after each completed phase or logical group; final commit at T032 collects the feature.
- Stop at any checkpoint (end of Phase 3, end of Phase 4, end of Phase 5) and validate independently.
- Avoid: editing simulator math without testing first; touching `getActiveSortKey` (out of scope per Constitution IX); changing the formula for any input function (out of scope per spec FR-011).
