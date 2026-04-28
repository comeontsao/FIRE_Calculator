# Phase 1 — Data Model

**Feature**: 016-mortgage-payoff-vs-invest
**Date**: 2026-04-28

All entities live in JavaScript memory only — no persistence beyond the three slider/input values that round-trip through the existing `localStorage` `state._payoffVsInvest` block (see [`contracts/payoffVsInvest-state.contract.md`](./contracts/payoffVsInvest-state.contract.md)).

---

## PrepayInvestComparisonInputs

The single input record passed into `computePayoffVsInvest(inputs)`. All fields are real-dollar (constant-purchasing-power) unless noted otherwise. The calc module never reads from the DOM — the renderer assembles this object from inputs and hands it over.

```text
PrepayInvestComparisonInputs:
  // Time horizon
  currentAge:               number   // integer years; from inp.ageRoger / inp.agePerson1
  fireAge:                  number   // integer years; from chartState (effective)
  endAge:                   number   // integer years; from inp.endAge (default 99-100)

  // Mortgage state (read from existing Mortgage pill)
  mortgageEnabled:          boolean
  mortgage:                 MortgageInputs | null

  // Investment / inflation / tax (existing sliders)
  stocksReturn:             number   // nominal annual; e.g. 0.07
  inflation:                number   // annual; e.g. 0.03
  ltcgRate:                 number   // marginal LTCG rate; e.g. 0.15
  stockGainPct:             number   // long-term gain portion of stock return; e.g. 0.6

  // New local inputs (from this pill's own UI)
  extraMonthly:             number   // dollars/month; default 500; clamp [0, 5000]
  framing:                  'totalNetWorth' | 'liquidNetWorth'   // default 'totalNetWorth'
  effectiveRateOverride:    number | null    // optional; null = use nominal rate
  plannedRefi:              PlannedRefi | null    // optional; null = no refi
```

### MortgageInputs (existing — referenced for completeness)

```text
MortgageInputs:
  ownership:        'buying-now' | 'buying-in' | 'already-own'
  homePrice:        number
  downPayment:      number
  rate:             number   // annual nominal; e.g. 0.0653
  term:             number   // years; e.g. 30
  yearsPaid:        number   // years already paid (for already-own); 0 otherwise
  buyInYears:       number   // years from now until purchase (for buying-in); 0 otherwise
  propertyTax:      number   // annual nominal
  insurance:        number   // annual nominal
  hoa:              number   // monthly nominal
  sellAtFire:       boolean
  homeLocation:     string   // scenario id
```

### PlannedRefi (new)

```text
PlannedRefi:
  refiYear:    number   // years from currentAge; integer; >= 1
  newRate:     number   // annual nominal; e.g. 0.04
  newTerm:     15 | 20 | 30   // years; default 30
```

---

## PrepayInvestComparisonOutputs

The single output record returned by `computePayoffVsInvest(inputs)`.

```text
PrepayInvestComparisonOutputs:
  prepayPath:        WealthPath           // year-indexed
  investPath:        WealthPath           // year-indexed
  amortizationSplit: AmortizationSplit    // year-indexed; per-strategy interest + principal
  verdict:           Verdict
  factors:           Factor[]             // 5+ items per FR-008
  crossover:         CrossoverPoint | null
  refiAnnotation:    RefiAnnotation | null
  subSteps:          string[]             // for Audit (Principle II audit-observability)
```

---

## WealthPath

Year-indexed array; one entry per integer age from `currentAge` through `endAge` inclusive. Length = `endAge − currentAge + 1`.

```text
WealthPath: Array<WealthPathRow>

WealthPathRow:
  age:                 number       // integer years
  year:                number       // calendar year (currentYear + age − currentAge)
  mortgageBalance:     number       // remaining principal in real dollars
  homeEquity:          number       // homeValue (real) − mortgageBalance
  invested:            number       // taxable brokerage balance in real dollars
  totalNetWorth:       number       // homeEquity + invested
  liquidNetWorth:      number       // invested only (excludes home equity)
```

---

## AmortizationSplit

Feeds the "Where each dollar goes" chart (FR-018).

```text
AmortizationSplit:
  prepay:  Array<{ age, year, interestPaidThisYear, principalPaidThisYear, cumulativeInterest, cumulativePrincipal }>
  invest:  Array<{ age, year, interestPaidThisYear, principalPaidThisYear, cumulativeInterest, cumulativePrincipal }>
```

After the mortgage is paid off in either strategy, that strategy's rows show `interestPaidThisYear = 0` and `principalPaidThisYear = 0`.

---

## Verdict

```text
Verdict:
  winnerAtFire:        'prepay' | 'invest' | 'tie'
  marginAtFire:        number       // |totalNetWorthPrepay − totalNetWorthInvest| at fireAge, real dollars
  winnerAtEnd:         'prepay' | 'invest' | 'tie'
  marginAtEnd:         number       // same at endAge
  isTieAtFire:         boolean      // marginAtFire < 0.005 × max(totalNetWorth)
  isTieAtEnd:          boolean
  naturalPayoffYear:   number | null    // age at which mortgage naturally ends under Invest path; null if past endAge
```

Tie threshold: 0.5 % of the larger trajectory's total net worth at that age (per FR-007).

---

## Factor

The Factor Breakdown card (FR-008) consumes a list of these. Each factor evaluates as `prepay`-favoring, `invest`-favoring, or `neutral`.

```text
Factor:
  key:               string       // stable identifier; e.g. 'real-spread', 'ltcg-drag'
  i18nKey:           string       // for label translation; e.g. 'pvi.factor.realSpread.label'
  valueDisplay:      string       // pre-formatted for display; e.g. '+1.4 % real'
  rawValue:          number       // for sensitivity inspection
  favoredStrategy:   'prepay' | 'invest' | 'neutral'
  magnitude:         'dominant' | 'moderate' | 'minor'
  hint:              string | null   // optional one-line tooltip explanation; i18n-resolved at render
```

**Required factor keys (v1)** per FR-008:
- `nominal-mortgage-rate`
- `effective-mortgage-rate` (only emitted when override differs from nominal)
- `expected-stocks-return-after-tax`
- `real-spread` (the dominant factor — `stocks_after_tax_real − mortgage_effective_real`)
- `time-horizon-years`
- `mortgage-years-remaining`
- `ltcg-tax-drag`
- `mortgage-payoff-before-fire` (boolean → favors invest if true)
- `planned-refi-active` (boolean → emits a row only if a refi is configured)

---

## CrossoverPoint

```text
CrossoverPoint:
  age:                  number   // fractional age via linear interpolation (R6)
  ageRoundedDisplay:    number   // for the chart marker label
  year:                 number
  totalNetWorth:        number   // wealth at crossover, real dollars
  // null if no crossover within [currentAge, endAge]
```

---

## RefiAnnotation

```text
RefiAnnotation:
  refiAge:        number   // currentAge + plannedRefi.refiYear
  refiYear:       number   // calendar year
  oldRate:        number   // annual nominal
  newRate:        number   // annual nominal
  newTerm:        number   // years
  // Used by FR-020 to draw the annotation line on the trajectory chart.
```

---

## Validation rules (enforced inside the calc module)

- `endAge > fireAge > currentAge` — otherwise return an empty result with an `error` flag.
- `extraMonthly` clamped to `[0, 5000]`.
- If `mortgageEnabled === false` OR `mortgage === null`, return an empty result with `disabledReason: 'no-mortgage'` so the renderer can show the explainer card (FR-011).
- If `mortgage.ownership === 'already-own'` AND `yearsPaid >= term`, return empty with `disabledReason: 'already-paid-off'` (FR-012).
- If `plannedRefi.refiYear` falls before `mortgage.buyInYears`, clamp `refiYear` to `buyInYears` and emit a `refiClampedNote` for the renderer to surface.
- If `plannedRefi.refiYear` falls past either strategy's natural payoff, the refi is a no-op for that strategy. The annotation still renders.

---

## State transitions

The calc module is **stateless** (Constitution Principle II). Every recompute is a pure function of the input record. The module-scope cache lives in the renderer, not in the calc module.

Renderer-side flow:

```text
recalcAll()
  → assembleInputs() : PrepayInvestComparisonInputs
  → computePayoffVsInvest(inputs) : PrepayInvestComparisonOutputs
  → renderWealthTrajectoryChart(outputs)
  → renderAmortizationSplitChart(outputs)
  → renderVerdictBanner(outputs.verdict)
  → renderFactorBreakdownCard(outputs.factors)
```

The pill's `localStorage` reads/writes happen on slider input events, not from the calc module.
