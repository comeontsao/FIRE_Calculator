---

description: "Task list for feature 030 — cash-sweep to stocks"
---

# Tasks: Cash-Sweep to Stocks

**Input**: Design documents from `specs/030-cash-sweep-stocks/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/cash-sweep.contract.md`, `quickstart.md`

**Tests**: Tests are MANDATORY per spec FR-009 / Constitution Principle IV (gold-standard regression coverage).

**Organization**: Tasks grouped by user story. US1 + US2 share a phase (both P1, both about the toggle's primary behavior — opt-in works, opt-out preserves status quo).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story this task belongs to (US1, US2, US3, US4, US5) or unlabeled for shared work
- Include exact file paths in descriptions

## Path Conventions

- `FIRE-Dashboard.html` (RR) and `FIRE-Dashboard-Generic.html` (Generic) at repo root
- `calc/cashSweep.js` for the new helper module
- `calc/calcAudit.js` for the new `_invariantF` audit invariant
- `calc/accumulateToFire.js` for the accumulation-phase sweep call
- `tests/unit/` for Node `node:test` unit tests
- `tests/e2e/` for Playwright E2E specs
- `FIRE-Dashboard Translation Catalog.md` for i18n catalog rows

## Phase 1: Setup (Shared Verification)

**Purpose**: Capture pre-change baseline; lock in the working tree before any edit.

- [ ] T001 Verify clean working tree: `git status` returns "nothing to commit"; current branch is `030-cash-sweep-stocks`.
- [ ] T002 Capture baseline test counts: run `npm run test:unit` and confirm 548/548 unit tests pass (the post-029 baseline). Run `npx playwright test --project=chromium feature-018-strategy-matrix` and confirm matrix tests pass (cheap smoke baseline). Record exact counts in scratchpad for FR-008 verification at end.
- [ ] T003 [P] Record pre-change lockstep diff: `git diff --stat main...HEAD -- FIRE-Dashboard.html FIRE-Dashboard-Generic.html` and confirm zero changes (we are on a fresh feature branch).

**Checkpoint**: Baseline locked. Any post-change run can be diffed against this snapshot.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Create the pure `_applyCashSweep` helper module that every simulator will call. The helper is a single source of truth and must be in place before any integration site is wired.

**⚠️ CRITICAL**: No user-story work can begin until the helper exists and its unit tests pass.

- [ ] T004 Create `calc/cashSweep.js` with the `_applyCashSweep` function per `contracts/cash-sweep.contract.md`. UMD-style: `const _api = { _applyCashSweep }; if (module.exports) module.exports = _api; if (globalThis) globalThis._applyCashSweep = _applyCashSweep;`. Function signature: `_applyCashSweep(pCash, pStocks, threshold, age, currentAge, enabled) → {pCash, pStocks, swept}`. Decision-table logic per contract. Defensive guards on NaN/Infinity inputs. Threshold clamped to `Math.max(0, threshold)` internally.
- [ ] T005 Create `tests/unit/cashSweepHelper.test.js` with the 12 cases enumerated in `research.md` R-8 (toggle OFF; year 0 preservation; year-1 sweep fires; year-1 below threshold no-op; threshold = 0; threshold = $10M; threshold < 0 clamped to 0; threshold > pCash; pCash = 0; pCash exactly equals threshold; partial-FIRE-year scale; NaN/Infinity defensive return). Run `node --test tests/unit/cashSweepHelper.test.js` and confirm all 12 pass.

**Checkpoint**: Pure helper exists, unit-tested. Ready to integrate into simulators.

---

## Phase 3: User Story 1 + User Story 2 — Toggle ON enables sweep; toggle OFF byte-identical to pre-feature (Priority: P1) 🎯 MVP

**Goal**: Plumb the helper into every simulator + add UI + persistence. When the toggle is ON with default $10K threshold, the Lifecycle chart's cash trajectory converges to threshold by end-of-life. When OFF (default), every chart and KPI is byte-identical to pre-feature output.

**Independent Test**: Open canonical RR fixture. With toggle OFF (default), Lifecycle chart age-100 cash = $354K real (unchanged from pre-feature). Flip toggle ON; cash at age-100 ≈ $10K real, year-0 cash = $80K real (starting cash preserved). Repeat in Generic HTML. Strategy ranker's per-strategy `endBalance` agrees with chart's age-100 portfolio total for the displayed winner.

### Tests for US1 + US2 (write FIRST; verify FAILING before implementation)

- [ ] T006 [P] [US1] Create `tests/unit/cashSweepSimulatorIntegration.test.js`. Mirror feature 028's `signedSimStrategyOptions.test.js` structural-pin pattern. For each of the 5 inline simulators in each HTML (`signedLifecycleEndBalance` × 2 phases, `simulateRetirementOnlySigned`, `_simulateStrategyLifetime`, `computeWithdrawalStrategy`), assert: (a) function body contains `_applyCashSweep(`, (b) call appears AFTER a `pCash *= 1.005` (or `pCash *= (1 + 0.005 * scale)` for partial-year-aware) line, (c) result is destructured into `pCash` and `pStocks` (post-sweep state propagates). 10 cases (5 sims × 2 HTMLs). Currently FAILING (helper not yet wired).
- [ ] T007 [P] [US1] Add structural pin to `tests/unit/cashSweepSimulatorIntegration.test.js`: `calc/accumulateToFire.js` body contains `_applyCashSweep(` after its `pCash *= 1.005` line. 1 case. Currently FAILING.
- [ ] T008 [P] [US2] Create `tests/unit/cashSweepRrFixture.test.js`. Load `calc/cashSweep.js` + `calc/accumulateToFire.js` via Node `require()`. Build the canonical RR fixture inputs (Roger 42, cash savings $80K, stocks $465K, all defaults). Run `accumulateToFire` with toggle OFF and confirm end-of-accumulation pCash matches the pre-feature value (record exact number from baseline run as a fixture constant). Run again with toggle ON + $10K threshold and confirm end-of-accumulation pCash converges to $10K. Year-0 (currentAge=42) pCash = $80K in both cases. 6 cases total. Currently FAILING.
- [ ] T009 [P] [US1] Create `tests/e2e/cash-sweep-toggle.spec.ts`. Matrix: `[FIRE-Dashboard.html, FIRE-Dashboard-Generic.html] × [toggle OFF, toggle ON]`. For each cell: load page, locate the new toggle by `data-i18n="plan.cashSweepToggle"` attribute, confirm initial unchecked state (cell OFF); flip toggle if ON cell; switch to Retirement → Lifecycle tab; hover age 100; parse the chart tooltip's cash value. Assert: OFF cell → cash ≈ $110K Book Value (pre-feature value); ON cell → cash ≈ $30K Book Value (≈ $10K real × inflation^58). 4 cases. Currently FAILING.

### Implementation for US1 + US2

- [ ] T010 [US2] Add `cashSweepEnabled` and `cashSweepThreshold` to the `_PERSISTED_INPUT_KEYS` array in `FIRE-Dashboard.html` (line ~17263–17278). Same edit in `FIRE-Dashboard-Generic.html` at the corresponding location.
- [ ] T011 [US2] Extend `getInputs()` in `FIRE-Dashboard.html` (line ~7877, where `pviCashflowOverrideEnabled` is read): read `document.getElementById('cashSweepEnabled')?.checked` into `inp.cashSweepEnabled`, default `false`; read `document.getElementById('cashSweepThreshold')?.value` parsed as float into `inp.cashSweepThreshold`, default `10000`, clamp negative to `0`. Mirror in Generic HTML at the same place.
- [ ] T012 [US1] Add UI controls to `FIRE-Dashboard.html` in the Plan tab → Investment section, immediately after the existing `pviCashflowOverrideEnabled` block (~line 3178). Markup per `research.md` R-5: a `<div class="control-group">` with a checkbox toggle + hidden numeric input. Toggle `onchange` calls a new `_cashSweepUpdateVisibility(); recalcAll();` function. Threshold `oninput` updates the visible label and calls `recalcAll()`. Mirror in Generic HTML.
- [ ] T013 [US1] Add the `_cashSweepUpdateVisibility()` JS function in `FIRE-Dashboard.html` (mirroring `_cashflowUpdateOverrideVisibility` at line ~15901). Shows/hides the threshold input wrapper based on toggle state. Add the same function in Generic HTML.
- [ ] T014 [US1] Add `<script src="calc/cashSweep.js"></script>` tag to `FIRE-Dashboard.html` near the other `calc/*.js` script tags (search for `calc/calcAudit.js` to find the location). Mirror in Generic HTML.
- [ ] T015 [US1] Insert the canonical call-site block from `contracts/cash-sweep.contract.md` into each of the 5 inline simulators in `FIRE-Dashboard.html`. Specifically at: line ~9196 (`signedLifecycleEndBalance` accumulation), ~9273 (`signedLifecycleEndBalance` retirement), ~9855 (`simulateRetirementOnlySigned`, partial-year scale-aware), ~11856 (`_simulateStrategyLifetime`), ~12464 (`computeWithdrawalStrategy`). Each call uses the appropriate `simulatorId` literal for its trace push. Mirror byte-identical in Generic HTML.
- [ ] T016 [US1] Insert the canonical call-site block into `calc/accumulateToFire.js` after line 711. `simulatorId: 'accumulateToFire'`. Trace push opt-in via `options.cashSweepTraces`.
- [ ] T017 [US1] Run `node --test tests/unit/cashSweepSimulatorIntegration.test.js`. All 11 structural-pin cases (10 inline + 1 accumulateToFire) must now PASS.
- [ ] T018 [US2] Run `node --test tests/unit/cashSweepRrFixture.test.js`. All 6 numerical cases must now PASS.
- [ ] T019 [US1] Run E2E: `npx playwright test --project=chromium cash-sweep-toggle`. All 4 cases must PASS.

**Checkpoint**: MVP shippable. Toggle ON closes the user-reported cash-stockpile pattern; toggle OFF preserves snapshot reproducibility. Independently testable.

---

## Phase 4: User Story 3 — Threshold reflects today's purchasing power (Priority: P2)

**Goal**: Verify the threshold is interpreted as real-$ (today's purchasing power) end-to-end. No simulator multiplies the threshold by an inflation factor anywhere.

**Independent Test**: With toggle ON + $10K threshold, the simulator's per-year cash floor in real-$ is exactly $10K at every age (within within-year noise band). In Book Value (nominal-$) display, the floor visually scales with `1.04^(age - currentAge)` — at age 100, the floor appears as ~$30K, NOT $10K.

### Tests for US3 (write FIRST; verify FAILING before implementation, though if Phase 3 was implemented correctly, these may already PASS)

- [ ] T020 [P] [US3] Add a new test block to `tests/unit/cashSweepHelper.test.js`: invoke `_applyCashSweep` with the same `threshold = 10000` across ages 50, 60, 70, 80, 100. Assert: in every case, the function uses the threshold as-is (no internal multiplication by an inflation factor). Verify by passing `pCash = 50000` and expecting `swept = 40000` regardless of age (helper is age-agnostic about threshold scaling).

### Implementation for US3

(No additional code changes — the spec's real-$ interpretation is enforced by the helper signature: threshold is a plain number, callers pass `inp.cashSweepThreshold` which lives in real-$.)

- [ ] T021 [US3] Run `node --test tests/unit/cashSweepHelper.test.js`. The new age-agnostic case PASSES.

**Checkpoint**: Threshold semantics locked. Real-$ interpretation matches every other Plan-tab dollar input.

---

## Phase 5: User Story 4 — All six simulators apply the sweep identically; new audit invariant (Priority: P2)

**Goal**: Add the `_invariantF` audit invariant in `calc/calcAudit.js`. Verifies that every simulator's per-age post-sweep pool state agrees within $1. Defensive regression-prevention armor (mirrors feature 029's `_invariantE` pattern).

**Independent Test**: With sweep ON and the canonical fixture, the audit's `crossValidationWarnings` array contains zero `simulator-cash-sweep-parity` entries. Artificially induce a divergence (e.g., bypass the helper call in one simulator); the invariant fires with structured warning.

### Tests for US4 (write FIRST; verify FAILING before implementation)

- [ ] T022 [P] [US4] Create `tests/unit/cashSweepAuditInvariant.test.js`. 8 cases per `research.md` R-8:
  - Empty `cashSweepTraces` → 0 warnings.
  - Undefined `cashSweepTraces` → 0 warnings.
  - All simulators agree at every age → 0 warnings.
  - One simulator's pCash diverges by > $1 at age 57 → exactly 1 warning at age 57 with structured `simulators` map, `delta`, and bilingual-ready reason.
  - One simulator's pStocks diverges by > $1 → warning fires (the helper checks both pools).
  - Within $1 tolerance → no warning (floating-point noise filter).
  - Multiple ages, only one violating → exactly 1 warning at the offending age.
  - Single-simulator entry per age → no warning (need ≥ 2 to compare).
  - Currently FAILS because `_invariantF` doesn't exist.

### Implementation for US4

- [ ] T023 [US4] Add `_invariantF` function to `calc/calcAudit.js` per `contracts/cash-sweep.contract.md`. Inserts alongside `_invariantE` (added by feature 029). Reads `ctx.cashSweepTraces` array, groups by age, computes pCash + pStocks range across simulators, emits warning when > $1. Export via `_api._invariantF_test_only_ = _invariantF` for direct unit testing.
- [ ] T024 [US4] Wire `_invariantF` into the cross-validation chain in `assembleAuditSnapshot`: add `crossValidationWarnings.push(..._invariantF(options, ctx));` alongside the existing `_invariantE` call.
- [ ] T025 [US4] Run `node --test tests/unit/cashSweepAuditInvariant.test.js`. All 8 cases must PASS.

**Checkpoint**: Audit invariant in place. Any future regression of cash-sweep parity fires immediately on audit pass.

(Note: Trace-array pipeline-side wiring — pushing `{age, simulatorId, pCash, pStocks, swept}` rows from each simulator into a shared `ctx.cashSweepTraces` array during a recalc — is included in T015/T016's call-site block per the contract. So `_invariantF` has live data when traces are captured.)

---

## Phase 6: User Story 5 — Bilingual UI controls (Priority: P3)

**Goal**: Ship EN + zh-TW translations for the 4 new user-visible strings (toggle label, threshold label, threshold help-tip, sweep info-tip) per Constitution Principle VII. Verify the language toggle preserves state.

**Independent Test**: Switch language from EN to 中文; toggle label and threshold input label both translate; toggle state and threshold value persist. Catalog rows present in both HTMLs.

### Tests for US5

- [ ] T026 [P] [US5] Add catalog-presence test cases to `tests/unit/cashSweepSimulatorIntegration.test.js` (or a new `tests/unit/cashSweepI18nCatalog.test.js`): assert each HTML contains all 4 keys in both its `TRANSLATIONS.en` and `TRANSLATIONS.zh` dicts. 16 cases (4 keys × 2 languages × 2 HTMLs).

### Implementation for US5

- [ ] T027 [P] [US5] Add 4 new keys to `TRANSLATIONS.en` and `TRANSLATIONS.zh` in `FIRE-Dashboard.html`. Use the text from `research.md` R-7. Keys: `plan.cashSweepToggle`, `plan.cashSweepThreshold`, `plan.cashSweepTooltip`, `plan.cashSweepThresholdHelp`. Mirror byte-identical in Generic HTML.
- [ ] T028 [P] [US5] Add the same 4 keys + bilingual strings to `FIRE-Dashboard Translation Catalog.md`.
- [ ] T029 [US5] Confirm UI markup from T012 uses `data-i18n` (and `data-i18n-tip` for the info-tip) attributes wired to these keys.
- [ ] T030 [US5] Run `node --test` on the catalog-presence test from T026. All 16 cases PASS.

**Checkpoint**: Bilingual compliance gate satisfied. Constitution VII enforcement passed.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final verification, lockstep audit, documentation, browser smoke gate, commit.

- [ ] T031 Lockstep verification: `git diff main...HEAD -- FIRE-Dashboard.html FIRE-Dashboard-Generic.html | grep -E '^[+-]' | grep -v '^[+-][+-][+-]' | wc -l` per HTML side. Confirm RR added-line count and Generic added-line count match within ±1 (the 1-line tolerance is RR personal content per Constitution I). Document exact counts in CLOSEOUT.
- [ ] T032 [P] Run full test suite: `npm run test:unit && npx playwright test --project=chromium`. Confirm 548 baseline + new tests (T005, T006/T007, T008, T020, T022, T026) = 600+ unit; 4 new E2E (T009 matrix). All pass. Pre-existing E2E failures on `main` (the 10 from feature 029 verification) must remain pre-existing — not newly caused.
- [ ] T033 [P] Run Constitution review-gate checks: `node --test tests/unit/strategyMatrix.test.js` (review-gate 6, Spending-Funded-First); `node --test tests/unit/modeObjectiveOrthogonality.test.js` (review-gate 7). Both must PASS (sweep is upstream of these gates, no regression expected).
- [ ] T034 [P] Update `CLAUDE.md` Active Feature line: replace "PLANNING COMPLETE — TASKS PENDING" with "IMPLEMENTATION COMPLETE — AWAITING BROWSER SMOKE". Add a one-line summary of what shipped (helper module + 6 simulator integration sites + UI + i18n + new audit invariant).
- [ ] T035 [P] Create `specs/030-cash-sweep-stocks/CLOSEOUT.md` following the feature 028/029 template. Sections: Summary, Tests (before/after counts), Files Modified (with line deltas), Constitution Compliance table (all 9 PASS), Success Criteria Verification (SC-030-A through SC-030-H), Known Risks / Follow-ups, Merge Gate description, Diff Stats.
- [ ] T036 **Manual browser smoke gate** (per CLAUDE.md "Browser smoke before claiming a feature done"). Follow `quickstart.md` smoke checklist end-to-end:
  - Open both HTMLs in real browser. Cold load. KPI cards numeric. DevTools console clean.
  - Plan → Investment → confirm new toggle present, unchecked by default.
  - Flip toggle ON, confirm threshold input visible at $10K.
  - Lifecycle tab → hover age 42 (year-0): cash = $80K real. Hover age 100: cash ≈ $10K real.
  - Change threshold to $50K: chart re-renders; age-100 cash ≈ $50K real.
  - Change threshold to $0: age-100 cash ≈ $0; no NaN.
  - Audit tab: `crossValidationWarnings` has zero `simulator-cash-sweep-parity` entries.
  - Switch EN ↔ 中文: labels translate, state persists.
  - Reload page: toggle + threshold persist via `localStorage`.
  - Flip toggle OFF: chart returns to pre-toggle behavior (age-100 cash ≈ $354K real). Verify it matches what main produced pre-feature (snapshot reproducibility).
  - Repeat for Generic HTML.
  - Document each step's outcome in `CLOSEOUT.md` under "Merge Gate".
- [ ] T037 Final commit: stage all changes; commit with message `feat(030): cash-sweep to stocks with adjustable threshold` and a body summarizing: helper module, 6 integration sites, UI + i18n, audit invariant, test counts, lockstep audit result. Push if user authorizes.

**Checkpoint**: Feature 030 ready for merge to `main` after T036 user-side browser smoke confirms.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies. Establishes baseline.
- **Phase 2 (Foundational — helper)**: Depends on Phase 1. **BLOCKS all user stories** — helper must exist before any integration site is wired.
- **Phase 3 (US1 + US2 — toggle ON/OFF MVP)**: Depends on Phase 2. **The MVP.** Closes the user-reported behavior request.
- **Phase 4 (US3 — real-$ frame)**: Depends on Phase 2 (NOT on Phase 3 — only needs the helper). Can run in parallel with Phase 3 if staffed.
- **Phase 5 (US4 — audit invariant)**: Depends on Phase 3 (trace push code lives in T015/T016 call sites, which Phase 3 implements).
- **Phase 6 (US5 — i18n)**: Depends on Phase 3 (UI markup from T012 must reference the i18n keys).
- **Phase 7 (Polish)**: Depends on all desired user-story phases being complete.

### User Story Dependencies

- **US1 + US2 (P1)**: Combined phase. Same code change set (helper + integration + UI + persistence).
- **US3 (P2)**: Standalone-ish. Helper-level concern. Can ship parallel to Phase 3 in principle.
- **US4 (P2)**: Depends on US1+US2 being in place so the trace array sees real values from real recalcs.
- **US5 (P3)**: Depends on UI markup from US1.

### Within Each User Story

- Tests FIRST (T006, T007, T008, T009 for US1+US2; T020 for US3; T022 for US4; T026 for US5). Verify failing before implementation.
- Implementation second.
- Test re-run after implementation; must PASS.

### Parallel Opportunities

- T006 / T007 / T008 / T009 parallel (different test files).
- T010 / T011 sequential (touch same file, but different sections — can be a single commit).
- T012 / T013 / T014 sequential per-HTML (all touch the same HTML file).
- T015 / T016 sequential (different files but T016 depends on T004's helper existing).
- T022 standalone (different file from Phase 3 code).
- T027 / T028 parallel (different files: HTMLs vs catalog).
- T032 / T033 / T034 / T035 parallel (different files: tests / CLAUDE.md / CLOSEOUT.md).

---

## Parallel Example: Phase 3 (US1 + US2)

```bash
# Two engineers can split:
# Engineer A (Frontend) — UI scaffolding + i18n preparation:
Task: "T010 + T011 — persistence + getInputs() in both HTMLs"
Task: "T012 + T013 — UI markup + visibility function in both HTMLs"
Task: "T014 — script tag for calc/cashSweep.js"

# Engineer B (Backend) — simulator integration + helper module:
Task: "T015 — 5 inline simulator call sites in both HTMLs"
Task: "T016 — accumulateToFire.js call site"

# QA Engineer in parallel:
Task: "T006 + T007 + T008 — structural + numerical unit tests"
Task: "T009 — E2E matrix spec"

# After T015 + T016 land, all 4 test files re-run; all PASS.
```

---

## Implementation Strategy

### MVP First (US1 + US2 only)

1. Complete Phase 1: Setup (verify baseline).
2. Complete Phase 2: Foundational (helper module + helper unit tests).
3. Complete Phase 3: US1 + US2 (UI + persistence + integration + tests).
4. **STOP and VALIDATE**: Run T019 E2E; manually verify in browser. Chart's cash trajectory converges to threshold when toggle ON.
5. Optionally ship MVP at this checkpoint (skip Phases 4–6 for a future iteration, but bilingual gate would block merge — so realistically include US5).

### Incremental Delivery

1. Setup + Foundational → helper ready.
2. Add US1+US2 → integration tests pass → demo internally.
3. Add US3 → real-$ frame test passes → consistency confirmed.
4. Add US4 → audit invariant → regression-prevention armor.
5. Add US5 → bilingual UI → Constitution VII satisfied.
6. Polish → lockstep + browser smoke → merge to main.

### Parallel Team Strategy

With three engineers:

1. All three complete Setup + Foundational together.
2. Engineer A (Frontend): UI + i18n (T010–T014, T027–T030).
3. Engineer B (Backend): Calc integration + audit invariant (T015–T016, T023–T025).
4. QA Engineer (parallel): All test files (T005, T006, T007, T008, T009, T020, T022, T026).
5. Polish phase done together.

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks.
- [Story] label maps task to user story for traceability.
- Tests MUST fail before implementation (TDD). Verify each failure manually before T012/T015 edits.
- Lockstep edit discipline: RR first, mechanical diff against Generic, byte-identical body. Manager verifies via `diff` after each pair of HTML edits.
- Commit after each completed phase or logical group; final commit at T037 collects the feature.
- Stop at any checkpoint (end of Phase 3, end of Phase 5, end of Phase 6) and validate independently.
- Avoid: editing simulator math beyond the canonical insertion site; touching `taxOptimizedWithdrawal` or other strategy internals (out of scope per Constitution VIII); changing the formula for the threshold (it's a constant real-$ floor per spec FR-003).
