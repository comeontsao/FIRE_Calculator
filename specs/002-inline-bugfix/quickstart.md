# Quickstart — Inline Engine Bugfix (B1 + B3)

**Feature**: `002-inline-bugfix`
**Target verification time**: under 5 minutes.

This feature is a calc-layer bugfix. Every verification step is either a test
runner invocation or a specific number-check in the browser.

---

## Prerequisites

- Node 20+ (verify: `node --version`).
- A modern browser to open `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html`.

No install, no build.

---

## Step 1 — Test runner (automated)

```bash
bash tests/runner.sh
```

**Expected**:
- Runner total ticks from 76 (pre-feature) to **78** (two new regression tests land).
- All tests GREEN. Zero failures.
- Wall-clock under 10 seconds.

**If fail**:
- `B1 RR delta out of [0.5, 1.5] yr range` → B1 fix didn't engage or engaged too broadly. See `research.md §R1`.
- `B3: secondary portfolio change has no effect` → B3 fix didn't engage. See `research.md §R2`.
- Existing EXPECTED_* lock failures → the harness's EXPECTED_* constants weren't updated to post-fix values. See `research.md §R3`.

---

## Step 2 — B3 manual verification in Generic dashboard (user-visible)

1. Open `FIRE-Dashboard-Generic.html` in a browser.
2. In the profile section, enter a two-person household:
   - Primary age 40, secondary age 40.
   - Primary's `Taxable Stocks`: $500,000.
   - Secondary's `Taxable Stocks`: $0.
   - Annual spend: $60,000.
3. Note the displayed "Years to FIRE" value.
4. Change secondary's `Taxable Stocks` from $0 to $300,000.
5. **Expected**: "Years to FIRE" drops by at least 1 year immediately.

**Before this fix, this change produced no effect.**

6. Additional check (contributions): in the same setup, set primary's annual
   contribution to $15,000 and secondary's to $0. Note Years to FIRE. Now set
   secondary's to $15,000. **Expected**: Years to FIRE drops further.

7. Additional check (SS): with both ages set to 60 (so you're near retirement
   phase) and `ssStartAgeSecondary` set to 70, observe the end-balance
   trajectory on the Full Portfolio Lifecycle chart. Change `ssStartAgeSecondary`
   to 62 (earlier claim). **Expected**: the curve shape shifts — secondary's
   benefit now activates 8 years earlier, so the portfolio depletes slower
   between age 62 and 70.

---

## Step 3 — B1 manual verification on canonical inputs (either dashboard)

1. Open `FIRE-Dashboard.html` (RR) in a browser.
2. Load the RR canonical inputs documented in
   `specs/001-modular-calc-engine/baseline-rr-inline.md §A` (or just use
   Roger/Rebecca's default values if they match canonical).
3. Note the displayed "Years to FIRE" and "FIRE Age" values.
4. Compare against the pre-fix baseline:
   - Pre-fix `fireAge`: 54.
   - Post-fix expected `fireAge`: ~52.5–53.5 (0.5 to 1.5 years earlier).
5. **Expected**: the dashboard's value is in the predicted range.

Repeat for Generic with its canonical inputs (pre-fix 65 → post-fix
~63.5–64.5).

---

## Step 4 — No regression on no-overlay inputs

1. Open `FIRE-Dashboard-Generic.html` in a browser.
2. Single-person household (secondary fields all $0 / blank), no kids, no
   healthcare override (use scenario default only).
3. Note the "Years to FIRE" value.
4. Load the same HTML file from the PRE-feature state (e.g., git stash or
   `git show main:FIRE-Dashboard-Generic.html > /tmp/pre.html` and open `pre.html`).
5. Compare the two "Years to FIRE" values on the same input.
6. **Expected**: byte-identical. Per FR-006 + SC-006, inputs that don't
   exercise the fix are unchanged.

---

## Step 5 — Cross-file lockstep audit (reviewer step)

1. Run `git diff main..002-inline-bugfix -- FIRE-Dashboard.html FIRE-Dashboard-Generic.html`.
2. Look for the B1 patch in both files. The conversion formula (three lines)
   should appear with identical structure in both files.
3. Look for the B3 patch — should appear ONLY in `FIRE-Dashboard-Generic.html`
   (RR doesn't have this bug). The commit message explicitly documents this
   legitimate divergence.

---

## Step 6 — Baseline doc audit

1. `specs/001-modular-calc-engine/baseline-rr-inline.md` should have a new
   Section D ("Post-fix observed — feature 002") recording:
   - New RR fireAge, yearsToFire, endBalanceReal, balanceAtUnlockReal,
     balanceAtSSReal.
   - New Generic same fields.
   - Delta from Section A / B (pre-fix baseline) with brief narrative.
2. Section C (documented deltas) stays unchanged — it described the
   canonical-vs-inline delta for feature 001, not the inline-vs-inline delta
   this feature introduces. Both documentations coexist.

---

## If any step fails

Don't deploy. Diagnose using the matching section in `research.md`:
- Step 1 B1 range failure → R1 fix strategy.
- Step 1 B3 sensitivity failure → R2 fix strategy.
- Step 1 EXPECTED_* lock failures → R3 harness lockstep.
- Step 4 regression (no-overlay inputs changed) → B1 fix is engaging on
  wrong codepath; review the conversion formula's guard conditions.

If the B1 delta falls outside [0.5, 1.5] years, trigger FR-011's
investigation path: the implementer documents cause and either ships an
explanation or tightens the fix.
