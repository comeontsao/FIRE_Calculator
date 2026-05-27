# Implementation Plan: Cash-Sweep to Stocks

**Branch**: `030-cash-sweep-stocks` | **Date**: 2026-05-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/030-cash-sweep-stocks/spec.md`

## Summary

User-requested feature (2026-05-11) to optionally sweep excess cash into the stock pool at the end of each simulated year. Closes the unrealistic "$354K cash sitting idle at age 100" pattern visible on the canonical RR Lifecycle chart.

**Locked semantics (from /speckit-clarify session 2026-05-11)**:
- Default OFF (preserves snapshot reproducibility for all existing users)
- Threshold default $10K, real-$ frame, user-adjustable
- **Year-0 starting cash preserved** (no immediate sweep when toggle flipped on)
- **Year-1 onward: standard rule** — at year-end, if `pCash > threshold`, sweep `(pCash − threshold)` into stocks
- One-way only (cash → stocks); no reverse refill
- Applies to BOTH accumulation and retirement phases
- Sweep timing: year-end, AFTER all income/contributions/growth/withdrawals/one-shot events
- Persistence: `localStorage` only; `FIRE-snapshots.csv` schema untouched

**Technical approach**:
1. Add a small, pure helper `_applyCashSweep(pCash, pStocks, threshold, age, currentAge, enabled)` that returns `{pCash, pStocks, swept}` — used by all 6 simulators.
2. Thread the call into each simulator's per-year loop at the canonical "year-end" point (after the existing `pCash *= 1.005` cash-interest compounding line).
3. Add UI controls (toggle + threshold input) in Plan tab → Investment section, mirroring the established `pviCashflowOverrideEnabled` pattern.
4. Thread `cashSweepEnabled` + `cashSweepThreshold` through `getInputs()` and the `localStorage` persistence array.
5. Extend feature 029's `_invariantE` (or add `_invariantF`) — research phase resolves.
6. Lockstep edits to both HTMLs per Constitution Principle I.
7. Tests: structural pins for each simulator's call to `_applyCashSweep`, end-to-end numerical pins on the canonical RR fixture, E2E pin verifying the chart's cash trajectory.

## Technical Context

**Language/Version**: JavaScript ES2017+ (UMD-style classic scripts per Constitution V).
**Primary Dependencies**: Chart.js (CDN, no version change). No new runtime deps.
**Storage**: `localStorage` for the new toggle + threshold values. `FIRE-snapshots.csv` schema unchanged per FR-010.
**Testing**: Node `node:test` for unit tests under `tests/unit/`; Playwright for E2E under `tests/e2e/`.
**Target Platform**: Browser (Chrome / Edge / Firefox) opened via `file://` or HTTP, per Constitution V.
**Project Type**: Single-file HTML dashboards × 2 (`FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`) + `calc/` directory of extracted modules consumed by both.
**Performance Goals**: First meaningful chart < 1 sec cold-load; recalc < 200 ms. New per-year sweep call adds ~1 comparison + 2 assignments per simulated year × ~58 retirement years × 6 simulators × (per-recalc invocation count) ≈ < 1 ms overhead per recalc. Negligible.
**Constraints**: Constitution I lockstep (RR + Generic identical except personal content); Constitution II purity (no DOM access in calc helper); Constitution V no-build delivery; Constitution VIII spending-funded-first unaffected (sweep is upstream of withdrawal-pool order — actually downstream, see research R-3); Constitution IX mode/objective orthogonality preserved.
**Scale/Scope**: Touches 5 simulators in 2 HTMLs (`projectFullLifecycle`, `_simulateStrategyLifetime`, `signedLifecycleEndBalance`, `simulateRetirementOnlySigned`, `computeWithdrawalStrategy`) + `calc/accumulateToFire.js` (1 module) + UI scaffolding (2 new inputs, 4 i18n strings × 2 languages × 2 HTMLs = 16 translation entries) + audit invariant extension/addition + new test files. Estimated diff: ~30 lines per HTML (UI + 5 call sites) + ~5 lines in `calc/accumulateToFire.js` + ~50 lines in `calc/calcAudit.js` + ~60 lines in new `calc/cashSweep.js` + ~500 lines across new test files + ~3 new lines in CLAUDE.md.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Dual-Dashboard Lockstep | PASS (planned) | Every code edit applies byte-identical to both HTMLs. UI labels + translation strings shipped in same change set per Constitution VII. Lockstep diff after fix expected within ±1 line for personal content (FR pattern from features 027/028/029). |
| II. Pure Calculation Modules | PASS | `_applyCashSweep` is a pure function: no DOM, no globals, no side effects. Input → output only. Audit invariant additions follow the same pattern as feature 029's `_invariantE`. |
| III. Single Source of Truth | PASS (strengthens) | The sweep logic is centralized in ONE helper called from all 6 simulators. No risk of one simulator getting different sweep semantics. |
| IV. Gold-Standard Regression Coverage | PASS (planned) | New unit test file pins (a) `_applyCashSweep` helper behavior across edge cases, (b) each of the 6 simulator integration points includes the helper call, (c) RR fixture end-of-life cash matches expected post-sweep value. New E2E pins the chart behavior at year-0 (preserved) and end-of-life (≈ threshold). |
| V. Zero-Build, Zero-Dependency | PASS | No new deps. Helper added to `calc/` directory as a UMD-style classic-script module per existing pattern. |
| VI. Explicit Chart ↔ Module Contracts | PASS (planned) | New `contracts/cash-sweep.contract.md` published in Phase 1 documenting the helper API, simulator-integration call sites, and audit-invariant behavior. |
| VII. Bilingual First-Class | PASS (planned) | 4 new user-visible strings (toggle label, threshold label, threshold help-tip, sweep info-tip) × 2 languages (EN + zh-TW) × 2 HTMLs = 16 new translation entries. All ship in same change set per principle's enforcement rule. |
| VIII. Spending Funded First | PASS (preserves) | Sweep happens at year-END, AFTER `taxOptimizedWithdrawal` runs the spending-floor pass. Funding cannot be optimized away by sweep timing: the floor pass sees the year's pre-sweep pCash, draws what it needs for spending, then sweep operates on whatever excess remains. Constitution review-gate 6 satisfied. |
| IX. Mode / Objective Orthogonality | PASS (preserves) | Sweep is upstream of `getActiveSortKey`. Strategy ranker uses the post-sweep pool state to evaluate strategies; ordering chain stays orthogonal. Constitution review-gate 7 satisfied. |

**Result:** All 9 principles PASS. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/030-cash-sweep-stocks/
├── plan.md                                          # This file
├── spec.md                                          # User-facing spec
├── checklists/requirements.md                       # Quality checklist (passing)
├── research.md                                      # Phase 0 output (this run)
├── data-model.md                                    # Phase 1 output (this run)
├── quickstart.md                                    # Phase 1 output (this run)
├── contracts/
│   └── cash-sweep.contract.md                       # Phase 1 output (this run)
└── tasks.md                                         # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
FIRE_Calculator/                                     # Repo root
├── FIRE-Dashboard.html                              # RR dashboard (CHANGED — UI + 5 simulator call sites + i18n)
├── FIRE-Dashboard-Generic.html                      # Generic dashboard (CHANGED — same as RR)
├── FIRE-Dashboard Translation Catalog.md            # CHANGED — 4 new keys × 2 languages
├── calc/
│   ├── accumulateToFire.js                          # CHANGED — sweep call at line ~711 (the existing `pCash *= 1.005` site)
│   ├── calcAudit.js                                 # CHANGED — extended _invariantE OR new _invariantF
│   ├── cashSweep.js                                 # NEW — _applyCashSweep helper (UMD-style)
│   └── ...
├── tests/
│   ├── unit/
│   │   ├── cashSweepHelper.test.js                  # NEW — pure-function tests for the helper
│   │   ├── cashSweepSimulatorIntegration.test.js    # NEW — structural pins on each simulator's call site
│   │   ├── cashSweepRrFixture.test.js               # NEW — end-of-life pCash + pStocks numerical pins on canonical RR fixture
│   │   └── cashSweepAuditInvariant.test.js          # NEW — invariant fires correctly under planted divergence
│   └── e2e/
│       └── cash-sweep-toggle.spec.ts                # NEW — matrix-driven (RR + Generic × EN + zh-TW × toggle ON/OFF)
└── CLAUDE.md                                        # CHANGED — active feature line update
```

**Structure Decision:** Adds ONE new pure-function module (`calc/cashSweep.js`) plus surgical edits to existing simulators. Matches established patterns from features 014, 028, 029.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| _(none)_ | _(constitution check passed on all 9 principles)_ | _(no violations to justify)_ |
