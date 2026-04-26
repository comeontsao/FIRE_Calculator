---

description: "Task list for feature 012 — SSA Earnings Record: Support Years Before 2020"
---

# Tasks: SSA Earnings Record — Support Years Before 2020

**Input**: Design documents from `/specs/012-ssa-earnings-pre-2020/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md` — all present.
**Tests**: Included — constitution Principle IV (Gold-Standard Regression Coverage) is NON-NEGOTIABLE. Test tasks precede implementation tasks within each phase (TDD).

**Organization**: Tasks grouped by user story (US1 P1, US2 P2, US3 P2, US4 P3). MVP = Phase 1 → Phase 2 → Phase 3 (US1). Each story is independently completable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]** — parallelizable: different files, no dependencies on incomplete tasks in the same phase.
- **[Story]** — maps to spec.md user story (US1 / US2 / US3 / US4).
- All paths are repository-root-relative.

## Path Conventions

Single-project zero-build layout:

- Calc helpers: `calc/*.js`
- Unit tests: `tests/unit/*.test.js`
- Fixtures: `tests/fixtures/*.js`
- Dashboard: `FIRE-Dashboard-Generic.html` (single file)
- Catalog: `FIRE-Dashboard Translation Catalog.md`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create empty helper module + test file so later phases can populate them in order.

- [ ] T001 [P] Create `calc/ssEarningsRecord.js` with the fenced contract header from `specs/012-ssa-earnings-pre-2020/contracts/ss-earnings-record.contract.md` (Inputs / Outputs / Consumers / Invariants / Purity comment) and empty `export` placeholders for `EARLIEST_ALLOWED_YEAR`, `isValidRow`, `sortedAscendingUnique`, `prependPriorYear`, `setEarliestYear`. No logic yet — all function bodies `throw new Error('not implemented')`.
- [ ] T002 [P] Create `tests/unit/ssEarningsRecord.test.js` with the top-of-file comment referencing `specs/012-ssa-earnings-pre-2020/contracts/ss-earnings-record.contract.md §Test coverage`, `import` line for `calc/ssEarningsRecord.js`, and `import test from 'node:test'; import assert from 'node:assert/strict';` — no test cases yet.
- [ ] T003 [P] Create `tests/fixtures/ss-earnings-1995-2025.js` with the `export` of a 31-year nominal earnings profile from 1995 to 2025 (modest starting wage rising roughly with inflation; leave the exact dollar ramp to the implementer but document it in a top-of-file comment). File starts with a comment header naming its consumer as `tests/unit/ssEarningsRecord.test.js §Integration cross-check`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core invariant-enforcing helpers that every user story's operation depends on.

**⚠️ CRITICAL**: No user-story work can begin until Phase 2 completes.

- [ ] T004 [P] Write RED tests in `tests/unit/ssEarningsRecord.test.js` for `isValidRow`: accepts a well-shaped row, rejects non-integer year, rejects negative earnings, rejects NaN/Infinity earnings, rejects missing fields, rejects non-integer credits. Run `node --test tests/unit/ssEarningsRecord.test.js` — tests MUST fail.
- [ ] T005 [P] Write RED tests in `tests/unit/ssEarningsRecord.test.js` for `sortedAscendingUnique`: sorts a shuffled small history ascending by year; deduplicates last-write-wins when duplicate years passed in; returns a new array (input array identity preserved). Run `node --test tests/unit/ssEarningsRecord.test.js` — tests MUST fail.
- [ ] T006 Implement `EARLIEST_ALLOWED_YEAR = 1960`, `isValidRow`, and `sortedAscendingUnique` in `calc/ssEarningsRecord.js` to make T004 + T005 GREEN. No mutation of inputs. Run `node --test tests/unit/ssEarningsRecord.test.js` — all Phase 2 tests pass.
- [ ] T007 Run the full existing suite: `node --test tests/`. Confirm the pre-existing 160+ tests still pass (no collateral damage from T006).

**Checkpoint**: Foundation ready. User-story phases (Phase 3+) may now begin, in parallel or in sequence.

---

## Phase 3: User Story 1 — Prepend a Pre-2020 Earnings Year (Priority: P1) 🎯 MVP

**Goal**: User can click a new `+ Add Prior Year` button to extend the SSA Earnings Record backward by one year per click, with correct default values, immutability, persistence, and floor enforcement.

**Independent Test**: Run steps 5–9 of `specs/012-ssa-earnings-pre-2020/quickstart.md` (User Story 1 — Prepend one prior year). Dashboard loaded cold; click `+ Add Prior Year`; observe new 2019 row with `earnings=0, credits=4`; enter `62000`, see SS projection update with no NaN. All four acceptance scenarios in spec.md US1 pass.

### Tests for User Story 1 (TDD — write FIRST, watch FAIL)

- [ ] T008 [P] [US1] Write RED test in `tests/unit/ssEarningsRecord.test.js`: `prependPriorYear` on default 2020–2025 record returns a new array of length 7 with `result[0] = {year: 2019, earnings: 0, credits: 4}` and `reason: null`. Run — fails.
- [ ] T009 [P] [US1] Write RED test in `tests/unit/ssEarningsRecord.test.js`: `prependPriorYear` on a record whose first row is `{year: 1960, ...}` returns the same array reference and `reason: 'floorReached'`. Run — fails.
- [ ] T010 [P] [US1] Write RED test in `tests/unit/ssEarningsRecord.test.js`: `prependPriorYear([], { currentYear: 2026 })` returns `{history: [{year: 2025, earnings: 0, credits: 4}], reason: null}`. Run — fails.
- [ ] T011 [P] [US1] Write RED test in `tests/unit/ssEarningsRecord.test.js`: immutability — call `prependPriorYear(original)` where `original = [{year:2020,...}]`; assert `original` still has length 1 and `original[0].year === 2020`; assert returned `history !== original`. Run — fails.

### Implementation for User Story 1

- [ ] T012 [US1] Implement `prependPriorYear(history, options?)` in `calc/ssEarningsRecord.js` per `contracts/ss-earnings-record.contract.md`. Use `sortedAscendingUnique` + `isValidRow` internally. Returns `{history, reason}`. Pure — no mutation of input. Re-run `node --test tests/unit/ssEarningsRecord.test.js` — T008–T011 pass.
- [ ] T013 [US1] Add three i18n keys to BOTH `TRANSLATIONS.en` AND `TRANSLATIONS.zh` dicts in `FIRE-Dashboard-Generic.html` per `contracts/ss-i18n.contract.md`: `ss.addPriorYear`, `ss.floorReached`, `ss.yearAccepted`. Keep alphabetical order within the `ss.*` block for reviewability.
- [ ] T014 [US1] Modify the SSA Earnings Record card in `FIRE-Dashboard-Generic.html` (around line 2835): replace the single `<button data-i18n="ss.addYear">+ Add Year</button>` with a 2-column grid wrapper holding `<button onclick="addSSPriorYear()" data-i18n="ss.addPriorYear">` + the existing `<button onclick="addSSYear()" data-i18n="ss.addYear">`. Preserve `.btn-secondary` styling and padding. Preserve the existing `width:100%` layout within the grid cell.
- [ ] T015 [US1] Add `<div id="ssEarningsStatus" role="status" aria-live="polite" style="font-size:0.75em;color:var(--text-dim);min-height:1.2em;margin-bottom:6px"></div>` to `FIRE-Dashboard-Generic.html` immediately after the button grid from T014. Also add the `setSSStatus(text, tone)` inline helper function per `contracts/ss-ui-controls.contract.md`, including the 5-second auto-clear via `setTimeout`.
- [ ] T016 [US1] Implement the `addSSPriorYear()` inline handler in `FIRE-Dashboard-Generic.html`'s `<script>` block (near the existing `addSSYear` function around line 3406). Import `prependPriorYear` dynamically from `./calc/ssEarningsRecord.js`. On `reason === 'floorReached'`, call `setSSStatus(t('ss.floorReached', 1960), 'warning')` and return without mutating state. On success, reassign `ssEarningsHistory`, call `buildSSEarningsTable()` + `recalcAll()` + `saveState()`, then `setSSStatus(t('ss.yearAccepted', history[0].year), 'dim')`.
- [ ] T017 [US1] Manual browser verification: open `FIRE-Dashboard-Generic.html`, click `+ Add Prior Year`, confirm the 2019 row appears with `earnings=0, credits=4`, confirm status line shows "Added 2019.", confirm DevTools console has zero errors. Also verify on EN → zh-TW → EN toggle the button and status line both re-render correctly. Record the result as a comment on this task.

**Checkpoint**: US1 shipped. MVP complete — users can now extend pre-2020 history one year at a time. Demoable and deployable.

---

## Phase 4: User Story 2 — Bulk "Earliest Year" Entry (Priority: P2)

**Goal**: User with 20+ years of pre-2020 history can set an "Earliest year" field and bulk-prepend every intervening year in one step.

**Independent Test**: Run step 12–14 of `quickstart.md` (User Story 2 — Bulk Earliest year). Starting from default record, enter `1995` into the Earliest-year input, click `Set`, confirm the record now contains 1995 through 2025, status line reads "Added 1995."

### Tests for User Story 2 (TDD)

- [ ] T018 [P] [US2] Write RED test in `tests/unit/ssEarningsRecord.test.js`: `setEarliestYear(defaultRecord, 2015)` returns an 11-row history with `result.history[0].year === 2015`, `result.history[4].year === 2019`, `result.history[5].year === 2020`, `reason: null`.
- [ ] T019 [P] [US2] Write RED test in `tests/unit/ssEarningsRecord.test.js`: `setEarliestYear(defaultRecord, 2025)` returns the same array reference with `reason: 'noopAlreadyCovered'`.
- [ ] T020 [P] [US2] Write RED test in `tests/unit/ssEarningsRecord.test.js`: `setEarliestYear(defaultRecord, 1950)` returns a new array whose first row has `year: 1960`, `reason: 'clampedToFloor'`, and length = 6 + (2019 − 1960 + 1) = 66.
- [ ] T021 [P] [US2] Write RED test in `tests/unit/ssEarningsRecord.test.js`: `setEarliestYear([], 1995, {currentYear: 2026})` returns a single-row history `[{year: 1995, earnings: 0, credits: 4}]` and `reason: null` (per contract §`setEarliestYear` empty-history note).

### Implementation for User Story 2

- [ ] T022 [US2] Implement `setEarliestYear(history, target, options?)` in `calc/ssEarningsRecord.js` per `contracts/ss-earnings-record.contract.md`. Handle the four branches: noopAlreadyCovered, clampedToFloor, empty-history, normal bulk-prepend. Use `sortedAscendingUnique` + `isValidRow`. Pure. Re-run `node --test tests/unit/ssEarningsRecord.test.js` — T018–T021 pass.
- [ ] T023 [US2] Add three i18n keys to BOTH `TRANSLATIONS.en` AND `TRANSLATIONS.zh` in `FIRE-Dashboard-Generic.html`: `ss.earliestYearLabel`, `ss.earliestYearSet`, `ss.earliestYearHint`. Follow the EN/zh-TW strings in `contracts/ss-i18n.contract.md`.
- [ ] T024 [US2] Add the "Earliest year" number input + "Set" button to the SSA Earnings Record card in `FIRE-Dashboard-Generic.html`, placed between the button grid (T014) and the status div (T015). DOM per `contracts/ss-ui-controls.contract.md`. Use `min="1960"`, `max` via JS-set to `new Date().getFullYear()` on boot.
- [ ] T025 [US2] Implement the `setEarliestYearFromInput()` inline handler in `FIRE-Dashboard-Generic.html`. Import `setEarliestYear` dynamically. Parse the input with `parseInt(el.value, 10)`; on `!Number.isInteger(raw)` call `setSSStatus(t('ss.duplicateYear', ...), 'warning')` — wait, this should be an invalid-year case; use the existing `ss.floorReached` or a dedicated message. Route `'noopAlreadyCovered'` → `ss.earliestYearHint`, `'clampedToFloor'` → `ss.floorReached`, success → `ss.yearAccepted`.
- [ ] T026 [US2] Manual browser verification: run quickstart.md step 12–14. Confirm 1995 through 2025 rows appear, confirm status line shows "Added 1995." in EN, confirm no NaN in SS projection, confirm DevTools console is clean.

**Checkpoint**: US2 shipped. Users with long pre-2020 histories can set them up in one interaction.

---

## Phase 5: User Story 3 — Prevent Invalid Entries and Data Loss (Priority: P2)

**Goal**: Dashboard rejects duplicate years, invalid inputs (non-integer, NaN, Infinity), and out-of-floor entries with clear user feedback; existing entered values are never overwritten by add-prior or bulk operations.

**Independent Test**: Run steps 15–22 of `quickstart.md` (User Story 3 — Guards + Invalid edit). Each guard case produces the expected inline status message and does NOT corrupt existing data. Running steps 23–24 confirms round-trip persistence preserves all entered values.

### Tests for User Story 3 (TDD)

- [ ] T027 [P] [US3] Write RED test in `tests/unit/ssEarningsRecord.test.js`: `setEarliestYear(default, NaN)` returns the same array reference with `reason: 'invalidTarget'`. Also for `target: 2015.5`, `target: 'abc'` (unwrapped, not pre-coerced), `target: Infinity`.
- [ ] T028 [P] [US3] Write RED test in `tests/unit/ssEarningsRecord.test.js`: invariant under mixed operations — start from default, call `prependPriorYear` 3×, then `setEarliestYear(history, 2005)`, then simulate `addSSYear`-style append. Assert final array is strictly ascending, no duplicate years, all rows pass `isValidRow`, and earnings entered by the user (simulated as `history[i].earnings = 62000` between operations) are preserved.
- [ ] T029 [P] [US3] Write RED test in `tests/unit/ssEarningsRecord.test.js`: feed a malformed row `{year: 2020, earnings: NaN, credits: 4}` to `isValidRow` — returns `false`. Feed the same to `sortedAscendingUnique` — that utility's behaviour on invalid input is documented (it MAY pass through or MAY throw; lock whichever you implement).

### Implementation for User Story 3

- [ ] T030 [US3] Harden `setEarliestYear` in `calc/ssEarningsRecord.js` to detect invalid targets (`!Number.isInteger(target) || target < 0`) and return `{history: sameRef, reason: 'invalidTarget'}` before touching anything else. Re-run the test file — T027 passes.
- [ ] T031 [US3] Add the `ss.duplicateYear` and (if not already covered) `ss.invalidYear` style messaging paths to `setEarliestYearFromInput()` in `FIRE-Dashboard-Generic.html`. Reuse `ss.floorReached` or `ss.duplicateYear` — no new i18n keys beyond the 7 declared in `contracts/ss-i18n.contract.md` unless spec changes.
- [ ] T032 [US3] Verify the existing `updateSSEarning(index, value)` inline handler in `FIRE-Dashboard-Generic.html` line 3402 still coerces invalid input to `0` via `parseFloat(value) || 0`. No code change needed — document the verification in this task's completion comment. Run `node --test tests/` — all tests remain green.
- [ ] T033 [US3] Manual browser verification: run quickstart.md steps 15–22. Confirm each guard case shows the expected inline message and does not corrupt state. Confirm entered values in 2019 / 2005 persist across a hard reload (quickstart steps 23–24).

**Checkpoint**: US3 shipped. Dashboard is safe against invalid input; existing data is never lost.

---

## Phase 6: User Story 4 — Forward-Looking Dashboard Parity (Priority: P3)

**Goal**: Implementation is structured so that if `FIRE-Dashboard.html` (RR) is reintroduced to the repo, this feature's behaviour can be ported to it with minimal additional code (just UI binding + i18n dict copy). The helpers already live in `calc/ssEarningsRecord.js`, which both files can import identically.

**Independent Test**: Grep the repo for direct calls to `prependPriorYear` or `setEarliestYear` — only `FIRE-Dashboard-Generic.html` and `tests/unit/ssEarningsRecord.test.js` should match. Confirm that a hypothetical reintroduction of `FIRE-Dashboard.html` could copy-paste the SS card's UI block from Generic and have everything work.

### Implementation for User Story 4

- [ ] T034 [P] [US4] Update `BACKLOG.md` entry U6 — change "target branch `011-ssa-earnings-pre-2020`" to `012-ssa-earnings-pre-2020`, add a one-line note that helpers live in `calc/ssEarningsRecord.js` so RR can reuse them when reintroduced, and change the status marker to "in-progress".
- [ ] T035 [US4] Verify no RR-specific code paths exist: run `grep -rn "FIRE-Dashboard.html" tests/ specs/012-ssa-earnings-pre-2020/` — expect only references in spec.md (FR-013), plan.md (N/A-vacuous note), and this tasks.md. No executable code path depends on the RR file's existence.

**Checkpoint**: US4 shipped. Parity is forward-compatible; no code blocks RR reintroduction.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation updates, catalog sync, roadmap update, integration cross-check, and full verification.

- [ ] T036 [P] Write the integration cross-check test in `tests/unit/ssEarningsRecord.test.js` (or a sibling `tests/unit/ssEarnings.integration.test.js` if the unit file grows too large): import `projectSS` from `calc/socialSecurity.js`, import the 1995–2025 fixture from `tests/fixtures/ss-earnings-1995-2025.js`, assert `projectSS(withFull31Years).annualBenefitReal > projectSS(truncatedTo2020_2025).annualBenefitReal`. Locks SC-002 direction.
- [ ] T037 [P] Update `FIRE-Dashboard Translation Catalog.md` per `contracts/ss-i18n.contract.md §Catalog entry` — append the feature-012 additions subsection under the existing "Social Security (`ss.*`) — Generic-new" section.
- [ ] T038 [P] Update `FIRE-Dashboard-Roadmap.md` — add feature 012 entry (title, link to `specs/012-ssa-earnings-pre-2020/`, one-sentence summary, ship status).
- [ ] T039 Run full test suite: `node --test tests/`. Confirm all pre-existing tests still pass PLUS the new `ssEarningsRecord.test.js` contributes ≥ 10 new passing cases (T004, T005, T008–T011, T018–T021, T027–T029, T036). Target: ≥ 170 passing tests total, 0 failures.
- [ ] T040 Run all 28 manual verification steps in `specs/012-ssa-earnings-pre-2020/quickstart.md` against `FIRE-Dashboard-Generic.html` in an evergreen browser. Record any check that fails as a comment on this task (block merge until fixed).
- [ ] T041 Constitution §Browser-smoke-before-done gate: open `FIRE-Dashboard-Generic.html` in a browser, wait 2 s, confirm every KPI card shows a numeric value (not "Calculating…", NaN, $0, `—`, or "40+"), confirm DevTools console has zero red errors and zero `[<shim>] canonical threw:` messages. Drag the FIRE marker; confirm same-frame update.
- [ ] T042 On successful completion of T039 + T040 + T041, update `BACKLOG.md` entry U6 one more time — mark as "closed (feature 012, merged YYYY-MM-DD)" with the merge commit hash when known.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Phase 1. **Blocks all user stories.**
- **US1 (Phase 3)**: depends on Phase 2. No dependencies on US2/US3/US4.
- **US2 (Phase 4)**: depends on Phase 2. Ideally runs after US1 so T013 (i18n dict entries) from US1 is already in place — but can technically run independently.
- **US3 (Phase 5)**: depends on Phase 2 + US1 + US2 (hardens helpers that both define). Cannot start before T012 and T022 complete.
- **US4 (Phase 6)**: depends on US1 + US2 completion for the "forward-looking parity" grep check to be meaningful.
- **Polish (Phase 7)**: depends on all user stories complete.

### Within Each User Story

- Tests (T004/T005 in Phase 2; T008–T011 in US1; T018–T021 in US2; T027–T029 in US3) MUST be written and FAIL before the corresponding implementation task.
- Helper implementation (T006, T012, T022) before UI wiring (T014–T016, T023–T025).
- i18n key additions (T013, T023) can run in parallel with helper implementation since they touch different regions of the HTML file — BUT the UI wiring (T014–T016) depends on both.
- Manual browser verification (T017, T026, T033) is the last task in each user story; blocks the phase checkpoint.

### Parallel Opportunities

- **Phase 1**: T001 + T002 + T003 fully parallel (three different new files).
- **Phase 2**: T004 + T005 parallel (same test file, but independent test blocks — run concurrently safe).
- **US1 TDD**: T008 + T009 + T010 + T011 all parallel (all in same test file, different test blocks).
- **US2 TDD**: T018 + T019 + T020 + T021 all parallel.
- **US3 TDD**: T027 + T028 + T029 all parallel.
- **Polish**: T036 + T037 + T038 all parallel (touch different files).

---

## Parallel Example: User Story 1 TDD

```bash
# Launch four RED tests for US1 concurrently (same test file, independent test() blocks):
Task A: "T008 [P] [US1] Write RED test: prependPriorYear default record → 2019 row at top"
Task B: "T009 [P] [US1] Write RED test: prependPriorYear at floor → reason 'floorReached'"
Task C: "T010 [P] [US1] Write RED test: prependPriorYear empty record → single row at currentYear-1"
Task D: "T011 [P] [US1] Write RED test: prependPriorYear immutability of input array"

# Run node --test tests/unit/ssEarningsRecord.test.js — all four should FAIL

# Then sequentially:
Task E: "T012 [US1] Implement prependPriorYear in calc/ssEarningsRecord.js" → all four tests GREEN
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup (T001–T003).
2. Phase 2: Foundational (T004–T007).
3. Phase 3: US1 (T008–T017).
4. **STOP and VALIDATE**: run quickstart.md steps 1–9; resolve any failures; confirm SC-001 + SC-003 + SC-004 hold for single-row prepend.
5. Ship as MVP → demo → merge.

### Incremental Delivery (recommended)

1. MVP as above.
2. Ship US2 (Phase 4) → users who want bulk entry get it. Demo steps 10–14.
3. Ship US3 (Phase 5) → guardrails harden. Demo steps 15–24.
4. Ship US4 (Phase 6) → documentation updates only; ~10 min to complete.
5. Phase 7 (Polish) → catalog + roadmap + final verification + close backlog entry U6.

### Parallel Team Strategy

With two developers:

- Dev A (Frontend Engineer): T013–T017 (US1 UI), T023–T026 (US2 UI), T031–T033 (US3 UI), T037–T038 (polish).
- Dev B (Backend Engineer): T001–T007 (setup + foundational), T008–T012 (US1 tests + helper), T018–T022 (US2 tests + helper), T027–T030 (US3 tests + hardening), T036 (integration), T039 (suite run).
- QA Engineer: T017 / T026 / T033 / T040 / T041 manual verification — runs after the corresponding dev task completes.

---

## Notes

- All task IDs are sequential (T001–T042).
- `[P]` = parallelizable within its phase (different file or different test block in the same file).
- `[US#]` = maps to spec.md user story.
- Tests precede implementation in every phase — constitution Principle IV is NON-NEGOTIABLE.
- Commit after each user-story completion (or more granularly — the git-commit hook will offer to commit between phases).
- Stop at any **Checkpoint** to validate the story in isolation before moving on.
- Avoid: adding new runtime dependencies (Principle V), touching `calc/socialSecurity.js` outside T036 (this is a data-entry feature, not a calc refactor), adding user-visible English-only strings (Principle VII).
