---

description: "Task list for feature 010 implementation"
---

# Tasks: Generic Dashboard — Country Budget Scaling by Household Size

**Input**: Design documents from `/specs/010-country-budget-scaling/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Tests are REQUIRED by constitution Principle IV (Gold-Standard Regression Coverage — NON-NEGOTIABLE) and spec SC-011 (≥ 8 new unit tests). All calc changes are paired with fixture tests in the same commit.

**Organization**: Tasks are grouped by user story (US1–US5 from spec.md) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5); omitted for Setup / Foundational / Polish phases
- Include exact file paths in descriptions

## Path Conventions

- Main dashboard file: `FIRE-Dashboard-Generic.html` (all UI + inline calc helpers live here)
- Tests: `tests/unit/` (Node `--test` runner), `tests/fixtures/` (gold-standard fixture data)
- i18n catalog: `FIRE-Dashboard Translation Catalog.md`
- `FIRE-Dashboard.html` (RR): UNTOUCHED throughout this feature per FR-021

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify feature branch state and confirm foundational files are present.

- [ ] T001 Verify current branch is `010-country-budget-scaling` via `git status`; confirm `FIRE-Dashboard-Generic.html`, `tests/unit/`, `tests/fixtures/`, `FIRE-Dashboard Translation Catalog.md` all exist.
- [ ] T002 Read `FIRE-Dashboard-Generic.html` lines 3739–3800 (the `scenarios[]` array) and record the current hardcoded baseline values for US, Taiwan, Japan, Thailand, Malaysia, Singapore — these become the regression anchors for T008 / US1 acceptance.
- [ ] T003 Read `FIRE-Dashboard-Generic.html` lines 3060–3170 (the `childrenList` + college-plan logic) to confirm the existing per-child birthdate / college-start year derivation that `calcPerChildAllowance` will consume.

**Checkpoint**: Feature branch and baseline state verified.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Pure calc helpers + persistence schema. Every user story depends on these. NO user-story work begins until this phase is green.

**⚠️ CRITICAL**: User stories US1–US5 all consume the helpers delivered here.

### Pure helper: Adults-Only Scaling Factor

- [ ] T004 In `FIRE-Dashboard-Generic.html`, add a new fenced `<script>` block near the top of the existing inline calc section with a pure helper `getAdultsOnlyFactor(adultCount)` per `contracts/scaling-formula.contract.md`. Include the Inputs/Outputs/Consumers header comment. No DOM, no globals, no Chart.js.
- [ ] T005 In the same block, add `getScaledScenarioSpend(scenario, tier, adultCount, overrides)` per the same contract. Branches on override precedence → tier selection → factor multiplication.
- [ ] T006 [P] Create `tests/fixtures/country-budget-scaling.js` with exported fixture constants: `SCENARIOS_SNAPSHOT` (freeze of current hardcoded US=\$78K, Taiwan=\$36K, etc.), `CHILDREN_FIXTURE_A` (two kids ages 5 and 8), `CHILDREN_FIXTURE_B` (one kid age 13), `CHILDREN_FIXTURE_EMPTY` (`[]`), `PROJECTION_YEARS` (2026, 2030, 2040, 2050).
- [ ] T007 [P] Create `tests/unit/adultsOnlyFactor.test.js` — import the pure helpers via a Node shim that evals the fenced block (same pattern as feature 009's `socialSecurity.test.js`). Lock the seven fixture cases from `contracts/scaling-formula.contract.md`: factor(1) === 2/3, factor(2) === 1.0 exactly, clamp defensive cases at 0 and 3, tier-ratio preservation for every scenario, override precedence at `{us:100000}`, regression anchor US@Adults=2 === 78000.

### Pure helper: Per-Child Allowance

- [ ] T008 In `FIRE-Dashboard-Generic.html`, add `calcPerChildAllowance(childrenList, projectionYear, fireYear)` and its private `allowanceForAge(age)` helper per `contracts/child-allowance.contract.md`. Include Inputs/Outputs/Consumers header. Handle: pre-FIRE zero-out, unborn-child guard, college-takeover short-circuit, age-graded schedule table, \$6K cap.
- [ ] T009 [P] Create `tests/unit/perChildAllowance.test.js` — lock the 10 fixture cases from `contracts/child-allowance.contract.md`: pre-FIRE returns 0, age 0/10/12 all return 2000, ages 13/14/15/16/17 return 2500/3000/4000/5000/6000, cap at 6000 for delayed college, college-takeover returns 0, multi-child summation 2000+3000=5000, unborn child returns 0, mixed pre-college + in-college, empty list returns 0.

### Persistence schema extension

- [ ] T010 In `FIRE-Dashboard-Generic.html`, add a module-level `let scenarioOverrides = {};` declaration alongside the existing `let inp = ...` and `let childrenList = ...` declarations.
- [ ] T011 Extend the existing `persistState()` and `loadState()` helpers to include `scenarioOverrides` per `contracts/persistence.contract.md` — on save, normalise out zero/negative/non-finite entries; on load, default to `{}` when absent or when an entry is ≤ 0.
- [ ] T012 [P] Create `tests/unit/scenarioOverride.test.js` — lock 5 persistence fixture cases from `contracts/persistence.contract.md`: empty map round-trip, set→save→reload round-trip, write-normalisation (`{us:0, taiwan:30000}` → keys === `['taiwan']`), read-normalisation (`{us:-5}` → `{}`), pre-010 blob forward-compat (no `scenarioOverrides` field → empty map).

**Checkpoint**: Two pure helpers wired, persistence schema extended, three test files green with ≥ 20 new assertions. Every user story can now begin.

---

## Phase 3: User Story 1 — Solo planner sees realistic single-person country budget (Priority: P1) 🎯 MVP

**Goal**: When Adults=1, every country's displayed budget on the country comparison grid and deep-dive panel is multiplied by the adults-only factor (0.67×). FIRE target recomputes against the smaller spend floor.

**Independent Test**: Load Generic at Adults=2, record country-card budgets (US=\$78K, Taiwan=\$36K, …). Decrement Adults to 1. Every country card now shows 0.67× its previous value (US=\$52K, Taiwan=\$24K). FIRE target drops visibly. Adults=2 regression: identical to pre-010 values (zero change). Ref: quickstart.md smoke paths 1 and 2.

### Implementation

- [ ] T013 [US1] In `FIRE-Dashboard-Generic.html` `renderScenarioCards()` (~line 10300), replace every direct read of `s.annualSpend` in the `sSpend` computation with `getScaledScenarioSpend(s, inp.lifestyleTier, inp.adultCount, scenarioOverrides)`. Add the `// Consumes: scaling-formula.contract.md::getScaledScenarioSpend` comment at function top.
- [ ] T014 [US1] In the `scenarioInsight` deep-dive panel render (~line 10312), replace `$${s.annualSpend.toLocaleString()}/yr` in the Annual Budget summary with the accessor call. Update the `(50% of US baseline)` helper to recompute against the scaled value so the percentage stays accurate.
- [ ] T015 [US1] Update `getScenarioEffectiveSpend(s)` (~line 10356) to use the accessor: `getScaledScenarioSpend(s, inp.lifestyleTier, inp.adultCount, scenarioOverrides) + (s.visaCostAnnual || 0)`. Update its header comment to name the contract file.
- [ ] T016 [US1] Verify the downstream `getTwoPhaseFireNum(inp, getScenarioEffectiveSpend(s), ...)` and `calcSimpleFIRENumber(sSpend, inp.swr)` call sites pick up the scaled value automatically via T015 — no direct edits needed, but add a `// Consumes (transitive): …` comment at each call site.
- [ ] T017 [US1] Audit `FIRE-Dashboard-Generic.html` with a grep for `s.annualSpend`, `s.normalSpend`, `s.comfortableSpend` to confirm every remaining direct read is either inside `getScaledScenarioSpend` itself or documented as an intentional exception in a `// @see-contract` comment. Target: 0 unexplained direct reads.

### Fixture coverage for US1

- [ ] T018 [US1] Extend `tests/unit/adultsOnlyFactor.test.js` with the US1 regression fixture: `getScaledScenarioSpend(scenarios.find(s=>s.id==='us'), 'lean', 2, {})` === 78000 and `getScaledScenarioSpend(..., 'lean', 1, {})` === 78000 × (2/3). Cover all 13 scenarios with the Adults=2 regression check in a loop.

**Checkpoint**: User Story 1 done. Country cards + FIRE target respond correctly to Adults toggle. Adults=2 users see zero change (FR-002 regression gate).

---

## Phase 4: User Story 2 — Solo parent gets adults-only country budget + per-child allowance overlay (Priority: P1)

**Goal**: Country card stays at adults-only scaled value when a child is added (kids don't move the country factor). Full Portfolio Lifecycle chart's post-FIRE spend curve gets the per-child allowance overlay for each pre-college year (age 0–17 schedule), dropping to 0 when each child enters college (existing tuition logic takes over).

**Independent Test**: At Adults=1, 0 kids, record US card (\$52K) and Lifecycle post-FIRE curve values at projected ages 45/50/55. Add one child age 5 (via the existing children UI). US card UNCHANGED at \$52K. Lifecycle curve UP by \$2,000/yr until the child turns 13, then ramps per the schedule, drops to \$0 at college start. Ref: quickstart.md smoke path 3.

### Implementation

- [ ] T019 [US2] Locate the Full Portfolio Lifecycle chart's post-FIRE projection loop in `FIRE-Dashboard-Generic.html` (~line 7040 based on existing `projectFullLifecycle`-style helpers). Identify the point where annual spend is read for each post-FIRE year.
- [ ] T020 [US2] In that loop, compute the requirement array per year: `requirement[yr] = getScaledScenarioSpend(s, tier, adultCount, overrides) + calcPerChildAllowance(childrenList, yr, inp.fireYear) + existingCollegeTuitionForYear(childrenList, yr) + (s.visaCostAnnual || 0)`. Pass this array into the existing strategy dispatch instead of the flat value. Add the `// Consumes: chart-consumers.contract.md row 4` comment.
- [ ] T021 [US2] Repeat T019–T020 for Portfolio Drawdown (With SS) chart render site (per chart-consumers.contract.md row 5).
- [ ] T022 [US2] Repeat T019–T020 for Portfolio Drawdown (Without SS) chart render site (per chart-consumers.contract.md row 6).
- [ ] T023 [US2] In the Strategy Compare card per-strategy lifetime-requirement computation (per chart-consumers.contract.md row 7), substitute the year-by-year requirement array. Confirm swapping strategies does NOT change the requirement values.

### Fixture coverage for US2

- [ ] T024 [US2] Extend `tests/unit/perChildAllowance.test.js` with integration fixtures: at `fireYear=2030`, a child born `2020-01-01`, verify the full age-0-through-college trajectory (year 2030→age 10→2000, 2033→age 13→2500, ..., 2038→college→0).
- [ ] T025 [US2] Add a new `tests/unit/strategyVsRequirement.test.js` that asserts the spend requirement array for fixed `(adultCount, childrenList, fireYear, scenarioOverrides)` is byte-for-byte identical regardless of which withdrawal strategy is active. (Imports the requirement-computation helper extracted in T020.)

**Checkpoint**: User Story 2 done. Adding a child no longer moves the country card; Lifecycle chart shows the age-graded allowance overlay and college transition.

---

## Phase 5: User Story 3 — Adults-only scaling indicator visible and explainable (Priority: P2)

**Goal**: A two-line caption near the country comparison section surfaces the adults-only factor (Line 1) and the children-tracked allowance note (Line 2, conditional). Tooltip explains the full rule. Bilingual EN + zh-TW.

**Independent Test**: Toggle Adults 1↔2 — Line 1 updates in real time. Add/remove a child — Line 2's `{childCount} children tracked` reflects immediately; Line 2 is hidden when 0 children tracked. Hover tooltip — expands to full explanation in current language. Switch language — all three strings (Line 1, Line 2, tooltip) flip to zh-TW. Ref: quickstart.md smoke path 6.

### i18n

- [ ] T026 [US3] Add four new keys to `TRANSLATIONS.en` in `FIRE-Dashboard-Generic.html` (~line 4090–4500 in the existing EN dict): `geo.scale.line1`, `geo.scale.line2`, `geo.scale.tooltip`, `geo.scale.childrenTracked` with EN values per `contracts/i18n.contract.md`.
- [ ] T027 [US3] Add the same four keys to `TRANSLATIONS.zh` (~line 4950–5500 in the existing zh-TW dict) with Traditional Chinese values per the contract.
- [ ] T028 [P] [US3] Append the four new keys to `FIRE-Dashboard Translation Catalog.md` under a new heading `## Feature 010 — Country budget scaling`, including both EN and zh-TW values in a two-column table.

### UI

- [ ] T029 [US3] In `FIRE-Dashboard-Generic.html`, add a new `<div id="scaleIndicator">` immediately above the country-comparison grid (`#scenarioGrid` or equivalent container near line 2439). Two child `<span>` elements for Line 1 and Line 2, plus a `<span class="info-tip" data-i18n-title="geo.scale.tooltip">?</span>` for the tooltip.
- [ ] T030 [US3] Add a JS renderer `renderScaleIndicator()` that reads `inp.adultCount` and `childrenList.length`, formats Line 1 via `t('geo.scale.line1', adultCount, pluralS, factor.toFixed(2))`, shows/hides Line 2 based on `childrenList.length >= 1`, and populates Line 2 via `t('geo.scale.line2', childrenList.length)`. Wire into `recalcAll()` so it fires on every input change.
- [ ] T031 [US3] Ensure the tooltip (`data-i18n-title`) updates correctly on language toggle — confirm `switchLanguage()` re-renders the indicator so the dynamic strings flip.

### Fixture coverage for US3

- [ ] T032 [US3] Add UI smoke steps to `tests/unit/adultsOnlyFactor.test.js` (or a new `tests/unit/scaleIndicator.test.js` if cleaner) asserting the pluralisation helper returns `''` for adultCount=1 and `'s'` for adultCount=2. No DOM test needed — the renderer delegates to `t()` which is already covered by feature-009 i18n tests.

**Checkpoint**: User Story 3 done. Scaling indicator fully bilingual, responsive, conditionally shows Line 2.

---

## Phase 6: User Story 4 — Per-country Adjust Annual Spend override (Priority: P2)

**Goal**: The Generic deep-dive panel exposes an Adjust Annual Spend `<input>` per country (parity with RR). Non-zero values override the adults-only factor for that country. Overrides persist across Adults toggles, lifestyle toggles, and page reloads. Clearing restores auto-scaling.

**Independent Test**: Open US deep-dive, type 100000 in Adjust Annual Spend, blur. US card reads \$100,000/yr regardless of Adults toggle. Taiwan still auto-scales. Reload page — US still \$100,000. Clear the input — US reverts to \$52,000 (adults-only × factor). Ref: quickstart.md smoke path 4.

### Implementation

- [ ] T033 [US4] In `FIRE-Dashboard-Generic.html` `scenarioInsight` template (~line 10321 after the existing `Visa Cost:` input), append the new Adjust Annual Spend `<input type="number">` block per `contracts/adjust-annual-spend.contract.md`. Use `id="adjust_${s.id}"`, `value="${(scenarioOverrides[s.id] ?? 0) || ''}"`, `placeholder="0"`, `min="0"`, `step="1000"`, and `onchange="updateAdjustedAnnualSpend('${s.id}', this.value)"`. Wire `data-i18n="geo.adjustSpend"` on the label and `data-i18n="geo.adjustNote"` on the note span (both keys already present in both translation dicts).
- [ ] T034 [US4] Add the `updateAdjustedAnnualSpend(scenarioId, valueStr)` handler in the inline JS block near the other `update*Cost` helpers. Per the contract: parse as float, clamp to ≥ 0, set/delete from `scenarioOverrides` accordingly, toggle `data-user-edited='1'`, call `persistState()`, call `recalcAll()`.
- [ ] T035 [US4] Verify `getScaledScenarioSpend` already respects the override (from T005) — add an assertion in the scenarioInsight render that if `scenarioOverrides[s.id] > 0`, the displayed `Annual Budget:` line shows the override value WITHOUT the `(50% of US baseline)` suffix (or adjusts the suffix to "(custom)" or similar per `contracts/i18n.contract.md` follow-up if needed).

### Fixture coverage for US4

- [ ] T036 [US4] Extend `tests/unit/scenarioOverride.test.js` with end-to-end fixture: set `scenarioOverrides = {us: 100000}`, call `getScaledScenarioSpend(us_scenario, 'lean', 1, scenarioOverrides)` → 100000 (not 100000 × 0.67). Repeat at Adults=2 → still 100000. Clear override → scaled value returns.

**Checkpoint**: User Story 4 done. Per-country overrides work end-to-end with persistence.

---

## Phase 7: User Story 5 — Scaling applies uniformly across all three lifestyle tiers (Priority: P3)

**Goal**: Lifestyle toggle (Lean / Normal / Comfortable) multiplies by the same adults-only factor on all three tiers, preserving tier ratios at every household size.

**Independent Test**: At Adults=1, 0 kids, toggle lifestyle Lean → Normal → Comfortable for a single country. The ratios `normal/annual` and `comfortable/annual` match the same ratios at Adults=2 for the same country within ~1% tolerance. Ref: SC-008.

### Implementation

- [ ] T037 [US5] Audit `FIRE-Dashboard-Generic.html` for every call site that reads `s.normalSpend` or `s.comfortableSpend` directly (beyond the already-refactored `annualSpend` sites from T013–T017). Replace each with `getScaledScenarioSpend(s, 'normal'|'comfortable', adultCount, overrides)`.
- [ ] T038 [US5] Verify the lifestyle toggle UI (existing `lifestyleTier` select or radio buttons) triggers `recalcAll()` on change so all three tiers re-render via the scaled accessor on switch.

### Fixture coverage for US5

- [ ] T039 [US5] Add `tierRatioPreservation` fixture to `tests/unit/adultsOnlyFactor.test.js`: for every scenario in `scenarios[]`, assert `getScaledScenarioSpend(s, 'normal', 1, {}) / getScaledScenarioSpend(s, 'lean', 1, {}) === s.normalSpend / s.annualSpend` within 1e-9 tolerance. Same for `comfortable/lean`. Covers all 13 scenarios.

**Checkpoint**: User Story 5 done. Tier ratios preserved at every Adults value.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Constitution compliance, documentation, manual verification, roadmap sync.

### Constitution gates

- [ ] T040 Grep `FIRE-Dashboard-Generic.html` for `s.annualSpend`, `s.normalSpend`, `s.comfortableSpend` one final time. Every hit must be either (a) inside `getScaledScenarioSpend` itself, or (b) tagged with a `// @see-contract chart-consumers.contract.md` comment explaining why it's an intentional exception. Fix any unexplained hits.
- [ ] T041 Grep `FIRE-Dashboard-Generic.html` for `[A-Za-z]{4,}` within the newly-added indicator and Adjust Annual Spend blocks (per constitution Principle VII enforcement rule). Every match must be inside a `t()` call, `data-i18n`, `data-i18n-title`, or on the acronym exemption list (FIRE, OECD, USD, SS). Fix any raw English strings.
- [ ] T042 Verify Principle VI comment-sync: every render site listed in `contracts/chart-consumers.contract.md` table rows 1–10 carries a `// Consumes: …` comment naming `scaling-formula.contract.md` (and `child-allowance.contract.md` where applicable).

### Documentation

- [ ] T043 [P] Update `FIRE-Dashboard-Roadmap.md` — add a feature 010 row with status = In Progress / Done, brief summary, and link to `specs/010-country-budget-scaling/`.
- [ ] T044 [P] Verify `FIRE-Dashboard Translation Catalog.md` has the new keys from T028. Spot-check formatting matches the existing catalog convention.
- [ ] T045 [P] Verify `CLAUDE.md`'s `<!-- SPECKIT START -->` block still points at `specs/010-country-budget-scaling/plan.md` (already updated during `/speckit-plan`; this task is a sanity check).

### Test suite verification

- [ ] T046 Run `node --test tests/unit/*.test.js` from repo root. Confirm all pre-010 tests still green (feature 009 left the suite at ~90 tests). Confirm ≥ 8 new assertions in the feature 010 test files (SC-011 target). Record the final green count for the commit message.

### Manual browser smoke (Manager merge gate per CLAUDE.md Process Lessons)

- [ ] T047 Execute quickstart.md smoke path 1 (Adults=2 regression): zero country-card numeric changes vs pre-010.
- [ ] T048 Execute quickstart.md smoke path 2 (Adults=1 solo, 0 kids): 0.67× factor applied to every country; FIRE target drops.
- [ ] T049 Execute quickstart.md smoke path 3 (single parent): country card unchanged on child add; Lifecycle post-FIRE curve shows allowance ramp and college transition.
- [ ] T050 Execute quickstart.md smoke path 4 (Adjust Annual Spend override): set/toggle Adults/clear cycle matches contract.
- [ ] T051 Execute quickstart.md smoke path 5 (strategy-vs-requirement): swapping DWZ ↔ SAFE ↔ bracket-fill ↔ low-tax leaves spend requirement curve unchanged.
- [ ] T052 Execute quickstart.md smoke path 6 (language toggle): all four new i18n keys flip to Traditional Chinese correctly.
- [ ] T053 Execute quickstart.md smoke path 7 (snapshot CSV): schema unchanged, new row reflects current displayed state.

### RR untouched verification

- [ ] T054 Open `FIRE-Dashboard.html` in a browser. Confirm NO new indicator, NO behaviour change. Confirm its existing per-country Adjust Annual Spend input still works as before. (FR-021 / Principle I exception gate.)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup** (T001–T003): no prerequisites; fast.
- **Phase 2 Foundational** (T004–T012): depends on Phase 1. **BLOCKS all user stories.** Delivers the two pure helpers + persistence schema + baseline tests.
- **Phase 3 US1** (T013–T018): depends on Phase 2. Can start once T004–T005 + T007 are green.
- **Phase 4 US2** (T019–T025): depends on Phase 2 + Phase 3 (US2 extends the Lifecycle spend-curve wiring that US1's accessor replacement establishes).
- **Phase 5 US3** (T026–T032): depends on Phase 2 only; independent of US1/US2 (UI indicator can render before the math consumers are all done, as long as the helpers from Phase 2 exist).
- **Phase 6 US4** (T033–T036): depends on Phase 2 (needs `scenarioOverrides` persistence from T010–T011 and the override-aware accessor from T005).
- **Phase 7 US5** (T037–T039): depends on Phase 2 + Phase 3 (extends T013–T017's audit to normal/comfortable tiers).
- **Phase 8 Polish** (T040–T054): depends on all user stories being complete.

### User Story Dependencies

- **US1 (P1, MVP)**: Phase 2 complete. No dependency on US2–US5.
- **US2 (P1)**: Phase 2 + US1 complete (inherits the accessor replacements; adds the allowance overlay on top).
- **US3 (P2)**: Phase 2 complete. Independent of US1/US2/US4/US5. Can run in parallel with US1 by a separate engineer if team capacity allows.
- **US4 (P2)**: Phase 2 complete. Independent of US1/US2/US3/US5.
- **US5 (P3)**: Phase 2 + US1 complete (extends the accessor audit).

### Within Each User Story

- Tests written in the same commit as the implementation they lock (constitution Principle IV).
- Comment-sync updates (`// Consumes: …`) ship in the same commit as the code change they annotate (constitution Principle VI).
- Every i18n addition ships EN + zh-TW + catalog row in a single commit (constitution Principle VII).

### Parallel Opportunities

- **Phase 2**: T006, T007, T009, T012 all mark [P] — different test files, no dependencies among them. Can be written in parallel by the QA Engineer.
- **Phase 3 vs Phase 5 vs Phase 6**: once Phase 2 ships, US1 (Backend), US3 (Frontend), US4 (Frontend + DB) can proceed in parallel by different Engineers.
- **Phase 8**: T043, T044, T045 all [P] — different files (roadmap, catalog, CLAUDE.md).

---

## Parallel Example: Phase 2 Foundational

```text
# After T004, T005, T008, T010, T011 land, launch all fixture/test writes in parallel:
Task: "Create tests/fixtures/country-budget-scaling.js with fixture constants"       # T006
Task: "Create tests/unit/adultsOnlyFactor.test.js with 7 fixture cases"               # T007
Task: "Create tests/unit/perChildAllowance.test.js with 10 fixture cases"             # T009
Task: "Create tests/unit/scenarioOverride.test.js with 5 persistence cases"           # T012
```

## Parallel Example: User Stories after Phase 2

```text
# Dispatch by Engineer:
Engineer A (Backend):  Phase 3 US1 (T013–T018) — accessor replacement at 5 sites
Engineer B (Frontend): Phase 5 US3 (T026–T032) — scaling indicator UI + i18n
Engineer C (Frontend + DB): Phase 6 US4 (T033–T036) — Adjust Annual Spend input
# Once A finishes: Engineer A moves to Phase 4 US2 (T019–T025)
# Once A finishes US1: Phase 7 US5 (T037–T039) can piggy-back
```

---

## Implementation Strategy

### MVP (User Story 1 only)

1. Phase 1 Setup → Phase 2 Foundational → Phase 3 US1.
2. **STOP and VALIDATE**: Adults=2 regression (T047) + Adults=1 solo (T048). This is the minimum viable fix — it addresses the exact gap the user identified (single-person mode's missing country-budget correction).
3. Ship as MVP if time-constrained. US2–US5 can land in a follow-up.

### Incremental Delivery

1. Setup + Foundational → Helpers ready; tests green.
2. + US1 → Country cards + deep-dive correct at Adults=1. Smoke paths 1 + 2 pass. **Shippable as MVP.**
3. + US2 → Lifecycle chart reflects per-child allowance. Smoke path 3 passes.
4. + US3 → Scaling indicator visible and bilingual. Smoke path 6 passes.
5. + US4 → Override input wired. Smoke path 4 passes.
6. + US5 → Tier ratios preserved. SC-008 locked.
7. + Polish → All constitution gates green. Merge-ready.

### Parallel Team Strategy

With Manager + Backend + Frontend + QA Engineers:

1. Manager: T001–T003 + plan communication.
2. Backend: T004–T005, T008, T010–T011 (foundational helpers + schema).
3. QA: T006, T007, T009, T012 in parallel with Backend (fixture files + test scaffolding).
4. Foundational checkpoint (T004–T012 all green) unblocks stories.
5. Backend: Phase 3 US1 → Phase 4 US2 → Phase 7 US5 (sequential on scenario-spend audit trail).
6. Frontend: Phase 5 US3 + Phase 6 US4 in parallel.
7. QA: Manual smoke paths (Phase 8 T047–T054) after all stories land.

---

## Notes

- `FIRE-Dashboard.html` (RR): UNTOUCHED throughout. Any engineer who accidentally edits it must revert. (FR-021 / Principle I exception gate.)
- Commits should land in test-plus-implementation pairs per constitution Principle IV. Example: T004 + T005 + T007 together; T008 + T009 together; etc.
- Line numbers in task descriptions are approximate (state of file at feature-010 start). Exact positions may drift as tasks land; use `Grep` to find the actual line number at execution time.
- `[P]` markers are conservative — this is a single-file project, so genuine parallelism exists mostly in the test and documentation files, not in `FIRE-Dashboard-Generic.html` itself.
- Stop at any checkpoint to validate the increment in a real browser. Do NOT rely on test-suite green alone — constitution §Process Lessons requires a browser smoke before claiming done.
