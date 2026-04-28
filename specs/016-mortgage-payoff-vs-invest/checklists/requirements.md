# Specification Quality Checklist: Mortgage Payoff vs. Invest Comparison

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-04-28
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Validation Notes

### Content Quality

- The spec uses the term "calc module" and references constitutional principles by name. This is a project convention (the constitution defines `calc/` as the canonical module location and Principle V/VI/VII/I as enforcement), not an implementation leak. The spec itself never names a language, framework, library, or API.
- Verdict / Factor Breakdown / Crossover Point are user-facing concepts, not implementation entities, even though they appear in Key Entities. They describe what the user sees, not how it is computed.

### Requirement Completeness

- Three potentially ambiguous areas were resolved with documented assumptions rather than [NEEDS CLARIFICATION] markers:
  1. **Investment account type for the Invest path** — assumed taxable brokerage (the most common interpretation of "extra after-tax money"); 401K / Roth / IRA modeling is explicitly out of scope.
  2. **Net-worth framing (home equity in or out)** — exposed as a user-toggleable choice on the pill (FR-010), so both interpretations are available. No clarification needed.
  3. **Time horizon for the comparison** — assumed full plan window (current age → plan-end age) per the dashboard's existing `endAge` setting. The two reference years for the verdict (FIRE-age and plan-end) cover the common decision points.
- All FR-### requirements name a concrete observable behavior (chart renders, slider updates, banner text, fallback explainer, etc.).
- Edge cases enumerate every state the mortgage scenario can be in (disabled, paid-off, naturally-paid-off-before-FIRE, buy-in deferred, plan-end-before-payoff).

### Feature Readiness

- US1 alone delivers a viable MVP — the chart + verdict banner answers the user's question. US2 (Factor Breakdown) and US3 (extra-amount sensitivity) are independently shippable refinements.
- Success criteria are quantitative (SC-001 perf, SC-002 monotonicity, SC-005 zero-NaN check) and verifiable by either browser smoke or unit fixture (SC-008).
- Constitutional gates are referenced by FR (Principle I lockstep, II purity, V file-protocol delivery, VI chart↔module contracts, VII bilingual). Plan / tasks phases will inherit these as Constitution Check items.

## Clarification Session 2026-04-28 (post-spec)

Three clarifying questions asked and resolved (all integrated into spec.md under `## Clarifications`):

1. **Q1 → Option B** — Add a third chart visualizing per-year principal-vs-interest split for both strategies. Resolved by FR-018. Confirmed amortization is universal across US states; no state-specific math added.
2. **Q2 → Option B** — Support a planned mid-window refi shared by both strategies. Resolved by FR-019 + FR-020. Closing costs deferred. Edge cases for refi-year-after-payoff, refi-extending-past-plan-end, and refi-before-buy-in added.
3. **Q3 → Option C** — Add an "Effective mortgage rate (after-tax)" override slider for users in states with state-MID benefit, instead of building a full state-tax table. Resolved by FR-021 + FR-022. Factor Breakdown surfaces the override delta when active.

Spec sections touched: `Clarifications` (new), `Functional Requirements` (FR-018 through FR-022 added; FR-008 expanded), `Key Entities` (PrepayInvestComparison signature extended), `Edge Cases` (3 new bullets), `Brainstorm` (refi reclassified from out-of-scope to in-scope; state-MID partially covered).

## Result

✅ All quality checks still pass after clarification round. Specification is ready for `/speckit-plan`.
