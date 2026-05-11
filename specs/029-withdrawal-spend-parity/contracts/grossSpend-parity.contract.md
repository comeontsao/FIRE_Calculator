# Contract: grossSpend Parity Across Simulators

**Feature**: 029-withdrawal-spend-parity
**Status**: Draft
**Owners**: Backend Engineer (calc layer), QA Engineer (audit invariant tests)

## Purpose

Pin the invariant that every simulator in the withdrawal pipeline consumes the SAME `grossSpend` value for the SAME `{age, inp, scenario}` triple. This contract is the canonical reference; the audit invariant `simulator-grossSpend-parity` (in `calc/calcAudit.js`) is its runtime enforcer.

## Canonical formula

For any retirement-year `age` (FIRE ≤ age ≤ endAge), in real-$:

```text
grossSpend(age, inp, scenario)
    = max(0,
          retireSpend
        + hcDelta(scenario, age)
        + collegeCostThisYear(inp, age - inp.ageRoger)
        + h2Carry(age, inp.secondHomeEnabled, h2Purchased)
      )
```

Where:

- `retireSpend = getMortgageAdjustedRetirement(scenarioSpend, yrsToFire).annualSpend`
- `hcDelta(scenario, age) = getHealthcareDeltaAnnual(scenario, age)` — can be negative
- `collegeCostThisYear(inp, yearsFromNow) = getTotalCollegeCostForYear(inp, yearsFromNow)`
- `h2Carry(age, h2Enabled, h2Purchased) = h2Enabled && h2Purchased ? getSecondHomeAnnualCarryAtYear(h2, age - inp.ageRoger, yrsToFire) : 0`

Partial-FIRE-year scaling (feature 022 / FR-009): on the first retirement-year row when `mFraction = fireAge - floor(fireAge) > 0`, every component above is multiplied by `scale = 1 - mFraction` BEFORE summing. The `max(0, ...)` clamp applies post-scale.

## Consumers (must obey)

| Simulator | RR location | Generic location | Pre-029 status | Post-029 status |
|---|---|---|---|---|
| `computeWithdrawalStrategy` | `:12285` | `:12658` | Correct for `retireSpend + hcDelta + collegeCostThisYear`; missing `h2Carry` | Aligned to canonical (h2Carry added) |
| `_simulateStrategyLifetime` | `:11805` | `:12178` | `retireSpend` only — BUG | Aligned to canonical |
| `signedLifecycleEndBalance` | `:9208` | `:9581` | Correct (all 4 terms) | Unchanged |
| `simulateRetirementOnlySigned` | `:9800` | `:10173` | Correct (all 4 terms) | Unchanged |
| `projectFullLifecycle` | `:10670` | `:11043` | Correct (all 4 terms) — REFERENCE | Unchanged |

## Trace API (opt-in)

When `options.simulatorTraces` is an array passed by the caller, each simulator MUST push a row of shape:

```js
{
  age: number,
  simulatorId: 'computeWithdrawalStrategy' | '_simulateStrategyLifetime' | 'signedLifecycleEndBalance',
  grossSpend: number,                       // composed real-$
  components: {                              // optional but RECOMMENDED for audit display
    retireSpend: number,
    hcDelta: number,
    collegeCostThisYear: number,
    h2Carry: number,
  }
}
```

When `options.simulatorTraces` is `undefined`, simulators MUST NOT allocate. Push-cost in trace mode: O(retirement-years) per simulator × number of simulators traced.

## Audit invariant `_invariantE` (simulator-grossSpend-parity)

Lives in `calc/calcAudit.js`. Signature:

```js
function _invariantE(options, ctx) → CrossValidationWarning[]
```

Inputs (via `ctx`):
- `ctx.simulatorTraces: SimulatorTrace[]` — pushed during a prior audit-pass-through of all simulators.

Behavior:
1. Group traces by `age`.
2. For each age, compute `diff = max(grossSpend) - min(grossSpend)` across simulator entries.
3. If `diff > 1.0` (one-dollar tolerance for floating-point noise), emit:

```js
{
  kind: 'simulator-grossSpend-parity',
  age,
  simulators: { [simulatorId]: grossSpend, ... },
  diff,
  expected: false,
  reason: `Simulators disagree on grossSpend at age ${age} by $${diff.toFixed(0)}.`,
}
```

4. Return concatenated warnings (zero rows under correct operation).

## Tolerance

| Comparison | Tolerance |
|---|---|
| `grossSpend` parity across simulators | $1 (covers floating-point noise on scaled partial-year rows) |
| `endBalance` parity (signed vs chart) | $1 when both sims agree on feasibility verdict |

## Non-goals (explicit)

- This contract DOES NOT cover post-`grossSpend` divergence (e.g., signed-sim's negative-pool preservation vs chart's clamp-to-zero). That is the documented design intent of feature 015 and is handled separately by Bug B's stage-1 fix (`endBalance-mismatch` warning suppression when both sims agree on feasibility).
- This contract DOES NOT cover the strategy's `computePerYearMix` body. That's the strategy's internal concern; this contract pins only its INPUT.
- This contract DOES NOT require simulators to expose `components` in their trace rows. Component breakdown is a nice-to-have for audit-panel diagnosis; the diff-only check is sufficient for invariant correctness.

## Backwards compatibility

- All existing simulators already accept an `options` parameter (verified during code inspection). Adding `simulatorTraces` is an additive field — no signature change.
- Existing callers that don't pass `simulatorTraces` see byte-identical behavior to pre-029 code (modulo the Bug A fix in `_simulateStrategyLifetime`).
- The trace push is gated on `options && Array.isArray(options.simulatorTraces)`, so even if a caller passes `options: {}` (no `simulatorTraces`), zero overhead is incurred.
