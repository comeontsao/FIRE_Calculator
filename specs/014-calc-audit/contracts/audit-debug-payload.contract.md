# Contract — Copy Debug `audit` Block Shape

**Feature**: `014-calc-audit`
**Files affected**: the Copy Debug button's serialization code in both HTML files.

The Copy Debug button gains a new top-level key `audit` containing the same `AuditSnapshot` the UI is rendering. Existing keys (`feasibilityProbe`, `summary`, `lifecycleSamples`, `inputs`, etc.) are PRESERVED — this is purely additive (FR-020).

---

## Top-level shape

```jsonc
{
  // Existing keys (unchanged):
  "_generatedAt": "2026-04-26T...",
  "_file": "FIRE-Dashboard.html",
  "fireMode": "safe",
  "fireAge": 48,
  "currentAge": 42,
  "ssClaimAge": 70,
  "annualSpend": 60100,
  "bufferUnlock_yrs": 1,
  "bufferSS_yrs": 1,
  "summary": { ... },
  "feasibilityProbe": { ... },
  "lifecycleSamples": [ ... ],
  "inputs": { ... },

  // NEW key:
  "audit": {
    "schemaVersion": "1.0",
    "generatedAt": "2026-04-26T...",
    "flowDiagram": { ... },
    "resolvedInputs": { ... },
    "spendingAdjustments": { ... },
    "gates": [ {...safe...}, {...exact...}, {...dieWithZero...} ],
    "fireAgeResolution": { ... },
    "strategyRanking": { ... },
    "lifecycleProjection": { ... },
    "crossValidationWarnings": [ ... ]
  }
}
```

---

## Source — same object as UI

The `audit` block is read from `window._lastAuditSnapshot` — the SAME object the UI rendered. No recomputation at Copy Debug time. This guarantees SC-011 (chart data in JSON is byte-identical to what the chart shows).

```js
function buildDebugPayload() {
  return {
    // ... existing keys ...
    audit: window._lastAuditSnapshot ?? null,
  };
}
```

When `_lastAuditSnapshot` is null (e.g., dashboard hasn't completed a recalc yet), the `audit` key is `null`. Tooling consuming the JSON should handle this case.

---

## Schema version contract

`audit.schemaVersion` is a string. Currently `"1.0"`. Bumping rules:

- **Additive change** (new field, new section): NO version bump.
- **Removal of any field**: bump to `"2.0"` (or follow semver).
- **Type change of any existing field**: bump to `"2.0"`.

Tooling that consumes the JSON SHOULD check `schemaVersion` and treat unknown major versions as best-effort.

---

## Determinism

Same inputs MUST produce byte-identical `audit` block (excluding the two `generatedAt` timestamps — the top-level one and the audit-block one). Verified by a Node test: assemble snapshot twice with same options, deep-equal results after deleting `generatedAt` fields.

---

## Examples — what each section looks like in JSON

### `audit.flowDiagram`

```jsonc
{
  "stages": [
    { "stageId": "inputs",    "label": "Inputs",                "headlineOutput": "42yo · $525K NW · $60K spend",            "downstreamArrowLabel": "inputs" },
    { "stageId": "spending",  "label": "Spending Adjustments",  "headlineOutput": "effective spend $60K → $58K w/ mortgage", "downstreamArrowLabel": "effectiveSpend" },
    { "stageId": "gates",     "label": "Gate Evaluations",      "headlineOutput": "Safe ✓ · Exact ✗ · DWZ ✓ at age 48",       "downstreamArrowLabel": "verdict + active strategy" },
    { "stageId": "fireAge",   "label": "FIRE Age Resolution",   "headlineOutput": "48 = 6 yrs (passed at integer-year)",     "downstreamArrowLabel": "fireAge = 48" },
    { "stageId": "strategy",  "label": "Strategy Ranking",      "headlineOutput": "winner: bracket-fill-smoothed",            "downstreamArrowLabel": "strategy + θ" },
    { "stageId": "lifecycle", "label": "Lifecycle Projection",  "headlineOutput": "end balance $175K at age 100",             "downstreamArrowLabel": "(end of pipeline)" }
  ]
}
```

### `audit.gates[0]` (Safe)

```jsonc
{
  "mode": "safe",
  "isActiveMode": true,
  "candidateFireAge": 48,
  "strategyUsed": { "id": "bracket-fill-smoothed", "theta": null },
  "formulaPlainEnglish": "Safe: every retirement-year total ≥ $60,100. End balance $175,691. Verdict: feasible.",
  "formulaInputs": { "floor": 60100, "endAge": 100 },
  "verdict": true,
  "reason": "feasible",
  "violations": [],
  "trajectorySeries": [
    { "x": 48, "y": 971765 },
    { "x": 49, "y": 950000 },
    ...
    { "x": 100, "y": 175691 }
  ],
  "floorSeries": [
    { "x": 48, "y": 60100 },
    { "x": 100, "y": 60100 }
  ]
}
```

### `audit.strategyRanking`

```jsonc
{
  "winnerId": "bracket-fill-smoothed",
  "rows": [
    {
      "strategyId": "bracket-fill-smoothed",
      "chosenTheta": null,
      "endBalance": 65654,
      "lifetimeFederalTax": 12000,
      "violations": 0,
      "firstViolationAge": null,
      "shortfallYears": 0,
      "firstShortfallAge": null,
      "hasShortfall": false,
      "safe_feasible": true,
      "exact_feasible": false,
      "dieWithZero_feasible": true,
      "feasibleUnderCurrentMode": true,
      "isWinner": true
    },
    // ... 6 more
  ],
  "barChartSeries": {
    "labels": ["bracket-fill", "tax-opt", "roth-ladder", "trad-first", "trad-last", "proportional", "conventional"],
    "datasets": [
      { "label": "End Balance ($K)",         "data": [66, 175, 0, 0, 0, 0, 0]  },
      { "label": "Lifetime Tax ($K)",        "data": [12, 8, 35, 25, 15, 30, 28] },
      { "label": "Floor Violations (count)", "data": [0, 0, 17, 12, 5, 30, 12] }
    ]
  }
}
```

### `audit.crossValidationWarnings` (when divergence flagged)

```jsonc
[
  {
    "kind": "endBalance-mismatch",
    "valueA": 65654,
    "valueB": 175691,
    "delta": 110037,
    "deltaPct": 167.6,
    "expected": true,
    "reason": "signedLifecycleEndBalance is bracket-fill-only — active strategy is tax-optimized-search.",
    "dualBarSeries": {
      "labels": ["signed-sim", "chart-sim"],
      "data": [65654, 175691]
    }
  }
]
```

When all 4 invariants pass: `"crossValidationWarnings": []`.

---

## Backward compatibility

A debug payload from BEFORE this feature (no `audit` key) remains valid. A debug payload AFTER this feature has `audit` PLUS the existing keys. Tooling that only reads `feasibilityProbe`/`summary` continues to work.

---

## Test surface

The Playwright test in `tests/e2e/calc-audit.spec.ts` MUST verify:

- The Copy Debug clipboard payload parses as valid JSON.
- The parsed JSON has top-level `audit` key.
- `audit.schemaVersion === "1.0"`.
- `audit.flowDiagram.stages.length === 6`.
- `audit.gates.length === 3` with `mode` values `safe`, `exact`, `dieWithZero` in that order.
- `audit.strategyRanking.rows.length` matches `_lastStrategyResults.rows.length`.
- `audit.lifecycleProjection.rows.length === (endAge - ageRoger + 1)`.
- All chart series in `audit.*.trajectorySeries` / `effectiveSpendByYear` / etc. have `.length > 0`.
- The `audit` block is deep-equal to `window._lastAuditSnapshot` (modulo timestamp).
