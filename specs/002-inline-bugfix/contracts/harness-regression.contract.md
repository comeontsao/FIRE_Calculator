# Contract: Harness Regression Tests (B1 + B3)

**Feature**: `002-inline-bugfix`
**File**: `tests/baseline/inline-harness.test.js` (extended, not replaced)

This feature adds exactly two new named tests to the existing harness-test
file. They each lock one of the two fixes the feature ships. Reverting a fix
MUST fail its corresponding test with a clear message naming the metric.

---

## Test 1 — B1 regression (real/nominal healthcare + college conversion)

### Purpose
Lock that after the fix, the inline engine produces a FIRE age **earlier**
than the pre-fix value by the SC-004 / SC-005 tolerance range of 0.5 to 1.5
years, on both canonical input sets.

### Setup
- Import `runInlineLifecycle` from `tests/baseline/inline-harness.mjs`.
- Import the canonical RR + Generic input sets.
- Import two named pre-fix constants recorded inside the test file (NOT in
  the harness itself) for comparison:
  ```js
  const PRE_FIX_FIREAGE_RR = 54;       // observed pre-fix; see baseline-rr-inline.md §A
  const PRE_FIX_FIREAGE_GENERIC = 65;  // observed pre-fix; see baseline-rr-inline.md §B
  ```

### Assertions
1. Run the harness on canonical RR. Call result `rr`.
2. Run the harness on canonical Generic. Call result `generic`.
3. Assert `PRE_FIX_FIREAGE_RR − rr.fireAge` is within `[0.5, 1.5]`.
4. Assert `PRE_FIX_FIREAGE_GENERIC − generic.fireAge` is within `[0.5, 1.5]`.
5. Assert `rr.fireAge > 0` and `generic.fireAge > 0` (sanity — fix didn't
   break feasibility).

### Failure messages
Each assertion's message names the metric explicitly, e.g.:
- `"B1 RR delta out of [0.5, 1.5] yr range: pre-fix 54, post-fix ${rr.fireAge}, delta ${delta}. Check inline engine's healthcare/college real/nominal conversion."`

### What a revert of the fix looks like
If the implementer reverts only the B1 patch but leaves the harness's
`EXPECTED_*` post-fix locks in place, OTHER harness tests fail first
(EXPECTED_* mismatch). This test gives an additional, more-specific signal:
"the delta is now 0, i.e., you re-nominal-ified your real dollars".

---

## Test 2 — B3 regression (Generic secondary-person sensitivity)

### Purpose
Lock that after the fix, Generic's solver materially responds to changes in
the secondary person's portfolio. Before this fix, the solver ignored
secondary entirely.

### Setup
- Import `runInlineLifecycle` from the harness.
- Import the canonical Generic input set (two-person household).
- Build two variants in the test:
  - `inputsSecondaryZero` — shallow copy with `portfolioSecondary.taxableStocksReal: 0`
    and `portfolioSecondary.trad401kReal: 0` (and the other two pool fields).
  - `inputsSecondaryLoaded` — shallow copy with
    `portfolioSecondary.taxableStocksReal: 300_000`.

### Assertions
1. Run harness on `inputsSecondaryZero` → `rZero`.
2. Run harness on `inputsSecondaryLoaded` → `rLoaded`.
3. Assert `rZero.fireAge − rLoaded.fireAge >= 1` (loading $300 k into
   secondary must make FIRE at least one year sooner).
4. Assert `rZero.feasible === true && rLoaded.feasible === true` (both remain
   feasible — we're checking sensitivity, not edge cases).

### Failure messages
- `"B3: secondary portfolio change has no effect on yearsToFire. Generic solver is still single-person. rZero.fireAge=${rZero.fireAge}, rLoaded.fireAge=${rLoaded.fireAge}."`

### What a revert of the fix looks like
Reverting B3 in Generic's solver means the secondary-portfolio change no
longer moves `yearsToFire`; `rZero.fireAge === rLoaded.fireAge`; assertion 3
fails with the message above.

---

## What this contract does NOT cover

- The pre-fix baseline values (54 and 65) are CURRENT observations recorded
  in `baseline-rr-inline.md §A` and `§B`. These values were observed via the
  pre-fix harness; after this feature ships, `§D` in the same doc records
  the new post-fix observed values. The test's `PRE_FIX_FIREAGE_*` constants
  stay pinned forever — they are the audit-baseline truth.
- Single-person Generic regression (FR-003) is tested implicitly by the
  harness's existing EXPECTED_GENERIC lock after it's updated — no separate
  test needed for this contract.
- RR B3 parallel — N/A; RR does not have the secondary-person-ignored bug.

---

## Acceptance for the harness update (as distinct from the engine patch)

- Both tests exist in `tests/baseline/inline-harness.test.js`.
- Both tests PASS after the engine fix lands.
- Both tests FAIL when their corresponding fix is individually reverted.
- `bash tests/runner.sh` wall-clock stays under 10 seconds.
- Runner total count increases from 76 to 78.
