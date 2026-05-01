# Data Model — Feature 021

## TaxBrackets entity

A pure-data structure defining IRS 2024 federal income tax brackets per filing status. Lives in `calc/taxBrackets.js` as a frozen constant block.

```
TaxBracket = {
  rate: number          // e.g., 0.12 for 12%
  upperBound: number    // taxable-income upper bound for this bracket; Infinity for top bracket
}

TaxBracketsTable = {
  filingStatus: 'mfj' | 'single'
  standardDeduction: number    // 2024: 29200 (mfj), 14600 (single)
  brackets: TaxBracket[]       // 7 brackets, ordered ascending by rate
}
```

**MFJ brackets (2024)**:
```js
[
  { rate: 0.10, upperBound: 23200 },
  { rate: 0.12, upperBound: 94300 },
  { rate: 0.22, upperBound: 201050 },
  { rate: 0.24, upperBound: 383900 },
  { rate: 0.32, upperBound: 487450 },
  { rate: 0.35, upperBound: 731200 },
  { rate: 0.37, upperBound: Infinity },
]
```

**Single brackets (2024)**:
```js
[
  { rate: 0.10, upperBound: 11600 },
  { rate: 0.12, upperBound: 47150 },
  { rate: 0.22, upperBound: 100525 },
  { rate: 0.24, upperBound: 191950 },
  { rate: 0.32, upperBound: 243725 },
  { rate: 0.35, upperBound: 609350 },
  { rate: 0.37, upperBound: Infinity },
]
```

## FICA constants

```js
const FICA_SS_RATE = 0.062;
const FICA_SS_WAGE_BASE_2024 = 168600;
const FICA_MEDICARE_RATE = 0.0145;
const FICA_ADDITIONAL_MEDICARE_RATE = 0.009;
const FICA_ADDITIONAL_MEDICARE_THRESHOLD_SINGLE = 200000;
const FICA_ADDITIONAL_MEDICARE_THRESHOLD_MFJ = 250000;
```

## TaxComputationResult (per accumulation year)

Returned by an internal helper inside `calc/accumulateToFire.js`:

```
TaxComputationResult = {
  federalTax: number              // aggregate federal income tax (integer dollars)
  ficaTax: number                 // aggregate FICA (integer dollars)
  federalTaxBreakdown: {
    bracket10: number
    bracket12: number
    bracket22: number
    bracket24: number
    bracket32: number
    bracket35: number
    bracket37: number
    standardDeduction: number     // applied; e.g., 29200 for MFJ
    taxableIncome: number         // grossIncome − pretax401k − stdDed (clamped at 0)
  }
  ficaBreakdown: {
    socialSecurity: number        // SS tax owed
    medicare: number              // base Medicare tax
    additionalMedicare: number    // 0.9% on excess over threshold
    ssWageBaseHit: boolean        // true if any earner hits the wage-base cap
  }
  computedFromBrackets: boolean   // true = progressive path; false = flat-rate override path
}
```

When `computedFromBrackets === false` (flat-rate override active), `ficaTax = 0` and both breakdown objects are `{}` empty (interpretation: user's flat rate already accounts for FICA; we don't synthesize a fake breakdown).

## Per-year accumulation row (extended in feature 021)

Existing fields from feature 020 (`accumulateToFire.js` v2):
```
{
  age, year, total, p401k, pStocks, pCash, pRoth, ssIncome, withdrawals,
  syntheticConversion, hasShortfall, phase,
  // v2 cash-flow fields (feature 020):
  grossIncome, federalTax, annualSpending, pretax401kEmployee,
  empMatchToTrad, stockContribution, cashFlowToCash, cashFlowWarning?
}
```

NEW v3 fields (feature 021):
```
{
  ficaTax,                  // FICA aggregate for the year
  federalTaxBreakdown,      // structured breakdown (see TaxComputationResult above)
  ficaBreakdown,            // structured breakdown (see TaxComputationResult above)
}
```

**Conservation invariant per row** (locked by new `tax-bracket-conservation.test.js`):

```
Σ(federalTaxBreakdown.bracket10..bracket37) === federalTax    // ±$1
ficaBreakdown.socialSecurity + ficaBreakdown.medicare + ficaBreakdown.additionalMedicare === ficaTax    // ±$1
```

When `computedFromBrackets === false`, the conservation check is skipped (breakdown is empty by design; `ficaTax === 0`).

## TaxExpenseRow entity (UI-only)

Represents the new sub-row in the Plan-tab Expenses pill. Not persisted as a calc-engine output — derived live from the accumulation snapshot.

```
TaxExpenseRow = {
  type: 'income' | 'other'
  monthlyAmount: number         // formatted display value; integer dollars
  effectiveRate?: number        // for type='income' only; one decimal place (e.g., 15.8)
  isLocked: boolean             // type='income' = true (read-only); type='other' = false (manual)
  countryNote?: string          // for type='income' AND selectedScenario !== 'us': the scenarios[].taxNote string
  manualValue?: number          // for type='other': user's persisted value; null/undefined = uninitialized = $0
}
```

**Derivation rules**:

- `type='income'`: `monthlyAmount = Math.round((federalTax + ficaTax) / 12)` from the active accumulation snapshot's most-recent year (or year 0 if accumulation hasn't started). `effectiveRate = Math.round((federalTax + ficaTax) / grossIncome × 1000) / 10`.
- `type='other'`: `monthlyAmount = manualValue ?? 0`.

`type='other'` sums into `monthlySpend` via the existing expense-bucket aggregation. `type='income'` does NOT sum into `monthlySpend` (FR-006).

## localStorage schema deltas

NEW keys (feature 021):

| Key | Type | Default | Purpose |
|---|---|---|---|
| `taxRateAutoMode` | boolean (stored as string '1'/'0') | `'1'` if `taxRate` is blank/0; `'0'` otherwise | Tracks the Auto toggle state for the Investment-tab `taxRate` slider |
| `exp_tax_other` | number (stored as string) | `'0'` | Manual value for the Other tax sub-row in the Plan-tab Expenses pill |

**Persistence pattern**: Both keys join the existing `PERSIST_IDS` array in both HTMLs (same pattern as feature 020's `pviCashflowOverrideEnabled` + `pviCashflowOverride`). No manual save/restore code; the existing checkbox-aware loop handles them.

**Migration**: No migration needed. Missing keys default per the table above. Existing users who saved a non-zero `taxRate` in feature 020 will load with `taxRateAutoMode='0'` and see their slider active at the saved value (zero behavior change for existing users).

## Audit-dump (`copyDebugInfo()`) deltas

Feature 020 audit dump shape gains:

```
lifecycleProjection.rows[i].ficaTax                    // NEW: per-year aggregate
lifecycleProjection.rows[i].federalTaxBreakdown        // NEW: per-bracket detail
lifecycleProjection.rows[i].ficaBreakdown              // NEW: SS/Medicare/additional detail

summary.totalFicaTax                                   // NEW: Σ across accumulation
summary.totalFederalTax                                // existing (feature 020); now sums to bracket-conservation locked value
```

The new fields are additive — feature 020 audit consumers (CI workflow, manual debugging) keep working unchanged.

## Persona matrix (reused unchanged)

The 92-persona matrix from feature 020 (`tests/unit/validation-audit/personas.js`) is reused verbatim. No new personas are added in feature 021. The new audit invariant family (`tax-bracket-conservation`) runs across the existing 92 personas using the same `runHarness` driver.

## Strategy ranker state delta

`calc/strategyRanker.js` adds (or thread-through) one new piece of state per ranking call:

```
RankerInput.previousWinnerId?: string  // strategy id from the last ranking call, optional
```

When provided, the ranker applies hysteresis: a new contender must beat `previousWinnerId` by more than ±0.05 years' equivalent score margin. When omitted (e.g., on first ranking call ever), the ranker behaves identically to feature 020 (no hysteresis; absolute winner picks).

The `previousWinnerId` is read from `state._lastStrategyResults?.winnerId` at the call site (no new global; existing dashboard already tracks this).
