# Phase 0 Research: Left-Sidebar Navigation

All decisions below are grounded in the current implementation of `FIRE-Dashboard.html`
(and its lockstep twin). No `NEEDS CLARIFICATION` remained after the spec clarification
session; this document records the technical approach and the alternatives weighed.

## Current architecture (as-found)

- **Sticky chrome stack** (top→down), composed by a live `ResizeObserver`:
  `#siteHeader` (z-index 100) → `#gateSelector` (z-60, mode + Withdraw Strategy) →
  `#tabBar.tab-bar` (z-50, the 5 primary tabs) → per-tab `.pill-bar` (z-40).
- **CSS variable chain**: `--header-height` (header bottom) → `#gateSelector top` reads it;
  `--gate-bottom` → `.tab-bar top`; `--tabbar-bottom` → `.pill-bar top`. The observer
  republishes these on resize, and `_rebindStickyHeaderObserver(tab)` re-targets the active
  tab's pill-bar (because each tab owns its own pill-bar).
- **Pill-bars are per-tab and nested in content**: each `.tab-panel` (`#tab-plan`,
  `#tab-retirement`, …) contains its own `<nav class="pill-bar">` as a *direct child*,
  followed by `.pill-host` content panels. Inactive tab panels are `hidden`, so today the
  inactive pill-bars hide along with their panel.
- **Navigation owner**: `window.tabRouter.init({...})` (an existing module). Its config
  resolves elements by selector:
  - `tabBarEl: #tabBar`
  - `pillBarsByTab: { plan: '#tab-plan > .pill-bar', … }`
  - `getTabButton/getPillButton/getPillHost`: data-attribute selectors
    (`.pill[data-tab][data-pill]`, `.pill-host[data-tab][data-pill]`).
  - `onAfterActivate(state)` → calls `_rebindStickyHeaderObserver(state.tab)` and a few
    per-pill render hooks (audit, milestone timeline layout).
- An existing unrelated `--sidebar-width` variable (`:root`, set at runtime ~line 20545) is
  used by another panel. **Do NOT reuse that name** for the nav rail.

## Decision 1 — Relocate DOM nodes into `#navRail`; keep `.pill-host` in content

**Decision**: Introduce a new flex/grid layout below `#gateSelector`: a left column
`#navRail` + a right `#contentArea`. Physically move `#tabBar` and all five `.pill-bar`
nodes into `#navRail`; leave every `.pill-host` (content) where it is, inside the
`.tab-panel`s in `#contentArea`.

**Rationale**: `tabRouter` shows/hides content by toggling `.pill-host` + `.tab-panel`
`hidden` and `.active`/`aria-selected` on buttons — all by data-attribute selectors that are
**location-independent**. Only the two config entries that use *structural* selectors
(`pillBarsByTab`'s `#tab-X > .pill-bar`) break when pill-bars move, so those are updated to
resolve the bars in their new `#navRail` home (e.g. `#navRail .pill-bar[data-tab="plan"]`).

**Alternatives considered**:
- *CSS-only relocation* (leave DOM, reposition with `position`/`order`): rejected — pill-bars
  are nested inside content panels that are `hidden` when inactive; you cannot lift a
  descendant of a hidden, content-flow panel into a left rail reliably without moving it.
- *Rewrite navigation from scratch*: rejected — violates "don't change button functions" and
  discards a working, tested state machine. Reuse is safer (FR-003).

## Decision 2 — Accordion via a single `data-active-tab` attribute on `#navRail`

**Decision**: Render tabs as a vertical list. The active tab's pill-bar is shown; all others
hidden. Drive visibility with CSS keyed off `#navRail[data-active-tab="X"]`:
`#navRail .pill-bar { display:none } #navRail[data-active-tab="plan"] .pill-bar[data-tab="plan"]{ display:flex }`.
Set `data-active-tab` in `tabRouter`'s existing `onAfterActivate(state)` hook (one line).

**Rationale**: Keeps "exactly one tab expanded" in lockstep with the router's own active-tab
state (single source of truth, Principle III) without touching the router core. Pure CSS
expand/collapse → file://-safe, no animation dependency (a CSS height/opacity transition may
be added for polish).

**Alternatives**: per-pill-bar `hidden` toggling inside the router — rejected as it spreads
visibility logic into JS when one CSS rule + one attribute suffices.

## Decision 3 — Sticky-chrome rewire

**Decision**: After the move the **top sticky stack is only `#siteHeader` → `#gateSelector`**.
`#navRail` becomes a sticky left column with `top: var(--gate-bottom)` and
`max-height: calc(100vh - var(--gate-bottom))` with internal `overflow:auto` (so a long pill
list scrolls within the rail, not the page). The content area no longer offsets for
`--tabbar-bottom`. Simplify `_rebindStickyHeaderObserver`: it no longer needs to track the
active pill-bar height for a top band; it keeps publishing `--header-height`/`--gate-bottom`.
`--tabbar-bottom` becomes unused by layout (retain the var to avoid breaking any stray
reference, or remove its consumers in both files together).

**Z-index**: `#navRail` sits in normal flow under the gate band → assign z-index **50**
(at/below `#gateSelector`'s 60; it must never overlap the gate/header). The **mobile drawer**
is a floating interactive overlay → assign z-index **65** (clears `#gateSelector` 60 per the
Sticky-Chrome rule "interactive floating element > 60", stays below `.override-confirm` 70 and
`#siteHeader` 100). Document this in the contract.

**Rationale**: Honors the canonical hierarchy; the rail is chrome but left-positioned so it
must not beat the top bands; the drawer is a true overlay so it follows the >60 rule.

## Decision 4 — Mobile: hamburger drawer

**Decision**: Below a breakpoint (reuse the dashboard's existing mobile breakpoint), hide
`#navRail` off-canvas (translateX) and show a ☰ toggle button (placed in/near the gate band or
header-adjacent). Toggling reveals the rail as an overlay with a scrim; selecting a tab/pill
closes the drawer. Desktop is unaffected.

**Rationale**: Standard, dependency-free, keeps content full-width on phones (FR-007, SC-003).
The toggle is a single new control needing a bilingual accessible label (Principle VII).

**Alternatives**: icon-rail (rejected in clarification), revert-to-top (rejected in
clarification).

## Decision 5 — `tabRouter` config update surface (minimal, behavior-preserving)

**Decision**: The only JS edits are:
1. `pillBarsByTab` selectors → point at `#navRail .pill-bar[data-tab="X"]`.
2. `onAfterActivate` → add `navRail.setAttribute('data-active-tab', state.tab)` (accordion).
3. `_rebindStickyHeaderObserver` → drop the pill-bar-top tracking (top stack no longer
   includes pill-bar); keep header/gate publishing.
No change to `getTabButton/getPillButton/getPillHost`, the activation order, the panel
show/hide, keyboard handling, or the `TABS` config — so **every button does exactly what it
did** (FR-003, US2).

**Rationale**: Smallest diff that satisfies the move; preserves the tested state machine.

## Decision 6 — Naming & lockstep guardrails

- New container ids/classes: `#navRail`, `.nav-rail`, `#navDrawerToggle`, `.nav-scrim`,
  CSS var `--navrail-width` (NOT `--sidebar-width`, which is already taken).
- All markup, CSS, JS-config, and i18n changes are applied **identically** to both HTML files
  in the same change set (Principle I). The Generic file has no estimator-style divergence
  here — navigation chrome is shared, so it is byte-identical except personal header content.

## Open risks / mitigations

- **Selector drift**: if any code elsewhere queries `#tab-X > .pill-bar` (direct child), it
  breaks after the move. *Mitigation*: grep both files for `> .pill-bar` and `.pill-bar`
  before editing; update every structural reference in the same commit (caller-audit lesson).
- **Sticky inside scroll containers**: `position:sticky` fails if an ancestor has
  `overflow:hidden`. *Mitigation*: verify the rail's ancestor chain allows sticky; the rail
  itself owns the internal scroll, not an ancestor.
- **file:// regression**: no new module/fetch is introduced, so file:// stays green; verify
  with `console-probe.mjs` on both files.
