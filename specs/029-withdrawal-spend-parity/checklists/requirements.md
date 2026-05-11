# Specification Quality Checklist: Withdrawal-Simulator Spend Parity

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-05-11
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
  - Note: Spec references function names (`_simulateStrategyLifetime`, `computeWithdrawalStrategy`, etc.) because the bug is precisely "these three simulators disagree." Function names are the *subject* of the spec, not implementation choices. Behavior, not algorithms, is described.
- [x] Focused on user value and business needs
  - User story 1 leads with the user-perceived bug (visible withdrawal under-reports actual outflow). Stories 2–4 trace ripple effects to ranker correctness, verdict-pill safety net, and regression-prevention.
- [x] Written for non-technical stakeholders
  - Acceptance scenarios use plain language. Function-name references are unavoidable but always paired with the user-visible consequence.
- [x] All mandatory sections completed
  - User Scenarios & Testing, Requirements, Success Criteria, Assumptions all present and substantive.

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
  - FR-001 through FR-011 each name a specific behavior with a specific check.
- [x] Success criteria are measurable
  - SC-029-A names exact dollar amounts. SC-029-B, C, D name exact warning counts. SC-029-E names exact test counts. SC-029-F is qualitative but tied to rounding-error observation.
- [x] Success criteria are technology-agnostic (no implementation details)
  - Note: SC mentions "audit dump" and "Withdrawal Strategy chart" — these are user-facing artifacts of the dashboard, not implementation technology choices.
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
  - Eight edge cases enumerated: no-overlay years, negative healthcare delta, mortgage double-count risk, h2Carry, geo-scenarios, SS-claim cross-over, RMD years, one-shot lump-sum.
- [x] Scope is clearly bounded
  - "Out of Scope" section explicitly excludes formula changes, Step 7.5 tax behavior, mortgage threading, feature-028 stop-gap removal, new strategies/modes, and dual-simulator refactor.
- [x] Dependencies and assumptions identified
  - Dependencies section names features 028, 014, 018, 022.
  - Assumptions section lists 8 explicit assumptions.

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
  - US1: visible chart truthfulness (P1)
  - US2: ranker correctness (P1)
  - US3: signed-sim parity / verdict safety net (P2)
  - US4: regression-prevention via new audit invariant (P3)
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification
  - Spec stays at the "what" level. The "how" (whether to refactor or thread or replace) is deferred to `/speckit-plan`.

## Notes

- Two related bugs folded into one feature per user direction 2026-05-11: (a) `_simulateStrategyLifetime` overlay omission causing chart bar under-report + ranker scoring drift; (b) `signedLifecycleEndBalance` overlay omission causing 16% endBalance-mismatch warning that feature-028 strategy threading did not resolve.
- The fix is small in terms of code lines but high-stakes for calc correctness across all 8 strategies × 3 modes × 2 objectives. Spec phase emphasized comprehensive acceptance scenarios + audit-invariant-as-guardrail (FR-005) so regressions are caught at the audit layer rather than rediscovered via user repro.
- All checklist items pass. Spec is ready for `/speckit-clarify` (if needed) or `/speckit-plan`.
