# Baseline Capture — RR & Generic Inline Engines

**Feature**: `001-modular-calc-engine` (US2b parity phase)
**Date**: 2026-04-19
**Author**: Backend Engineer
**Purpose**: Lock the *pre-refactor* output of the inline engine for a canonical
RR input set and a canonical Generic input set so that US2b implementers can
distinguish **regression** (canonical engine drifts from inline) from
**intentional correctness fix** (canonical engine fixes an audit-identified bug
— deliberate, documented delta).

> **Scope note.** The values in §A.analytical and §B.analytical are analytical
> estimates computed from the HTML defaults + the inline formulas in
> `FIRE-Dashboard.html:3705-3862` and `FIRE-Dashboard-Generic.html:3560-3710`
> (the `signedLifecycleEndBalance` and `findFireAgeNumerical` implementations).
> §A.observed and §B.observed are LEFT AS PLACEHOLDERS — the US2b implementer
> (see `tasks-us2b.md` TB02/TB03) opens each dashboard in Chromium, enters the
> canonical inputs, and records the displayed KPIs. The analytical estimates
> are a sanity check; the observed values are authoritative.

---

## Section A — Canonical RR input set

These are the values Roger's personal dashboard loads when opened cold (from
the hidden inputs + range-slider defaults in `FIRE-Dashboard.html`). Only the
personal-data fields (ages, portfolios, kids) and defaulted knobs matter; the
scenario defaults to `taiwan`.

| Field | HTML input id | Default value | Unit / notes |
|---|---|---|---|
| Primary age | `ageRoger` | **43** | integer years |
| Secondary age | `ageRebecca` | **42** | integer years |
| Kid 1 age (Janet) | `ageKid1` | **10** | |
| Kid 2 age (Ian) | `ageKid2` | **4** | |
| Annual income (accumulation) | `annualIncome` | **$150 000** | today dollars |
| Raise rate | `raiseRate` | **2 %** | annual |
| Primary taxable (Roger) | `rogerStocks` | **$190 000** | |
| Secondary taxable (Rebecca) | `rebeccaStocks` | **$200 000** | |
| Cash savings | `cashSavings` | **$0** | |
| Other assets | `otherAssets` | **$0** | |
| Trad 401(k) (Roger only) | `roger401k` | **$25 000** | |
| Roth 401(k)/IRA (Roger) | `roger401kRoth` | **$58 000** | |
| Return on stocks (nominal) | `returnRate` | **7 %** | |
| Return on 401(k) (nominal) | `return401k` | **7 %** | |
| Inflation | `inflationRate` | **3 %** | |
| SWR | `swr` | **4 %** | (display only, not used by signed solver) |
| Monthly taxable savings | `monthlySavings` | **$2 000** | |
| Annual Trad 401(k) contribution | `contrib401k` | **$8 550** | |
| Annual Roth 401(k) contribution | `contrib401kRoth` | **$2 850** | |
| Trad-withdrawal tax drag | `taxTrad` | **15 %** | |
| Employer match (Trad) | `empMatch` | **$7 200** | annual |
| Safe-mode unlock buffer | `bufferUnlock` | **2** | years of spend |
| Safe-mode SS buffer | `bufferSS` | **3** | years of spend |
| End age | `endAge` | **95** | |
| SS claim age | `ssClaimAge` (global) | **67** | |
| Scenario | (selectedScenario default) | `taiwan` | annualSpend $60 k, relocation $15 k |
| Solver mode | (fireMode default) | `safe` | |
| Mortgage enabled | `mortgageEnabled` | **false** | cold-load default |
| Second home enabled | `secondHomeEnabled` | **false** | cold-load default |

Derived canonical `Inputs` shape (post-adapter):
```
currentAgePrimary:   43,         currentAgeSecondary: 42,  endAge: 95
portfolioPrimary.trad401kReal:   25 000
portfolioPrimary.rothIraReal:    58 000     (Roth 401k merged)
portfolioPrimary.taxableStocksReal: 190 000
portfolioPrimary.cashReal:         0
portfolioPrimary.annualContributionReal:   24 000 (monthly $2k × 12) + 8 550 + 2 850 + 7 200 match
portfolioSecondary.taxableStocksReal: 200 000; other pools 0; annualContrib 0
annualSpendReal:     60 000       (Taiwan scenario annualSpend)
returnRateReal:      0.04         (7 % nominal − 3 % infl)
inflationRate:       0.03
ssStartAgePrimary:   67; ssStartAgeSecondary: 67
relocationCostReal:  15 000       (Taiwan)
contributionSplit:   default 60/20/20
employerMatchReal:   7 200
taxTradRate:         0.15
buffers:             {bufferUnlockMultiple: 2, bufferSSMultiple: 3}
solverMode:          'safe'
colleges:            [Janet 10y, US-private $~82 k/yr × 4; Ian 4y, same]
                     (no loan financing by default: loanPct 0 for both)
```

### A.analytical — coarse analytical estimate

A fully-analytical `fireAge` for this scenario is not closed-form (healthcare
delta, three-phase SS, mortgage=off simplification, Taiwan relocation jump at
FIRE all couple). A conservative analytical bound assuming:
- Net worth today ≈ $673 k (190+200+25+58+0 = $473 k taxable+401k; HTML displays extras via `otherAssets` + any inherited).
- Annual real savings ≈ $24 k (monthly) + $11 400 (Trad+Roth) + $7 200 match = $42 600 ± effective tax drag.
- Annual retirement spend ≈ $60 k (Taiwan) + healthcare delta + college years + $15 k one-time relocation at FIRE.

gives roughly **yearsToFire ≈ 11–14 years** (fireAge ≈ 54–57) under Safe mode
with `bufferUnlock: 2`, `bufferSS: 3`. Die-with-Zero likely shaves 1–3 years
off; Exact mode sits in between.

### A.observed — TO BE FILLED IN BY TB02

Run TB02 (see `tasks-us2b.md`): open `FIRE-Dashboard.html` from `file://`,
record the values displayed below. All are real dollars.

| Metric | Safe mode | Exact mode | Die-with-Zero |
|---|---|---|---|
| `fireAge` | `[TB02]` | `[TB02]` | `[TB02]` |
| `yearsToFire` | `[TB02]` | `[TB02]` | `[TB02]` |
| `balanceAtUnlockReal` (age 60) | `[TB02]` | `[TB02]` | `[TB02]` |
| `balanceAtSSReal` (age 67) | `[TB02]` | `[TB02]` | `[TB02]` |
| `endBalanceReal` (age 95) | `[TB02]` | `[TB02]` | `[TB02]` |
| Feasibility displayed | `[TB02]` | `[TB02]` | `[TB02]` |

---

## Section B — Canonical Generic input set

These are the values the Generic dashboard loads cold (from
`FIRE-Dashboard-Generic.html`).

| Field | HTML input id | Default value |
|---|---|---|
| Primary age | `agePerson1` | **36** |
| Secondary age | `agePerson2` | **36** |
| Children | (childrenList default) | empty initially (user adds) |
| Annual income | `annualIncome` | **$80 000** |
| Raise rate | `raiseRate` | 2 % |
| Primary taxable | `person1Stocks` | **$0** |
| Secondary taxable | `person2Stocks` | **$0** |
| Cash savings | `cashSavings` | **$0** |
| Other assets | `otherAssets` | **$0** |
| Trad 401(k) | `person1_401k` | **$0** |
| Return on stocks / 401(k) | `returnRate` / `return401k` | 7 % / 7 % |
| Inflation | `inflationRate` | 3 % |
| Monthly taxable savings | `monthlySavings` | **$500** |
| Annual Trad 401(k) contribution | `contrib401k` | **$3 000** |
| Trad tax drag | `taxTrad` | 15 % |
| Employer match | `empMatch` | **$1 500** |
| bufferUnlock / bufferSS | | 2 / 3 |
| End age | | 95 |
| Scenario | (default) | `us` annualSpend $78 000, relocation $0 |
| Solver mode | | `safe` |

Derived canonical `Inputs` shape:
```
currentAgePrimary: 36, currentAgeSecondary: 36, endAge: 95
portfolioPrimary.trad401kReal: 0
portfolioPrimary.rothIraReal:  0
portfolioPrimary.taxableStocksReal: 0
portfolioPrimary.cashReal:     0
portfolioPrimary.annualContributionReal: $500×12 + $3 000 + $1 500 match = $10 500
portfolioSecondary: same shape, zeros
annualSpendReal: 78 000   (US scenario annualSpend)
returnRateReal:  0.04
inflationRate:   0.03
ssStartAgePrimary: 67
contributionSplit: default
solverMode: 'safe'
```

### B.analytical — coarse analytical estimate

Zero starting portfolio + $10.5 k/yr real contributions + 4 % real return
compound to ≈ $26 k over 10 years, ≈ $128 k over 20 years, ≈ $320 k over 30
years, ≈ $700 k over 40 years.

Against a $78 k/yr retirement spend + Safe-mode buffers, the $700 k mark at
age 76 is insufficient for the 4 % rule ($78 k / 0.04 = $1.95 M needed). The
Generic cold-load scenario is **expected to be infeasible** (fireAge ≈ endAge
= 95; feasible=false displayed in dashboard as the infeasibility banner).

This is by design — the Generic defaults encourage the user to fill in
realistic portfolio values. It also makes Generic a useful canonical
infeasibility fixture, and flushes out the Generic-ignores-secondary-person
bug (FR-010 / SC-005) because doubling `portfolioSecondary` of zero is still
zero.

### B.observed — TO BE FILLED IN BY TB03

Run TB03: open `FIRE-Dashboard-Generic.html` from `file://`, record values.

| Metric | Safe mode | Exact mode | Die-with-Zero |
|---|---|---|---|
| `fireAge` | `[TB03]` | `[TB03]` | `[TB03]` |
| `yearsToFire` | `[TB03]` | `[TB03]` | `[TB03]` |
| `balanceAtUnlockReal` | `[TB03]` | `[TB03]` | `[TB03]` |
| `balanceAtSSReal` | `[TB03]` | `[TB03]` | `[TB03]` |
| `endBalanceReal` | `[TB03]` | `[TB03]` | `[TB03]` |
| Feasibility displayed | `[TB03]` | `[TB03]` | `[TB03]` |

---

## Section C — Intentional Correctness Deviations (Audit-Identified Bugs)

The canonical engine **deliberately diverges** from the inline engine in the
following places. These deviations are correctness fixes, not regressions.
Tests that assert baseline values MUST tolerate these specific deltas and lock
the corrected values instead.

### C.1 Real-vs-nominal mixing at the healthcare / college boundary

**Inline behavior**: `FIRE-Dashboard.html:3819` and its Generic twin compute
`getHealthcareDeltaAnnual(scenario, age)` and add it directly to real-dollar
`retireSpend`. The delta function reads scenario values that in some paths are
in nominal dollars (e.g., when a user enters a `healthcareOverride*Nominal`
field on the country scenario). Result: real + nominal accidentally mixed —
slight overshoot or undershoot of the true adjusted spend.

**Canonical behavior**: `calc/lifecycle.js:180-203` (`healthcareForYear`)
converts any nominal input via `inflation.toReal(value, year)` BEFORE adding
to `adjustedSpend`. No nominal value ever reaches the retirement-phase math
without explicit conversion. FR-017 enforcement.

**Expected impact**: `fireAge` shifts by ≤ 1 year for a typical RR scenario
(usually +0 or +1 when inline was using under-inflated deltas; −0 or −1 when
inline was over-inflating). College delta has the same shape but inline
already uses real-dollar fourYearCost, so the college side is usually zero
delta.

**Baseline values affected**: §A.observed and §B.observed will differ from
the canonical engine's output by this amount; document the specific delta per
scenario when TB21 runs the fixture.

### C.2 Silent shortfall absorption

**Inline behavior**: `FIRE-Dashboard.html:3829, 3845` (and the matching Generic
lines) push negative balances into `pStocks` when all pools are exhausted —
i.e., during the retirement phase, if the household tries to withdraw more
than the combined positive balance, the stocks pool goes negative silently
and the final lifecycle total is artificially low. The UI then reports the
final value (or clamps it to 0) without surfacing an infeasibility.

**Canonical behavior**: `calc/withdrawal.js` returns a typed
`{feasible: false, deficitReal}` result; `calc/lifecycle.js` carries
`feasible: false` + `deficitReal` on the offending record; `chartState` emits
`feasible: false`; the UI's infeasibility banner activates (FR-004 / FR-013).

**Expected impact**: scenarios the inline engine shows as "feasible with
small stock balance at endAge" may flip to "infeasible with deficit $X" —
which is the correct answer. Specifically, a Safe-mode RR scenario that
squeaks through today because the last 2 years of negative-stocks absorption
go undetected will correctly fail Safe under the canonical engine.

**Baseline values affected**: any fixture where §A.observed or §B.observed
shows borderline feasibility; the canonical result may report infeasibility
at the same fireAge. Do NOT treat this as a regression. Document the per-
fixture outcome in the TB21 commit body.

### C.3 Monte Carlo determinism (AUDIT NOTE ONLY — out of scope)

The inline engine's "Monte Carlo" simulator runs deterministic scenarios. The
canonical engine preserves this behavior (Monte Carlo is not extracted in
this feature per `spec.md §Assumptions`). A future `calc/monteCarlo.js`
module will replace this with a proper stochastic engine. Not a US2b
deliverable; flagged here only so reviewers don't confuse "still deterministic"
with "regression".

### C.4 Generic ignores secondary-person portfolio (corrected in US3)

**Inline behavior** (Generic today): `findFireAgeNumerical` in the Generic
HTML uses `person1_401k + person1Stocks + cashSavings + otherAssets` — it
does NOT include `person2Stocks` in the starting portfolio that the solver
searches against. The KPI card displays a `netWorth` value that does include
person2Stocks, but the solver does not. FR-010 / SC-005 identify this as a
bug.

**Canonical behavior**: `calc/lifecycle.js:314-322` sums both
`portfolioPrimary` and `portfolioSecondary` pools when non-zero. The US3 /
US2b extraction corrects this.

**Expected impact on baseline**: Generic's B.observed `fireAge` under the
cold-load zero-portfolio case is unaffected (zero + zero = zero). But if a
user populates `portfolioSecondary.taxableStocksReal > 0` and compares
inline vs canonical, the canonical `fireAge` will be earlier (SC-005
sensitivity test locks a ≥ 1 year delta for a doubled secondary portfolio).

---

## Section D — Post-Refactor Canonical Baseline (TO BE FILLED IN AT TB30)

Once U2B-4 lands and TB29 smoke tests pass, re-capture both dashboards' KPIs
in this section. This becomes the new regression baseline for future work.

| Fixture | fireAge | yearsToFire | endBalanceReal | Notes |
|---|---|---|---|---|
| `rr-realistic` | `[TB30]` | `[TB30]` | `[TB30]` | Post-canonical; supersedes §A.observed |
| `generic-realistic` | `[TB30]` | `[TB30]` | `[TB30]` | Post-canonical; supersedes §B.observed |

---

**End of baseline-rr-inline.md**
