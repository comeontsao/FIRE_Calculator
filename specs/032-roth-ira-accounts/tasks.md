---

description: "Tasks for feature 032 — Roth IRA Accounts (Roger & Rebecca)"
---

# Tasks: Roth IRA Accounts (Roger & Rebecca)

**Input**: Design documents from `specs/032-roth-ira-accounts/`
**Prerequisites**: [`plan.md`](./plan.md), [`spec.md`](./spec.md), [`research.md`](./research.md), [`data-model.md`](./data-model.md), [`contracts/roth-ira-pool.contract.md`](./contracts/roth-ira-pool.contract.md), [`audit.md`](./audit.md), [`quickstart.md`](./quickstart.md)

**Tests**: TDD is enforced per Constitution Principle IV (Gold-Standard Regression Coverage NON-NEGOTIABLE). Every implementation task is preceded by failing-test tasks that lock the contract before code lands.

**Organization**: Tasks are grouped by user story. Stories P1 (US1/US2/US3) form the MVP; P2 (US4/US4b/US5) and P3 (US6) layer on top.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US6)
- Includes exact file paths

## Path Conventions

This project is a single-file dashboard (zero-build) with extractable `calc/*.js` modules and a `tests/` directory at repo root. No new top-level directories.

- UI / inline scripts: `FIRE-Dashboard.html` (RR — primary), `FIRE-Dashboard-Generic.html` (Generic — calc-layer lockstep only)
- Calc modules: `calc/*.js`
- Tests: `tests/unit/*.test.js`, `tests/e2e/*.spec.ts`, `tests/fixtures/*.js`
- i18n: `FIRE-Dashboard Translation Catalog.md`
- Snapshot: `FIRE-snapshots.csv`

---

## Phase 1: Setup

**Purpose**: Prepare working state. No new top-level structure needed (zero-build single-file project).

- [ ] T001 Verify clean working tree on branch `032-roth-ira-accounts` and confirm `npm test` is green on baseline 622/622 unit tests + 6/6 E2E

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Calc-layer foundation that EVERY user story depends on. The `rothIraReal` rename and new `rothIra` pool key are introduced here so subsequent stories can build on them. **Lockstep at calc layer**: every file edited in this phase that has an inline-script duplicate in `FIRE-Dashboard-Generic.html` MUST land identically there (Constitution Principle I).

**⚠️ CRITICAL**: No user story work can begin until this phase completes and all foundational tests stay green.

### Tests for foundational layer (TDD — write tests FIRST, expect FAIL until implementation lands)

- [ ] T002 [P] Add failing test asserting `POOL_KEYS` contains `'rothIra'` at index 3 (immediately after `'roth'`) in `tests/unit/withdrawal.test.js`
- [ ] T003 [P] Add failing test asserting every entry in `STRATEGY_ORDERS` contains `'rothIra'` immediately after `'roth'` in `tests/unit/withdrawal.test.js`
- [ ] T004 [P] Add failing test asserting canonical-input shape exposes both `roth401kReal` AND `rothIraReal` as distinct fields (default 0 each) in `tests/unit/getCanonicalInputs.test.js` (create file if absent)

### Implementation for foundational layer

- [ ] T005 Rename canonical field `rothIraReal` → `roth401kReal` across `calc/withdrawal.js`, `calc/lifecycle.js`, `calc/getCanonicalInputs.js`, and all 8 fixture files (`tests/fixtures/accumulation-only.js`, `coast-fire.js`, `generic-realistic.js`, `infeasible.js`, `mode-switch-matrix.js`, `real-nominal-check.js`, `three-phase-retirement.js`, `types.js`) per research.md Q1. Update `tests/unit/withdrawal.test.js` + `tests/unit/lifecycle.test.js` references in the same commit. **⚠️ T005 + T006 + T007 MUST land as a single atomic commit** — between them the codebase has no `rothIraReal` field at all; splitting into separate commits leaves intermediate broken state with failing tests.
- [ ] T006 Introduce new canonical field `rothIraReal` (now representing actual Roth IRA pool) in `calc/getCanonicalInputs.js`, sourced from `inp.rogerRothIra + inp.rebeccaRothIra` (RR) or `inp.person1RothIra + inp.person2RothIra` (Generic; default 0). **Lands in the same atomic commit as T005 + T007.**
- [ ] T007 Add `'rothIra'` to `POOL_KEYS` immediately after `'roth'` in `calc/withdrawal.js:76`. Extend `STRATEGY_ORDERS` entries (lines 79–84) so each strategy gains `'rothIra'` immediately after `'roth'`. **Read `calc/withdrawal.js:118` first** to confirm whether the existing pre-unlock `accessible` set already excludes `'roth'`; add `'rothIra'` to whichever set `'roth'` appears in (preserving FR-019 fully-locked semantics). Extend the `remaining` pool dict (line 195) and the `drawn` accumulator (line 198). Verify RMD branch (line 204) is unchanged (still `trad`-only — FR-021d). **Lands in the same atomic commit as T005 + T006.**
- [ ] T008 Verify foundational tests T002/T003/T004 now PASS. Re-run full unit suite; baseline 622 tests must still pass, plus the 3 new ones (625 total). NO user story tasks may start until this is green.

**Checkpoint**: Calc-layer foundation laid; all stories may now begin in parallel.

---

## Phase 3: User Story 1 — Roth IRA balances reflected in Net Worth (Priority: P1) 🎯 MVP

**Goal**: User can enter Roger's and Rebecca's Roth IRA balances on the Assets tab and see the header Whole Portfolio Net Worth + Locked sub-label increase by exactly that sum.

**Independent Test**: Enter $50K Roger + $50K Rebecca; header net worth increases by exactly $100K and Locked sub-label increases by exactly $100K within one second. localStorage persists values across reload.

### Tests for User Story 1 (TDD — write FIRST, expect FAIL)

- [ ] T009 [P] [US1] Failing unit test: `getCanonicalInputs()` populates `rothIraReal = rogerRothIra + rebeccaRothIra` from DOM stubs returning $0/$59021 (default RR values) in `tests/unit/getCanonicalInputs.test.js`
- [ ] T010 [P] [US1] Failing unit test: `calcAccessible(inp)` MUST NOT include `rogerRothIra`/`rebeccaRothIra` (locked pool per FR-019/FR-006) in `tests/unit/portfolioAggregation.test.js` (create file)

### Implementation for User Story 1

- [ ] T011 [US1] Add new "🔒 Roth IRA" card in Plan→Assets tab of `FIRE-Dashboard.html`, positioned immediately right of (or below on narrow viewports) the existing "🔒 Locked until 59.5 (401K)" card. Card contains two `<input type="number">` fields: `id="rogerRothIra"` (default `0`, i18n label `assets.rogerRothIra`) and `id="rebeccaRothIra"` (default `59021`, i18n label `assets.rebeccaRothIra`). Mirror existing 401K-card styling. RR-ONLY — do NOT modify `FIRE-Dashboard-Generic.html`.
- [ ] T012 [US1] Extend `getCanonicalInputs()` in `FIRE-Dashboard.html:7896` and the calc adapter `calc/getCanonicalInputs.js:179` to read `rogerRothIra` + `rebeccaRothIra` DOM values, sum into canonical `rothIraReal` field. Generic dashboard's adapter receives `0 + 0 = 0` (no UI inputs exist there). 
- [ ] T013 [US1] Wire localStorage save+load for both new keys (`fire-dashboard.rogerRothIra`, `fire-dashboard.rebeccaRothIra`) in `FIRE-Dashboard.html`, matching the existing 401K input pattern. Defaults populated on first load.
- [ ] T014 [US1] Verify `calcAccessible(inp)` in `FIRE-Dashboard.html:7980` correctly EXCLUDES the new balances (locked semantics). Update header KPI render path so the "Locked" sub-label includes both `rogerRothIra` + `rebeccaRothIra`. T010 must pass.
- [ ] T015 [US1] Add i18n keys `assets.rogerRothIra`, `assets.rebeccaRothIra`, `assets.rothIraGroup` to both `TRANSLATIONS.en` and `TRANSLATIONS.zh` blocks in `FIRE-Dashboard.html` (EN + zh-TW pairs per Principle VII; "🔒 Roth IRA" header label exempted by emoji+acronym rule). Update `FIRE-Dashboard Translation Catalog.md` with the new rows.

**Checkpoint**: US1 fully functional — user sees Roth IRA balances in the Assets tab and the header total reflects them. localStorage persists. Language toggle works.

---

## Phase 4: User Story 2 — Lifecycle chart includes Roth IRA pool (Priority: P1)

**Goal**: With non-zero Roth IRA balances, the Lifecycle chart shows a dedicated stacked-area series for Roth IRA, with its own color and legend entry, growing/shrinking consistent with the active strategy.

**Independent Test**: Set Roger Roth IRA = $100K, observe a visible new stacked area in the Lifecycle chart with a "Roth IRA" legend entry (lighter purple). Series grows during accumulation, depletes (or not) per active strategy in retirement.

### Tests for User Story 2 (TDD)

- [ ] T016 [P] [US2] Failing unit test: `projectFullLifecycle` output rows expose `pRothIra` (real-$) and `pRothIraBookValue` (nominal-$) fields, non-zero when input `rothIraReal > 0` — in `tests/unit/lifecycle.test.js`
- [ ] T017 [P] [US2] Failing unit test: per Contract Invariant I4, `pRothIra` grows by `(1 + return401k)` + `rothIraContrib_thisYear` each accumulation year, in `tests/unit/accumulateToFire.test.js`

### Implementation for User Story 2

- [ ] T018 [US2] Extend `calc/accumulateToFire.js`: seed `pRothIra` from `inp.rothIraReal`; grow yearly by `(1 + realReturn401k)` and add `rothIraContrib` (read from new canonical field — see US4b T028). Add to module fenced-header `Inputs:` / `Outputs:` / `Consumers:` lists per Principle II.
- [ ] T019 [US2] Add `pRothIra` and `pRothIraBookValue` to each projection row in the `projectFullLifecycle` row builder of `FIRE-Dashboard.html` (around lines 10027–10089 per audit #36). Apply `toBV(pRothIra, age)` conversion alongside existing `pRothBookValue` pattern.
- [ ] T020 [US2] Add new Lifecycle chart dataset for `pRothIra` in `FIRE-Dashboard.html:8570` (parallel to existing `pRoth` dataset). Wire color via `--chart-rothIra` CSS variable (default `#a890ff`); add `case 'rothIra'` arm to the color-mapping switch at line 4409. Update chart legend keys array (line 16490) to include `'pRothIra'` immediately after `'pRoth'`.
- [ ] T021 [US2] Update chart-render-function comment to declare new pool consumer (Principle VI). Add Lifecycle chart back-reference in `calc/withdrawal.js` and `calc/accumulateToFire.js` fenced-header `Consumers:` lists.

**Checkpoint**: US2 complete — Lifecycle chart visually surfaces the new pool with distinct color.

---

## Phase 5: User Story 3 — FIRE feasibility verdict includes Roth IRA (Priority: P1)

**Goal**: The FIRE verdict (Safe / Exact / DWZ) updates to reflect Roth IRA balances. Critical FR-021e: the `effBal()` formula must sum `pRothIra` or the verdict drifts from the chart (feature-031-class regression).

**Independent Test**: Two sessions with identical inputs except Roger Roth IRA = $0 vs $200,000 — the $200K session must show a meaningfully earlier FIRE age in all three modes, and the verdict must remain consistent with the chart's depicted balance trajectory at every drag position.

### Tests for User Story 3 (TDD)

- [ ] T022 [P] [US3] Failing unit test: per Contract Invariant I7, `effBal()` includes `pRothIra` term — verified by simulating two scenarios with identical inputs except `pRothIra=0` vs `pRothIra=200000`; FIRE-age difference must be > 0 — in `tests/unit/verdictStrategyParity.test.js`
- [ ] T023 [P] [US3] Failing unit test: signed-sim fallback (`simulateRetirementOnlySigned`) accepts a `p401kRothIra0` parameter and includes it in the end-balance — in `tests/unit/verdictStrategyParity.test.js`

### Implementation for User Story 3

- [ ] T024 [US3] **CRITICAL FR-021e edit**: Extend `effBal()` at `FIRE-Dashboard.html:9141` to sum `pRothIra`: `const effBal = () => pTrad * (1 - taxTrad) + pRoth + pRothIra + pStocks + pCash;`. Apply identical change in `FIRE-Dashboard-Generic.html` (Generic UI doesn't change but the calc inline code stays lockstep per Principle I).
- [ ] T025 [US3] Extend `simulateRetirementOnlySigned(...)` signature in `FIRE-Dashboard.html:9805–9860` (and Generic mirror) to accept `p401kRothIra0` parameter; thread it through to `pRothIra` accumulator within the function body. Update every caller of this function to pass the new arg sourced from `inp.rothIraReal`.
- [ ] T026 [US3] Extend accumulation pool growth (lines 9264–9265, 10790–10791, 12629–12630) to update `pRothIra` alongside `pRoth` in EVERY copy of the accumulation loop. Apply identical edits in `FIRE-Dashboard-Generic.html`.

**Checkpoint**: US3 complete — verdict gates evaluate the Roth IRA pool in all three modes. Drag-FIRE-marker parity preserved automatically since the lifecycle row already carries the pool (US2).

---

## Phase 6: User Story 4 — Withdrawal strategy ordering + tooltip include Roth IRA (Priority: P2)

**Goal**: Every withdrawal strategy draws from `rothIra` immediately after `roth`. The Withdrawal Strategy tooltip surfaces a dedicated `rothIra` line. RMD branch remains `trad`-only.

**Independent Test**: With non-zero Roth IRA, hover the withdrawal-strategy tooltip in a retirement year. A `rothIra` line appears with non-zero draws in years the active strategy schedules them. Roth-ladder strategy draws Roth IRA in early retirement; trad-first delays Roth IRA draws until other pools exhaust. At any RMD age (≥73), `rothIra` is NEVER drawn by the RMD branch.

### Tests for User Story 4 (TDD)

- [ ] T027 [P] [US4] Failing unit test: per Contract Invariants I2 + I3, `rothIra` is inaccessible pre-59.5 (wRothIra=0); RMD branch never draws from `rothIra` at any age; tax-free behavior matches `roth` — in `tests/unit/withdrawal.test.js`
- [ ] T028 [P] [US4] Failing unit test: withdrawal-tooltip-frame includes `rothIra` line when `wRothIra > 0` — in `tests/unit/withdrawalTooltipFrame.test.js`
- [ ] T029 [P] [US4] Failing strategy-matrix row: new starvation-locus fixture with `pTrad=$325k, pRoth=0, pRothIra=$50k, pStocks=0, pCash=0, ssIncome=0, age=65, grossSpend=$60100`; strategy MUST close the shortfall to < $100 by draining `rothIra` first then falling through to `trad` — in `tests/unit/strategyMatrix.test.js`

### Implementation for User Story 4

- [ ] T030 [US4] Update `calc/withdrawal.js` `drawFromPools` accumulator and `remaining` dict to carry `rothIra` alongside `roth` (audit #8 / #9). Map `rothIra: pools.rothIraReal` (the NEW field; not `roth401kReal`). **Also update the module's fenced-comment header**: add `rothIraReal` to `Inputs:` list, `wRothIra` to `Outputs:` list, and add the Lifecycle chart + Withdrawal Strategy tooltip to `Consumers:` list (Principle II).
- [ ] T031 [US4] Update inline strategy simulator in `FIRE-Dashboard.html:11471–11473` (and identical block in `FIRE-Dashboard-Generic.html`): add `if (p === 'rothIra' && canAccess401k && avail.pRothIra > 0) { ... }` branch parallel to existing `roth` branch. Track via new `wRothIra` accumulator.
- [ ] T032 [US4] Extend `calc/withdrawalTooltipFrame.js:91` to include `rothIra: _finiteOr(r.wRothIraBookValue, r.wRothIra),` in the pool-line output. **Update the module's fenced-comment header** to declare the new pool in `Inputs:`/`Outputs:` (Principle II). Extend the in-HTML withdrawal-tooltip afterBody handler at `FIRE-Dashboard.html:14663–14669` to consume the new field and render a "Roth IRA" pool line. Add tooltip i18n keys `tooltip.withdraw.rothIraLabel` (EN: "Roth IRA" / zh-TW: "Roth IRA (個人退休帳戶)") to BOTH `TRANSLATIONS.en` and `TRANSLATIONS.zh` dicts in `FIRE-Dashboard.html`, AND update `FIRE-Dashboard Translation Catalog.md` with the new row (Principle VII).
- [ ] T033 [US4] Convert each per-year withdrawal row in `FIRE-Dashboard.html:12880` to compute `row.pRothIraBookValue = toBV(row.pRothIra, row.age);` alongside `row.pRothBookValue`. Generic mirror.

**Checkpoint**: US4 complete — every strategy draws Roth IRA correctly, tooltip shows the new line, RMD exemption verified.

---

## Phase 7: User Story 4b — Roth IRA contribution inputs grow balance during accumulation (Priority: P2)

**Goal**: Two new annual-contribution number-input fields on the Investment tab (Roger + Rebecca, default $7,000 each, fully adjustable). Accumulation engine grows the Roth IRA balance by each year's contribution until FIRE age.

**Independent Test**: Set Roger Roth IRA balance = $0 and contribution = $7,000/year; observe accumulation to a FIRE age 10 years out; Roth IRA balance at FIRE age ≈ $7,000 × 10 plus investment growth (not $0).

### Tests for User Story 4b (TDD)

- [ ] T034 [P] [US4b] Failing unit test: `accumulateToFire` reads `rothIraContribReal` from canonical inputs and adds it to `pRothIra` each accumulation year. Test with starting balance 0, contribution $7000/yr, return 7%, 10 years → expected ≈ $96,715. In `tests/unit/accumulateToFire.test.js`

### Implementation for User Story 4b

- [ ] T035 [US4b] Add new "Roth IRA Contributions (annual)" section in Plan→Investment tab of `FIRE-Dashboard.html`, positioned directly below the existing 401K Roth Contribution slider (around line 3153). Contains two `<input type="number">` fields with NO hard `max` attribute: `id="rogerRothIraContrib"` and `id="rebeccaRothIraContrib"`, default `7000` each. Helper tooltips show "2026 IRS limit: $7,000 base / $8,000 catch-up (age 50+)." RR-ONLY.
- [ ] T036 [US4b] Wire localStorage save+load for both contribution keys (`fire-dashboard.rogerRothIraContrib`, `fire-dashboard.rebeccaRothIraContrib`) parallel to existing 401K contribution persistence.
- [ ] T037 [US4b] Extend `getCanonicalInputs()` in `FIRE-Dashboard.html` and `calc/getCanonicalInputs.js` to expose `rothIraContribReal = rogerRothIraContrib + rebeccaRothIraContrib` (RR); Generic returns 0.
- [ ] T038 [US4b] Add `rothIraContrib` term to the accumulation loop in `calc/accumulateToFire.js` and the four inline copies in `FIRE-Dashboard.html` (lines 8986, 9265, 10791, 12630 — verify exact set in implementation). Apply Generic mirror.
- [ ] T039 [US4b] Add i18n keys `invest.rothIraSection`, `invest.rogerRothIraContrib`, `invest.rebeccaRothIraContrib`, `invest.rothIraLimitTooltip2026` to EN + zh-TW translation dicts. Update Translation Catalog.

**Checkpoint**: US4b complete — contributions visible on Investment tab; accumulation engine grows balance correctly.

---

## Phase 8: User Story 5 — Snapshot CSV captures Roth IRA balances (Priority: P2)

**Goal**: Saving a snapshot appends both Roth IRA balance values to `FIRE-snapshots.csv`. Legacy snapshot rows (lacking the new columns) load without error. History tab table surfaces the new columns.

**Independent Test**: Save snapshot with non-zero Roth IRA values; reopen dashboard and verify history-tab row shows the values. Load a pre-feature CSV row; new columns default to 0; no parse error; no row dropped.

### Tests for User Story 5 (TDD)

- [ ] T040 [P] [US5] Failing unit test: CSV save round-trip — given Roth IRA values $25k/$60k, save snapshot row, reload CSV string, parse, assert restored values match. In `tests/unit/snapshotCsv.test.js` (create file)
- [ ] T041 [P] [US5] Failing unit test: legacy short-row tolerance — given a CSV row written before this feature (shorter column count), loader returns row with new Roth IRA fields defaulted to 0; loader does NOT throw or skip. In `tests/unit/snapshotCsv.test.js`

### Implementation for User Story 5

- [ ] T042 [US5] Append `'rogerRothIra'` and `'rebeccaRothIra'` to the END of the `SNAPSHOT_COLS` array in `FIRE-Dashboard.html:17583` (never mid-row per DB Engineer constitution). Generic mirror — even though Generic has no UI inputs, the SNAPSHOT_COLS lockstep is preserved.
- [ ] T043 [US5] Update CSV save-row builder to include `inp.rogerRothIra` and `inp.rebeccaRothIra`. Update CSV parse-row in `FIRE-Dashboard.html:18043–18044` (and surrounding loader) to detect short rows (rows with fewer fields than current SNAPSHOT_COLS length) and default missing trailing values to 0.
- [ ] T044 [US5] Extend History tab table render (around `FIRE-Dashboard.html:16383`) to add two new columns reading `d.rogerRothIra` and `d.rebeccaRothIra`. Add i18n keys `snap.rogerRothIra`, `snap.rebeccaRothIra` in EN + zh-TW.

**Checkpoint**: US5 complete — CSV schema bumped append-only; history table surfaces new columns; legacy rows still load.

---

## Phase 9: User Story 6 — Audit + copy-debug expose Roth IRA pool (Priority: P3)

**Goal**: Copy-debug snapshot includes Roth IRA values in both currency frames. Audit composition includes `lockedRothIra`. All audit invariants (A through F) continue passing with non-zero Roth IRA balances.

**Independent Test**: Set non-zero Roth IRA balances; trigger copy-debug → JSON contains `pRothIra` in both frames. Open Audit tab → composition shows `lockedRothIra`; all invariants green.

### Tests for User Story 6 (TDD)

- [ ] T045 [P] [US6] Failing unit test: audit composition output includes `lockedRothIra` field when `raw.pRothIra > 0`. In `tests/unit/calcAudit.test.js`
- [ ] T046 [P] [US6] Failing unit test: all 6 existing invariants (_invariantA through _invariantF) pass with non-zero Roth IRA persona. Extend `tests/unit/validation-audit/personas.js` with `rogerRothIra` field on every persona (default 0; add one new persona with non-zero values). In `tests/unit/calcAudit.test.js` parameterized suite.

### Implementation for User Story 6

- [ ] T047 [US6] Extend `calc/calcAudit.js:179` composition snapshot to include `lockedRothIra: _round(raw.pRothIra || 0),`. **Update the module's fenced-comment header** to declare `pRothIra` in `Inputs:` and `lockedRothIra` in `Outputs:` (Principle II). Update the audit harness's `boundFactory(persona)` to serve `rogerRothIra`/`rebeccaRothIra`/`rogerRothIraContrib`/`rebeccaRothIraContrib` per-persona (NOT in the static `DOC_STUB` — feature-020 lesson, see Process Lessons in CLAUDE.md).
- [ ] T048 [US6] Add `rogerRothIra: 0` and `rebeccaRothIra: 0` (plus contribution fields) to every persona in `tests/unit/validation-audit/personas.js`. Add ONE new persona with non-zero values to exercise the invariant suite against the new pool.
- [ ] T049 [US6] Extend copy-debug snapshot output (around `FIRE-Dashboard.html:13330`) to include `pRothIra` in both real-$ and book-value frames. Generic mirror.

**Checkpoint**: US6 complete — all audit invariants stay green; debug surface exposes the new pool.

---

## Phase 10: Polish & Cross-Cutting

**Purpose**: Final integration, language-toggle verification, end-to-end test, browser-smoke merge gate.

- [ ] T050 [P] Add new Playwright E2E test `tests/e2e/rothIra-flow.spec.ts`: cold-load RR dashboard with defaults, change Roger Roth IRA to $25K, verify header total + Lifecycle chart update; drag FIRE marker and assert verdict/chart/tooltip stay in sync (Feature 031 contract); switch language EN↔zh-TW and verify labels update without losing values.
- [ ] T051 [P] Add new top-level integration test `tests/unit/rothIraIntegration.test.js` exercising the full RR flow with `rogerRothIra=0/$7K_contrib, rebeccaRothIra=$59021/$7K_contrib` — running accumulation + retirement + audit, asserting end-balance trajectory matches a known good fixture.
- [ ] T051a [P] Constitution review-gate 7 regression: extend `tests/unit/modeObjectiveOrthogonality.test.js` with a fixture variant that includes non-zero `rogerRothIra` + `rebeccaRothIra` and confirm the resolved sort-key (per the 6-row Mode×Objective table in Principle IX) remains identical to the zero-rothIra baseline. The new pool MUST flow through `getActiveSortKey` orthogonally; this test catches any accidental coupling.
- [ ] T052 Run full unit test suite — expect 625+ tests passing (baseline 622 + 3 foundational + per-story new tests). Document final count. Run full Playwright suite — expect 6+ tests passing.
- [ ] T053 Audit grep sweep: per Constitution Principle I enforcement gate, verify every change in `calc/*.js` is bytes-identical between `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` inline scripts (excluding the UI-only differences enumerated in spec FR-018). Document the diff per the constitution's enforcement rule.
- [ ] T054 Update `FIRE-Dashboard-Roadmap.md` with feature 032 entry under the completed-features section, summarizing scope and locked decisions.
- [ ] T055 **MERGE GATE — Manager-executed**: Run the full browser-smoke checklist in `quickstart.md` against `FIRE-Dashboard.html` AND `FIRE-Dashboard-Generic.html` (regression check). Document pass/fail per surface in the table at the end of quickstart.md. Required before merge to `main`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — single verification task.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS every user story. The `rothIraReal` rename + new POOL_KEYS entry must land before any story-level work touches them.
- **User Stories 1–3 (Phases 3–5, all P1)**: Depend on Foundational. Can proceed in parallel after T008 passes.
- **User Stories 4 / 4b / 5 (Phases 6–8, all P2)**: Depend on Foundational + at least US1 (so UI inputs exist).
- **User Story 6 (Phase 9, P3)**: Depends on Foundational + US1/US2/US3 (so audit has real data to compose). May start as soon as those checkpoints are green.
- **Polish (Phase 10)**: All previous phases complete. T055 (browser smoke) is the final merge gate.

### User Story Dependencies

- **US1 (P1) — Net Worth header**: Foundational only. Independently testable.
- **US2 (P1) — Lifecycle chart series**: Foundational + US1 inputs (so chart has non-zero data to plot).
- **US3 (P1) — FIRE verdict effBal**: Foundational + US2 lifecycle rows (effBal reads from rows).
- **US4 (P2) — Withdrawal strategies**: Foundational + US3 (verdict drives strategy ranker).
- **US4b (P2) — Contribution inputs**: Foundational + US1 (Assets tab pattern established). Can run parallel to US4.
- **US5 (P2) — CSV snapshot**: Foundational + US1 inputs (so balances exist to save).
- **US6 (P3) — Audit + debug**: Foundational + US1 + US2 + US3. Last because audit composition reads from everything.

### Within Each User Story

- Tests (TDD-required per Constitution IV) MUST be written and FAIL before implementation tasks.
- Calc-module changes ship in the same commit as their test (Constitution IV).
- Lockstep at calc layer: every inline-script edit in `FIRE-Dashboard.html` that has a duplicate in `FIRE-Dashboard-Generic.html` MUST land identically there in the same commit (Principle I).
- i18n keys MUST ship in EN + zh-TW pairs (Principle VII).

### Parallel Opportunities

- **Within Phase 2**: T002, T003, T004 can run in parallel (different test files); T005 (rename) is sequential.
- **Within Phase 3 (US1)**: T009 and T010 parallel (different test files); T011–T015 sequential per dependency chain.
- **Across stories (after Phase 2)**: US1 and (US4b once US1 lays the input-section pattern) can run in parallel.
- **Tests within a story**: any [P]-marked test task at the start of a story can run in parallel.

---

## Parallel Example: Foundational Phase

```bash
# Three tests can be written in parallel before T005 begins:
Task: "Failing test asserting POOL_KEYS contains rothIra after roth (T002)"
Task: "Failing test asserting STRATEGY_ORDERS extension (T003)"
Task: "Failing test asserting canonical-input shape (T004)"
```

## Parallel Example: User Story 1

```bash
# Two tests for US1 can be written in parallel:
Task: "Failing test for getCanonicalInputs Roth IRA sum (T009)"
Task: "Failing test for calcAccessible exclusion (T010)"

# Then implementation tasks T011 → T015 proceed in sequence
```

## Parallel Example: Cross-Story (after Foundational completes)

```bash
# US1 and US4b can begin in parallel after T008 green:
Developer A: T009 → T011 → T012 → T013 → T014 → T015  (US1)
Developer B: T034 → T035 → T036 → T037 → T038 → T039  (US4b)

# But US2 cannot start until US1's T012 lands (it depends on getCanonicalInputs reading the new inputs).
```

---

## Implementation Strategy

### MVP First (US1 + US2 + US3 = all P1)

1. Phase 1: Setup (T001 — quick baseline confirm)
2. Phase 2: Foundational (T002–T008 — the rename + new pool key)
3. Phase 3: US1 (T009–T015 — Assets-tab inputs + header)
4. Phase 4: US2 (T016–T021 — Lifecycle chart series)
5. Phase 5: US3 (T022–T026 — verdict effBal extension — **CRITICAL FR-021e**)
6. **STOP and VALIDATE**: Test all three P1 stories. The user can see balances, see them in the chart, and see the verdict update — this IS the MVP.

### Incremental Delivery

- After MVP green: add US4 (T027–T033 — withdrawal strategy ordering).
- Then US4b (T034–T039 — contribution inputs).
- Then US5 (T040–T044 — CSV snapshot).
- Then US6 (T045–T049 — audit + debug).
- Then Polish (T050–T055), ending with the browser-smoke merge gate.

### Parallel Team Strategy

Per CLAUDE.md Team Structure: Manager orchestrates, dispatches to Engineers.

- **Backend Engineer** owns: calc/*.js changes (T005, T006, T007, T018, T030, T032, T047), inline calc-script edits in HTML (T024–T026, T031, T038), test scaffolds.
- **Frontend Engineer** owns: new HTML inputs + sections (T011, T015, T035, T039), Lifecycle chart dataset + color theming (T020, T021), History table render (T044), copy-debug surface (T049), withdrawal-tooltip render (T032).
- **DB Engineer** owns: SNAPSHOT_COLS append (T042), CSV parse loader short-row tolerance (T043), Translation Catalog updates accompanying every i18n landing.
- **QA Engineer** owns: every test task (T002–T004, T009–T010, T016–T017, T022–T023, T027–T029, T034, T040–T041, T045–T046, T050–T051), running suites, browser smoke T055.

Once Phase 2 closes, the four engineers can work in parallel within their lanes. The Manager verifies lockstep at every Engineer-handoff (Principle I gate).

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks.
- [US#] label maps task to specific user story for traceability and incremental MVP delivery.
- Each user story is independently completable and testable — but later stories depend on earlier ones per the dependency chain above (intentional, since Roth IRA data has to enter the system in US1 before US2 can plot it).
- Verify tests FAIL before implementing (Constitution IV TDD requirement).
- Commit after each task or logical group; constitution Principle IV requires same-commit fixture/test updates.
- Lockstep at calc layer: every inline-calc edit in RR must also land in Generic, byte-identical (Principle I).
- i18n: every new EN string lands with paired zh-TW string in the same commit (Principle VII).
- T024 (effBal extension) is the single most critical edit — missing it silently de-syncs FIRE verdict from the chart (feature-031-class regression).
- Stop at any Checkpoint to validate the story independently before moving on.
