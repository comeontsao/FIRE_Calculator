# Data Model: Math-Assumptions Cleanup (033)

**Date**: 2026-06-05 · **Sources**: spec.md (FR-001…FR-013), research.md (D1–D8)

## 1. Assumptions registry (`calc/assumptions.js`)

One module, two exports, no state.

| Export | Type | Value / Signature | Frame |
|---|---|---|---|
| `CASH_REAL_RETURN` | number | `0.0` (clarification Q1) | today's-$ — the rate at which an undisturbed cash pool's purchasing power changes per simulated year |
| `realRate` | function | `realRate(nominal, inflation) → (1 + nominal) / (1 + inflation) − 1` | converts a statement-dollar (nominal) rate to a purchasing-power (real) rate via the Fisher relation |

**Validation rules**
- `CASH_REAL_RETURN` MUST be a finite number in [−0.05, 0.05]; the module throws at load if not (fail-fast, since every simulator depends on it).
- `realRate` MUST return a finite number for `inflation > −1`; inputs are plain decimal rates (0.07 = 7%), matching every existing rate field.

**Identities locked by unit test**
- `realRate(x, 0) === x`
- `realRate(x, x) === 0` (SS-COLA default → exactly 0, byte-identical to today)
- `realRate(0.07, 0.04) ≈ 0.028846…` (the spec's canonical example)
- `CASH_REAL_RETURN === 0` ⇒ undisturbed `pCash` is constant across N simulated years

## 2. Per-year funding record (accumulation row, v7 — extends feature 032's v6)

Append-only row-shape bump on `accumulateToFire` per-year rows (and the inline
HTML simulators' mirrored rows where they carry cash-flow fields).

| Field | v | Type | Semantics |
|---|---|---|---|
| `stockContribution` | v2 (unchanged) | number | PLANNED discretionary brokerage contribution — keeps v2 meaning per the sibling-field lesson |
| `cashFlowToCash` | v2 (unchanged ≥ 0) | number | residual deposited to cash; `0` in shortfall years (the draw is recorded separately, never as negative inflow) |
| `cashFlowWarning` | v2 extended | `'NEGATIVE_RESIDUAL' \| 'MISSING_SPEND' \| 'CONTRIBUTION_REDUCED' \| undefined` | `NEGATIVE_RESIDUAL` now means "unfunded remainder > 0 after the full ladder" (genuine infeasibility); `CONTRIBUTION_REDUCED` is NEW — informational, the ladder funded the year |
| `stockContributionActual` | **v7 NEW** | number | what was actually contributed after any ladder reduction; `=== stockContribution` in surplus years |
| `fundedFromCash` | **v7 NEW** | number ≥ 0 | shortfall amount drawn from the cash pool this year |
| `fundedFromStocks` | **v7 NEW** | number ≥ 0 | shortfall amount drawn from the brokerage pool this year (face value — D4) |

**State transitions (per year, override OFF)** — see research D3 for the exact
ladder. Invariants:

- I1: `0 ≤ stockContributionActual ≤ stockContribution`
- I2: `fundedFromCash > 0 ⇒ stockContributionActual === 0`
- I3: `fundedFromStocks > 0 ⇒ fundedFromCash === pCash_before` (cash exhausted first)
- I4: `cashFlowWarning === 'NEGATIVE_RESIDUAL' ⇒` unfunded remainder > 0 after all three rungs
- I5: surplus years are byte-identical to v6 rows (new fields present but `actual === planned`, draws `0`)
- I6 (conservation, per year): `grossIncome − federalTax − ficaTax − annualSpending − pretax401kEmployee − stockContributionActual − cashFlowToCash + fundedFromCash + fundedFromStocks === unfunded` (0 for every non-`NEGATIVE_RESIDUAL` year)

**Cash-flow override interaction**: when `pviCashflowOverrideEnabled` is ON the
ladder MUST NOT activate (the override bypasses the computed residual entirely
— spec edge case).

## 3. Conservation block (audit `lifecycleProjection.cashFlowConservation`, v4)

Append-only extension of the feature-021 v3 block:

| Field | v | Semantics |
|---|---|---|
| `grossSum, taxSum, ficaSum, spendSum, contribSum, cashSum` | v3 (unchanged) | as today |
| `stockSum` | v3, **source changes** | now sums `stockContributionActual` (was planned) — the block reports actual flows |
| `stockPlannedSum` | **v4 NEW** | sum of planned contributions, so the audit can display "planned vs actual" |
| `fundedFromCashSum`, `fundedFromStocksSum` | **v4 NEW** | ladder draw totals |
| `unfundedSum` | **v4 NEW** | total still-unfunded remainder (> 0 only on genuinely infeasible accumulation plans) |
| `residual` | v3, formula extended | `grossSum − taxSum − ficaSum − spendSum − contribSum − stockSum − cashSum + fundedFromCashSum + fundedFromStocksSum` — MUST equal `unfundedSum` (≈ $0 on feasible plans; SC-001) |

## 4. Audit flow-diagram observability (Principle II.4)

The Accumulation stage's `subSteps` array gains one entry:
`"shortfall funding ladder (cut stock contribution → draw cash → draw brokerage)"`.

## 5. User-visible strings (Principle VII)

| Key | EN | zh-TW |
|---|---|---|
| `audit.flag.contributionReduced` | "Contribution reduced to fund spending" | 「為支應開銷而調降投資供款」 |
| (tooltip, if surfaced) `audit.tip.fundingLadder` | "This year's income couldn't cover spending plus planned contributions. The plan cuts the brokerage contribution first, then draws from cash." | 「該年度收入不足以支應開銷與預定供款。計畫會先調降證券投資供款,再動用現金。」 |

Both keys land in the `TRANSLATIONS.en` / `TRANSLATIONS.zh` dicts of BOTH HTML
files plus `FIRE-Dashboard Translation Catalog.md` in the same commit.
