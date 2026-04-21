# Contract: `calc/getCanonicalInputs.js`

**Feature**: 005-canonical-public-launch | **Module classification**: Pure calc

This contract specifies the production adapter that converts the HTML's
legacy `inp` object (from `getInputs()`) into the canonical `Inputs` shape.
It replaces the prototype adapter that lived in the smoke-harness scratch
file during feature 003.

---

## Exports

### `getCanonicalInputs(inp: LegacyInp) → Readonly<Inputs>`

**Pure**: no DOM, no globals, no side effects. Subject to Principle II
strictness — module-boundaries meta-test enforces.

**Behavior contract**:

1. **Shape detection**: auto-detect RR-shape (has `inp.personB.birthDate`
   or equivalent marker) vs Generic-shape (primary-person-only or
   primary+secondary with nullable fields).
2. **Field mapping**: every field required by the canonical `Inputs`
   schema (see `specs/001-modular-calc-engine/data-model.md §1`) is
   populated from the `inp` object or computed from available fields.
3. **Secondary-person null guard**: if `inp.personB` is missing, empty, or
   has no valid `currentAge`, the returned `Inputs` MUST omit the
   `personB` sub-object entirely — not emit `{personB: undefined}` or
   `{personB: {currentAge: NaN, ...}}`.
4. **Mortgage shape pass-through**: the canonical `mortgage` sub-object is
   built from `inp.mortgage.*` directly without calling any
   `normalizeMortgageShape` helper (that helper is deleted in FR-025).
5. **Freeze**: `Object.freeze()` the returned object at the top level.
   Downstream consumers treat as read-only by convention; deep-freeze not
   required.
6. **Error channel**: on unrecoverable missing field, throw
   `new Error('[getCanonicalInputs] missing required field: <name>')`.

### Required-field list (minimum)

- Primary person: `currentAge`, `portfolioBalance`, `monthlyIncome`,
  `monthlySpend`, `desiredFireAge` (or equivalent canonical slug).
- Any of the above missing → throw.
- Inflation/tax/mortgage/SS/healthcare sub-objects: defaults applied if
  missing (documented in module docstring).

---

## Integration points

### HTML bootstrap (both dashboards, lockstep)

```html
<script type="module">
  import { getCanonicalInputs } from './calc/getCanonicalInputs.js';
  window.getCanonicalInputs = getCanonicalInputs;
</script>
```

Existing `recalcAll()` (or equivalent) calls `getCanonicalInputs(getInputs())`
once per recompute, passes the frozen result to `solveFireAge`,
`evaluateFeasibility`, `runLifecycle`, etc.

### Smoke harness

`tests/baseline/browser-smoke.test.js` imports from the production module:

```js
import { getCanonicalInputs } from '../../calc/getCanonicalInputs.js';
```

Any prototype-adapter definition inside the smoke test is DELETED (FR-007).
The three existing assertions (no-throw + valid shape on RR + Generic
defaults) continue to pass without change.

---

## Invariants

- **Deterministic**: same `inp` → same `Inputs` (no `Date.now()`,
  `Math.random()`, no reading of `localStorage`).
- **Idempotent**: `getCanonicalInputs(getCanonicalInputs(inp))` is NOT
  called in practice, but the module documents that re-adapting a frozen
  canonical `Inputs` is unsupported (would throw on access to
  legacy-only fields). Consumers pass raw legacy `inp` exactly once.
- **No top-level side effects**.
- **Frozen output**: consumers may treat the returned object as
  `Readonly<Inputs>`.

---

## Test requirements

Covered by the existing smoke harness (`tests/baseline/browser-smoke.test.js`)
retargeted to this module. No new unit-test file is strictly required, but
Backend Engineer MAY add `tests/unit/getCanonicalInputs.test.js` if edge
cases demand dedicated coverage.

Expected smoke assertions (unchanged from feature 003):

1. `getCanonicalInputs(RR_DEFAULTS)` returns without throwing.
2. `getCanonicalInputs(GENERIC_DEFAULTS)` returns without throwing.
3. Both returns match the canonical `Inputs` shape (checked via a shape
   validator already present in the harness).
