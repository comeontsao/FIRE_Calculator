# Phase 1 Data Model — Feature 018

Extends the data model from feature 017 (`specs/017-payoff-vs-invest-stages-and-lumpsum/data-model.md`). Only deltas are documented here.

---

## Input Record Extensions

### `PrepayInvestComparisonInputs` (extended v3)

| Field | Type | Default | Notes |
|---|---|---|---|
| `mortgageStrategy` | `'prepay-extra' \| 'invest-keep-paying' \| 'invest-lump-sum'` | `'invest-keep-paying'` | NEW. The active strategy. Replaces the boolean `lumpSumPayoff` as the canonical strategy selector. (`lumpSumPayoff: true` from v2 maps to `mortgageStrategy: 'invest-lump-sum'`; `false` maps to `'invest-keep-paying'`. Backwards-compat handled in normalization.) |
| `mfjStatus` | `'single' \| 'mfj'` | `'mfj'` (RR), `'single'` if `singlePerson === true` else `'mfj'` (Generic) | NEW. Filing status for Section 121 exclusion (FR-016). |
| `originalPurchasePrice` | `number` | derived from existing mortgage inputs (`homePrice - downPayment + downPayment` = `homePrice`; for already-own scenarios, the `homePrice` IS the original purchase price) | NEW. The original (non-real, nominal) purchase price for capital-gains computation. |

The `lumpSumPayoff` field from v2 is RETAINED for backwards compatibility but DEPRECATED — the calc module's normalization step in v3 reads `mortgageStrategy` if present, else falls back to deriving it from `lumpSumPayoff`.

### Backwards-compatibility normalization (in calc module)

```ts
function _normalizeStrategy(inputs) {
  if (inputs.mortgageStrategy) return inputs.mortgageStrategy;
  if (inputs.lumpSumPayoff === true) return 'invest-lump-sum';
  return 'invest-keep-paying';   // v1 / v2 default
}
```

Saved-state files from features 016 and 017 lack `mortgageStrategy` → normalize to `'invest-keep-paying'` per SC-004 backwards-compat.

### Lifecycle simulator input override

The lifecycle simulator's `projectFullLifecycle(inp, annualSpend, fireAge, isFinalSimulation, options)` gains a new option:

```ts
options.mortgageStrategyOverride: 'prepay-extra' | 'invest-keep-paying' | 'invest-lump-sum' | undefined
```

Same convention as feature 008's `strategyOverride` and `thetaOverride`. When `undefined`, the lifecycle simulator falls back to reading the active strategy from `state._payoffVsInvest.mortgageStrategy` (default `'invest-keep-paying'`).

---

## Output Record Extensions

### `PrepayInvestComparisonOutputs` (extended v3)

```ts
{
  ...all v2 outputs unchanged,

  // NEW in v3:
  homeSaleEvent: HomeSaleEvent | null,
  postSaleBrokerageAtFire: { prepay: number, invest: number },
  mortgageActivePayoffAge: { prepay: number, invest: number },
}
```

### New entity: `HomeSaleEvent`

| Field | Type | Notes |
|---|---|---|
| `age` | `number` | The FIRE age at which the sale fires (always equals `inputs.fireAge` when `sellAtFire === true` and `mortgageEnabled === true`). |
| `homeValueAtFire` | `number` | Real $, equal to `homePrice` under the project's real-zero appreciation model. Rounded. |
| `proceeds` | `number` | `homeValueAtFire × (1 − sellingCostPct)`, rounded. |
| `nominalGain` | `number` | `homeValueAtFire − originalPurchasePrice` (note: project uses real-zero appreciation, so nominalGain ≈ 0 in real $; in nominal $ it's `homePrice × ((1+inflation)^yearsOwned − 1)`. For Section 121 we use REAL purchase price = nominal purchase price, so the nominalGain in real $ is approximately 0 — meaning Section 121 essentially never triggers under the current real-zero model. This is a known model simplification; FR-016 documents the math, not the model). |
| `section121Exclusion` | `number` | $250,000 if `mfjStatus === 'single'`, else $500,000. |
| `taxableGain` | `number` | `max(0, nominalGain − section121Exclusion)`. |
| `capGainsTax` | `number` | `taxableGain × ltcgRate`. Rounded. |
| `netToBrokerage` | `number` | `proceeds − capGainsTax − remainingMortgageBalance`. Rounded. The amount that credits to brokerage at FIRE under the active strategy. |
| `remainingMortgageBalance` | `number` | The mortgage balance at FIRE under the active strategy (Prepay's accelerated remainder, Invest's contractual remainder, or 0 if a pre-FIRE lump-sum already paid it). |

`homeSaleEvent` is `null` when `sellAtFire === false` OR `mortgageEnabled === false`.

### `postSaleBrokerageAtFire` (handoff seed)

The lifecycle handoff value PER STRATEGY. Computed by the calc module:

```
postSaleBrokerageAtFire.prepay = Prepay_brokerage_at_FIRE + (homeSaleEvent ? netToBrokerage_under_prepay : 0)
postSaleBrokerageAtFire.invest = Invest_brokerage_at_FIRE + (homeSaleEvent ? netToBrokerage_under_invest : 0)
```

Note the `netToBrokerage` differs between strategies because their `remainingMortgageBalance` differs.

The lifecycle simulator selects the correct one based on `mortgageStrategy`:
- `'prepay-extra'` → uses `.prepay`
- `'invest-keep-paying'` → uses `.invest`
- `'invest-lump-sum'` → uses `.invest` (Invest's brokerage already reflects any pre-FIRE lump-sum)

### `mortgageActivePayoffAge`

The age at which the mortgage is fully retired under each strategy. Surfaced in the sidebar (FR-005) and the lifecycle chart marker.

```
mortgageActivePayoffAge.prepay = first row where prepayPath[i].mortgageBalance === 0 (or fireAge if sellAtFire pays it off first)
mortgageActivePayoffAge.invest = (lumpSumEvent ? lumpSumEvent.age : invest natural payoff age) (or fireAge if sellAtFire fires first)
```

Equals FIRE age when sell-at-FIRE retired the mortgage; otherwise the strategy-specific payoff age.

### Updated existing field: `mortgageNaturalPayoff.investAge`

Behavior preserved from v2 — reflects lump-sum age when fired, else bank's amortization-end. NOT affected by sell-at-FIRE (the "natural" payoff is independent of any forced sale).

### Audit subSteps additions

The calc module's returned `subSteps[]` array gains entries when relevant inputs are present (per FR-008):

| Trigger condition | subSteps entry |
|---|---|
| Always (v3) | `'resolve active mortgage strategy: {strategy}'` |
| Always (v3) | `'compute lifecycle mortgage trajectory under {strategy}'` |
| `mortgageStrategy === 'invest-lump-sum'` | `'apply lump-sum trigger month-by-month for Invest'` |
| `lumpSumEvent !== null` | `'lump-sum LTCG gross-up: realBalance × (1 + ltcgRate × stockGainPct) = ${grossedUpDrawdown}'` |
| `sellAtFire === true && mortgageEnabled` | `'evaluate sell-at-FIRE event at age {fireAge}'` |
| `homeSaleEvent !== null` | `'Section 121 exclusion: nominalGain={gain}, exclusion={section121Cap}, taxableGain={taxableGain}'` |
| `homeSaleEvent !== null` | `'home-sale capital gains tax: taxableGain × ltcgRate = ${capGainsTax}'` |
| Always (v3) | `'credit post-sale brokerage at FIRE = ${postSaleBrokerage}'` |
| Always (v3) | `'lifecycle handoff: pre-FIRE simulator → retirement-phase simulator (postSaleBrokerage = $X)'` |

---

## State Transitions

### `state._payoffVsInvest` (localStorage blob, extended)

```jsonc
{
  "extraMonthly": 1000,
  "lumpSumPayoff": true,                    // v2 (deprecated but retained for back-compat)
  "mortgageStrategy": "invest-lump-sum",    // NEW v3 — canonical
  "plannedRefi": null,
  "effectiveRateOverride": null,
  // ...other PvI tab state...
}
```

Hydration on page load:
1. If `state._payoffVsInvest.mortgageStrategy` exists, use it.
2. Else if `state._payoffVsInvest.lumpSumPayoff === true`, default `mortgageStrategy = 'invest-lump-sum'`.
3. Else default `mortgageStrategy = 'invest-keep-paying'`.

### Lifecycle handoff sequence (per recompute)

```
1. PvI tab radio change → state._payoffVsInvest.mortgageStrategy = newValue
2. recomputePayoffVsInvest() called (existing function)
3. PvI calc module produces outputs including postSaleBrokerageAtFire
4. Clear fireAgeOverride (Q3=A: auto-move FIRE marker)
5. recomputeLifecycle() called (NEW — connects to existing lifecycle pipeline)
   5a. Lifecycle simulator reads mortgageStrategy from state
   5b. Lifecycle simulator's pre-FIRE accumulation uses calc module's mortgage trajectory
   5c. At FIRE, lifecycle simulator uses postSaleBrokerageAtFire as the retirement-phase brokerage seed
   5d. Lifecycle simulator's retirement phase runs unchanged (existing withdrawal-strategy logic)
6. All consumers re-render: lifecycle chart, sidebar indicator, KPIs, FIRE-age verdict, ranker, audit, copyDebug
```

---

## New Translation Keys (Principle VII)

7 new keys, EN + zh-TW, added to `TRANSLATIONS.en` / `TRANSLATIONS.zh` blocks in BOTH HTML files AND to `FIRE-Dashboard Translation Catalog.md`:

| Key | EN | zh-TW |
|---|---|---|
| `pvi.strategy.label` | Active mortgage strategy | 啟用之房貸策略 |
| `pvi.strategy.prepay` | Prepay (extra → principal) | 提前還款（額外 → 本金） |
| `pvi.strategy.investKeep` | Invest, keep paying mortgage | 投資，持續償還房貸 |
| `pvi.strategy.investLumpSum` | Invest, lump-sum payoff | 投資，一次清償 |
| `sidebar.mortgageStatus.template` | Mortgage: {0} · paid off age {1} | 房貸：{0} · {1} 歲清償 |
| `pvi.chart.brokerage.sellMarker` | Sell home at age {0} · +${1} to brokerage | 於 {0} 歲售屋 · +${1} 進入投資組合 |
| `pvi.factor.section121.label` | Home-sale Section 121 exclusion (US) | 售屋第 121 條免稅額（美國） |

zh-TW translations are illustrative drafts; final wording reviewed during implementation.

---

## Key Consumer Updates

| Consumer | What it now reads | File |
|---|---|---|
| Lifecycle simulator (in HTML inline scripts) | `mortgageStrategy`, calc module's mortgage trajectory under that strategy, `postSaleBrokerageAtFire` (handoff seed), `homeSaleEvent` (for chart annotation) | both HTML files |
| `renderPayoffVsInvestBrokerageChart` | adds `homeSaleEvent` consumption (sell marker + post-sale jump in both curves) | both HTML files |
| `renderPayoffVsInvestVerdictBanner` | adds `homeSaleEvent` consumption (verdict mentions sale at FIRE if applicable) | both HTML files |
| Sidebar (NEW indicator) | `mortgageStrategy`, `mortgageActivePayoffAge` | both HTML files |
| FIRE-age search (`isFireAgeFeasible` / bisection) | `mortgageStrategyOverride` option threaded through `projectFullLifecycle` | both HTML files |
| Strategy ranker | nothing direct — consumes lifecycle-simulator outputs which now reflect strategy | both HTML files |
| Audit tab | new subSteps from calc module per FR-008 | both HTML files |
| `copyDebugInfo()` | adds `mortgageStrategy`, `mortgageActivePayoffAge`, `lumpSumEvent`, `homeSaleEvent`, `postSaleBrokerageAtFire` to JSON payload | both HTML files |
