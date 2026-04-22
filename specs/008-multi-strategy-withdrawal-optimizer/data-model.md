# Data Model: Multi-Strategy Withdrawal Optimizer

**Phase**: 1 (Design)
**Purpose**: Define every entity introduced by this feature, their attributes, relationships, and lifecycle.

All entities are plain JavaScript objects. No classes, no prototypes, no schema framework — matches the rest of the codebase.

---

## 1. `StrategyPolicy`

An immutable declaration of one withdrawal strategy. Seven of these are declared at module load and never mutated.

```text
StrategyPolicy {
  id:                string               // stable key — e.g., 'bracket-fill-smoothed'
  nameKey:           string               // i18n key — e.g., 'strategy.bracketFillSmoothed.name'
  descKey:           string               // i18n key for one-line description
  color:             string               // hex for UI ranking-row accents; Chart.js dataset colors unchanged
  eligibility:       {
    requiresRule55?: boolean              // true → strategy skipped unless Rule-of-55 toggle is active
    requiresUnlockedTrad?: boolean        // true → strategy grayed-out in rows where age < 59.5
  }
  computePerYearMix: (ctx: YearContext) => PerYearMix
}
```

**Instances (the seven)**:

| id | nameKey | Brief |
|---|---|---|
| `bracket-fill-smoothed` | `strategy.bracketFillSmoothed.name` | Today's smoothed bracket-fill (baseline; MUST produce byte-identical output to current `taxOptimizedWithdrawal`). |
| `trad-first` | `strategy.tradFirst.name` | Drain Trad at ordinary rates until depleted, then Taxable → Roth → Cash. |
| `roth-ladder` | `strategy.rothLadder.name` | Roth first (tax-free), then Taxable, Cash, Trad last. |
| `trad-last-preserve` | `strategy.tradLastPreserve.name` | Stocks + Cash first, then Roth, Trad last — preserves Trad for estate. |
| `proportional` | `strategy.proportional.name` | Withdraw from each pool weighted by its current balance. |
| `tax-optimized-search` | `strategy.taxOptimizedSearch.name` | 11-point θ-sweep over Trad aggressiveness; picks θ minimizing lifetime tax. |
| `conventional` | `strategy.conventional.name` | Fidelity/Vanguard textbook: Taxable → Trad → Roth. |

**Validation**:
- `id` MUST match `/^[a-z][a-z0-9-]*$/` and be globally unique.
- All i18n keys MUST resolve in both EN and zh-TW (Principle VII — enforced by browser-smoke test).
- `computePerYearMix` MUST be pure — no DOM access, no `Date.now()`, no module-scope mutation.

---

## 2. `YearContext`

Per-year input passed to `computePerYearMix`. Snapshot of the simulation state entering the year.

```text
YearContext {
  age:                number            // integer age this year (e.g., 60)
  phase:              'phase1-taxable-only' | 'phase2-401k-unlocked' | 'phase3-with-ss'
  grossSpend:         number            // real-dollar target spend for this year (post-inflation-adjust, incl. college, h2, hcDelta)
  ssIncomeReal:       number            // 0 when age < ssClaimAge
  pools: {
    pTrad:            number            // balance before this year's withdrawal
    pRoth:            number
    pStocks:          number
    pCash:            number
  }
  brackets:           TaxBrackets       // { stdDed, top10, top12, top22, top24, top32, top35, ltcg0Top, ltcg15Top }
  stockGainPct:       number            // e.g., 0.6 — fraction of taxable sales that is LTCG
  rmdThisYear:        number            // IRS Uniform Lifetime Table draw, 0 if age < 73
  bracketHeadroom:    number            // (stdDed + top12)(1 - safetyMargin) - taxableSS - rmd
  bfOpts: {
    safetyMargin:     number
    rule55:           { enabled: boolean, separationAge: number }
    irmaaThreshold:   number
    endAge:           number            // drives smoothing window for bracket-fill-smoothed
    canAccess401k:    boolean           // derived from age + rule55
  }
}
```

`YearContext` is constructed by `scoreStrategies(inp, fireAge)` once per year per simulation, shared identically across all seven strategies being scored for that (inp, fireAge, age) tuple.

---

## 3. `PerYearMix`

Output of `computePerYearMix`. One row in the lifecycle chart's stacked bar, one row in `StrategyResult.perYearRows`.

```text
PerYearMix {
  wTrad:                number    // ordinary-income Trad draw
  wRoth:                number    // tax-free Roth draw
  wStocks:              number    // taxable sales (LTCG taxed)
  wCash:                number    // cash draw
  syntheticConversion:  number    // excess Trad pulled beyond spend need, recycled to stocks
  rmd:                  number    // forced Trad draw component of wTrad (0 if age < 73)
  taxOwed:              number    // federal tax (ordinary + LTCG) for the year
  ordIncome:            number    // taxableSS + wTrad (pre-std-ded)
  ltcgTax:              number    // LTCG portion of taxOwed
  effRate:              number    // taxOwed / grossReceived — the orange line overlay
  magi:                 number    // wTrad + taxableSS + wStocks*gainPct — drives IRMAA caveat
  shortfall:            number    // 0 when feasible; > 0 when pools empty
  caveats: {
    ssReducedFill:      boolean   // taxable SS consumed significant bracket room this year
    irmaaCapped:        boolean   // MAGI was at or near the IRMAA cap and Trad was reduced
    irmaaBreached:      boolean   // MAGI exceeded the cap despite cap
    rule55Active:       boolean
    roth5YearWarning:   boolean   // reserved for future Roth-conversion-ladder feature
    bracketFillActive:  boolean   // true only for 'bracket-fill-smoothed' — gates the blue caption banner
  }
}
```

**Invariants**:
- `wTrad + wRoth + wStocks + wCash + ssIncome + syntheticConversion_offset = grossSpend + taxOwed + syntheticConversion` (no silent shortfall unless `shortfall > 0`).
- `rmd ≤ wTrad` always (RMD is a floor on Trad, not a separate draw).
- `magi` MUST be reported truthfully — downstream IRMAA glyph reads from here.

---

## 4. `StrategyResult`

One full-lifecycle simulation of one strategy. Seven `StrategyResult`s are produced per recalc.

```text
StrategyResult {
  strategyId:                    string       // matches StrategyPolicy.id
  perYearRows:                   PerYearMix[] // one per retirement year, same length as today's strategy[]
  endOfPlanNetWorthReal:         number       // real-dollar sum of pools at plan age, net of outstanding Trad tax
  lifetimeFederalTaxReal:        number       // sum of taxOwed across all years (real dollars)
  averageEffectiveTaxRate:       number       // weighted avg — for the KPI ribbon narrative
  earliestFeasibleFireAge:       number       // same for all strategies under Architecture B (= effectiveFireAge)
  feasibleUnderCurrentMode:      boolean      // false if chart depletes below Safe-mode floor at any year
  caveatFlagsObservedInRun: {                 // OR-aggregation across perYearRows
    ssReducedFill: boolean
    irmaaCapped: boolean
    irmaaBreached: boolean
    rule55Active: boolean
    roth5YearWarning: boolean
    bracketFillActive: boolean
  }
  eligibility:                   { eligible: boolean, reason?: string }
}
```

**Derivation rules**:
- `endOfPlanNetWorthReal = pTrad_end × (1 - taxTrad) + pRoth_end + pStocks_end + pCash_end` — Trad is discounted by the user's average retirement marginal rate (Assumption in spec) so estate comparisons aren't inflated by pre-tax balances. `taxTrad` comes from `inp.taxTrad`.
- `lifetimeFederalTaxReal = Σ perYearRows[i].taxOwed`.
- `feasibleUnderCurrentMode` uses the same `isFireAgeFeasible(sim, inp, spend, mode, fireAge)` check the chart uses (per the Safe-mode fix already shipped).
- `caveatFlagsObservedInRun[k] = perYearRows.some(row => row.caveats[k])`.

---

## 5. `Objective`

The user's scoring-axis selection.

```text
Objective = 'leave-more-behind' | 'retire-sooner-pay-less-tax'
```

Stored in `localStorage.fire_withdrawalObjective`, defaulting to `'leave-more-behind'` on first run.

**Scoring rules**:
- `'leave-more-behind'` → maximize `endOfPlanNetWorthReal`; tiebreak by lower `lifetimeFederalTaxReal`; final tiebreak by strategy-ID alphabetical.
- `'retire-sooner-pay-less-tax'` → minimize `lifetimeFederalTaxReal`; tiebreak by higher `endOfPlanNetWorthReal`; final tiebreak by strategy-ID alphabetical.

---

## 6. `Ranking`

The sorted output of `scoreStrategies`, consumed by the UI.

```text
Ranking {
  objective:       Objective
  rows:            StrategyResult[]       // sorted by objective; rows[0] = winner
  winnerId:        string                 // === rows[0].strategyId; hoisted for convenience
  ties:            Array<{ rank: number, strategyIds: string[] }>  // non-empty only when tolerance-tie detected
  allFeasible:     boolean                // false → at least one strategy infeasible at current FIRE age
}
```

**UI consumers**:
- Primary Lifetime Withdrawal chart → reads `winnerId`'s `perYearRows` (unless preview active).
- Collapsed compare panel → reads `rows.slice(1)` for the 6 non-winner rows.
- Tie indicator badges → reads `ties`.
- "Previewing alternative" banner → reads `chartState.previewStrategyId` against `winnerId`.

---

## 7. Mutation flow (state transitions)

```text
User action                         → Entity transition
──────────────────────────────────────────────────────────────────────
Any input/slider edit               → recalcAll() runs → new Ranking computed
                                    → chartState.previewStrategyId reset to null
                                    → all chart listeners re-render showing new winner

Toggle objective selector           → cached Ranking re-sorted (no re-simulation needed —
                                      StrategyResult[] is objective-independent)
                                    → new winner published via setObjective()
                                    → all chart listeners re-render
                                    → localStorage.fire_withdrawalObjective updated

Click "Compare other strategies"    → UI toggle only; no state transition
                                    → panel expands/collapses

Click a non-winner row              → setPreviewStrategy(id)
                                    → chartState.previewStrategyId = id
                                    → chart + KPI + sidebar listeners re-render with id's perYearRows
                                    → "previewing alternative" banner appears

Click "Restore auto-selected winner"→ setPreviewStrategy(null)
                                    → banner disappears, winner view restored

Page reload                         → localStorage.fire_withdrawalObjective loaded
                                    → chartState.previewStrategyId NOT restored (session-scoped per FR-006)
                                    → recalcAll runs → fresh Ranking, winner shown
```

**Invariant**: `chartState.previewStrategyId !== null` implies that `previewStrategyId ∈ ranking.rows.map(r => r.strategyId)`. If it's ever outside that set (e.g., after objective-toggle changed the candidate set — it doesn't, but as defense-in-depth), force-reset to null.

---

## 8. Fixture shape

`tests/fixtures/strategies/<scenario>.json` captures a canonical `(inp, fireAge, expected: { winnerByObjective, strategyResultsById })` tuple.

```text
Fixture {
  name:                'young-saver' | 'three-phase-retiree' | 'coast-fire-edge'
  description:         string
  inp:                 CanonicalInputs                            // same shape as getInputs() output
  fireAge:             number
  expected: {
    winner: {
      'leave-more-behind':        string                          // strategyId expected to win
      'retire-sooner-pay-less-tax': string
    }
    resultsById: Record<string, {
      endOfPlanNetWorthReal:     number                           // to within $100 tolerance
      lifetimeFederalTaxReal:    number                           // to within $10 tolerance
      averageEffectiveTaxRate:   number                           // to within 0.1 pp
    }>
  }
}
```

Fixtures lock the feature's behavior; regressions to any strategy's output in either HTML file fail a test. Principle IV is satisfied.
