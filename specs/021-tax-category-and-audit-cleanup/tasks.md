---

description: "Tasks: Tax Expense Category + Audit-Harness Carry-Forward (Feature 021)"
---

# Tasks: Tax Expense Category + Audit-Harness Carry-Forward

**Input**: Design documents from `/specs/021-tax-category-and-audit-cleanup/`
**Prerequisites**: plan.md (✅), spec.md (✅), research.md (✅), data-model.md (✅), contracts/ (✅), quickstart.md (✅)

**Tests**: Test tasks ARE included — Constitution Principle IV (Gold-Standard Regression Coverage) requires fixture cases for every calc change. The new audit invariant family `tax-bracket-conservation` (TBC-1 through TBC-5) is itself a deliverable per spec FR-016b.

**Organization**: Tasks are grouped by user story per spec priorities. **Critical reordering**: User Story 3 (Progressive Bracket Refactor, P1) is implemented first because User Story 1 (the MVP UI) reads `(federalTax + ficaTax) / 12` directly from the calc engine (FR-016) and requires US3's outputs. Within tasks.md, US3 is the foundational P1 calc work; US1 is the P1 MVP UI consumer.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story this task belongs to (US1, US2, US3, US4, US5, US6, US7)
- File paths are absolute or repo-relative

## Path Conventions

- HTMLs: `FIRE-Dashboard.html` (RR), `FIRE-Dashboard-Generic.html` (Generic)
- Calc modules: `calc/*.js`
- Tests: `tests/unit/`, `tests/unit/validation-audit/`
- Spec artifacts: `specs/021-tax-category-and-audit-cleanup/`
- i18n: `FIRE-Dashboard Translation Catalog.md`
- CI: `.github/workflows/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify environment + confirm clean baseline before any user story work begins.

- [ ] T001 Verify branch `021-tax-category-and-audit-cleanup` is checked out and clean (`git status` shows no uncommitted changes), all 413 existing tests pass (`node --test tests/unit/*.test.js tests/unit/validation-audit/*.test.js tests/meta/*.test.js`), and `node --version` is ≥ 20.
- [ ] T002 [P] Verify CLAUDE.md SPECKIT block already references feature 021 (set by `/speckit-plan`). No-op if correct; flip to point at this feature if drifted.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Ship the new pure-data module `calc/taxBrackets.js` that all other phases consume. Gates US3, which gates US1.

**⚠️ CRITICAL**: No user story work can begin until this phase completes. T003–T009 ship the bracket constants and IRS-table parity tests.

- [ ] T003 Create `calc/taxBrackets.js` with frozen constants per `contracts/taxBrackets-2024.contract.md`: `BRACKETS_MFJ_2024`, `BRACKETS_SINGLE_2024`, `FICA_SS_RATE`, `FICA_SS_WAGE_BASE_2024`, `FICA_MEDICARE_RATE`, `FICA_ADDITIONAL_MEDICARE_RATE`, `FICA_ADDITIONAL_MEDICARE_THRESHOLD_SINGLE`, `FICA_ADDITIONAL_MEDICARE_THRESHOLD_MFJ`. Include the file header per the contract and the UMD-classic-script wrapper (`module.exports` + `globalThis.taxBrackets`).
- [ ] T004 [P] Create `tests/unit/taxBrackets.test.js` with the 6 required test cases per `contracts/taxBrackets-2024.contract.md`: MFJ structure, single structure, frozen invariant, FICA constants, bracket monotonicity, sample IRS-table parity (4 sub-cases at MFJ $100k / single $50k / MFJ $200k / single $200k).
- [ ] T005 Run `node --test tests/unit/taxBrackets.test.js` — all 6 cases green before next task.
- [ ] T006 Verify `calc/taxBrackets.js` is loadable in the browser context: add a `<script src="calc/taxBrackets.js"></script>` line to BOTH `FIRE-Dashboard.html` AND `FIRE-Dashboard-Generic.html` near the existing `<script src="calc/accumulateToFire.js">` tag (mirrors feature 020 pattern). Verify the file loads without console errors when the HTMLs are opened in a browser.
- [ ] T007 [P] Run the meta-test gate `node --test tests/meta/module-boundaries.test.js` — confirm `calc/taxBrackets.js` passes the no-DOM-globals + Inputs/Outputs/Consumers header check (already enforced by feature 020 fixes).
- [ ] T008 Confirm full unit suite still 413/413 green: `node --test tests/unit/*.test.js tests/unit/validation-audit/*.test.js`. Test count grows by 6 from T004 → expected 419 passing post-T005.
- [ ] T009 Run `git add` + commit foundational work with message "phase2(021): tax brackets data module + IRS-table parity tests".

**Checkpoint**: Foundation ready. `calc/taxBrackets.js` shipped with full IRS-table parity. User stories can now begin.

---

## Phase 3: User Story 3 - Progressive Bracket Refactor in Accumulation (Priority: P1) 🎯 MVP Prerequisite

**Goal**: Refactor `calc/accumulateToFire.js` to compute `federalTax` via progressive brackets when `taxRate` is blank/0, and add the new `ficaTax` field plus `federalTaxBreakdown` and `ficaBreakdown` audit fields. The flat-rate `taxRate` override path is preserved for backwards compatibility.

**Why this is MVP-prerequisite**: User Story 1 (the P1 UI MVP) reads `(federalTax + ficaTax) / 12` directly from the calc engine per FR-016. Without US3 shipping first, US1's "auto-computed Income tax" would echo a less-accurate flat-rate number and the conservation invariants wouldn't hold.

**Independent Test**: Run `node --test tests/unit/accumulateToFire.test.js`. New v3 cases pin progressive-bracket federalTax + ficaTax against IRS / SSA published 2024 tables for MFJ + single across $50k / $150k / $250k income bands. Backwards-compat: a test with `taxRate=0.22` produces the same flat-rate output as feature 020 (byte-identical).

### Tests for User Story 3 (Constitution Principle IV requires fixtures) ⚠️

Write tests FIRST, ensure they FAIL before implementation.

- [ ] T010 [P] [US3] Add test "v3-TX-01: progressive-bracket MFJ $50k income" — persona with $50k MFJ joint income, $0 pretax 401k, `taxRate` blank, expect `federalTax ≈ $2,200/yr` (10%/12% blend post-$29.2k stdDed) and `ficaTax ≈ $3,825/yr` ($50k × 7.65%).
- [ ] T011 [P] [US3] Add test "v3-TX-02: progressive-bracket MFJ $150k income, $20k pretax" — expect `federalTax ≈ $12,300/yr`, `ficaTax ≈ $11,475/yr` (per spec US1 Independent Test).
- [ ] T012 [P] [US3] Add test "v3-TX-03: progressive-bracket MFJ $250k income" — at MFJ additional-Medicare threshold $250k, expect FICA's `additionalMedicare === 0` (threshold equals income, not exceeded).
- [ ] T013 [P] [US3] Add test "v3-TX-04: progressive-bracket MFJ $300k income (over additional-Medicare threshold)" — expect `additionalMedicare = ($300k - $250k) × 0.009 = $450/yr`.
- [ ] T014 [P] [US3] Add test "v3-TX-05: progressive-bracket single $50k income" — uses single-filer brackets (NOT MFJ); expect different federalTax than MFJ at same income.
- [ ] T015 [P] [US3] Add test "v3-TX-06: SS wage base cap (single high earner)" — single filer with $200k income; expect `ssWageBaseHit === true` and `socialSecurity = $168,600 × 0.062 = $10,453/yr` (capped, not $200k × 0.062).
- [ ] T016 [P] [US3] Add test "v3-TX-07: flat-rate override path backwards-compat" — persona with `taxRate=0.22` and $150k income, $20k pretax: expect `federalTax = (150000 - 20000) × 0.22 = $28,600/yr`, `ficaTax = 0`, `federalTaxBreakdown = {}`, `ficaBreakdown = {}`. Byte-identical to feature 020 v2 behavior.
- [ ] T017 [P] [US3] Add test "v3-TX-08: federal-tax-breakdown conservation" — for MFJ $150k case: assert `Σ(federalTaxBreakdown.bracket10..bracket37) === federalTax` within ±$1.
- [ ] T018 [P] [US3] Add test "v3-TX-09: FICA-breakdown conservation" — for any progressive-bracket case: assert `socialSecurity + medicare + additionalMedicare === ficaTax` within ±$1.
- [ ] T019 [P] [US3] Add test "v3-TX-10: taxableIncome definition" — assert `federalTaxBreakdown.taxableIncome === Math.max(0, grossIncome − pretax401kEmployee − standardDeduction)` for several cases.
- [ ] T020 [P] [US3] Add test "v3-TX-11: filing status detection" — case A: `adultCount=2` produces `standardDeduction === 29200` (MFJ). Case B: `adultCount=1` produces `standardDeduction === 14600` (single). Case C: `adultCount` undefined (RR default) produces MFJ.
- [ ] T021 [P] [US3] Add test "v3-TX-12: conservation invariant integration with feature 020 v2 cash-flow" — across 50-year accumulation horizon, assert `Σ(grossIncome) − Σ(federalTax) − Σ(ficaTax) − Σ(spending) − Σ(pretax401k) − Σ(stockContrib) = Σ(cashFlowToCash)` within ±$1 per non-clamped year (extended Constitution VIII gate).

### Implementation for User Story 3

- [ ] T022 [P] [US3] Update `calc/accumulateToFire.js` header docstring per Principle II — bump version v2 → v3, declare new Outputs (`ficaTax`, `federalTaxBreakdown`, `ficaBreakdown` per-row fields), update Consumers list to name the new Plan-tab Expenses pill UI consumer (added by US1 Phase 4).
- [ ] T023 [US3] Implement the `_computeYearTax(grossIncome, pretax401kEmployee, inp)` helper in `calc/accumulateToFire.js` per `contracts/accumulateToFire-v3.contract.md` § Tax computation algorithm. Imports `BRACKETS_MFJ_2024`, `BRACKETS_SINGLE_2024`, FICA constants from `calc/taxBrackets.js`. Honor flat-rate override path when `inp.taxRate > 0`.
- [ ] T024 [US3] Wire `_computeYearTax` into the per-year accumulation loop. Replace the v2 single-line `federalTax = ...` with the helper call; assign all four returned fields (`federalTax`, `ficaTax`, `federalTaxBreakdown`, `ficaBreakdown`) onto the per-year row object.
- [ ] T025 [US3] Run T010–T021 — all 12 tests green before next task.
- [ ] T026 [US3] Run the FULL existing test suite (`node --test tests/unit/*.test.js tests/unit/validation-audit/*.test.js`). Triage any failing tests: cash-flow-impacted fixtures (e.g., feature 020's `v2-CF-*` tests with pinned `federalTax` values that assumed `taxRate=0.22` flat) get updated with `// 021:` comments documenting the bracket-math delta. Non-cash-flow regressions are real bugs and must be investigated.
- [ ] T027 [US3] Update `FIRE-Dashboard.html` Investment tab — add the new "Auto" checkbox toggle next to the existing `taxRate` slider per FR-015. Element id: `taxRateAutoMode` (checkbox). Default state: ON if `taxRate` is blank/0, OFF if `taxRate` has a non-zero saved value (read existing localStorage on first render).
- [ ] T028 [US3] LOCKSTEP — apply T027 to `FIRE-Dashboard-Generic.html`. Verify Generic-specific layout matches RR (mirroring feature 020 pattern).
- [ ] T029 [US3] Implement Auto-toggle visual treatment in BOTH HTMLs: when Auto is ON, the `taxRate` slider becomes disabled (grayed out) and a sibling text element shows "Auto: X.X%" using the auto-computed effective rate from `(federalTax + ficaTax) / grossIncome × 100`. When Auto is OFF, slider is fully active.
- [ ] T030 [US3] Add `taxRateAutoMode` to the existing `PERSIST_IDS` array in BOTH HTMLs (mirrors feature 020's `pviCashflowOverrideEnabled` localStorage pattern). Verify reload persists the toggle state.
- [ ] T031 [P] [US3] Update `FIRE-Dashboard.html` translations: add EN keys `invest.taxRateAuto` ("Auto"), `invest.taxRateAutoLabel` ("Auto: {0}%"), `invest.taxRateAutoTooltip` ("Use progressive US tax brackets + FICA. Toggle off to enter a flat rate manually."). Add zh-TW equivalents.
- [ ] T032 [P] [US3] LOCKSTEP — same as T031 for `FIRE-Dashboard-Generic.html`.
- [ ] T033 [US3] Update audit dump (`copyDebugInfo()`) in `FIRE-Dashboard.html` per `contracts/accumulateToFire-v3.contract.md` § Audit observability — surface new per-row `ficaTax`, `federalTaxBreakdown`, `ficaBreakdown` fields under `lifecycleProjection.rows[i]`, and add `summary.totalFicaTax` aggregate. Update the cash-flow-stage `subSteps` to include filing-status, std-deduction, taxable-income, per-bracket dollars, FICA-component lines per the contract.
- [ ] T034 [US3] LOCKSTEP — same as T033 for `FIRE-Dashboard-Generic.html`.
- [ ] T035 [US3] Update `FIRE-Dashboard Translation Catalog.md` with the new Auto-toggle translation keys from T031–T032.

**Checkpoint**: User Story 3 complete. The calc layer now computes `federalTax` via progressive brackets + FICA. The Investment-tab UI exposes the Auto toggle. Audit dump surfaces the per-bracket and per-FICA-component breakdowns. Both HTMLs in lockstep.

---

## Phase 4: User Story 1 - Income Tax Visibility in Expenses (Priority: P1) 🎯 MVP

**Goal**: Add the new **Tax** category with the **Income tax** sub-row to the Plan-tab Expenses pill in both dashboards. Sub-row is read-only (lock icon), shows monthly $ + effective rate %, reads `(federalTax + ficaTax) / 12` from the active accumulation snapshot.

**Independent Test**: Open Expenses pill in either dashboard. Verify Tax category visible with Income tax sub-row showing a non-zero monthly $ value and effective rate % within ±$10 of the IRS+SSA published 2024 tables for the active persona's gross income / pretax 401(k) / filing status.

### Tests for User Story 1

- [ ] T036 [P] [US1] Add test "ui-TX-01: Income tax row reads from calc snapshot" in a new `tests/unit/taxExpenseRow.test.js` — mock the accumulation snapshot with `federalTax=12000, ficaTax=11475, grossIncome=150000`; assert the helper that formats the row returns `{type:'income', monthlyAmount: 1956, effectiveRate: 15.7, isLocked: true}`.
- [ ] T037 [P] [US1] Add test "ui-TX-02: Income tax row handles flat-rate override path" — mock snapshot with `federalTax=33000, ficaTax=0, grossIncome=150000`; assert row returns `{monthlyAmount: 2750, effectiveRate: 22.0}`.
- [ ] T038 [P] [US1] Add test "ui-TX-03: Income tax row gracefully degrades when snapshot missing" — mock undefined federalTax; assert row returns `{monthlyAmount: 0, effectiveRate: 0, isLocked: true}` (no NaN cascade per Edge Cases section).

### Implementation for User Story 1

- [ ] T039 [US1] Update `FIRE-Dashboard.html` Plan-tab → Expenses pill DOM — add a new top-level expense row labeled "Tax" with two sub-rows. The Income tax sub-row has element id `taxIncomeRow`, displays a lock icon (using existing dashboard icon convention or a 🔒 emoji), and shows two values: monthly $ (id `taxIncomeAmount`) and effective rate % (id `taxIncomeRate`). Tooltip uses `data-i18n-tip="expenses.tax.incomeTooltip"`.
- [ ] T040 [US1] LOCKSTEP — apply T039 to `FIRE-Dashboard-Generic.html`.
- [ ] T041 [US1] Wire the live update in BOTH HTMLs: register a renderer `_renderTaxIncomeRow(snap)` that runs as part of the existing `recalcAll()` flow. Reads `snap.lifecycleProjection.rows[0]` (or the first accumulation year) for `federalTax + ficaTax + grossIncome`, formats per data-model.md §TaxExpenseRow derivation rules, sets DOM via `taxIncomeAmount.textContent` and `taxIncomeRate.textContent`. Ensure the row updates within one animation frame (FR-005).
- [ ] T042 [US1] Verify the Income tax row does NOT add to `monthlySpend` (FR-006). Grep `monthlySpend` aggregation in both HTMLs and confirm the new row is excluded from the sum.
- [ ] T043 [P] [US1] Update `FIRE-Dashboard.html` translations: add EN keys `expenses.tax.category` ("Tax"), `expenses.tax.income` ("Income tax"), `expenses.tax.incomeTooltip` (per spec US1 tooltip wording — "Income tax = federal income tax + FICA..."). Add zh-TW equivalents.
- [ ] T044 [P] [US1] LOCKSTEP — same as T043 for `FIRE-Dashboard-Generic.html`.
- [ ] T045 [US1] Update `FIRE-Dashboard Translation Catalog.md` with the new Tax-category translation keys from T043–T044.
- [ ] T046 [US1] Run T036–T038 — all 3 tests green. Run full test suite — confirm no regressions from the UI wiring.

**Checkpoint**: User Story 1 complete. Income tax sub-row displays correctly in both dashboards with bilingual i18n. Reads directly from the calc snapshot — single source of truth per Constitution Principle III.

---

## Phase 5: User Story 2 - Other Tax Manual Entry (Priority: P2)

**Goal**: Add the **Other tax** sub-row to the Tax category. Manually editable, sums into `monthlySpend`, defaults to $0 for ALL countries (no auto-population per Q2 clarification), persists via localStorage.

**Independent Test**: Type $200 into Other tax; verify `monthlySpend` increases by $200 and the Lifecycle chart re-renders. Reload page; verify $200 persists. Switch country scenario; verify $200 stays.

### Tests for User Story 2

- [ ] T047 [P] [US2] Add test "ui-OX-01: Other tax sums into monthlySpend" in `tests/unit/taxExpenseRow.test.js` — set `exp_tax_other=200`; assert the monthlySpend aggregator includes the $200.
- [ ] T048 [P] [US2] Add test "ui-OX-02: Other tax preserved across country switch" — simulate user entering $300, then `selectedScenario` switches from 'us' to 'japan'; assert localStorage still reports $300.
- [ ] T049 [P] [US2] Add test "ui-OX-03: Other tax empty input treated as $0" — set value to empty string; assert calc treats as 0 (no NaN per Edge Cases).

### Implementation for User Story 2

- [ ] T050 [US2] Update `FIRE-Dashboard.html` Plan-tab → Expenses pill DOM — add a second sub-row under Tax category labeled "Other tax" with element id `taxOtherRow`, contains a `<input type="number" id="exp_tax_other" min="0">` field with a $/month label.
- [ ] T051 [US2] LOCKSTEP — apply T050 to `FIRE-Dashboard-Generic.html`.
- [ ] T052 [US2] Wire `exp_tax_other` into the existing `monthlySpend` aggregator in BOTH HTMLs. Find the existing expense-bucket sum (likely `Σ(exp_0..exp_9)` or similar) and add `+ (parseFloat(exp_tax_other.value) || 0)`.
- [ ] T053 [US2] Add `exp_tax_other` to the existing `PERSIST_IDS` array in BOTH HTMLs (mirrors feature 020 pattern). Verify reload persists the value.
- [ ] T054 [US2] Verify country-scenario switch handler does NOT overwrite `exp_tax_other` (per FR-009). Grep the existing scenario-change handler in both HTMLs to confirm no auto-fill logic touches the field.
- [ ] T055 [P] [US2] Update `FIRE-Dashboard.html` translations: add EN key `expenses.tax.other` ("Other tax"), `expenses.tax.otherPlaceholder` ("e.g., state income tax, sales tax"). Add zh-TW equivalents.
- [ ] T056 [P] [US2] LOCKSTEP — same as T055 for `FIRE-Dashboard-Generic.html`.
- [ ] T057 [US2] Update `FIRE-Dashboard Translation Catalog.md` with the new Other-tax translation keys from T055–T056.
- [ ] T058 [US2] Run T047–T049 — all 3 tests green. Run full test suite — confirm no regressions.
- [ ] T059 [US2] Implement FR-009a: surface the existing `scenarios[selectedScenario].taxNote` string as a tooltip OR small caption near the Income tax row when `selectedScenario !== 'us'`. Use `data-i18n-tip` if dynamic, or a span with a click-to-expand pattern. Lockstep both HTMLs.

**Checkpoint**: User Story 2 complete. Other tax sub-row works as a manual expense bucket; persists; country-aware tax-note surfaces for non-US scenarios.

---

## Phase 6: User Story 4 - Strategy Ranker Hysteresis (Priority: P3) — Carry-forward B-020-4

**Goal**: Add ±0.05yr-equivalent hysteresis to `calc/strategyRanker.js` so the winner does not flip under tiny perturbations near integer-age boundaries. Clears 17 E3 LOW findings from feature 020 audit.

**Independent Test**: Run `node --test tests/unit/validation-audit/drag-invariants.test.js`. E3 finding count drops from 17 to 0.

### Tests for User Story 4

- [ ] T060 [P] [US4] Add test "ranker-hysteresis-01: tiny perturbation does not flip winner" in a new `tests/unit/strategyRankerHysteresis.test.js` — synthetic ranker state with previousWinnerId='trad-first'; new contender beats by 0.01yr equivalent; assert winner stays 'trad-first' (hysteresis blocks).
- [ ] T061 [P] [US4] Add test "ranker-hysteresis-02: real winner change passes hysteresis" — same state but new contender beats by 1.0yr equivalent; assert winner changes (real-margin updates not blocked).
- [ ] T062 [P] [US4] Add test "ranker-hysteresis-03: first-call no hysteresis" — `previousWinnerId` undefined (first-ever ranking); assert ranker picks absolute winner (hysteresis only kicks in on subsequent calls).

### Implementation for User Story 4

- [ ] T063 [US4] Update `calc/strategyRanker.js` to accept `RankerInput.previousWinnerId` (optional) per data-model.md § Strategy ranker state delta. Implement `_newWinnerBeats(prevWinner, newContender, mode, objective, annualSpend)` per `research.md` R5 with `HYSTERESIS_YEARS = 0.05`. Implement `_scoreDeltaToYears` mapping for each sort key (`endBalance` → years-of-spend, `cumulativeFederalTax` → years-of-avg-tax, `residualArea` → normalized).
- [ ] T064 [US4] Wire `_newWinnerBeats` into `scoreAndRank` (or whichever function picks the winner). Read `previousWinnerId` from `state._lastStrategyResults?.winnerId` at the call site in BOTH HTMLs.
- [ ] T065 [US4] Run T060–T062 — all 3 tests green.
- [ ] T066 [US4] Re-run `node --test tests/unit/validation-audit/drag-invariants.test.js` — verify E3 finding count drops from 17 to 0 (target: 0 LOW findings for the hysteresis case). Update `audit-report.md` E3 section to reflect post-fix state when Phase 10 polish runs.

**Checkpoint**: User Story 4 complete. Ranker is stable under integer-age-boundary perturbations.

---

## Phase 7: User Story 5 - Audit Harness in CI (Priority: P2) — Carry-forward B-020-6

**Goal**: Ship `.github/workflows/audit.yml` running the validation-audit harness on every push and PR. Posts finding-count summary as PR comment. CRITICAL findings fail the build; HIGH emit warnings.

**Independent Test**: Open a draft PR with a deliberate calc regression (flip federalTax sign). Verify CI fails with a comment listing the failing invariant cells.

### Implementation for User Story 5

- [ ] T067 [US5] Create `.github/workflows/audit.yml` per `research.md` R4 — uses `actions/checkout@v4`, `actions/setup-node@v4` with Node 20, runs `node --test tests/unit/validation-audit/` + `tests/unit/validation-audit/tax-bracket-conservation.test.js`, parses the harness output for finding counts, posts a PR comment via `gh pr comment` (no `actions/github-script` heaviness), fails the build if CRITICAL > 0.
- [ ] T068 [US5] Test the workflow locally (act / nektos-act) OR by opening a draft PR on a sandbox commit to verify the comment posts correctly. Adjust grep regex if the harness output format requires it.
- [ ] T069 [US5] Add a 10-minute timeout (`timeout-minutes: 10`) per spec SC-008. Verify a deliberately slow synthetic test triggers the timeout fallback (workflow fails soft with a warning comment).

**Checkpoint**: User Story 5 complete. Audit harness runs on every PR; finding counts post as a comment; CRITICAL gate enforced.

---

## Phase 8: User Story 6 - Harness fireAge ≤ endAge Clamp (Priority: P3) — Carry-forward B-020-7

**Goal**: Add a one-line clamp inside the audit harness's `findFireAgeNumerical` invocation so the `RR-edge-fire-at-endage` persona no longer produces a HIGH C3 finding. Clears the last remaining HIGH finding from feature 020.

**Independent Test**: Run `node --test tests/unit/validation-audit/cross-chart-consistency.test.js`. C3 finding count drops from 1 to 0.

### Implementation for User Story 6

- [ ] T070 [US6] Update `tests/unit/validation-audit/harness.js` — locate the `findFireAgeNumerical` invocation in `buildHarnessContext` (around line 542 per feature 020 layout). Wrap the returned `fireAge` with `Math.min(fireAge, endAge)` where `endAge = persona.inp.endAge || 100`. Document the rationale inline (the live UI clamps `fireAge ≤ endAge`; harness must mirror that).
- [ ] T071 [US6] Re-run `node --test tests/unit/validation-audit/cross-chart-consistency.test.js` — verify C3 finding count drops from 1 to 0 for `RR-edge-fire-at-endage`.
- [ ] T072 [US6] Add a regression test "C3-clamp-regression: RR-edge-fire-at-endage no longer produces endBalance-mismatch" in `tests/unit/validation-audit/cross-chart-consistency.test.js`. Pin the persona; assert C3 invariant returns `passed: true` for that persona post-clamp.

**Checkpoint**: User Story 6 complete. Last HIGH finding from feature 020 audit cleared. SC-009 (zero HIGH findings) achievable when the full audit re-runs in Phase 10.

---

## Phase 9: User Story 7 - True Fractional-Year DWZ Feasibility (Priority: P3 OPTIONAL) — Carry-forward B-020-5

**Goal**: Extend the simulator to pro-rate the FIRE-year row by `(1 - m/12)` so DWZ month-precision is genuinely month-precise rather than a UI-display refinement.

**⚠️ DEFERRABLE**: If Phase 9 scope creeps beyond ~1 day of agent work, document the deferral rationale, mark this phase SKIPPED in audit-report.md, and carry-forward to feature 022. Remaining work in Phase 10 closeout.

**Independent Test**: New unit test in `tests/unit/monthPrecisionResolver.test.js` checks that for a synthetic persona barely feasible at age 55, the month-precision search identifies the earliest feasible month within age 55 (e.g., 55y 7mo).

### Tests for User Story 7

- [ ] T073 [P] [US7] Add test "fractional-year-01: barely feasible at age 55 → identify earliest month" in `tests/unit/monthPrecisionResolver.test.js`. Use synthetic injected helpers per the existing test pattern.
- [ ] T074 [P] [US7] Add test "fractional-year-02: feasibility holds at returned month" — for any returned `{years: Y, months: M}`, simulating with `fireAge = Y + M/12` produces zero `hasShortfall:true` rows.

### Implementation for User Story 7

- [ ] T075 [US7] Locate `simulateRetirementOnlySigned` (or its pro-rate-able equivalent) in BOTH HTMLs. Extend the FIRE-year row computation to multiply spending + SS income by `(1 − m/12)` when a fractional `fireAge` is passed. Document the change inline; preserve backwards-compat for integer `fireAge` calls (the math reduces to today's behavior when `m = 0`).
- [ ] T076 [US7] Update the `findEarliestFeasibleAge` resolver in `calc/fireAgeResolver.js` to flip from "display refinement" to "true fractional-year search". Update the contract doc accordingly.
- [ ] T077 [US7] Run T073–T074 — both tests green.
- [ ] T078 [US7] Run full unit suite — confirm no feature-020 regressions.

**Checkpoint** (if implemented): User Story 7 complete. DWZ is now truly month-precise. **OR** Checkpoint (if deferred): Phase 9 documented as deferred with rationale; carry-forward item B-022-1 added to BACKLOG.md.

---

## Phase 10: Polish & Cross-Cutting (Audit Run + Closeout)

**Purpose**: Run the full audit harness end-to-end, compile findings, write reports, prep browser smoke, closeout.

- [ ] T079 Add `tests/unit/validation-audit/tax-bracket-conservation.test.js` per `contracts/tax-bracket-conservation-invariant.md` — 5 invariants (TBC-1 through TBC-5) running across the 92-persona matrix via `runHarness`.
- [ ] T080 Run the FULL audit harness (`node --test tests/unit/validation-audit/`) — all 6 invariant test files (5 from feature 020 + 1 new tax-bracket-conservation) run end-to-end. Capture all findings.
- [ ] T081 Compile audit findings into `specs/021-tax-category-and-audit-cleanup/audit-report.md`. Each finding row: invariantId, personaId, observed, expected, severity, status. Mirror the format from feature 020's audit-report.md.
- [ ] T082 [iterative] Triage CRITICAL findings — target 0 CRITICAL post-feature-021 (SC-005). Reproduce, fix, re-run, mark FIXED with commit hash. Continue until zero CRITICAL.
- [ ] T083 [iterative] Triage HIGH findings — target 0 HIGH post-feature-021 (SC-009). Combined with US6 + US7 carry-forwards, expect zero HIGH findings remaining. Mark FIXED or DEFERRED with rationale + carry-forward backlog entry.
- [ ] T084 [P] Triage MEDIUM findings — FIXED if trivial, DEFERRED with rationale, or WONTFIX with rationale.
- [ ] T085 [P] Triage LOW findings — same triage flow as T084. With US4 hysteresis, expect E3 LOW count: 17 → 0.
- [ ] T086 Update `specs/021-tax-category-and-audit-cleanup/audit-report.md` with final summary section: totals (CRITICAL: N, HIGH: N, MEDIUM: N, LOW: N), all FIXED / DEFERRED / WONTFIX rows, executive summary paragraph.
- [ ] T087 Run the FULL test suite one final time — `node --test tests/unit/*.test.js tests/unit/validation-audit/*.test.js tests/meta/*.test.js`. Document the new total test count (estimated: 413 baseline + ~30 new tests = ~443 passing, 0 failures).
- [ ] T088 Browser-smoke checklist (T080-equivalent): Open both HTMLs in a real browser. Execute the 9-step checklist in `quickstart.md`. Capture screenshots in `specs/021-tax-category-and-audit-cleanup/browser-smoke/`. **USER-SIDE GATE** — checklist for the user to execute before merge.
- [ ] T089 Write `specs/021-tax-category-and-audit-cleanup/CLOSEOUT.md` with: phase-by-phase summary, total commits, total tests added, total findings (by severity), browser-smoke status, merge-readiness statement.
- [ ] T090 Update `BACKLOG.md` to tick off feature 021 + add any DEFERRED findings (e.g., MFS support if scoped to 022) as backlog items.
- [ ] T091 Update `CLAUDE.md` SPECKIT block to "Active feature: _none_ — feature 021 awaiting user browser-smoke before merge to main".
- [ ] T092 Final commit + push + tag with `feat(021): tax expense category + audit-harness carry-forward` per project conventions.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001–T002 — quick verification.
- **Foundational (Phase 2)**: T003–T009 — `calc/taxBrackets.js` + tests. BLOCKS Phase 3 (US3 imports the constants).
- **User Story 3 (Phase 3, P1 MVP-prerequisite)**: T010–T035 — calc refactor + Investment-tab Auto toggle + audit dump update. BLOCKS US1 (Phase 4 reads `federalTax + ficaTax` from US3's outputs).
- **User Story 1 (Phase 4, P1 MVP)**: T036–T046 — Tax category + Income tax sub-row UI.
- **User Story 2 (Phase 5, P2)**: T047–T059 — Other tax sub-row. INDEPENDENT of US1; can ship in either order after US3.
- **User Story 4 (Phase 6, P3)**: T060–T066 — strategy ranker hysteresis. INDEPENDENT of US1/US2/US3.
- **User Story 5 (Phase 7, P2)**: T067–T069 — CI workflow. INDEPENDENT.
- **User Story 6 (Phase 8, P3)**: T070–T072 — harness clamp. INDEPENDENT.
- **User Story 7 (Phase 9, P3 OPTIONAL)**: T073–T078 — fractional-year DWZ. INDEPENDENT; deferrable.
- **Polish (Phase 10)**: T079–T092 — depends on Phases 3–9 complete.

### User Story Dependencies

- **US3 (P1)**: Blocks US1. NOT blocked by US2/US4/US5/US6/US7.
- **US1 (P1 MVP)**: Depends on US3. NOT blocked by US2/US4/US5/US6/US7.
- **US2 (P2)**: NOT blocked by US1 (UI parallel). Can technically ship before US1 if needed but the Tax category header already exists once US1 lands; US2 just adds the second sub-row.
- **US4, US5, US6, US7**: ALL independent of US1/US2/US3 and of each other. Can run in parallel.

### Within Each User Story

- Tests MUST be written and FAIL before implementation (Constitution Principle IV).
- For US3: write all 12 unit tests first (T010–T021), then implement T022–T035.
- For US1/US2: write 3 tests each, then implement.
- For US4: write 3 hysteresis tests, then implement + audit re-run.
- US5/US6/US7 follow the same TDD-first pattern.

### Parallel Opportunities

- T002, T004, T007: Foundational verification + tests in parallel.
- T010–T021: All 12 US3 calc tests in parallel (same file but independent test cases).
- T022 (docstring) is sequential before T023 (impl); T024 sequential after T023.
- T027/T028, T031/T032, T033/T034: lockstep RR + Generic edits — different files, parallel.
- US4 / US5 / US6 / US7 phases: 4 parallel agents possible after Phase 5 lands.
- T084 / T085: MEDIUM + LOW finding triage in parallel.

---

## Parallel Example: User Story 3 (MVP Prerequisite)

```bash
# Phase 2 tests + module ship in parallel after T003 lands:
Task: "T004 [P] Write tests/unit/taxBrackets.test.js with 6 IRS-table parity cases"
Task: "T007 [P] Run meta-test gate to confirm Principle II compliance"

# US3 calc tests — write all 12 in parallel:
Task: "T010 [P] [US3] v3-TX-01 progressive-bracket MFJ $50k"
Task: "T011 [P] [US3] v3-TX-02 progressive-bracket MFJ $150k"
Task: "T012 [P] [US3] v3-TX-03 MFJ $250k additional-Medicare threshold"
Task: "T013 [P] [US3] v3-TX-04 MFJ $300k additional-Medicare active"
Task: "T014 [P] [US3] v3-TX-05 progressive-bracket single $50k"
Task: "T015 [P] [US3] v3-TX-06 SS wage base cap"
Task: "T016 [P] [US3] v3-TX-07 flat-rate override backwards-compat"
Task: "T017 [P] [US3] v3-TX-08 federal-tax-breakdown conservation"
Task: "T018 [P] [US3] v3-TX-09 FICA-breakdown conservation"
Task: "T019 [P] [US3] v3-TX-10 taxableIncome definition"
Task: "T020 [P] [US3] v3-TX-11 filing status detection"
Task: "T021 [P] [US3] v3-TX-12 conservation invariant (50-yr horizon)"

# US3 lockstep RR + Generic UI edits in parallel:
Task: "T027 [US3] Add Auto toggle to FIRE-Dashboard.html"
Task: "T028 [US3] Add Auto toggle to FIRE-Dashboard-Generic.html"
```

---

## Implementation Strategy

### MVP First (User Story 3 + User Story 1)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational `taxBrackets.js`).
2. Complete Phase 3 (US3 calc refactor + Auto toggle + audit dump update).
3. Complete Phase 4 (US1 Income tax sub-row UI).
4. **STOP and VALIDATE**: Run all tests + browser-load both dashboards. Verify the Income tax sub-row shows ~$1,980/mo for RR-baseline. Demoable as "Phase A: tax visibility".

### Incremental Delivery

1. Setup + Foundational → `calc/taxBrackets.js` shipped.
2. US3 → calc refactor + Auto toggle + audit dump (P1 prerequisite).
3. US1 → Income tax sub-row UI (P1 MVP). Demoable.
4. US2 → Other tax sub-row (P2). Demoable.
5. US4 / US5 / US6 / US7 → in any order or parallel. Each demoable independently.
6. Polish → audit run, closeout, browser smoke, merge.

### Parallel Team Strategy

With multiple agents:

1. Manager + Backend Engineer complete Phases 1–2 sequentially.
2. Once Phase 2 lands:
   - Backend Engineer: US3 calc work (T022–T035) — single-threaded.
   - In parallel: Frontend Engineer drafts US1 + US2 UI mockups by reading the contract docs.
3. Once US3 lands:
   - 4 parallel tracks possible: US1 (Frontend), US2 (Frontend), US4 (Backend), US5 (DevOps).
   - US6 + US7 can also run as small independent tasks.
4. Phase 10 is single-threaded under the Manager (audit run + fix iteration + closeout).

---

## Notes

- Tests are NOT optional in this feature — Constitution Principle IV mandates fixture coverage for every calc change. The new `tax-bracket-conservation` invariant family IS a deliverable per spec FR-016b.
- Lockstep RR + Generic enforced at every UI-changing task (Principle I).
- Progressive-bracket refactor in accumulation (US3) WILL change pre-FIRE accumulation totals across the existing test suite. T026 is dedicated to triaging the resulting fixture deltas — budget time for it (estimated 30 min per failing test).
- The 021 branch must NOT be merged to `main` until ALL CRITICAL and HIGH findings are FIXED (SC-005, SC-009) AND the user signs off on the browser smoke (T088).
- Stop at any checkpoint to validate before proceeding. The MVP checkpoint after Phase 4 is intentionally a viable mid-feature demo.
- US7 (Phase 9) is OPTIONAL and may be deferred to feature 022 if scope creeps past ~1 day of agent work.
- Avoid: vague task descriptions, same-file conflicts in parallel tasks, cross-story dependencies that break independence.
