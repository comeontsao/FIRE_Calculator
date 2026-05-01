# Specification Quality Checklist: Tax Expense Category + Audit-Harness Carry-Forward

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-05-01
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs) — spec talks about Tax category, sub-rows, federalTax field, progressive brackets at the contract level, not specific code
- [x] Focused on user value and business needs — leads with FIRE-planner visibility into invisible tax cost
- [x] Written for non-technical stakeholders — the only technical references are calc-module names that already exist in the codebase
- [x] All mandatory sections completed — User Scenarios, Requirements, Success Criteria, Assumptions all filled

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — informed-guess defaults used per the user's earlier brainstorm answer (Option C, progressive brackets, bundle the four B-020-* items)
- [x] Requirements are testable and unambiguous — every FR has a measurable outcome or specific behavior
- [x] Success criteria are measurable — SC-001 through SC-011 each have a specific metric (time, count, ratio)
- [x] Success criteria are technology-agnostic — no framework / language / library mentioned
- [x] All acceptance scenarios are defined — Given/When/Then format for every user story
- [x] Edge cases are identified — 7 edge cases listed (country switch, filing status change, income below stdDed, taxRate already populated, CI timeout, no-consumption-tax country, NaN guard)
- [x] Scope is clearly bounded — 7 user stories with explicit priorities; US7 marked OPTIONAL
- [x] Dependencies and assumptions identified — A1 through A10 capture the reasonable defaults

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria — each FR maps to one or more US acceptance scenarios
- [x] User scenarios cover primary flows — MVP path (US1) is testable in isolation; remaining stories layer on
- [x] Feature meets measurable outcomes defined in Success Criteria — SC-001 through SC-011 cover UI responsiveness, calc accuracy, audit cleanup, test gates, constitution compliance
- [x] No implementation details leak into specification — bracket data referenced as `BRACKETS_MFJ_2024` constant (entity), not as a specific implementation file path

## Notes

- Items marked incomplete require spec updates before `/speckit.clarify` or `/speckit.plan`. All items above pass on first iteration.
- Spec assumes the user has already brainstormed the tax-category design (Option C — split into auto income + manual other) and answered the 3 design questions before this spec was written. Clarifications avoided.
- US7 (B-020-5 fractional-year DWZ) marked OPTIONAL and may be deferred to feature 022 if scope creeps; this is documented in A4 and explicit in US7's priority tag.
- A2 acknowledges that non-US progressive tax tables are out-of-scope; the flat `taxRate` field remains the override path for non-US users.
