# Phase 0 Research — Browser Smoke-Test Harness

**Feature**: `003-browser-smoke-harness`
**Date**: 2026-04-20
**Purpose**: Lock the design decisions the implementer will hit in Phase 3.
Scope is narrow (infrastructure addition), so this doc is brief.

---

## R1. Prototype `getCanonicalInputs()` adapter — inline, temporary, documented

**Decision**: Define a small `_prototypeGetCanonicalInputs(inp)` function INSIDE
`tests/baseline/browser-smoke.test.js`. Do NOT add a real adapter to the HTML
in this feature; do NOT import from a not-yet-created `getCanonicalInputs.js`
module.

**Rationale**:
- This feature's job is to **validate the pathway**, not to **build the
  pathway**. Feature 004 builds the real `getCanonicalInputs()` inside the
  HTML's module bootstrap.
- A small inline prototype proves the pattern works on real default values.
  When feature 004 lands its production adapter, the first task of that
  feature is: "replace `_prototypeGetCanonicalInputs` with a call to the real
  adapter; delete the prototype." Seven-minute task.
- Keeping it inside the test file means zero cross-feature file dependencies.
  If feature 004 never lands, this harness still has value (sanity-checks the
  canonical engine's stability on realistic inputs).
- The prototype is marked clearly at the top of the file: `// TEMPORARY —
  replace with production getCanonicalInputs() in feature 004. See BACKLOG
  item F2.`

**Alternatives considered**:
- Build the real `getCanonicalInputs()` now in this feature — rejected.
  That's feature 004's core work; doing it here blurs feature boundaries and
  risks re-creating the U2B-4a failure mode (real wire-up without the smoke
  having caught it first).
- Skip the adapter entirely and feed the defaults DIRECTLY into
  `solveFireAge` — rejected. The defaults are in the **legacy `inp` shape**,
  not the canonical `Inputs` shape. Feeding legacy shape into canonical
  engine throws, which is exactly what the smoke would catch — but it would
  catch the WRONG thing (shape mismatch at the input layer instead of the
  adapter layer), which isn't what feature 004 will hit.
- Extract a shared `_prototypeGetCanonicalInputs` into a separate file —
  rejected. One-file-per-feature is cleaner for a temporary scaffold.

---

## R2. Defaults snapshots — structure and update convention

**Decision**: Two ES-module files exporting a single frozen default:

```js
// tests/baseline/rr-defaults.mjs
/*
 * Hardcoded cold-load defaults for FIRE-Dashboard.html (RR version).
 * Mirrors the legacy `inp` shape the inline engine consumes at page load.
 *
 * SOURCE OF TRUTH: these values mirror the `<input value="X">` attributes
 * and JS-computed defaults in FIRE-Dashboard.html as of the last-sync date
 * below. When the HTML form defaults change:
 *   1. Edit the HTML.
 *   2. Run `bash tests/runner.sh`.
 *   3. If browser-smoke.test.js fails with a canonical-validation error,
 *      update the offending field in THIS file.
 *   4. If the smoke still passes (default changed but produces valid
 *      canonical shape), update this file anyway and bump last-sync date.
 *
 * Last synced: 2026-04-20
 */
export default Object.freeze({
  // ... legacy inp shape ...
});
```

Same structure for `generic-defaults.mjs`. Both files are short (~50-100
lines of field assignments).

**Rationale**:
- Frozen exports prevent accidental mutation during tests.
- Header comment makes the update procedure self-documenting.
- ES-module export keeps consistency with the rest of the test infra.
- One-file-per-dashboard keeps the diff clean when only one dashboard's
  defaults change.

**Alternatives considered**:
- JSON files — rejected; can't carry comments, can't carry the update procedure.
- A single combined `defaults.mjs` exporting both — rejected; makes per-dashboard edits noisier.

---

## R3. Parity smoke — what "RR-path" and "Generic-path" mean today

**Decision**: Today, before feature 004 exists, "RR-path" and "Generic-path"
both produce canonical `Inputs` via the same prototype adapter — the ONLY
difference is which defaults file they start from. When feature 004 lands,
the RR-path gets extended with `personal-rr.js`'s adapter call; the
Generic-path stays direct.

For THIS feature's parity smoke:
1. Load `tests/fixtures/rr-generic-parity.js` — the canonical parity fixture.
2. Run its `inputs` through `solveFireAge` once → `resultA`.
3. Run its `inputs` through `solveFireAge` a second time → `resultB`.
4. For every field of `FireSolverResult` NOT in `fixture.divergent[]`,
   assert `resultA[field] === resultB[field]` (deep equality for objects
   and arrays).

**Rationale**:
- Today, both paths are literally the same computation. The parity smoke is
  a **degenerate no-op** for now — `resultA` and `resultB` will always match
  because they're computed identically.
- That's fine. The parity smoke's JOB is to **lock the equivalence** so when
  feature 004 introduces real RR-path divergence via `personal-rr.js`, the
  smoke starts doing real work AT THAT MOMENT with zero code changes in this
  feature's harness.
- The assertion uses deep equality (`assert.deepStrictEqual`) not byte-
  identity, so floating-point noise at the same order-of-magnitude passes.
- When feature 004 lands its real RR-path adapter, the smoke either: (a)
  continues to pass because adapter is a no-op for Generic inputs, or (b)
  fails with a drift message identifying the drifted field — the intended
  signal.

**Alternatives considered**:
- Build a fake "RR-path" that applies a known-different transformation
  just to make the parity smoke non-degenerate today — rejected.
  Contrived; no real information.
- Skip the parity smoke until feature 004 lands — rejected. Shipping the
  empty shell now means feature 004 doesn't have to think about it; it just
  writes the real adapter and the smoke activates.
- Wait for `personal/personal-rr.js` to exist before building the parity
  smoke — rejected. `personal-rr.js` is deferred to feature 005; the parity
  smoke would wait even longer. Better to ship the scaffold now.

---

## R4. GitHub Actions workflow shape — minimal, readable, stable

**Decision**: One workflow file, `.github/workflows/tests.yml`. Structure:

```yaml
name: Tests

on:
  push:
    branches: ['**']   # every branch
  pull_request:
    branches: [main]   # PRs targeting main

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Run tests
        run: bash tests/runner.sh
```

**Rationale**:
- Minimal is best. 14 lines of YAML. No caching, no matrix, no secrets, no
  conditional steps.
- `actions/checkout@v4` and `actions/setup-node@v4` are pinned by major
  version — stable enough that we won't need to update frequently, flexible
  enough to pick up security patches automatically.
- No `npm install` step → no `package.json` → Principle V preserved.
  `bash tests/runner.sh` is the only meaningful command.
- Ubuntu-latest + Node 20 matches the local developer assumption. If we
  add macOS or Windows later, it's a one-line matrix addition.
- Trigger on every push to every branch gives maximum coverage; the PR
  trigger ensures the `main` gate works even if a contributor bypasses
  per-branch runs.

**Alternatives considered**:
- Matrix across Node 18, 20, 22 — rejected for now. Overengineering for a
  single-Node-version project. Add when the test surface justifies it.
- Matrix across OSes — rejected. Local dev happens on multiple OSes; CI's
  job is "does it work at all", not "does it work everywhere".
- Add caching step (`actions/cache` on Node modules) — rejected. There are
  no modules to cache. Would add noise for zero benefit.
- Run on every push to any branch BUT block merge via branch protection —
  out of scope for this feature. Branch protection is a repo-admin action,
  separate from the workflow file. Documented as assumption.

---

## R5. Failure-message discipline

**Decision**: Every assertion in the smoke harness uses a custom message that
names the specific field or condition that failed. No bare
`assert.strictEqual(result.fireAge, 'number')` — instead:

```js
assert.strictEqual(
  typeof result.fireAge,
  'number',
  `RR smoke: FireSolverResult.fireAge should be a number; got ${typeof result.fireAge} = ${JSON.stringify(result.fireAge)}`
);
```

**Rationale**:
- SC-005 requires a developer to diagnose a canonical-engine shape change
  in under 30 seconds. Message quality is the single biggest factor in that.
- The runner-output wall of green/red is searchable; a message that names
  the field makes `grep` the diagnosis tool.
- Overhead is ~5 characters of typing per assertion. Trivial.

**Alternatives considered**:
- Rely on default assertion messages — rejected. "Expected 'undefined' to
  equal 'number'" gives zero context about which field failed.
- Wrap assertions in a helper that auto-generates messages — overengineering.
  Inline strings are clearer and the harness is small.

---

## R6. Scope NOT in this feature (explicit)

Listed so the implementer doesn't accidentally expand scope:

- **Real `getCanonicalInputs()` in the HTML** — feature 004.
- **`personal/personal-rr.js`** — feature 005.
- **Locking specific numeric outputs** — that's `inline-harness.test.js`'s job.
- **Post-drag / post-override state testing** — drag is visual; this
  harness is cold-load only.
- **Non-English locale defaults** — English locale only.
- **Browser automation** — no Playwright, no jsdom. FR-014 explicit.
- **GitHub branch protection** — repo-admin action, not a workflow file.
- **Multi-Node or multi-OS CI matrix** — defer until justified.

---

## Summary of decisions

| ID | Area | Decision |
|---|---|---|
| R1 | Adapter prototype | Inline `_prototypeGetCanonicalInputs` in test file; marked temporary; feature 004 replaces |
| R2 | Defaults snapshots | One frozen `.mjs` per dashboard, with header documenting update procedure |
| R3 | Parity smoke semantics | Today degenerate (same path twice); feature 004 activates real RR-path divergence without harness changes |
| R4 | CI workflow | Minimal 14-line YAML; ubuntu-latest + Node 20; push-all-branches + PR-to-main triggers |
| R5 | Failure messages | Every assertion names the specific field/condition — SC-005 diagnostic time budget |
| R6 | Out-of-scope | No real adapter, no personal-rr, no number locking, no drag states, no browser automation, no branch protection, no matrix CI |

All `NEEDS CLARIFICATION` items from Technical Context are resolved. Ready
for Phase 1.
