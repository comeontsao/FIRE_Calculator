# Contract — `simulateRetirementOnlySigned` Strategy Options

**Feature**: 028-strategy-aware-fire-age
**Date**: 2026-05-08
**Status**: Draft

## Module

`simulateRetirementOnlySigned` — defined inline in both HTML files:

- `FIRE-Dashboard.html` — circa line 9606 pre-fix.
- `FIRE-Dashboard-Generic.html` — equivalent location.

Wrapper: `signedLifecycleEndBalance` (same files, ~line 8968 in RR) plumbs the new options through to its inner sim call.

## Inputs

```text
inp:               canonical input record (existing — unchanged shape)
annualSpend:       number, today's-$ annual spending need at FIRE
fireAge:           number — integer or fractional year
                   (fractional support: feature 022 US6 — pro-rated FIRE-year row)
p401kTrad0:        number — Trad 401K balance at fireAge (caller-computed)
p401kRoth0:        number — Roth 401K balance at fireAge
pStocks0:          number — taxable stocks balance at fireAge
pCash0:            number — cash balance at fireAge

options (NEW, optional):
  strategyOverride?: string
    Permitted values: 'bracket-fill-smoothed' (default behavior, redundant when set)
                    | 'aggressive-bracket-fill'
                    | 'roth-ladder'
                    | 'trad-last-preserve'
                    | 'conventional'
                    | 'tax-optimized-search'
                    | 'trad-first'
                    | 'proportional'
                    | undefined  (= bracket-fill-smoothed default behavior)
    Source: GetActiveChartStrategyOptions() in HTML wrappers.
            Tests pass directly.
  thetaOverride?: number
    Range: 0..1
    Only meaningful when strategyOverride === 'tax-optimized-search'.
    Ignored when strategyOverride is anything else (no error).
    Default: undefined → strategy ranker's chosen θ from latest run.
```

## Outputs

```text
{
  endBalance: number,            // signed — can be negative
  minPhase1: number,             // min portfolio total in phase 1 (taxable-only)
  minPhase2: number,             // min in phase 2 (401k unlocked)
  minPhase3: number,             // min in phase 3 (with SS active)
  // ... other existing fields preserved
}
```

Return shape is unchanged from feature 027. The values it contains reflect the strategy specified by `options.strategyOverride` (or bracket-fill default when omitted).

## Behavior

1. **When `options` is omitted, or `strategyOverride` is undefined or `'bracket-fill-smoothed'`:**
   - The function executes its existing inline `_drawByPoolOrder`-style code path.
   - Output is byte-identical to pre-feature-028.
   - Existing 493 unit tests must pass without modification.

2. **When `options.strategyOverride` is any other registered strategy ID:**
   - Per-year retirement-loop withdrawal step dispatches into the same router that `projectFullLifecycle` uses.
   - The dispatch passes the same `(inp, prevPools, year, ssIncome, annualSpend, options)` tuple the chart's per-year loop uses.
   - The Spending Funded First floor pass (Constitution VIII) is honored automatically because the router itself owns the floor pass.
   - The IRMAA cap, RMD floor, and synthetic conversion steps continue to apply per the strategy's contract.

3. **When `options.thetaOverride` is set with `strategyOverride === 'tax-optimized-search'`:**
   - The TAX_OPTIMIZED_SEARCH strategy's `computePerYearMix(inp, prevPools, year, ..., theta)` is invoked with this θ value, bypassing the strategy's internal 3-pass θ-sweep.
   - Used by the resolver to pin the same θ the chart picked.

4. **Pre-FIRE accumulation phase** is unaffected. Strategy selection only governs the post-FIRE retirement loop (`yr >= fireAge`).

## Consumers

After this feature, `simulateRetirementOnlySigned` has the following consumers:

| Consumer | Purpose | Strategy options usage |
|---|---|---|
| `signedLifecycleEndBalance` (existing) | Wrapper for Safe/Exact/DWZ gate evaluation | Plumbs `options` through unchanged |
| `isFireAgeFeasible` (gate function) | Per-mode feasibility verdict at a candidate age | Receives strategy options via the resolver wrapper's injection chain |
| `findEarliestFeasibleAge` Stage 1 scan | Linear scan over candidate ages | Resolver wrapper injects strategy options at call site |
| `findEarliestFeasibleAge` Stage 2 interpolation | Slack-scalar refinement | Same injection chain |
| Audit dump's `lifecycleSamples` (RR + Generic) | Cross-validation against `projectFullLifecycle` | Reads bracket-fill default unless explicitly overridden in audit harness |
| Unit tests | Per-strategy parity checks | Tests pass `options` directly |

## Test Contract

### Parity tests (new — `tests/unit/signedSimStrategyOptions.test.js`)

For each registered strategy in `STRATEGIES` (8 entries):

```text
GIVEN  inp + annualSpend + fireAge + pools fixture
       AND  options = { strategyOverride: <id>, thetaOverride: <θ if applicable> }
WHEN   simulateRetirementOnlySigned(...) returns { endBalance: A }
       AND  projectFullLifecycle(inp, annualSpend, fireAge, true,
                                 { strategyOverride: <id>, thetaOverride: <θ> }
            ).rows[lastRow].total === B
THEN   |A − B| ≤ $1
```

Tolerance is $1 to account for any rounding-order divergence between the two sims; structurally the values must agree.

### Resolver tests (new — `tests/unit/fireAgeResolverStrategyAware.test.js`)

```text
GIVEN  SC-027 reproducer inputs:
         { ageRoger: 42, annualSpend: 73400,
           p401kTrad0: 521097, p401kRoth0: 0,
           pStocks0: 902336, pCash0: 81098,
           irmaaThreshold: 212000, ... }
       AND  mode === 'dieWithZero'
       AND  options = { strategyOverride: 'aggressive-bracket-fill' }
WHEN   findEarliestFeasibleAge(inp, mode, options) returns
THEN   { feasible: false, years: -1, searchMethod: 'none' }

AND, with the SAME inputs:
       AND  options = { strategyOverride: 'bracket-fill-smoothed' } (or omitted)
WHEN   findEarliestFeasibleAge(inp, mode, options) returns
THEN   { feasible: true, years: 53, searchMethod: 'integer-year' or 'month-precision' }

(This second assertion proves the test fixture preserves the exact bracket-fill
behavior pre-fix and isolates the divergence to the strategy override.)
```

### Stop-gap test (new — `tests/e2e/strategy-aware-pill.spec.ts`)

```text
GIVEN  the SC-027 reproducer loaded in either HTML
       AND  Mode = DWZ, Objective = Leave more behind
       AND  the strategy ranker has picked aggressive-bracket-fill as winner
WHEN   the dashboard finishes its initial render
THEN   the FIRE status pill text MUST NOT contain 'On Track' (English)
       NOR '正在達標' / similar (Chinese)
       AND  the pill's class list MUST contain 'fire-status behind' OR 'fire-status warning'
       AND  the chart's red infeasibility shading MUST be visible
```

## Constitution Compliance

- **I**: Both HTMLs ship the change in lockstep — the wrapper and the inline sim are edited identically in both files.
- **II**: Function header receives an updated contract block citing the new `options` parameter, default behavior, and consumer list.
- **IV**: New tests added per Test Contract above; existing 493 tests untouched.
- **V**: No new dependency. The added options are plain function params; the dispatched router is already inline.
- **VI**: This contract file is the canonical Chart ↔ Module link for the new behavior.
- **VIII**: Floor pass is preserved by reusing the router (the router owns the floor).
- **IX**: Mode and Objective remain orthogonal — Mode filters via the resolver, Objective sorts via the ranker. This feature actually restores Mode's selectivity.
