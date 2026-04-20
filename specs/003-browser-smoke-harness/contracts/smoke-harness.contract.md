# Contract: Browser Smoke Harness

**File**: `tests/baseline/browser-smoke.test.js`
**Feature**: `003-browser-smoke-harness`

This feature adds exactly three named tests to a new harness file. The tests
run on every `bash tests/runner.sh` invocation locally and on every GitHub
Actions run.

---

## Test 1 — RR cold-load smoke

### Purpose
Prove the canonical calc engine can consume the RR dashboard's cold-load
default values (through a prototype adapter) without throwing, and returns a
`FireSolverResult` with every field present and correctly typed.

### Setup
- Import `RR_DEFAULTS` from `tests/baseline/rr-defaults.mjs`.
- Import the prototype `_prototypeGetCanonicalInputs` from within the test
  file (or an inline helper at the top of the test file).
- Import `solveFireAge` from `calc/fireCalculator.js`.
- Import `makeInflation` and the other helper factories from their
  respective `calc/*.js` modules to build the helpers bundle.

### Assertions
1. `_prototypeGetCanonicalInputs(RR_DEFAULTS)` returns without throwing.
2. `solveFireAge({ inputs: canonical, helpers })` returns without throwing.
3. Result has `typeof result.fireAge === 'number'`.
4. Result has `typeof result.yearsToFire === 'number'`.
5. Result has `typeof result.feasible === 'boolean'`.
6. Result has `typeof result.endBalanceReal === 'number'` and
   `Number.isFinite(result.endBalanceReal)`.
7. Same finite-number check for `balanceAtUnlockReal`, `balanceAtSSReal`.
8. Result has `Array.isArray(result.lifecycle)` and `result.lifecycle.length > 0`.
9. Range check: `result.fireAge >= 18 && result.fireAge <= 110`.
10. Range check: `result.yearsToFire >= 0 && result.yearsToFire <= 100`.

### Failure messages
Each assertion carries a custom message naming the specific field or
condition that failed. Example:

```
RR smoke: FireSolverResult.fireAge should be a number in [18, 110];
got fireAge = undefined (type undefined).
Check prototype adapter output and canonical engine's solveFireAge return shape.
```

---

## Test 2 — Generic cold-load smoke

### Purpose
Identical to Test 1, but with `GENERIC_DEFAULTS` from
`tests/baseline/generic-defaults.mjs`.

### Assertions
Same 10 checks as Test 1.

### Failure messages
Same convention, prefixed `Generic smoke:` instead of `RR smoke:`.

---

## Test 3 — Parity smoke

### Purpose
Lock the invariant that RR-path and Generic-path canonical outputs match on
every non-`divergent` field. Today degenerate (both paths identical); activates
real drift detection when feature 004 lands a real `personal-rr.js` adapter.

### Setup
- Import the parity fixture from `tests/fixtures/rr-generic-parity.js`.
- Call `_prototypeGetCanonicalInputs(fixture.inputs)` twice — once as "RR
  path" (future: apply `personal-rr.js` passthrough), once as "Generic
  path" (direct).
- Run `solveFireAge` on each → `resultA`, `resultB`.

### Assertions
1. For every field of `FireSolverResult` NOT listed in `fixture.divergent`:
   - `assert.deepStrictEqual(resultA[field], resultB[field], msg)`
2. Maintain a fixed whitelist of `FireSolverResult` fields to compare:
   - `yearsToFire`, `fireAge`, `feasible`, `endBalanceReal`,
     `balanceAtUnlockReal`, `balanceAtSSReal`
   - NOT `lifecycle` — too large for byte-identity; feature 004 can add
     per-record parity if needed.

### Failure messages

```
Parity smoke: field '<field>' drifted between RR-path and Generic-path.
  rrPath:     <value>
  genericPath: <value>
Either: (1) update the RR-path adapter to align, OR (2) add '<field>'
to tests/fixtures/rr-generic-parity.js `divergent[]` with a comment
explaining the legitimate divergence.
```

---

## Prototype adapter `_prototypeGetCanonicalInputs(inp)`

### Purpose
Translate legacy `inp` shape (dashboard form state) into the canonical
`Inputs` shape per `specs/001-modular-calc-engine/data-model.md §1`. This
prototype lives in the test file; feature 004 replaces it with a production
adapter inside the HTML.

### Input
Any object in the legacy `inp` shape (`RR_DEFAULTS`, `GENERIC_DEFAULTS`, or
the parity fixture's `inputs`).

### Output
A canonical `Inputs` object that passes the canonical engine's entry
validation (`currentAgePrimary ∈ [18, endAge)`, `annualSpendReal > 0`,
return rates in sanity bounds, portfolio values ≥ 0, etc.).

### Mapping rules
- Age: RR uses `inp.ageRoger`; Generic uses `inp.agePerson1` — prototype
  accepts either (`inp.ageRoger ?? inp.agePerson1`).
- Portfolios: sum per-person fields into `portfolioPrimary` /
  `portfolioSecondary` records; null-guard undefined fields.
- Contributions: sum monthlySavings if broken down per account, else use
  the single total.
- Scenario / tax / buffers / SS: pass through with straightforward
  renames (`inp.country → scenario.country`, etc.).
- Missing or ambiguous fields: the prototype picks the most reasonable
  default and adds an inline comment explaining. If a field cannot be
  mapped at all, the canonical engine's validation throws and the smoke
  fails with an actionable message.

### Purity
Pure function: no DOM, no globals, no mutation of input. Output is a
new object.

### Marking as temporary
The function begins with a block comment:

```js
/*
 * TEMPORARY — feature 003 (browser smoke harness) prototype.
 * Feature 004 will replace calls to this with a production
 * getCanonicalInputs() inside each HTML file's module bootstrap.
 * Track: specs/003-browser-smoke-harness/ and BACKLOG.md F2.
 */
```

---

## What this contract does NOT cover

- Specific numeric values from any smoke run — FR-005 explicitly.
- Lifecycle-array byte-identity in parity — too expensive; feature 004 adds
  if needed.
- Post-drag / post-override canonical state — cold-load only per FR-014.
- The `_prototypeGetCanonicalInputs` function's INTERNAL correctness —
  it's tested implicitly: if its output causes `solveFireAge` to throw,
  the smoke catches it. No standalone adapter tests.

---

## Acceptance

- All three tests exist in `tests/baseline/browser-smoke.test.js`.
- All three PASS after the harness lands.
- `bash tests/runner.sh` total count ticks from 77 to 80.
- Total runner wall-clock stays under 10 seconds (SC-003).
- Failure messages are actionable — an independent reviewer can diagnose
  a contrived failure in under 30 seconds of reading (SC-005).
