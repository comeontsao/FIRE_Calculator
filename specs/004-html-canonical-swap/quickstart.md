# Quickstart — HTML Canonical-Engine Swap

**Feature**: `004-html-canonical-swap`
**Target verification time**: ~10 minutes (most of it local browser check).

This feature touches the runtime dashboards. The feature 003 smoke harness
catches automated failures; this quickstart verifies the user-visible
behavior.

---

## Prerequisites

- Node 20+ (`node --version`).
- Modern browser (Chromium / Firefox / Safari, last two majors).
- Git remote access (for the CI verification step).

---

## Step 1 — Test runner locally

```bash
bash tests/runner.sh
```

**Expected**: 80 tests (or 81 if the optional `evaluateFeasibility` unit test
was added) / 0 fail / 1 skip. Wall-clock < 10 s.

**If fail**: the smoke harness probably caught a real integration failure.
Read the named-field message; diagnose with `research.md` strategies (§R3 for
shim fallbacks, §R4 for smoke retarget, §R5 for `evaluateFeasibility`).

---

## Step 2 — Open both dashboards in a browser (CRITICAL)

This is the step feature 001's U2B-4a didn't survive. Do it carefully.

### 2a. Open `FIRE-Dashboard.html`

```text
# Windows
start FIRE-Dashboard.html

# macOS
open FIRE-Dashboard.html
```

**Expected within 2 seconds of page load**:
- KPI card **Years to FIRE** shows a number (not "Calculating…").
- KPI card **FIRE Age** shows a number.
- KPI card **FIRE Net Worth** shows a dollar amount.
- KPI card **Progress %** shows a percentage.
- Growth chart renders with data lines.
- All panels (Scenario card, Mortgage card, What-if, Coast FIRE, Healthcare
  delta) show real numbers.

**If ANY card shows "Calculating…" or an empty state**: this is the U2B-4a
failure mode. Open DevTools console; look for `[<shim name>] canonical threw:`
errors. Fix the underlying canonical issue; do NOT silently widen the shim
fallback to hide the throw.

### 2b. Open DevTools → Console

**Expected**: no red error lines. No `[fireAge shim] canonical threw:`,
`[findFireAgeNumerical shim] canonical threw:`, or
`[_evaluateFeasibilityAtAge shim] canonical threw:` logs.

### 2c. Interact

- Change the **Annual Spend** slider. Every KPI updates within a frame.
- Change the **Return Rate** slider. Every KPI updates.
- Drag the FIRE marker on the Full Portfolio Lifecycle chart. The confirm
  overlay appears on release (feature 001 US1 preserved).

### 2d. Repeat for `FIRE-Dashboard-Generic.html`

Same checks. Lockstep applies — both dashboards behave identically on shared
features.

---

## Step 3 — Grep audit: dead helpers removed

```bash
grep -n "function signedLifecycleEndBalance\|function taxAwareWithdraw\|function isFireAgeFeasible\|function _legacySimulateDrawdown" FIRE-Dashboard.html FIRE-Dashboard-Generic.html
```

**Expected**: zero hits in both files.

Also grep for call sites:

```bash
grep -n "signedLifecycleEndBalance\|taxAwareWithdraw\|isFireAgeFeasible\b\|_legacySimulateDrawdown" FIRE-Dashboard.html FIRE-Dashboard-Generic.html
```

**Expected**: zero hits in both files (unless a comment refers to the
deletion; those are acceptable).

---

## Step 4 — Grep audit: shims in place

```bash
grep -n "getCanonicalInputs\|window._solveFireAge\|window._evaluateFeasibility" FIRE-Dashboard.html FIRE-Dashboard-Generic.html
```

**Expected**: each HTML file has the bootstrap import (for `getCanonicalInputs`)
plus shim-body references. Symmetric hit counts between the two files.

---

## Step 5 — Grep audit: prototype retired

```bash
grep -n "_prototypeGetCanonicalInputs\|TEMPORARY" tests/baseline/browser-smoke.test.js
```

**Expected**: zero hits. Feature 003's `TEMPORARY` marker is gone; the
prototype function is deleted; the production adapter is imported.

---

## Step 6 — Push to GitHub and verify CI

```bash
git push -u origin 004-html-canonical-swap
```

Wait ~30 seconds; open GitHub Actions tab (or run `gh run list --branch 004-html-canonical-swap --limit 1`).

**Expected**: green check within 5 minutes. The feature 003 CI workflow is
the gate.

**If red**: this is the REAL gate that was missing in U2B-4a. Read the CI
logs; fix locally; push again.

---

## Step 7 — Lockstep commit audit

```bash
git log --oneline main..004-html-canonical-swap
```

Every commit in this feature touching `FIRE-Dashboard.html` MUST also touch
`FIRE-Dashboard-Generic.html` in the SAME commit. Manager reviews each
commit's `git show <sha>` for structural parity.

---

## Step 8 — Post-merge manual check

After merging to `main` and `origin/main`, re-open both dashboards from
`main`. Repeat Step 2 on the merged state. If anything regresses, that's a
bug in the merge — not expected, but verify.

---

## If anything fails

- **KPI shows "Calculating…"**: shim fallback working? Did the canonical
  engine throw? See DevTools console.
- **Wrong numbers on screen**: expected per baseline §C.5 (canonical is more
  correct than inline; shift documented). If the shift is LARGER than the
  §C.5 predicted range, the production adapter might be mapping a field
  wrong. Compare its output against the prototype's output on the same input
  to localize.
- **Chart is empty / looks wrong**: chart renderers consume `sim` (canonical
  `lifecycle`) which has MORE fields than inline. If a chart reads a field
  inline had but canonical doesn't emit, that's a U2B-4b concern. Scope for
  this feature: confirm the field shows up in every chart's `d.*` access;
  track as a follow-up if any are missing.

---

## Success criteria recap

- SC-001: All KPI cards show numbers within 2 s of page load on both dashboards.
- SC-002: CI reports GREEN on every commit + the merge commit.
- SC-003 / SC-004: dead helpers + `TEMPORARY` marker are both gone (greps in Steps 3–5).
- SC-005: feature 003 smoke tests still pass.
- SC-006: Runner < 10 s; count 80+.
- SC-007: reverting any shim's try/catch triggers a named smoke failure within
  30 s local or in CI.
- SC-008: Post-feature RR `fireAge ∈ [51, 54]`; Generic `fireAge ∈ [55, 68]`.
