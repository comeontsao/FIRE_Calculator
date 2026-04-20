---

description: "Task list for feature 002-inline-bugfix"
---

# Tasks: Inline Engine Bugfix (B1 + B3)

**Input**: Design documents from `/specs/002-inline-bugfix/`
**Prerequisites**: plan.md (✅), spec.md (✅), research.md (✅), data-model.md (✅), contracts/ (✅), quickstart.md (✅)

**Tests**: REQUIRED. Constitution Principle IV (gold-standard regression coverage, NON-NEGOTIABLE) mandates locked tests for every calc change. Each bug fix pairs with a named regression test. Test tasks land WITH (or immediately before) their paired implementation tasks since the fixes are targeted — pure RED-before-GREEN sequencing adds no safety at this scope.

**Organization**: Three user-story phases in priority order (US1 B3, US2 B1, US3 regression lock), bracketed by a small Setup phase and a Polish phase. US1 and US2 are both P1; US3 is P2 (integration of the regression oracle).

## Format: `[ID] [P?] [Story] Description`

- Task IDs T001–T0XX sequential.
- `[P]` marker means the task can run in parallel with other `[P]` tasks in the same phase (different files, no dependency on an incomplete task).
- `[US*]` label on every user-story-phase task.
- Setup / Polish tasks omit the story label.

---

## Phase 1: Setup (audit before editing)

**Purpose**: Produce a small site-audit note so every implementer knows the exact functions and line ranges to patch. Saves 10 minutes of re-grepping per task.

- [ ] T001 Grep audit the inline engine sites. Produce `specs/002-inline-bugfix/site-audit.md` listing exact function names + line ranges where B1 (healthcare-delta application + college-cost application in `projectFullLifecycle` + `signedLifecycleEndBalance`) and B3 (Generic's `findFireAgeNumerical` + helpers for portfolio / contributions / SS) live in BOTH `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html`, plus the corresponding sites in `tests/baseline/inline-harness.mjs`. Use `Grep` tool patterns like `function projectFullLifecycle|function findFireAgeNumerical|function signedLifecycleEndBalance|function calcRealisticSSA|healthcareDelta|collegeCost|portfolioSecondary`.

**Checkpoint**: `specs/002-inline-bugfix/site-audit.md` exists; implementer opens it instead of re-grepping.

---

## Phase 3: User Story 1 — B3: Generic solver includes secondary person (Priority: P1) 🎯 MVP

**Goal**: On `FIRE-Dashboard-Generic.html`, a couple's secondary-person portfolio, annual contributions, and Social Security benefit all enter the FIRE calculation. Single-person users see byte-identical output.

**Independent Test**: Open Generic, run the quickstart §2 smoke (change secondary's taxable stocks from $0 → $300 k → Years to FIRE drops ≥ 1 year). Run `bash tests/runner.sh` and confirm the new B3 regression test passes plus the pre-existing single-person EXPECTED_GENERIC lock still passes (after post-fix value update in Phase 5).

### Implementation for US1

- [ ] T002 [US1] Patch `FIRE-Dashboard-Generic.html` (Generic only — B3 is a Generic-specific bug). In the function(s) identified by T001 (typically `findFireAgeNumerical` plus the accumulation/withdrawal helpers it calls), null-guard and include:
  - (a) **Portfolio summation**: pool bases for trad401k / rothIra / taxableStocks / cash sum `primary + (secondary ?? 0)`.
  - (b) **Contribution summation**: during accumulation years, annual savings sum `primary.annualContributionReal + (secondary?.annualContributionReal ?? 0)`.
  - (c) **Social Security**: during retirement years, total SS income is `primaryBenefit(age, ssStartAgePrimary) + secondaryBenefit(age, ssStartAgeSecondary)`. Secondary's benefit activates when `age >= ssStartAgeSecondary`.
  Every secondary reference uses the null-guard pattern so single-person mode (secondary fields blank / zero) produces byte-identical output. Add a one-line code comment referencing `specs/002-inline-bugfix/research.md §R2`.
- [ ] T003 [US1] Mirror the T002 fix in `tests/baseline/inline-harness.mjs` — the harness's Generic path (or the shared path it uses for Generic inputs) must incorporate the same three-layer secondary inclusion. The harness must be a faithful port of the inline engine; diverging breaks Principle IV.
- [ ] T004 [P] [US1] Add the B3 regression test to `tests/baseline/inline-harness.test.js` per `specs/002-inline-bugfix/contracts/harness-regression.contract.md` Test 2. The test creates two variants of the canonical Generic input (`portfolioSecondary.taxableStocksReal: 0` vs `300_000`), runs the harness on each, asserts `rZero.fireAge − rLoaded.fireAge >= 1`. Failure message names "B3: secondary portfolio change has no effect on yearsToFire".
- [ ] T005 [US1] Run `bash tests/runner.sh`. **Expected**: T004's new test PASSES. The existing `EXPECTED_GENERIC` lock MAY now fail — that's acceptable, gets fixed in Phase 5 during the post-fix value update. Do not weaken T004's assertions to paper over the lock failure. Existing `EXPECTED_RR` lock stays GREEN (B3 is Generic-only). B3 regression test GREEN is the acceptance for this story.

**Checkpoint**: B3 fix lands in Generic + harness mirror + B3 regression test green. User Story 1 is independently deliverable.

---

## Phase 4: User Story 2 — B1: Real/nominal conversion at overlay boundary (Priority: P1)

**Goal**: Healthcare-delta and college-cost overlays are converted to real dollars at the point they enter `annualSpend`, matching the dimensionality of the accumulation/withdrawal real-return math. Applied to BOTH HTML files in lockstep.

**Independent Test**: Run quickstart §3 (compare pre-fix vs post-fix `fireAge` on canonical RR and Generic; delta should be 0.5–1.5 years earlier). Run `bash tests/runner.sh`; the new B1 regression test passes. Input sets with zero healthcare override and no kids produce byte-identical output (FR-006 / SC-006).

### Implementation for US2

- [ ] T006 [US2] Patch `FIRE-Dashboard.html` (RR). At the healthcare-delta application site and the college-cost application site identified by T001 (inside `projectFullLifecycle` and `signedLifecycleEndBalance`), insert the three-line real-dollar conversion from `specs/002-inline-bugfix/research.md §R1`:
  ```js
  const yearsFromBase = yearIndex;  // 0-indexed year in the lifecycle loop
  const healthcareDeltaReal = healthcareDeltaNominal / Math.pow(1 + inflationRate, yearsFromBase);
  const collegeCostReal = collegeCostNominal / Math.pow(1 + inflationRate, yearsFromBase);
  // annualSpend += healthcareDeltaReal + collegeCostReal;
  ```
  Do NOT import from `calc/inflation.js` (avoids module-bootstrap coupling — see research §R1 rationale). Add a one-line comment pointing at `research.md §R1`.
- [ ] T007 [US2] Patch `FIRE-Dashboard-Generic.html` identically (LOCKSTEP — MUST land in the same commit as T006 per Principle I). The formula, variable names, and comment pointer are byte-identical between the two files.
- [ ] T008 [US2] Mirror the T006/T007 fix in `tests/baseline/inline-harness.mjs`. The harness's `projectFullLifecycle` / `signedLifecycleEndBalance` port applies the same conversion. Harness stays a faithful port.
- [ ] T009 [P] [US2] Add the B1 regression test to `tests/baseline/inline-harness.test.js` per `contracts/harness-regression.contract.md` Test 1. Two pre-fix constants locked inside the test file: `PRE_FIX_FIREAGE_RR = 54` and `PRE_FIX_FIREAGE_GENERIC = 65`. Asserts delta `(PRE_FIX − post-fix)` falls in `[0.5, 1.5]` for each input set. Failure messages name the metric and reference the expected range.
- [ ] T010 [US2] Run `bash tests/runner.sh`. **Expected**: T009 passes — delta on both input sets is in `[0.5, 1.5]` years. Existing locks for `EXPECTED_RR` and `EXPECTED_GENERIC` may fail (fixed in Phase 5). If the delta falls OUTSIDE `[0.5, 1.5]`, trigger FR-011 investigation path: diagnose which codepath engaged wrong (too small) or absorbed an unrelated bug (too large). Do not silently widen the tolerance.

**Checkpoint**: B1 fix lands in BOTH HTML files (lockstep commit) + harness mirror + B1 regression test green. User Story 2 is independently deliverable on top of US1.

---

## Phase 5: User Story 3 — Regression oracle locked to post-fix values (Priority: P2)

**Goal**: The harness's `EXPECTED_RR` and `EXPECTED_GENERIC` constants are updated to the post-fix observed values. The baseline doc (`baseline-rr-inline.md §D`) records the new truth. Future inline-engine edits that accidentally re-introduce B1 or B3 fail a named test immediately.

**Independent Test**: `bash tests/runner.sh` reports **78 tests, 78 pass, 0 fail, 1 skip**. `node tests/baseline/run-and-report.mjs` output matches the locked `EXPECTED_*` values byte-for-byte.

### Implementation for US3

- [ ] T011 [US3] Run `node tests/baseline/run-and-report.mjs` post-fix. Copy the full output (RR + Generic values under all three solver modes) into a working scratch file.
- [ ] T012 [US3] Update the `EXPECTED_RR` and `EXPECTED_GENERIC` constants in `tests/baseline/inline-harness.mjs` (or wherever they live in the harness test file) to the post-fix values captured in T011. Preserve any comments. After this, existing lock tests pass again.
- [ ] T013 [US3] Append a new Section D to `specs/001-modular-calc-engine/baseline-rr-inline.md` titled "Post-fix observed — feature 002-inline-bugfix". Record: new RR fireAge / yearsToFire / balanceAtUnlockReal / balanceAtSSReal / endBalanceReal. Same for Generic. One short paragraph narrating the deltas from Sections A / B (pre-fix baseline) and citing §C.1 + §C.3 as the source bugs. §C itself remains unchanged (it describes canonical-vs-inline delta; this new §D describes pre-fix-inline vs post-fix-inline).
- [ ] T014 [US3] Run `bash tests/runner.sh` a final time. **Expected**: 78 / 78 / 0 / 1 skip. Every test GREEN including T004 (B3 regression) and T009 (B1 regression) AND all locked `EXPECTED_*` tests. Wall-clock under 10 seconds.

**Checkpoint**: Regression oracle fully locked. Future drift is detectable.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T015 [P] Manual browser smoke — `FIRE-Dashboard-Generic.html`. Execute quickstart §2 steps 1–7 (secondary portfolio change, contribution change, SS claim-age change). All three exhibit user-visible sensitivity. Capture a brief note or screenshot for the PR description.
- [ ] T016 [P] Manual browser smoke — `FIRE-Dashboard.html` (RR). Execute quickstart §3 — verify `fireAge` drops by 0.5–1.5 years relative to pre-feature baseline. Observe the Full Portfolio Lifecycle chart for any visual anomalies (no discontinuities, no NaN labels).
- [ ] T017 [P] Update `BACKLOG.md` — move B1 and B3 entries into the "Changelog" section at the bottom with line `B1, B3 — Done in feature 002-inline-bugfix (commit <SHA>)`. Remove them from the P1 section.
- [ ] T018 [P] Update `FIRE-Dashboard-Roadmap.md` if the user maintains that file — note B1 and B3 fixed in feature 002. Skip if the roadmap doesn't track bugfixes at this granularity.
- [ ] T019 Lockstep audit per quickstart §5. `git diff main..002-inline-bugfix -- FIRE-Dashboard.html FIRE-Dashboard-Generic.html`: B1 patch appears identically in both; B3 patch appears only in the Generic file. Commit message explicitly documents the Generic-only B3 divergence as a legitimate Principle I exception (bug-specific-to-one-file).
- [ ] T020 PR prep. Commit message body: cite `research.md §R1` + `§R2` for the fixes; cite `§R4` for commit structure (one commit preferred); cite the FR-011 predicted-vs-observed delta table; link the baseline §D update; attach screenshots from T015 + T016.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → no dependencies; can start immediately.
- **US1 (Phase 3)** → depends on Setup only.
- **US2 (Phase 4)** → depends on Setup only. US1 and US2 are INDEPENDENT — can proceed in parallel if two engineers are available. They edit different sections of the HTML files (B3 is Generic-only solver; B1 is healthcare/college application in both files). Only conflict risk: the harness mirror (T003 + T008) edits the same `inline-harness.mjs`. Sequence T003 before T008 or vice versa to avoid conflict.
- **US3 (Phase 5)** → depends on US1 AND US2 being implemented (both patches applied to engine + harness). T011 captures post-fix values that reflect BOTH fixes; T012 locks those values; T013 documents them.
- **Polish (Phase 6)** → depends on US1 + US2 + US3 all complete.

### Within-Phase Dependencies

- **US1**: T002 (Generic patch) → T003 (harness mirror) → T004 (test) → T005 (verify). T004 can land with T003 since it's a new file section.
- **US2**: T006 ‖ T007 (lockstep HTML pair — same commit) → T008 (harness mirror) → T009 (test) → T010 (verify).
- **US3**: T011 → T012 → T013 ‖ T014.

### Parallel Opportunities

- **US1 and US2 can run concurrently** if two engineers available. Suggested split: Backend Engineer on US1 (B3 is solver-logic-heavy); Frontend Engineer on US2 (B1 is edit-in-both-files, lighter per-file).
- **Within US1**: T004 (test-writing) can happen in parallel with T002/T003 (implementation) since the test file is separate from the engine files.
- **Within US2**: T009 (test-writing) parallelizable with T006/T007/T008.
- **Polish tasks T015 / T016 / T017 / T018 are all `[P]`** — any order, any parallelism.

---

## Parallel Example: US1 + US2 concurrent

```text
# Engineer A (Backend — owns calc / solver):
T002 (Generic secondary-person patch)
  -> T003 (harness mirror — Generic path)
  -> T004 (B3 regression test)
  -> T005 (verify)

# Engineer B (Frontend — owns HTML edits):
T006 (FIRE-Dashboard.html real/nominal)
T007 (FIRE-Dashboard-Generic.html real/nominal) [SAME COMMIT as T006]
  -> T008 (harness mirror — B1 conversion)
  -> T009 (B1 regression test)
  -> T010 (verify)

# When both complete, Manager executes sequentially:
T011 -> T012 -> T013 -> T014
# Then polish phase in parallel.
```

If only one engineer available, run US1 entirely first (cleaner diff per commit), then US2.

---

## Implementation Strategy

### One-commit vs two-commit decision (per research §R4)

**Prefer one commit** named `fix(B1,B3): real/nominal healthcare+college conversion + Generic secondary-person inclusion`. Single commit means both fixes land with one harness + baseline update, no intermediate broken-lock state.

**Fall back to two commits** (B1 first, then B3) only if a reviewer requests smaller review surfaces. Each commit must leave tests GREEN on its own, which means T012 (EXPECTED_* lock update) happens in each commit — more work, less safety.

### MVP sequence

1. Complete Phase 1 (T001 audit, ~20 min).
2. Complete Phase 3 US1 + Phase 4 US2 (concurrent if possible, ~2–3 hours total).
3. Complete Phase 5 US3 (value capture + lock update, ~30 min).
4. Polish (~30 min).

**Total: ~3–4 focused hours.** Lands in one commit on branch `002-inline-bugfix`; merges cleanly to `main`.

### Verification gates between phases

- After Phase 3: `bash tests/runner.sh` reports B3 test GREEN; RR tests unchanged. Existing `EXPECTED_GENERIC` may have gone RED — that's expected, fixes in Phase 5.
- After Phase 4: `bash tests/runner.sh` reports B1 test GREEN. Existing `EXPECTED_RR` and `EXPECTED_GENERIC` may have gone RED — expected.
- After Phase 5: `bash tests/runner.sh` reports 78 / 78 / 0 / 1 skip. ALL tests GREEN.

Do not advance to the next phase until the current phase's verification passes.

---

## Notes

- **TDD pairing (Principle IV)**: test tasks and implementation tasks land together per pairing T004↔T002/T003 and T009↔T006/T007/T008. Pure RED-before-GREEN sequencing adds no safety here because the fixes are so targeted that the tests would pass trivially without the fix (wrong assertion) or be a no-op import (right assertion against missing function — but the functions already exist).
- **Lockstep discipline (Principle I)**: T006 ‖ T007 is the ONLY truly-lockstep-mandatory pair. The B3 fix (T002) is a legitimate Generic-only divergence because the bug is Generic-only. T019 audit verifies this and the commit message documents the divergence explicitly.
- **Zero-build discipline (Principle V)**: no `package.json`, no `node_modules`, no new deps. The harness mirror and test additions use only Node built-ins.
- **If the B1 delta falls outside [0.5, 1.5] years on either input set**: FR-011 investigation path triggers. Do NOT silently widen the tolerance — diagnose first, document, and either ship with a narrative or tighten the fix.

---

**Total tasks**: 20 across 5 phases. Target overall wall-clock: ~3–4 focused hours solo, ~2 hours with Backend + Frontend concurrent split.
