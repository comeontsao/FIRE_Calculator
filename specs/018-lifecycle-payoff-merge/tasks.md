---
description: "Task list for feature 018 — Merge Payoff-vs-Invest into Full Portfolio Lifecycle"
---

# Tasks: Merge Payoff-vs-Invest into Full Portfolio Lifecycle

**Input**: Design documents from `/specs/018-lifecycle-payoff-merge/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/payoffVsInvest-calc-v3.contract.md, contracts/lifecycle-mortgage-handoff.contract.md, quickstart.md

**Tests**: REQUIRED. Constitution Principle IV (Gold-Standard Regression Coverage, NON-NEGOTIABLE) mandates fixture coverage for every calc change. SC-010 enumerates worked examples for Section 121 boundary cases. SC-004 mandates backwards-compat regression for saved states without `mortgageStrategy`.

**Organization**: Tasks grouped by user story to enable independent implementation, testing, and shipping.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Maps task to user story (US1, US2, US3, US4)
- File paths absolute or repo-relative

## Path Conventions

- Calc module: `calc/payoffVsInvest.js`
- Dashboards (lockstep — Principle I): `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`
- Tests: `tests/unit/payoffVsInvest.test.js`, `tests/unit/lifecyclePayoffMerge.test.js` (NEW)
- Translations: `FIRE-Dashboard Translation Catalog.md`
- Spec: `specs/018-lifecycle-payoff-merge/`

## User Story Map

| Story | Priority | Goal | Spec section |
|---|---|---|---|
| **US1** | P1 (MVP) | Mortgage strategy drives the lifecycle simulation — Prepay/Invest/Invest+Lump-Sum threaded through Full Portfolio Lifecycle chart, FIRE-age search, ranker. | §"User Story 1" / FR-001 to FR-004, FR-006 to FR-012 |
| **US4** | P2 | Sell-at-FIRE composes with mortgage strategy — Section 121 exclusion, lump-sum precedence, post-sale brokerage handoff, sell-event chart marker. | §"User Story 4" / FR-013 to FR-018 |
| **US2** | P2 | Sidebar surfaces active mortgage strategy — one-line indicator showing strategy + payoff age. | §"User Story 2" / FR-005 |
| **US3** | P3 | FIRE-age verdict + strategy ranker react to mortgage strategy — including auto-move FIRE marker. | §"User Story 3" / FR-006, FR-007, FR-012 |

US1 is the load-bearing MVP. US4 extends US1 with sale handling. US2 is light UI on top of US1's outputs. US3 is the deepest integration.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization checks. The 018 branch already exists with spec/plan artifacts uncommitted.

- [ ] T001 Verify branch `018-lifecycle-payoff-merge` is current and `main` contains 016 + 017 (run `git log --oneline -3 main` to confirm `2d08f58 feat(017)` is the tip)
- [ ] T002 [P] Run baseline `node --test tests/unit/payoffVsInvest.test.js` to confirm 43/43 v3-baseline tests pass on a clean tree before any v3 edits land

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core scaffolding that MUST be complete before ANY user story can begin.

**⚠️ CRITICAL**: T003 (regression-lock extension for v3) and T004 (input-normalization helper) are blocking — every subsequent calc change relies on them.

- [ ] T003 Extend `tests/unit/payoffVsInvest.test.js` regression-lock helper to v3: add `mortgageStrategy: 'invest-keep-paying'` and `lumpSumPayoff: false` explicitly to every existing fixture's `baseInputs()` call. Update `assertV1ParityWhenSwitchOff` (rename or alias to `assertV2ParityForBackCompat`) to (a) ignore the new v3 output keys (`homeSaleEvent`, `postSaleBrokerageAtFire`, `mortgageActivePayoffAge`) when diffing snapshots; (b) confirm v2 keys remain byte-identical when `mortgageStrategy === 'invest-keep-paying' && sellAtFire === false && ownership !== 'buying-in'`. Verify all 43 prior tests still pass.
- [ ] T004 [P] In `calc/payoffVsInvest.js`, update the contract header (lines 1–67) to v3: add `mortgageStrategy`, `mfjStatus`, `originalPurchasePrice` to the Inputs section; add `homeSaleEvent`, `postSaleBrokerageAtFire`, `mortgageActivePayoffAge` to the Outputs section; expand the Consumers list to include "lifecycle simulator (mortgage trajectory + handoff seed)". Pure documentation; no behavior change.
- [ ] T005 [P] In `calc/payoffVsInvest.js`, add JSDoc typedef for `HomeSaleEvent` (after the existing `LumpSumEvent` and `StageBoundaries` typedefs) matching the data-model.md shape. No behavior change.
- [ ] T006 In `calc/payoffVsInvest.js`, implement `_normalizeStrategy(inputs)` private helper that returns the canonical mortgage strategy string from explicit `mortgageStrategy` if present, else from `lumpSumPayoff` boolean, else default `'invest-keep-paying'`. Add to the `_payoffVsInvestApi` export object for testability. Wire into `computePayoffVsInvest` near the existing `lumpSumPayoff` parsing — replace the strict-boolean read with `const strategy = _normalizeStrategy(inputs); const lumpSumPayoff = strategy === 'invest-lump-sum';`. Confirm 43/43 tests still pass (Inv-12 backwards-compat).

**Checkpoint**: Foundation ready. v3 contract header in place; normalization helper handles back-compat. Stories may proceed.

---

## Phase 3: User Story 1 — Mortgage Strategy Drives Lifecycle (Priority: P1) 🎯 MVP

**Goal**: User-selected mortgage strategy (Prepay/Invest/Invest+Lump-Sum) flows from a new PvI-tab radio control through the calc module's outputs into the Full Portfolio Lifecycle chart's mortgage-balance and brokerage trajectories. FIRE-age search consumes the resolved strategy. Mortgage strategy is the canonical state read by every consumer.

**Independent Test**: Toggle the new PvI radio between Prepay / Invest-keep-paying / Invest-lump-sum. The Full Portfolio Lifecycle chart's mortgage-balance line should re-render in each case (Prepay accelerated, Invest contractual, Invest+lump-sum drops at trigger). The "FIRE in N years" headline updates accordingly. Lifecycle chart's brokerage trajectory reflects the strategy's monthly contribution pattern.

### Tests for User Story 1

- [ ] T007 [P] [US1] Add fixture test "v3 strategy normalization: explicit mortgageStrategy wins over lumpSumPayoff" in `tests/unit/payoffVsInvest.test.js`. Verify the Inv-12 invariant: `{ mortgageStrategy: 'invest-keep-paying', lumpSumPayoff: true }` → strategy normalizes to `'invest-keep-paying'`; `{ mortgageStrategy: 'invest-lump-sum' }` → normalizes to `'invest-lump-sum'`; `{ lumpSumPayoff: true }` (no mortgageStrategy) → normalizes to `'invest-lump-sum'`; `{}` → `'invest-keep-paying'`.
- [ ] T008 [P] [US1] Add fixture test "v3 mortgageActivePayoffAge under each strategy" in `tests/unit/payoffVsInvest.test.js`. For a typical scenario (rate=0.06, stocks=0.07, extra=$1000, no sellAtFire), verify `mortgageActivePayoffAge.prepay < mortgageActivePayoffAge.invest` and that each equals the corresponding strategy's payoff event age.
- [ ] T009 [P] [US1] Add fixture test "v3 saved-state without mortgageStrategy defaults to invest-keep-paying" — load a synthesized v017-era input record (only `lumpSumPayoff` field, no `mortgageStrategy`); confirm normalization yields `'invest-keep-paying'` when `lumpSumPayoff: false` and `'invest-lump-sum'` when `true`. Locks SC-004.

### Implementation for User Story 1 — Calc module

- [ ] T010 [US1] In `calc/payoffVsInvest.js` `computePayoffVsInvest`, after `_findStageBoundaries` is called, compute `mortgageActivePayoffAge` per the data-model.md spec — for each strategy: if a pre-FIRE event retired the mortgage (Prepay's accelerated end, Invest's lump-sum), use that age; else (Invest-keep-paying or no event) use the bank's natural amortization-end age. Return as `{ prepay: number, invest: number }`. T008 turns green.
- [ ] T011 [US1] In `calc/payoffVsInvest.js`, add subSteps entries (per FR-008): `'resolve active mortgage strategy: ' + strategy + ' (from state._payoffVsInvest.mortgageStrategy)'` (always when v3 inputs); `'compute lifecycle mortgage trajectory under ' + strategy` (always); `'apply lump-sum trigger month-by-month for Invest'` (when `strategy === 'invest-lump-sum'`).

### Implementation for User Story 1 — UI (lockstep across both HTMLs)

- [ ] T012 [US1] In `FIRE-Dashboard.html`, locate the existing PvI tab's lump-sum checkbox (introduced in feature 017, `pviLumpSumPayoff` id). REPLACE the simple checkbox with a radio group of 3 options: Prepay / Invest-keep-paying / Invest-lump-sum (FR-010). Use `<fieldset>` semantics. Each radio carries `data-i18n` attributes for its label. Default selected: `invest-keep-paying`.
- [ ] T013 [US1] In `FIRE-Dashboard-Generic.html`, mirror T012's HTML exactly (Principle I lockstep).
- [ ] T014 [US1] In both HTMLs, update the change handler: on radio change, write the canonical `mortgageStrategy` value to `state._payoffVsInvest.mortgageStrategy`, also clear `state._payoffVsInvest.lumpSumPayoff` (deprecation), then call `recomputePayoffVsInvest()` and `recomputeLifecycle()` (the existing pipelines).
- [ ] T015 [US1] In both HTMLs, on page-load hydration, read `state._payoffVsInvest.mortgageStrategy` and set the radio's `checked` accordingly. Fall back to deriving from `lumpSumPayoff` if mortgageStrategy is absent (per the data-model.md hydration sequence). Maintains backwards-compat for v017-era saved states.
- [ ] T016 [US1] In both HTMLs, locate `_assemblePayoffVsInvestInputs()` (or the equivalent input-record builder). Replace the current `lumpSumPayoff` field with `mortgageStrategy` reading from the radio's checked value. Keep `lumpSumPayoff` populated from the radio for back-compat (true when invest-lump-sum, false otherwise) so the calc module's normalization has both signals.
- [ ] T017 [US1] In both HTMLs, locate `projectFullLifecycle(...)` call sites (typically the chart renderer + FIRE-age search + audit). For EACH call site, ensure the `options` argument carries `mortgageStrategyOverride: <resolved-strategy-or-undefined>`. Document this thread in a comment block above each call site (Principle VI two-way link).
- [ ] T018 [US1] In both HTMLs, modify the lifecycle simulator's pre-FIRE accumulation loop (the inline function that computes annual cash flow). When `mortgageEnabled === true`, replace the current contractual-amortization mortgage cash flow with per-year values from `outputs.amortizationSplit[strategy === 'prepay-extra' ? 'prepay' : 'invest']`. Specifically the simulator reads `interestPaidThisYear`, `principalPaidThisYear`, and `brokerageContribThisYear` for each pre-FIRE year and applies them to the running cash-flow + brokerage state.
- [ ] T019 [US1] In both HTMLs, integrate `outputs.lumpSumEvent` (when non-null) into the lifecycle simulator's mid-loop: at the year matching `lumpSumEvent.age`, subtract `lumpSumEvent.brokerageBefore - lumpSumEvent.brokerageAfter` (the LTCG-grossed-up amount) from the brokerage. Mortgage cash flow is $0 for years > lump-sum age. Comment block cites FR-011 (Q2=B taxable LTCG).
- [ ] T020 [US1] Manual smoke per quickstart.md S2 + S4 + S5 (PvI radio, Prepay lifecycle reaction, Invest+Lump-Sum lifecycle reaction). Console clean.

**Checkpoint**: US1 shippable. Mortgage strategy machinery is in place; the lifecycle chart visibly responds to strategy changes. US4 + US2 + US3 may now proceed.

---

## Phase 4: User Story 4 — Sell-at-FIRE × Mortgage-Strategy Composition (Priority: P2)

**Goal**: When `sellAtFire === true`, the PvI calc module models the home-sale event including Section 121 exclusion. The PvI chart shows a sell marker at FIRE; both curves jump by their respective equity injections. The lifecycle simulator consumes only `postSaleBrokerageAtFire` as the retirement-phase brokerage seed (truncating mortgage cash flow at FIRE). Lump-sum and sale events compose with explicit precedence (lump-sum inhibited if it would fire post-FIRE).

**Independent Test**: Toggle `sellAtFire=true` with each strategy. Run quickstart.md S8/S9/S10/S11/S12. Confirm sell marker on PvI chart, both curves continue to endAge with parallel post-FIRE growth, lifecycle chart truncates mortgage at FIRE, retirement starts from `postSaleBrokerageAtFire`.

### Tests for User Story 4

- [ ] T021 [P] [US4] Add fixture test "Inv-9 HomeSaleEvent invariants" in `tests/unit/payoffVsInvest.test.js`. For sellAtFire=true, mortgageEnabled=true: verify `homeSaleEvent.age === inputs.fireAge`, `proceeds === homeValueAtFire * (1 - sellingCostPct)` (within rounding), `taxableGain === max(0, nominalGain - section121Exclusion)`, `netToBrokerage === proceeds - capGainsTax - remainingMortgageBalance`.
- [ ] T022 [P] [US4] Add fixture tests for SC-010 Section 121 boundary cases: (a) home appreciated within MFJ exclusion → `taxableGain === 0, capGainsTax === 0`; (b) home appreciated $200K above MFJ cap → `taxableGain === 200000` and `capGainsTax === 200000 * ltcgRate`; (c) single-filer (`mfjStatus='single'`) at $300K appreciation → `taxableGain === 50000` (cap=$250K); (d) home value < purchase price → `nominalGain < 0 → taxableGain === 0`.
- [ ] T023 [P] [US4] Add fixture test "Inv-3 lump-sum inhibited post-FIRE under sellAtFire". Configure stocks/extra such that the lump-sum trigger condition would be met at age `> fireAge`. Verify `lumpSumEvent === null`. Confirm `homeSaleEvent !== null` retires the mortgage instead.
- [ ] T024 [P] [US4] Add fixture test "Inv-4 lump-sum LTCG gross-up": when lump-sum fires (no sellAtFire), `actualBrokerageDrawdown === realBalance × (1 + ltcgRate × stockGainPct)`. The brokerage AFTER value reflects the gross-up, not just `realBalance`. Quote the data-model.md formula in the test comment.
- [ ] T025 [P] [US4] Create NEW test file `tests/unit/lifecyclePayoffMerge.test.js`. Add tests for `postSaleBrokerageAtFire` handoff value: (a) when sellAtFire=false, `postSaleBrokerageAtFire[strategy] === <strategy>_brokerage_at_FIRE` (no sale injection); (b) when sellAtFire=true, equals `<strategy>_brokerage_at_FIRE + homeSaleEvent.netToBrokerage_under_<strategy>`.

### Implementation for User Story 4 — Calc module

- [ ] T026 [US4] In `calc/payoffVsInvest.js`, add a private helper `_section121Tax(homeValueAtFire, originalPurchasePrice, mfjStatus, ltcgRate)` returning `{ section121Exclusion, nominalGain, taxableGain, capGainsTax }`. Default `originalPurchasePrice` to `mortgage.homePrice` when not provided (per data-model.md). Add to `_payoffVsInvestApi` export. T022 turns green.
- [ ] T027 [US4] In `computePayoffVsInvest`, after the main loop, if `inputs.sellAtFire === true && inputs.mortgageEnabled === true`, compute `homeSaleEvent` per data-model.md: derive `remainingMortgageBalance` PER STRATEGY (Prepay's path row at FIRE, Invest's path row at FIRE), call `_section121Tax`, compute `proceeds`, `netToBrokerage` per strategy. Return as a single `homeSaleEvent` object plus per-strategy `netToBrokerage` field. T021 + T023 turn green.
- [ ] T028 [US4] In the lump-sum trigger logic (existing code from feature 017's T028), add the Inv-3 inhibition: gate the trigger evaluation on `age < inputs.fireAge` when `sellAtFire === true && mortgageEnabled === true`. T023 turns green.
- [ ] T029 [US4] In `computePayoffVsInvest`, compute `postSaleBrokerageAtFire` per strategy: the `<strategy>_brokerage_at_FIRE` value (read from the corresponding path row at fireAge) PLUS `homeSaleEvent.netToBrokerage_under_<strategy>` when sale fires. Return as `{ prepay: number, invest: number }`. T025 turns green.
- [ ] T030 [US4] Add subSteps entries (per FR-008): `'evaluate sell-at-FIRE event at age ' + fireAge` (when sale event applies); `'Section 121 exclusion: nominalGain=' + gain + ', exclusion=' + cap + ', taxableGain=' + taxableGain` (when sale event applies); `'home-sale capital gains tax: taxableGain × ltcgRate = ' + capGainsTax` (when sale applies); `'credit post-sale brokerage at FIRE = ' + postSaleBrokerage`; `'lifecycle handoff: pre-FIRE simulator → retirement-phase simulator (postSaleBrokerage = $X)'`.

### Implementation for User Story 4 — UI (lockstep)

- [ ] T031 [P] [US4] In both HTMLs' `renderPayoffVsInvestBrokerageChart`, add a sell-event marker (green star, `pointStyle: 'star'`) at the FIRE age when `outputs.homeSaleEvent !== null`. Label via i18n key `pvi.chart.brokerage.sellMarker` with the netToBrokerage amount as a placeholder. Both Prepay and Invest curves should reflect the equity injection — the data points at fireAge are already correct because the calc module's path rows include the post-sale brokerage value when applicable.
- [ ] T032 [P] [US4] In both HTMLs' `renderPayoffVsInvestVerdictBanner`, add a fourth optional line when `outputs.homeSaleEvent !== null`: "Sell home at age {fireAge} · +${netToBrokerage}". Hidden when sale event is null.
- [ ] T033 [P] [US4] In both HTMLs' lifecycle simulator, when the pre-FIRE → post-FIRE transition occurs at `fireAge`: if `outputs.homeSaleEvent !== null`, set the retirement-phase brokerage seed to `outputs.postSaleBrokerageAtFire[activeStrategy === 'prepay-extra' ? 'prepay' : 'invest']`. ALSO set the mortgage cash-flow line to $0 for all years `>= fireAge` (LH-Inv-3). Document the truncation in a comment block (FR-018 quoted).
- [ ] T034 [US4] Update both HTMLs' renderer comment headers (Principle VI): `renderPayoffVsInvestBrokerageChart` declares `homeSaleEvent` consumed; `renderPayoffVsInvestVerdictBanner` declares `homeSaleEvent` consumed; the lifecycle simulator's input-assembly comment declares `homeSaleEvent` and `postSaleBrokerageAtFire` consumed.
- [ ] T035 [US4] Manual smoke per quickstart.md S8 (Prepay + sellAtFire), S9 (Invest-keep-paying + sellAtFire), S10 (lump-sum pre-FIRE + sellAtFire), S11 (lump-sum inhibited post-FIRE), S12 (Section 121 boundaries). Console clean.

**Checkpoint**: US4 shippable. Sell-at-FIRE × strategy composition complete. PvI tab and lifecycle chart agree on all 8 interaction-matrix scenarios.

---

## Phase 5: User Story 2 — Sidebar Mortgage Indicator (Priority: P2)

**Goal**: A one-line indicator in the sidebar (or near the top KPI strip) shows the active mortgage strategy and its resolved payoff age. Updates immediately on strategy change; persists across reloads.

**Independent Test**: Toggle the PvI tab radio; sidebar indicator flips. Reload the page; indicator shows the persisted state. Per quickstart.md S3.

### Tests for User Story 2

- [ ] T036 [P] [US2] Add fixture test "sidebar template inputs: mortgageStrategy + mortgageActivePayoffAge produce expected display string" in `tests/unit/payoffVsInvest.test.js`. Pure-function test (no DOM): given inputs that produce strategy='prepay-extra' and mortgageActivePayoffAge.prepay=58, the formatter (a small new helper added to the calc module's API for testability — `_formatSidebarMortgageIndicator(strategy, activePayoffAge)`) returns the expected string template.

### Implementation for User Story 2

- [ ] T037 [P] [US2] In `calc/payoffVsInvest.js`, add a small helper `_formatSidebarMortgageIndicator(strategy, activePayoffAge)` that returns a template-string descriptor `{ key: 'sidebar.mortgageStatus.template', args: [strategyLabelKey, activePayoffAge] }`. Add to `_payoffVsInvestApi` export. The descriptor is consumed by the UI's `t(...)` helper.
- [ ] T038 [P] [US2] In `FIRE-Dashboard.html`, locate the sidebar (or top KPI strip — likely near the existing "On Track / Behind" verdict). Add a new one-line indicator element with id `sidebarMortgageStatus` and a `data-i18n` attribute. Use existing dark-theme CSS variables.
- [ ] T039 [P] [US2] In `FIRE-Dashboard-Generic.html`, mirror T038 (Principle I lockstep).
- [ ] T040 [US2] In both HTMLs, after each `recomputePayoffVsInvest()` call, update the sidebar indicator's text via `t('sidebar.mortgageStatus.template', t(strategyLabelKey), mortgageActivePayoffAge[activeStrategy])`. The `activeStrategy` value is read from state.
- [ ] T041 [P] [US2] Add 5 translation keys to BOTH HTMLs (`TRANSLATIONS.en` and `TRANSLATIONS.zh`) and to `FIRE-Dashboard Translation Catalog.md`: `pvi.strategy.label`, `pvi.strategy.prepay`, `pvi.strategy.investKeep`, `pvi.strategy.investLumpSum`, `sidebar.mortgageStatus.template`. Use the EN/zh-TW drafts from data-model.md.
- [ ] T042 [US2] Manual smoke per quickstart.md S3. Sidebar indicator flips on radio toggle, persists on reload, bilingual flips on EN ↔ 中文 toggle.

**Checkpoint**: US2 shippable. Sidebar indicator surfaces strategy + payoff age.

---

## Phase 6: User Story 3 — FIRE-age Verdict + Strategy Ranker React (Priority: P3)

**Goal**: When mortgage strategy changes, the FIRE-age search re-runs and reports the new feasible age (auto-moving the FIRE marker). The withdrawal-strategy ranker re-ranks against the new lifecycle simulation. The audit tab and Copy Debug payload reflect the resolved strategy.

**Independent Test**: With a marginal scenario, toggle Prepay vs Invest. The "FIRE in N years" headline shifts; the strategy ranker's winning strategy may flip. Per quickstart.md S6 + S7. Audit tab shows new subSteps; copyDebugInfo() payload includes the new fields.

### Tests for User Story 3

- [ ] T043 [P] [US3] Add fixture test "LH-Inv-1 strategy parity between probe and chart" in `tests/unit/lifecyclePayoffMerge.test.js`. Mock the lifecycle simulator's input-assembly to capture the `mortgageStrategyOverride` passed to `projectFullLifecycle` for both the chart render call AND the FIRE-feasibility-probe call. Assert they're equal. (Pure-function test on the input-assembly code path — no actual lifecycle simulator needed for this specific check.)
- [ ] T044 [P] [US3] Add fixture test "ranker output reflects mortgage strategy change". Build a marginal-feasibility scenario; run the calc with strategy=prepay then strategy=invest; verify the resulting `postSaleBrokerageAtFire` (and downstream lifecycle outputs the ranker would consume) differ enough that an idealized ranker would pick a different strategy. (Marker test — full ranker integration is browser-tested.)

### Implementation for User Story 3

- [ ] T045 [US3] In both HTMLs, in the radio-change handler from T014, add `state.fireAgeOverride = null` immediately before calling `recomputeLifecycle()`. This implements FR-012 (Q3=A: auto-move). Document the override-clearing in a comment quoting research.md R3.
- [ ] T046 [US3] In both HTMLs, the existing FIRE-age search function (`isFireAgeFeasible` or its bisection driver — find via `grep -n "isFireAgeFeasible\|findFireAgeNumerical" FIRE-Dashboard.html`) must consume the resolved mortgage strategy via the same `mortgageStrategyOverride` thread on `projectFullLifecycle` calls. Audit every call site — the existing `getActiveChartStrategyOptions()` helper from feature 008/014 needs an extension or a new sibling `getActiveMortgageStrategyOptions()` that returns `{ mortgageStrategyOverride: <resolved-strategy> }`. Document the change in a comment citing the feature-014 process lesson.
- [ ] T047 [US3] In both HTMLs, the strategy ranker (`scoreAndRank` / `rankByObjective`) consumes lifecycle simulator outputs. Verify that since T046 ensures the lifecycle inputs include the active mortgage strategy, the ranker's input changes automatically when strategy changes — no ranker code changes should be needed. Add an inline comment confirming this verification. Manual smoke per quickstart.md S7.
- [ ] T048 [US3] In both HTMLs, the audit tab's flow-diagram renderer (find via grep for `renderAudit` or `flowDiagram`) MUST consume the calc module's new subSteps. The mortgage-strategy stage's `subSteps[]` flows verbatim from `outputs.subSteps`. Verify by manual audit-tab smoke per quickstart.md S13: with each toggle of strategy and sellAtFire, the audit displays the expected subStep strings.
- [ ] T049 [US3] In both HTMLs, extend `copyDebugInfo()` (around line 16798 in RR) per FR-019: add `mortgageStrategy`, `mortgageActivePayoffAge`, `lumpSumEvent`, `homeSaleEvent`, `postSaleBrokerageAtFire` to the JSON payload. Ensure the existing `feasibilityProbe` block records `activeMortgageStrategy` matching the chart's strategy (LH-Inv-1).
- [ ] T050 [US3] Manual smoke per quickstart.md S6, S7, S13, S14. Strategy toggles update FIRE headline; ranker re-ranks; audit shows new subSteps; copyDebug payload contains the new fields.

**Checkpoint**: All four user stories shipped. Feature 018 functionally complete pending Polish.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Lockstep audit, bilingual audit, browser-smoke validation, CLOSEOUT authoring, BACKLOG/Roadmap sync.

- [ ] T051 [P] Lockstep diff: run `diff <(grep -A 20 "mortgageStrategy" FIRE-Dashboard.html) <(grep -A 20 "mortgageStrategy" FIRE-Dashboard-Generic.html)` and confirm only personal-content lines differ. Sentinel-symbol counts: `mortgageStrategy`, `homeSaleEvent`, `postSaleBrokerageAtFire`, `pviStrategyRadio` (or the chosen radio id), `sidebarMortgageStatus`, `pvi.strategy.label` should match between RR and Generic.
- [ ] T052 [P] Bilingual audit: confirm all 7 new translation keys (`pvi.strategy.label`, `pvi.strategy.prepay`, `pvi.strategy.investKeep`, `pvi.strategy.investLumpSum`, `sidebar.mortgageStatus.template`, `pvi.chart.brokerage.sellMarker`, `pvi.factor.section121.label`) have EN AND zh-TW entries in BOTH HTMLs and in `FIRE-Dashboard Translation Catalog.md`. No hardcoded English in any new UI element.
- [ ] T053 Run `node --test tests/unit/payoffVsInvest.test.js && node --test tests/unit/lifecyclePayoffMerge.test.js`. Confirm all tests pass — expected count: 43 (v3-baseline) + ~12 new in payoffVsInvest.test.js + ~5 in lifecyclePayoffMerge.test.js = ~60 total.
- [ ] T054 Browser smoke: run quickstart.md S1 through S16 against both dashboards under both `file://` and `http://` delivery modes. Log results; any failure routes back to the relevant phase.
- [ ] T055 Author `specs/018-lifecycle-payoff-merge/CLOSEOUT.md` capturing scope, files changed, tests added, browser-smoke status, constitution-compliance check, and any process lessons (especially around the lifecycle simulator's inline-modification scope and the strategy-parity-between-probe-and-chart lock).
- [ ] T056 [P] Update `BACKLOG.md` and `FIRE-Dashboard-Roadmap.md`: mark feature 018 implemented (or in-progress as appropriate).
- [ ] T057 [P] Update `CLAUDE.md` SPECKIT block: change Active feature line to "_none_ — feature 018 implemented YYYY-MM-DD on branch ...; awaiting browser-smoke verification (see CLOSEOUT.md) and merge."
- [ ] T058 [P] Update CLAUDE.md `## Process Lessons` section with the new lessons from feature 018 — at minimum: "Mortgage strategy threading must follow the feature-008 options-override pattern; FIRE-feasibility probe MUST receive the same mortgageStrategyOverride as the chart" (extending the existing feature-014 lesson).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No deps; passes trivially.
- **Phase 2 (Foundational)**: Depends on Phase 1. **BLOCKS all user stories** — T003 regression-lock + T006 normalization helper especially.
- **Phase 3 (US1 — MVP)**: Depends on Phase 2.
- **Phase 4 (US4 — sell-at-FIRE)**: Depends on US1 (extends the strategy machinery with sale handling).
- **Phase 5 (US2 — sidebar)**: Depends on US1 (consumes `mortgageActivePayoffAge`). Independent of US4.
- **Phase 6 (US3 — verdict + ranker)**: Depends on US1. Best run AFTER US4 (so audit subSteps coverage is complete) but technically independent.
- **Phase 7 (Polish)**: Depends on all US-phases scheduled for this ship.

### Within Each User Story

- Tests written FIRST (Constitution Principle IV — they MUST FAIL before implementation).
- Calc-module changes before UI integration.
- Both HTML files updated in lockstep within the same logical batch (Principle I).
- Translation strings in the same change set as the user-visible English (Principle VII).

### Parallel Opportunities

- **Phase 2**: T004 + T005 + T006 can run in parallel (different sections of the calc module's top documentation/scaffolding).
- **US1**: T007 + T008 + T009 parallel test authoring. T012 + T013 parallel UI mirrors.
- **US4**: T021 + T022 + T023 + T024 + T025 parallel test authoring. T031 + T032 + T033 parallel UI edits (different render functions).
- **US2**: T036 (test) + T037 (helper) parallel; T038 + T039 parallel UI mirrors; T041 (translations) parallel with anything else.
- **US3**: T043 + T044 parallel test authoring.
- **Polish**: T051 + T052 + T056 + T057 + T058 parallel.

### Cross-Story Independence

US1 alone is the MVP and can ship as a hotfix release. US4 adds sell-at-FIRE composition; US2 adds the sidebar; US3 adds verdict reactivity + audit/copyDebug extensions. Each can ship independently with its own subset of Polish.

---

## Parallel Example: User Story 1

```bash
# Two engineers (or two parallel sub-agents) split US1's UI work:
Task: "T012 — Replace lump-sum checkbox with strategy radio in FIRE-Dashboard.html"
Task: "T013 — Same change in FIRE-Dashboard-Generic.html"

# Tests authored in parallel before calc changes land:
Task: "T007 — Strategy normalization fixture test"
Task: "T008 — mortgageActivePayoffAge per-strategy fixture test"
Task: "T009 — Backwards-compat default fixture test"
```

## Parallel Example: User Story 4

```bash
# All US4 fixture tests can be authored in parallel:
Task: "T021 — HomeSaleEvent invariants"
Task: "T022 — Section 121 boundary cases"
Task: "T023 — Lump-sum inhibited post-FIRE"
Task: "T024 — LTCG gross-up"
Task: "T025 — postSaleBrokerageAtFire handoff in lifecyclePayoffMerge.test.js (NEW file)"

# UI edits (after calc lands) can split across two engineers:
Task: "T031 — Sell-event marker in PvI chart (both HTMLs)"
Task: "T032 — Banner Line 4 (both HTMLs)"
Task: "T033 — Lifecycle simulator handoff truncation (both HTMLs)"
```

---

## Implementation Strategy

### MVP First (US1 only — strategy machinery)

1. Complete Phase 1 + Phase 2.
2. Complete Phase 3 (US1).
3. **STOP and VALIDATE**: Toggle the PvI radio; confirm lifecycle chart re-renders for each strategy.
4. Optionally ship as a hotfix; queue US4/US2/US3 as additive enhancements.

### Incremental Delivery

1. Setup + Foundational → MVP-ready foundation.
2. Add US1 → ship as v018a (strategy machinery).
3. Add US4 → ship as v018b (sell-at-FIRE composition).
4. Add US2 → ship as v018c (sidebar indicator).
5. Add US3 → ship as v018d (verdict + ranker reactivity + audit/copyDebug).
6. Polish + final browser smoke.

### Parallel Team Strategy (project's Manager pattern)

After Phase 2 (T003-T006) is locked:

- **Backend Engineer** owns calc-module work: T010, T011, T026-T030, T037.
- **Frontend Engineer** owns dashboard work: T012-T020 (US1 UI), T031-T035 (US4 UI), T038-T042 (US2 UI), T045-T050 (US3 UI). Lockstep enforced.
- **QA Engineer** owns test work: T003, T007-T009, T021-T025, T036, T043-T044, T053. NEW: `tests/unit/lifecyclePayoffMerge.test.js`.
- **Manager** verifies lockstep, integrates, runs T054 browser smoke before merge.

---

## Notes

- [P] tasks = different files OR clearly independent file regions, no dependencies on incomplete tasks.
- [Story] label maps task to its user story for traceability.
- Each user story is independently completable, testable, and shippable.
- Tests MUST be written and confirmed failing before implementation lands (Principle IV).
- Lockstep across both HTML files is non-negotiable on every UI task (Principle I).
- Bilingual EN + zh-TW lands in the same change set as new user-visible strings (Principle VII).
- File-protocol delivery (`file://` double-click) MUST keep working — no top-level `export` keyword in calc module (Principle V).
- The lifecycle simulator's inline modification carries higher risk than calc-module work; mitigate via fixture tests (T025, T043, T044) AND comprehensive browser-smoke (T054).
- The strategy-parity-between-probe-and-chart lock (LH-Inv-1) is the single most important invariant for avoiding the feature-014-class drift; T046 + T049 together enforce it.
