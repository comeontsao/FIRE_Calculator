---

description: "Task list for feature 004-html-canonical-swap"
---

# Tasks: HTML Canonical-Engine Swap

**Input**: Design documents from `/specs/004-html-canonical-swap/`
**Prerequisites**: plan.md (✅), spec.md (✅), research.md (✅), data-model.md (✅), contracts/ × 2 (✅), quickstart.md (✅)

**Tests**: Regression is gated by feature 003's smoke harness, not by new tests. One optional unit test for the restored `evaluateFeasibility` export lands in Foundational. Principle IV is satisfied via the existing smoke harness + the chart-level meta-tests.

**Organization**: Three user-story phases (US1 P1 MVP swap, US2 P2 deletions, US3 P3 harness retarget) bracketed by Foundational (shared adapter + restored export) and Polish (CI + docs). US2 and US3 are INDEPENDENT of each other once US1 lands.

## Format: `[ID] [P?] [Story] Description`

- Task IDs T001–T0XX sequential.
- `[P]` = parallelizable (different files / no dependency on an incomplete task).
- `[US*]` label on user-story-phase tasks.

---

## Phase 2: Foundational

**Purpose**: Ship the shared adapter module and restore the `evaluateFeasibility` export. These two items are prerequisites for every user story.

⚠️ No user-story work begins until this phase completes.

- [ ] T001 Create `calc/getCanonicalInputs.js` per `specs/004-html-canonical-swap/contracts/adapter.contract.md`. Fenced `Inputs / Outputs / Consumers / Invariants / Purity` header matching the other `calc/*.js` module style. Export a single pure function `getCanonicalInputs(inp)` that maps either RR-shape or Generic-shape legacy `inp` into the canonical `Inputs` per `specs/001-modular-calc-engine/data-model.md §1`. Null-guard all secondary-person fields. `Object.freeze()` the output. Internal scenario lookup can copy the scenario table from the existing inline engine (grep `FIRE-Dashboard.html` for `SCENARIOS` or `scenario` cost arrays and inline the relevant constants). Throws a named `Error("getCanonicalInputs: <field> missing/invalid — cannot map")` if a required canonical field cannot be derived. Module-boundaries meta-test MUST stay GREEN after this file lands — no DOM / Chart.js / `window` references.
- [ ] T002 Restore the `evaluateFeasibility({inputs, fireAge, helpers})` export in `calc/fireCalculator.js` per `specs/004-html-canonical-swap/data-model.md §2` (implementation sketch in research.md §R5). Internally calls `runLifecycle` and applies mode-specific feasibility gates (per-year check for all modes; buffer multiple check additionally for `'safe'`). Update the fenced header's `Outputs:` section to list the new export. Add one unit test to `tests/unit/fireCalculator.test.js` covering 4 cases: (a) feasible + buffers met → true; (b) feasible but under-buffer in Safe mode → false; (c) any per-year infeasible → false; (d) DWZ mode ignores the buffer gate. Module-boundaries + purity meta-tests MUST stay GREEN.
- [ ] T003 Run `bash tests/runner.sh`. **Expected**: 81 pass / 0 fail / 1 skip (was 80; +1 for the new `evaluateFeasibility` unit test added in T002). `tests/baseline/browser-smoke.test.js` still passes using its prototype adapter (retargeted later in US3). Meta-tests green (new `getCanonicalInputs.js` is pure).

**Checkpoint**: shared adapter module + restored export + one new unit test. Runner 81/0/1.

---

## Phase 3: User Story 1 — Canonical-engine swap via shims (Priority: P1) 🎯 MVP

**Goal**: Both HTML files route their three existing inline solver functions (`yearsToFIRE`, `findFireAgeNumerical`, `_evaluateFeasibilityAtAge`) through the canonical engine via shims. All ~10 call sites per HTML file stay unchanged. The dashboard continues to display valid numeric KPIs within 2 seconds of cold load.

**Independent Test**: `bash tests/runner.sh` shows 81/0/1. Open both dashboards in a browser; every KPI card shows numbers within 2 s. No "Calculating…" frozen state. DevTools console has zero red errors. Interactive slider changes propagate through the canonical pipeline.

### Implementation for US1

- [ ] T004 [US1] Expand the `<script type="module">` bootstrap in **both** `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` (LOCKSTEP — same commit per Principle I + research.md §R6). Imports: `chartState`, `makeInflation`, `computeTax`, `computeWithdrawal`, `projectSS`, `getHealthcareCost`, `resolveMortgage`, `computeMortgage`, `computeCollegeCosts`, `resolveSecondHome`, `computeStudentLoan`, `runLifecycle`, `solveFireAge`, `evaluateFeasibility`, AND the new `getCanonicalInputs` from `./calc/getCanonicalInputs.js`. Build a `buildHelpers(inputs)` factory returning the DI bundle. Expose on `window`: `_calcHelpers`, `_solveFireAge`, `_runLifecycle`, `_evaluateFeasibility`, `getCanonicalInputs`. Dispatch `CustomEvent('calc-bootstrap-ready')` at the end. After edit: both files still load cleanly under `file://`; no functional change yet (shims come next).
- [ ] T005 [US1] Replace the BODY of `yearsToFIRE(inp)` in both HTML files (LOCKSTEP) with the shim implementation from `specs/004-html-canonical-swap/contracts/shims.contract.md` Shim 1. Preserve the function's original signature and call-site reachability. Try/catch with `NaN` fallback and `console.error` log per research.md §R3. Do NOT edit any call site of `yearsToFIRE`.
- [ ] T006 [US1] Replace the BODY of `findFireAgeNumerical(inp, annualSpend, mode)` in both HTML files (LOCKSTEP) with Shim 2 from the contract. Preserve return shape `{years, months, endBalance, sim, feasible}`. Try/catch with documented fallback. Use `result.endBalanceEffReal ?? result.endBalanceReal` for the `endBalance` field so inline-parity display is preserved per feature 001's effBal layer.
- [ ] T007 [US1] Replace the BODY of `_evaluateFeasibilityAtAge(age)` in both HTML files (LOCKSTEP) with Shim 3 from the contract. Return strict boolean. Fallback `false` on canonical throw. Do NOT edit the mode-switch handler or the drag handler that calls this.
- [ ] T008 [US1] Local + browser verification. (a) Run `bash tests/runner.sh` — expect 81/0/1. (b) Open `FIRE-Dashboard.html` in the user's default browser; within 2 s every KPI card shows a number (NOT "Calculating…"); DevTools console shows zero red errors; no `[shim] canonical threw:` logs. (c) Repeat on `FIRE-Dashboard-Generic.html`. (d) Interact: change Annual Spend slider — all KPIs update within a frame. (e) If any KPI freezes or shows NaN, diagnose using the DevTools `console.error` message from the shim; fix the adapter or canonical-engine issue; DO NOT widen the shim fallback to hide errors. (f) **Shim-revert drill (SC-007)**: temporarily remove the `try {}` wrapper around the body of `yearsToFIRE` in `FIRE-Dashboard.html` so the function lets any canonical throw escape; run `bash tests/runner.sh`. Confirm a feature-003 smoke test fails with a named-field message identifying the escape within 30 seconds of reading. This actively validates the primary defense mechanism. **REVERT** the temporary removal before advancing; runner back to 81/0/1.

**Checkpoint**: both dashboards run on the canonical engine for FIRE-age computation. Quickstart §2a/§2b/§2c pass.

---

## Phase 4: User Story 2 — Delete dead inline helpers (Priority: P2)

**Goal**: Four pure-feasibility inline helpers whose only callers were the now-shimmed solver functions are DELETED from both HTML files. Net: smaller inline-calc surface, faster review, no future accidental calls.

**Independent Test**: Grep each function name in both HTML files — zero function-definition AND zero call-site hits (except possibly historical comments). Runner remains 81/0/1. Browser behavior unchanged from US1.

### Implementation for US2

- [ ] T009 [US2] Delete `function signedLifecycleEndBalance(...)` from both HTML files (LOCKSTEP). Before deleting: `Grep` `signedLifecycleEndBalance` in each file and confirm zero call sites remain other than the definition itself. If a call site exists, DO NOT delete — report back. After deletion: `bash tests/runner.sh` still 81/0/1.
- [ ] T010 [US2] Delete `function taxAwareWithdraw(...)` from both HTML files (LOCKSTEP). Same grep-before-delete discipline. Runner still green.
- [ ] T011 [US2] Delete `function isFireAgeFeasible(...)` from both HTML files (LOCKSTEP). Same discipline. Runner still green.
- [ ] T012 [US2] Delete `function _legacySimulateDrawdown(...)` from both HTML files (LOCKSTEP). Same discipline. Runner still green.
- [ ] T013 [US2] Final grep audit per quickstart §3. All four function names have zero function-definition hits. Call-site hits are zero (except for comments referring to the deletion). `bash tests/runner.sh` still 81/0/1. Manual browser re-check on both dashboards: behavior identical to US1 endpoint. **Preservation audit (FR-008 + FR-009 + FR-014)**: confirm the protected inline helpers and chart renderers were NOT accidentally touched. Run `grep -c 'function projectFullLifecycle' FIRE-Dashboard.html FIRE-Dashboard-Generic.html` — each file returns `1`. Same for `findMinAccessibleAtFireNumerical` and each chart renderer (`renderGrowthChart`, `renderRothLadder`, `renderSSChart`, `renderTimelineChart` where present). Also spot-check with `git diff main -- FIRE-Dashboard.html FIRE-Dashboard-Generic.html` that no line INSIDE the bodies of those protected functions was modified. If any protected function's `grep -c` is `0` or its body changed, STOP and investigate — a deletion accidentally hit the wrong function.

**Checkpoint**: dead helpers gone. HTML file sizes shrink by the helpers' combined LoC. Quickstart §3 passes.

---

## Phase 5: User Story 3 — Retire the feature-003 prototype adapter (Priority: P3)

**Goal**: `tests/baseline/browser-smoke.test.js` imports the production `getCanonicalInputs` from `calc/getCanonicalInputs.js` instead of its inline prototype. The three smoke tests continue to pass with the real adapter. The `TEMPORARY` marker is gone.

**Independent Test**: Grep `_prototypeGetCanonicalInputs` and `TEMPORARY` in `tests/baseline/browser-smoke.test.js` — zero hits. Runner 81/0/1. All three smoke tests (RR, Generic, parity) GREEN against production adapter.

### Implementation for US3

- [ ] T014 [US3] Retarget `tests/baseline/browser-smoke.test.js`. (a) Add `import { getCanonicalInputs } from '../../calc/getCanonicalInputs.js';` at the top. (b) Delete the entire `_prototypeGetCanonicalInputs` function definition AND its `TEMPORARY` block comment. (c) Replace every call to `_prototypeGetCanonicalInputs(inp)` with `getCanonicalInputs(inp)`. (d) Do NOT change any assertion or test name. (e) Run `bash tests/runner.sh 2>&1 | tail -10`. **Expected**: 81/0/1, all three smokes PASS. If a smoke fails here, the PRODUCTION adapter's output disagrees with the prototype's on some field — diagnose with a targeted `console.log(getCanonicalInputs(RR_DEFAULTS))` comparison.
- [ ] T015 [US3] Grep verification per quickstart §5. `grep -n "_prototypeGetCanonicalInputs\|TEMPORARY" tests/baseline/browser-smoke.test.js` — zero hits.

**Checkpoint**: production adapter validated by the smoke harness. Prototype retired.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T016 [P] Push feature branch to GitHub; verify CI runs green within 5 minutes. `git push -u origin 004-html-canonical-swap` then `gh run list --branch 004-html-canonical-swap --limit 1`. On red: read the CI log, fix locally, push again. CI failure is the canary — do not merge until green.
- [ ] T017 [P] Update `BACKLOG.md`. Move BACKLOG item **F2 (US2 HTML wire-up)** out of the P2 "Deferred feature work" section into the "Changelog" block at the bottom with line `F2 (~~HTML canonical-engine swap / U2B-4a retry~~) — Closed in feature 004-html-canonical-swap (2026-04-20). See specs/004-html-canonical-swap/ + specs/audits/B2-silent-shortfall.md for records. Feature 003's smoke harness + CI gate prevented the U2B-4a repeat failure.` Do NOT touch entries for F3 / F4 (still deferred), U1 / U2 (unrelated), X1 / X2 (future).
- [ ] T018 [P] Update `specs/001-modular-calc-engine/baseline-rr-inline.md`. Add a new Section E "Post-feature-004 observed (canonical-engine driven)" documenting the POST-MERGE observed `fireAge`, `yearsToFire`, `endBalanceReal`, `endBalanceEffReal`, `balanceAtUnlockReal`, `balanceAtSSReal` on the canonical RR and Generic input sets. Values come from opening the dashboards in a browser (per quickstart §2) and reading the KPI cards, OR from running the feature 003 smoke harness via `node tests/baseline/run-and-report.mjs` if extended to cover this. Narrative paragraph compares against Section A/B (pre-feature-001 inline baseline) and Section C (canonical-vs-inline delta). Expected deltas fall within SC-008 ranges: RR fireAge ∈ [51, 54]; Generic fireAge ∈ [55, 68].
- [ ] T019 PR prep + merge. Open a PR against `main`. Commit message body cites: research.md §R1–R6, quickstart §2 verification results, BACKLOG F2 closure, baseline §E observed values. After CI green and manual browser re-check post-merge, execute `git checkout main && git merge --no-ff 004-html-canonical-swap` + `git push origin main`. Delete the feature branch locally and remotely per the pattern from features 001/002/003.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)** — no dependencies; starts immediately. BLOCKS all user stories.
- **US1 (Phase 3)** — depends on Foundational (needs the shared adapter module + restored `evaluateFeasibility`).
- **US2 (Phase 4)** — depends on US1 (the shims must replace the solver functions BEFORE the helpers those solvers called can be safely deleted).
- **US3 (Phase 5)** — depends on Foundational T001 (`getCanonicalInputs.js` must exist). Does NOT depend on US1 or US2 — the smoke harness retarget is independent of the HTML changes.
- **Polish (Phase 6)** — depends on US1 + US2 + US3 complete.

### Within-Phase Dependencies

- **Foundational**: T001 → T002 → T003. T001 and T002 technically touch different files but the T003 verify-green is best run AFTER both land.
- **US1**: T004 → T005 → T006 → T007 → T008. Each shim lands after the bootstrap expansion; verification is last.
- **US2**: T009–T012 can run in any order (independent functions, separate text blocks in the same files). T013 final audit is sequential after all four deletions.
- **US3**: T014 → T015 (verify).
- **Polish**: T016 / T017 / T018 are `[P]`. T019 is sequential at the end.

### Parallel Opportunities

- **Foundational**: T001 ‖ T002 can technically run in parallel (different files), but the runner-verify in T003 needs both.
- **US1 vs US3**: US3 depends ONLY on T001 (the adapter module). If two engineers were available, one could start US3 immediately after T001 lands while another starts US1 Foundational's T002 and beyond. For a single engineer, run US1 first (it's more complex), then US3 (trivial retarget).
- **US2**: four deletions (T009–T012) are independent text blocks — can be done in a single commit or split across commits at the implementer's discretion.

### Critical Path

Fastest sequence: T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013 → T014 → T015 → T016 → T017 → T018 → T019. ~4–6 hours of focused work.

---

## Parallel Example: US2 in one commit

Rather than four separate commits for deletions, a single commit `feat(004 US2): delete four dead inline helpers` bundles T009–T012:

```text
# In one Edit-tool-call batch per HTML file:
1. Find + delete function signedLifecycleEndBalance(...)
2. Find + delete function taxAwareWithdraw(...)
3. Find + delete function isFireAgeFeasible(...)
4. Find + delete function _legacySimulateDrawdown(...)
# Run bash tests/runner.sh — expect 81/0/1.
# Commit in lockstep.
```

Manager preference: one-commit-per-deletion is cleaner for bisect; one-commit-for-all-four is cleaner for review. Either acceptable.

---

## Implementation Strategy

### Commit structure

**Preferred**: one commit per task group:

1. `feat(004): scaffold getCanonicalInputs module + restore evaluateFeasibility` (T001–T003)
2. `feat(004 US1): bootstrap + 3 shims for canonical-engine swap` (T004–T008) — may split further
3. `refactor(004 US2): delete 4 dead inline helpers` (T009–T013)
4. `test(004 US3): retarget smoke harness to production adapter` (T014–T015)
5. `docs(004): BACKLOG + baseline §E + merge` (T017–T019)

Each commit leaves the runner GREEN and the browser functional on both dashboards. Each lands on the feature branch; final merge to main per T019.

### MVP sequence

1. Phase 2 Foundational (3 tasks, ~30 min).
2. Phase 3 US1 (5 tasks, ~1.5 hours — mostly careful lockstep editing).
3. **STOP + browser-validate** — the MVP is the swap itself.
4. Phase 4 US2 (5 tasks, ~30 min — pure deletions).
5. Phase 5 US3 (2 tasks, ~10 min — trivial retarget).
6. Phase 6 Polish (4 tasks, ~30 min including merge + push).

Total ~3.5–4 hours for a focused solo pass.

### Verification gates between phases

- After Foundational (T003): runner 81/0/1. `getCanonicalInputs.js` passes module-boundaries. `evaluateFeasibility` export present.
- After US1 (T008): runner still 81/0/1. **Browser shows numbers, not "Calculating…"** on both dashboards.
- After US2 (T013): 4 helpers gone; runner unchanged; browser unchanged.
- After US3 (T015): production adapter validated by smoke; prototype gone.
- After Polish (T019): CI green on merge commit; BACKLOG + baseline updated.

Do NOT advance past a phase until its verification gate is green. Especially: if the browser freezes at US1 Step T008, fix before touching US2.

---

## Notes

- **U2B-4a trauma recap** (research.md §R3): the failure mode last time was a canonical throw propagating up `recalcAll` and freezing the dashboard. This feature's defense-in-depth is: (1) `try/catch` in each shim with documented safe fallbacks, (2) feature 003's smoke harness gating every commit. Belt AND suspenders.
- **Lockstep commit discipline** (research.md §R6): every change to `FIRE-Dashboard.html` lands with the equivalent change to `FIRE-Dashboard-Generic.html` in the SAME commit. Manager reviews `git diff` parity on each commit.
- **EXPECTED_* locks in `inline-harness.mjs` are NOT touched** (research.md §R7). This feature doesn't change the inline engine's math; it only swaps which solver drives the dashboard display.
- **B2 was confirmed NOT a bug** (`specs/audits/B2-silent-shortfall.md` Verdict B) — so the canonical engine's "correctness fix" is a richer diagnostic, not a behavior fix. Dashboards after this feature will show slightly different numbers (per SC-008 ranges), but the difference is a correctness-framework shift, not a bug repair.

---

**Total tasks**: 19 across 5 phases (Setup phase empty — no new directories needed). Target overall wall-clock: ~3.5–4 focused hours solo.
