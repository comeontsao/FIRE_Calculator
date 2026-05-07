---

description: "Task list for feature 027 — Aggressive Bracket-Fill withdrawal strategy variant"
---

# Tasks: Aggressive Bracket-Fill Withdrawal Strategy

**Input**: Design documents from `/specs/027-aggressive-bracket-fill/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ (2 files) ✅, quickstart.md ✅

**Tests**: Tests are IN SCOPE — spec FR-018 / FR-019 require unit + Playwright + manual browser-smoke coverage. Constitution IV mandates regression coverage for the new strategy.

**Organization**: Tasks grouped by user story for independent implementation. Phase 2 Foundational contains the calc-layer extension (`disableSmoothingCap` option) — blocks all four user stories because they all consume `taxOptimizedWithdrawal` through the new flag.

## Format: `- [ ] [TaskID] [P?] [Story?] Description with file path`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story label (US1, US2, US3, US4); omitted on Setup / Foundational / Polish phases
- All file paths are repository-relative

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Light scaffolding for tests and reused fixtures.

- [ ] T001 Confirm `tests/diagnostics/sc026a-counterfactual.js` (frozen feature-026 fixture) is suitable for re-use by 027's unit test. If pool balances need adjustment for the SC-001 acceptance numbers (lifetime tax $116,507 ± 5%, terminal BV $1,129,821 ± 5%), document the delta in `specs/027-aggressive-bracket-fill/research.md` Section 1 as an addendum. Otherwise re-use as-is.
- [ ] T002 [P] Pick a distinct color for the new strategy's `STRATEGIES` entry. Survey existing 7 colors (`#6c63ff`, `#ff6b6b`, `#5ee38a`, `#ffb45a`, `#a78bfa`, `#22d3ee`, `#facc15` — verify by grep). Choose a non-conflicting hue (suggested: `#fb923c` orange-amber or `#c084fc` purple). Document choice in `data-model.md` §1 (replace `<TBD>` placeholder).

**Checkpoint**: Phase 1 done — fixture and color decision recorded.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The calc-layer extension that ALL user stories consume. **No US-phase task may begin until T003 + T004 are complete and tests pass.**

- [ ] T003 Extend `taxOptimizedWithdrawal` in `FIRE-Dashboard.html` (line ~10787-11045) to accept the new `options.disableSmoothingCap` boolean per `contracts/per-year-mechanic.contract.md`. Modify Step 2 (lines 10832-10842) to skip the `smoothedTarget` cap when `opts.disableSmoothingCap === true && canAccess401k && ssIncome === 0`; apply the existing smoothed cap otherwise. Set `aggressiveActive: boolean` on the return shape (top-level OR inside caveats — match existing field placement). Default for `disableSmoothingCap`: `false` when absent. **Backwards-compat invariant: when option is absent or false, output is byte-identical to today.**
- [ ] T004 Apply the SAME extension to `FIRE-Dashboard-Generic.html` at the parallel `taxOptimizedWithdrawal` location. Use `inp.agePerson1` / Generic-shape inputs at any line that differs from RR; otherwise copy the RR change verbatim (Constitution I lockstep).
- [ ] T005 [P] Write `tests/unit/aggressiveBracketFill.test.js` per `contracts/per-year-mechanic.contract.md` "Acceptance test (FR-018)" §1-5. Six cases: (1) backward-compat (old strategies' fixtures byte-identical when option absent), (2) no-cap path triggers correctly at age 65 / SS=0 / canAccess401k=true → `wTrad ≈ $118,085`, `aggressiveActive: true`, (3) cap re-applies at age 70 with SS active, (4) pre-unlock blocks both paths at age 55 / canAccess401k=false → `wTrad === 0`, (5) spending-floor pass intact when pools insufficient → `hasShortfall: true`, (6) SC-026-A pin (full 55→100 retirement) → lifetime tax ∈ [$110.7K, $122.3K] real-$ AND terminal BV ∈ [$1.073M, $1.186M] real-$.
- [ ] T006 Run `node --test tests/unit/aggressiveBracketFill.test.js`; all 6 cases must PASS before any US-phase task starts. If any case fails, fix T003/T004 in lockstep until green.
- [ ] T007 Run `node --test tests/unit/` full suite; existing 564 passing + 1 skip baseline must hold (no regression in any of the 7 existing strategies' fixtures via T005 case 1 + the calcAudit / strategyMatrix / spendingFloorPass tests).

**Checkpoint**: Calc-layer foundation green. All US phases unblocked.

---

## Phase 3: User Story 1 — Aggressive strategy registration + per-year mechanic (Priority: P1) 🎯 MVP

**Goal**: New strategy `AGGRESSIVE_BRACKET_FILL` lives in the `STRATEGIES` registry, calls `taxOptimizedWithdrawal` with `disableSmoothingCap: true` per year, produces SC-026-A target numbers within ±5%.

**Independent Test**: Load SC-026-A fixture, select the new strategy, verify chart bars + tooltip values match SC-001 ranges (verified end-to-end at T012 manual smoke).

**Prerequisites**: T003-T007 closed.

### Implementation for User Story 1

- [ ] T008 [US1] Insert `AGGRESSIVE_BRACKET_FILL` Object.freeze() entry in the `STRATEGIES` array of `FIRE-Dashboard.html` (between `BRACKET_FILL_SMOOTHED` at line ~11178 and `TRAD_FIRST` at line ~11214) per `contracts/strategy-registry.contract.md`. The entry's `computePerYearMix(ctx)` calls `taxOptimizedWithdrawal` with `Object.assign({}, ctx.bfOpts, { disableSmoothingCap: true })`. Color = T002 decision.
- [ ] T009 [US1] Apply the SAME `STRATEGIES` array insertion in `FIRE-Dashboard-Generic.html`. Same Object.freeze() shape, same color, same i18n keys (Constitution I lockstep).
- [ ] T010 [US1] Verify `STRATEGIES.length === 8` in both HTMLs (was 7). Add a one-line assertion to `tests/unit/strategies.test.js` (or update an existing count assertion if present) that locks the count to 8.
- [ ] T011 [US1] Run `node --test tests/unit/strategies.test.js` — must PASS with the new count.
- [ ] T012 [US1] **Manual browser smoke (US1 acceptance)**. Open `FIRE-Dashboard.html`, navigate to **Retirement → Withdrawal Strategy**, set Mode = Safe and Objective = Pay less lifetime tax. Verify: (a) "Aggressive Bracket-Fill" appears in the strategy selector / card list, (b) when selected, the chart shows red+purple Trad bars in years 60-69 totaling ~$118K each year, (c) effective tax line (yellow) shows ~9% in those years, (d) Trad pool drains to ~$0 by age 67-68, (e) Taxable bar visibly larger post-68 than under Smoothed. Repeat for `FIRE-Dashboard-Generic.html`.

**Checkpoint**: US1 functional. Strategy registered, calc produces target numbers, chart visually reflects the policy.

---

## Phase 4: User Story 2 — Strategy ranker + audit integration (Priority: P2)

**Goal**: New strategy participates in `getActiveSortKey({mode, objective})` chain across all 6 (Mode × Objective) cells; appears as the 8th row in the Strategy Ranking audit panel; ranker auto-picks it under appropriate (mode, objective) cells.

**Independent Test**: Open Audit → Strategy Ranking; verify 8 rows present, all fields populated, winner highlighted correctly per active mode/objective.

**Prerequisites**: T008-T012 closed.

### Implementation for User Story 2

- [ ] T013 [US2] Add `tests/unit/aggressiveBracketFill.ranker.test.js` (or extend `tests/unit/aggressiveBracketFill.test.js` with a new describe block — pick whichever the existing test layout suggests). Tests: aggressive strategy participates in `_simulateStrategyLifetime`, `scoreAndRank` populates all expected fields (`endBalance`, `lifetimeFederalTax`, `hasShortfall`, `firstShortfallAge`, `violations`, `firstViolationAge`, `safe_feasible`, `exact_feasible`, `dieWithZero_feasible`, `feasibleUnderCurrentMode`, `chosenTheta` (null), `isWinner`).
- [ ] T014 [US2] Extend `tests/unit/modeObjectiveOrthogonality.test.js` (or add a new test file) with cases that exercise the new strategy in all 6 (Mode × Objective) cells per `research.md` Section 2 table. Assert: ranker picks aggressive in cells where it should win for SC-026-A; tie-breaker chain unchanged for high-Trad cases (alphabetical fall-back to `aggressive-bracket-fill` < `bracket-fill-smoothed`).
- [ ] T015 [US2] Run `node --test tests/unit/modeObjectiveOrthogonality.test.js tests/unit/strategyRankerHysteresis.test.js`; both must PASS.
- [ ] T016 [US2] Verify the audit panel renders 8 strategy ranking rows in the live dashboard. Open **Audit → Strategy Ranking**; confirm `aggressive-bracket-fill` row visible alongside the existing 7. (Manual; folded into T024 manual smoke.)

**Checkpoint**: US2 ranker integration green.

---

## Phase 5: User Story 3 — User-facing copy + i18n (Priority: P2)

**Goal**: EN + zh-TW translations for the new strategy's name, description, narrative, and tooltip ship in BOTH HTMLs in lockstep (Constitution VII).

**Independent Test**: Toggle EN ↔ 中文; new strategy's display name and description switch language correctly. Zero untranslated EN strings under zh-TW.

**Prerequisites**: T008-T009 closed (registry entry has the i18n keys to wire to).

### Implementation for User Story 3

- [ ] T017 [US3] Add 4 EN translation keys to the `TRANSLATIONS.en` dict in `FIRE-Dashboard.html`: `strategy.aggressiveBracketFill.name` = "Aggressive Bracket-Fill"; `strategy.aggressiveBracketFill.desc`, `strategy.aggressiveBracketFill.narrative`, `strategy.aggressiveBracketFill.tooltip` per `research.md` Section 1's proposed copy. Verify Money Terminology compliance (no "real $" / "real money" / "real value").
- [ ] T018 [US3] Add the SAME 4 keys to the `TRANSLATIONS.zh` dict in `FIRE-Dashboard.html` using the zh-TW translations from `research.md` Section 1: name = `主動填滿稅階`, plus the description/narrative/tooltip Chinese.
- [ ] T019 [US3] Apply T017 + T018 to `FIRE-Dashboard-Generic.html` (Constitution I lockstep — same 8 keys × 2 languages = 16 string entries land in Generic too).
- [ ] T020 [US3] Update `FIRE-Dashboard Translation Catalog.md` with the 4 new keys × 2 languages = 8 entries (Constitution VII catalog-sync rule).
- [ ] T021 [US3] **Browser smoke for US3.** Open both HTMLs, toggle EN ↔ 中文 with the language buttons. Verify the new strategy's name + description + tooltip render in the active language; no English strings appear under zh-TW.

**Checkpoint**: US3 translations green. Constitution VII bilingual gate satisfied.

---

## Phase 6: User Story 4 — Visual feedback in chart (Priority: P3)

**Goal**: Withdrawal Strategy chart visibly distinguishes aggressive vs smoothed: red+purple Trad bars in 60-69 with ~9% effective tax line, vs orange-only with 0% under smoothed.

**Independent Test**: Side-by-side comparison of the two strategies for ages 60-69; visual delta is unmistakable to a non-technical user.

**Prerequisites**: T008-T021 closed.

### Implementation for User Story 4

- [ ] T022 [US4] Verify the existing chart renderer correctly stacks `Trad 401K draw (taxed)` and `Trad: Bracket-fill excess` for aggressive's larger wTrad. (No code change expected — the renderer is strategy-agnostic; just verify visually.)
- [ ] T023 [US4] Write Playwright E2E spec `tests/e2e/aggressive-bracket-fill.spec.ts`. Loads each HTML in each language, sets Mode = Exact + Objective = Pay-less-lifetime-tax, selects "Aggressive Bracket-Fill", scrapes chart tooltip for ages 60, 65, 68, asserts ranges per SC-001:
  - Age 65: `Trad 401K draw (taxed)` + `Trad: Bracket-fill excess` ∈ [$110K, $130K] (= $118K ± ~10%)
  - Age 65: `Effective tax rate (%)` ∈ [7%, 12%]
  - Age 70: `Social Security` > $0 (SS active)
  - At locale switch (en → zh): the strategy card label changes from "Aggressive Bracket-Fill" to `主動填滿稅階`
- [ ] T024 [US4] Run `npx playwright test tests/e2e/aggressive-bracket-fill.spec.ts`; must PASS in both languages on both HTML files.

**Checkpoint**: US4 chart visualization green.

---

## Phase 7: Polish & Cross-Cutting

**Purpose**: Final verification and merge prep.

- [ ] T025 [P] Run the FULL existing unit test suite: `find tests -name "*.test.js" -type f -print0 | xargs -0 node --test`. Expected: 565 baseline (post-026) + 1 new test file (`aggressiveBracketFill.test.js`) = 566 tests, 565 passing, 1 intentional skip, 0 failures.
- [ ] T026 [P] Update `BACKLOG.md`: move B-026-1 ("Aggressive bracket-fill strategy variant") from "New backlog items" to "Done in feature 027" — feature 027 ships the strategy.
- [ ] T027 Manual cross-strategy smoke (US1 + US2 + US3 + US4 combined): cycle through all 8 strategies in the dashboard, confirm each renders correctly and the ranker picks them appropriately under each (Mode, Objective) cell. Confirm no flicker on consecutive recalcs.
- [ ] T028 Write `specs/027-aggressive-bracket-fill/CLOSEOUT.md` summarizing: SC-001 actuals (compare to ±5% tolerance), test count delta, browser-smoke verification date, any deferred items. Follow the structure of `specs/026-withdrawal-tax-and-ui-fixes/CLOSEOUT.md`.
- [ ] T029 Update `CLAUDE.md` SPECKIT block to indicate 027 status (e.g., "AWAITING BROWSER SMOKE" → "MERGED main" once T030 passes).
- [ ] T030 **Merge gate — manual browser smoke per CLAUDE.md "Browser smoke before claiming a feature done"**:
  1. Open `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` in a real browser at 100% zoom.
  2. Wait 2 seconds for cold load. Verify zero red errors in DevTools console.
  3. Cycle Mode = Safe → Exact → DWZ. Confirm strategy ranker auto-selects appropriate winner for each.
  4. Cycle Objective = Leave-more-behind → Pay-less-lifetime-tax. Confirm winner shifts.
  5. Manually select "Aggressive Bracket-Fill". Verify SC-001 visual delta (red+purple bars 60-69, ~9% tax).
  6. Toggle EN ↔ 中文. Verify all new strings render in selected language.
  7. Open Audit → Strategy Ranking. Confirm 8 rows visible, fields populated.
  8. Drag the FIRE marker. Confirm same-frame update without NaN cascade.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No upstream deps. T001 + T002 can start immediately (parallel).
- **Foundational (Phase 2)**: Depends on Phase 1. T003 + T004 are paired (lockstep — RR + Generic). T005 [P] can be drafted while T003/T004 proceed (test scaffolding parallel). T006 + T007 sequential after T003-T005 complete.
- **US1 (Phase 3)**: Depends on T003-T007 closed.
- **US2 (Phase 4)**: Depends on US1 (the strategy must exist in registry before ranker tests it).
- **US3 (Phase 5)**: Depends on US1 (registry has the i18n keys to wire to). Otherwise INDEPENDENT of US2.
- **US4 (Phase 6)**: Depends on US1 + US3 (chart needs the strategy + the translations). Independent of US2 ranker work.
- **Polish (Phase 7)**: Depends on US1 + US2 + US3 + US4 all complete.

### Within Each User Story

- **US1**: T008 + T009 are paired (lockstep RR + Generic, same commit). T010 + T011 sequential after registry lands.
- **US2**: T013 + T014 in parallel (different test files). T015 (run tests) sequential after.
- **US3**: T017 + T018 + T019 + T020 land together (one commit — Constitution VII). T021 manual after.
- **US4**: T022 (visual verification) before T023 (Playwright spec), then T024 (run spec).

### Parallel Opportunities

- **Phase 1**: T001 + T002 in parallel.
- **Phase 2**: T003 + T004 paired sequentially (lockstep). T005 can be DRAFTED in parallel with T003/T004 (test file scaffolding); T005 EXECUTION (running the test) sequential after T003/T004 complete.
- **Phase 4 (US2)**: T013 + T014 in parallel (different files / different test concerns).
- **Phase 5 (US3)**: T017/T018/T019 land in single commit; T020 (catalog) can be authored in parallel.
- **Cross-story after US1**: US2 + US3 + US4 can run in parallel by 3 different agents (disjoint file ownership: US2 → ranker tests, US3 → translations, US4 → chart smoke + Playwright spec).

---

## Parallel Example: Phase 2 Foundational

```bash
# Sequential because lockstep RR + Generic must commit together:
T003 → calc-layer extension in FIRE-Dashboard.html
T004 → same extension in FIRE-Dashboard-Generic.html (same commit)

# Parallel — different files:
T005 [P] → tests/unit/aggressiveBracketFill.test.js (drafted while T003/T004 in flight)

# Sequential after T003 + T004 + T005 complete:
T006 → run aggressiveBracketFill.test.js (must PASS)
T007 → run full suite (no regression)
```

## Parallel Example: Phase 3-6 (post-Foundational)

```bash
# After T007 closes, dispatch 3 agents in parallel:
Agent A: US1 (T008 → T012)         — lockstep edits + manual smoke
Agent B: US2 (T013 → T016)         — ranker tests
Agent C: US3 (T017 → T021)         — translations + smoke

# Then US4 sequentially after US1 + US3:
Agent D: US4 (T022 → T024)         — chart visualization + Playwright spec
```

---

## Implementation Strategy

### MVP First (User Story 1 — strategy registration + per-year mechanic)

1. Phase 1 setup → close T001 + T002.
2. Phase 2 foundational → close T003-T007 (calc layer green).
3. Phase 3 (US1) → close T008-T012.
4. **STOP and VALIDATE**: confirm SC-001 acceptance manually + via tests. If green → ship as MVP.

US2/US3/US4 can ride a follow-up commit if MVP urgency demands. Polish (Phase 7) closes the feature.

### Incremental Delivery

1. Setup + Foundational → calc green, ready to integrate.
2. US1 → MVP visible to user (strategy in registry, chart shows aggressive behavior).
3. US3 → bilingual ready.
4. US2 → ranker auto-picks aggressive when appropriate (no manual selection required).
5. US4 → Playwright + chart polish.
6. Polish → CLOSEOUT + browser-smoke gate → merge.

### Parallel Team Strategy

With agent dispatch (per CLAUDE.md Manager + Engineers):

1. Manager spawns Phase 1 (Setup) + Phase 2 (Backend Engineer for T003 + T004; QA Engineer for T005 in parallel).
2. Manager closes T006 + T007 sequentially (gate).
3. Manager spawns 3 agents in parallel: Backend (US1 + US2 calc/ranker), Frontend (US1 + US3 + US4 UI/translations/chart), QA (test runs across phases).
4. Manager runs T030 browser-smoke gate (Manager-only).

---

## Notes

- **Surgical scope.** This is a small feature in execution but high in user impact. The calc-layer change is ONE option flag; the registry change is ONE entry. The bulk of the file count comes from translations (16 strings) and tests.
- **Backwards compat is the hard gate.** T005 case 1 explicitly verifies the existing 7 strategies' fixtures are byte-identical when `disableSmoothingCap` is absent. If this regresses, the merge is blocked.
- **Lockstep gate (Constitution I).** Every implementation task in US1, US3 includes a paired RR + Generic edit task. Manager rejects single-file commits.
- **Browser-smoke is the merge gate.** T030 cannot be skipped per CLAUDE.md.
- **Commit cadence.** Commit after each completed task or logical group. Avoid bundling US1 + US2 + US3 + US4 changes into one commit — they must remain disentanglable.
- **Constitution principles invoked:** I (lockstep), II (pure modules), III (single source of truth — `_lastKpiSnapshot`), IV (regression coverage — strategyMatrix), V (zero-build), VI (chart-module contracts), VII (bilingual), VIII (spending floor), IX (mode/objective orthogonality). All re-checked at T030.
