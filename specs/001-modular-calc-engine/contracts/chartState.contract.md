# Contract: `calc/chartState.js`

**Role**: Single source of truth for interactive FIRE-age state (Principle III, FR-001).

## Inputs
None directly from consumers. Receives events from:
- `fireCalculator.js` via `setCalculated(age, feasible)`.
- User-gesture handlers in the HTML glue:
  - `setOverride(age)` after confirm-click.
  - `clearOverride()` after reset-click.

## Outputs
Exposes read-only state and a subscription API:

```js
export const chartState = {
  get state(): EffectiveFireAgeState,   // { calculatedFireAge, overrideFireAge, effectiveFireAge, source, feasible }
  setCalculated(age: number, feasible: boolean): void,   // atomically wipes any active override (FR-014)
  setOverride(age: number): void,
  clearOverride(): void,
  revalidateFeasibilityAt(age: number, feasible: boolean): void,   // updates only `feasible` without touching effectiveFireAge or overrideFireAge (FR-015)
  onChange(listener: (state) => void): () => void        // returns unsubscribe
};
```

### Method semantics

- **`setCalculated(age, feasible)`** — used by the solver on any full recalc (input
  change, scenario switch, etc.). Sets `calculatedFireAge`, wipes `overrideFireAge`,
  updates `feasible`, fires listeners once. Implements FR-014.
- **`revalidateFeasibilityAt(age, feasible)`** — used by the solver-mode-switch path
  (Safe / Exact / Die-with-Zero). Updates `state.feasible` to reflect whether the
  already-effective age (override or calculated) remains feasible under the new mode.
  MUST NOT touch `calculatedFireAge`, `overrideFireAge`, `effectiveFireAge`, or
  `source`. Fires listeners once. Implements FR-015.
- **`setOverride(age)`** — called after the user clicks the in-chart confirm control.
  Sets `overrideFireAge`, `source = 'override'`, `effectiveFireAge = age`. Fires once.
- **`clearOverride()`** — called from the Reset control. Wipes `overrideFireAge`,
  `source = 'calculated'`, `effectiveFireAge = calculatedFireAge`. Fires once.

## Consumers
- `FIRE-Dashboard.html` — every chart renderer; KPI cards; override banner; reset-control visibility; confirm-control visibility.
- `FIRE-Dashboard-Generic.html` — same set.

## Invariants
- `setCalculated` MUST always clear any active override before notifying listeners.
- `revalidateFeasibilityAt` MUST NOT change `calculatedFireAge`, `overrideFireAge`,
  `effectiveFireAge`, or `source`. Only `feasible` changes.
- `state.effectiveFireAge === state.overrideFireAge ?? state.calculatedFireAge`.
- `state.source === (state.overrideFireAge !== null ? 'override' : 'calculated')`.
- `onChange` listeners are notified synchronously in registration order, exactly once
  per mutation. Observers MUST see the transition atomically: inspecting `state`
  before and after any single mutation method yields no intermediate partial update.

## Purity
Zero DOM, zero Chart.js, zero `localStorage`, zero `window.*`. Pure JS state
management.

## Fixtures that lock this module
`tests/unit/chartState.test.js`:
1. Subscribe → `setCalculated(50, true)` → listener fires once with `{effective:50, source:'calculated'}`.
2. `setOverride(45)` → listener fires once with `{effective:45, source:'override'}`.
3. `setCalculated(51, true)` → override wiped → listener fires with `{effective:51, source:'calculated'}`. **Locks FR-014.**
4. `setOverride(45)` then `clearOverride()` → back to calculated.
5. Unsubscribe returned from `onChange` actually detaches.
6. `setOverride(45)` then `revalidateFeasibilityAt(45, false)` → state becomes
   `{effective:45, source:'override', overrideFireAge:45, feasible:false}`; override
   is preserved. **Locks FR-015.**
7. Atomic transition — between consecutive `setOverride(45)` and `setCalculated(51, true)`
   calls in the same synchronous tick, listeners see exactly two notifications, each
   with a fully consistent state snapshot. No intermediate partial state is observable.
   **Locks SC-009.**
