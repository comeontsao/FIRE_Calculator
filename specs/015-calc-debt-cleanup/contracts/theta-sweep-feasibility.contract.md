# Contract: Tax-Optimized-Search θ-Sweep Feasibility-First (US2)

**Wave:** A (P1) | **FRs:** FR-006, FR-007 | **Spec section:** [User Story 2](../spec.md)

This contract pins the rewrite of `tax-optimized-search`'s θ-sweep from "rank by tax, then check feasibility" to "filter by feasibility, then rank by tax."

---

## 1. Three-pass API

```js
function runThetaSweep(scenarioInputs, fireAge, planAge, mode, overlays) {
  const candidates = THETA_VALUES.map(theta => simulateLifecycle({
    scenarioInputs, fireAge, planAge,
    strategyOverride: 'tax-optimized-search',
    thetaOverride: theta,
    overlays,
    noiseModel: null,
  }));

  // Pass 2: filter feasibility BEFORE ranking by tax
  const feasibleCandidates = candidates.filter(r =>
    r.hasShortfall === false && r.floorViolations.length === 0
  );

  if (feasibleCandidates.length === 0) {
    // No feasible θ — strategy is infeasible. Record diagnostic info.
    const lowestTaxOverall = candidates.reduce(
      (best, r) => (r.cumulativeFederalTax < best.cumulativeFederalTax ? r : best),
      candidates[0]
    );
    return {
      feasibleUnderCurrentMode: false,
      chosenTheta: null,
      lowestTaxOverallTheta: lowestTaxOverall.thetaUsed, // diagnostic only
      shortfallYearsAtLowestTax: lowestTaxOverall.shortfallYearAges.length,
      perStrategyTrajectory: lowestTaxOverall.perYearRows, // displayed as "if we ignored feasibility"
    };
  }

  // Pass 3: rank survivors by lifetime federal tax
  const winner = feasibleCandidates.reduce(
    (best, r) => (r.cumulativeFederalTax < best.cumulativeFederalTax ? r : best),
    feasibleCandidates[0]
  );

  return {
    feasibleUnderCurrentMode: true,
    chosenTheta: winner.thetaUsed,
    perStrategyTrajectory: winner.perYearRows,
    cumulativeFederalTax: winner.cumulativeFederalTax,
    residualArea: winner.residualArea,
    endBalance: winner.endBalance,
    shortfallYearAges: [],
    floorViolations: [],
  };
}
```

### `THETA_VALUES`

`[0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]` — eleven values, matching today's sweep granularity. Step size is preserved to avoid changing the strategy's outputs on already-feasible scenarios.

---

## 2. Removal of post-hoc AND-check

In `calc/strategyRanker.js` (or wherever `scoreAndRank` lives), the line

```js
// Pre-015 patch added in feature 014 prep:
const verdict = gate.feasible && !candidate.hasShortfall;
```

becomes

```js
// 015 — feasibility is determined inside the strategy, not patched downstream:
const verdict = candidate.feasibleUnderCurrentMode;
```

A test in `tests/unit/thetaSweepFeasibility.test.js` removes the AND-check, runs the existing 16 audit unit-test cases from feature 014, and asserts all pass (SC-002 verifiable).

---

## 3. Audit Strategy Ranking row shape

When `tax-optimized-search` is in the per-strategy results array, its row in `auditSnapshot.strategyRanking.perStrategyResults[]` carries:

```js
{
  strategyId: 'tax-optimized-search',
  // ...standard PerStrategyResult fields...
  chosenTheta: number | null,           // null when feasibleUnderCurrentMode === false
  lowestTaxOverallTheta: number | null, // null when feasibleUnderCurrentMode === true
  shortfallYearsAtLowestTax: number,    // 0 when feasible; >= 1 when infeasible
}
```

### Display rule (audit Strategy Ranking section)

- **Feasible**: `θ = 0.4 (lifetime tax: $213,450)`
- **Infeasible**: `Infeasible. Lowest-tax overall θ would be 0.0 with 8 shortfall years.`

Bilingual i18n keys:

| Key | EN | zh-TW |
|-----|-----|-----|
| `audit.strategyRanking.theta.feasibleLabel` | `θ = {0} (lifetime tax: ${1})` | `θ = {0}（終身稅額：${1}）` |
| `audit.strategyRanking.theta.infeasibleLabel` | `Infeasible. Lowest-tax overall θ would be {0} with {1} shortfall years.` | `不可行。終身稅額最低的 θ 為 {0}，有 {1} 年資金缺口。` |

---

## 4. Acceptance criteria

| Criterion | Verifiable by |
|-----------|---------------|
| FR-006 filter-then-rank | Unit test on planted θ=0-shortfall scenario asserts `chosenTheta > 0` and `shortfallYearAges.length === 0` |
| FR-007 redundant AND-check removable | Unit test deletes the AND-check, runs 16 audit fixtures, asserts all pass |
| Acceptance Scenario 2 — all-infeasible | Unit test with extreme low-balance scenario asserts `feasibleUnderCurrentMode: false` AND `lowestTaxOverallTheta` non-null |
| Acceptance Scenario 4 — chosenTheta is feasible when reported feasible | Unit test loops 100 random scenarios; whenever a row reports `feasibleUnderCurrentMode: true`, assert simulating at `chosenTheta` produces zero shortfall + zero floor violations |
