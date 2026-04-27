# Contract: Unified Simulator (US6, Option A noise reservation)

**Wave:** C (P3) | **FRs:** FR-020..FR-023 | **Spec section:** [User Story 6](../spec.md)

This contract pins the unified `simulateLifecycle()` entry point that subsumes `signedLifecycleEndBalance`, `projectFullLifecycle`, and `_simulateStrategyLifetime`, plus the `noiseModel` reservation for future Monte Carlo.

---

## 1. Public API

```js
/**
 * Single source of truth for lifecycle simulation. Pure function — no DOM
 * access, no global reads, no Chart.js. All inputs explicit.
 *
 * Inputs:
 *   {SimulateLifecycleInputs} options
 *
 * Outputs:
 *   {SimulateLifecycleOutput}
 *
 * Consumers:
 *   - calc/findFireAgeNumerical.js (per-strategy bisection — US3)
 *   - calc/strategyRanker.js (scoreAndRank — US4)
 *   - lifecycle chart renderer in FIRE-Dashboard.html and FIRE-Dashboard-Generic.html
 *   - calc/calcAudit.js (assembleAuditSnapshot — feature 014)
 *
 * @param {Object|null} options.noiseModel - RESERVED. Must be null in feature 015.
 *   Future Monte Carlo will populate this with:
 *   {
 *     returns: { distribution: 'normal' | 'lognormal', mean: number, std: number },
 *     inflation: { distribution: 'normal', mean: number, std: number },
 *     lifespan: { distribution: 'normal', meanAge: number, stdAge: number },
 *     samples: number,    // e.g., 1000 trials
 *     seed?: number,      // optional deterministic seed
 *   }
 *   The implementation will run `samples` trials and return percentile aggregates.
 */
function simulateLifecycle(options) {
  if (options.noiseModel !== null && options.noiseModel !== undefined) {
    throw new Error('simulateLifecycle: noiseModel is reserved for future Monte Carlo support and must be null in this build (feature 015).');
  }
  // ...deterministic simulation...
  return output;
}
```

### Input shape (`SimulateLifecycleInputs`)

```ts
{
  scenarioInputs: ScenarioInputs,    // current `inp` object (or frozen subset)
  fireAge: number,                    // when FIRE begins (inclusive)
  planAge: number,                    // when sim ends (exclusive)
  strategyOverride?: StrategyId,      // undefined → use scenarioInputs default
  thetaOverride?: number,             // 0..1 for tax-optimized-search; undefined otherwise
  overlays: {
    mortgage: boolean,
    college: boolean,
    home2: boolean,
  },
  noiseModel: null,                   // RESERVED — must be null in 015
}
```

### Output shape (`SimulateLifecycleOutput`)

```ts
{
  perYearRows: PerYearRow[],          // length = planAge - fireAge
  endBalance: number,                  // perYearRows[last].total
  hasShortfall: boolean,               // any(perYearRows[*].hasShortfall)
  shortfallYearAges: number[],
  floorViolations: FloorViolation[],   // mode-independent; mode applies the gate downstream
  cumulativeFederalTax: number,        // rounded; sum(perYearRows[*].federalTax)
  residualArea: number,                // rounded; sum(perYearRows[*].total) for years in [fireAge, planAge)
}
```

---

## 2. Migration sequence (R11)

### Step 1 — Build alongside

`calc/simulateLifecycle.js` is added. The three existing simulators (`signedLifecycleEndBalance`, `projectFullLifecycle`, `_simulateStrategyLifetime`) remain UNTOUCHED until Step 4.

### Step 2 — Parity tests

`tests/unit/unifiedSimulator.test.js` replays every existing fixture from `tests/unit/*` against `simulateLifecycle()` and asserts byte-equivalent output vs the simulator that fixture currently uses. Acceptable tolerances:

- `endBalance`: identical (no float drift permitted).
- `perYearRows[i].total`: within $1 (rounding tolerance only).
- `cumulativeFederalTax`: identical after rounding.
- `residualArea`: identical after rounding.
- `hasShortfall`: identical boolean.
- `floorViolations`: identical array (same ages, same kinds).

Any divergence is recorded in a punch list and resolved BEFORE Step 3 begins. Divergences that the spec's Cross-Validation section documents as `expected: true` ("different sim contracts") become bugs to fix in `simulateLifecycle()` — they are no longer expected after US6.

### Step 3 — Flip call sites one at a time

Order:

1. **Lifecycle chart renderer** (most isolated). Run full unit + Playwright suite. If green, proceed; else revert and add to punch list.
2. **Audit assembler** (`calc/calcAudit.js`). Same gate.
3. **Strategy ranker** (`scoreAndRank`). Same gate.
4. **Per-strategy finder** (`findPerStrategyFireAge`). Same gate.

After each flip, the Manager performs a browser smoke walk on both HTML files (R13).

### Step 4 — Delete retired simulators

ONLY when all four call sites are flipped AND parity tests are still green AND `auditSnapshot.crossValidationWarnings` contains zero `{expected: true, reason: 'different sim contracts'}` entries:

- Delete `calc/signedLifecycleEndBalance.js` AND its callers.
- Delete `calc/projectFullLifecycle.js` AND its callers.
- Delete `_simulateStrategyLifetime` (or its module if extracted).
- Update every `Inputs / Outputs / Consumers` header that referenced the deleted modules.

The deletion commit message records the call-site count (per the caller-audit lesson from feature 004).

---

## 3. `noiseModel` enforcement

The function body opens with the precondition:

```js
if (options.noiseModel !== null && options.noiseModel !== undefined) {
  throw new Error('simulateLifecycle: noiseModel is reserved for future Monte Carlo support and must be null in this build (feature 015).');
}
```

A unit test in `tests/unit/unifiedSimulator.test.js` asserts:

```js
test('throws when noiseModel is not null', () => {
  assert.throws(
    () => simulateLifecycle({ ...validInputs, noiseModel: { samples: 100 } }),
    /reserved for future Monte Carlo/
  );
});
test('accepts null noiseModel', () => {
  assert.doesNotThrow(() => simulateLifecycle({ ...validInputs, noiseModel: null }));
});
test('accepts undefined noiseModel', () => {
  assert.doesNotThrow(() => simulateLifecycle({ ...validInputs, noiseModel: undefined }));
});
```

---

## 4. Cross-validation invariant retirement (FR-021)

Feature 014's audit `crossValidationWarnings` array tags some warnings with `expected: true, reason: 'different sim contracts'` because the three simulators legitimately disagree on the same scenario by design. After US6:

- Every cross-validation invariant either passes (no warning emitted) OR fails (warning emitted with `expected: false`).
- No warning carries `expected: true, reason: 'different sim contracts'`.
- The audit's Cross-Validation section displays "All cross-checks passed" in the common case.

A Playwright fixture in `tests/e2e/calc-audit.spec.ts` (extension of feature 014's fixture) asserts `auditSnapshot.crossValidationWarnings.filter(w => w.expected && w.reason.includes('different sim contracts')).length === 0`.

---

## 5. Acceptance criteria

| Criterion | Verifiable by |
|-----------|---------------|
| FR-020 single simulator entry | Grep: `findFireAgeNumerical`, `scoreAndRank`, lifecycle chart, `calcAudit` all import `simulateLifecycle` and zero of them import the retired modules |
| FR-021 noiseModel hook reserved | Unit test: throws on non-null, accepts null/undefined; JSDoc present with planned shape |
| FR-022 zero "different sim contracts" warnings | Playwright on the existing 95 E2E test scenarios — none emit the expected-divergence warning |
| FR-023 chart vs audit vs ranker agree within $1 | Playwright: for 10 random scenarios, parse Copy Debug; assert `Math.abs(chartLastTotal - auditLastTotal) < 1` and `Math.abs(auditLastTotal - rankerEndBalance) < 1` |

---

## 6. Module header

```js
/**
 * calc/simulateLifecycle.js — UNIFIED LIFECYCLE SIMULATOR
 *
 * Inputs:  SimulateLifecycleInputs (see contracts/unified-simulator.contract.md)
 * Outputs: SimulateLifecycleOutput
 *
 * Consumers:
 *   - calc/findFireAgeNumerical.js — per-strategy bisection (US3)
 *   - calc/strategyRanker.js — scoreAndRank (US4)
 *   - FIRE-Dashboard.html lifecycle chart renderer (line ~10690)
 *   - FIRE-Dashboard-Generic.html lifecycle chart renderer (lockstep)
 *   - calc/calcAudit.js — assembleAuditSnapshot (feature 014)
 *
 * Replaces (DELETED in feature 015 Wave C):
 *   - calc/signedLifecycleEndBalance.js (DWZ feasibility's signed-sim fallback)
 *   - calc/projectFullLifecycle.js (chart producer, strategy-aware)
 *   - _simulateStrategyLifetime (no-overlay strategy-aware sim used by scoreAndRank)
 *
 * Pre-015, the three simulators above disagreed on the same scenario by
 * design — leading to the audit's "(expected — different sim contracts)"
 * cross-validation annotations. This module consolidates them; that
 * annotation no longer fires post-Wave-C.
 *
 * Reserved hook: options.noiseModel (default null) — future Monte Carlo
 * extension point. Throws if non-null in 015. See JSDoc on simulateLifecycle().
 */
```
