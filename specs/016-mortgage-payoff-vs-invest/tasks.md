---
description: "Task list for feature 016 — Mortgage Payoff vs Invest comparison pill"
---

# Tasks: Mortgage Payoff vs. Invest Comparison

**Input**: Design documents from `specs/016-mortgage-payoff-vs-invest/`
**Prerequisites**: [`plan.md`](./plan.md), [`spec.md`](./spec.md), [`research.md`](./research.md), [`data-model.md`](./data-model.md), [`contracts/`](./contracts/), [`quickstart.md`](./quickstart.md)

**Tests**: REQUIRED. Constitution Principle IV (Gold-Standard Regression Coverage, NON-NEGOTIABLE) and the spec's SC-008 / SC-009 / SC-010 mandate fixture-locked unit tests. Browser smoke regression also required for SC-004 (zero-impact-on-other-charts).

**Organization**: Tasks are grouped by user story (US1 P1 = MVP, US2 P2, US3 P3). Constitution Principle I (Dual-Dashboard Lockstep, NON-NEGOTIABLE) duplicates many UI tasks across `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html`; both are explicitly listed.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Maps task to user story for traceability (US1, US2, US3)
- File paths are exact

## Path Conventions

This project's established structure (post-feature-015):

- `FIRE-Dashboard.html` — RR (personalized) dashboard
- `FIRE-Dashboard-Generic.html` — Generic dashboard
- `calc/` — pure JS sidecar modules (UMD-loadable per Constitution Principle V)
- `tests/unit/` — Node `--test` unit tests for calc modules
- `tests/baseline/` — browser smoke harness
- `FIRE-Dashboard Translation Catalog.md` — i18n catalog (Principle VII)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create empty scaffold files so subsequent tasks can fill them in.

- [ ] T001 [P] Create empty stub `calc/payoffVsInvest.js` with the mandatory module-header comment (per `contracts/payoffVsInvest-calc.contract.md` "Module header" section), a placeholder `function computePayoffVsInvest(inputs) { return { disabledReason: 'not-implemented' }; }`, and the UMD wrapper at the bottom.
- [ ] T002 [P] Create empty stub `tests/unit/payoffVsInvest.test.js` with `import { test } from 'node:test'`, `import assert from 'node:assert'`, the `extractFn` / Function-eval harness pattern matching `tests/unit/strategies.test.js`, and a single placeholder `test('module loads', () => { assert.ok(true); })`.

**Checkpoint**: Empty calc module and test file exist; subsequent tasks can target specific functions inside them.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The pure calc module + tab-router registration. Every UI piece depends on these.

**⚠️ CRITICAL**: No user-story UI work can begin until Phase 2 completes (calc module passes its unit tests).

### Calc module implementation (`calc/payoffVsInvest.js`)

- [ ] T003 Implement `_pmt(principal, monthlyRate, totalMonths)` and `_amortize(balance, annualRate, termYears, monthsToSimulate, extraPrincipalPerMonth)` and `_compoundInvested(start, monthlyContrib, monthlyRealReturn, months)` helpers in `calc/payoffVsInvest.js` (per `contracts/payoffVsInvest-calc.contract.md` "Public API surface").
- [ ] T004 Implement input validation + early-return paths (`disabledReason: 'no-mortgage' | 'already-paid-off' | 'invalid-ages'`) in `calc/payoffVsInvest.js`.
- [ ] T005 Implement core month-stepped simulation loop in `computePayoffVsInvest` covering both Prepay and Invest paths from `currentAge` through `endAge` in `calc/payoffVsInvest.js` (per `contracts/payoffVsInvest-calc.contract.md` "Core algorithm").
- [ ] T006 Implement planned-refi handling inside the month loop in `calc/payoffVsInvest.js` (rate change at refi-year, term reset, new P&I recompute, per research.md R5).
- [ ] T007 Implement `detectCrossover(prepayPath, investPath)` with linear interpolation between adjacent year rows in `calc/payoffVsInvest.js` (per research.md R6).
- [ ] T008 Implement `computeVerdict(prepayPath, investPath, fireAge, endAge)` including tie threshold (margin < 0.5 % of larger trajectory) in `calc/payoffVsInvest.js`.
- [ ] T009 Implement `_evaluateFactors(inputs, prepayPath, investPath)` emitting all required factor keys (`real-spread`, `nominal-mortgage-rate`, `effective-mortgage-rate` when override active, `expected-stocks-return-after-tax`, `time-horizon-years`, `mortgage-years-remaining`, `ltcg-tax-drag`, `mortgage-payoff-before-fire`, `planned-refi-active`) with `favoredStrategy` and `magnitude` per `data-model.md` "Factor" section.
- [ ] T010 Implement effective-mortgage-rate-override application: rescale Prepay path's economic interest cost in the verdict + factor calculation only, NOT in the amortization schedule (per research.md R4) in `calc/payoffVsInvest.js`.
- [ ] T011 Emit `subSteps[]` in execution order per `contracts/payoffVsInvest-calc.contract.md` "subSteps emission" section, then assemble final `PrepayInvestComparisonOutputs` record at the end of `computePayoffVsInvest`.

### Calc module tests (`tests/unit/payoffVsInvest.test.js`)

- [ ] T012 [P] Write fixture test "Prepay clearly wins" (mortgage 8 %, stocks 4 %, infl 3 %) asserting `winnerAtFire === 'prepay' && winnerAtEnd === 'prepay'` in `tests/unit/payoffVsInvest.test.js`.
- [ ] T013 [P] Write fixture test "Invest clearly wins" (mortgage 3 %, stocks 8 %, infl 3 %) asserting `winnerAtFire === 'invest' && winnerAtEnd === 'invest'` in `tests/unit/payoffVsInvest.test.js`.
- [ ] T014 [P] Write fixture test "Tie calibration" (mortgage rate equal to stocks-after-tax-real) asserting `marginAtFire / max(totalNetWorth) < 0.01` in `tests/unit/payoffVsInvest.test.js` (covers SC-003).
- [ ] T015 [P] Write fixture test "Refi mid-window" (starting 7 %, refi at year 5 → 4 % at 30y term) asserting interest-paid jumps visibly at refi-year and verdict shifts toward Invest vs no-refi in `tests/unit/payoffVsInvest.test.js` (covers SC-009).
- [ ] T016 [P] Write fixture test "Override shifts toward Invest" (nominal 6 %, override 4 %, otherwise tie) asserting verdict at FIRE is Invest and `factors` includes an `effective-mortgage-rate` row in `tests/unit/payoffVsInvest.test.js` (covers SC-010).
- [ ] T017 [P] Write fixture tests for disabled paths (`mortgageEnabled: false` → `disabledReason === 'no-mortgage'`; `ownership: 'already-own', yearsPaid: 30, term: 30` → `disabledReason === 'already-paid-off'`) in `tests/unit/payoffVsInvest.test.js`.
- [ ] T018 [P] Write fixture test "Refi-clamped to buy-in" (`ownership: 'buying-in', buyInYears: 5, refiYear: 3`) asserting `refiAnnotation.refiAge === currentAge + 5` in `tests/unit/payoffVsInvest.test.js`.
- [ ] T019 [P] Write fixture test "Determinism" calling `computePayoffVsInvest` twice with identical inputs asserting `JSON.stringify(out1) === JSON.stringify(out2)` in `tests/unit/payoffVsInvest.test.js`.
- [ ] T020 [P] Write fixture test "Monotonicity" (extraMonthly = 0 → 1000 → 2000 with otherwise-Invest-winning inputs) asserting `marginAtFire(2000) ≥ marginAtFire(1000) ≥ marginAtFire(0)` in `tests/unit/payoffVsInvest.test.js` (covers SC-002).
- [ ] T021 Run `node --test tests/unit/payoffVsInvest.test.js` and iterate on `calc/payoffVsInvest.js` until all 10 fixture cases pass.

### Tab router registration

- [ ] T022 Add `Object.freeze({ id: 'payoff-invest', labelKey: 'nav.pill.payoffInvest' })` between the `mortgage` and `expenses` entries in the `plan` tab's `pills` array inside `calc/tabRouter.js`.
- [ ] T023 [P] Add a one-line assertion in `tests/unit/tabRouter.test.js` verifying `payoff-invest` is in the Plan tab's pill list and route activation lands correctly.
- [ ] T024 Run `node --test tests/unit/tabRouter.test.js` and confirm green.

### Browser-smoke regression test extension

- [ ] T025 Extend `tests/baseline/browser-smoke.test.js` with a new assertion: load both HTML files, snapshot data series of every existing chart (Lifecycle, Withdrawal, SS, Country, NetWorthPie, Timeline), navigate to Plan → Payoff vs Invest, navigate back, snapshot again, assert byte-equality (covers SC-004).

**Checkpoint**: Calc module passes its 10 fixture tests; tab router knows about the new pill; browser-smoke regression scaffold ready. UI work can begin.

---

## Phase 3: User Story 1 — "Tell me which path wins at MY numbers" (Priority: P1) 🎯 MVP

**Goal**: User opens Plan → Payoff vs Invest, sees two trajectory lines (Prepay + Invest) plotted from today through plan-end age, sees a Verdict banner naming the winner at FIRE-age and at plan-end with dollar margins, and sees a third "Where each dollar goes" amortization chart visualizing the front-loaded-interest dynamic. The user can adjust the extra-monthly slider and the framing toggle. The pill behaves correctly when the mortgage is disabled or paid off.

**Independent Test**: With default RR inputs (mortgage 6.5 %, stocks 7 %, infl 3 %, FIRE in 9 years, $500/mo extra), open the new pill on either HTML file. Both trajectory lines render. The verdict banner displays with concrete winners and dollar margins. The amortization chart shows the early-years-mostly-interest curve. Toggling the extra-monthly slider updates both charts within 200 ms. Toggling 中文 flips every label. Disabling the mortgage shows the explainer card with no NaN values and no console errors.

### HTML scaffolding (lockstep — both files in same change set per Principle I)

- [ ] T026 [US1] Add the `<div class="pill-host" data-tab="plan" data-pill="payoff-invest" hidden>` block to `FIRE-Dashboard.html` between the `mortgage` and `expenses` pill-hosts, including the section title, subtitle, three canvases (`payoffVsInvestWealthChart`, `payoffVsInvestAmortizationChart`, optional `payoffVsInvestVerdictMini`), the verdict banner shell, the Factor Breakdown card placeholder, the explainer card placeholder, the extra-monthly slider, the framing radio group, and the next-pill button.
- [ ] T027 [US1] Mirror the same `<div class="pill-host">` block to `FIRE-Dashboard-Generic.html`.

### CSS

- [ ] T028 [P] [US1] Add CSS rules for `.pvi-*` classes (verdict banner styling, framing-radio styling, explainer-card styling, factor-row styling) to `FIRE-Dashboard.html`.
- [ ] T029 [P] [US1] Mirror the same CSS rules to `FIRE-Dashboard-Generic.html`.

### Bilingual i18n keys (US1 subset)

- [ ] T030 [P] [US1] Add EN and zh-TW values for `nav.pill.payoffInvest`, `pvi.section.title`, `pvi.section.subtitle`, `pvi.input.extraMonthly`, `pvi.input.framing`, `pvi.input.framing.total`, `pvi.input.framing.liquid`, `pvi.chart.wealth.title`, `pvi.chart.wealth.prepay`, `pvi.chart.wealth.invest`, `pvi.chart.wealth.crossover`, `pvi.chart.wealth.callout`, `pvi.chart.amort.title`, `pvi.amort.prepay.interest`, `pvi.amort.prepay.principal`, `pvi.amort.invest.interest`, `pvi.amort.invest.principal`, `pvi.verdict.winsBy`, `pvi.verdict.tie`, `pvi.disabled.noMortgage`, `pvi.disabled.alreadyPaid` to both `TRANSLATIONS.en` and `TRANSLATIONS.zh` in `FIRE-Dashboard.html` (per `contracts/payoffVsInvest-charts.contract.md` "i18n key registry").
- [ ] T031 [P] [US1] Mirror the same i18n keys to `FIRE-Dashboard-Generic.html`.
- [ ] T032 [P] [US1] Append a new "Payoff vs Invest" section to `FIRE-Dashboard Translation Catalog.md` listing every key added in T030/T031.

### Input assembly + chart renderer + recompute orchestrator

- [ ] T033 [US1] Implement `_assemblePayoffVsInvestInputs()` in `FIRE-Dashboard.html` that reads existing dashboard state (mortgage inputs from `getMortgageInputs()`, ages, stocks return, inflation, LTCG rate, stockGainPct, fireAge from `_cs().state`, endAge) plus the new pill-local DOM inputs (`pviExtraMonthly`, `pviFramingTotal/Liquid` radio) and returns a `PrepayInvestComparisonInputs` record per `data-model.md`.
- [ ] T034 [US1] Mirror `_assemblePayoffVsInvestInputs()` to `FIRE-Dashboard-Generic.html` (using `agePerson1` instead of `ageRoger`, `person1Stocks + person2Stocks` instead of RR-specific inputs).
- [ ] T035 [US1] Implement `renderPayoffVsInvestWealthChart(outputs)` in `FIRE-Dashboard.html` per `contracts/payoffVsInvest-charts.contract.md` "Chart 1 — Wealth Trajectory": two line datasets (Prepay + Invest), optional Crossover marker dataset, optional Refi annotation dataset, `interaction: { mode: 'index', intersect: false }` tooltip, subtitle showing the verdict callout. Register with `tabRouter.registerChart('payoff-invest', chart)`.
- [ ] T036 [US1] Mirror `renderPayoffVsInvestWealthChart` to `FIRE-Dashboard-Generic.html`.
- [ ] T037 [US1] Implement `renderPayoffVsInvestAmortizationChart(outputs)` in `FIRE-Dashboard.html` per `contracts/payoffVsInvest-charts.contract.md` "Chart 2 — Where each dollar goes": stacked grouped-bar chart with four datasets (Prepay-interest, Prepay-principal, Invest-interest, Invest-principal). Register with `tabRouter.registerChart('payoff-invest', chart)`.
- [ ] T038 [US1] Mirror `renderPayoffVsInvestAmortizationChart` to `FIRE-Dashboard-Generic.html`.
- [ ] T039 [US1] Implement `renderPayoffVsInvestVerdictBanner(verdict, inputs)` in `FIRE-Dashboard.html`: writes the bilingual sentence `"{winner} wins by ${margin} at FIRE (age {fireAge})"` and `"...at plan-end (age {endAge})"` using `t('pvi.verdict.winsBy')`. Handles tie cases via `t('pvi.verdict.tie')`.
- [ ] T040 [US1] Mirror `renderPayoffVsInvestVerdictBanner` to `FIRE-Dashboard-Generic.html`.
- [ ] T041 [US1] Implement `_renderPayoffVsInvestExplainerCard(disabledReason)` in `FIRE-Dashboard.html` rendering the `pvi.disabled.noMortgage` / `pvi.disabled.alreadyPaid` message when the calc module returns a `disabledReason`. Hide the three chart canvases and the verdict banner when active.
- [ ] T042 [US1] Mirror `_renderPayoffVsInvestExplainerCard` to `FIRE-Dashboard-Generic.html`.
- [ ] T043 [US1] Implement `recomputePayoffVsInvest()` orchestrator in `FIRE-Dashboard.html`: assembles inputs, calls `computePayoffVsInvest`, branches on `disabledReason` to either render the explainer card OR render the three views (wealth chart + amortization chart + verdict banner).
- [ ] T044 [US1] Mirror `recomputePayoffVsInvest()` to `FIRE-Dashboard-Generic.html`.

### Wiring into recalcAll + input handlers + state persistence

- [ ] T045 [US1] Add `try { recomputePayoffVsInvest(); } catch (_e) {}` at the END of `recalcAll()` in `FIRE-Dashboard.html` (after every existing chart re-render finishes; per `contracts/payoffVsInvest-state.contract.md` "Where it plugs into recalcAll").
- [ ] T046 [US1] Mirror that recalcAll wiring to `FIRE-Dashboard-Generic.html`.
- [ ] T047 [US1] Wire input handlers (`oninput` on `pviExtraMonthly`, `onchange` on `pviFramingTotal`/`pviFramingLiquid`) to call `recomputePayoffVsInvest()` directly (NOT `recalcAll()`) and `saveState()` in `FIRE-Dashboard.html`.
- [ ] T048 [US1] Mirror input-handler wiring to `FIRE-Dashboard-Generic.html`.
- [ ] T049 [US1] Extend `saveState()` in `FIRE-Dashboard.html` to write `state._payoffVsInvest = { extraMonthly, framing, refiEnabled: false, refiYear: 5, refiNewRate: 0.05, refiNewTerm: 30, effRateOverrideEnabled: false, effRateOverride: 0 }` per `contracts/payoffVsInvest-state.contract.md` "localStorage schema".
- [ ] T050 [US1] Mirror `saveState` extension to `FIRE-Dashboard-Generic.html`.
- [ ] T051 [US1] Extend `restoreState()` in `FIRE-Dashboard.html` to read `state._payoffVsInvest` (if present) and write the values back to each DOM input. Defaults: extraMonthly=500, framing='totalNetWorth', refiEnabled=false, effRateOverrideEnabled=false.
- [ ] T052 [US1] Mirror `restoreState` extension to `FIRE-Dashboard-Generic.html`.

### Manual smoke verification (US1)

- [ ] T053 [US1] Open `FIRE-Dashboard.html` in a browser, navigate Plan → Payoff vs Invest, verify: trajectory chart renders with two lines + crossover marker (if any); amortization chart renders with stacked bars; verdict banner shows winner + margins; extra-monthly slider drag updates both charts within ~200 ms with no other dashboard chart's numbers changing; framing toggle flips Total ↔ Liquid; 中文 toggle flips every visible label.
- [ ] T054 [US1] Repeat T053 against `FIRE-Dashboard-Generic.html`.
- [ ] T055 [US1] Disable the mortgage scenario in both files; verify the explainer card replaces the three charts; no NaN; zero console errors.

**Checkpoint**: User Story 1 fully functional. The MVP is shippable: user can answer "which path wins at my numbers?" and visually see the front-loaded-interest dynamic. SC-001 (perf budgets), SC-002 (slider monotonicity), SC-004 (no impact on other charts), SC-005 (zero NaN on disabled), SC-006 (bilingual flip) are all verified at this point.

---

## Phase 4: User Story 2 — "Show me which factors matter most" (Priority: P2)

**Goal**: A Factor Breakdown card sits beside the wealth chart listing 5+ factors as rows (each with a current numeric value and a directional arrow `▲ Invest` / `▼ Prepay` / `◇ Neutral`). Users can also enable a planned refi (refi-year + new rate + new term) AND/OR an effective-rate override slider; both update the Factor Breakdown row state and re-render the trajectory + amortization charts.

**Independent Test**: With US1 already shipped, open the pill. The Factor Breakdown card lists at least: real-spread, time-horizon, ltcg-drag, mortgage-years-remaining, mortgage-payoff-before-fire. Each row has a value and an arrow. Move the inflation slider; the real-spread row's value updates within 200 ms and possibly its arrow flips. Enable the refi toggle; the refi-year + new-rate + new-term inputs become editable, the trajectory chart shows a refi annotation marker, the amortization chart's interest curve jumps at refi-year, and a `planned-refi-active` factor row appears in the breakdown. Enable the effective-rate override; the verdict shifts toward Invest as the override drops, and an `effective-mortgage-rate` row appears in the breakdown.

### HTML scaffolding for Factor Breakdown + Refi inputs + Override input (lockstep)

- [ ] T056 [US2] Inside the existing `data-pill="payoff-invest"` block in `FIRE-Dashboard.html`, add the Factor Breakdown card HTML (a `<div id="payoffVsInvestFactorList">` placeholder), the Planned Refi sub-card (checkbox + 3 inputs: refi-year slider, new-rate number, new-term `<select>`), and the Effective-rate Override sub-card (checkbox + slider).
- [ ] T057 [US2] Mirror the same scaffolding to `FIRE-Dashboard-Generic.html`.

### Bilingual i18n keys (US2 additional)

- [ ] T058 [P] [US2] Add EN and zh-TW values for `pvi.input.refi.enable`, `pvi.input.refi.year`, `pvi.input.refi.newRate`, `pvi.input.refi.newTerm`, `pvi.input.effRate.title`, `pvi.input.effRate.hint`, `pvi.factor.realSpread.label`, `pvi.factor.timeHorizon.label`, `pvi.factor.ltcgDrag.label`, `pvi.factor.mortgageRemaining.label`, `pvi.factor.naturalPayoff.label`, `pvi.factor.effectiveRateOverride.label`, `pvi.factor.plannedRefi.label`, `pvi.factor.favors.prepay`, `pvi.factor.favors.invest`, `pvi.factor.favors.neutral`, `pvi.refi.clamped` to both `TRANSLATIONS.en` and `TRANSLATIONS.zh` in `FIRE-Dashboard.html`.
- [ ] T059 [P] [US2] Mirror the same i18n keys to `FIRE-Dashboard-Generic.html`.
- [ ] T060 [P] [US2] Append the US2-specific keys to the "Payoff vs Invest" section of `FIRE-Dashboard Translation Catalog.md`.

### Factor Breakdown renderer + new-input wiring

- [ ] T061 [US2] Implement `renderPayoffVsInvestFactorBreakdown(factors)` in `FIRE-Dashboard.html`: builds a list of rows from the `Factor[]` output, each row showing `t(factor.i18nKey)` + `factor.valueDisplay` + a directional badge from `t('pvi.factor.favors.{prepay|invest|neutral}')`. The CSS class on each row's badge varies by `magnitude` (dominant rows visually emphasized).
- [ ] T062 [US2] Mirror `renderPayoffVsInvestFactorBreakdown` to `FIRE-Dashboard-Generic.html`.
- [ ] T063 [US2] Extend `_assemblePayoffVsInvestInputs()` in `FIRE-Dashboard.html` to also read `pviRefiEnabled`, `pviRefiYear`, `pviRefiNewRate`, `pviRefiNewTerm`, `pviEffRateOverrideEnabled`, `pviEffRateOverride` and assemble `plannedRefi` (when enabled) and `effectiveRateOverride` (when enabled) into the inputs record.
- [ ] T064 [US2] Mirror that input-assembly extension to `FIRE-Dashboard-Generic.html`.
- [ ] T065 [US2] Wire `oninput` / `onchange` on every refi input (`pviRefiEnabled`, `pviRefiYear`, `pviRefiNewRate`, `pviRefiNewTerm`) to call `recomputePayoffVsInvest()` + `saveState()` in `FIRE-Dashboard.html`. Toggling `pviRefiEnabled` MUST also enable/disable the three refi-detail inputs visually.
- [ ] T066 [US2] Mirror refi input-handler wiring to `FIRE-Dashboard-Generic.html`.
- [ ] T067 [US2] Wire `oninput` / `onchange` on the effective-rate override controls (`pviEffRateOverrideEnabled` checkbox + `pviEffRateOverride` slider) to call `recomputePayoffVsInvest()` + `saveState()` in `FIRE-Dashboard.html`. Toggling the checkbox enables/disables the slider visually.
- [ ] T068 [US2] Mirror override input-handler wiring to `FIRE-Dashboard-Generic.html`.
- [ ] T069 [US2] Extend the wealth-trajectory chart renderer in `FIRE-Dashboard.html` to draw the refi annotation marker (a vertical line + label at refi-age) when `outputs.refiAnnotation != null` per FR-020.
- [ ] T070 [US2] Mirror refi-annotation chart logic to `FIRE-Dashboard-Generic.html`.
- [ ] T071 [US2] Update `recomputePayoffVsInvest()` in `FIRE-Dashboard.html` to call `renderPayoffVsInvestFactorBreakdown(outputs.factors)` after the existing render calls.
- [ ] T072 [US2] Mirror that update to `FIRE-Dashboard-Generic.html`.

### Manual smoke verification (US2)

- [ ] T073 [US2] Open `FIRE-Dashboard.html`, navigate to the pill, verify Factor Breakdown card lists at least 5 factors with values and arrows, drag the inflation slider to confirm `real-spread` row updates within 200 ms, enable the refi toggle and confirm the trajectory chart shows the refi annotation, enable the override and confirm the verdict shifts toward Invest as override drops below nominal.
- [ ] T074 [US2] Repeat T073 against `FIRE-Dashboard-Generic.html`.

**Checkpoint**: User Story 2 fully functional. SC-007 (≥ 5 factors visible, arrows update on input change) and SC-010 (override-shifts-toward-invest invariant) verified at this point.

---

## Phase 5: User Story 3 — "Tell me when the extra-amount slider changes the answer" (Priority: P3)

**Goal**: Verify (no new code) that sweeping the extra-monthly slider from $0 to $5,000 produces a monotonically larger (or equal) winner-margin in the verdict, demonstrating the slider answers the "does it depend on how much I have" question.

**Independent Test**: With both prior stories shipped, open the pill, set the slider to $0 → confirm verdict reads tie or no-extra-cash. Drag to $1000, $2000, $5000 → confirm the winner remains the same direction and the margin grows monotonically. The unit test T020 already locks this invariant; this manual verification confirms the UI surfaces the same behavior.

- [ ] T075 [US3] Manual verification: drag `pviExtraMonthly` from $0 → $5,000 in $500 increments on `FIRE-Dashboard.html`; for each step, confirm the wealth-trajectory chart updates and the verdict-banner margin moves in a single direction (or stays at zero in the slider=$0 case).
- [ ] T076 [US3] Repeat T075 against `FIRE-Dashboard-Generic.html`.

**Checkpoint**: All three user stories shipped and verified. Feature is complete.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final polish, regression safety, and documentation.

- [ ] T077 [P] Run the full unit test suite (`node --test tests/unit/*.test.js`) and confirm all 289 + 10 new tests pass green.
- [ ] T078 [P] Run the browser smoke harness (`node tests/baseline/browser-smoke.test.js`) and confirm the snapshot-before / snapshot-after assertion (T025) passes — proving SC-004 (no impact on other charts).
- [ ] T079 Update `BACKLOG.md` to add a "Done in feature 016" CHANGELOG entry pointing at this feature directory.
- [ ] T080 Update the README.md "Features" section to add a one-line bullet for the Payoff-vs-Invest pill (mention: visualizes prepay vs invest year-by-year, shows front-loaded-interest dynamic, supports planned refi + state-MID effective-rate override).
- [ ] T081 [P] Open both HTML files in a browser via `file://` (double-click) and confirm the pill renders and reacts to inputs without a local web server (Constitution Principle V file-protocol gate).
- [ ] T082 Walk every Edge Cases bullet from `spec.md` (mortgage off, paid off, payoff before FIRE, buy-in deferred, refi-after-payoff, refi-extends-past-end, refi-before-buy-in, plan-end before payoff, $0 extra) and confirm each renders correctly with no errors.
- [ ] T083 Run a final quality pass on the spec checklist (`specs/016-mortgage-payoff-vs-invest/checklists/requirements.md`); update any items that are now verified post-implementation.
- [ ] T084 Create `specs/016-mortgage-payoff-vs-invest/CLOSEOUT.md` summarizing what shipped, the two HTML file diffs at a glance, the test count delta, and any deferred follow-ups.
- [ ] T085 Update `CLAUDE.md`'s active-feature pointer between the SPECKIT markers from "ready for /speckit-implement" to "merged on YYYY-MM-DD" once the PR lands.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies. T001 and T002 are parallelizable.
- **Phase 2 (Foundational)**: Depends on Phase 1. T003–T011 are mostly sequential within `calc/payoffVsInvest.js` (one file). T012–T020 (tests) are parallelizable with each other and with calc-module work, but T021 (run tests) requires T011 + T020 done. T022–T024 (tab router) and T025 (browser smoke extension) are independent of the calc module.
- **Phase 3 (US1)**: Requires Phase 2 complete (calc module passes its tests). Within Phase 3:
  - T026/T027 (HTML scaffolding) before T028–T070 anything that targets the new DOM ids.
  - T028/T029 (CSS) parallelizable with T030–T032 (i18n).
  - T030–T032 (i18n) parallelizable across both files.
  - T033–T044 (renderers) require T026/T027 + T030/T031 done. The two-file pairs (T033/T034, T035/T036, …) are typically serialized within a single dev session for review-friendliness, but a parallel team could split them.
  - T045–T052 (recalcAll wiring + state persistence) require renderers to exist.
  - T053–T055 (manual smoke) gate Phase 3 completion.
- **Phase 4 (US2)**: Requires Phase 3 complete. Same pattern: HTML → CSS → i18n → renderers → wiring → smoke.
- **Phase 5 (US3)**: Requires Phase 3 complete (no new code; only verifies existing behavior).
- **Phase 6 (Polish)**: Requires all stories shipped.

### Within Each User Story

- HTML scaffolding before any renderer that targets the new DOM elements.
- Lockstep file pairs (RR + Generic) typically done together to minimize merge surface.
- Manual smoke gates phase completion.

### Parallel Opportunities

- T001 and T002 are fully parallel.
- T012 through T020 (10 fixture tests) are all in one file but the test functions themselves can be authored in parallel by a developer (the file-write order is what serializes them).
- T028 + T029 (CSS in two files) — parallel.
- T030 + T031 + T032 (i18n in three files) — parallel.
- All `[P] [US1]` and `[P] [US2]` tasks marked in the lists above can run in parallel within their phase.

---

## Parallel Example: User Story 1

```bash
# After Phase 2 completes, the Frontend Engineer pair can split:

# Engineer A — RR file:
Task: "T026 [US1] Add pill-host scaffolding to FIRE-Dashboard.html"
Task: "T028 [P] [US1] Add CSS for .pvi-* in FIRE-Dashboard.html"
Task: "T030 [P] [US1] Add EN+zh i18n keys to FIRE-Dashboard.html"
Task: "T033 [US1] Implement _assemblePayoffVsInvestInputs in FIRE-Dashboard.html"
Task: "T035 [US1] Implement renderPayoffVsInvestWealthChart in FIRE-Dashboard.html"
... etc.

# Engineer B — Generic file (in lockstep):
Task: "T027 [US1] Mirror pill-host scaffolding to FIRE-Dashboard-Generic.html"
Task: "T029 [P] [US1] Add CSS for .pvi-* in FIRE-Dashboard-Generic.html"
... etc.

# Manager merges and verifies T053 + T054 (browser smoke for both files).
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 — Setup (T001, T002).
2. Phase 2 — Foundational (T003–T025). **CRITICAL** — calc module must pass all 10 fixture tests before any UI work.
3. Phase 3 — US1 implementation across both files (T026–T055).
4. **STOP and VALIDATE**: Test US1 independently. Demo the trajectory chart + verdict banner + amortization chart at default RR inputs. Confirm SC-001 / SC-002 / SC-004 / SC-005 / SC-006.
5. Ship US1 as a standalone PR (the MVP).

### Incremental Delivery

- After US1 ships, US2 (Factor Breakdown + Refi + Override) is a separate PR that ADDS to the pill without modifying US1's behavior.
- US3 is verification only; can be folded into the US2 PR's manual smoke checklist or a follow-up.
- Polish phase (T077–T085) is the final pre-merge sweep on the last PR.

### Parallel Team Strategy

With a Frontend Engineer + Backend Engineer + QA Engineer trio:

- **Backend Engineer** owns Phase 1 + Phase 2 (calc module + tab router + tests). Delivers when T021 + T024 pass.
- **Frontend Engineer A** picks up Phase 3 RR file (T026, T028, T030, T033, T035, T037, T039, T041, T043, T045, T047, T049, T051, T053).
- **Frontend Engineer B** picks up Phase 3 Generic file (T027, T029, T031, T034, T036, T038, T040, T042, T044, T046, T048, T050, T052, T054).
- **QA Engineer** owns T025 (browser smoke regression extension), T055, T077, T078, T081, T082.
- **Manager** integrates and runs T079, T080, T083, T084, T085.

---

## Notes

- **Lockstep is non-negotiable**: every UI change in `FIRE-Dashboard.html` MUST land in `FIRE-Dashboard-Generic.html` in the same change set. The PR description must call this out explicitly (Constitution Principle I).
- **Calc module purity is enforced**: the meta-test (`tests/meta/module-boundaries.test.js` if present, or the visual review during T021) checks that `calc/payoffVsInvest.js` has no `document`, `window`, `localStorage`, or other DOM/Chart.js globals (Principle II).
- **No `export` keyword**: per Principle V's expanded file-protocol rule, the calc module MUST use the UMD wrapper at the bottom and NOT use ES module `export` syntax (verified during T011).
- **i18n is gated at merge**: any user-visible string that lands without an EN+zh-TW translation pair fails review (Principle VII). The Catalog file is the canonical record.
- **Fixture-locked tests are the regression contract**: if a future change accidentally regresses one of the 10 fixture cases, T021 fails fast in CI and blocks merge (Principle IV).
- **No effect on other charts**: SC-004's no-regression assertion (T025) is the operational proof. If T078 fails, the PR is rejected without exception.
- **Commit cadence**: at minimum after each Checkpoint (Phase 2 complete, Phase 3 complete, Phase 4 complete). Engineers may commit per-task within a phase if helpful.

---

## Summary

- **Total tasks**: 85 (T001 through T085)
- **Phase 1 — Setup**: 2 tasks
- **Phase 2 — Foundational**: 23 tasks (calc module + tests + tab router + smoke regression)
- **Phase 3 — US1 (P1) MVP**: 30 tasks (HTML + CSS + i18n + 6 renderer pairs + recalcAll wiring + state persistence + manual smoke)
- **Phase 4 — US2 (P2)**: 19 tasks (factor breakdown + refi inputs + override + refi annotation)
- **Phase 5 — US3 (P3)**: 2 tasks (verification only)
- **Phase 6 — Polish**: 9 tasks (test sweeps, README, CLOSEOUT, file:// gate)

**Suggested MVP scope**: Phases 1 + 2 + 3 (T001–T055). Ships User Story 1 as a standalone increment that delivers the core "which path wins" answer with the front-loaded-interest visualization. Phases 4 + 5 + 6 are subsequent PRs.
