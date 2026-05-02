# Implementation Plan: Accumulation-vs-Retirement Spend Separation

**Branch**: `023-accumulation-spend-separation` | **Date**: 2026-05-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/023-accumulation-spend-separation/spec.md`

## Summary

Fix a latent calc-engine bug surfaced during feature 022's user-validation. The dashboard's pre-FIRE accumulation phase has been spending **$0/year** because `inp.annualSpend` is never populated on the canonical input object — every assignment is on a *cloned* copy (`inpForScoring`), and the four callers of `accumulateToFire` read the original `inp` directly. Result: cash-bucket trajectory inflates by ~$95k/year on RR-baseline (year-1 portfolio Book Value Δ = +$191k vs realistic +$30k).

The fix introduces a clean architectural separation:

1. **`accumulationSpend`** (real-$) — computed at runtime from `getTotalMonthlyExpenses() × 12` (existing Plan-tab line items), representing today's US household spending. Falls back to the Stay-in-US comfortable-spend ($120k) when the line-item sum is zero (FR-002a).
2. **`annualSpend`** (real-$) — country-tier post-FIRE spending, unchanged from feature 010+. Continues to drive the retirement-phase loop in `projectFullLifecycle`.
3. **Pure-helper plumbing** — a new `getAccumulationSpend(inp)` helper centralizes resolution. All four callers of `accumulateToFire` (chart, strategy ranker, withdrawal-strategy panel, FIRE-age resolver) thread `accumulationSpend` through `resolveAccumulationOptions(...)` — which already exists, just gains a new field.
4. **Module contract update** — `calc/accumulateToFire.js` reads `options.accumulationSpend` (new) and falls through to the existing `inp.annualSpend → 0` chain only as a v2-backwards-compat fallback. Audit-test enforcement prevents the bug from re-emerging.

The retirement-phase loop is **untouched**: country-tier `annualSpend` continues to drive withdrawals (US2's "no contamination" requirement holds by construction — country-tier never reaches the accumulation code path).

Bilingual UI labels distinguish the two concepts on the Plan tab. Audit dump exposes both values. A new audit-harness invariant `accumulationSpendConsistency` (92 personas × 3 modes × 4 callers = 1,104 cells) prevents drift.

## Technical Context

**Language/Version**: JavaScript ES2017+ (browser-runnable via classic `<script>`); Node 20 for unit-test runner.
**Primary Dependencies**: Chart.js 4 (CDN); `node:test` built-in. Constitution Principle V — zero-dep delivery preserved.
**Storage**: Browser `localStorage` (existing keys unchanged; `accumulationSpend` is computed at runtime, never persisted). Pre-feature-023 saved states load without migration per FR-015.
**Testing**: `node --test` for unit + audit-harness + meta-tests; manual browser-smoke gate before merge.
**Target Platform**: Modern browsers (Chrome / Firefox / Safari / Edge); `file://` delivery preserved per Principle V.
**Project Type**: Single-file dashboard (no build pipeline); two parallel HTMLs (RR + Generic) maintained in lockstep per Principle I.
**Performance Goals**: ≤16ms / 60fps drag re-render budget per Constitution III. The new `getAccumulationSpend(inp)` helper is O(N) where N = expense-row count (typically <20). Negligible overhead.
**Constraints**: Lockstep RR + Generic; bilingual EN + zh-TW from inception with new "Current spending (US household)" / "目前支出（美國家計）" terminology; constitution VIII (Spending Funded First) gate green throughout; no new runtime dependencies.
**Scale/Scope**: 4 caller call-sites, 1 calc module signature change, 1 new audit invariant family, ~3 new bilingual translation keys, ~6 new + ~4 modified unit tests, 17 new FRs. Smaller than feature 022 (14 charts) but cross-cuts the same code paths.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance | Evidence |
|---|---|---|
| **I. Dual-Dashboard Lockstep** | ✅ | All 4 caller call-sites + 1 caption + 3 translation keys ship to BOTH HTMLs in lockstep. The `getAccumulationSpend(inp)` helper is defined as inline JS in BOTH HTMLs (or shared via `calc/accumulationSpend.js` — see R3 below). Translation Catalog updated atomically. |
| **II. Pure Calc Modules with Declared Contracts** | ✅ | `calc/accumulateToFire.js` options-bag contract is extended (new field `accumulationSpend`). Its module-header `Inputs:` block adds the new field; `Consumers:` list unchanged. New `getAccumulationSpend(inp)` helper is also pure (DOM-read only via `getTotalMonthlyExpenses()` — the helper itself is a thin wrapper that may live as inline JS in the HTML; see R3 for the location decision). The audit-observability sub-requirement (subSteps in flow diagram) is preserved — the new accumulation-phase step "Compute spending need = accumulationSpend (real-$, US household)" is added to the audit's flow diagram per FR-009. |
| **III. Single Source of Truth for Interactive State** | ✅ | The `getAccumulationSpend(inp)` helper IS the single source. All 4 callers consume it identically (FR-007/FR-008). The drift gap that allowed `inp.annualSpend = undefined` to slip through 4 features (020, 021, 022, plus earlier latent) is closed permanently. |
| **IV. Gold-Standard Regression Coverage** | ✅ | New unit tests pin the new options-bag contract (`tests/unit/accumulateToFire.test.js` v5 cases). New audit-harness invariant `accumulationSpendConsistency` (FR-014) on 1,104 cells. Existing fixtures with cash-flow-impacted values get `// 023:` annotations to call out the spending-baseline change. The Strategy Matrix starvation-locus test stays green (the spending-floor pass operates on retirement-phase, untouched). |
| **V. Zero-Build, Zero-Dependency Delivery** | ✅ | No new module loads required (helper is inline JS in HTMLs unless we promote to `calc/`; see R3). If R3 chooses `calc/accumulationSpend.js`, it follows the existing UMD-classic-script pattern. CI workflows reuse the existing `node:test` setup. `file://` delivery preserved. |
| **VI. Explicit Chart ↔ Module Contracts** | ✅ | `calc/accumulateToFire.js`'s `Consumers:` list unchanged (same 4 callers). The new options-bag field is documented in the module header + the contract file `contracts/accumulateToFire-options-bag.contract.md`. Chart renderers do NOT change — only the upstream accumulation handoff plumbing. |
| **VII. Bilingual First-Class — EN + zh-TW** | ✅ | All 3 new translation keys ship in both `TRANSLATIONS.en` and `TRANSLATIONS.zh` in BOTH HTMLs. Translation Catalog `FIRE-Dashboard Translation Catalog.md` updated in the same change set. New EN + zh-TW pair: "Current spending (US household, today's dollars)" / "目前支出（美國家計，今日購買力）"; "applies post-FIRE, in {country}" / "適用於FIRE後，於{country}"; "Sums into accumulation-phase cash flow" / "計入累積階段現金流". |
| **VIII. Spending Funded First** | ✅ | NO retirement-phase strategy logic changes. The spending-floor pass in `taxOptimizedWithdrawal` and per-strategy `computePerYearMix` is untouched. `tests/unit/spendingFloorPass.test.js` (7/7 starvation-locus matrix) stays green throughout. Pre-fix vs post-fix: only the *accumulation* phase changes; retirement-phase behavior is byte-identical. |
| **IX. Mode and Objective are Orthogonal** | ✅ | NO changes to `getActiveSortKey`, `rankByObjective`, or `scoreAndRank` dispatch table. The strategy ranker DOES consume `accumulationSpend` (via FR-007 — `_simulateStrategyLifetime` is one of the 4 callers), but this is an input-correction, not a sort-key change. `tests/unit/modeObjectiveOrthogonality.test.js` stays green. |

**No constitution violations.** Complexity Tracking section is empty.

## Project Structure

### Documentation (this feature)

```text
specs/023-accumulation-spend-separation/
├── plan.md                     # This file
├── research.md                 # Phase 0 — R1-R4 implementation references + design decisions
├── data-model.md               # Phase 1 — AccumulateToFireOptions schema delta + getAccumulationSpend helper contract
├── quickstart.md               # Phase 1 — manual smoke checklist (8 steps)
├── contracts/
│   ├── accumulateToFire-options-bag.contract.md      # NEW — options.accumulationSpend field schema + fallback chain
│   ├── getAccumulationSpend-helper.contract.md       # NEW — pure helper signature + FR-002a fallback
│   └── accumulationSpendConsistency-invariant.md     # NEW — audit invariant family contract
├── checklists/
│   └── requirements.md         # Existing (passed validation 2026-05-01)
└── tasks.md                    # Phase 2 output (NOT created here — generated by /speckit-tasks)
```

### Source Code (repository root)

```text
calc/
├── accumulateToFire.js                    # MODIFIED — read options.accumulationSpend; preserve inp.annualSpend fallback chain;
│                                          #            update module-header Inputs/FRAME blocks; backwards-compat for v3 callers
├── (potentially) accumulationSpend.js     # NEW (R3 decision pending) — pure helper getAccumulationSpend(inp); UMD-classic-script
└── (others unchanged)

FIRE-Dashboard.html                        # MODIFIED — getAccumulationSpend helper (inline OR import from calc/); 4 caller call-sites
                                           #            updated to thread accumulationSpend via resolveAccumulationOptions(); Plan-tab
                                           #            Expenses pill caption + tooltip; audit dump exposes accumulationSpend +
                                           #            annualSpend top-level; ~3 translation keys
FIRE-Dashboard-Generic.html                # MODIFIED — same as RR (lockstep per Principle I)
FIRE-Dashboard Translation Catalog.md      # MODIFIED — 3 new bilingual keys

tests/
├── unit/
│   ├── accumulateToFire.test.js                       # MODIFIED — v5-spend tests for options.accumulationSpend; existing tests
│   │                                                   #            get // 023: annotations where spending baseline changes
│   ├── getAccumulationSpend.test.js                   # NEW — pure-helper tests, including FR-002a $0 fallback
│   └── validation-audit/
│       ├── accumulation-spend-consistency.test.js     # NEW — audit invariant family for FR-014 (1,104 cells)
│       ├── harness.js                                 # MODIFIED — DOC_STUB extension if helper reads new DOM IDs;
│       │                                              #            persona schema gains optional accumulationSpend field
│       └── (others unchanged)
└── meta/
    ├── frame-coverage.test.js                         # MODIFIED — recognize new options-bag field as // FRAME: real-$ site
    └── (others unchanged)
```

**Structure Decision**: Existing single-project layout extended. **R3 pending** (Phase 0): whether `getAccumulationSpend(inp)` lives as inline JS in both HTMLs (matches `getActiveChartStrategyOptions` / `getActiveMortgageStrategyOptions` pattern) OR as a new `calc/accumulationSpend.js` module. Tradeoff is per-HTML duplication vs new-file ceremony. Default to inline-JS-in-both-HTMLs unless research surfaces a reason to extract.

## Phase Plan

| Phase | Scope | Tasks (preview) |
|---|---|---|
| **1** | Setup + verify clean baseline | Confirm 478 tests green on 023 branch tip (inherited from 022 merge); ensure spec drop-in committed; baseline gate. |
| **2** | Foundational — `getAccumulationSpend(inp)` helper + unit tests | Phase 0 research consolidates R1–R4 + R3 decision (helper location); ship pure helper + ≥6 unit tests including FR-002a fallback. |
| **3** | US1 — Plumb accumulationSpend through `resolveAccumulationOptions` (P1 / MVP) | Add `accumulationSpend` field to options bag in `resolveAccumulationOptions(inp, fireAge, ...)` in BOTH HTMLs; modify `calc/accumulateToFire.js` to read `options.accumulationSpend` with `inp.annualSpend` v2-fallback; ship v5-spend tests; verify RR-baseline year-1 cash bucket Δ < $50k (SC-001). |
| **4** | US5 — Update all 4 callers to consume the same `accumulationSpend` (P2) | Audit every `accumulateToFire(...)` call site across BOTH HTMLs (4 callers × 2 HTMLs = 8 sites); verify each threads via `resolveAccumulationOptions`; add audit-harness invariant `accumulationSpendConsistency.test.js` (FR-014). |
| **5** | US2 — Verify country-tier purity (P1) | Audit retirement-phase loop in `projectFullLifecycle` to confirm `annualSpend` (country-tier) is the SOLE spending value used for ages ≥ fireAge; add audit-harness invariant `countryTierIsolation` cross-checking that switching country tier moves ONLY retirement-phase withdrawals. |
| **6** | US3 — Audit dump + Copy Debug exposure (P2) | Extend `copyDebugInfo()` (line ~19107 in RR) to include top-level `accumulationSpend` + `annualSpend`; verify per-row `annualSpending` is sourced correctly per phase; bilingual audit-table caption update if needed. |
| **7** | US4 — Backwards-compat verification (P2) | Run pre-023 CSV snapshot import smoke; verify localStorage saved-state loads cleanly; verify audit-harness 92-persona suite reports total findings ≤ 1 LOW (feature 022 baseline). |
| **8** | US6 — Bilingual UI labels (P3) | Plan-tab Expenses pill caption "Current spending (US household, today's dollars)" / "目前支出（美國家計，今日購買力）"; tooltip clarifying retirement spending source; ~3 translation keys; Translation Catalog updated. |
| **9** | Polish + audit run + closeout | Full `node --test` sweep + full audit harness run; compile findings into `audit-report.md`; triage CRITICAL/HIGH; CLOSEOUT.md; update BACKLOG (close B-022-1 if side-effect of Phase 4 plumbing); flip CLAUDE.md SPECKIT block; final commit. |
| **10** | **USER GATE** — Browser smoke + merge | Manual smoke checklist per `quickstart.md` (8 steps); user merges to `main` after sign-off. |

## Phase 0: Research (this run produces `research.md`)

Phase 0 consolidates 4 research questions before implementation:

1. **R1 — Bug verification trace**: Document the exact pre-fix arithmetic on RR-baseline persona (annualIncome=$150k, taxRate=auto, contrib401k=$8,550 + $2,850, empMatch=$7,200, monthlySavings=$2,000) showing the cash-flow residual computation when `annualSpending = 0` vs the corrected `annualSpending = accumulationSpend = $120,000`. Capture the post-fix year-1 portfolio Book Value as the SC-001 acceptance threshold.

2. **R2 — Caller audit**: Enumerate every `accumulateToFire(...)` call site in both HTMLs + every reference in `calc/*.js` + tests. Confirm the count matches the spec's "4 callers" claim. Document each site's options-bag construction so Phase 4 can verify lockstep.

3. **R3 — Helper-location decision**: Evaluate whether `getAccumulationSpend(inp)` lives as inline JS in both HTMLs (matches `getActiveChartStrategyOptions` precedent) OR as a new `calc/accumulationSpend.js` module. Consider: how does the audit-harness test the helper without DOM? Does it need to mock `getTotalMonthlyExpenses()`? Constitution V (zero-build) prefers inline; Constitution II (pure calc modules) prefers extracted-with-injected-fn.

4. **R4 — Fallback chain design**: When the new options.accumulationSpend is `undefined` (e.g., third-party caller, audit harness with sparse persona record), how should `accumulateToFire` behave? Three options:
   - (a) Hard-fail with `throw new Error('accumulationSpend required')` — forces every caller to update.
   - (b) Soft-fall to `inp.annualSpend` with a `console.warn` — backwards-compat at cost of latent bug if a caller forgets.
   - (c) Soft-fall to `inp.annualSpend → inp.monthlySpend × 12 → $120,000 default` — robust but masks misuse.
   Decision criteria: audit-harness fixture migration cost + latent-bug prevention.

## Phase 1: Design & Contracts

Phase 1 outputs (this run):

1. **`research.md`** — R1 through R4 consolidated with arithmetic traces, caller inventory, location decision, and fallback chain.
2. **`data-model.md`** — `AccumulateToFireOptions.accumulationSpend` schema delta; `getAccumulationSpend(inp)` helper contract; `PerYearAccumulationRow.annualSpending` semantic clarification (now sourced from `accumulationSpend` during accumulation rows); audit-harness persona schema delta (optional `accumulationSpend` field).
3. **`contracts/accumulateToFire-options-bag.contract.md`** — full schema for the v3 → v5 options-bag delta + fallback chain.
4. **`contracts/getAccumulationSpend-helper.contract.md`** — pure helper signature + FR-002a fallback semantics.
5. **`contracts/accumulationSpendConsistency-invariant.md`** — audit-harness invariant family contract.
6. **`quickstart.md`** — manual browser-smoke checklist (≥8 steps including: cold load, Lifecycle chart year-1 sanity check, country-tier swap test, audit-tab inspection, Copy Debug verification, bilingual EN ↔ 中文, console silence, file:// delivery).
7. **CLAUDE.md SPECKIT block** updated to reference this plan file.

## Complexity Tracking

*No constitution violations. No complexity entries.*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_  | _(none)_   | _(none)_                             |
