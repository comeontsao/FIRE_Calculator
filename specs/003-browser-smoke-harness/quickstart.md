# Quickstart — Browser Smoke-Test Harness

**Feature**: `003-browser-smoke-harness`
**Target verification time**: under 5 minutes locally.

This feature is infrastructure — no browser steps, no user-facing UI changes.
Verification is a sequence of terminal commands plus one GitHub check.

---

## Prerequisites

- Node 20+ (`node --version`).
- Bash or Git Bash (any environment where `tests/runner.sh` works today).

---

## Step 1 — Run the full test suite locally

```bash
bash tests/runner.sh
```

**Expected**:
- Runner total ticks from 77 (pre-feature) to **80** (three new smokes: RR,
  Generic, parity).
- All 80 tests GREEN. Zero failures.
- Wall-clock under 10 seconds.

**If fail**:
- Any of the three new smokes RED: read the failure message — it names
  the offending field and condition. Most common cause during feature 003's
  own development: the prototype adapter omitted a field the canonical
  engine requires.
- An existing test RED: did you accidentally touch a calc module?
  `git diff main -- calc/` should be empty. The harness feature changes
  no runtime files.

---

## Step 2 — Verify the three new smokes exist and are named clearly

```bash
grep -E "^test\(" tests/baseline/browser-smoke.test.js
```

**Expected output** (names can vary slightly; structure must match):
```
test('RR cold-load smoke: canonical solveFireAge returns sane shape', ...
test('Generic cold-load smoke: canonical solveFireAge returns sane shape', ...
test('Parity smoke: RR-path and Generic-path outputs match on non-divergent fields', ...
```

---

## Step 3 — Verify contrived-failure diagnostic quality

Deliberately break the prototype adapter to confirm failure messages are
actionable (SC-005). In `tests/baseline/browser-smoke.test.js`, find
`_prototypeGetCanonicalInputs` and temporarily set a required canonical
field to `undefined`:

```js
return Object.freeze({
  currentAgePrimary: undefined,  // temporarily break
  // ...
});
```

Run `bash tests/runner.sh`. **Expected**: the RR smoke fails with a message
that names `currentAgePrimary` (or whatever field you broke). A developer
reading the failure should identify the fix in under 30 seconds.

**Revert** your temporary break before continuing.

---

## Step 4 — Verify CI workflow syntax

```bash
cat .github/workflows/tests.yml
```

Check that:
- File exists at `.github/workflows/tests.yml`.
- Triggers include both `push:` (any branch) and `pull_request:` (targeting main).
- Runs on `ubuntu-latest` with Node `'20'`.
- Single meaningful step: `bash tests/runner.sh`.
- NO `npm install`, NO matrix, NO caching step.

---

## Step 5 — Verify zero-dependency discipline

```bash
git status --short
```

**Expected**: no `package.json`, no `node_modules/`, no `.nvmrc` introduced
by this feature. Only the four new files the feature adds (two defaults
`.mjs`, one `.test.js`, one `.yml`) plus any doc updates.

```bash
ls package.json node_modules 2>&1
```

**Expected**: both absent.

---

## Step 6 — Push to GitHub and observe CI

1. Commit your feature-003 branch.
2. Push to origin.
3. Open the repo on GitHub; navigate to the Actions tab.
4. **Expected**: a new run named "Tests" appears within ~30 seconds of push.
5. The run completes in under 5 minutes with a green checkmark.
6. The commit on the branch-head view shows the green ✅ status indicator.

Repeat with a PR: open a PR against `main` from the feature branch.
Confirm the same status check appears on the PR conversation view.

---

## Step 7 — Verify prototype-adapter marking

```bash
grep -n "TEMPORARY" tests/baseline/browser-smoke.test.js
```

**Expected**: at least one match, pointing at the `_prototypeGetCanonicalInputs`
block comment. Future-you (or feature 004) grep for this to locate the
scaffold to replace.

---

## Step 8 — Confirm parity smoke behavior is degenerate-today, alive-tomorrow

The parity smoke today runs the same fixture through the same adapter twice.
It should pass trivially (no divergence possible when both paths are
identical). Verify:

```bash
# Find the parity test and read its body to confirm the wiring.
grep -A 30 "Parity smoke" tests/baseline/browser-smoke.test.js
```

Look for:
- Two calls to `_prototypeGetCanonicalInputs(...)` — one labeled RR-path, one Generic-path.
- A TODO / comment noting that the RR-path will diverge when feature 004
  lands a real `personal-rr.js` adapter.

---

## If anything fails

- Don't ship. Diagnose using `research.md §R5` (failure-message quality).
- If a smoke fails for a reason unrelated to the smoke's own correctness
  (e.g., the canonical engine really does have a bug exposed by real
  defaults), that's the exact value proposition of this feature — fix the
  canonical engine's issue, rerun.
- If CI fails but local passes: the differential is the GitHub runner
  environment. Check Node version, bash version, line endings (`.gitattributes`
  should handle this already).
