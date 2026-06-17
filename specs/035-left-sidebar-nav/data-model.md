# Phase 1 Data Model: Left-Sidebar Navigation

This is a layout/navigation feature — there is **no persisted data model change** (no CSV
columns, no new `localStorage` schema, no calc entities). The "model" here is the in-DOM
navigation UI state, which is **already owned by `window.tabRouter`** and is reused unchanged.
Documented for completeness and to make the contract testable.

## UI-State Entities

### NavSelection (existing — owned by `tabRouter`, unchanged)

The single source of truth for which view is showing.

| Field | Type | Notes |
|-------|------|-------|
| `tab` | enum: `plan` \| `geography` \| `retirement` \| `history` \| `audit` | Exactly one active at a time |
| `pill` | string (per-tab pill id, e.g. `withdrawal`, `lifecycle`) | Exactly one active per active tab; contextual to `tab` |

- **Identity/uniqueness**: one active `tab`; one active `pill` within that tab.
- **Persistence**: already persisted by `tabRouter` via `localStorage` (unchanged by this
  feature).
- **Transitions**: selecting a tab activates that tab + its remembered/first pill; selecting a
  pill activates it within the current tab. **Transition logic is unchanged** — only the DOM
  location of the trigger buttons moves.

### RailPresentation (new — ephemeral, derived; not persisted)

Drives the accordion + responsive shell. Derived from `NavSelection.tab` and viewport width.

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `activeTab` | mirrors `NavSelection.tab` | `#navRail[data-active-tab]` set in `onAfterActivate` | CSS shows only the matching `.pill-bar` (accordion expand) |
| `drawerOpen` | boolean | toggled by `#navDrawerToggle` | Mobile only; ephemeral; resets closed on load/resize-to-desktop |
| `isNarrow` | boolean | CSS media query (existing mobile breakpoint) | When true → rail is off-canvas + drawer toggle visible |

- **Invariant**: `activeTab` ALWAYS equals `tabRouter`'s active tab (set in the same
  `onAfterActivate` callback) — no independent copy of navigation state is introduced
  (Principle III).
- **Invariant**: at most one `.pill-bar` is visible in the rail at any time (the active tab's).
- **Reset rule**: `drawerOpen` is forced false when the viewport crosses to desktop width and
  after any tab/pill selection.

## Non-entities (explicitly unchanged)

- `.pill-host` content panels, `.tab-panel` sections — stay in the content column; same
  show/hide semantics.
- Mode (`#gateSelector` Safe/Exact/DWZ) and Withdraw Strategy toggles — remain in the header
  band; not part of the rail (clarified).
- `--header-height` / `--gate-bottom` CSS variables — retained (header→gate stack still
  sticky). `--tabbar-bottom` — no longer consumed by layout after the move.
