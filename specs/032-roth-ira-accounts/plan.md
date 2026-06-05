# Implementation Plan: Roth IRA Accounts (Roger & Rebecca)

**Branch**: `032-roth-ira-accounts` | **Date**: 2026-05-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/032-roth-ira-accounts/spec.md`, audit at `specs/032-roth-ira-accounts/audit.md`, constitution v1.2.0

## Summary

Add a dedicated **`rothIra` withdrawal pool** to the dashboard's calc engine, sibling to the existing `roth` (Roth 401K) pool — fully locked until 59.5, RMD-exempt by design (the existing RMD branch is already `trad`-only), drawn immediately after `roth` in every strategy's ordering rule. Surface the new pool via **two balance inputs + two annual-contribution inputs** in the RR dashboard's Plan→Assets tab (with the Investment tab gaining the contribution fields), populated with locked defaults (Roger $0 + $7K/yr, Rebecca $59,021 + $7K/yr; contributions fully editable). Wire the new pool through all **57 identified touch points** (audit.md): UI, state, localStorage, portfolio aggregation, accumulation, withdrawal simulator, lifecycle chart, strategy ranker, FIRE feasibility gate, drag-preview, tooltips, audit invariants, copy-debug snapshot, CSV history (append-only schema bump), and bilingual i18n (EN + zh-TW). Browser smoke per `quickstart.md` is the merge gate.

The implementation honors the constitution's resolution of two structural tensions: (1) **Principle I lockstep at the calc layer** is preserved — the inline calc code that ships in both HTML files (strategy simulator, accumulation loop, signed-sim, etc.) is updated in BOTH files; only the UI inputs and i18n labels are RR-only because they encode personal data (Rebecca's specific balance); (2) **the existing canonical field `rothIraReal` is misnamed** — it currently represents Roth 401K, not Roth IRA. The plan renames it to `roth401kReal` and introduces a new `rothIraReal` for the actual Roth IRA pool, in the same commit, with a fixture sweep.

## Technical Context

**Language/Version**: Vanilla JavaScript (ES2020 features that parse in classic-script tags; NO `export`/`import` per Principle V's file:// rule); HTML5; inline CSS using the existing dark-theme CSS-variable system.

**Primary Dependencies**: Chart.js (loaded via CDN). No new dependencies.

**Storage**:
- `localStorage` — four new keys for the new inputs (per-key, parallel to existing 401K wiring): `rogerRothIra`, `rebeccaRothIra`, `rogerRothIraContrib`, `rebeccaRothIraContrib`. Documented in the existing inline localStorage schema.
- `FIRE-snapshots.csv` — append-only, two new columns at the end of the header row: `rogerRothIra`, `rebeccaRothIra`. Per DB-Engineer constitution, NEVER mid-row. Loader detects short legacy rows and defaults missing values to 0.

**Testing**: Jest 29 (Node, unit) running calc modules + inline-extractable HTML fragments; Playwright 1.40 (browser, E2E). Existing baseline: **622/622 unit + 6/6 Playwright drag E2E** must remain green. New tests cover every touch point per FR-022.

**Target Platform**: Any modern browser. Critical: must work via `file://` double-click (Principle V); no ES modules in calc files; UMD-style classic-script loading.

**Project Type**: Single-file dashboard (zero-build) with extractable `calc/*.js` modules and `tests/` directory. No build system, no transpile step.

**Performance Goals**: First meaningful chart < 1 second cold cache (constitutional floor). Drag interaction ≥ 30 fps (constitutional floor). The new pool adds two extra series stacked in the Lifecycle chart and one extra accumulator in the withdrawal simulator — negligible performance impact.

**Constraints**:
- `file://` compatibility (Principle V) — no ES module syntax in calc files.
- Lockstep at calc layer (Principle I) — inline calc code identical between RR and Generic HTML.
- Bilingual at merge (Principle VII) — every new EN string ships with paired zh-TW string in the same commit.
- Spending-floor pass MUST honor the new pool (Principle VIII) — the rothIra branch in the strategy simulator (touch #29) mirrors the spending-floor handling already in the `roth` branch.
- Sort-key orthogonality MUST be preserved (Principle IX) — strategy dispatch is pool-agnostic per audit (#32); the new pool flows through automatically without touching sort-key logic.

**Scale/Scope**: ~57 touch points across 19 files (per audit.md). Estimated diff ~1500–2500 lines added (UI block + inline calc plumbing + 4 calc-module edits + ~15 new/updated test files + i18n catalog entries). Estimated 30–40 tasks in `tasks.md`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-evaluated post Phase 1.*

| # | Principle | Status | Notes |
|---|---|---|---|
| I | Dual-Dashboard Lockstep (NON-NEGOTIABLE) | ⚠️ **TENSION — JUSTIFIED** | Spec FR-018 says Generic UI is unchanged. The user's intent is personal-content scope. Calc-layer lockstep is preserved by updating inline calc code in BOTH files; only the UI inputs + i18n labels are RR-only. See Complexity Tracking. |
| II | Pure Calculation Modules with Declared Contracts | ✅ ALIGN | New rothIra contracts added to `calc/withdrawal.js` and `calc/accumulateToFire.js` header comments. Audit observability: new `rothIra` sub-steps added to the audit flow diagram. |
| III | Single Source of Truth for Interactive State | ✅ ALIGN | New pool flows through the existing `getActiveChartStrategyOptions()` + lifecycle-row → chart/verdict path. No new state-resolution paths introduced. FR-021e (effective-balance formula extension) is the critical safety FR. |
| IV | Gold-Standard Regression Coverage (NON-NEGOTIABLE) | ✅ ALIGN | FR-022 requires a test for every audit touch point. Strategy Matrix coverage extended to exercise the new pool at the canonical starvation locus. |
| V | Zero-Build, Zero-Dependency Delivery | ✅ ALIGN | No new dependencies. New calc paths follow UMD-style classic-script loading. |
| VI | Explicit Chart ↔ Module Contracts | ✅ ALIGN | Lifecycle chart's render-function comment is updated to reference the new `rothIra` pool series; the calc module's `Consumers:` list adds the chart back-reference. |
| VII | Bilingual First-Class (NON-NEGOTIABLE) | ✅ ALIGN | All new UI strings ship with paired EN + zh-TW translations in the same commits. Catalog updated. |
| VIII | Spending Funded First (NON-NEGOTIABLE) | ✅ ALIGN | The strategy simulator's spending-floor pass operates on the pool ordering. Adding `rothIra` immediately after `roth` in the order array means the floor pass naturally extends to drain it before falling through to `trad`. Strategy Matrix tests added at the starvation locus. |
| IX | Mode and Objective are Orthogonal | ✅ ALIGN | Strategy dispatch is pool-agnostic (audit #32). `getActiveSortKey()` is untouched. New pool flows through orthogonally. |

**Verdict: PROCEED.** Principle I tension is documented in Complexity Tracking and resolved structurally; all other principles align.

## Project Structure

### Documentation (this feature)

```text
specs/032-roth-ira-accounts/
├── spec.md              # Feature specification (locked clarifications)
├── audit.md             # 57 touch points across 19 categories
├── plan.md              # This file
├── research.md          # Phase 0 output (resolves 3 open research questions)
├── data-model.md        # Phase 1 output (state schema for new pool)
├── quickstart.md        # Phase 1 output (browser smoke checklist)
├── contracts/
│   └── roth-ira-pool.contract.md  # Phase 1 — pure-calc module contract
├── checklists/
│   └── requirements.md  # Spec quality checklist (all 12 items pass)
└── tasks.md             # Phase 2 output (/speckit-tasks command — NOT created here)
```

### Source Code (repository root)

```text
# Existing structure (no new top-level directories)
FIRE_Calculator/
├── FIRE-Dashboard.html          # RR dashboard — UI changes RR-only; calc inline-script lockstep with Generic
├── FIRE-Dashboard-Generic.html  # Generic dashboard — UI untouched (FR-018); inline calc lockstep updated
├── FIRE-Dashboard Translation Catalog.md  # i18n strings — new keys for Roth IRA labels
├── FIRE-snapshots.csv           # Append-only — two new columns appended at end of header
│
├── calc/                        # Pure calc modules — shared between both HTML files
│   ├── accumulateToFire.js      # Accumulation engine — extend pool growth + new contribution input
│   ├── withdrawal.js            # Withdrawal simulator — POOL_KEYS, STRATEGY_ORDERS, accessible set, drawFromPools
│   ├── lifecycle.js             # Lifecycle projection — extend phase logic for new pool
│   ├── calcAudit.js             # Audit invariants — extend composition with lockedRothIra
│   ├── withdrawalTooltipFrame.js # Tooltip pool-line reconciliation — add rothIra line
│   ├── getCanonicalInputs.js    # Input adapter — read new DOM ids + map to canonical fields
│   └── (existing files unchanged unless touched by audit)
│
└── tests/
    ├── unit/
    │   ├── accumulateToFire.test.js   # Extend with new Roth IRA fixture variants
    │   ├── withdrawal.test.js          # Extend STRATEGY_ORDERS assertions
    │   ├── lifecycle.test.js           # Extend phase-tracking with new pool
    │   ├── calcAudit.test.js           # Extend composition assertion
    │   ├── withdrawalTooltipFrame.test.js  # Add rothIra line tests
    │   ├── strategyMatrix.test.js      # NEW starvation-locus row for rothIra pool
    │   ├── verdictStrategyParity.test.js  # Extend with non-zero rothIra
    │   ├── rothIraIntegration.test.js  # NEW — top-level integration test (entire flow with non-zero RR rothIra)
    │   ├── cashSweepRrFixture.test.js  # Extend fixture with rogerRothIra
    │   ├── personas.js (validation-audit/) # Add rothIra field to each persona
    │   └── modeObjectiveOrthogonality.test.js  # Verify still passes with new pool
    │
    └── e2e/
        └── rothIra-flow.spec.ts        # NEW — Playwright: edit RR Roth IRA inputs, assert chart + verdict + snapshot
```

**Structure Decision**: This feature adds NO new top-level directories. All work happens inside existing directories per the established project layout (per Principle V's zero-build constraint). New test files (`rothIraIntegration.test.js`, `rothIra-flow.spec.ts`) sit alongside their existing siblings.

## Phase 0: Research (research.md will be created next)

Three open implementation questions need resolution before tasks can be ordered:

1. **`rothIraReal` field rename strategy**: The existing canonical field `rothIraReal` (used in `calc/withdrawal.js`, `calc/lifecycle.js`, `calc/getCanonicalInputs.js`) misleadingly represents Roth 401K balance. With the new actual Roth IRA pool, this name MUST be reassigned. Options to research: (a) rename to `roth401kReal` and introduce a new `rothIraReal` for the actual Roth IRA; (b) keep `rothIraReal` summed (Roth 401K + Roth IRA) and add a sibling `rothIraReal_split` for the separable portion; (c) introduce paired `roth401kReal` + `rothIraReal` fields and deprecate the old name with a transition test. Research output: which option carries the lowest regression risk per audit findings.

2. **Contribution-input UI placement (Investment tab)**: The two new contribution fields (Roger/Rebecca annual Roth IRA contributions) need a home on the Investment tab. The existing Roth 401K contribution UI structure must be surveyed to determine the right placement (alongside existing 401K Roth contribution fields, or in a new "Roth IRA Contributions" subsection). Research output: exact UI layout and DOM-id naming convention.

3. **Lifecycle chart series — separate line vs. stacked variant**: The chart currently shows a Roth 401K line. Two options: (a) add a separate Roth IRA line (two visually distinct series, more legend clutter, easier to read); (b) merge both Roth pools into a single "Roth Total" line (less visual noise, harder to debug strategy ordering). Research output: which approach better supports the user's mental model and the audit-observability requirement (Principle II).

## Phase 1: Design (data-model.md, contracts/, quickstart.md)

Phase 1 will produce:

1. **`data-model.md`** — full state schema with the new fields, including:
   - The 4 new RR DOM input ids
   - The 4 new localStorage keys
   - The new canonical-input fields routed through `getCanonicalInputs.js`
   - The new `rothIra` pool key, its accumulator (`pRothIra`), withdrawal accumulator (`wRothIra`), book-value sibling (`pRothIraBookValue`)
   - The new audit composition field (`lockedRothIra`)
   - The two new CSV columns

2. **`contracts/roth-ira-pool.contract.md`** — pure-calc module contract for the new pool, formalizing:
   - **Inputs**: starting balance (per person), annual contribution (per person), real return assumption, current age, FIRE age
   - **Outputs**: per-year `pRothIra` balance (real-$), `pRothIraBookValue` (nominal-$), draw amount per year (`wRothIra`)
   - **Consumers**: Lifecycle chart, FIRE feasibility gate, withdrawal-strategy tooltip, audit composition, copy-debug snapshot, snapshot CSV row
   - **Invariants**: tax-free withdrawal at all ages (matches Roth 401K), RMD-exempt at all ages (differs from Roth 401K post-2024 IRS), locked-until-59.5 access semantics, additive to (not subdivision of) existing Roth 401K contribution

3. **`quickstart.md`** — manual browser-smoke checklist run after implementation, covering:
   - Cold load of RR dashboard with locked defaults (Roger $0, Rebecca $59,021)
   - Verify Total Net Worth header includes both balances
   - Verify Lifecycle chart shows new pool
   - Verify drag-FIRE-marker keeps chart + verdict + tooltip in sync
   - Verify saving + reloading a snapshot preserves the new values
   - Verify legacy snapshot rows load with new values defaulting to 0
   - Verify language toggle EN ⇄ zh-TW updates new labels
   - Verify audit invariants A–F all pass with non-zero values
   - Verify Generic dashboard's UI is unchanged (no new fields visible)

## Phase 2: Tasks (`/speckit-tasks` will produce `tasks.md`)

Estimated 30–40 TDD-ordered tasks across these phases:

- **T01–T06**: Calc-layer foundation — research-resolved rename of `rothIraReal`, new pool key in `POOL_KEYS`, STRATEGY_ORDERS extension, accessible-set extension, accumulator changes in `accumulateToFire.js`, RMD branch verification (no-op confirmation).
- **T07–T10**: Withdrawal simulator — `drawFromPools` accumulator field, signed-sim parameter, withdrawal-tooltip-frame extension.
- **T11–T14**: Audit + invariants — composition field, persona stub updates, all 6 invariants stay green.
- **T15–T20**: HTML UI — new DOM inputs (RR only), getCanonicalInputs() reads, calcAccessible() inclusion logic, header KPI sublabels, contribution UI on Investment tab, localStorage persistence.
- **T21–T24**: Lifecycle chart + chart legend — new dataset, color theming, legend label, chart-module contract comment.
- **T25–T27**: Strategy-simulator inline code (lines 11471–11473) — both RR and Generic HTML files (lockstep at calc layer), spending-floor pass verification.
- **T28–T29**: FIRE feasibility gate — effective-balance formula extension (FR-021e, THE critical edit), signed-sim parameter.
- **T30–T32**: Snapshot CSV + history table — append columns, loader short-row detection, history row render.
- **T33–T35**: Copy-debug snapshot + Audit panel surfacing of new pool.
- **T36–T37**: i18n — EN + zh-TW catalog entries for new keys, Translation Catalog.md row.
- **T38–T40**: E2E + integration tests — Playwright flow test, full RR integration test with non-zero rothIra, strategy-matrix starvation-locus row.
- **T41 (gate)**: Manual browser smoke per quickstart.md — Manager-executed merge gate.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| **RR-only UI (Principle I tension)** | User explicitly scoped the feature to RR personal data (Rebecca's $59,021 starting balance; Roger's new $0 + $7K/yr open-now plan). These are private figures, not generic financial-planning capability. The constitution's own Principle I exemption covers "personal content (Roger/Rebecca's names, … private dollar figures)" — this feature qualifies. | Adding the inputs to Generic with placeholder zero balances was considered. Rejected because (1) it would expose a feature path the user hasn't validated for generic households, (2) it would require additional zh-TW localization work for the Generic dashboard with no current user demand, (3) the user's clear instruction was "Just for the R&R dashboard." Lockstep at the *calc layer* (inline calc code in both files) IS preserved, satisfying Principle I's structural intent. |
| **Canonical field rename `rothIraReal` → `roth401kReal`** (research-confirmed) | The existing canonical field name is a historical artifact misnamed for Roth 401K. Adding the new actual Roth IRA pool while leaving the misnomer creates ongoing confusion and a future bug source. | Keeping the existing name and adding a sibling field (e.g., `rothIraReal_actualIra`) was considered. Rejected because (1) it perpetuates the misleading name, (2) it requires reading every consumer to understand which `rothIra*` they're referencing, (3) doing the rename now during this feature is the lowest-cost time to fix it (single commit, full test sweep already required). |
