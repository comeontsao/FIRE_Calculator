# Contract — Strategy Registry Entry (US1, US2)

**Scope:** the new `AGGRESSIVE_BRACKET_FILL` entry in the `STRATEGIES` array of both HTML files, plus its participation in the strategy-ranker pipeline.

**Anchored to:** spec FR-001, FR-002, FR-003, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011; SC-001, SC-002, SC-003, SC-004, SC-007.

---

## Entry shape

```js
{
  id: 'aggressive-bracket-fill',
  nameKey: 'strategy.aggressiveBracketFill.name',
  descKey: 'strategy.aggressiveBracketFill.desc',
  narrativeKey: 'strategy.aggressiveBracketFill.narrative',
  color: <distinct from existing 7 palette>,
  eligibility: {},
  computePerYearMix(ctx) { /* see below */ }
}
```

## `computePerYearMix(ctx)` implementation

Calls `taxOptimizedWithdrawal` with the new `disableSmoothingCap: true` option. Inputs / outputs identical to the existing `BRACKET_FILL_SMOOTHED` entry, except for that one option:

```js
computePerYearMix(ctx) {
  const aggressiveOpts = Object.assign({}, ctx.bfOpts, { disableSmoothingCap: true });
  const mix = taxOptimizedWithdrawal(
    ctx.grossSpend, ctx.ssIncome,
    ctx.pools.pTrad, ctx.pools.pRoth, ctx.pools.pStocks, ctx.pools.pCash,
    ctx.age, ctx.brackets, ctx.stockGainPct, aggressiveOpts
  );
  return {
    wTrad: mix.wTrad, wRoth: mix.wRoth, wStocks: mix.wStocks, wCash: mix.wCash,
    syntheticConversion: mix.syntheticConversion || 0,
    rmd: mix.rmd,
    taxOwed: mix.taxOwed,
    ordIncome: mix.ordIncome,
    ltcgTax: mix.ltcgTax,
    effRate: mix.effRate,
    magi: mix.magi,
    shortfall: mix.shortfall,
    caveats: {
      ssReducedFill: !!mix.ssReducedFill,
      irmaaCapped: !!mix.irmaaCapped,
      irmaaBreached: !!mix.irmaaBreached,
      rule55Active: !!mix.rule55Active,
      roth5YearWarning: !!mix.roth5YearWarning,
      bracketFillActive: true,
      aggressiveActive: !!mix.aggressiveActive,
    },
  };
}
```

## Registry placement

The new entry MUST be inserted in the `STRATEGIES` array between `BRACKET_FILL_SMOOTHED` and `TRAD_FIRST`. Final order (8 entries):

1. `bracket-fill-smoothed`
2. **`aggressive-bracket-fill`** ← NEW
3. `trad-first`
4. `roth-ladder`
5. `trad-last-preserve`
6. `conventional`
7. `tax-optimized-search`
8. `proportional`

Lockstep applies to BOTH `FIRE-Dashboard.html` AND `FIRE-Dashboard-Generic.html` (Constitution I).

## Ranker integration (FR-008 → FR-011)

The new strategy MUST flow through the existing ranker pipeline without any new sort axis or per-cell special-casing:

1. **`_simulateStrategyLifetime`** invokes `computePerYearMix` once per retirement year. The aggressive strategy returns a PerYearMix object with the same shape as the existing 7.
2. **`scoreAndRank`** computes `endBalance`, `cumulativeFederalTax`, `residualArea`, `violations`, `firstViolationAge`, `shortfallYears`, `firstShortfallAge`, `hasShortfall`, `safe_feasible`, `exact_feasible`, `dieWithZero_feasible`, `feasibleUnderCurrentMode` for the new strategy.
3. **`getActiveSortKey({mode, objective})`** returns the same `{primary, tieBreakers, modeConstraintLabel, objectiveLabel}` chain — aggressive sorts in alongside the existing 7.
4. **`_newWinnerBeats` (hysteresis gate)** applies uniformly. The ±0.05yr equivalent threshold is unchanged.

The audit panel's Strategy Ranking row renderer reads from the rank result; no renderer change.

## Acceptance — pin SC-026-A target numbers

When the new strategy is run on the SC-026-A fixture (frozen in `tests/diagnostics/sc026a-counterfactual.js`):

- `endBalance` (real-$) MUST be in **[$1,073,330, $1,186,312]** (= $1,129,821 ± 5%).
- `cumulativeFederalTax` (real-$) MUST be in **[$110,682, $122,332]** (= $116,507 ± 5%).
- `safe_feasible` MUST be `true`.
- `exact_feasible` MUST be `true`.
- `hasShortfall` MUST be `false`.

Verified by `tests/unit/aggressiveBracketFill.test.js` (NEW). Refer to `tests/diagnostics/us2-aggressive-vs-smoothed.js` for the analytical baseline that produced the target numbers.

## Acceptance — high-Trad non-regression (SC-003)

For at least one fixture where `pTrad / yearsRemaining ≈ bracketHeadroom` (e.g., $4M Trad / 30 retirement years → smoothedTarget ≈ $133K, bracketHeadroom ≈ $118K — they're close):

- `cumulativeFederalTax` delta between aggressive and smoothed MUST be **< $5,000 real-$**.
- `endBalance` delta MUST be **< $30,000 real-$**.

(Validates that aggressive doesn't regress for users where smoothed was already correct.)

## Backwards compat (FR-021)

- The existing 7 strategies continue to work byte-identically. None of their `computePerYearMix` implementations change.
- The chart's default-strategy path (winner = `bracket-fill-smoothed` for `getActiveChartStrategyOptions()` no-op) remains the same when `bracket-fill-smoothed` happens to win.
- The verdict pill, KPI cards, FIRE-age resolver, etc. are agnostic to which strategy is active and continue to work.
