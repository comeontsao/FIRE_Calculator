# Contract: Left-Sidebar Navigation (UI)

This dashboard has no external API; its "interface" is the UI navigation contract. This
document pins what MUST hold after the navigation chrome is relocated to the left sidebar.
It is the reference for the Playwright spec (`tests/e2e/left-sidebar-nav.spec.ts`).

## Layout contract

| Region | Before | After |
|--------|--------|-------|
| `#siteHeader` | top, full-width, sticky (z-100) | **unchanged** |
| `#gateSelector` (mode + Withdraw Strategy) | sticky band under header (z-60) | **unchanged** (stays in header band) |
| `#tabBar` (5 primary tabs) | sticky top band (z-50) | moved into `#navRail` (left, accordion headers) |
| per-tab `.pill-bar` | sticky top band per active tab (z-40), nested in `.tab-panel` | moved into `#navRail`; only the active tab's bar is shown (accordion body) |
| `.pill-host` content | content column | **unchanged** (stays in `#contentArea`) |
| `#navRail` (new) | — | sticky left column, `top: var(--gate-bottom)`, internal `overflow:auto`, z-50 |
| `#navDrawerToggle` + `.nav-scrim` (new) | — | mobile only; drawer overlay z-65 |

## Behavioral contract (MUST hold — "don't change button functions")

1. **Tab selection**: clicking a tab in `#navRail` activates the same `.tab-panel`, marks the
   tab `aria-selected="true"` / `.active`, and reveals the same set of pills as before.
2. **Pill selection**: clicking a pill activates the same `.pill-host`, marks it active, and
   produces the identical content as before the move.
3. **Accordion**: exactly one tab's `.pill-bar` is visible at a time — the active tab's;
   `#navRail[data-active-tab]` always equals `tabRouter`'s active tab.
4. **Mode + Withdraw Strategy** toggles remain in the header band and behave identically
   (verdict/chart/preview updates unchanged).
5. **Active-state styling**: the current tab and current pill are visibly highlighted using
   the existing accent/selected styles.
6. **Sticky**: while scrolling long content on desktop, `#navRail` stays in view; its own
   long pill lists scroll within the rail (page does not need to scroll to reach a pill).
7. **Mobile drawer**: below the mobile breakpoint, `#navRail` is off-canvas and a ☰ toggle is
   shown; opening overlays the rail (z-65, scrim below it); selecting a tab/pill closes the
   drawer; closed state leaves content full-width with **no horizontal scrollbar**.
8. **No write-back to navigation logic**: `tabRouter`'s activation order, keyboard handling,
   `getTabButton/getPillButton/getPillHost`, and `TABS` config are unchanged; only
   `pillBarsByTab` selectors + the `onAfterActivate` accordion hook + the sticky observer are
   adjusted.
9. **Lockstep**: identical layout + behavior in `FIRE-Dashboard.html` and
   `FIRE-Dashboard-Generic.html`.

## Sticky-Chrome variable contract (post-move)

| Variable | Producer | Consumer (after move) |
|----------|----------|-----------------------|
| `--header-height` | `#siteHeader` bottom (ResizeObserver) | `#gateSelector top` (unchanged) |
| `--gate-bottom` | `#gateSelector` bottom | `.tab-bar`/old consumer → now **`#navRail top`** |
| `--tabbar-bottom` | (was) `#tabBar` bottom | **no layout consumer** after move (tabs are in the rail) |
| `--navrail-width` (new) | fixed/responsive rail width | `#contentArea` left offset / grid column |

Z-index hierarchy (unchanged canonical values; new elements slot in):
`#siteHeader` 100 > `.override-confirm` 70 > **`.nav-scrim`/drawer 65** > `#gateSelector` 60 >
**`#navRail` 50** > content < 40.

## Verification hooks

- E2E: `tests/e2e/left-sidebar-nav.spec.ts` asserts the layout + all behavioral items above,
  for both dashboards, at desktop and narrow viewports.
- Cold-load: `node tools/console-probe.mjs <file>` → `errorCount: 0` on both files.
- i18n: the drawer toggle's accessible label present in EN + zh-TW dicts (both files) and in
  `FIRE-Dashboard Translation Catalog.md`.
