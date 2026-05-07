# Contract — Withdrawal-Strategy Counterfactual Research (US2)

**Scope:** the structure and acceptance rules for the research deliverable in `research.md` Section 2.

**Anchored to:** spec FR-006, FR-007, FR-008, FR-009; SC-026-A, SC-004, SC-005.

This is a **research contract**, not a runtime contract. There is no module that implements it; the deliverable is a written report backed by deterministic numbers from an existing fixture.

---

## Inputs

- Frozen fixture **SC-026-A** at `tests/fixtures/sc026a-counterfactual.js`.
- Existing calc layer: `calc/withdrawal.js`, `calc/simulateLifecycle.js`, `calc/strategyRanker.js`, `calc/tax.js`, `calc/healthcare.js`. No modifications in 026.
- Existing year-by-year `WithdrawalTrajectory[]` shape (data-model.md §2).

## Required output sections (FR-006)

`research.md` Section 2 MUST include all six:

1. **Fixture summary** — exact SC-026-A inputs.
2. **Current "leave-more-behind" trajectory** — per-year table at 5% real return.
3. **"10%-bracket-smoothed" counterfactual trajectory** — per-year table at 5% real return.
4. **Delta tables** — lifetime tax, terminal Book Value, terminal purchasing power.
5. **Sensitivity sweep** — same deltas at 3% / 5% / 7% real return.
6. **Recommendation block** — `keep` / `change-spec-NNN` / `defer-with-reason`.

## Counterfactual policy definition

The "10%-bracket-smoothed" counterfactual is defined as follows:

```text
For each year y in [60, 68]:
  let topOf10pct = top-of-10%-bracket-MFJ for filing year y
                   minus this year's other ordinary income (SS taxable portion, etc.)
  let headroom = max(0, topOf10pct - currentTradDraw_y)
  if headroom > 0 AND pTrad_y - currentTradDraw_y >= headroom:
    extra_y = headroom
    counterfactualTradDraw_y = currentTradDraw_y + extra_y
    afterTaxResidual_y = extra_y * (1 - 0.10)         // approximate; exact via tax.js
    reinvest afterTaxResidual_y into pStocks at end of year y
  else:
    no change at year y

Years outside [60, 68]: unchanged from current "leave-more-behind" sequencer.
After year 68: re-run simulator with the higher pStocks balance carried forward;
              the late-stage Trad-401k cliff at age 69 should reduce.
```

Spending floor (Constitution VIII) MUST be re-checked at every year. Counterfactual that produces `hasShortfall === true` for any year is discarded as infeasible.

## Constraint checks (FR-007) — required audit table

| Constraint | Where checked | Counterfactual breach? |
|-----------|---------------|------------------------|
| IRMAA Tier 1 | `tax.irmaaTier1Threshold` from `calc/tax.js` | _audit per year, especially 63–68_ |
| IRMAA Tier 2+ | `calc/tax.js` higher tiers | _audit per year_ |
| ACA-PTC cliff (200% / 400% FPL) | `calc/healthcare.js`, only ages < 65 — not applicable to [60, 68] window for years where age ≥ 65, but is relevant 60–64 | _audit ages 60–64 specifically_ |
| AMT | `calc/tax.js` AMT calc | _audit per year_ |
| Surviving-spouse single-filer brackets | Project past first-death assumption | _audit post-survivor years_ |
| Spending floor (Constitution VIII) | Year-by-year `hasShortfall` flag | _MUST be false everywhere_ |

## Recommendation schema (FR-008, FR-009; SC-005)

The recommendation MUST be exactly one of:

### Option 1 — `keep`

The current "leave-more-behind" logic is correct. The report MUST name explicitly:

- The dominant constraint or compounding mechanism that justifies the apparent cliff (e.g., "RMD at 73 forces a Trad spike anyway; smoothing earlier doesn't reduce lifetime tax because RMD still produces the same late-stage ordinary income").
- The numeric trade-off at 5% real return: how much lifetime tax the counterfactual saves (or costs), and why that's outweighed.
- Sensitivity: at what real-return assumption the trade-off would flip (if any).

Hand-wave reasoning is not acceptable. The report must satisfy a critical reader who is willing to accept "keep" only with a quantitative argument.

### Option 2 — `change-spec-NNN`

A new spec is opened for the algorithm change. The report MUST include:

- The proposed contract diff to `calc/withdrawal.js` or `calc/strategyRanker.js` (named module, named inputs, named outputs, named consumers per Constitution II + VI).
- The lifetime-tax delta at SC-026-A 5% real ≥ $5K nominal (per SC-005) — otherwise the change isn't worth the disruption.
- A new acceptance test scoped to the change.
- A note that the actual implementation lands in the new spec (e.g., `specs/027-withdrawal-bracket-fill-smoothing/`), not in 026.

### Option 3 — `defer-with-reason`

Reasonable when the data is inconclusive (e.g., counterfactual better at 7% real, worse at 3% real, breaks even at 5% — close enough that the user wants more time / more fixtures before deciding). The report MUST include:

- The specific data point that's inconclusive.
- What additional fixtures or sensitivity analyses would resolve it.
- A target date / spec for revisiting.

## Acceptance test

The `research.md` Section 2 deliverable PASSES this contract when:

- All six required sections are populated with non-placeholder content.
- The recommendation is one of the three named options.
- If the recommendation is `change-spec-NNN`, the lifetime-tax delta at 5% real is ≥ $5K nominal (SC-005).
- The constraint-breach audit table has a row for every constraint listed above with an explicit yes/no per year (or per range).
- All numbers are reproducible from `tests/fixtures/sc026a-counterfactual.js` running against the live calc layer.

## What this contract is NOT

- It is NOT a runtime calc-module contract. No `calc/` module implements it.
- It does NOT mandate any algorithm change in 026. The change, if any, lands in a follow-up spec.
- It does NOT require new tests in `tests/unit/` unless the recommendation is `change-spec-NNN` AND the new spec is opened in the same change set.
