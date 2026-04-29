# Contract — Lifecycle Simulator ↔ PvI Calc Module Handoff

**Purpose:** Defines how the lifecycle simulator (currently inline `<script>` blocks in both HTML files) consumes the PvI calc module's outputs to produce a strategy-aware projection. This contract is the integration boundary between feature 017's pure calc and feature 018's lifecycle integration.

**Locations:**
- Lifecycle simulator: `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` inline scripts (the function `projectFullLifecycle` and its callers).
- Calc module: `calc/payoffVsInvest.js` (v3).

---

## Inputs to lifecycle simulator (extension)

`projectFullLifecycle(inp, annualSpend, fireAge, isFinalSimulation, options)` — existing signature. The `options` argument gains:

```ts
options.mortgageStrategyOverride: 'prepay-extra' | 'invest-keep-paying' | 'invest-lump-sum' | undefined
```

Convention: when `undefined`, lifecycle simulator reads the active strategy from `state._payoffVsInvest.mortgageStrategy` (with the v2/v1 fallback chain). When provided, override the state value (for what-if analysis or sensitivity testing — same pattern as existing `strategyOverride` and `thetaOverride`).

---

## Pre-FIRE accumulation phase

The lifecycle simulator's pre-FIRE annual loop receives these per-year quantities from the PvI calc module under the active strategy:

| Per-year input | Source | Notes |
|---|---|---|
| Mortgage P&I cash flow | `amortizationSplit.{prepay\|invest}[i].interestPaidThisYear + .principalPaidThisYear` | Year `i` mapped to age `currentAge + i`. The lifecycle simulator subtracts this from the user's net contributions for that year. |
| Brokerage contribution | `amortizationSplit.{prepay\|invest}[i].brokerageContribThisYear` | The amount that should flow to the brokerage that year. Includes pre-buy-in, post-payoff (P&I+extra), and lump-sum redirection logic. |
| Lump-sum drawdown event | `lumpSumEvent` (when active strategy is `invest-lump-sum` AND event fires pre-FIRE) | Single discrete event year; lifecycle simulator subtracts `lumpSumEvent.brokerageBefore − lumpSumEvent.brokerageAfter` from brokerage in that year (this includes the LTCG gross-up). |

The lifecycle simulator MUST treat these per-year quantities as authoritative — it does NOT independently amortize the mortgage. This is the single source of truth (Principle III).

---

## FIRE handoff value

At the moment the lifecycle simulator transitions from the pre-FIRE accumulation phase to the retirement (post-FIRE) phase, it consumes:

```ts
postSaleBrokerageAtFire: { prepay: number, invest: number }
```

The lifecycle simulator selects the correct entry based on the active mortgage strategy:

```js
const seedBrokerage = postSaleBrokerageAtFire[
  mortgageStrategy === 'prepay-extra' ? 'prepay' : 'invest'
];
```

This `seedBrokerage` becomes the starting value of the retirement-phase brokerage. The lifecycle simulator's existing withdrawal-strategy logic (per feature 008, 015) then runs from this seed.

When `sellAtFire === true`, the lifecycle simulator's mortgage cash flow stops at FIRE age (no further P&I; home equity transferred to brokerage in `seedBrokerage`).

When `sellAtFire === false`, the lifecycle simulator continues to track mortgage cash flow through the post-FIRE years per the active strategy (e.g., Invest-keep-paying continues paying P&I in retirement until the bank's amortization-end). Home equity persists as illiquid net worth.

---

## Audit observability

The lifecycle simulator MUST emit a stage in the audit's flow diagram with the subSteps from the PvI calc module's `subSteps` array. Specifically, the lifecycle's audit stage "Pre-FIRE Accumulation" gains an inner section "Mortgage Strategy Resolution" populated from the calc module's subSteps.

The `feasibilityProbe` block in `copyDebugInfo()` MUST record the resolved `mortgageStrategy` it ran under, so a debug paste reveals which strategy was active.

---

## Behavioral Invariants

### LH-Inv-1: Strategy parity between probe and chart

For any recompute, the FIRE-age search's feasibility probe and the chart's lifecycle render MUST consume the same `mortgageStrategy`. Verified by: `feasibilityProbe.activeMortgageStrategy === outputs.mortgageStrategy`.

This mirrors the feature-014 process lesson "FIRE-mode gates MUST evaluate the displayed strategy" — extended now to mortgage strategy.

### LH-Inv-2: Backwards compat for saved states without strategy field

When `state._payoffVsInvest` lacks `mortgageStrategy`, the lifecycle simulator MUST behave byte-identically to feature 017's `lumpSumPayoff: false` baseline. Verified by SC-004's regression test loading a v017-era state file and diffing the lifecycle outputs.

### LH-Inv-3: Sale event terminates mortgage cash flow

When `sellAtFire === true && mortgageEnabled === true`, the lifecycle simulator's annual cash flow line for "mortgage P&I" MUST be $0 for every year `>= fireAge`. The home is gone; no more P&I.

### LH-Inv-4: Lump-sum + sale event composition

When `mortgageStrategy === 'invest-lump-sum' && sellAtFire === true`:
- If lump-sum fires pre-FIRE, lifecycle shows BOTH events: brokerage drop at lump-sum age, then sale event at FIRE (full home value injection).
- If lump-sum trigger is met post-FIRE, it's INHIBITED (per Inv-3 in the calc-module contract). The sale at FIRE retires the mortgage; lifecycle shows only the sale event.

### LH-Inv-5: FIRE-marker auto-move triggered by strategy change

When the user changes `mortgageStrategy`, the dashboard MUST clear `fireAgeOverride` (per R3 in research.md) and re-run FIRE-age search. The new "FIRE in N years" headline reflects the new feasible age.

This invariant is enforced at the input-handler layer (PvI tab radio's onchange), not in the lifecycle simulator itself. Documented here for completeness.

### LH-Inv-6: Strategy ranker re-ranks on strategy change

The strategy ranker (`scoreAndRank` / `rankByObjective`) consumes the lifecycle simulator's output. When mortgage strategy changes, the lifecycle's outputs change → ranker re-runs → ranker's `winnerId` may flip. SC-005 verifies this flip is observable.

### LH-Inv-7: Audit flow diagram includes mortgage strategy resolution

Every recompute that touches the lifecycle simulator MUST emit an audit stage entry containing the calc module's subSteps related to mortgage strategy (FR-008 enumerates the strings). This is a hard requirement for Principle II audit-observability.

### LH-Inv-8: copyDebugInfo() payload includes strategy fields

Every successful `copyDebugInfo()` invocation MUST include `mortgageStrategy`, `mortgageActivePayoffAge`, `lumpSumEvent`, `homeSaleEvent`, and `postSaleBrokerageAtFire` in the JSON payload (FR-019). When fields are inapplicable (e.g., `homeSaleEvent` when `sellAtFire === false`), they MUST be present with value `null`, not omitted.

---

## Test Plan Reference

The lifecycle handoff value is unit-testable (calc-module side) via `tests/unit/lifecyclePayoffMerge.test.js`. The lifecycle simulator's UI integration is verified via `quickstart.md` browser smoke (S1–S15 covering all 8 interaction-matrix scenarios plus the audit/copyDebug verification).

A Node-runnable mock of the lifecycle simulator is OUT OF SCOPE for this feature — the inline `<script>` form makes it impractical to unit-test in Node without browser harness. The browser smoke is the gate.
