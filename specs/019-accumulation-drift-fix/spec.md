# Feature 019 — Accumulation Drift Fix

**Branch (proposed)**: `019-accumulation-drift-fix`
**Predecessor**: 018 (lifecycle-payoff-merge)
**Status**: SPEC
**Author**: Backend Engineer (architect agent)
**Date**: 2026-04-30

---

## 1. Problem statement

Three independent simulators in `FIRE-Dashboard.html` (and the Generic mirror) each implement their own pre-FIRE accumulation loop. Only one — the canonical `projectFullLifecycle` — handles real-world events correctly. The other two silently carry a phantom cash balance into the retirement phase.

The unit test `tests/unit/cashAccumulationDrift.test.js` reproduces the bug in pure Node against the user's audit scenario:

| Sim path | Function | Inline location (RR) | pCash @ FIRE | Drift vs canonical |
|---|---|---|---:|---:|
| A (canonical) | `projectFullLifecycle` | 9333–9475 + 9632–9638 | $0 | — |
| B (buggy) | `_simulateStrategyLifetime` | 10595–10614 | $84,512 | +$84,512 |
| C (buggy) | `computeWithdrawalStrategy` | 11031–11041 | $84,512 | +$84,512 |

User scenario: `cashSavings=80000, mtgBuyInYears=2, mtgDownPayment=120000, mtgClosingCosts=17000, ageRoger=42, fireAge=53`.

Three event classes are skipped in B and C:

1. **Mortgage buy-in.** Down payment + closing costs subtracted from cash; spillover to stocks. A handles at 9344–9363 (pre-loop for `buying-now` / `already-own`) and 9452–9463 (in-loop for delayed `buying-in`).
2. **Home #2 buy-in.** Same mechanism. A handles at 9369–9380 + 9465–9475.
3. **Effective savings.** A computes `effectiveAnnualSavings = max(0, monthlySavings*12 − mtgSavingsAdjust − collegeDrainAccumulation − h2DrainAccumulation)` per year (line 9605). B and C use raw `monthlySavings * 12`.

## 2. User-visible impact

The phantom cash skews everything downstream of B and C:

- **Strategy ranker (Lifetime Strategy chart).** Strategies that should be infeasible because the buy-in drains stocks pass the buffer floor on paper. The displayed winner can disagree with the chart.
- **Withdrawal Strategy chart.** Year 1 withdrawal mix shows non-zero `wCash` even though the canonical lifecycle simulator has `pCash = 0`. This is the most user-visible symptom — and is exactly what the user reported.
- **`crossValidationWarnings.endBalance-mismatch`.** The ranker's verdict vs the chart's verdict diverge in the exact way the strategy-parity rule warns against (CLAUDE.md → Process Lessons → "FIRE-mode gates MUST evaluate the displayed strategy"). This is the sibling rule: gates must consume the SAME accumulation as the chart.

## 3. Solution overview

Extract a single pure function `accumulateToFire(inp, fireAge, options) → { pTrad, pRoth, pStocks, pCash }` to `calc/accumulateToFire.js`. Rewire all three call sites to consume it. The canonical `projectFullLifecycle` MUST also be ported, byte-exact, otherwise the helper drifts from canon over time (the central risk).

## 4. Contract

### 4.1 Signature

```
accumulateToFire(inp, fireAge, options) → {
  pTrad:   number,
  pRoth:   number,
  pStocks: number,
  pCash:   number,
}
```

"Start of FIRE year" matches the canonical convention: `data.push(...)` for year `fireAge` happens AFTER any FIRE-year mortgage/sale mutations but BEFORE the retirement-year withdrawal. The helper's responsibility ends at the same point.

### 4.2 Inputs read from `inp`

Every field below is consumed by the canonical accumulation loop (verified by reading `projectFullLifecycle` lines 9298–9638). The helper MUST read all of them.

**Identity / age:**
- `inp.ageRoger` (RR) OR `inp.agePerson1` (Generic) — current age. Helper resolves via `inp.agePerson1 ?? inp.ageRoger` (matches the dual-fallback pattern already in `_simulateStrategyLifetime` line 10605).

**Starting balances:**
- `inp.roger401kTrad` OR `inp.person1_401kTrad`
- `inp.roger401kRoth` OR `inp.person1_401kRoth`
- `inp.rogerStocks` + `inp.rebeccaStocks` OR `inp.person1Stocks` + `inp.person2Stocks`
- `inp.cashSavings`
- `inp.otherAssets` (defaults to 0)

**Returns:**
- `inp.return401k` and `inp.returnRate` (nominal) — helper computes `realReturn401k = return401k − inflationRate` and `realReturnStocks = returnRate − inflationRate` to match line 9318–9319.
- `inp.inflationRate`

**Contributions:**
- `inp.contrib401kTrad` (default 0)
- `inp.contrib401kRoth` (default 0)
- `inp.empMatch` (default 0)
- `inp.monthlySavings` (default 0)

**Tax / planning constants:**
- `inp.endAge` (default 95)
- `inp.taxTrad` — only relevant if helper internally calls `payoffVsInvest`
- `inp.stockGainPct` (default 0.6) — same caveat
- `inp.ssClaimAge` — NOT consumed during accumulation
- `inp.raiseRate` — line 9634 advances `income *= (1 + inp.raiseRate)` during accumulation. Not part of four-pool return shape.

### 4.3 `options` parameter (all optional)

```js
{
  mortgageStrategyOverride: 'invest-keep-paying' | 'prepay-extra' | 'invest-lump-sum',
  mortgageEnabled:    boolean,
  mortgageInputs:     MortgageShape | null,
  secondHomeEnabled:  boolean,
  secondHomeInputs:   SecondHomeShape | null,
  rentMonthly:        number,
  pviExtraMonthly:    number,
  selectedScenario:   string,
  collegeFn:          (inp, yearsFromNow) => number,
  payoffVsInvestFn:   (inputs) => PvIOutputs | null,
  framing:            'liquidNetWorth' | 'totalNetWorth',
  mfjStatus:          'mfj' | 'single',
}
```

**Why dependency injection.** The canonical loop reads from DOM, from module-level closure, and from optional globals. A pure Node-importable helper cannot reach any of those. We choose to resolve at the call site — each caller assembles `options` from its DOM/closure environment via a small `resolveAccumulationOptions()` helper that is allowed to be impure.

### 4.4 Output shape

```
{ pTrad: number, pRoth: number, pStocks: number, pCash: number }
```

All values are real (inflation-adjusted) dollars, finite, and ≥ 0.

### 4.5 Invariants

1. **Purity.** No DOM access. No `window`/`document`/`localStorage`. No module-scope mutation. No `Math.random` (deterministic given inputs).
2. **Clamping.** `pCash` and `pStocks` MUST NOT go negative. When a buy-in exceeds available cash, the residual flows to stocks per the canonical rule:
   ```
   if (pCash >= upfrontCost) {
     pCash -= upfrontCost;
   } else {
     const remainder = upfrontCost - max(0, pCash);
     pCash = 0;
     pStocks = max(0, pStocks - remainder);
   }
   ```
3. **Effective savings ≥ 0.** Mirrors line 9605: `effectiveAnnualSavings = max(0, monthlySavings*12 − mtgSavingsAdjust − collegeDrainAccumulation − h2DrainAccumulation)`.
4. **Cash growth.** `pCash *= 1.005` per year (matches lines 9638, 10613, 11040).
5. **Real returns.** Stocks and 401(k) compound at real return; cash compounds at nominal 1.005.
6. **Strategy-aware mortgage P&I.** When `options.mortgageStrategyOverride !== 'invest-keep-paying'` AND `payoffVsInvestFn` is provided, the helper consumes the per-year `amortizationSplit[strategyKey]` row to compute `mtgSavingsAdjust`. On exception or null PvI output, falls back to contractual amortization.
7. **Lump-sum drain.** When strategy === `'invest-lump-sum'` AND a `lumpSumEvent` is reported AND `age >= lumpSumEvent.age`, the helper drains `lumpSumEvent.brokerageBefore − lumpSumEvent.brokerageAfter` from pStocks. Only fires DURING accumulation if `lumpSumEvent.age < fireAge`.
8. **Sell-at-FIRE handoff (US4 from feature 018).** When `mortgageInputs.sellAtFire === true`, the helper does NOT seed pStocks at FIRE — that is the retirement-phase simulator's job. The helper's responsibility ends BEFORE the FIRE-year sale settlement.
9. **Conservation.** No magic value generation.

### 4.6 Out of scope

- Retirement-phase year-by-year simulation
- The `data[]` per-year row push (lines 9616–9630) — only the helper's end-state pools matter (see Open Question 3)
- The `income` and `raiseRate` pre-FIRE income trajectory
- DOM reads — explicitly delegated to `resolveAccumulationOptions()` at each call site

## 5. Caller list (all sites that get rewired)

| # | Function | Lines (RR) | Lines (Generic) | Risk |
|---|---|---|---|---|
| 1 | `projectFullLifecycle` accumulation branch | 9333–9475 (pre-loop) + 9632–9638 (in-loop) | same | **HIGH** — byte-exact migration required; 163 tests depend on this |
| 2 | `_simulateStrategyLifetime` | 10595–10614 | same | MEDIUM — rewire fixes the bug; strategy ranker outputs WILL shift |
| 3 | `computeWithdrawalStrategy` | 11031–11041 | same | MEDIUM — rewire fixes the bug; Year-1 wCash drops to 0 |

All three sites MUST receive the same `options` resolution helper. Apply lockstep across BOTH HTMLs.

## 6. Risks

### 6.1 Strategy ranker outcomes shift

Strategies that previously appeared "feasible" because the phantom cash floored the buffer check will become infeasible. `crossValidationWarnings.endBalance-mismatch` should DROP. **Mitigation:** new regression test pins exact pre-fix and post-fix expected values.

### 6.2 Lifetime tax shifts

Lifetime tax totals will change because (a) the starting pStocks at FIRE is lower, (b) the wCash sum is no longer phantom. This is the bug being fixed.

### 6.3 The 163-test regression risk

`projectFullLifecycle` is the canonical implementation that 163 existing tests pin. The migration must be byte-exact for projectFullLifecycle. **Mitigation:** Step 2 of the plan is "rewire projectFullLifecycle and verify ALL 163 tests still pass" BEFORE any buggy site is touched.

### 6.4 Future canonical drift

Every accumulation call site gets the comment `// CANONICAL ACCUMULATION — see calc/accumulateToFire.js`. PR template adds checkbox: "Did you add a new pre-FIRE accumulation loop? If so, did you call `accumulateToFire`?".

### 6.5 Inline deltas across the dual-HTML lockstep

The helper threads `mfjStatus` through `options.mfjStatus` to preserve the documented RR-vs-Generic divergence cleanly.

## 7. Test plan

### 7.1 Stay green (must not break)

All 163 existing tests must remain green. If any existing test fails after Step 2, it is a real regression. **Do NOT update the test to match new behavior** without explicit user justification.

### 7.2 New tests

- **T-019-01: Post-fix sentinel.** The sentinel test in `tests/unit/cashAccumulationDrift.test.js` (currently expected to fail) must pass.
- **T-019-02: Helper unit tests.** New file `tests/unit/accumulateToFire.test.js` covering ~14 cases (clean accumulation, mortgage buy-in modes, Home #2, college drain, effective savings clamping, strategy-aware P&I, lump-sum drain, conservation). Target ≥ 80% coverage.
- **T-019-03: wCash regression.** Asserts `sum(rows.map(r => r.wCash)) === 0` for the user's scenario.
- **T-019-04: Strategy parity.** Asserts `_simulateStrategyLifetime`'s pre-FIRE end-state pools equal `projectFullLifecycle`'s pre-FIRE end-state pools (within $1 tolerance).

### 7.3 Browser smoke

Per Process Lessons → "Browser smoke before claiming a feature done":

1. Open both dashboards in a real browser.
2. Confirm Withdrawal Strategy chart Year-1 row shows `wCash = 0`.
3. Confirm strategy ranker winner is consistent with the lifecycle chart.
4. Confirm zero red console errors.
