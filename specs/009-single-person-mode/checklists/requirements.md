# Specification Quality Checklist: Generic Dashboard — Single-Person Mode

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-04-23
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

## Notes

- **Clarifications resolved (2026-04-23)**: Control shape is a numeric Adults counter (range 1–2, default 2), placed beside the existing Children counter in a unified "Household composition" block. See `spec.md > Clarifications > Session 2026-04-23`.
- The feature is explicitly Generic-only per user instruction; the lockstep rule is intentionally suspended for this feature. The `Out of scope` block and Assumptions both call this out so reviewers don't flag it as a lockstep violation.
- Two `Assumptions` are informed guesses rather than elicited clarifications: (a) single-adult healthcare share ≈ 0.35, and (b) post-65 single Medicare = half the couple rate. Both are consistent with how the existing scaling formula is written (couple-share = 0.67, per-kid = 0.165). Rather than block the spec on exact actuarial numbers, the spec accepts these as defaults and lets the user override via the existing manual healthcare fields. If the team prefers different defaults, they can be tuned in planning.
- Head-of-Household filing status is explicitly out of scope to keep the feature shippable as a single-person correctness fix. If user feedback after launch shows demand, a follow-up feature can add HoH selection without reopening this spec.
- Adults > 2 is also explicitly out of scope (FR-028). The counter is hard-capped at 2.
- Single parents are promoted from edge-case to first-class per the triggering user note ("make sure the person can still have children"). See US2 acceptance scenario 2 and FR-014.
- The spec assumes the existing feature-007 infrastructure (`detectMFJ`, `applyFilingStatusDefaults`, user-edit tracking) is sound; this is a foundation-building, not a rewrite.
