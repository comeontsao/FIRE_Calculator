# Feature Specification: Math-Assumptions Cleanup

**Feature Branch**: `033-math-assumptions-cleanup`
**Created**: 2026-06-05
**Status**: Draft — clarifications resolved

## Clarifications

### Session 2026-06-05

- Q1 (cash-growth default): **0.0% — cash tracks inflation.** An undisturbed
  cash pool holds constant purchasing power. The user also confirmed the
  intended mechanism for excess cash is the existing opt-in cash-sweep
  (feature 030): balances above the $10K threshold move into the brokerage
  pool. The sweep's semantics are untouched by this feature; only the growth
  rate of whatever cash remains changes. (Note: the sweep only became
  functional in real browsers with the 2026-06-05 boot fix, so the pre-fix
  intuition "cash piles up forever" and the sweep's intent are both honored
  by this combination.)
- Q2 (Fisher scope): **Include in 033.** One combined math-correction wave,
  one combined fixture update, one documented FIRE-age delta covering all
  three biases. Story 3 is in scope; FR-009 is unconditional.
**Input**: User description: "Math-assumptions cleanup (origin: external review 2026-06-05, BUG-2/3/4 — verified accurate against the codebase). Three changes to the projection math, applied in lockstep to BOTH FIRE-Dashboard.html and FIRE-Dashboard-Generic.html plus the calc/ modules: (1) single `cashRealReturn` constant replacing the 9 hardcoded cash-growth sites; (2) honest funding for negative accumulation residuals; (3) OPTIONAL Fisher-relation real returns. Gold-standard fixtures updated in the same change set; before/after FIRE age documented."

## Context

An external review of the projection engine (2026-06-05) identified three modeling concerns, all verified against the current codebase:

- **Cash growth**: every simulator hard-codes cash growing 0.5% **above inflation** every year, forever (`×1.005` in the today's-dollars frame, at 9 separate sites). Real-world cash and short-term savings roughly track or lag inflation, so this is an optimistic bias — and the 9 copies of the magic number can silently drift apart. One site's comment even mislabels the frame ("0.5%/yr nominal"), when the multiplier is applied to a today's-dollars pool — meaning it models a *purchasing-power* gain.
- **Unfunded contributions**: when yearly income can no longer cover spending plus contributions (raises below inflation make this inevitable in later accumulation years), the engine silently "contributes" money that never came from anywhere — about $32K cumulative on the household's own numbers — overstating the portfolio peak by ~2% and breaking the engine's own cash-flow conservation check.
- **Real-return arithmetic**: real returns are derived by subtracting inflation from the growth rate. The mathematically correct conversion (Fisher relation) yields ~0.115%/yr less; over a 57-year horizon the subtraction shortcut compounds into a meaningful overstatement of every balance.

All three changes shift projection outputs, so the gold-standard test fixtures move in the same change set, and the before/after FIRE age on the household's live defaults is documented at closeout.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One honest cash-growth dial (Priority: P1)

As a dashboard user, I want the cash pool's growth assumption to be a single, clearly documented number used identically by every projection, so that the chart, the FIRE verdict, and the audit all agree on how cash behaves — and so the assumption can be reviewed or changed in exactly one place.

**Why this priority**: The 0.5%-above-inflation assumption is the single modeling choice most responsible for plans looking safer than reality, and its 9 hard-coded copies are a latent drift hazard (the same class of bug as the feature-031 strategy-drift incident). Consolidation is required before the value can even be debated.

**Independent Test**: Change the assumption's value in its one defining location; every simulator's cash trajectory (Lifecycle chart, FIRE gates, audit projection, payoff-vs-invest) shifts consistently, verified by a sweep test. A static scan proves no other cash-growth multiplier exists anywhere in the engine.

**Acceptance Scenarios**:

1. **Given** the assumption is defined in one place, **When** any simulator grows the cash pool for a year, **Then** it uses that single value — no simulator carries its own copy of the number.
2. **Given** an $80,000 cash balance left undisturbed, **When** the assumption is set to 0.0, **Then** the cash pool holds constant purchasing power across the full horizon (statement dollars still rise with inflation in Book-Value display).
3. **Given** the default assumption value of **0.0% (cash tracks inflation — Q1)**,
   **When** the dashboard loads with stored user inputs, **Then** all displayed numbers derive from that default, **And** the closeout documents the FIRE-age / end-balance movement this causes versus the old +0.5% behavior.
4. **Given** the feature-030 contract note that locked the old hardcoded value, **When** this feature merges, **Then** the lock is formally superseded and the mislabeled frame comment is corrected (the multiplier applies in the today's-dollars frame — it is a purchasing-power gain, not a statement-dollar one).

---

### User Story 2 - Honest funding of late-accumulation shortfalls (Priority: P2)

As a dashboard user whose raises trail inflation, I want years where income can't cover spending plus planned contributions to be funded the way I'd actually fund them — by cutting the discretionary brokerage contribution first, then dipping into cash — so that the projection never invents money and the engine's conservation check passes.

**Why this priority**: This is a correctness bug with a visible symptom (the audit's conservation residual is ~−$32K on the household's own inputs). It overstates the accumulation peak ~2%. It depends on no other story.

**Independent Test**: Run the accumulation projection on inputs where real income falls below spending + contributions in later years; verify every dollar contributed traces to income, a reduced contribution, or a cash draw — and the conservation residual returns to ≈ $0.

**Acceptance Scenarios**:

1. **Given** a year where income − taxes − spending < planned contributions, **When** the year is simulated, **Then** the discretionary brokerage contribution is reduced first (down to $0), **And** any remaining gap is drawn from the cash pool, **And** the year's row shows the reduced contribution and the draw.
2. **Given** the gap exceeds available cash, **When** the year is simulated, **Then** the remainder is drawn from the brokerage pool, **And** only a gap that remains unfunded after all three sources still raises the existing warning.
3. **Given** the corrected funding, **When** the audit's cash-flow conservation block is computed, **Then** the residual is ≈ $0 (within rounding) across the whole accumulation phase.
4. **Given** a plan with no shortfall years, **When** the projection runs, **Then** outputs are unchanged from today (the new logic only activates on negative residuals).

---

### User Story 3 - Mathematically correct real returns (Priority: P3)

As a dashboard user, I want real (purchasing-power) growth rates derived with the mathematically correct conversion rather than simple subtraction, so that long-horizon balances are not systematically overstated by ~0.115%/yr compounded.

**Why this priority**: Smallest distortion of the three and a near-universal simplification in comparable tools. **In scope per Q2** — one combined math-correction wave with one combined fixture update and one documented FIRE-age delta.

**Independent Test**: With growth 7% and inflation 4%, the engine's derived real rate is 2.885% (not 3.0%), and every simulator consumes the helper rather than performing its own subtraction, verified by a static scan.

**Acceptance Scenarios**:

1. **Given** nominal growth 7% and inflation 4%, **When** a real rate is derived anywhere in the engine, **Then** it equals (1.07 ÷ 1.04) − 1 ≈ 2.885%.
2. **Given** the Social-Security COLA equal to inflation (the default), **When** the SS real adjustment is derived, **Then** it is exactly 0 — identical to today's behavior.

---

### Edge Cases

- Assumption set negative (future stress mode): cash loses purchasing power; the cash-sweep interaction stays correct (a shrinking pool below the sweep threshold is simply never swept).
- Shortfall year where the brokerage pool is also empty: the unfunded remainder must still surface as a warning — the plan is genuinely infeasible pre-FIRE, and hiding it would recreate the bug being fixed.
- The cash-flow override input (payoff-vs-invest tab) bypasses the computed residual entirely today; the new funding logic must not activate when the override is on.
- Pre-tax 401K contributions are payroll-deducted before the residual exists — they are never reduced by the new funding order (only the discretionary brokerage contribution is).
- Partial-year (FIRE-year) rows use a scaled growth multiplier — the single assumption must thread through the scaled form too.
- Historical snapshot rows in the CSV are observations, not projections — they are untouched by all three stories.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every simulator's cash-pool growth MUST derive from a single named assumption with one defining location; no simulator may carry its own copy of the growth multiplier (including the scaled partial-year form).
- **FR-002**: The assumption's default value MUST be the clarified choice (Story 1, scenario 3), and changing the value in its one location MUST change every simulator's cash trajectory consistently.
- **FR-003**: A static regression guard MUST fail if a hardcoded cash-growth multiplier reappears anywhere in the engine outside the single defining location.
- **FR-004**: The feature-030 contract note locking the old hardcoded value MUST be formally superseded, and the frame-mislabeling comment corrected, in the same change set.
- **FR-005**: In any accumulation year with a negative residual (income − taxes − spending − contributions < 0) and the cash-flow override OFF, the engine MUST fund the gap in this order: reduce the discretionary brokerage contribution (to $0 at most) → draw from the cash pool → draw from the brokerage pool. Silent flooring of the residual to $0 is prohibited.
- **FR-006**: The per-year projection row MUST surface the effective (possibly reduced) brokerage contribution and any pool draws so the audit table and debug exports reflect the actual funding.
- **FR-007**: The existing shortfall warning MUST fire only when a gap remains unfunded after all three sources; funded-by-reduction years carry an informational flag instead.
- **FR-008**: The audit's cash-flow conservation residual MUST be ≈ $0 (within rounding tolerance) for every accumulation year and in aggregate, on the household's live defaults and on all audit personas.
- **FR-009**: All real-rate derivations — growth, retirement-account growth, and SS-COLA adjustments — MUST route through one correct-conversion helper; a static scan MUST find no remaining subtraction-form derivations in the simulators.
- **FR-010**: Gold-standard test fixtures whose expected values shift MUST be updated in the same change set, each with a note attributing the delta to this feature.
- **FR-011**: All changes MUST land in lockstep in both dashboards and the shared calc modules; the calc layer MUST remain byte-equivalent between the two HTML files.
- **FR-012**: The closeout MUST document the before/after FIRE age and end balance on the household's live defaults, per FIRE mode (Safe / Exact / Die-With-Zero).
- **FR-013**: Any user-facing copy added (tooltips, audit labels, warnings) MUST follow the money-terminology rule: "money/dollars" for statement values, "purchasing power" for inflation-adjusted comparisons.

### Key Entities

- **Cash-growth assumption**: the single rate at which the cash pool's purchasing power changes per simulated year; one defining location, consumed by every simulator.
- **Year funding record**: per-year accumulation row extended with the effective brokerage contribution, cash draw, and brokerage draw amounts plus an informational flag when a reduction occurred.
- **Conservation residual**: the audit's per-phase check that income minus taxes, spending, contributions, and cash deltas nets to zero; the feature's primary verifiable outcome.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The audit's cash-flow conservation residual on the household's live defaults moves from ≈ −$32K to within ±$100 in aggregate, and every per-year residual is within ±$1 of zero.
- **SC-002**: A repository-wide scan finds exactly one defining location for the cash-growth assumption and zero hardcoded growth multipliers in simulators (enforced by an automated test).
- **SC-003**: The full unit suite (682+) and full browser E2E suite (163+) pass after fixture updates; zero non-expected cross-validation warnings in all three FIRE modes on the household's live defaults.
- **SC-004**: The before/after FIRE age and end balance are documented for all three FIRE modes; any FIRE-age movement is attributable to the clarified assumption changes (no unexplained drift).
- **SC-005**: With identical inputs, both dashboards produce identical calc outputs (lockstep verification passes byte-equivalent on the calc layer).

## Assumptions

- The cash-growth assumption ships as an internal engine constant in this feature; exposing it as a user-facing input (e.g., a slider with a −2%…+1% range, as the originating review suggested) is deferred to a future feature.
- The funding order in FR-005 (contribution cut → cash → brokerage) mirrors how a household actually behaves and matches the originating review's "honest funding" option (b); the alternative (deflating contributions as nominal-fixed) was rejected because the dashboard's contribution inputs are explicitly today's-dollars amounts.
- Pre-tax 401K contributions and employer match are treated as payroll-level flows that precede the residual computation and are never reduced by FR-005.
- Retirement-phase withdrawal logic is untouched by Story 2 — the funding order applies to accumulation years only.
- The cash-sweep feature (030) continues to operate on the post-growth cash balance; only the growth rate's source changes.
- CSV snapshot history and its schema are unaffected.

## Out of Scope

- Sequence-of-returns / historical / Monte-Carlo return modes (tracked separately as BACKLOG X1 with the review's design input already folded in).
- Exposing the cash-growth assumption as a user-visible input.
- Any change to withdrawal strategies, FIRE-gate semantics, or the Roth IRA pool shipped in feature 032.
