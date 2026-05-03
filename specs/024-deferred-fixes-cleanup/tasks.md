---
description: "Tasks for feature 024 — Deferred Fixes Cleanup"
---

# Tasks: Deferred Fixes Cleanup

**Input**: Design documents from `/specs/024-deferred-fixes-cleanup/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ (3) ✓, quickstart.md ✓

**Tests**: TDD-style for calc changes per Constitution IV.

**Organization**: Tasks grouped by user story to enable parallel multi-wave dispatch. Wave 1 = lightweight (US2 + US6); Wave 2 = 4 heavyweight stories in parallel (US1 + US3 + US4 + US5).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story (US1–US6, mapping to spec.md)
- File paths absolute or repo-relative

## Path Conventions

- **Single project layout**: zero-build, dual-HTML lockstep. All HTML edits ship to BOTH `FIRE-Dashboard.html` AND `FIRE-Dashboard-Generic.html` per Constitution Principle I.
- All bilingual strings ship to `TRANSLATIONS.en` + `TRANSLATIONS.zh` in both HTMLs + Translation Catalog per Principle VII.

---

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 Verify on branch `024-deferred-fixes-cleanup` with clean working tree by running `git status --short` and `git branch --show-current`
- [ ] T002 [P] Verify baseline test count by running `node --test tests/**/*.test.js` and confirming 501 passing + 1 intentional skip + 0 failures (inherits from 023 merge)
- [ ] T003 [P] Verify both HTMLs are present and lockstep-aligned by running `wc -l FIRE-Dashboard.html FIRE-Dashboard-Generic.html`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: None for this feature — all 6 user stories are independent (no shared foundational helper to build first). Phase 0 research is already done. Skip directly to user-story phases.

---

## Phase 3: User Story 2 — `scenario.tax.china` deduplication (Priority: P3) — Wave 1

**Goal**: Remove the duplicate `scenario.tax.china` key in EN translation block of both HTMLs.

**Independent Test**: `grep -c "'scenario.tax.china':"` returns exactly 2 per HTML (1 EN + 1 zh-TW), not 3.

### Implementation for User Story 2

- [ ] T004 [US2] Run `grep -n "'scenario.tax.china':"` on `FIRE-Dashboard.html` to identify the duplicate (expected: line 5940 has zh-TW string mistakenly assigned to EN key; line 5941 has correct EN string)
- [ ] T005 [US2] Delete line 5940 from `FIRE-Dashboard.html` (preserve line 5941 with the correct EN string + the zh-TW block's separate `scenario.tax.china` entry)
- [ ] T006 [P] [US2] Mirror T005 in `FIRE-Dashboard-Generic.html` if the same duplicate exists (verify via grep first)
- [ ] T007 [US2] Verify post-fix: `grep -c "'scenario.tax.china':" FIRE-Dashboard.html` returns 2; same for Generic
- [ ] T008 [US2] Manual verification: open dashboard in browser → Geography → China scenario → toggle EN ↔ 中文 → confirm tax note text is correct in both languages

**Checkpoint**: US2 complete. Trivial fix; ~5 min total.

---

## Phase 4: User Story 6 — Documentation drift cleanup (Priority: P3) — Wave 1

**Goal**: Bring `BACKLOG.md`, `specs/023-accumulation-spend-separation/CLOSEOUT.md`, and `CLAUDE.md` SPECKIT block current with the 7 post-Phase-9 polish commits from feature 023.

**Independent Test**: After cleanup, `BACKLOG.md` "Done in feature 023" entry mentions FIRE NUMBER reframe + Year-by-Year Cash Flow audit section + Book Value sweep + B-023-7 strategy field-name fix. CLOSEOUT.md has a "Post-closeout polish" appendix.

### Implementation for User Story 6

- [ ] T009 [US6] Update `BACKLOG.md` "Done in feature 023" section to add bullet points for the 7 post-Phase-9 commits (`7694c1f` through `2f64c1a`): B-023-3 chart threshold, B-023-4 status copy, FIRE NUMBER reframe, age display fix, Year-by-Year Cash Flow audit section, cashflow column split, B-023-7 strategy field fix, B-023-8 Book Value sweep
- [ ] T010 [US6] Append "Post-closeout polish (2026-05-02)" section to `specs/023-accumulation-spend-separation/CLOSEOUT.md` listing the same 7 commits with their rationale + outcome
- [ ] T011 [US6] Verify `CLAUDE.md` SPECKIT block correctly identifies feature 024 as active (already updated in plan phase, but verify line still reads correctly)

**Checkpoint**: US6 complete. Pure docs; ~15 min total.

---

## Phase 5: User Story 1 — `_chartFeasibility` quantization (Priority: P2) — Wave 2 Agent A

**Goal**: Extend monthly-precision quantization (`Math.floor(age * 12) / 12`) from `_simulateStrategyLifetime` (feature 022 US5) to `_chartFeasibility`. E3 LOW count drops 1 → 0.

**Independent Test**: Audit harness E3 invariant on `RR-pessimistic-frugal` persona reports 0 findings post-fix (down from 1 in feature 022 baseline).

### Tests for User Story 1 (TDD)

- [ ] T012 [P] [US1] Write `tests/unit/chartFeasibility.test.js` (NEW): 3 cases verifying that `_chartFeasibility`'s output is stable when fireAge is perturbed by ±0.01yr (cases: borderline-feasible, infeasible, deep-feasible)

### Implementation for User Story 1

- [ ] T013 [US1] Locate `_chartFeasibility` in `FIRE-Dashboard.html` via grep; identify the `projectFullLifecycle(inp, ...)` invocation point
- [ ] T014 [US1] Apply `Math.floor(age * 12) / 12` quantization to `inp.ageRoger` and `fireAge` BEFORE the `projectFullLifecycle` call. Mirror the `_qInpForAccum` shadow-variable pattern from feature 022 US5 (around RR line 11371). Add `// FRAME: pure-data — quantize to monthly precision (B-022-1 fix)` annotation.
- [ ] T015 [P] [US1] Mirror T014 in `FIRE-Dashboard-Generic.html` (use `inp.agePerson1` instead of `ageRoger`)
- [ ] T016 [US1] Run `node --test tests/unit/chartFeasibility.test.js` → all green
- [ ] T017 [US1] Run audit harness on `RR-pessimistic-frugal` persona; verify E3 LOW count = 0

**Checkpoint**: US1 complete. SC-001 satisfied.

---

## Phase 6: User Story 3 — Healthcare cards Book Value (Priority: P2) — Wave 2 Agent B

**Goal**: Convert `renderHealthcareCard` HTML cards from real-$ to Book Value at the phase-midpoint age.

**Independent Test**: Open Geography tab → US scenario card → pre-65 cost ≈ $20,200 (= $14,400 × 1.03^11.5 for currentAge=42, midpoint=53.5).

### Implementation for User Story 3

- [ ] T018 [US3] Locate `renderHealthcareCard` and `HEALTHCARE_BY_COUNTRY` table in `FIRE-Dashboard.html` via grep
- [ ] T019 [US3] Modify `renderHealthcareCard` to compute pre-65 midpoint age `(currentAge + 65) / 2` and post-65 midpoint age `(65 + endAge) / 2`; convert each cost via `displayConverter.toBookValue(realCost, midpointAge, currentAge, inflationRate)` per the contract `contracts/healthcare-frame.contract.md`
- [ ] T020 [P] [US3] Mirror T019 in `FIRE-Dashboard-Generic.html`
- [ ] T021 [US3] Update bilingual labels in both HTMLs: pre-65 + post-65 cost labels gain "(Book Value)" / "(帳面價值)" frame suffix
- [ ] T022 [P] [US3] Add 4 new translation keys to `TRANSLATIONS.en` + `TRANSLATIONS.zh` in both HTMLs (label + frame-suffix variants for pre-65 and post-65)
- [ ] T023 [US3] Update `FIRE-Dashboard Translation Catalog.md` with the 4 new bilingual keys

**Checkpoint**: US3 complete. SC-003 satisfied.

---

## Phase 7: User Story 4 — SS COLA decoupling (Priority: P2) — Wave 2 Agent C

**Goal**: Add `ssCOLARate` slider that decouples Social Security COLA from `inflationRate`. Default = `inflationRate` to preserve current behavior.

**Independent Test**: Set `ssCOLARate = 2.5%` with `inflationRate = 3%`. Verify Withdrawal Strategy chart's SS bars at age 100 are ~13% lower (Book Value) compared to the inflation-coupled baseline.

### Tests for User Story 4 (TDD)

- [ ] T024 [P] [US4] Write `tests/unit/ssCOLA.test.js` (NEW): 5+ cases per the test contract in `contracts/ssCOLA-scaling.contract.md` (factor=1 when ssCOLA=inflation, shrinkage when <, growth when >, missing field falls back, edge cases at 0% and 5%)

### Implementation for User Story 4

- [ ] T025 [US4] Add new `<input type="range">` for `ssCOLARate` to the Investment tab's INVESTMENT & SAVINGS card in `FIRE-Dashboard.html`. Range: 0–5, step 0.5, default = `inflationRate` slider's value. ID: `ssCOLARate`. Live label `ssCOLARateVal` showing current value as %.
- [ ] T026 [P] [US4] Mirror T025 in `FIRE-Dashboard-Generic.html`
- [ ] T027 [US4] Add `ssCOLARate: parseFloat(document.getElementById('ssCOLARate').value) / 100` to `getInputs()` in `FIRE-Dashboard.html` with NaN fallback to `inp.inflationRate`
- [ ] T028 [P] [US4] Mirror T027 in `FIRE-Dashboard-Generic.html`
- [ ] T029 [US4] Locate the 6 retirement-loop callers per data-model.md Entity 2; for each `ssThisYear = ssActive ? ssAnnual : 0` site, replace with the per-year scaling formula `ssAnnual * Math.pow(1 + (inp.ssCOLARate ?? inp.inflationRate) - inp.inflationRate, age - inp.ssClaimAge)` per `contracts/ssCOLA-scaling.contract.md`
- [ ] T030 [P] [US4] Mirror T029 in `FIRE-Dashboard-Generic.html` (6 caller sites)
- [ ] T031 [US4] Add 3 new bilingual translation keys to both HTMLs: `inv.ssCOLARate.label`, `inv.ssCOLARate.help`, `inv.ssCOLARate.suffix`
- [ ] T032 [US4] Update `FIRE-Dashboard Translation Catalog.md` with the 3 new keys
- [ ] T033 [US4] Extend `copyDebugInfo()` in both HTMLs to expose top-level `ssCOLARate` + `ssCOLA_source`
- [ ] T034 [US4] Run `node --test tests/unit/ssCOLA.test.js` → all green

**Checkpoint**: US4 complete. SC-004 satisfied.

---

## Phase 8: User Story 5 — Sim reconciliation (Priority: P2) — Wave 2 Agent D

**Goal**: Extend `signedLifecycleEndBalance` with spending-floor pass + auto-`expected` annotation on cross-validation warnings <1% delta. Reconcile chart-vs-signed-sim to within 1%.

**Independent Test**: Cross-validation `endBalance-mismatch` invariant on all 92 personas reports zero unexpected (>1% AND `expected: false`) divergences.

### Tests for User Story 5 (TDD)

- [ ] T035 [P] [US5] Write `tests/unit/signedSimSpendingFloor.test.js` (NEW): 5+ cases per `contracts/signedSim-spendingFloor.contract.md` test contract (stocks/cash drain → Trad fund, all pools drain → negative endBalance preserved, pre-59.5 Trad locked, Roth fallback, parity within 1% of chart sim on RR-baseline)

### Implementation for User Story 5

- [ ] T036 [US5] **30-min trace**: write a one-off Node script that imports both simulators (extracted via audit harness), runs them on RR-baseline + TW persona, prints per-year `(age, signed_total, chart_total, delta, delta_pct)` to console. Identify first divergence year + root cause.
- [ ] T037 [US5] Capture trace findings in `specs/024-deferred-fixes-cleanup/research.md` Phase 0 R5 section (replace the hypothesis with confirmed root cause)
- [ ] T038 [US5] Locate `signedLifecycleEndBalance` in `FIRE-Dashboard.html` retirement-loop block. Add the 3-step spending-floor pass (stocks/cash drain → Trad fund if age ≥ 59.5 → Roth fallback) per `contracts/signedSim-spendingFloor.contract.md`. Preserve honest-sign property (pools CAN go negative when both Trad + Roth exhausted).
- [ ] T039 [P] [US5] Mirror T038 in `FIRE-Dashboard-Generic.html` (use `inp.agePerson1`)
- [ ] T040 [US5] Modify `calc/calcAudit.js` `assembleAuditSnapshot` cross-validation block. For `endBalance-mismatch` warnings, auto-set `expected: true` when `Math.abs(delta) / Math.abs(valueB) < 0.01` per data-model.md Entity 3
- [ ] T041 [US5] Run `node --test tests/unit/signedSimSpendingFloor.test.js` → all green
- [ ] T042 [US5] Run audit harness `cross-chart-consistency` invariant on all 92 personas; verify zero unexpected divergences

**Checkpoint**: US5 complete. SC-005 satisfied.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T043 Run full unit test suite: `node --test tests/**/*.test.js`. Target: ≥515 tests passing (501 baseline + ~14 new from T012, T024, T035).
- [ ] T044 [P] Run full audit harness: `node --test tests/unit/validation-audit/**/*.test.js`. Verify 0 LOW findings (down from 1 LOW post-023 baseline).
- [ ] T045 [P] Run frame-coverage meta-test: `node --test tests/meta/frame-coverage.test.js`. Verify ≥95% qualifying-line coverage maintained.
- [ ] T046 Verify lockstep parity: `grep -n "ssCOLARate\|_chartFeasibility.*Math.floor\|signed-sim spending-floor" FIRE-Dashboard.html FIRE-Dashboard-Generic.html` returns identical structure in both.
- [ ] T047 Generate `specs/024-deferred-fixes-cleanup/audit-report.md`: per-invariant detail; comparison to feature 023 baseline (1 LOW → 0 LOW); confirm no regressions.
- [ ] T048 Generate `specs/024-deferred-fixes-cleanup/CLOSEOUT.md`: phase-by-phase summary, commit hashes, key design decisions, browser-smoke gate, merge-readiness statement.
- [ ] T049 Update `BACKLOG.md`: add "Done in feature 024" section listing all 6 user-story outcomes.
- [ ] T050 Flip `CLAUDE.md` SPECKIT block to **AWAITING USER BROWSER-SMOKE before merge to `main`**. Update test totals + commit hashes.
- [ ] T051 Final commit: `phase9(024): closeout — audit report + CLOSEOUT + BACKLOG + CLAUDE.md`.

---

## Phase 10: USER GATE — Browser Smoke + Merge

**⚠️ NOT EXECUTED BY CLI** — manual user-side verification per `quickstart.md`.

- [ ] T052 USER runs `quickstart.md` 6-step browser-smoke checklist on RR HTML.
- [ ] T053 USER runs same 6-step checklist on Generic HTML.
- [ ] T054 USER captures any failing-step screenshots into `specs/024-deferred-fixes-cleanup/browser-smoke/` if needed.
- [ ] T055 USER signs off on pre-merge gate matrix in `quickstart.md`.
- [ ] T056 USER merges to main: `git checkout main && git merge --no-ff 024-deferred-fixes-cleanup`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies. ~5 min.
- **Foundational (Phase 2)**: SKIPPED — no shared foundation needed.
- **Wave 1 — US2 + US6 (Phases 3–4)**: Depend on Setup. Independent of each other and of Wave 2. ~20 min total.
- **Wave 2 — US1 + US3 + US4 + US5 (Phases 5–8)**: Depend on Setup. ALL FOUR INDEPENDENT — can ship in parallel. ~3 hrs total wall-clock if dispatched as 4 agents.
- **Polish (Phase 9)**: Depends on Phases 3–8 complete.
- **User Gate (Phase 10)**: Depends on Phase 9 complete.

### Within Each User Story

- TDD-style: tests written before implementation (T012, T024, T035 are tests; followed by implementation).
- Lockstep gate (Principle I): RR + Generic edits commit together.
- Bilingual gate (Principle VII): EN + zh-TW + Translation Catalog atomic with code change.

### Parallel Opportunities

| Group | Tasks | Why parallel |
|---|---|---|
| Wave 1 | T004–T008 (US2) + T009–T011 (US6) | Different files; one agent can do both |
| Wave 2 | T012–T017 (US1) + T018–T023 (US3) + T024–T034 (US4) + T035–T042 (US5) | Disjoint code regions |
| Both-HTMLs lockstep | T015↔T020↔T026↔T028↔T030↔T039 | Same intent, different file |
| Phase 9 sweeps | T043, T044, T045 | Independent test invocations |

---

## Implementation Strategy

### Recommended (multi-wave parallel)

1. **Phase 1** (Setup, sequential): ~5 min.
2. **Wave 1** (single agent does both): US2 dedup + US6 docs. ~20 min wall-clock. Commit `phase3+4(024): US2 dedup + US6 docs drift`.
3. **Wave 2** (4 agents parallel): US1 + US3 + US4 + US5. ~3 hrs wall-clock (longest = US4 SS COLA + US5 sim reconciliation). Manager merges results sequentially with grep verification. Commit per story.
4. **Phase 9** (closeout, sequential): ~30 min. Commit `phase9(024): closeout`.
5. **Phase 10** (USER GATE).

### Alternative: sequential

If Wave 2 parallel dispatch is unavailable, do US1 → US3 → US4 → US5 sequentially. Adds ~2 hrs wall-clock vs parallel.

### Multi-Agent Dispatch Strategy (per CLAUDE.md)

- **Wave 1 dispatch prompt** (single agent):
  > "Do US2 (dedup `scenario.tax.china` per `contracts/` and tasks T004–T008) and US6 (BACKLOG + CLOSEOUT updates per T009–T011). Skills: `/superpowers:verification-before-completion`. Run `node --test` after each story to confirm no regressions."

- **Wave 2 dispatch prompts** (4 parallel agents — Backend × 4):
  - Agent A: US1 (T012–T017) — `_chartFeasibility` quantization
  - Agent B: US3 (T018–T023) — Healthcare card Book Value
  - Agent C: US4 (T024–T034) — SS COLA decoupling
  - Agent D: US5 (T035–T042) — sim reconciliation + audit annotation

Each agent prompt MUST include: contract path, exact files to edit, test command to run, commit message format. Per the project pattern.

---

## Notes

- All [P] tasks operate on different files and have no interlocking dependencies.
- All `[USx]` labels map back to spec.md user stories.
- Each user-story phase delivers an independently testable increment.
- Tests are written **before** their implementation per Constitution IV (TDD-style for calc-engine changes).
- Lockstep gate (Principle I): both HTMLs MUST be in the same commit when paired tasks land.
- Bilingual gate (Principle VII): every new user-visible string ships with EN + zh-TW + Translation Catalog update in the same commit.
- Constitution VIII gate: `tests/unit/spendingFloorPass.test.js` MUST stay green throughout. Note: US5's signed-sim extension ADDS Constitution VIII enforcement to the signed sim where it was missing.

**Total tasks**: 56 (T001–T056). Of these, T052–T056 are user-side (Phase 10 user gate); CLI-executable count is **51**.
