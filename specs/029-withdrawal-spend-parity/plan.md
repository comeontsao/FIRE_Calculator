# Implementation Plan: Withdrawal-Simulator Spend Parity

**Branch**: `029-withdrawal-spend-parity` | **Date**: 2026-05-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/029-withdrawal-spend-parity/spec.md`

## Summary

Two parity bugs in the withdrawal-simulator pipeline cause the Withdrawal Strategy chart to under-report annual drawdown during overlay-spend years (kid college, pre-65 healthcare) and cause a 16% `endBalance-mismatch` audit warning that feature 028 partially addressed but did not fully resolve.

**Root cause Bug A (confirmed via direct code inspection):** `_simulateStrategyLifetime` (RR `:11805`, Generic `:12178`) passes `grossSpend: retireSpend` only — missing `hcDelta + collegeCostThisYear + h2Carry`. Result: when a non-default strategy is the active winner, `renderRothLadder` swaps in this simulator's `perYearRows`, and the chart bars display understated drawdowns. The strategy ranker also scores under understated spending.

**Root cause Bug B (preliminary diagnosis):** `signedLifecycleEndBalance` (RR `:8982`) and `simulateRetirementOnlySigned` (RR `:9693`) BOTH already include overlays correctly (verified RR `:9208` and `:9800`). The remaining `endBalance-mismatch` of 16% in the repro is NOT a spend-input bug — it is the documented signed-sim-vs-chart clamp difference: signed sim preserves negative pool balances post-shortfall (feature 015 invariant) while chart sim clamps pools to ≥0. Both sims agree on FEASIBILITY (both A≥0 and B≥0 in the repro), so the warning's `expected: true` flag is correct. Research phase resolves whether the warning should be suppressed when `expected: true`, or if there's an additional trajectory-divergence root cause.

**Technical approach:**
1. Bug A: Replicate `computeWithdrawalStrategy`'s `grossSpend` formula inside `_simulateStrategyLifetime` (two-line change per HTML).
2. Bug B: Research phase (Phase 0) determines whether to (a) suppress the warning when `expected: true`, (b) tighten signed-sim's trajectory to match chart's clamp behavior, or (c) leave as-is and document.
3. Add new `simulator-grossSpend-parity` audit invariant in `calc/calcAudit.js` that pins per-year grossSpend equality across all 3 simulators, preventing regression of Bug A.
4. New unit tests + E2E test pin the fix.

## Technical Context

**Language/Version**: JavaScript ES2017+ (UMD-style classic scripts, no transpile per Constitution V).
**Primary Dependencies**: Chart.js (CDN, no version change). No new runtime deps.
**Storage**: N/A (calc-only change). No `localStorage` keys touched.
**Testing**: Node `node:test` for unit tests under `tests/unit/`; Playwright for E2E under `tests/e2e/`. Both already configured.
**Target Platform**: Browser (Chrome / Edge / Firefox) opened via `file://` or HTTP, per Constitution V file-protocol delivery rule.
**Project Type**: Single-file HTML dashboards × 2 (`FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`) per Constitution I dual-dashboard lockstep + a `calc/` directory of extracted modules consumed by both.
**Performance Goals**: First meaningful chart < 1 second cold-load. Recalc < 200 ms (current ~80 ms). The added overlay-lookup calls per retirement year × 8 strategies = ~464 extra `getHealthcareDeltaAnnual` + `getTotalCollegeCostForYear` calls per recalc; each is O(kids + 1) lookup, negligible.
**Constraints**: Constitution I lockstep (RR + Generic identical except personal content); Constitution II purity (no DOM access in calc); Constitution V no-build delivery; Constitution VIII spending-funded-first floor pass must still apply (no behavior change here); Constitution IX mode/objective orthogonality preserved (this feature does not touch sort-key dispatch).
**Scale/Scope**: Touches 3 simulator call sites (`_simulateStrategyLifetime`, `signedLifecycleEndBalance`, `simulateRetirementOnlySigned`) × 2 HTMLs + 1 new audit invariant in `calc/calcAudit.js` + 3 new unit test files + 1 new E2E spec. Estimated diff: ~30 net lines per HTML + ~80 lines in `calc/calcAudit.js` + ~400 lines across new test files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Dual-Dashboard Lockstep | PASS (planned) | Every code change applies to both HTMLs in the same commit; lockstep diff after fix expected within ±1 line for personal content only (FR-007, SC-029-E). |
| II. Pure Calculation Modules | PASS | New `simulator-grossSpend-parity` audit invariant is pure (no DOM); changes to `_simulateStrategyLifetime` are local to its already-pure closure body. No new DOM access introduced. |
| III. Single Source of Truth for Interactive State | PASS | The fix ELIMINATES a hidden second source of truth for `grossSpend` (currently `retireSpend` only inside one simulator). Post-fix, all three simulators consume the same composed expression. |
| IV. Gold-Standard Regression Coverage | PASS (planned) | FR-009 mandates new unit tests covering (a) grossSpend parity across simulators × 8 strategies, (b) signed-sim end-balance vs chart-sim end-balance ±$1, (c) audit invariant behavior. FR-010 mandates new E2E covering the visible bar correction in both HTMLs × both locales. |
| V. Zero-Build, Zero-Dependency | PASS | No new runtime deps. Audit invariant adds two lookup-function calls per retirement age; both lookups already exist (`getHealthcareDeltaAnnual`, `getTotalCollegeCostForYear`) and are UMD-loadable. |
| VI. Explicit Chart ↔ Module Contracts | PASS (planned) | The audit invariant gets a `contracts/grossSpend-parity.contract.md` entry naming its consumers (the audit panel + the test suite). `renderRothLadder` already has the chart ↔ module comment; no change required there. |
| VII. Bilingual First-Class | PASS | Zero new user-visible strings. The fix changes the NUMBERS on existing bars; no new captions, no new banners. The new audit warning emitted by `simulator-grossSpend-parity` follows the existing `crossValidationWarnings` schema, which is diagnostic-only (Audit panel JSON) — not user-prose. |
| VIII. Spending Funded First | PASS | The fix STRENGTHENS this principle: per-strategy ranker now correctly evaluates strategies against the FULL spending need (including overlays), so any strategy that fails to honor the floor during college years is detected earlier. The spending-floor pass (Step 7.5) inside `taxOptimizedWithdrawal` is untouched. |
| IX. Mode / Objective Orthogonality | PASS | No changes to `getActiveSortKey`, `rankByObjective`, or `scoreAndRank`. The fix is upstream of those (it corrects the per-strategy `endBalance` that feeds the sort). |

**Result:** All 9 principles PASS. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/029-withdrawal-spend-parity/
├── plan.md                                          # This file
├── spec.md                                          # User-facing spec
├── checklists/requirements.md                       # Quality checklist (passing)
├── research.md                                      # Phase 0 output (this run)
├── data-model.md                                    # Phase 1 output (this run)
├── quickstart.md                                    # Phase 1 output (this run)
├── contracts/
│   └── grossSpend-parity.contract.md                # Phase 1 output (this run)
└── tasks.md                                         # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
FIRE_Calculator/                                     # Repo root
├── FIRE-Dashboard.html                              # RR dashboard (CHANGED — both bugs)
├── FIRE-Dashboard-Generic.html                      # Generic dashboard (CHANGED — both bugs)
├── calc/
│   ├── calcAudit.js                                 # CHANGED — new simulator-grossSpend-parity invariant
│   ├── accumulateToFire.js                          # unchanged
│   └── ...
├── tests/
│   ├── unit/
│   │   ├── simulatorGrossSpendParity.test.js        # NEW — per-year parity across 3 sims × 8 strategies
│   │   ├── perStrategyEndBalanceMatchesChart.test.js # NEW — end-balance ±$1 for strategy × mode matrix
│   │   └── grossSpendParityAuditInvariant.test.js   # NEW — audit invariant fires correctly
│   └── e2e/
│       └── withdrawal-bar-college-years.spec.ts     # NEW — bar height includes overlay × both HTMLs × EN+zh-TW
└── CLAUDE.md                                        # Active-feature line updated
```

**Structure Decision:** Single dual-HTML project with shared `calc/` modules and `tests/` suite. Matches the established project shape from features 014–028. No new top-level directories.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| _(none)_ | _(constitution check passed on all 9 principles)_ | _(no complexity violations to justify)_ |
