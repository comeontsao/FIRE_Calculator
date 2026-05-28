# Feature Specification: Lifecycle Chart & Verdict Reflect the Active Winning Strategy

**Feature Branch**: `031-lifecycle-strategy-parity`  
**Created**: 2026-05-27  
**Status**: Draft (clarified)  
**Input**: User description: "Lifecycle chart Trad-401K balance must reflect the active withdrawal strategy's draws. The green line only drops after age 72 while the Withdrawal Strategy chart draws Trad from ~60. Investigate whether fixing it breaks the Safe/Exact/DWZ gates."

> **Root cause (confirmed during planning, see research.md)**: This is NOT a balance-vs-flow or tax-math issue. The Lifecycle chart renders during a `chartState.onChange` listener that fires *before* the strategy ranker populates the winning strategy, and — unlike the Withdrawal Strategy chart — it gets no post-rank re-render. So the Lifecycle chart silently draws the **default bracket-fill** strategy while every other surface (Withdrawal Strategy chart) draws the **winning** strategy. The FIRE-marker drag path compounds this by never re-ranking for the previewed age. The user's hypothesis — "dragging didn't recalculate the withdrawal strategy, and it didn't feed back into the lifecycle chart" — is correct. A separate display bug mixes nominal Book-Value bars with purchasing-power totals in the Withdrawal Strategy tooltip.

## Clarifications

### Session 2026-05-27

- Q: Should the Safe/Exact/DWZ FIRE-age verdict be judged on the displayed winning strategy (currently pinned to bracket-fill)? → A: Yes — the gate MUST evaluate the same winning strategy the charts display (re-validate all three modes + audit invariants A–D).
- Q: Include the Withdrawal Strategy tooltip frame-mixing fix (nominal bars vs purchasing-power totals) in this feature? → A: Yes, include in 031.
- Q: Also close the cash-sweep gap (add the feature-030 `_applyCashSweep` to `projectFullLifecycle`'s retirement loop, which the other five simulators already run)? → A: Yes, fix it in 031.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Lifecycle chart draws the same strategy as the Withdrawal Strategy chart (Priority: P1)

A user on the Retirement tab views the Withdrawal Strategy chart, which (for the active Mode/Objective)
draws the winning strategy — e.g. a meaningful Trad 401K draw starting at the ~60 unlock age. They
switch to the Lifecycle chart, which today shows the Trad balance still climbing until ~72 because it
is silently drawing a *different* (default bracket-fill) strategy. After this feature, the Lifecycle
chart's per-pool balance trajectories reflect the **same winning strategy**, so its Trad 401K balance
declines from the age the winner actually starts drawing it, matching the Withdrawal Strategy chart.

**Why this priority**: This is the defect. Two charts of the same plan showing two different strategies
destroys trust. Fixing it is the entire point of the feature.

**Independent Test**: For a scenario where a non-default strategy wins (e.g. Exact + "Leave more
behind"), read the winning strategy's Trad draws off the Withdrawal Strategy chart, then confirm the
Lifecycle chart's Trad balance reflects those same draws (declines from the same age) rather than the
bracket-fill default.

**Acceptance Scenarios**:

1. **Given** a scenario where a non-bracket-fill strategy wins, **When** the Lifecycle chart renders after a recalc, **Then** it draws the winning strategy's per-year mix (not the default).
2. **Given** the winning strategy draws ~$100K of Trad at age 60, **When** the user views the Lifecycle chart, **Then** the Trad 401K balance line declines from ~60 consistent with that draw.
3. **Given** the active winner is itself a draw-Trad-last strategy (e.g. preserve-estate), **When** the Lifecycle chart renders, **Then** the Trad line legitimately stays high until other pools deplete — the rule is "match the displayed winner," not "always draw Trad early."

---

### User Story 2 - Dragging the FIRE marker keeps every retirement view in sync (Priority: P1)

A user drags the FIRE-age marker on the Lifecycle chart. Today the drag re-renders the Lifecycle chart
without re-running the strategy ranker for the previewed age, so the Lifecycle chart and the Withdrawal
Strategy chart can diverge mid-drag and after commit. After this feature, dragging keeps the Lifecycle
chart, the Withdrawal Strategy chart, and the FIRE-age verdict consistent with each other for the
previewed age.

**Why this priority**: The drag interaction is a primary way the user explores scenarios; divergence
during it is exactly the single-source-of-truth violation the user identified.

**Independent Test**: Drag the marker to several ages; at each previewed age confirm the Lifecycle Trad
trajectory, the Withdrawal Strategy bars, and the verdict reflect the same strategy.

**Acceptance Scenarios**:

1. **Given** the user drags the FIRE marker, **When** the preview renders, **Then** the Lifecycle chart and the Withdrawal Strategy chart reflect the same strategy for the previewed age.
2. **Given** the user releases (commits) the drag, **When** the recalc completes, **Then** the Lifecycle chart reflects the freshly-ranked winner (no stale bracket-fill fallback).

---

### User Story 3 - The Safe/Exact/DWZ verdict is judged on the displayed strategy (Priority: P1)

A user relies on the verdict pill ("On Track — FIRE at 54"). Today the FIRE-age search is pinned to
bracket-fill while the charts may display a different winner, so the verdict can describe a strategy the
user isn't looking at. After this feature, the Safe/Exact/DWZ gate evaluates the **same winning
strategy** the charts display, so the verdict and the chart can never disagree.

**Why this priority**: The user explicitly required that the Safe/Exact/DWZ rules remain the gatekeeper
and stay correct. Per the project's "gates must evaluate the displayed strategy" rule, the verdict must
be judged on what's drawn.

**Independent Test**: For each Mode (Safe/Exact/DWZ) on a scenario with a non-default winner, confirm the
verdict's feasibility and FIRE age are computed on the displayed winner, and that the audit invariants
that cross-check verdict-vs-chart pass (rather than suppressing the divergence as "expected").

**Acceptance Scenarios**:

1. **Given** a non-bracket-fill winner is active, **When** the verdict is computed, **Then** it evaluates that winner's trajectory for the active Mode.
2. **Given** the audit recomputes, **When** verdict and chart use the same strategy, **Then** the verdict-vs-chart parity invariants pass on agreement (no suppressed divergence).

---

### User Story 4 - Withdrawal Strategy tooltip numbers reconcile (Priority: P2)

A user hovers a Withdrawal Strategy bar and sees per-pool draws plus a total. Today the per-pool bars are
shown in nominal Book-Value while "Total drawn", "purchasing power", and "ordinary income" are in
purchasing-power (real-$), so the lines don't add up (e.g. Trad $101.7K + Roth $100.3K shown against a
"Total drawn" of $103.7K). After this feature, the tooltip presents one consistent frame so the numbers
reconcile, with purchasing-power clearly labeled as a comparison.

**Why this priority**: A self-contradictory tooltip undermines trust, but it's a display-layer fix
independent of the strategy-staleness defect.

**Independent Test**: Hover any retirement-year bar; the displayed per-pool draws sum to the displayed
total within rounding, and the purchasing-power figure is labeled as a comparison, not as the sum.

**Acceptance Scenarios**:

1. **Given** any retirement-year bar, **When** the tooltip renders, **Then** the per-pool draw lines and the "total" line share one frame and reconcile within rounding.
2. **Given** a purchasing-power figure is shown, **When** the user reads it, **Then** it is clearly labeled as a today's-spending comparison, distinct from the Book-Value bars.

---

### User Story 5 - Cash-sweep parity across simulators (Priority: P3)

To keep the simulators consistent, `projectFullLifecycle`'s retirement loop runs the same feature-030
cash-sweep (cash → stocks above threshold, after all flows) that the other simulators run, so the
cash-sweep parity invariant stays green as the corrected lifecycle sim exercises these pools.

**Why this priority**: Consistency hardening that prevents a latent parity-invariant failure; lower
user-visible impact than P1/P2.

**Independent Test**: With cash-sweep enabled, confirm `projectFullLifecycle`'s retirement-year cash and
stocks match the other simulators' post-sweep values per age, and the cash-sweep parity invariant passes.

**Acceptance Scenarios**:

1. **Given** cash-sweep is enabled, **When** `projectFullLifecycle` runs retirement years, **Then** it applies the sweep after all flows, matching the other simulators.
2. **Given** cash-sweep is OFF (default), **When** simulations run, **Then** behavior is unchanged from today.

---

### Edge Cases

- **Default strategy genuinely wins** (bracket-fill is the winner): the Lifecycle chart should look the same as today — no regression.
- **Draw-Trad-last winner** (preserve-estate / conventional): Trad line legitimately stays high until other pools deplete; do not force early Trad decline.
- **RMD age (73+)**: forced minimum distributions still honored on top of the winner's draws.
- **Pool drawn to zero**: balance stays at 0; never negative.
- **Drag to an infeasible age**: verdict and both charts consistently reflect infeasibility for the previewed age.
- **Single-person vs couple**: correction applies identically.
- **Cold load (first render)**: the post-rank re-render ensures the Lifecycle chart never shows a transient bracket-fill shape after the winner is known.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Lifecycle chart MUST render using the active winning strategy's per-year withdrawal mix — the same strategy the Withdrawal Strategy chart displays — for the current Mode and Objective. It MUST NOT fall back to the default bracket-fill strategy when a different strategy has won.
- **FR-002**: The recalc pipeline MUST ensure the Lifecycle chart is (re-)rendered AFTER the strategy ranker resolves the winner, so the winner is never null/stale at Lifecycle render time (parity with the Withdrawal Strategy chart's existing post-rank render).
- **FR-003**: Dragging the FIRE-age marker MUST keep the Lifecycle chart, the Withdrawal Strategy chart, and the FIRE-age verdict consistent for the previewed age (either by resolving the winner for that age or by consistently previewing one strategy across all three).
- **FR-004**: The Safe/Exact/DWZ FIRE-age verdict MUST be evaluated on the same winning strategy the charts display, not on a pinned bracket-fill strategy. The verdict-vs-chart parity (audit invariants) MUST pass on genuine agreement rather than suppressing the divergence as "expected".
- **FR-005**: The Withdrawal Strategy tooltip MUST present per-pool draws and the total in one consistent frame so they reconcile within rounding; any purchasing-power figure MUST be clearly labeled as a comparison distinct from the Book-Value bars.
- **FR-006**: `projectFullLifecycle`'s retirement loop MUST apply the feature-030 cash-sweep after all flows, matching the other simulators, preserving default-OFF behavior.
- **FR-007**: All changes MUST land identically in `FIRE-Dashboard.html` (RR) and `FIRE-Dashboard-Generic.html` (Generic), per dual-dashboard lockstep.
- **FR-008**: The corrected Lifecycle simulation MUST continue to honor forced RMDs (age 73+) and MUST never display negative pool balances.
- **FR-009**: Existing behavior MUST be preserved when the default bracket-fill strategy is itself the winner (no regression in that case).
- **FR-010**: The change MUST NOT regress the nominal/Book-Value display frame (feature 022), the Mode × Objective orthogonality, the spending-funded-first floor, or any calcAudit parity invariant; all must be re-validated for all three Modes.

### Key Entities *(include if feature involves data)*

- **Active winning strategy**: the strategy selected by the ranker for the current Mode/Objective; the single source of truth that every retirement-tab surface (Lifecycle chart, Withdrawal Strategy chart, verdict) must consume.
- **Per-year withdrawal mix**: the winner's split of each year's spending across pools (Trad/Roth/Stocks/Cash + RMD), already plotted by the Withdrawal Strategy chart.
- **Per-year pool balance series**: the Trad/Roth/Stocks/Cash/Total trajectory the Lifecycle chart plots — must be derived from the winner's mix.
- **Display frame**: Book-Value (nominal) vs purchasing-power (real-$); tooltip lines must declare and stay within one frame.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a scenario where a non-default strategy wins, the Lifecycle chart's Trad 401K trajectory matches the winning strategy's draws (the line declines from the same age the Withdrawal Strategy chart first shows that draw), with no manual objective-toggle needed to "fix" it.
- **SC-002**: Across all combinations of the withdrawal-strategy objective toggle and the three Modes, the Lifecycle chart, the Withdrawal Strategy chart, and the FIRE-age verdict never display or evaluate different strategies.
- **SC-003**: Dragging the FIRE marker to any age keeps all three retirement surfaces consistent for the previewed age throughout the drag and after commit.
- **SC-004**: Every Withdrawal Strategy tooltip's per-pool draw lines sum to its displayed total within rounding, with purchasing power labeled as a comparison.
- **SC-005**: The full unit-test suite passes, all calcAudit parity invariants pass on genuine agreement, and the cash-sweep parity invariant remains green; any change to the FIRE-age verdict for the canonical fixture is documented and intended.

## Assumptions

- The winning strategy (and its per-year mix) is correct; the defect is that the Lifecycle chart and the verdict don't consume it. Fixing the source-of-truth/timing is the work, not changing tax math.
- Making the gate evaluate the displayed winner may shift the reported FIRE age for some scenarios; such shifts are correct (the verdict now matches what's drawn) and must be captured in gold-standard fixtures.
- The existing single-winner resolution (`_lastStrategyResults.winnerId`, `getActiveChartStrategyOptions`) is the intended source of truth; the fix routes all surfaces through it rather than inventing new simulation paths (Constitution III).
- No new user-facing controls are required; this is a correctness + consistency fix to existing charts and the verdict.
- Both dashboards remain zero-dependency single-file HTML (vanilla JS + Chart.js, no build step).
