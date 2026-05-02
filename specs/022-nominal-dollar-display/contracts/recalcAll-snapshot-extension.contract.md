# Contract — `recalcAll()` Snapshot Extension

**Where**: `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html`, inside `recalcAll()` function (line ~12080 RR / ~12490 Generic per feature 021's Frontend Engineer report).
**Constitution**: Principle III (single source of truth), Principle VI (chart ↔ module contracts)

## Purpose

Centralize the real-$ → Book Value conversion at exactly one point per recalc cycle. After this contract is implemented, render functions consume the `<field>BookValue` companion fields directly and never call `displayConverter.toBookValue()` themselves.

This is the structural-robustness property from FR-008d: forgetting to read `bookValue` becomes a visible bug (chart shows today's-$ amounts) rather than a silent frame mismatch.

## Function signature (new helper inside `recalcAll()`)

```js
/**
 * FRAME: conversion (real-$ snapshot → nominal-$ companion fields)
 *
 * Walks the recalc snapshot and adds <field>BookValue companion fields for
 * every $-valued field consumed by an in-scope chart per FR-001 a-n.
 *
 * Mutates `snap` in place; returns nothing (matches existing recalcAll pattern).
 *
 * @param {object} snap     — the recalc snapshot object
 * @param {number} currentAge
 * @param {number} inflationRate
 */
function _extendSnapshotWithBookValues(snap, currentAge, inflationRate) {
  const toBV = (val, age) => displayConverter.toBookValue(val, age, currentAge, inflationRate);

  // === lifecycleProjection.rows[i] ===
  for (const row of (snap.lifecycleProjection?.rows || [])) {
    row.totalBookValue          = toBV(row.total, row.age);
    row.p401kBookValue          = toBV(row.p401k, row.age);
    row.pStocksBookValue        = toBV(row.pStocks, row.age);
    row.pCashBookValue          = toBV(row.pCash, row.age);
    row.pRothBookValue          = toBV(row.pRoth, row.age);
    row.ssIncomeBookValue       = toBV(row.ssIncome, row.age);
    row.withdrawalsBookValue    = toBV(row.withdrawals, row.age);
    row.grossIncomeBookValue    = toBV(row.grossIncome, row.age);
    row.federalTaxBookValue     = toBV(row.federalTax, row.age);
    row.ficaTaxBookValue        = toBV(row.ficaTax, row.age);
    row.annualSpendingBookValue = toBV(row.annualSpending, row.age);
    row.pretax401kEmployeeBookValue = toBV(row.pretax401kEmployee, row.age);
    row.empMatchToTradBookValue = toBV(row.empMatchToTrad, row.age);
    row.stockContributionBookValue = toBV(row.stockContribution, row.age);
    row.cashFlowToCashBookValue = toBV(row.cashFlowToCash, row.age);
    row.syntheticConversionBookValue = toBV(row.syntheticConversion, row.age);
  }

  // === KPI scalars ===
  if (typeof snap.fireNumber === 'number' && typeof snap.fireAge === 'number') {
    snap.fireNumberBookValue = toBV(snap.fireNumber, snap.fireAge);
  }
  if (typeof snap.totalAtFire === 'number' && typeof snap.fireAge === 'number') {
    snap.totalAtFireBookValue = toBV(snap.totalAtFire, snap.fireAge);
  }
  // currentNetWorth: real-$ === nominal-$ at year 0; no companion needed (FR-006).

  // === Side-chart-specific ===
  // Withdrawal Strategy chart (rows[i] indexed by retirement-phase year):
  for (const row of (snap.withdrawalStrategy?.rows || [])) {
    row.wTradBookValue   = toBV(row.wTrad, row.age);
    row.wRothBookValue   = toBV(row.wRoth, row.age);
    row.wStocksBookValue = toBV(row.wStocks, row.age);
    row.wCashBookValue   = toBV(row.wCash, row.age);
  }

  // Drawdown chart:
  for (const row of (snap.drawdown?.rows || [])) {
    row.drawAmountBookValue   = toBV(row.drawAmount, row.age);
    row.runningTotalBookValue = toBV(row.runningTotal, row.age);
  }

  // Roth Ladder chart:
  for (const row of (snap.rothLadder?.rows || [])) {
    row.convertAmountBookValue = toBV(row.convertAmount, row.age);
    row.balanceAfterBookValue  = toBV(row.balanceAfter, row.age);
  }

  // Healthcare delta chart:
  for (const row of (snap.healthcare?.rows || [])) {
    row.premiumBookValue      = toBV(row.premium, row.age);
    row.subsidyDeltaBookValue = toBV(row.subsidyDelta, row.age);
  }

  // Mortgage payoff bar chart:
  for (const row of (snap.mortgage?.rows || [])) {
    row.principalBookValue = toBV(row.principal, row.age);
    row.interestBookValue  = toBV(row.interest, row.age);
    row.totalBookValue     = toBV(row.total, row.age);
  }

  // Payoff vs Invest brokerage trajectory:
  if (snap.pvi) {
    for (const point of (snap.pvi.prepayPath || [])) {
      point.totalBookValue = toBV(point.total, point.age);
    }
    for (const point of (snap.pvi.investPath || [])) {
      point.totalBookValue = toBV(point.total, point.age);
    }
    if (snap.pvi.crossover) {
      snap.pvi.crossover.totalBookValue = toBV(snap.pvi.crossover.total, snap.pvi.crossover.age);
    }
  }

  // Country budget tier comparison (currentAge baseline = today's-$):
  // Tier values are static today's-$ per FR-018; no conversion needed for display
  // at "today" — but for "what does this look like at fireAge" projection,
  // companion fields use fireAge's yearsFromNow:
  if (snap.fireAge != null) {
    for (const scenario of (snap.scenarios || [])) {
      scenario.annualSpendBookValue       = toBV(scenario.annualSpend, snap.fireAge);
      scenario.comfortableSpendBookValue  = toBV(scenario.comfortableSpend, snap.fireAge);
      scenario.normalSpendBookValue       = toBV(scenario.normalSpend, snap.fireAge);
    }
  }

  // === Verdict pill / banner / Income tax row ===
  // (these read directly from rows[0] via existing _renderTaxIncomeRow; just
  //  ensure rows[0] has its companions per the lifecycleProjection block above)
}
```

## Integration point

In both HTMLs' `recalcAll()`, AFTER the existing snapshot is fully assembled and BEFORE any chart rendering:

```js
// FRAME: conversion (real-$ snapshot → nominal-$ companion fields)
_extendSnapshotWithBookValues(snap, currentAge, inflationRate);

// All chart renderers below this line consume *BookValue fields.
_renderLifecycleChart(snap);
_renderWithdrawalStrategyChart(snap);
// ... etc.
```

## Render-function contract (per chart)

Every in-scope chart renderer MUST:

1. Read $-valued data from `<field>BookValue` companion fields, NOT from the underlying `<field>` real-$ fields.
2. Tooltip companion line uses `displayConverter.invertToReal()` IF the renderer needs to show the purchasing-power equivalent — OR more cleanly, the renderer reads BOTH `<field>` AND `<field>BookValue` to display both numbers without re-conversion.
3. Add a renderer-comment annotation:

```js
/*
 * @chart: Lifecycle chart
 * @module: calc/displayConverter.js (toBookValue applied centrally in recalcAll())
 * @reads: snap.lifecycleProjection.rows[i].{totalBookValue, p401kBookValue,
 *         pStocksBookValue, pCashBookValue, pRothBookValue}
 *         + snap.lifecycleProjection.rows[i].{total, ...} for tooltip companion
 *           (purchasing-power line)
 */
```

## Lockstep enforcement

The `_extendSnapshotWithBookValues` function MUST be **byte-identical** between the two HTMLs (sentinel-symbol parity check). Both HTMLs must define the same set of in-scope companion fields per FR-001 a-n.

## Backwards-compat with feature 020/021

Feature 020 + 021 audit dumps (`copyDebugInfo`) read the existing real-$ fields. After feature 022:
- Audit dump gains the `*BookValue` companion fields automatically (since they live on the same row objects).
- Feature 020's `cashFlowConservation` audit invariant continues to use real-$ fields (unchanged).
- Feature 021's `tax-bracket-conservation` invariants (TBC-1 through TBC-5) continue to use real-$ fields (unchanged).

Audit-tab table column labels add the frame indicator per FR-007 (e.g., "Total (Book Value)").
