---
description: "Tasks for feature 023 — Accumulation-vs-Retirement Spend Separation"
---

# Tasks: Accumulation-vs-Retirement Spend Separation

**Input**: Design documents from `/specs/023-accumulation-spend-separation/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓, quickstart.md ✓

**Tests**: TDD-style. Test tasks are included for the calc-engine changes (Constitution IV gold-standard regression coverage).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4, US5, US6)
- Include exact file paths in descriptions

## Path Conventions

- **Single project layout**: zero-build, dual-HTML lockstep. Calc modules in `calc/`. Tests in `tests/`. Specs in `specs/023-accumulation-spend-separation/`.
- All HTML edits ship to BOTH `FIRE-Dashboard.html` AND `FIRE-Dashboard-Generic.html` per Constitution Principle I.
- All bilingual strings ship to TRANSLATIONS.en + TRANSLATIONS.zh in both HTMLs + Translation Catalog per Principle VII.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify clean baseline before any code changes.

- [ ] T001 Verify on branch `023-accumulation-spend-separation` with clean working tree by running `git status --short` and `git branch --show-current`
- [ ] T002 [P] Verify baseline test count by running `node --test tests/**/*.test.js` and confirming 478 passing + 1 intentional skip + 0 failures (inherits from 022 merge)
- [ ] T003 [P] Verify both HTMLs are present and lockstep-aligned by running `wc -l FIRE-Dashboard.html FIRE-Dashboard-Generic.html` (line count delta should be small, mostly RR-personal content)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the helper + extend the options bag + update calc engine. ALL six caller updates (Phases 3-5) depend on this.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T004 Define `getAccumulationSpend(inp)` helper as inline JavaScript in `FIRE-Dashboard.html` near `getTotalMonthlyExpenses()` (line ~7594), per `contracts/getAccumulationSpend-helper.contract.md`. Body: read `getTotalMonthlyExpenses() × 12`; if ≥ $1,000 return it, else return $120,000 (FR-002a fallback). Add `// FRAME: real-$` annotation per Constitution VI.
- [ ] T005 Define `getAccumulationSpend(inp)` helper as inline JavaScript in `FIRE-Dashboard-Generic.html` near `getTotalMonthlyExpenses()` (matching line ~7594 region) — body byte-identical to T004 per Principle I lockstep.
- [ ] T006 [P] Write unit tests for the helper at `tests/unit/getAccumulationSpend.test.js` per `contracts/getAccumulationSpend-helper.contract.md` § Test Contract. ≥8 cases: $0 input, sub-floor input, above-floor inputs, undefined fn, NaN, realistic frugal/RR/wealthy users. Use `_harnessGetAccumulationSpend` wrapper that injects a stubbed `getTotalMonthlyExpensesFn`.
- [ ] T007 Extend `resolveAccumulationOptions(inp, fireAge, mortgageStrategyOverride)` in `FIRE-Dashboard.html` (line 9868–9895) to include `accumulationSpend: getAccumulationSpend(inp)` field in the returned options object.
- [ ] T008 Extend `resolveAccumulationOptions(...)` in `FIRE-Dashboard-Generic.html` (matching line region) — body byte-identical to T007.
- [ ] T009 Modify `calc/accumulateToFire.js` to read `options.accumulationSpend` for `baseAnnualSpend` resolution per `contracts/accumulateToFire-options-bag.contract.md` § Fallback chain. Implement the 4-tier soft-fall: `options.accumulationSpend → inp.annualSpend → inp.monthlySpend × 12 → 0`. Set per-row `spendSource` diagnostic. Set `cashFlowWarning='MISSING_SPEND'` on the final fallback.
- [ ] T010 Update module-header docblock in `calc/accumulateToFire.js` (lines 1–100): bump version to `v5 — feature 023`; extend `Inputs:` block with `options.accumulationSpend (number, optional, real-$)`; extend `Outputs:` block with `perYearRows[].spendSource (string, optional)`. Update `// FRAME: real-$` annotation at the spending-resolution site (~line 590).
- [ ] T011 Update `tests/unit/accumulateToFire.test.js` `baseOptions()` fixture builder to include `accumulationSpend: 50000` (a stable test value that keeps existing arithmetic close to current expectations). Annotate any assertion that shifts with `// 023: spendSource=options.accumulationSpend`.
- [ ] T012 [P] Add 6 new test cases `v5-spend-1` through `v5-spend-6` to `tests/unit/accumulateToFire.test.js` per `contracts/accumulateToFire-options-bag.contract.md` § Testing requirements: explicit value, options preferred over inp, explicit zero, negative coercion, monthlySpend fallback, MISSING_SPEND warning.
- [ ] T013 Update `tests/meta/frame-coverage.test.js` to recognize `options.accumulationSpend` as a valid `// FRAME: real-$` annotation site. Confirm meta-test stays ≥95% qualifying-line coverage.

**Checkpoint**: Foundation ready — all caller updates can now begin. Run `node --test tests/unit/getAccumulationSpend.test.js tests/unit/accumulateToFire.test.js` and confirm green.

---

## Phase 3: User Story 1 - Pre-FIRE accumulation uses real US household spending (Priority: P1) 🎯 MVP

**Goal**: The chart's accumulation phase consumes `accumulationSpend` so the cash-flow residual reflects real US spending. Year-1 portfolio Book Value Δ drops from +$191,722 to ~+$96,851 (SC-001 < $100k).

**Independent Test**: Open `FIRE-Dashboard.html` in Chrome via `file://`. Hover Lifecycle chart at age 42 then age 43. Confirm Δ < $100,000 (down from current $191,722). Cash bucket Δ ≈ $0 (down from +$97,683).

### Implementation for User Story 1

- [ ] T014 [US1] Verify `projectFullLifecycle` (caller #2, RR line 10079, Generic line 10429) consumes `accumulationSpend` via `resolveAccumulationOptions(...)`. Reading the existing code: `_accumOpts = resolveAccumulationOptions(inp, fireAge, _mortgageStrategy)` then `accumulateToFire(inp, fireAge, _accumOpts)`. After T007/T008, `_accumOpts.accumulationSpend` is now populated. NO CODE CHANGE NEEDED — verify via grep + manual trace.
- [ ] T015 [US1] Verify `signedLifecycleEndBalance` (caller #1, RR line 8904, Generic line 9273) routes through `resolveAccumulationOptions` (it does — line 8898/8903). Confirm the new field flows through. NO CODE CHANGE NEEDED — verify only.
- [ ] T016 [US1] Open `FIRE-Dashboard.html` in browser via `file://`. With default inputs (annualIncome=$150k, line items ≈ $120k, TW selected), hover Lifecycle chart at age 42 then age 43. Capture Total Portfolio Book Value at each age. Verify Δ < $100,000.
- [ ] T017 [US1] In the same browser session, open Audit tab. Find the year-0 (age 42) accumulation row. Verify `annualSpending ≈ $120,000` (NOT $0) AND `spendSource === 'options.accumulationSpend'` AND `cashFlowWarning` is empty or `NEGATIVE_RESIDUAL` (NOT `MISSING_SPEND`).
- [ ] T018 [US1] Run audit harness conservation invariant `tests/unit/validation-audit/cash-flow-conservation.test.js` (or whatever feature 020 named it) and confirm 0 findings on all 92 personas.

**Checkpoint**: At this point, the bug is FIXED on the chart. SC-001, SC-002, SC-006 satisfied. MVP complete.

---

## Phase 4: User Story 2 - Post-FIRE retirement uses ONLY country-tier (no contamination) (Priority: P1)

**Goal**: Confirm `projectFullLifecycle`'s retirement-phase loop (ages ≥ fireAge) consumes only `annualSpend` (country-tier), never `accumulationSpend`. Switching country tier moves only retirement-phase withdrawals.

**Independent Test**: With current country = TW, capture FIRE age and end-of-life portfolio. Switch to Stay-in-US. Verify accumulation-phase trajectory (ages 42 → fireAge) is UNCHANGED; only retirement-phase trajectory changes. Switch back to TW.

### Implementation for User Story 2

- [ ] T019 [US2] Audit `projectFullLifecycle`'s retirement-phase loop body (RR HTML, lines 10152–end of function). Confirm every reference to spending in the retirement branch (`age >= fireAge`) reads `annualSpend` (the second positional argument to projectFullLifecycle), NOT `accumulationSpend` or any clone of it. Document the audit in a comment block.
- [ ] T020 [P] [US2] Mirror T019 for `FIRE-Dashboard-Generic.html`. Confirm parity.
- [ ] T021 [US2] Add audit-harness invariant `tests/unit/validation-audit/country-tier-isolation.test.js`: for each persona, run `projectFullLifecycle(inp, twSpend, ...)` and `projectFullLifecycle(inp, usSpend, ...)`. Verify accumulation-phase pool values (years 0..yrsToFire) are byte-identical between the two runs (within ±$0.01). Severity: HIGH.
- [ ] T022 [US2] Manually verify the country-tier swap test (per quickstart.md Step 3) on RR-baseline. Capture screenshots of Lifecycle chart pre-swap and post-swap.

**Checkpoint**: SC-003 (country-tier purity) verified. US2 complete.

---

## Phase 5: User Story 5 - All 6 callers of `accumulateToFire` consistent (Priority: P2)

**Goal**: All 6 callers in each HTML × 2 HTMLs = 12 sites consume the same `accumulationSpend` value. Caller #6 (cashflow-warning-pill, currently uses `{}`) is refactored to use `resolveAccumulationOptions`.

**Independent Test**: Run new audit-harness invariant `accumulationSpendConsistency` on all 92 personas × 3 modes × 6 callers. All cells PASS (0 findings).

### Implementation for User Story 5

- [ ] T023 [US5] Verify `_simulateStrategyLifetime` (caller #3, RR line 11375) consumes `accumulationSpend`. The existing call uses `resolveAccumulationOptions(_qInpForAccum, _qFireAge, ...)` so the new field flows through automatically. NO CODE CHANGE; verify only.
- [ ] T024 [P] [US5] Mirror T023 for `FIRE-Dashboard-Generic.html` (line 11757).
- [ ] T025 [US5] Verify `computeWithdrawalStrategy` (caller #4, RR line 11865) consumes `accumulationSpend`. Existing call routes through `resolveAccumulationOptions`. NO CODE CHANGE; verify only.
- [ ] T026 [P] [US5] Mirror T025 for Generic (line 12258).
- [ ] T027 [US5] Verify `findEarliestFeasibleAge` (caller #5, RR line 12615) consumes `accumulationSpend`. Existing call routes through `resolveAccumulationOptions` per the `_firstAccumRow` capture path. NO CODE CHANGE; verify only.
- [ ] T028 [P] [US5] Mirror T027 for Generic (line 12998).
- [ ] T029 [US5] **REFACTOR caller #6 (cashflow-warning-pill) in `FIRE-Dashboard.html` line 15338**: replace `accumulateToFire(inp, fireAge, {})` with `accumulateToFire(inp, fireAge, resolveAccumulationOptions(inp, fireAge, 'invest-keep-paying'))`. This routes the new `accumulationSpend` field through and brings caller #6 into lockstep with the other 5.
- [ ] T030 [US5] Mirror T029 for `FIRE-Dashboard-Generic.html` line 15755.
- [ ] T031 [US5] Add audit-harness invariant `tests/unit/validation-audit/accumulation-spend-consistency.test.js` per `contracts/accumulationSpendConsistency-invariant.md`. 92 personas × 3 modes × 6 callers × 2 assertions (AS-1 + AS-2) = 3,312 cells. Severity: HIGH.
- [ ] T032 [US5] Update `tests/unit/validation-audit/harness.js` `boundFactory(persona)` to extend `_accumOpts` with `accumulationSpend` per `data-model.md` Entity 4. Build chain: `persona.inp.accumulationSpend ?? persona.inp.monthlySpend × 12 ?? 120000`.

**Checkpoint**: SC-004 + SC-005 satisfied. All 6 callers consistent across both HTMLs (12 sites). FR-007 satisfied.

---

## Phase 6: User Story 3 - Audit visibility (Priority: P2)

**Goal**: Audit dump (Copy Debug) exposes both spending values; per-row `spendSource` diagnostic visible in Audit tab.

**Independent Test**: Click Copy Debug. Paste JSON. Confirm top-level fields `accumulationSpend` (numeric, ≈ $120k) AND `annualSpend` (numeric, ≈ $60k for TW) AND `accumulationSpend_source = 'getAccumulationSpend(inp)'`.

### Implementation for User Story 3

- [ ] T033 [US3] Extend `copyDebugInfo()` in `FIRE-Dashboard.html` (line ~19107) to include top-level `accumulationSpend: getAccumulationSpend(inp)` AND `accumulationSpend_source: 'getAccumulationSpend(inp)'` (or `'fallback'` if helper unavailable). The existing top-level `annualSpend: spend` stays unchanged.
- [ ] T034 [P] [US3] Mirror T033 for `FIRE-Dashboard-Generic.html`.
- [ ] T035 [US3] Verify the Audit tab's per-row table renders `spendSource` column (or shows the value in an existing diagnostic column). If the Audit tab doesn't already render row-level diagnostic fields, add a small inline annotation showing `spendSource` next to `annualSpending` value for accumulation rows.
- [ ] T036 [P] [US3] Mirror T035 for Generic.

**Checkpoint**: US3 complete. Future bug investigations can immediately tell which spending value the simulator used.

---

## Phase 7: User Story 4 - Backwards compatibility (Priority: P2)

**Goal**: Pre-023 CSV snapshots, persona records, and saved localStorage states continue to load and produce valid results.

**Independent Test**: Import a pre-023 CSV snapshot. Verify it parses, populates the dashboard, renders chart correctly. Audit harness 92-persona run reports total findings ≤ 1 LOW (post-022 baseline).

### Implementation for User Story 4

- [ ] T037 [US4] Smoke test pre-023 CSV import: copy any existing row from `FIRE-snapshots.csv`, paste into the import flow, verify parsing succeeds and historical chart renders.
- [ ] T038 [US4] Smoke test pre-023 localStorage state: clear localStorage, manually inject a known-pre-023 saved state JSON (capture from `git show HEAD~10:localStorage-key-set` if available, else fabricate one without `accumulationSpend` key), refresh dashboard, verify it loads cleanly with no console errors.
- [ ] T039 [US4] Run full audit harness `node --test tests/unit/validation-audit/**/*.test.js` and confirm total findings ≤ 1 LOW (the existing E3 residual `RR-pessimistic-frugal` from feature 022 B-022-1).
- [ ] T040 [US4] If Phase 5 plumbing side-effects also resolved B-022-1 (the `_chartFeasibility` discreteness issue from feature 022), update BACKLOG.md accordingly.

**Checkpoint**: SC-007 satisfied. No regressions; backwards-compat verified.

---

## Phase 8: User Story 6 - Bilingual UI labels (Priority: P3)

**Goal**: Plan-tab Expenses pill caption distinguishes "current spending" (drives accumulation) from country-tier post-FIRE spending. Both EN and zh-TW.

**Independent Test**: Open dashboard in EN, view Plan tab Expenses pill caption. Toggle to 中文, verify caption translates with parallel meaning. No `[key.not.found]` strings.

### Implementation for User Story 6

- [ ] T041 [US6] Add 3 new translation keys to `TRANSLATIONS.en` AND `TRANSLATIONS.zh` in `FIRE-Dashboard.html`:
  - `expenses.caption.currentSpending` — EN "Current spending (US household, today's dollars)"; zh "目前支出（美國家計，今日購買力）"
  - `expenses.caption.appliesTo` — EN "Sums into accumulation-phase cash flow"; zh "計入累積階段現金流"
  - `geo.tooltip.postFireOnly` — EN "Annual budget applies post-FIRE, in {0}"; zh "年度預算適用於FIRE後，於{0}"
- [ ] T042 Mirror T041 in `FIRE-Dashboard-Generic.html`.
- [ ] T043 [P] [US6] Render the `expenses.caption.currentSpending` caption near the Plan-tab Expenses pill total in `FIRE-Dashboard.html`. Use `data-i18n="expenses.caption.currentSpending"` per Principle VII.
- [ ] T044 [P] [US6] Mirror T043 in `FIRE-Dashboard-Generic.html`.
- [ ] T045 [P] [US6] Add tooltip `geo.tooltip.postFireOnly` to the Geography-tab country-tier display rows in both HTMLs.
- [ ] T046 [US6] Update `FIRE-Dashboard Translation Catalog.md` with the 3 new keys + EN + zh-TW pairs.

**Checkpoint**: US6 complete. UI is self-documenting; the two spending concepts are visually distinct.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Test sweep, audit run, closeout documentation. CRITICAL gate before user merge.

- [ ] T047 Run full unit test suite: `node --test tests/**/*.test.js`. Target: ≥484 tests passing (478 baseline + 6 new from T006/T012/T031).
- [ ] T048 [P] Run full audit harness: `node --test tests/unit/validation-audit/**/*.test.js`. Verify ≤ 1 LOW finding total. New invariants (`country-tier-isolation`, `accumulation-spend-consistency`) report 0 findings.
- [ ] T049 [P] Run frame-coverage meta-test: `node --test tests/meta/frame-coverage.test.js`. Verify ≥95% qualifying-line coverage maintained.
- [ ] T050 Generate `specs/023-accumulation-spend-separation/audit-report.md`: per-invariant detail, severity breakdown, comparison to feature 022 baseline (1 LOW → ?), backlog handoff (B-023-* if any).
- [ ] T051 Generate `specs/023-accumulation-spend-separation/CLOSEOUT.md`: phase-by-phase summary with commit hashes, total commits, test totals, findings, what changed (display layer / calc layer / audit infrastructure / docs), key design decisions per spec § Clarifications, browser-smoke gate (T053), merge-readiness statement, lessons codified.
- [ ] T052 Update `BACKLOG.md`: mark feature 023 entries closed; close B-022-1 if Phase 5 plumbing fixed it; add any new B-023-* items from audit-report.md.
- [ ] T053 Flip `CLAUDE.md` SPECKIT block to **AWAITING USER BROWSER-SMOKE (T054) before merge to `main`**. Update test totals + audit findings + commit hashes.
- [ ] T054 Final commit: `phase9(023): closeout — audit report + CLOSEOUT + BACKLOG + CLAUDE.md`.

---

## Phase 10: USER GATE — Browser Smoke + Merge

**⚠️ NOT EXECUTED BY CLI** — manual user-side verification per `quickstart.md`.

- [ ] T055 USER runs `quickstart.md` 8-step browser-smoke checklist on RR HTML.
- [ ] T056 USER runs same 8-step checklist on Generic HTML.
- [ ] T057 USER captures any failing-step screenshots into `specs/023-accumulation-spend-separation/browser-smoke/` if needed.
- [ ] T058 USER signs off on pre-merge gate matrix in `quickstart.md`.
- [ ] T059 USER merges to main via `git checkout main && git merge --no-ff 023-accumulation-spend-separation`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies. Sanity-check baseline.
- **Foundational (Phase 2)**: Depends on Setup. **BLOCKS all user-story phases.**
- **US1 (Phase 3)**: Depends on Foundational. The MVP — bug fix delivered here.
- **US2 (Phase 4)**: Depends on Foundational + US1 (US2 verifies country-tier purity, which assumes US1's accumulation-phase fix).
- **US5 (Phase 5)**: Depends on Foundational. Independent of US1/US2 (different callers). MAY ship in parallel with US2 if staffed.
- **US3 (Phase 6)**: Depends on Foundational + Phase 5 (audit dump exposes the new fields, which only have meaningful values after Phase 5 plumbing).
- **US4 (Phase 7)**: Depends on Phases 2–5 (backwards-compat verification needs all the new code in place).
- **US6 (Phase 8)**: Depends on Foundational. Independent of US1–US5 (UI labels only).
- **Polish (Phase 9)**: Depends on Phases 3–8 complete.
- **User Gate (Phase 10)**: Depends on Phase 9 complete.

### User Story Dependencies (within phases)

- **US1 (P1)**: Can start after Foundational. Self-contained verification + manual smoke.
- **US2 (P1)**: Can start after Foundational + US1. Builds on US1's accumulation fix to verify retirement is untouched.
- **US3 (P2)**: Can start after Foundational + US5 (audit dump fields populated by Phase 5).
- **US4 (P2)**: Can start after Phases 2–5 complete. Backwards-compat sweeps the entire fix.
- **US5 (P2)**: Can start after Foundational. Independent of other US.
- **US6 (P3)**: Can start after Foundational. Independent of other US.

### Within Each Phase

- Both-HTMLs lockstep tasks (e.g., T004↔T005, T007↔T008) MUST be committed in the same change set per Principle I.
- Tests written before implementation where TDD applies (T006, T012, T031 are tests; T009/T010 implement against them).
- Manual smoke tasks (T016, T017, T022) run AFTER the lockstep code changes are committed.

### Parallel Opportunities

| Parallelizable group | Tasks | Why parallel |
|---|---|---|
| Both-HTMLs lockstep edits | T004 ↔ T005; T007 ↔ T008; T020 ↔ T024 ↔ T026 ↔ T028; T029 ↔ T030; T033 ↔ T034; T035 ↔ T036; T041 ↔ T042; T043 ↔ T044 | Different files; disjoint regions; same intent |
| Test files | T006, T012, T031 (different test files) | Different file paths; different concerns |
| Phase 9 sweeps | T047, T048, T049 | Independent test invocations |

---

## Parallel Example: Phase 5 (US5) caller refactor

```bash
# Caller verification across both HTMLs in parallel:
Task A: T023 verify caller #3 in FIRE-Dashboard.html line 11375
Task B: T024 verify caller #3 in FIRE-Dashboard-Generic.html line 11757
Task C: T029 refactor caller #6 in FIRE-Dashboard.html line 15338
Task D: T030 refactor caller #6 in FIRE-Dashboard-Generic.html line 15755
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Phase 1: Setup (baseline check). ~5 min.
2. Phase 2: Foundational (helper + plumbing + tests). ~60 min.
3. Phase 3: US1 — pre-FIRE accumulation fix. ~20 min including manual smoke.
4. **STOP and VALIDATE**: Lifecycle chart shows realistic year-1 Δ < $100k. Bug visibly fixed.
5. Optional: ship MVP to user for first browser-smoke, then return for US2–US6.

### Incremental Delivery (recommended)

1. Phase 1 + Phase 2 (Foundational ready). Commit `phase2(023): foundational helper + options-bag plumbing`.
2. Phase 3 (US1). Commit `phase3(023): US1 pre-FIRE accumulation uses real spending`.
3. Phase 4 (US2). Commit `phase4(023): US2 country-tier purity verified + invariant added`.
4. Phase 5 (US5). Commit `phase5(023): US5 all 6 callers consistent + accumulationSpendConsistency invariant`.
5. Phase 6 (US3). Commit `phase6(023): US3 audit dump exposes accumulationSpend + spendSource diagnostic`.
6. Phase 7 (US4). Commit `phase7(023): US4 backwards-compat verified — pre-023 snapshots load clean`.
7. Phase 8 (US6). Commit `phase8(023): US6 bilingual labels distinguishing accumulation vs retirement`.
8. Phase 9. Commit `phase9(023): closeout`.

### Multi-Agent Parallel Strategy

Per the project's autonomous-implementation pattern (see CLAUDE.md "Multi-agent dispatch produces lockstep results when each agent gets the contract path"):

- **Wave 1 (Foundational, sequential)**: Backend Engineer + Frontend Engineer pair on Phase 2. Backend owns `calc/accumulateToFire.js` + tests; Frontend owns helper + `resolveAccumulationOptions` extension in both HTMLs.
- **Wave 2 (US1 + US2 + US5, parallel)**: 3 agents in parallel:
  - Agent 1 (Frontend): US1 + US2 verification + manual smoke notes.
  - Agent 2 (Backend): US5 (caller audit + caller #6 refactor + audit invariant).
  - Agent 3 (QA): write `country-tier-isolation.test.js` + `accumulation-spend-consistency.test.js` invariants.
- **Wave 3 (US3 + US4 + US6, parallel)**: 3 agents:
  - Agent 4 (Frontend): US3 audit dump extension + US6 bilingual labels.
  - Agent 5 (QA): US4 backwards-compat sweep.
  - Agent 6 (Backend or Frontend): US6 Translation Catalog update.
- **Wave 4 (Polish, sequential)**: Phase 9 closeout (single agent or main session).

Per the project pattern, each agent prompt MUST include: contract paths, exact files to edit (and which to leave alone), test command to run before "done", and commit message.

---

## Notes

- All [P] tasks operate on different files and have no interlocking dependencies.
- All `[USx]` labels map back to spec.md user stories for traceability.
- Each user-story phase delivers an independently testable increment.
- Tests are written **before** their implementation per Constitution IV (TDD-style for calc-engine changes).
- Lockstep gate (Principle I): both HTMLs MUST be in the same commit when paired tasks land. Sentinel-grep `getAccumulationSpend` in both files before each phase commits.
- Bilingual gate (Principle VII): every new user-visible string ships with EN + zh-TW + Translation Catalog update in the same commit.
- Constitution VIII gate: `tests/unit/spendingFloorPass.test.js` must stay green throughout (the retirement-phase strategy logic is NOT touched).

**Total tasks**: 59 (T001–T059). Of these, T055–T059 are user-side (Phase 10 user gate); CLI-executable count is **54**.
