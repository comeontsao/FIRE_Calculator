# Contract — `calc/payoffVsInvest.js` v3 (extends v2 from feature 017)

**Module:** `calc/payoffVsInvest.js`
**Version:** v3 (this feature) — supersedes v2 from `specs/017-payoff-vs-invest-stages-and-lumpsum/contracts/payoffVsInvest-calc-v2.contract.md`.
**Compatibility:** v3 is a strict superset of v2. v2 callers that pass no `mortgageStrategy` get v2 behavior (defaults to `'invest-keep-paying'` with `lumpSumPayoff` honored as a deprecated fallback).

---

## Inputs (extension)

```ts
PrepayInvestComparisonInputs {
  // ...all v2 fields unchanged

  // NEW in v3:
  mortgageStrategy?: 'prepay-extra' | 'invest-keep-paying' | 'invest-lump-sum'
  mfjStatus?: 'single' | 'mfj'      // default 'mfj' for RR; derived from singlePerson for Generic
  originalPurchasePrice?: number    // default = mortgage.homePrice (current model = real-zero)

  // DEPRECATED (still honored as fallback for back-compat):
  lumpSumPayoff?: boolean
}
```

Normalization: at module entry, `_normalizeStrategy(inputs)` returns the canonical strategy from explicit `mortgageStrategy` if present, else from `lumpSumPayoff`, else default `'invest-keep-paying'`.

---

## Outputs (extension)

```ts
PrepayInvestComparisonOutputs {
  // ...all v2 fields unchanged

  // NEW in v3:
  homeSaleEvent: HomeSaleEvent | null,
  postSaleBrokerageAtFire: { prepay: number, invest: number },
  mortgageActivePayoffAge: { prepay: number, invest: number },

  // RETAINED v2:
  // lumpSumEvent, stageBoundaries, mortgageNaturalPayoff, etc.
}

HomeSaleEvent {
  age: number                    // = inputs.fireAge when sellAtFire && mortgageEnabled
  homeValueAtFire: number        // real $, rounded
  proceeds: number               // homeValueAtFire * (1 - sellingCostPct), rounded
  nominalGain: number            // homeValueAtFire - originalPurchasePrice (real-$ approximation)
  section121Exclusion: number    // 250000 (single) or 500000 (mfj)
  taxableGain: number            // max(0, nominalGain - section121Exclusion)
  capGainsTax: number            // taxableGain * ltcgRate, rounded
  netToBrokerage: number         // proceeds - capGainsTax - remainingMortgageBalance, rounded
  remainingMortgageBalance: number  // mortgage balance at FIRE under active strategy, rounded
}
```

See `specs/018-lifecycle-payoff-merge/data-model.md` for full field semantics.

---

## Consumers (Principle VI two-way link)

| Consumer | What it reads | File |
|---|---|---|
| `renderPayoffVsInvestBrokerageChart` | v2 fields PLUS **`homeSaleEvent`** (NEW — sell marker + post-sale jump in both curves at FIRE age) | both HTML files |
| `renderPayoffVsInvestAmortizationChart` | `amortizationSplit` (unchanged from v2) | both HTML files |
| `renderPayoffVsInvestVerdictBanner` | v2 fields PLUS **`homeSaleEvent`** (NEW — banner mentions FIRE-sale event when applicable) | both HTML files |
| `renderPayoffVsInvestFactorBreakdown` | `factors` (unchanged from v2) | both HTML files |
| **Lifecycle simulator** (NEW consumer) | **`postSaleBrokerageAtFire[strategy]`** as retirement-phase brokerage seed | both HTML files |
| **Sidebar mortgage indicator** (NEW consumer) | **`mortgageActivePayoffAge[strategy]`** | both HTML files |
| `copyDebugInfo()` | v2 fields PLUS **`mortgageStrategy`, `mortgageActivePayoffAge`, `homeSaleEvent`, `postSaleBrokerageAtFire`** | both HTML files |
| `tests/unit/payoffVsInvest.test.js` | full output for fixture lock | (project root) |
| `tests/unit/lifecyclePayoffMerge.test.js` (NEW) | `homeSaleEvent`, `postSaleBrokerageAtFire`, `mortgageActivePayoffAge` for handoff-value tests | (project root) |

---

## Behavioral Invariants

### Inv-1 (v2 retained): Backwards compatibility for switch=false / non-buying-in

For every input record where `mortgageStrategy === 'invest-keep-paying'` AND `ownership !== 'buying-in'` AND `sellAtFire === false`:

```
v3(inputs).<every v2 output field> === v2(inputs).<every v2 output field>
```

Locked by the parity helper in `tests/unit/payoffVsInvest.test.js`. The new v3 fields (`homeSaleEvent`, `postSaleBrokerageAtFire`, `mortgageActivePayoffAge`) are additive and excluded from the parity diff.

### Inv-2 (v2 retained): Window start for buying-in

Unchanged from v2.

### Inv-3 (v2 extended): Lump-sum fires at most once AND inhibited post-FIRE under sellAtFire

When `mortgageStrategy === 'invest-lump-sum'`:
- `lumpSumEvent` fires at most ONCE in the simulation.
- When `sellAtFire === true`, the lump-sum trigger is evaluated only for months where `currentSimulationAge < fireAge`. If FIRE arrives first, `lumpSumEvent === null` (sell-at-FIRE retires the mortgage instead).

### Inv-4 (v2 retained): Lump-sum reduces brokerage by exactly remaining real balance × LTCG gross-up

Extended in v3 with the LTCG gross-up per FR-011:

```
actualDrawdown = realBalance × (1 + ltcgRate × stockGainPct)
investedI_post = investedI_pre - actualDrawdown
```

**`LumpSumEvent` field semantics (v3 — Option B):**
- `paidOff` retains v2 semantics: the mortgage balance the bank receives = `realBalance`.
- `actualDrawdown` is NEW in v3: the true brokerage drop, including LTCG gross-up.
- `brokerageAfter === brokerageBefore − actualDrawdown` (within $2 rounding).
- `paidOff <= actualDrawdown`; equality only when `ltcgRate × stockGainPct === 0`.

**Trigger threshold:** the lump-sum fires when `investedI >= actualDrawdown` (NOT `>= realBalance`),
so the brokerage can cover both the mortgage payoff AND the LTCG tax bite.

### Inv-5 (v2 retained): Stage ordering

Unchanged from v2.

### Inv-6 (v2 retained): Interest invariant

Unchanged from v2.

### Inv-7 (v2 retained): Pure-module invariants

Unchanged.

### Inv-8 (v2 retained): UMD-classic-script

Unchanged.

### Inv-9 (NEW v3): HomeSaleEvent invariants

When `sellAtFire === true && mortgageEnabled === true`:
- `homeSaleEvent !== null`.
- `homeSaleEvent.age === inputs.fireAge`.
- `homeSaleEvent.proceeds === homeSaleEvent.homeValueAtFire × (1 - sellingCostPct)` (rounded).
- `homeSaleEvent.taxableGain === max(0, homeSaleEvent.nominalGain - homeSaleEvent.section121Exclusion)`.
- `homeSaleEvent.netToBrokerage === homeSaleEvent.proceeds - homeSaleEvent.capGainsTax - homeSaleEvent.remainingMortgageBalance`.
- **`remainingMortgageBalance` is in REAL dollars** — the active strategy's nominal balance at FIRE deflated by `(1 + inflation)^(fireAge - currentAge)`. (Option-1-fold-in 2026-04-29 corrected a units bug; pre-fold the field was nominal and produced incorrect netToBrokerage values when inflation > 0.)

When `sellAtFire === false || mortgageEnabled === false`:
- `homeSaleEvent === null`.

### Inv-10 (NEW v3, option-1-fold-in 2026-04-29): Post-sale brokerage handoff

The home sale at FIRE is now applied IN-LOOP at `age === fireAge` so both `prepayPath[fireAge].invested` and `investPath[fireAge].invested` already reflect the brokerage injection (`netToBrokerage_under_<strategy>`) and the zeroed mortgage. Therefore:

For each strategy:
- `postSaleBrokerageAtFire[strategy] === <strategy>_path[fireAge].invested` (always — no sale-time addition needed downstream).

When `sellAtFire === false`, the path simulation is unchanged — `postSaleBrokerageAtFire` simply mirrors the natural brokerage at FIRE.

When `sellAtFire === true`, the path's `invested` at fireAge equals `naturalBrokerage + netToBrokerage_under_<strategy>`, the mortgage balance from fireAge onward is `0`, and the post-FIRE rows reflect freed-cash-flow contributions (former P&I + extra) compounding into the brokerage.

**Why fold-in:** the previous post-loop addition pattern made the PvI chart's brokerage curve disagree with the lifecycle simulator's behavior — the chart line continued along the natural-amortization trajectory through fireAge and beyond, even though the lifecycle truncates mortgage at FIRE under sellAtFire. Folding the sale into the path data makes the PvI chart match the lifecycle chart visually.

### Inv-11 (NEW v3): Mortgage active payoff age

`mortgageActivePayoffAge[strategy]`:
- If a pre-FIRE event (Prepay's accelerated payoff or Invest's lump-sum) retired the mortgage, equals that event's age.
- Else if `sellAtFire === true`, equals `fireAge`.
- Else (Invest-keep-paying, no sale): equals the bank's natural amortization-end age.

### Inv-12 (NEW v3): Strategy resolution determinism

For inputs with both `mortgageStrategy` and `lumpSumPayoff` present (a transitional state):
- `mortgageStrategy` wins. `lumpSumPayoff` is ignored.

For inputs with only `lumpSumPayoff` and no `mortgageStrategy`:
- `lumpSumPayoff: true` → `'invest-lump-sum'`
- `lumpSumPayoff: false | undefined` → `'invest-keep-paying'`

For inputs with neither present:
- Default `'invest-keep-paying'`.

---

## Audit `subSteps` (Principle II observability)

Per FR-008, the v3 module emits the following subSteps (all conditional on relevant inputs):

```text
'resolve active mortgage strategy: {strategy} (from state._payoffVsInvest.mortgageStrategy)'  // always
'compute lifecycle mortgage trajectory under {strategy}'                                       // always
'apply lump-sum trigger month-by-month for Invest'                                             // when invest-lump-sum
'lump-sum LTCG gross-up: realBalance × (1 + ltcgRate × stockGainPct) = ${grossedUpDrawdown}'   // when lump-sum fires
'evaluate sell-at-FIRE event at age {fireAge}'                                                  // when sellAtFire && mortgageEnabled
'Section 121 exclusion: nominalGain={gain}, exclusion={section121Cap}, taxableGain={taxableGain}'  // when homeSaleEvent !== null
'home-sale capital gains tax: taxableGain × ltcgRate = ${capGainsTax}'                          // when homeSaleEvent !== null
'credit post-sale brokerage at FIRE = ${postSaleBrokerage}'                                    // always
'lifecycle handoff: pre-FIRE simulator → retirement-phase simulator (postSaleBrokerage = $X)'  // always
```

---

## Test Plan Reference

Concrete test cases enumerated in `specs/018-lifecycle-payoff-merge/spec.md` §"Sell-at-FIRE × Mortgage-Strategy Interaction Matrix" (8 scenarios) plus 4 Section 121 boundary cases (homeValue == cap, homeValue == cap+1, homeValue < purchasePrice, homeValue >> cap).

Coverage requirement: 80%+ overall (project standard); every new branch in v3 hit by ≥ 1 test.
