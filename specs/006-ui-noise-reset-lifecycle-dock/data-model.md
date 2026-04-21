# Data Model — 006 UI Noise Reset + Lifecycle Dock

**Feature**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)
**Research**: [research.md](./research.md)

The feature is UI-only — no schema changes to calc modules, no new CSV columns, no new calc state. The entities below are interaction-state and presentation-state only.

---

## 1. Sidebar Pin Preference

User's persisted choice of whether to keep the lifecycle sidebar docked.

| Field | Type | Values | Notes |
|-------|------|--------|-------|
| value | string | `'1'` or `'0'` | localStorage convention |
| key (RR) | string | `fire_dashboard_sidebar_pinned` | Per-file namespace |
| key (Generic) | string | `fire_dashboard_generic_sidebar_pinned` | Per-file namespace |

**Lifecycle**:
- Read ONCE on page init, before the sidebar DOM mounts.
- Written synchronously on every user-initiated pin/unpin toggle.
- Not wiped by `GENERIC_VERSION` bump (isolated from calc-state wipe).
- Missing value → default to `'0'` (unpinned).

**Validation**: Any value other than `'1'` is treated as `'0'`.

**State transitions**:

```
                user clicks pin
[unpinned] ──────────────────────▶ [pinned]
     ▲                                │
     │         user clicks unpin      │
     └────────────────────────────────┘
```

---

## 2. Sticky-Header State

Runtime-only (not persisted). Drives the expanded↔compact animation.

| State | Meaning | CSS class applied |
|-------|---------|-------------------|
| `expanded` | Scroll position is above the ~80px threshold. Default. | _(no class — base state)_ |
| `compact` | Scroll position has passed the threshold. | `.header--compact` on `<header>` |

**State transitions**:

```
               IntersectionObserver: sentinel not intersecting
[expanded] ──────────────────────────────────────────▶ [compact]
     ▲                                                    │
     │        IntersectionObserver: sentinel intersecting │
     └────────────────────────────────────────────────────┘
```

**Sentinel**: A 1px-tall invisible element placed immediately above the header, inside `<body>` and above `<header>`. Its intersection with the viewport is the authoritative signal for which state the header should be in.

**Invariants**:
- The header never reaches a "between" state during the animation — CSS handles the tween. JS only flips the class.
- If `prefers-reduced-motion: reduce`, CSS transition duration collapses to 0ms; state switches are instant.

---

## 3. Sidebar Runtime State

Runtime interaction state. Derived from Sidebar Pin Preference + viewport width + explicit user toggles.

| Field | Type | Values | Notes |
|-------|------|--------|-------|
| mode | enum | `hidden` / `docked` / `overlay` | Current display mode |
| viewport | enum | `desktop` (≥780px) / `mobile` (<780px) | Updated on `resize` |

**Mode transitions**:

| From | To | Trigger |
|------|----|---------|
| `hidden` | `docked` | User pins on desktop viewport |
| `hidden` | `overlay` | User opens on mobile viewport |
| `docked` | `hidden` | User unpins on desktop |
| `overlay` | `hidden` | User closes (X button, click scrim, Escape) |
| `docked` | `overlay` | Viewport crosses 780px threshold getting narrower WHILE docked |
| `overlay` | `docked` | Viewport crosses 780px threshold getting wider AND pin preference is `'1'` |

**Invariants**:
- `docked` mode only possible on desktop viewport.
- `overlay` mode only possible on mobile viewport.
- Sidebar Pin Preference (persisted) governs docked/hidden on desktop; it does not govern overlay/hidden on mobile (overlay is a transient open-on-demand mode).

---

## 4. Live Headline Snapshot

A view into existing calc outputs surfaced in the compact header. Not persisted; not a new data source.

| Field | Source | Display format |
|-------|--------|----------------|
| yearsToFire | `_lastKpiSnapshot.yearsToFire` | Integer, e.g., `"11"` |
| progressPct | `_lastKpiSnapshot.progressPct` | Integer %, e.g., `"58%"` |
| fireStatus | `_lastKpiSnapshot.fireStatus` | Enum: `on-track` / `warning` / `behind` — drives badge color |

**Update cadence**: Same as the KPI cards — re-rendered on every `chartState.onChange` event.

**Fallback on cold state**: If `_lastKpiSnapshot` is undefined (first paint before initial `recalcAll`), show em-dash (`—`) placeholders. Never show `NaN`, `undefined`, or `"Calculating…"`.

---

## 5. Section Divider Metadata

Ordered list of semantic groupings that introduce the new uppercase-kicker treatment. Static; hard-coded in each HTML file in the same order.

| Order | i18n key | EN label | zh-TW label | Groups these cards (reference) |
|-------|----------|----------|-------------|-------------------------------|
| 1 | `section.profile` | `Profile & Plan` | `檔案與計劃` | Profile & Income, Current Assets, Projections/Returns, (RR) healthcare/2nd-home/college controls |
| 2 | `section.outlook` | `Outlook` | `前景預測` | Lifecycle chart, Lifetime Withdrawal, Roth Ladder, Social Security |
| 3 | `section.compare` | `Compare` | `比較` | Scenario country grid, FIRE-by-Country chart, Milestone Timeline |
| 4 | `section.track` | `Track` | `追蹤` | Snapshot History, CSV controls |

**Visual treatment**: Small uppercase kicker with letter-spacing, dim color, thin top-border → visually separates groups without adding card chrome. Non-interactive; no hover.

---

## 6. Surface Tier Metadata (presentation policy)

Not an entity per se — a policy table applied by CSS class selection. Captured here so the task list is unambiguous about which cards get which treatment.

| Tier | CSS class (additive) | Background | Used for |
|------|---------------------|------------|----------|
| primary | `.surface--primary` (default for existing `.card`) | `var(--card)` filled | KPI row, FIRE-status bar, input panels, snapshot table, scenario cards, healthcare-overrides card, mortgage/college/2nd-home input panels |
| secondary | `.surface--secondary` | `transparent` | Chart wrappers: Full Portfolio Lifecycle, Lifetime Strategy, Roth Ladder, Social Security, Net Worth Pie, Expense Pie, Country Chart, Timeline, Healthcare Chart |

**Both tiers keep**: `1px solid var(--border)`, `border-radius: 16px`, existing padding.
**Only primary tier keeps**: filled background.
**Only interactive cards keep**: `:hover { border-color: var(--accent) }` — scenario cards and snapshot rows.

---

## 7. Compact-Header Stat Chip

Presentation element only. Two chips per compact header: "Years to FIRE" and "Progress". Each is a small pill showing a dim label + a neutral-colored value.

```
┌─────────────────────────────────────────────────────────────────────┐
│  R&R FIRE    Years to FIRE  11    Progress  58%    ● On Track  [EN|中文]  [⚓]  │
└─────────────────────────────────────────────────────────────────────┘
```

The chips do NOT use accent color on the value (per FR-021 — neutral `--text`). The status badge (● On Track / ⚠ Warning / ● Behind) keeps its colored dot indicator, but the dot is the only colored element in that chip.

---

## 8. No schema changes

| Area | Impact |
|------|--------|
| `FIRE-snapshots.csv` | None. No new columns; ordering unchanged. |
| `calc/*.js` modules | None, except `Consumers:` comment bookkeeping (Constitution VI). |
| `TRANSLATIONS.en` / `TRANSLATIONS.zh` | Additive: ~5 new keys per file (see [contracts/visual-system.contract.md](./contracts/visual-system.contract.md)). |
| `PERSIST_IDS` | Unchanged. Sidebar preference uses a standalone key outside the PERSIST_IDS cycle. |
| `SNAPSHOT_KEY` | Unchanged. |
| `GENERIC_VERSION` | Not bumped. Sidebar preference is isolated from the wipe. |
