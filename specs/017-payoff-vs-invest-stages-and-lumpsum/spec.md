# Feature 017 — Payoff vs Invest: Stage Model & Lump-Sum Payoff Branch

**Created:** 2026-04-29
**Status:** Spec — pending user review before writing-plans
**Predecessor:** Feature 016 (`specs/016-mortgage-payoff-vs-invest/`) shipped the original Payoff-vs-Invest comparison. This feature evolves it.
**Branch:** Suggested `017-payoff-vs-invest-stages-and-lumpsum` (new branch off main; current branch `016-mortgage-payoff-vs-invest` is awaiting merge).
**Lockstep:** All UI/calc changes ship to both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html`.

---

## 1. Motivation

The current Payoff-vs-Invest brokerage chart has two correctness/clarity gaps the user surfaced on 2026-04-29:

1. **Pre-buy-in artifact.** For `ownership='buying-in'` scenarios (e.g., home purchase at age 44, comparison currentAge=42), the calc puts the extra monthly cash into both strategies' brokerages during the 2-year pre-buy-in window, then compounds it forward. Result: at age 58, the Prepay line shows ~$45K instead of staying near $0 throughout the "still paying mortgage" stage. The user expects Prepay to be at $0 throughout Stage I.
2. **Missing lump-sum branch.** Today the Invest path always pays its mortgage on the bank's amortization schedule (natural payoff at age 73 in the user's scenario). The user wants to see what happens if Invest writes a check the moment its brokerage equals the remaining mortgage — the dramatic drop and recovery is the central story they want the chart to tell.

The user's exact phrasing: "I need the truth."

## 2. Stage Model (event-driven, order-agnostic)

Stages are named by **event**, not by number, because the lump-sum branch can fire before Prepay's natural payoff in high-return scenarios (Q4 in the brainstorm — confirmed user wants Stage 3 to be able to precede Stage 2).

| Stage | Name | Both-strategy behavior |
|---|---|---|
| **I** | Both paying | Prepay extra → mortgage principal (brokerage stays $0). Invest extra → brokerage (compounds). |
| **II** | First-payoff | One strategy is debt-free; the other still paying. Sub-cases below. |
| **III** | Both debt-free | Both invest (P&I + extra) until end-of-life. Curves grow in parallel. |

**Stage II sub-cases:**

- **II-P (Prepay-first, typical case):** Prepay finished its accelerated payoff. Prepay now redirects (P&I + extra) to brokerage. Invest continues with extra-only OR fires the lump-sum check during this stage if conditions are met.
- **II-I (Invest-first, only possible when switch is ON and returns are high):** Invest fired the lump-sum check; Invest's brokerage dropped by `realMortgageBalanceI`; Invest now redirects (P&I + extra) to brokerage. Prepay is unaffected — it continues its accelerated payoff (extra → principal, brokerage stays $0) until its own natural payoff, which marks the start of Stage III.

## 3. Window Start Rule (Q1=C)

The comparison window begins at:

- `currentAge + max(0, buyInYears)` for `ownership='buying-in'`.
- `currentAge` for `ownership='buying-now'` and `ownership='already-own'`.

Pre-buy-in years are **excluded** from the path arrays, the amortization split, and the chart x-axis. Both `prepayPath[0].invested === 0` and `investPath[0].invested === 0` for buying-in. The yellow "home purchase" diamond is dropped for buying-in (redundant — it'd always sit at x=0).

## 4. Lump-Sum Trigger Rule

**Switch input** (Q3=B): new boolean input `lumpSumPayoff`, default `false`. Wired from a new UI checkbox below the existing "Extra monthly cash" slider, persisted to `localStorage` under key `pvi.lumpSumPayoff`.

**Trigger condition** (Q2=A, Q4=A): when the switch is ON, evaluate at the start of every month for the Invest strategy:

```
realMortgageBalanceI = mortgageStateI.balance / inflationFactor
fire if (mortgageStateI.balance > 0 && investedI >= realMortgageBalanceI)
```

The trigger is in **real dollars on both sides**, matching the chart's units, so the user can read off the trigger visually as the moment the Invest curve crosses the (real-dollar) remaining-mortgage line. The trigger fires **regardless of where Prepay is** — purely a function of Invest's own brokerage versus Invest's own remaining real balance.

**On fire:** `investedI` is reassigned to `investedI - realMortgageBalanceI`; `mortgageStateI` is replaced (Object.assign-style, consistent with existing immutable update pattern in the module) with `{ ...mortgageStateI, balance: 0 }`; the same monthly iteration falls through to the existing "mortgage paid off" branch and contributes (P&I + extra) to brokerage for the remainder of that month.

## 5. Calc Module Changes (`calc/payoffVsInvest.js`)

### Inputs

```ts
PrepayInvestComparisonInputs {
  ...existing fields,
  lumpSumPayoff: boolean   // NEW — default false
}
```

### Output additions

```ts
PrepayInvestComparisonOutputs {
  ...existing fields,
  lumpSumEvent: {
    age: number,
    brokerageBefore: number,   // real $
    paidOff: number,           // real $ subtracted
    brokerageAfter: number,    // real $; ≈ 0 by construction
  } | null,
  stageBoundaries: {
    windowStartAge: number,
    firstPayoffAge: number,
    firstPayoffWinner: 'prepay' | 'invest',
    secondPayoffAge: number | null,   // null if second strategy never pays off in horizon
  },
}
```

### Output mutations

- `mortgageNaturalPayoff.investAge` reflects the **lump-sum age** when the switch is ON and the trigger fires; reflects the natural amortization-end age otherwise. (This keeps the existing chart marker working without a rename.)
- `verdict.naturalPayoffYear` remains the bank's amortization-end age, unchanged by the lump-sum event.

### Code-level changes

1. **Window start:** replace `for (let age = inputs.currentAge; ...)` with a loop bounded by `windowStartAge = currentAge + max(0, buyInYears)` for buying-in, else `currentAge`. Remove the `else if (!mortgageActiveThisMonth)` pre-buy-in branches in both Prepay and Invest sections — they no longer execute.
2. **Lump-sum trigger:** inside the monthly Invest-strategy block, before the existing `mortgageStateI.balance > 0` check, evaluate the trigger condition above. If fired, reassign `investedI` and replace `mortgageStateI` (immutable Object.assign per the module's existing pattern), record the event in a closure-scoped `lumpSumEvent` variable, then fall through.
3. **Stage boundary detection:** after the main loop, scan both paths to populate `stageBoundaries.firstPayoffAge`, `firstPayoffWinner`, and `secondPayoffAge` from the `mortgageBalance === 0` transitions in each path.

### Backwards-compatibility invariant

When `lumpSumPayoff === false` AND `ownership !== 'buying-in'`, every output field is **byte-for-byte identical** to today's behavior. Locked by a regression test (Section 8).

## 6. UI Changes (lockstep across both HTML files)

### Switch placement (Q5=B)

Directly below the existing "Extra monthly cash to allocate $1,000" slider, on its own row inside the Payoff-vs-Invest tab. Same dark-card styling as adjacent toggles. Element:

```
[ ] Pay off mortgage in lump sum once Invest can afford it
    Compare what happens if Invest writes a check the moment its
    brokerage equals the remaining mortgage (today's dollars).
```

State persists in `localStorage` under `pvi.lumpSumPayoff`. Checkbox change event triggers a recompute and re-render of the brokerage chart, the amortization chart, and the verdict banner.

### Verdict banner (Q7=B)

| Switch state | Banner |
|---|---|
| OFF | Unchanged from today (Line 1 = Prepay payoff age, Line 2 = Invest payoff age + endAge comparison). |
| ON, trigger fires | Same Lines 1 & 2 PLUS Line 3: "Lump-sum payoff fires at age {X} · brokerage drops from ${Y} to ${Z}, then resumes investing." |
| ON, trigger never fires | Lines 1 & 2 as today, plus a small italic note: "Invest never reaches the lump-sum threshold in this horizon." |

### Translation strings

New entries (EN + 中文) in `FIRE-Dashboard Translation Catalog.md`:
- `pvi.lumpSum.label`
- `pvi.lumpSum.help`
- `pvi.lumpSum.bannerLine`
- `pvi.lumpSum.notReached`
- `pvi.stageBand.bothPaying`
- `pvi.stageBand.firstPayoffPrepay`
- `pvi.stageBand.firstPayoffInvest`
- `pvi.stageBand.bothFree`

## 7. Chart Changes (Q6=C)

### Background bands

A small custom Chart.js plugin (no new dependency) painted in `beforeDatasetsDraw`. Three full-height rectangles:

| Stage | CSS variable | Opacity |
|---|---|---|
| I (Both paying) | `--chart-phase1` | 6% |
| II (First-payoff) | `--chart-phase2` | 6% |
| III (Both debt-free) | `--chart-phase3` | 6% |

X-extents driven by `stageBoundaries.firstPayoffAge` and `secondPayoffAge`. Legend hover shows the stage label including the correct II sub-case ("II-P — Prepay debt-free, Invest still paying" vs "II-I — Invest debt-free via lump-sum, Prepay still paying").

### Lump-sum drop

Naturally rendered by the Invest line connecting `liquidNetWorth` row-to-row through the trigger month — no special handling needed since the data row at the trigger month already reflects the post-drop value.

The existing blue X marker at the natural-payoff age becomes a labeled blue **down-arrow** at the lump-sum age when the switch is ON and the trigger fires; reverts to today's blue X at the natural-payoff age when the switch is OFF.

### X-axis

Starts at `windowStartAge`. For `buying-now`/`already-own`, no visible change. For `buying-in`, the first x-tick is the buy-in age; the yellow "home purchase" diamond is dropped (it'd always sit at x=0).

## 8. Tests (`tests/unit/payoffVsInvest.test.js`)

### Regression lock (highest priority)

When `lumpSumPayoff: false` AND `ownership: 'buying-now'`, every existing fixture's output is byte-identical to today. Adapt all current tests to also pass `lumpSumPayoff: false` explicitly.

### New cases

1. **Window start for buying-in.** `ownership='buying-in'`, `buyInYears=2` → `path[0].age === currentAge + 2`, `path[0].invested === 0` for both strategies, no pre-buy-in rows present.
2. **Lump-sum fires after Prepay payoff (typical).** 6% mortgage / 7% stocks / 4% inflation / extraMonthly=$1000 with switch ON → `lumpSumEvent.age` is between `prepayNaturalPayoffAge` and the natural-amortization-end of Invest. `investedI` drops by ≈ `realMortgageBalanceI` (within $1 rounding).
3. **Lump-sum fires before Prepay payoff (high-return).** stocksReturn=0.12, extraMonthly=$3000 → `lumpSumEvent.age < prepayNaturalPayoffAge` and `stageBoundaries.firstPayoffWinner === 'invest'`.
4. **Lump-sum never fires (low-return horizon).** stocksReturn=0.04, extraMonthly=$200 → `lumpSumEvent === null` despite switch ON; calc completes without error.
5. **Interest invariant.** Cumulative interest paid: `prepay < invest_lumpSum < invest_keepPaying` for any non-degenerate scenario (lump-sum saves Invest some late-stage interest).
6. **Stage boundaries consistency.** `firstPayoffAge < secondPayoffAge` (when both exist); `firstPayoffWinner` matches the strategy whose payoff age equals `firstPayoffAge`.
7. **Already-own backwards compat.** ownership='already-own' fixture unchanged with switch=false.

Coverage target: 80%+ overall (project standard); every new branch in the calc module hit by at least one test.

## 9. Out of Scope

- Sensitivity analysis / Monte Carlo for the lump-sum branch.
- Tax modeling for the act of selling brokerage to fund the lump-sum (terminal LTCG row in the factor table is the only place this gets surfaced; we don't deduct it from the lump-sum amount).
- Re-modeling the lump-sum event for the Prepay strategy (Prepay never has a brokerage to draw from in Stage I, so the concept doesn't apply).
- Changing the existing `mortgageFreedom` / `freeAndClearWealth` outputs — they remain as-is for any consumer relying on them.

## 10. Open Questions

None — all design decisions answered in the brainstorm transcript on 2026-04-29.

## 11. Decision Log (brainstorm 2026-04-29)

| # | Question | Choice |
|---|---|---|
| Q1 | Pre-buy-in cash for Prepay | **C** — skip pre-buy-in entirely, window starts at buy-in age |
| Q2 | Lump-sum threshold rule | **A** — brokerage ≥ remaining mortgage in real dollars |
| Q3 | Switch default state | **B** — default OFF (today's behavior); ON triggers lump-sum |
| Q4 | Lump-sum vs. Prepay timing | **A** — fires whenever Invest's condition is met, even if before Prepay's payoff |
| Q5 | Switch UI placement | **B** — primary placement, near the extra-monthly slider |
| Q6 | Stage transition visualization | **C** — shaded background bands |
| Q7 | Verdict banner copy | **B** — keep both natural-payoff lines, add a third lump-sum line |
