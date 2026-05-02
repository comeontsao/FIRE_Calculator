# Data Model — Feature 022

## DisplayConverter entity

A pure module exposing the inflation-conversion helpers used at `recalcAll()` time. Lives in `calc/displayConverter.js` as UMD-classic-script.

```
toBookValue(realValue, age, currentAge, inflationRate) → number

  - realValue: number (real-$ value to convert)
  - age: number (the year's age, e.g., 53 for the FIRE-year row)
  - currentAge: number (today's age, used to compute yearsFromNow)
  - inflationRate: number (decimal, e.g., 0.03 for 3%)

  Returns: realValue × (1 + inflationRate)^(age - currentAge)

toBookValueAtYearsFromNow(realValue, yearsFromNow, inflationRate) → number

  - Convenience overload when caller already has yearsFromNow computed.
  - Returns: realValue × (1 + inflationRate)^yearsFromNow

invertToReal(bookValue, age, currentAge, inflationRate) → number

  - Reverse conversion (used in tests + diagnostic only).
  - Returns: bookValue / (1 + inflationRate)^(age - currentAge)
```

**Edge cases handled internally**:
- `inflationRate = 0`: returns `realValue` unchanged.
- `age - currentAge = 0`: returns `realValue` (today's-$ = today's-nominal).
- `age - currentAge < 0` (historical): returns `realValue / (1 + i)^(currentAge - age)` — supports plotting historical data points alongside future projections, though feature 022 doesn't activate this path (FR-001a out-of-scope).
- `realValue` is non-finite: returns 0 (no NaN cascade per Edge Cases section).

## bookValue companion field schema

The `recalcAll()` snapshot extension produces `bookValue` companion fields per FR-008d. Naming convention: `<existingFieldName>BookValue`.

### Per-year accumulation row (`snap.lifecycleProjection.rows[i]`)

Existing real-$ fields (preserved):
```
{
  age, year,
  total, p401k, pStocks, pCash, pRoth,
  ssIncome, withdrawals, syntheticConversion, hasShortfall, phase,
  // v2 cash-flow fields (feature 020):
  grossIncome, federalTax, annualSpending, pretax401kEmployee,
  empMatchToTrad, stockContribution, cashFlowToCash, cashFlowWarning,
  // v3 fields (feature 021):
  ficaTax, federalTaxBreakdown, ficaBreakdown,
}
```

NEW v4 fields (feature 022 bookValue companions):
```
{
  totalBookValue,
  p401kBookValue,
  pStocksBookValue,
  pCashBookValue,
  pRothBookValue,
  ssIncomeBookValue,
  withdrawalsBookValue,
  syntheticConversionBookValue,
  grossIncomeBookValue,
  federalTaxBookValue,
  annualSpendingBookValue,
  pretax401kEmployeeBookValue,
  empMatchToTradBookValue,
  stockContributionBookValue,
  cashFlowToCashBookValue,
  ficaTaxBookValue,
}
```

Note: `age`, `year`, `phase`, `cashFlowWarning`, `hasShortfall` are NOT $-valued — no companion needed. `federalTaxBreakdown` and `ficaBreakdown` are nested objects; their per-component fields gain companions: `federalTaxBreakdown.bracket10BookValue`, etc.

### KPI snapshot fields

```
snap.fireNumber → real-$ scalar; gains snap.fireNumberBookValue
snap.totalAtFire → real-$ scalar; gains snap.totalAtFireBookValue
snap.currentNetWorth → unchanged (year-0 value; real-$ = nominal-$)
snap.percentThere → unchanged (ratio, not $-valued)
snap.yearsToFire → unchanged (age-difference, not $-valued)
```

### Side-chart-specific snapshot fields

Each in-scope side chart (FR-001 a-n) has its data shape catalogued during Phase 5/6 implementation. Naming convention is uniform: append `BookValue` to every $-valued field. Examples:

- Withdrawal Strategy chart: `snap.withdrawalStrategy.rows[i].{wTrad, wRoth, wStocks, wCash}` → companions `wTradBookValue`, etc.
- Drawdown chart: `snap.drawdown.rows[i].{drawAmount, runningTotal}` → companions.
- Roth Ladder chart: `snap.rothLadder.rows[i].{convertAmount, balanceAfter}` → companions.
- Healthcare delta chart: `snap.healthcare.rows[i].{premium, subsidyDelta}` → companions.
- Mortgage payoff bar chart: `snap.mortgage.rows[i].{principal, interest, total}` → companions.
- Payoff vs Invest brokerage trajectory: `snap.pvi.{prepayPath, investPath, crossover}` → companions per series.
- Country budget tier comparison: `snap.scenarios[i].{annualSpend, comfortableSpend, normalSpend}` → companions (note: these are static today's-$ values, so companions inflate by `(1 + i)^yrsToFire`).

## Frame annotation taxonomy (US2)

Four canonical `// FRAME:` categories:

| Category | When to use | Example |
|---|---|---|
| `// FRAME: real-$` | Variables holding today's-purchasing-power values | `const realReturnStocks = inp.returnRate - inp.inflationRate;` |
| `// FRAME: nominal-$` | Variables holding year-of-occurrence (Book Value) dollars | `const grossIncomeNominal = base * Math.pow(1 + raiseRate, t);` |
| `// FRAME: conversion (real → nominal at year N)` | Lines that perform the conversion | `const totalBookValue = total * Math.pow(1 + i, t);` |
| `// FRAME: pure-data (no $ value)` | Non-$-valued variables that just happen to be near $-handling code | `const ageRow = perYearRow.age;` |

Module-level header pattern (in calc-module top-of-file comment block):

```
FRAME (feature 022 / FR-009):
  Dominant frame: <real-$ | nominal-$ | mixed>
  Frame-conversion sites:
    - Line N: <description>
    - Line M: <description>
```

If `Dominant frame: mixed`, the module MUST list every conversion site explicitly. Mixed is allowed for `recalcAll()` and `accumulateToFire.js` (which spans both frames by design); pure modules should be single-frame.

## localStorage schema deltas

NO new keys in this feature unless US7 (display toggle) ships. If US7 ships:

| Key | Type | Default | Purpose |
|---|---|---|---|
| `displayDollarMode` | string `'bookValue'` \| `'purchasingPower'` | `'bookValue'` | US7 OPTIONAL display toggle |

## Snapshot extension function

Conceptual signature (lives in `recalcAll()` body or a sibling helper):

```
extendSnapshotWithBookValues(snap, currentAge, inflationRate) → mutates snap

  For each $-valued field listed above:
    - Compute `<field>BookValue` = displayConverter.toBookValue(value, age, currentAge, inflationRate)
    - Attach to the same parent object as the original field

  Returns nothing (mutation in place; matches existing recalcAll() convention).
```

## Persona matrix (reused unchanged)

The 92-persona matrix from feature 020 is reused unchanged. No new personas added.

## Audit invariant family additions

### `bookValue-conservation` (US1 / FR-008e)

Purpose: ensure every chart-consumed snapshot field has its `bookValue` companion.

Implementation: meta-test `tests/meta/snapshot-frame-coverage.test.js` enumerates an explicit list of chart-consumed snapshot field paths (from FR-001 a-n). For each path, asserts the companion `<path>BookValue` exists and is finite.

### `month-precision-feasibility` (US6 / FR-023)

Purpose: ensure that for personas where the month-precision resolver returns `searchMethod === 'month-precision'`, simulating at the returned `Y + M/12` produces zero `hasShortfall:true` rows.

Implementation: new `tests/unit/validation-audit/month-precision-feasibility.test.js`. Runs across 92-persona matrix. For each persona with month-precision resolution, calls `simulateRetirementOnlySigned` at the fractional age and asserts no row has `hasShortfall === true`.

## Frame coverage meta-test (US2 / FR-011)

`tests/meta/frame-coverage.test.js`:

- Walks every `calc/*.js` file.
- For each line matching the qualifying-token regex (per research R3):
  ```js
  /\b(realReturn|inflationRate|nominalReturn|raiseRate|Math\.pow\s*\(\s*1\s*\+\s*inflationRate)\b/
  ```
- Checks that within 3 lines above, a `// FRAME:` comment appears matching:
  ```js
  /\/\/\s*FRAME:\s*(real|nominal|conversion|pure-data)/
  ```
- Aggregates `qualifying` and `offenders` counts.
- Asserts `offenders.length / qualifying.length <= 0.05` (≥95% coverage).

The 5% slack accommodates:
- Edge cases where the qualifying token appears inside a string literal that's an audit-step description.
- Lines where the comment-of-record lives 4+ lines above (rare but allowed).
