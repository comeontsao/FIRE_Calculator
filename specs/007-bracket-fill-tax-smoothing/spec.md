# Feature Specification: Bracket-Fill Tax Smoothing (Default Trad Strategy)

**Feature Branch**: `007-bracket-fill-tax-smoothing`
**Created**: 2026-04-21
**Status**: Draft
**Input**: User description: "Replace spend-only Trad 401(k) withdrawal with bracket-fill-by-default; surface IRMAA, Social Security provisional-income, Rule of 55, and 5-year Roth rule caveats transparently in the chart; no user-toggleable opt-in — this is the new default because every rational user wants it."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Smoothed lifetime tax burden with transparent caveats (Priority: P1)

As someone staring at the Lifetime Withdrawal Strategy chart, I can see my Traditional 401(k) being drawn down a little every year in retirement — not in a 3-year concentrated burst — so my lifetime tax bill is as low as possible AND the chart makes it obvious whenever a rule (Social Security taxable portion, Medicare/IRMAA surcharge threshold, Rule of 55 unlock, 5-year Roth clock) is affecting that year's draw.

**Why this priority**: This is the whole feature. The existing "cover-spend-only" algorithm leaves most of the 12%-bracket headroom unused every year, then gets force-drawn at higher brackets through RMDs at age 73+. Switching to bracket-fill by default cuts lifetime federal tax materially — that is the core user-facing win. The transparent-caveat requirement is inseparable from it: a tax optimizer I don't understand is an optimizer I don't trust, so the chart has to show its work.

**Independent Test**: Load Roger & Rebecca's baseline scenario. Inspect the Lifetime Withdrawal Strategy chart. Traditional 401(k) draws appear every year from the unlock age through plan age, rather than three tall bars at ages 60-62. The summary line at top of the chart states "Strategy: bracket-fill at 12% cap minus 5% safety margin." Total lifetime tax (printed on the Full Portfolio Lifecycle chart caption) is at least 25% lower than the current implementation's lifetime tax.

**Acceptance Scenarios**:

1. **Given** a user with a FIRE plan that unlocks the 401(k) at age 60 and has a large Traditional balance, **When** they look at the Lifetime Withdrawal Strategy chart, **Then** the chart shows small-to-moderate Traditional draws every year from age 60 onward, not three concentrated years. The total vertical bar for each year stays roughly flat once they are past the unlock age and through the 12% bracket.
2. **Given** the same user, **When** Social Security starts at age 67, **Then** the Traditional draw in that year and after becomes smaller (because taxable Social Security has filled part of the bracket headroom). An annotation or footnote beneath the chart names the effect: "Social Security taxable (85%) fills $X of the bracket this year; Traditional fill reduced accordingly."
3. **Given** a scenario where a year's Modified Adjusted Gross Income would exceed the Medicare IRMAA Tier 1 threshold, **When** the chart renders that year, **Then** an IRMAA indicator (icon or red-dashed line) appears on the chart with a tooltip or caption explaining the premium surcharge that will apply two years later.
4. **Given** a user who enables the Rule of 55 and retires at age 56, **When** the charts render, **Then** the Traditional 401(k) unlock marker on the Full Portfolio Lifecycle chart moves from 59.5 to 55 and the Lifetime Withdrawal Strategy chart starts drawing Traditional from age 55. A Key Years annotation includes "Age 55 — Rule of 55 Traditional unlock."
5. **Given** a user is below age 59.5, has NOT enabled the Rule of 55, and a synthetic conversion would otherwise occur, **When** the chart renders, **Then** a warning annotation appears explaining the 10% early-withdrawal penalty and/or the 5-year Roth clock and the strategy narrative explains why the conversion is blocked that year.
6. **Given** the user changes the safety margin slider from 5% to 0%, **When** the dashboard recalculates, **Then** the Traditional draw each year rises (closer to the nominal 12% bracket cap), the lifetime tax number stays similar or drops slightly, and the IRMAA guardrail still applies.
7. **Given** any change that affects bracket-fill (slider, Rule of 55 toggle, IRMAA threshold, filing-status change on Generic, FIRE-marker drag), **When** the dashboard recalculates, **Then** all THREE downstream surfaces update on the same update cycle and agree with each other: (a) the computed FIRE date in the status banner and KPI row, (b) the Full Portfolio Lifecycle chart's shape and its sidebar mirror, (c) the Lifetime Withdrawal Strategy chart's per-year bars and totals. A user comparing the per-year Traditional draw in the Lifetime Withdrawal Strategy chart to the same year's tooltip on the Full Portfolio Lifecycle chart sees consistent numbers; the status banner's projected FIRE age matches what the lifecycle chart's FIRE marker sits at.

---

### User Story 2 — Confidence that rare edge cases do not silently break the plan (Priority: P2)

As a user who wants to trust my retirement projection, I want every rule the algorithm obeys to be visible on the page. When the algorithm's default behavior changes for my scenario (e.g., Social Security caps the fill, IRMAA caps the fill, the Rule of 55 enables earlier Traditional draws, the 5-year Roth rule blocks an early conversion), I want the chart to SHOW me so I can judge whether the plan is correct for my situation.

**Why this priority**: A proactive tax optimizer is only useful if the user can verify what it is doing. Without visible indicators, a subtle bug or an unexpected rule interaction can quietly change the plan. The user has explicitly asked for "transparent and explained" surfacing of every caveat. This is a trust and auditability story, not a new capability story.

**Independent Test**: Build three contrived scenarios — one that triggers each caveat (SS reduction, IRMAA cap, Rule of 55 unlock, 5-year Roth warning). For each, load the dashboard, scroll to the Lifetime Withdrawal Strategy chart, and verify the corresponding indicator is visible and the tooltip/caption accurately describes the rule and the impact.

**Acceptance Scenarios**:

1. **Given** a scenario where Social Security's taxable portion at age 67 consumes 40% of the bracket headroom, **When** the user views the strategy chart, **Then** the Traditional draw from 67 onward is visibly smaller than pre-67 years, and an annotation near the chart states the Social Security fill amount and its effect.
2. **Given** a scenario where in a specific year the computed MAGI would exceed the IRMAA threshold, **When** the chart renders, **Then** either (a) the algorithm capped the Traditional draw and a "capped by IRMAA" annotation appears on that year's bar, or (b) the user has configured an override that forces the breach and the chart shows a red IRMAA indicator plus a tooltip estimating the Medicare premium surcharge.
3. **Given** a Rule-of-55-enabled scenario retiring at age 56, **When** the user views the Full Portfolio Lifecycle chart, **Then** a distinct marker at age 55 is visible (different from the existing 59.5 unlock marker) and the legend names it.
4. **Given** a user toggles Rule of 55 off after previously enabling it, **When** the dashboard recalculates, **Then** the age-55 unlock marker disappears, the Traditional unlock age returns to 59.5, and all other charts update on the same frame.
5. **Given** a user increases the safety margin to 10%, **When** the chart renders, **Then** the Traditional draw each year is visibly smaller than under the 5% default, the strategy summary reflects the new margin value, and lifetime tax paid stays roughly the same or rises slightly.

---

### Edge Cases

- **Traditional balance smaller than the bracket headroom**: the algorithm draws the entire Traditional balance in the year it unlocks, then falls through to Roth and taxable stocks for subsequent years. No synthetic conversion happens.
- **Traditional balance zero at FIRE**: the algorithm behaves identically to the current implementation (no bracket-fill possible). The chart shows no bracket-fill annotations.
- **Rule of 55 enabled but separation age is 54**: the user's configuration is invalid (cannot use Rule of 55 if separated before age 55). The dashboard shows a validation warning and falls back to the 59.5 unlock.
- **Rule of 55 enabled on a non-US-resident scenario (e.g., Japan retirement)**: Rule of 55 is a US federal tax rule; it still applies because the user still files US taxes. The algorithm respects the unlock. But the user should see a small informational note reminding them to verify local tax treatment.
- **Social Security claimed at age 70 instead of 67**: the bracket-fill headroom stays generous from age 60 to 70, then shrinks at 70. The chart annotations explain the switch.
- **Safety margin set to 0%**: the algorithm fills exactly to the bracket cap. This is allowed but the UI should show a subtle warning ("0% margin — any IRS bracket drift next year may push you into 22%").
- **Safety margin above 10%**: invalid input; clamp to 10% and show a hint.
- **IRMAA threshold set to $0 or blank**: treat as disabled; the algorithm ignores IRMAA. Show a hint that IRMAA protection is off.
- **Multiple-year scenarios where a synthetic conversion would create a 5-year clock that ends after plan age**: the conversion is technically irrelevant (the user is dead for tax purposes). Allow it; annotation clarifies.
- **Interaction with Die-With-Zero**: bracket-fill grows the taxable-stocks pool via synthetic conversions, which compounds and increases the terminal balance for a given FIRE age. Under DWZ's "end at $0" constraint, the solver therefore re-targets an **earlier** FIRE age — because less starting portfolio is needed to still deplete to $0 by plan age when stocks are compounding extra synthetic-converted dollars during retirement. This re-targeting must happen automatically; the user should not have to re-select DWZ.
- **User overrides FIRE age via drag to a pre-unlock age**: the algorithm cannot perform bracket-fill below the unlock age. The chart behaves identically to the current implementation for pre-unlock years, then bracket-fills once the user passes the unlock threshold.

## Requirements *(mandatory)*

### Functional Requirements

#### Core bracket-fill behavior

- **FR-001**: The withdrawal engine MUST, in every retirement year where the Traditional 401(k) is accessible, draw Traditional up to a target ordinary-taxable-income level equal to `(standardDeduction + top12BracketCap) × (1 − safetyMargin)`, minus any ordinary income already present (taxable Social Security, Required Minimum Distribution). The Traditional draw MUST never cause ordinary taxable income to exceed that target (except when the Required Minimum Distribution itself forces an overage — RMD always takes priority).
- **FR-002**: When the annual Traditional draw exceeds the year's spending need, the excess (net of the tax paid on it) MUST be transferred to the taxable stocks pool at the next-year boundary, where it compounds at the stocks real-return rate and is subject to Long-Term Capital Gains treatment on future sales. This is called a "synthetic conversion" in this feature.
- **FR-003**: Bracket-fill MUST operate independently of the Safe / Exact / Die-With-Zero strategy selector. The strategy selector governs the feasibility constraint (end-balance target); bracket-fill governs withdrawal composition within each year.
- **FR-004**: The algorithm MUST be the default — no user toggle enables or disables bracket-fill. The previous "cover-spend-only" behavior is retired.
- **FR-005**: A single user-adjustable "Safety Margin" control (range 0% to 10%, default 5%) MUST be present in the UI. Any value outside that range is clamped with a visible hint.

#### Social Security integration

- **FR-010**: From the year Social Security starts, the algorithm MUST compute the taxable portion of Social Security as 85% of gross Social Security income and subtract that amount from the bracket headroom before computing the Traditional draw for that year.
- **FR-011**: When the Traditional draw is reduced because of Social Security taxable income, a visible annotation near the Lifetime Withdrawal Strategy chart MUST name the reduction and its cause.

#### IRMAA protection

- **FR-020**: From the year the user turns 63 onward (two-year IRMAA lookback), the algorithm MUST compute each year's Modified Adjusted Gross Income (Traditional draw + taxable Social Security + LTCG on stock sales) and compare to the user-adjustable IRMAA Tier 1 threshold.
- **FR-021**: If the computed MAGI for a year (after bracket-fill) would exceed `irmaaThreshold × (1 − safetyMargin)`, the Traditional draw MUST be reduced so that MAGI lands at or below that capped value.
- **FR-022**: When the IRMAA cap is the binding constraint for a year's Traditional draw, a visible indicator MUST appear on that year's bar in the Lifetime Withdrawal Strategy chart, with a tooltip/caption explaining the Medicare Part B and Part D premium surcharge that would apply two years later.
- **FR-023**: A red dashed horizontal line at the IRMAA Tier 1 threshold MUST be drawn across the Lifetime Withdrawal Strategy chart, visible regardless of whether any year crosses it, so the user can see how close they are.
- **FR-024**: The IRMAA Tier 1 threshold MUST be user-adjustable, with a sensible MFJ default for the current tax year. Setting it to zero or blank disables IRMAA protection, and a visible hint communicates that.

#### Rule of 55

- **FR-030**: The UI MUST expose a "Plan to use Rule of 55" checkbox (default off) and, when checked, a "Separation age" input (range 50 to 65, default equal to the current FIRE age).
- **FR-031**: When Rule of 55 is enabled and `separationAge >= 55`, the Traditional 401(k) unlock age for the withdrawal engine MUST drop from 59.5 to 55. The Roth 401(k) unlock age MUST remain at 59.5 unless the user separately elects otherwise (out of scope for this feature).
- **FR-032**: When Rule of 55 is enabled and the user's FIRE age is less than 55 OR the separation age input is less than 55, the UI MUST show a validation warning and the engine MUST fall back to the 59.5 unlock.
- **FR-033**: A visual marker distinct from the existing 59.5 unlock marker MUST appear at age 55 on the Full Portfolio Lifecycle chart whenever Rule of 55 is active. The chart legend and the Key Years annotation line MUST include "Age 55 — Rule of 55 Traditional unlock."
- **FR-034**: A small informational annotation MUST explain the Rule of 55's single-plan limitation (draws are penalty-free only from the employer's plan at the separation event; old-employer plans rolled INTO that plan BEFORE separation are covered, but external IRAs are not).

#### 5-year Roth rule warning

- **FR-040**: When the algorithm determines that a synthetic conversion would occur in a year where (a) the user is below age 59.5, (b) Rule of 55 is not active, and (c) the conversion's principal would not clear the 5-year clock before the user reaches age 59.5, the engine MUST block the conversion for that year and surface a warning annotation on the Lifetime Withdrawal Strategy chart and on the strategy summary. **Note for feature 007 scope**: this scenario cannot actually occur during feature 007 because "synthetic conversion" in this feature only happens when Traditional is accessible (post-59.5, or post-55 with Rule of 55 enabled). The requirement exists as infrastructure — the placeholder warning element, i18n keys, and the always-false `roth5YearWarning` flag — so a future true-Roth-conversion feature can activate it without UI churn. See research R3 for the full rationale.
- **FR-041**: The warning MUST name the rule ("5-year Roth conversion clock") and the consequence ("10% early-withdrawal penalty on the principal if drawn before the clock expires"). Same scope note as FR-040: the warning copy is wired but never surfaces in feature 007.

#### Chart transparency

- **FR-050**: The Lifetime Withdrawal Strategy chart MUST show a new legend entry and bar segment for "Traditional: Bracket-fill excess → taxable" representing the portion of each year's Traditional draw that is routed to the synthetic conversion.
- **FR-051**: The strategy summary narrative above the chart MUST state the current strategy mode, the current safety margin, and a one-line plain-English summary of what is happening (e.g., "Filling 12% bracket with Traditional to `$X` each year, routing excess `$Y` into taxable — targeted average tax rate `Z%`.").
- **FR-052**: The Full Portfolio Lifecycle chart MUST show, near the end of plan age, a text caption comparing the lifetime federal tax paid under bracket-fill to what would have been paid under the retired cover-spend-only approach (as a dollar figure and a percentage savings).
- **FR-053**: A closed-by-default information panel with an ⓘ icon in the UI MUST explain, in plain language, (a) what bracket-fill does, (b) why the safety margin exists, (c) IRMAA, Rule of 55, and 5-year Roth rules at a glance, and (d) the scenarios where bracket-fill saves significant money vs. the scenarios where it does not.

#### Solver and projection integration

- **FR-060**: The signed lifecycle simulator MUST route excess Traditional draws into the taxable stocks pool each year so the end-balance computation stays truthful to the chart. (No divergence like the feature-006 tax algorithm bug.)
- **FR-061**: The Safe, Exact, and Die-With-Zero solvers MUST continue to work correctly after bracket-fill is introduced. Switching strategies or dragging the FIRE marker MUST trigger a full recalculation that includes the bracket-fill effects.
- **FR-062**: When the user changes the safety margin slider, the IRMAA threshold, or the Rule of 55 settings, the dashboard MUST recalculate all dependent charts and metrics on the same update cycle as any other input change.
- **FR-063** (cross-surface consistency — NON-NEGOTIABLE): The bracket-fill algorithm drives a wide set of downstream artifacts that MUST agree with each other on every recalc because they are all derived from the same underlying projection. Implementation MUST update or verify each of the following surfaces:

  **Three primary consumers that invoke `taxOptimizedWithdrawal` directly:**
  1. `signedLifecycleEndBalance` — drives the Safe / Exact / DWZ solvers → computed FIRE date.
  2. `projectFullLifecycle` — drives the Full Portfolio Lifecycle chart AND (via the shared `_lastLifecycleDataset` cache from feature 006) the pinnable sidebar lifecycle mirror AND (via `simulateDrawdown` which wraps it) the Portfolio Drawdown: With vs Without SS chart AND the Roth Ladder chart AND the override-banner comparison numbers.
  3. `computeWithdrawalStrategy` — drives the Lifetime Withdrawal Strategy chart and all its new annotations (synthetic-conversion segment, IRMAA line, ⚠ glyphs, SS-reduction caption, strategy narrative, lifetime-tax-comparison caption).

  **Derived values / charts that inherit bracket-fill through the three primary consumers above:**
  - KPI row: Net Worth (unchanged — point-in-time), FIRE Number (via `getTwoPhaseFireNum` → `findMinAccessibleAtFireNumerical` → `signedLifecycleEndBalance`), Progress to FIRE (ratio: current accessible / FIRE Number), Years to FIRE (via `yearsToFIRE` → `findFireAgeNumerical` → `signedLifecycleEndBalance`).
  - Status banner "On Track — FIRE in X years / age Y" — reflects the new FIRE age.
  - Feature 006 compact header's live-stat chips (Years to FIRE, Progress %) — update from `_lastKpiSnapshot`.
  - Progress rail under the KPI row (fill %, midpoint tick, target label) — updates from the new FIRE Number target.
  - FIRE-by-Country ranked bar chart — each of 11 scenarios re-ranked based on new per-country years-to-FIRE.
  - Country scenario grid cards (11 cards) — each card's FIRE number and years-to-FIRE update; `computeScenarioFireFigures` helper from feature 006 continues to handle the per-scenario swap correctly because it still routes through `signedLifecycleEndBalance` which now uses bracket-fill.
  - Milestone Timeline — per-scenario FIRE milestone positions shift.
  - Coast FIRE card — uses `coastFIRECheck` → `findMinAccessibleAtFireNumerical`, so target shifts.
  - Override banner (when a drag override is active) — recomputes overrideLifecycle vs originalLifecycle using `projectFullLifecycle` under bracket-fill.
  - Infeasibility banner + deficit number — recomputed under bracket-fill via `_evaluateFeasibilityAtAge` + `_computeDeficitReal`.
  - Snapshot save (CSV "FIRE target" column) — the logged value reflects bracket-fill's FIRE number.
  - Full Portfolio Lifecycle chart caption (new in feature 007) — displays lifetime tax under bracket-fill.

  **Surfaces NOT affected (no change expected):**
  - Net Worth Pie (point-in-time asset breakdown).
  - Expense Pie (current-year expense composition).
  - Healthcare comparison chart (per-country static cost display).
  - Section dividers and the merged footer.

  All affected surfaces MUST update on the same update cycle. A change to any input that affects bracket-fill — the safety-margin slider, Rule-of-55 checkbox or separation age, IRMAA threshold, filing-status detector (Generic), or a drag of the FIRE marker — MUST propagate to every consumer above. None may lag, re-derive, or drift from the primary algorithm.

  **Testable invariants** (a user story 1 acceptance scenario 7 provides the qualitative check; success criteria SC-011 and SC-012 below give measurable numeric checks):
  - Cumulative `wTrad` across retirement years from `computeWithdrawalStrategy.strategy[]` equals (within floating-point tolerance) the Trad draws implied by year-over-year `p401kTrad` changes in `projectFullLifecycle`, which equals the Trad draws consumed internally by `signedLifecycleEndBalance`.
  - `_lastKpiSnapshot.yrsToFire` equals the sidebar mirror chart's caption FIRE age equals the Full Portfolio Lifecycle chart's FIRE-marker age, at all times.
  - Each of the 11 country scenario cards' FIRE numbers equals `getTwoPhaseFireNum(inp, thatScenarioSpend, estFireAge)` under bracket-fill and updated on the same frame.

- **FR-064**: When bracket-fill changes the computed FIRE date (which it likely will — Safe/Exact move earlier because terminal balance grows, DWZ moves slightly earlier because the plan reaches $0 at an earlier starting portfolio), the status banner ("On Track — FIRE in X years / age Y") and the KPI row's "Years to FIRE" / "FIRE by 20XX" values MUST reflect the new age. If a drag override is active, the override persists (current feature-006 behavior) and the status banner shows the override, not the solver's new answer.

- **FR-063a** (feature 006 sidebar compatibility): The pinnable sidebar lifecycle chart introduced in feature 006 MUST continue to mirror the primary Full Portfolio Lifecycle chart AFTER bracket-fill is introduced. Because the sidebar reads `_lastLifecycleDataset` populated by `projectFullLifecycle`, this requirement is satisfied automatically provided the primary consumer #2 in FR-063 is correctly updated. A manual verification step (quickstart Check 2b.3–2b.5) MUST confirm the sidebar's chart shape + caption values match the primary chart after any bracket-fill-affecting input change.

#### Filing-status awareness (Generic dashboard)

- **FR-065**: The Generic dashboard (`FIRE-Dashboard-Generic.html`) MUST apply Single-filer tax brackets when the user's household configuration indicates no spouse/partner, and Married-Filing-Jointly brackets when a partner is present. This includes the standard deduction, the 12% bracket cap, the 22% bracket cap, the LTCG 0%/15%/20% bracket boundaries, and the IRMAA Tier 1 threshold.
- **FR-066**: The bracket-fill engine in Generic MUST read filing status via the existing `detectMFJ(inputs)` helper on every invocation. No retirement-math call site may hardcode `getTaxBrackets(true)` (or equivalent). Specifically, the signed lifecycle simulator's bracket lookup, the chart-projection's bracket lookup, and any new bracket-fill bracket lookup MUST all route through the detector.
- **FR-067**: The RR dashboard (`FIRE-Dashboard.html`) is permitted to hardcode MFJ throughout because Roger & Rebecca are married; this is personal content per Constitution Principle I. Any new bracket-aware code in RR may continue to pass `true` to `getTaxBrackets`. Generic's file-specific divergence on this point is the sole exception to structural-parity.
- **FR-068**: When the user switches Generic's household configuration from partnered to single (or vice-versa) mid-session, the dashboard MUST recalculate all bracket-dependent values — bracket-fill ceiling, IRMAA cap, LTCG tax computation, lifetime-tax comparison number — on the same update cycle as any other input change.
- **FR-069**: The "Safety Margin" control, the Rule of 55 inputs, the IRMAA threshold input, and the bracket-fill defaults MUST all correctly reflect Single-filer values when Generic's filing status is Single. For 2026 defaults: standard deduction $15,000 (Single) vs. $30,000 (MFJ); 12% bracket top $47,150 (Single) vs. $94,300 (MFJ); IRMAA Tier 1 $106,000 (Single) vs. $212,000 (MFJ). User-adjustable in both cases.
- **FR-069a**: A pre-existing hardcoded-MFJ regression in Generic (introduced by feature 006 when the signed lifecycle simulator was rewritten to mirror the chart's withdrawal algorithm — specifically the `getTaxBrackets(true)` call at that site) MUST be repaired as part of this feature's work, in the same commit that introduces the bracket-fill algorithm. The feature-007 CLOSEOUT MUST record the before/after diff for a Single-filer Generic scenario to prove the regression is gone.

#### Bilingual and lockstep

- **FR-070**: Every new user-visible string introduced by this feature MUST ship with both English and Traditional Chinese translations, per Constitution Principle VII. The translation catalog MUST be updated in the same commit as the feature.
- **FR-071**: All changes MUST ship to both `FIRE-Dashboard.html` (RR) and `FIRE-Dashboard-Generic.html` (Generic) in lockstep per Constitution Principle I. The Legacy dashboard stays out of scope. The RR dashboard's hardcoded MFJ assumption (see FR-067) is the documented exception to this lockstep rule — structure / CSS / JS / non-tax-bracket logic still ships identically.

#### Non-regression

- **FR-080**: All existing unit tests (65 tests as of feature 006 closeout) and the browser smoke test (4 tests) MUST continue to pass. Any test that implicitly depended on the retired cover-spend-only algorithm MUST be updated to reflect the new bracket-fill behavior in the same commit, with the update rationale in the commit message.
- **FR-081**: At least ten new unit tests MUST exercise the bracket-fill algorithm across the scenarios listed in Success Criteria.

### Key Entities

- **Safety Margin**: A single fractional value (default 0.05) that shrinks every bracket-fill cap to leave room for IRS bracket drift. Configurable via slider, clamped to `[0, 0.10]`. Applied uniformly to the 12% bracket cap and the IRMAA threshold.
- **Rule of 55 State**: A boolean plus a separation-age integer. When active, replaces the Traditional unlock age from 59.5 to 55 in the retirement withdrawal simulator.
- **IRMAA Threshold**: A dollar amount representing the Medicare Part B and Part D surcharge Tier 1 entry point for the user's filing status. User-adjustable. Default is a current-year MFJ value. Enforced in the algorithm as a MAGI ceiling.
- **Synthetic Conversion Amount**: Per-year dollar amount equal to `max(0, grossTradDraw − grossSpendNeed)`. Compounds into the taxable stocks pool at next-year boundary. Visible on the Lifetime Withdrawal Strategy chart as a distinct segment.
- **Bracket Headroom**: Per-year dollar amount equal to `(standardDeduction + top12BracketCap) × (1 − safetyMargin) − taxableSS − RMD`. This is the effective Traditional-draw ceiling before the IRMAA cap is applied.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Under the Roger & Rebecca primary scenario (FIRE at Safe-mode calculated age, Japan destination, $72,700/yr mortgage-adjusted spending, MFJ, default 5% safety margin), lifetime federal tax paid after this feature is at least 25% lower than lifetime federal tax paid under the feature-006 cover-spend-only algorithm. Both numbers are recorded in the feature CLOSEOUT document.
- **SC-002**: Under the same scenario, the projected Traditional 401(k) balance at age 73 (the RMD start age) is at least 50% lower than what the current implementation projects. The chart caption surfaces both numbers.
- **SC-003**: The Traditional-draw bar in the Lifetime Withdrawal Strategy chart is present in every year from the Traditional unlock age through the earlier of (plan age) or (Traditional balance depleted). No year between unlock and depletion is missing a Traditional draw when non-zero Traditional balance exists.
- **SC-004**: When the user toggles the safety-margin slider through 0%, 5%, and 10% in sequence, the three resulting lifetime-tax-paid numbers are monotonically ordered such that 0% ≤ 5% ≤ 10% (tighter margin → slightly less tax; tighter margin also risks IRS bracket drift, which is the whole point of the control).
- **SC-005**: A user who has never seen this dashboard before can identify, within 60 seconds of looking at the Lifetime Withdrawal Strategy chart, (a) that the strategy is bracket-fill, (b) what the safety margin is set to, and (c) whether any of the caveats (Social Security, IRMAA, Rule of 55, 5-year Roth) are affecting the current plan — without needing to open developer tools or read the source code.
- **SC-006**: For a contrived scenario where the computed MAGI would reach $250,000 MFJ, the Traditional draw for that year is capped to produce MAGI at or below `IRMAA threshold × (1 − safetyMargin)` (default $201,400), and an IRMAA indicator is visible on that year's bar on the chart.
- **SC-007**: When the user enables the Rule of 55 and sets separation age to 55, the Traditional-draw timeline on the Lifetime Withdrawal Strategy chart starts at age 55 (not 59.5); the Full Portfolio Lifecycle chart's phase coloring for Traditional reflects the earlier unlock; and a "Rule of 55" marker is visible near age 55 on the lifecycle chart.
- **SC-008**: Both dashboards (`FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html`) produce identical bracket-fill behavior and identical chart annotations for the same synthetic MFJ input scenario (bilingual strings may differ across language toggle; everything else matches). The documented exception is filing status: RR is hardcoded MFJ while Generic auto-detects from the household configuration.
- **SC-008a**: For a Generic scenario configured as a Single filer (no partner in the household), the bracket-fill ceiling is approximately half of what the equivalent MFJ scenario produces (standard deduction $15K vs $30K, 12% cap $47.15K vs $94.3K). The chart's Traditional-draw bars for the Single scenario are visibly smaller per year than for the MFJ scenario, the IRMAA threshold line sits lower on the chart, and the lifetime-tax comparison caption cites Single-filer brackets in its narrative.
- **SC-008b**: Toggling Generic's household configuration from partnered to single mid-session causes all bracket-aware values (bracket-fill ceiling, IRMAA threshold line position, LTCG calculation, lifetime-tax figure, strategy summary narrative) to update on the same frame as any other input change. No stale MFJ values remain after the toggle.
- **SC-008c**: Searching Generic's source for `getTaxBrackets(true)` returns zero matches after this feature lands. Every call site routes through `detectMFJ(inputs)`. The feature-006 regression where this call was hardcoded is gone. A single unit test directly exercises the signed lifecycle simulator for a Single-filer scenario and asserts the effective tax is materially higher than an MFJ-identical scenario (evidence that filing status is now actually being read).
- **SC-009**: The at-least-ten new unit tests defined in Functional Requirement FR-081 all pass. The existing unit and smoke test counts stay green: 65 unit + 4 smoke at minimum.
- **SC-010**: The bracket-fill calculation adds no more than one additional Chart.js `update()` call per recalculation cycle and no additional solver passes. Users do not perceive a slowdown when dragging the FIRE marker or adjusting a slider.
- **SC-011** (three-way consistency): For any synthetic input scenario, the following three numbers agree within floating-point tolerance (< $10 absolute, < 0.1% relative):
  1. Sum of `wTrad` across all retirement years from `computeWithdrawalStrategy` (Lifetime Withdrawal Strategy chart's data source).
  2. Sum of yearly Traditional draws implied by the `p401kTrad` column of `projectFullLifecycle` (Full Portfolio Lifecycle chart's data source), computed as `lifecycle[i-1].p401kTrad * (1 + realReturn401k) - lifecycle[i].p401kTrad`.
  3. The cumulative Traditional draws consumed by `signedLifecycleEndBalance` (solver's data source), measurable by running it in instrumented mode for testing.

  These three sums MUST be equal. A divergence indicates one of the three call sites is using a different algorithm or different inputs — a feature-006-class bug. This is verified in a new unit test.

- **SC-012** (FIRE-date update on control change): Changing the safety-margin slider from 5% to 10% MUST cause the "Years to FIRE" KPI to change (possibly by a fraction of a year, possibly by several years depending on the scenario). If the KPI does not change, bracket-fill is not propagating to the solver — regression. If a drag override is active, the override persists and the KPI reflects the override; clearing the override (clicking "Reset to calculated" or switching strategy) restores the solver's new answer.

## Assumptions

- The **RR dashboard** (`FIRE-Dashboard.html`) is hardcoded to Married Filing Jointly (MFJ) because Roger & Rebecca are married. This is personal content per Constitution Principle I and is NOT considered structural divergence from Generic.
- The **Generic dashboard** (`FIRE-Dashboard-Generic.html`) auto-detects filing status via the existing `detectMFJ(inputs)` helper: MFJ when a partner is present in the household configuration, Single when alone. All bracket-dependent calculations — bracket-fill ceiling, IRMAA cap, LTCG tax, standard deduction, the 22% cap, everything — MUST honor the detector's output. A pre-existing feature-006 regression that hardcoded MFJ in the signed lifecycle simulator is considered part of feature 007's scope to repair.
- The IRMAA Tier 1 threshold defaults reflect the 2026 tax year: $212,000 for MFJ, $106,000 for Single. The user may adjust either if they know a more current figure.
- The standard deduction defaults reflect the 2026 tax year: $30,000 for MFJ, $15,000 for Single. The 12% bracket top: $94,300 for MFJ, $47,150 for Single. All are already user-adjustable inputs on the Generic dashboard and are filing-status-aware.
- The user's retirement destination has 0% state income tax on Traditional 401(k) distributions. If this changes (e.g., the user later moves to CA, NY, NJ, OR, MN), they are responsible for re-evaluating the bracket-fill plan. The feature does not attempt to model state tax.
- The user's Traditional and Roth 401(k) balances are treated as single aggregated pools each. Real-life multi-plan reality (prior employers, IRAs, etc.) is out of scope; the user is assumed to have consolidated or to be treating the dashboard as informational.
- Social Security taxable-portion calculation uses a fixed 85% approximation. Provisional-income edge cases (0%, 50%, 85% tiers based on combined income) are not modeled precisely; 85% is the conservative cap and matches the feature-006 algorithm.
- Federal tax brackets and the IRMAA threshold are treated as constant (inflation-adjusted at 0%) across the projection horizon. Modeling annual bracket drift is out of scope; the safety-margin control is the mitigation for bracket drift.
- Net Investment Income Tax (3.8% surtax above $250K MAGI for MFJ) is not modeled; the user's target spending is comfortably below the threshold.
- The existing `taxOptimizedWithdrawal` function will be replaced or substantially rewritten. Its current "fill-12%-cheaply" comment and the feature-005-era strategy narrative are considered obsolete and will be updated in the same commit.
- The Die-With-Zero solver will naturally re-target an **earlier** FIRE age because synthetic-conversion-to-stocks compounding increases the terminal balance for any given FIRE age; to still land at $0, the solver needs a smaller starting portfolio, which corresponds to retiring earlier. This is desired behavior, not a regression. The DWZ solver uses the same signed lifecycle simulator, so it adjusts automatically.
- "Synthetic conversion" in this feature is NOT a real Roth conversion; it is a draw-and-reinvest routing. A true in-place 401(k)→Roth IRA conversion is a separate follow-up feature.
- The feature introduces no new runtime dependency. All changes are inline JavaScript/CSS within the existing HTML files, consistent with the zero-build constraint.
