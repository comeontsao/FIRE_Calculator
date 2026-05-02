# Contract — `getAccumulationSpend(inp)` helper

**Site**: Inline JS in BOTH `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html`, near `getTotalMonthlyExpenses()` (RR line ~7594).
**Feature**: 023-accumulation-spend-separation
**Decision**: per Phase 0 R3 — inline (not extracted to `calc/`).

---

## Purpose

Provide a single canonical resolver for the user's accumulation-phase annual spending. Every consumer (5 of the 6 `accumulateToFire` callers — caller #6 also routes through this via the `resolveAccumulationOptions` upgrade) reads from this one helper. Centralizing here means a future change (e.g., adding annual cost-of-living inflation, or supporting a "current location" country-tier) updates ALL consumers atomically.

## Signature

```javascript
/**
 * Compute accumulation-phase annual spending in today's purchasing power.
 *
 * Drives every accumulateToFire caller's options.accumulationSpend field. Sums
 * the user's Plan-tab Expense rows (via getTotalMonthlyExpenses()) × 12, with
 * a $120,000 floor (FR-002a) for empty / near-zero line items.
 *
 * FRAME: real-$ — output is in today's purchasing power. Caller passes it
 *        directly to options.accumulationSpend, which the calc engine treats
 *        as constant across accumulation years per feature 022 FR-014.
 *
 * @param {object} inp - Dashboard state (currently unused; kept for future
 *                       per-year scaling extension; matches call-site convention).
 * @returns {number} Annual spending in real-$ (today's $).
 */
function getAccumulationSpend(inp) { ... }
```

## Behavior

```javascript
function getAccumulationSpend(inp) {
  // FRAME: real-$ — sum of Plan-tab line items in today's $.
  const monthlySum = (typeof getTotalMonthlyExpenses === 'function')
    ? getTotalMonthlyExpenses()
    : 0;
  const annualSum = monthlySum * 12;

  // FR-002a: $1,000 sanity floor. If line items are absent or near-zero
  // (e.g., user just cleared all rows), fall back to Stay-in-US comfortable
  // spend. Prevents the original bug from re-emerging on edge inputs.
  if (annualSum >= 1000) {
    return annualSum;
  }
  // FRAME: real-$ — $120,000 fallback is the Stay-in-US country-tier
  //        comfortableSpend default (see scenarios[].annualSpend at HTML line 4936).
  return 120000;
}
```

## Edge cases

| Input state | Output | Reason |
|---|---:|---|
| `getTotalMonthlyExpenses` undefined (e.g., test harness without DOM) | $120,000 | Helper is DOM-bound; harness uses persona-record path instead (data-model.md Entity 4). |
| All Plan-tab rows = $0 | $120,000 | FR-002a floor — prevents bug rebirth. |
| Single row at $50/mo | $120,000 | Annual sum = $600 < $1,000 floor → fallback. |
| Single row at $100/mo | $1,200 | Above floor → use line items. |
| Realistic user (~$10k/mo line items) | $120,000 | Line items × 12 = $120,000 = floor; user's own number wins. |
| Frugal user (~$5k/mo line items) | $60,000 | Line items × 12 above floor → use them. |

## Lockstep requirement

Both HTMLs MUST define this helper with byte-identical body. Sentinel grep before merge:

```
grep -n "function getAccumulationSpend" FIRE-Dashboard.html
grep -n "function getAccumulationSpend" FIRE-Dashboard-Generic.html
```

Each file MUST have exactly one match.

## Test contract

`tests/unit/getAccumulationSpend.test.js` (NEW, ≥6 cases):

```javascript
// Helper is inline JS, not a calc module — tests inject a stubbed
// getTotalMonthlyExpenses via a wrapper. The wrapper mirrors the inline
// helper's body exactly.
function _harnessGetAccumulationSpend(inp, getTotalMonthlyExpensesFn) {
  const monthly = getTotalMonthlyExpensesFn ? getTotalMonthlyExpensesFn() : 0;
  const annual = monthly * 12;
  if (annual >= 1000) return annual;
  return 120000;
}
```

Cases:

| # | `getTotalMonthlyExpensesFn` returns | Expected output | Reasoning |
|---|---:|---:|---|
| 1 | $0 | $120,000 | Empty Plan tab → fallback |
| 2 | $50 ($600/yr) | $120,000 | Below $1,000 floor → fallback |
| 3 | $100 ($1,200/yr) | $1,200 | Above floor → line items |
| 4 | $5,000 ($60,000/yr) | $60,000 | Realistic frugal user |
| 5 | $10,000 ($120,000/yr) | $120,000 | RR-baseline US household = floor coincidentally |
| 6 | undefined (no fn) | $120,000 | Test harness without DOM access |
| 7 | $20,000 ($240,000/yr) | $240,000 | Higher US household above floor |
| 8 | NaN | $120,000 | Non-numeric → fallback |

Tests live in Node — verify byte-identical helper body sync between RR and Generic via a meta-check.

## Frame contract

Output: `real-$`.

The helper's job is to stay in real-$ frame. It does NOT inflate by `(1+i)^t` — that's `displayConverter.toBookValue`'s job at render time, on the `pCash` companion field, NOT on this scalar.

## Constitution alignment

- **I. Lockstep**: Helper body is byte-identical in both HTMLs.
- **II. Pure modules**: Helper has DOM dependency (via `getTotalMonthlyExpenses`); ergo it lives inline, NOT in `calc/`. The decision matrix (R3) accepts this tradeoff.
- **III. Single source of truth**: All 6 `accumulateToFire` callers read through `resolveAccumulationOptions`, which calls this helper.
- **VI. Chart ↔ Module**: No charts consume this helper directly; the contract is between the helper and `accumulateToFire`'s options bag.
