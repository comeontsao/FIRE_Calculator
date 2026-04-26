# Data Model — SSA Earnings Record: Support Years Before 2020

**Feature**: `specs/012-ssa-earnings-pre-2020/spec.md`
**Plan**: `specs/012-ssa-earnings-pre-2020/plan.md`
**Date**: 2026-04-24

## Scope

The feature introduces no new storage schema. It tightens the shape and invariants of an **existing** in-memory structure (`ssEarningsHistory` in `FIRE-Dashboard-Generic.html`) that already round-trips through `localStorage` via the `_ssEarningsHistory` key. This document formally describes that structure, its invariants, and the state transitions the new feature adds.

## Entities

### §1. SSEarningsRow

One calendar year of SSA-reported earnings.

| Field | Type | Domain | Notes |
|-------|------|--------|-------|
| `year` | integer | `EARLIEST_ALLOWED_YEAR..currentYear` (1960..2026 today) | No fractional years; no negative years; no future years. |
| `earnings` | number | `[0, +∞)` | Non-negative finite. `NaN` / `±Infinity` are rejected. The UI displays the raw entered amount; the calc layer separately caps per-year contribution at the year's SSA wage base (that clamp lives in the calc module, not in this record). |
| `credits` | integer | `[0, 4]` | Display-only tally indicator for the "Credits: N/40" badge. Default `4` for any year with non-zero earnings, `0` otherwise (existing behaviour). |

**Immutability**: individual rows are replaced as whole objects when edited; mutating `row.earnings` in place is still how the current `updateSSEarning(index, value)` handler works (line 3402) — that's an existing inline mutation that this feature does NOT change.

### §2. SSEarningsHistory

Ordered list of `SSEarningsRow`. Module-level variable `ssEarningsHistory` in `FIRE-Dashboard-Generic.html` (line 3369).

**Type**: `SSEarningsRow[]`.

**Invariants (NEW — enforced by this feature's helpers)**:

- **I1 (strictly ascending by year)**: for all `i` in `[0, history.length - 2]`, `history[i].year < history[i+1].year`.
- **I2 (unique years)**: no two rows share a `year` value.
- **I3 (within floor)**: `history[0].year >= EARLIEST_ALLOWED_YEAR` (1960).
- **I4 (valid rows)**: every row satisfies the `SSEarningsRow` domain above.
- **I5 (immutable helper boundary)**: helper functions never mutate the passed-in `history` array or its rows. Callers receive a new array.

Pre-existing code violates none of these today (the seed at line 3369–3376 is already sorted and unique, and `addSSYear`/`removeSSYear` preserve order). The helpers add **enforcement** rather than **correction** — they reject invalid inputs rather than silently repairing them.

**Serialisation**: `JSON.stringify(ssEarningsHistory)` written to `localStorage.<stateKey>._ssEarningsHistory` by `saveState()` (line 12037). Restored by `restoreState()` (line 12148) with an `Array.isArray` guard. No schema version field is added here; the shape has been stable since feature 001 and the new invariants are backward-compatible with any existing serialised value.

## State Transitions

The five operations that can mutate `SSEarningsHistory` after this feature ships:

| Operation | Before | After | Invariants touched |
|-----------|--------|-------|--------------------|
| `addSSYear()` (existing, unchanged) | `history` with length ≥ 0 | appends `{year: lastYear+1, earnings: projected, credits: 4}` | I1, I2 preserved (lastYear+1 is by construction new and larger). |
| **`addSSPriorYear()` (NEW)** | `history` with length ≥ 0 | prepends `{year: firstYear-1, earnings: 0, credits: 4}` if `firstYear-1 >= floor`; otherwise no-op + status-line message | I1, I2 preserved; I3 enforced (rejects when firstYear === floor). |
| **`setEarliestYear(target)` (NEW)** | `history` with length ≥ 0 | prepends `[target..firstYear-1]` in ascending order; no-op if `target >= firstYear`; clamps `target` up to `floor` if below | I1, I2, I3 enforced. |
| `removeSSYear(index)` (existing, unchanged) | `history[index]` exists | `history` with that index spliced out | I1, I2 preserved (removal never creates duplicates or disorder). |
| `updateSSEarning(index, value)` (existing, unchanged) | `history[index]` exists | `history[index].earnings = parseFloat(value) || 0` | I4 enforced implicitly by the `|| 0` fallback (coerces NaN to 0). |

## Default / Seeded State

Line 3369–3376 seeds the record as:

```text
[
  { year: 2020, earnings: 50000, credits: 4 },
  { year: 2021, earnings: 55000, credits: 4 },
  { year: 2022, earnings: 60000, credits: 4 },
  { year: 2023, earnings: 70000, credits: 4 },
  { year: 2024, earnings: 80000, credits: 4 },
  { year: 2025, earnings: 90000, credits: 4 },
]
```

This seed remains unchanged by this feature. Users can now extend it backward from 2020 to any year ≥ 1960.

## Persistence

- **Write path**: `saveState() → state._ssEarningsHistory = ssEarningsHistory` (no JSON clone — the serialiser handles it). Called after every mutation via `recalcAll` chain (line 12283, 12290).
- **Read path**: `restoreState() → ssEarningsHistory = state._ssEarningsHistory` if the stored value is a non-empty array. Happens once on page boot (line 12798).
- **Migration**: none required. Existing serialised records either already satisfy the new invariants (the seed always did) or were manually edited by the user to satisfy them (rare). The restore path's `Array.isArray` guard covers the malformed case; this feature does NOT add a silent repair pass that would mask data corruption.

## Consumers

- `buildSSEarningsTable()` (renders the table).
- `calcRealisticSSA(inp, fireAge)` — inline, line 6266. Reads `ssEarningsHistory` + derives `allEarnings` via `getFullEarningsHistory(fireAge)`.
- `calc/socialSecurity.js` — `projectSS(params)`, called when the dashboard uses the extracted actual-earnings mode. Reads `earnings.annualEarningsNominal` which is projected from `ssEarningsHistory` via the same `getFullEarningsHistory` shape.

Both consumers are unchanged by this feature — they already iterate over `ssEarningsHistory` in ascending order and use sorted-descending for top-35 selection, so additional ascending rows at the beginning of the array flow through transparently.

## Out of scope for this feature

- Changes to `calc/socialSecurity.js` contract or bend points.
- Per-year SSA wage-base cap (tracked separately; the inline path already clamps at the current-year cap, `SS_EARNINGS_CAP = 168600`, line 3378).
- Multi-currency / non-USD earnings records.
- File-import of SSA statements (PDF/CSV).
- Schema versioning or migration infrastructure for `ssEarningsHistory`.
- RR (`FIRE-Dashboard.html`) parity — forward-looking only; RR file absent from repo.
