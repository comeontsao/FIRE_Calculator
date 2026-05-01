---

description: "Tasks: Comprehensive Validation Audit + Cash-Flow Rewrite (Feature 020)"
---

# Tasks: Comprehensive Validation Audit + Cash-Flow Rewrite

**Input**: Design documents from `/specs/020-validation-audit/`
**Prerequisites**: plan.md (✅), spec.md (✅), research.md (✅), data-model.md (✅), contracts/ (✅), quickstart.md (✅)

**Tests**: Test tasks ARE included — Constitution Principle IV (Gold-Standard Regression Coverage) requires fixture cases for every calc change, and the audit's entire deliverable IS a parameterized test framework. This is not optional for feature 020.

**Organization**: Tasks are grouped by user story per the spec's priorities. **One critical reordering**: User Story 4 (Cash-flow rewrite, P1) is implemented first because every other audit invariant validates against the post-rewrite calc. The plan calls this out as Phase 2 → blocks Phases 6–7 audit. Within tasks.md, US4 is the MVP (Phase 3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story this task belongs to (US1, US2, US3, US4, US4c, US5, US6)
- File paths are absolute or repo-relative

## Path Conventions

- HTMLs: `FIRE-Dashboard.html` (RR), `FIRE-Dashboard-Generic.html` (Generic)
- Calc modules: `calc/*.js`
- Tests: `tests/unit/`
- Spec artifacts: `specs/020-validation-audit/`
- i18n: `FIRE-Dashboard Translation Catalog.md`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify environment + create directory structure for new test files.

- [ ] T001 Verify branch `020-validation-audit` is checked out and clean (`git status` shows no uncommitted changes), all 379 existing unit tests pass (`for f in tests/unit/*.test.js; do node --test "$f" >/dev/null 2>&1 || echo "FAIL: $f"; done`), and `node --version` is ≥ 18.
- [ ] T002 [P] Create directory `tests/unit/validation-audit/` and add a placeholder `.gitkeep` file so the directory tracks under git before any test files exist.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Phase 0 research (resolves the cash-flow accounting model ambiguity) PLUS persona matrix + audit harness scaffolding (consumed by US1, US2, US3, US5).

**⚠️ CRITICAL**: No user story work can begin until this phase completes. T003–T009 (research) gate US4. T010–T013 (harness scaffolding) gate US1, US2, US3, US5.

- [ ] T003 Research R1 — does federal tax compute on `gross income` or `gross income − pretax 401k`? Cite IRS Publication 17 + Bogleheads "Marginal tax rate" + Investopedia "How 401(k) Contributions Affect Your Tax Bracket". Write findings to `specs/020-validation-audit/research.md` R1 section. If the answer differs from spec FR-015 step 3, STOP and ask the user before proceeding to T014.
- [ ] T004 [P] Research R2 — confirm "Monthly Stock Contribution" (renamed `monthlySavings`) is post-tax. Cite Bogleheads "Tax-efficient fund placement" + Investopedia "Brokerage account taxation". Document in `research.md` R2.
- [ ] T005 [P] Research R3 — confirm employer match is non-cash inflow direct to Trad (not part of "salary" side of conservation invariant). Cite IRS Topic No. 558 + Bogleheads "Employer match". Document in `research.md` R3.
- [ ] T006 [P] Research R4 — survey FIRE-community savings-rate definitions (Mr. Money Mustache "Shockingly Simple Math", Mad Fientist "Savings Rate Calculator", Early Retirement Now "Ultimate Guide to SWR"). Compare to spec FR-015 formula. Document in `research.md` R4.
- [ ] T007 [P] Research R5 — write the explanatory copy for the cash pool tooltip (FR-016: docs only, 0.5% nominal rate stays). Capture in `research.md` R5 + add the literal copy strings (EN + zh-TW) to a section labeled "Phase 4 i18n source".
- [ ] T008 [P] Research R7 — choose month-precision algorithm: linear scan (recommended), binary search, or closed-form. Document tradeoffs in `research.md` R7.
- [ ] T009 Consolidate R1–R7 into user-facing `specs/020-validation-audit/cashflow-research.md` per FR-015.3 (≥3 cited sources, plain-language summary, alignment confirmation with spec FR-015).
- [ ] T010 [P] Create `tests/unit/validation-audit/personas.js` exporting `personas` array. Implement the persona matrix axes per `data-model.md`: dimensional sweep from `RR-baseline` (≥30 single-axis variations) + representative pair-wise sweep. Cap total cells at ≤200 (SC-001 budget). Each persona has stable string ID + dashboard discriminator + full `inp` object + notes.
- [ ] T011 [P] Create `tests/unit/validation-audit/harness.js` per `contracts/validation-audit-harness.contract.md`. Implement: `runHarness(personas, invariants, options)`, `buildHarnessContext(persona)` (with per-persona caching), env-var filtering (`PERSONA`, `INVARIANT`, `FAMILY`), structured findings output.
- [ ] T012 [P] Create `tests/unit/validation-audit/findings.js`. Implement: `Finding` factory, JSON serializer to `audit-report.json`, markdown formatter to `audit-report.md` table.
- [ ] T013 Create `tests/unit/validation-audit/harness.test.js` with ≥4 meta-tests per the harness contract (known-good persona + known-failing invariant produces a finding; persona-construction failure produces special finding; PERSONA filter works; FAMILY filter works).

**Checkpoint**: Foundation ready. Research complete (cash-flow model validated against external sources). Harness boots and runs. User stories can now begin.

---

## Phase 3: User Story 4 - Cash-flow Calc Engine Rewrite (Priority: P1) 🎯 MVP

**Goal**: Replace today's "monthlySavings × 12 → all stocks" model with the user's common-sense `salary − tax − spending − 401k − stockContrib = cash` accounting. Cash pool now grows year-over-year. Adds an override input + negative-residual warning to the Plan tab. Lockstep RR + Generic.

**Independent Test**: Run `node --test tests/unit/accumulateToFire.test.js` — all v2 conservation tests pass. For the user's RR scenario, the calc produces a year-1 cash inflow within 5% of an independently computed reference number (per SC-010).

**Why this is MVP**: All audit invariants (US1, US2, US3, US5) validate against the post-rewrite calc. Until US4 ships, the audit's "expected values" cannot be defined.

### Tests for User Story 4 (Constitution Principle IV requires fixtures) ⚠️

Write tests FIRST, ensure they FAIL before implementation.

- [ ] T014 [P] [US4] In `tests/unit/accumulateToFire.test.js`, add test "v2-CF-01: positive-residual conservation" — persona with $150k income, $70k spend, $20k 401k, $12k stock contrib, expect annual cash inflow ≈ $34k (formula per `contracts/accumulate-to-fire-v2.contract.md`).
- [ ] T015 [P] [US4] Add test "v2-CF-02: negative-residual clamps + warns" — persona with $80k income, $90k spend, expect cashFlowToCash = 0 AND cashFlowWarning = 'NEGATIVE_RESIDUAL' for affected years.
- [ ] T016 [P] [US4] Add test "v2-CF-03: pool-update reconciliation" — verify pTrad post-loop = ΣcontribTrad + ΣempMatch + ΣgrowthOnTrad within $1.
- [ ] T017 [P] [US4] Add test "v2-CF-04: override toggle ON" — pviCashflowOverrideEnabled = true with override = $5000/yr; computed residual is bypassed; cash pool grows by $5000/yr (after 0.5% growth).
- [ ] T018 [P] [US4] Add test "v2-CF-05: override toggle OFF" — pviCashflowOverrideEnabled = false; computed residual is used as today.
- [ ] T019 [P] [US4] Add test "v2-CF-06: single-person mode (adultCount=1) cash flow" — Generic single-person scenario; only person1 income; verify cashFlowToCash uses person1 income only.
- [ ] T020 [P] [US4] Add test "v2-CF-07: zero income / retired persona" — `fireAge ≤ currentAge`; perYearRows is empty; accumResult.end mirrors initial pools.
- [ ] T021 [P] [US4] Add test "v2-CF-08: buy-in year ordering" — cash flow accrues into pCash + pStocks BEFORE buy-in withdraws; mortgage upfront cost drains cash + spillover to stocks per existing logic.
- [ ] T022 [P] [US4] Add test "v2-CF-09: Constitution VIII spending-floor regression" — re-run `tests/unit/spendingFloorPass.test.js` after the rewrite; assert all cases still pass.
- [ ] T023 [P] [US4] Add test "v2-CF-10: conservation invariant across 50-year accumulation" — random persona; assert `Σ(grossIncome) − Σ(federalTax) − Σ(annualSpending) − Σ(pretax401k) − Σ(stockContrib) = Σ(cashFlowToCash)` within ±$1 per year for non-clamped years (SC-012).

### Implementation for User Story 4

- [ ] T024 [P] [US4] Update `calc/accumulateToFire.js` header docstring per Principle II — declare new Inputs, Outputs (perYearRows v2 fields), Consumers (chart renderers + audit dump). Match `contracts/accumulate-to-fire-v2.contract.md`.
- [ ] T025 [US4] Implement v2 cash-flow algorithm in `calc/accumulateToFire.js`. Add per-year tracking of grossIncome, federalTax, annualSpending, pretax401kEmployee, empMatchToTrad, stockContribution, cashFlowToCash, cashFlowWarning. Update accumResult.end.pCash. Honor `inp.pviCashflowOverrideEnabled` + `inp.pviCashflowOverride`. Run T014–T023 — all green before next task.
- [ ] T026 [US4] Update `FIRE-Dashboard.html` `projectFullLifecycle` to consume the new perYearRows fields. Remove or update the typeof-guarded fallback inline accumulation path (per plan.md Phase 2: REMOVE, with shim defense-in-depth `console.error('[projectFullLifecycle] accumulateToFire threw:', err)` if helper fails).
- [ ] T027 [US4] LOCKSTEP — apply T026's changes to `FIRE-Dashboard-Generic.html` `projectFullLifecycle`. Verify Generic-specific gating (adultCount, agePerson1) works.
- [ ] T028 [US4] Update audit dump (`copyDebugInfo()`) in `FIRE-Dashboard.html` — add new perYearRows v2 fields to `lifecycleProjection.rows[i]` and add `summary.totalCashFlow` + `cashFlowConservation` diagnostic block per `data-model.md`.
- [ ] T029 [US4] LOCKSTEP — same as T028 for `FIRE-Dashboard-Generic.html`.
- [ ] T030 [US4] Verify `_simulateStrategyLifetime`, `computeWithdrawalStrategy`, `signedLifecycleEndBalance` (all four sites in both HTMLs) consume the v2 helper output cleanly. No code changes expected (they already route through `accumulateToFire`); just confirm no regressions.
- [ ] T031 [US4] Run the full existing test suite (`for f in tests/unit/*.test.js; do node --test "$f"; done`). Triage failing tests: those with cash-flow-impacted fixtures get updated with `// 020:` comments documenting the delta; non-cash-flow regressions are real bugs and must be investigated.
- [ ] T032 [US4] Update `FIRE-Dashboard.html` Plan tab DOM — add new input field "Annual cash flow to savings" with override toggle (mirroring `pviEffRateOverrideEnabled` pattern). Persist `pviCashflowOverrideEnabled` + `pviCashflowOverride` via existing localStorage flow.
- [ ] T033 [US4] LOCKSTEP — same as T032 for `FIRE-Dashboard-Generic.html`.
- [ ] T034 [US4] Implement negative-residual warning UI in both HTMLs (lockstep). Show non-blocking warning near cash-flow display when `cashFlowWarning === 'NEGATIVE_RESIDUAL'` for any pre-FIRE year. Auto-clear when residual goes positive.
- [ ] T035 [P] [US4] Update `FIRE-Dashboard.html` translations (TRANSLATIONS.en + TRANSLATIONS.zh) — new keys for input label, tooltip, warning copy. Keys: `plan.cashflowInput`, `plan.cashflowTooltip`, `plan.cashflowWarning`.
- [ ] T036 [P] [US4] LOCKSTEP — same as T035 for `FIRE-Dashboard-Generic.html`.
- [ ] T037 [US4] Update `FIRE-Dashboard Translation Catalog.md` with the new keys (entries in the appropriate table sections per the catalog's existing structure).
- [ ] T038 [US4] Update RR's monthlySavings input label/tooltip to "Monthly Stock Contribution" (per FR-015.1). Apply lockstep to Generic (T039).
- [ ] T039 [US4] LOCKSTEP — Generic monthlySavings label/tooltip update.

**Checkpoint**: User Story 4 complete. The calc now models leftover cash correctly. All v2 unit tests pass. Existing test fixtures updated with `// 020:` comments where appropriate. Plan-tab UI exposes the cash-flow override + warning. Both HTMLs in lockstep.

---

## Phase 4: User Story 4c - Month-Precision FIRE-Age + Header Months UI (Priority: P2)

**Goal**: Header displays "X Years Y Months" instead of "X yrs". The FIRE-age resolver returns `{years, months}` via a year-then-month two-stage search. Per `contracts/month-precision-resolver.contract.md` Edge Case 4 mitigation: default to UI-display refinement (option c — feasibility check stays at year level; months is a display-only refinement).

**Independent Test**: `node --test tests/unit/monthPrecisionResolver.test.js` passes ≥6 cases. Header in both HTMLs renders "X Years Y Months" format. zh-TW renders culturally appropriate format.

### Tests for User Story 4c

- [ ] T040 [P] [US4c] Create `tests/unit/monthPrecisionResolver.test.js` with ≥6 cases per `contracts/month-precision-resolver.contract.md`: boundary detection, monotonic-stability fallback, already-feasible-at-currentAge edge case, infeasible-everywhere edge case, single-person + couple parity, year-boundary equality (months=0).

### Implementation for User Story 4c

- [ ] T041 [P] [US4c] Create `calc/fireAgeResolver.js` per `contracts/month-precision-resolver.contract.md`. Use UMD-classic-script pattern (Constitution Principle V): `module.exports` for Node + `globalThis.findEarliestFeasibleAge` for browser.
- [ ] T042 [US4c] Run T040 — all tests green before next task.
- [ ] T043 [US4c] Update `FIRE-Dashboard.html` to load the new `calc/fireAgeResolver.js` via classic `<script src="...">` tag near the other calc-module loads (matches feature 019 pattern). Replace KPI card "Years to FIRE" rendering to use `findEarliestFeasibleAge` and render `{years} Years {months} Months`.
- [ ] T044 [US4c] LOCKSTEP — same as T043 for `FIRE-Dashboard-Generic.html`.
- [ ] T045 [US4c] Update verdict pill in both HTMLs to include months: e.g., "On Track — FIRE in 12 Years 7 Months". Lockstep + i18n.
- [ ] T046 [P] [US4c] Update RR translations (TRANSLATIONS.en + TRANSLATIONS.zh) — new keys for the "X Years Y Months" format. EN: `kpi.yearsMonthsToFire`. zh-TW: e.g., `{0} 年 {1} 個月`.
- [ ] T047 [P] [US4c] LOCKSTEP — same as T046 for Generic.
- [ ] T048 [US4c] Update `FIRE-Dashboard Translation Catalog.md` with the new keys.
- [ ] T049 [US4c] zh-TW format readability ask — show user the proposed Chinese format "{0} 年 {1} 個月" for review. Adjust if needed.

**Checkpoint**: User Story 4c complete. Header displays month-precision in both languages. Lockstep verified.

---

## Phase 5: User Story 1 - Mode Ordering Audit (Priority: P1)

**Goal**: Build invariants A1 (DWZ_age ≤ Exact_age ≤ Safe_age) and A2 (DWZ_total ≤ Exact_total ≤ Safe_total). Run across persona matrix. Findings file logged.

**Independent Test**: `node --test tests/unit/validation-audit/mode-ordering.test.js` runs A1 and A2 across all personas; output is a structured findings list. Zero CRITICAL findings post-fixes (SC-002).

### Implementation for User Story 1

- [ ] T050 [P] [US1] Create `tests/unit/validation-audit/mode-ordering.test.js`. Define invariant A1 per `data-model.md`: `check(persona, ctx)` reads `ctx.fireAgeByMode` and asserts `dieWithZero.totalMonths ≤ exact.totalMonths ≤ safe.totalMonths`. Severity CRITICAL.
- [ ] T051 [P] [US1] In the same file, define invariant A2: for each persona, sweep `fireAge ∈ {currentAge+5, currentAge+10, currentAge+15, currentAge+20}` and assert `dieWithZero_total ≤ exact_total ≤ safe_total` for each. Severity HIGH.
- [ ] T052 [US1] Wire the harness to run A1 and A2 across all personas. Run `node --test tests/unit/validation-audit/mode-ordering.test.js` and capture findings into `audit-report.json`.

**Checkpoint**: User Story 1 complete. Mode ordering invariants pass across the matrix OR findings are catalogued for fix in Phase 10.

---

## Phase 6: User Story 2 - End-State Validity Audit (Priority: P1)

**Goal**: Build invariants B1 (Safe trajectory + 20% terminal), B2 (Exact terminalBuffer), B3 (DWZ strict 0-shortfall + boundary year). Run across persona matrix.

**Independent Test**: `node --test tests/unit/validation-audit/end-state-validity.test.js` runs B1, B2, B3 across all personas. For each (persona, mode) cell where the calc reports feasibility, the chart trajectory satisfies the mode's end-state contract.

### Implementation for User Story 2

- [ ] T053 [P] [US2] Create `tests/unit/validation-audit/end-state-validity.test.js`. Define B1: for personas where Safe is feasible at age N, assert chart's last row total ≥ 20% × FIRE-year total AND every retirement-year row's total ≥ buffer × annualSpend. Severity HIGH.
- [ ] T054 [P] [US2] In the same file, define B2: for personas where Exact is feasible at age N, assert chart's last row total ≥ terminalBuffer × annualSpend. Severity MEDIUM.
- [ ] T055 [P] [US2] In the same file, define B3: for personas where DWZ is feasible at age N, assert (a) zero shortfall years across the trajectory (strict), AND (b) at age N-1, DWZ is infeasible (boundary check). Severity HIGH.
- [ ] T056 [US2] Run `node --test tests/unit/validation-audit/end-state-validity.test.js`. Capture findings into `audit-report.json` (appending, not overwriting).

**Checkpoint**: User Story 2 complete. End-state validity invariants pass OR findings catalogued.

---

## Phase 7: User Story 3 - Cross-Chart Consistency Audit (Priority: P1)

**Goal**: Build invariants C1 (Lifecycle ↔ Withdrawal Strategy chart withdrawal mix match within $1), C2 (verdict pill ↔ Progress card directional agreement), C3 (no `endBalance-mismatch` warnings under default operation).

**Independent Test**: `node --test tests/unit/validation-audit/cross-chart-consistency.test.js` runs C1, C2, C3 across the matrix. Zero HIGH findings post-fixes (SC-003).

### Implementation for User Story 3

- [ ] T057 [P] [US3] Create `tests/unit/validation-audit/cross-chart-consistency.test.js`. Define C1: for each (persona, fireAge, strategy) cell, diff the per-year `wTrad`, `wRoth`, `wStocks`, `wCash` arrays from `projectFullLifecycle` vs `computeWithdrawalStrategy`. Assert max-diff ≤ $1. Severity HIGH.
- [ ] T058 [P] [US3] Define C2: for each (persona, fireAge) cell, compute the verdict pill's "X% there" AND the Progress card's "Y% of total target". Assert directional agreement (both above 100%, both at 100%, or both below 100%). Severity MEDIUM.
- [ ] T059 [P] [US3] Define C3: for each (persona) cell under default operating conditions (active strategy = winner strategy, no preview), assert `audit.crossValidationWarnings` contains no `endBalance-mismatch` records. Severity HIGH.
- [ ] T060 [US3] Run `node --test tests/unit/validation-audit/cross-chart-consistency.test.js`. Append findings to `audit-report.json`.

**Checkpoint**: User Story 3 complete.

---

## Phase 8: User Story 5 - Drag Invariants (Priority: P2)

**Goal**: Build invariants E1 (monotonic feasibility for Safe + Exact), E2 (DWZ boundary semantics), E3 (ranker stability under ±$1 spend perturbation).

**Independent Test**: `node --test tests/unit/validation-audit/drag-invariants.test.js` runs E1, E2, E3 across the matrix.

### Implementation for User Story 5

- [ ] T061 [P] [US5] Create `tests/unit/validation-audit/drag-invariants.test.js`. Define E1: for each persona, sweep fireAge from `currentAge + 5` to `currentAge + 30`. For Safe + Exact modes, assert if feasible at N, then feasible at N+1. Severity MEDIUM.
- [ ] T062 [P] [US5] Define E2: for each persona where DWZ is feasible at age N, assert (a) at age N-1 DWZ is infeasible AND (b) at age N+1 DWZ verdict transitions away from "DWZ ✓" (e.g., to Exact-territory or over-saving warning). Severity MEDIUM.
- [ ] T063 [P] [US5] Define E3: for each persona, perturb `annualSpend` by ±$1 (≈0.001%) and `currentAge` by ±0.01 years. Assert strategy ranker winner does NOT change. Severity LOW (numerical instability is annoying but rarely user-visible).
- [ ] T064 [US5] Run `node --test tests/unit/validation-audit/drag-invariants.test.js`. Append findings to `audit-report.json`.

**Checkpoint**: User Story 5 complete.

---

## Phase 9: User Story 6 - Withdrawal Strategy Survey (Priority: P3)

**Goal**: Research-only deliverable — survey 6+ candidate withdrawal strategies and recommend implement-now / defer / skip per `withdrawal-strategy-survey.md`.

**Independent Test**: `specs/020-validation-audit/withdrawal-strategy-survey.md` exists; covers ≥6 strategies; each has definition + model-fit + recommendation + cited source.

### Implementation for User Story 6

- [ ] T065 [P] [US6] Research 4% rule (Bengen 1994 + Trinity Study). Write definition + model-fit assessment + recommendation in `withdrawal-strategy-survey.md`.
- [ ] T066 [P] [US6] Research Variable Withdrawal (VPW) per Bogleheads VPW backtesting page. Document.
- [ ] T067 [P] [US6] Research Guyton-Klinger guardrails per Guyton-Klinger 2006 paper "Decision Rules and Maximum Initial Withdrawal Rates". Document.
- [ ] T068 [P] [US6] Research Bucket strategy per Harold Evensky "Wealth Management Index". Document.
- [ ] T069 [P] [US6] Research Dynamic Spending per Vanguard "Dynamic Spending Rule" research paper. Document.
- [ ] T070 [P] [US6] Research RMD-based withdrawal per IRS Pub 590-B + Sun & Webb 2012. Document.
- [ ] T071 [US6] Consolidate all six entries in `specs/020-validation-audit/withdrawal-strategy-survey.md` with a comparison table (strategy × model-fit × recommendation × scoping note).

**Checkpoint**: User Story 6 complete. Survey ready for user review.

---

## Phase 10: Polish & Cross-Cutting (Audit Run + Findings Fixes + Reports + Closeout)

**Purpose**: Run the full audit harness, compile findings, fix CRITICAL/HIGH, write reports, prep browser smoke, closeout.

- [ ] T072 Run the FULL audit harness (`node --test tests/unit/validation-audit/`) — all 5 invariant test files run end-to-end across the persona matrix. Capture all findings in `audit-report.json`.
- [ ] T073 Compile `audit-report.json` into `specs/020-validation-audit/audit-report.md` markdown table. Each finding row: invariantId, personaId, observed, expected, severity, status (initial = OPEN).
- [ ] T074 [iterative — repeat for each CRITICAL finding] Reproduce the finding locally; design + implement fix (lockstep RR + Generic if applicable); add a dedicated regression test in the appropriate invariant test file; re-run the harness; mark finding as FIXED with commit hash in `audit-report.md`. Continue until zero CRITICAL findings remain (SC-002).
- [ ] T075 [iterative — repeat for each HIGH finding] Same workflow as T074. Continue until zero HIGH findings remain (SC-003).
- [ ] T076 [P] For each MEDIUM finding: triage decision — FIXED (if trivial) / DEFERRED (with rationale to a future feature) / WONTFIX (with rationale). Update `audit-report.md` row.
- [ ] T077 [P] For each LOW finding: same triage as T076.
- [ ] T078 Update `specs/020-validation-audit/audit-report.md` final summary section with totals (CRITICAL: N, HIGH: N, MEDIUM: N, LOW: N), all FIXED/DEFERRED/WONTFIX rows, and a one-paragraph executive summary.
- [ ] T079 Run the full unit-test suite one final time — all original 379 tests pass + all new tests from Phases 3–8 pass. Document the new total test count.
- [ ] T080 Browser-smoke checklist: open both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` in a real browser. Verify (a) header displays "X Years Y Months" correctly in EN + zh-TW; (b) Plan tab shows the cash-flow input + override toggle + warning UI; (c) the user's RR scenario at fireAge=55 in DWZ mode produces consistent verdict + chart + Progress + FIRE NUMBER; (d) zero red console errors. Capture screenshots in `specs/020-validation-audit/browser-smoke/`. **USER-SIDE GATE** — checklist for the user to execute before merge.
- [ ] T081 Write `specs/020-validation-audit/CLOSEOUT.md` with: phase-by-phase summary, total commits, total tests added, total findings (by severity), browser-smoke status, merge-readiness statement.
- [ ] T082 Update `BACKLOG.md` to tick off feature 020 + add any DEFERRED findings as backlog items.
- [ ] T083 Update `CLAUDE.md` SPECKIT block to "Active feature: _none_ — feature 020 awaiting user browser-smoke before merge to main".
- [ ] T084 Final commit + push. Tag with `feat(020): <commit-message>` per project conventions.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001, T002 — quick verification + dir creation.
- **Foundational (Phase 2)**: T003–T013 — research + harness scaffolding.
  - T003 BLOCKS T014–T025 (research must confirm cash-flow formula before calc rewrite).
  - T010, T011, T012, T013 BLOCK T050+ (harness must exist before invariant test files).
- **User Story 4 (Phase 3, P1 MVP)**: T014–T039 — cash-flow rewrite. BLOCKS Phases 5–8 (audit invariants run against post-rewrite calc).
- **User Story 4c (Phase 4, P2)**: T040–T049 — month-precision + header. Independent of Phases 5–8 (UI-only refinement; doesn't change feasibility math under recommended option c).
- **User Story 1 (Phase 5, P1)**: T050–T052 — depends on T014–T039 (US4 complete) + T010–T013 (harness ready).
- **User Story 2 (Phase 6, P1)**: T053–T056 — same dependencies as US1; can run in parallel with US1 if separate developers.
- **User Story 3 (Phase 7, P1)**: T057–T060 — same dependencies; parallel with US1, US2.
- **User Story 5 (Phase 8, P2)**: T061–T064 — same dependencies; parallel with US1, US2, US3.
- **User Story 6 (Phase 9, P3)**: T065–T071 — RESEARCH ONLY, no code dependency. Can run in parallel with any phase, ideally interleaved with research-heavy phases to share context.
- **Polish (Phase 10)**: T072–T084 — depends on Phases 3–9 complete.

### User Story Dependencies

- **US4 (Cash-flow rewrite, P1, MVP)**: blocks US1, US2, US3, US5. NOT blocked by US4c.
- **US4c (Month-precision header, P2)**: independent of US4 if option (c) UI-only is chosen (recommended). Can ship in parallel with US1+.
- **US1, US2, US3, US5**: all depend on US4 + Foundational harness. Independent of each other.
- **US6 (Survey, P3)**: research-only, no code dependency. Schedule any time.

### Within Each User Story

- Tests (T014–T023 for US4; T040 for US4c; etc.) MUST be written and FAIL before implementation.
- For US4: write all 10 unit tests first (T014–T023), then implement T024–T031, then UI T032–T039.
- For US1/US2/US3/US5: invariants are defined directly in the test files (no separate test/impl split since the audit harness IS the implementation).

### Parallel Opportunities

- T004–T008: Phase 0 research (R2–R7 in parallel; R1 must finish first to confirm formula).
- T010, T011, T012: Phase 2 harness scaffolding (different files, parallel).
- T014–T023: US4 tests (all in same file but independent test cases, parallel TDD-style).
- T035, T036, T046, T047: i18n updates (different HTMLs, parallel).
- T040, T041: US4c module + tests (parallel).
- US1, US2, US3, US5 invariant test files: parallel between developers/agents once US4 is done.
- T065–T070: US6 strategy research (6 strategies in parallel).
- T076, T077: MEDIUM/LOW finding triage (parallel).

---

## Parallel Example: User Story 4 (MVP)

```bash
# Phase 0 research — sources are independent, parallel:
Task: "T004 [P] R2 Stock contribution post-tax confirmation"
Task: "T005 [P] R3 Employer match flow"
Task: "T006 [P] R4 FIRE-community savings rate consensus"
Task: "T007 [P] R5 Cash growth rate doc copy"
Task: "T008 [P] R7 Month-precision algorithm decision"

# US4 tests — write all 10 in parallel:
Task: "T014 [P] [US4] v2-CF-01 positive-residual conservation"
Task: "T015 [P] [US4] v2-CF-02 negative-residual clamps + warns"
Task: "T016 [P] [US4] v2-CF-03 pool-update reconciliation"
Task: "T017 [P] [US4] v2-CF-04 override toggle ON"
Task: "T018 [P] [US4] v2-CF-05 override toggle OFF"
Task: "T019 [P] [US4] v2-CF-06 single-person mode cash flow"
Task: "T020 [P] [US4] v2-CF-07 retired persona"
Task: "T021 [P] [US4] v2-CF-08 buy-in year ordering"
Task: "T022 [P] [US4] v2-CF-09 spending-floor regression"
Task: "T023 [P] [US4] v2-CF-10 long-horizon conservation"
```

---

## Implementation Strategy

### MVP First (User Story 4 — Cash-flow rewrite)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational research + harness).
2. Complete Phase 3 (US4 — cash-flow rewrite + Plan-tab UI).
3. **STOP and VALIDATE**: Run the existing 379 tests + new US4 tests. Browser-load both dashboards; verify the cash-flow input + warning render; verify pCash now grows over time in the Lifecycle chart.
4. The cash-flow rewrite is itself a complete, demoable feature even before the audit runs.

### Incremental Delivery

1. Setup + Foundational → research published, harness ready.
2. US4 cash-flow rewrite → validate in browser → demo as "Phase A: cash flow now models reality".
3. US4c month-precision header → demo as "Phase B: header now shows X Years Y Months".
4. US1 → US2 → US3 → US5 audit invariants → each phase produces a findings list; fixes accumulate in Phase 10.
5. US6 survey → standalone document deliverable.
6. Polish (Phase 10) → run audit, fix CRITICAL/HIGH, browser smoke, merge.

### Parallel Team Strategy

With multiple agents:

1. Manager + Backend Engineer complete Phase 2 research (T003–T009) sequentially since T003 gates the rest.
2. Once research lands:
   - Backend Engineer: US4 (Phase 3) — single-threaded calc rewrite + tests.
   - QA Engineer: T010–T013 (harness scaffolding).
   - In parallel: Frontend Engineer drafts the US4 UI changes (T032–T039) reading the contract docs.
3. Once US4 lands:
   - 4 parallel tracks: US1 (Backend), US2 (Backend), US3 (QA), US5 (QA). Different test files, no shared state.
   - Frontend completes US4c (Phase 4) on its own track.
   - Manager completes US6 (Phase 9) survey research in idle time.
4. Phase 10 is single-threaded under the Manager (audit run + fix iteration).

---

## Notes

- Tests are NOT optional in this feature — Constitution Principle IV mandates fixture coverage for every calc change, and the audit's deliverable IS the parameterized test framework.
- Lockstep RR + Generic is enforced at every code-changing task (Principle I).
- Cash-flow rewrite WILL change pre-FIRE accumulation totals across the existing test suite. T031 is dedicated to triaging the resulting fixture deltas — budget time for it (estimated 30 min per failing test).
- The 020 branch must NOT be merged to main until ALL CRITICAL and HIGH findings are FIXED (SC-002, SC-003) AND the user signs off on the browser smoke (T080).
- Stop at any checkpoint to validate before proceeding. The MVP checkpoint after Phase 3 is intentionally a viable mid-feature demo.
- Avoid: vague task descriptions, same-file conflicts in parallel tasks (the harness scaffolding intentionally uses 3 separate files for parallelism), cross-story dependencies that break independence.
