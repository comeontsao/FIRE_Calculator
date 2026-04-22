# Contract: `strategies` Module

**Status**: Phase 1 design
**Owner (Engineer)**: Backend
**Principle alignment**: II (Pure calc modules with declared contracts), VI (Chart ↔ Module contracts), VII (Bilingual)

---

## Module purpose

Declare the seven `StrategyPolicy` instances and expose a single scoring harness consumed by the dashboard.

## Module location

Inline `<script>` block inside both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html`, marked with a fenced comment header. Future extraction to `calc/strategies.js` is a separate migration.

## Declared inputs, outputs, consumers

```
// ==================== MODULE: strategies ====================
// Inputs:
//   - YearContext (per-year; built by scoreStrategies)
//   - CanonicalInputs (for lifetime scoring)
//   - Tax brackets (from getTaxBrackets)
//
// Outputs:
//   - STRATEGIES: readonly array of 7 StrategyPolicy
//   - scoreStrategies(inp, fireAge): Ranking (pre-objective — caller selects objective)
//   - rankByObjective(strategyResults, objective): Ranking (sorted for given objective)
//
// Consumers:
//   - renderRothLadder (Lifetime Withdrawal Strategy chart)
//   - renderGrowthChart (Full Portfolio Lifecycle — when preview active)
//   - renderLifecycleSidebarChart (sidebar mirror — when preview active)
//   - renderKpiCards (KPI ribbon — when preview active)
//   - renderCompactHeaderStats (status pill consuming ranking.winnerId.caveats)
//   - renderStrategyComparePanel (new — the collapsed sub-panel)
//   - recalcAll (entry point)
// =============================================================
```

Every consumer MUST declare `strategies` in its own comment header per Principle VI.

## Interface

### `STRATEGIES`

Readonly frozen array of seven `StrategyPolicy` objects in canonical display order (ID-alphabetical):

```
const STRATEGIES = Object.freeze([
  BRACKET_FILL_SMOOTHED,
  CONVENTIONAL,
  PROPORTIONAL,
  ROTH_LADDER,
  TAX_OPTIMIZED_SEARCH,
  TRAD_FIRST,
  TRAD_LAST_PRESERVE,
]);
```

### `scoreStrategies(inp, fireAge, mode) → Ranking`

Entry point. Runs one full-lifecycle simulation per strategy at the given fireAge, produces a `StrategyResult[]`, and returns an unsorted-by-objective `Ranking`.

- **Pure**: no DOM access, no localStorage, no chartState read. Caller passes `inp` directly.
- **Deterministic**: identical (inp, fireAge, mode) → identical Ranking on repeat call (FR-008).
- **Performance**: MUST return in < 150 ms on typical inputs (leaving 100 ms for the outer solver + chart render inside FR-014's 250 ms budget).
- **Eligibility gating**: if a strategy's eligibility check fails against inp/fireAge, its `StrategyResult` is still produced with `eligibility.eligible=false` and `feasibleUnderCurrentMode=false`, so the compare panel can show a grayed-out row rather than hiding it silently.

### `rankByObjective(results, objective) → Ranking`

Cheap sort-only operation. Called when the user toggles the objective selector (no re-simulation).

- Sorts `results` by objective per §4 of research.md (tiebreakers: primary-metric-tol → other-metric-tol → strategy-ID alphabetical).
- Produces the `ties[]` array for rank collisions within tolerance.
- `rows[0].strategyId === ranking.winnerId`.

### Per-strategy `computePerYearMix(ctx) → PerYearMix`

Each of the seven strategies implements the same signature. Contract guarantees:

1. **Constraints honored**:
   - Returned `rmd ≥ ctx.rmdThisYear` (RMD is mandatory).
   - `wTrad = 0` when `!ctx.bfOpts.canAccess401k` (no pre-unlock Trad draws unless Rule of 55).
   - `wRoth = 0` when `!ctx.bfOpts.canAccess401k` (Roth also locked pre-59.5 unless Rule of 55).
   - No pool over-drawn: `wTrad ≤ ctx.pools.pTrad`, same for Roth/Stocks/Cash.
2. **Tax computed correctly**: uses `calcOrdinaryTax` and `calcLTCGTax` already in scope. Stacks LTCG on top of ordinary per §calcLTCGTax semantics.
3. **Caveat flags populated accurately**: `ssReducedFill`, `irmaaCapped`, `irmaaBreached`, `rule55Active`, `bracketFillActive` set based on the strategy's actual logic (e.g., only `BRACKET_FILL_SMOOTHED` sets `bracketFillActive=true`).
4. **Shortfall handling**: if pools can't cover `grossSpend + tax`, `shortfall > 0` and the caller will surface infeasibility in the `StrategyResult`. No silent absorption.

## Per-strategy behavior summary

| Strategy | Pool order (post-59.5 or Rule-55) | Bracket-fill? | Notes |
|---|---|---|---|
| `bracket-fill-smoothed` | Bracket-fill Trad → Roth → Stocks → Cash | Yes (smoothed by `pTrad/yearsRemaining`) | Byte-identical to current `taxOptimizedWithdrawal`. Sets `bracketFillActive=true`. |
| `trad-first` | Trad → Stocks → Cash → Roth | No | Ignores bracket boundaries; drains Trad at whatever rate spend requires. |
| `roth-ladder` | Roth → Stocks → Cash → Trad | No | RMD still forces Trad at 73+. |
| `trad-last-preserve` | Stocks → Cash → Roth → Trad | No | Maximizes Trad preservation; RMD at 73+. |
| `proportional` | Weighted by balance share this year | No | Each pool contributes `balance / totalBalance × grossSpend` pre-tax; then tax is iterated. |
| `tax-optimized-search` | See §Decision 2 in research.md | Variable | 11-point θ-sweep. `computePerYearMix` here is invoked AFTER the outer scorer has picked the winning θ for this (inp, fireAge). |
| `conventional` | Stocks → Trad → Roth | No | Textbook; may push into 22 % bracket in late RMD years — that's the point of comparing. |

## Constraint reuse

All strategies MUST share these upstream modules:
- `calcOrdinaryTax`, `calcLTCGTax` — tax computation (no duplicated logic).
- `getRMDDivisor` — RMD table.
- `getTaxBrackets` — user-editable bracket inputs.
- `getSSAnnual` — SS income lookup.
- `taxableSS = ssIncome * 0.85` — same simplification as today.

## Error handling

- Invalid `strategyId` passed to internal lookups → throw `Error('unknown strategy: <id>')`. This is a programmer error, not a runtime condition.
- `ctx.pools` containing negative balances (should never happen but defensive) → treat as 0 for withdrawal eligibility; return `shortfall = grossSpend`.
- Tax-optimized search with no converging θ → return the last θ evaluated (not an error; just means all θ are equally bad).
