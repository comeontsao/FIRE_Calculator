# Data Model — Calculation Audit View

**Feature**: `014-calc-audit`
**Date**: 2026-04-26

This feature introduces a single nested data structure (`AuditSnapshot`) computed per recalc and consumed by:

1. The Audit tab's UI renderers (flow diagram, per-section charts, per-section tables).
2. The Copy Debug button (serialized to JSON under the `audit` top-level key).

No domain entities are added (no new inputs, no new persistence). All entities below describe the runtime view-state model.

---

## Entity: `AuditSnapshot`

The top-level container assembled per recalc by `assembleAuditSnapshot(options)` in `calc/calcAudit.js`.

**Fields**:

| Field | Type | Notes |
|-------|------|-------|
| `schemaVersion` | string | Currently `'1.0'`. Bumped on breaking shape changes (R-011). |
| `generatedAt` | string (ISO 8601) | Same format as the existing Copy Debug `_generatedAt` field. |
| `flowDiagram` | `FlowDiagramSummary` | Drives the visual diagram + JSON. |
| `resolvedInputs` | `ResolvedInputs` | Section 2 data. |
| `spendingAdjustments` | `SpendingAdjustments` | Section 3 data. |
| `gates` | `GateEvaluation[3]` | Section 4 data — Safe / Exact / DWZ in fixed order. |
| `fireAgeResolution` | `FireAgeResolution` | Section 5 data. |
| `strategyRanking` | `StrategyRanking` | Section 6 data — wraps `StrategyRow[]`. |
| `lifecycleProjection` | `LifecycleProjection` | Section 7 data — per-year rows + chart series. |
| `crossValidationWarnings` | `CrossValidationWarning[]` | Section 8 data — empty array if all 4 invariants pass. |

**Determinism invariant**: same `options` input MUST produce a byte-identical `AuditSnapshot` (excluding the `generatedAt` timestamp). The `schemaVersion` is fixed; the `generatedAt` is the only nondeterministic field.

---

## Entity: `FlowDiagramSummary`

The 6-stage pipeline overview at the top of the Audit tab.

```text
{
  stages: [
    { stageId: 'inputs',       label: 'Inputs',                headlineOutput: '42yo · $525K NW · $60K spend',     downstreamArrowLabel: 'inputs' },
    { stageId: 'spending',     label: 'Spending Adjustments',  headlineOutput: 'effective spend $60K → $58K w/ mortgage', downstreamArrowLabel: 'effectiveSpend' },
    { stageId: 'gates',        label: 'Gate Evaluations',      headlineOutput: 'Safe ✓ · Exact ✗ · DWZ ✓ at age 48', downstreamArrowLabel: 'verdict + active strategy' },
    { stageId: 'fireAge',      label: 'FIRE Age Resolution',   headlineOutput: '48 = 6 yrs (passed at integer-year)', downstreamArrowLabel: 'fireAge = 48' },
    { stageId: 'strategy',     label: 'Strategy Ranking',      headlineOutput: 'winner: bracket-fill-smoothed',     downstreamArrowLabel: 'strategy + θ' },
    { stageId: 'lifecycle',    label: 'Lifecycle Projection',  headlineOutput: 'end balance $175K at age 100',      downstreamArrowLabel: '(end of pipeline)' },
  ]
}
```

**Validation rules**:

- `stages.length === 6`.
- `stageId` MUST match the corresponding detail-section's anchor ID for click-to-scroll wiring.
- `label`, `headlineOutput`, `downstreamArrowLabel` strings are produced by the assembler with bilingual content already resolved via the injected `t()` helper.

**Why a separate entity**: Cross-validation invariant SC-012 requires the flow diagram's headline to match the corresponding detail section's reported value. Having a single source for the headline string (computed once in the assembler, displayed twice) makes this trivially enforceable.

---

## Entity: `ResolvedInputs`

Snapshot of all inputs the calc engine consumed (Section 2 of the Audit tab).

```text
{
  raw: { ageRoger, ageRebecca, ..., bufferUnlock, bufferSS, terminalBuffer, ... },  // verbatim from getInputs()
  derivedFrom: [{ key: 'bufferSS', value: 1, source: 'default' }, ...],             // which keys defaulted vs were user-set
  composition: {                                                                    // for the pie chart (FR-CH-2)
    accessibleStocks: 445000,
    cash: 80000,
    locked401kTrad: 26454,
    locked401kRoth: 58000,
  },
}
```

---

## Entity: `SpendingAdjustments`

```text
{
  rawAnnualSpend: 60100,
  mortgageAdjustedAnnualSpend: 58000,
  mortgageDelta: -2100,
  collegeYears: [{ ageStart: 18, ageEnd: 22, annualCost: 48000, kid: 'Janet' }, ...],
  home2: { buyAge: 47, sellAge: null, annualCarry: 4500 },
  effectiveSpendByYear: [                                                           // ChartSeries for FR-CH-3
    { x: 42, y: 0 },        // age 42, accumulation phase
    ...
    { x: 48, y: 60100 },    // FIRE
    { x: 60, y: 56000 },    // mortgage paid off
    ...
  ],
}
```

---

## Entity: `GateEvaluation` (×3)

One per mode (`safe`, `exact`, `dieWithZero`). Always 3 entries in fixed order.

```text
{
  mode: 'safe' | 'exact' | 'dieWithZero',
  isActiveMode: boolean,                          // true for the currently-selected mode
  candidateFireAge: 48,
  strategyUsed: { id: 'bracket-fill-smoothed', theta: null },
  formulaPlainEnglish: 'Safe: every retirement-year total ≥ $60,100 AND endBalance ≥ 0.',
  formulaInputs: { floor: 60100, endAge: 100, terminalBuffer: 0 },
  verdict: true | false,
  reason: 'feasible' | 'first violation at age 84 (total $46,009)' | 'end balance $0 < required $X' | etc.,
  violations: [                                   // empty if no floor breaches; one entry per breach year
    { age: 84, total: 46009, floor: 60100 },
    { age: 86, total: 38000, floor: 60100 },
    ...
  ],
  trajectorySeries: [                             // ChartSeries for FR-CH-4 (per-gate chart)
    { x: 48, y: 971765 },
    ...
    { x: 100, y: 175691 },
  ],
  floorSeries: [                                  // horizontal line — the floor or threshold
    { x: 48, y: 60100 },
    { x: 100, y: 60100 },
  ],
}
```

---

## Entity: `FireAgeResolution`

```text
{
  displayedFireAge: 48,
  searchMethod: 'integer-year' | 'month-precision-interp',  // 'month-precision-interp' for DWZ when interpolation triggered
  candidates: [                                              // ChartSeries for FR-CH-5
    { age: 42, signedEndBalance: -100000, feasibleUnderActiveMode: false },
    { age: 43, signedEndBalance: -85000,  feasibleUnderActiveMode: false },
    ...
    { age: 47, signedEndBalance: -10000,  feasibleUnderActiveMode: false },
    { age: 48, signedEndBalance: 5000,    feasibleUnderActiveMode: true   },  // <-- chosen
    { age: 49, signedEndBalance: 25000,   feasibleUnderActiveMode: true   },
    ...
  ],
  monthPrecisionResult: null | { totalMonths: 86, fractionalAge: 49.17 },     // populated for DWZ when interp triggered
}
```

---

## Entity: `StrategyRanking`

Wraps the per-strategy table.

```text
{
  winnerId: 'bracket-fill-smoothed',
  rows: [
    {
      strategyId: 'bracket-fill-smoothed',
      chosenTheta: null,
      endBalance: 65654,
      lifetimeFederalTax: 12000,
      violations: 0,
      firstViolationAge: null,
      shortfallYears: 0,
      firstShortfallAge: null,
      hasShortfall: false,
      safe_feasible: true,
      exact_feasible: false,
      dieWithZero_feasible: true,
      feasibleUnderCurrentMode: true,
      isWinner: true,
    },
    { strategyId: 'tax-optimized-search', chosenTheta: 0.7, ... },
    ...  // 7 entries total
  ],
  // Chart data (FR-CH-6) — derived from rows but pre-shaped for the grouped bar chart:
  barChartSeries: {
    labels: ['bracket-fill', 'tax-opt', 'roth-ladder', 'trad-first', 'trad-last', 'proportional', 'conventional'],
    datasets: [
      { label: 'End Balance ($K)',     data: [66, 175, 0, 0, 0, 0, 0]      },
      { label: 'Lifetime Tax ($K)',    data: [12, 8,  35, 25, 15, 30, 28]  },
      { label: 'Floor Violations (count)', data: [0, 0, 17, 12, 5, 30, 12] },
    ],
  },
}
```

---

## Entity: `LifecycleProjection`

```text
{
  rows: [                                            // per-year, scrollable in UI
    { age: 42, phase: 'accumulation',     total: 609454, p401k: 84454,  pStocks: 445000, pCash: 80000, pRoth: 58000, ssIncome: 0, withdrawals: 0,    syntheticConversion: 0 },
    ...
    { age: 48, phase: 'phase1-taxable-only', total: 971765, ... },
    ...
    { age: 100, phase: 'phase3-with-ss',  total: 175691, ... },
  ],
  thumbnailSeries: [                                 // ChartSeries for FR-CH-7 thumbnail of lifecycle chart
    { x: 42, y: 609454 },
    ...
    { x: 100, y: 175691 },
  ],
  fireAgeRowIndex: 6,                                // index into `rows` of the FIRE-age row, for visual highlighting
}
```

**Validation rule**: `rows.length === (endAge - ageRoger + 1)` — every plan year is represented. The FIRE-age row's `phase` MUST be the first non-`accumulation` phase.

---

## Entity: `CrossValidationWarning`

Zero or more entries. The list is empty when all 4 invariants from R-005 pass.

```text
{
  kind: 'endBalance-mismatch' | 'feasibility-mismatch' | 'fireAge-mismatch' | 'violationCount-mismatch',
  valueA: 65654,
  valueB: 175691,
  delta: 110037,
  deltaPct: 167.6,                                   // |delta| / |valueA| × 100
  expected: false | true,                            // true means "this divergence is expected by design"
  reason: 'signedLifecycleEndBalance is bracket-fill-only — active strategy is tax-optimized-search.',
  // Chart data (FR-CH-8) — dual bars side-by-side:
  dualBarSeries: {
    labels: ['signed-sim', 'chart-sim'],
    data: [65654, 175691],
  },
}
```

**Validation rule**: when `expected === true`, the UI annotates the warning row with "(expected — <reason>)" and styles it neutrally rather than as a warning.

---

## Entity: `ChartSeries` (typedef)

A general-purpose data shape used by every chart in the Audit tab.

```text
ChartSeries = Array<{ x: number, y: number }>     // for line/scatter/area charts (gate trajectory, spend curve, FIRE-age scatter)
            | Array<{ category: string, value: number }>  // for bar charts (composition pie, dual-bar)
            | { labels: string[], datasets: [{ label, data }] }  // for grouped bar (strategy ranking)
```

**Why mandate this shape**: SC-011 requires every chart to be reproducible from the JSON alone. By keeping the data shape explicit and storing it on the snapshot, a developer reading the JSON can re-render the same chart without rerunning the dashboard.

---

## Persistence and migration

**No new persistence keys.** The `AuditSnapshot` is in-memory only (`window._lastAuditSnapshot`); it is regenerated on every recalc. The Copy Debug serialization is a one-shot read, not a write.

**No migrations needed.**

---

## State transitions

```text
[no recalc yet]
   |
   |--- recalcAll() finishes ---> assembleAuditSnapshot(options) runs ---> window._lastAuditSnapshot populated
   |                                                                       |
   |                                                                       |--- if Audit tab is currently active ---> renderAuditUI(snapshot)
   |                                                                       |--- if user later clicks Copy Debug ---> serialize snapshot to JSON
   |
   |--- user clicks Audit tab (first activation) ---> tabRouter.activate ---> _auditChartsBuilt flag check
                                                                              |--- if false: build all chart instances + flip flag
                                                                              |--- always: renderAuditUI(window._lastAuditSnapshot)
```

The single-source rule: `window._lastAuditSnapshot` is the only object the UI reads. Both Copy Debug serialization and UI render flow from it. There is no parallel state.
