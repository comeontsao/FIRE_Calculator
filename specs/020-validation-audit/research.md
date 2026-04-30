# Phase 0 Research — Feature 020 Validation Audit

**Status**: STUB — populated during Phase 0 execution.
**Outputs expected**: this file PLUS `cashflow-research.md` (the user-facing summary cited by FR-015.3).

## Research questions

### R1 — Cash-flow accounting model (resolves FR-015 ambiguity)

**Question**: in the formula `salary − tax − spending − 401k − stockContrib = cash`, is `tax` computed on (a) gross income, or (b) gross income minus pre-tax 401k?

**Why it matters**: option (b) is the IRS reality (W-2 Box 1 already excludes pre-tax 401k). Option (a) is what current code does (`grossIncome × taxRate`). The choice affects every accumulation simulation by a few percent of `pretax401k × taxRate`. Over 20+ accumulation years that compounds.

**Sources to consult**:
- IRS Publication 17 (Your Federal Income Tax — taxable income computation)
- Bogleheads wiki: "Marginal tax rate" + "Traditional 401(k)"
- Investopedia: "How 401(k) Contributions Affect Your Tax Bracket"

**Decision**: TBD — Phase 0 deliverable.
**Rationale**: TBD.
**Alternatives considered**: TBD.

### R2 — Stock contribution semantics

**Question**: is `monthlySavings × 12` (renamed "Monthly Stock Contribution") considered POST-tax or PRE-tax?

**Why it matters**: in standard taxable brokerage, contributions are post-tax. The current code adds `monthlySavings × 12` to `pStocks` AFTER tax has already been deducted from gross — implicitly post-tax. The new formula must preserve this.

**Sources**: Bogleheads "Tax-efficient fund placement", Investopedia "Brokerage account taxation".

**Decision**: TBD — Phase 0 deliverable. Default: post-tax (matches current implicit behavior).

### R3 — Employer match flow

**Question**: does employer match flow into the cash-flow conservation invariant, or is it bypassed (non-cash inflow direct to Trad)?

**Why it matters**: employer match is NOT employee taxable income at contribution; it's a vested bonus. It should not appear on the "salary" side of the conservation equation, but it MUST appear on the "Trad pool growth" side.

**Sources**: IRS Topic No. 558, Bogleheads "Employer match".

**Decision**: TBD — likely "non-cash inflow direct to Trad". Phase 0 confirms.

### R4 — Standard FIRE-community savings-rate formulation

**Question**: how do FIRE communities (Mr. Money Mustache, Early Retirement Now, Mad Fientist) define savings rate? Does it match our proposed cash-flow model?

**Why it matters**: validates that the user's mental model ("common sense") aligns with the FIRE-community consensus. If our formula differs from the community standard, document and justify.

**Sources**:
- Mr. Money Mustache: "The Shockingly Simple Math Behind Early Retirement"
- Early Retirement Now: "The Ultimate Guide to Safe Withdrawal Rates"
- The Mad Fientist: "Savings Rate Calculator"

**Decision**: TBD — Phase 0 deliverable.

### R5 — Cash growth rate realism (resolves FR-016 framing)

**Question**: at the 0.5% nominal hardcoded rate, what does "cash" represent in this model — checking, HYSA, or something else?

**Why it matters**: per Q3 the user wants documentation only, not a calc change. The doc must accurately characterize what 0.5% nominal models. Realistic rates as of 2026: checking = 0–0.5%, HYSA = 4–5%, money market = 4–4.5%, short Treasuries = 4–5%.

**Decision**: PRE-CONFIRMED — option C (docs only). Phase 0 just produces the explanatory copy.

### R6 — Withdrawal-strategy survey (resolves FR-023)

**Question**: which retirement-community withdrawal strategies (beyond the existing 7) are worth implementing in future features?

**Sources to consult per strategy**:
- 4% rule: Bengen 1994 paper, Trinity Study (Cooley/Hubbard/Walz 1998)
- VPW: Bogleheads VPW backtesting page
- Guyton-Klinger: original Guyton-Klinger 2006 paper "Decision Rules and Maximum Initial Withdrawal Rates"
- Bucket: Harold Evensky's "Wealth Management Index" book
- Dynamic spending: Vanguard's "Dynamic Spending Rule" research paper
- RMD-based: IRS Pub 590-B + Sun & Webb 2012 working paper

**Output**: `withdrawal-strategy-survey.md` (Phase 8 deliverable, but research happens in Phase 0).

### R7 — Month-precision FIRE-age search algorithm

**Question**: what's the most stable algorithm for refining year-precision FIRE age to month-precision?

**Options**:
- (a) Linear scan: at year boundary, evaluate feasibility for months 0..11, find first feasible month.
- (b) Binary search: divide month-range, similar to year search.
- (c) Closed-form: derive months algebraically from the feasibility delta at the year boundary.

**Sources**: numerical methods literature on monotonic boundary detection.

**Decision**: TBD — likely (a) for simplicity given the year-level outer loop already does linear scan. Phase 0 selects.

## Phase 0 deliverables (gating Phase 2)

1. `cashflow-research.md` — user-facing summary citing ≥3 sources for the cash-flow model.
2. This `research.md` updated with R1–R7 decisions + rationale + alternatives.
3. If R1 / R2 / R3 / R4 surface a consensus that differs from the spec's FR-015 formula: pause and ask user before proceeding to Phase 2.
