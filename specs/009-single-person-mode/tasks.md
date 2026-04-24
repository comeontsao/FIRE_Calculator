---
description: "Tasks for feature 009 — Single-Person Mode"
---

# Tasks: Generic Dashboard — Single-Person Mode

**Input**: Design documents from `/specs/009-single-person-mode/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests:** INCLUDED. The constitution's Principle IV (Gold-Standard Regression Coverage — NON-NEGOTIABLE) mandates locked fixtures for every calc change, and success criterion SC-009 targets ≥ 90 unit tests passing. Each user story ships with its test tasks.

**Organization:** Tasks are grouped by user story. US1 and US2 are both P1 (co-equal MVP); US3 is P2 (discoverability polish); US4 is P3 (snapshots + i18n completeness).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different file or no dependency on an incomplete task → can run in parallel with other [P] tasks in the same phase.
- **[Story]**: User story tag (US1 / US2 / US3 / US4) — omitted for Setup, Foundational, and Polish phases.
- Exact file paths included in every task.

## Path Conventions (project-specific)

- Generic dashboard: `FIRE-Dashboard-Generic.html` (project root).
- Pure calc modules: `calc/*.js`.
- Unit tests: `tests/unit/*.test.js`.
- Fixtures: `tests/fixtures/*.js`.
- i18n catalog: `FIRE-Dashboard Translation Catalog.md`.
- RR dashboard (`FIRE-Dashboard.html`) is **explicitly untouched** per FR-029.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose:** Confirm branch, verify tooling, and record baseline test count.

- [ ] T001 Confirm current branch is `009-single-person-mode` and working tree is clean via `git status`.
- [ ] T002 Run the baseline unit-test suite to record pre-feature count: `bash tests/runner.sh` (or `node --test tests/unit/`) from the repo root; log the passing count (expected 79) to validate SC-009's "≥ 90" exit criterion after Phase 7.
- [ ] T003 [P] Add the feature-009 row to `FIRE-Dashboard-Roadmap.md` with link to `specs/009-single-person-mode/spec.md` (tracking only — content updated in polish phase).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose:** Establish the `adultCount` state field and the core plumbing every user story consumes. No user story work can begin until Phase 2 is complete.

**⚠️ CRITICAL:** All tasks in Phase 3+ depend on T004–T012 being in place.

- [ ] T004 In `FIRE-Dashboard-Generic.html`, add the `<input type="hidden" id="adultCount" value="2">` element. Place it inside the Profile & Income card grid adjacent to the existing Person 1 / Person 2 birthday rows (line range ~2015–2030). The hidden element is the single source of truth for adult count per data-model.md Entity 1.
- [ ] T005 In `FIRE-Dashboard-Generic.html`, extend `getInputs()` (currently at line ~5796) to read `adultCount` immediately after the existing feature-007 `safetyMargin` / `irmaaThreshold` reads. Apply the clamp per `contracts/calc-functions.contract.md §9`: `inp.adultCount = Math.max(1, Math.min(2, parseInt(_acEl.value) || 2))`.
- [ ] T006 In `FIRE-Dashboard-Generic.html`, append the string `'adultCount'` to the `PERSIST_IDS` array (line ~11428). Add a comment `// Feature 009 — Single-Person Mode`.
- [ ] T007 In `FIRE-Dashboard-Generic.html`, modify `detectMFJ(inp)` (line ~7601) per `contracts/calc-functions.contract.md §1`: primary signal is `Number.isInteger(inp.adultCount) ? inp.adultCount === 2 : (existing agePerson2 fallback)`. Update the fenced header comment above the function to document the new primary signal and the fallback.
- [ ] T008 In `FIRE-Dashboard-Generic.html`, implement `changeAdultCount(delta)` per `contracts/adult-count.contract.md §3`: clamp next value to `[1, 2]`, write to DOM, call `syncAdultCountVisibility()`, call `applyFilingStatusDefaults(detectMFJ(getInputs()))`, toggle button `disabled` attrs, call `saveState()`, call `recalcAll()`. Place the function in the same `<script>` block as the existing `addChild` / `removeLastChild` helpers so it lives with its siblings.
- [ ] T009 In `FIRE-Dashboard-Generic.html`, implement `syncAdultCountVisibility()` per `contracts/adult-count.contract.md §4`: read `#adultCount.value`; when value is `1`, set `display:none` on the `.input-group` wrappers of `#bdPerson2`, `#person2Stocks`, `#ssSpouseOwn`; when value is `2`, clear the inline `display` so they render. Idempotent.
- [ ] T010 In `FIRE-Dashboard-Generic.html`, add the two new constants alongside the existing healthcare constants (near line ~3720): `const SINGLE_ADULT_PRE65_SHARE = 0.35;` and a named constant for the post-65 single-enrollee multiplier (`const SINGLE_ADULT_POST65_FACTOR = 0.5;`). Add a one-line comment citing `research.md §1` and `§2`.
- [ ] T011 In `FIRE-Dashboard-Generic.html`, update `restoreState()` (line ~11544) per `contracts/persistence.contract.md §3`: after the `PERSIST_IDS.forEach` loop and BEFORE `_wireFilingStatusEditTracking`, call `syncAdultCountVisibility()` and set the `+`/`-` button `disabled` attributes from the restored value.
- [ ] T012 In `FIRE-Dashboard-Generic.html`, wire initial boot per `contracts/adult-count.contract.md §5`: at the bottom of the bootstrap block (near line ~12214 after `restoreState()`), if no persisted state existed, still call `syncAdultCountVisibility()` once to seed the default-2 layout (idempotent no-op, belt-and-braces).

**Checkpoint:** `#adultCount` is readable, persisted, the mutator exists, visibility helper exists, filing-status gate keys on `adultCount`. User stories can begin.

---

## Phase 3: User Story 1 — Decrement removes partner inputs and re-runs under Single (Priority: P1) 🎯 MVP

**Goal:** A solo planner decrements Adults from 2 to 1 and sees: partner inputs hidden, filing status flipped to Single with Single-filer defaults, Person 2 portfolio and SS contributions suppressed, all data preserved across reloads.

**Independent Test:** Per spec User Story 1 — load dashboard, click Adults `−`, confirm partner inputs disappear, filing status reads "Single", tax-bracket defaults swap to Single values, FIRE number recomputes, reload preserves `adultCount = 1`.

### Tests for User Story 1 (write tests FIRST — Constitution Principle IV)

- [ ] T013 [P] [US1] Create `tests/fixtures/single-person-mode.js` with fixture exports: `filingStatusFixtures` (adultCount=1/2/undefined variants), `ssSingleCombinationFixture` (primaryPIA + ssSpouseOwn → expected combined), `portfolioSuppressFixture` (person1Stocks + person2Stocks → expected net-worth for each adultCount).
- [ ] T014 [P] [US1] Create `tests/unit/filingStatus.test.js` with cases from `research.md §10 item 1`: `(adultCount=2)→MFJ`, `(adultCount=1)→Single`, `(adultCount=undefined, agePerson2=36)→MFJ` (fallback), `(adultCount=undefined, agePerson2=0)→Single`. Import `detectMFJ` by extracting it to a testable surface OR by requiring the fixture to be asserted against a minimal re-implementation that mirrors the HTML inline code — use the pattern already established in other `tests/unit/*` files.
- [ ] T015 [P] [US1] Extend `tests/unit/socialSecurity.test.js` with single-adult combination cases per `research.md §10 item 2`: assert `spousePIA === 0` and `combinedPIA === primaryPIA` when `adultCount === 1`, even if `ssSpouseOwn > 0`. Assert the normal spousal add-on path still works when `adultCount === 2`.
- [ ] T016 [P] [US1] Add a Node persistence round-trip test to `tests/unit/` (new file `adultCountPersist.test.js` or equivalent) per `contracts/persistence.contract.md §7`: assert `saveState` → `restoreState` round-trips `adultCount=1`, a blob missing the key defaults to `2`, and `getInputs()` returns the clamped integer.

### Implementation for User Story 1

- [ ] T017 [US1] In `FIRE-Dashboard-Generic.html`, update `calcNetWorth(inp)` (line ~5886) per `contracts/calc-functions.contract.md §3`: guard `person2Stocks` with `(inp.adultCount === 2 ? inp.person2Stocks : 0)`. Update the fenced comment header.
- [ ] T018 [US1] In `FIRE-Dashboard-Generic.html`, update `calcAccessible(inp)` (line ~5890) per `contracts/calc-functions.contract.md §4`: same guard. Update the fenced header.
- [ ] T019 [US1] In `FIRE-Dashboard-Generic.html`, update the four known lifecycle/withdrawal call sites listed in `contracts/calc-functions.contract.md §10` (lines ~6692, 6790, 7305, 8665). Replace each `inp.person1Stocks + inp.person2Stocks` with the `adultCount`-gated form. Add a brief inline comment `// FR-018` at each site.
- [ ] T020 [US1] In `FIRE-Dashboard-Generic.html`, update `calcRealisticSSA(inp, fireAge)` (line ~5944) per `contracts/calc-functions.contract.md §5`: introduce `const isSingle = inp.adultCount === 1;` and set `spousePIA = isSingle ? 0 : Math.max(pia * 0.5, inp.ssSpouseOwn);`. Update the fenced header to document the branch.
- [ ] T021 [US1] In `FIRE-Dashboard-Generic.html`, verify `getSSAnnual(inp, claimAge, fireAge)` (line ~5966) needs no additional branch (zero propagates from `calcRealisticSSA`), and update its fenced comment to reference `contracts/calc-functions.contract.md §6`.
- [ ] T022 [US1] In `FIRE-Dashboard-Generic.html`, confirm the tax-bracket call sites (`getTaxBrackets(detectMFJ(inp))` at lines 6907, 7133, 7489, 8351) continue to pick up the correct filing status through the already-updated `detectMFJ` (T007) — no additional edits needed here, but add a one-line `// Feature 009 — flow-through` comment at each site for future readers.
- [ ] T023 [US1] Run `bash tests/runner.sh` (or `node --test tests/unit/`). All tests from T013–T016 must pass. Existing tests must remain green.

**Checkpoint:** Decrementing Adults hides partner inputs, flips filing status, recalcs using Single brackets, and suppresses Person 2 contributions from net worth / accessible / SS. Acceptance scenarios US1-1 through US1-6 pass.

---

## Phase 4: User Story 2 — Healthcare scales to single-adult base (Priority: P1)

**Goal:** Pre-65 and post-65 healthcare baselines reflect a single adult when `adultCount === 1`, with per-kid scaling preserved (single parents are first-class).

**Independent Test:** Per spec User Story 2 — set Adults=1 with 0 kids, compare pre-65 cost vs Adults=2 with 0 kids (materially lower — single-adult share of family-of-4 reference); compare post-65 cost (≈ half of couple rate). Then Adults=1 with 2 kids to confirm per-kid scaling still layered on top.

### Tests for User Story 2

- [ ] T024 [P] [US2] Extend `tests/unit/healthcare.test.js` with the six new cases per `research.md §10 item 3` and `contracts/calc-functions.contract.md §7` branch table: `(adults=2, kids=0, age=40)→0.67`, `(adults=2, kids=1, age=40)→0.835`, `(adults=2, kids=2, age=40)→1.00`, `(adults=1, kids=0, age=40)→0.35`, `(adults=1, kids=1, age=40)→0.515`, `(adults=1, kids=2, age=40)→0.68`. Plus post-65 cases: `(adults=1, age=67, no override)→0.5 × post65`, `(adults=2, age=67)→1.0 × post65`, `(adults=1, age=67, override=$500)→$500` (override wins, FR-017).
- [ ] T025 [P] [US2] Add an explicit test case in `tests/unit/healthcare.test.js` for the pure-module `calc/healthcare.js` `getHealthcareCost` with `householdSize=1` vs `householdSize=2` to confirm the `HOUSEHOLD_DISCOUNT_FACTOR=0.8` path is still correct (regression guard; no changes to `calc/healthcare.js` in this phase).

### Implementation for User Story 2

- [ ] T026 [US2] In `FIRE-Dashboard-Generic.html`, update `getHealthcareFamilySizeFactor(age, inp)` (line ~3725) per `contracts/calc-functions.contract.md §7`: add the `inp` parameter, resolve `adults` from `inp.adultCount` with a DOM fallback for legacy callers, select adult-share constant, return `adultShare + PER_KID_SHARE * min(2, kidsOnPlan)`. Update the fenced header to document the new signature and branches.
- [ ] T027 [US2] In `FIRE-Dashboard-Generic.html`, update `getHealthcareMonthly(scenarioId, age, inp)` (line ~3749) per `contracts/calc-functions.contract.md §8`: add `inp` parameter, multiply post-65 baseline by `SINGLE_ADULT_POST65_FACTOR` only when `adultCount === 1` AND no positive user override. Forward `inp` into `getHealthcareFamilySizeFactor`. Update the fenced header.
- [ ] T028 [US2] In `FIRE-Dashboard-Generic.html`, audit every caller of `getHealthcareMonthly` / `getHealthcareFamilySizeFactor` / `getHealthcareDeltaAnnual` / `getBlendedHealthcareDelta` and thread `inp` through where available. Where the caller already has `inp` in scope, pass it; where it does not, the DOM fallback inside each function keeps behavior correct. Grep `getHealthcareMonthly\|getHealthcareFamilySizeFactor\|getHealthcareDeltaAnnual\|getBlendedHealthcareDelta` and review each hit.
- [ ] T029 [US2] Run `bash tests/runner.sh`. All tests from T024–T025 must pass; existing healthcare tests stay green.

**Checkpoint:** Adults=1 with 0 kids produces a measurably lower pre-65 cost than Adults=2, 0 kids; post-65 is half the couple rate; single-parent scenario still scales correctly. Acceptance scenarios US2-1 through US2-4 pass.

---

## Phase 5: User Story 3 — Household Composition block groups Adults + Children (Priority: P2)

**Goal:** Counter UI is discoverable and parallel to the existing kids pattern. Help tooltip explains the switch. Bounds are visually enforced. Filing-status label visible in the tax section.

**Independent Test:** Per spec User Story 3 — scan Profile & Income section and locate the Household composition block without prompting; hover tooltip reveals the single-person explanation; 2→1→2 round-trip preserves Person 2 data byte-for-byte; dec button disabled at 1, inc disabled at 2; filing-status label reads "Single"/"MFJ".

### Tests for User Story 3

- [ ] T030 [P] [US3] Create `tests/unit/adultCounter.test.js` per `research.md §10 item 4`: cases for clamp-on-decrement-from-1, clamp-on-increment-from-2, round-trip `2→1→2→1→2` preserves arbitrary Person 2 DOM values. Implementation may stub the minimal DOM (jsdom-style helper used in other tests) or assert against a pure `clampAdultCount(current, delta)` helper extracted for testability.

### Implementation for User Story 3

- [ ] T031 [US3] In `FIRE-Dashboard-Generic.html`, render the Household composition block per `contracts/adult-count.contract.md §1`: wrap the Adults counter + the children counter (compact `−/+` form) in a single `.household-composition` container positioned in the Profile & Income card. Use `data-i18n="profile.householdComposition"` on the heading. Add the `.counter-btn` CSS class per `contracts/adult-count.contract.md §2` in the `<style>` block.
- [ ] T032 [US3] In `FIRE-Dashboard-Generic.html`, add the `±` buttons `#adultCountDec` / `#adultCountInc` with `onclick="changeAdultCount(-1)"` / `onclick="changeAdultCount(+1)"`, `aria-label` from `data-i18n-aria`, and a visible `<span id="adultCountDisplay">` between them that mirrors `#adultCount.value`. Also ensure the bounds-disabled toggle logic in `changeAdultCount` (T008) updates `#adultCountDisplay.textContent` each time.
- [ ] T033 [US3] In `FIRE-Dashboard-Generic.html`, add the help tooltip `<span class="info-tip" data-i18n-tip="profile.adultsTip" data-tip="...">?</span>` adjacent to the Adults label, following the existing info-tip pattern used elsewhere in the card.
- [ ] T034 [US3] In `FIRE-Dashboard-Generic.html`, add the filing-status display row in the tax-planning section: `<div>` with `data-i18n="tax.filingStatus.label"` label and a `<span id="filingStatusDisplay">` that is populated in `recalcAll()` via `t(detectMFJ(inp) ? 'tax.filingStatus.mfj' : 'tax.filingStatus.single')`. Hook the dynamic re-render into the existing `switchLanguage()` refresh.
- [ ] T035 [P] [US3] Add the new i18n keys per `contracts/i18n.contract.md §1–§2` to BOTH `TRANSLATIONS.en` and `TRANSLATIONS.zh` in `FIRE-Dashboard-Generic.html`: `profile.householdComposition`, `profile.adults`, `profile.adultsTip`, `profile.adultsDec`, `profile.adultsInc`, `profile.children`, `tax.filingStatus.label`, `tax.filingStatus.single`, `tax.filingStatus.mfj`. Match the exact strings from the i18n contract.
- [ ] T036 [US3] Run `bash tests/runner.sh`. T030 must pass. Manually verify in a browser that the Household composition block renders, tooltip appears on hover, buttons disable at bounds, filing-status display flips with the counter, and language-toggle flips all new strings.

**Checkpoint:** User Story 3 acceptance scenarios US3-1 through US3-6 pass; counter is discoverable; Person 2 data survives round-trips.

---

## Phase 6: User Story 4 — Localization and snapshots honor the adult count (Priority: P3)

**Goal:** Snapshot CSV schema records the adult count; legacy 19-column files continue to load with `adults=2` default; all new strings appear in Traditional Chinese; snapshot-row display distinguishes 1-adult from 2-adult rows.

**Independent Test:** Per spec User Story 4 — switch to 繁體中文 and confirm new block is fully Chinese; save a snapshot at Adults=1 and confirm CSV row carries integer `1`; import a pre-feature-009 CSV and confirm it loads with all rows at `adults=2`.

### Tests for User Story 4

- [ ] T037 [P] [US4] Create `tests/unit/snapshotsCsv.test.js` per `contracts/snapshots.contract.md §7` with at minimum: round-trip a `adults=1` snapshot; parse a 19-column legacy row → `adults=2`; parse garbage column 19 → `adults=2`; serialize emits 20-column header; `adults` clamp on save.

### Implementation for User Story 4

- [ ] T038 [US4] In `FIRE-Dashboard-Generic.html`, append `'Adults'` to the `CSV_HEADERS` array (line ~11731) per `contracts/snapshots.contract.md §1`.
- [ ] T039 [US4] In `FIRE-Dashboard-Generic.html`, extend `snapshotsToCSV(all)` (line ~11750) per `contracts/snapshots.contract.md §2` to emit `s.adults ?? 2` as the 20th field per row.
- [ ] T040 [US4] In `FIRE-Dashboard-Generic.html`, extend `csvToSnapshots(csvText)` (line ~11767) per `contracts/snapshots.contract.md §3` to read column 19 with `Math.max(1, Math.min(2, parseInt(cols[19]) || 2))`. Populate `adults` on every in-memory snapshot object.
- [ ] T041 [US4] In `FIRE-Dashboard-Generic.html`, extend `saveSnapshot()` (around line ~11960) per `contracts/snapshots.contract.md §4` to capture `adults` from `#adultCount` at save time.
- [ ] T042 [US4] In `FIRE-Dashboard-Generic.html`, update the snapshot history table (`<thead>` at line ~2911 region): add a new `<th>` bearing `data-i18n="snap.adults"`. Update the rendering function that emits `<tr>` rows (search for where existing columns like `snap.person2Stocks` get their `<td>`) to output the integer `s.adults` for each row. Apply the Person-2-stocks column de-emphasis for rows whose `adults === 1` (FR-008) — suggest a simple inline style reducing opacity or swapping to `--text-dim`.
- [ ] T043 [P] [US4] Add the snapshot-related i18n keys per `contracts/i18n.contract.md §3` to BOTH `TRANSLATIONS.en` and `TRANSLATIONS.zh` in `FIRE-Dashboard-Generic.html`: `snap.adults`, `snap.adultsTip`.
- [ ] T044 [P] [US4] Mirror ALL new i18n keys (both the US3 and US4 keys — §§1–3 of the contract) into `FIRE-Dashboard Translation Catalog.md`. Sort into the existing thematic buckets (Profile, Tax, Snapshots).
- [ ] T045 [US4] Run `bash tests/runner.sh`. T037 must pass; existing snapshot-adjacent tests stay green.

**Checkpoint:** Acceptance scenarios US4-1 through US4-3 pass. CSV round-trip preserves adult count; legacy CSVs load cleanly; zh-TW toggle shows Chinese for every new label.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose:** Documentation sync, contract-header updates on sibling pure modules, full-suite verification against SC-009, manual quickstart validation.

- [ ] T046 [P] Update `calc/healthcare.js` contract header per `contracts/calc-functions.contract.md §11`: extend the `Consumers:` list to note the inline Generic dashboard mirror and adult-count semantics. **Do not** change the module's code.
- [ ] T047 [P] Update `calc/socialSecurity.js` contract header per `contracts/calc-functions.contract.md §12`: note that the Generic inline `calcRealisticSSA` wraps this module with a spousal add-on gated on `adultCount === 2`.
- [ ] T048 [P] Update `FIRE-Dashboard-Roadmap.md` feature-009 row (created in T003) with: spec link, plan link, status set to "implemented", and a one-paragraph summary drawn from plan.md §Summary.
- [ ] T049 Audit chart renderer comments per Constitution Principle VI for the charts enumerated in FR-020 that consume adult-count-sensitive outputs. For each affected Chart.js render site in `FIRE-Dashboard-Generic.html` (Full Portfolio Lifecycle, Portfolio Drawdown, Country Comparison, Strategy Compare, Lifetime Withdrawal, Monthly Expense pie, Net Worth pie, Savings Rate gauge, What-If card), add a one-line comment referencing the adult-count-aware calc functions it now consumes. Format: `// Chart ↔ Module: reads calcNetWorth, getSSAnnual, getHealthcareMonthly — all adultCount-gated (feature 009).`
- [ ] T050 Run the full test suite: `bash tests/runner.sh` (or `node --test tests/unit/`). Confirm passing count is ≥ 90 (SC-009). If below 90, identify gaps against T013–T037 and add missing cases before moving on.
- [ ] T051 Manually execute every step of [quickstart.md](./quickstart.md) in a real browser (Chrome or Edge, File System Access API path). Log any failures back to the appropriate task; every step must pass before this task closes. Include the DevTools console zero-red-error check (Principle lesson: "Browser smoke before claiming a feature 'done'").
- [ ] T052 Run Manager-side bilingual audit per `contracts/i18n.contract.md §5`: `grep -oE '[A-Za-z]{4,}'` on the diff for `FIRE-Dashboard-Generic.html`; every 4+ letter word is either inside `TRANSLATIONS.*`, behind `data-i18n` / `t()`, or on the Principle-VII Exemption list. Report any hits.
- [ ] T053 Final sweep: confirm `FIRE-Dashboard.html` is unchanged on this branch (`git diff main -- FIRE-Dashboard.html` returns empty). Confirms FR-029 / Principle-I exception held throughout implementation.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup, T001–T003):** No dependencies — can start immediately.
- **Phase 2 (Foundational, T004–T012):** Depends on Phase 1 — BLOCKS every user story.
- **Phase 3 (US1):** Depends on Phase 2. Independently shippable as MVP.
- **Phase 4 (US2):** Depends on Phase 2. Can run in parallel with Phase 3 (different functions, different test files).
- **Phase 5 (US3):** Depends on Phase 2 + Phase 3 (US3 assumes the counter's click handler already mutates partner visibility correctly — it is a discoverability + UX layer on top of US1).
- **Phase 6 (US4):** Depends on Phase 2. Can start after Phase 2 and merge independently (snapshot + i18n are side-channels). i18n catalog mirror (T044) is cleanest after US3 + US4 keys all exist.
- **Phase 7 (Polish, T046–T053):** Depends on every user-story phase being complete.

### Within Each User Story

- Tests (marked `[P]`) SHOULD be authored first (Principle IV); at minimum they must exist and run green before the phase's checkpoint.
- Calc function edits (models/services layer) before UI wiring.
- Each phase ends with a test-suite run to catch regressions.

### Parallel Opportunities

**Within Phase 2:** T003 is `[P]`; T004–T012 all touch `FIRE-Dashboard-Generic.html` so they sequence.

**Across Phase 3 and Phase 4:** Entirely different functions and test files — can be worked on by two engineers in parallel. Phase 3 touches `calcNetWorth`, `calcAccessible`, `calcRealisticSSA`, 4 lifecycle call sites; Phase 4 touches `getHealthcareFamilySizeFactor`, `getHealthcareMonthly`. Only tests (`tests/unit/*.test.js`) overlap — different test files, parallel-safe.

**Within Phase 3 and Phase 4:** Each test task is `[P]` (new/extended test file) and each fixture task is `[P]` — multiple engineers can write tests in parallel.

**Within Phase 5 and Phase 6:** Translation-catalog writes (T035, T043, T044) are `[P]` because they target independent translation maps / separate markdown buckets.

**Phase 7:** T046, T047, T048 are all `[P]` (three different files). T049–T053 sequence.

---

## Parallel Example: Phase 3 (US1) test authoring

```text
# Launch these tests in parallel — each lives in its own file:
Task: "T013 Create tests/fixtures/single-person-mode.js"
Task: "T014 Create tests/unit/filingStatus.test.js"
Task: "T015 Extend tests/unit/socialSecurity.test.js"
Task: "T016 Create tests/unit/adultCountPersist.test.js"
```

## Parallel Example: Phase 3 + Phase 4 simultaneous delivery

```text
# Two engineers work independently after Phase 2 completes:
Engineer A: T017, T018, T019, T020, T021, T022, T023  (US1 implementation)
Engineer B: T026, T027, T028, T029                    (US2 implementation)
Tests for both in parallel: T013–T016, T024–T025
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Finish Phase 1 (Setup) and Phase 2 (Foundational).
2. Finish Phase 3 (US1) — filing-status swap and partner hiding are the correctness fix motivating the whole feature.
3. **STOP and validate.** A user at Adults=1 now gets correct federal tax math and a clean UI. This is the single highest-value delivery and can ship alone if time is short — US2, US3, US4 are incremental polish.

### Incremental Delivery

1. MVP: Setup → Foundational → US1. Ship.
2. Add US2 (healthcare correctness). Ship.
3. Add US3 (discoverability: Household composition block + tooltip + filing-status label). Ship.
4. Add US4 (snapshot CSV schema + full bilingual sweep). Ship.
5. Polish (T046–T053) before merging to `main`.

### Parallel Team Strategy

Two engineers after Phase 2:

- **Frontend Engineer** (US3 + parts of US4): counter UI, i18n wiring, catalog mirror, snapshot table row display.
- **Backend Engineer** (US1 + US2 + parts of US4): calc-function signature extensions, CSV serialization, fixtures + unit tests.
- **QA Engineer**: writes tests in parallel (T013–T016, T024–T025, T030, T037), runs the full suite after each phase, executes quickstart in Polish.

---

## Notes

- `[P]` tasks = different files and no dependency on an incomplete task.
- `[Story]` label maps to the spec's user stories (US1 / US2 / US3 / US4) so each phase can ship independently.
- The RR dashboard (`FIRE-Dashboard.html`) is untouched on this branch by design (FR-029, Principle I justified exception). T053 verifies this.
- The calc/ modules are edited only in their fenced comment headers (Polish phase). Their runtime behavior is unchanged; the inline Generic dashboard code is where the feature's branches live.
- Constitution Principle IV (NON-NEGOTIABLE) requires tests for every new calc branch. Do NOT skip T013–T016, T024–T025, T030, T037. SC-009's ≥ 90 passing-count target is the hard gate (T050).
- Constitution Principle VII (NON-NEGOTIABLE) requires bilingual delivery in the same commit. T035, T043, T044 enforce this; T052 audits.
- Every HTML edit should be accompanied by a comment pointing at the governing requirement (e.g., `// FR-006`, `// FR-018`, `// Feature 009 — flow-through`) so future readers can trace provenance.
- Commit after each task or logical group; never `--no-verify` around pre-commit hooks.
