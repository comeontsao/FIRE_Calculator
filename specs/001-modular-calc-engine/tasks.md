---

description: "Task list for feature 001-modular-calc-engine"
---

# Tasks: Modular Calc Engine

**Input**: Design documents from `/specs/001-modular-calc-engine/`
**Prerequisites**: plan.md (✅), spec.md (✅), research.md (✅), data-model.md (✅), contracts/ (✅), quickstart.md (✅)

**Tests**: REQUIRED. The constitution (Principle IV, NON-NEGOTIABLE) and spec FR-008 mandate gold-standard regression coverage. Every calc module gets fixture-first unit tests. Tests are written first (RED), then implementation makes them pass (GREEN).

**Organization**: Grouped by user-story priority (P1 → P4). Phase 1 (Setup) + Phase 2 (Foundational) block all user stories. US1 (P1) is the MVP — it delivers the user-visible drag-propagation fix without requiring full module extraction. US2 extracts the calc engine. US3 wires RR and Generic onto the shared engine. US4 adds the annotation discipline.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 / US4 (omitted for Setup / Foundational / Polish)
- Paths are repo-relative; anchors in `plan.md → Project Structure`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffold directory layout and verify local toolchain.

- [ ] T001 Create directory scaffolding at the repo root: `calc/`, `personal/`, `tests/unit/`, `tests/parity/`, `tests/meta/`, `tests/fixtures/` (no files yet beyond `.gitkeep` where needed)
- [ ] T002 [P] Verify local toolchain — `node --version` ≥ 20 and `node --test --help` produces output; record findings at the top of `specs/001-modular-calc-engine/quickstart.md` if any deviation
- [ ] T003 [P] Add a minimal `tests/runner.sh` that shells to `node --test tests/` so CI + developers run one command (documented in `quickstart.md`)
- [ ] T004 [P] Create `tests/fixtures/types.js` exporting JSDoc typedefs for `Inputs`, `Portfolio`, `TaxConfig`, `FixtureCase`, `LifecycleRecord`, `FireSolverResult`, `WithdrawalResult`, `EffectiveFireAgeState` (shapes from `data-model.md` — no implementation, just type declarations)

**Checkpoint**: Directory structure in place; `node --test tests/` runs (no tests yet, exits 0); typedefs available for fixture files.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Inflation helper (every other module depends on it), fixture corpus (drives TDD for all subsequent modules), and meta-test skeleton. **No user story work begins until this phase is complete.**

⚠️ **CRITICAL**: This phase establishes the oracle (fixtures) that every subsequent module is measured against.

- [ ] T005 [P] Write `tests/fixtures/inflation.js` exporting `{identity, roundTrip, threePercentTenYear}` fixture cases that lock `inflation.toReal`/`toNominal` expected values
- [ ] T006 [P] Write `tests/fixtures/accumulation-only.js` — 30-year-old single person, $100 k portfolio, $2 k/mo spend. Expected: monotonic growth, `feasible: true` every year. Checkpoint balances at ages 35, 45, 55 with ±1% tolerance
- [ ] T007 [P] Write `tests/fixtures/three-phase-retirement.js` — 45-year-old, $1.2 M, FIRE at 53. Expected `yearsToFire: 8`, `fireAge: 53`, balance checkpoints at 55, 62, 85
- [ ] T008 [P] Write `tests/fixtures/coast-fire.js` — already-coast-feasible case. Expected `yearsToFire: 0`, and portfolio unchanged (no contributions needed) to endAge
- [ ] T009 [P] Write `tests/fixtures/infeasible.js` — $500 k portfolio, $80 k spend, retire at 50. Expected `feasible: false`, `deficitReal > 0`, `fireAge === endAge`
- [ ] T010 [P] Write `tests/fixtures/rr-generic-parity.js` — canonical two-person household expressed in the shared `Inputs` shape (see `data-model.md §1`). This fixture is run against both RR (via the PersonalData adapter) and Generic directly
- [ ] T011 [P] Write `tests/fixtures/mode-switch-matrix.js` — same inputs under `solverMode: 'safe' | 'exact' | 'dieWithZero'`, expected `fireAge_safe >= fireAge_exact >= fireAge_dwz`
- [ ] T012 Write `tests/unit/inflation.test.js` against `tests/fixtures/inflation.js` — MUST FAIL (module does not yet exist) before implementation
- [ ] T013 Implement `calc/inflation.js` (with `Inputs / Outputs / Consumers` header per `contracts/inflation.contract.md`); T012 tests turn GREEN
- [ ] T014 Write `tests/meta/module-boundaries.test.js` skeleton — the three checks described in `research.md §R7`: (a) no DOM/Chart.js/`window`/`document`/`localStorage` reference in `calc/*.js`, (b) header-format regex on every `calc/*.js`, (c) bidirectional chart↔module annotation check (the (c) piece stays disabled until US4; document as a skipped test until then)
- [ ] T015 [P] Add `tests/meta/fixture-shapes.test.js` that every fixture in `tests/fixtures/*.js` imports cleanly and conforms to the `FixtureCase` typedef (catches fixture drift early)
- [ ] T016 Run `node --test tests/` — confirm inflation unit test, meta-tests (a)(b), and fixture-shape test are GREEN; commit foundational work

**Checkpoint**: One calc module (`inflation.js`) fully implemented, purity-enforced, and fixture-locked. Fixture corpus ready to drive the rest of the extraction. User-story work can now begin.

---

## Phase 3: User Story 1 — Drag-to-Confirm Retirement Update (Priority: P1) 🎯 MVP

**Goal**: Dragging the FIRE marker on the Full Portfolio Lifecycle chart, confirming via inline button, and (optionally) resetting updates **every** retirement-age-dependent chart, KPI, verdict, and delta — consistently in both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html`. A fresh input change wipes the override.

**Independent Test**: Quickstart steps 3–7 pass in both dashboards. No chart remains stale during or after a confirmed drag. Override silently wipes on any non-retirement input change.

**Scope note**: This phase introduces `chartState.js` as the single source of truth and refactors the HTML glue in both files to route every chart/KPI update through it. The in-HTML calc code stays put in this phase; full calc extraction is US2. The MVP delivers the user-visible behavior fix first; US2 then eliminates the structural drift underneath.

### Tests for US1 ⚠️

- [ ] T017 [P] [US1] Write `tests/unit/chartState.test.js` covering the seven scenarios in `contracts/chartState.contract.md`: (1) subscribe/notify, (2) setCalculated wipes override, (3) setOverride, (4) clearOverride, (5) unsubscribe, (6) `revalidateFeasibilityAt` preserves override while updating only `feasible` (locks FR-015), (7) atomic transition — between consecutive synchronous mutations, listeners see exactly one notification per mutation with a fully consistent state snapshot and no observable intermediate partial state (locks SC-009). MUST FAIL before T018

### Implementation for US1

- [ ] T018 [US1] Implement `calc/chartState.js` per `contracts/chartState.contract.md` — minimal state + subscription API, pure JS, no DOM. T017 turns GREEN
- [ ] T019 [US1] In `FIRE-Dashboard.html`, add the `<script type="module">` bootstrap block that imports `./calc/chartState.js` and `./calc/inflation.js`; verify the page still loads cleanly under `file://` (no console errors)
- [ ] T020 [US1] In `FIRE-Dashboard-Generic.html`, add the identical bootstrap block (lockstep with T019)
- [ ] T021 [US1] In `FIRE-Dashboard.html`, replace the scattered `calculatedFireAge` / `fireAgeOverride` reads with a single `chartState.state.effectiveFireAge` read site per chart/KPI. Wrap every chart render + every KPI update as a subscriber registered with `chartState.onChange(...)`; delete the manual `renderGrowthChart(inp); renderRothLadder(inp);` duo inside the drag handler (currently HTML lines ~5770–5771)
- [ ] T022 [US1] Apply the identical refactor to `FIRE-Dashboard-Generic.html` (lockstep with T021); verify no chart reads retirement age from any source other than `chartState`
- [ ] T023 [US1] Refactor the existing `recalcAll()` path in both HTML files to call `chartState.setCalculated(newAge, feasible)` as its last step. Confirm that this atomically wipes any active override (FR-014 mechanical enforcement)
- [ ] T023b [US1] In both HTML files, intercept the solver-mode-switch event (Safe / Exact / Die-with-Zero selector) and route it through `chartState.revalidateFeasibilityAt(chartState.state.effectiveFireAge, feasibleUnderNewMode)` instead of `recalcAll() → setCalculated()`. Compute `feasibleUnderNewMode` by re-running the lifecycle at the effective FIRE age under the new mode's buffer rules WITHOUT re-solving for a new age. Acceptance: US1 Scenario 9 — with override active, toggling mode preserves `effectiveFireAge`, `overrideFireAge`, and `source`; only `feasible` changes. Locks FR-015
- [ ] T024 [US1] Add the confirm-overlay DOM element + CSS in `FIRE-Dashboard.html` per `research.md §R4` — a `<div class="override-confirm" hidden>…</div>` positioned above the lifecycle chart canvas, with a visible label like "Recalculate for retirement at age X" and a cancel icon
- [ ] T025 [US1] Apply the identical confirm-overlay element + CSS to `FIRE-Dashboard-Generic.html` (lockstep with T024)
- [ ] T026 [US1] Refactor the drag handler in both HTML files so that: during drag → only the lifecycle chart's preview marker moves (no `chartState` mutation); on drag end → compute the marker pixel position and show the confirm overlay; on confirm click → call `chartState.setOverride(age)`; on cancel/dismiss → hide overlay, revert preview
- [ ] T027 [US1] Add the "Reset to calculated FIRE age" control in both HTML files, visible only when `chartState.state.source === 'override'`. Click calls `chartState.clearOverride()`
- [ ] T028 [US1] Add the drag affordance triad from `research.md §R5` in both HTML files: `cursor: grab` on marker hover via Chart.js plugin; italic "drag me" hint label; first-load 3-second pulse keyframe. Track one-time dismissal via `localStorage` key `fire:dragHintSeen`
- [ ] T029 [US1] Add the infeasibility indicator (FR-004) in both HTML files — a warning badge + banner color change that activates when `chartState.state.feasible === false`. Integration bridge check (covers the FR-013 → FR-004 pipeline flagged in the analysis): load the `infeasible` fixture, drive it through the full chain (withdrawal module returns `{feasible:false, deficitReal:X}` → lifecycle aggregates → fireCalculator sets `feasible:false` → chartState stores → HTML banner activates). Confirm every layer carries the flag; the shortfall `deficitReal` is surfaced somewhere in the UI (at minimum a tooltip on the banner)
- [ ] T030 [US1] Add new translation strings ("Recalculate for retirement at age X", "Reset to calculated FIRE age", "drag me", infeasibility banner copy) to `FIRE-Dashboard Translation Catalog.md`, then wire both HTML files to read them
- [ ] T031 [US1] Execute Quickstart steps 2–7 manually in both dashboards; capture screenshots or a short screen recording for the PR description. Every acceptance scenario 1.1–1.8 passes

**Checkpoint**: Drag → confirm → every chart updates → input change wipes override. Both HTMLs behave identically. User Story 1 is independently deliverable and demonstrable as MVP.

---

## Phase 4: User Story 2 — Pure Calc Modules with Declared Contracts (Priority: P2)

**Goal**: Every FIRE calculation — lifecycle, solver, withdrawal, tax, SS, healthcare, mortgage, college — moved out of the HTML files into pure, header-documented, unit-testable `calc/*.js` modules. Meta-tests mechanically enforce purity.

**Independent Test**: `node --test tests/` turns GREEN for all module unit tests. `tests/meta/module-boundaries.test.js` finds no DOM / Chart.js / globals leak in any `calc/*.js`. All module headers conform to the `Inputs / Outputs / Consumers` convention.

### Tests for US2 (TDD — RED before GREEN) ⚠️

- [ ] T032 [P] [US2] Write `tests/unit/tax.test.js` against fixtures — bracket-boundary case, LTCG 0% bracket, empty case. MUST FAIL
- [ ] T033 [P] [US2] Write `tests/unit/socialSecurity.test.js` — generic curve, actual-earnings mode, early/late claiming. MUST FAIL
- [ ] T034 [P] [US2] Write `tests/unit/healthcare.test.js` — US pre-fire / ACA / Medicare fixture cases. MUST FAIL
- [ ] T035 [P] [US2] Write `tests/unit/mortgage.test.js` — standard 30-yr fixed + extra-payment case. MUST FAIL
- [ ] T036 [P] [US2] Write `tests/unit/college.test.js` — two-kid non-overlap + overlap + empty cases. MUST FAIL
- [ ] T037 [P] [US2] Write `tests/unit/withdrawal.test.js` — three-phase canonical + RMD case + infeasibility case (locks FR-013). MUST FAIL
- [ ] T038 [P] [US2] Write `tests/unit/lifecycle.test.js` — accumulation-only, three-phase retirement, infeasible, real/nominal check. MUST FAIL
- [ ] T039 [P] [US2] Write `tests/unit/fireCalculator.test.js` — canonical single-person, canonical couple (SC-005 ready), coast-FIRE, mode-switch matrix. MUST FAIL

### Implementation for US2 (work outward-in so dependencies resolve)

- [ ] T040 [P] [US2] Implement `calc/tax.js` with fenced `Inputs / Outputs / Consumers` header per `contracts/tax.contract.md`; T032 GREEN
- [ ] T041 [P] [US2] Implement `calc/socialSecurity.js` per `contracts/socialSecurity.contract.md`; T033 GREEN
- [ ] T042 [P] [US2] Implement `calc/healthcare.js` per `contracts/healthcare.contract.md`; T034 GREEN
- [ ] T043 [P] [US2] Implement `calc/mortgage.js` per `contracts/mortgage.contract.md`; T035 GREEN
- [ ] T044 [P] [US2] Implement `calc/college.js` per `contracts/college.contract.md`; T036 GREEN
- [ ] T045 [US2] Implement `calc/withdrawal.js` per `contracts/withdrawal.contract.md` (depends on tax); T037 GREEN — confirm shortfall surfaces as typed result (FR-013)
- [ ] T046 [US2] Implement `calc/lifecycle.js` per `contracts/lifecycle.contract.md` — wires inflation, tax, withdrawal, SS, healthcare, mortgage, college via DI bundle; T038 GREEN
- [ ] T047 [US2] Implement `calc/fireCalculator.js` per `contracts/fireCalculator.contract.md` — binary search over lifecycle feasibility; T039 GREEN
- [ ] T048 [US2] Refactor `FIRE-Dashboard.html`: rip out the inline `projectFullLifecycle()`, `findFireAgeNumerical()`, `signedLifecycleEndBalance()`, `yearsToFIRE()`, `getTwoPhaseFireNum()`, and related helpers. Replace with calls to the new `calc/*.js` modules. `recalcAll()` now calls `fireCalculator.solveFireAge(inputs)` and pushes the result to `chartState.setCalculated(...)`
- [ ] T049 [US2] Apply the identical HTML refactor to `FIRE-Dashboard-Generic.html` (lockstep with T048)
- [ ] T050 [US2] Every chart renderer in both HTML files reads its data from `calc/lifecycle.js` output or `chartState` — no retirement-age arithmetic remains inline. Grep for return-rate / spend / balance arithmetic inside chart render functions returns zero (enables SC-006)
- [ ] T051 [US2] Enforce `*Real` / `*Nominal` naming at every module boundary per FR-017 + `research.md §R6`. Audit: grep for `Nominal` in `calc/*.js` and in HTML glue — every occurrence should cross through `inflation.js`
- [ ] T052 [US2] Re-run `node --test tests/` — every module test + meta-test GREEN. Wall-clock ≤ 10 s (SC-003). If slower, profile and trim hottest fixture
- [ ] T053 [US2] Manual regression: open both dashboards, run Quickstart steps 2–7. Drag/confirm/reset still work, numbers match what was displayed before extraction (baseline via snapshot taken pre-US2)

**Checkpoint**: Eight calc modules extracted, tested, pure, documented. Both HTML files delegate all FIRE math to `calc/*.js`. No DOM / Chart.js references inside any module. Fixture suite locks current numbers so future refactors cannot silently drift.

---

## Phase 5: User Story 3 — RR and Generic Share One Engine (Priority: P3)

**Goal**: RR's personal data (Roger/Rebecca birthdates, Roger's real SS earnings, Janet/Ian college years) is isolated into `personal/personal-rr.js`; both HTML files consume the identical `calc/*.js` sources. Parity test proves byte-identical headline outputs. Generic's FIRE solver now materially uses the secondary person's portfolio and earnings.

**Independent Test**: `tests/parity/rr-vs-generic.test.js` passes — same canonical inputs through RR's PersonalData adapter vs Generic's direct pipeline produce byte-identical `FireSolverResult` fields. Doubling the secondary person's portfolio in Generic demonstrably changes `yearsToFire` (SC-005).

### Tests for US3 (TDD) ⚠️

- [ ] T054 [P] [US3] Write `tests/parity/rr-vs-generic.test.js` — loads `tests/fixtures/rr-generic-parity.js` through both paths, asserts byte-identical headline output (yearsToFire, fireAge, lifecycle checkpoints at ages 55, 59.5, 62, 67, 85). MUST FAIL before T056
- [ ] T055 [P] [US3] Extend `tests/unit/fireCalculator.test.js` with a "secondary person sensitivity" case that doubles `portfolioSecondary.taxableStocksReal` and asserts `yearsToFire` differs from the single-person baseline by ≥ 1 year. MUST FAIL if Generic's solver still ignores secondary person

### Implementation for US3

- [ ] T056 [US3] Implement `personal/personal-rr.js` per `data-model.md §8` — a default-export `applyPersonalData(htmlFormState) → Inputs`. Derives ages from birthdates; injects Roger's actual SS earnings into `ssPrimary`; injects Janet/Ian college windows. Pure — no calc math
- [ ] T057 [US3] Refactor `FIRE-Dashboard.html` input-gathering to call `applyPersonalData(...)` as the last step before handing `inputs` to `fireCalculator.solveFireAge(...)`. Remove any remaining personal constants from the HTML body (they now live only in `personal-rr.js`)
- [ ] T058 [US3] Refactor `FIRE-Dashboard-Generic.html` so its input-gathering produces a canonical `Inputs` directly — no adapter. Ensure secondary-person portfolio fields are wired into `inputs.portfolioSecondary` and secondary ages into `inputs.currentAgeSecondary`
- [ ] T059 [US3] Update `calc/fireCalculator.js` and `calc/lifecycle.js` to include `portfolioSecondary` and `currentAgeSecondary` in their computations (the audit confirmed Generic's solver today ignores secondary person — this is the fix)
- [ ] T060 [US3] T054 and T055 turn GREEN. If not, iterate — the drift between adapter and Generic's direct pipeline is by definition a Principle I violation
- [ ] T061 [US3] Post-extraction diff check — measure `wc -l` of both HTML files; the FIRE-math surface in each should be zero lines. LoC delta between RR and Generic on shared features should be driven by personal-data adapter + any UI styling only (SC-007)
- [ ] T062 [US3] Manual smoke: Quickstart step 8 — repeat steps 3–7 on Generic and confirm visual + numerical parity with RR on the shared canonical fixture

**Checkpoint**: Two HTML files consume one calc engine. Generic's solver correctly accounts for couples. Parity fixture mechanically locks RR↔Generic agreement.

---

## Phase 6: User Story 4 — Bidirectional Chart ↔ Module Annotations (Priority: P4)

**Goal**: Every chart renderer in both HTML files carries a `@chart: / @module:` header comment naming the module(s) and fields it reads. Every `calc/*.js` module's `Consumers:` list names every chart that reads it. The meta-test enforces the bijection.

**Independent Test**: An independent reader can, within 30 seconds, trace any displayed number back to the producing module by reading the chart's renderer comment and the module's header (SC-002). `tests/meta/module-boundaries.test.js` check (c) now ENABLED and GREEN.

### Tests for US4 ⚠️

- [ ] T063 [US4] Enable check (c) in `tests/meta/module-boundaries.test.js` (the bidirectional parse): extract every `@chart:` / `@module:` block from both HTML files; extract every `Consumers:` list from every `calc/*.js`; assert that the chart→module edges declared in HTML bijectively match the module→chart edges declared in modules. MUST FAIL before T064–T066

### Implementation for US4

- [ ] T064 [P] [US4] Add `@chart: / @module:` header comment above every chart renderer in `FIRE-Dashboard.html` per `data-model.md §9` format (`growthChart`, `rothLadderChart`, `netWorthPie`, `expensePie`, `countryChart`, `ssChart`, `timelineChart` if present, plus every KPI card renderer)
- [ ] T065 [P] [US4] Add the identical annotations to `FIRE-Dashboard-Generic.html` (lockstep with T064)
- [ ] T066 [US4] Audit every `calc/*.js` — update each module's `Consumers:` line to list the complete set of chart / KPI / verdict names that read it (cross-referenced from T064 + T065). T063 turns GREEN
- [ ] T067 [US4] Manual audit: sample 5 random numbers from the rendered dashboard and trace each one to its producing module through the annotations. Record each trace + time-to-answer in the PR description; each must be < 30 s

**Checkpoint**: Dashboards are self-documenting. Any formula change surfaces its full blast radius through the `Consumers:` list.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T068 [P] Update `FIRE-Dashboard-Roadmap.md` — mark modular calc engine complete, note the follow-on Monte Carlo feature now unblocked
- [ ] T069 [P] Update `CLAUDE.md` — Manager playbook adjustments if any new lockstep conventions emerged during implementation (e.g., "every chart renderer needs `@module:` header")
- [ ] T070 [P] Update `README.md` or equivalent project-level doc pointing new contributors at `calc/` + `tests/` + the quickstart
- [ ] T071 Performance validation — instrument `calc/lifecycle.js` with a `performance.now()` timing harness (dev-only), confirm full recalc ≤ 1 animation frame (16 ms) on the canonical fixture; confirm drag sustains ≥ 30 fps visually
- [ ] T072 Accessibility pass on the confirm control + reset button — keyboard focus order, focus rings, `aria-live` announcement when override activates, screen reader reads "Recalculate for retirement at age X"
- [ ] T073 [P] Run the full `quickstart.md` from Step 1 through Step 11 on a fresh clone; record any deviation and file follow-up tasks
- [ ] T074 Final lockstep diff — `diff <(grep -v 'personal\\|RR' FIRE-Dashboard.html) FIRE-Dashboard-Generic.html` should surface only expected divergences (personal-data adapter call, RR-specific copy). Anything else is Principle I drift and a merge blocker
- [ ] T075 Git housekeeping — `FIRE-snapshots.csv` untouched (DB Engineer territory), no stray `node_modules` / `package.json` committed (zero-dep promise), `.gitignore` updated if new artifacts surfaced
- [ ] T076 Prepare PR against `main` with description citing constitution gates (I–VI), acceptance-scenario screenshots from T031, parity-test output, and quickstart completion

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)** → no dependencies.
- **Phase 2 (Foundational)** → depends on Phase 1. Blocks ALL user stories.
- **Phase 3 (US1 / P1 / MVP)** → depends on Phase 2. Delivers the user-visible drag-propagation fix. MVP milestone.
- **Phase 4 (US2 / P2)** → depends on Phase 2 (fixtures) and Phase 3 (`chartState.js` now in place to receive solver output). Sequentially after US1 because US1 is MVP and must remain visibly working throughout extraction.
- **Phase 5 (US3 / P3)** → depends on Phase 4 (calc modules must exist before RR/Generic can share them).
- **Phase 6 (US4 / P4)** → depends on Phase 4 + 5 (modules and their consumers must exist before annotations can be written).
- **Phase 7 (Polish)** → depends on US1–US4 complete.

### Within-Phase Dependencies

- **US1**: T017 (test) → T018 (chartState impl). T019–T023 are tightly coupled to HTML glue; T023b (mode-switch routing) depends on T018 + T023. T024–T029 stack: DOM elements → drag-handler rewiring → reset control → affordances → infeasibility indicator (T029 also validates the FR-013→FR-004 integration bridge). T030 (i18n) runs after T024–T029. T031 (manual validation) is the last task in the phase and MUST cover all nine US1 acceptance scenarios including Scenario 9 (mode-switch preservation).
- **US2**: T032–T039 (tests) all [P] — independent modules. T040–T044 (leaf modules) [P] after their tests exist. T045 (withdrawal) depends on T040 (tax). T046 (lifecycle) depends on T040–T045. T047 (fireCalculator) depends on T046. T048 and T049 (HTML refactor) depend on T047. T050–T053 are cleanup passes.
- **US3**: T054 and T055 (tests) [P]. T056 (adapter) [P] with T058 (Generic wiring). T057 depends on T056. T059 depends on T045–T047. T060 is the gate; T061–T062 are audits.
- **US4**: T063 (enable meta-test) RED. T064 + T065 [P]. T066 depends on T064–T065. T067 last.

### Parallel Opportunities

- **Setup**: T002, T003, T004 all [P].
- **Foundational**: T005–T011 (seven fixture files) all [P]. T012 (inflation test) [P] with the fixture work. T015 [P] with meta-test.
- **US1**: chartState unit test (T017) runs in parallel with any later HTML work that doesn't touch `chartState.js`. HTML glue tasks are sequential within each file but parallel across the two files: T019 ‖ T020, T021 ‖ T022, T024 ‖ T025, T064 ‖ T065 (in US4) — treat each paired task as a lockstep pair dispatched to one Frontend Engineer per task group.
- **US2**: T032–T039 all [P] (test writers). T040–T044 all [P] (leaf modules). After those: T045 → T046 → T047 is a serial dependency chain.
- **US4**: T064 and T065 are [P] annotation passes on the two HTML files.

---

## Parallel Example: User Story 2 (full calc extraction)

```text
# Batch 1 — eight test writers working in parallel (TDD RED):
Task: "Write tests/unit/tax.test.js"             (T032)
Task: "Write tests/unit/socialSecurity.test.js"   (T033)
Task: "Write tests/unit/healthcare.test.js"       (T034)
Task: "Write tests/unit/mortgage.test.js"         (T035)
Task: "Write tests/unit/college.test.js"          (T036)
Task: "Write tests/unit/withdrawal.test.js"       (T037)
Task: "Write tests/unit/lifecycle.test.js"        (T038)
Task: "Write tests/unit/fireCalculator.test.js"   (T039)

# Batch 2 — five leaf-module implementers in parallel:
Task: "Implement calc/tax.js"           (T040)
Task: "Implement calc/socialSecurity.js" (T041)
Task: "Implement calc/healthcare.js"    (T042)
Task: "Implement calc/mortgage.js"      (T043)
Task: "Implement calc/college.js"       (T044)

# Batch 3 — serial (each depends on prior):
T045 withdrawal → T046 lifecycle → T047 fireCalculator

# Batch 4 — two-file lockstep HTML refactor:
Task: "Refactor FIRE-Dashboard.html"         (T048)
Task: "Refactor FIRE-Dashboard-Generic.html" (T049)
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1 (Setup) — ~½ day.
2. Complete Phase 2 (Foundational) — ~1 day (fixtures, inflation module, meta-test skeleton).
3. Complete Phase 3 (US1) — ~1.5 days.
4. **STOP and VALIDATE** — the user-visible drag-propagation bug is fixed. Demo to user, confirm the fix before investing in US2.

MVP total: **~3 days** of focused work. Delivers the audit's #1 finding fixed.

### Incremental Delivery

1. MVP (US1) → demo → merge.
2. US2 (full calc extraction) → demo → merge. Correctness bugs (real/nominal, silent shortfall) now fixed.
3. US3 (share engine + correct couple calc) → demo → merge. RR/Generic drift eliminated.
4. US4 (annotations) → demo → merge. Self-documenting dashboards.
5. Polish → final PR.

Each phase delivers an independently visible value. US1 alone is a full release.

### Team Strategy (if multiple Engineers available)

Per `CLAUDE.md` Manager playbook:

- **Setup + Foundational**: Backend Engineer (fixtures, inflation, meta-test) + QA Engineer (test-runner harness, meta-test authorship) in parallel.
- **US1**: Frontend Engineer owns T019–T031 (HTML glue, UI controls, drag affordance); Backend Engineer owns T017–T018 (chartState module).
- **US2**: Backend Engineer owns T032–T047 (test + modules) end-to-end; Frontend Engineer owns T048–T053 (HTML refactor) once modules exist.
- **US3**: Frontend + Backend Engineer collaboration. Frontend owns T057–T058; Backend owns T056, T059; QA owns T054–T055.
- **US4**: Frontend Engineer primary (both annotation tasks); QA owns T063, T067.
- **Polish**: Manager + QA.

---

## Notes

- **TDD discipline (Principle IV NON-NEGOTIABLE)**: every test task is written FIRST and MUST fail before the corresponding implementation task. The task pairs are explicit (T017→T018, T032→T040, etc.).
- **Lockstep discipline (Principle I NON-NEGOTIABLE)**: whenever a task says "apply the identical refactor to the other HTML file", that companion task MUST land in the **same commit** (not "same-or-following"). Specifically, the following paired tasks are lockstep-commit mandatory: T019 ‖ T020, T021 ‖ T022, T024 ‖ T025, T048 ‖ T049, T064 ‖ T065. Manager reviews the commit diff before merging to confirm the two HTML files moved together.
- **Zero-build discipline (Principle V)**: no `package.json`, no `node_modules`, no bundler is ever introduced in any task below. All tooling uses Node built-ins. Runtime stays file:// openable.
- **Verification-before-completion discipline**: every phase ends with a verification step (T016, T031, T053, T062, T067). Do not advance until the verification is GREEN.
- **Commit cadence**: commit after each task or tightly-grouped task cluster. Prefer small commits traceable to task IDs (e.g., `feat(T018): add chartState single source of truth`).

---

**Total tasks**: 77 across 7 phases (T001–T076 plus T023b inserted to cover FR-015 / mode-switch preservation). Target overall wall-clock: ~8–12 focused days if executed solo; ~4–6 days with the team-strategy split.
