# Implementation Plan: UI Noise Reset + Lifecycle Dock

**Branch**: `006-ui-noise-reset-lifecycle-dock` | **Date**: 2026-04-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-ui-noise-reset-lifecycle-dock/spec.md`

## Summary

The spec bundles three coordinated changes into a single feature: (1) convert the page header into a sticky element that collapses to a compact bar below the first screen while surfacing live headline stats (Years-to-FIRE, Progress %); (2) add a right-edge pinnable drawer that mirrors the Full Portfolio Lifecycle chart so the user never loses sight of it while editing inputs; (3) apply a focused noise-reduction pass across both dashboards (surface tiers, KPI color discipline, title typography, filter demotion, emoji trim, progress-bar collapse, footer tip softening).

Technical approach: zero-dependency, inline CSS + vanilla JS consistent with the existing single-file architecture. `position: sticky` for the header (no JS scroll-fixed trickery). A scroll listener (via `IntersectionObserver` with a sentinel element — cheaper and more accurate than `scroll` events) flips a class on the header. The sidebar is a second Chart.js instance that re-uses the existing `chartState.onChange` listener chain already wired for the primary lifecycle chart, so a single state-mutation event drives both renders with no duplicate calc work. Sidebar pin state persists in `localStorage` alongside the existing persistence schema. CSS updates are additive (new `.footer-panel`-style atomic classes) layered on top of the existing CSS-variable dark theme.

## Technical Context

**Language/Version**: Vanilla JavaScript (ES2020+), HTML5, CSS3. No transpilation, no polyfills beyond what Chart.js vendors.

**Primary Dependencies**: Chart.js (already loaded via CDN — unchanged). Existing `calc/` modules (unchanged). Existing `window.chartState` event surface (leveraged, not modified).

**Storage**: `localStorage`. Two new keys:
  - `fire_dashboard_sidebar_pinned` (boolean as `'1'` / `'0'`) — RR file
  - `fire_dashboard_generic_sidebar_pinned` (boolean) — Generic file (gated by the existing `GENERIC_VERSION` wipe mechanism)

**Testing**: Node for unit tests on calc modules (no calc modules change in this feature → existing tests in `tests/unit/`, `tests/baseline/` must stay green as a non-regression check). Manual browser smoke on both HTML files for the UI changes, covering at minimum:
  - Both files open via `file://` and render without console errors.
  - Scroll threshold animates header state correctly (both directions).
  - Sidebar pin/unpin persists across reload.
  - Lifecycle sidebar re-renders on every input change on the same frame as the primary chart.
  - Mobile overlay mode dismisses cleanly.
  - `prefers-reduced-motion: reduce` disables the transition but preserves state correctness.

**Target Platform**: Desktop browsers (Chrome 100+, Edge 100+, Safari 16+, Firefox 110+) and mobile viewports down to iPhone SE width (375px). Offline / `file://` opening remains supported.

**Project Type**: Single-file HTML dashboard, delivered as two parallel files kept in lockstep per Constitution Principle I. Legacy file excluded.

**Performance Goals**:
  - Scroll across the 80px threshold holds 60fps on a mid-range laptop (no layout thrash, no forced reflow in the scroll listener).
  - Sidebar mirror chart re-render stays within one animation frame of the primary chart's render (same requestAnimationFrame tick).
  - Input-change path does NOT gain more than a single additional Chart.js `update()` call (the sidebar mirror). Target: no measurable added latency on slider drag.
  - FIRE marker drag on the lifecycle chart continues to sustain ≥30 fps while the sidebar is pinned (constitution floor).
  - Cold page-load first meaningful paint < 1s on mid-range laptop (constitution floor).

**Constraints**:
  - Zero-build, inline CSS/JS only.
  - No new third-party libraries. No framework, no bundler.
  - Existing CSS-variable dark theme preserved; new styles extend it, no new root colors.
  - Mobile-responsive; breakpoint ~780px.
  - Honor `prefers-reduced-motion: reduce`.
  - The Legacy file (`FIRE-Dashboard - Legacy.html`) stays untouched.

**Scale/Scope**:
  - 2 HTML files modified (~8,900 lines each); Legacy excluded.
  - ~20 Chart.js instances per file (only lifecycle gets a mirrored second instance).
  - ~100 input controls per file (none gain or lose persistence).
  - 2 languages (EN + zh-TW) — all new strings ship in both per Constitution Principle VII.
  - ~5 new i18n keys expected (`filter.label`, `sidebar.pin`, `sidebar.unpin`, `sidebar.close`, `sidebar.caption`, possibly 4 section-divider labels).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against `.specify/memory/constitution.md` v1.1.0.

| # | Principle | Status | Notes |
|---|-----------|--------|-------|
| I | Dual-Dashboard Lockstep | **PASS** | Spec FR-040 mandates both files. Legacy explicitly excluded. Plan dispatches matched edits to both. |
| II | Pure Calculation Modules | **PASS** | No calc modules change. Sidebar mirror chart consumes existing calc outputs. No new DOM access inside calc code. |
| III | Single Source of Truth | **PASS** | Sidebar chart subscribes to the SAME `chartState.onChange` registration used by the primary lifecycle chart. Both charts read fresh `getInputs()` on every render. Compact-header live stats read from `_lastKpiSnapshot` / `chartState`, not a parallel derivation. |
| IV | Gold-Standard Regression Coverage | **PASS** | No calc changes → no fixture changes. Non-regression gate: existing `tests/unit/` and `tests/baseline/browser-smoke.test.js` must stay green. QA tasks list this explicitly. |
| V | Zero-Build, Zero-Dependency Delivery | **PASS** | Spec FR-042 and SC-010 codify this. No build step, no new library, no bundler. Chart.js stays as the only CDN dep. |
| VI | Explicit Chart ↔ Module Contracts | **ACTION REQUIRED — addressed in plan** | The new sidebar mirror chart is a new render site. It MUST declare (in a comment at its render function) which calc module(s) it reads, and the lifecycle module's `Consumers:` list MUST add "lifecycleSidebar" alongside the existing "lifecycleChart". Task list enforces this. |
| VII | Bilingual First-Class (EN + zh-TW) | **ACTION REQUIRED — addressed in plan** | New user-visible strings all ship in EN and zh-TW in the same change: `filter.label`, `sidebar.pin/unpin/close/caption`, any section-divider labels (if introduced). `FIRE-Dashboard Translation Catalog.md` updated in the same commit. Task list enforces this. |

**No unresolved violations.** Items VI and VII are not violations — they are well-understood gates that the task list must make explicit. Complexity Tracking section below is empty.

## Project Structure

### Documentation (this feature)

```text
specs/006-ui-noise-reset-lifecycle-dock/
├── plan.md                                  # This file (/speckit-plan output)
├── spec.md                                  # Feature spec (/speckit-specify output)
├── research.md                              # Phase 0 output — resolves open design choices
├── data-model.md                            # Phase 1 output — state shapes + persistence schema
├── quickstart.md                            # Phase 1 output — manual verification script
├── contracts/                               # Phase 1 output
│   ├── sticky-header.contract.md            # Header state machine, transitions, a11y
│   ├── lifecycle-sidebar.contract.md        # Sidebar state, mirror-render contract, persistence
│   └── visual-system.contract.md            # Surface tiers, KPI accent policy, title typography
├── checklists/
│   └── requirements.md                      # Spec quality checklist (already in place)
└── tasks.md                                 # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
FIRE_Calculator/
├── FIRE-Dashboard.html                      # RR dashboard — modified in lockstep
├── FIRE-Dashboard-Generic.html              # Generic dashboard — modified in lockstep
├── FIRE-Dashboard - Legacy.html             # EXCLUDED from this feature (reference snapshot)
├── FIRE-Dashboard Translation Catalog.md    # i18n catalog — new keys added here
├── calc/
│   ├── fireCalculator.js                    # Unchanged. Consumers comment updated only.
│   ├── lifecycle.js                         # Unchanged. Consumers comment updated only.
│   └── ... (other calc modules unchanged)
└── tests/
    ├── unit/                                # Unchanged (non-regression gate)
    └── baseline/
        └── browser-smoke.test.js            # Extended with smoke assertions for sticky header + sidebar
```

**Structure Decision**: Single-project structure (the existing layout). This feature introduces no new source directories, no new calc modules, no new test harness. It adds:
  - Inline CSS (in both HTML files) for `.header`, `.sidebar`, `.surface-primary` / `.surface-secondary` tiers, card-title re-styling, filter-pill demotion, progress-rail, footer tip softening.
  - Inline HTML (in both HTML files) for the sidebar structure and the compact-header live-stat slots.
  - Inline JS (in both HTML files) for the sticky-header observer, sidebar pin/unpin + overlay logic, mirror chart registration.
  - ~5 new i18n keys in each file's `TRANSLATIONS.en` and `TRANSLATIONS.zh` dicts.
  - ~3 lines of extension to the browser smoke test covering the new DOM elements.

## Complexity Tracking

*No constitution violations to justify. Section intentionally left empty.*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| _(none)_  | _(n/a)_    | _(n/a)_                              |
