# Specification Quality Checklist: Year-by-Year Lifecycle Spreadsheet Export

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-13
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

**Status: 16/16 PASS** — spec is ready for `/speckit-plan`.

## Validation Notes

**Iteration 1 (2026-08-13)** — 15/16. Sole failure: three open `[NEEDS CLARIFICATION]` markers
(FR-010 file format, FR-015 column breadth, FR-023 inclusion of recorded history). Each was
retained deliberately because no reasonable default existed and each changed scope materially.

**Iteration 2 (2026-08-13)** — 16/16. User resolved all three:

| Marker | Question | Answer | Effect on spec |
|--------|----------|--------|----------------|
| FR-010 | File format | **True `.xlsx` workbook** | Adds a third-party dependency → new **Dependency Decision** section; unlocks workbook affordances FR-011a–d (number formats, frozen header, frozen identity columns, separate settings sheet) |
| FR-015 | Column breadth | **Everything the projection emits** | FR-015 now enumerates the full per-year set; adds FR-015a (grouped, stated column order), FR-015b (stable order across exports), FR-015c (unambiguous empties) |
| FR-023 | Include recorded snapshots? | **Projection only** | Adds FR-023a — existing snapshot export untouched, new control visually distinct |

Two candidate clarifications were **resolved by informed default instead** of consuming a marker,
and both were left unchanged by the user's answers:

- Money vs purchasing-power frame → ship **both**, clearly labelled (US2 / FR-014). Backed by the
  project's standing terminology rule; no reasonable reading justifies shipping one frame silently.
- Whether the export follows the active mode/strategy or recomputes under defaults → **follows the
  active settings** (US3 / FR-019). The user's "based on what we see" wording plus the project's
  existing strategy-parity rule make this unambiguous.

## Note on the "no implementation details" items

Both content-quality items still pass despite the spec naming a file extension and a dependency.
`.xlsx` is a user-facing outcome (what opens in their Excel), not an implementation choice, and the
**Dependency Decision** section deliberately records *constraints on* the library — offline
`file://` operation, no build step, no ES modules, no reach into the calc layer — while explicitly
leaving the choice of library and delivery mechanism to `/speckit-plan`. The spec fixes the
outcome; the plan picks the tool.

## Risk carried into planning

The `.xlsx` choice is the project's **first runtime dependency beyond Chart.js**, and Principle V's
`file://` constraint is stricter than it first appears — a library distributed only as an ES module
is disqualified outright, and one loaded only from a CDN breaks the protected double-click-offline
path. The plan's first job is to confirm a candidate satisfies all of it before any UI work starts;
if none does, FR-010 must come back to the user rather than be quietly downgraded to CSV.
