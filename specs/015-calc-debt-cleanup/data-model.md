# Data Model — Feature 015: Calc-Engine Debt Cleanup

This is a refactor / cleanup feature, so most entities are extensions or refinements of existing structures (especially `AuditSnapshot` from feature 014). No new persistence-layer entities (no localStorage / CSV schema changes). All entities listed here are in-memory plain objects.

---

## 1. `SortKey`

The atomic unit of strategy ranker dispatch. One `SortKey` defines a single comparison axis.

```ts
type SortKey = {
  field:
    | 'residualArea'        // sum(perYearRow.total) for [fireAge, planAge); higher = preserve more
    | 'cumulativeFederalTax' // sum(perYearRow.federalTax) for [fireAge, planAge); lower = better
    | 'endBalance'          // total at planAge; under DWZ ≈ $0 always
    | 'absEndBalance'       // |endBalance|; closest-to-zero tie-breaker under DWZ
    | 'strategyId',         // alphabetical; final deterministic tie-breaker
  direction: 'asc' | 'desc',
  label: string,             // i18n key for plain-text display in audit (e.g., 'audit.sortKey.residualArea.label')
};
```

**Validation rules:**
- `field` must be one of the 5 enum values.
- `direction === 'asc'` for fields where lower is better (`cumulativeFederalTax`, `absEndBalance`); `direction === 'desc'` for fields where higher is better (`residualArea`, `endBalance`); both directions valid for `strategyId` but spec uses `asc`.
- `label` must resolve in BOTH `TRANSLATIONS.en` AND `TRANSLATIONS.zh` (Constitution VII).

---

## 2. `ActiveSortKeyChain`

The full ordered comparator used by the strategy ranker for one (Mode, Objective) pair. Output of `getActiveSortKey({mode, objective})`.

```ts
type ActiveSortKeyChain = {
  primary: SortKey,
  tieBreakers: [SortKey, SortKey],   // exactly 2 fallback comparators
  modeConstraintLabel: string,       // i18n key, e.g., 'audit.mode.dwz.constraint.endBalanceZero'
  objectiveLabel: string,            // i18n key, e.g., 'audit.objective.preserve.label'
};
```

**Resolution table** (per research R7):

| Mode | Objective | primary.field | primary.direction | tieBreakers[0].field | tieBreakers[1].field |
|------|-----------|---------------|-------------------|----------------------|----------------------|
| Safe | Preserve | `endBalance` | `desc` | `residualArea` | `strategyId` |
| Safe | Minimize Tax | `cumulativeFederalTax` | `asc` | `endBalance` | `strategyId` |
| Exact | Preserve | `endBalance` | `desc` | `residualArea` | `strategyId` |
| Exact | Minimize Tax | `cumulativeFederalTax` | `asc` | `endBalance` | `strategyId` |
| DWZ | Preserve | `residualArea` | `desc` | `absEndBalance` | `strategyId` |
| DWZ | Minimize Tax | `cumulativeFederalTax` | `asc` | `residualArea` | `strategyId` |

**Validation rules:**
- `tieBreakers.length === 2` exactly.
- Last tie-breaker MUST be `strategyId` for determinism.
- `modeConstraintLabel` and `objectiveLabel` MUST be valid i18n keys present in both EN and zh-TW (Principle VII).

**Consumers:**
- `calc/strategyRanker.js` reads it as the comparator for sorting `perStrategyResults[]`.
- `calc/calcAudit.js` reads it to populate `auditSnapshot.strategyRanking.activeSortKey` (FR-016).
- The audit's Strategy Ranking section render function reads it from the snapshot to display plain-text labels.

---

## 3. `PerStrategyResult`

One row in `_lastStrategyResults.perStrategyResults[]`. Replaces today's per-strategy partial state with a complete contract.

```ts
type PerStrategyResult = {
  strategyId: 'bracket-fill-smoothed' | 'tax-optimized-search' | 'taxable-first' | ...,
  perStrategyFireAge: number,        // earliest feasible age for THIS strategy under the active mode
  perStrategyTrajectory: PerYearRow[], // per-year sim from perStrategyFireAge through planAge
  endBalance: number,                // last row's total
  hasShortfall: boolean,             // any year where strategy could not fund spending
  shortfallYearAges: number[],       // ages of years where hasShortfall fired
  floorViolations: FloorViolation[],
  cumulativeFederalTax: number,      // rounded to nearest dollar (R8)
  residualArea: number,              // rounded to nearest dollar (R8)
  feasibleUnderCurrentMode: boolean, // mode constraint check (Safe/Exact/DWZ)
  // Set by the ranker after sorting; index 0 is winner:
  rankIndex: number,
};
```

**Validation rules:**
- `strategyId` must be a registered strategy (look up in `STRATEGY_REGISTRY` at task time).
- `perStrategyFireAge` integer; bounded by user's `currentAge + 1` and `planAge - 1`.
- `perStrategyTrajectory.length === planAge - perStrategyFireAge`.
- `cumulativeFederalTax >= 0`.
- `residualArea >= 0`.
- `feasibleUnderCurrentMode === false` IFF the strategy fails its mode constraint (Safe: trajectory has any buffer-floor violation; Exact: `endBalance < terminalBuffer × annualSpend`; DWZ: `endBalance < 0` OR `|endBalance| > someTolerance`). The exact tolerance for DWZ is decided at task time but documented in the `mode-objective-orthogonality.contract.md`.

**State transitions:**
- Created during recalc by `findPerStrategyFireAge(strategyId, ...)`.
- `rankIndex` written by the ranker after sorting via `ActiveSortKeyChain`.
- Stable until the next `recalcAll`.

**Consumers:**
- Lifecycle chart renderer (reads `perStrategyResults[winner].perStrategyTrajectory`).
- Audit assembler (`calc/calcAudit.js`) — reads all entries for the Strategy Ranking section.
- KPI cards — read `perStrategyResults[winner].perStrategyFireAge` for display.
- Verdict banners — read `perStrategyResults[winner].feasibleUnderCurrentMode`.

---

## 4. `PerYearRow` (extension of feature 014's existing entity)

```ts
type PerYearRow = {
  age: number,
  total: number,
  cash: number,
  t401k: number,
  stocks: number,
  roth: number,
  ssIncome: number,
  pension: number,
  federalTax: number,
  // ...other existing fields...

  // NEW IN 015:
  hasShortfall: boolean,   // FR-004 — true when no allowed pool could fund spending this year
};
```

**Validation rules:**
- `hasShortfall === true` IFF the simulator could not fund the year's full spending from any pool the active strategy permits to draw from.
- Adjacent years' `hasShortfall` values DO NOT need to be the same — shortfall years may be non-contiguous.

**State transitions:**
- Set inside `simulateLifecycle()` (Wave C) — or during Wave A bridge phase, set inside whichever existing simulator the call site uses.
- Read-only after simulation returns.

**Consumers:**
- Lifecycle chart renderer (reads to compute `shortfallRanges` for the inline overlay plugin — see `LifecycleChartRenderHints` below).
- Audit table renderer (sets `<tr class="has-shortfall">` when `true`).
- Copy Debug serializer (additive field in `audit.lifecycleProjection.rows[*]`).

---

## 5. `FloorViolation`

```ts
type FloorViolation = {
  age: number,
  deficit: number,            // dollars below the floor
  kind: 'buffer' | 'negative', // 'buffer' = below buffer×annualSpend; 'negative' = total < 0
};
```

Existing entity from feature 014's audit; no schema change in 015. Listed here for completeness because `PerStrategyResult.floorViolations` is consumed by the θ-sweep filter (US2).

---

## 6. `SimulateLifecycleInputs`

Input contract for `calc/simulateLifecycle.js` (Wave C). Per research R10.

```ts
type SimulateLifecycleInputs = {
  scenarioInputs: ScenarioInputs,    // current `inp` object (or frozen subset)
  fireAge: number,                    // when FIRE begins
  planAge: number,                    // when sim ends (e.g., 95)
  strategyOverride?: StrategyId,      // undefined → use scenarioInputs default
  thetaOverride?: number,             // 0..1 for tax-optimized-search; undefined otherwise
  overlays: {
    mortgage: boolean,
    college: boolean,
    home2: boolean,
  },
  noiseModel: null,                   // RESERVED — must be null in 015; throws if non-null
};
```

**Validation rules:**
- `fireAge < planAge`, both integers.
- `strategyOverride` if present must be a registered `StrategyId`.
- `thetaOverride` if present must be in `[0, 1]` and `strategyOverride === 'tax-optimized-search'` (else ignored or thrown).
- `noiseModel === null || noiseModel === undefined` — non-null throws per R12.

---

## 7. `SimulateLifecycleOutput`

Output contract for `calc/simulateLifecycle.js`.

```ts
type SimulateLifecycleOutput = {
  perYearRows: PerYearRow[],          // length = planAge - fireAge
  endBalance: number,                  // perYearRows[last].total
  hasShortfall: boolean,               // any(perYearRows[*].hasShortfall)
  shortfallYearAges: number[],         // [age for each row where hasShortfall === true]
  floorViolations: FloorViolation[],   // mode-independent; mode applies the gate downstream
  cumulativeFederalTax: number,        // rounded; sum(perYearRows[*].federalTax)
  residualArea: number,                // rounded; sum(perYearRows[*].total) for years in [fireAge, planAge)
};
```

**Validation rules:**
- `endBalance === perYearRows[perYearRows.length - 1].total`.
- `hasShortfall === (shortfallYearAges.length > 0)`.
- `cumulativeFederalTax = Math.round(sum)`, `residualArea = Math.round(sum)` per R8.

**Consumers:** finder (`findFireAgeNumerical` per-strategy variant), ranker (`scoreAndRank`), lifecycle chart renderer, audit assembler (`calc/calcAudit.js`).

---

## 8. `LifecycleChartRenderHints`

Render-side data passed via `chart.options` to the inline shortfall plugin (US1).

```ts
type LifecycleChartRenderHints = {
  shortfallRanges: { xMin: number, xMax: number }[], // age ranges to paint red
  captionKey: string | null,                          // i18n key for footer caption; null if no shortfall
};
```

**Computation rule** (in the chart's render function, NOT in the simulator):
- Walk `auditSnapshot.lifecycleProjection.rows` once. For each contiguous run of `hasShortfall === true` rows, emit `{xMin: run.firstAge, xMax: run.lastAge}`.
- If `shortfallRanges.length === 0`, set `captionKey = null` (the caption hides per FR-002 / FR-005).
- Else set `captionKey = 'lifecycle.shortfall.caption'` (which resolves to bilingual EN + zh-TW strings per the i18n contract).

---

## 9. Extensions to `AuditSnapshot` (from feature 014)

```ts
type AuditSnapshot = {
  // ...all existing fields from feature 014...

  // EXTENDED in 015:
  lifecycleProjection: {
    // ...existing fields...
    rows: PerYearRow[],   // each row now includes hasShortfall (FR-004)
  },

  strategyRanking: {
    // ...existing fields...
    activeSortKey: ActiveSortKeyChain,   // NEW — FR-016
    perStrategyResults: PerStrategyResult[],  // EXTENDED — gains perStrategyFireAge etc.
  },

  // NEW in 015:
  metadata: {
    // ...existing fields...
    fireAgeFinderMode: 'per-strategy' | 'iterate-to-convergence',  // R6 — which Option B/A path is active
  },
};
```

**Backward compatibility:** Per spec Edge Cases ("backward compatibility for prior debug payloads"), no existing keys are removed. The new fields (`hasShortfall`, `activeSortKey`, `perStrategyFireAge`, `metadata.fireAgeFinderMode`) are additive — older Copy Debug consumers see them as unrecognized properties and ignore them.

---

## Entity dependency diagram (text)

```
SimulateLifecycleInputs ──> simulateLifecycle() ──> SimulateLifecycleOutput
                                                       │
                                                       ├──> PerYearRow[]
                                                       │       └──> hasShortfall
                                                       │       └──> federalTax (sum → cumulativeFederalTax)
                                                       │       └──> total (sum → residualArea)
                                                       │
                                                       └──> {endBalance, floorViolations, ...}

findPerStrategyFireAge(strategyId, ...) ──> simulateLifecycle() ──> PerStrategyResult

getActiveSortKey({mode, objective}) ──> ActiveSortKeyChain

scoreAndRank(perStrategyResults, ActiveSortKeyChain) ──> ranked PerStrategyResult[]

assembleAuditSnapshot(...) ──> AuditSnapshot {
  lifecycleProjection.rows[*].hasShortfall,
  strategyRanking.activeSortKey,
  strategyRanking.perStrategyResults[*],
  metadata.fireAgeFinderMode,
}

Lifecycle chart renderer reads:
  - auditSnapshot.lifecycleProjection.rows[*].hasShortfall → LifecycleChartRenderHints
  - perStrategyResults[winner].perStrategyTrajectory → main line series

Audit table renderer reads:
  - auditSnapshot.lifecycleProjection.rows[*].hasShortfall → <tr class="has-shortfall">
  - auditSnapshot.strategyRanking.activeSortKey → plain-text labels
```
