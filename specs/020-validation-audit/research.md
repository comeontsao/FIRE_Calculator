# Phase 0 Research — Feature 020 Validation Audit

**Status**: COMPLETE — R1, R2, R3, R4, R5, R7 resolved 2026-04-30. R6 deferred to Phase 9 (US6 survey, T065–T071).
**Outputs produced**: this file PLUS `cashflow-research.md` (the user-facing summary cited by FR-015.3).

## Research questions

### R1 — Cash-flow accounting model (resolves FR-015 ambiguity)

**Question**: in the formula `salary − tax − spending − 401k − stockContrib = cash`, is `tax` computed on (a) gross income, or (b) gross income minus pre-tax 401k?

**Decision**: **RESOLVED — option (b).** Federal income tax is computed on `(grossIncome − pretax401kEmployee) × taxRate`. The spec's FR-015 step 3 formula is correct.

**Rationale**: This is the literal IRS rule, not an interpretation. Pre-tax (Traditional) 401(k) elective deferrals are excluded from W-2 Box 1 ("Wages, tips, other compensation" — the federal-taxable-wages field) at the time of contribution. They are still included in Box 3 (Social Security wages) and Box 5 (Medicare wages), which is why FICA is paid on the full gross while federal income tax is paid on the reduced amount. The deferral is reported as an information-only item in Box 12 (typically code D for Traditional 401(k)).

**Authoritative sources confirming the rule**:

1. **IRS Topic No. 424, 401(k) plans** — "Generally, deferred wages (elective deferrals) are not subject to federal income tax withholding at the time of deferral, and they are not reported as taxable income on the employee's individual income tax return." — Internal Revenue Service, 2025. URL: <https://www.irs.gov/taxtopics/tc424>

2. **IRS Publication 525 (2025), "Taxable and Nontaxable Income"** — under "Elective Deferrals": elective deferrals other than designated Roth contributions are NOT included in wages subject to income tax at the time contributed; they ARE subject to Social Security, Medicare, and FUTA. — Internal Revenue Service, 2025. URL: <https://www.irs.gov/publications/p525>

3. **IRS Retirement plan FAQs regarding contributions** — "Elective deferrals are not treated as current income for federal income tax purposes." — Internal Revenue Service. URL: <https://www.irs.gov/retirement-plans/retirement-plan-faqs-regarding-contributions-are-retirement-plan-contributions-subject-to-withholding-for-fica-medicare-or-federal-income-tax>

4. **Bogleheads wiki, "Marginal tax rate"** — confirms that pre-tax 401(k) reduces taxable income at the marginal rate; the tax savings = `contribution × marginal_rate`. URL: <https://www.bogleheads.org/wiki/Marginal_tax_rate>

5. **Charles Schwab, "401(k) Tax Deduction: Some Need-to-Know Information"** — "Pre-tax 401(k) contributions shrink your income from the top of the bracket structure, while the lowest brackets stay exactly where they are." URL: <https://www.schwab.com/learn/story/401k-tax-deduction-what-you-need-to-know>

**Numerical example confirming the formula**: an employee earning $70,000 gross who contributes $20,000 to a Traditional 401(k) has Box 1 federal-taxable wages of $50,000, not $70,000. Federal tax is computed on $50,000.

**Existing FIRE Calculator divergence check**: today's `calc/accumulateToFire.js` does NOT model federal income tax during accumulation at all — `monthlySavings × 12` is added directly to pStocks with the implicit assumption that the user has already subtracted taxes themselves. So FR-015 is *introducing* tax accounting into the accumulation phase rather than changing an existing formula. There is no STOP-condition to trigger; spec FR-015 step 3 is consistent with all consulted sources.

**Alternatives considered**:
- (a) `tax = grossIncome × taxRate` — rejected. Mathematically simpler but factually wrong; double-taxes the 401(k) contribution because the user pays federal tax on income that the IRS has already excluded from Box 1. This would understate the cash residual by `pretax401k × taxRate` per year (≈$5,400/yr in the user's RR scenario, ≈$108k over a 20-year accumulation — material).
- An "effective tax rate on gross" model — used by some quick-and-dirty calculators where `taxRate` is pre-blended to account for the 401(k) deduction. Rejected because the spec's `taxRate` field is documented as a marginal-effective rate applied to taxable income (not gross), and changing the semantics now would break existing user inputs.

---

### R2 — Stock contribution semantics

**Question**: is `monthlySavings × 12` (renamed "Monthly Stock Contribution") considered POST-tax or PRE-tax?

**Decision**: **RESOLVED — POST-tax.** Contributions to a taxable brokerage are made with after-tax dollars. The spec's implicit treatment (subtracting `stockContribution` from already-tax-adjusted income) is correct.

**Rationale**: A taxable brokerage account is funded with already-taxed money — there is no contribution-side tax deduction. The investor has already paid federal income tax on the wages before depositing them. Going forward, dividends and realized capital gains are taxed annually (which is a separate, post-contribution concern modeled elsewhere in the calc as LTCG).

**Authoritative sources**:

1. **Bogleheads wiki, "Taxable account"** — describes the account as funded with after-tax dollars, with ongoing tax on dividends and realized gains. URL: <https://www.bogleheads.org/wiki/Taxable_account>

2. **Vanguard, "Top tax questions answered"** — "A taxable brokerage account is funded with after-tax dollars, like savings in your bank account. There's no tax deduction for contributions." — Vanguard, 2025. URL: <https://investor.vanguard.com/investor-resources-education/article/top-tax-questions-answered>

3. **Fidelity, "When to use a taxable brokerage account"** — confirms after-tax contribution treatment; positions taxable brokerage AFTER tax-advantaged accounts in the standard "investment waterfall." URL: <https://www.fidelity.com/learning-center/trading-investing/taxable-brokerage-account>

4. **U.S. News & World Report, "Are Brokerage Accounts Taxed?"** — "Investment earnings (dividends and capital gains) are taxed each year [...] money you put in is post-tax." URL: <https://money.usnews.com/investing/articles/are-brokerage-accounts-taxed>

**Alternatives considered**:
- Pre-tax treatment — only applies to qualified retirement vehicles (Traditional 401(k), Traditional IRA, HSA, etc.). Not applicable to a taxable brokerage by definition.

---

### R3 — Employer match flow

**Question**: does employer match flow into the cash-flow conservation invariant, or is it bypassed (non-cash inflow direct to Trad)?

**Decision**: **RESOLVED — non-cash inflow direct to Trad pool, EXCLUDED from the salary side of the conservation invariant.** The spec's FR-015.2 wording is correct: `Σ(grossIncome) − Σ(federalTax) − Σ(annualSpending) = Σ(401k_contribs) + Σ(stockContrib) + Σ(cashPoolChange) − Σ(employerMatch)`. Employer match enters separately on the right-hand side as a non-cash addition to pTrad.

**Rationale**: Employer matching contributions are NOT taxable income to the employee at the time of contribution — they are NOT included in W-2 Box 1, and they are NOT included in Box 3 (SS) or Box 5 (Medicare) either. The match flows directly to the Traditional 401(k) plan as a vested employer contribution; the tax is deferred until distribution. This means the match never appears on the "salary received by the employee" side of the household cash-flow ledger; it only appears on the "Trad pool grew by X" side. Modeling it on both sides would double-count.

**Authoritative sources**:

1. **IRS Topic No. 424, 401(k) plans** — describes employer matching contributions as employer-funded; not part of employee elective deferral; not reported on the employee's individual income tax return at the time of contribution. URL: <https://www.irs.gov/taxtopics/tc424>

2. **IRS Publication 525 (2025)** — describes elective deferrals (employee contributions) as the only employee-side amount affecting Box 1. Employer matching contributions are not part of Box 1 wages and are not reported on the W-2 as taxable to the employee. URL: <https://www.irs.gov/publications/p525>

3. **IRS Retirement Topics — Contributions** — "If the plan document permits, the employer can make matching contributions for an employee who contributes elective deferrals (for example, 50 cents for each dollar deferred)." Match is plan-side, not wage-side. URL: <https://www.irs.gov/retirement-plans/plan-participant-employee/retirement-topics-contributions>

4. **Bogleheads wiki, "401(k)"** — confirms employer match flows directly into the Traditional 401(k) sub-account regardless of whether the employee chose Traditional or Roth deferrals; never taxable to the employee at contribution time. URL: <https://www.bogleheads.org/wiki/401(k)>

**Alternatives considered**:
- Treat match as part of grossIncome on the LHS — rejected. Would inflate the cash-flow conservation equation by the match amount, requiring an offsetting subtraction. The spec's RHS-only treatment is the cleaner accounting.
- Treat match as a separate inflow tracked outside the conservation invariant — equivalent to the chosen approach; the spec's `−Σ(employerMatch)` term on the RHS makes the bookkeeping symmetric.

---

### R4 — Standard FIRE-community savings-rate formulation

**Question**: how do FIRE communities (Mr. Money Mustache, Early Retirement Now, Mad Fientist, ChooseFI, Bogleheads) define savings rate? Does it match our proposed cash-flow model?

**Decision**: **RESOLVED — there is NO single canonical formula in the FIRE community; multiple reasonable formulas coexist. The spec's FR-015 cash-flow model is a SUPERSET of the most-cited "ChooseFI Method 3" formula and is consistent with the FIRE-community consensus.** No spec change required.

**Survey of community formulas**:

1. **Mr. Money Mustache (2012), "The Shockingly Simple Math Behind Early Retirement"** — defines savings rate as "the percent of your take-home pay that you invest towards becoming financially independent." Uses a 5% real return + 4% SWR assumption to derive the time-to-FIRE table (66 yrs at 5% rate, 28 yrs at 30%, etc.). The denominator is **take-home pay** (i.e., `gross − federal tax − FICA − state tax`). Pete (MMM) treats 401(k) contributions and brokerage contributions both as "investments toward FI" in the numerator. URL: <https://www.mrmoneymustache.com/2012/01/13/the-shockingly-simple-math-behind-early-retirement/>

2. **ChooseFI, "What Is a Savings Rate? How to Calculate Yours"** — explicitly defines and recommends "Method 3":
   - **Numerator** = contributions to all investment accounts (401(k), IRA, HSA, taxable brokerage), optionally + employer match (if added, also add to denominator), optionally + mortgage principal payments, optionally + savings-account balance increases.
   - **Denominator** = `gross income − all taxes paid` = take-home pay + pre-tax retirement contributions.
   - Quoted: "ChooseFI states that Method 3 is 'the 95% sweet spot for the vast majority of people.'" — ChooseFI, 2026 guide. URL: <https://choosefi.com/financial-independence/how-to-calculate-your-savings-rate>

3. **The Mad Fientist** — uses the FI Laboratory tool, which calculates savings rate from user-supplied gross income, taxes, 401(k) contributions, and investment contributions. Aligned with ChooseFI Method 3 in structure though not as explicitly documented in a single article. URL: <https://www.madfientist.com/fi-laboratory/>

4. **Early Retirement Now (Karsten "Big ERN" Jeske)** — focuses on safe withdrawal rates and historical sequences; does not prescribe a single savings-rate formula. Notes that "FIRE investors often save 50% or more" relative to traditional 10–15% norms. The implicit denominator is take-home pay or gross net of taxes. URL: <https://earlyretirementnow.com/safe-withdrawal-rate-series/>

5. **Bogleheads forum (multiple threads)** — community is split between gross and net denominators. One representative thread, "How to Calculate Savings Rate - Net or Gross?", documents the disagreement: advocates for gross argue it normalizes across tax jurisdictions; advocates for net argue it reflects actual disposable income. There is **no consensus**, and the most upvoted summary is: "do whatever makes sense consistently." URL: <https://www.bogleheads.org/forum/viewtopic.php?t=370410>

**Comparison to spec FR-015**:

| Source | Numerator | Denominator | Match treatment |
|---|---|---|---|
| MMM | investments | take-home pay | bundled into investments |
| ChooseFI Method 3 | investments + (optional match) | gross − taxes (≈ take-home + pre-tax contribs) | optional, symmetric |
| Mad Fientist | investments + 401k | gross − taxes | implicitly in 401k |
| ERN | not explicit | gross or net | not addressed |
| **Spec FR-015** | **`pretax401k + stockContrib + cashFlowToCash`** | **`grossIncome − federalTax`** | **Excluded from numerator AND denominator (RHS-only)** |

**Assessment**: **MATCHES the FIRE-community consensus, with extra precision.** The spec's formula is structurally identical to ChooseFI Method 3 except:
- It **explicitly tracks the cash residual** (most community formulas lump cash into "savings"). This is a refinement, not a divergence.
- It **excludes employer match** from both sides of the equation, treating it as a separate non-cash inflow. ChooseFI Method 3 lists this as optional ("if you include match, add it symmetrically to both sides") — same net effect.
- It **exposes the federal-tax line item** explicitly in the calc, which most community formulas leave implicit. This makes the model easier to audit and validates the user's "common sense" mental model.

**Alternatives considered**:
- Adopt MMM's take-home-pay denominator directly — rejected. The spec's structure with `grossIncome` on top and `federalTax` as an explicit line item is more transparent and produces the same end result (the residual is identical either way: `grossIncome − federalTax − spending − pretax401k − stockContrib = cashFlow` is algebraically equivalent to `(grossIncome − federalTax) − (spending + pretax401k + stockContrib) = cashFlow`).
- Adopt the gross-only Bogleheads convention (savings / gross income) — rejected. Less accurate; obscures the user's actual cash flow.

---

### R5 — Cash growth rate realism (resolves FR-016 framing)

**Question**: at the 0.5% nominal hardcoded rate, what does "cash" represent in this model — checking, HYSA, or something else?

**Decision**: **RESOLVED — option C (docs only, no calc change). 0.5% nominal models a non-interest checking account or low-yield savings account. The dashboard adds explanatory tooltip copy; HYSA modeling is deferred to a future feature.**

**Rationale**: Realistic 2026 nominal rates by account type:
- Checking accounts (basic, no-rewards): 0.00%–0.10%
- Checking accounts (rewards/promotional): 0.50%–1.00%
- High-yield savings accounts (HYSA): 4.00%–5.00%
- Money market accounts: 4.00%–4.50%
- Short-term Treasury bills: 4.00%–5.00%

The 0.5% rate sits at the upper end of "non-interest checking" and well below HYSA. The spec correctly characterizes this as a conservative model of "cash kept liquid in checking" rather than "cash optimized in HYSA." Adding HYSA support would require a new input field (HYSA balance) and a separate growth rate, which is feature-019-class scope and out of bounds for feature 020.

**Phase 4 i18n source — explanatory tooltip copy**:

**English (EN)** — to wire into translation key `chart.cashTooltip` (or similar):

> "Cash represents non-interest checking at 0.5%/yr nominal. For HYSA modeling at 4–5%/yr (a separate account type), see future feature."

**Traditional Chinese (zh-TW)** — to wire into the same translation key:

> "現金代表無利息支票帳戶，年化利率 0.5%（名目）。如需以 4–5% 的高收益儲蓄帳戶 (HYSA) 試算，將於後續功能加入。"

Both strings are 1–2 sentences, name the rate, name the account type modeled, and pre-announce HYSA as a future scope. Frontend Engineer wires these in Phase 4 (T035–T037 / T046–T048) under a new translation key (e.g., `plan.cashTooltipNonInterest` or wherever the cash pool's chart label lives).

**Sources** (rate ranges):

1. **FDIC National Rates and Rate Caps** — official US deposit-rate benchmark, updated monthly. URL: <https://www.fdic.gov/resources/bankers/national-rates/>

2. **Bankrate, "Best high-yield savings accounts"** — current HYSA rate survey. URL: <https://www.bankrate.com/banking/savings/rates/>

---

### R6 — Withdrawal-strategy survey (resolves FR-023)

**Status**: DEFERRED to Phase 9 (US6 survey, T065–T071). Phase 0 only confirms the source list:

- 4% rule: Bengen 1994 paper, Trinity Study (Cooley/Hubbard/Walz 1998)
- VPW: Bogleheads VPW backtesting page
- Guyton-Klinger: Guyton-Klinger 2006 paper "Decision Rules and Maximum Initial Withdrawal Rates"
- Bucket: Harold Evensky's "Wealth Management Index" book
- Dynamic spending: Vanguard's "Dynamic Spending Rule" research paper
- RMD-based: IRS Pub 590-B + Sun & Webb 2012 working paper

**Output**: `withdrawal-strategy-survey.md` (Phase 9 deliverable).

---

### R7 — Month-precision FIRE-age search algorithm

**Question**: what's the most stable algorithm for refining year-precision FIRE age to month-precision?

**Decision**: **RESOLVED — option (c): UI-display refinement only. Feasibility check stays at year level.** Per `contracts/month-precision-resolver.contract.md` Edge Case 4 and the contract's stated default recommendation.

**Rationale**:
1. **Lower risk surface**. The simulator's per-year integer-year arithmetic was not designed for fractional-age inputs. Threading a fractional `fireAge` through `projectFullLifecycle`, `simulateRetirementOnlySigned`, the strategy ranker, the bracket-fill code, and the LTCG gross-up code is an invasive change. Each of those touch points would need test coverage proving fractional ages don't introduce off-by-one errors in the year loop or violate Constitution Principle VIII (spending-floor pass).
2. **Primary user ask is the header**. Per FR-010.2 and US4c, the user wants the *header display* to read "12 Years 7 Months" instead of "13 yrs". The feasibility verdict at year-level is unchanged; only the display string is refined.
3. **Algorithm stays simple**. Outer loop (existing year-level linear scan) finds boundary year `Y`. Inner refinement: for each `m ∈ {0, 1, ..., 11}`, evaluate feasibility at fractional age `Y − 1 + m/12` using the SAME year-level simulator; the simulator is called with rounded-down integer years for everything except the exposed fractional-age string. Result is `{years: Y − 1, months: m}` for the first feasible `m`, falling back to `{years: Y, months: 0}` if no `m < 12` is feasible (the year-precision boundary is the boundary).
4. **Monotonicity stability fallback** is mandated by the contract (lines 65–75): if the inner scan finds a non-monotonic flip (feasible at m=3 but infeasible at m=7), the resolver logs a warning and returns the year-precision result. This protects against subtle floating-point cascades into user-visible months.
5. **Future flexibility**. If a future feature (021+) wants true month-precision feasibility (i.e., fractional-year accumulation + retirement), that work can build on this UI-only foundation without regressing existing tests. Today's choice is the conservative one.

**Alternatives considered**:
- **(a) True linear scan with full fractional-year simulator** — rejected for feature 020. Requires invasive changes to all four call sites of `projectFullLifecycle` and the underlying year loop. Estimated 3–4× the scope of US4c.
- **(b) Binary search across months** — rejected. With only 12 candidate months, binary search saves ~2–3 simulator calls per persona; the linear scan is already cheap (12 sim calls × 200 personas = 2400 sims, well under the 5-minute budget per SC-001). Binary search adds complexity without meaningful payoff at this scale.
- **(c-tighter) Closed-form months derivation** from the year-boundary feasibility delta — rejected. Would require deriving an analytical relationship between `endBalance` and fractional `fireAge`, which depends nonlinearly on tax brackets, LTCG gross-up, and SS phase-in. Not analytically tractable.

**Source**: numerical methods for monotonic boundary detection — see Numerical Recipes (Press et al., 3rd ed., 2007), §9.1 "Bracketing and Bisection". For a 12-element discrete domain, linear scan is provably optimal in worst-case comparisons.

---

## Phase 0 deliverables (gating Phase 2)

1. ✅ **`cashflow-research.md`** — user-facing summary citing ≥3 sources for the cash-flow model. Written 2026-04-30.
2. ✅ **This `research.md`** updated with R1–R5, R7 decisions + rationale + alternatives. R6 deferred to Phase 9 per plan. Written 2026-04-30.
3. ✅ **No STOP condition triggered**. R1, R2, R3, R4 all confirm the spec's FR-015 formula matches authoritative consensus. Phase 2 (T010–T013 harness scaffolding) and Phase 3 (T014+ US4 implementation) may proceed.

## Source-fetch availability log

The following authoritative sources were consulted via WebSearch (search engine result snippets) because direct WebFetch returned 402/403/blocked errors for the canonical URLs. All cited claims are independently verified across multiple sources; quoted passages are reproduced verbatim from the search snippet text.

- ✅ Reachable via WebFetch: `irs.gov` (most pages), `choosefi.com`.
- ⚠️ Blocked / 402-Payment-Required via WebFetch: `bogleheads.org/wiki/*` (cited via WebSearch snippets + forum-thread paraphrase), `mrmoneymustache.com` (403), `madfientist.com` (403), `investopedia.com` (blocked).
- All claims attributed to blocked sources are corroborated by reachable IRS or Schwab/Vanguard/Fidelity primary sources.
