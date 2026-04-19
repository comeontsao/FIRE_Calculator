# Data Model — Modular Calc Engine

**Feature**: `001-modular-calc-engine`
**Date**: 2026-04-19

This document defines the conceptual entities exchanged between calc modules and
their consumers. All shapes are **value objects** — plain frozen JavaScript objects
with no methods, no identity, no mutation. Type hints use JSDoc so they document the
contract without requiring a compile step.

---

## Entity catalog

| Entity | Produced by | Consumed by |
|---|---|---|
| `Inputs` | HTML form state + `personal-rr.js` adapter | every calc module |
| `EffectiveFireAgeState` | `chartState.js` | every chart renderer |
| `LifecycleRecord[]` | `lifecycle.js` | growth chart, SS chart, roth ladder, timeline |
| `FireSolverResult` | `fireCalculator.js` | KPI cards, growth chart marker, banner |
| `WithdrawalResult` | `withdrawal.js` | roth ladder, SS chart |
| `TaxResult` | `tax.js` | withdrawal, roth ladder |
| `SSProjection` | `socialSecurity.js` | lifecycle, SS chart |
| `HealthcareCost` | `healthcare.js` | lifecycle, scenario card |
| `MortgageSchedule` | `mortgage.js` | lifecycle, mortgage verdict |
| `CollegeSchedule` | `college.js` | lifecycle, timeline |
| `InflationHelpers` | `inflation.js` | every module that crosses real/nominal |
| `FixtureCase` | `tests/fixtures/*.js` | unit + parity tests |
| `PersonalDataEnricher` | `personal/personal-rr.js` | RR's HTML only |
| `ChartRenderContract` | every HTML chart renderer (comment) | readers, meta-tests |

---

## 1. `Inputs`

The canonical shape every shared calc module consumes. Generic's HTML form maps
directly into this shape; RR's HTML maps its form into a *partial* shape and
`personal-rr.js` fills in the personal-only fields.

```js
/**
 * @typedef {Object} Inputs
 *
 * @property {number} currentAgePrimary        integer years, primary person today
 * @property {number} [currentAgeSecondary]    integer years, secondary person today; undefined for single household
 * @property {number} endAge                   age to simulate to (e.g., 95)
 *
 * @property {Portfolio} portfolioPrimary      primary person's accounts
 * @property {Portfolio} [portfolioSecondary]  secondary person's accounts
 *
 * @property {number} annualSpendReal          today-dollar annual spend target
 * @property {number} returnRateReal           real return on stocks (decimal, e.g., 0.05)
 * @property {number} returnRateCashReal       real return on cash (decimal)
 * @property {number} inflationRate            for converting nominal ↔ real (decimal)
 *
 * @property {TaxConfig} tax
 * @property {SolverMode} solverMode           'safe' | 'exact' | 'dieWithZero'
 * @property {SafetyBuffers} buffers           required balances at phase boundaries
 *
 * @property {Scenario} scenario               country / healthcare scenario
 * @property {Mortgage} [mortgage]             primary residence mortgage (see §1b — ownership-mode variants)
 * @property {SecondHome} [secondHome]         optional additional property (see §1c)
 * @property {College[]} colleges              empty array for no kids; each College may carry student-loan metadata (see §1d)
 * @property {StudentLoan[]} [studentLoans]    standalone adult-debt loans the household is servicing (see §1d — optional; colleges may describe kid loans inline)
 * @property {SSEarnings} [ssPrimary]          null → use generic SS curve
 * @property {SSEarnings} [ssSecondary]
 * @property {number} ssStartAgePrimary        integer 62..70 — claim age for primary person
 * @property {number} [ssStartAgeSecondary]    integer 62..70 — claim age for secondary person (when present)
 *
 * @property {ContributionSplit} [contributionSplit] override for 60/20/20 trad/roth/taxable default during accumulation
 * @property {number} [employerMatchReal]      real dollars/year added to trad401k during accumulation (Traditional only); defaults to 0
 * @property {number} [taxTradRate]            decimal shorthand for trad-withdrawal tax drag used by the signed-lifecycle invariant; defaults to tax.ordinaryBrackets-derived rate. Kept for behavioral parity with the inline engine until `withdrawal.js` fully supersedes it
 * @property {number} [scenarioSpendReal]      per-scenario spend override in real dollars; when present, lifecycle uses this in place of `annualSpendReal` for the retirement phases (not accumulation)
 * @property {number} [relocationCostReal]     one-time real-dollar deduction from taxable/cash pools at the FIRE age boundary (used by the country-move scenarios)
 * @property {number} [homeSaleAtFireReal]     real-dollar proceeds added to taxable stocks pool at FIRE (primary residence sale). Distinct from `secondHome.saleProceedsReal`; both can coexist when both properties are sold
 * @property {number} [rentAlternativeReal]    monthly rent in today-dollars used as the baseline for the buy-vs-rent delta when a mortgage is active. Defaults to 0 (no rent baseline)
 */

/**
 * @typedef {Object} SSEarnings
 * @property {number[]} annualEarningsNominal  per-year nominal earnings, oldest → newest (max 35 entries used)
 * @property {number} latestEarningsYear       calendar year of the most-recent entry
 */

/**
 * @typedef {Object} Portfolio
 * @property {number} trad401kReal   real dollars
 * @property {number} rothIraReal
 * @property {number} taxableStocksReal
 * @property {number} cashReal
 * @property {number} annualContributionReal   current annual savings
 */

/**
 * @typedef {Object} TaxConfig
 * @property {TaxBracket[]} ordinaryBrackets   real-dollar thresholds + rates
 * @property {TaxBracket[]} ltcgBrackets
 * @property {number} rmdAgeStart              e.g., 73 or 75
 */

/**
 * @typedef {Object} SafetyBuffers
 * @property {number} bufferUnlockMultiple     (years of spend) required at 401(k) unlock
 * @property {number} bufferSSMultiple         (years of spend) required at SS start
 */

/**
 * @typedef {Object} ContributionSplit
 * @property {number} trad401kFraction   decimal 0..1 — share of annualContributionReal routed to trad401k
 * @property {number} rothFraction       decimal 0..1 — share routed to rothIra
 * @property {number} taxableFraction    decimal 0..1 — share routed to taxableStocks
 *
 *   Invariant: the three fractions sum to 1.0 within 1e-9. Default when omitted:
 *   `{trad401kFraction: 0.60, rothFraction: 0.20, taxableFraction: 0.20}` — matches
 *   the historical CONTRIB_SPLIT constant in calc/lifecycle.js.
 */
```

> **Portfolio note — trad vs roth 401(k) split.** Early RR dashboard HTML reports a
> single `roger401kTrad` + `roger401kRoth` split in the Inputs shape today. The
> canonical `Portfolio.trad401kReal` field is therefore strictly the Traditional
> 401(k) balance; `Portfolio.rothIraReal` captures BOTH Roth 401(k) and Roth IRA
> balances (they behave identically for withdrawal ordering and tax treatment, so
> merging is loss-less). Adapters MUST sum `roger401kRoth` into `rothIraReal` at
> the Inputs boundary. Future feature may split into `rothK401Real` +
> `rothIraReal` if a distinction becomes material (RMD rules differ for Roth
> 401(k)s in pre-2024 tax years, but the dashboard targets 2026+).

---

### 1b. `Mortgage` — ownership-mode variants

```js
/**
 * @typedef {Object} Mortgage
 *
 * @property {'buying-now' | 'already-own' | 'buying-in'} ownership
 *   Determines WHEN down-payment / closing-cost outflows hit the portfolio and
 *   WHEN amortization begins. See canonical FIRE-Dashboard.html §MORTGAGE MODULE.
 *
 * @property {number} homePriceReal         real dollars at today's price
 * @property {number} downPaymentReal       real dollars; deducted from cash (then stocks) at
 *                                          purchaseAge
 * @property {number} closingCostReal       real dollars; deducted at purchaseAge
 * @property {number} annualRateReal        decimal real rate (nominal − inflation)
 * @property {number} termYears             integer, e.g., 30
 * @property {number} [purchaseAge]         age the buyer takes ownership; REQUIRED
 *                                          when ownership === 'buying-in'. For
 *                                          'buying-now' it defaults to
 *                                          currentAgePrimary. For 'already-own'
 *                                          it is ignored; see `yearsPaid` instead
 * @property {number} [yearsPaid]           REQUIRED when ownership === 'already-own';
 *                                          how many payments have already been
 *                                          made before today. Used to compute the
 *                                          virtual past `purchaseAge = currentAgePrimary − yearsPaid`
 *                                          and to skip the down-payment deduction
 * @property {number} [propertyTaxReal]     annual real dollars (defaults to 0)
 * @property {number} [insuranceReal]       annual real dollars (defaults to 0)
 * @property {number} [hoaMonthlyReal]      monthly real dollars (defaults to 0)
 * @property {number} [appreciationReal]    annual decimal real appreciation rate
 *                                          (for net-proceeds calculation at
 *                                          sale). Defaults to 0
 * @property {number} [extraPaymentReal]    annual real-dollar extra principal; 0 ⇒ standard amortization
 * @property {'sell' | 'live-in' | 'inherit'} [destiny]  what happens at FIRE;
 *                                          defaults to 'live-in'. `sell` triggers
 *                                          addition of net proceeds to the taxable
 *                                          stocks pool at the FIRE boundary; also
 *                                          drops property-tax/insurance/HOA from
 *                                          subsequent retirement years
 * @property {string} [location]            country code used to pick selling-cost
 *                                          percent (US 7%, TW 4%, JP 6%, etc.).
 *                                          Defaults to 'us'
 */
```

Validation:
- `ownership === 'buying-in'` ⇒ `purchaseAge` MUST be defined and `> currentAgePrimary`.
- `ownership === 'already-own'` ⇒ `yearsPaid` MUST be defined and in `[0, termYears]` inclusive (yearsPaid = termYears represents a paid-off home).
- `homePriceReal >= downPaymentReal` (loan principal = homePrice − downPayment can't be negative).
- `destiny === 'sell'` ⇒ the mortgage module emits a `saleProceedsRealAtFire` value consumed by lifecycle at the FIRE boundary.
- If `ownership !== 'buying-now'` and `ownership !== 'already-own'` and `ownership !== 'buying-in'`, throw.

Consumers: `lifecycle.js` (per-year payment + upfront outflow + carry costs + sale proceeds), `mortgageVerdict` HTML panel.

---

### 1c. `SecondHome` — additive property overlay

```js
/**
 * @typedef {Object} SecondHome
 *
 * @property {string} [label]               cosmetic display name (e.g., "Taipei condo")
 * @property {string} [location]            country code (default 'us')
 * @property {number} homePriceReal         real dollars at today's price
 * @property {number} downPaymentReal       real dollars
 * @property {number} closingCostReal       real dollars
 * @property {number} annualRateReal        decimal real mortgage rate (0 ⇒ cash purchase)
 * @property {number} termYears             integer (ignored when rate === 0)
 * @property {number} [propertyTaxReal]     annual real dollars
 * @property {number} [otherCarryReal]      annual real dollars — insurance, HOA, utilities lumped
 * @property {number} [rentalIncomeReal]    annual real dollars (reduces carry cost; may exceed carry ⇒ net income)
 * @property {number} [appreciationReal]    decimal real appreciation
 * @property {number} purchaseAge           REQUIRED — age of primary person at
 *                                          second-home purchase. purchaseAge ===
 *                                          currentAgePrimary ⇒ immediate; >
 *                                          currentAgePrimary ⇒ buy-in
 * @property {'sell' | 'live-in' | 'inherit'} destiny  behavior at FIRE (same semantics as
 *                                          Mortgage.destiny). 'sell' adds net
 *                                          proceeds to taxable stocks at FIRE and
 *                                          zeroes future carry
 */
```

Validation:
- `purchaseAge >= currentAgePrimary`.
- `homePriceReal >= downPaymentReal`.
- `destiny in {'sell','live-in','inherit'}`.

Rationale for treating SecondHome as a separate top-level field rather than
`mortgage[1]`: the two properties have asymmetric roles (primary supplies housing
in place of rent; second is purely additive), distinct UI affordances, and the
inline engine models them with separate helpers (`getSecondHomeInputs` /
`getSecondHomeAnnualCarryAtYear` / `getSecondHomeSaleAtFire`). Keeping them split
preserves those distinctions in the contract surface.

Consumers: `lifecycle.js` (per-year carry + upfront outflow + sale proceeds), new
`secondHomeImpact` HTML panel.

---

### 1d. `StudentLoan` — adult-debt servicing

Two shapes coexist by design:

1. **Per-kid college loans.** When a `College` entry declares loan-financing (a
   `pctFinanced` fraction of tuition is amortized across a post-graduation
   repayment window), the `college.js` module produces the per-year payment and
   merges it into `CollegeSchedule.perYear[*].costReal`. No new top-level field
   is needed — the loan is an internal detail of the kid's college cost curve.
2. **Standalone household loans** (e.g., the household's own student debt, a
   physical-therapy practice loan, a used-car loan that matters to FIRE math).
   These flow through the new top-level `studentLoans` input field.

```js
/**
 * @typedef {Object} StudentLoan
 *
 * @property {string} [name]           cosmetic display ("Roger grad school")
 * @property {number} principalReal    real dollars outstanding today
 * @property {number} annualRateReal   decimal real rate (nominal − inflation)
 * @property {number} termYears        integer remaining term
 * @property {number} startAge         age payments begin (usually === currentAgePrimary for existing debt)
 * @property {number} [extraPaymentReal]  annual extra principal; defaults to 0
 */
```

Scope decision: student loans produce annual payment streams indistinguishable
in shape from `MortgageSchedule.perYear` — principal + interest + balance. The
cleanest outcome is a tiny new `calc/studentLoan.js` that delegates to the
generalized amortization math and returns `{perYear:[...], payoffYear}` — same
shape as `MortgageSchedule`. If at US2b implementation time the math genuinely
reduces to `computeMortgage(...)` with renamed params, we MAY skip the new
module and have `lifecycle.js` call `computeMortgage` per loan. That decision
lives in `tasks-us2b.md` phase U2B-3.

Consumers: `lifecycle.js` subtracts each loan's `paymentReal` from withdrawable
income in the year's draw-target adjustment.

---

### 1e. `College[]` — extended field notes (loan-aware)

The existing `College` entry in the fixture schema retains `{name, currentAge,
fourYearCostReal, startAge?}` semantics. Extended for US2b:

```js
/**
 * @typedef {Object} College
 *
 * @property {string}  name                child's display name
 * @property {number}  currentAge          today's age
 * @property {number}  [startAge]          default 18
 * @property {number}  fourYearCostReal    total real-dollar cost across all 4 years
 * @property {number}  [pctFinanced]       0..1 — share of annual tuition financed by
 *                                         Federal Direct Subsidized (in-school no
 *                                         interest; repayment starts at graduation).
 *                                         Default: 0 (fully cash-funded)
 * @property {number}  [parentPayPct]      0..1 — share of the loan's repayment that
 *                                         the parent covers. Default: 1 (parent
 *                                         fully covers). 0 ⇒ kid assumes loan, no
 *                                         retirement impact
 * @property {number}  [loanRateReal]      decimal real rate (default 0.0353 ≈ 6.53% nominal − 3% infl)
 * @property {number}  [loanTermYears]     integer (default 10)
 */
```

**Accumulation-year coverage.** Per the existing inline code: college costs
during *accumulation* reduce annual savings (the family pays out of current
income before the retirement phase starts). `college.js` already emits the
`perYear` schedule across all years, and `lifecycle.js` already subtracts those
costs during both accumulation and retirement. This is correct behavior and is
documented here so consumers don't assume college-cost years are retirement-only.

**Loan-repayment overlay.** `pctFinanced > 0` extends the `perYear` window past
the kid's 4-year in-school block to `[startAge, startAge + 4 + loanTermYears]`.
The in-school years carry only the unfinanced portion of tuition; the
post-graduation years carry loan-amortization payments (times `parentPayPct`).

Consumers: `lifecycle.js` subtracts `costReal` during both phases.

---

**Validation rules**:
- `currentAgePrimary >= 18 && < endAge`.
- `currentAgePrimary` and `currentAgeSecondary` are **integer years**. The RR
  personal-data adapter (`personal/personal-rr.js`) converts Roger/Rebecca's
  fractional birthdate-derived age to integer via `Math.floor(ageYears)` —
  matching Generic's integer-input semantics. Age advances by exactly one at
  each simulated year boundary.
- Portfolio values ≥ 0.
- `annualSpendReal > 0`.
- `returnRateReal` within [-0.10, 0.20] (sanity bound).
- `inflationRate` within [-0.05, 0.20].
- `endAge <= 110`.
- If `portfolioSecondary` present, `currentAgeSecondary` MUST also be present.
- `ssStartAgePrimary` (and `ssStartAgeSecondary` when defined) integer in [62, 70].
- When present, `contributionSplit` fractions sum to 1.0 within 1e-9.
- `employerMatchReal >= 0`.
- `taxTradRate` in [0, 0.60] when present (sanity bound; typical values 0.10..0.30).
- `scenarioSpendReal > 0` when present.
- `relocationCostReal >= 0` when present.
- `homeSaleAtFireReal >= 0` when present.
- `rentAlternativeReal >= 0` when present (monthly dollars).
- `mortgage` ownership-mode validation (see §1b).
- `secondHome.purchaseAge >= currentAgePrimary` (see §1c).
- Each `studentLoans[*]` satisfies `principalReal >= 0`, `termYears > 0`, `annualRateReal` in [-0.05, 0.20], `startAge >= currentAgePrimary`.
- Each `colleges[*]` with `pctFinanced > 0` satisfies `pctFinanced <= 1`, `parentPayPct` in [0, 1] when present, `loanTermYears > 0`.

Violations throw at the first calc module that receives the invalid input
(`calc/lifecycle.js`). Errors carry the violating field name and the bound.

---

## 2. `EffectiveFireAgeState`

Owned by `chartState.js`. The single source of truth cited in FR-001.

```js
/**
 * @typedef {Object} EffectiveFireAgeState
 * @property {number} calculatedFireAge   integer years — last solver result
 * @property {number | null} overrideFireAge   integer years, or null when no override
 * @property {number} effectiveFireAge    = overrideFireAge ?? calculatedFireAge (convenience)
 * @property {'calculated' | 'override'} source
 * @property {boolean} feasible           feasibility evaluated at effectiveFireAge
 */
```

**State transitions** (see research R9):

| Event | Action | Post-state |
|---|---|---|
| `setCalculated(newAge, feasible)` | overrideFireAge ← null; calculatedFireAge ← newAge; feasible ← feasible | effective = calculated |
| `setOverride(age)` (from confirm click) | overrideFireAge ← age | effective = override |
| `clearOverride()` (from reset click) | overrideFireAge ← null | effective = calculated |
| `revalidateFeasibilityAt(age, feasible)` (from solver-mode switch) | feasible ← feasible (only) | effective unchanged, source unchanged |
| any `recalcAll()` path (input change, scenario switch, etc.) | calls `setCalculated` internally → wipes override | effective = new calculated |
| solver-mode switch path | calls `revalidateFeasibilityAt` (NOT `setCalculated`) → preserves override | effective unchanged |

---

## 3. `LifecycleRecord[]`

```js
/**
 * @typedef {Object} LifecycleRecord
 * @property {number} year                absolute year (e.g., 2026)
 * @property {number} agePrimary          age at start of this year
 * @property {number} [ageSecondary]
 * @property {Phase} phase                'accumulation' | 'preUnlock' | 'unlocked' | 'ssActive'
 *
 * Phase glossary (maps spec.md prose names to enum values):
 *   'accumulation' — still working, contributing; no withdrawals
 *   'preUnlock'    — spec.md calls this "taxable-only"; retirement age reached but 401(k) still locked (pre-59.5)
 *   'unlocked'     — spec.md calls this "401(k)-unlocked"; post-59.5, pre-SS
 *   'ssActive'     — spec.md calls this "SS-active"; Social Security income flowing
 *
 * @property {number} totalReal           sum of all pools, real dollars (gross/canonical)
 * @property {number} effBalReal          "effective balance" — sum of pools with
 *                                        Traditional 401(k) discounted by
 *                                        `inputs.taxTradRate` (default 0.22 when
 *                                        omitted) to approximate after-tax spending
 *                                        power. Matches the inline dashboard's
 *                                        `effBal` display convention so chart
 *                                        renderers keep showing numbers users
 *                                        recognize.
 *                                        Formula: `effBalReal = totalReal −
 *                                        (trad401kReal × taxTradRate)`.
 *                                        Invariant: `effBalReal <= totalReal`
 *                                        always; equality when either
 *                                        `trad401kReal` or `taxTradRate` is 0.
 *                                        Consumer hint: chart renderers SHOULD
 *                                        display `effBalReal` by default;
 *                                        `totalReal` is for gross reporting paths
 *                                        (RMD base, estate planning).
 * @property {number} trad401kReal        Traditional 401(k) balance only (pre-tax)
 * @property {number} rothIraReal         Roth 401(k) + Roth IRA balance (post-tax, merged)
 * @property {number} [p401kTradReal]     alias of trad401kReal maintained for HTML
 *                                        renderer parity with the inline engine's
 *                                        'p401kTrad' field name. US2b chart-refactor
 *                                        tasks rename renderer reads to trad401kReal;
 *                                        this alias is a transitional convenience.
 * @property {number} [p401kRothReal]     alias of rothIraReal (same transitional rationale)
 * @property {number} taxableStocksReal
 * @property {number} cashReal
 * @property {number} contributionReal    (accumulation only)
 * @property {number} withdrawalReal      (retirement phases only)
 * @property {number} ssIncomeReal        (ssActive only)
 * @property {number} taxesPaidReal
 * @property {number} effectiveTaxRate
 * @property {boolean} feasible           false if any pool went negative this year
 * @property {number} [deficitReal]       present when !feasible
 *
 * Derived convenience booleans (present every year; computed by lifecycle.js):
 * @property {boolean} accessible         true iff `phase !== 'accumulation' && phase !== 'preUnlock'`
 *                                        ("can I tap any retirement pool THIS year?"). Used by the
 *                                        growth chart's accessible-vs-locked stack view.
 * @property {boolean} is401kUnlocked     true iff `agePrimary >= 60` (the UNLOCK_AGE constant).
 *                                        Mirrors the inline engine's per-record field of the same name.
 *
 * Optional overlay fields (present only when corresponding input exists):
 * @property {number} [healthcareCostReal]         already present today; documented here for completeness
 * @property {number} [mortgagePaymentReal]        primary residence P&I + tax + insurance + HOA this year
 * @property {number} [secondHomeCarryReal]        Home #2 annual carry (positive = drain, negative = net income)
 * @property {number} [collegeCostReal]            merged kid college + loan repayment this year (0 outside windows)
 * @property {number} [studentLoanPaymentReal]     sum of household studentLoans[*] payments this year
 * @property {number} [oneTimeOutflowReal]         composite — present the year relocation, home sale, or
 *                                                 second-home sale hits the portfolio. Sign follows convention
 *                                                 (positive = outflow). Used by the Timeline chart's
 *                                                 "major events" overlay
 */
```

Lifecycle produces ALL years from `currentAgePrimary` → `endAge`, not just up to
FIRE. One record per year. Feasibility is per-record; a lifecycle is globally
feasible iff every record is.

### 3.1 Phase-enum bridge table (inline ↔ canonical)

The inline engine embedded in `FIRE-Dashboard.html` and
`FIRE-Dashboard-Generic.html` (via `projectFullLifecycle()`) emits phase labels in a
different string format. Post-T048/T049 refactor, renderers consume canonical
names. The table below is the authoritative mapping used by the migration diff:

| Inline engine string (`projectFullLifecycle`) | Canonical enum (`data-model.md`) | Meaning |
|---|---|---|
| `'accumulation'`        | `'accumulation'` | Pre-FIRE; contributing; no withdrawals |
| `'phase1-taxable-only'` | `'preUnlock'`    | Retired, 401(k) locked (age < 60); taxable pools only |
| `'phase2-401k-unlocked'`| `'unlocked'`     | Retired, 401(k) tapped; pre-SS |
| `'phase3-with-ss'`      | `'ssActive'`     | Retired with Social Security flowing |
| `'drawdown-no-ss'` *(rare / signed-sim only)* | `'unlocked'` | Used by `signedLifecycleEndBalance` when SS is intentionally disabled for scenario analysis; lifecycle collapses to `'unlocked'` because the solver consumers do not distinguish withSS=false |

When the HTML chart renderers read `record.phase` directly, the Frontend Engineer
in T048/T049 replaces any `=== 'phase1-taxable-only'` style string compares with
`=== 'preUnlock'`. The bridge is one-way: canonical is the source of truth post-refactor;
no reverse mapping is required.

---

## 4. `FireSolverResult`

```js
/**
 * @typedef {Object} FireSolverResult
 * @property {number} yearsToFire         integer years (rounded up, age at FIRE = currentAge + yearsToFire)
 * @property {number} fireAge             integer age at which FIRE is feasible
 * @property {boolean} feasible           false ⇒ FIRE not achievable within endAge under current inputs
 * @property {number} endBalanceReal      gross portfolio value at endAge under this plan (sum of pools, real dollars)
 * @property {number} balanceAtUnlockReal gross value at 401(k) unlock (age 59.5, rounded to 60)
 * @property {number} balanceAtSSReal     gross value at SS start age
 * @property {number} endBalanceEffReal      presentation-layer companion of
 *                                           `endBalanceReal` — sources the
 *                                           corresponding lifecycle record's
 *                                           `effBalReal` (Traditional 401(k)
 *                                           pool discounted by `inputs.taxTradRate`).
 *                                           Matches the inline dashboard's effBal
 *                                           convention for display.
 * @property {number} balanceAtUnlockEffReal presentation-layer companion of
 *                                           `balanceAtUnlockReal`.
 * @property {number} balanceAtSSEffReal     presentation-layer companion of
 *                                           `balanceAtSSReal`.
 * @property {LifecycleRecord[]} lifecycle   the projection that justifies this answer
 */
```

Solver invariants (no rounding drift between solver and downstream renderers):
- `lifecycle[lifecycle.length-1].totalReal === endBalanceReal`
- `lifecycle[lifecycle.length-1].effBalReal === endBalanceEffReal`
- `lifecycle.find(r => r.agePrimary === 60).effBalReal === balanceAtUnlockEffReal`
- `lifecycle.find(r => r.agePrimary === ssStartAgePrimary).effBalReal === balanceAtSSEffReal`

---

## 5. `WithdrawalResult`

Replaces the silent-shortfall behavior flagged in the audit.

```js
/**
 * @typedef {Object} WithdrawalResult
 * @property {boolean} feasible
 * @property {WithdrawalPerYear[]} perYear
 * @property {Phase} [shortfallPhase]         first phase in which a pool went negative
 * @property {number} [deficitReal]           cumulative shortfall to endAge
 */

/**
 * @typedef {Object} WithdrawalPerYear
 * @property {number} year
 * @property {number} age
 * @property {number} fromTradReal
 * @property {number} fromRothReal
 * @property {number} fromTaxableReal
 * @property {number} fromCashReal
 * @property {number} fromSSReal
 * @property {number} taxOwedReal
 * @property {number} netSpendReal           should equal annualSpendReal when feasible
 */
```

---

## 6. `TaxResult`, `SSProjection`, `HealthcareCost`, `MortgageSchedule`, `CollegeSchedule`, `InflationHelpers`

See `contracts/*.contract.md` for per-module details. Summaries:

- **TaxResult** `{ ordinaryOwed, ltcgOwed, totalOwed, effectiveRate }` — all real.
- **SSProjection** `{ ssAgeStart, annualBenefitReal, indexedEarnings }` per person.
- **HealthcareCost** `{ annualPrefire, annualPostfireTo65, annualPost65 }` by scenario/country.
- **MortgageSchedule** `{ perYear: [{year, age, paymentReal, balanceRemaining}], payoffYear }`.
- **CollegeSchedule** `{ perYear: [{year, age, costReal, kidName}] }` merged across kids.
- **InflationHelpers** `{ toReal(amountNominal, year), toNominal(amountReal, year) }`.

---

## 7. `FixtureCase`

```js
/**
 * @typedef {Object} FixtureCase
 * @property {string} name
 * @property {Inputs} inputs
 * @property {Partial<FireSolverResult> & {lifecycleCheckpoints?: {age: number, totalReal: number, tolerance: number}[]}} expected
 * @property {string[]} [divergent]   parity-only: field names expected to differ between RR and Generic and EXCLUDED from byte-identical equality checks (e.g., ['ssPrimary.annualEarningsNominal'] for RR's actual-earnings SS vs Generic's curve)
 * @property {string} [notes]
 * @property {'unit' | 'parity' | 'integration'} kind
 */
```

Expected values may omit fields when the fixture isn't intended to lock them; tests
assert only on fields present. Tolerance (percent or absolute) is declared at
checkpoint level for lifecycle balances (forecasts should not be brittle to
single-cent arithmetic drift).

**Parity-divergence convention** (drives `tests/parity/rr-vs-generic.test.js`): when
a fixture is of `kind: 'parity'`, the test iterates every field of the
`FireSolverResult` and asserts byte-identical equality between the RR-path and
Generic-path outputs. Fields listed in `divergent` are SKIPPED — they are declared
to legitimately differ (e.g., SS projection when RR uses actual earnings). This
prevents the parity test from failing spuriously while still enforcing that ONLY
explicitly-approved divergences exist.

---

## 8. `PersonalDataEnricher` (RR-only)

```js
/**
 * @callback PersonalDataEnricher
 * @param {PartialInputs} htmlFormState   what RR's HTML form provides
 * @returns {Inputs}                      fully-enriched canonical input for shared modules
 */
```

The RR adapter:
- Derives `currentAgePrimary` / `currentAgeSecondary` from Roger's and Rebecca's
  birthdates.
- Injects `ssPrimary` (Roger's real earnings history) when present.
- Injects `colleges` for Janet and Ian with their actual start years.
- MUST NOT compute any FIRE math.
- MUST NOT read from `chartState`, `lifecycle`, or any calc module.

This module is imported only by `FIRE-Dashboard.html`.

---

## 9. `ChartRenderContract`

Not a runtime value — a required header comment shape in every HTML chart renderer.
Parsed by the meta-test in `tests/meta/module-boundaries.test.js`.

Example (required shape):

```js
// @chart: growthChart
// @module: lifecycle.js  — reads: totalReal, trad401kReal, taxableStocksReal, ssIncomeReal
// @module: chartState.js — reads: effectiveFireAge, source, feasible
// @module: fireCalculator.js — reads: balanceAtUnlockReal, balanceAtSSReal
function renderGrowthChart({ chart, lifecycle, state, solver }) { ... }
```

The meta-test:
1. Parses these comment blocks out of the HTML files.
2. Parses every `calc/*.js` module's `Consumers:` header.
3. Asserts bijection: every module→chart edge declared by the chart is also
   declared by the module, and vice versa.

---

## Relationships (sketch)

```text
HTML form
   │
   ▼
[personal-rr.js]  (RR only)
   │
   ▼
Inputs ───────────────┬──▶ lifecycle.js ──▶ LifecycleRecord[]
                      │         ▲
                      │         │ uses
                      │    inflation.js, tax.js, socialSecurity.js,
                      │    healthcare.js, mortgage.js, college.js,
                      │    withdrawal.js
                      │
                      └──▶ fireCalculator.js ──▶ FireSolverResult
                                │
                                ▼
                          chartState.js ──▶ EffectiveFireAgeState
                                │  (subscription: notify all charts)
                                ▼
                      ┌──────────┴──────────┐
                      ▼                     ▼
              growthChart renderer    kpiCards renderer
              rothLadder renderer     scenarioCard renderer
              ssChart renderer        mortgageVerdict renderer
              timelineChart renderer  coastFireIndicator renderer
                      │
                      ▼
                  Chart.js canvases / DOM
```

---

## Validation summary

- `Inputs` validated on entry to `lifecycle.js` (fail fast, clear error).
- `EffectiveFireAgeState.source` MUST match whether `overrideFireAge` is null.
- `LifecycleRecord.feasible=false` ⇒ `deficitReal` present.
- `FireSolverResult.feasible=false` ⇒ `fireAge` equals `endAge` and a warning flag
  propagates to the infeasibility banner (FR-004).
- `ChartRenderContract` parse failure fails the meta-test suite.
