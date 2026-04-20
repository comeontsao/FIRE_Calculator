# Contract: Inline-Solver Shim Functions

**Role**: Three functions in both HTML files, preserving their ORIGINAL
signatures and return shapes, internally calling the canonical engine via the
bootstrap-exposed `window._*` functions. Every caller (including `recalcAll`)
routes through these shims — no call-site edits (FR-015 Option A).

All three shims use defense-in-depth `try/catch` with documented safe fallbacks.

---

## Shim 1: `yearsToFIRE(inp) → number`

### Original signature (preserved)

```js
function yearsToFIRE(inp: Object): number
```

Returns the integer number of years from the primary person's current age to
their FIRE age. Roughly: `canonical.yearsToFire`.

### New body

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

### Invariants

- Return type: always `number` (either a real year count or `NaN` on error).
- Idempotent for same `inp` when canonical doesn't throw.
- Callers expecting `> 0` see false on NaN; callers doing arithmetic see NaN
  propagate.

### Fallback behavior

`NaN`. Every downstream panel on the dashboard handles `NaN` either via
`isFinite` check or by rendering `—` in the KPI card.

---

## Shim 2: `findFireAgeNumerical(inp, annualSpend, mode) → object`

### Original signature (preserved)

```js
function findFireAgeNumerical(inp: Object, annualSpend?: number, mode?: string): {
  years: number,
  months: number,
  endBalance: number,
  sim: LifecycleRecord[],    // inline-shape lifecycle (may differ in field names)
  feasible: boolean,
}
```

Returns the solver's full result in the inline shape. ~10 call sites across
both HTML files consume this (mortgage verdict, scenario delta, what-if,
etc.). Field-name preservation is critical.

### New body

```js
function findFireAgeNumerical(inp, annualSpend, mode) {
  try {
    const canonical = getCanonicalInputs(inp);
    if (annualSpend !== undefined) canonical.annualSpendReal = annualSpend;
    if (mode !== undefined)       canonical.solverMode = mode;
    const r = window._solveFireAge(canonical);
    return {
      years: r.yearsToFire,
      months: r.yearsToFire * 12,
      endBalance: r.endBalanceEffReal ?? r.endBalanceReal,  // prefer effBal for inline-parity
      sim: r.lifecycle,
      feasible: r.feasible,
    };
  } catch (err) {
    console.error('[findFireAgeNumerical shim] canonical threw:', err, { inp, annualSpend, mode });
    return { years: NaN, months: NaN, endBalance: NaN, sim: [], feasible: false };
  }
}
```

### Invariants

- Return object SHAPE always has `{years, months, endBalance, sim, feasible}`
  — no additional fields added (adding fields risks confusing the existing
  call-site code that iterates keys).
- `sim` is the canonical `lifecycle` array verbatim — the canonical
  `LifecycleRecord` shape has MORE fields than the inline shape, but chart
  renderers that consume `sim` today only read the fields both shapes share
  (`phase`, `totalReal` / `total`, pool balances). If a chart renderer reads a
  field canonical doesn't emit, that's a US-space bug to track separately —
  NOT fixed in this feature (U2B-4b scope).
- `endBalance` is `effBalReal` when present (post-tax-drag; matches inline's
  display convention per feature 001's effBal layer); falls back to raw
  `endBalanceReal` if `effBalReal` is absent.

### Fallback behavior

`{years: NaN, months: NaN, endBalance: NaN, sim: [], feasible: false}`. Every
downstream:
- Chart renderers iterating an empty `sim` render an empty chart (safe; they
  always null-guard).
- Feasibility banners check `feasible: false` → activate infeasibility UI.
- KPI cards reading `years * N` propagate NaN → display `—`.

---

## Shim 3: `_evaluateFeasibilityAtAge(age) → boolean`

### Original signature (preserved)

```js
function _evaluateFeasibilityAtAge(age: number): boolean
```

Returns true iff the dashboard's current inputs, with `fireAge` set to `age`,
would be feasible under the current solver mode. Used by the drag-preview
code and the override-gate in the UI.

### New body

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

### Invariants

- Return: strict boolean.
- Reads current input via existing `getInputs()` classic-script helper (already
  present in both HTML files); passes through `getCanonicalInputs` adapter.

### Fallback behavior

`false`. Callers treat "unknown feasibility" as "not feasible" — safe default
that activates the override-infeasibility warning and causes the drag preview
to show a warning color, which is the correct user-visible behavior on an
unknown condition.

---

## General shim requirements

- **Try/catch is MANDATORY** in every shim. This is the primary defense
  against the U2B-4a failure class (canonical throw → dashboard freeze).
- **`console.error` logs** MUST include a shim-name prefix so a future
  debugger can grep the browser console.
- **Fallback values are documented in each shim's body** as a top comment so
  a future editor doesn't accidentally change them to `undefined` or `null`.
- **No new fields** in return shapes — adding fields breaks the "preserve
  original signature" contract.

---

## Acceptance

- All three shim bodies match the examples above (or equivalent structure).
- Every shim has its `try/catch`. A temporary test — throw inside canonical —
  produces a named `console.error` and a fallback return, NOT a dashboard
  freeze.
- No existing call site of any shim is edited in this feature.
- Running the feature 003 smoke harness exercises all three shims indirectly
  (via the production adapter) without throws under canonical RR + Generic
  defaults.

## Fixtures / tests that lock these shims

Primary gate: feature 003's smoke harness.

Optional additional unit tests in `tests/unit/html-shims.test.js` (NOT
required by this feature; can be deferred):
1. `yearsToFIRE(RR_DEFAULTS)` returns a finite positive number.
2. Simulate a canonical-throw scenario: mock `window._solveFireAge` to throw;
   confirm shim returns `NaN`, `console.error` called with prefix.
3. Same for `findFireAgeNumerical` return-shape fallback.
4. Same for `_evaluateFeasibilityAtAge`.

These unit tests would require a way to stub `window` in Node; skip them if
the plumbing is too invasive. The smoke harness + manual browser check are
sufficient gates.
