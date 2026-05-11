# Contract: Cash-Sweep Helper + Simulator Integration

**Feature**: 030-cash-sweep-stocks
**Status**: Draft
**Owners**: Backend Engineer (calc helper + invariant), Frontend Engineer (UI + i18n), QA Engineer (parity tests)

## Purpose

Pin the API and call-site discipline for the `_applyCashSweep` helper. Every simulator that maintains a per-year `pCash` + `pStocks` MUST call this helper at the canonical year-end point. Audit invariant `_invariantF` enforces parity across simulators at runtime.

## Helper API: `_applyCashSweep(pCash, pStocks, threshold, age, currentAge, enabled)`

**Module**: `calc/cashSweep.js` (NEW, UMD-style per Constitution V).

**Signature**:
```js
function _applyCashSweep(pCash, pStocks, threshold, age, currentAge, enabled) {
  // Returns: { pCash: number, pStocks: number, swept: number }
}
```

**Parameters**:

| Name | Type | Notes |
|---|---|---|
| `pCash` | `number` | Year-end cash balance (post-compounding, post-withdrawals). Real-$ frame. |
| `pStocks` | `number` | Year-end stocks balance. Real-$ frame. |
| `threshold` | `number` | Cash floor to keep. Real-$. From `inp.cashSweepThreshold`. |
| `age` | `number` | Simulated age this iteration. May be fractional during partial-FIRE-year (feature 022). |
| `currentAge` | `number` | User's current age (`inp.ageRoger` or `inp.agePerson1`). Used to detect year 0 for preservation rule. |
| `enabled` | `boolean` | Toggle state. From `inp.cashSweepEnabled`. |

**Return shape**:

| Field | Type | Notes |
|---|---|---|
| `pCash` | `number` | Updated cash balance |
| `pStocks` | `number` | Updated stocks balance |
| `swept` | `number` | Dollar amount transferred this iteration; 0 when sweep didn't fire |

**Behavior** (canonical decision table):

| Condition | Result |
|---|---|
| `enabled === false` | `{ pCash, pStocks, swept: 0 }` (no-op) |
| `enabled === true` AND `age <= currentAge` (year 0 or earlier) | `{ pCash, pStocks, swept: 0 }` (year-0 preservation per clarification 2026-05-11) |
| `enabled === true` AND `age > currentAge` AND `pCash <= threshold` | `{ pCash, pStocks, swept: 0 }` (below floor, nothing to sweep) |
| `enabled === true` AND `age > currentAge` AND `pCash > threshold` | `{ pCash: threshold, pStocks: pStocks + (pCash - threshold), swept: pCash - threshold }` |
| `threshold < 0` | Helper clamps to `0` internally before applying the rule |
| `pCash` or `pStocks` is `NaN` / `Infinity` | Returns input pools unchanged with `swept: 0` (defensive) |

**Purity guarantees** (Constitution II):
- No DOM access, no `document.getElementById`, no `localStorage`, no `console.log` in normal path.
- No mutation of input objects.
- No reads from module-scope mutable state.
- Deterministic: same inputs always produce same outputs.

**UMD export** (Constitution V):
```js
// At end of calc/cashSweep.js:
const _api = { _applyCashSweep };
if (typeof module !== 'undefined' && module.exports) {
  module.exports = _api;
}
if (typeof globalThis !== 'undefined') {
  globalThis._applyCashSweep = _applyCashSweep;
}
```

## Simulator Integration Sites

Each simulator that maintains per-year `pCash` + `pStocks` MUST invoke `_applyCashSweep` immediately after its existing `pCash *= 1.005` (or `pCash *= (1 + 0.005 * scale)`) cash-interest compounding line.

| Simulator | File | Line (approx) | Integration pattern |
|---|---|---|---|
| `signedLifecycleEndBalance` (accumulation phase) | `FIRE-Dashboard.html` | ~9196 | After `pCash *= 1.005;` |
| `signedLifecycleEndBalance` (retirement phase) | `FIRE-Dashboard.html` | ~9273 | After `pCash *= 1.005;` |
| `simulateRetirementOnlySigned` | `FIRE-Dashboard.html` | ~9855 | After `pCash *= (1 + 0.005 * scale);` — partial-FIRE-year aware |
| `_simulateStrategyLifetime` | `FIRE-Dashboard.html` | ~11856 | After `pCash *= 1.005;` |
| `computeWithdrawalStrategy` | `FIRE-Dashboard.html` | ~12464 | After `pCash *= 1.005;` |
| `accumulateToFire` | `calc/accumulateToFire.js` | 711 | After `pCash *= 1.005;` |

Generic HTML has parallel sites (Constitution Principle I — lockstep edits required).

**Canonical call pattern** (RR, retirement-phase example):
```js
// Existing line (do NOT modify):
pCash *= 1.005;

// NEW: Feature 030 cash-sweep integration
{
  const _f030_sweep_ = (typeof _applyCashSweep === 'function')
    ? _applyCashSweep(pCash, pStocks, inp.cashSweepThreshold || 10000, age,
                      (inp.agePerson1 !== undefined ? inp.agePerson1 : inp.ageRoger),
                      !!inp.cashSweepEnabled)
    : { pCash, pStocks, swept: 0 };
  pCash = _f030_sweep_.pCash;
  pStocks = _f030_sweep_.pStocks;
  // Optional trace push (audit observability — opt-in):
  if (options && Array.isArray(options.cashSweepTraces)) {
    options.cashSweepTraces.push({
      age,
      simulatorId: 'signedLifecycleEndBalance',  // (varies per simulator)
      pCash, pStocks,
      swept: _f030_sweep_.swept,
    });
  }
}
```

**Notes**:
- The `typeof` guard preserves backward-compat for Node-sandbox tests that don't load `calc/cashSweep.js`.
- Each simulator uses its own `simulatorId` literal in the trace row.
- Trace push is opt-in: zero overhead when `options.cashSweepTraces` is undefined.
- `inp.cashSweepThreshold` falls back to `10000` if undefined or NaN.
- `inp.cashSweepEnabled` is coerced to boolean via `!!`.

## Audit Invariant: `_invariantF` (simulator-cash-sweep-parity)

**Location**: `calc/calcAudit.js` (NEW function added alongside existing `_invariantA` ... `_invariantE`).

**Signature**:
```js
function _invariantF(options, ctx) {
  // Reads ctx.cashSweepTraces (Array<{age, simulatorId, pCash, pStocks, swept}>)
  // Returns Array<CrossValidationWarning>
}
```

**Behavior**:
1. If `ctx.cashSweepTraces` is undefined or empty → return `[]` (silent no-op).
2. Group rows by `age`.
3. For each age, compute `pCashRange = max(pCash) - min(pCash)` and `pStocksRange = max(pStocks) - min(pStocks)` across simulator entries.
4. If `pCashRange > 1.0` OR `pStocksRange > 1.0` → push a warning:
   ```js
   {
     kind: 'simulator-cash-sweep-parity',
     age,
     simulators: { [simulatorId]: { pCash, pStocks }, ... },
     delta: max(pCashRange, pStocksRange),
     expected: false,
     reason: `Simulators disagree on post-sweep pool state at age ${age}. ` +
             `pCash range: $${pCashRange.toFixed(0)}, pStocks range: $${pStocksRange.toFixed(0)}. ` +
             `Check that all simulators apply the canonical sweep rule per contracts/cash-sweep.contract.md.`,
     dualBarSeries: { ... },
   }
   ```
5. Return concatenated warnings (empty array under correct operation).

**Wiring**: Add `crossValidationWarnings.push(..._invariantF(options, ctx));` to the `assembleAuditSnapshot` cross-validation chain.

**Test-only export**: Add `_invariantF_test_only_: _invariantF` to the module's `_api` for direct unit testing (mirrors feature 029's `_invariantE_test_only_` pattern).

## Persistence Contract

**localStorage keys** (both HTMLs):

| Key | Type | Default | Notes |
|---|---|---|---|
| `cashSweepEnabled` | `'true'` / `'false'` | `'false'` | Stored as string per existing localStorage convention. |
| `cashSweepThreshold` | string-encoded number | `'10000'` | Same convention. |

Both keys MUST be added to `_PERSISTED_INPUT_KEYS` (RR `:17263-17278` area). The existing save/restore harness handles the round-trip with no additional code required.

**FIRE-snapshots.csv**: Schema unchanged. The toggle + threshold are runtime config, not snapshot-row content.

## Tolerance & Edge-Case Handling

| Scenario | Expected behavior |
|---|---|
| `threshold = 0` | Year 1+: sweep ALL cash. pCash drops to 0 each year-end after sweep fires. |
| `threshold = $10M` (very large) | Year 1+: sweep effectively never fires. Cash trajectory matches toggle-OFF. |
| `threshold = pCash` exactly | No sweep (strict greater-than). |
| Multiple one-shot events in one year (e.g., home sale + lump-sum) | All events applied first, then `pCash *= 1.005`, then sweep. Sweep operates on the final year-end cash. |
| Partial-FIRE-year (`mFraction > 0`) | `pCash *= (1 + 0.005 * scale)` runs first (scale-aware compounding), then sweep operates on the post-scale pCash. Threshold is NOT scaled (it's a real-$ floor that applies regardless of partial-year). |
| `enabled = false` mid-recalc (user toggles off via UI) | Helper returns pools unchanged; next recalc cycle uses the new state. |

## Backwards Compatibility

- All existing simulators already accept an `options` parameter (or can have one added trivially). Adding `cashSweepTraces` field is additive.
- The integration code is gated by `typeof _applyCashSweep === 'function'` — when the helper is unloaded (e.g., Node test sandbox that didn't `require()` it), simulators degrade gracefully to current behavior (no sweep).
- Toggle defaults to `false` → all charts and KPIs are byte-identical to pre-feature behavior for users who don't opt in. `FIRE-snapshots.csv` rows remain reproducible.

## Non-Goals (explicit)

- **No automatic rebalance** the other direction (stocks → cash refill below floor). One-way only per spec scope.
- **No daily / monthly sweep**. Annual year-end only.
- **No tax event modeling**. The sweep is an internal model transfer; in reality a cash-to-brokerage move is not a taxable sale, so this is correct.
- **No threshold inflation** in nominal-$. Threshold is real-$ end-to-end.
- **No special handling for accumulation-vs-retirement phase**. Same rule applies to both phases (the user explicitly requested this; helps users who want their accumulation-phase cash automatically invested too).
