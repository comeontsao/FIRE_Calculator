# Feature Specification: Multi-Strategy Withdrawal Optimizer

**Feature Branch**: `008-multi-strategy-withdrawal-optimizer`
**Created**: 2026-04-22
**Status**: Draft
**Input**: User description: "instead of just relying on just one bracket fill strategy… have different paying strategies and the system picking the one that keeps me the most money or properties at the end (I want to save some money for my children if possible), so maybe add another switch to prioritize either save money/stocks/401k or pays less tax overall and can retire earlier… let me know if there are conflict of this thought — I believe the order of calculation shouldn't change, it is just cycling within the withdraw strategy module."

## Clarifications

### Session 2026-04-22

- Q: Confirm the two objective-selector labels — "Leave more behind" and "Retire sooner / pay less tax" — or choose different wording? → A: Confirmed (use those exact labels as the primary EN copy).
- Q: How many candidate strategies should the system simulate? → A: **Seven** — the six in Option B plus the textbook "Conventional" (Taxable → Trad → Roth) strategy. Rationale: more candidates cost effectively nothing at the UX layer (system auto-picks the winner) and give broader literature coverage (Kitces, Bogleheads, Mad Fientist, Reichenstein, Fidelity default).
- Q: Which seven strategies, exactly? → A: (1) **Bracket-Fill Smoothed** (current default — fills 12 % bracket capped by `pTrad / yearsRemaining`); (2) **Trad-First** (drain Trad at ordinary rates before any other pool); (3) **Roth-Ladder** (pull Roth first — tax-free — then stocks, Trad last); (4) **Trad-Last / Estate-Preserve** (drain stocks + cash first, keep Trad compounding for heirs); (5) **Proportional** (withdraw from every pool weighted by its current balance); (6) **Tax-Optimized Numerical Search** (per-year split chosen to minimize lifetime federal tax at the current FIRE age, within RMD/IRMAA/59.5 constraints); (7) **Conventional** (textbook Fidelity/Vanguard order — Taxable → Trad → Roth).
- Q: When previewing a non-winner strategy, should the sidebar lifecycle chart also update to the previewed strategy? → A: Yes — the sidebar lifecycle chart MUST follow the previewed strategy alongside the Lifetime Withdrawal panel.
- Q: Where should the non-winner strategies live in the UI? → A: Inside a **collapsed** sub-section of the Lifetime Withdrawal Strategy block, revealed only when the user clicks to expand (i.e., hidden by default — no separate tab, no modal, no sidebar tray).

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Automatic best-strategy selection by objective (Priority: P1)

As a retiree planning FIRE, I pick one of two optimization objectives ("**Leave more behind**" or "**Retire sooner / pay less tax**"), and the dashboard automatically simulates several candidate withdrawal strategies, scores each one by my objective, and displays the winner's drawdown plan and tax curve without me needing to tune anything.

**Why this priority**: This is the whole point of the feature. The current dashboard only runs a single bracket-fill heuristic; the user has no way to verify it's actually the best one for *their* goal. Delegating the choice to the computer — after it has tried multiple credible strategies — is the minimum valuable outcome.

**Independent Test**: Load the dashboard with a representative scenario, toggle between the two objectives, and confirm that (a) the chart/KPIs update to reflect a different strategy's distribution when the objective flips, and (b) the displayed winner is demonstrably better on the selected metric than the previously shown default.

**Acceptance Scenarios**:

1. **Given** a user viewing the Lifetime Withdrawal Strategy panel with objective set to "Leave more behind", **When** the dashboard recalculates, **Then** the panel displays the strategy with the highest end-of-plan net worth and labels it as the winner for that objective.
2. **Given** the same scenario with objective flipped to "Retire sooner / pay less tax", **When** the dashboard recalculates, **Then** the panel displays the strategy with the lowest lifetime federal tax (or earliest feasible FIRE age, ties broken by lifetime tax) and labels it as the winner.
3. **Given** two different objectives land on the same winning strategy for a given scenario, **When** the user toggles between objectives, **Then** the panel indicates clearly that the same strategy wins both races (no misleading "nothing changed" silence).

---

### User Story 2 — Compare all candidate strategies side-by-side (Priority: P2)

As a user who wants to understand *why* the system chose one strategy, I click a "Compare other strategies" control and see a ranked table of every candidate strategy with its end-of-plan net worth, lifetime tax, earliest feasible FIRE age, and a one-line summary of what it does — with the winner highlighted — so I can audit the decision and pick a different one if I disagree.

**Why this priority**: The user asked for transparency (" show those withdraw strategies for me if I click on a button to show other strategies"). Without comparison, the "automatic winner" is opaque — the feature loses credibility if the user can't verify the math.

**Independent Test**: Click the compare control; verify that at least four named strategies appear, each with the same four metric columns, that the winner for the currently-selected objective is visually distinguished, and that clicking a non-winner row previews that strategy's chart (or at minimum surfaces its per-year distribution).

**Acceptance Scenarios**:

1. **Given** the Lifetime Withdrawal Strategy panel is open, **When** the user activates "Compare other strategies", **Then** a ranked list of at least four candidate strategies is shown with end-balance, lifetime tax, and FIRE-age columns.
2. **Given** the comparison list is open, **When** the user selects a non-winner strategy, **Then** the chart and KPIs temporarily re-render for that strategy with a clear "previewing alternative" indicator and a one-click return to the auto-selected winner.
3. **Given** two strategies tie within a small tolerance on the selected metric, **When** the ranking is displayed, **Then** both strategies appear at the same rank with a tie indicator rather than an arbitrary ordering.

---

### User Story 3 — Strategy-aware narrative + caveat captions (Priority: P3)

As a user reviewing the Lifetime Withdrawal Strategy panel, the on-chart narrative caption, "How to read this chart" text, and the existing bracket-fill caveats (Social Security taxable, IRMAA, Rule of 55, Roth 5-year) update to reflect the currently displayed strategy rather than always describing bracket-fill — so what I read always matches what I see.

**Why this priority**: Nice-to-have polish. If we ship US1 + US2 without fixing the captions, the feature still works; the captions will just be mildly misleading. Fixing them is important for shipping quality but it's not load-bearing.

**Independent Test**: Switch objectives / select a different strategy in the compare list and verify the narrative ribbon, caveat banner, and "how to read" block update to describe the new strategy's behaviour.

**Acceptance Scenarios**:

1. **Given** the winning strategy is "Roth ladder", **When** the chart renders, **Then** the narrative ribbon describes Roth-ladder mechanics, not bracket-fill.
2. **Given** the currently displayed strategy does not trip the IRMAA or SS-reduced-fill caveats, **When** the chart renders, **Then** those banners stay hidden (today they fire based on bracket-fill's logic and may be wrong for a different strategy).

---

### Edge Cases

- **Small Trad balance** — candidate strategies that deplete Trad early all converge to the same outcome. The system MUST still show the comparison and indicate the tie rather than picking arbitrarily.
- **All candidate strategies infeasible** — the user's target spend is unsustainable even with the best strategy. The Lifetime Withdrawal panel MUST surface the infeasibility clearly rather than silently picking the "least bad" option.
- **Objective toggle during active drag / override** — if the user is currently dragging the FIRE marker when they flip the objective, the feature MUST not clobber the override. Preserve the current `fireAgeOverride` and re-score strategies at the overridden age.
- **Strategy requires Rule-of-55 but flag disabled** — strategies that assume pre-59.5 Trad access (Rule of 55) should either be gated out of the candidate pool or auto-enable Rule-of-55 for the scoring pass with a visible annotation.
- **RMD-active years (73+)** — every candidate strategy MUST honour forced RMD draws; a strategy that "avoids Trad" must still pull the RMD minimum when active.
- **Currency / locale** — end-balance deltas between strategies should remain comparable in real dollars (inflation-adjusted), matching the rest of the dashboard's convention.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide **exactly seven** named withdrawal strategies as candidates. The specific strategies are: (1) Bracket-Fill Smoothed, (2) Trad-First, (3) Roth-Ladder, (4) Trad-Last / Estate-Preserve, (5) Proportional, (6) Tax-Optimized Numerical Search, (7) Conventional (Taxable → Trad → Roth). All seven MUST be scored on every recalc. The current **Bracket-Fill Smoothed** strategy MUST remain byte-for-byte unchanged so upgrade never regresses a user's existing results.
- **FR-002**: The system MUST expose a binary **objective selector** with two options: "Leave more behind" (maximize end-of-plan net worth) and "Retire sooner / pay less tax" (minimize lifetime federal tax, ties broken by earliest feasible FIRE age). The selector MUST be reachable from the Lifetime Withdrawal Strategy panel.
- **FR-003**: On every recalculation, the system MUST simulate every candidate strategy across the full retirement horizon (FIRE → plan age), compute each strategy's end-of-plan net worth (after any outstanding Trad tax liability) and lifetime federal tax, and score each against the selected objective.
- **FR-004**: The system MUST display the auto-selected winning strategy by default in the Lifetime Withdrawal Strategy panel (chart + narrative + KPI ribbon), with an explicit "Winner under [objective]: [strategy name]" label.
- **FR-005**: The non-winner strategies MUST be rendered inside a **collapsed sub-section of the Lifetime Withdrawal Strategy block**, hidden by default. A clearly labeled toggle (e.g., "▸ Compare other strategies (5)") MUST reveal the ranked list when clicked and hide it again on second click. The ranked list MUST include columns for **end-of-plan net worth**, **lifetime federal tax**, **earliest feasible FIRE age**, and **one-line strategy description**. The winning strategy MUST be visually distinguished (or excluded from the list since it's already the primary display) and the list MUST NOT require scrolling to reveal its core ranking columns.
- **FR-006**: Users MUST be able to **preview** a non-winner strategy by selecting it from the expanded comparison list; the **Lifetime Withdrawal Strategy chart, the main Full Portfolio Lifecycle chart, the pinnable lifecycle sidebar mirror, and the KPI ribbon** MUST all re-render coherently for that strategy with a visible "previewing alternative — [strategy name]" banner and a one-click "Restore auto-selected winner" action. Preview is session-scoped and MUST NOT persist across page reloads — next load always snaps back to the current auto-winner.
- **FR-007**: The outer calculation flow (FIRE-age solver → chart renderer → KPI cards) MUST NOT change — multi-strategy scoring MUST be confined to the withdrawal-strategy module. Cross-surface consistency invariants (signed sim ≡ chart ≡ withdrawal chart for the *currently selected* strategy) MUST continue to hold.
- **FR-008**: The winner selection MUST be **deterministic** for identical inputs — running the same scenario twice in a row MUST produce the same winner.
- **FR-009**: When two or more strategies tie on the selected metric within a **tolerance of $1,000** on end-balance or $100 on lifetime tax, the system MUST show them as a tie in the ranking rather than picking arbitrarily.
- **FR-010**: Strategy-specific chart annotations (narrative ribbon, bracket-fill caveat captions, "How to read this chart" block, IRMAA glyph, SS-reduced-fill banner) MUST be driven by the currently displayed strategy's runtime flags, not hard-coded to bracket-fill.
- **FR-011**: The system MUST persist the user's objective-selector choice across page reloads in the same local-storage key family as other user preferences.
- **FR-012**: Every candidate strategy MUST respect the same hard constraints as the current engine: RMD after age 73, 59.5 Trad unlock (or 55 with Rule of 55), IRMAA threshold guard, safety margin, standard deduction, LTCG bracket stacking, and no-negative-pool invariant.
- **FR-013**: The system MUST compute each strategy's "earliest feasible FIRE age" using the same mode-aware feasibility check that currently drives `findFireAgeNumerical` (Safe / Exact / DWZ), so objective-B ("Retire sooner") answers are consistent with the rest of the dashboard.
- **FR-014**: The performance cost of adding seven candidate strategies MUST keep the full recalc under **250 ms** on typical hardware (matches the current responsiveness bar). The planning phase MUST resolve the per-strategy-FIRE-age-vs-fixed-FIRE-age architectural choice (see Assumptions) to meet this budget; if needed, the system MAY memoize per-strategy full-lifecycle runs and only re-score on objective toggle.
- **FR-015**: The feature MUST ship to BOTH `FIRE-Dashboard.html` (RR) and `FIRE-Dashboard-Generic.html` (public) with identical behaviour; no RR-only or Generic-only divergence.

### Key Entities

- **Strategy** — a named withdrawal policy consumed by the per-year withdrawal computation. Attributes: `id` (stable key), `nameEN` / `nameZH`, `oneLineDescriptionEN` / `oneLineDescriptionZH`, `poolOrderPolicy` (ordered preference among Trad / Roth / Taxable / Cash / RMD-forced), `bracketFillPolicy` (none / aggressive / smoothed), `eligibilityFlags` (e.g., requires Rule of 55).
- **StrategyResult** — the per-strategy output of a full-lifecycle simulation. Attributes: `strategyId`, `endOfPlanNetWorthReal`, `lifetimeFederalTaxReal`, `earliestFeasibleFireAge`, `feasibleUnderCurrentMode` (bool), `perYearRows` (array, same shape as today's `strategy[]`), `caveatFlagsObservedInRun` (set — any of ssReducedFill, irmaaCapped, irmaaBreached, rule55Active, roth5YearWarning).
- **Objective** — the user-selected scoring axis. One of: `maximize-estate` (end-of-plan net worth) or `minimize-tax-earlier-fire` (lifetime tax, tiebreaker: earliest feasible FIRE age).
- **Winner** — the `StrategyResult` that scores highest under the current `Objective`, plus the ranked list of all strategies and any tie indicator.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a modest-Trad test scenario (Trad < $500K at FIRE), flipping the objective from "Leave more behind" to "Retire sooner / pay less tax" produces a **different winning strategy** at least 80 % of the time. (If they always converge, the feature adds nothing.)
- **SC-002**: On the same test scenarios, the "Leave more behind" winner's end-of-plan net worth is **≥ 3 %** higher than the old single-bracket-fill result in at least 50 % of scenarios. (If it never beats the current heuristic, we're adding complexity for nothing.)
- **SC-003**: On the same test scenarios, the "Retire sooner / pay less tax" winner's lifetime federal tax is **≥ 5 %** lower than the old result in at least 50 % of scenarios.
- **SC-004**: A user can identify the winning strategy's name and the losing strategies' deltas within **10 seconds** of opening the Lifetime Withdrawal Strategy panel — measured by a reader-comprehension test on the panel's labelling alone.
- **SC-005**: The Compare-Other-Strategies control, when activated, renders the ranked list in **under 500 ms** (the extra candidate strategies should already have been scored during the recalc, so opening is just a render).
- **SC-006**: The full recalc time including multi-strategy scoring stays **under 250 ms** on typical hardware at the default scenario complexity (matches today's feel).
- **SC-007**: All existing unit tests (currently 95) plus new strategy-comparison tests pass, and the cross-surface consistency invariant from feature 006 still holds for the currently-displayed strategy.

## Assumptions

- Only two objectives are offered in v1 — "Leave more behind" and "Retire sooner / pay less tax". A third (e.g., "Minimize tax-curve volatility") is out of scope until users ask for it.
- **Architectural decision deferred to planning**: with seven strategies, running the outer FIRE-age solver once per strategy (FR-013) is ~7× today's CPU cost and likely breaches the 250 ms budget. The planning phase will evaluate two architectures and pick one:
  - **Architecture A — per-strategy FIRE age**: each strategy runs the full `findFireAgeNumerical` solver; the "Retire sooner / pay less tax" objective can legitimately reward a strategy that unlocks an earlier FIRE age. Higher fidelity, higher CPU cost (needs memoization / batched scoring).
  - **Architecture B — fixed FIRE age**: the outer solver runs once using the current Bracket-Fill Smoothed strategy to fix the FIRE age; candidate strategies only vary the per-year withdrawal pattern *at that FIRE age*. Matches the user's stated intuition that "order of calculation shouldn't change, it is just cycling within the withdraw strategy module". Cheaper (1× outer solver + 7× lifecycle sim). Loses the ability of a strategy to "buy" an earlier FIRE age — objective B then reduces to "minimize lifetime tax at the fixed FIRE age" (earliest feasible FIRE age is already locked by Safe/Exact/DWZ upstream).
- Candidate strategies are a **fixed curated set** authored by the developer, not user-defined DSL. Users compare and pick, they don't invent strategies.
- Strategy scoring is run on **every recalc**, not lazily on toggle. The cost of N full simulations is acceptable at the target FR-014 budget because each simulation reuses the existing per-year withdrawal loop.
- "End of plan net worth" for ranking purposes is the sum of all pools at plan age **net of outstanding Trad tax** (evaluated at the user's average retirement marginal rate) — otherwise a strategy that "wins" by leaving huge pre-tax Trad looks artificially better than an equivalent Roth-only balance.
- Real-dollar (inflation-adjusted) figures only; matches the rest of the dashboard.
- The feature ships to both RR and Generic in lockstep per the repo's maintenance rules.
- Storage: objective-selector value reuses the existing `fire_*` localStorage key namespace.
- The current smoothed bracket-fill and the outer Safe/Exact/DWZ feasibility check are preserved unchanged as one of the candidate strategies — so nobody's existing results regress on upgrade.
