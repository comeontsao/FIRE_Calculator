# Specification Quality Checklist: Bracket-Fill Tax Smoothing

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-04-21
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

- Two user stories, both P1 in spirit but formally ordered P1 (bracket-fill behavior) and P2 (transparent caveats). The P2 story is NOT optional — it is the trust-and-auditability layer that makes P1 usable. A rational product owner would not ship P1 without P2, but the split allows the task list to sequence DOM/CSS annotation work after the algorithm work.
- Functional requirements are grouped by concern for traceability:
  - FR-001 – FR-005: core bracket-fill behavior
  - FR-010 – FR-011: Social Security integration
  - FR-020 – FR-024: IRMAA protection
  - FR-030 – FR-034: Rule of 55
  - FR-040 – FR-041: 5-year Roth rule warning
  - FR-050 – FR-053: chart transparency
  - FR-060 – FR-062: solver and projection integration
  - **FR-063: cross-surface consistency (NON-NEGOTIABLE) — enumerates EVERY downstream consumer that must update in lockstep with bracket-fill. Three primary consumers, ~15 derived surfaces, explicit NOT-affected list.**
  - FR-063a: feature 006 sidebar mirror continues to agree with primary chart under bracket-fill (renamed from FR-065-sidebar during /speckit-analyze to avoid ID collision with filing-status FR-065).
  - FR-064: FIRE date propagates to status banner / KPI row / compact header chips on mode or slider change.
  - FR-065 – FR-069a: filing-status awareness on Generic (RR stays hardcoded MFJ; Generic routes all bracket lookups through `detectMFJ`). Includes repairing a feature-006 regression that hardcoded `getTaxBrackets(true)` in Generic's signed lifecycle simulator.
  - FR-070 – FR-071: bilingual + lockstep gates
  - FR-080 – FR-081: non-regression gates
- Assumptions section explicitly records: MFJ filing status, state-tax 0% (not CA/NY/NJ/OR/MN), 85% Social Security taxable approximation, fixed-bracket projection horizon (safety margin is the bracket-drift mitigation), DWZ solver re-targeting as desired behavior.
- Success criteria are measurable: 25% lifetime-tax reduction floor, 50% RMD-balance reduction floor at age 73, monotonic safety-margin behavior, 60-second user readability target, per-cycle rendering overhead ceiling.
- Implementation-level questions (exact DOM selectors, function signatures, chart library call signatures, localStorage key names, synthetic-conversion accounting mechanics) are intentionally absent from the spec; they belong in `/speckit.plan`.
- One subtle constraint worth flagging for the planner: FR-060 explicitly requires the signed lifecycle simulator and the chart renderer to route synthetic conversions identically. The feature-006 fix established the precedent that these two must share the same withdrawal algorithm. Feature 007 must preserve that invariant or `Safe`/`Exact` feasibility will regress.
