# Data Model — HTML Canonical-Engine Swap

**Feature**: `004-html-canonical-swap`
**Date**: 2026-04-20

This feature introduces **one new module-level entity** (the production
adapter) and restores **one previously-existing calc module export**
(`evaluateFeasibility`). Everything else is re-use of feature 001's and
feature 003's existing entities.

---

## 1. `getCanonicalInputs` (NEW — production adapter)

**Location**: `calc/getCanonicalInputs.js`

**Role**: Translate the legacy `inp` shape both dashboards consume into the
canonical `Inputs` shape feature 001 defined in
`specs/001-modular-calc-engine/data-model.md §1`.

**Signature**:

```js
/**
 * @param {Object} inp   Legacy inp shape (RR-form or Generic-form variant).
 * @returns {Inputs}     Canonical Inputs per data-model.md §1, Object.freeze'd.
 * @throws              If `inp` is missing a required field that cannot be
 *                       null-guarded (e.g., no recognizable age source).
 */
export function getCanonicalInputs(inp): Inputs
```

**Behavior**:
- Null-guards every secondary-person field so RR or single-person Generic
  inputs don't crash.
- Reads primary age from `inp.ageRoger ?? inp.agePerson1` (auto-detects
  dashboard). Falls back to `Math.floor((today − birthdate) / year)` if
  present.
- Maps portfolio: `roger*` (RR) or `person1*` (Generic) → `portfolioPrimary`;
  equivalents for secondary if present → `portfolioSecondary`.
- Scenario + annual spend via the existing scenario lookup (ported from the
  inline engine's scenario table).
- Mortgage, second home, student loans, colleges: pass through with shape
  translation to canonical typedefs from feature 001's data model.
- Return rate: the dashboard's `inp.returnRate` is treated as real (matches
  the existing inline engine convention); `returnRateReal = inp.returnRate`.
  `inflationRate = inp.inflationRate`.
- Solver mode: `inp.fireMode` → canonical `solverMode` (same enum).
- Every returned object tree is `Object.freeze()`'d to prevent mutation
  downstream.

**Purity**: no DOM, no Chart.js, no `window`, no `localStorage`, no
`navigator`. Meta-test will enforce via the existing `module-boundaries` check.

**Fenced header**: matches the established `calc/*.js` header convention
(Inputs, Outputs, Consumers, Invariants, Purity).

**Consumers**:
- `FIRE-Dashboard.html` — `<script type="module">` bootstrap imports + exposes on `window`.
- `FIRE-Dashboard-Generic.html` — same.
- `tests/baseline/browser-smoke.test.js` — direct ES-module import; replaces feature 003's `_prototypeGetCanonicalInputs`.

---

## 2. `evaluateFeasibility` (RESTORED export in `calc/fireCalculator.js`)

**Role**: Evaluate whether a SPECIFIC `fireAge` is feasible under the solver's
mode-specific rules (Safe / Exact / Die-with-Zero), without running the full
linear search. Used by the shimmed `_evaluateFeasibilityAtAge` in both HTML
files.

**Signature**:

```js
/**
 * @param {{inputs: Inputs, fireAge: number, helpers: HelpersBundle}} params
 * @returns {boolean}   True iff the given fireAge is feasible under inputs.solverMode.
 */
export function evaluateFeasibility({ inputs, fireAge, helpers }): boolean
```

**Logic** (from feature 001's U2B-4a attempt, re-applied):
- Call `runLifecycle({inputs, fireAge, helpers})`.
- If any record has `feasible: false` → return `false` (per-year gate).
- If `inputs.solverMode === 'safe'`: check `bufferUnlockMultiple × annualSpendReal`
  against `totalReal` at age 60 AND `bufferSSMultiple × annualSpendReal` against
  `totalReal` at `ssStartAgePrimary`. Either gate fails → `false`.
- Otherwise → `true`.

**Purity**: module-boundaries meta-test enforces.

**Unit test**: one new test block in `tests/unit/fireCalculator.test.js`
covering: (a) feasible + buffers met → true; (b) feasible + buffer short →
false (Safe only); (c) any per-year infeasible → false; (d) DWZ ignores buffer.

---

## 3. Shim return-shape mappings (non-entities; reference)

Not new objects — just how the three shim functions translate between canonical
`FireSolverResult` (feature 001 §4) and the inline return shapes the ~10 call
sites consume.

### `yearsToFIRE(inp) → number`

```js
function yearsToFIRE(inp) {
  try {
    const canonical = getCanonicalInputs(inp);
    const r = window._solveFireAge(canonical);
    return r.yearsToFire;
  } catch (err) {
    console.error('[yearsToFIRE shim] canonical threw:', err, { inp });
    return NaN;
  }
}
```

### `findFireAgeNumerical(inp, annualSpend, mode) → {years, months, endBalance, sim, feasible}`

```js
function findFireAgeNumerical(inp, annualSpend, mode) {
  try {
    const canonical = getCanonicalInputs(inp);
    // Override-aware: annualSpend / mode args trump inp's values if present.
    if (annualSpend !== undefined) canonical.annualSpendReal = annualSpend;
    if (mode !== undefined)       canonical.solverMode = mode;
    const r = window._solveFireAge(canonical);
    return {
      years: r.yearsToFire,
      months: r.yearsToFire * 12,     // fractional-months omitted in shim; consumers don't use
      endBalance: r.endBalanceEffReal ?? r.endBalanceReal,
      sim: r.lifecycle,
      feasible: r.feasible,
    };
  } catch (err) {
    console.error('[findFireAgeNumerical shim] canonical threw:', err, { inp, annualSpend, mode });
    return { years: NaN, months: NaN, endBalance: NaN, sim: [], feasible: false };
  }
}
```

### `_evaluateFeasibilityAtAge(age) → boolean`

```js
function _evaluateFeasibilityAtAge(age) {
  try {
    const inp = getInputs();  // classic-script glue's existing form reader
    const canonical = getCanonicalInputs(inp);
    return window._evaluateFeasibility(canonical, age);
  } catch (err) {
    console.error('[_evaluateFeasibilityAtAge shim] canonical threw:', err, { age });
    return false;
  }
}
```

---

## 4. Bootstrap exposure (non-entity; reference)

Every existing `<script type="module">` block in feature 003 already exposes
`window.chartState` and `window.makeInflation`. This feature extends the
bootstrap to expose:

- `window._solveFireAge(canonical): FireSolverResult`
- `window._runLifecycle(canonical, fireAge): LifecycleRecord[]`
- `window._evaluateFeasibility(canonical, fireAge): boolean`
- `window.getCanonicalInputs(inp): Inputs` (for debug + potential external callers)
- `window._calcHelpers(inputs): HelpersBundle`

All exposures are via a SINGLE `<script type="module">` block per HTML file.
Classic-script glue reads from `window.*` after the bootstrap `CustomEvent('calc-bootstrap-ready')` fires.

---

## 5. Deletion inventory

These four inline helpers are removed from BOTH HTML files during this feature:

| Function | Deleted because |
|---|---|
| `signedLifecycleEndBalance` | shim `findFireAgeNumerical` no longer calls it; inline solver path retired |
| `taxAwareWithdraw` | only called from `signedLifecycleEndBalance` → dead |
| `isFireAgeFeasible` | only called from `findFireAgeNumerical` + `_evaluateFeasibilityAtAge` → dead |
| `_legacySimulateDrawdown` | already marked legacy; no callers |

Grep verification before deletion: zero call-site hits across both HTML files.

---

## Relationships (sketch)

```text
FIRE-Dashboard.html, FIRE-Dashboard-Generic.html
      │
      │  classic-script glue calls
      ▼
 yearsToFIRE(inp), findFireAgeNumerical(...), _evaluateFeasibilityAtAge(age)
      │
      │  (each shim wraps in try/catch; falls back to NaN/false/empty on error)
      ▼
 getCanonicalInputs(inp) ──► canonical Inputs object (frozen)
      │
      ▼
 window._solveFireAge(canonical) ──► FireSolverResult
 window._evaluateFeasibility(canonical, age) ──► boolean
      │                  │
      │                  └─► calc/fireCalculator.js::evaluateFeasibility (RESTORED)
      ▼
 chartState.setCalculated(fireAge, feasible)
      │
      ▼
 12 onChange subscribers (charts, KPI cards, banners) re-render
```

And:

```text
tests/baseline/browser-smoke.test.js
      │
      │  (was: import _prototypeGetCanonicalInputs inline)
      ▼
 import { getCanonicalInputs } from '../../calc/getCanonicalInputs.js'
      │
      ▼
 Three smoke tests (RR, Generic, parity) exercise the PRODUCTION adapter
```

---

## Validation summary

- **One new calc module** (`calc/getCanonicalInputs.js`) — pure, fenced header,
  module-boundaries meta-test applies.
- **One restored export** (`evaluateFeasibility` in `calc/fireCalculator.js`) — pure.
- **One existing test file retargeted** (`tests/baseline/browser-smoke.test.js`) —
  delete prototype, import production, assertions unchanged.
- **Two HTML files edited in lockstep** — bootstrap, `getCanonicalInputs`
  window exposure, three shim bodies, four helper deletions.
- **No changes** to: chart renderers, calc modules other than
  `fireCalculator.js`, fixtures, other tests, translation catalog, CSV.
