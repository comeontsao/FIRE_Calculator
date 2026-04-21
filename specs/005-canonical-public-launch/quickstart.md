# Quickstart: Canonical Engine Swap + Public Launch

**Feature**: 005-canonical-public-launch | **Est. time**: ~10 min

This is the verification recipe — the set of manual steps that confirms
feature 005 is working end-to-end BEFORE the user executes the PUBLISH.md
checklist. Run this after merge to `main` and before flipping the repo
public.

---

## Prerequisites

- [ ] Feature 005 merged to `main` locally.
- [ ] Node 20+ installed.
- [ ] A modern browser (Chrome / Firefox / Safari last-two-major).
- [ ] `bash tests/runner.sh` has been green at least once in the last hour.

---

## Part A — Automated test gate (~30 sec)

### A.1 Run the unit + smoke + meta suites

```bash
bash tests/runner.sh
```

**Expected output**:
- `pass: ≥ 84` (80 inherited + ≥ 4 new shim tests)
- `fail: 0`
- `skip: 1` (US4 bidirectional meta-test, pre-existing)
- Wall-clock: < 10 seconds.

### A.2 Run the shim-revert drill (SC-004)

1. Open `calc/shims.js`.
2. Pick any shim (e.g., `yearsToFIRE`). Temporarily remove the
   `try/catch` wrapper — let the canonical call throw unguarded.
3. Run `bash tests/runner.sh` again.
4. **Expected**: the matching test in `tests/unit/shims.test.js` fails
   with a message naming the shim (e.g., "expected fallback NaN but got
   Error").
5. Revert the edit. Re-run; green.

**If A.2 fails to detect the revert**: the shim test is weaker than
designed. Stop; fix the test before proceeding.

---

## Part B — Browser smoke (~2 min)

### B.1 Open RR dashboard

1. Double-click `FIRE-Dashboard.html` (or serve via `python -m
   http.server 8000` and visit `http://localhost:8000/FIRE-Dashboard.html`).
2. Open DevTools Console.
3. Wait for initial compute.

**Expected**:
- [ ] Every KPI card shows a numeric value within 2 seconds (SC-001).
- [ ] No card stuck on "Calculating…".
- [ ] No `NaN` / `$0` / `40+ years` placeholders visible.
- [ ] Console: zero red errors; zero `[<shim>] canonical threw:` messages.
- [ ] Disclaimer visible at bottom; reads "research and educational
      purposes only, not financial advice, DYOR, consult advisor,
      MIT-licensed".

### B.2 Open Generic dashboard

Same steps for `FIRE-Dashboard-Generic.html`. Same expected output.

### B.3 Drag FIRE age marker

1. On the lifecycle chart, drag the FIRE marker to a different age.
2. Click Confirm (if the dashboard requires confirm).

**Expected**:
- [ ] KPI cards and chart marker both update in the same animation
      frame (SC-012).
- [ ] No one-frame-stale artifact.

### B.4 Infeasibility banner check (US4 / FR-022)

1. Set monthly spend to an aggressive value (e.g., $20,000/month).
2. Recompute.

**Expected**:
- [ ] Infeasibility banner appears.
- [ ] `#infeasibilityDeficit` element shows a dollar-formatted value
      (e.g., "Plan runs short by $47,200 by age 85").
- [ ] Set spend back to default; banner disappears.

### B.5 Language toggle

1. Click the EN / 中文 toggle.
2. Scroll to disclaimer.

**Expected**:
- [ ] Entire dashboard translates.
- [ ] Disclaimer translates (both `disclaimer.intro` and
      `disclaimer.body` keys render in zh-TW).
- [ ] No layout break.

---

## Part C — Privacy scrub review (~3 min)

### C.1 Open the audit

Open `specs/005-canonical-public-launch/privacy-scrub.md`.

**Expected**:
- [ ] Every file in scope has a status: Clean or Remediated.
- [ ] Zero files in status "findings pending".
- [ ] Sign-off line at bottom dated today.

### C.2 Spot-check: one file marked Clean

1. Pick any file marked Clean in the audit (e.g., `calc/tax.js`).
2. Run: `grep -nE '1983|1984|Roger|Rebecca' calc/tax.js` from repo root.
3. **Expected**: zero hits.

### C.3 Spot-check: one file marked Remediated

1. Pick any file marked Remediated.
2. Run the same grep.
3. **Expected**: zero hits (or hits match the documented "before" value
   stripped of RR-identifying content).

---

## Part D — Publish-ready artifact smoke (~2 min)

### D.1 LICENSE present

```bash
test -f LICENSE && head -1 LICENSE
```
**Expected**: first line is `MIT License`.

### D.2 README scannable

Open `README.md`. **Expected**: all 9 required sections present (title,
description, live demo, features, run locally, tech, license,
contributions, disclaimer).

### D.3 `index.html` redirect works

Visit `http://localhost:8000/` (root path).
**Expected**: redirects to `FIRE-Dashboard-Generic.html` within 1 second.
Dashboard loads.

### D.4 `PUBLISH.md` checklist readable

Open `PUBLISH.md`. **Expected**: two numbered steps, each with commands or
URLs, a "before you start" preconditions block, and a rollback section.

---

## Part E — Tech-debt verification (~1 min)

### E.1 Dead helpers deleted

```bash
grep -rn "function isFireAgeFeasible\|function signedLifecycleEndBalance\|function taxAwareWithdraw\|function _legacySimulateDrawdown" .
```
**Expected**: zero hits (SC-013).

### E.2 Compat shim deleted

```bash
grep -rn "normalizeMortgageShape" calc/
```
**Expected**: zero hits.

### E.3 Fixture placeholder locked

```bash
grep -rn "TBD_LOCK_IN_T038\|TBD_" tests/fixtures/
```
**Expected**: zero hits.

### E.4 `CLAUDE.md` updates

Open `CLAUDE.md`. **Expected**:
- [ ] `## Process Lessons` section exists with subsections for caller-audit
      and shim-defense.
- [ ] `<!-- SPECKIT START -->` block points at
      `specs/005-canonical-public-launch/plan.md`.

---

## Part F — Hand-off to user

If all parts A-E pass:

1. [ ] Create a commit or push the merge to `origin/main`.
2. [ ] Wait for CI green on that commit (< 5 min).
3. [ ] Open `PUBLISH.md`.
4. [ ] Execute Steps 1 + 2.
5. [ ] Verify the public URL serves the Generic dashboard.

If any part fails: do NOT execute `PUBLISH.md`. Open a follow-up ticket /
spec revision.

---

## Rollback

- **Merged but broken**: `git revert <merge-commit>`. Feature 005 can be
  re-attempted.
- **Published and broken**: `git revert` AND Settings → Change visibility
  → Private, OR push a fix and wait for Pages rebuild (~2-5 min).
- **Privacy leak discovered post-public**: Settings → Change visibility →
  Private immediately. Then follow up with BFG / filter-repo if the leak
  is in git history AND the user wants to scrub history (out of scope per
  assumption; documented trade-off).
