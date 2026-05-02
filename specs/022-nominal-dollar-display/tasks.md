---

description: "Tasks: Nominal-Dollar Display + Frame-Clarifying Comments + B-021 Carry-Forward (Feature 022)"
---

# Tasks: Nominal-Dollar Display + Frame-Clarifying Comments + B-021 Carry-Forward

**Input**: Design documents from `/specs/022-nominal-dollar-display/`
**Prerequisites**: plan.md (✅), spec.md (✅), research.md (✅), data-model.md (✅), contracts/ (5 files ✅), quickstart.md (✅)

**Tests**: Test tasks ARE included — Constitution Principle IV (Gold-Standard Regression Coverage) requires fixture cases for every calc change. Two new meta-tests (frame-coverage + snapshot-frame-coverage) and one new audit invariant family (month-precision-feasibility) are themselves deliverables per FR-011, FR-008e, FR-023.

**Organization**: Tasks are grouped by user story per spec priorities. **Critical sequencing**: US3 (P1 calc-frame fix) ships before US1 (P1 display layer) because US1's `_extendSnapshotWithBookValues` reads real-$ values that US3's fix corrects. US2 (`// FRAME:` comments) ships in parallel with US3 since they touch the same calc files.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story this task belongs to (US1, US2, US3, US4, US5, US6, US7)
- File paths are absolute or repo-relative

## Path Conventions

- HTMLs: `FIRE-Dashboard.html` (RR), `FIRE-Dashboard-Generic.html` (Generic)
- Calc modules: `calc/*.js`
- Tests: `tests/unit/`, `tests/unit/validation-audit/`, `tests/meta/`
- Spec artifacts: `specs/022-nominal-dollar-display/`
- i18n: `FIRE-Dashboard Translation Catalog.md`
- CI: `.github/workflows/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify environment + confirm clean baseline before any user story work begins.

- [ ] T001 Verify branch `022-nominal-dollar-display` is checked out and clean (`git status` shows no uncommitted changes), all 449 unit/audit tests + 1 intentional skip + 0 failures green (`node --test tests/unit/*.test.js tests/unit/validation-audit/*.test.js tests/meta/*.test.js`), and `node --version` is ≥ 20.
- [ ] T002 [P] Verify CLAUDE.md SPECKIT block already references feature 022 (set by `/speckit-plan`). No-op if correct.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Ship the new pure-data module `calc/displayConverter.js` + the meta-tests that all subsequent user stories rely on.

**⚠️ CRITICAL**: T003–T010 must complete before US1 begins. US2/US3 can run in parallel with foundational work after T003 ships.

### `calc/displayConverter.js` module

- [ ] T003 Create `calc/displayConverter.js` per `contracts/displayConverter.contract.md`. Implement `toBookValue`, `toBookValueAtYearsFromNow`, `invertToReal`. UMD wrapper at file bottom (matches `calc/accumulateToFire.js` pattern). Module header includes `FRAME:` block per `contracts/frame-comment-conventions.contract.md`.
- [ ] T004 [P] Create `tests/unit/displayConverter.test.js` with the 8 required test cases per `contracts/displayConverter.contract.md`: identity at yearsFromNow=0, standard conversion ($445k×1.03^11≈$616k), zero inflation, inverse round-trip, historical-age (deflation case), NaN guard, throws on bad inflationRate, parity between `toBookValue` and `toBookValueAtYearsFromNow`.
- [ ] T005 Run `node --test tests/unit/displayConverter.test.js` — all 8 cases green before next task.
- [ ] T006 Add `<script src="calc/displayConverter.js"></script>` line to BOTH HTMLs near the existing `<script src="calc/taxBrackets.js">` tag (load order: displayConverter must be available before recalcAll runs).

### Meta-test scaffolding

- [ ] T007 [P] Create `tests/meta/frame-coverage.test.js` per `contracts/frame-comment-conventions.contract.md` § Meta-test enforcement. Walks every `calc/*.js` file; asserts ≥95% qualifying-line `// FRAME:` annotation coverage. Test will INITIALLY FAIL (no annotations exist yet) — that's expected; US2 implementation closes the gap.
- [ ] T008 [P] Create `tests/meta/snapshot-frame-coverage.test.js` per `contracts/recalcAll-snapshot-extension.contract.md`. Asserts every chart-consumed snapshot field listed in the FR-001 a-n inventory has its `bookValue` companion. Test will INITIALLY FAIL (no companions exist yet) — US1 implementation closes the gap.
- [ ] T009 Run `node --test tests/meta/module-boundaries.test.js` — confirm `calc/displayConverter.js` passes the no-DOM-globals + Inputs/Outputs/Consumers header check.
- [ ] T010 Commit Phase 2 work locally with message: "phase2(022): displayConverter pure module + meta-test scaffolding".

**Checkpoint**: Foundation ready. `displayConverter.js` shipped; meta-test scaffolding in place (failing as expected; US1 + US2 will close the gaps). User stories can now begin.

---

## Phase 3: User Story 2 - Frame-Clarifying Code Comments (Priority: P1)

**Goal**: Annotate every `calc/*.js` module + every inline simulator in both HTMLs with `// FRAME:` comments per the four-category taxonomy. Ship the meta-test that enforces ≥95% qualifying-line coverage. This is the user's stated complexity hedge.

**Independent Test**: Run `node --test tests/meta/frame-coverage.test.js`. ≥95% qualifying-line coverage achieved across all `calc/*.js` files.

**Why this priority and ordering**: P1 because it's the user's hedge. Sequenced before US3 calc-fix so the annotations document the PRE-fix state first; US3 will then update annotations as part of its refactor. Sequenced before US1 because US1's `_extendSnapshotWithBookValues` annotations rely on US2's taxonomy.

### Implementation for User Story 2

- [ ] T011 [P] [US2] Annotate `calc/accumulateToFire.js` per `contracts/frame-comment-conventions.contract.md` § Module header pattern. Add module-level `FRAME:` block. Inline-annotate every qualifying line (realReturn, inflationRate, raiseRate sites). NOTE: this captures the PRE-US3 state; US3 (Phase 4) updates these annotations to reflect post-fix frame.
- [ ] T012 [P] [US2] Annotate `calc/taxBrackets.js` per the contract (pure-data module; `Frame-conversion sites: NONE`).
- [ ] T013 [P] [US2] Annotate `calc/taxExpenseRow.js` per the contract.
- [ ] T014 [P] [US2] Annotate `calc/fireAgeResolver.js` per the contract.
- [ ] T015 [P] [US2] Annotate `calc/strategyRanker.js` per the contract.
- [ ] T016 [P] [US2] Annotate `calc/lifecycle.js` per the contract.
- [ ] T017 [P] [US2] Annotate `calc/payoffVsInvest.js` per the contract (already documents real-$ treatment in v3; verify alignment).
- [ ] T018 [P] [US2] Annotate `calc/healthcare.js` per the contract.
- [ ] T019 [P] [US2] Annotate `calc/college.js` per the contract.
- [ ] T020 [P] [US2] Annotate `calc/mortgage.js` per the contract.
- [ ] T021 [P] [US2] Annotate `calc/inflation.js`, `calc/socialSecurity.js`, `calc/ssEarningsRecord.js`, `calc/calcAudit.js`, `calc/chartState.js`, `calc/getCanonicalInputs.js`, `calc/secondHome.js`, `calc/shims.js`, `calc/simulateLifecycle.js`, `calc/studentLoan.js`, `calc/tabRouter.js`, `calc/tax.js`, `calc/fireCalculator.js` — one task per file, batched together since most have minimal qualifying tokens.
- [ ] T022 [US2] Annotate inline simulators in `FIRE-Dashboard.html`: `projectFullLifecycle`, `signedLifecycleEndBalance`, `simulateRetirementOnlySigned`, `taxOptimizedWithdrawal`, `_simulateStrategyLifetime`, `findFireAgeNumerical`, `isFireAgeFeasible`, `findMinAccessibleAtFireNumerical`, recalcAll() body. Per Principle V's UMD-classic-script rules, inline simulators get the same module-level + inline annotations as standalone calc modules.
- [ ] T023 [US2] LOCKSTEP — apply T022 to `FIRE-Dashboard-Generic.html`. Sentinel-symbol parity check: `// FRAME:` count in both HTMLs should match within ±2 (allowance for personal-content-only lines).
- [ ] T024 [US2] Run `node --test tests/meta/frame-coverage.test.js` — assert ≥95% qualifying-line coverage. If under threshold, identify offender lines via test output and add missing annotations.
- [ ] T025 [US2] Commit Phase 3 work locally with message: "phase3(022): US2 frame-clarifying // FRAME: comments across calc layer".

**Checkpoint**: User Story 2 complete. All `calc/*.js` files + inline simulators annotated. Meta-test enforces ≥95% coverage on every commit going forward.

---

## Phase 4: User Story 3 - Hybrid-Frame Bug Fix in Accumulation Cash-Flow Residual (Priority: P1)

**Goal**: Fix the cash-flow residual line in `calc/accumulateToFire.js` so that the residual is computed in a single frame (real-$). All inputs to the residual must be in real-$ before subtraction. Per spec FR-012 through FR-016 + research R4.

**Independent Test**: Run `node --test tests/unit/accumulateToFire.test.js`. New v4-FRAME-* test cases pass. Existing v3-CF-* tests pass with `// 022:` annotations where bracket math shifted.

**Why this priority**: P1 because the bug compounds silently over 11+ year horizons (~$8-15k pCash distortion on RR-baseline). Drives buffer-floor decisions during retirement.

### Tests for User Story 3 (TDD-first per Constitution IV) ⚠️

- [ ] T026 [P] [US3] Add test "v4-FRAME-01: real-frame residual conservation — RR-baseline 11-yr horizon" in `tests/unit/accumulateToFire.test.js`. Assert `Σ(grossIncome) − Σ(federalTax) − Σ(ficaTax) − Σ(annualSpending) − Σ(pretax401kEmployee) − Σ(stockContribution) === Σ(cashFlowToCash)` within ±$1 per non-clamped year.
- [ ] T027 [P] [US3] Add test "v4-FRAME-02: raiseRate === inflationRate → grossIncomeReal stays constant". Persona with raiseRate=0.03, inflationRate=0.03; assert grossIncome in every accumulation row equals annualIncomeBase exactly (within $1).
- [ ] T028 [P] [US3] Add test "v4-FRAME-03: raiseRate > inflationRate → grossIncomeReal grows at delta". raiseRate=0.05, inflationRate=0.03; assert grossIncome grows at 2%/yr (real wage growth).
- [ ] T029 [P] [US3] Add test "v4-FRAME-04: raiseRate < inflationRate (real wage cut) → grossIncomeReal shrinks". raiseRate=0.02, inflationRate=0.03; assert grossIncome shrinks at ~1%/yr.
- [ ] T030 [P] [US3] Add test "v4-FRAME-05: backwards-compat with flat-rate override (taxRate > 0)". Persona with taxRate=0.22; assert federalTax = (grossIncomeReal - pretax401k) × 0.22 (not the pre-fix nominal-income variant). Annotate test with `// 022:` documenting expected delta from feature 021.
- [ ] T031 [P] [US3] Add test "v4-FRAME-06: feature 020 cashFlowConservation invariant green post-fix". Direct assertion that the feature-020 invariant (sum of $-flows balances) holds within ±$1.
- [ ] T032 [P] [US3] Add test "v4-FRAME-07: feature 021 TBC-1..5 invariants green post-fix". Run feature 021's tax-bracket-conservation invariants against post-fix calc; all 5 stay green.
- [ ] T033 [P] [US3] Add test "v4-FRAME-08: ficaBreakdown.ssWageBaseHit triggers correctly with real income". Persona with high real income that crosses SS wage base; assert correct hit detection.

### Implementation for User Story 3

- [ ] T034 [US3] Update `calc/accumulateToFire.js` per `contracts/accumulateToFire-v3-frame-fix.contract.md`. Refactor the per-year loop body (lines ~525-570) to use real-frame income + spending + tax. Add `// FRAME:` annotations matching the contract's reference impl.
- [ ] T035 [US3] Run T026–T033 (all 8 v4-FRAME tests) — all green.
- [ ] T036 [US3] Run FULL existing test suite (`node --test tests/unit/*.test.js tests/unit/validation-audit/*.test.js`). Triage any failing v3-CF-* / v3-TX-* tests: cash-flow-impacted fixtures get `// 022:` comments documenting the real-frame shift. Estimated 5–10 affected tests; budget ~30 min per test for the annotation work per FR-017.
- [ ] T037 [US3] Update `calc/accumulateToFire.js` module-header `FRAME:` block to reflect post-fix state per `contracts/frame-comment-conventions.contract.md` (Dominant frame: mixed; conversion sites listed).
- [ ] T038 [US3] Re-run `node --test tests/meta/frame-coverage.test.js` — confirm coverage stays ≥95% post-refactor.
- [ ] T039 [US3] Commit Phase 4 work locally with message: "phase4(022): US3 hybrid-frame bug fix in accumulateToFire cash-flow residual".

**Checkpoint**: User Story 3 complete. Cash-flow residual is single-frame real-$. Feature 020/021 conservation invariants stay green. ~$8-15k pCash distortion on RR-baseline eliminated.

---

## Phase 5: User Story 1 - Nominal-Dollar Display Across All In-Scope Charts (Priority: P1) 🎯 MVP

**Goal**: Switch the dashboard's display layer to **nominal future dollars (Book Value)** across all 14 in-scope charts/displays per FR-001 a–n. Calc-engine internals stay in real-$; the conversion happens centrally in `recalcAll()` via `_extendSnapshotWithBookValues`. Render functions consume `bookValue` companion fields directly.

**Independent Test**: Open Lifecycle chart in either dashboard for RR-baseline. Y-axis values are in nominal future $; age-53 total ≈ $1,126k (within ±$30k of pure-math FV). Caption + tooltip companion line render correctly. Test the full 9-step browser-smoke from `quickstart.md`.

**Why this priority**: P1 / MVP — this is the user's primary feature ask.

### Central snapshot extension (Phase 5a)

- [ ] T040 [US1] In `FIRE-Dashboard.html` `recalcAll()` body, implement the `_extendSnapshotWithBookValues(snap, currentAge, inflationRate)` helper per `contracts/recalcAll-snapshot-extension.contract.md` reference impl. Wire the call AFTER snapshot assembly and BEFORE chart rendering.
- [ ] T041 [US1] LOCKSTEP — apply T040 to `FIRE-Dashboard-Generic.html`. Sentinel-symbol parity check: byte-identical helper bodies.
- [ ] T042 [US1] Run `node --test tests/meta/snapshot-frame-coverage.test.js` — assert every chart-consumed snapshot field has its `bookValue` companion. All 14 in-scope chart paths pass.

### Chart renderer wiring (Phase 5b — parallel-friendly)

- [ ] T043 [US1] Update Lifecycle chart renderer in BOTH HTMLs to read `*BookValue` fields. Add renderer-comment annotation per contract. Add caption via shared helper `_renderBookValueCaption(chartContainerEl)`. Tooltip companion line "(≈ $X purchasing power)".
- [ ] T044 [US1] LOCKSTEP — apply T043 to Generic HTML.
- [ ] T045 [P] [US1] Update Withdrawal Strategy chart renderer in BOTH HTMLs to read `withdrawalStrategy.rows[i].{wTrad,wRoth,wStocks,wCash}BookValue`. Caption + tooltip companion.
- [ ] T046 [P] [US1] Update Drawdown chart renderer in BOTH HTMLs to read `drawdown.rows[i].{drawAmount,runningTotal}BookValue`.
- [ ] T047 [P] [US1] Update Roth Ladder chart renderer in BOTH HTMLs to read `rothLadder.rows[i].{convertAmount,balanceAfter}BookValue`.
- [ ] T048 [P] [US1] Update Healthcare delta chart renderer in BOTH HTMLs to read `healthcare.rows[i].{premium,subsidyDelta}BookValue`.
- [ ] T049 [P] [US1] Update Mortgage payoff bar chart renderer in BOTH HTMLs to read `mortgage.rows[i].{principal,interest,total}BookValue`.
- [ ] T050 [P] [US1] Update Payoff vs Invest brokerage trajectory chart + amortization split chart + verdict banner in BOTH HTMLs to read `pvi.{prepayPath,investPath,crossover}.totalBookValue`.
- [ ] T051 [P] [US1] Update Country budget tier comparison + Country deep-dive insight panel in BOTH HTMLs to read `scenarios[i].{annualSpend,comfortableSpend,normalSpend}BookValue`.
- [ ] T052 [P] [US1] Update Strategy ranker score bar chart in BOTH HTMLs to read score `*BookValue` fields. Verify Constitution IX (Mode/Objective orthogonality) preserved — sort dispatch unchanged.
- [ ] T053 [P] [US1] Update Plan-tab Expenses pill rendering in BOTH HTMLs: Income tax sub-row reads `lifecycleProjection.rows[0].{federalTax,ficaTax}BookValue` instead of feature 021's real-$ values. Update `calc/taxExpenseRow.js` `formatTaxIncomeRow` helper signature accordingly.
- [ ] T054 [P] [US1] Update KPI cards in BOTH HTMLs:
  - "Current Net Worth" — UNCHANGED (year-0 value; real-$ === nominal-$).
  - "FIRE NUMBER (Primary)" — read `snap.fireNumberBookValue`.
  - "Total Portfolio at FIRE" — read `snap.totalAtFireBookValue`.
  - "Years to FIRE message" — value unchanged but caption reflects nominal-$ display context.
  - "Progress card % there" — unchanged (ratio).
- [ ] T055 [P] [US1] Update verdict pill + verdict banner in BOTH HTMLs to read `bookValue` fields where $ amounts appear (e.g., infeasibility deficit, Payoff vs Invest verdict $ delta).
- [ ] T056 [P] [US1] Update Audit-tab tables in BOTH HTMLs: per-column frame labels in headers per FR-007 (e.g., "Total (Book Value)", "Federal Tax (Book Value)", "Taxable Income (purchasing power)"). Frame labels use translated UI strings per FR-005.

### Drag-preview overlay (Phase 5c)

- [ ] T057 [US1] Update FIRE-marker drag-preview overlay in BOTH HTMLs per FR-008a: floating tooltip shows Book Value at previewed target age + purchasing-power companion line. The temporary chart re-render during drag uses Book Value rendering.
- [ ] T058 [US1] Verify FR-008b: post-commit re-render of all in-scope charts uses fresh conversion factor `(1 + inflationRate)^(age − currentAge)` per data point. Add a manual smoke test to the existing drag-preview tests.
- [ ] T059 [US1] Verify FR-008c: drag-cancel reverts all in-scope charts to pre-drag Book Value rendering. Add browser-smoke step.

### i18n + Translation Catalog (Phase 5d — can run in parallel with Phase 5b)

- [ ] T060 [P] [US1] Add new translation keys in `FIRE-Dashboard.html` TRANSLATIONS.en + TRANSLATIONS.zh:
  - `display.frame.bookValue` ("Book Value" / "帳面價值")
  - `display.frame.purchasingPower` ("purchasing power" / "約等於今日價值")
  - `display.frame.assumedInflation` ("assumed annual inflation" / "假設年通膨率")
  - `display.frame.captionTemplate` ("Book Value at {0}% assumed annual inflation" / "帳面價值 (假設年通膨率 {0}%)")
  - `display.frame.bookValueColumnSuffix` ("(Book Value)" / "(帳面價值)")
  - `display.frame.purchasingPowerColumnSuffix` ("(purchasing power)" / "(約等於今日價值)")
- [ ] T061 [P] [US1] LOCKSTEP — apply T060 to `FIRE-Dashboard-Generic.html`.
- [ ] T062 [US1] Update `FIRE-Dashboard Translation Catalog.md` with all 6 new keys.

### Test gates (Phase 5e)

- [ ] T063 [US1] Run `node --test tests/unit/displayConverter.test.js` — 8/8 pass.
- [ ] T064 [US1] Run `node --test tests/meta/snapshot-frame-coverage.test.js` — passes; every chart-consumed field has companion.
- [ ] T065 [US1] Run full unit + audit + meta suite (`node --test tests/unit/*.test.js tests/unit/validation-audit/*.test.js tests/meta/*.test.js`) — all green; no regressions.
- [ ] T066 [US1] Commit Phase 5 work locally with message: "phase5(022): US1 nominal-$ Book Value display across all 14 in-scope charts".

**Checkpoint**: User Story 1 complete. All 14 in-scope charts/displays render in Book Value. Captions + tooltips show purchasing-power companion. Both HTMLs in lockstep. Meta-tests green.

---

## Phase 6: User Story 4 - Country Budget Tier Frame Disambiguation (Priority: P2)

**Goal**: Add tooltip on country-budget tier display per FR-018 clarifying the frame ("Cost in today's $; the dashboard inflates this to your retirement year"). Review `scenarios[].taxNote` strings for frame consistency. No tier number changes.

**Independent Test**: Open Geography → Scenarios pill. Hover the tier dollar amount; tooltip displays the frame disambiguation in EN + zh-TW.

### Implementation for User Story 4

- [ ] T067 [US4] Add tooltip element + `data-i18n-tip="display.frame.countryTierFrameNote"` to country-budget tier display in BOTH HTMLs. New translation key `display.frame.countryTierFrameNote` ("Cost in today's $; the dashboard inflates this to your retirement year for projections" / zh-TW equivalent).
- [ ] T068 [US4] Review each `scenarios[].taxNote` string in BOTH HTMLs for frame consistency. If any `taxNote` references a dollar value that's ambiguous (e.g., "$33k AMT exemption"), explicitly mark as today's $ in the string.
- [ ] T069 [US4] Update `FIRE-Dashboard Translation Catalog.md` with the new `display.frame.countryTierFrameNote` key.
- [ ] T070 [US4] Commit Phase 6 work with message: "phase6(022): US4 country budget tier frame disambiguation".

**Checkpoint**: User Story 4 complete. Country tier frame is unambiguous in both UI tooltip and `taxNote` strings.

---

## Phase 7: User Story 5 - Strategy Ranker Simulator-Discreteness Fix (Priority: P3) — Carry-forward B-021-1

**Goal**: Quantize the ranker's age input to monthly precision in `_simulateStrategyLifetime` per FR-021. The audit's ±0.01yr perturbations no longer cross integer-month boundaries; score deltas collapse below the 0.05yr hysteresis threshold from feature 021 FR-018.

**Independent Test**: Re-run `node --test tests/unit/validation-audit/drag-invariants.test.js`. E3 LOW finding count drops from 17 to 0.

### Tests for User Story 5

- [ ] T071 [P] [US5] Add test "ranker-quantize-01: ±0.01yr perturbation absorbed by monthly quantization" in `tests/unit/strategyRankerHysteresis.test.js`. Synthetic state with currentAge=42.0 and currentAge=42.01; assert `_simulateStrategyLifetime` produces identical accumulation iteration counts.
- [ ] T072 [P] [US5] Add test "ranker-quantize-02: backwards-compat for integer-year inputs". currentAge=42.0, fireAge=55.0; assert yrsToFire=13.0 exactly post-fix (matches pre-fix value).
- [ ] T073 [P] [US5] Add test "ranker-quantize-03: fractional-month input preserved". currentAge=42.0, fireAge=55.5; assert yrsToFire=13.5 exactly post-fix (preserves feature 020 month-precision input).

### Implementation for User Story 5

- [ ] T074 [US5] Update `_simulateStrategyLifetime` inline simulator in `FIRE-Dashboard.html` per research R5 reference impl. Add `currentAgeMonths = Math.floor(currentAge * 12)`, `fireAgeMonths = Math.floor(fireAge * 12)`, `monthsToFire = fireAgeMonths - currentAgeMonths`, `yrsToFire = monthsToFire / 12`. Annotate per `// FRAME: pure-data` rules.
- [ ] T075 [US5] LOCKSTEP — apply T074 to `FIRE-Dashboard-Generic.html`.
- [ ] T076 [US5] Run T071–T073 — all 3 quantize tests green. Run feature 021 hysteresis tests (`tests/unit/strategyRankerHysteresis.test.js`) — all 5 stay green.
- [ ] T077 [US5] Re-run `node --test tests/unit/validation-audit/drag-invariants.test.js` — verify E3 LOW finding count drops from 17 to 0. Document in audit-report.md update during Phase 12.
- [ ] T078 [US5] Commit Phase 7 work with message: "phase7(022): US5 strategy ranker simulator-discreteness fix (B-021-1)".

**Checkpoint**: User Story 5 complete. E3 audit finding count cleared.

---

## Phase 8: User Story 6 - True Fractional-Year DWZ Feasibility (Priority: P3) — Carry-forward B-021-2 / B-020-5

**Goal**: Extend `simulateRetirementOnlySigned` to pro-rate the FIRE-year row by `(1 − m/12)` per FR-022. Combined with US5's monthly quantization, month-precision DWZ feasibility becomes a true fractional-year search.

**Independent Test**: New unit test in `tests/unit/monthPrecisionResolver.test.js` checks fractional-year feasibility for a barely-feasible-at-55 persona. New audit invariant family `month-precision-feasibility` reports 0 findings.

### Spec hook resolution (Phase 8a)

- [ ] T079 [US6] DECISION POINT — pick growth-multiplier convention per spec hook 1: linear `1 + r × (1 − m/12)` vs exponential `(1 + r)^(1 − m/12)`. Recommend **linear** for simplicity; document choice inline + in audit-report.md Phase 9 deferral section.

### Tests for User Story 6

- [ ] T080 [P] [US6] Add test "fractional-year-01: barely feasible at age 55, infeasible at age 54" in `tests/unit/monthPrecisionResolver.test.js`. Use synthetic injected helpers per the existing test pattern. Mock `simulateRetirementOnlySigned` to verify pro-rate logic at fractional fireAge.
- [ ] T081 [P] [US6] Add test "fractional-year-02: feasibility holds at returned month". For any returned `{years: Y, months: M}`, simulating at `fireAge = Y + M/12` produces zero `hasShortfall:true` rows.
- [ ] T082 [P] [US6] Add test "fractional-year-03: integer-year input backwards-compat". When `fireAge` is integer (e.g., 55.0), behavior is byte-identical to feature 020 / 021 simulators.

### Implementation for User Story 6

- [ ] T083 [US6] Update `simulateRetirementOnlySigned` inline simulator in `FIRE-Dashboard.html`. Pro-rate the FIRE-year row by `(1 − m/12)` for fractional `fireAge` inputs. Document the change inline with `// FRAME: pure-data` (age fractions) + `// FRAME: real-$` (the row's $ values). Preserve backwards-compat for integer fireAge calls.
- [ ] T084 [US6] LOCKSTEP — apply T083 to `FIRE-Dashboard-Generic.html`.
- [ ] T085 [US6] Update `calc/fireAgeResolver.js` Edge Case 4 documentation: flip from option (c) "UI display refinement only" to option (b) "true fractional-year feasibility". Update inline contract reference per spec hook 6.
- [ ] T086 [US6] Run T080–T082 — all 3 fractional-year tests green.
- [ ] T087 [US6] Run full unit suite — confirm zero feature 020/021 regressions. The 8 existing month-precision tests should still pass.

### New audit invariant family (Phase 8b)

- [ ] T088 [US6] Create `tests/unit/validation-audit/month-precision-feasibility.test.js` per `contracts/month-precision-feasibility-invariant.md`. Implement MPF-1 (HIGH), MPF-2 (MEDIUM), MPF-3 (LOW) invariants. Run across 92-persona matrix via `runHarness`.
- [ ] T089 [US6] Run `node --test tests/unit/validation-audit/month-precision-feasibility.test.js` — assert 0 MPF-1 HIGH findings.
- [ ] T090 [US6] Commit Phase 8 work with message: "phase8(022): US6 true fractional-year DWZ feasibility (B-021-2 / B-020-5)".

**Checkpoint**: User Story 6 complete. DWZ is now genuinely month-precise. New audit invariant family ships.

---

## Phase 9: Polish & Cross-Cutting (Audit Run + Closeout)

**Purpose**: Run the full audit harness end-to-end, compile findings, write reports, prep browser smoke, closeout.

- [ ] T091 Run the FULL audit harness (`node --test tests/unit/validation-audit/`) — all 7 invariant test files (5 from feature 020 + tax-bracket-conservation from 021 + month-precision-feasibility from 022) run end-to-end. Capture all findings.
- [ ] T092 Compile audit findings into `specs/022-nominal-dollar-display/audit-report.md`. Each finding row: invariantId, personaId, observed, expected, severity, status. Mirror format from feature 020/021 audit-reports.
- [ ] T093 [iterative] Triage CRITICAL findings — target 0 CRITICAL post-feature-022. Reproduce, fix, re-run, mark FIXED with commit hash. Continue until zero CRITICAL.
- [ ] T094 [iterative] Triage HIGH findings — target 0 HIGH post-feature-022. With US5 + US6 fixes, expect zero HIGH findings remaining. Mark FIXED or DEFERRED with rationale.
- [ ] T095 [P] Triage MEDIUM findings — FIXED if trivial / DEFERRED with rationale / WONTFIX with rationale.
- [ ] T096 [P] Triage LOW findings — same triage flow as T095. With US5 quantization, expect E3 LOW count: 17 → 0.
- [ ] T097 Update `specs/022-nominal-dollar-display/audit-report.md` final summary section: totals (CRITICAL: N, HIGH: N, MEDIUM: N, LOW: N), all FIXED/DEFERRED/WONTFIX rows, executive summary paragraph.
- [ ] T098 Run the FULL test suite one final time — `node --test tests/unit/*.test.js tests/unit/validation-audit/*.test.js tests/meta/*.test.js`. Document new total test count (estimated: 449 baseline + ~25 new = ~474 passing, 0 failures, 1 intentional skip).
- [ ] T099 Browser-smoke checklist (T088-equivalent): execute the 10-step checklist in `quickstart.md`. Capture screenshots in `specs/022-nominal-dollar-display/browser-smoke/`. **USER-SIDE GATE** — checklist for the user to execute before merge.
- [ ] T100 Write `specs/022-nominal-dollar-display/CLOSEOUT.md` with: phase-by-phase summary, total commits, total tests added, total findings (by severity), browser-smoke status, merge-readiness statement, lessons codified.
- [ ] T101 Update `BACKLOG.md` to tick off feature 022 + add any DEFERRED findings as backlog items.
- [ ] T102 Update `CLAUDE.md` SPECKIT block to "Active feature: _none_ — feature 022 awaiting user browser-smoke before merge to main".
- [ ] T103 Final commit + push branch to origin. Tag with `feat(022): nominal-dollar display + frame-clarifying comments + B-021 carry-forward` per project conventions.

---

## Phase 10 *(deferred)*: User Story 7 - Display Toggle (Priority: P3 OPTIONAL)

**Goal**: Header toggle between "Purchasing Power" and "Book Value" display modes. Safety-valve fallback to P5 Option B if always-Book-Value display causes UX confusion in user feedback.

**⚠️ DEFER UNLESS NEEDED**: After feature 022 ships and user has 1-2 weeks of feedback. If user is comfortable with always-Book-Value display: SKIP this phase. If user reports confusion: implement.

### Implementation for User Story 7 (only if user-validation triggers)

- [ ] T104 [US7] Add header toggle element + i18n keys (`display.frame.toggle.bookValue` / `display.frame.toggle.purchasingPower`) in BOTH HTMLs.
- [ ] T105 [US7] Wire localStorage `displayDollarMode` ('bookValue' | 'purchasingPower', default 'bookValue') to PERSIST_IDS. Default ON ('bookValue') matches feature 022 ship state.
- [ ] T106 [US7] Implement render-mode switch: when `displayDollarMode === 'purchasingPower'`, all chart renderers read `<field>` (real-$) instead of `<field>BookValue`. Captions update. Tooltip companion line flips polarity.
- [ ] T107 [US7] Add toggle tests + browser-smoke step. Lockstep both HTMLs.
- [ ] T108 [US7] Commit Phase 10 work with message: "phase10(022): US7 display toggle (P5 Option B fallback)". Update CLOSEOUT.md.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001–T002 — verification only.
- **Foundational (Phase 2)**: T003–T010 — `displayConverter.js` + meta-test scaffolding. **BLOCKS all user stories** (US1 needs the module + meta-test; US2 needs the meta-test; US3/US5/US6 don't strictly need the module but happen to need the FRAME comment infrastructure that US2 ships).
- **US2 (Phase 3, P1)**: T011–T025 — `// FRAME:` annotations across calc layer. INDEPENDENT of US1/US3/US4/US5/US6 once Phase 2 ships. Sequenced before US3 so annotations capture pre-fix state first.
- **US3 (Phase 4, P1)**: T026–T039 — calc-frame fix in `accumulateToFire.js`. INDEPENDENT of US1/US2 once Phase 2 ships. Sequenced before US1 because US1's `_extendSnapshotWithBookValues` reads real-$ fields that US3 corrects.
- **US1 (Phase 5, P1 / MVP)**: T040–T066 — central recalcAll() snapshot extension + 14 chart wirings + drag-preview + i18n. Depends on Phase 2 + Phase 4 (US3) for clean real-$ values feeding the conversion.
- **US4 (Phase 6, P2)**: T067–T070 — country tier disambiguation. INDEPENDENT.
- **US5 (Phase 7, P3)**: T071–T078 — ranker quantization. INDEPENDENT of all other user stories.
- **US6 (Phase 8, P3)**: T079–T090 — fractional-year DWZ + new audit invariant family. INDEPENDENT.
- **Polish (Phase 9)**: T091–T103 — depends on Phases 3–8 complete.
- **US7 (Phase 10, P3 OPTIONAL)**: T104–T108 — DEFERRED unless user-validation triggers.

### User Story Dependencies

- **US2 (P1)**: blocks no one once Phase 2 ships.
- **US3 (P1)**: blocks US1 (US1 reads US3's fixed real-$ residual). NOT blocked by US2/US4/US5/US6.
- **US1 (P1 / MVP)**: depends on US3 + Phase 2.
- **US4 (P2)**: NOT blocked. Can ship in parallel with US1/US2/US3.
- **US5 (P3)**: NOT blocked. Can ship in parallel with US1/US2/US3.
- **US6 (P3)**: NOT blocked. Can ship in parallel with US1/US2/US3.
- **US7 (P3 OPTIONAL)**: depends on US1 (toggle has nothing to switch off without US1).

### Within Each User Story

- Tests MUST be written and FAIL before implementation per Constitution IV (TDD-first).
- For US3: write all 8 v4-FRAME tests first (T026–T033), then implement T034–T039.
- For US5: write 3 quantize tests first (T071–T073), then implement T074–T078.
- For US6: write 3 fractional-year tests first (T080–T082), then implement T083–T090.
- For US1: snapshot extension (T040–T042) lands first, then chart renderers (T043–T056) which can run mostly in parallel since they touch different chart-render functions in the same files.

### Parallel Opportunities

- T002, T004, T007, T008: Foundational verification + tests in parallel.
- T011–T021: All 16 calc-module annotation tasks in parallel (different files).
- T026–T033: All 8 US3 calc tests in parallel (same file but independent test cases).
- T045–T056: 12 chart renderer tasks in parallel (different chart-render functions).
- T060/T061: lockstep i18n in parallel.
- US2 / US4 / US5 / US6 phases: 4 parallel agent tracks possible after Phase 2 lands.

---

## Parallel Example: User Story 1 (MVP)

```bash
# Phase 2 foundational tasks (parallel after T003 lands):
Task: "T004 [P] Write tests/unit/displayConverter.test.js with 8 IRS-style inflation cases"
Task: "T007 [P] Create tests/meta/frame-coverage.test.js"
Task: "T008 [P] Create tests/meta/snapshot-frame-coverage.test.js"

# US2 calc-module annotations — 16 files in parallel:
Task: "T011 [P] [US2] Annotate calc/accumulateToFire.js"
Task: "T012 [P] [US2] Annotate calc/taxBrackets.js"
Task: "T013 [P] [US2] Annotate calc/taxExpenseRow.js"
# ... (all 11 files)

# US3 calc tests — 8 in parallel:
Task: "T026 [P] [US3] v4-FRAME-01 conservation"
Task: "T027 [P] [US3] v4-FRAME-02 raiseRate=inflationRate"
# ... (all 8 tests)

# US1 chart renderer wiring — 12 charts in parallel after T040–T042 land:
Task: "T045 [P] [US1] Withdrawal Strategy chart renderer"
Task: "T046 [P] [US1] Drawdown chart renderer"
Task: "T047 [P] [US1] Roth Ladder chart renderer"
# ... (all 12 charts)
```

---

## Implementation Strategy

### MVP First (US3 → US1)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational `displayConverter.js` + meta-tests).
2. Complete Phase 3 (US2 `// FRAME:` annotations) — purely additive; no behavior change.
3. Complete Phase 4 (US3 calc-frame fix).
4. Complete Phase 5 (US1 nominal-$ display across 14 charts).
5. **STOP and VALIDATE**: Run all tests + browser-load both dashboards. Verify Lifecycle chart shows ~$1,126k at age 53 for RR-baseline. Demoable as "Phase A: Book Value display + frame-fix MVP".

### Incremental Delivery

1. Setup + Foundational → `displayConverter.js` shipped, meta-tests in place.
2. US2 → `// FRAME:` annotations across calc layer. Demoable via `node --test tests/meta/frame-coverage.test.js`.
3. US3 → calc-frame bug fixed. Demoable via test suite.
4. US1 → nominal-$ Book Value display. Demoable in browser. **Primary user feature.**
5. US4 → country tier disambiguation. Demoable.
6. US5 → ranker stability. Demoable via audit re-run.
7. US6 → fractional-year DWZ + new audit family. Demoable via audit re-run.
8. Polish → audit run, closeout, browser smoke, merge.

### Parallel Team Strategy

With multiple agents (matches features 020 + 021 4-wave dispatch):

1. **Wave 1 (Manager)**: Phases 1–2 (T001–T010) — sequential, ~1 hour.
2. **Wave 2 (Backend Engineer A + B in parallel)**:
   - Backend A: US2 annotations (T011–T025).
   - Backend B: US3 calc-frame fix (T026–T039).
3. **Wave 3 (Frontend Engineer)**: US1 (T040–T066) after Wave 2 commits land.
4. **Wave 4 (parallel agents)**:
   - Frontend B: US4 (T067–T070).
   - Backend C: US5 (T071–T078).
   - Backend D: US6 (T079–T090).
5. **Wave 5 (Manager)**: Phase 9 polish + closeout (T091–T103) — sequential.
6. **Wave 6 (deferred)**: US7 only if user-validation feedback triggers.

---

## Notes

- Tests are NOT optional in this feature — Constitution Principle IV mandates fixture coverage for every calc change. The new `tax-bracket-conservation` family (feature 021) and `month-precision-feasibility` family (US6) are deliverables.
- Lockstep RR + Generic enforced at every UI/calc-changing task (Principle I).
- US3 calc-frame fix WILL change pinned dollar values in some `tests/unit/accumulateToFire.test.js` cases. T036 budgets ~30 min per affected test for `// 022:` annotations.
- The 022 branch must NOT be merged to `main` until ALL CRITICAL and HIGH findings are FIXED AND the user signs off on browser smoke (T099).
- Stop at any checkpoint to validate before proceeding. The MVP checkpoint after Phase 5 is intentionally a viable mid-feature demo.
- US7 (Phase 10) is OPTIONAL and ships only after user-validation feedback on US1's always-Book-Value display.
- Avoid: vague task descriptions, same-file conflicts in parallel tasks, cross-story dependencies that break independence.
