# Contract: `calc/shims.js`

**Feature**: 005-canonical-public-launch | **Module classification**: Glue layer

This contract specifies the Node-importable shim module that wraps canonical
calc-engine calls with `try/catch` + documented fallbacks + prefix logging.
It is the central deliverable of US1 and the close-out of feature 004's gap.

---

## Imports (in HTML files)

Both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` add:

```html
<script type="module">
  import {
    yearsToFIRE,
    findFireAgeNumerical,
    _evaluateFeasibilityAtAge,
    findMinAccessibleAtFireNumerical
  } from './calc/shims.js';

  // Expose on window so existing ~10 call sites per file continue to work
  // byte-for-byte.
  window.yearsToFIRE = yearsToFIRE;
  window.findFireAgeNumerical = findFireAgeNumerical;
  window._evaluateFeasibilityAtAge = _evaluateFeasibilityAtAge;
  window.findMinAccessibleAtFireNumerical = findMinAccessibleAtFireNumerical;

  // Example call sites (byte-for-byte parity with pre-canonical inline):
  //   yearsToFIRE(inp, effectiveSpend)
  //   findFireAgeNumerical(inp, annualSpend, fireMode)
  //   _evaluateFeasibilityAtAge(inp, effectiveSpend, fireAge, fireMode)
  //   findMinAccessibleAtFireNumerical(inp, annualSpend, fireAge, fireMode)
</script>
```

## Imports (in Node tests)

```js
import {
  yearsToFIRE,
  findFireAgeNumerical,
  _evaluateFeasibilityAtAge,
  findMinAccessibleAtFireNumerical
} from '../../calc/shims.js';
```

---

## Exports

### `yearsToFIRE(inp, annualSpend) → number`

**Calls**: `window.getCanonicalInputs(inp)` then `window._solveFireAge({inputs, helpers})`.

**Happy path**: returns `result.yearsToFire` (integer years to FIRE under the
currently-selected mode, read at call time from `window.fireMode`).

**Fallback on canonical throw**: `NaN`.

**Logs on throw**: `console.error('[yearsToFIRE] canonical threw:', err,
{annualSpend});`

---

### `findFireAgeNumerical(inp, annualSpend, mode) → FireNumericalResult`

**Shape**:
```ts
type FireNumericalResult = {
  years: number,
  months: number,
  endBalance: number,
  sim: Array<unknown>,
  feasible: boolean
};
```

**Calls**: `window.getCanonicalInputs(inp)` then
`window._solveFireAge({inputs, helpers})`. The caller-supplied `mode`
(`'safe' | 'exact' | 'dieWithZero'`) is applied to the canonical `Inputs` via
immutable spread (`{ ...inputs, solverMode: mode }`) before the solver call.

**Happy path**: returns object with real numbers + lifecycle sim + feasibility
flag. `months` is always `0` on the happy path (canonical solver works on
integer ages — preserved as a field for shape parity with pre-canonical call
sites).

**Fallback on canonical throw**:
```js
{ years: NaN, months: NaN, endBalance: NaN, sim: [], feasible: false }
```

**Logs on throw**: `console.error('[findFireAgeNumerical] canonical threw:',
err, {annualSpend, mode});`

---

### `_evaluateFeasibilityAtAge(inp, annualSpend, age, mode) → boolean`

**Calls**: `window.getCanonicalInputs(inp)` then
`window._evaluateFeasibility({inputs, fireAge, helpers})`. The caller-supplied
`mode` is applied to the canonical `Inputs` via immutable spread
(`{ ...inputs, solverMode: mode }`) before the canonical call.

**Happy path**: returns boolean feasibility for the candidate `age`.

**Fallback on canonical throw**: `false` (conservative — treat as infeasible).

**Logs on throw**: `console.error('[_evaluateFeasibilityAtAge] canonical
threw:', err, {age, mode});`

---

### `findMinAccessibleAtFireNumerical(inp, annualSpend, fireAge, mode) → number`

**Calls**: `window.getCanonicalInputs(inp)` then
`window._runLifecycle({inputs, fireAge, helpers})`. The caller-supplied `mode`
is applied to the canonical `Inputs` via immutable spread before the lifecycle
call. The shim scans the returned lifecycle for records at/after `fireAge`
and returns the minimum `totalReal`.

**Happy path**: returns numeric minimum accessible balance at/after FIRE age.

**Fallback on canonical throw**: `NaN`.

**Logs on throw**: `console.error('[findMinAccessibleAtFireNumerical]
canonical threw:', err, {fireAge, mode});`

---

## Unit test requirements

File: `tests/unit/shims.test.js`

At least 4 test cases (one per shim). Each case:

1. **Setup**: `globalThis.window = { <canonical-fn>: () => { throw new
   Error('test'); } }`.
2. **Spy**: stub `console.error` to capture calls.
3. **Act**: call the shim with minimal valid inline-shape inputs.
4. **Assert**:
   - returned value deeply equals the documented fallback (or
     `Number.isNaN(result)` for NaN cases);
   - `console.error` called exactly once;
   - first argument of that call matches `/^\[<shim-name>\] canonical
     threw:/`.
5. **Teardown**: restore `console.error`; `delete globalThis.window`.

## Happy-path coverage

Optional but encouraged: one additional test per shim where the stubbed
canonical returns a valid shape, asserting the shim translates it correctly
to the inline-shape return.

---

## Invariants

- **No top-level side effects** on module import. Reads of `window.*` happen
  ONLY inside the exported functions at call time.
- **No formulas implemented in this module.** Every shim delegates 100% to
  a canonical helper via `window.*`. If a formula creeps in, the shim
  crosses the line from glue to calc and violates Principle II.
- **Fallback values are stable contract** — changing a fallback value (e.g.,
  `NaN` → `0`) requires a spec update and consumer-site review.
- **Prefix strings match export names exactly.** Useful for filtering
  browser console output when diagnosing shim-triggered regressions.

---

## Consumer inventory

Call sites in HTML (preserved byte-for-byte):

- `FIRE-Dashboard.html`: ~10 call sites across `recalcAll`, `updateKpis`,
  `evaluateScenario`, drag handlers.
- `FIRE-Dashboard-Generic.html`: same ~10 call sites (lockstep).

Each call site continues to use the window-exposed name (`yearsToFIRE(...)`,
etc.) — zero call-site edits required by this feature.
