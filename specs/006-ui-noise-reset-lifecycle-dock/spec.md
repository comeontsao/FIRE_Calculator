# Feature Specification: UI Noise Reset + Lifecycle Dock

**Feature Branch**: `006-ui-noise-reset-lifecycle-dock`
**Created**: 2026-04-21
**Status**: Draft
**Input**: User description: "make the whole interface less noisy; top header always visible when scrolling but shrinks to an elegant compact size; Full Portfolio Lifecycle chart available as a pinnable right-side sidebar that stays visible so input changes and chart changes can be compared side-by-side."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Lifecycle stays in view while I tune inputs (Priority: P1)

As someone actively tweaking retirement assumptions (savings rate, return rate, spending by country), I want to keep the Full Portfolio Lifecycle chart in sight at all times so that when I drag a slider or change an input I can instantly see the shape of the portfolio curve react, without having to scroll up and down between the input panel and the chart.

**Why this priority**: The whole point of this tool is iterative scenario-tuning. Today the user must scroll between the input panel (top-third) and the lifecycle chart (further down the page), so every adjustment costs 2–3 seconds of context-switching. Keeping the lifecycle chart docked converts the dashboard from "edit → scroll → read" into "edit → see," which is the single biggest usability lever in the product.

**Independent Test**: Open the dashboard, pin the lifecycle sidebar, scroll to the mortgage / what-if section, change any input slider, and verify the docked lifecycle chart updates on the same frame as the primary chart. The user never loses visual contact with the lifecycle curve while editing.

**Acceptance Scenarios**:

1. **Given** the dashboard is open and the lifecycle sidebar is pinned, **When** the user scrolls to any part of the page (input panel, country grid, snapshots), **Then** the lifecycle chart remains visible on the right edge of the viewport.
2. **Given** the sidebar is pinned, **When** the user changes any input that affects the lifecycle projection (savings slider, return rate, FIRE mode, country selection), **Then** both the primary in-page lifecycle chart and the docked sidebar lifecycle chart re-render within the same update cycle.
3. **Given** the sidebar is pinned on a desktop viewport, **When** the sidebar opens, **Then** the main dashboard content reflows to share the horizontal space and no card is clipped or overlapped by the sidebar.
4. **Given** the user has pinned the sidebar on a previous visit, **When** they reload the page, **Then** the sidebar is restored to its pinned state.
5. **Given** the user is on a narrow viewport (below ~780px wide), **When** they open the lifecycle sidebar, **Then** the sidebar appears as an overlay over the main content and can be dismissed by a close control or by tapping outside it.

---

### User Story 2 — Headline answer follows me as I scroll (Priority: P1)

As someone reading through a long dashboard of supporting charts (net worth, withdrawal strategy, healthcare, college, second home, country comparison, snapshots), I want the headline answer ("Years to FIRE" and "Progress %") to follow me at the top of the screen so I never lose track of the big picture while reviewing details.

**Why this priority**: The current header holds the big emotional payload (branding + FIRE-status pill) but scrolls away after the first screen. The user then has to scroll back up every time they want to check "Am I on track?" Keeping a compact version of the header pinned with live headline numbers makes the answer ambient — always one glance away.

**Independent Test**: Load the dashboard, scroll past the first screen (~80px), and verify (a) the header remains anchored at the top, (b) it has shrunk to a compact single-line bar, (c) the compact bar shows the current Years-to-FIRE and Progress % values, and (d) those values update in real time when an input changes.

**Acceptance Scenarios**:

1. **Given** the user is at the top of the page, **When** they scroll down past the first ~80px, **Then** the header transitions smoothly to a compact form-factor within roughly a quarter-second while remaining visible and functional.
2. **Given** the compact header is showing, **When** the user scrolls back to the top, **Then** the header expands back to its full form with the same smooth transition.
3. **Given** the compact header is showing, **When** the user changes any input that affects the FIRE projection, **Then** the "Years to FIRE" and "Progress %" chips in the compact header update to reflect the new value on the same update cycle as the rest of the dashboard.
4. **Given** the user has accessibility preferences set to reduce motion, **When** they scroll through the page, **Then** the header switches between expanded and compact states instantly without animation, preserving the functional behavior.
5. **Given** the compact header is showing, **When** the user clicks the language toggle or the lifecycle sidebar toggle, **Then** those controls remain accessible and work identically to the expanded header.

---

### User Story 3 — A quieter dashboard where the data speaks (Priority: P2)

As someone who looks at this dashboard daily, I want each chart and number to be easy to find on its own merits. Today every card competes for attention with equal visual weight — uppercase titles everywhere, emojis on every section, four different colors in the KPI row, and filled card surfaces behind every chart. I want the interface to quiet down so the important numbers stand out.

**Why this priority**: This is a cosmetic/polish lift rather than a new capability, but it directly raises the quality of every interaction with the dashboard. Shipping it alongside the sticky header and sidebar means the new primitives debut on a clean canvas instead of adding to an already-noisy surface.

**Independent Test**: Compare side-by-side screenshots of the dashboard before and after: count the number of distinct filled surfaces, the number of uppercase/tracked titles, and the number of accent colors in the KPI row. After the change, each should drop noticeably while no data, chart, or control is lost.

**Acceptance Scenarios**:

1. **Given** the dashboard is displayed, **When** the user scans the KPI row, **Then** all four headline values (Net Worth, FIRE Number, Progress, Years) read in a single neutral color; accent color only appears where it carries meaning (e.g., the trend or delta line).
2. **Given** the dashboard is displayed, **When** the user scans the card titles, **Then** titles are set in quiet title-case rather than uppercase-tracked small caps; the uppercase-kicker treatment is reserved for new section dividers (grouping cards into logical sections such as Profile / Plan / Compare / Track).
3. **Given** the dashboard contains chart cards and controls cards, **When** the user scans the page, **Then** chart cards render with a border-only frame (no filled background) while cards that hold controls and primary numbers keep the filled surface, creating visible hierarchy.
4. **Given** the user hovers any card, **When** the card is not interactive (e.g., a chart card), **Then** it does NOT animate its border color; hover feedback is reserved for elements that respond to clicks (country scenario cards, snapshot rows).
5. **Given** the FIRE Progress block is displayed, **When** the user views it, **Then** it appears as a thin rail beneath the KPI row (with tick labels at $0, intermediate stops, and target) rather than as its own full-width card with a title.
6. **Given** the country filter row is displayed, **When** the user views it, **Then** the filter pills read as secondary controls (prefixed with a "Filter:" label, smaller, with a subtle underline for the active pill) rather than as primary navigation.
7. **Given** the dashboard's card titles contain emojis, **When** the user scans the page, **Then** emojis remain only on cards that represent real-world concepts (mortgage, college, visa, snapshots) and are removed from pure-data chart cards where the title itself already names the visualization.
8. **Given** the language toggle is displayed, **When** the user looks for it, **Then** it lives inside the header (including the compact sticky bar) rather than as a floating absolutely-positioned element.
9. **Given** the merged footer is displayed, **When** the user views its Tip callout, **Then** the left-border accent reads as a neutral divider rather than a loud accent stripe.
10. **Given** any card contains internal dividers on top of an outer border, **When** the user views the card, **Then** redundant borders have been removed — at most one border per surface.

---

### Edge Cases

- **Lifecycle sidebar pinned while viewport is resized across the desktop/mobile breakpoint**: when the viewport narrows below the mobile threshold, the sidebar must automatically convert from docked to overlay mode; when the viewport widens back, it should return to docked if the user's pin preference is true.
- **User pins the sidebar while the lifecycle chart is still loading / has not yet been rendered**: the sidebar should show a placeholder state until the chart mounts, then render cleanly without layout thrash.
- **Sticky header collides with in-chart drag interactions** (e.g., the FIRE-age marker on the lifecycle chart is draggable): during a drag, the header must not intercept pointer events or block the drag-hint tooltip from being visible.
- **Sticky header on very short viewports** (e.g., laptop screens under 600px of vertical height): the compact header must not consume more than ~10% of viewport height; the expanded header should still animate smoothly.
- **Multiple rapid scroll direction changes**: toggling in and out of the compact state repeatedly (scrolling up/down across the 80px threshold) must not produce visible flicker, animation doubling, or layout shift.
- **Sidebar pinned + user prints the page**: printing should ignore the sidebar and the sticky header and produce a clean single-column layout of the main dashboard content.
- **User without localStorage access** (private browsing in Safari on some configurations): the sidebar should default to unpinned and the preference write should silently no-op without breaking the page.
- **KPI trend line color**: when a trend value is exactly zero / unchanged, the neutral-dim color must be used (accent color reserved for directional movement only).

## Requirements *(mandatory)*

### Functional Requirements

#### Sticky compact header (User Story 2)

- **FR-001**: The top header MUST remain visible while the user scrolls any part of the dashboard. The user MUST never lose access to the header's controls (language toggle, lifecycle-sidebar toggle) or to the live headline numbers (Years to FIRE, Progress %) while scrolling.
- **FR-002**: The header MUST render in an "expanded" presentation when the user is at (or very near) the top of the page and in a visually smaller "compact" presentation after the user has scrolled past approximately the first screen of content. The transition between the two presentations MUST feel smooth and intentional (roughly a quarter-second of easing).
- **FR-003**: The compact header MUST display, at minimum: the dashboard title, the live "Years to FIRE" value, the live "Progress %" value, the FIRE-status indicator (e.g., "On Track" / "Warning" / "Behind"), the language toggle, and the lifecycle-sidebar toggle.
- **FR-004**: The live values in the compact header MUST update on the same update cycle as the rest of the dashboard whenever the user changes any input that affects the FIRE projection.
- **FR-005**: When the user's operating system or browser signals a preference for reduced motion, the header transition MUST become instantaneous (no animated shrink/expand) while the functional state change remains correct.
- **FR-006**: The compact header MUST layer above scrolling content without making the content illegible; the visual treatment MUST include enough backdrop contrast (e.g., tinted translucent background) that text beneath does not bleed through.
- **FR-007**: The header MUST NOT block interaction with content immediately below it — in particular, hover and click targets in the top rows of the dashboard, drag interactions on the lifecycle chart, and drag-hint tooltips must remain reachable.

#### Pinnable lifecycle sidebar (User Story 1)

- **FR-010**: The dashboard MUST provide a right-edge sidebar that can display the Full Portfolio Lifecycle chart independently of where the user has scrolled. The sidebar MUST be summonable from a toggle control present in both the expanded and compact header states.
- **FR-011**: The sidebar MUST support a "pinned" (docked) mode and an "unpinned" (hidden) mode. In pinned mode on a wide-enough viewport, the sidebar MUST remain visible on the right edge of the page and the main dashboard content MUST reflow to share the horizontal space without clipping any card.
- **FR-012**: In unpinned mode, the sidebar MUST be hidden off-screen; the toggle control MUST remain accessible to re-open it.
- **FR-013**: On viewports narrower than a commonly-used mobile breakpoint (roughly 780px), the sidebar MUST present as an overlay layer rather than docking. The user MUST be able to dismiss the overlay by an explicit close control or by interacting with the area outside it.
- **FR-014**: The user's most recent pinned/unpinned state MUST persist across page reloads. On the narrow-viewport overlay presentation, the "pinned" concept does not apply — the overlay is always open/closed rather than pinned/unpinned.
- **FR-015**: The lifecycle chart rendered inside the sidebar MUST stay synchronized with the primary in-page lifecycle chart — every recalculation that updates the primary chart MUST also update the sidebar chart on the same update cycle.
- **FR-016**: The sidebar MUST include, in addition to the chart area: a toggle to pin/unpin (where applicable), a close control, and a compact caption summarizing the current FIRE age and the projected end-of-life portfolio value (the two numbers the lifecycle chart primarily exists to communicate).
- **FR-017**: Pinning and unpinning the sidebar on a desktop viewport MUST NOT cause the lifecycle chart (or any other chart currently visible) to render at a stale width — charts must re-measure and redraw cleanly after the layout reflow.
- **FR-018**: If the user's browser environment does not allow persisting preferences (e.g., private-mode storage restrictions), the sidebar MUST default to unpinned on first visit and MUST NOT break the rest of the dashboard when it attempts and fails to persist the preference.

#### Noise-reduction pass (User Story 3)

- **FR-020**: Card surfaces MUST render in one of two visual tiers: "primary" cards (those holding controls, inputs, or headline numbers) keep the filled background treatment; "secondary" cards (those holding supplementary charts) MUST render as border-only frames with a transparent background. The two tiers MUST be distinguishable at a glance.
- **FR-021**: In the KPI row, the four headline values (Net Worth, FIRE Number, Progress %, Years to FIRE) MUST render in a single neutral text color. Accent color MUST only be used for the secondary sublabel or trend line beneath each value, where it signals direction or delta.
- **FR-022**: Card titles MUST NOT use the combination of uppercase + wide letter-spacing + small type. Card titles MUST instead read as quiet title-case labels in a dim text color.
- **FR-023**: The uppercase + letter-spacing treatment MUST still exist in the design system, reserved for a new section-divider element that groups related cards into labeled sections (e.g., Profile, Plan, Compare, Track).
- **FR-024**: Hover feedback on cards MUST be limited to cards that respond to clicks (scenario cards, snapshot rows, any newly-interactive surfaces). Passive cards MUST NOT change their border color on hover.
- **FR-025**: The standalone "FIRE Progress" card (currently a full-width section with its own title and a progress bar inside) MUST be reduced to a thin progress rail sitting directly beneath the KPI row, with tick labels at $0, any intermediate milestones, and the target.
- **FR-026**: The country-filter pill row MUST read as secondary UI rather than primary navigation. This MUST include (a) a textual prefix such as "Filter:" in a dim color, (b) visually smaller pills, and (c) an active state that reads as a subtle underline rather than a solid filled pill.
- **FR-027**: Emojis MUST be removed from chart and data card titles. Emojis MUST be retained on cards whose identity is bound to a real-world concept (mortgage, college, visa, snapshot history).
- **FR-028**: The language toggle MUST be part of the header (both expanded and compact states) rather than an absolutely-positioned element floating over the page hero.
- **FR-029**: The merged footer's Tip callout MUST use a neutral divider color for its left-edge accent rather than a loud brand accent color, so the footer reads as reference material rather than a competing UI surface.
- **FR-030**: Cards that today carry BOTH an outer card border AND inner dividers on the same surface MUST be simplified to at most one border per surface.

#### Lockstep & non-regression

- **FR-040**: Every change in this feature MUST ship simultaneously to BOTH `FIRE-Dashboard.html` (RR) and `FIRE-Dashboard-Generic.html` (Generic). The Legacy file (`FIRE-Dashboard - Legacy.html`) is out of scope and MUST be left untouched.
- **FR-041**: The feature MUST NOT regress any existing behavior. Specifically: localStorage persistence (including the three fields added in feature 005), the per-country FIRE calculation fix (scenario cards no longer shift when a different country is clicked), the merged two-column footer, the language switch, and the dark theme MUST all continue to work exactly as today.
- **FR-042**: The feature MUST NOT change the FIRE math, the charts' data contracts, the chart types / colors / axes, or the i18n strings (other than adding any new strings that this feature introduces, which MUST come in both EN and ZH).

### Key Entities *(include if feature involves data)*

- **Sidebar Pin Preference**: A simple boolean-plus-context record of whether the user has chosen to keep the lifecycle sidebar docked. Stored separately per dashboard file (RR vs Generic) so the two dashboards can have independent preferences. The record persists across page reloads; it does not travel between devices.
- **Sticky-Header Scroll Threshold**: An internal, non-user-configurable threshold (~80px of scroll) that governs when the expanded header collapses into the compact header and vice-versa. Not persisted; derived at runtime from scroll position.
- **Live Headline Values**: The Years-to-FIRE and Progress % values surfaced in the compact header. These are views onto existing calculated values; the feature does not introduce a new data source.
- **Chart Synchronization Contract**: The invariant that the primary lifecycle chart and the sidebar lifecycle chart always present the same data state. This is a behavioral contract, not a new data entity — both rendered views listen to the same state-change event chain.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When the user changes any input that affects the lifecycle projection with the sidebar pinned, they see the lifecycle chart's updated shape without needing to scroll. In usability terms: the number of manual scroll actions required during a typical "tune 3 inputs in a row" task drops from ≥3 scrolls today to 0 scrolls.
- **SC-002**: The headline answer ("Years to FIRE" and "Progress %") is visible on screen at least 95% of the time the user spends on the dashboard, regardless of scroll position.
- **SC-003**: The transition between expanded and compact header is smooth enough that a user explicitly asked "did you see any flicker or jump while scrolling?" says no, and reports the animation as feeling intentional rather than janky. Under reduced-motion settings, the state switch is instantaneous with no visual jump.
- **SC-004**: On a desktop viewport ≥1280px wide, pinning the sidebar causes no card to be clipped, no chart to be drawn at a stale width, and no horizontal scrollbar to appear on the main content area.
- **SC-005**: On a mobile-width viewport (<780px), the sidebar operates as a full-width overlay that never leaves parts of the main content permanently hidden after dismissal.
- **SC-006**: The number of distinct filled card surfaces visible on a "fresh page load, scrolled to top" capture of the dashboard is reduced by at least 50% compared to the current layout, while no data, chart, or control is removed from the page.
- **SC-007**: The number of accent-colored numeric values in the KPI row drops from four (today: teal, green, yellow, teal) to zero, with accent color moving exclusively to the sublabel/trend line beneath each KPI.
- **SC-008**: A user who reloads the page while the sidebar was pinned sees the sidebar already pinned on the next visit (within the same browser profile), without any intermediate flash of the unpinned state.
- **SC-009**: The following existing flows continue to pass their checks after the feature ships: persistence of all inputs including `roger401kRoth` / `person1_401kRoth`, `contrib401kRoth`, `taxTrad`; per-country FIRE numbers remain stable when the user clicks between countries; the merged footer appears exactly once at the bottom of the page; language switch works on both the expanded and compact header.
- **SC-010**: The feature does not add any new external dependency, build step, or framework; the project remains a zero-dependency single-file HTML app (plus the two files kept in lockstep).

## Assumptions

- The user's target device mix is a modern desktop browser (Chrome, Edge, Safari, Firefox — current or one version behind) plus occasional mobile/tablet use. Legacy IE support is not a goal.
- The dashboard's dark theme (`--bg`, `--card`, `--border`, `--accent`, `--accent2`, `--text`, `--text-dim`) stays as-is. The quieter look is achieved by redistributing the existing palette rather than introducing new colors.
- Chart.js remains the chart library. The sidebar's lifecycle chart is a second Chart.js instance that subscribes to the same update events as the primary lifecycle chart; it is not a separate rendering engine.
- The `chartState.onChange` listener mechanism already wired into the RR/Generic dashboards (as set up for feature 005) is the intended integration surface for the sidebar's mirror chart. The primary and mirrored charts re-render through the same notification pipeline so they cannot drift.
- Sidebar docked width on desktop is approximately 420px; this is a design starting point, not a hard specification.
- The compact header's threshold is approximately 80px of scroll; this is a tuning parameter chosen so the transition feels prompt but does not fire on trivial pointer wobble.
- Emoji retention is editorial: the product owner will make per-card calls during implementation. The rule is "keep where the emoji identifies a real-world concept; remove where the card title already names a chart of numbers."
- Localization strings introduced by this feature (e.g., the "Filter:" label, the sidebar caption, any new control tooltips) will be added in both EN and ZH in lockstep with existing i18n conventions.
- Printing styles are not a focus of this feature; however, the sticky header and sidebar should not actively break the existing print presentation (they should collapse or be hidden when the user prints).
- "Reduced motion" accessibility follows browser defaults (`prefers-reduced-motion: reduce`). The feature does not add a separate in-app toggle for animations.
