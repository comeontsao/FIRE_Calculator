# Contract: `calc/getCanonicalInputs.js`

**Role**: Single production adapter mapping the dashboards' legacy `inp` shape
to the canonical `Inputs` shape. Replaces feature 003's temporary
`_prototypeGetCanonicalInputs` inside the smoke test file.

## Inputs
```js
getCanonicalInputs(inp: Object) → Inputs
```

Accepts either RR-shape (`inp.ageRoger`, `inp.rogerStocks`, etc.) or
Generic-shape (`inp.agePerson1`, `inp.person1Stocks`, etc.). Auto-detects via
the presence of fields.

## Outputs

`Inputs` object per `specs/001-modular-calc-engine/data-model.md §1`.
`Object.freeze()`'d before return. Every required field populated; optional
fields present only when source data exists; every secondary-person field
null-guarded.

## Consumers

- `FIRE-Dashboard.html` — imports via `<script type="module">` bootstrap; exposes on `window.getCanonicalInputs`.
- `FIRE-Dashboard-Generic.html` — same.
- `tests/baseline/browser-smoke.test.js` — direct ES-module import.

## Invariants

- **Purity**: no DOM, no Chart.js, no `window`, no `localStorage`, no `navigator`.
  Module-boundaries meta-test enforces.
- **Idempotent**: calling with the same `inp` returns equal output (structural).
- **Frozen output**: `Object.isFrozen(result) === true`.
- **No mutation**: `inp` is not modified.
- **Null-safe**: missing secondary-person fields do not throw; they
  null-guard to `undefined` (not zero — zero would be a valid "has $0 cash"
  value and lie to the solver).
- **Scenario lookup**: the scenario table used here MUST match what the
  existing inline engine's scenario code uses. Initial implementation can
  copy the scenario constants inline; future refactor can extract to a shared
  scenario module.
- **Return rate convention**: `returnRateReal = inp.returnRate`; `inflationRate
  = inp.inflationRate`. No division, no inflation adjustment applied here —
  the dashboard's slider values are already real per the feature 002 B1 audit.
- **Age convention**: `Math.floor` applied to any fractional birthdate-derived
  age, matching feature 003's defaults-snapshot convention.

## Error handling

Throws `Error("getCanonicalInputs: <field> missing/invalid — cannot map")` if
a REQUIRED canonical field cannot be derived from `inp`. Shim callers in the
HTML wrap this in try/catch per research §R3.

Does NOT throw for optional missing fields; they become `undefined` in the
output.

## Fixtures that lock this module

1. `tests/baseline/rr-defaults.mjs` — full RR cold-load shape. Expected: no
   throw; result passes `solveFireAge` validation; no `NaN` in required
   numeric fields.
2. `tests/baseline/generic-defaults.mjs` — full Generic cold-load shape.
   Same expectations. Particularly check that single-person Generic (with
   `person2*` all zero/missing) produces valid output without throwing on
   null-guards.
3. `tests/fixtures/rr-generic-parity.js` — canonical parity fixture. Result
   should be byte-equal to the fixture's `inputs` object (since the fixture
   IS already in canonical shape; adapter should be an identity map in this
   case — verify by deep-equal).
4. Single deliberate break-case: setting `inp.ageRoger = undefined` AND
   `inp.agePerson1 = undefined` throws the named error. Included as a unit
   test (not as a smoke case, since the smoke uses valid input).

## Acceptance

- Module file exists at `calc/getCanonicalInputs.js` with full fenced header.
- Three smoke tests in `browser-smoke.test.js` pass after retarget (US3).
- Module-boundaries meta-test GREEN.
- `tests/unit/` does NOT get a new `getCanonicalInputs.test.js` (the smoke
  harness is the functional test; module-boundaries meta-test is the purity
  test). Adding unit tests is optional polish.
