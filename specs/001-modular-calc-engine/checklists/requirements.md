# Specification Quality Checklist: Modular Calc Engine

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-04-19
**Last Updated**: 2026-04-19 (post-analyze remediation round)
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — all 3 resolved by user
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded (Monte Carlo, CSV schema, localStorage migrations explicitly out of scope)
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Clarifications Resolved

- **Q1 (FR-014 override persistence)**: Option B with refinements → drag = preview only; explicit in-chart confirm control promotes preview to active override; override wiped on any input-triggered recalc; Reset control visible whenever override is active. Captured in FR-014, FR-018, FR-003 (consolidated with former FR-020).
- **Q2 (FR-015 override + mode switch)**: Option A → override wins; mode switch only re-evaluates feasibility via `chartState.revalidateFeasibilityAt(...)`, NOT via `recalcAll() → setCalculated()`. Captured in FR-015, US1 Scenario 9, T023b, chartState.contract.md.
- **Q3 (FR-016 extraction scope)**: Option A → full extraction in this feature (all listed modules).

## Analysis Findings Resolved (post `/speckit-analyze`)

- **C1 (CRITICAL, FR-014 vs FR-015)**: Resolved — added `revalidateFeasibilityAt(age, feasible)` to `chartState.contract.md`; added US1 Scenario 9; inserted T023b to route the mode-switch event through the new method; extended T017 to lock FR-015.
- **A1 (HIGH, FR-003 vs FR-020 duplication)**: Resolved — FR-003 consolidated with former FR-020; FR-020 retained as a pointer so existing cross-references resolve.
- **I1 (MEDIUM, Phase terminology drift)**: Resolved — `data-model.md §3` now contains a Phase glossary mapping spec's prose names to enum values; spec's US2 explicitly references the mapping.
- **U1 (MEDIUM, fractional-age rounding rule)**: Resolved — `data-model.md §1` validation rules now declare `Math.floor` conversion for RR's personal-data adapter.
- **U2 (MEDIUM, parity-divergence convention)**: Resolved — `data-model.md §7 FixtureCase` now includes a `divergent: string[]` field; convention documented inline.
- **U3 (MEDIUM, ssStartAge inputs)**: Resolved — `data-model.md §1 Inputs` now declares `ssStartAgePrimary` and `ssStartAgeSecondary` with validation; `SSEarnings` typedef added.
- **G1 (MEDIUM, FR-015 coverage gap)**: Resolved — T023b added; T017 extended to test `revalidateFeasibilityAt`.
- **G2 (MEDIUM, SC-009 soft coverage)**: Resolved — T017 extended with atomic-transition assertion; chartState invariants now specify atomicity explicitly.
- **G3 (LOW, FR-013 → FR-004 integration bridge)**: Resolved — T029 expanded to include an explicit four-layer bridge check.
- **A2 (LOW, FR-019 "gentle" ambiguity)**: Resolved — FR-019 now explicitly lists the three layered cues (cursor, label, pulse) as a mandatory initial implementation.
- **I2 (LOW, growthChart naming drift)**: Resolved — `plan.md` now carries a UI-label ⇄ DOM-id glossary.
- **I3 (LOW, fourth meta-test undocumented)**: Resolved — `research.md §R7` now lists all four meta-tests (purity, contract header, consumer sync, fixture shape).
- **Principle-I lockstep enforcement concern**: Resolved — `tasks.md` Notes section now explicitly lists the five task pairs that MUST land in the same commit.

## Notes

- Spec is ready for `/speckit-implement` (or a second `/speckit-analyze` pass to confirm zero findings).
- FR-020 intentionally kept as a reference anchor pointing to FR-003 — removing it would break downstream cross-references in `tasks.md` / `contracts/`. Content-wise, treat FR-003 as authoritative.
