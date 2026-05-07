# Implementation Plan: Aggressive Bracket-Fill Withdrawal Strategy

**Branch**: `027-aggressive-bracket-fill` | **Date**: 2026-05-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/027-aggressive-bracket-fill/spec.md`

## Summary

Add an "Aggressive Bracket-Fill" strategy variant to the existing strategy registry. The variant fills the FULL 12% bracket headroom each retirement year while `canAccess401k && !ssActive` (no `pTrad/yearsRemaining` smoothing cap), reinvests the after-tax surplus into Taxable stocks via the existing synthetic-conversion mechanic, then reverts to the smoothed cap behavior age 70+ when SS becomes active. Verified head-to-head against the smoothed strategy on SC-026-A: aggressive saves $49K lifetime tax AND adds $502K terminal estate (real-$, ±5%).

**Technical approach.** The cleanest implementation extends the existing `taxOptimizedWithdrawal` function (`FIRE-Dashboard.html:10787-11045`) with a new `options.disableSmoothingCap` flag. When the flag is true AND the year qualifies (canAccess401k, !ssActive), Step 2 skips the `smoothedTarget` cap and uses `min(pTrad − rmd, bracketHeadroom)`. The new strategy entry in the `STRATEGIES` array calls `taxOptimizedWithdrawal` with this flag set per-year. The synthetic-conversion mechanic at Step 8 routes the resulting after-tax Trad surplus into pStocks automatically — no separate reinvestment plumbing needed. Strategy ranker, audit panel, and chart consume the new strategy through the same registry interface they already use for the existing 7 strategies.

## Technical Context

**Language/Version**: JavaScript (browser ES2020 baseline; Node 18+ for tests)
**Primary Dependencies**: Chart.js (CDN, no change). No new runtime deps. No new build step.
**Storage**: N/A. Strategy registry lives inline in HTML; no localStorage schema change.
**Testing**: Existing harness — `node --test` for unit tests under `tests/unit/*.test.js`; Playwright for E2E. New unit test for the aggressive policy + a regression test in `tests/unit/strategyMatrix.test.js`. New Playwright spec for the chart + audit visual delta.
**Target Platform**: Modern desktop browsers (Chrome / Edge / Firefox on Windows + Safari on macOS). `file://` delivery preserved (Constitution V).
**Project Type**: Single-file HTML web app with extracted calc modules. Two parallel HTML deliverables (`FIRE-Dashboard.html` + `FIRE-Dashboard-Generic.html`) per Constitution I.
**Performance Goals**: No regression on existing 1-second first-render or 30 fps drag floor. The new strategy is one additional invocation of `taxOptimizedWithdrawal` per year per strategy-rank — well within budget (the function is O(retirement years) with constant per-year work).
**Constraints**: Zero-build / zero-dependency (Constitution V). UMD-classic-script for any calc module change. EN + zh-TW bilingual lockstep (Constitution VII). RR + Generic lockstep (Constitution I). Spending Funded First (Constitution VIII NON-NEGOTIABLE). Mode/Objective orthogonality (Constitution IX NON-NEGOTIABLE).
**Scale/Scope**: ~7K lines per HTML; the change touches ~40-60 lines of inline `<script>` per HTML + ~8 i18n keys × 2 languages × 2 HTMLs = 32 new translation entries. New unit test ~120 lines. New Playwright spec ~60 lines.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance | Notes |
|-----------|-----------|-------|
| I — Dual-Dashboard Lockstep (NON-NEGOTIABLE) | ✅ | New strategy entry, copy, and tests land in BOTH HTMLs in same commit. FR-021 enforces. |
| II — Pure Calculation Modules with Declared Contracts | ✅ | `taxOptimizedWithdrawal` extension stays pure (single new option flag). New strategy entry's `computePerYearMix(ctx)` is pure (passthrough to `taxOptimizedWithdrawal`). No DOM, no globals introduced. |
| III — Single Source of Truth for Interactive State | ✅ | Strategy ranker continues to use the same `_lastKpiSnapshot` capture path. No new shared-state surfaces. |
| IV — Gold-Standard Regression Coverage (NON-NEGOTIABLE) | ✅ | New strategy added to registry triggers `tests/unit/strategyMatrix.test.js` regression — the matrix's "starvation locus" scenario MUST close shortfall to <$100. New unit test `tests/unit/aggressiveBracketFill.test.js` (FR-018) pins SC-026-A numbers to ±5%. |
| V — Zero-Build, Zero-Dependency Delivery | ✅ | No new deps. `taxOptimizedWithdrawal` extension is inline. Strategy registry edit is inline. UMD-classic-script preserved. file:// delivery preserved. |
| VI — Explicit Chart ↔ Module Contracts | ✅ | The Withdrawal Strategy chart already consumes `WithdrawalTrajectory` rows — agnostic to which strategy produced them. The chart's render function comment names the producer; we update the `Consumers:` comment in any calc module the new strategy touches. |
| VII — Bilingual First-Class — EN + zh-TW (NON-NEGOTIABLE) | ✅ | FR-012 + FR-014 enforce EN + zh-TW translations for strategy name / description / tooltip / narrative in same change set. Translation Catalog entry added. |
| VIII — Spending Funded First (NON-NEGOTIABLE) | ✅ | Aggressive policy modifies Step 2 of `taxOptimizedWithdrawal` (bracket-fill computation) only. Step 7.5 (spending-floor pass) and the `hasShortfall` flag plumbing are unchanged — Constitution VIII contract preserved by construction. FR-005 + FR-018 enforce. |
| IX — Mode and Objective are Orthogonal (NON-NEGOTIABLE) | ✅ | New strategy participates in `getActiveSortKey({mode, objective})` chain via the same registry interface. Tie-breakers unchanged. FR-010 + FR-019 enforce via `tests/unit/modeObjectiveOrthogonality.test.js`. |

**Result: PASS.** No Complexity Tracking entries required.

Re-check after Phase 1 design appended at end of plan.

## Project Structure

### Documentation (this feature)

```text
specs/027-aggressive-bracket-fill/
├── plan.md                                # This file (/speckit-plan output)
├── spec.md                                # Feature spec (/speckit-specify)
├── research.md                            # Phase 0 — naming + sort-key behavior + reinvestment-mechanic
├── data-model.md                          # Phase 1 — registry entry shape + WithdrawalTrajectory annotations
├── quickstart.md                          # Phase 1 — local repro + verification
├── contracts/
│   ├── strategy-registry.contract.md      # New entry's required fields + ranker integration
│   └── per-year-mechanic.contract.md      # The `disableSmoothingCap` option's behavior
├── checklists/
│   └── requirements.md                    # Spec quality checklist (passing)
└── tasks.md                               # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
FIRE-Dashboard.html                         # IN SCOPE
  - taxOptimizedWithdrawal:10787              add `options.disableSmoothingCap` flag
  - Step 2 of taxOptimizedWithdrawal:10817-10842 conditionally skip smoothedTarget cap
  - STRATEGIES array entry near line 11178    add AGGRESSIVE_BRACKET_FILL between
                                                BRACKET_FILL_SMOOTHED and TRAD_FIRST
  - TRANSLATIONS.en + TRANSLATIONS.zh         8 new keys: name, desc, narrative, tooltip,
                                                ×2 (regular + zh) = 16 strings

FIRE-Dashboard-Generic.html                 # IN SCOPE (lockstep — same edits)

calc/                                       # NO new modules. May touch:
  - calc/strategyRanker.js                  read-only — confirms new strategy participates correctly
  - calc/withdrawal.js                      read-only reference; production HTML uses inline
                                              taxOptimizedWithdrawal which extends withdrawal.js'
                                              schema; no module-level edits needed for 027

tests/
├── unit/
│   ├── aggressiveBracketFill.test.js       # NEW — pin SC-026-A target numbers ±5%
│   ├── strategyMatrix.test.js              # MODIFY — add regression case for new strategy
│   ├── modeObjectiveOrthogonality.test.js  # MODIFY — exercise new strategy in sort-key chain
│   ├── strategies.test.js                  # MODIFY — verify registry has 8 entries (was 7)
│   └── (others unchanged)
├── e2e/
│   ├── aggressive-bracket-fill.spec.ts     # NEW — Playwright: load SC-026-A, select strategy,
│                                              verify chart bars + tooltip values + locale switch
│   └── (others unchanged)
└── (no new fixtures; SC-026-A pools come from feature 026's
     tests/diagnostics/sc026a-counterfactual.js — Phase 2 task confirms reuse)

FIRE-Dashboard Translation Catalog.md       # MODIFY — add 4 new keys × 2 languages = 8 entries
                                              for strategy.aggressiveBracketFill.{name,desc,narrative,tooltip}
```

**Structure Decision**: The change is contained to inline `<script>` blocks in both HTMLs + 1 new unit test + 1 new Playwright spec + translation catalog edits. No new top-level directories. No new calc modules. The change is intentionally surgical — extends an existing function with one option, adds one registry entry, ships translations.

## Phase 0: Outline & Research

**Output:** `research.md`

Three research tracks:

### Track A — Naming & user-facing copy

Question: *Is "Aggressive Bracket-Fill" the right name? Does the description convey when to choose it without confusing users about the trade-off?*

Method:
1. Survey the existing 7 strategy names and descriptions for tone / vocabulary parity.
2. Run the proposed copy through the project's "Money Terminology" rule (`CLAUDE.md`): use "lifetime tax / broker dollars / Book Value / purchasing power", avoid "real $", "real money", "real value".
3. Decision options: A "Aggressive Bracket-Fill", B "Front-Loaded Bracket-Fill", C "Full Bracket-Fill", D user-supplied.

Deliverable in `research.md` Section 1: chosen name + rationale + zh-TW translation cross-checked against project's existing zh-TW vocabulary.

### Track B — Strategy ranker behavior in Mode × Objective cells

Question: *In the Mode/Objective orthogonality table (Constitution IX), the cell `(dieWithZero, minimizeTax)` sorts by `cumulativeFederalTax asc`. Aggressive Bracket-Fill produces lower cumulative tax than Smoothed. Does this mean Aggressive ALWAYS wins under DWZ + pay-less-tax? Is that the right outcome?*

Method:
1. Read Constitution IX table: `dieWithZero / minimizeTax`: primary `cumulativeFederalTax asc`, tie-breaker `residualArea desc`, tertiary `strategyId asc`.
2. Check whether Aggressive's larger terminal estate (which DWZ explicitly targets ≈ $0) violates DWZ feasibility:
   - DWZ end-state constraint: `endBalance ≥ 0`. Aggressive produces $1.13M terminal — safely positive.
   - DWZ ranker preference under `minimizeTax`: lowest tax. Aggressive wins.
   - Is there a hidden constraint that should disqualify Aggressive under DWZ? Per Constitution IX: NO. The user explicitly chose "DWZ + minimize tax" — meaning they're OK with NOT draining to zero if it saves tax.
3. Confirm via spec acceptance scenario US2-3.
4. Decision: aggressive participates in ALL six (Mode × Objective) cells without special-casing.

Deliverable in `research.md` Section 2: confirmation that aggressive plays correctly in all 6 sort cells; no Constitution IX amendment needed.

### Track C — Reinvestment plumbing via existing synthetic-conversion mechanic

Question: *The spec calls for "reinvest the after-tax surplus into Taxable stocks". The existing `taxOptimizedWithdrawal` Step 8 (`syntheticConversion`) already routes excess net Trad income into pStocks. Does this mean we get reinvestment for free?*

Method (verified during planning — citations in plan):
1. Step 8 (`FIRE-Dashboard.html:11014-11018`):
   ```js
   const totalTax = taxOwed + ltcgTax;
   const grossReceived = ssIncome + wTrad + wRoth + wStocks + wCash;
   const netReceived = grossReceived - totalTax;
   const syntheticConversion = (netReceived > grossSpend) ? (netReceived - grossSpend) : 0;
   ```
2. Callers add `syntheticConversion` to `pStocks` (`FIRE-Dashboard.html:9170` and `:10549`):
   ```js
   if (mix.syntheticConversion > 0) pStocks += mix.syntheticConversion;
   ```
3. With `disableSmoothingCap: true`, `wTrad` is larger → `grossReceived` is larger → `netReceived − grossSpend > 0` → `syntheticConversion` captures the surplus → caller adds it to `pStocks`.

**Conclusion: zero new plumbing needed.** The aggressive policy's reinvestment is achieved entirely by setting wTrad larger; existing Step 8 + caller wiring handles reinvestment automatically.

Deliverable in `research.md` Section 3: confirmation of zero new code paths needed for reinvestment, with line-number citations.

**Output check:** `research.md` exists, all spec assumptions validated, three Decisions recorded. No new NEEDS-CLARIFICATION markers.

## Phase 1: Design & Contracts

**Prerequisites:** Phase 0 research complete.

### 1. Entity shapes — `data-model.md`

Three entity blocks; all extend existing schemas, no new persistent storage:

- **StrategyRegistryEntry**: existing shape (`id, nameKey, descKey, narrativeKey, color, eligibility, computePerYearMix`). New entry `AGGRESSIVE_BRACKET_FILL` documented inline.
- **PerYearMix (return shape of computePerYearMix)**: existing shape — no new fields. Caveats object gains an `aggressiveActive: boolean` flag for audit observability, set true when Step 2 used the bracket-fill-without-smoothing path.
- **Strategy Ranking row**: existing schema; no new fields. Aggressive populates the same columns.

### 2. Behavior contracts — `contracts/`

Two contracts:

- **`strategy-registry.contract.md`** — defines the new entry's required fields and ranker integration. Restates FR-001 → FR-011 obligations.
- **`per-year-mechanic.contract.md`** — defines `taxOptimizedWithdrawal`'s new `options.disableSmoothingCap` flag:
   - When `true` AND `canAccess401k === true` AND `ssIncome === 0`, Step 2 sets `wTrad = rmd + min(pTrad − rmd, bracketHeadroom)` (no smoothing cap).
   - When `true` AND (`!canAccess401k` OR `ssIncome > 0`), Step 2 reverts to standard smoothed behavior.
   - When `false` or missing, behavior is identical to today (backwards compat).
   - The `caveats.aggressiveActive` flag is set whenever the no-cap path actually runs.

### 3. Quickstart — `quickstart.md`

How to reproduce + verify locally:
- Load SC-026-A fixture in Node via `tests/diagnostics/sc026a-counterfactual.js`.
- Run `node --test tests/unit/aggressiveBracketFill.test.js` — must pass and pin SC-001 numbers within ±5%.
- Open `FIRE-Dashboard.html` in browser, select "Aggressive Bracket-Fill", verify chart shows red+purple Trad bars in 60-69 with ~9% effective tax.
- Run `npx playwright test tests/e2e/aggressive-bracket-fill.spec.ts`.

### 4. Agent context update

Update the SPECKIT block in `CLAUDE.md` to point at `specs/027-aggressive-bracket-fill/plan.md`. 026 moves to predecessor list.

**Output check:** `data-model.md`, `contracts/strategy-registry.contract.md`, `contracts/per-year-mechanic.contract.md`, and `quickstart.md` all exist. `CLAUDE.md` SPECKIT block updated.

## Constitution Re-Check (post-design)

Same PASS as the pre-design check, with two clarifications:

- The `taxOptimizedWithdrawal` extension adds ONE option (`disableSmoothingCap`). When the option is absent or false, the function is byte-identical to today's behavior — preserves backward compatibility for the existing 7 strategies and the chart's default-strategy path (Constitution III).
- The new strategy entry contributes `aggressiveActive: boolean` to the `caveats` object. The audit's flow-diagram step "Strategy Ranking" already lists `subSteps` per Constitution II audit-observability requirement; we add one new sub-step entry "Aggressive policy: full bracket fill (60-ssClaimAge−1)" to the diagram.

## Complexity Tracking

> **No constitution violations identified.** No entries required.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_  | _(n/a)_    | _(n/a)_                              |
