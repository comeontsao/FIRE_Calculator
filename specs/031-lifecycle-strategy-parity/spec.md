# Feature Specification: Lifecycle Chart Reflects the Active Withdrawal Strategy

**Feature Branch**: `031-lifecycle-strategy-parity`  
**Created**: 2026-05-27  
**Status**: Draft  
**Input**: User description: "Lifecycle chart Trad-401K balance must reflect the active withdrawal strategy's draws — the green dashed Trad 401K line only drops after age 72 (RMD), but the Withdrawal Strategy chart correctly draws Trad from age ~60 to fill low tax brackets before RMDs. The withdrawal strategy is the source of truth; the lifecycle chart needs to be corrected. Investigate whether fixing it breaks anything."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Lifecycle Trad 401K balance matches the strategy's draws (Priority: P1)

A user retires before 59.5 and views the Retirement tab. The Withdrawal Strategy chart shows the
plan drawing Traditional 401K money starting around age 60 — deliberately, to use up the low (12%)
tax bracket each year before Required Minimum Distributions are forced at 73. The user then switches
to the Lifecycle chart to see how their account balances evolve. Today the green dashed "Trad 401K"
line keeps growing until about age 72 and only then turns down, which contradicts the Withdrawal
Strategy chart the user just looked at. After this feature, the Lifecycle chart's Trad 401K line
begins declining (net of investment growth) around the age the strategy actually starts drawing it,
so both charts tell one consistent story.

**Why this priority**: This is the core defect. The two charts presenting contradictory pictures of
the same plan undermines trust in every number on the dashboard. It is the only reason this feature
exists.

**Independent Test**: Load either dashboard with a pre-59.5 retirement scenario and the default
strategy. Read the Trad 401K draw age off the Withdrawal Strategy chart, then confirm the Lifecycle
chart's Trad 401K line inflects downward at the same age (allowing for the offsetting effect of
annual growth). The two charts must agree on when Trad starts being drawn.

**Acceptance Scenarios**:

1. **Given** a retirement scenario where the Withdrawal Strategy chart shows Trad 401K draws starting at age ~60, **When** the user opens the Lifecycle chart, **Then** the Trad 401K balance line reflects those same age-60+ draws rather than remaining flat or rising until RMD age.
2. **Given** the same scenario, **When** the user reads the Trad 401K balance at any age between unlock and plan-end off the Lifecycle chart, **Then** it equals the strategy's running Trad balance for that age (start-of-year balance, plus growth, minus that year's strategy Trad draw) within rounding.
3. **Given** the Total Portfolio line on the Lifecycle chart, **When** Trad draws are shifted earlier, **Then** the Total Portfolio line and the end-of-plan balance remain consistent with the strategy the dashboard reports as active (no double-counting, no new gaps).

---

### User Story 2 - Switching strategy or mode keeps all retirement views in sync (Priority: P2)

A user cycles through the withdrawal-strategy toggle ("Leave more behind" / "Pay less lifetime tax")
and the Mode toggle (Safe / Exact / Die With Zero). Each time, the Withdrawal Strategy chart, the
Lifecycle chart, the FIRE-age verdict pill, and the Audit tab should all describe the same simulated
plan.

**Why this priority**: The project already enforces "the gate must evaluate the displayed strategy."
This feature must not break that discipline — whatever strategy the dashboard shows must be the one
the Lifecycle chart draws. Secondary to P1 because P1 is the visible bug; this guards against
introducing a new divergence while fixing it.

**Independent Test**: Toggle each strategy and each mode; for every combination confirm the Lifecycle
Trad 401K line, the Withdrawal Strategy bars, and the FIRE-age verdict all reflect the same draws.

**Acceptance Scenarios**:

1. **Given** the user switches the withdrawal-strategy toggle, **When** the Lifecycle chart re-renders, **Then** its pool trajectories reflect the newly selected strategy's per-year draws.
2. **Given** the user switches Mode (Safe/Exact/DWZ), **When** the views re-render, **Then** the FIRE-age verdict and the Lifecycle chart remain consistent with each other.

---

### User Story 3 - No regression to dependent numbers (Priority: P2)

A user who relies on the FIRE-age verdict, the end-of-plan balance, the asset table, the Milestones
view, and the Audit tab sees the same correct values after this change — only the Trad 401K balance
timing on the Lifecycle chart visibly changes (to become correct).

**Why this priority**: Correcting the Lifecycle chart must not silently shift the FIRE age, flip a
feasibility verdict, or break an audit invariant. The investigation must confirm what reads the
lifecycle balance series before any code changes.

**Independent Test**: Capture the FIRE-age verdict, end-balance, asset-table figures, and audit
findings for a fixed scenario before and after; differences must be explainable solely by the
corrected Trad timing (e.g., the Trad line shape), not by unrelated drift.

**Acceptance Scenarios**:

1. **Given** a fixed scenario, **When** the feature ships, **Then** the FIRE-age verdict is unchanged unless the corrected drawdown genuinely changes feasibility, in which case the change is documented and intended.
2. **Given** the Audit tab, **When** it recomputes, **Then** all existing parity invariants still pass.

---

### Edge Cases

- **Retirement at or after 59.5**: unlock and a near-immediate draw coincide; the Trad line should begin declining at retirement, not at RMD age.
- **RMD still binding**: for ages 73+, forced minimum distributions must still be honored on top of (not instead of) the earlier strategy draws.
- **Modest Trad balance fully drained before RMD**: if the strategy empties Trad before 73, the Lifecycle line should reach ~0 and stay there (no negative balances, no phantom RMD).
- **Strategy that intentionally draws Trad last** (e.g., a "preserve Trad" strategy): the Lifecycle line should then legitimately stay high until RMD — the fix is "match the active strategy," not "always draw Trad early."
- **Cash-sweep enabled (feature 030)**: sweeping cash into stocks must still occur after all flows and must not distort the Trad line.
- **Single-person vs. couple scenarios**: the correction applies identically.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Lifecycle chart's per-pool balance trajectories (Trad 401K, Roth, Stocks/Brokerage, Cash, and Total Portfolio) MUST be derived from the same active withdrawal strategy and the same per-year withdrawal mix that drive the Withdrawal Strategy chart and the FIRE-feasibility gates.
- **FR-002**: The Lifecycle Trad 401K balance for each retirement year MUST equal that year's start-of-year balance plus investment growth minus the strategy's Trad draw for that year (including any forced RMD), within display rounding.
- **FR-003**: When the active withdrawal strategy or the Mode (Safe/Exact/DWZ) changes, the Lifecycle chart MUST re-render to reflect the newly active strategy's draws, staying consistent with the Withdrawal Strategy chart and the FIRE-age verdict.
- **FR-004**: Forced Required Minimum Distributions (age 73+) MUST continue to be honored; the correction adds earlier strategy draws without removing RMD behavior.
- **FR-005**: The change MUST apply identically to both `FIRE-Dashboard.html` (RR) and `FIRE-Dashboard-Generic.html` (Generic), kept byte-equivalent except for personal content.
- **FR-006**: The change MUST NOT regress the feature 030 cash-sweep behavior (sweep runs after all flows), the nominal/Book-Value display frame (feature 022), the Mode × Objective orthogonality, or any existing calcAudit parity invariant.
- **FR-007**: Pool balances on the Lifecycle chart MUST never display negative values; a pool drawn to zero stays at zero.
- **FR-008**: Before any code change, the investigation MUST document (in research.md) whether the Lifecycle chart currently runs a separate balance simulation with a different draw order, enumerate every consumer of the lifecycle balance series, and assess the blast radius of shifting Trad drawdown earlier (FIRE-age verdict, end-balance/terminal-buffer gates, audit invariants, asset table, Milestones).

### Key Entities *(include if feature involves data)*

- **Per-year pool balance series**: the time series of Trad 401K, Roth, Stocks/Brokerage, Cash, and Total balances by age that the Lifecycle chart renders.
- **Per-year withdrawal mix**: the strategy-produced split of each year's spending across pools (Trad/Roth/Stocks/Cash plus RMD), already visualized by the Withdrawal Strategy chart — the source of truth this feature aligns the balance series to.
- **Active strategy/mode selection**: the currently displayed withdrawal strategy and FIRE mode that determine which draws are simulated.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a pre-59.5 retirement scenario on the default strategy, the age at which the Lifecycle Trad 401K line begins to decline matches the age at which the Withdrawal Strategy chart first shows a Trad draw (no longer pinned to ~72/73).
- **SC-002**: For every age in retirement, the Lifecycle Trad 401K balance equals the strategy's running Trad balance within rounding (verified across a fixed gold-standard scenario).
- **SC-003**: Across all combinations of the withdrawal-strategy toggle and the three Modes, the Lifecycle chart and the Withdrawal Strategy chart never disagree on when Trad is drawn.
- **SC-004**: The full unit-test suite passes, all existing audit parity invariants pass, and the FIRE-age verdict for the canonical fixture is unchanged (or any change is documented and intended).

## Assumptions

- The withdrawal strategy / per-year withdrawal mix is correct and is the source of truth; the Lifecycle chart is what must be corrected to match it (per the user's explicit direction).
- "Reflect the strategy's draws" means net-of-growth: the Trad line may still rise in early retirement years if growth exceeds the draw, but its trajectory must be computed from the strategy's actual Trad draws, not a separate draw order.
- The existing strategy-parity helpers (`getActiveChartStrategyOptions`, `getActiveMortgageStrategyOptions`) and `projectFullLifecycle` are the intended single source for strategy-aware simulation; the fix routes the Lifecycle chart through the same path rather than inventing a new one.
- No new user-facing controls are required; this is a correctness fix to an existing chart.
- Both dashboards remain zero-dependency single-file HTML apps (vanilla JS + Chart.js, no build step).
