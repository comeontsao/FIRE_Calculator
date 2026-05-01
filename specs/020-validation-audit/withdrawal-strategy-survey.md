# Withdrawal Strategy Survey — Feature 020 Phase 9 (US6)

**Status**: Research deliverable for FR-023 / SC-007. Resolves R6 (deferred from Phase 0).
**Author**: Research Agent, 2026-04-30.
**Companion**: full audit context in [`spec.md`](./spec.md), [`research.md`](./research.md).

## Purpose

The FIRE Calculator ships seven deterministic, tax-aware strategies — `bracket-fill-smoothed` (default), `trad-first`, `roth-ladder`, `trad-last-preserve`, `conventional`, `proportional`, `tax-optimized-search`. All share one chassis: a year-by-year deterministic projection that splits each year's spending need across four asset pools (Trad / Roth / Stocks / Cash), pays bracket-fill federal tax on the Trad slice, and rolls balances forward at the configured real return rate. They differ only in *which pool gets pulled first*.

This survey evaluates six widely-cited strategies from outside that family — strategies that adjust *how much is spent each year* rather than *which pool funds it*. Each entry covers definition, source, fit with the dashboard's deterministic + bracket-fill model, and a recommendation.

## Today's calc model — what new strategies must fit into

Three constraints anchor every fit assessment below:

1. **Deterministic single-path projection.** `projectFullLifecycle` advances year-by-year at a fixed real-return rate. No Monte Carlo, no historical bootstrap. Strategies whose decision rules need a distribution of paths cannot be honestly evaluated without a new stochastic subsystem.
2. **Constant real spending across retirement.** `annualSpend` is held flat in real terms. Strategies that vary spending year-over-year (VPW, Guyton-Klinger, Vanguard dynamic, RMD-based) need the spend number to become a per-year *output* rather than a per-scenario *input*.
3. **Bracket-fill tax smoothing is structural.** Trad withdrawals fill standard-deduction + 12%-bracket headroom each year (with safety margin); residual spending spills to Stocks/Roth/Cash via the active strategy's ordering. New strategies must compose with bracket-fill or explicitly opt out.

---

## Strategy 1 — 4% Rule (Bengen 1994 + Trinity Study 1998)

### Definition

In year 1 of retirement, withdraw 4% of the starting portfolio. Each subsequent year, withdraw the **previous year's dollar amount adjusted upward for prior-year CPI** — a fixed real-dollar stream that does NOT recompute the percentage against the current balance. Bengen's original finding: 4.15% on a 50/50 stock/bond portfolio survived every rolling 30-year window in U.S. data from 1926 onward. The Trinity Study refined this into portfolio-success-rate tables across 15/20/25/30-year horizons and 0%–100% stock allocations.

### Origin / Source

- **William P. Bengen, "Determining Withdrawal Rates Using Historical Data,"** *Journal of Financial Planning*, October 1994. FPA archive: <https://www.financialplanningassociation.org/sites/default/files/2021-04/MAR04%20Determining%20Withdrawal%20Rates%20Using%20Historical%20Data.pdf>
- **Cooley, Hubbard, and Walz, "Retirement Savings: Choosing a Withdrawal Rate That Is Sustainable,"** *AAII Journal*, vol. 20 no. 2 (Feb 1998), pp. 16–21. PDF: <https://www.aaii.com/journal/199802/feature.pdf>
- Bengen has since revised his floor upward (~4.5–4.7% in *A Richer Retirement*, 2023). Bankrate summary: <https://www.bankrate.com/retirement/revised-4-percent-rule/>

### Model fit assessment

The 4% rule maps onto the existing chassis at the *gate* level — `annualSpend` is already held flat in real terms. The user can test "4% feasibility" today by setting `annualSpend = 0.04 × startingPortfolio` and running Safe mode. No calc change is required to *check* the rule.

What the calc does NOT do is compute the safe withdrawal rate **backwards**: given a portfolio, find the maximum constant-real `annualSpend` that survives N years. That's solvable by bisecting on `annualSpend` instead of `fireAge` using the existing year-precision search. No new state, no per-year split changes, composes identically with bracket-fill. Monte Carlo not required — Bengen's prescription is a deterministic spending rule even though the underlying research used historical sequences.

### Recommendation: **DEFER**

The rule's *spirit* is already in the dashboard. The missing piece is a "max sustainable spend" reverse-solver UI — a small addition (one field, one bisection helper) but a feature in its own right. Defer to a future SWR-solver feature.

---

## Strategy 2 — Variable Percentage Withdrawal (VPW)

### Definition

Each year, withdraw `percentage(age, allocation) × current_portfolio_balance`, where the percentage is read from a published age × allocation table. Percentages rise monotonically with age — e.g., 4.4% at age 65 (30/70 stocks/bonds), ~5% at 70, ~7% at 80, capped at 10% at the oldest ages. Because the rate is recomputed each year against the *current* balance, withdrawals **rise after good years and fall after bad years**, mathematically guaranteeing the portfolio cannot run dry before the table's terminal age (typically 100). The trade-off: real-dollar spending varies year-to-year, sometimes substantially.

### Origin / Source

- **Bogleheads wiki, "Variable percentage withdrawal."** Canonical reference with the full age × allocation table and the VPW Accumulation And Retirement Worksheet. URL: <https://www.bogleheads.org/wiki/Variable_percentage_withdrawal>
- **Bogleheads forum thread, "Variable Percentage Withdrawal: How were the tables built?"** — derivation. URL: <https://www.bogleheads.org/forum/viewtopic.php?t=356421>
- Principal author: Longinvest (Bogleheads contributor). Master forum thread: <https://www.bogleheads.org/forum/viewtopic.php?t=120430>

### Model fit assessment

VPW breaks constraint #2 (constant real spending). The calc would need `annualSpend[year]` as a per-year *output*, not a per-scenario input. Every consumer (gate, Lifecycle chart, Withdrawal Strategy chart, ranker residualArea) would need a year-indexed array instead of a scalar.

VPW is **fully deterministic** — table lookups completely determine per-year withdrawals given starting portfolio, age, and allocation. No Monte Carlo. It composes with bracket-fill cleanly: VPW sets the year's *total* dollar withdrawal, bracket-fill chooses the pool split. VPW's percentage is computed against the *total* portfolio (Trad + Roth + Stocks + Cash combined), so pool segregation logic stays identical. One subtlety: the main table starts at age 65; FIRE users retiring earlier need the `vpw_early` extension — a second embedded table.

### Recommendation: **DEFER**

VPW is the most-respected dynamic strategy in the Boglehead ecosystem and complements existing constant-real strategies. Requires (a) per-year `annualSpend` as a calc output, (b) two embedded age-allocation tables, (c) UI for "real-dollar spend varies year-to-year." A discrete feature in its own right.

---

## Strategy 3 — Guyton-Klinger Decision Rules / Guardrails

### Definition

Start with a 5–5.6% initial withdrawal rate (higher than 4% because rules adapt downward when needed). Each year apply four decision rules to last year's withdrawal:

1. **Inflation rule** — bump last year's withdrawal by CPI, capped at 6% nominal.
2. **Withdrawal rule** — skip the inflation bump if last year's portfolio return was negative AND the current WR exceeds the initial WR.
3. **Capital preservation rule** (upper guardrail) — if current WR has risen >20% above initial (portfolio fell), CUT spending by 10%.
4. **Prosperity rule** (lower guardrail) — if current WR has fallen >20% below initial (portfolio grew), RAISE spending by 10%.

The guardrails create a self-stabilizing band: 10% cut after a crash, 10% raise after a bull run. In Monte Carlo backtests, Guyton-Klinger supports 5.2%–5.6% initial WRs at 99% confidence — meaningfully above the 4% rule.

### Origin / Source

- **Jonathan T. Guyton and William J. Klinger, "Decision Rules and Maximum Initial Withdrawal Rates,"** *Journal of Financial Planning*, March 2006. PDF: <https://www.financialplanningassociation.org/sites/default/files/2021-11/2006%20-%20Guyton%20and%20Klinger%20-%20Decision%20Rules%20and%20SWR%20%281%29.PDF>
- Predecessor: Guyton (solo), "Decision Rules and Portfolio Management for Retirees," *JFP*, October 2004.
- Critical view: Michael Kitces, "Why Guyton-Klinger Guardrails Are Too Risky For Retirees." URL: <https://www.kitces.com/blog/guyton-klinger-guardrails-retirement-income-rules-risk-based/>
- Practitioner summary: White Coat Investor. URL: <https://www.whitecoatinvestor.com/guyton-klinger-guardrails-approach-for-retirement/>

### Model fit assessment

Breaks BOTH constraint #1 and #2. Rules are **path-dependent**: rule 2 and rule 3 trigger off prior-year portfolio return, which in a deterministic model is a fixed function of the configured real-return rate. Result: rules either always fire or never fire depending on whether the configured rate exceeds the trigger thresholds. That defeats the purpose — the rules are designed to react to *volatility around the average*, not to the average itself. Without return-path sampling, Guyton-Klinger collapses to "4% rule with a higher starting WR" or "a deterministic step-down schedule locked in on year 1."

A meaningful implementation needs a stochastic return generator (normal-distribution sampler at minimum, ideally a historical bootstrap), multi-path simulation with per-path GK spending evolution, and a percentile-fan spending chart. XL effort.

### Recommendation: **DEFER**

Defer until the calc engine grows Monte Carlo. Once that subsystem lands, Guyton-Klinger is the natural first dynamic strategy to layer on top — most-validated in the financial-planning literature, four simple rules. Without Monte Carlo it would be misleading.

---

## Strategy 4 — Bucket Strategy (Evensky)

### Definition

Time-segment the portfolio into two or three buckets by withdrawal horizon:

- **Bucket 1 (cash reserve)** — 1–2 years of spending in money-market / short cash. Funds withdrawals directly.
- **Bucket 2 (intermediate, optional)** — 3–7 years of spending in short-to-intermediate bonds.
- **Bucket 3 (long-term)** — everything else, in stocks.

Discipline: **withdrawals always come from Bucket 1**. When depleted (or on an annual refill cycle), Bucket 1 is refilled from Bucket 2/3, typically by selling equities only in years when the market is up. The intent: avoid "selling at the bottom" — give equities 5+ years to recover from any drawdown before being touched.

### Origin / Source

- **Harold Evensky** introduced the two-bucket "cash reserve" approach in 1985. Formalized in *The New Wealth Management* (Evensky/Horan/Robinson, Wiley 2011).
- **Christine Benz, "The Bucket Approach to Retirement Allocation,"** Morningstar — the canonical practitioner writeup. URL: <https://www.morningstar.com/portfolios/bucket-approach-building-retirement-portfolio>
- **Capital Group, "The bucket approach to retirement income."** URL: <https://www.capitalgroup.com/advisor/practicelab/articles/bucket-strategy-retirement-income.html>
- **Critical view**: Javier Estrada, "The Bucket Approach for Retirement: A Suboptimal Behavioral Trick?" IESE working paper, 2018. Argues no superior financial performance vs. a rebalanced portfolio — behavioural value only. PDF: <https://blog.iese.edu/jestrada/files/2019/01/BucketApproach.pdf>

### Model fit assessment

Surface-level fit is excellent: withdraw-from-cash-first is mechanically a `cash-first` pool-ordering variant the existing ranker can already approximate. Two-bucket version: "always withdraw from Cash, refill Cash from Stocks at year-end." Three-bucket version requires a new Bonds pool, which the dashboard does not currently model (each pool is a single real-return scalar, not subdivided into equity/fixed-income).

The deeper issue: **bucket strategies are a sequence-of-returns construct**. Evensky's behavioural value comes from segregating equity drawdowns from spending — meaningful only when returns are stochastic. In a deterministic projection with identical returns every year, "Cash first then refill from Stocks" has the same outcome as "Stocks first" (modulo cash's lower growth). The dashboard would render the mechanics correctly but would not capture the actual *purpose*. Estrada (2018) and Kitces argue the supposed sequence-protection is illusory even with Monte Carlo when equity allocation is sized to deliver equivalent risk control via rebalancing — the financial case is *contested*; what most practitioners now defend is purely behavioural.

### Recommendation: **SKIP**

Two reasons. First: in a deterministic model the two-bucket version collapses into `cash-first`-adjacent ranker options that already exist; shipping it as a named strategy would imply sequence-of-returns protection the dashboard isn't actually providing. Second: even with Monte Carlo, the academic case (Estrada, Kitces, Pfau) for bucket strategies is weaker than for VPW or Guyton-Klinger — the value is behavioural, not financial. Skip as a dedicated strategy.

---

## Strategy 5 — Vanguard Dynamic Spending Rule

### Definition

Each year compute two anchors: a **ceiling** (last year's spending × `(1 + ceilingPct)`, e.g., +5%) and a **floor** (last year's × `(1 + floorPct)`, e.g., −2.5%). Then compute "ideal" spending as a target percentage of the current portfolio (e.g., 4% or 5%). Apply the ideal but clamp: if it exceeds the ceiling, take the ceiling; if it falls below the floor, take the floor. Result: **enjoy good markets** (up to +5% real raise), **cushion bad markets** (cuts limited to −1.5% or −2.5% real) — a hybrid between the rigidity of 4% and the volatility of pure VPW.

In Vanguard's tests, a 5% ceiling / −2.5% floor on a 50/50 portfolio achieved >85% survival over 35 years.

### Origin / Source

- **Vanguard Research, "From assets to income: A goals-based approach to retirement spending,"** Jaconetti et al. (2017, updated 2020). The canonical white paper. PDF mirror: <https://static1.squarespace.com/static/5a29de13e5dd5b5fb7021e6c/t/5f24496b6a74cc6a86087807/1596213612245/Vanguard+-+Dynamic+Spending.pdf>
- **Vanguard Research, "Fuel for the F.I.R.E.: Updating the 4% rule for early retirees,"** — FIRE-specific application. PDF: <https://www.vanguardmexico.com/content/dam/intl/americas/documents/mexico/en/fuel-for-the-fire.pdf>
- **AAII summary**, "Vanguard's Dynamic Spending Strategy for Retirees." URL: <https://www.aaii.com/journal/article/vanguards-dynamic-spending-strategy-for-retirees>

### Model fit assessment

Same fundamental issue as Guyton-Klinger: ceiling/floor clamps trigger off year-over-year portfolio performance, which in a deterministic projection is a fixed function of the configured real-return rate. Without Monte Carlo the rules always fire or never fire — there's no volatility to adapt to. Vanguard's 85% survival claim is a stochastic result, meaningless in a single-path model. A degenerate deterministic version exists (cap real spending changes at ±X% per year) but provides little value over today's constant-real model. The more interesting Vanguard claim — early retirees can support ~4.7% WRs over 50 years under dynamic spending — also needs Monte Carlo.

### Recommendation: **DEFER**

Defer pending Monte Carlo, same as Guyton-Klinger. Once Monte Carlo exists, Vanguard's rule is worthwhile: institutionally trusted source, mechanism simpler than Guyton-Klinger (two bounds vs. four rules), FIRE-specific paper addresses the user's use case directly. The headline survival rate and ceiling/floor calibration are stochastic claims; implementing without Monte Carlo would misrepresent the strategy.

---

## Strategy 6 — RMD-Based Withdrawal (Sun & Webb 2012)

### Definition

Each year, withdraw `current_portfolio_balance / IRS_uniform_lifetime_distribution_period(age)` — divide the total portfolio by the IRS's published distribution period at the retiree's age. The IRS table starts at age 73 post-SECURE 2.0 (~26.5 years → ~3.8% WR) and declines to ~1.9 years at 120 (~52% WR). Sun & Webb extend the table back to age 65 using the same IRS life-expectancy methodology, producing a continuous schedule.

Because the divisor falls every year while the portfolio (in good markets) rises, withdrawal *percentages* climb with age — the rule deliberately back-loads consumption toward later life expectancy. Sun & Webb showed via a CRRA utility model that this rule strictly dominates four common alternatives (4% rule, fixed-percentage, interest-and-dividends-only, life-expectancy decumulation) in expected utility, because the IRS table internalizes a longevity-credit-style adjustment.

### Origin / Source

- **Wei Sun and Anthony Webb, "Should Households Base Asset Decumulation Strategies on Required Minimum Distribution Tables?"** Center for Retirement Research at Boston College, Issue Brief No. 12-19, October 2012. PDF: <https://crr.bc.edu/wp-content/uploads/2012/10/IB_12-19-508.pdf>
- Project page: <https://crr.bc.edu/should-households-base-asset-decumulation-strategies-on-required-minimum-distribution-tables/>
- **IRS Publication 590-B (2025)**, Appendix B (Uniform Lifetime Table). URL: <https://www.irs.gov/publications/p590b>
- **AAII summary, "Retirement Withdrawals: Can You Base Them on RMDs?"** URL: <https://www.aaii.com/journal/article/retirement-withdrawals-can-you-base-them-on-rmds>
- **Wade Pfau, "Retirement Spending and Required Minimum Distributions,"** Retirement Researcher. URL: <https://retirementresearcher.com/retirement-spending-required-minimum-distributions/>

### Model fit assessment

Best-fit of any strategy in this survey. Fully deterministic (divisor is a published table; balance is an existing dashboard output), does NOT require Monte Carlo, maps cleanly onto a per-year `annualSpend[year]` output. Implementation: embed the IRS Uniform Lifetime Table (or Sun & Webb's extended version) as a constant; set `annualSpend[year] = total_portfolio[year] / distributionPeriod[age]`; let the existing strategy ranker split that dollar amount across Trad/Roth/Stocks/Cash with bracket-fill intact.

Bracket-fill interaction is solvable: Trad RMDs are *legally required* from age 73, so the strategy aligns with what the IRS forces. Bracket-fill applies to discretionary withdrawals beyond the legal RMD floor — if RMD-rule says "$50k" and legal Trad RMD is $30k, the remaining $20k is discretionary and bracket-fill chooses the cheapest pool.

FIRE wrinkle: the IRS table starts at 73 and Sun & Webb extend back to 65. For users retiring in their 40s–50s, two options for the bridge: (a) extrapolate Sun & Webb's methodology further (defensible but adds scope), or (b) use a simple `portfolio / (planAge − age)` rule pre-65, which is what Sun & Webb implicitly assume.

### Recommendation: **IMPLEMENT-NOW** (effectively **IMPLEMENT-NEXT** post-audit)

The only strategy in this survey that is genuinely shippable on the existing chassis without Monte Carlo. Sun & Webb 2012 is well-cited (Pfau, Kitces, AAII), the IRS table is stable public-domain, and implementation is small: one table constant, one per-year spend hook, one new ranker comparator that handles non-constant `annualSpend`. Per FR-023's scope, the audit itself does not implement new strategies; flag this as the top-priority candidate for the next post-020 feature.

---

## Comparison table (T071)

Effort scale: **S** ≤1 day on the existing chassis. **M** 1–3 days, modest calc-engine changes. **L** 3–10 days, structural changes (per-year `annualSpend` output, new charts). **XL** 10+ days, requires Monte Carlo or other major new subsystem.

| Strategy | Stateful? | Bracket-fill compatible? | Effort | Recommendation |
|---|---|---|---|---|
| 4% Rule (Bengen / Trinity) | No (constant real spend) | Yes | S | **DEFER** — already approximated by manual `annualSpend`; the missing piece is a "max sustainable spend" reverse-solver feature, not a new strategy. |
| VPW (Bogleheads) | Yes (spend = f(age, allocation, balance)) | Yes — operates on top-level spend; pool split unchanged | L | **DEFER** — fits deterministically without Monte Carlo, but needs per-year `annualSpend` output and embedded age-allocation tables. |
| Guyton-Klinger guardrails | Yes (spend depends on prior-year portfolio return) | Yes once spending is per-year | XL | **DEFER** — guardrail triggers can't fire meaningfully in a single-path model. Implement after Monte Carlo lands. |
| Bucket strategy (Evensky) | Mechanically no (just `cash-first` ordering); behaviourally yes | Yes (pool-ordering variant) | S (mechanical) / XL (faithful) | **SKIP** — collapses to existing `cash-first`-adjacent ranker options in a deterministic model; faithful sequence-of-returns modeling needs Monte Carlo; academic case is contested. |
| Vanguard dynamic spending | Yes (ceiling/floor on YoY spend change) | Yes once spending is per-year | XL | **DEFER** — same Monte Carlo dependency as Guyton-Klinger. Lower priority because mechanism is a Vanguard-specific calibration of the same idea. |
| RMD-based (Sun & Webb / IRS 590-B) | Yes (spend = balance / table[age]) | Yes — Trad RMD intersects bracket-fill cleanly | M | **IMPLEMENT-NEXT** — highest-fit dynamic strategy for the existing chassis; deterministic; published table; small calc-engine change. Best post-020 candidate. |

## Summary recommendation

The single most valuable post-020 withdrawal-strategy feature is **RMD-based withdrawal per Sun & Webb 2012**. It ships on the existing deterministic chassis, needs only a published IRS table and a per-year spend formula, composes cleanly with bracket-fill, and would be the dashboard's first dynamic strategy. Estimated medium effort.

The next tier — **VPW** then **Guyton-Klinger** then **Vanguard dynamic** — is worth implementing eventually, but VPW needs per-year spending output infrastructure (which RMD-based would establish first), and Guyton-Klinger / Vanguard dynamic require a Monte Carlo subsystem that does not exist today.

The **4% rule** is best surfaced as a "max sustainable spend" reverse-solver — a small UX feature, not a strategy. The **bucket strategy** should be skipped as a named strategy: in a deterministic model it collapses into existing `cash-first` ordering, and faithful sequence-of-returns modeling requires Monte Carlo plus an academically contested premise.
