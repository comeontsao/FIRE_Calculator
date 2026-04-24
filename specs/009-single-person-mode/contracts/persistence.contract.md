# Contract — localStorage Persistence

**Scope:** `FIRE-Dashboard-Generic.html` — the Adult counter's state entry in the existing `fire_dashboard_generic_state` blob, plus restoration order.

---

## 1. Additions to `PERSIST_IDS`

Append the string `'adultCount'` to the existing `PERSIST_IDS` array (line ~11428). New array tail:

```javascript
const PERSIST_IDS = [
  // ... existing entries unchanged ...
  // Feature 007 — Bracket-Fill Tax Smoothing
  'safetyMargin', 'rule55Enabled', 'rule55SeparationAge', 'irmaaThreshold',
  // Feature 009 — Single-Person Mode
  'adultCount',
];
```

No other changes to `PERSIST_IDS`.

---

## 2. `saveState()` — no structural change

The existing `saveState()` iterates `PERSIST_IDS` and writes `el.value` for non-checkbox inputs. The `#adultCount` hidden input has `value="1"` or `value="2"` at all times, so it is picked up automatically. No custom code path required.

---

## 3. `restoreState()` — restoration order contract

The Adult counter interacts with feature-007 defaults wiring. Restoration order matters:

1. `PERSIST_IDS.forEach` (already in the function) restores `adultCount` along with every other input.
2. **After** the loop — and **before** the existing call to `_wireFilingStatusEditTracking` — call:
   - `syncAdultCountVisibility()` — hide/show Person 2 input-groups based on restored `adultCount`.
   - Reset counter button `disabled` states to match the restored value.
3. **After** `_wireFilingStatusEditTracking` — the existing code at the bottom of `restoreState` that calls `applyFilingStatusDefaults(detectMFJ(getInputs()))` already fires the defaults swap correctly because by then `inp.adultCount` is populated and `detectMFJ` will key on it.
4. The `recalcAll()` at the end of `restoreState` (or fired by a subsequent input event) produces the correct charts.

**Why this order:** `_wireFilingStatusEditTracking` attaches `input` listeners that set `data-user-edited='1'` on the first subsequent `input` event. Calling `applyFilingStatusDefaults` BEFORE the tracker is attached is the current pattern (feature 007 comment, line 12215). We preserve that ordering.

---

## 4. Cache-bust strategy

Because the feature adds a new persisted key but doesn't change the shape or semantics of any existing key, the existing `GENERIC_VERSION = 'v3'` check does **not** need to bump. Users upgrading from the pre-feature-009 state blob will find `state.adultCount === undefined`, which:

- Falls through the `if (state[id] !== undefined)` guard inside `restoreState` — the DOM default `value="2"` stays.
- `getInputs()` reads `2` from the DOM (matches the default behavior).
- First `saveState()` after upgrade writes `adultCount = 2` into the blob. Upgrade is silent and backward-compatible.

**If a future feature needs to bump `GENERIC_VERSION`**, the current design tolerates the bump without special-case migration for this key because `2` is always a safe default.

---

## 5. Snapshot localStorage key — deliberately untouched

`SNAPSHOT_KEY = 'fire_dashboard_generic_snapshots'` is a **parallel** localStorage entry that caches snapshot rows as JSON. The Adult column lands in each snapshot's JSON object as a new `adults` field (integer), alongside the CSV schema delta in `contracts/snapshots.contract.md`. No shape migration required; missing `adults` defaults to `2` on read (FR-024).

---

## 6. Reset paths

The existing `resetCache()` helper (around line 12185) calls:

```javascript
localStorage.removeItem('fire_dashboard_generic_state');
localStorage.removeItem('fire_dashboard_generic_snapshots');
```

Both still correct. No new removals required.

---

## 7. Contract tests (Node)

A small round-trip test is added in `tests/unit/` (either new file or extend an existing one) that asserts:

1. `saveState` followed by `restoreState` with a hidden `#adultCount` value of `"1"` leaves the DOM value at `"1"`.
2. A blob with no `adultCount` key restores to DOM default `"2"`.
3. `getInputs()` on a restored DOM with `#adultCount === "1"` returns `inp.adultCount === 1`.

These tests exercise DOM state via JSDom or a minimal `document`-stub shim similar to the one used in existing persistence-adjacent tests.

---

## 8. Non-goals

- Migration from RR (`FIRE-Dashboard.html`) state — RR has no `adultCount` key and never will (FR-029).
- Per-user cloud sync — out of scope (no server).
- Merging the Generic and RR state blobs — out of scope.
