# Implementation Plan: Nominal-Dollar Display + Frame-Clarifying Comments + B-021 Carry-Forward

**Branch**: `022-nominal-dollar-display` | **Date**: 2026-05-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/022-nominal-dollar-display/spec.md`

## Summary

Switch the dashboard's display layer to **nominal future dollars (Book Value)** across 14 in-scope charts/displays, with a **purchasing power** companion line on tooltips. Calc-engine internals stay in real-$; the conversion `nominal = real × (1 + inflationRate)^(age − currentAge)` is applied centrally inside `recalcAll()` — every chart-consumed snapshot field gains a `bookValue` companion, and render functions read those companion fields directly. A meta-test enforces structural coverage so a future new chart that forgets the companion field surfaces as a visible bug rather than a silent frame mismatch.

In the same feature, ship four parallel work products:

1. **Frame-clarifying `// FRAME:` comments** across all calc modules + inline simulators in both HTMLs (US2 — the user's complexity hedge).
2. **Hybrid-frame bug fix** in `calc/accumulateToFire.js` cash-flow residual (US3).
3. **Country budget tier frame disambiguation** (US4).
4. **B-021 carry-forward**: strategy-ranker simulator-discreteness fix (US5) + true fractional-year DWZ feasibility (US6).

US7 (display toggle as fallback to P5 Option B) is OPTIONAL and ships only after user-validation feedback.

## Technical Context

**Language/Version**: JavaScript ES2017+ (browser-runnable via classic `<script>`); Node 20 for unit-test runner.
**Primary Dependencies**: Chart.js 4 (CDN); `node:test` built-in. Constitution Principle V — zero-dep delivery preserved.
**Storage**: Browser `localStorage` (existing keys unchanged unless US7 ships, which adds `displayDollarMode`); no server.
**Testing**: `node --test` for unit + audit-harness + meta-tests; manual browser-smoke gate before merge.
**Target Platform**: Modern browsers (Chrome / Firefox / Safari / Edge); `file://` delivery preserved per Principle V.
**Project Type**: Single-file dashboard (no build pipeline); two parallel HTMLs (RR + Generic) maintained in lockstep per Principle I.
**Performance Goals**: ≤16ms / 60fps drag re-render budget per Constitution III. Conversion cost analyzed in spec FR-008b: 12 charts × ~50 pow ops per chart = ~600 pow ops per drag-frame; well under budget.
**Constraints**: Lockstep RR + Generic; bilingual EN + zh-TW from inception with new "Book Value" / "purchasing power" terminology; constitution VIII (Spending Funded First) gate green throughout; no new runtime dependencies.
**Scale/Scope**: 14 in-scope charts (FR-001 a–n); 92 personas in audit matrix (reused unchanged); ~25 new + ~10 modified unit tests; ~6 new bilingual translation keys; ~29 new FRs.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance | Evidence |
|---|---|---|
| **I. Dual-Dashboard Lockstep** | ✅ | All UI changes (chart re-render hooks, captions, tooltips, audit-table column labels, drag-preview overlay) ship to BOTH HTMLs. Translation Catalog updated atomically. Both HTMLs' inline simulators get matching `// FRAME:` annotations. |
| **II. Pure Calc Modules with Declared Contracts** | ✅ | New `calc/displayConverter.js` is pure data-transform (no DOM, no globals). `calc/accumulateToFire.js` US3 fix preserves purity. New `// FRAME:` block headers + inline annotations make every calc module's frame-handling self-documenting per Principle II § audit-observability sub-requirement. |
| **III. Single Source of Truth for Interactive State** | ✅ | The `bookValue` snapshot transformation lives in `recalcAll()` — a single canonical conversion site. Render functions consume snapshot fields, never re-compute. Inflation-rate slider drag triggers full snapshot rebuild → all charts re-render coherently. |
| **IV. Gold-Standard Regression Coverage** | ✅ | New unit tests pin `displayConverter.toBookValue` against IRS-style inflation tables (`(1 + i)^n`). New meta-test `tests/meta/snapshot-frame-coverage.test.js` (per FR-008e) ensures every chart-consumed snapshot field has its `bookValue` companion. Existing fixtures with cash-flow-impacted values get `// 022:` annotations per FR-017. |
| **V. Zero-Build, Zero-Dependency Delivery** | ✅ | New `calc/displayConverter.js` follows the established UMD-classic-script pattern (matches `calc/accumulateToFire.js`, `calc/taxBrackets.js`). No bundler, no framework, no new CDN. CI workflows reuse the existing `node:test` setup. |
| **VI. Explicit Chart ↔ Module Contracts** | ✅ | Every chart's renderer comment annotates `@module: calc/displayConverter.js (toBookValue)` + `@reads: snap.<path>.bookValue`. The `displayConverter` module's `Consumers:` list names all 14 in-scope charts. The `// FRAME:` block headers (FR-009) extend Principle VI's intent — every variable's frame is now contract-documented in-line. |
| **VII. Bilingual First-Class — EN + zh-TW** | ✅ | All 6+ new translation keys ship in both `TRANSLATIONS.en` and `TRANSLATIONS.zh` in BOTH HTMLs. Translation Catalog `FIRE-Dashboard Translation Catalog.md` updated in the same change set. New canonical UI terms: "Book Value" / "帳面價值" + "purchasing power" / "約等於今日價值". |
| **VIII. Spending Funded First** | ✅ | No retirement-phase strategy logic changes. US3 cash-flow residual fix is purely a frame-correction in accumulation; it does not interact with the spending-floor pass. `tests/unit/spendingFloorPass.test.js` stays green throughout. |
| **IX. Mode and Objective are Orthogonal** | ✅ | No changes to `getActiveSortKey`, `rankByObjective`, or `scoreAndRank` dispatch table. US5 monthly-precision quantization is an input-conditioning change that preserves the (Mode, Objective) → sort-chain dispatch. `tests/unit/modeObjectiveOrthogonality.test.js` stays green. |

**No constitution violations.** Complexity Tracking section is empty.

## Project Structure

### Documentation (this feature)

```text
specs/022-nominal-dollar-display/
├── plan.md                     # This file
├── research.md                 # Phase 0 — R1-R5 implementation references + clarification-decisions consolidated
├── data-model.md               # Phase 1 — bookValue companion field schema + DisplayConverter entity + frame annotations
├── quickstart.md               # Phase 1 — manual smoke checklist (T088-equivalent)
├── contracts/
│   ├── displayConverter.contract.md          # NEW — pure module contract
│   ├── recalcAll-snapshot-extension.contract.md  # NEW — bookValue companion field schema
│   ├── frame-comment-conventions.contract.md # NEW — // FRAME: annotation taxonomy
│   ├── accumulateToFire-v3-frame-fix.contract.md # NEW — US3 hybrid-frame bug fix
│   └── month-precision-feasibility-invariant.md # NEW — US6 audit invariant family contract
├── checklists/
│   └── requirements.md         # Existing (passed validation 2026-05-01)
└── tasks.md                    # Phase 2 output (NOT created here)
```

### Source Code (repository root)

```text
calc/
├── displayConverter.js         # NEW — pure helper toBookValue(realValue, age, currentAge, inflationRate); UMD-classic-script
├── accumulateToFire.js         # MODIFIED — v3 cash-flow residual fix (US3) + // FRAME: annotations
├── taxBrackets.js              # MODIFIED — // FRAME: annotations
├── taxExpenseRow.js            # MODIFIED — // FRAME: annotations + reads bookValue from snapshot
├── fireAgeResolver.js          # MODIFIED — // FRAME: annotations + US6 fractional-year DWZ
├── strategyRanker.js           # MODIFIED — US5 monthly-precision quantization + // FRAME: annotations
├── lifecycle.js                # MODIFIED — // FRAME: annotations
├── payoffVsInvest.js           # MODIFIED — // FRAME: annotations (already documents real-$ treatment)
├── healthcare.js, college.js, mortgage.js, ... # MODIFIED — // FRAME: annotations
└── ...                         # all calc/*.js files gain // FRAME: annotations

FIRE-Dashboard.html             # MODIFIED — recalcAll() bookValue snapshot transform; ~14 chart renderers updated to read bookValue;
                                #            chart captions + tooltip companion lines; drag-preview overlay; audit-table column labels;
                                #            // FRAME: annotations on all inline simulators (projectFullLifecycle, signedLifecycleEndBalance,
                                #            simulateRetirementOnlySigned, taxOptimizedWithdrawal, _simulateStrategyLifetime, etc.)
FIRE-Dashboard-Generic.html     # MODIFIED — same as RR (lockstep per Principle I)
FIRE-Dashboard Translation Catalog.md  # MODIFIED — 6+ new bilingual keys (Book Value / purchasing power / caption template / etc.)

tests/
├── unit/
│   ├── displayConverter.test.js            # NEW — pure-function tests, IRS-style inflation table parity, ≥6 cases
│   ├── accumulateToFire.test.js            # MODIFIED — v4-FRAME-* tests for US3 single-frame residual; existing tests updated with // 022:
│   ├── monthPrecisionResolver.test.js      # MODIFIED — US6 fractional-year tests
│   ├── strategyRankerHysteresis.test.js    # MODIFIED — verify US5 quantization absorbs ±0.01yr perturbations
│   └── validation-audit/
│       ├── month-precision-feasibility.test.js  # NEW — audit invariant family for US6
│       ├── harness.js                           # MODIFIED — invariant test wiring if needed
│       └── ...                                  # other invariant files unchanged
└── meta/
    ├── frame-coverage.test.js              # NEW — US2 — asserts ≥95% qualifying-line // FRAME: annotation coverage
    ├── snapshot-frame-coverage.test.js     # NEW — US1 — asserts every chart-consumed snapshot field has bookValue companion
    └── module-boundaries.test.js           # MODIFIED — extend with frame-related token allowlist if needed
```

**Structure Decision**: Existing single-project layout extended. New calc module `calc/displayConverter.js` follows the established UMD-classic-script pattern (matches `calc/accumulateToFire.js`, `calc/taxBrackets.js`, `calc/fireAgeResolver.js`). All UI changes touch the two HTMLs in lockstep. The `recalcAll()` snapshot extension is the central transformation point per Q5; render functions stay thin.

## Phase Plan

| Phase | Scope | Tasks (preview) |
|---|---|---|
| **1** | Setup + verify clean baseline | Confirm 449/450 tests green on 022 branch; ensure spec drop-in committed; baseline gate |
| **2** | Foundational — `calc/displayConverter.js` + IRS-style inflation table parity tests | Phase 0 research consolidates inflation-conversion math + Q1–Q5 decisions; ship pure module + ≥6 unit tests |
| **3** | US2 — `// FRAME:` comments across calc layer (P1) | Annotate every `calc/*.js` module + inline simulators in both HTMLs; ship `tests/meta/frame-coverage.test.js`; runs on every commit |
| **4** | US3 — Cash-flow residual hybrid-frame bug fix (P1) | Refactor `_computeYearTax` + cash-flow residual lines in `calc/accumulateToFire.js`; update v3-CF-* tests with `// 022:`; verify feature 020 conservation invariant + feature 021 TBC-* invariants stay green |
| **5** | US1 — Central `recalcAll()` `bookValue` snapshot transform + Lifecycle chart wiring (P1 / MVP) | Extend `recalcAll()` with `bookValue` companion field generation per FR-008d; refactor Lifecycle chart renderer to consume `bookValue`; ship `tests/meta/snapshot-frame-coverage.test.js` |
| **6** | US1 — Side-chart batch wiring (Frontend, parallel-friendly) | Refactor 13 remaining in-scope charts to consume `bookValue` companion fields. 5 sub-batches: Plan-tab (Mortgage + Payoff vs Invest + Expenses + Income tax row); Retirement-tab (Withdrawal Strategy + Drawdown + Roth Ladder); Geography-tab (Healthcare + Country comparison + Country deep-dive); KPIs + verdict pill + verdict banner; Audit-tab tables. |
| **7** | US1 — Drag-preview overlay + post-commit re-render (P1) | Extend drag-preview tooltip to show Book Value + purchasing-power companion line per FR-008a; verify post-commit re-render uses fresh conversion factor per FR-008b; drag-cancel revert per FR-008c |
| **8** | US1 — Caption + tooltip + i18n (P1) | Add chart captions per FR-004 via shared helper `_renderBookValueCaption()`; tooltip companion lines per FR-003; 6+ EN + zh-TW translation keys in both HTMLs; Translation Catalog updated |
| **9** | US4 — Country budget tier frame disambiguation (P2) | Tooltip on country-budget tier display per FR-018; review `scenarios[].taxNote` strings for frame consistency per FR-019; no number changes |
| **10** | US5 — Strategy ranker simulator-discreteness fix (P3 / B-021-1) | Quantize ranker age input to monthly precision in `_simulateStrategyLifetime` per FR-021; re-run drag-invariants audit; target E3 LOW count 17 → 0 |
| **11** | US6 — True fractional-year DWZ feasibility (P3 / B-021-2) | Extend `simulateRetirementOnlySigned` to pro-rate FIRE-year row by `(1 − m/12)` per FR-022; new audit invariant `month-precision-feasibility.test.js` per FR-023 |
| **12** | Polish + audit run + closeout | Full `node --test` sweep + full audit harness run; compile findings into `audit-report.md`; triage CRITICAL/HIGH; CLOSEOUT.md; update BACKLOG; flip CLAUDE.md SPECKIT block; final commit |
| **13** | **USER GATE** — Browser smoke + merge | Manual T088-equivalent checklist per `quickstart.md`; user merges to `main` after sign-off |
| **14** *(deferred)* | US7 — Display toggle (P3 OPTIONAL) | Only if always-nominal display causes UX confusion in Phase 13 user feedback. Adds header toggle + localStorage `displayDollarMode` per FR-024–25 |

## Phase 0: Research (this run produces `research.md`)

The clarifications session resolved 5 design questions (see `spec.md` § Clarifications). Phase 0 research consolidates the implementation-pattern references the implementation will lean on:

1. **R1 — Inflation-conversion math precision**: confirm `nominal = real × (1 + inflationRate)^yearsFromNow` is the right formula (vs alternative compounding conventions). Cite FIRE-community references.
2. **R2 — Central-snapshot transformation pattern**: established codebase patterns where a single `recalcAll()`-time transform feeds N renderers (cite feature 014's `assembleAuditSnapshot`, feature 020's `lifecycleProjection.rows`).
3. **R3 — `// FRAME:` annotation taxonomy**: enumerate the canonical comment categories (`// FRAME: real-$`, `// FRAME: nominal-$`, `// FRAME: conversion (real → nominal at year N)`, `// FRAME: pure-data (no $ value)`). Document the meta-test grep pattern.
4. **R4 — Hybrid-frame bug forensic**: line-by-line trace of `accumulateToFire.js` cash-flow residual showing where nominal income/spending mixes with real-$ contributions. Capture the exact pre-fix vs post-fix arithmetic on the RR-baseline persona to bound the conservation invariant delta.
5. **R5 — `_simulateStrategyLifetime` integer-year truncation**: pinpoint the line(s) where `yrsToFire = fireAge − inp.agePerson1` truncates to integer. Document the quantize-to-monthly fix (multiply by 12, floor, divide by 12) and confirm it preserves backwards-compat for integer-year inputs.

## Phase 1: Design & Contracts

Phase 1 outputs (this run):

1. **`research.md`** — R1 through R5 consolidated, with citations + arithmetic traces.
2. **`data-model.md`** — `bookValue` companion field schema (which snapshot fields gain a companion + naming convention `<field>BookValue`); `DisplayConverter` entity contract; `// FRAME:` annotation taxonomy; localStorage schema deltas (US7 OPTIONAL only).
3. **`contracts/displayConverter.contract.md`** — pure module contract for `calc/displayConverter.js`.
4. **`contracts/recalcAll-snapshot-extension.contract.md`** — what fields gain `bookValue` companions; how render functions read them.
5. **`contracts/frame-comment-conventions.contract.md`** — `// FRAME:` annotation taxonomy + meta-test enforcement rules.
6. **`contracts/accumulateToFire-v3-frame-fix.contract.md`** — US3 cash-flow residual single-frame refactor.
7. **`contracts/month-precision-feasibility-invariant.md`** — US6 audit invariant family contract.
8. **`quickstart.md`** — manual browser-smoke checklist (T088-equivalent for feature 022, ≥10 steps).
9. **CLAUDE.md SPECKIT block** updated to reference the plan file.

## Complexity Tracking

*No constitution violations. No complexity entries.*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_  | _(none)_   | _(none)_                             |
