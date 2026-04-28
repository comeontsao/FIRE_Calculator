# Contract: Three new Chart.js charts

**Feature**: 016-mortgage-payoff-vs-invest
**Renderer file(s)**: inline JS in `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` (lockstep)
**Constitution Principles enforced**: I (lockstep), VI (chart ↔ module contracts), VII (bilingual)

---

## Chart 1 — Wealth Trajectory

**Canvas id**: `payoffVsInvestWealthChart`
**Renderer**: `renderPayoffVsInvestWealthChart(outputs)`
**Data source**: `calc/payoffVsInvest.js` → `outputs.prepayPath`, `outputs.investPath`, `outputs.crossover`, `outputs.refiAnnotation`

### Renderer comment header (mandatory per Principle VI)

```text
// =============================================================================
// CHART: Wealth Trajectory (Payoff vs Invest pill)
// Inputs : outputs.prepayPath[].totalNetWorth or .liquidNetWorth (per FR-010 framing)
//          outputs.investPath[].totalNetWorth or .liquidNetWorth
//          outputs.crossover (optional marker)
//          outputs.refiAnnotation (optional vertical line marker per FR-020)
// Module : calc/payoffVsInvest.js (computePayoffVsInvest)
// Reads  : the framing toggle from #pviFramingToggle radios at render time;
//          re-renders on any pill input change.
// =============================================================================
```

### Datasets

```text
datasets[0] = Prepay Mortgage path
  data: prepayPath.map(r => framing === 'totalNetWorth' ? r.totalNetWorth : r.liquidNetWorth)
  label: t('pvi.chart.wealth.prepay')   // "Prepay Mortgage" / "提早還清房貸"
  borderColor: rgba(255, 107, 107, 0.85)   // accent red
  backgroundColor: rgba(255, 107, 107, 0.10)
  fill: false
  tension: 0
  pointRadius: 0
  borderWidth: 2

datasets[1] = Invest Extra path
  data: same shape as [0] from investPath
  label: t('pvi.chart.wealth.invest')    // "Invest Extra" / "投入市場"
  borderColor: rgba(108, 99, 255, 0.85)   // accent purple
  backgroundColor: rgba(108, 99, 255, 0.10)
  fill: false
  tension: 0
  pointRadius: 0
  borderWidth: 2

datasets[2] = Crossover marker (optional)
  data: lifecycle.map((r, i) => i === crossover.ageRoundedIdx ? r.totalNetWorth : null)
  label: t('pvi.chart.wealth.crossover')   // "Lines cross" / "黃金交叉點"
  pointStyle: 'crossRot'
  pointRadius: 10
  showLine: false
  emitted only when outputs.crossover != null

datasets[3] = Refi annotation point (optional)
  pointStyle: 'rect'
  emitted only when outputs.refiAnnotation != null at refiAge
```

### Tooltip mode

`interaction: { mode: 'index', intersect: false }` so hovering shows BOTH paths' net worth at that age in one tooltip. Format: `${label}: $${value.toLocaleString()}` (matching the Lifecycle chart's existing tooltip style).

### Axes

- X axis: categorical, labels = `[currentAge .. endAge]` formatted as `${year} (age ${age})` — matches the existing Lifecycle chart pattern.
- Y axis: linear, dollars. Tick callback: `v => v >= 1_000_000 ? '$' + (v/1e6).toFixed(1) + 'M' : '$' + Math.round(v/1000) + 'K'`.

### Reference markers (in subtitle)

The chart subtitle MUST display two callouts: `t('pvi.chart.wealth.callout', fireAge, marginAtFireFormatted, winnerAtFire)` — i.e., "At FIRE (age 51): Invest wins by $42K".

---

## Chart 2 — "Where each dollar goes" (per-year amortization split)

**Canvas id**: `payoffVsInvestAmortizationChart`
**Renderer**: `renderPayoffVsInvestAmortizationChart(outputs)`
**Data source**: `outputs.amortizationSplit.prepay`, `outputs.amortizationSplit.invest`

### Renderer comment header

```text
// =============================================================================
// CHART: Where each dollar goes (per-year P&I split, Payoff vs Invest pill)
// Inputs : outputs.amortizationSplit.prepay[].interestPaidThisYear,
//                                                   .principalPaidThisYear
//          outputs.amortizationSplit.invest[].interestPaidThisYear,
//                                                   .principalPaidThisYear
// Module : calc/payoffVsInvest.js
// Purpose: visualize the front-loaded-interest amortization dynamic per
//          clarification 2026-04-28 Q1.
// =============================================================================
```

### Layout

Stacked-bar chart with **grouped pairs**: for each year, two bars side-by-side — one for Prepay, one for Invest. Each bar is stacked: principal portion at the bottom (solid), interest portion on top (semi-transparent pattern fill).

```text
datasets[0] = Prepay — Interest portion
  data: amortizationSplit.prepay.map(r => r.interestPaidThisYear)
  stack: 'prepay'
  backgroundColor: rgba(255, 107, 107, 0.45)
  label: t('pvi.amort.prepay.interest')

datasets[1] = Prepay — Principal portion
  data: amortizationSplit.prepay.map(r => r.principalPaidThisYear)
  stack: 'prepay'
  backgroundColor: rgba(255, 107, 107, 0.85)
  label: t('pvi.amort.prepay.principal')

datasets[2] = Invest — Interest portion
  data: amortizationSplit.invest.map(r => r.interestPaidThisYear)
  stack: 'invest'
  backgroundColor: rgba(108, 99, 255, 0.45)
  label: t('pvi.amort.invest.interest')

datasets[3] = Invest — Principal portion
  data: amortizationSplit.invest.map(r => r.principalPaidThisYear)
  stack: 'invest'
  backgroundColor: rgba(108, 99, 255, 0.85)
  label: t('pvi.amort.invest.principal')
```

### Hover tooltip

`interaction: { mode: 'index', intersect: false }`. Shows all four entries plus a derived line: `Cumulative interest avoided by Prepay this year: $X` (computed in tooltip callback).

### Axes

- X axis: categorical, labels = `${age}` (compact since this chart is dense).
- Y axis: linear dollars.

---

## Chart 3 — Verdict mini-chart (optional micro-chart inside the Verdict banner)

**Canvas id**: `payoffVsInvestVerdictMini`
**Renderer**: `renderPayoffVsInvestVerdictMini(outputs)`
**Data source**: `outputs.verdict.marginAtFire`, `outputs.verdict.marginAtEnd`

A tiny 200×60 px sparkline-style chart inside the Verdict banner showing the spread `(prepay − invest)` over time as a single line. Crosses zero = the lines crossed in the main chart. Useful at-a-glance.

### Datasets

```text
datasets[0]:
  data: prepayPath.map((r, i) => r.totalNetWorth − investPath[i].totalNetWorth)
  borderColor: dynamic — green where positive (prepay leading), red where negative (invest leading)
  fill: above zero from green-tinted, below zero from red-tinted
```

This chart is OPTIONAL for v1 — implementer may defer to v1.1 if the implementation is cleaner without it. The Verdict banner functions correctly (FR-007) without the mini-chart.

---

## Tab router registration

After each chart's `new Chart(...)` constructor:

```js
if (window.tabRouter) window.tabRouter.registerChart('payoff-invest', charts.payoffVsInvestWealth);
if (window.tabRouter) window.tabRouter.registerChart('payoff-invest', charts.payoffVsInvestAmortization);
```

The router's resize-on-activate fires for both, so they correctly resize when the user navigates back to the pill.

---

## i18n key registry (added to both `TRANSLATIONS.en` and `TRANSLATIONS.zh`)

| Key | EN | zh-TW |
|-----|----|----|
| `nav.pill.payoffInvest` | Payoff vs Invest | 還貸 vs 投資 |
| `pvi.section.title` | Mortgage payoff vs. invest extra cash | 房貸還清 vs. 投入市場 |
| `pvi.section.subtitle` | At your current numbers, which path leaves you wealthier? | 以你目前的數字，哪條路會讓你更有錢？ |
| `pvi.input.extraMonthly` | Extra monthly cash to allocate | 每月額外可用現金 |
| `pvi.input.framing` | Net-worth framing | 淨資產計算方式 |
| `pvi.input.framing.total` | Total (incl. home equity) | 總計（含房屋淨值） |
| `pvi.input.framing.liquid` | Liquid only (investments + cash) | 流動資產（投資＋現金） |
| `pvi.input.refi.enable` | Plan a refinance | 規劃再融資 |
| `pvi.input.refi.year` | Refi in N years | N 年後再融資 |
| `pvi.input.refi.newRate` | New rate (%) | 新利率（%） |
| `pvi.input.refi.newTerm` | New term | 新還款年限 |
| `pvi.input.effRate.title` | Effective mortgage rate (after-tax) | 實質房貸利率（稅後） |
| `pvi.input.effRate.hint` | Lower this if your state lets you deduct mortgage interest. Adjusts the verdict only — not the bank's amortization. | 如果你的州可抵扣房貸利息，請調低此值。僅影響結論，不影響實際攤還。 |
| `pvi.chart.wealth.title` | Wealth trajectory — Prepay vs Invest | 財富軌跡 — 還貸 vs 投資 |
| `pvi.chart.wealth.prepay` | Prepay Mortgage | 提早還清房貸 |
| `pvi.chart.wealth.invest` | Invest Extra | 投入市場 |
| `pvi.chart.wealth.crossover` | Lines cross | 交叉點 |
| `pvi.chart.wealth.callout` | At {0} (age {1}): {2} wins by {3} | 在 {0}（{1} 歲）：{2} 多 {3} |
| `pvi.chart.amort.title` | Where each dollar goes | 每塊錢的去向 |
| `pvi.amort.prepay.interest` | Prepay — Interest paid | 還貸 — 利息支出 |
| `pvi.amort.prepay.principal` | Prepay — Principal paid | 還貸 — 本金支出 |
| `pvi.amort.invest.interest` | Invest — Interest paid | 投資 — 利息支出 |
| `pvi.amort.invest.principal` | Invest — Principal paid | 投資 — 本金支出 |
| `pvi.verdict.winsBy` | {0} wins by ${1} at {2} | {0} 在 {1} 多 ${2} |
| `pvi.verdict.tie` | Effectively tied at {0} | 在 {0} 大致打平 |
| `pvi.factor.realSpread.label` | Real return spread | 實質報酬利差 |
| `pvi.factor.timeHorizon.label` | Time horizon | 時間長度 |
| `pvi.factor.ltcgDrag.label` | Tax drag on invested gains | 投資收益稅率 |
| `pvi.factor.mortgageRemaining.label` | Mortgage years remaining | 房貸剩餘年數 |
| `pvi.factor.naturalPayoff.label` | Mortgage paid off before FIRE? | 退休前房貸還清？ |
| `pvi.factor.effectiveRateOverride.label` | Effective rate override active | 實質利率覆寫中 |
| `pvi.factor.plannedRefi.label` | Planned refi | 規劃再融資 |
| `pvi.factor.favors.prepay` | ▼ Favors Prepay | ▼ 偏向還貸 |
| `pvi.factor.favors.invest` | ▲ Favors Invest | ▲ 偏向投資 |
| `pvi.factor.favors.neutral` | ◇ Neutral | ◇ 中性 |
| `pvi.disabled.noMortgage` | Toggle the mortgage on the Mortgage pill to see this analysis. | 在「房貸」分頁啟用房貸後可查看此分析。 |
| `pvi.disabled.alreadyPaid` | Mortgage is already paid off — comparison is moot. | 房貸已還清，無需比較。 |
| `pvi.refi.clamped` | Refi-year was clamped to your home purchase year. | 再融資年份已對齊到你買房的年份。 |

The Catalog file `FIRE-Dashboard Translation Catalog.md` MUST be updated with a new "Payoff vs Invest" section listing all the keys above.
