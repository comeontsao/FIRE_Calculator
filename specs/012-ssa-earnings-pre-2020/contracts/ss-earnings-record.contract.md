# Contract — `calc/ssEarningsRecord.js`

**Feature**: `specs/012-ssa-earnings-pre-2020/spec.md`
**Module**: `calc/ssEarningsRecord.js` (NEW)

## Purpose

Pure helpers that produce and validate `SSEarningsHistory` arrays (see data-model.md §2). Called by the HTML dashboard's inline UI handlers; called by Node unit tests. No DOM, no Chart.js, no globals, no I/O.

## Module-header fenced comment (required per constitution Principle II)

```
/*
 * calc/ssEarningsRecord.js — SSEarningsHistory builder + validator.
 *
 * Inputs:
 *   - history: SSEarningsHistory (possibly empty)
 *   - Optional { floor = EARLIEST_ALLOWED_YEAR }
 *
 * Outputs:
 *   - { history: SSEarningsHistory, reason: ReasonCode | null }
 *
 * Consumers:
 *   - FIRE-Dashboard-Generic.html → addSSPriorYear() and setEarliestYear() UI handlers
 *   - tests/unit/ssEarningsRecord.test.js
 *
 * Invariants:
 *   - History is strictly ascending by year with unique integer year values.
 *   - earnings is a non-negative finite number; NaN/±Infinity are rejected.
 *   - history[0].year >= floor (default 1960).
 *   - Helpers are pure: inputs are never mutated; outputs are always a new array.
 *
 * Purity: no DOM, no Chart.js, no globals, no I/O, no module-scope mutation.
 */
```

## Exports

### `EARLIEST_ALLOWED_YEAR: number`

Constant. Value: `1960`.

### `ReasonCode` (string literal union)

`'floorReached' | 'noopAlreadyCovered' | 'clampedToFloor' | 'invalidTarget' | 'duplicateYear' | null`

Returned alongside the result array to explain why a no-op occurred (or `null` when the operation succeeded cleanly).

### `prependPriorYear(history, options?): { history: SSEarningsHistory, reason: ReasonCode | null }`

**Inputs**:

- `history: SSEarningsHistory` — possibly empty.
- `options?: { floor?: number, currentYear?: number }` — `floor` defaults to `EARLIEST_ALLOWED_YEAR`; `currentYear` defaults to `new Date().getFullYear()` and is used only when `history` is empty (we then seed with `currentYear - 1`).

**Behaviour**:

| Input shape | Output `history` | Output `reason` |
|-------------|------------------|-----------------|
| `[]` (empty) | `[{year: currentYear - 1, earnings: 0, credits: 4}]` | `null` |
| `[{year: floor, ...}, ...]` (already at floor) | *same array reference* | `'floorReached'` |
| `[{year: Y, ...}, ...]` with `Y - 1 >= floor` | `[{year: Y - 1, earnings: 0, credits: 4}, ...original rows]` — new array | `null` |

**Invariants**: I1–I5 from data-model.md are preserved. Input `history` is never mutated.

### `setEarliestYear(history, target, options?): { history: SSEarningsHistory, reason: ReasonCode | null }`

**Inputs**:

- `history: SSEarningsHistory` — possibly empty.
- `target: number` — desired earliest year (integer). Non-integer, NaN, Infinity, or non-number values are rejected.
- `options?: { floor?: number, currentYear?: number }` — same semantics as `prependPriorYear`.

**Behaviour**:

| Condition | Output `history` | Output `reason` |
|-----------|------------------|-----------------|
| `!Number.isInteger(target)` or `target < 0` | *same array reference* | `'invalidTarget'` |
| `target < floor` | Bulk-prepend from `floor..firstYear-1` if room; `reason` set to `'clampedToFloor'` (caller can show a hint). | `'clampedToFloor'` |
| `history.length === 0 && target >= floor` | `[{year: target, earnings: 0, credits: 4}, ...synthetic years from target+1 to currentYear-1 each earnings:0, credits:4]` — **UI typically only fills `target`; implementation note says only fill `target` and any intermediate rows remain for the caller's discretion.** (See note below.) | `null` |
| `history.length > 0 && target >= history[0].year` | *same array reference* | `'noopAlreadyCovered'` |
| `history.length > 0 && target < history[0].year && target >= floor` | `[{year: target, earnings: 0, credits: 4}, {year: target+1, ...}, ..., {year: firstYear-1, ...}, ...original]` — new array | `null` |

**Implementation note for the empty-history edge case**: to match the UI contract in `ss-ui-controls.contract.md`, when `history.length === 0` the helper SHOULD return a single-row result `[{year: target, earnings: 0, credits: 4}]` and let subsequent user interactions (via `addSSYear()` or manual typing) fill any intermediate years. This keeps the UX predictable: setting "earliest year = 1995" on an empty record creates one row for 1995, not 30 rows from 1995 to 2024. Tests lock this convention.

**Invariants**: I1–I5 preserved. Input `history` is never mutated.

### `isValidRow(row): boolean`

**Input**: any value.

**Returns**: `true` iff `row` has the shape `{year, earnings, credits}` where:

- `year` is a finite integer in `[EARLIEST_ALLOWED_YEAR, <any future year>]` (no hard upper bound — caller's responsibility if they want one).
- `earnings` is a finite non-negative number (NaN and ±Infinity rejected).
- `credits` is an integer in `[0, 4]`.

Pure. No side effects.

### `sortedAscendingUnique(history): SSEarningsHistory`

Internal utility (not exported, or exported for defense-in-depth testing — decision at implementation time). Returns a **new array** sorted ascending by year with duplicate years removed (last-write-wins semantics). Used by tests to verify invariant preservation.

## Error handling

- The helpers **never throw** for in-domain inputs. They return `{history, reason}` where `reason !== null` indicates a rejected/clamped operation.
- The helpers MAY throw `TypeError` if `history` is not an array or contains a non-object row — this is a programmer error, not a user error, and should fail loud in tests.

## Performance

- `prependPriorYear`: O(n) for array copy (n = history length). n ≤ 60 in realistic records.
- `setEarliestYear`: O(n + k) where k = number of years to prepend. Bulk prepend of 40 years: ≤ 100 µs on mid-range laptop.

## Test coverage (from research.md §R4)

10 cases minimum in `tests/unit/ssEarningsRecord.test.js`:

1. `prependPriorYear` — default record (2020–2025) → result first row is `{year: 2019, earnings: 0, credits: 4}`, reason `null`.
2. `prependPriorYear` — record at floor (first row `year: 1960`) → result is same reference, reason `'floorReached'`.
3. `prependPriorYear` — empty record, `currentYear: 2026` → result is `[{year: 2025, earnings: 0, credits: 4}]`, reason `null`.
4. `prependPriorYear` — input array identity is preserved (success case returns a different reference, no-op case returns same reference).
5. `setEarliestYear(history, 2015)` on default (2020–2025) → result length 11, result[0].year === 2015, result[4].year === 2019, result[5].year === 2020.
6. `setEarliestYear(history, 2025)` on default → same reference, reason `'noopAlreadyCovered'`.
7. `setEarliestYear(history, 1950)` on default → first row `year: 1960`, reason `'clampedToFloor'`, length = 6 + (2019 − 1960 + 1) = 66.
8. `sortedAscendingUnique([{year:2020,...},{year:2019,...},{year:2020,...}])` → length 2, years `[2019, 2020]`, last-write-wins for duplicates.
9. Mixed-operation invariant: apply `prependPriorYear` 3× then `setEarliestYear(history, 2005)` then `addSSYear` 2× (simulated by caller) — final array is strictly ascending, no duplicates, first row ≥ 1960.
10. Integration: fixture `ss-earnings-1995-2025` fed through `projectSS` from `calc/socialSecurity.js` → `annualBenefitReal` strictly greater than the same fixture truncated to 2020–2025.

## Versioning

This is `calc/ssEarningsRecord.js` v1.0.0. Future additions (e.g., `insertSpecificYear(history, year)`) MUST preserve the public API signatures above.
