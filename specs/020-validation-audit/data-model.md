# Data Model — Feature 020

## Persona (test fixture)

A parameterized scenario used by the validation harness.

```
Persona = {
  id: string                    // stable identifier, e.g. "RR-baseline", "Generic-single-frugal-Japan"
  dashboard: 'RR' | 'Generic'   // which HTML this persona targets
  inp: InputState               // matches getInputs() output shape from FIRE-Dashboard*.html
  notes: string                 // prose describing what this persona stresses
}

InputState = {
  // Identity
  ageRoger?: number             // RR
  agePerson1?: number           // Generic
  ageRebecca?: number           // RR
  agePerson2?: number           // Generic
  adultCount?: 1 | 2            // Generic only

  // Pools
  roger401kTrad?: number        // RR
  person1_401kTrad?: number     // Generic
  roger401kRoth?: number        // RR
  person1_401kRoth?: number     // Generic
  rogerStocks?: number          // RR
  rebeccaStocks?: number        // RR
  person1Stocks?: number        // Generic
  person2Stocks?: number        // Generic
  cashSavings: number
  otherAssets: number

  // Returns
  returnRate: number            // nominal stocks
  return401k: number            // nominal 401k
  inflationRate: number

  // Income / contributions
  annualIncome: number
  raiseRate: number
  taxRate: number
  monthlySavings: number        // → renamed semantically "Monthly Stock Contribution"
  contrib401kTrad: number
  contrib401kRoth: number
  empMatch: number

  // Tax / planning
  taxTrad: number               // marginal rate at withdrawal
  stockGainPct: number          // % of stock sale that is LTCG-eligible gain
  bufferUnlock: number
  bufferSS: number
  terminalBuffer: number
  safetyMargin: number

  // SS
  ssClaimAge: number
  ssWorkStart: number
  ssAvgEarnings: number
  ssRebeccaOwn?: number         // RR
  ssSpouseOwn?: number          // Generic

  // Mortgage (primary)
  mortgageEnabled: boolean
  mtgHomeLocation: string
  mtgYearsPaid: number
  mtgBuyInYears: number
  mtgHomePrice: number
  mtgDownPayment: number
  mtgClosingCosts: number
  mtgRate: number
  mtgTerm: number
  mtgPropertyTax: number
  mtgInsurance: number
  mtgHOA: number
  mtgApprec: number
  mtgSellAtFire: 'yes' | 'no'

  // Home #2
  secondHomeEnabled: boolean
  mtg2Destiny: 'no' | 'sell' | 'hold'
  mtg2BuyInYears: number
  mtg2HomePrice: number
  // ... (mirrors primary mortgage shape)

  // Mortgage strategy
  pviStrategyPrepay: boolean
  pviStrategyInvestKeep: boolean
  pviStrategyInvestLumpSum: boolean
  pviExtraMonthly: number
  pviRefiEnabled: boolean
  pviCashflowOverrideEnabled?: boolean   // NEW in feature 020
  pviCashflowOverride?: number           // NEW in feature 020

  // Country / scenario
  selectedScenario: 'us' | 'japan' | 'taiwan' | ...

  // Expense library
  exp_0..exp_9: number          // monthly expense buckets

  // Plan parameters
  endAge: number
  rule55Enabled: boolean
  rule55SeparationAge: number
  irmaaThreshold: number
}
```

**Persona matrix axes** (≤200 cells total):

| Axis | Values | Cells contributed |
|---|---|---|
| dashboard | RR, Generic | × 2 |
| adultCount (Generic only) | 1 (single), 2 (couple) | × 2 |
| country | US, Japan, Taiwan | × 3 |
| starting age | 28, 42, 52 | × 3 |
| spend level | $50k, $75k, $120k | × 3 |
| income level | $80k, $150k, $250k | × 3 |
| mortgage state | none, buying-now, buying-in, already-own, sell-at-FIRE | × 5 |
| mortgage strategy | invest-keep, prepay, invest-lump-sum | × 3 |
| home #2 | none, buying-in, sell-at-fire, hold-forever | × 4 |
| Rule of 55 | disabled, enabled | × 2 |
| SS claim age | 62, 67, 70 | × 3 |

Cartesian: 2 × 3 × 3 × 3 × 3 × 5 × 3 × 4 × 2 × 3 × ≈ 19,440 (Generic) + same minus adultCount = 38,880 cells. Way over budget.

**Pruning strategy**: ALL single-dimension variations from the RR-baseline (~30 cells) + REPRESENTATIVE pair-wise combinations (e.g., country × adultCount, mortgage × spend, age × income). Target: 150 cells. Hard cap: 200.

## Invariant

A named correctness rule.

```
Invariant = {
  id: string                    // e.g., "A1", "B3", "C1"
  family: 'mode-ordering' | 'end-state-validity' | 'cross-chart-consistency'
        | 'cashflow-accounting' | 'drag-invariants'
  description: string           // human-readable rule statement
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  check: (persona: Persona, ctx: HarnessContext) => CheckResult
}

CheckResult =
  | { passed: true }
  | { passed: false, observed: any, expected: any, notes?: string }

HarnessContext = {
  // Pre-computed shared state — e.g., chart sim outputs, signed-sim outputs,
  // strategy-ranker results — to avoid re-running expensive simulations
  // across multiple invariants.
  chart: LifecycleChartRows[]
  signedSim: SignedLifecycleResult
  strategyRanking: StrategyRankingResult
  fireAgeByMode: { safe: {years, months}, exact: {...}, dieWithZero: {...} }
  fireNumberByMode: { safe: number, exact: number, dieWithZero: number }
}
```

## Finding

An instance of an invariant violation.

```
Finding = {
  invariantId: string           // matches Invariant.id
  invariantDescription: string  // copied from Invariant.description for self-contained reporting
  personaId: string             // matches Persona.id
  observed: any                 // what the check function actually saw
  expected: any                 // what the check function expected
  severity: Invariant.severity
  status: 'OPEN' | 'FIXED' | 'DEFERRED' | 'WONTFIX'
  fixCommitHash?: string        // populated when status = FIXED
  deferralRationale?: string    // populated when status = DEFERRED or WONTFIX
  discoveredAt: ISO8601 string  // test run timestamp
  notes?: string                // optional prose
}
```

Findings persist in `audit-report.md`. Resolved findings are NOT deleted; they are marked `FIXED` with the commit hash. Future audit runs against the same persona MUST re-confirm `FIXED` findings stay fixed.

## Per-year accumulation row (extended in feature 020)

Existing fields (preserved):
```
{
  age, year, total, p401k, pStocks, pCash, pRoth, ssIncome, withdrawals,
  syntheticConversion, hasShortfall, phase
}
```

NEW fields (added by FR-015):
```
{
  grossIncome,                  // gross salary that year (real terms)
  federalTax,                   // federal tax withheld that year
  annualSpending,               // inflation-adjusted spending
  pretax401k,                   // contrib401kTrad + contrib401kRoth (employee)
  empMatch,                     // employer's contribution to Trad
  stockContribution,            // monthlySavings × 12 (or override)
  cashFlowToCash,               // residual into cash pool (clamped at 0)
  cashFlowWarning?: string      // populated when residual would be negative
}
```

Conservation invariant per row (Phase 2 unit test):
```
grossIncome
  - federalTax
  - annualSpending
  - pretax401k
  - stockContribution
  ≥ cashFlowToCash    (equality if cashFlowToCash > 0; inequality only when clamped at 0)
```

Plus across-the-loop sum invariants (Phase 2 unit test):
```
Σ(grossIncome) - Σ(federalTax) - Σ(annualSpending)
  =
Σ(pretax401k) + Σ(stockContribution) + Σ(cashFlowToCash) [non-clamped years only]
```

## StrategyFitnessVerdict

Returned by the strategy ranker per strategy.

```
StrategyFitnessVerdict = {
  strategyId: string
  feasibleUnderCurrentMode: boolean
  endBalance: number
  lifetimeFederalTax: number
  violations: number            // count of trajectory floor violations
  firstViolationAge?: number
  hasShortfall: boolean
  firstShortfallAge?: number
  isWinner: boolean
}
```

Used by Invariant family A (mode ordering) and B (end-state validity).

## Audit-dump fields touched

`copyDebugInfo()` output gains:
- `lifecycleProjection.rows[i].grossIncome`, `.federalTax`, `.annualSpending`, `.pretax401k`, `.stockContribution`, `.cashFlowToCash`, `.cashFlowWarning`.
- `summary.totalCashFlow` (sum across accumulation years).
- `cashFlowConservation: { grossSum, taxSum, spendSum, contribSum, stockSum, cashSum, residual }` for diagnostic.

These additions extend the existing dump shape; no breaking changes.
