# Implementation Plan: Explicit Retirement Status

**Branch**: `036-retirement-status` | **Date**: 2026-07-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/036-retirement-status/spec.md`

## Summary

Add a durable, user-asserted **Retirement Status** that decouples *when the user CAN retire* (the existing Safe/Exact/DWZ feasibility scan) from *when the user HAS retired* (a fact only the user knows). When ON, the retirement transition used by the projection and every chart is the user's **actual retirement date** — not the earliest-feasible age — stopping all employment income and new contributions from that date while leaving Social Security / passive income on their own start-age schedules. The feasibility verdict reframes from a "FIRE in N years" countdown to a **sustainability readout** ("sustainable to plan end" / "at risk — shortfall in year Y"). The FIRE-marker drag stays the planning what-if for the not-yet-retired and goes inert once status is ON.

**Technical approach**: Retirement Status becomes a new single-source-of-truth input to the **one** effective-transition resolver already consumed by every chart/KPI (Principle III). When ON it supersedes both `calculatedFireAge` and the drag `fireAgeOverride`. The transition is threaded through the existing `overrideFireAge` parameter of `projectFullLifecycle` and a new optional `retirement` descriptor on `calc/accumulateToFire.js` — no parallel projection path. RR uses a single household retirement age; Generic supports up to two staggered per-person retirement ages, which requires splitting the single household income into **Person 1 / Person 2 income** inputs (FR-019) so retiring one earner stops only that earner's income and attributed contributions. The verdict block (RR ~14511, Generic equivalent) gains a retired branch. Persistence extends `STATE_KEY` with a structured `_retirementStatus` object; new income inputs join `PERSIST_IDS`. All new copy ships EN + zh-TW.

## Technical Context

**Language/Version**: Vanilla ES2017 JavaScript (classic scripts, no modules), HTML5, inline CSS.
**Primary Dependencies**: Chart.js (CDN) only. No build step, no framework.
**Storage**: `localStorage` (`fire_dashboard_state` via `STATE_KEY`); append-only `FIRE-snapshots.csv` (unchanged by this feature).
**Testing**: Node built-in test runner for `calc/*.js` unit tests; Playwright for E2E. Both HTML files smoke-tested via `tools/console-probe.mjs`.
**Target Platform**: Modern desktop + mobile browsers; MUST run under `file://` (double-click) — Principle V.
**Project Type**: Single-file dual-dashboard web app (`FIRE-Dashboard.html` RR + `FIRE-Dashboard-Generic.html` Generic) + extracted `calc/` modules.
**Performance Goals**: First chart < 1s cold; lifecycle drag ≥ 30 fps (constitution Performance floor). Retirement toggle → projection update in ≤ 2 interactions (SC-007).
**Constraints**: Zero-build; UMD-classic-script calc modules (no `export`); dual-dashboard lockstep except the one deliberate divergence; bilingual-at-merge.
**Scale/Scope**: ~2 HTML files (~21k lines each) + `calc/accumulateToFire.js` + `calc/fireAgeResolver.js`; annual/age-based projection to plan age (≤ ~99).

## Constitution Check

*GATE evaluated against `.specify/memory/constitution.md` v1.2.0.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Dual-Dashboard Lockstep (NON-NEGOTIABLE) | ⚠️ **Deliberate divergence** | Shared behavior (switch, persistence, on-track reframing, honest early-retirement drawdown, off-revert, auto-suggest) lands identically in both files. RR uses a single household date; Generic adds per-person staggered retirement + per-person income (FR-015, FR-017–FR-020). This is a **structural** divergence, not personal-content — see Complexity Tracking C1. User-clarified & spec-mandated. |
| II. Pure Calculation Modules | ✅ | `accumulateToFire` gains an optional pure `retirement` descriptor param; no DOM/global reads added. Contract header updated (Inputs/Outputs/Consumers). |
| III. Single Source of Truth for Interactive State | ✅ **Central to design** | Retirement transition resolves in the ONE `effectiveFireAge`/`fireAgeResolver` path every chart/KPI already reads. Status ON → resolver returns the retirement age; no renderer re-derives it. |
| IV. Gold-Standard Regression Coverage (NON-NEGOTIABLE) | ✅ | New fixtures: retired-now drawdown, retired-earlier-than-safe shortfall, staggered-generic income masking, off-revert parity (== feasibility-driven), RR↔Generic parity on shared scenarios. |
| V. Zero-Build, Zero-Dependency Delivery | ✅ | UMD extension only; no ES module syntax; file:// preserved. |
| VI. Explicit Chart ↔ Module Contracts | ✅ | `accumulateToFire` Consumers list + Lifecycle/Timeline/KPI render comments updated. |
| VII. Bilingual First-Class (NON-NEGOTIABLE) | ✅ | Every new string (switch label, date/year input, sustainability verdicts, auto-suggest, per-person income labels) ships EN + zh-TW + catalog entry. |
| VIII. Spending Funded First (NON-NEGOTIABLE) | ✅ | Drawdown after transition uses existing strategies + spending-floor pass; early-retirement shortfalls surface via existing `hasShortfall` marking (FR-007). No strategy change. |
| IX. Mode and Objective are Orthogonal | ✅ | Ranker untouched. When retired the verdict is reinterpreted as sustainability, but Mode/Objective sort keys are unchanged. |

**Gate result**: PASS with one documented divergence (C1). No unjustified violations.

## Project Structure

### Documentation (this feature)

```text
specs/036-retirement-status/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── retirement-status.contract.md   # Phase 1 output
├── checklists/
│   └── requirements.md  # (from /speckit-specify)
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
FIRE-Dashboard.html            # RR: single household retirement date; verdict reframe; persistence
FIRE-Dashboard-Generic.html    # Generic: per-person staggered retirement + Person 1/2 income inputs
calc/
├── accumulateToFire.js        # + optional `retirement` descriptor (per-year income masking, transition age)
├── fireAgeResolver.js         # effectiveFireAge resolution — retirement status supersedes override
FIRE-Dashboard Translation Catalog.md   # new EN/zh-TW keys
tests/
├── unit/
│   ├── accumulateToFire.retirement.test.js   # NEW — descriptor behavior + masking + parity
│   └── (existing fixture suites extended)
└── e2e/
    └── retirement-status.spec.ts             # NEW — toggle, persist, reframe, drag-inert, staggered
```

**Structure Decision**: Existing dual-single-file layout with extracted `calc/` modules is retained (Principle V). The transition mechanism reuses `projectFullLifecycle(inp, spend, overrideFireAge, withSS, options)` and `accumulateToFire(inp, fireAge, options)` — retirement status feeds `overrideFireAge` / the new `retirement` descriptor rather than adding a new simulator.

## Phase 0 — Research

See [research.md](./research.md). Resolves: date→age mapping under the annual model; how to make retirement status supersede the drag without two conflicting levers; staggered-income modeling in a single-transition accumulator; contribution attribution across two earners; auto-suggest session semantics.

## Phase 1 — Design & Contracts

- **Data model**: [data-model.md](./data-model.md) — `RetirementStatus` (RR single / Generic per-person), `PerPersonIncome`, persistence shape, resolver precedence, verdict reinterpretation.
- **Contract**: [contracts/retirement-status.contract.md](./contracts/retirement-status.contract.md) — the `retirement` descriptor accepted by `accumulateToFire` / `projectFullLifecycle`, resolver precedence rules, and the verdict-reframe contract.
- **Quickstart**: [quickstart.md](./quickstart.md) — manual verification script for each user story + browser smoke gate.
- **Agent context**: CLAUDE.md SPECKIT marker updated to point at this plan.

## Complexity Tracking

| # | Violation / Complexity | Why Needed | Simpler Alternative Rejected Because |
|---|------------------------|------------|--------------------------------------|
| C1 | **Structural divergence between the two dashboards** (Principle I): RR single household retirement date vs Generic per-person staggered retirement with new Person 1/2 income inputs. | Spec FR-015 & clarification 2026-07-02: real two-earner public households commonly stagger retirement; a single shared date misstates income for the in-between years. RR income is intentionally modeled as one household figure, so a single date is correct there. | A single shared date on both (fully lockstep) rejected: it cannot represent one spouse retiring before the other on the public dashboard — the primary generic use case. Per-person on RR rejected: RR's private income is one household number; adding a second earner axis there is unused complexity. |
| C2 | **New global inputs** `person1Income` / `person2Income` on Generic (replaces single `annualIncome`). | Per-person retirement (FR-018/FR-019) requires per-person income so retiring one earner stops only their share. | Attributing a fixed 50/50 split of the single income rejected: users' two incomes differ; a wrong split misstates the interim-years projection (SC-008 verifiability). Migration keeps `annualIncome = person1Income + person2Income`. |
