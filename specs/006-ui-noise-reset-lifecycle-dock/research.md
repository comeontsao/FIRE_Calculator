# Research — 006 UI Noise Reset + Lifecycle Dock

**Feature**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)
**Date**: 2026-04-21

Purpose: resolve the open design choices identified during planning so the contracts and data-model in Phase 1 can be concrete. Each entry: the question, the decision, the rationale, and what was rejected.

---

## R1 — Sticky header mechanism

**Question**: `position: sticky` (CSS-only), `position: fixed` (JS-driven with spacer), or a hybrid?

**Decision**: Use `position: sticky; top: 0` on the header element. Use an `IntersectionObserver` on a 1px sentinel element placed immediately before the header to detect the expanded↔compact transition; toggle a `.header--compact` class on the header based on the sentinel's intersection ratio.

**Rationale**:
- `position: sticky` keeps the header in the document flow, so content below doesn't need a manual top-padding spacer; it also behaves predictably under zoom and with screen readers.
- `IntersectionObserver` is single-source-of-truth for the scroll threshold — no `scroll` event listener firing on every frame. Cheap, no throttling logic needed, no reflow triggered by reading `scrollY` in the handler.
- Class-toggle approach keeps the two states (expanded vs compact) entirely in CSS with a single CSS transition driving all animated properties — no JS animation loop, no style-recomputation storm.

**Alternatives considered**:
- `position: fixed + scroll listener`: rejected. Requires a spacer element in the flow, manual threshold math, `requestAnimationFrame` throttling, and a separate code path for `position: fixed` vs document flow. More code, more failure modes.
- `position: sticky + scroll listener`: rejected. Still requires throttling and reads `window.scrollY` forcing layout. IntersectionObserver does the same job cheaper.
- `content-visibility: auto` + scroll snap: rejected. Not applicable to the problem (it's about render optimization and snap-scrolling, not state detection).

**Browser support**: `position: sticky` — Chrome/Edge/Safari/Firefox all fine. `IntersectionObserver` — all target browsers fine.

---

## R2 — Scroll threshold (80px) validation

**Question**: Is 80px the right trigger point?

**Decision**: Adopt 80px as the default, place the sentinel element 80px below the top of the document body (directly before the header's initial position). Re-tune to 60 or 100 during implementation if the transition feels premature or sluggish against the real header height.

**Rationale**: The expanded header measures ~140–160px total (padding + gradient h1 + subtitle + FIRE-status pill + gap). 80px of scroll means the user has committed to reading below the fold without having lost sight of the header completely. Earlier (40–60px) triggers feel jittery on trackpad inertia; later (120px+) feels laggy — the user's already started reading before the header collapses.

**Alternatives considered**:
- 0px (collapse on any scroll): rejected. Users wobble-scroll on load; would feel unstable.
- Fractional-viewport (`20vh`): rejected. Scales with viewport height but short screens would collapse too slowly. Fixed pixel value is more predictable.

---

## R3 — `backdrop-filter: blur` support and fallback

**Question**: Is `backdrop-filter` safe to use on the compact header?

**Decision**: Use `backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px)` with a fallback background of `rgba(15,16,22,0.92)`. Browsers without backdrop-filter support get a slightly more opaque solid background; the compact header remains functional and legible.

**Rationale**: Target browsers all support either `backdrop-filter` (Chrome 76+, Edge 79+, Safari 9 prefixed / 18 unprefixed, Firefox 103+) or fall back cleanly to the solid tint. The `-webkit-` prefix is still needed for Safari <18.

**Alternatives considered**:
- Solid opaque bar (no translucency): rejected. Loses the visual depth that signals "floating above content."
- CSS `filter: blur` on a sibling element: rejected. Blurs the sibling's own content, not what's behind it — wrong semantics.

---

## R4 — Live stat chip data source for compact header

**Question**: Where does the compact header read "Years to FIRE" and "Progress %" from?

**Decision**: Re-use the existing `_lastKpiSnapshot` module-level variable already populated by `recalcAll()` (RR line ~8868 area). On every render, copy the relevant fields into the compact header via a tiny `renderCompactHeaderStats(state)` function that is itself registered as a `chartState.onChange` listener. No duplicated calc, no parallel state.

**Rationale**:
- `_lastKpiSnapshot` is already the single source for KPI card values; it updates whenever calcs change. Using it guarantees the compact header agrees with the KPI cards by construction.
- Registering as a `chartState.onChange` listener keeps propagation on the same frame as every other chart's re-render.
- Zero new globals, zero new mutable state.

**Alternatives considered**:
- Read from DOM (`document.getElementById('kpiYears').textContent`): rejected. DOM scraping is brittle and couples the header to the specific KPI card IDs.
- Recompute independently: rejected. Violates Constitution Principle III (single source of truth for interactive state).

---

## R5 — Sidebar mirror chart instantiation pattern

**Question**: How does a second Chart.js instance share data with the primary without duplicating the projection calc?

**Decision**: The primary lifecycle chart's render function (`renderGrowthChart(inp)` in RR, same name in Generic) computes the projection dataset once and stores it on a module-scope variable `_lastLifecycleDataset`. The sidebar's render function (`renderLifecycleSidebarChart(inp)`) reads the same `_lastLifecycleDataset` and feeds it into its own Chart.js instance. Both render functions are registered via `chartState.onChange`, so they fire in registration order on every state change — primary first (computes dataset), sidebar second (consumes dataset).

**Rationale**:
- Dataset computation (the expensive part — `projectFullLifecycle`) runs once per state change. Both charts share the output.
- Chart.js instances remain independent; each can have its own canvas, own options, own scales. The sidebar can choose a simplified axis / smaller font / no legend to fit the narrower drawer, without affecting the main chart.
- The two renders are in the SAME `chartState.onChange` pipeline, so there is no race condition or stale-data window.

**Alternatives considered**:
- One chart, moved between DOM locations: rejected. Chart.js re-initializes on canvas move; also breaks the "primary chart stays in place in the dashboard layout" requirement from the spec.
- Clone the main chart's options verbatim: rejected. Sidebar is narrower → axis labels, legend, font sizes must differ.
- `resize`/`update` the primary chart into the sidebar canvas: rejected. Same as the "move between DOM" approach — Chart.js is not designed for this.

---

## R6 — Chart.js resize timing when sidebar pins/unpins

**Question**: When the sidebar pins (and the main dashboard grid shrinks), do the primary charts need a manual `chart.resize()` call?

**Decision**: Yes. On pin/unpin transitions, call `chart.resize()` on every registered Chart.js instance after the CSS transition completes (use a `transitionend` listener on the main content wrapper, with a fallback `setTimeout(..., 350)` in case `transitionend` doesn't fire). Chart.js's `responsive: true` only re-measures on window `resize` events, not on CSS layout changes.

**Rationale**:
- CSS transitions alone change container width without firing `resize`, so Chart.js draws at the stale width unless told to re-measure.
- `chart.resize()` is cheap (~5-10ms for a single chart on a modern laptop) and deterministic.
- `transitionend` is the correct signal — the chart resizes exactly when the layout stops animating, not before.
- The `setTimeout` fallback handles edge cases where `transitionend` doesn't fire (reduced-motion preference, interrupted transitions).

**Alternatives considered**:
- ResizeObserver on the main content element: rejected. Fires on every animation frame during the transition — triggers redundant redraws.
- Skip the resize and rely on Chart.js internal responsiveness: rejected. Verified that `responsive: true` only responds to window resize, not container resize.
- Disable the pin transition (snap): rejected. Ugly, fails the "feels intentional, not janky" success criterion.

---

## R7 — Mobile overlay dismissal pattern

**Question**: On mobile, how does the user close the overlay sidebar?

**Decision**: Three dismissal paths, all active simultaneously:
1. **Explicit close button** (×) in the sidebar header.
2. **Click-outside** — tapping anywhere on the main content (outside the sidebar) closes the overlay. Implemented via a semi-transparent full-screen scrim beneath the sidebar; a click on the scrim closes the overlay.
3. **Escape key** — keyboard dismissal for desktops dragged narrow.

**Rationale**:
- Multiple dismissal paths is the standard mobile drawer UX pattern (Material, iOS modals, etc.). No single path works for every user.
- The scrim adds visual isolation (signals "this is temporary") while being the click-outside surface — same element, two purposes.
- Escape-key keeps keyboard users first-class even though the feature is mobile-first on narrow viewports.

**Alternatives considered**:
- Close-button only: rejected. Users trained by iOS/Android expect tap-outside.
- Swipe-to-close gesture: rejected for this feature. Adds complexity (touch event handling, velocity math); not a blocker for v1. Can add later.

---

## R8 — Sidebar localStorage key strategy

**Question**: Add to the existing `STATE_KEY` blob or use a standalone key?

**Decision**: **Standalone key**, written and read independently of the main `STATE_KEY` save/restore cycle.
- RR: `fire_dashboard_sidebar_pinned`
- Generic: `fire_dashboard_generic_sidebar_pinned`
- Values: `'1'` or `'0'` (string — smaller than boolean JSON, standard localStorage convention).
- Written synchronously on every pin/unpin toggle.
- Read ONCE on page init (before sidebar mount) to determine starting state.
- Not subject to the Generic version-wipe (`GENERIC_VERSION`) — the wipe clears `fire_dashboard_generic_state` and `fire_dashboard_generic_snapshots` only; sidebar preference survives schema bumps because it has no schema coupling.

**Rationale**:
- The main `STATE_KEY` is re-written on every `recalcAll()` — piggybacking on it means every slider drag serializes the sidebar state. A standalone key writes only on user-initiated pin/unpin (rare).
- No coupling to the version-wipe means users don't lose their sidebar preference on version bumps (a user preference, not calc data).
- The existing `state._mortgageEnabled` / `state._secondHomeEnabled` pattern shows that UI toggles CAN live inside `STATE_KEY` — but those are already on the hot path. Sidebar pin doesn't need to be.

**Alternatives considered**:
- Inside `STATE_KEY`: rejected. Couples UI preference to calc state churn.
- Inside `PERSIST_IDS`: rejected. `PERSIST_IDS` is for DOM input elements; the sidebar pin button isn't a form input.
- `sessionStorage`: rejected. Must survive tab close / reload.

---

## R9 — Section-divider grouping

**Question**: Which cards group under which section divider?

**Decision**: Four sections, ordered top to bottom:

1. **Profile & Plan** — personal/family data and input-heavy cards.
   - Profile & Income card
   - Current Assets card
   - Projections / Returns / Savings card
   - (in RR only) Healthcare overrides, Second Home, College Plan controls
2. **Outlook** — the main FIRE projection charts + status.
   - KPI row + FIRE Progress rail (rendered above the section divider as the "always-on summary")
   - Full Portfolio Lifecycle chart
   - Lifetime Withdrawal Strategy chart
   - Roth Ladder chart
   - Social Security chart
3. **Compare** — geographic / lifestyle scenario comparison.
   - Scenario country grid (with filter pills)
   - FIRE-by-Country ranked bar chart
   - Milestone Timeline
4. **Track** — history and snapshots.
   - Snapshot History table
   - Linked CSV controls

**Rationale**:
- Four sections matches the user's mental model: *who we are* → *what happens* → *what if we moved* → *how we're tracking*.
- Section dividers are the only surface that retains the uppercase-tracked kicker treatment (per FR-023); using them on 3–4 sections preserves hierarchy without devaluing the treatment.
- Mapping above is the starting point; the product owner may fine-tune during implementation (FR-027's emoji discipline is editorial, per feature 006 assumption).

**Alternatives considered**:
- Three sections (merge Profile+Outlook): rejected. Profile is input-heavy; Outlook is chart-heavy. Visually different, should be separable.
- Five sections (split Outlook into Charts + Strategy): rejected. Over-partitioning loses the "at-a-glance dashboard" feel.

---

## R10 — Lifecycle module Consumers list (Constitution VI bookkeeping)

**Question**: What exact comment updates are needed so the lifecycle module declares its new consumer?

**Decision**: The lifecycle module(s) (`calc/lifecycle.js` and the inline block in each HTML file that computes `_lastLifecycleDataset`) add "lifecycleSidebar" to their `Consumers:` line. The new `renderLifecycleSidebarChart` function's own comment declares `Inputs: _lastLifecycleDataset (module-scope) / Reads: _lastLifecycleDataset, inp.ageRoger | inp.agePerson1, fireMode, selectedScenario`.

**Rationale**: Per Constitution Principle VI, every chart render declares the module(s) it consumes and the module lists its consumers. This is a tiny comment change, but it's non-negotiable; it is called out here so the task list includes the exact lines to modify.

---

## Open items deferred to implementation

- Exact color values for the new surface tiers (secondary cards): start with `transparent` background + `1px solid var(--border)` and tune if the border feels too prominent.
- Exact size of the sidebar caption text: tune during implementation; target ~0.78em / `--text-dim`.
- Exact padding of the compact header: target ~10-12px vertical, 24px horizontal; tune against header content.
- Whether the compact header gets a shadow vs. border-bottom: design decision during implementation. Default: border-bottom + backdrop-filter, no shadow.

These are tuning details, not structural decisions. They do not block the contract design or the task generation.
