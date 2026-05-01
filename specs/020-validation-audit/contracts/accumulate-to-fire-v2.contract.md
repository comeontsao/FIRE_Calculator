# Contract — `accumulateToFire` v2 (cash-flow rewrite)

**Module**: `calc/accumulateToFire.js`
**Status**: v2 supersedes v1 (feature 019). Same module, extended.
**Constitution**: Principle II (Pure Calculation Modules) — module remains pure.

## Function signature

```
accumulateToFire(inp, fireAge, options) → AccumResult

AccumResult = {
  end: { pTrad, pRoth, pStocks, pCash },
  perYearRows: AccumRow[],
}

AccumRow = {
  // v1 fields (unchanged)
  age, pTrad, pRoth, pStocks, pCash,
  mtgPurchasedThisYear, h2PurchasedThisYear, lumpSumDrainThisYear,

  // v2 fields (NEW)
  grossIncome,             // gross salary that year (real terms = nominal/inflationFactor)
  federalTax,              // federal tax withheld that year
  annualSpending,          // inflation-adjusted spending
  pretax401kEmployee,      // contrib401kTrad + contrib401kRoth (employee portion)
  empMatchToTrad,          // employer match (non-cash inflow, separate from gross)
  stockContribution,       // monthlySavings × 12, OR override if pviCashflowOverrideEnabled
  cashFlowToCash,          // residual into cash (clamped at 0)
  cashFlowWarning,         // 'NEGATIVE_RESIDUAL' if pre-clamp residual < 0; otherwise undefined
}
```

## Per-year cash-flow algorithm

For each accumulation year `y` from `currentAge` to `fireAge - 1`:

1. **Gross income**: `grossIncome = annualIncome × (1 + raiseRate)^(y - currentAge)` — real-terms.
2. **Pre-tax 401k (employee)**: `pretax401kEmployee = contrib401kTrad + contrib401kRoth` (in nominal annual dollars; assume same nominal each year unless raised by raiseRate — research R3 confirms).
3. **Federal tax**: `federalTax = (grossIncome − pretax401kEmployee) × taxRate` per Phase 0 Research R1 result. (If R1 chooses simplified `grossIncome × taxRate`, document deviation in this contract on amendment.)
4. **Annual spending**: `annualSpending = baseAnnualSpend × (1 + inflationRate)^(y - currentAge)` — inflation-adjusted.
5. **Stock contribution**: `stockContribution = (monthlySavings || 0) × 12` UNLESS `pviCashflowOverrideEnabled`, in which case the override is interpreted differently (see FR-015.5).
6. **Cash flow residual (signed)**: `residual = grossIncome − federalTax − pretax401kEmployee − annualSpending − stockContribution`.
7. **Cash flow to cash (clamped)**: `cashFlowToCash = max(0, residual)`. If `residual < 0`, set `cashFlowWarning = 'NEGATIVE_RESIDUAL'`.
8. **Pool updates** (after the year's cash flow is computed):
   - `pTrad += contrib401kTrad + empMatch` (employer match flows here, not into the cash-flow conservation).
   - `pRoth += contrib401kRoth`.
   - `pStocks += stockContribution`.
   - `pCash += cashFlowToCash`.
9. **Pool growth** (real return for trad/roth/stocks; nominal 0.5% for cash):
   - `pTrad *= (1 + realReturn401k)`.
   - `pRoth *= (1 + realReturn401k)`.
   - `pStocks *= (1 + realReturnStocks)`.
   - `pCash *= 1.005`.

## Conservation invariants (Phase 2 unit tests assert these)

For any persona where `cashFlowWarning` is never set (positive residual every year):

```
Σ(grossIncome) - Σ(federalTax) - Σ(annualSpending) - Σ(pretax401kEmployee) - Σ(stockContribution)
  ≡
Σ(cashFlowToCash)
```

Across all accumulation years. Equality holds because no residual was clamped.

For personas where `cashFlowWarning` IS set in some years:

```
Σ(grossIncome) - Σ(federalTax) - Σ(annualSpending) - Σ(pretax401kEmployee) - Σ(stockContribution)
  ≤
Σ(cashFlowToCash)        // strict inequality whenever any residual was clamped
```

Equivalently: clamping NEVER inflates the cash pool; it only suppresses negative inflows.

## Pool-update conservation

For any persona, the increase in pTrad over the accumulation period MUST equal:

```
ΔpTrad ≡ Σ(contrib401kTrad + empMatch) + Σ(growth_on_pTrad)
```

Where `growth_on_pTrad = pTrad_pre × realReturn401k` for each year. Similar for pRoth, pStocks, pCash.

## Edge cases

1. **Negative residual every year**: cash pool stays flat. Warning emitted every year. The persona is stress-test material.
2. **Zero income** (retired persona, fireAge ≤ currentAge): no accumulation loop runs. `perYearRows` is empty. `accumResult.end` mirrors initial pools.
3. **Override active** (`pviCashflowOverrideEnabled === true`): `stockContribution` is computed FROM the override rather than from monthlySavings. The override value represents annual cash flow to cash, NOT annual stock contribution. Resolved in Phase 5.
4. **Single-person Generic mode** (`adultCount === 1`): `person2Stocks` is ignored as in v1 (FR-019 INV-09 from feature 019). Cash-flow accounting uses `person1` income only — no spousal income (out of scope).
5. **Buy-in event year**: cash-flow accounting runs FIRST, then mortgage/Home #2 buy-in is deducted FROM the accumulated pCash + pStocks. Order: cash flow into pools → buy-in withdraws from pools.

## Backwards compatibility

- v1 callers that read only `accumResult.end` continue to work. v2 just adds new `perYearRows` fields.
- The `monthlySavings` input continues to mean "Monthly Stock Contribution" — name unchanged in localStorage. UI label changed (FR-015.1).
- `pviCashflowOverrideEnabled` is NEW: defaults to false, treated as "auto-compute" per the FR-015.5 default.

## Testing requirements

`tests/unit/accumulateToFire.test.js` MUST add:

- Conservation invariant test (positive-residual persona).
- Conservation inequality test (negative-residual persona).
- Pool-update reconciliation test.
- Override-toggle test (override active → residual respected from override; override inactive → computed).
- Single-person mode cash-flow test.
- Edge case tests: zero income, retired, buy-in year.

Target: ≥10 new test cases. Coverage of `accumulateToFire.js` should remain ≥80% line coverage.
