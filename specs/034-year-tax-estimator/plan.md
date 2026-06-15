# Implementation Plan: Year Tax Estimator

**Branch**: `034-year-tax-estimator` | **Date**: 2026-06-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/034-year-tax-estimator/spec.md`

## Summary

Add a self-contained, single-year federal **tax microscope** to the bottom of the
Withdrawal Strategy tab in the **RR dashboard only** (`FIRE-Dashboard.html`). The user
picks any retirement year; the block auto-pulls that year's projected ordinary-income
components (Traditional withdrawal, Roth conversion, taxable SS) and realized long-term
stock gains from the same strategy results that drive the Roth-ladder chart, converts
them to the **selected year's nominal dollars**, and renders two "show-your-work"
breakdown cards (ordinary income tax; LTCG tax with correct 0%/15%/20% stacking on top of
ordinary taxable income) plus four signal chips (room-left-at-0%-LTCG headline, marginal
next-dollar rates, IRMAA Tier 1 flag, NIIT 3.8% flag). All inputs are editable; edits are
a **local what-if** that never write back to the plan or Lifecycle chart; Reset restores
the auto-pulled values.

**Technical approach:** a new pure, UMD-style calc module `calc/taxEstimator.js` exposing
`estimateYearTax(params) → { ordinary, ltcg, signals, marginal, steps[] }` does the
stacking math that `calc/tax.js computeTax` deliberately omits (no stacking, no standard
deduction). A thin RR-only renderer (`renderYearTaxEstimator`) reads existing strategy
rows for auto-pull, converts real→nominal via `calc/inflation.js`, inflates indexed
bracket thresholds to the selected year, holds the fixed NIIT threshold, and paints the
DOM. The module loads in BOTH HTML files (calc-layer lockstep) but the UI block + renderer
exist only in RR (documented Principle-I divergence).

## Technical Context

**Language/Version**: Vanilla ES5/ES2017 JavaScript (classic `<script>`), no transpile.
**Primary Dependencies**: Chart.js (CDN) — NOT used by this feature (no new chart); existing `calc/inflation.js` (real↔nominal), existing tax-bracket inputs in the Withdrawal Strategy tab, existing strategy results (`computeWithdrawalStrategy` / `_lastStrategyResults.rows[].perYearRows[]`).
**Storage**: None new. No `localStorage` key, no CSV column. Estimator state is ephemeral (in-memory, per-session, not persisted).
**Testing**: Node-based unit tests (`tests/unit/taxEstimator.test.js`) consuming the CommonJS export; Playwright E2E for render / year-pick / edit-then-reset.
**Target Platform**: Same dashboards — modern browsers AND `file://` double-click (Principle V).
**Project Type**: Single-file HTML app + extracted `calc/` modules (existing architecture).
**Performance Goals**: Recompute + repaint on input change must feel instant (<16ms for the pure calc; well within the Principle "first chart < 1s / drag ≥ 30fps" floor — this feature adds no chart and no per-frame work).
**Constraints**: file://-safe (UMD classic script, no ES `export` in the new module); zero new runtime dependency; bilingual EN + zh-TW for every new string; money terminology ("dollars/gains/tax owed", never "real $").
**Scale/Scope**: One calc module (~150–250 LOC), one renderer (~250–400 LOC) + ~40 i18n keys, RR file only; unit + E2E tests.

## Constitution Check

*GATE: evaluated against constitution v1.2.0 (9 principles).*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Dual-Dashboard Lockstep | ⚠ **Justified divergence** | UI block + renderer are RR-only by explicit user scope. Mitigated: the pure `calc/taxEstimator.js` loads in BOTH files (calc-layer stays lockstep); Generic gets a documented placeholder comment at the equivalent location marking the intentional UI divergence. See Complexity Tracking. |
| II. Pure Calc Modules + Contracts | ✅ Pass | `calc/taxEstimator.js` is pure (no DOM/Chart/global/localStorage), has a fenced Inputs/Outputs/Consumers header, is Node-unit-testable. Not part of the projection audit flow-diagram, so the `subSteps` audit-observability sub-requirement does not apply; the module's own `steps[]` output provides equivalent in-module traceability. |
| III. Single Source of Truth | ✅ Pass | Estimator is read-only on plan state. It introduces NO competing FIRE-age/spend source; FR-002 forbids write-back, which actively protects this principle. |
| IV. Gold-Standard Regression Coverage | ✅ Pass | New fixture cases for `taxEstimator` (the 6 edge cases in the spec). Not a withdrawal strategy → no `strategyMatrix.test.js` entry required. |
| V. Zero-Build / file:// / UMD | ✅ Pass | New module is UMD classic-script: no top-level `export`, unique global name `_taxEstimatorApi`, `module.exports` for Node, lazy cross-module refs. Loaded via `<script src="calc/taxEstimator.js">` in both files. |
| VI. Explicit Chart ↔ Module Contracts | ✅ Pass (adapted) | No Chart.js chart, but the renderer carries a comment declaring it consumes `calc/taxEstimator.js` + `calc/inflation.js`, and the module's `Consumers:` lists the RR estimator renderer. |
| VII. Bilingual EN + zh-TW | ✅ Pass (work item) | Every new label/tooltip/breakdown/signal string ships with EN + zh-TW via `data-i18n`/`t()`, plus a Translation Catalog update, in the same change set. Tracked as explicit tasks. |
| VIII. Spending Funded First | ➖ N/A | Estimator does not run the withdrawal engine; it reads existing strategy output. |
| IX. Mode/Objective Orthogonal | ➖ N/A | No ranking/sort logic touched. |

**Additional constraints check:** Sticky-Chrome (no new sticky band — block lives inside the
scrollable tab body); Security (no secrets, no external calls, no new personal figures beyond
what RR already shows); File-Protocol (UMD module verified loadable under `file://`).

**Gate result:** PASS with one justified Principle-I divergence (recorded in Complexity Tracking).

## Project Structure

### Documentation (this feature)

```text
specs/034-year-tax-estimator/
├── plan.md              # This file
├── spec.md              # Feature spec (/speckit.specify)
├── research.md          # Phase 0 — decisions & rationale
├── data-model.md        # Phase 1 — entities & field mapping
├── quickstart.md        # Phase 1 — how to verify
├── contracts/
│   └── taxEstimator.contract.md   # estimateYearTax I/O contract
├── checklists/
│   └── requirements.md  # spec quality checklist (already created)
└── tasks.md             # Phase 2 — created by /speckit.tasks (NOT here)
```

### Source Code (repository root)

```text
calc/
└── taxEstimator.js      # NEW — pure UMD module: estimateYearTax(params)

FIRE-Dashboard.html       # RR — adds: <script src="calc/taxEstimator.js">,
                          #   the estimator UI block at the bottom of the
                          #   Withdrawal Strategy tab, renderYearTaxEstimator(),
                          #   the new "0% LTCG ceiling" input, ~40 i18n keys
                          #   (EN+zh) in the TRANSLATIONS dicts.

FIRE-Dashboard-Generic.html  # Generic — adds ONLY:
                          #   <script src="calc/taxEstimator.js"> (calc lockstep)
                          #   + a placeholder comment marking the intentional
                          #     UI divergence at the equivalent tab location.

tests/unit/
└── taxEstimator.test.js # NEW — stacking edge cases + fixtures

tests/e2e/ (or existing Playwright dir)
└── year-tax-estimator.spec.*  # NEW — render / year-pick / edit-then-reset

FIRE-Dashboard Translation Catalog.md   # append new EN+zh keys
FIRE-Dashboard-Roadmap.md                # mark feature 034
```

**Structure Decision:** Follows the existing extracted-`calc/`-module + dual-HTML pattern.
The only architectural novelty is that this calc module operates in **nominal dollars of a
selected year** (most modules are real-$); the real→nominal conversion is confined to the
renderer's auto-pull adapter using `calc/inflation.js` (the single sanctioned conversion
site per FR-017), keeping the calc module frame-pure on its own inputs.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principle I — RR-only UI block (Generic gets no estimator UI) | User explicitly scoped this as a personalized tax-planning tool for R&R's MFJ retirement workflow ("Just for the R&R dashboard"). Filing-status, real account figures, and the planning use-case are RR-specific. | Shipping the full UI to Generic too was rejected because the user did not ask for it and Generic is a demo artifact; instead we preserve the **calc-layer** lockstep (module loads in both) and document the UI divergence with a placeholder comment in Generic at the equivalent location, satisfying the principle's "explicitly state the divergence and identify the equivalent line range" enforcement clause. |
| New calc module operates in nominal-$ (not real-$ like its siblings) | The whole point of the tool is "what the tax return will literally show that year," which is a nominal-frame question (FR-019). | Computing in real-$ and converting only for display was rejected because bracket-vs-income comparisons (0% LTCG ceiling stacking) must happen in a single consistent frame; doing the stack in real-$ then converting the result loses the per-layer nominal breakdown the user asked to see. Conversion is still funneled through `calc/inflation.js` (FR-017 single-conversion-site rule preserved). |
