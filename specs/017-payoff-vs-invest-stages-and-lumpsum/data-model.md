# Phase 1 Data Model — Feature 017

Extends the data model from `specs/016-mortgage-payoff-vs-invest/data-model.md`. Only deltas are documented here.

---

## Input Record Extension

### `PrepayInvestComparisonInputs` (extended)

| Field | Type | Default | Notes |
|---|---|---|---|
| `lumpSumPayoff` | `boolean` | `false` | **NEW.** When `true`, the Invest strategy fires a lump-sum payoff the moment its real-dollar brokerage equals the remaining real-dollar mortgage balance. When `false`, current behavior — Invest pays the mortgage on the bank's amortization schedule. |

All other fields unchanged from feature 016.

**Source of truth:** `pvi.lumpSumPayoff` localStorage key, mirrored to/from a checkbox in the dashboard UI. Read at `assemblePayoffVsInvestInputs()` time.

---

## Output Record Extensions

### `PrepayInvestComparisonOutputs` (extended)

Two new top-level fields added:

```ts
{
  ...all existing 016 outputs unchanged,
  lumpSumEvent: LumpSumEvent | null,
  stageBoundaries: StageBoundaries,
}
```

### New entity: `LumpSumEvent`

Records the moment Invest writes the check, when it fires.

| Field | Type | Notes |
|---|---|---|
| `age` | `number` | The age (years, integer) at which the trigger fired. |
| `monthInYear` | `number` | 0-11 — which month within the age year (informational; the year-snapshot still aggregates this month into that age's row). |
| `brokerageBefore` | `number` | Real $ in Invest brokerage immediately before the check, as a `Math.round()`. |
| `paidOff` | `number` | Real $ subtracted (= remaining real-dollar mortgage balance at trigger month). |
| `brokerageAfter` | `number` | Real $ remaining post-check. By construction `brokerageAfter ≈ brokerageBefore − paidOff` (≥ 0, may be a few dollars from rounding). |

Returns `null` when `lumpSumPayoff === false` OR when the trigger never fires within the simulation horizon.

### New entity: `StageBoundaries`

Defines the event-driven stage layout used by the chart band plugin.

| Field | Type | Notes |
|---|---|---|
| `windowStartAge` | `number` | The age the comparison window begins at. Equals `currentAge + max(0, buyInYears)` for `ownership='buying-in'`, else `currentAge`. |
| `firstPayoffAge` | `number` | The age the first strategy becomes debt-free (mortgage balance hits 0). |
| `firstPayoffWinner` | `'prepay' \| 'invest'` | Which strategy got there first. |
| `secondPayoffAge` | `number \| null` | The age the second strategy becomes debt-free. `null` if the second strategy never pays off within the horizon (e.g., switch OFF and Invest never reaches its natural amortization end before `endAge`, or switch ON and Invest never reaches the lump-sum threshold). |

`firstPayoffAge < secondPayoffAge` when both exist (asserted by Test 6 in spec §8).

### Updated existing field: `mortgageNaturalPayoff.investAge`

When `lumpSumPayoff === true` AND a `lumpSumEvent` was recorded, this field reflects the **lump-sum age** (so the existing chart blue-X marker keeps working without rename). When `lumpSumPayoff === false` OR the lump-sum never fired, this field continues to reflect the bank's amortization-end age (today's behavior).

---

## State Transitions

### Stage detection algorithm (post-loop)

1. Find `firstPayoffAge` = `min(prepayPath[i].age | prepayPath[i].mortgageBalance === 0)` and `min(investPath[i].age | investPath[i].mortgageBalance === 0)`.
2. `firstPayoffWinner` = whichever strategy achieves `firstPayoffAge` first; tie → `'prepay'` (deterministic).
3. `secondPayoffAge` = the larger of the two payoff ages, or `null` if the other strategy's `mortgageBalance` never reaches 0 within the horizon.
4. `windowStartAge` = `prepayPath[0].age` (first row of the path, which already reflects the buying-in window adjustment).

### Lump-sum trigger algorithm (per-month, when switch ON)

```
For each month in the loop, before evaluating Invest's amortization step:
  IF (mortgageStateI.balance > 0)
    realBalance = mortgageStateI.balance / inflationFactor
    IF (investedI >= realBalance)
      lumpSumEvent = {
        age: currentAge,
        monthInYear: monthInYear,
        brokerageBefore: Math.round(investedI),
        paidOff: Math.round(realBalance),
        brokerageAfter: Math.round(investedI - realBalance),
      }
      investedI = investedI - realBalance
      mortgageStateI = { ...mortgageStateI, balance: 0 }
      // Continue this month into the existing "mortgage paid off" branch:
      // P&I + extra → brokerage from this month forward.
```

The lump-sum event is recorded ONCE per simulation. After it fires, `mortgageStateI.balance` stays at 0 and no further lump-sum check runs.

---

## New Audit Sub-Steps (Principle II observability)

The calc module's `subSteps` array (returned in outputs) gains entries when `lumpSumPayoff === true`:

| New sub-step | When emitted |
|---|---|
| `'check lump-sum payoff trigger each month for Invest'` | Always when switch ON. |
| `'lump-sum fires at age {X}: brokerage drops from {Y} to {Z}'` | When trigger fires (with concrete values). |
| `'compute stageBoundaries from path inflection points'` | Always. |
| `'window starts at buy-in age (year offset {N})'` | Only for `ownership='buying-in'` with `buyInYears > 0`. |

---

## New Translation Keys (Principle VII)

8 new keys, EN + zh-TW, added to `TRANSLATIONS.en` / `TRANSLATIONS.zh` blocks in **both** HTML files AND to `FIRE-Dashboard Translation Catalog.md`:

| Key | EN | zh-TW |
|---|---|---|
| `pvi.lumpSum.label` | Pay off mortgage in lump sum once Invest can afford it | 投資組合足以清償房貸時一次清償 |
| `pvi.lumpSum.help` | Compare what happens if Invest writes a check the moment its brokerage equals the remaining mortgage (today's dollars). | 比較投資策略在組合餘額（今日購買力）達到剩餘貸款時一次清償的情境。 |
| `pvi.lumpSum.bannerLine` | Lump-sum payoff fires at age {0} · brokerage drops from ${1} to ${2}, then resumes investing. | 一次清償於 {0} 歲觸發 · 投資組合由 ${1} 降至 ${2}，之後重新累積。 |
| `pvi.lumpSum.notReached` | Invest never reaches the lump-sum threshold in this horizon. | 投資策略在此期間未達一次清償門檻。 |
| `pvi.stageBand.bothPaying` | Stage I — both strategies still paying mortgage | 階段 I — 兩種策略仍在償還貸款 |
| `pvi.stageBand.firstPayoffPrepay` | Stage II-P — Prepay debt-free, Invest still paying | 階段 II-P — Prepay 已清償，Invest 仍在償還 |
| `pvi.stageBand.firstPayoffInvest` | Stage II-I — Invest debt-free via lump sum, Prepay still paying | 階段 II-I — Invest 已透過一次清償還清，Prepay 仍在償還 |
| `pvi.stageBand.bothFree` | Stage III — both strategies debt-free, both investing | 階段 III — 兩種策略均已清償，皆全力投資 |

zh-TW translations above are illustrative drafts for the translator's review — final wording reviewed during implementation.
