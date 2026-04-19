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
 * @property {Mortgage} [mortgage]
 * @property {College[]} colleges              empty array for no kids
 * @property {SSEarnings} [ssPrimary]          null → use generic SS curve
 * @property {SSEarnings} [ssSecondary]
 * @property {number} ssStartAgePrimary        integer 62..70 — claim age for primary person
 * @property {number} [ssStartAgeSecondary]    integer 62..70 — claim age for secondary person (when present)
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
```

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
 * @property {number} totalReal           sum of all pools, real dollars
 * @property {number} trad401kReal
 * @property {number} rothIraReal
 * @property {number} taxableStocksReal
 * @property {number} cashReal
 * @property {number} contributionReal    (accumulation only)
 * @property {number} withdrawalReal      (retirement phases only)
 * @property {number} ssIncomeReal        (ssActive only)
 * @property {number} taxesPaidReal
 * @property {number} effectiveTaxRate
 * @property {boolean} feasible           false if any pool went negative this year
 * @property {number} [deficitReal]       present when !feasible
 */
```

Lifecycle produces ALL years from `currentAgePrimary` → `endAge`, not just up to
FIRE. One record per year. Feasibility is per-record; a lifecycle is globally
feasible iff every record is.

---

## 4. `FireSolverResult`

```js
/**
 * @typedef {Object} FireSolverResult
 * @property {number} yearsToFire         integer years (rounded up, age at FIRE = currentAge + yearsToFire)
 * @property {number} fireAge             integer age at which FIRE is feasible
 * @property {boolean} feasible           false ⇒ FIRE not achievable within endAge under current inputs
 * @property {number} endBalanceReal      portfolio value at endAge under this plan
 * @property {number} balanceAtUnlockReal value at 401(k) unlock (age 59.5, rounded to 60)
 * @property {number} balanceAtSSReal     value at SS start age
 * @property {LifecycleRecord[]} lifecycle  the projection that justifies this answer
 */
```

Solver invariant: `lifecycle[lifecycle.length-1].totalReal === endBalanceReal` (no
rounding drift between solver and downstream renderers).

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
