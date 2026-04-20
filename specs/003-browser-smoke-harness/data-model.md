# Data Model — Browser Smoke-Test Harness

**Feature**: `003-browser-smoke-harness`
**Date**: 2026-04-20

This feature introduces **no new runtime entities**. All new shapes are
test-only. This doc captures them so the implementer has a precise target.

---

## New test-only entities

### 1. `DashboardDefaults` (two instances, one per dashboard)

Legacy-shape snapshot of the HTML form's cold-load state. Two exports:
`RR_DEFAULTS` in `tests/baseline/rr-defaults.mjs` and `GENERIC_DEFAULTS` in
`tests/baseline/generic-defaults.mjs`.

Shape mirrors what the existing inline engine's `getInputs()` returns at page
load. The field set is dashboard-specific (RR has `ageRoger`, `rogerStocks`
etc.; Generic has `agePerson1`, `person1Stocks` etc.) — the snapshot files
each reflect their own dashboard's field names.

```js
/**
 * @typedef {Object} DashboardDefaults
 * Legacy inp shape as consumed by the existing inline engine at page load.
 * Fields below are representative; actual content differs per dashboard.
 *
 * @property {number} ageRoger | agePerson1    primary person's age today
 * @property {number} ageRebecca | agePerson2  secondary person's age today
 * @property {number} endAge                   simulation horizon (e.g., 95)
 *
 * @property {number} rogerStocks | person1Stocks   primary taxable stocks
 * @property {number} roger401kTrad | person1401kT  primary trad 401(k)
 * @property {number} roger401kRoth | person1401kR  primary Roth 401(k) / IRA
 * @property {number} rogerCash | person1Cash       primary cash
 *
 * @property {number} rebeccaStocks | person2Stocks  secondary taxable stocks
 * @property {number} ... repeat for person2 ...
 *
 * @property {number} returnRate          nominal annual return (decimal)
 * @property {number} inflationRate       annual inflation (decimal)
 * @property {number} monthlySavings      accumulation-phase savings ($/mo)
 * @property {number} retireSpend         real-dollar annual spend ($/yr)
 *
 * @property {string} country | scenario  country / scenario identifier
 * @property {string} fireMode            'safe' | 'exact' | 'dieWithZero'
 * @property {number} bufferUnlock        years-of-spend buffer at 401(k) unlock
 * @property {number} bufferSS            years-of-spend buffer at SS start
 * @property {number} taxTrad             trad-withdrawal tax drag (decimal)
 * @property {number} ssClaimAge          SS claim age (62..70)
 *
 * // plus mortgage / second home / college / etc. as applicable
 */
```

**Validation rules** (enforced by virtue of being frozen-object literals):
- Every field is a primitive (number / string / boolean) or undefined.
- Object is `Object.freeze()`'d on export — cannot be mutated at test time.
- File header comment records the last-sync date with the HTML.

---

### 2. `CanonicalInputs` (reused from feature 001's data-model.md §1)

Not new — this is the canonical `Inputs` shape the smoke harness produces
as the OUTPUT of the prototype adapter. Reference:
`specs/001-modular-calc-engine/data-model.md §1`.

The prototype adapter in the test file maps `DashboardDefaults → CanonicalInputs`.

---

### 3. `SmokeResult`

The value returned by `solveFireAge(canonical)` when the prototype adapter
produces a canonical shape. Reused typedef from feature 001:
`FireSolverResult` per `specs/001-modular-calc-engine/data-model.md §4`.

Fields the smoke assertions check:
- `yearsToFire: number ∈ [0, 100]`
- `fireAge: number ∈ [18, 110]`
- `feasible: boolean`
- `endBalanceReal: number, finite`
- `balanceAtUnlockReal: number, finite`
- `balanceAtSSReal: number, finite`
- `lifecycle: array of objects, non-empty`

No specific numeric values are locked (FR-005 — that's `inline-harness.test.js`'s
job). The smoke is pure type + range + presence.

---

### 4. `ParitySmokeResult`

A synthetic pair of `SmokeResult` values plus a drift report, computed once
per parity-smoke invocation:

```js
/**
 * @typedef {Object} ParitySmokeResult
 * @property {FireSolverResult} rrPath        result via the RR-path (prototype adapter + future personal-rr pass-through)
 * @property {FireSolverResult} genericPath   result via the Generic-path (prototype adapter, direct)
 * @property {string[]} divergentAllowlist    copy of fixture.divergent for reference
 * @property {string[]} drifted               field names where rrPath[f] !== genericPath[f] AND f not in divergentAllowlist
 */
```

The smoke asserts `drifted.length === 0`. On failure, the message lists
`drifted` entries and points at the fixture's `divergent[]` for remediation.

---

### 5. `CIWorkflow` (YAML, not a JS object)

Conceptually, the `.github/workflows/tests.yml` file is a CI contract.
Schema-wise it's a GitHub Actions workflow document. Documented in
`contracts/ci-workflow.contract.md`.

No runtime shape to model.

---

## Relationships (sketch)

```text
FIRE-Dashboard.html          FIRE-Dashboard-Generic.html
      │                              │
      │ (source of truth for defaults)
      ▼                              ▼
RR_DEFAULTS (frozen)         GENERIC_DEFAULTS (frozen)
      │                              │
      │  (both flow through the prototype adapter)
      ▼                              ▼
_prototypeGetCanonicalInputs() → CanonicalInputs (feature 001 shape)
      │
      ▼
solveFireAge({inputs, helpers}) → SmokeResult (FireSolverResult shape)
      │
      ├─► RR smoke assertions (type + range + presence + no-throw)
      └─► Generic smoke assertions (same set)

tests/fixtures/rr-generic-parity.js (canonical parity fixture)
      │
      │  (degenerate today; real divergence when feature 004 lands)
      ▼
_prototypeGetCanonicalInputs() × 2 → ParitySmokeResult → drift check
      │
      └─► Parity smoke assertion (drifted field list must be empty)

.github/workflows/tests.yml  (triggers on push / PR)
      │
      ▼
bash tests/runner.sh → runs all tests including the three new smokes
      │
      ▼
GitHub Actions green / red status on commit
```

---

## Validation summary

- **No new runtime entities**. Purely test-layer shapes.
- **Frozen defaults** prevent accidental mutation during test runs.
- **Re-using feature 001's typedefs** (`Inputs`, `FireSolverResult`) keeps
  the harness aligned with the canonical engine automatically — when feature
  001's shapes evolve, this harness's assertions may fail, and that's the
  intended signal.
- **Parity smoke is degenerate today** (both paths are the same
  computation) but is pre-wired so feature 004 activates real divergence
  detection without a separate harness change.
