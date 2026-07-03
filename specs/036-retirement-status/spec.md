# Feature Specification: Explicit Retirement Status

**Feature Branch**: `036-retirement-status`
**Created**: 2026-07-02
**Status**: Draft
**Input**: User description: "Add an explicit retirement status concept that separates *when the user CAN retire* (the existing feasibility calculation) from *when the user HAS actually retired* (a real fact the user asserts). Introduce an 'I've retired' switch tied to an actual retirement date that stops income/contributions and runs pure drawdown; keep the FIRE-marker drag as the plan-to-retire-later what-if for not-yet-retired users; optionally auto-suggest marking retired. Applies to both dashboards in lockstep."

## Context: the problem being solved

Today the dashboard always projects forward **from the user's current age** and treats the **earliest age that passes the selected Safe / Exact / DieWithZero gate** as the moment retirement begins. Everything before that age is modeled as *working* (employment income + new contributions); everything after is *retired* (drawdown). The tool therefore infers retirement from **capability plus calendar age** — it never learns whether the user has actually stopped earning.

This conflates two genuinely different things:

- **When the user *can* retire** — a capability the tool computes.
- **When the user *has* retired** — a fact only the user knows.

The conflation breaks two real situations:

1. **Working past the feasible age** — once the user is old enough and wealthy enough that the earliest feasible age collapses to today, the tool assumes they are already retired and drops their income, even though they are still working and contributing.
2. **Retiring earlier than "safe"** — a user who chooses to retire before the gate says it is safe keeps being shown as working and contributing, so the projection never reflects the drawdown they are actually living.

The only current lever — dragging the FIRE marker — means "*plan* to retire at age X," a forward-looking what-if. It is not a durable "I have retired" fact and does not pin an actual calendar date.

## Clarifications

### Session 2026-07-02

- Q: Should retirement be one household date or per-person (staggered)? → A: **Personalized (RR) dashboard uses a single household retirement date; the generic dashboard supports up to two earners, each with their own retirement date (staggered).**
- Q: Include the auto-suggest "mark yourself retired?" nudge in v1? → A: **Yes — include it (US4 / FR-012).**
- Q: On the generic dashboard, how is income attributed so retiring one earner stops only their share? → A: **Split the single household income into explicit Person 1 income + Person 2 income inputs; retiring an earner stops that earner's income and attributed contributions while the other keeps earning. Household income = the sum of the two.**

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Declare "I've retired" (Priority: P1)

A user who has actually stopped working turns on an **"I've retired"** control and sets their **actual retirement date**. From that date the projection no longer assumes any employment income or new contributions — it shows a pure drawdown for every year through the plan horizon, regardless of whether the feasibility calculation thinks they could "safely" retire yet. The tool reflects the user's reality instead of its own guess.

**Why this priority**: This is the core capability. The tool currently cannot represent "I have retired," so it either drops income too early (past the feasible age) or keeps a retiree "working" on paper. Every other story builds on this one.

**Independent Test**: Turn the switch on with a retirement date in the current year; confirm all subsequent years show no employment income and no new contributions and that balances draw down; turn it off and confirm the projection reverts to feasibility-driven behavior.

**Acceptance Scenarios**:

1. **Given** a user with sufficient savings whose current age is at or past the earliest feasible age, **When** they mark themselves retired as of the current year, **Then** the projection treats this year onward as retirement (no income, no new contributions) and still shows results for every year to plan end.
2. **Given** a user who chooses to retire earlier than the tool's "safe" age, **When** they mark themselves retired, **Then** the projection honestly shows the resulting drawdown — including any later shortfall — rather than continuing to show them working and contributing.
3. **Given** a retired user, **When** they reload the dashboard, **Then** their retirement status and date persist.
4. **Given** a retired user, **When** they turn the switch off, **Then** the projection reverts exactly to feasibility-driven behavior.

---

### User Story 2 - Feasibility becomes an "on-track" readout once retired (Priority: P2)

When the user is marked retired, the Safe / Exact / DieWithZero status stops advertising "FIRE in N years (age X)" and instead reports whether the retired plan is **sustainable to plan end** ("on track" / "at risk" / "shortfall in year Y"). A retiree is never told they will reach FIRE in the future.

**Why this priority**: Without this, the headline verdict contradicts the user's declared reality and reads as nonsense to a retired person ("FIRE in 0 years"). High value, but depends on US1.

**Independent Test**: With retirement status ON, confirm the status headline reframes to a sustainability readout and no longer shows a countdown to a future FIRE age.

**Acceptance Scenarios**:

1. **Given** a retired user whose money is projected to last through plan end, **When** they view the status, **Then** it shows an affirmative "sustainable / on track" verdict, not a countdown.
2. **Given** a retired user whose money is projected to run short before plan end, **When** they view the status, **Then** it shows an "at risk" warning identifying the shortfall year.

---

### User Story 3 - Planning lever preserved for the not-yet-retired (Priority: P2)

For users who are **not** retired, the existing FIRE-marker drag ("plan to retire at age X") continues to work as a forward-looking what-if. When retirement status is ON, the actual retirement date takes precedence and the what-if drag no longer changes the transition, so there are never two conflicting "retirement ages."

**Why this priority**: Prevents regression of the existing planning feature and removes the ambiguity of two levers that would otherwise mean different things.

**Independent Test**: With status OFF, dragging the FIRE marker still adjusts the planned FIRE age; with status ON, the drag is inert and the actual date drives the transition.

**Acceptance Scenarios**:

1. **Given** retirement status OFF, **When** the user drags the FIRE marker, **Then** the planned retirement age updates as it does today.
2. **Given** retirement status ON, **When** the user views the FIRE marker, **Then** it reflects the actual retirement date and the drag no longer changes the transition.

---

### User Story 4 - Auto-suggest marking retired (Priority: P3)

For a user who has **not** marked themselves retired, when their money and current age cross the earliest-feasible line, the tool surfaces a gentle, non-blocking, dismissible prompt: "Looks like you could retire as of &lt;year&gt; — mark yourself retired?" Confirming turns on US1; dismissing changes nothing. The switch, never the auto-detection, is the source of truth.

**Why this priority**: Discoverability at the moment the feature becomes relevant. Purely additive and optional.

**Independent Test**: Simulate crossing the feasible line; confirm a dismissible suggestion appears, that accepting it sets the retired state, and that dismissing it changes nothing and does not repeat within the session.

**Acceptance Scenarios**:

1. **Given** a not-yet-retired user whose numbers newly cross the feasible line, **When** the dashboard renders, **Then** a dismissible suggestion to mark themselves retired appears.
2. **Given** the suggestion is shown, **When** the user dismisses it, **Then** no projection change occurs and the suggestion does not nag repeatedly in the same session.

---

### User Story 5 - Staggered retirement for two earners (generic dashboard) (Priority: P2)

On the generic dashboard, a two-earner household can retire the two people at different times. Each earner has their own retirement date, and each earner's income is entered explicitly (Person 1 income + Person 2 income). When the first person retires, only their income and their attributed contributions stop; the household keeps the second person's income until that person's own retirement date, after which the household is fully retired.

**Why this priority**: The generic dashboard serves real two-earner households where one spouse commonly retires before the other; a single shared date would misstate income for the in-between years. Personalized (RR) intentionally keeps a single household date (see Clarifications), so this divergence is deliberate.

**Independent Test**: On the generic dashboard with two earners and two different retirement dates, confirm that after the earlier date the projection drops only the retiring person's income/contributions and retains the other's, and that after the later date all employment income has stopped.

**Acceptance Scenarios**:

1. **Given** a two-earner generic household with Person 1 income and Person 2 income entered and two different retirement dates, **When** the earlier date is reached, **Then** only that person's income and attributed contributions stop and the other person's income continues.
2. **Given** the same household, **When** the later retirement date is reached, **Then** all employment income and new contributions have stopped and the projection is a pure drawdown thereafter.
3. **Given** the generic dashboard in single-adult mode, **When** retirement status is used, **Then** it behaves as a single-earner household with one retirement date.

---

### Edge Cases

- **Retirement date in the past (retroactive):** treated as "retired now," drawing down from today using currently entered balances; the tool does not reconstruct historical years.
- **Retirement date in the future:** the user keeps accumulating (income + contributions) until that date, then transitions — overlapping with the planning-drag semantics (see US3); the actual date wins when status is ON.
- **Couple with two earners (personalized/RR dashboard):** a single household retirement date stops all employment income, because RR income is modeled as one household figure (deliberate — see Clarifications).
- **Couple with two earners (generic dashboard):** each earner has their own retirement date and their own income amount; retiring one stops only that earner's income/contributions (see US5).
- **Second earner never retires within the plan / only one date set:** the household retains that earner's income through plan end (or until their date if later set).
- **Marking retired with insufficient money:** allowed; the tool shows the shortfall honestly rather than blocking the action.
- **Single-person mode (generic dashboard, one adult):** the same switch applies to the sole earner.
- **Social Security / pensions / other passive income:** continue per their own configured start ages; only employment income and new contributions stop at the retirement date.
- **Turning the switch off after it was on:** fully reverts to feasibility-driven behavior with no residual state.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide an explicit, user-controlled retirement status that is either ON (the user has retired) or OFF (default), independent of the feasibility calculation.
- **FR-002**: When retirement status is ON, the user MUST be able to specify an actual retirement date.
- **FR-003**: When retirement status is ON, the projection MUST stop all employment income and all new contributions (both retirement-account and taxable) as of the retirement date, and model every subsequent year as drawdown through the plan horizon.
- **FR-004**: Social Security and any other passive/entitlement income MUST continue according to their own configured start ages and MUST NOT be stopped by retirement status.
- **FR-005**: When retirement status is ON, the retirement transition used by the projection and every chart MUST be the user's actual retirement date, NOT the earliest-feasible age from the Safe/Exact/DWZ scan.
- **FR-006**: When retirement status is ON, the Safe/Exact/DWZ verdict MUST be presented as a sustainability / "on-track" indicator (whether the money lasts to plan end, and if not, when it falls short) rather than a countdown to a future FIRE age.
- **FR-007**: The system MUST allow the user to mark themselves retired even when the feasibility calculation would say they cannot "safely" retire, and MUST show the resulting drawdown (including any shortfall) honestly.
- **FR-008**: Retirement status and the retirement date MUST persist across reloads, stored separately for each dashboard.
- **FR-009**: The user MUST be able to turn retirement status OFF, which fully reverts the projection to feasibility-driven behavior with no residual effect.
- **FR-010**: While retirement status is OFF, the existing FIRE-marker drag ("plan to retire at age X") MUST continue to function as a forward-looking planning what-if.
- **FR-011**: While retirement status is ON, the FIRE-marker drag MUST NOT change the retirement transition — the actual date takes precedence — and the two controls MUST NOT be simultaneously active.
- **FR-012**: The system SHOULD surface a non-blocking, dismissible suggestion to mark oneself retired when a not-yet-retired user's money and current age cross the earliest-feasible line; the suggestion MUST NOT change any projection unless accepted, and MUST NOT nag repeatedly within a session once dismissed.
- **FR-013**: If the retirement date is on or before today, the system MUST treat the user as retired from now using currently entered balances, without reconstructing historical years.
- **FR-014**: The primary status headline MUST never tell a retired user they will reach FIRE in the future (e.g., "FIRE in 0 years"); it must reflect their retired state.
- **FR-015**: Retirement-status behavior MUST be identical across both dashboards EXCEPT for one deliberate divergence: the personalized (RR) dashboard uses a **single household retirement date**, while the generic dashboard supports **per-person (up to two earners) staggered retirement** with per-person income (FR-017–FR-020). All shared behavior (persistence, on-track reframing, honest early-retirement drawdown, off-revert, auto-suggest) MUST match.
- **FR-016**: All user-visible retirement-status copy MUST be available in both supported languages (English and Traditional Chinese).
- **FR-017**: The personalized (RR) dashboard MUST model retirement status as a single household state with one retirement date that stops all household employment income and new contributions.
- **FR-018**: The generic dashboard MUST support up to two earners, each with an independent retirement date; when one earner reaches their date, that earner's income and attributed contributions MUST stop while the other earner's income continues until their own date.
- **FR-019**: The generic dashboard MUST let the user enter employment income per earner (Person 1 income, Person 2 income) so a per-person retirement stops only that earner's portion; total household employment income equals the sum of the per-person amounts.
- **FR-020**: In single-adult mode, the generic dashboard MUST behave as a single-earner household with one retirement date (consistent with FR-003), and the second earner's income input MUST be hidden/ignored.

### Key Entities *(include if feature involves data)*

- **Retirement Status**: a per-dashboard, user-asserted state. On RR: `{ retired: on/off, retirementDate }` (one household date). On the generic dashboard: per-earner `{ retired, retirementDate }` for up to two earners. When ON it is the single source of truth for the accumulation→drawdown transition.
- **Per-Person Income** (generic dashboard, new): explicit employment income per earner (Person 1 income, Person 2 income). Their sum is the household employment income; each amount stops when its earner retires.
- **Feasibility Verdict** (existing): the Safe / Exact / DWZ evaluation. When the user is retired it is reinterpreted as a sustainability / on-track indicator rather than a FIRE-age decision.
- **Planned Retirement** (existing FIRE-marker drag / `fireAgeOverride`): a forward-looking what-if for not-yet-retired users; superseded by Retirement Status when ON.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A retired user is never shown a countdown to a future FIRE age — 100% of the time the status reflects their retired state.
- **SC-002**: When a user marks themselves retired as of a given year, the projection shows zero employment income and zero new contributions for every year from that year onward.
- **SC-003**: A retired user's status and date survive a full page reload with no data re-entry.
- **SC-004**: Turning retirement status OFF returns the projection to output identical to the feasibility-driven result had the switch never been turned on.
- **SC-005**: A user who retires earlier than the "safe" age still sees a complete year-by-year drawdown (including any shortfall year), never a projection that shows them still working.
- **SC-006**: Both dashboards produce identical retirement-status behavior on shared scenarios, apart from the deliberate single-date (RR) vs per-person (generic) divergence.
- **SC-007**: Enabling retirement status and seeing the projection update takes no more than two interactions (toggle on, set date).
- **SC-008**: On the generic dashboard with two earners retiring in different years, the projection shows exactly the earlier earner's income removed in the interim years and all employment income removed after the later date — verifiable year-by-year.

## Assumptions

- **Full stop, not partial**: "Retired" means employment income and new contributions both stop; partial / "barista" / part-time income is out of scope for v1.
- **Annual granularity**: the retirement date aligns with the model's annual, age-based projection — the transition occurs in the retirement date's calendar year; sub-year precision is not required.
- **Retirement scope differs by dashboard (deliberate)**: the personalized (RR) dashboard uses one household retirement date (RR income stays a single household figure); the generic dashboard supports per-person staggered retirement, which requires the new per-person income inputs (FR-019). This is an intentional divergence, not an inconsistency.
- **Contribution attribution (generic, plan-phase detail)**: when an earner retires, their own income stops; contributions are reduced consistent with the remaining working income. The exact split of household-level contribution inputs across earners is a modeling detail to be finalized in planning; the honest end result is that a fully-retired household makes no new contributions.
- **Retroactive means "now"**: a retirement date on or before today is treated as retired-from-now using current entered balances; the tool does not reconstruct past years.
- **Passive income unchanged**: Social Security, pensions, and other passive income are governed by their existing start-age settings and are unaffected by this feature.
- **Delivery model preserved**: dual-dashboard lockstep and the existing zero-build, single-file, double-click-to-run delivery model are retained.
- **Money framing unchanged**: figures remain in account-statement dollars with the dashboard's existing purchasing-power comparisons; this feature does not change how money is framed.

## Dependencies

- Builds on the existing feasibility engine (Safe / Exact / DieWithZero), the accumulation→drawdown lifecycle projection, and the FIRE-marker drag override.
- Reuses the existing per-dashboard persistence and bilingual (EN / zh-TW) string catalog.
