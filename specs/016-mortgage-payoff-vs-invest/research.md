# Phase 0 — Research

**Feature**: 016-mortgage-payoff-vs-invest
**Date**: 2026-04-28

This file resolves open technical questions surfaced during planning. Each entry follows the standard `Decision / Rationale / Alternatives considered` format.

---

## R1 — Compounding frequency for the year-by-year simulation

**Decision**: **Monthly compounding** for both the mortgage amortization schedule and the investment account.

**Rationale**:
- Mortgage payments are billed monthly. The amortization formula banks use (`P_n = M − I_n` where `I_n = balance_n × rate/12`) is monthly by construction. Modeling annual-only would round 12 monthly interest accruals into one lump per year — typically over- or under-stating interest by ~0.4 % per year at 6 % nominal, accumulating to a noticeable error over a 30-year horizon.
- The Invest path's monthly cadence matches the user's mental model ("I have $500/month extra" → that money is earning return for the months it sits in the account, not just at year-end).
- Computational cost: 50-year × 12 months × 2 strategies = 1,200 iterations per recompute. Trivial.
- Existing `projectFullLifecycle` uses **annual** real return (`realReturn = returnRate − inflationRate`) but the lifecycle chart is annual-resolution by design. Our pill is also annual-resolution for display, but the underlying month-step accrual gives more honest year-end values.

**Alternatives considered**:
- **Annual compounding** for both. Simpler code (one loop) and matches the existing dashboard's annual-resolution lifecycle. Rejected because the front-loaded-interest visualization (FR-018) would lose fidelity — at annual granularity, the per-year interest curve is already aggregated and the "first months are mostly interest" effect can't be shown sub-year. Monthly accrual aggregated to annual display preserves the truth without changing the chart shape.
- **Continuous compounding** (`P × e^(rt)`). Marginal accuracy over monthly; opaque to readers; not how banks actually amortize. Rejected.

---

## R2 — Home appreciation rate

**Decision**: Default to **real-zero** appreciation (i.e., home value grows at exactly the inflation rate, so its real value is constant). No new slider in v1.

**Rationale**:
- Real-zero is a conservative, defensible long-horizon assumption for a primary residence in most US markets. Case-Shiller's 100+ year average is approximately +1 % real for nationally-averaged single-family homes; recent decades have been higher in coastal metros and lower in rust-belt areas. Picking +1 % universally would over-promise; picking real-zero under-promises slightly but cannot be accused of inflating the Prepay path's home-equity component artificially.
- A future feature (or US-extension as a stretch goal of this one) could add a "Home appreciation rate (real)" slider. For v1, keeping it baked in keeps the input surface small.
- The `Net-worth framing` toggle (FR-010) lets the user switch to Liquid-only framing, which sidesteps the home-equity question entirely if they want.

**Alternatives considered**:
- **+1 % real** (Case-Shiller national long-run). Rejected for v1 because it pushes the verdict toward Prepay (more real home equity = more total net worth from prepay-faster), and the user could perceive that as the tool advocating prepay. Real-zero is the "no thumb on the scale" choice.
- **User-configurable slider**. Worthy follow-up but expands input surface beyond what the spec calls for.

---

## R3 — How LTCG tax drag is applied to the Invest path

**Decision**: **Continuous drag** on the real return rate. The Invest path's effective annual real return = `(returnRate − inflationRate) × (1 − ltcgRate × stockGainPct)`.

**Rationale**:
- This matches how `signedLifecycleEndBalance` and the existing lifecycle chart treat post-tax returns — drag is folded into the per-year compounding rate, not bookkept as a one-time terminal sale tax.
- For visualization purposes, continuous drag means the year-by-year line is honestly reduced every year; a terminal-only tax would show artificially-inflated growth that suddenly drops at the end, confusing the comparison narrative.
- `stockGainPct` (existing slider, default 0.6 = 60 %) represents the long-term capital-gain portion of total return; the rest (dividends, interest, return-of-capital) is taxed differently or not at all. This factor is already exposed and the user is familiar with it.

**Alternatives considered**:
- **Terminal-only tax**: compute pre-tax growth, then apply LTCG at sale. More accurate for an actually-realized sale, but the comparison is hypothetical (you're not actually selling on a fixed date). Rejected.
- **Marginal-rate tax-deferred drag** (modeling the entire account as Roth): too optimistic; assumes after-tax dollars going into a tax-free vehicle, which contradicts "extra after-tax cash to a taxable brokerage" (the v1 assumption).

---

## R4 — Effective mortgage rate override: schedule vs verdict

**Decision**: The FR-021 "Effective mortgage rate (after-tax)" override applies **only** to the Verdict and Factor Breakdown calculation. The amortization schedule (P&I, balance, principal/interest split) **continues to use the nominal contractual rate** in both strategies.

**Rationale**:
- Banks bill at the contractual rate. The override represents the user's *economic* interest cost after state-MID savings, not what the bank charges. If we used the override for the schedule, the monthly P&I would shrink, the principal would amortize faster, and we'd be inventing cash flow the user doesn't actually have.
- The verdict/spread calculation, which compares "interest avoided by prepaying" against "investment gains," DOES need the user's economic cost. So the override only enters the spread arithmetic, not the cash-flow simulation.
- Concrete formula: `interestCostPrepay_economic = sum(monthlyInterest_n) × (effectiveRate / nominalRate)` — proportional rescale of the cumulative bank-billed interest by the override ratio.

**Alternatives considered**:
- **Override the schedule too**: would visibly change the trajectory chart's mortgage curve, which is wrong (the user's actual cash flow is still nominal-rate). Rejected.
- **Override only at verdict-summary time, not in Factor Breakdown values**: would make the Factor Breakdown lie about which factor pushes the verdict. Rejected; the override needs to be visible in the breakdown.

---

## R5 — Refinance mechanics

**Decision**: At `refiYear`, the remaining mortgage balance carries forward, a new amortization schedule is computed for `newTerm × 12` months at the new rate, and a new monthly P&I replaces the old one. Both strategies experience the refi simultaneously.

Concrete steps at the start of `refiYear`:
1. Capture `balanceAtRefi` from each strategy's running mortgage balance.
2. Compute `newPI = pmt(balanceAtRefi, newRate / 12, newTerm × 12)` using the standard payment formula.
3. From `refiYear` onward, both strategies use `newPI` and the new amortization schedule for the next `newTerm` years.
4. The Prepay path keeps applying its `extraMonthly` to principal of the new schedule.
5. The "Where each dollar goes" chart shows interest jumping back up at `refiYear` (year 1 of new amortization is interest-heavy).

**Rationale**:
- This is how a real refinance behaves: balance moves into a new loan, term resets, P&I recomputed, fresh amortization clock.
- Does NOT model: closing costs (out of scope per spec), points buy-down, no-cost refi offset, term-extension via cash-out (different product), or interest deductibility on refinanced principal.

**Alternatives considered**:
- **Refi keeps the original term remaining** (e.g., 30y minus already-paid years → refi to that remaining length). Less common in practice; users typically reset to a new 30 or step down to a 15. Rejected as default; could be a future option.
- **Refi-at-remaining-balance with rate-only change** (no term reset). This is rarely available from banks; reset to a new term is standard. Rejected.

---

## R6 — Tooltip + crossover detection algorithm

**Decision**: Crossover detection uses linear interpolation between adjacent year values. If `wealthPrepay[y] < wealthInvest[y]` and `wealthPrepay[y+1] > wealthInvest[y+1]` (or vice versa), the crossover age is `y + delta` where `delta` is solved from the linear segments. Display rounds to the nearest year for the marker label but stores fractional age for tie-breaking.

**Rationale**: Years are discrete in our chart; the actual crossover may fall mid-year. Showing "crossover at age 47" is more useful than "between 46 and 47." Linear interpolation is the standard chart-overlay approximation; full month-by-month root-finding would be overkill at this scale.

**Alternatives considered**: Bisection at month resolution (overkill), nearest-year-only display (loses precision).

---

## R7 — Where the new pill plugs into tabRouter

**Decision**: Add `payoff-invest` as a new pill in the `plan` tab's pill list inside `calc/tabRouter.js`, positioned between `mortgage` and `expenses`.

**Rationale**: The tabRouter's `TABS` constant is the single source of truth for pill registration. Adding the entry there makes the URL hash (`#tab=plan&pill=payoff-invest`) work and the storage round-trip work. The router is already proven by features 013–015.

**Alternatives considered**: Special-case rendering without registering with the router — rejected, breaks the chart-resize-on-activate hook (Feature 013 T018).

---

## Open items deferred to implementation

None. All technical questions are resolved at design time. The implementer can proceed directly from `data-model.md` + the three contract files + `quickstart.md`.
