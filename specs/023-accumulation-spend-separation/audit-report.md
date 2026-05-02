# Feature 023 — Audit Report

**Status**: FINAL — Phase 9 closeout 2026-05-02.
**Run date**: 2026-05-02
**Branch**: `023-accumulation-spend-separation`
**Persona matrix**: 92 personas (reused from feature 020)

## Executive summary

The new accumulation-spend separation closes a latent calc-engine bug where pre-FIRE simulation was spending $0/year because `inp.annualSpend` was never assigned on the canonical input object. All four invariant families introduced in feature 022 stay clean (1 LOW pre-existing residual unchanged). Two new invariant families ship with this feature; both report 0 findings on first run.

**SC-001 (year-1 portfolio Δ < $100,000)**: ✓ — RR-baseline traced to ~+$96,851 (vs current +$191,722), 49% reduction.
**SC-002 (cash-flow conservation invariant ±$1)**: ✓ — `v5-spend-8` test verifies on every accumulation row.
**SC-003 (country-tier purity)**: ✓ — `country-tier-isolation.test.js` CTI-1 + CTI-2 green on 92 personas.
**SC-004 (audit findings ≤ feature 022 baseline of 1 LOW)**: ✓ — no new findings introduced.
**SC-005 (FIRE-age stability)**: ✓ — strategy-ranker tests + mode-ordering tests stay green.
**SC-007 (no regressions, Constitution VIII)**: ✓ — `spendingFloorPass.test.js` 7/7 throughout.
**SC-008 (lockstep parity)**: ✓ — sentinel grep confirms `getAccumulationSpend` defined in both HTMLs.

## Totals (post-Phase-9)

| Severity | Findings | Status |
|---:|---:|---|
| CRITICAL | 0 | ✓ |
| HIGH | 0 | ✓ |
| MEDIUM | 0 | ✓ |
| LOW | 1 | UNCHANGED — pre-existing E3 residual `RR-pessimistic-frugal` from feature 022 B-022-1 |
| **TOTAL** | **1** | All triaged |

## Test totals

- **Unit + audit + meta**: **501 tests, 500 pass, 1 intentional skip, 0 fail**.
- Was: 478 pre-feature-023.
- Net new: **+23 tests** (10 helper + 8 v5-spend + 5 audit invariants).
- **Constitution VIII gate** (`spendingFloorPass.test.js`): 7/7 throughout all 9 implementation phases.

## By-invariant detail

### Pre-existing invariant families (feature 020 + 021 + 022)

All run clean post-feature-023:

| Family | Cells | Findings | Status |
|---|---:|---:|---|
| A1 (CRITICAL) — fireAge mode ordering | 92 | 0 | ✓ |
| A2 (HIGH) — per-fireAge feasibility implication | 368 | 0 | ✓ |
| B1 (HIGH) — Safe trajectory + 20% terminal | 92 | 0 | ✓ |
| B2 (MEDIUM) — Exact terminalBuffer | 92 | 0 | ✓ |
| B3 (HIGH) — DWZ strict 0-shortfall + boundary | 92 | 0 | ✓ |
| C1 (HIGH) — Lifecycle ↔ Withdrawal parity | 92 | 0 | ✓ |
| C2 (MEDIUM) — verdict pill ↔ Progress agreement | 92 | 0 | ✓ |
| C3 (HIGH) — endBalance-mismatch warnings | 92 | 0 | ✓ |
| D1 (HIGH) — drag invariants | 92 | 0 | ✓ |
| E1 (MEDIUM) — Safe + Exact monotonic feasibility | 92 | 0 | ✓ |
| E2 (MEDIUM) — DWZ boundary semantics | 92 | 0 | ✓ |
| E3 (LOW) — strategy ranker stability ±0.01yr / ±$1 | 92 | **1** | DEFERRED to B-022-1 (unchanged from feature 022 baseline) |
| TBC-1..TBC-5 — tax-bracket-conservation | 460 | 0 | ✓ |
| MPF-1..MPF-3 — month-precision-feasibility | 276 | 0 | ✓ |

### New invariant families (feature 023)

#### CTI — country-tier-isolation (NEW from US2)

- **Cells**: 92 personas × 1 invariant + 10-persona negative-control = 102 evaluations
- **Findings: 0** ✓
- **Pattern**: `tests/unit/validation-audit/country-tier-isolation.test.js`
- **CTI-1 (HIGH)**: With identical `accumulationSpend`, swapping `selectedScenario` from `taiwan` to `us` produces byte-identical pool trajectories (within ±$0.01) across all 92 personas. Confirms the calc engine's spending input is exclusively `options.accumulationSpend`.
- **CTI-2 (LOW, negative-control)**: Verifies that swapping `accumulationSpend` ($50k → $150k) DOES change pCash trajectories — guards against future drift where the field stops being consumed.

#### AS — accumulation-spend-consistency (NEW from US5 / FR-014)

- **Cells**: 92 personas × 3 invariants = 276 evaluations
- **Findings: 0** ✓
- **Pattern**: `tests/unit/validation-audit/accumulation-spend-consistency.test.js`
- **AS-1 (HIGH)**: Per-persona accumulation rows have consistent `annualSpending` (within ±$0.01).
- **AS-2 (MEDIUM)**: Every row's `spendSource === 'options.accumulationSpend'` (preferred path; never falls through to v3 backwards-compat).
- **AS-3 (LOW)**: Explicit `options.accumulationSpend = 0` is honored as a valid value (NOT coerced to MISSING fallback).

## What changed in this branch

### Calc layer

- `calc/accumulateToFire.js` bumped v3 → v5 (v4 was reserved for the feature-022 internal frame fix). New `options.accumulationSpend` field with 4-tier soft-fall: `options.accumulationSpend → inp.annualSpend → inp.monthlySpend × 12 → 0` (with `cashFlowWarning='MISSING_SPEND'` on final tier). New per-row `spendSource` diagnostic identifies which tier produced the row's `annualSpending` value.
- Module-header docblock updated. `// FRAME: real-$` annotation on the spend-resolution site.

### Display layer

- Both HTMLs gain inline helper `getAccumulationSpend(inp)` near `getTotalMonthlyExpenses()` (RR line 7604, Generic line 7963). Body byte-identical per Principle I lockstep.
- `resolveAccumulationOptions` extended in both HTMLs to thread `accumulationSpend: getAccumulationSpend(inp)`.
- Caller #6 (cashflow-warning-pill, RR line 15362, Generic line 15779) refactored from `accumulateToFire(inp, fireAge, {})` to use `resolveAccumulationOptions(...)`.
- `copyDebugInfo()` extended to expose top-level `accumulationSpend` + `accumulationSpend_source` fields.
- Plan-tab Expenses pill caption added below the table in both HTMLs (3 new bilingual translation keys).

### Audit infrastructure

- 2 new audit invariant families (`country-tier-isolation`, `accumulation-spend-consistency`) running across persona matrix.
- Existing harness `resolveAccumulationOptions` stub extended to thread `accumulationSpend` per persona record (data-model.md Entity 4).
- Existing 14 invariant families stay clean post-feature-023.

### Documentation

- `specs/023-accumulation-spend-separation/audit-report.md` — this file.
- `specs/023-accumulation-spend-separation/CLOSEOUT.md` — phase summary + commits.
- `BACKLOG.md` — feature 023 marked done in changelog; B-022-1 unchanged (independent issue).
- `FIRE-Dashboard Translation Catalog.md` — 3 new bilingual keys.
- `CLAUDE.md` SPECKIT block flipped to "AWAITING USER BROWSER-SMOKE".

## Backlog handoff (feature 024 or later)

### B-022-1 — UNCHANGED (carried forward from feature 022)

The `_chartFeasibility` simulator-discreteness fix that produces 1 LOW E3 finding on `RR-pessimistic-frugal` is independent of feature 023's accumulation-spend plumbing. It was hypothetically fixable as a side-effect of consistent options-bag plumbing, but the underlying issue is in `_chartFeasibility`'s call to `projectFullLifecycle` with non-quantized inputs — orthogonal to spending. Estimated ~30 min when next prioritized.

### B-022-2 — UNCHANGED (carried forward)

`scenario.tax.china` duplicate-key cleanup — pre-existing, ~5 min trivial fix.

### B-022-3 — UNCHANGED (carried forward)

Healthcare delta chart frame review — user-decision needed.

### B-023-1 — Plan-tab caption visibility audit (LOW)

The new caption "Current spending (US household, today's dollars)" is rendered with `font-size:12px;opacity:0.75` below the Expenses pill. Verify in browser smoke (Phase 10) that it's readable in both light and dark themes; adjust opacity if too faint. Estimated ~5 min.

## Phase 9 work products

- New audit invariant family file: `tests/unit/validation-audit/country-tier-isolation.test.js` (2 invariants, 102 evaluations, 0 findings).
- New audit invariant family file: `tests/unit/validation-audit/accumulation-spend-consistency.test.js` (3 invariants, 276 evaluations, 0 findings).
- New helper test file: `tests/unit/getAccumulationSpend.test.js` (10 cases, all pass).
- Extended unit test file: `tests/unit/accumulateToFire.test.js` (+8 v5-spend cases).
- Full test gate at closeout: **501 tests, 500 pass, 1 intentional skip, 0 fail** (was 478 pre-feature-023; +23 net new tests).
- Constitution VIII gate (`spendingFloorPass.test.js`): **7/7 green** throughout all 9 implementation phases.

---
