# Data Model — 027

Three entity blocks touched by feature 027. All extend existing schemas; no new persistent storage; no localStorage schema change.

---

## 1. StrategyRegistryEntry — `AGGRESSIVE_BRACKET_FILL`

**Owner:** inline `STRATEGIES` array in `FIRE-Dashboard.html` and parallel array in `FIRE-Dashboard-Generic.html`.
**Consumed by:** strategy ranker (`scoreAndRank` / `rankByObjective`); strategy chart's `barChartSeries` builder; audit panel's Strategy Ranking row renderer.

### Shape

Same as the existing 7 entries (e.g., `BRACKET_FILL_SMOOTHED` at line 11178):

```js
const AGGRESSIVE_BRACKET_FILL = Object.freeze({
  id: 'aggressive-bracket-fill',
  nameKey: 'strategy.aggressiveBracketFill.name',
  descKey: 'strategy.aggressiveBracketFill.desc',
  narrativeKey: 'strategy.aggressiveBracketFill.narrative',
  color: '<TBD>',                // pick a distinct color from existing palette
  eligibility: {},               // no eligibility gates — available in all modes/objectives
  computePerYearMix(ctx) {
    // Calls taxOptimizedWithdrawal with disableSmoothingCap=true.
    // The cap is automatically respected for SS-active years (ssIncome > 0)
    // by the inner gate inside taxOptimizedWithdrawal.
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
        aggressiveActive: !!mix.aggressiveActive,   // NEW — set when no-cap path actually ran
      },
    };
  }
});
```

### Validation rules

- Strategy MUST be added to the `STRATEGIES` Object.freeze() array — placed BETWEEN `BRACKET_FILL_SMOOTHED` and `TRAD_FIRST` so the registry order remains: `bracket-fill-smoothed`, `aggressive-bracket-fill`, `trad-first`, `roth-ladder`, `trad-last-preserve`, `conventional`, `tax-optimized-search`, `proportional` (8 entries total).
- The `id` `'aggressive-bracket-fill'` MUST be unique across the registry (verified by `tests/unit/strategies.test.js`).
- All four i18n keys MUST be present in BOTH `TRANSLATIONS.en` and `TRANSLATIONS.zh` dicts in BOTH HTML files (Constitution VII).

---

## 2. PerYearMix — extended `caveats` object

**Owner:** return shape of `taxOptimizedWithdrawal`.
**Consumed by:** strategy chart per-year tooltip; audit per-year row table; signed sim and chart sim caller wiring.

### Shape change

The existing `caveats` object (returned by `taxOptimizedWithdrawal` and re-exposed by every strategy entry's `computePerYearMix`) gains ONE new boolean field:

```ts
caveats: {
  ssReducedFill: boolean,
  irmaaCapped: boolean,
  irmaaBreached: boolean,
  rule55Active: boolean,
  roth5YearWarning: boolean,
  bracketFillActive: boolean,
  aggressiveActive: boolean,    // NEW — true when Step 2 used the no-smoothing-cap path
}
```

### Validation rules

- `aggressiveActive === true` ⇔ `options.disableSmoothingCap === true` AND `canAccess401k === true` AND `ssIncome === 0` AND the year actually executed the no-cap branch in Step 2.
- For all OTHER strategies (the existing 7), `aggressiveActive === false` always.
- Existing 6 caveat fields preserved exactly — no rename, no removal. Backwards compat for any caller that reads them.

### Consumer impact

- The Withdrawal Strategy chart tooltip MAY annotate the `aggressiveActive: true` rows with a small chip ("aggressive fill active") — optional polish, not required for SC-001 acceptance.
- The audit per-year table SHOULD include `aggressiveActive` as a column for transparency. (Phase 2 task: confirm the audit table has room or add as a tooltip.)

---

## 3. taxOptimizedWithdrawal — new option `disableSmoothingCap`

**Owner:** inline function `taxOptimizedWithdrawal` at `FIRE-Dashboard.html:10787` and parallel function in `FIRE-Dashboard-Generic.html`.
**Consumed by:** every strategy's `computePerYearMix`; signed-sim per-year loop; chart-sim per-year loop.

### Shape change

Existing options object gains ONE new optional boolean field:

```ts
options: {
  safetyMargin?: number,        // existing
  rule55?: { enabled: boolean, separationAge: number },  // existing
  irmaaThreshold?: number,      // existing
  endAge?: number,              // existing — drives smoothedTarget = (pTrad - rmd) / yearsRemaining
  disableSmoothingCap?: boolean, // NEW — when true AND canAccess401k AND ssIncome === 0,
                                 // skip the smoothedTarget cap in Step 2
}
```

### Step 2 behavior change

Pseudocode (matches existing structure at lines 10817-10842):

```js
let wTrad = rmd;
const aggressiveActive = !!opts.disableSmoothingCap && canAccess401k && ssIncome === 0;
if (canAccess401k) {
  const yearsRemaining = Math.max(1, endAgeOpt - age);
  const smoothedTarget = Math.max(0, pTrad - rmd) / yearsRemaining;
  let additionalTrad;
  if (aggressiveActive) {
    // Aggressive: bracket-fill without smoothing cap.
    additionalTrad = Math.min(
      Math.max(0, pTrad - rmd),
      bracketHeadroom
    );
  } else {
    // Smoothed (existing default behavior).
    additionalTrad = Math.min(
      Math.max(0, pTrad - rmd),
      bracketHeadroom,
      smoothedTarget
    );
  }
  wTrad += additionalTrad;
}
```

### Validation rules (per-year-mechanic contract)

- `disableSmoothingCap` defaults to `false` when not provided (or `undefined`).
- When `false` or absent → behavior IDENTICAL to today (no behavioral change for the existing 7 strategies).
- When `true` AND `canAccess401k === false` (pre-unlock years) → wTrad stays at 0; no Trad pulled.
- When `true` AND `canAccess401k === true` AND `ssIncome > 0` (SS-active years) → smoothedTarget cap RE-APPLIES; aggressive policy reverts to smoothed behavior age 70+.
- When `true` AND `canAccess401k === true` AND `ssIncome === 0` (60-69 typical window) → smoothedTarget cap SKIPPED; bracket fully filled.
- The returned mix's `caveats.aggressiveActive` flag mirrors this exact condition.
- Backwards compat: ALL existing callers (the 7 existing strategies + signed sim + chart sim) MUST continue to receive byte-identical output when they don't pass the new option.
