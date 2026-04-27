# Contract: Mode/Objective Orthogonality (US4, Option E)

**Wave:** B (P2) | **FRs:** FR-013..FR-017 | **Spec section:** [User Story 4](../spec.md)

This contract pins the silent-override removal: Mode and Objective are orthogonal axes that compose. The strategy ranker's sort-key dispatch reads `(mode, objective)` and emits an `ActiveSortKeyChain`; both the ranker and the audit consume it identically.

---

## 1. Public API: `getActiveSortKey`

```js
/**
 * Pure function. Maps a (Mode, Objective) pair to its active sort-key chain.
 * @param {{mode: 'safe'|'exact'|'dwz', objective: 'preserve'|'minimizeTax'}} input
 * @returns {ActiveSortKeyChain}
 */
function getActiveSortKey({ mode, objective }) {
  // Implementation per the resolution table in data-model.md §2
}
```

### Resolution table (canonical)

| Mode | Objective | primary | tieBreaker[0] | tieBreaker[1] |
|------|-----------|---------|---------------|---------------|
| `safe` | `preserve` | `endBalance` desc | `residualArea` desc | `strategyId` asc |
| `safe` | `minimizeTax` | `cumulativeFederalTax` asc | `endBalance` desc | `strategyId` asc |
| `exact` | `preserve` | `endBalance` desc | `residualArea` desc | `strategyId` asc |
| `exact` | `minimizeTax` | `cumulativeFederalTax` asc | `endBalance` desc | `strategyId` asc |
| `dwz` | `preserve` | `residualArea` desc | `absEndBalance` asc | `strategyId` asc |
| `dwz` | `minimizeTax` | `cumulativeFederalTax` asc | `residualArea` desc | `strategyId` asc |

The function MUST be exhaustive over all 6 (Mode, Objective) pairs and throw on unknown values (defensive programming).

---

## 2. Ranker integration

```js
function scoreAndRank(perStrategyResults, sortKey) {
  // Step 1: compute scalar per strategy for each sort axis (already done in PerStrategyResult)
  // Step 2: filter by feasibility
  const feasible = perStrategyResults.filter(r => r.feasibleUnderCurrentMode);

  // Step 3: sort by chain
  const comparator = makeChainedComparator(sortKey);
  const ranked = [...feasible].sort(comparator);

  // Step 4: append infeasible strategies at the end (sorted by primary key for diagnostic display)
  const infeasible = perStrategyResults.filter(r => !r.feasibleUnderCurrentMode).sort(comparator);

  return [...ranked, ...infeasible].map((r, i) => ({ ...r, rankIndex: i }));
}

function makeChainedComparator(chain) {
  return (a, b) => {
    for (const key of [chain.primary, ...chain.tieBreakers]) {
      const av = a[key.field];
      const bv = b[key.field];
      const cmp = av === bv ? 0 : (av < bv ? -1 : 1);
      if (cmp !== 0) return key.direction === 'asc' ? cmp : -cmp;
    }
    return 0; // total tie — should not happen because strategyId is the final tie-breaker
  };
}
```

### Removed code

The historical "smallest end balance under DWZ" silent override:

```js
// REMOVED in Wave B:
if (mode === 'dwz') {
  sortKey = { primary: { field: 'endBalance', direction: 'asc' }, ... }; // silent override
}
```

A Wave B test verifies the override is gone by checking that `getActiveSortKey({mode: 'dwz', objective: 'preserve'}).primary.field === 'residualArea'` (NOT `endBalance`).

---

## 3. Audit Strategy Ranking display

The audit's Strategy Ranking section gains a header block:

```html
<div class="audit-active-sort-key">
  <div data-i18n="audit.strategyRanking.modeConstraint.label"></div>
  <div data-i18n="audit.strategyRanking.objectiveLabel.label"></div>
  <div data-i18n="audit.strategyRanking.primarySortKey.label"></div>
  <div data-i18n="audit.strategyRanking.tieBreakerChain.label"></div>
</div>
```

### i18n keys (FR-016)

| Key | EN template | zh-TW template |
|-----|------------|---------------|
| `audit.mode.safe.constraint` | `Safe — every retirement-year total ≥ buffer × annual spend AND end balance ≥ 0` | `安全 — 每年退休後總額 ≥ 緩衝倍數 × 年度支出，且期末餘額 ≥ 0` |
| `audit.mode.exact.constraint` | `Exact — end balance ≥ terminal buffer × annual spend` | `精確 — 期末餘額 ≥ 期末緩衝倍數 × 年度支出` |
| `audit.mode.dwz.constraint` | `Die With Zero — end balance ≈ $0 at plan age` | `Die With Zero — 預定壽命年齡時期末餘額 ≈ $0` |
| `audit.objective.preserve.label` | `Preserve estate` | `保留遺產` |
| `audit.objective.minimizeTax.label` | `Minimize lifetime tax` | `終身稅額最小化` |
| `audit.sortKey.residualArea.desc` | `residualArea ↓ (sum of yearly totals from FIRE age to plan age)` | `residualArea ↓（FIRE 年齡至預定壽命年齡的年度總額累加）` |
| `audit.sortKey.cumulativeFederalTax.asc` | `cumulativeFederalTax ↑ (sum of yearly federal tax from FIRE age to plan age)` | `cumulativeFederalTax ↑（FIRE 年齡至預定壽命年齡的年度聯邦稅額累加）` |
| `audit.sortKey.endBalance.desc` | `endBalance ↓ (highest end-of-plan balance wins)` | `endBalance ↓（期末餘額最高者勝出）` |
| `audit.sortKey.absEndBalance.asc` | `\|endBalance\| ↑ (closest to $0 wins — DWZ tie-breaker)` | `\|endBalance\| ↑（最接近 $0 者勝出 — DWZ 平手條件）` |
| `audit.sortKey.strategyId.asc` | `strategyId alphabetical (final deterministic tie-breaker)` | `strategyId 字母順序（最終決定平手條件）` |
| `audit.strategyRanking.modeConstraint.label` | `Mode constraint: {0}` | `模式限制：{0}` |
| `audit.strategyRanking.objectiveLabel.label` | `Objective: {0}` | `目標：{0}` |
| `audit.strategyRanking.primarySortKey.label` | `Primary sort: {0}` | `主排序：{0}` |
| `audit.strategyRanking.tieBreakerChain.label` | `Tie-breakers: {0} → {1}` | `平手條件：{0} → {1}` |

### Render rule

When the audit assembler runs, it populates:

```js
auditSnapshot.strategyRanking.activeSortKey = {
  primary: { field: 'residualArea', direction: 'desc', label: 'audit.sortKey.residualArea.desc' },
  tieBreakers: [
    { field: 'absEndBalance', direction: 'asc', label: 'audit.sortKey.absEndBalance.asc' },
    { field: 'strategyId', direction: 'asc', label: 'audit.sortKey.strategyId.asc' },
  ],
  modeConstraintLabel: 'audit.mode.dwz.constraint',
  objectiveLabel: 'audit.objective.preserve.label',
};
```

The render function uses `t(snapshot.strategyRanking.activeSortKey.modeConstraintLabel)`, `t(...objectiveLabel)`, `t('audit.strategyRanking.primarySortKey.label', t(primary.label))`, etc.

---

## 4. residualArea and cumulativeFederalTax computation rules

### Where computed

Inside `simulateLifecycle()` (Wave C) — or as a pure derivation from `perYearRows[]` during Wave B (before US6 lands). Either way, the formulas are:

```js
const residualArea = Math.round(
  perYearRows.reduce((sum, row) => sum + row.total, 0)
);
const cumulativeFederalTax = Math.round(
  perYearRows.reduce((sum, row) => sum + row.federalTax, 0)
);
```

### Year range

Both sums cover `[fireAge, planAge)` — i.e., `perYearRows[0]` is the year of FIRE; the last row is the year just before plan-age. This aligns with `perStrategyTrajectory.length === planAge - perStrategyFireAge` per the data-model.

### Precision

`Math.round` to nearest dollar BEFORE comparison. This prevents floating-point flicker across recalcs (R8 rationale). Sub-cent drift in raw sums never causes a tie-break flip.

---

## 5. DWZ end-balance tolerance

`feasibleUnderCurrentMode === true` under DWZ requires:

```js
Math.abs(simResult.endBalance) <= dwzEndBalanceTolerance
```

Where `dwzEndBalanceTolerance` is set at task time but documented here as: `Math.max(1, scenarioInputs.annualSpend / 365)` — i.e., $1 floor, scaled to "less than one day's spending" for high-spend scenarios. This gives a deterministic tolerance that scales with the scenario's magnitude.

---

## 6. Acceptance criteria

| Criterion | Verifiable by |
|-----------|---------------|
| FR-013 silent override removed | Unit test: `getActiveSortKey({mode: 'dwz', objective: 'preserve'}).primary.field === 'residualArea'` |
| FR-014 Preserve uses residualArea | Unit test on a known scenario asserts ranked[0] has the highest `residualArea` among feasible |
| FR-015 Minimize Tax uses cumulativeFederalTax | Unit test asserts ranked[0] has the lowest `cumulativeFederalTax` among feasible |
| FR-016 audit displays active sort key | Playwright text-presence in audit's Strategy Ranking section for all 6 cells; bilingual EN + zh-TW |
| FR-017 DWZ + different objectives differ | Playwright: same inputs, toggle Objective under DWZ; assert ≥ 1 row in `perYearRows` differs by ≥ $100 AND both endBalances within $1 of $0 |
| Acceptance Scenario 4 — deterministic ties | Unit test plants two strategies with identical `residualArea` and asserts tie-break by `absEndBalance` then `strategyId` |
