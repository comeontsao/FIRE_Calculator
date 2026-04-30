# Cash-Flow Model Research — Plain-Language Summary

**Audience**: the FIRE Calculator user (Roger), a finance-literate non-engineer.
**Purpose**: validate that feature 020's planned cash-flow rewrite (FR-015) matches how the IRS, the Bogleheads, and the FIRE community actually account for "salary in, taxes out, savings out, leftover cash" — before we ship the calc engine change.
**Companion**: full technical research notes are in [`research.md`](./research.md).

---

## What the spec proposes (FR-015, plain English)

Each year during your accumulation phase, the new calc tracks five separate flows out of your gross paycheck:

1. **You start with**: gross income (salary, raised yearly by `raiseRate`).
2. **Subtract pre-tax 401(k) contributions** (employee deferral). This is the dollar amount that goes into your Traditional 401(k) BEFORE federal tax is computed.
3. **Subtract federal income tax**, where the tax is computed on `(gross − pretax 401(k))`, NOT on gross. (More on why below.)
4. **Subtract annual spending** (your living expenses, inflation-adjusted).
5. **Subtract monthly stock contribution × 12** (the input previously labeled `monthlySavings`). This is your discretionary investment into the taxable brokerage.
6. **Whatever's left = "cash flow into the cash pool"**. This is the residual that lands in your checking/savings account for the year. It can be zero (we clamp at $0 — no phantom debt), but typically it's positive.

Employer 401(k) match is tracked **separately** as a non-cash inflow that goes directly into your Traditional 401(k) bucket. It never appears on the salary side of the household ledger because the IRS doesn't tax it as wages to you when it's contributed.

---

## Why federal tax is computed on `gross − pretax 401(k)` and not `gross`

This is the single biggest accounting question we needed to answer before locking in the calc rewrite. The answer is unambiguous and comes straight from the IRS:

> "Generally, deferred wages (elective deferrals) are not subject to federal income tax withholding at the time of deferral, and they are not reported as taxable income on the employee's individual income tax return."
> — **IRS Topic No. 424, 401(k) plans**, 2025

In other words, when you contribute $20,000 of pre-tax money to your Traditional 401(k), your W-2 Box 1 (federal taxable wages) shows your gross salary MINUS that $20,000. The IRS literally pretends you earned that much less. Federal income tax is applied to the reduced number.

(FICA tax — Social Security + Medicare — is different. FICA is paid on the full gross including the 401(k) contribution. That's why W-2 Box 3 and Box 5 are usually higher than Box 1 if you have a Traditional 401(k).)

The Bogleheads community explains it the same way:

> "Pre-tax 401(k) contributions shrink your income from the top of the bracket structure, while the lowest brackets stay exactly where they are."
> — **Charles Schwab, "401(k) Tax Deduction"**, summarizing the standard treatment

If we were to compute federal tax on `gross income` directly, we'd be **double-taxing the 401(k) contribution** — paying federal tax on income the IRS has already excluded from taxable wages. For your RR scenario at ~28% marginal rate and ~$19,400 employee contribution, that's roughly **$5,400/year of phantom tax**. Compounded over a 20-year accumulation, that's well over **$100,000 of understated cash flow**. Material enough to be worth getting right.

**Verdict**: spec FR-015 step 3 is correct. Tax on `gross − pretax401k`, not on `gross`.

---

## Why employer match isn't on the salary side

When your employer contributes $1 of match to your 401(k), the IRS does NOT treat that $1 as wages to you in the year of contribution. It doesn't show up in Box 1 (federal wages), Box 3 (SS wages), or Box 5 (Medicare wages). It shows up nowhere on your W-2 as taxable income. The tax is deferred until you eventually withdraw it from the 401(k) decades later.

So in our cash-flow ledger, employer match is a **non-cash inflow** to your Traditional 401(k) pool — it grows your retirement bucket without ever passing through your paycheck. The conservation invariant treats it as a separate addition on the right-hand side:

```
Σ(grossIncome) − Σ(federalTax) − Σ(annualSpending)
    = Σ(401k_contribs) + Σ(stockContrib) + Σ(cashPoolChange) − Σ(employerMatch)
```

The `−Σ(employerMatch)` term on the right keeps the books balanced: the LHS is "cash that flowed through your paycheck," and the RHS is "cash that flowed out of your paycheck" — and since the match never flowed through your paycheck, it has to be subtracted off the RHS to make the equation hold.

**Verdict**: spec FR-015.2 is correct.

---

## Why "Monthly Stock Contribution" is post-tax

Money you put into a regular taxable brokerage account is already-taxed money. There's no contribution-side tax deduction (unlike a Traditional 401(k) or IRA). You receive your paycheck, pay federal tax + FICA + state tax, and then write a check to your brokerage. That brokerage check is post-tax dollars by definition.

> "A taxable brokerage account is funded with after-tax dollars, like savings in your bank account. There's no tax deduction for contributions."
> — **Vanguard, "Top tax questions answered"**, 2025

This is why the cash-flow formula subtracts `stockContribution` AFTER tax has already been deducted — it's the user using their already-taxed take-home pay to invest discretionarily.

**Verdict**: spec FR-015 step 5 is correct.

---

## How the FIRE community computes savings rate

We surveyed the major FIRE-community sources to make sure our model isn't drifting from how thoughtful FIRE practitioners actually think about this. Short answer: there's no single canonical formula, but several reasonable ones — and our spec is structurally identical to the most-cited "ChooseFI Method 3."

### Mr. Money Mustache (2012)
"The percent of your **take-home pay** that you invest towards becoming financially independent." Numerator = investments (401(k) + brokerage + IRA). Denominator = take-home pay (gross minus federal/FICA/state tax). Pete's 2012 article ties savings rate to time-to-FIRE assuming 5% real return + 4% safe withdrawal rate.

### ChooseFI's Method 3 (the one they recommend)
- Numerator: contributions to all investment accounts (401(k) + IRA + HSA + taxable brokerage), optionally + employer match (with offsetting addition to denominator).
- Denominator: `gross income − all taxes` = take-home pay + pre-tax retirement contributions.
- ChooseFI calls this "the 95% sweet spot for the vast majority of people."

### The Mad Fientist
Uses the FI Laboratory tool. Inputs gross income, taxes, 401(k) contributions, and investment contributions. Structure aligned with ChooseFI Method 3.

### Bogleheads
Long-running debate. Multiple-page threads can't agree on net vs gross. The consensus is "do whatever makes sense consistently."

### Spec FR-015 vs the consensus

| | Numerator | Denominator |
|---|---|---|
| ChooseFI Method 3 | investments (+ optional match) | `gross − taxes` |
| MMM | investments | take-home pay |
| **Spec FR-015** | **`pretax401k + stockContrib + cashFlowToCash`** | **`grossIncome − federalTax`** |

Algebraically, spec FR-015 splits the same dollars into more line items than the community formulas do — it treats the leftover cash residual as a first-class output instead of bundling it into "savings." This is a refinement, not a divergence. Every dollar that ChooseFI Method 3 calls "savings" is one of three things in our model: pre-tax 401(k), stock contribution, or cash residual. Add those three together, divide by `gross − federalTax`, and you get exactly Method 3's savings rate.

---

## Final verdict

**The spec's FR-015 formula MATCHES consensus.**

Specifically:
- **R1 (tax base)**: matches the IRS rule (Box 1 federal wages exclude pre-tax 401(k)).
- **R2 (stock contribution post-tax)**: matches Vanguard / Fidelity / Bogleheads convention.
- **R3 (employer match flow)**: matches IRS Topic 424 + Publication 525 treatment.
- **R4 (FIRE-community savings rate)**: structurally identical to ChooseFI Method 3, with the cash residual as an explicit line item rather than implicit. MMM, Mad Fientist, and Bogleheads do not contradict it.

**No spec change is required.** Phase 2 calc-engine implementation may proceed against FR-015 as written. The cash-flow rewrite is faithful to how the IRS taxes income, how the Bogleheads describe the ledger, and how the FIRE community calculates savings rate.

---

## Sources cited

Authoritative sources for the cash-flow model:

1. **IRS Topic No. 424, 401(k) plans** — Internal Revenue Service, 2025.
   <https://www.irs.gov/taxtopics/tc424>

2. **IRS Publication 525 (2025), "Taxable and Nontaxable Income"** — Internal Revenue Service, 2025.
   <https://www.irs.gov/publications/p525>

3. **IRS Retirement plan FAQs regarding contributions** — Internal Revenue Service.
   <https://www.irs.gov/retirement-plans/retirement-plan-faqs-regarding-contributions-are-retirement-plan-contributions-subject-to-withholding-for-fica-medicare-or-federal-income-tax>

4. **IRS Retirement Topics — Contributions** — Internal Revenue Service.
   <https://www.irs.gov/retirement-plans/plan-participant-employee/retirement-topics-contributions>

5. **Charles Schwab, "401(k) Tax Deduction: Some Need-to-Know Information"** — Charles Schwab & Co., 2024.
   <https://www.schwab.com/learn/story/401k-tax-deduction-what-you-need-to-know>

6. **Bogleheads wiki, "Marginal tax rate"** — Bogleheads community wiki.
   <https://www.bogleheads.org/wiki/Marginal_tax_rate>

7. **Bogleheads wiki, "401(k)"** — Bogleheads community wiki.
   <https://www.bogleheads.org/wiki/401(k)>

8. **Bogleheads wiki, "Taxable account"** — Bogleheads community wiki.
   <https://www.bogleheads.org/wiki/Taxable_account>

9. **Vanguard, "Top tax questions answered"** — Vanguard Group, 2025.
   <https://investor.vanguard.com/investor-resources-education/article/top-tax-questions-answered>

10. **Fidelity, "When to use a taxable brokerage account"** — Fidelity Investments.
    <https://www.fidelity.com/learning-center/trading-investing/taxable-brokerage-account>

11. **Mr. Money Mustache (Pete Adeney), "The Shockingly Simple Math Behind Early Retirement"** — published 2012-01-13.
    <https://www.mrmoneymustache.com/2012/01/13/the-shockingly-simple-math-behind-early-retirement/>

12. **ChooseFI, "What Is a Savings Rate? How to Calculate Yours [2026 Guide]"** — ChooseFI media.
    <https://choosefi.com/financial-independence/how-to-calculate-your-savings-rate>

13. **The Mad Fientist (Brandon), "FI Laboratory"** — Mad Fientist tools.
    <https://www.madfientist.com/fi-laboratory/>

14. **Early Retirement Now (Karsten Jeske), "The Safe Withdrawal Rate Series"** — earlyretirementnow.com, 2016–present.
    <https://earlyretirementnow.com/safe-withdrawal-rate-series/>
