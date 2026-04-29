# Feature Specification: Merge Payoff-vs-Invest into Full Portfolio Lifecycle

**Feature Branch**: `018-lifecycle-payoff-merge`
**Created**: 2026-04-29
**Status**: Draft v2 — all clarifications resolved (Q1–Q6 answered 2026-04-29). Ready for `/speckit-plan`.
**Input**: User description: *"now I think we have the calculation correct, I want to work on how to merge the calculation into the Full portfolio Life cycle chart. lets brainstorm what are the things that will change. one of the things I can think of is the pay off dates, how does that react to the Full portfolio Life cycle chart and the side bar? another thing is the 1 check paydown for the investment strategy, how that react to the Full portfolio Life cycle chart and the side bar. Please don't hesitate to add more ideas, I imagine there are a lot of things"*

---

## Background

Features 016 and 017 built the **Payoff vs Invest** comparison as a *side analysis* — its own tab with its own brokerage chart, verdict banner, and the new lump-sum payoff branch. The lifecycle simulator that powers the **Full Portfolio Lifecycle** chart and the **sidebar KPIs** is currently unaware of the user's chosen mortgage strategy: it treats the mortgage as a fixed monthly cash-flow drain on the bank's contractual amortization schedule, end-of-story.

This means today the user sees a *contradiction*: Payoff vs Invest may say "Prepay finishes at age 60" while the lifecycle chart, sidebar, and FIRE-age verdict all behave as if the mortgage runs to age 73. The two views are inconsistent. Feature 018 unifies them — the lifecycle simulator and every downstream chart/KPI/verdict consume the *same* mortgage-strategy choice so the dashboard tells a single coherent story.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Mortgage strategy drives the lifecycle simulation (Priority: P1) 🎯 MVP

As a user comparing scenarios, I want my chosen mortgage strategy (Prepay vs Invest, with or without lump-sum) to flow through the entire dashboard — the Full Portfolio Lifecycle chart, the sidebar KPIs, the FIRE-age verdict, and the strategy ranker — so I see one consistent story instead of having to mentally reconcile the side analysis with the main projection.

**Why this priority**: Without this, the dashboard's headline numbers ("On Track — FIRE in 12 years", current net worth, FIRE age) don't reflect the mortgage strategy the user just chose. That's the worst kind of bug — the system silently disagrees with itself. Fixing it is the whole point of the merge.

**Independent Test**: Set the mortgage strategy to "Prepay" with $1,000/mo extra; observe the Full Portfolio Lifecycle chart's mortgage-balance line decay faster, the sidebar's "Mortgage paid off" marker move earlier, and the FIRE-age verdict update accordingly. Toggle to "Invest" and watch the lifecycle's free cash flow re-route to the brokerage from day one.

**Acceptance Scenarios**:

1. **Given** the user has set Mortgage Strategy = Prepay with $1,000/mo extra, **When** the lifecycle simulator runs, **Then** the projected mortgage payoff age in the lifecycle chart equals the Prepay age shown on the Payoff-vs-Invest tab (within 1 year for rounding), and the brokerage trajectory after that age reflects the redirected cash flow.

2. **Given** Mortgage Strategy = Invest with lump-sum switch ON, **When** the lifecycle simulator runs, **Then** the lifecycle chart shows a discrete drawdown from the brokerage at the lump-sum age, with that age matching the `lumpSumEvent.age` from the calc module, and the mortgage-balance line drops to $0 in the same year.

3. **Given** Mortgage Strategy = Invest with lump-sum switch OFF (default), **When** the lifecycle simulator runs, **Then** the lifecycle chart's mortgage trajectory follows the bank's full amortization (existing behavior — backwards-compatible default).

---

### User Story 2 — Sidebar surfaces the active mortgage strategy (Priority: P2)

As a user, I want the sidebar (or top KPI strip) to clearly show which mortgage strategy is currently driving the projection — so I know at a glance whether the headline FIRE age reflects Prepay, Invest-keep-paying, or Invest-with-lump-sum.

**Why this priority**: Once US1 makes the strategy load-bearing, the user needs to *know* what it's set to without hunting through the Payoff-vs-Invest tab. A small persistent indicator removes the cognitive ambiguity.

**Independent Test**: Change the strategy via the (US1) selector; confirm the sidebar indicator flips immediately. Refresh the page; the indicator persists from localStorage.

**Acceptance Scenarios**:

1. **Given** the user has Strategy = Invest (lump-sum OFF), **When** they look at the sidebar, **Then** they see a one-line indicator like "Mortgage: Invest · paid off age 73 (bank schedule)".

2. **Given** the user toggles Strategy = Prepay with $2,000/mo extra, **When** the indicator updates, **Then** it reads "Mortgage: Prepay · paid off age 56 (5 yr accelerated)" with the accelerated-vs-bank delta visible.

3. **Given** the user has Lump-Sum ON and the trigger fires at age 67, **When** the lifecycle has rendered, **Then** the indicator reads "Mortgage: Invest + lump-sum · paid off age 67 (write-check from brokerage)".

---

### User Story 4 — Sell-at-FIRE composes with mortgage strategy (Priority: P2)

As a user who plans to sell the home at FIRE (the existing `sellAtFire` toggle on the Mortgage tab), I want the mortgage strategy and the sell event to compose correctly: the PvI tab keeps showing the long-horizon comparison with the sell event marked at FIRE; the lifecycle chart truncates the mortgage and consumes only the post-sale brokerage value at FIRE as input to the retirement phase.

**Why this priority**: `sellAtFire=true` is a common scenario (downsize at retirement, move countries, fund Die-With-Zero), and without composing it correctly with the new mortgage strategy the dashboard will silently double-count or under-count equity. P2 because it composes with US1 (the strategy machinery has to exist first) but ranks above US3 (verdict/ranker reactivity is a deeper integration that builds on this).

**Independent Test**: Toggle `sellAtFire=true` with each of the three mortgage strategies. On the PvI tab: confirm the chart shows a sell-event marker at FIRE age, both curves jump up by their respective equity-injection amounts, and post-FIRE both curves grow at the same real rate (parallel lines with the FIRE-gap preserved). On the Lifecycle chart: confirm the mortgage line stops at FIRE, the brokerage gets a one-time cash injection equal to the active strategy's post-sale equity, and retirement-phase spending starts from that brokerage value.

**Acceptance Scenarios**:

1. **Given** Strategy=Prepay-extra finishes at age 60, sellAtFire=ON, FIRE age=54, **When** the PvI runs, **Then** at age 54 the chart shows a sell marker, Prepay's balance subtracted from sale proceeds (still significant — ~$200K remaining), Invest's balance subtracted (~$420K remaining at 6%/30yr). Both curves compound to endAge in parallel after the jump; Prepay's line is above Invest's by the equity-delta. The lifecycle chart's mortgage line drops to $0 at age 54 and the brokerage gains the post-sale cash.

2. **Given** Strategy=Invest+Lump-Sum, lump-sum trigger condition met at age 56, sellAtFire=ON, FIRE age=54, **When** the simulation runs, **Then** the lump-sum trigger is INHIBITED (FIRE precedence — sale at 54 retires the mortgage first). `lumpSumEvent === null`. The lifecycle chart shows the sell-at-FIRE event with the bank's remaining balance subtracted from proceeds; no lump-sum drop.

3. **Given** Strategy=Invest+Lump-Sum, lump-sum trigger condition met at age 50, sellAtFire=ON, FIRE age=54, **When** the simulation runs, **Then** lump-sum fires at 50 (mortgage retired), then at 54 the home sells fully-owned (full home_value × (1−sellingCostPct−capGainsTax) injected into brokerage). Lifecycle chart shows BOTH events; PvI chart shows the lump-sum drop AND the FIRE-sell jump.

4. **Given** US Section 121 in effect, home gain at sale exceeds $500K MFJ exclusion, **When** the sale executes, **Then** the excess gain is taxed at the user's `ltcgRate` and the brokerage injection reflects post-tax cash. The audit shows the gain calculation as a sub-step.

---

### User Story 3 — FIRE-age verdict and strategy ranker react to mortgage strategy (Priority: P3)

As a user, I expect the "On Track / Behind / Ahead" verdict and the multi-strategy withdrawal ranker (Safe / Exact / DWZ × Preserve / Minimize Tax) to react to the mortgage strategy. A faster mortgage payoff frees cash flow earlier, which should affect which withdrawal strategy ranks first AND which FIRE age the simulator reports as feasible.

**Why this priority**: This is the deepest integration — the mortgage strategy doesn't just *display* differently, it changes the math the ranker is sorting on. It's high-value but lower-priority because US1 alone already produces a consistent dashboard; US3 makes the verdict *correct under sensitivity*.

**Independent Test**: With a marginal scenario (FIRE age right at the feasibility boundary), toggle Prepay vs Invest. The verdict should flip from "Behind" to "On Track" or move the FIRE age by ≥ 1 year, with the strategy ranker re-sorting accordingly.

**Acceptance Scenarios**:

1. **Given** a scenario where Safe-mode feasibility is borderline, **When** the user switches Mortgage Strategy = Prepay, **Then** the FIRE-age search re-runs and reports a (typically earlier) feasible age; the strategy ranker re-ranks the active candidates against the new mortgage trajectory.

2. **Given** Lump-Sum ON in a high-return scenario, **When** the lump-sum fires before FIRE age, **Then** the lifecycle's pre-FIRE accumulation reflects the brokerage drop, and the FIRE-age search treats the post-drop balance as the starting point for the retirement phase.

3. **Given** the audit tab is open, **When** the user changes mortgage strategy, **Then** the audit's flow diagram shows new sub-steps reflecting the strategy resolution ("apply mortgage strategy: Invest+lumpSum", "compute lifecycle mortgage trajectory under active strategy"), satisfying Constitution Principle II (audit observability).

---

### Edge Cases

- **Mortgage already paid off** (`ownership='already-own'` with `yearsPaid >= term`): mortgage strategy is irrelevant; selector should disable or hide. Lifecycle simulator behaves as today.
- **Buying-in scenarios** (`ownership='buying-in'` with `buyInYears > 0`): pre-buy-in years have no mortgage cash flow. Strategy effects start at the buy-in age. The lifecycle chart's mortgage-balance line should start at $0 (pre-buy-in), jump up at buy-in age, then decay per the active strategy.
- **Refi planned mid-window**: if the user's refi (already supported on PvI tab) is mid-mortgage, the lifecycle simulator must apply the same refi event so cash flow matches.
- **Pre-401k-unlock years**: if the lump-sum fires before age 59.5, the simulator currently can't access Trad to top up the post-drop brokerage. Lump-sum forces a real LTCG event on a brokerage sale — the simulation must reflect the tax bite per FR-011.
- **FIRE marker drag**: when the user drags the FIRE marker, the mortgage payoff age may shift (because Prepay's accelerated payoff depends on extra contributions stopping at FIRE). Recompute must propagate. Per FR-012, the marker auto-moves to the new feasible age when strategy changes (Q3=A).
- **State persistence**: existing `state._payoffVsInvest` JSON already round-trips `lumpSumPayoff`. We add `mortgageStrategy` to the same blob; backwards-compat with old saved states defaults to `invest-keep-paying` per FR-009.

### Sell-at-FIRE × Mortgage-Strategy Interaction Matrix

| # | Strategy | sellAtFire | Lump-Sum | Outcome (PvI chart) | Outcome (Lifecycle chart) |
|---|---|---|---|---|---|
| 1 | Prepay-extra | OFF | n/a | Prepay decay accelerated; both run to endAge with home equity included. | Mortgage-balance follows Prepay decay; home equity persists. |
| 2 | Prepay-extra | **ON** | n/a | Prepay payoff at age X; sell marker at FIRE; if Prepay finished pre-FIRE, full home_value × (1−sellCost−capGainsTax) injected. Both curves run to endAge, parallel post-FIRE. | Mortgage-balance line stops at FIRE; brokerage gains post-sale cash; retirement starts. |
| 3 | Invest-keep-paying | OFF | OFF | Today's behavior — bank's amortization end. | Today's behavior. |
| 4 | Invest-keep-paying | **ON** | OFF | Bank's curve; sell marker at FIRE; remaining balance subtracted from proceeds. | Mortgage stops at FIRE; brokerage gains (sale − remaining bal); retirement starts. |
| 5 | Invest + Lump-Sum | OFF | ON | Lump-sum fires when brokerage ≥ real balance (feature 017). | Same. |
| 6 | Invest + Lump-Sum | **ON** | ON | Two-event interaction. If lump-sum fires *pre-FIRE* (age < FIRE): mortgage retired at lump-sum, then sell-at-FIRE injects full home value. PvI chart shows BOTH events. If lump-sum *would have fired* post-FIRE: trigger is inhibited (`lumpSumEvent === null`); FIRE-sale retires the mortgage from proceeds. | Same — two events visible if both pre-FIRE; otherwise just the sell event. |
| 7 | (any) + buying-in | ON | (any) | Short ownership window from buy-in age to FIRE. Strategy differentiation small. | Same; mortgage line is brief. |
| 8 | (any) + already-own | ON | (any) | Most common case; meaningful differentiation across strategies. | Same. |

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The dashboard MUST expose a single canonical "Mortgage Strategy" setting that controls how the lifecycle simulator handles monthly mortgage cash flow and any lump-sum payoff event. Allowed values: `prepay-extra` (extra → principal), `invest-keep-paying` (extra → brokerage; mortgage runs to bank's amortization end), `invest-lump-sum` (extra → brokerage; brokerage writes check at trigger age).
- **FR-002**: The Full Portfolio Lifecycle chart's mortgage-balance trajectory MUST match the active strategy. For `prepay-extra` this is the accelerated-payoff curve; for `invest-keep-paying` this is the bank's amortization curve; for `invest-lump-sum` this is the bank's curve with a discrete drop to $0 at `lumpSumEvent.age`.
- **FR-003**: The Full Portfolio Lifecycle chart's brokerage trajectory MUST match the active strategy's monthly contribution pattern. Pre-payoff: only the extra contribution under `invest-*`, $0 under `prepay-extra`. Post-payoff: full freed-cash redirect under all strategies.
- **FR-004**: The lump-sum event under `invest-lump-sum` MUST appear as a discrete drawdown on the lifecycle chart at the trigger age, with the brokerage line dropping by the lump-sum amount in the same year.
- **FR-005**: The sidebar (or top KPI strip) MUST display the active mortgage strategy and the resulting mortgage-payoff age. The label updates immediately on strategy change.
- **FR-006**: The FIRE-age search (`isFireAgeFeasible` and the bisection that drives the "FIRE in N years" headline) MUST consume the active mortgage strategy when computing feasibility. The "On Track / Behind" verdict MUST reflect the strategy.
- **FR-007**: The strategy ranker (Safe/Exact/DWZ × Preserve/MinimizeTax) MUST re-rank when the mortgage strategy changes. The ranker's input lifecycle simulation must use the active mortgage strategy.
- **FR-008**: The audit tab's flow diagram MUST gain new sub-steps documenting the mortgage-strategy resolution and its effect on the lifecycle simulation, per Constitution Principle II. Specifically, the audit MUST emit:
  - `'resolve active mortgage strategy: {strategy} (from state._payoffVsInvest.mortgageStrategy)'`
  - `'compute lifecycle mortgage trajectory under {strategy}'`
  - `'apply lump-sum trigger month-by-month'` (only when `mortgageStrategy === 'invest-lump-sum'`)
  - `'lump-sum LTCG gross-up: realBalance × (1 + ltcgRate × stockGainPct) = {grossedUpDrawdown}'` (only when lump-sum fires)
  - `'evaluate sell-at-FIRE event at age {fireAge}'` (only when `sellAtFire === true`)
  - `'Section 121 exclusion: nominalGain={gain}, exclusion={section121Cap}, taxableGain={taxableGain}'` (only when sell event executes)
  - `'home-sale capital gains tax: taxableGain × ltcgRate = {capGainsTax}'`
  - `'credit post-sale brokerage at FIRE = {postSaleBrokerage}'`
  - `'lifecycle handoff: pre-FIRE simulator → retirement-phase simulator'`
- **FR-019**: The "Copy Debug Info" button (`copyDebugInfo()` function in both HTML files, around line 16798 in RR) MUST extend its emitted JSON payload to include the new feature 018 state, so support / debug payloads pasted by the user contain enough information to diagnose mortgage-strategy issues. Specifically the payload MUST include:
  - `mortgageStrategy` (string: `prepay-extra` | `invest-keep-paying` | `invest-lump-sum`)
  - `mortgageActivePayoffAge` (number, the resolved payoff age under active strategy)
  - `lumpSumEvent` (the existing object from `calc/payoffVsInvest.js` v2, or `null`)
  - `homeSaleEvent` (NEW object when `sellAtFire === true`: `{ proceeds, gain, section121Exclusion, taxableGain, capGainsTax, netToBrokerage }`, else `null`)
  - `postSaleBrokerageAtFire` (number; equals `lifecycle.brokerageAtFire` after the sell event executes, or the same as the active strategy's brokerage at FIRE when `sellAtFire === false`)
  - The existing `feasibilityProbe` block continues to emit; its inputs to `projectFullLifecycle` MUST include the resolved mortgage strategy so the probe matches what the chart actually rendered (per the existing process lesson "FIRE-mode gates MUST evaluate the displayed strategy").
- **FR-009**: The mortgage-strategy setting MUST persist in `localStorage` (within the existing `state._payoffVsInvest` blob or an equivalent canonical state container). Old saved states without the field MUST default to `invest-keep-paying` (today's behavior — strict backwards compatibility).
- **FR-010**: The active mortgage-strategy selector lives on the **Payoff-vs-Invest tab** (Q1=A). Implementation: a Prepay/Invest radio group placed alongside the existing lump-sum checkbox. The PvI tab is the canonical edit surface; the sidebar (US2) is read-only display.
- **FR-011**: When the lump-sum branch fires, the simulation MUST treat it as a **taxable LTCG event** (Q2=B). The brokerage drawdown grosses up by `ltcgRate × stockGainPct`, so `actualBrokerageDrawdown = realMortgageBalance × (1 + ltcgRate × stockGainPct)`. The PvI tab's verdict line MUST surface this delta (the difference between PvI's tax-free `lumpSumEvent.paidOff` and the lifecycle's gross-up amount) so the user sees the cost.
- **FR-012**: When mortgage strategy changes shift the feasible FIRE age, the FIRE marker MUST **auto-move** to the new feasible age (Q3=A). The "FIRE in N years" headline updates immediately. Any prior manual marker drag is discarded. Aligns with the dashboard's existing recompute-on-input-change pattern.
- **FR-013**: When `sellAtFire === true`, the lifecycle simulator MUST execute the sell event at FIRE age regardless of mortgage strategy. The sell yields `homeValueAtFire × (1 − sellingCostPct) − capGainsTaxOnSale − remainingBalanceAtFire`, which credits to the brokerage as a one-time deposit. `remainingBalanceAtFire` is computed under the active mortgage strategy.
- **FR-014**: Lump-sum vs. sell-at-FIRE precedence (Q4 logic confirmation): when `sellAtFire === true` AND `mortgageStrategy === 'invest-lump-sum'`, the lump-sum trigger MUST be evaluated only for months PRIOR to FIRE age. If the trigger condition is met pre-FIRE, the lump-sum fires normally. If FIRE arrives before the trigger condition is met, the sell-at-FIRE event is the effective payoff and `lumpSumEvent === null`. The lump-sum is never modeled post-FIRE.
- **FR-015**: PvI tab behavior when `sellAtFire === true` (Q4=B refined): the PvI calc module MUST run the FULL horizon to endAge, modeling the sell event at FIRE age as a discrete two-step transition: (a) settle the active strategy's remaining mortgage from sale proceeds; (b) inject `homeValueAtFire × (1 − sellingCostPct − capGainsTaxOnSale)` minus remaining balance into the brokerage. Both Prepay and Invest curves continue compounding at the real rate post-FIRE. The PvI chart MUST show a sell-event marker at the FIRE age (e.g., a green star).
- **FR-016**: Capital gains tax on home sale (Q5=B): the simulation MUST apply the **US Section 121 exclusion** ($250K single / $500K MFJ) to the home's gain (`homeValueAtFire − originalPurchasePrice`), then tax any excess gain at the user's `ltcgRate`. A new input field `mfjStatus: 'single' | 'mfj'` is required (default MFJ for the RR dashboard, default single for the Generic dashboard, OR derive from existing single-person-mode flag if present). Per-country rules are out of scope for this feature (US-only handling).
- **FR-017**: Visual treatment of overlapping events on the PvI chart (Q6=A): when both a lump-sum event AND a sell-at-FIRE event occur, BOTH receive full visual treatment. Lump-sum: blue down-arrow labeled "Invest pays lump sum at age X". Sell-at-FIRE: green star labeled "Sell home at age Y · +${equity injection}". Each event has its own legend entry; tooltip discloses the event details on hover.
- **FR-018**: Lifecycle handoff (Q4 logic confirmation): the lifecycle simulator MUST consume only the **post-sale brokerage value at FIRE** under the active mortgage strategy from the PvI calc module (not the long-horizon trajectory). Post-FIRE, the lifecycle simulator's own withdrawal-strategy logic drives the projection. Mortgage cash-flow ceases at FIRE (because the home is sold). For `sellAtFire === false`, the lifecycle simulator continues to track the mortgage cash flow under the active strategy through the bank's amortization end (or the lump-sum age) and the home equity persists as illiquid net worth.

### Key Entities

- **MortgageStrategy** (canonical state value): one of `prepay-extra`, `invest-keep-paying`, `invest-lump-sum`. Stored in `state._payoffVsInvest.mortgageStrategy`. Read by: lifecycle simulator, sidebar, FIRE-age search, strategy ranker, audit.
- **MortgageTrajectory** (per-year output of the lifecycle simulator): mortgage balance at each simulation year under the active strategy. Replaces today's contractual-only trajectory. Truncated at FIRE age when `sellAtFire === true`.
- **LumpSumEvent (lifecycle integration)**: the existing `lumpSumEvent` from `calc/payoffVsInvest.js` v2 is now consumed by the lifecycle simulator as a discrete brokerage drawdown at the trigger age — grossed-up for LTCG per FR-011.
- **HomeSaleEvent**: NEW. Triggered at FIRE age when `sellAtFire === true`. Computes `proceeds = homeValueAtFire × (1 − sellingCostPct)`, `gain = homeValueAtFire − originalPurchasePrice`, `taxableGain = max(0, gain − section121Exclusion)`, `capGainsTax = taxableGain × ltcgRate`, `netToBrokerage = proceeds − capGainsTax − remainingBalanceAtFire`. Surfaced as both a lifecycle-chart annotation AND a PvI-chart sell-marker.
- **MortgageActivePayoffAge**: the resolved payoff age under the active strategy. Replaces today's bank-schedule-only payoff age. Surfaced in the sidebar, the lifecycle chart marker, and the verdict copy. Becomes equal to FIRE age when `sellAtFire === true` AND no pre-FIRE payoff (Prepay or lump-sum) occurred.
- **PostSaleBrokerageAtFire**: NEW handoff value. The brokerage balance at FIRE age under the active strategy AFTER the sell event has executed (when applicable). Consumed by the lifecycle simulator as the starting brokerage for the retirement phase.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When the user toggles between Prepay, Invest, and Invest+Lump-Sum, every chart and KPI on the dashboard updates within 200 ms with values that match the calc module's outputs (no two views disagree on the active mortgage strategy).
- **SC-002**: The Full Portfolio Lifecycle chart's mortgage-payoff age is identical (within 1 year of rounding) to the age shown on the Payoff-vs-Invest tab and in the sidebar indicator, in 100% of test scenarios.
- **SC-003**: The lump-sum branch produces a visible, single-year drawdown on the lifecycle chart's brokerage line at the trigger age, of magnitude equal to `lumpSumEvent.paidOff` ± any taxable gross-up resolved in FR-011.
- **SC-004**: For backwards compatibility, every saved-state JSON file produced before this feature MUST load and produce a lifecycle chart byte-identical to today, with mortgage strategy defaulted to `invest-keep-paying`.
- **SC-005**: Strategy-ranker output flips when warranted — for at least one test scenario where the mortgage strategy is the deciding factor, the ranker's winning withdrawal strategy changes when the user toggles Prepay vs Invest.
- **SC-006**: The audit tab's flow diagram displays the new mortgage-strategy resolution sub-steps in plain English on every recalc, satisfying Constitution Principle II audit-observability. The "Copy Debug Info" button's emitted JSON payload includes `mortgageStrategy`, `mortgageActivePayoffAge`, `lumpSumEvent`, `homeSaleEvent`, and `postSaleBrokerageAtFire` so a single paste can diagnose any mortgage-strategy interaction.
- **SC-007**: 100% of new user-visible strings ship with both EN and zh-TW translations in the same change set (Constitution Principle VII).
- **SC-008**: When `sellAtFire === true`, the PvI chart shows a sell marker at FIRE age and both curves display the equity-injection jump; the lifecycle chart's mortgage line stops at FIRE and the brokerage gains the post-sale cash. Verified across all 8 scenarios in the interaction matrix.
- **SC-009**: Lump-sum events that would have fired post-FIRE under `sellAtFire === true` are correctly inhibited (`lumpSumEvent === null`); pre-FIRE lump-sums fire as today and compose with the FIRE-sale event.
- **SC-010**: Section 121 exclusion is applied correctly: for a $500K home appreciating to $1M sold under MFJ, $500K gain − $500K exclusion = $0 taxable gain. For a $500K home appreciating to $1.2M sold under MFJ, $700K gain − $500K exclusion = $200K taxable × user's `ltcgRate`. Both verified in fixture tests.

---

## Assumptions

- **Calc module reuse**: this feature does NOT re-implement Payoff-vs-Invest math. It threads the existing `calc/payoffVsInvest.js` v2 outputs into the lifecycle simulator. Any new logic lives in the lifecycle simulator's mortgage-cash-flow handling.
- **Lockstep**: every UI change ships to both `FIRE-Dashboard.html` AND `FIRE-Dashboard-Generic.html` per Constitution Principle I.
- **No new dependencies**: continuing the project's zero-build / file:// constraint per Principle V.
- **Existing FIRE-marker drag** continues to work; recompute on drag now also re-runs the mortgage-strategy resolution.
- **Lifecycle simulator**: assumed to live as inline script blocks in both HTML files (current state). Extracting it into a new `calc/lifecycle.js` is OUT OF SCOPE for this feature; we modify it in place.
- **Refi handling**: the `plannedRefi` input on PvI is assumed to flow through to the lifecycle simulator's mortgage trajectory under the active strategy. If today's lifecycle simulator doesn't honor refi, that's a pre-existing gap noted but not necessarily fixed here.
- **Tax model for lump-sum**: resolved (Q2=B). LTCG gross-up applied via `ltcgRate × stockGainPct`.
- **FIRE-marker auto-move**: resolved (Q3=A). Marker auto-moves on strategy change.
- **Sidebar real estate**: assumed to have room for one additional one-line indicator per US2. If not, a short pill/chip near the existing "On Track" verdict suffices.
- **Performance**: lifecycle recompute already runs sub-100ms per Principle V; threading mortgage strategy through adds negligible cost (< 5ms).
- **Sell-at-FIRE tax model**: Section 121 only (US-style). Per-country home-sale tax is OUT OF SCOPE; `mfjStatus` defaults from the existing single-person-mode flag where present.
- **Existing `sellAtFire` calc state**: assumed to live in the mortgage input record (per the test fixture's `sellAtFire: false` field). The lifecycle simulator currently consumes this; we extend the consumption to compose with the active strategy.
- **Home appreciation model**: real-zero (today's PvI calc-module assumption — `homeValueReal = mortgage.homePrice`). Sell-at-FIRE under this model means `homeValueAtFire ≡ homePrice` in real dollars; gain in nominal terms equals inflation × yearsOwned. The Section 121 calculation operates in NOMINAL dollars (since the IRS taxes nominal gains).

---

## Out of Scope

- Refactoring the lifecycle simulator out of inline `<script>` blocks into `calc/lifecycle.js`. Worth doing eventually (Constitution Principle II calls for this) but not bundled into 018.
- Adding new mortgage products (ARMs, balloon mortgages, etc.). Only the existing fixed-rate amortization is supported.
- Monte Carlo / scenario sensitivity for the mortgage strategy.
- Animated transitions for the lump-sum drop on the lifecycle chart.
- Re-modeling the *Prepay* strategy with a separate lump-sum option (Prepay never has a brokerage to draw from in Stage I, so the concept doesn't apply).
- Changing the existing Payoff-vs-Invest tab's appearance (it remains the deep-dive view; this feature only adds the strategy *selector* there per FR-010 option a, if that's chosen).
- Cross-feature interaction with feature 008 (multi-strategy withdrawal optimizer's θ-sweep) beyond ensuring the ranker re-sorts when the mortgage strategy changes.
