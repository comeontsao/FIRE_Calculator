# Feature 019 — Implementation Plan

**Branch (proposed)**: `019-accumulation-drift-fix`
**Spec**: [spec.md](./spec.md)
**Status**: PLAN
**Date**: 2026-04-30

---

## 1. Architecture overview

Single new pure module `calc/accumulateToFire.js`. Consumed by 3 call sites in each of 2 HTML files = 6 rewires. One small `resolveAccumulationOptions` helper at each call site (it's allowed to be impure — DOM/closure access is its job).

## 2. Files touched

| File | Change | Owner |
|---|---|---|
| `calc/accumulateToFire.js` | NEW (~250 lines) | Backend |
| `tests/unit/accumulateToFire.test.js` | NEW (~300 lines) | Backend (TDD) |
| `tests/unit/cashAccumulationDrift.test.js` | EXTEND with T-019-03 | Backend |
| `tests/unit/lifecyclePayoffMerge.test.js` | EXTEND with T-019-04 | Backend |
| `FIRE-Dashboard.html` | 3 call-site rewires + 1 inline `resolveAccumulationOptions` | Backend |
| `FIRE-Dashboard-Generic.html` | mirror of above | Backend |
| `BACKLOG.md` | tick off feature 019 | Manager |
| `CLAUDE.md` | flip active feature pointer + add Process Lesson | Manager |

## 3. Migration strategy (the order matters)

### Step 1 — Extract helper, write its tests

1. Create `calc/accumulateToFire.js` with the pure helper. Internal structure mirrors `projectFullLifecycle` accumulation branch lines 9333–9475 + 9632–9638 byte-exact.
2. Create `tests/unit/accumulateToFire.test.js` with the T-019-02 cases.
3. Run `node --test tests/unit/accumulateToFire.test.js` → all green.
4. **Verify zero existing tests are touched.** No HTML changes yet.

### Step 2 — Rewire `projectFullLifecycle` (THE RISKY STEP)

The 163 existing tests depend on projectFullLifecycle producing the exact same pre-FIRE pools as before.

1. In `FIRE-Dashboard.html`:
   - Add `resolveAccumulationOptions(...)` helper near top of calc section (~line 9290).
   - Replace lines 9333–9475 + lines 9632–9638 with a single call to `accumulateToFire(...)`.
   - Retirement-phase loop (lines 9476+) untouched.
2. Mirror in `FIRE-Dashboard-Generic.html`.
3. Run the FULL test suite. **All 163 tests MUST pass.**
4. Browser-smoke RR + Generic per CLAUDE.md Process Lesson.

### Step 3 — Rewire the two buggy sites

1. Replace lines 10595–10614 in `_simulateStrategyLifetime` with a call to `accumulateToFire`.
2. Replace lines 11031–11041 in `computeWithdrawalStrategy` with the same.
3. Mirror both in `FIRE-Dashboard-Generic.html`.
4. Run `node --test tests/unit/cashAccumulationDrift.test.js` → both tests now pass.
5. Run the full suite again. Strategy-ranker / lifetime-tax tests MAY fail with NEW numbers — these reflect the bug being fixed. Each must be inspected.

### Step 4 — Add new regression tests

1. Add T-019-03 (wCash sum = 0) to `tests/unit/cashAccumulationDrift.test.js`.
2. Add T-019-04 (strategy parity) to `tests/unit/lifecyclePayoffMerge.test.js`.
3. Final full-suite run.

### Step 5 — Browser smoke (mandatory)

1. Open both HTML files in a real browser.
2. Drag FIRE marker. Confirm Withdrawal Strategy chart Year-1 wCash = 0.
3. Confirm `copyDebugInfo()` dump: no `endBalance-mismatch` in `crossValidationWarnings`.
4. Zero red console errors.

### Step 6 — Commit + PR

Conventional commits:
- `feat(019): extract pure accumulateToFire helper` (step 1)
- `refactor(019): rewire projectFullLifecycle to accumulateToFire` (step 2)
- `fix(019): cash drift in _simulateStrategyLifetime + computeWithdrawalStrategy` (step 3)
- `test(019): regression tests for accumulation drift fix` (step 4)
- `docs(019): CLOSEOUT + Process Lesson` (step 6)

## 4. Rollback plan

Each step is a separate commit. If browser-smoke after step 5 reveals a regression test missed:

1. `git revert` the step-3 commit only (keeps the helper + step-2 rewire).
2. Open an issue with the browser-smoke artifact.
3. Resume step 3 after diagnosing.

## 5. Estimated effort

- Step 1 (helper + tests): 2–3 hours.
- Step 2 (projectFullLifecycle rewire + 163-test verification): 2–4 hours.
- Step 3 (two buggy rewires): 1 hour.
- Step 4 (new tests): 1 hour.
- Step 5 (browser smoke): 30 min.
- Step 6 (commit + PR + CLOSEOUT): 30 min.

**Total: 1 work day.**

## 6. Locked decisions (user-confirmed 2026-04-30)

1. **Helper location:** new file `calc/accumulateToFire.js`. `calc/lifecycle.js` consolidation deferred to a future feature.
2. **Cash growth rate:** `1.005` hardcoded. Byte-exact with the canonical loop. Will be exposed only if/when HYSA modeling becomes a feature.
3. **Helper return shape:** `{ end: {...}, perYearRows: [...] }`. `projectFullLifecycle` deletes its inline loop and consumes `perYearRows` to build its `data[]`. Eliminates drift permanently.
4. **Test fixture updates:** handled inline as encountered; every fixture delta gets a `// 019: was $X pre-fix, now $Y because <reason>` comment. No separate review pass.
5. **Branch strategy:** 018 merges to main first; 019 branches from main after the 018 merge lands.
6. **Browser-smoke gate timing:** between step 5 and step 6 — never merge a step 6 commit until smoke is green on both files.
