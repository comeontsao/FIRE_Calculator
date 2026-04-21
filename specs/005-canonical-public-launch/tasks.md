---

description: "Task list for feature 005 — canonical engine swap + public launch"
---

# Tasks: Canonical Engine Swap + Public Launch

**Input**: Design documents from `/specs/005-canonical-public-launch/`
**Prerequisites**: plan.md, spec.md (both required), research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: REQUIRED. Feature 005's central purpose is closing the shim-layer test gap that let feature 004 ship broken (Constitution Principle IV NON-NEGOTIABLE + FR-003). Test tasks for US1 MUST be written FIRST, observed FAILING, then unblocked by implementation.

**Organization**: Tasks are grouped by user story. US1/US2/US3 form the MVP (all P1). US4 (P2) and US5 (P3) are incremental polish + debt.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1, US2, US3, US4, US5 (maps to spec.md user stories)
- File paths are exact; task is actionable without additional lookup

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm preconditions. No new tooling, no new deps (Principle V).

- [ ] T001 Verify Node ≥ 20 and a clean working copy: run `node --version && git status --short` from repo root; expect Node 20+ and no uncommitted changes
- [ ] T002 Run baseline test suite `bash tests/runner.sh` from repo root; record baseline count (expected 80 pass / 0 fail / 1 skip from feature 003)
- [ ] T003 [P] Create `specs/005-canonical-public-launch/privacy-scrub.md` scaffold with header + empty status table ready for Phase 5 population

**Checkpoint**: Baseline green, workspace clean, scaffold ready.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Restore the canonical `evaluateFeasibility` export, register `calc/shims.js` in the module-boundaries allowlist (per research §R1), and seed empty skeletons so subsequent user-story phases can run in parallel without first-import failures.

**⚠️ CRITICAL**: No user story work starts until T008 completes.

- [ ] T004 Restore `evaluateFeasibility({inputs, fireAge, helpers}) → boolean` named export in `calc/fireCalculator.js` per data-model.md §3; mode-aware (Safe/Exact/DWZ); pure
- [ ] T005 [P] Create empty skeleton `calc/shims.js` with ES-module header comment declaring it a glue layer + placeholder exports (`yearsToFIRE`, `findFireAgeNumerical`, `_evaluateFeasibilityAtAge`, `findMinAccessibleAtFireNumerical`) each throwing `Error('not yet implemented')` to force tests to FAIL
- [ ] T006 [P] Create empty skeleton `calc/getCanonicalInputs.js` exporting `getCanonicalInputs(inp)` that throws `Error('not yet implemented')`; pure module header comment per contracts/adapter.contract.md
- [ ] T007 Update `tests/meta/module-boundaries.test.js` to recognize `calc/shims.js` as a glue-layer allowlist entry (permitted to read `window.*` at call time); keep every other calc module strict
- [ ] T008 Run `bash tests/runner.sh`; confirm meta-boundaries test passes with new allowlist entry (80 pass / 0 fail / 1 skip baseline preserved)

**Checkpoint**: Foundation ready. Skeletons exist. Allowlist accepts `calc/shims.js`. `evaluateFeasibility` export available. User stories can proceed.

---

## Phase 3: User Story 1 — Canonical engine swap that actually works in the browser (Priority: P1) 🎯 MVP

**Goal**: Shim layer extracted into `calc/shims.js`, Node-unit-tested for fallback behavior, wired into both HTML files, smoke harness retargeted to production adapter. Dashboard loads with real numeric KPIs in both browsers.

**Independent Test**: `bash tests/runner.sh` shows ≥ 4 new shim tests pass. Open both HTML files; every KPI is numeric within 2s; DevTools console clean. Deliberately break adapter (remove a field); rerun tests — shim fallback test still passes AND smoke harness surfaces the breakage.

### Tests for User Story 1 (TDD — WRITE FIRST, must FAIL)

> Per Principle IV: every shim test is written and observed failing before the implementation lands.

- [ ] T009 [P] [US1] Create `tests/unit/shims.test.js` with `node:test` harness header + imports from `../../calc/shims.js`
- [ ] T010 [P] [US1] Add test case `yearsToFIRE returns NaN and logs [yearsToFIRE] prefix when canonical throws` in `tests/unit/shims.test.js` per shims.contract.md
- [ ] T011 [P] [US1] Add test case `findFireAgeNumerical returns {years:NaN, months:NaN, endBalance:NaN, sim:[], feasible:false} and logs [findFireAgeNumerical] prefix when canonical throws` in `tests/unit/shims.test.js`
- [ ] T012 [P] [US1] Add test case `_evaluateFeasibilityAtAge returns false and logs [_evaluateFeasibilityAtAge] prefix when canonical throws` in `tests/unit/shims.test.js`
- [ ] T013 [P] [US1] Add test case `findMinAccessibleAtFireNumerical returns NaN and logs [findMinAccessibleAtFireNumerical] prefix when canonical throws` in `tests/unit/shims.test.js`
- [ ] T014 [US1] Run `bash tests/runner.sh`; confirm 4 new shim tests FAIL with "not yet implemented" errors (TDD red state)
- [ ] T015 [P] [US1] (Optional) Extend `tests/unit/fireCalculator.test.js` with 4 `evaluateFeasibility` cases: Safe feasible+buffer; Safe under-buffer; per-year infeasible; DWZ ignores buffer

### Implementation for User Story 1

- [ ] T016 [US1] Implement `yearsToFIRE(currentAge, targetFire, inp, calcHelpers) → number` in `calc/shims.js`: call `window._solveFireAge({inputs, helpers})`; wrap in try/catch; fallback `NaN`; log `console.error('[yearsToFIRE] canonical threw:', err, {currentAge, targetFire})`
- [ ] T017 [US1] Implement `findFireAgeNumerical(inp, calcHelpers) → FireNumericalResult` in `calc/shims.js`: call `window._solveFireAge`; try/catch; fallback `{years:NaN, months:NaN, endBalance:NaN, sim:[], feasible:false}`; log `[findFireAgeNumerical]` prefix
- [ ] T018 [US1] Implement `_evaluateFeasibilityAtAge(age, inp, calcHelpers) → boolean` in `calc/shims.js`: call `window._evaluateFeasibility`; try/catch; fallback `false`; log `[_evaluateFeasibilityAtAge]` prefix
- [ ] T019 [US1] Implement `findMinAccessibleAtFireNumerical(inp, calcHelpers) → number` in `calc/shims.js`: call canonical helper per contracts/shims.contract.md; try/catch; fallback `NaN`; log `[findMinAccessibleAtFireNumerical]` prefix
- [ ] T020 [US1] Run `bash tests/runner.sh`; confirm 4 shim tests now PASS (TDD green state); total ≥ 84 pass
- [ ] T021 [US1] Implement `getCanonicalInputs(inp) → Readonly<Inputs>` in `calc/getCanonicalInputs.js` per contracts/adapter.contract.md: shape auto-detection (RR vs Generic), null-guard personB, pass-through mortgage shape, `Object.freeze()` return, named throw on missing required field
- [ ] T022 [US1] Retarget `tests/baseline/browser-smoke.test.js` to `import { getCanonicalInputs } from '../../calc/getCanonicalInputs.js'`; delete any prototype adapter defined inline in the smoke file; keep existing 3 assertions unchanged
- [ ] T023 [US1] Run `bash tests/runner.sh`; confirm smoke harness retargeted successfully (still green, no throws)
- [ ] T024 [US1] In `FIRE-Dashboard.html` `<script type="module">` bootstrap, add imports from `./calc/shims.js` and `./calc/getCanonicalInputs.js`; expose `yearsToFIRE`, `findFireAgeNumerical`, `_evaluateFeasibilityAtAge`, `findMinAccessibleAtFireNumerical`, `getCanonicalInputs` on `window` for existing call sites
- [ ] T025 [US1] In `FIRE-Dashboard-Generic.html` apply the IDENTICAL module-bootstrap change from T024 (LOCKSTEP with T024; same commit)
- [ ] T026 [US1] Delete dead inline helper `function signedLifecycleEndBalance` in BOTH `FIRE-Dashboard.html` AND `FIRE-Dashboard-Generic.html`; pre-delete grep `function signedLifecycleEndBalance\|signedLifecycleEndBalance(` must show no remaining call sites
- [ ] T027 [US1] Delete dead inline helper `function taxAwareWithdraw` in BOTH HTML files (LOCKSTEP); pre-delete grep for call sites
- [ ] T028 [US1] Delete dead inline helper `function _legacySimulateDrawdown` in BOTH HTML files (LOCKSTEP); pre-delete grep for call sites
- [ ] T029 [US1] Delete dead inline helper `function isFireAgeFeasible` in BOTH HTML files (LOCKSTEP); caller audit confirms `findMinAccessibleAtFireNumerical` shim (T019) covers every prior caller
- [ ] T030 [US1] Delete `normalizeMortgageShape` function + every call site in `calc/lifecycle.js` per FR-025 (the production adapter T021 now passes canonical mortgage shape directly)
- [ ] T031 [US1] Run `bash tests/runner.sh`; expected ≥ 84 pass, 0 fail, 1 skip; wall-clock < 10 s
- [ ] T032 [US1] Manual browser smoke: open `FIRE-Dashboard.html` in Chrome; verify KPIs numeric within 2s, console clean, no `[shim-name]` error messages (per quickstart Part B.1)
- [ ] T033 [US1] Manual browser smoke: open `FIRE-Dashboard-Generic.html` in Chrome; verify same (per quickstart Part B.2)
- [ ] T034 [US1] Shim-revert drill (SC-004): temporarily remove `try/catch` wrapper from one shim in `calc/shims.js`; run `bash tests/runner.sh`; confirm the matching shim test FAILS with a named message; revert the edit; rerun green

**Checkpoint**: US1 complete. Dashboards load correctly. Shim fallbacks unit-tested. Smoke harness on production adapter. Dead helpers removed. Feature 004's failure class is architecturally prevented.

---

## Phase 4: User Story 2 — Legal/CYA disclaimer visible on both dashboards (Priority: P1)

**Goal**: Disclaimer footer visible at bottom of both dashboards, translated EN + zh-TW, uses existing CSS tokens.

**Independent Test**: Load each dashboard; scroll to bottom; see disclaimer with all 4 required points. Toggle language; text translates. No layout break.

### Implementation for User Story 2

- [ ] T035 [US2] Add two new i18n entries `disclaimer.intro` and `disclaimer.body` to `FIRE-Dashboard Translation Catalog.md` with EN + zh-TW translations per data-model.md §5 table
- [ ] T036 [US2] In `FIRE-Dashboard.html`, add `<footer class="disclaimer" role="contentinfo">` block at the bottom of `<body>` containing two `<p>` elements with `data-i18n="disclaimer.intro"` and `data-i18n="disclaimer.body"`; EN fallback text inline
- [ ] T037 [US2] In `FIRE-Dashboard-Generic.html`, add the IDENTICAL disclaimer footer block from T036 (LOCKSTEP with T036; same commit)
- [ ] T038 [US2] Add `.disclaimer` CSS rules to BOTH HTML files (LOCKSTEP) using only existing tokens: `color: var(--text-dim)`, `background: var(--card)`, `border-top: 1px solid var(--muted)`, small font, centered container, 1.5rem vertical padding; no new color tokens introduced (FR-013)
- [ ] T039 [US2] Extend the i18n runtime wiring in both HTML files so `data-i18n="disclaimer.*"` elements are populated on language toggle, consistent with existing keys (LOCKSTEP)
- [ ] T040 [US2] Manual verify: open both dashboards, scroll to bottom, confirm disclaimer visible + legible; toggle EN ↔ zh-TW, confirm both keys translate and no layout break (per quickstart Part B.5)

**Checkpoint**: US2 complete. Disclaimer ships on both dashboards in both locales.

---

## Phase 5: User Story 3 — Generic dashboard publish-ready in the existing repo (Priority: P1)

**Goal**: Repo root contains `LICENSE`, `README.md`, `index.html`, `PUBLISH.md`. Privacy scrub complete with zero in-scope findings. Ready for user to execute PUBLISH.md's 2 manual steps.

**Independent Test**: All 4 new root files exist + conform to `contracts/publish-ready.contract.md`. `privacy-scrub.md` green. User executes PUBLISH.md and site goes live.

### Implementation for User Story 3

- [ ] T041 [P] [US3] Create `LICENSE` at repo root with exact standard MIT license text (year 2026, copyright "Roger Hsu") per contracts/publish-ready.contract.md; no custom clauses
- [ ] T042 [P] [US3] Create `index.html` at repo root: ~15-line meta-refresh redirect to `FIRE-Dashboard-Generic.html` with `<meta http-equiv="refresh">`, JS `location.replace()` fallback, and `<a>` no-JS fallback per contracts/publish-ready.contract.md
- [ ] T043 [P] [US3] Create `README.md` at repo root with all 9 required sections (title, description, live demo, features, run locally, tech, license, contributions, disclaimer) per contracts/publish-ready.contract.md §README.md; full disclaimer text reproduced at bottom
- [ ] T044 [P] [US3] Create `PUBLISH.md` at repo root with 2-step checklist per research §R6: preconditions, Step 1 (remove RR files — enumerate `FIRE-Dashboard.html`, `FIRE-snapshots.csv`, `tests/baseline/rr-defaults.mjs`, any spec dirs with RR data), Step 2 (flip public + enable Pages with exact Settings URLs), rollback section
- [ ] T045 [US3] Run privacy scrub greps over in-scope files per research §R5: `calc/*.js`, `tests/**/*.{test,fixture,defaults}.{js,mjs}` (excluding `rr-defaults.mjs`), `FIRE-Dashboard Translation Catalog.md`, `.github/workflows/*.yml`, new root docs, `specs/**/*.md`, `BACKLOG.md`, `CLAUDE.md`, `FIRE-Dashboard-Roadmap.md`; patterns: `\b1983\b`, `\b1984\b`, `\bRoger\b`, `\bRebecca\b`, known-RR dollar amounts
- [ ] T046 [US3] Remediate every in-scope scrub finding from T045 (remove, anonymize to Generic-sample value, or move the hit into an out-of-scope file the user deletes in PUBLISH.md Step 1); update the file in `calc/` / `tests/` / catalog / specs accordingly
- [ ] T047 [US3] Populate `specs/005-canonical-public-launch/privacy-scrub.md` (scaffold from T003) with per-file rows (Clean / Remediated / Out-of-scope), findings column, remediation column; add sign-off line dated today per contracts/publish-ready.contract.md
- [ ] T048 [US3] Run `bash tests/runner.sh`; confirm still ≥ 84 pass / 0 fail / 1 skip after scrub remediation (no test regression)
- [ ] T049 [US3] Manual verify: serve repo via `python -m http.server 8000` and visit `http://localhost:8000/`; confirm redirect to Generic dashboard within 1s; KPIs render (per quickstart Part D.3)

**Checkpoint**: US3 complete. Repo is publish-ready. User can execute PUBLISH.md at their discretion.

---

## Phase 6: User Story 4 — UX polish: infeasibility deficit + KPI cards via chartState listeners (Priority: P2)

**Goal**: `#infeasibilityDeficit` DOM element renders dollar-formatted deficit when solver returns infeasible. KPI cards subscribe to `chartState.onChange` so drag updates are same-frame and regressions show `—` instead of NaN cascade.

**Independent Test**: Load aggressive infeasible scenario → banner + deficit visible. Drag FIRE marker → cards update same frame. If solver throws, cards show `—` not `NaN`.

**Dependency**: US1 complete (needs shims returning real `{feasible, deficitReal}` shape and `chartState` state flow).

### Implementation for User Story 4

- [ ] T050 [US4] In `FIRE-Dashboard.html`, locate the infeasibility banner; add or wire `#infeasibilityDeficit` element; when `chartState.state.deficitReal` is numeric and scenario is infeasible, render dollar-formatted value via existing `$` formatter; when feasible or deficitReal is zero/absent, hide the element
- [ ] T051 [US4] In `FIRE-Dashboard-Generic.html`, apply IDENTICAL change from T050 (LOCKSTEP with T050; same commit)
- [ ] T052 [US4] In `FIRE-Dashboard.html`, migrate the 4 primary KPI cards (Years to FIRE, FIRE Age, FIRE Net Worth, Progress %) to subscribe to `chartState.onChange` directly; card re-render on every `effectiveFireAge` / `feasible` state transition
- [ ] T053 [US4] In `FIRE-Dashboard-Generic.html`, apply IDENTICAL migration from T052 (LOCKSTEP)
- [ ] T054 [US4] In both HTML files (LOCKSTEP), ensure KPI-card render function handles `NaN` / non-finite inputs by rendering `—` placeholder rather than cascading to displayed `NaN` / `$0` per FR-024
- [ ] T055 [US4] Manual verify: open one dashboard, enter aggressive infeasible scenario ($20k/month spend), confirm `#infeasibilityDeficit` shows dollar amount; return to feasible, element hides (per quickstart Part B.4)
- [ ] T056 [US4] Manual verify: drag FIRE marker, confirm KPI cards + chart marker update same-frame (no one-frame stale artifact); per quickstart Part B.3
- [ ] T057 [US4] Regression check: temporarily throw inside a canonical helper; confirm KPI cards show `—` (not NaN); revert

**Checkpoint**: US4 complete. Infeasibility deficit visible. KPI cards defend against solver regressions via placeholder rendering.

---

## Phase 7: User Story 5 — Tech debt cleanup + process hardening + docs refresh (Priority: P3)

**Goal**: Fixture placeholder locked. `CLAUDE.md` gains Process Lessons. SPECKIT pointer confirmed at feature 005. (Dead-helper deletions T026-T029 + normalizeMortgageShape T030 already happened in US1.)

**Independent Test**: Greps for `TBD_LOCK_IN_T038` return zero. `CLAUDE.md` has the two new subsections. SPECKIT block points at feature 005.

### Implementation for User Story 5

- [ ] T058 [US5] Inspect `tests/fixtures/coast-fire.js`; identify the `TBD_LOCK_IN_T038` placeholder; run the canonical engine on the fixture's inputs (via ad-hoc Node script or by temporarily logging from a test); record the actual value
- [ ] T059 [US5] Replace `TBD_LOCK_IN_T038` placeholder in `tests/fixtures/coast-fire.js` with the actual canonical output value recorded in T058; remove any remaining `TBD_` markers in the fixture
- [ ] T060 [US5] Run `bash tests/runner.sh`; confirm the coast-fire fixture test now asserts against the real value and still passes
- [ ] T061 [US5] Add new `## Process Lessons` section in `CLAUDE.md` with subsection "Caller-audit before extraction" referencing `specs/004-html-canonical-swap/ABANDONED.md` lesson per data-model.md §7.1
- [ ] T062 [US5] In `CLAUDE.md`'s new Process Lessons section, add subsection "Shim defense-in-depth" covering the 4 shim discipline requirements per data-model.md §7.2
- [ ] T063 [US5] Confirm `CLAUDE.md` `<!-- SPECKIT START --> ... <!-- SPECKIT END -->` block points at `specs/005-canonical-public-launch/plan.md` (updated during `/speckit-plan`; verify still correct)

**Checkpoint**: US5 complete. Tech debt closed. Lessons codified.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final verification before hand-off to the user for PUBLISH.md execution.

- [ ] T064 Run `bash tests/runner.sh` one final time; expected ≥ 84 pass / 0 fail / 1 skip; wall-clock < 10 s
- [ ] T065 Execute all parts of `specs/005-canonical-public-launch/quickstart.md` (Parts A–E); record any deviations
- [ ] T066 Verify CI: push branch `005-canonical-public-launch` to remote and confirm `.github/workflows/tests.yml` runs green; wall-clock < 5 min (SC-003)
- [ ] T067 Update `BACKLOG.md`: mark F2, U1, U2, D1, D3, D6 as closed by feature 005 with date stamp; reference this spec dir; no new BACKLOG items added unless genuinely discovered during implementation
- [ ] T068 Create `specs/005-canonical-public-launch/CLOSEOUT.md` summarizing what shipped, test counts, any deferred items, and the handoff note pointing at PUBLISH.md for the user's 2 manual steps
- [ ] T069 [P] Dual-dashboard lockstep sanity check: diff the two HTML files pairwise on disclaimer block, shim-import bootstrap, and KPI-subscription wiring (expected identical up to personal-data substrings)

**Final checkpoint**: All green, all manually verified, CLOSEOUT written. Feature 005 ready to merge. After merge, user executes PUBLISH.md independently.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies
- **Phase 2 (Foundational)**: Depends on Phase 1; BLOCKS every user story
- **Phase 3 (US1)**: Depends on Phase 2
- **Phase 4 (US2)**: Depends on Phase 2 only (not on US1)
- **Phase 5 (US3)**: Depends on Phase 2 only; US3's privacy scrub (T045-T048) logically also depends on US1's dead-helper deletions (T026-T030) landing so the scrub doesn't flag soon-deleted hits
- **Phase 6 (US4)**: Depends on US1 (needs shims returning real `{feasible, deficitReal}` and `chartState` producing stable state)
- **Phase 7 (US5)**: Depends on US1 (T061-T062 codify lessons learned from US1's shim work; T058-T060 is coast-fire fixture which is independent of US1 but not priority)
- **Phase 8 (Polish)**: Depends on all user stories that are in-scope for MVP (US1-US3 at minimum)

### User Story Dependencies

- **US1 (P1)**: Independent; MVP core
- **US2 (P1)**: Independent; can ship even if US1 stalls (disclaimer is self-contained)
- **US3 (P1)**: Lightly depends on US1 (privacy scrub ordering after dead-helper deletion)
- **US4 (P2)**: Depends on US1
- **US5 (P3)**: Partly depends on US1 (process lessons T061-T062 reference US1's work; fixture T058-T060 independent)

### Within Each User Story

- Tests (US1 only) written FIRST (T009-T015), observed FAILING (T014), then unblocked by implementation (T016-T020)
- Modules (calc/shims.js, calc/getCanonicalInputs.js) before HTML bootstrap wiring
- HTML wiring before dead-helper deletions (so the dashboard still works during the transition)
- Story-complete checkpoint before moving to the next priority

### Parallel Opportunities

- Phase 1 T003 runs parallel with T001 / T002
- Phase 2 T005 + T006 run parallel (different files)
- Phase 3 T009-T013 + T015 run parallel (different test cases, same test file edits coordinated sequentially if the file edits collide — if so, serialize T009-T013 but keep T015 parallel)
- Phase 5 T041 + T042 + T043 + T044 run parallel (4 distinct root-level files)
- Phase 8 T069 parallel with T064-T068

### Lockstep Pairs (NON-NEGOTIABLE — Principle I)

Every pair in this list MUST ship in ONE commit:

- T024 ↔ T025 (shim-import bootstrap in both HTML files)
- T026 ↔ T026 (inline helper deletion — both files same commit)
- T027 ↔ T027 (same)
- T028 ↔ T028 (same)
- T029 ↔ T029 (same)
- T036 ↔ T037 (disclaimer footer)
- T038 ↔ T038 (disclaimer CSS — both files)
- T039 ↔ T039 (i18n wiring — both files)
- T050 ↔ T051 (#infeasibilityDeficit)
- T052 ↔ T053 (chartState subscription migration)
- T054 ↔ T054 (placeholder rendering — both files)

---

## Parallel Example: Phase 3 (US1) Test Writing

```bash
# T009 seeds the test file; after it's in, T010-T013 + T015 can run parallel:
T010: write yearsToFIRE fallback test
T011: write findFireAgeNumerical fallback test
T012: write _evaluateFeasibilityAtAge fallback test
T013: write findMinAccessibleAtFireNumerical fallback test
T015: write evaluateFeasibility extension tests (separate file)

# Then T014 (run tests, confirm RED) serializes.
# Then T016-T019 (implementations) can be serialized OR parallel-batched if the implementer is careful — same file, different exports.
```

## Parallel Example: Phase 5 (US3) Root Doc Creation

```bash
# 4 distinct files, no cross-dependencies → all parallel
T041: create LICENSE
T042: create index.html
T043: create README.md
T044: create PUBLISH.md
```

---

## Implementation Strategy

### MVP (P1 stories: US1 + US2 + US3)

1. Phase 1 Setup (T001-T003)
2. Phase 2 Foundational (T004-T008) — CRITICAL blocker
3. Phase 3 US1 (T009-T034) — the headline canonical swap
4. Phase 4 US2 (T035-T040) — disclaimer
5. Phase 5 US3 (T041-T049) — publish-ready
6. Phase 8 Polish subset (T064-T068)
7. **Merge feature 005 to main.**
8. User executes `PUBLISH.md` when ready — live at GitHub Pages.

### Incremental Delivery (add P2 + P3 stories later)

- After MVP merge: US4 (Phase 6) adds UX polish; can ship in a follow-up commit before or after public launch.
- US5 (Phase 7): process docs + fixture lock; low-pressure, can ship anytime.

### Parallel Team Strategy

Four-role dispatch per CLAUDE.md Manager/Engineer pattern:

- **Backend Engineer**: Phases 2, 3 (T004-T023, T030), Phase 7 (T058-T060)
- **Frontend Engineer**: Phase 3 wiring (T024-T029), Phase 4 (T035-T040), Phase 6 (T050-T057), docs updates
- **DB Engineer**: Phase 5 privacy scrub leadership (T045-T047)
- **QA Engineer**: Phase 1 (T001-T002), Phase 3 tests (T009-T015), Phase 8 (T064-T069), every manual-verify task

Manager sequences Phase 3 (US1) first (MVP blocker), then parallelizes US2 + US3 + US4 + US5 by engineer specialization.

---

## Notes

- [P] tasks = different files or independent test cases
- [USn] label maps each task to its user story for traceability
- Lockstep pairs are NON-NEGOTIABLE per Principle I — ship in one commit
- TDD discipline (Phase 3): red → implement → green, observed via T014
- Commit after each task OR after each lockstep pair OR at the end of each phase, per engineer preference
- Stop at any checkpoint to verify the story independently before moving on
- Avoid: editing both HTML files in non-lockstep commits; modifying `projectFullLifecycle` or chart renderers (FR-010 out-of-scope)
- After T063 the feature is technically complete; Phase 8 is the verification + handoff gate before merge
