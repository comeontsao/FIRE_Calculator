# Contract — Month-Precision FIRE-Age Resolver

**Module**: `calc/fireAgeResolver.js` (NEW in feature 020)
**Constitution**: Principle II (purity), Principle V (UMD-classic-script pattern).

## Function signature

```
findEarliestFeasibleAge(inp, mode, options) → FireAgeResult

FireAgeResult = {
  years: number,           // integer, age in years
  months: number,          // integer 0..11
  totalMonths: number,     // years × 12 + months (for arithmetic convenience)
  feasible: boolean,       // false if no age in [currentAge, endAge] is feasible
  searchMethod: 'integer-year' | 'month-precision' | 'none',
}
```

## Algorithm

### Stage 1 — Year precision (existing logic)

Linear scan from `currentAge` to `endAge - 1`. For each candidate year `y`:

```
const sim = simulateRetirementOnlySigned(inp, annualSpend, y, ...)
if (isFireAgeFeasible(sim, inp, annualSpend, mode, y)) {
  // y is the earliest feasible YEAR
  break;
}
```

If no year in range is feasible: return `{years: -1, months: 0, totalMonths: -1, feasible: false, searchMethod: 'none'}`.

### Stage 2 — Month precision (NEW in feature 020)

Once year `Y` is identified as the earliest feasible year, refine to month precision:

For each candidate month `m` in `{0, 1, ..., 11}` (inclusive):

```
const fractionalAge = Y - 1 + m / 12     // candidate age = (Y-1) years and m months
const sim = simulateRetirementOnlySigned(inp, annualSpend, fractionalAge, ...)
if (isFireAgeFeasible(sim, inp, annualSpend, mode, fractionalAge)) {
  // m is the earliest feasible month within year Y-1
  return {
    years: Y - 1,
    months: m,
    totalMonths: (Y - 1) * 12 + m,
    feasible: true,
    searchMethod: 'month-precision',
  }
}
```

If no month in `Y - 1` is feasible (i.e., the year-precision search was the boundary), return year `Y` with months `0`:

```
return { years: Y, months: 0, totalMonths: Y * 12, feasible: true, searchMethod: 'integer-year' }
```

## Monotonic-flip stability check

The month-precision search assumes feasibility flips monotonically across `m = 0, 1, ..., 11` within year `Y - 1`. Specifically:

- For `m < m*` (some boundary month): `isFireAgeFeasible(...) === false`.
- For `m ≥ m*`: `isFireAgeFeasible(...) === true`.

The resolver MUST verify this monotonicity. If a multi-flip is detected (e.g., feasible at `m=3` but infeasible at `m=7`), this indicates numerical instability in the underlying tax math. The resolver:

1. Logs a warning: `[fireAgeResolver] non-monotonic feasibility at year Y-1, falling back to year-precision`.
2. Returns the year-precision result.

This avoids cascading subtle floating-point errors into user-visible "Y Years M Months" displays.

## Inputs

Same as `isFireAgeFeasible` and `simulateRetirementOnlySigned`. The resolver is a wrapper.

## Outputs

`FireAgeResult` shape above. Consumed by:
- KPI card "Years to FIRE" (renders "X Years Y Months").
- Verdict pill (renders "FIRE in X years Y months").
- Audit dump's `fireAgeResolution` block (extends existing block with months).

## Edge cases

1. **Already past plan age**: `currentAge ≥ endAge`. Return `{years: 0, months: 0, totalMonths: 0, feasible: false, searchMethod: 'none'}`.
2. **Feasible at currentAge**: month-precision still runs to refine within the FIRST year, asking "what's the earliest month at currentAge that is feasible?". If month 0 is feasible, return `{years: currentAge, months: 0}`.
3. **Infeasible everywhere**: return `feasible: false, years: -1`.
4. **Non-integer fractionalAge in `simulateRetirementOnlySigned`**: the existing simulator accepts a number for `fireAge`. With `fireAge = Y - 1 + m/12`, the simulator must integrate over a partial year for the FIRE-year row. Phase 3 implementation MUST verify this works correctly — likely no change needed since the simulator already does year-by-year integration, but the FIRST retirement-year row needs `(1 - m/12)` of spending and SS pro-rated.

## Edge case 4 — fractional FIRE-year handling (RISK)

The existing `simulateRetirementOnlySigned` operates on integer-year arithmetic. Passing `fireAge = 55.25` may NOT correctly handle a partial first retirement year. Phase 3 must:

(a) verify the simulator's behavior with non-integer fireAge, OR
(b) extend the simulator to pro-rate the FIRE-year row by `(1 - m/12)`, OR
(c) accept year-precision-only for now and ship month-precision as a UI display refinement only (header shows "X Years Y Months" but feasibility check still runs at the year level).

Phase 3 deliverable: pick (a), (b), or (c) and document the choice. Default recommendation: (c) — simpler, lower risk, and the user's primary ask was the HEADER display. We can refine to true month-level feasibility in a follow-up feature.

## Testing requirements

`tests/unit/monthPrecisionResolver.test.js`:

- Boundary detection: known persona where year-precision → year 13, month-precision should pick a specific month.
- Monotonic stability: synthetic persona near a tax-bracket boundary; assert the resolver detects multi-flip and falls back to year-precision with a warning.
- Already-feasible-at-currentAge edge case.
- Infeasible-everywhere edge case.
- Single-person + couple parity: months result must agree across mode toggles.
- ≥6 test cases.
