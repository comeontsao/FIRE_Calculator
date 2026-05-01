# Implementation Plan: Tax Expense Category + Audit-Harness Carry-Forward

**Branch**: `021-tax-category-and-audit-cleanup` | **Date**: 2026-05-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/021-tax-category-and-audit-cleanup/spec.md`

## Summary

Add a **Tax** expense category to the Plan-tab Expenses pill in both dashboards, containing two sub-rows: an auto-computed read-only **Income tax** (federal progressive brackets + FICA, US-only, pre-FIRE accumulation phase) and a manual **Other tax** that sums into `monthlySpend`. Refactor `calc/accumulateToFire.js` to compute `federalTax` via progressive bracket math (existing flat `taxRate` becomes optional override) and add a sibling `ficaTax` field with full per-bracket / per-component audit breakdown (`federalTaxBreakdown`, `ficaBreakdown`). Add a new audit invariant family `tax-bracket-conservation` to lock the bracket math.

In the same feature, ship four carry-forward items from the feature 020 audit backlog: strategy ranker hysteresis (B-020-4), audit harness in CI (B-020-6), harness `fireAge ≤ endAge` clamp (B-020-7), and optionally true fractional-year DWZ feasibility (B-020-5, deferrable to feature 022 if scope creeps).

## Technical Context

**Language/Version**: JavaScript ES2017+ (browser-runnable via classic `<script>`); Node 20 for unit-test runner.
**Primary Dependencies**: Chart.js 4 (CDN); `node:test` built-in (no npm install). Constitution Principle V — zero-dep delivery preserved.
**Storage**: Browser `localStorage` (existing keys + new `exp_tax_other`, `taxRateAutoMode` boolean); no server.
**Testing**: `node --test` for unit + audit-harness tests; manual browser-smoke gate before merge (T080-equivalent).
**Target Platform**: Modern browsers (Chrome / Firefox / Safari / Edge); `file://` delivery preserved per Principle V.
**Project Type**: Single-file dashboard (no build pipeline); two parallel HTMLs (RR + Generic) maintained in lockstep per Principle I.
**Performance Goals**: Income tax sub-row updates within one animation frame (≤16ms) on slider drag; full recalc ≤250ms (existing budget).
**Constraints**: Lockstep RR + Generic; bilingual EN + zh-TW from inception; constitution VIII (Spending Funded First) gate green throughout; no new runtime dependencies.
**Scale/Scope**: 12 country scenarios (existing); 92 personas in audit matrix (existing, reused unchanged); ~12-15 new unit tests; ~5 new translation keys per language; ~6 new FRs over feature 020 baseline.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance | Evidence |
|---|---|---|
| **I. Dual-Dashboard Lockstep** | ✅ | All UI changes (Tax category + Auto toggle + Income tax row + Other tax row) ship to BOTH `FIRE-Dashboard.html` AND `FIRE-Dashboard-Generic.html`. Translation Catalog updated atomically. New persona axis (`adultCount` filing-status detection) reuses existing field; no asymmetric divergence. |
| **II. Pure Calc Modules with Declared Contracts** | ✅ | `calc/accumulateToFire.js` v3 update keeps the module pure (no DOM, no globals); contract header re-declared with new `ficaTax` + `federalTaxBreakdown` + `ficaBreakdown` outputs. New audit-observability sub-requirement: per-row breakdown surfaces in `copyDebugInfo().lifecycleProjection.rows[i]` per FR-016a. |
| **III. Single Source of Truth for Interactive State** | ✅ | UI Income tax row reads `(federalTax + ficaTax) / 12` directly from the calc snapshot; never recomputes (FR-016). One resolver, one truth. |
| **IV. Gold-Standard Regression Coverage** | ✅ | New unit tests pin progressive-bracket federalTax against IRS published 2024 tables for MFJ + single at $50k/$150k/$250k income (3×2 = 6 cases minimum). Existing v2-CF-* tests updated with `// 021:` comments where bracket math shifts pinned values. Strategy Matrix tests stay green (no strategy changes). |
| **V. Zero-Build, Zero-Dependency Delivery** | ✅ | New tax-bracket data lives as a constant block inline in both HTMLs (or factored into `calc/taxBrackets.js` as UMD-classic-script). No new bundler, no new framework, no new CDN. CI workflow uses `node:test` built-in (no npm install). |
| **VI. Explicit Chart ↔ Module Contracts** | ✅ | Income tax sub-row's renderer comment annotates `@module: calc/accumulateToFire.js (federalTax + ficaTax fields)`; the calc module's `Consumers:` list updates to name the Plan-tab Expenses pill. |
| **VII. Bilingual First-Class — EN + zh-TW** | ✅ | All 5+ new translation keys ship in both `TRANSLATIONS.en` and `TRANSLATIONS.zh` in BOTH HTMLs. Translation Catalog `FIRE-Dashboard Translation Catalog.md` updated in the same change set. |
| **VIII. Spending Funded First** | ✅ | No changes to retirement-phase strategy logic. Accumulation-phase `federalTax` computation upgrade does not interact with the spending-floor pass. `tests/unit/spendingFloorPass.test.js` stays green throughout. |
| **IX. Mode and Objective are Orthogonal** | ✅ | No changes to `getActiveSortKey`, `rankByObjective`, or `scoreAndRank`. Strategy ranker hysteresis (US4 / B-020-4) modifies tie-breaker thresholds but preserves the (Mode, Objective) → sort-chain dispatch table. `tests/unit/modeObjectiveOrthogonality.test.js` stays green. |

**No constitution violations.** Complexity Tracking section is empty.

## Project Structure

### Documentation (this feature)

```text
specs/021-tax-category-and-audit-cleanup/
├── plan.md                     # This file
├── research.md                 # Phase 0 — bracket math + FICA wage-base + Auto-toggle UX
├── data-model.md               # Phase 1 — TaxBrackets entity, FICA constants, audit fields
├── quickstart.md               # Phase 1 — manual smoke checklist
├── contracts/
│   ├── accumulateToFire-v3.contract.md       # NEW — adds ficaTax + federalTaxBreakdown + ficaBreakdown
│   ├── taxBrackets-2024.contract.md          # NEW — IRS 2024 brackets + FICA rates table
│   └── tax-bracket-conservation-invariant.md # NEW — audit-harness invariant family
├── checklists/
│   └── requirements.md         # Existing (passed validation 2026-05-01)
└── tasks.md                    # Phase 2 output (NOT created here)
```

### Source Code (repository root)

```text
calc/
├── accumulateToFire.js         # MODIFIED — v2 → v3 (adds ficaTax, breakdown fields, override path)
├── taxBrackets.js              # NEW — IRS 2024 MFJ + single bracket constants + FICA constants (UMD-classic-script)
├── strategyRanker.js           # MODIFIED — adds ±0.05yr hysteresis (US4 / B-020-4)
└── ...                         # Other calc modules unchanged

FIRE-Dashboard.html             # MODIFIED — Tax category UI in Plan/Expenses pill, Auto toggle in Investment tab,
                                #            audit-dump renderers updated for new breakdown fields
FIRE-Dashboard-Generic.html     # MODIFIED — same as RR (lockstep per Principle I)
FIRE-Dashboard Translation Catalog.md  # MODIFIED — 5+ new bilingual keys

tests/
├── unit/
│   ├── accumulateToFire.test.js          # MODIFIED — new v3 tests + existing tests with `// 021:` updates
│   ├── taxBrackets.test.js               # NEW — IRS-table parity for MFJ + single, 6+ cases
│   ├── strategyRankerHysteresis.test.js  # NEW — US4 / B-020-4 hysteresis behavior
│   └── validation-audit/
│       ├── tax-bracket-conservation.test.js  # NEW — audit invariant family
│       ├── harness.js                        # MODIFIED — fireAge ≤ endAge clamp (US6 / B-020-7)
│       └── ...                               # Other invariant files unchanged

.github/
└── workflows/
    └── audit.yml               # NEW — CI runs validation-audit harness on every PR (US5 / B-020-6)
```

**Structure Decision**: Existing single-project layout extended. New calc module `calc/taxBrackets.js` follows the established UMD-classic-script pattern (matches `calc/accumulateToFire.js`, `calc/fireAgeResolver.js`). All UI changes touch the two HTMLs in lockstep. The audit harness (already shipped in feature 020) gains one new invariant file + a small wiring patch.

## Phase Plan

| Phase | Scope | Tasks (preview) |
|---|---|---|
| **1** | Setup + verify clean baseline | Confirm 413 tests green on the new branch; ensure no uncommitted state; verify branch is `021-tax-category-and-audit-cleanup` (already created) |
| **2** | Foundational research + bracket data | Phase 0 research (this plan generates it); ship `calc/taxBrackets.js` UMD module with IRS 2024 MFJ + single brackets + FICA constants; unit tests against published IRS / SSA tables |
| **3** | US3 Calc-engine refactor (P1, blocks US1) | Update `calc/accumulateToFire.js` v3: progressive bracket path + flat-rate override branch; `ficaTax` field; `federalTaxBreakdown` + `ficaBreakdown` audit fields; update v2 → v3 contract doc; refresh existing v2-CF-* tests with `// 021:` comments |
| **4** | US1 + US2 UI in Plan-tab Expenses (P1 / P2) | Tax category + Income tax row + Other tax row in BOTH HTMLs; live update wiring; tooltip i18n EN + zh-TW; `monthlySpend` plumbing for Other tax; localStorage key `exp_tax_other` |
| **5** | Investment-tab Auto toggle (P1, finishes US3) | Add Auto toggle next to `taxRate` slider in BOTH HTMLs; visible-but-disabled treatment when ON; default Auto=ON for blank, Auto=OFF for populated; localStorage `taxRateAutoMode`; i18n EN + zh-TW |
| **6** | Audit-dump breakdown wiring | `copyDebugInfo()` updates in both HTMLs to surface new `federalTaxBreakdown` + `ficaBreakdown` per row; new audit invariant file `tax-bracket-conservation.test.js` |
| **7** | US4 — Strategy ranker hysteresis (P3 / B-020-4) | Add ±0.05yr hysteresis to `calc/strategyRanker.js` scoring; new unit test `strategyRankerHysteresis.test.js`; re-run drag-invariants audit (target: E3 LOW count 17 → 0) |
| **8** | US6 — Harness fireAge clamp (P3 / B-020-7) | Single-line patch to `tests/unit/validation-audit/harness.js` `findFireAgeNumerical` invocation; re-run cross-chart-consistency audit (target: C3 HIGH count 1 → 0) |
| **9** | US5 — Audit harness in CI (P2 / B-020-6) | Add `.github/workflows/audit.yml` running `node --test tests/unit/validation-audit/` on push + PR; PR-comment formatter for findings counts; CRITICAL fails build, HIGH warns |
| **10** | (Optional) US7 — True fractional-year DWZ feasibility (P3 / B-020-5) | Extend `simulateRetirementOnlySigned` to pro-rate FIRE-year row by `(1 − m/12)`; unit test in `monthPrecisionResolver.test.js`. **DEFER if scope creeps past 1 day of agent work** |
| **11** | Polish + audit run + closeout | Full `node --test` sweep; full audit harness run; compile findings into `audit-report.md`; triage CRITICAL / HIGH (target: 0 CRITICAL, 0 HIGH); CLOSEOUT.md; update BACKLOG; flip CLAUDE.md SPECKIT block; final commit |
| **12** | **USER GATE** — Browser smoke + merge | Manual T080-equivalent checklist; user merges to `main` after sign-off |

## Phase 0: Research (this run produces `research.md`)

The clarifications session resolved 5 design questions (see `spec.md` § Clarifications). Phase 0 research consolidates external references the implementation will lean on:

1. **R1 — IRS 2024 federal brackets**: bracket boundaries + std deduction for MFJ + single (cited from IRS Rev. Proc. 2023-34 / IRS Publication 17 2024 edition).
2. **R2 — SSA 2024 wage base + FICA rates**: SS 6.2% / Medicare 1.45% / additional 0.9% Medicare; SS wage base $168,600; additional Medicare thresholds $200k single / $250k MFJ (cited SSA Press Release Oct 2023).
3. **R3 — Auto-toggle UX patterns**: visible-but-disabled affordance precedent (existing `pviEffRateOverrideEnabled` pattern in the dashboard, plus generic Material / iOS HIG references).
4. **R4 — GitHub Actions audit-comment patterns**: how to format finding-count summaries as PR comments (zero-dep approach, no `actions/github-script` heaviness; can use a simple `gh pr comment` step).
5. **R5 — Strategy-ranker hysteresis literature**: justification for ±0.05yr threshold given E3 audit cluster data (uses feature 020 audit findings as the empirical anchor).

## Phase 1: Design & Contracts

Phase 1 outputs (this run):

1. **`research.md`** — R1 through R5 consolidated, with citations.
2. **`data-model.md`** — TaxBrackets entity, FICA constants, audit field definitions, localStorage schema deltas.
3. **`contracts/accumulateToFire-v3.contract.md`** — module contract update (v2 → v3): adds `ficaTax`, `federalTaxBreakdown`, `ficaBreakdown` outputs.
4. **`contracts/taxBrackets-2024.contract.md`** — pure-data contract for the new `calc/taxBrackets.js` module.
5. **`contracts/tax-bracket-conservation-invariant.md`** — audit-harness invariant family contract.
6. **`quickstart.md`** — manual browser-smoke checklist (T080-equivalent for feature 021).
7. **CLAUDE.md SPECKIT block** updated to reference the plan file.

## Complexity Tracking

*No constitution violations. No complexity entries.*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_  | _(none)_   | _(none)_                             |
