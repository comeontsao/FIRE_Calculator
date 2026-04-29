---
description: "Task list for feature 017 — Payoff vs Invest: Stage Model & Lump-Sum Payoff Branch"
---

# Tasks: Payoff vs Invest — Stage Model & Lump-Sum Payoff Branch

**Input**: Design documents from `/specs/017-payoff-vs-invest-stages-and-lumpsum/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/payoffVsInvest-calc-v2.contract.md, quickstart.md

**Tests**: REQUIRED. Spec §8 explicitly enumerates the regression-lock plus seven new test cases. Constitution Principle IV (Gold-Standard Regression Coverage, NON-NEGOTIABLE) mandates fixture coverage for every calc change.

**Organization**: Tasks are grouped by user story to enable independent implementation, testing, and shipping.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Maps task to user story (US1, US2, US3)
- File paths are absolute or repo-relative as appropriate

## Path Conventions

- Calc module: `calc/payoffVsInvest.js`
- Dashboards (lockstep — Principle I): `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`
- Tests: `tests/unit/payoffVsInvest.test.js`
- Translations: `FIRE-Dashboard Translation Catalog.md`
- Spec: `specs/017-payoff-vs-invest-stages-and-lumpsum/`

## User Story Map

| Story | Priority | Goal | Spec section |
|---|---|---|---|
| **US1** | P1 (MVP) | Pre-buy-in window fix — Prepay line stays at $0 throughout Stage I for buying-in scenarios. Eliminates the reported $45K artifact at age 58. | §3, §5 (window-start) |
| **US2** | P2 | Stage-band visualization — chart shows three faintly tinted background bands corresponding to Stage I / II / III with hover labels. | §2, §7 (bands) |
| **US3** | P3 | Lump-sum payoff branch — opt-in switch causes Invest to write a check the moment its real-dollar brokerage equals the remaining real-dollar mortgage; chart drops dramatically; verdict gains a third line. | §4, §6 (switch+banner), §7 (drop) |

Each story is independently shippable. US1 alone fixes the immediate reported bug. US2 and US3 are additive enhancements; their order can flip if desired.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and shared scaffolding. Branch and spec artifacts already exist (created during `/speckit-plan`); only minor checks remain.

- [ ] T001 Verify branch `017-payoff-vs-invest-stages-and-lumpsum` is current and feature 016 has been fast-forward merged to `main` (already done during plan phase — confirm with `git log --oneline -3` against `main`)
- [ ] T002 [P] Run baseline `node --test tests/unit/payoffVsInvest.test.js` to confirm v1 fixtures pass on a clean tree before any v2 edits land

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented.

**⚠️ CRITICAL**: The regression-lock adaptation (T003) MUST land first — it ensures every subsequent calc change is verified against v1 byte-identity for existing fixtures. Skipping it risks silent v1 regressions while implementing US1/US2/US3.

- [ ] T003 Adapt every existing v1 fixture in `tests/unit/payoffVsInvest.test.js` to explicitly pass `lumpSumPayoff: false` and assert outputs are byte-identical to today (regression-lock per spec §8 / contract Inv-1). Build a shared helper `assertV1ParityWhenSwitchOff(inputs, outputs)` that diffs every output field against a captured-on-main snapshot. This MUST pass before any calc-module edits begin.
- [ ] T004 Update the calc module's contract header in `calc/payoffVsInvest.js` (lines 1-34): bump version annotation to v2, declare new `lumpSumPayoff` input, declare new `lumpSumEvent` and `stageBoundaries` outputs in the `Outputs:` section, re-confirm `Consumers:` list (no new consumers — same four renderers extended in place). This is contract scaffolding only; no behavior change yet.
- [ ] T005 [P] Add type-shape JSDoc typedefs at the top of `calc/payoffVsInvest.js` for `LumpSumEvent` and `StageBoundaries` matching `data-model.md` (no implementation yet — pure documentation that subsequent tasks reference)

**Checkpoint**: Foundation ready. v1 regression coverage locked. Stories may proceed.

---

## Phase 3: User Story 1 — Pre-Buy-In Window Fix (Priority: P1) 🎯 MVP

**Goal**: For `ownership='buying-in'` with `buyInYears > 0`, both Prepay and Invest brokerage curves start at exactly $0 at the buy-in age, and the chart's x-axis begins at the buy-in age. Eliminates the $45K Prepay-line artifact at age 58 reported in the screenshot.

**Independent Test**: Run quickstart.md step S3 against both dashboards. With `ownership='buying-in'`, `buyInYears=2`, `currentAge=42`: chart x-axis starts at 44; both curves start at $0; yellow "home purchase" diamond is absent. Numerically: `prepayPath[0].invested === 0 && investPath[0].invested === 0 && prepayPath[0].age === 44`.

### Tests for User Story 1 (write FIRST per Constitution Principle IV)

- [ ] T006 [P] [US1] Add fixture test "Window start for buying-in — both paths start at buy-in age with $0 brokerage" in `tests/unit/payoffVsInvest.test.js` matching spec §8 case 1. Should FAIL until T008 is implemented.
- [ ] T007 [P] [US1] Add fixture test "Already-own backwards compat — switch=false ownership='already-own' produces v1 output" in `tests/unit/payoffVsInvest.test.js` matching spec §8 case 7. Should pass already (v1 baseline) but explicitly locks the no-regression intent.

### Implementation for User Story 1

- [ ] T008 [US1] In `calc/payoffVsInvest.js` `computePayoffVsInvest`, replace the loop bound `for (let age = inputs.currentAge; ...)` with `windowStartAge = currentAge + max(0, buyInYears for buying-in)`; remove the `else if (!mortgageActiveThisMonth)` pre-buy-in branches in BOTH the Prepay and Invest monthly blocks (lines ~362–446). Confirm T006 now passes; T003 v1 parity still holds for `ownership !== 'buying-in'`.
- [ ] T009 [US1] In `calc/payoffVsInvest.js`, add subSteps entry `'window starts at buy-in age (year offset {N})'` to the returned `subSteps` array when `ownership === 'buying-in' && buyInYears > 0` (Principle II audit observability per data-model.md).
- [ ] T010 [P] [US1] In `FIRE-Dashboard.html` `renderPayoffVsInvestBrokerageChart` (around line 13166), drop the yellow "home purchase" diamond marker code path for `ownership='buying-in'` (it would always sit at x=0 after T008's window adjustment). Keep marker code dormant for other ownership types where it never appeared.
- [ ] T011 [P] [US1] In `FIRE-Dashboard-Generic.html`, mirror T010's change exactly (Principle I lockstep). Diff the two renderer functions afterward and confirm they are identical except for personal-content lines.
- [ ] T012 [US1] Run `node --test tests/unit/payoffVsInvest.test.js` and confirm: T006 passes, T007 passes, T003 v1 parity assertion still holds, all pre-existing v1 cases still green.
- [ ] T013 [US1] Manual smoke: open both dashboards in browser; with `ownership='buying-in'`, `buyInYears=2`, `currentAge=42`: confirm chart x-axis starts at 44, both curves at $0, no yellow diamond, console clean.

**Checkpoint**: US1 shippable. The reported $45K bug is fixed. US2 and US3 may now proceed.

---

## Phase 4: User Story 2 — Stage-Band Visualization (Priority: P2)

**Goal**: The brokerage chart paints three faintly tinted background bands behind the curves: Stage I (Both paying), Stage II (First-payoff with II-P or II-I sub-case), Stage III (Both debt-free). Hover labels surface the stage names bilingually. Bands work whether or not the lump-sum switch is on.

**Independent Test**: Run quickstart.md step S2 against both dashboards. Three faint bands behind the curves, hover labels readable in EN and 中文, opacity ≈ 6% so curves remain dominant.

### Tests for User Story 2

- [ ] T014 [P] [US2] Add fixture test "Stage boundaries consistency — firstPayoffAge < secondPayoffAge when both exist; firstPayoffWinner matches the strategy whose payoff age equals firstPayoffAge" in `tests/unit/payoffVsInvest.test.js` matching spec §8 case 6. Should FAIL until T016 is implemented.

### Implementation for User Story 2

- [ ] T015 [US2] In `calc/payoffVsInvest.js`, add a private helper `_findStageBoundaries(prepayPath, investPath, windowStartAge, lumpSumEvent)` that scans both paths for the first `mortgageBalance === 0` row and returns `{ windowStartAge, firstPayoffAge, firstPayoffWinner, secondPayoffAge }` per data-model.md. Add `_findStageBoundaries` to the `_payoffVsInvestApi` export object. (At this phase `lumpSumEvent` is always null — full integration with US3 lands in T028.)
- [ ] T016 [US2] In `computePayoffVsInvest`, after the main loop, call `_findStageBoundaries` and assign the result to a new top-level output field `stageBoundaries`. Confirm T014 now passes and T003 v1 parity still holds (new field is additive, doesn't mutate any v1 field).
- [ ] T017 [US2] Add subSteps entry `'compute stageBoundaries from path inflection points'` (Principle II audit observability).
- [ ] T018 [P] [US2] In `FIRE-Dashboard.html`, define an inline Chart.js plugin object `pviStageBandsPlugin` with an `id: 'pviStageBands'` and a `beforeDatasetsDraw(chart)` hook that paints three rectangles using `chart.scales.x.getPixelForValue(age)` for x-extents and `chartArea.top/bottom` for y-extents. Resolve `--chart-phase1/2/3` once at plugin-init via `getComputedStyle(document.documentElement).getPropertyValue(...)` and apply 6% opacity via `color-mix(in oklch, ..., transparent)`. See `research.md` R1 + R2.
- [ ] T019 [P] [US2] In `FIRE-Dashboard-Generic.html`, mirror T018's plugin definition exactly (Principle I lockstep).
- [ ] T020 [P] [US2] In both dashboards' `renderPayoffVsInvestBrokerageChart`, register the plugin with the Chart instance via the chart's `plugins:` array entry, threading `outputs.stageBoundaries` and the active sub-case label (II-P vs II-I — derived from `firstPayoffWinner`) through `chart.options.plugins.pviStageBands`.
- [ ] T021 [P] [US2] Update the renderer's comment header in both `renderPayoffVsInvestBrokerageChart` functions to declare `stageBoundaries` as a consumed field (Principle VI two-way link).
- [ ] T022 [P] [US2] Add 4 stage-band translation keys (`pvi.stageBand.bothPaying`, `pvi.stageBand.firstPayoffPrepay`, `pvi.stageBand.firstPayoffInvest`, `pvi.stageBand.bothFree`) with EN + zh-TW values to `TRANSLATIONS.en` and `TRANSLATIONS.zh` blocks in BOTH HTML files. Use the draft strings in `data-model.md` §"New Translation Keys" as the starting point.
- [ ] T023 [US2] Add the same 4 keys to `FIRE-Dashboard Translation Catalog.md` (Principle VII catalog sync).
- [ ] T024 [US2] Manual smoke: open both dashboards; confirm three faint bands; hover the chart; confirm stage labels appear bilingually when toggling EN ↔ 中文. Console clean.

**Checkpoint**: US2 shippable. Stage story is unmissable visually even without the lump-sum branch.

---

## Phase 5: User Story 3 — Lump-Sum Payoff Branch (Priority: P3)

**Goal**: An opt-in checkbox below the "Extra monthly cash" slider (default OFF, persisted to `localStorage.pvi.lumpSumPayoff`) enables a lump-sum payoff branch. When ON, the Invest strategy writes a check the moment its real-dollar brokerage equals the remaining real-dollar mortgage. The Invest curve drops sharply at the trigger age, then resumes upward growth. The verdict banner gains a third line. Stage II's hover label shifts to II-P or II-I depending on which strategy got debt-free first.

**Independent Test**: Run quickstart.md steps S4, S5, S6 against both dashboards. S4 = Prepay-first typical case (chart drops at the lump-sum age, banner gains Line 3). S5 = high-return Invest-first case (drop happens before Prepay's payoff; II-I sub-case label). S6 = never-fires case (no drop; italic note in banner).

### Tests for User Story 3

- [ ] T025 [P] [US3] Add fixture test "Lump-sum fires after Prepay payoff (typical)" matching spec §8 case 2 in `tests/unit/payoffVsInvest.test.js`. Should FAIL until T028 + T029 land.
- [ ] T026 [P] [US3] Add fixture test "Lump-sum fires before Prepay payoff (high return)" matching spec §8 case 3. Should FAIL until T028 + T029 land.
- [ ] T027 [P] [US3] Add fixture tests "Lump-sum never fires" (case 4) and "Interest invariant" (case 5) in `tests/unit/payoffVsInvest.test.js`. Case 5 asserts `cumulativeInterest_prepay < cumulativeInterest_invest_lumpSum < cumulativeInterest_invest_keepPaying`.

### Implementation for User Story 3 — Calc module

- [ ] T028 [US3] In `calc/payoffVsInvest.js` `computePayoffVsInvest`, add the new `lumpSumPayoff` input (default `false`) to the destructuring at the top of the function. Inside the monthly Invest block, before the existing `mortgageStateI.balance > 0` branch, insert the trigger check from data-model.md §"Lump-sum trigger algorithm": if `lumpSumPayoff && mortgageStateI.balance > 0` AND `investedI >= mortgageStateI.balance / inflationFactor`, record the event and zero the mortgage. Fall through to the "mortgage paid off" branch this same month.
- [ ] T029 [US3] In `computePayoffVsInvest`, declare a closure-scoped `lumpSumEvent = null` before the main loop; populate it inside the trigger block in T028; assign it to the returned outputs after the loop. Update `mortgageNaturalPayoff.investAge` to reflect the lump-sum age when `lumpSumEvent !== null` (per contract Inv-1 nuance — only when switch ON AND fired).
- [ ] T030 [US3] Add subSteps entries `'check lump-sum payoff trigger each month for Invest'` (always when switch ON) and `'lump-sum fires at age {X}: brokerage drops from {Y} to {Z}'` (only when fired, with concrete values).
- [ ] T031 [US3] Pass `lumpSumEvent` into the existing `_findStageBoundaries` call from T015 so US2's stage detection picks up the lump-sum age as Invest's first-zero-balance row when applicable. Confirm `firstPayoffWinner` correctly resolves to `'invest'` in spec §8 case 3 (high-return scenario).
- [ ] T032 [US3] Run `node --test tests/unit/payoffVsInvest.test.js`. Confirm T025, T026, T027 all pass; T003/T006/T007/T014 still pass.

### Implementation for User Story 3 — UI (lockstep)

- [ ] T033 [US3] In `FIRE-Dashboard.html`, add a checkbox HTML element below the existing "Extra monthly cash to allocate" slider in the Payoff-vs-Invest tab. Markup: `<label><input type="checkbox" id="pviLumpSumPayoff"> <span data-i18n="pvi.lumpSum.label">…</span></label>` plus a help span with `data-i18n="pvi.lumpSum.help"`. Wire `change` event to (a) write `localStorage.setItem('pvi.lumpSumPayoff', JSON.stringify(checked))` and (b) trigger the existing PvI recompute pipeline. On page-init, read `localStorage.pvi.lumpSumPayoff` and set the checkbox state accordingly.
- [ ] T034 [US3] In `FIRE-Dashboard-Generic.html`, mirror T033's HTML + JS exactly (Principle I lockstep).
- [ ] T035 [US3] In both dashboards' `assemblePayoffVsInvestInputs()` (or equivalent — locate the function that builds `PrepayInvestComparisonInputs`), add `lumpSumPayoff: document.getElementById('pviLumpSumPayoff').checked` to the input record.
- [ ] T036 [P] [US3] In both dashboards' `renderPayoffVsInvestBrokerageChart`: when `outputs.lumpSumEvent` is non-null, replace the existing blue X marker (`pointStyle: 'crossRot'`) at `mortgageNaturalPayoff.investAge` with a labeled blue **down-arrow** (`pointStyle: 'triangle', rotation: 180` or equivalent) using the lump-sum age. Keep the original blue X behavior when `lumpSumEvent === null`. Update the renderer comment header to declare `lumpSumEvent` as a consumed field (Principle VI).
- [ ] T037 [P] [US3] In both dashboards' `renderPayoffVsInvestVerdictBanner`: when `outputs.lumpSumEvent !== null`, append a third line using `t('pvi.lumpSum.bannerLine', age, brokerageBefore, brokerageAfter)`. When the switch is ON but `lumpSumEvent === null`, append `t('pvi.lumpSum.notReached')` as an italic small note. Update the renderer comment header to declare `lumpSumEvent` consumed.
- [ ] T038 [P] [US3] Add 4 lump-sum translation keys (`pvi.lumpSum.label`, `pvi.lumpSum.help`, `pvi.lumpSum.bannerLine`, `pvi.lumpSum.notReached`) with EN + zh-TW values to `TRANSLATIONS.en` and `TRANSLATIONS.zh` blocks in BOTH HTML files (using `data-model.md` drafts).
- [ ] T039 [US3] Add the same 4 keys to `FIRE-Dashboard Translation Catalog.md`.
- [ ] T040 [US3] Manual smoke per quickstart.md S4, S5, S6, S7: typical case, high-return case, never-fires case, bilingual flip. Console clean. State persists across reload.

**Checkpoint**: All three stories shipped. Feature 017 functionally complete.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Lockstep audit, browser-smoke validation, CLOSEOUT authoring, BACKLOG sync.

- [ ] T041 [P] Lockstep diff: run `diff FIRE-Dashboard.html FIRE-Dashboard-Generic.html | grep -E "(pviLumpSum|stageBand|pviStageBands)"` and confirm only personal-content lines (Roger/Rebecca naming, real figures) differ on relevant blocks. Any non-personal divergence is a Principle I violation.
- [ ] T042 [P] Bilingual audit: search both HTML files for any new English string added in this feature that is NOT behind a `data-i18n` attribute or a `t(...)` call. Ad-hoc English breaks Principle VII.
- [ ] T043 Browser smoke: run quickstart.md S1 through S9 against both dashboards under both `file://` (double-click) and `http://` (`python -m http.server`) delivery modes. Log results; any failure routes back to the relevant phase.
- [ ] T044 Author `specs/017-payoff-vs-invest-stages-and-lumpsum/CLOSEOUT.md` capturing: scope summary, files changed, tests added, open follow-ups, any constitution-amendment-worthy lessons.
- [ ] T045 [P] Update `BACKLOG.md` and `FIRE-Dashboard-Roadmap.md`: mark feature 017 implemented (or in-progress as appropriate).
- [ ] T046 [P] Update `CLAUDE.md` SPECKIT block: change Active feature line to read `_none_ — feature 017 implemented YYYY-MM-DD on branch ...; awaiting browser-smoke verification (see CLOSEOUT.md) and merge.`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies; trivially passes once branch is correct.
- **Phase 2 (Foundational)**: Depends on Phase 1. **BLOCKS all user stories** — T003 regression-lock especially.
- **Phase 3 (US1 — MVP)**: Depends on Phase 2 completion.
- **Phase 4 (US2 — bands)**: Depends on Phase 2; logically independent of US1 but T015's `_findStageBoundaries` uses path data shaped by US1's window-start fix. Recommend US1 → US2 ordering.
- **Phase 5 (US3 — lump-sum)**: Depends on Phase 2 and (logically) Phase 4 — T031 wires `lumpSumEvent` into US2's stage detection. If US2 hasn't shipped yet, T031 simplifies to "pass null and skip the integration."
- **Phase 6 (Polish)**: Depends on whichever stories are slated for the current ship.

### Within Each User Story

- Tests written FIRST (Constitution Principle IV — they MUST FAIL before implementation begins).
- Calc-module changes before UI integration (UI consumes calc outputs).
- Both HTML files updated in lockstep within the same logical batch (Principle I).
- Translation strings added in the same change set as the user-visible English (Principle VII).

### Parallel Opportunities

- **Within Phase 2**: T004 + T005 can run in parallel (different sections of the same file but logically independent edits — sequential execution avoids merge friction; mark as serial-safe in practice).
- **Within US1**: T006 + T007 can be authored in parallel (different test cases). T010 + T011 are the same logical change in two files — can be done in parallel by two engineers.
- **Within US2**: T014 (test) is parallel with T015 (helper) only if the helper signature is locked first; in practice, write the test, then write the helper. T018 + T019 parallel (lockstep mirrors). T022 + T023 parallel (translation blocks vs catalog).
- **Within US3**: T025 + T026 + T027 parallel test authoring. T033 + T034 parallel UI mirrors. T036 + T037 + T038 parallel renderer edits + translations.
- **Phase 6**: T041 + T042 + T045 + T046 parallel.

### Cross-Story Independence

US1 ships and provides immediate value (the bug fix). US2 ships next and adds the visual story. US3 ships last and adds the "what if?" branch. Each story's deliverable is testable on its own per the Independent Test in its phase header.

---

## Parallel Example: User Story 1

```bash
# Two engineers (one for each HTML file) can land US1's UI changes in parallel:
Task: "T010 — Drop yellow diamond marker for buying-in in FIRE-Dashboard.html"
Task: "T011 — Drop yellow diamond marker for buying-in in FIRE-Dashboard-Generic.html"

# Tests can be authored in parallel before the implementation lands:
Task: "T006 — Add 'Window start for buying-in' fixture test"
Task: "T007 — Add 'Already-own backwards compat' fixture test"
```

## Parallel Example: User Story 3

```bash
# Test authors in parallel:
Task: "T025 — Add 'Lump-sum fires after Prepay payoff' fixture"
Task: "T026 — Add 'Lump-sum fires before Prepay payoff' fixture"
Task: "T027 — Add 'Lump-sum never fires' + 'Interest invariant' fixtures"

# UI integration in parallel (after calc changes T028-T032 land):
Task: "T036 — Replace blue X with down-arrow in both dashboards' brokerage chart"
Task: "T037 — Add banner Line 3 logic in both dashboards' verdict renderer"
Task: "T038 — Add 4 lump-sum translation keys in both HTML files"
```

---

## Implementation Strategy

### MVP First (US1 only — fixes the reported bug)

1. Complete Phase 1 (Setup — already mostly done).
2. Complete Phase 2 (Foundational — T003 regression lock is critical).
3. Complete Phase 3 (US1 — pre-buy-in fix).
4. **STOP and VALIDATE**: Open both dashboards with `ownership='buying-in'`, `buyInYears=2`. Confirm Prepay line stays at $0 throughout Stage I.
5. Run T043 browser smoke (subset for US1).
6. Optionally ship at this point — the immediately reported bug is gone.

### Incremental Delivery

1. Setup + Foundational → MVP-ready foundation.
2. Add US1 → ship as a hotfix release.
3. Add US2 (stage bands) → ship as a visual upgrade.
4. Add US3 (lump-sum branch) → ship as the headline new feature.
5. Each ship is independently demoable; the comparison story sharpens in stages.

### Parallel Team Strategy (if running with multiple engineers via the project's Manager pattern)

After Phase 2 (T003-T005) is locked:

- **Backend Engineer** owns calc-module work: T008-T009 (US1), T015-T017 (US2 calc half), T028-T032 (US3 calc half).
- **Frontend Engineer** owns dashboard work: T010-T013 (US1 UI), T018-T024 (US2 UI), T033-T040 (US3 UI). Lockstep enforced on every UI task.
- **QA Engineer** owns test work: T006-T007 (US1), T014 (US2), T025-T027 (US3), and the Phase 6 audits T041-T043.
- **Manager** verifies lockstep, integrates, runs T043 browser smoke gate before merge.

---

## Notes

- [P] tasks = different files OR clearly independent file regions, no dependencies on incomplete tasks.
- [Story] label maps task to its user story for traceability.
- Each user story is independently completable, testable, and shippable.
- Tests MUST be written and confirmed failing before implementation lands (Principle IV / `superpowers:test-driven-development`).
- Lockstep across both HTML files is non-negotiable on every UI task (Principle I).
- Bilingual EN + zh-TW lands in the same change set as new user-visible strings (Principle VII).
- Commit after each task or logical group; do not bundle stories into single mega-commits.
- File-protocol delivery (`file://` double-click) MUST keep working — no top-level `export` keyword in calc module (Principle V).
