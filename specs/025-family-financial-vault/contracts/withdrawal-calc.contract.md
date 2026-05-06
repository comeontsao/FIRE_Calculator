# Contract: Inherited-Account Withdrawal Calculator

**Feature**: 025
**Module**: inline calculator in `FIRE-Family-Vault-RR.html`; reuses `calc/withdrawal.js` if cleanly importable
**Consumers**: procedure panel for retirement-account categories; `tests/vault/withdrawal-calc.test.js`

## Inputs

```js
{
  account: Account,                    // category MUST be one of: employer-401k-roth, employer-401k-trad, traditional-ira, roth-ira
  rebeccaAge: number,                  // current age at start of inheritance
  rebeccaOtherIncome: number,          // expected USD/year from W-2, SS, etc. (no withdrawal)
  filingStatus: "single" | "mfj" | "qss",   // single (default), MFJ (year-of-death), QSS (years 1-3 if dependent kids)
  state: "MA",                         // future-extensible; v1 hard-coded MA
  growthRateAnnual: number,            // assumed real growth rate of un-withdrawn balance, default 0.05 (5%)
  targetBracketPctForBracketFill: number  // bracket cap for the smoothed strategy, default 0.22 (22%)
}
```

## Outputs

```js
{
  lumpSum: WithdrawalSchedule,
  evenTenths: WithdrawalSchedule,
  bracketFill: WithdrawalSchedule
}

// where:
WithdrawalSchedule {
  yearByYear: WithdrawalYear[],     // length = 10 for traditional/roth-ira; could be longer for spousal-rollover-into-own-IRA path
  totalWithdrawn: number,            // USD
  totalFederalTax: number,           // USD
  totalStateTax: number,             // USD MA
  endingBalance: number,             // USD (should be ≈ 0 for a complete schedule)
  triggeredCliffs: { irmaa: boolean, acaCliff: boolean, amt: boolean },  // true if ANY year crosses
  cliffYears: { irmaa: number[], acaCliff: number[], amt: number[] }     // year indices (1-based) that crossed
}

WithdrawalYear {
  year: number,                       // 1..10
  withdrawal: number,                 // USD this year
  totalIncome: number,                // rebeccaOtherIncome + withdrawal
  federalTax: number,
  stateTax: number,
  irmaa: boolean,
  acaCliff: boolean,
  amt: boolean,
  remainingBalance: number            // end-of-year remaining
}
```

## Strategy implementations

### Lump sum

Year 1: withdraw 100% of balance (with growth applied). Years 2–10: withdrawal = 0.

### Even tenths

Year n (1..10): withdraw `currentBalance / (10 - n + 1)`. Each year's leftover grows by `growthRateAnnual`. By year 10, balance = 0.

### Bracket-fill smoothed

Year n: compute MAGI cap = bracket boundary at `targetBracketPctForBracketFill` (e.g., $100,525 for 22% Single 2024). Withdrawal = `min(MAGI cap - rebeccaOtherIncome, currentBalance)`. If balance remains at year 10, withdraw remainder in year 10.

For Roth accounts, federal tax = 0 but the strategy still exists to control MAGI for cliff avoidance.

## Tax brackets dependency

Imports from `calc/taxBrackets.js`:

- `BRACKETS_SINGLE_2024` (default)
- `BRACKETS_MFJ_2024` (filingStatus === "mfj" or "qss")

Standard deduction subtracted from gross income before bracket lookup.

## Cliff thresholds

```js
const IRMAA_SINGLE_2024 = 103000;     // research.md R2
const IRMAA_MFJ_2024 = 206000;
const ACA_CLIFF_400FPL_HOUSEHOLD2 = 84600;  // research.md R3 — 2024 FPL
const ACA_CLIFF_400FPL_HOUSEHOLD4 = 128600;
const AMT_EXEMPTION_SINGLE_2024 = 85700;    // IRS Pub 17 2024
const AMT_EXEMPTION_MFJ_2024 = 133300;
```

Cliff = year's MAGI crosses the threshold. AMT is more nuanced (depends on preferences); v1 surfaces a simple "MAY trigger AMT — verify with CPA" warning.

## Pure-function discipline

Calculator helpers are PURE — no DOM, no globals, no side effects. Easy to unit-test in `node --test`.

## Test fixture (anchor for SC-003)

```js
{
  account: { category: "employer-401k-trad", currentBalanceUSD: 500000 },
  rebeccaAge: 50,
  rebeccaOtherIncome: 60000,
  filingStatus: "single",
  growthRateAnnual: 0.05,
  targetBracketPctForBracketFill: 0.22
}

// Expected:
//   bracketFill.totalFederalTax should be ≥ 25% LESS than lumpSum.totalFederalTax
//   lumpSum triggers IRMAA (year 1 MAGI = $560K > $103K threshold)
//   bracketFill triggers IRMAA in 0 years (each year's MAGI is capped near the 22% boundary)
```
