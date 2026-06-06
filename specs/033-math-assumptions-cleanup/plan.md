# Implementation Plan: Math-Assumptions Cleanup

**Branch**: `033-math-assumptions-cleanup` | **Date**: 2026-06-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/033-math-assumptions-cleanup/spec.md`

## Summary

Three corrections to the projection math, landing as one wave with one combined
fixture update and one documented FIRE-age delta:

1. **US1 — single cash-growth dial.** A new `calc/assumptions.js` module defines
   `CASH_REAL_RETURN` (default **0.0** per clarification Q1) and every simulator's
   cash-growth site consumes it — replacing ~10 hardcoded `×1.005` sites per HTML
   file plus `calc/accumulateToFire.js` and the `returnRateCashReal` mirror in
   `calc/getCanonicalInputs.js`. A static meta-test bans hardcoded cash-growth
   multipliers outside the one defining location (FR-003).
2. **US2 — honest funding.** `calc/accumulateToFire.js`'s negative-residual floor
   (`cashFlowToCash = 0` + warning) is replaced by the funding ladder:
   reduce discretionary stock contribution → draw cash → draw brokerage; only a
   still-unfunded remainder keeps `NEGATIVE_RESIDUAL`. Per-year rows gain sibling
   fields (`stockContributionActual`, `fundedFromCash`, `fundedFromStocks`) so the
   audit table, copy-debug, and the conservation block reflect actual flows; the
   conservation residual returns to ≈ $0 (FR-008).
3. **US3 — Fisher real rates.** `calc/assumptions.js` also exports
   `realRate(nominal, inflation) = (1+nominal)/(1+inflation) − 1`; all real-rate
   derivations (growth, 401K, SS-COLA, income-raise) route through it — ~28 sites
   per HTML file + 4 calc-module sites. A static meta-test bans remaining
   subtraction-form derivations in simulators (FR-009).

## Technical Context

**Language/Version**: Vanilla JavaScript (ES2020-compatible, classic-script-safe), single-file HTML dashboards
**Primary Dependencies**: Chart.js (CDN) — unchanged; no new runtime deps
**Storage**: localStorage + FIRE-snapshots.csv — both untouched by this feature
**Testing**: Node built-in test runner (`npm run test:unit`, 682+ tests), Playwright (`npm run test:e2e`, 163+ tests), browser probes (`tools/console-probe.mjs`, `tools/smoke-032.mjs`)
**Target Platform**: Browser via `file://` double-click AND `http://` (Principle V); Node for calc-module tests
**Project Type**: Dual single-file HTML dashboards + extracted `calc/` modules (UMD classic scripts)
**Performance Goals**: No measurable change — same number of arithmetic ops per simulated year
**Constraints**: file:// compatibility (UMD classic scripts only); unique top-level lexical names across all browser-loaded calc scripts (globalScopeCollision guard); lockstep between both HTML files
**Scale/Scope**: ~10 cash sites/HTML ×2 + 2 calc modules; ~28 Fisher sites/HTML ×2 + 4 calc sites; 1 funding-ladder rewrite; fixture corpus update; ~7 fixture files + ~15 unit-test files with absolute expectations

## Constitution Check

*GATE: evaluated against constitution v1.2.0 (9 principles). Re-checked post-design — PASS, no violations.*

| Principle | Status | Notes |
|---|---|---|
| I. Dual-Dashboard Lockstep | ✅ | All shared-math edits land in both HTML files in the same change set; `calc/assumptions.js` script tag added to both head blocks. Lockstep verify (byte-equivalent calc layer) is an explicit task. |
| II. Pure Calculation Modules | ✅ | `calc/assumptions.js` is pure constants + one pure function with a full Inputs/Outputs/Consumers header. `accumulateToFire`'s funding ladder stays pure. Audit observability: the Accumulation stage's `subSteps` gains "shortfall funding ladder (contribution cut → cash → brokerage)". |
| III. Single Source of Truth | ✅ | The feature's whole point: one defining location for the cash assumption and the real-rate conversion. |
| IV. Gold-Standard Regression Coverage | ✅ | Every fixture whose expectations shift is updated in the same commit with a delta note (FR-010). No new strategy → no new Strategy-Matrix entry, but matrix/spending-floor tests re-run (gates 6–7 untouched paths, verified green). |
| V. Zero-Build, UMD, file:// | ✅ | `calc/assumptions.js` follows the UMD pattern with UNIQUE top-level names (`_assumptionsApi`) per the 2026-06-05 global-scope lesson; loaded as a classic script before all consumers. |
| VI. Chart ↔ Module Contracts | ✅ | `accumulateToFire.js` contract header gains the new row fields + consumer updates (audit table, conservation block, copy-debug). `assumptions.js` lists its consumers. |
| VII. Bilingual First-Class | ✅ | One new user-visible string class (reduced-contribution informational flag in the audit table / warning callout) ships with EN + zh-TW keys in both files + catalog. |
| VIII. Spending Funded First | ✅ | Untouched in retirement; US2 extends the same *spirit* (never silently starve a funding need) to accumulation. `strategyMatrix` + `spendingFloorPass` tests must stay green (review gate 6). |
| IX. Mode/Objective Orthogonality | ✅ | Ranker untouched; `modeObjectiveOrthogonality` test must stay green (review gate 7). |

**Process-lesson gates (CLAUDE.md):**
- *Caller-audit before extraction*: research.md §R6 enumerates every consumer of `stockContribution`, `cashFlowToCash`, `cashFlowWarning` before the semantics change; sibling fields keep v2 meanings (lesson: sibling-field beats overloading).
- *Calc-contract field-semantics → test audit first*: the fixture/test sweep is its own task phase BEFORE the math flips.
- *Full E2E suite is the gate*: `npm run test:e2e` (163+) green required at the merge gate, plus the browser-probe smoke.

## Project Structure

### Documentation (this feature)

```text
specs/033-math-assumptions-cleanup/
├── plan.md              # This file
├── research.md          # Phase 0 — site inventories + decisions D1–D8
├── data-model.md        # Phase 1 — assumptions module + row-field extensions
├── quickstart.md        # Phase 1 — merge-gate smoke checklist
├── contracts/
│   └── assumptions.contract.md   # CASH_REAL_RETURN + realRate() + funding ladder
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
calc/
├── assumptions.js            # NEW — CASH_REAL_RETURN, realRate(); UMD, loaded first
├── accumulateToFire.js       # cash site, real-rate sites, income-raise site, funding ladder
├── getCanonicalInputs.js     # returnRateCashReal + returnRateReal route through assumptions
FIRE-Dashboard.html           # +<script calc/assumptions.js>; ~10 cash + ~28 Fisher sites
FIRE-Dashboard-Generic.html   # same, lockstep
tests/
├── unit/mathAssumptions.test.js          # NEW — static guards (FR-003, FR-009) + realRate unit cases
├── unit/accumulateToFire.test.js         # funding-ladder cases + conservation ≈ $0
├── fixtures/*.js                         # expected-value updates with delta notes
├── meta/frame-coverage.test.js           # FRAME-comment pattern updates if pinned to "nominal − inflation"
└── e2e/cash-sweep-toggle.spec.ts         # OFF-case expectation reviewed under CASH_REAL_RETURN = 0
tools/
└── fireage-delta-probe.mjs   # NEW (temp) — captures per-mode FIRE age + end balance before/after (FR-012)
```

**Structure Decision**: existing dual-HTML + `calc/` layout; one new calc module
(`assumptions.js`) inserted as the FIRST calc script tag (before `calcAudit.js`)
in both HTML head blocks so every later script and inline simulator can read its
globals at evaluation time.

## Complexity Tracking

No constitution violations. One structural addition worth recording:

| Addition | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| New module `calc/assumptions.js` | One defining location consumable by BOTH HTML inline simulators AND Node-tested calc modules | Defining the constant inside one HTML file breaks Node tests and lockstep; defining inside `accumulateToFire.js` makes an unrelated module the assumption registry and inverts the dependency for `getCanonicalInputs.js` |

## Phase 0 → research.md (complete)

All technical unknowns resolved — see [research.md](./research.md), decisions D1–D8.

## Phase 1 → data-model.md, contracts/, quickstart.md (complete)

- [data-model.md](./data-model.md) — assumptions registry, per-year funding record extension, conservation block.
- [contracts/assumptions.contract.md](./contracts/assumptions.contract.md) — module contract incl. funding-ladder ordering (NON-NEGOTIABLE).
- [quickstart.md](./quickstart.md) — merge-gate checklist (automated probes + visual spot-checks).

## Phase 2 — NOT in this command

`/speckit-tasks` generates tasks.md. Suggested phase shape (advisory):
US-order P1 → P2 → P3 with the test-audit sweep FIRST in each story
(field-semantics lesson), the FIRE-age-delta probe capturing BEFORE numbers
prior to any math flip, and the combined fixture update landing per-story so
each story's delta is attributable.
