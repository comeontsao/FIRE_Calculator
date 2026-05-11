# Specification Quality Checklist: Cash-Sweep to Stocks

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-05-11
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
  - Note: Spec names function names (`accumulateToFire`, `projectFullLifecycle`, etc.) only because each is the subject of a parity requirement — function names are user-observable through the audit panel and CLAUDE.md's process-lessons section. Pseudocode for the sweep itself avoids naming language or library.
- [x] Focused on user value and business needs
  - US1 leads with the visible behavior change ("cash no longer grows to $354K"). US2 protects existing users' snapshot reproducibility. US3 explains the real-$ semantics. US4 is regression-prevention. US5 is bilingual compliance.
- [x] Written for non-technical stakeholders
  - Acceptance scenarios use plain language with concrete dollar values. Function names appear only when describing the parity requirement, always paired with the user-visible consequence.
- [x] All mandatory sections completed
  - User Scenarios & Testing, Requirements, Success Criteria, Assumptions, Dependencies, Out of Scope all present and substantive.

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
  - FR-001 through FR-013 each name a specific, observable behavior with a specific check.
- [x] Success criteria are measurable
  - SC-030-A names exact dollar amounts and tolerances. SC-030-B refers to numerical check via audit dump. SC-030-C is byte-identical comparison. Others are pass/fail.
- [x] Success criteria are technology-agnostic (no implementation details)
  - Note: SC mentions "audit dump" and "Lifecycle chart" — these are user-facing artifacts, not implementation technology choices.
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
  - 9 edge cases enumerated covering threshold=$0, threshold>cash, threshold extremely high, mid-year withdrawal drops, accumulation-phase sweeps, real-vs-nominal frame, partial-FIRE-year row scaling, one-shot events, and snapshot CSV reproducibility.
- [x] Scope is clearly bounded
  - "Out of Scope" enumerates 8 specific exclusions: sweep into 401k/Roth, per-year threshold variation, stock→cash refill, nominal-$ threshold, visual indicator, snapshot migration, A/B sweep mode, tax-loss harvesting.
- [x] Dependencies and assumptions identified
  - Dependencies section names features 029, 022, 014, and the localStorage schema. Assumptions section lists 11 explicit assumptions.

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
  - US1: visible chart change (P1)
  - US2: byte-identical pre-feature behavior when OFF (P1)
  - US3: real-$ frame consistency (P2)
  - US4: simulator parity / regression-prevention (P2)
  - US5: bilingual UI (P3)
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification
  - Stays at the "what" level. The "how" (which audit invariant gets extended vs added, where in `_simulateStrategyLifetime` the sweep call goes, etc.) is deferred to `/speckit-plan`.

## Notes

- The user explicitly requested OFF as the default, which the spec locks in as FR-006 and US2's whole purpose.
- The sweep timing (year-end, after all flows + one-shot events) is documented as an assumption rather than a [NEEDS CLARIFICATION] because it's the most defensible default and the user didn't specify otherwise.
- The real-$ interpretation of the threshold is documented as an assumption rather than a [NEEDS CLARIFICATION] because every other dollar input in the dashboard already follows this convention, and switching to nominal-$ for this one input would create user confusion.
- The 6-simulator parity requirement (FR-005) is the feature's biggest risk. The plan phase needs to choose between (a) extending feature 029's `_invariantE` to also cover cash sweeps, or (b) adding a parallel `_invariantF` for cash-sweep parity. Spec stays agnostic.
- **Clarifications session 2026-05-11 (post-spec)**: 2 questions asked + answered. Locked the year-0 preservation semantics (starting cash untouched) + the year-1-onward threshold rule. See `## Clarifications` section in `spec.md`. Updated FR-004, US1 acceptance scenarios, SC-030-A, and the "threshold = $0" edge case to reflect these decisions.
- All 16 checklist items still PASS after clarification integration.
- Spec is ready for `/speckit-plan`.
