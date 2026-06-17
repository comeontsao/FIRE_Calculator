# Implementation Plan: Left-Sidebar Navigation

**Branch**: `035-left-sidebar-nav` | **Date**: 2026-06-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/035-left-sidebar-nav/spec.md`

## Summary

Relocate the **primary tab group** (`#tabBar`) and the **per-tab contextual pill-bars**
(`#tab-* > .pill-bar`) out of the top sticky stack into a **persistent, sticky left sidebar
(`#navRail`)** rendered as an accordion: tabs listed vertically, the active tab expanded to
reveal its pills. The **header (`#siteHeader`) and the mode + Withdraw Strategy band
(`#gateSelector`) remain at the top** (per clarification — only two rows move). On narrow
viewports the rail collapses behind a ☰ toggle and opens as an overlay drawer. **No button
behavior changes**: navigation stays owned by `window.tabRouter`; we relocate the DOM nodes,
update the router's element-resolution config + the sticky-chrome `ResizeObserver` chain, and
restyle — the activation state machine, content panels (`.pill-host`), and all click handlers
are untouched. Shipped to both dashboards (lockstep).

## Technical Context

**Language/Version**: Vanilla ES5-compatible JS, HTML5, inline CSS with the existing
dark-theme CSS-variable system. No transpile.
**Primary Dependencies**: Chart.js (CDN, unchanged). `window.tabRouter` / `window.TABS`
(existing nav module). **No new dependencies.**
**Storage**: N/A — no persistence change. (Drawer open/closed is ephemeral UI state; not
persisted. Active tab/pill persistence is already handled by `tabRouter` + `localStorage` and
is unchanged.)
**Testing**: Playwright E2E (navigation parity + responsive); `node tools/console-probe.mjs`
for cold-load error check. No Node unit tests (no calc module touched).
**Target Platform**: Modern desktop + mobile browsers; MUST work under `file://` (double-click).
**Project Type**: Two single-file HTML dashboards (`FIRE-Dashboard.html` RR,
`FIRE-Dashboard-Generic.html` Generic).
**Performance Goals**: No regression — sidebar sticky scroll must not jank; first chart still
renders < 1 s; drag interactions still ≥ 30 fps.
**Constraints**: `file://`-compatible (no new ES-module loads); preserve dark-theme variables
and selected-state styling; mobile-responsive; respect the Sticky-Chrome z-index hierarchy.
**Scale/Scope**: The navigation chrome region + content top-offset in both HTML files; ~1 new
CSS block + markup move + a small tabRouter-config/observer rewire + 1 drawer toggle + i18n.

No `NEEDS CLARIFICATION` — all open UX decisions were resolved in the 2026-06-16
clarification session (accordion / sticky / hamburger drawer / mode-strategy-stays-in-header).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Relevance | Verdict |
|-----------|-----------|---------|
| I. Dual-Dashboard Lockstep | Both HTML files get identical chrome/CSS/JS changes | ✅ PASS — plan mandates both; shared nav is identical |
| II. Pure Calc Modules | No calc module touched | ✅ N/A |
| III. Single Source of Truth (state) | Active tab/pill state still owned solely by `tabRouter` | ✅ PASS — we relocate DOM + reconfigure resolvers; no second state source introduced |
| IV. Gold-Standard Regression | No calc fixtures affected; navigation covered by E2E | ✅ PASS — extend E2E parity/responsive; existing suites stay green |
| V. Zero-Build / file:// | Pure CSS/HTML/JS; no new module loads, no ES-module calc | ✅ PASS |
| VI. Chart ↔ Module Contracts | No chart/module relationship changes | ✅ N/A |
| VII. Bilingual First-Class | New drawer toggle needs an accessible label + any visible text | ✅ PASS — EN + zh-TW + catalog in same change set |
| VIII / IX (spending / mode-objective) | Calc-engine principles | ✅ N/A |
| Additional: Sticky-Chrome Discipline | We restructure the header→gate→tab→pill sticky stack | ✅ PASS — see Phase 0; top stack reduces to header→gate; rail consumes `--gate-bottom`; z-index assigned below `#gateSelector` (60); mobile drawer justified |
| Additional: Mobile-responsive | Required | ✅ PASS — hamburger drawer |
| Additional: File-Protocol Delivery | Must keep working via `file://` | ✅ PASS — no new fetch/module |

**Result: PASS, no violations.** Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/035-left-sidebar-nav/
├── plan.md              # This file
├── research.md          # Phase 0 — sticky-chrome rewire, accordion, drawer, z-index, selector-resolution
├── data-model.md        # Phase 1 — navigation UI-state model (no persisted data)
├── quickstart.md        # Phase 1 — manual + automated verification steps
├── contracts/
│   └── ui-navigation.contract.md   # Phase 1 — nav interaction + sticky-chrome variable contract
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit.specify)
└── tasks.md             # Phase 2 — created by /speckit.tasks (NOT here)
```

### Source Code (repository root)

```text
FIRE-Dashboard.html              # RR — chrome markup move + #navRail CSS + tabRouter config + sticky observer + drawer toggle + i18n
FIRE-Dashboard-Generic.html      # Generic — identical changes (lockstep)
FIRE-Dashboard Translation Catalog.md  # new i18n keys (drawer toggle label)
tests/e2e/
└── left-sidebar-nav.spec.ts     # new — sidebar render, accordion, navigation parity, sticky, mobile drawer, Generic parity
```

**Structure Decision**: No new source directories. This is an in-place layout change to the
two existing single-file dashboards plus a new Playwright spec. The navigation **behavior**
module (`window.tabRouter`) is reused as-is; only its `init(config)` element-resolution
selectors and the `onAfterActivate` sticky hook are adjusted to the relocated DOM. A new
left-rail container `#navRail` hosts the moved `#tabBar` and the five `.pill-bar` nodes; the
`.pill-host` content panels remain in the content column.

## Complexity Tracking

> No Constitution violations — section intentionally empty.
