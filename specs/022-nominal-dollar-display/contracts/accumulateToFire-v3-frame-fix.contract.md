# Contract — `calc/accumulateToFire.js` v3 Frame Fix (US3)

**Module**: `calc/accumulateToFire.js` (modified in feature 022)
**Predecessor contract**: `specs/021-tax-category-and-audit-cleanup/contracts/accumulateToFire-v3.contract.md`
**Constitution**: Principles I, II, IV, V, VIII

## Purpose

Fix the hybrid-frame bug in the v3 cash-flow residual line so that the residual is computed in a single frame (real-$) rather than mixing nominal income/spending with real-$ contributions. Per spec FR-012 through FR-016 + research R4.

## Function signature unchanged

```
accumulateToFire(inp, fireAge, options) → AccumulationResult
```

The function signature is identical to feature 021 v3. The only changes are inside the per-year loop body.

## Pre-fix code (feature 021 v3, lines 530-570 in calc/accumulateToFire.js)

```js
// FRAME: nominal-$ — income inflated by raiseRate
const grossIncome = annualIncomeBase * Math.pow(1 + raiseRate, yearsFromNow);

// Tax computed on NOMINAL income with FIXED 2024 brackets — produces
// "synthetic bracket creep" (real-tax burden grows over time even at constant
// real income).
const taxResult = _computeYearTax(grossIncome, pretax401kEmployee, inp);
const federalTax = taxResult.federalTax;
const ficaTax = taxResult.ficaTax;

// FRAME: nominal-$ — spending inflated by inflationRate
const annualSpending = baseAnnualSpend * Math.pow(1 + inflationRate, yearsFromNow);

// Cash-flow residual MIXES FRAMES:
const residual = grossIncome - federalTax - ficaTax - pretax401kEmployee
                 - annualSpending - stockContribution;
//   ^nominal-$  ^nominal-$    ^nominal-$  ^real-$              ^nominal-$  ^real-$

// Then assigned to pCash which grew at realReturn (real-$ frame):
pCash = pCash * (1 + realReturnCash) + residual;
```

## Post-fix code

```js
// FRAME: real-$ — income converted from nominal to real before residual.
// raiseRate − inflationRate is the real wage-growth rate. If user's salary
// just keeps pace with inflation (raiseRate === inflationRate), realIncome
// stays constant in today's-$ terms.
const grossIncomeReal = annualIncomeBase
  * Math.pow(1 + raiseRate - inflationRate, yearsFromNow);

// FRAME: real-$ — spending stays constant in today's-$ terms.
// (User-set monthly spend is in today's $ via the slider; no inflation pow needed.)
const annualSpendingReal = baseAnnualSpend;

// FRAME: real-$ — federal tax computed on real income.
// 2024 IRS brackets / SSA wage base treated as today's-$ values per spec
// FR-015. Real-world brackets DO inflation-index in lockstep with wages,
// so this is closer to truth than the pre-fix's "fixed 2024 brackets applied
// to inflated income" path.
const taxResult = _computeYearTax(grossIncomeReal, pretax401kEmployee, inp);
const federalTax = taxResult.federalTax;
const ficaTax = taxResult.ficaTax;

// FRAME: real-$ — cash-flow residual single-frame.
const residual = grossIncomeReal - federalTax - ficaTax - pretax401kEmployee
                 - annualSpendingReal - stockContribution;

// FRAME: real-$ — pool growth + real-$ residual.
pCash = pCash * (1 + realReturnCash) + residual;
```

## Per-year row v4 shape (incremental from feature 021 v3)

Existing v3 fields (unchanged in shape; values may shift due to real-frame computation):
```
{
  age, year, total, p401k, pStocks, pCash, pRoth,
  grossIncome,         // NOW: real-$ (was nominal-$)
  federalTax,          // NOW: real-$ tax on real income
  ficaTax,             // NOW: real-$ FICA on real income
  annualSpending,      // NOW: real-$ constant (was nominal-$ inflated)
  pretax401kEmployee,  // unchanged: real-$ constant
  empMatchToTrad,      // unchanged
  stockContribution,   // unchanged: real-$ constant
  cashFlowToCash,      // NOW: real-$ single-frame residual
  cashFlowWarning,
  federalTaxBreakdown, // values match new real-frame federalTax sum
  ficaBreakdown,       // values match new real-frame ficaTax sum
}
```

NEW in feature 022 (set by `_extendSnapshotWithBookValues` in `recalcAll()`):
```
{
  ...
  grossIncomeBookValue,
  federalTaxBookValue,
  ficaTaxBookValue,
  annualSpendingBookValue,
  pretax401kEmployeeBookValue,
  stockContributionBookValue,
  cashFlowToCashBookValue,
  // ... etc per data-model.md
}
```

## Backwards compatibility

When `inp.taxRate > 0` (flat-rate override path), the calc uses real-$ income (post-fix) but applies the flat rate. This produces a slightly different `federalTax` than feature 021 v3 (which applied flat rate to nominal income). Existing fixtures with pinned `federalTax` values get `// 022:` annotations per FR-017.

For the `inp.taxRate = 0` (auto-bracket) path, all v3-TX-* tests from feature 021 will see shifted values because the input to `_computeYearTax` is now real income instead of nominal. The shifts are bounded — at typical raiseRate ≈ inflationRate (3% each), `grossIncomeReal ≈ grossIncomeNominal` and the shift is < 1%. At divergent raise/inflation rates (e.g., 5% raise vs 3% inflation), shifts grow up to ~20% by year 11.

Test annotation strategy:
- For tests where `raiseRate` is unset (defaults to 0): nominal pow becomes 1, shift is zero — tests stay green automatically.
- For tests with explicit `raiseRate`: update with `// 022:` documenting the real-frame shift.
- Estimated affected tests: 5–10 in `tests/unit/accumulateToFire.test.js`. Budget ~30 min per test for the annotation work per FR-017.

## Conservation invariants (locked by tests)

For every accumulation row:

1. **TBC-1 through TBC-5** (feature 021 audit invariants): unchanged in shape. Values shift to match new real-frame computation.
2. **NEW: cashFlowConservation invariant** (feature 020's invariant, now well-defined):
   ```
   Σ(grossIncome) − Σ(federalTax) − Σ(ficaTax) − Σ(annualSpending)
     − Σ(pretax401kEmployee) − Σ(stockContribution) === Σ(cashFlowToCash)
   ```
   Within ±$1 per non-clamped year. All fields in real-$ frame; conservation is exact (no frame-mismatch slop).

## Test plan

New test cases in `tests/unit/accumulateToFire.test.js`:

```
v4-FRAME-01: real-frame residual conservation — RR-baseline, 11-year horizon
v4-FRAME-02: raiseRate === inflationRate → grossIncomeReal stays constant
v4-FRAME-03: raiseRate > inflationRate → grossIncomeReal grows at delta
v4-FRAME-04: raiseRate < inflationRate (real wage cut) → grossIncomeReal shrinks
v4-FRAME-05: backwards-compat with flat-rate override (taxRate > 0)
v4-FRAME-06: feature 020 cashFlowConservation invariant green post-fix
v4-FRAME-07: feature 021 TBC-* invariants green post-fix
v4-FRAME-08: ficaBreakdown.ssWageBaseHit triggers correctly with real income
```

8 new tests. Combined with the ~5-10 fixture annotations, US3 budget is roughly 1 day of agent work (matches Phase 4 in the plan).
