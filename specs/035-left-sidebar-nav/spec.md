# Feature Specification: Left-Sidebar Navigation

**Feature Branch**: `035-left-sidebar-nav`
**Created**: 2026-06-16
**Status**: Draft
**Input**: User description: "I feel like the 3 rows that have the tabs and categories take up too much space. We can keep the Header on the top but I want to move these 3 rows to the left side. don't change the functions of any of the buttons"

## Overview

The dashboard currently stacks three full-width navigation rows directly under the
header, before any content:

1. **Mode + strategy row** — the FIRE-mode toggle (Safe / Exact / Die W/ Zero) and the
   Withdraw Strategy toggle (Leave more behind / Pay less lifetime tax).
2. **Primary tab row** — Plan / Geography / Retirement / History / Audit.
3. **Secondary pill row** — the sub-views of the active primary tab (e.g. for Retirement:
   Social Security / Withdrawal Strategy / Drawdown / Lifecycle / Milestones).

Together these consume a large band of vertical space at the top, pushing the actual
content down. This feature relocates the **primary tab group and its contextual pills**
into a **persistent left sidebar** (an accordion: the active tab expands to reveal its
pills), freeing that vertical space for content. The **header and the mode + Withdraw
Strategy row stay at the top** (the mode/strategy toggles are not moved — see
Clarifications). **No button behavior changes** — every toggle, tab, and pill does exactly
what it does today.

## Clarifications

### Session 2026-06-16

- Q: How should the primary tabs and their contextual pills be arranged inside the left sidebar? → A: Accordion — tabs listed vertically; the active tab expands to reveal its pills nested beneath it.
- Q: On narrow / phone-width screens, how should the sidebar behave? → A: Hamburger drawer — the sidebar is hidden behind a toggle (☰) and slides over the content when opened; no horizontal scroll.
- Q: When the content is long and the user scrolls, should the sidebar stay in view? → A: Sticky — the sidebar is pinned so navigation stays reachable while content scrolls.
- Q: Where should the mode (Safe/Exact/DWZ) + Withdraw Strategy toggles sit? → A: Keep them in the top header area; only the primary tabs and pills move to the sidebar.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reclaim vertical space (Priority: P1)

As someone reviewing my FIRE dashboard, I want the primary tab and contextual pill controls
moved out of the top band and into a left sidebar, so that the content I care about
(charts, KPIs, the active view) starts higher on the page and I see more without scrolling.

**Why this priority**: This is the entire point of the request — recovering the vertical
space the stacked tab and pill rows currently occupy. Delivering just this is the MVP.

**Independent Test**: Load the dashboard and confirm the tab and pill rows no longer sit
between the header/mode-strategy band and the content; the content area's first element now
begins higher, and the tab/pill navigation is present in a left column.

**Acceptance Scenarios**:

1. **Given** the dashboard is loaded on a desktop-width screen, **When** I view the page,
   **Then** the header and the mode + Withdraw Strategy row remain at the top, the primary
   tabs and the active tab's pills appear in a vertical column on the left (accordion), and
   the content occupies the area to their right.
2. **Given** the tab/pill controls have moved to the sidebar, **When** I compare the vertical
   position of the first content card to before, **Then** it starts measurably higher
   (the band previously taken by the two relocated rows is reclaimed).

---

### User Story 2 - Identical navigation behavior (Priority: P1)

As an existing user, I want every relocated control to behave exactly as it does today, so
that moving them to the sidebar changes only where they are, not what they do.

**Why this priority**: The user explicitly required "don't change the functions of any of
the buttons." A space win that breaks navigation is a regression, so this is co-critical
with US1.

**Independent Test**: Click through every mode toggle, primary tab, secondary pill, and the
Withdraw Strategy toggle from the sidebar and confirm the same content switches, the same
active/selected highlighting appears, and the same downstream updates (chart, verdict)
occur as before the move.

**Acceptance Scenarios**:

1. **Given** the sidebar, **When** I select a primary tab, **Then** the same content view
   opens and the same set of contextual sub-views (pills) becomes available as before.
2. **Given** a primary tab is active, **When** I select one of its pills, **Then** the same
   sub-view renders and the pill shows the same active state as before.
3. **Given** the mode toggle (Safe / Exact / Die W/ Zero) — which remains in the header —
   **When** I switch modes, **Then** the verdict and projection update exactly as before.
4. **Given** the Withdraw Strategy toggle — which remains in the header — **When** I switch it
   (including any hover-preview behavior), **Then** the same preview/selection effect occurs
   as before.
5. **Given** any control, **When** I inspect its selected/active styling, **Then** the
   current selection remains visually obvious in the sidebar layout.

---

### User Story 3 - Usable on narrow / mobile screens (Priority: P2)

As someone who opens the dashboard on a smaller screen, I want the left sidebar to adapt so
it doesn't crowd out the content or cause horizontal scrolling.

**Why this priority**: A fixed left column can dominate a narrow viewport. The product is
mobile-responsive today, so the relocated navigation must degrade gracefully. Important, but
secondary to landing the desktop layout and preserving behavior.

**Independent Test**: Shrink the viewport to a phone width and confirm the navigation
remains reachable (e.g. via a collapse/expand control or an equivalent compact arrangement)
and the content remains readable with no horizontal scrollbar.

**Acceptance Scenarios**:

1. **Given** a narrow viewport, **When** the page loads, **Then** the content remains fully
   usable and there is no horizontal scrollbar.
2. **Given** a narrow viewport, **When** I need a navigation control, **Then** it is
   reachable (the sidebar collapses to a compact/toggleable form rather than permanently
   occupying a large share of the width).

---

### Edge Cases

- **Long pill sets**: the tab with the most sub-views (Retirement: 5 pills) must fit in the
  sidebar without clipping or overlap.
- **Language switch**: zh-TW labels differ in length from English; the sidebar must
  accommodate both without truncating control labels.
- **Active-state persistence**: switching tabs/pills/modes must keep exactly one active
  selection per group visibly highlighted.
- **Floating/overlay elements** (e.g. the "Copy Debug" button, tooltips): the sidebar must
  not obscure them, nor be obscured by them.
- **Very tall content**: the sidebar stays in view (sticky) while scrolling long content, so
  tab/pill navigation remains reachable.
- **Mobile drawer**: opening the ☰ drawer must overlay content without shifting/breaking it;
  selecting a tab or pill in the drawer behaves identically to desktop (and may close the
  drawer); closing the drawer returns full-width content with no horizontal scroll.
- **Theme switch (light/dark)**: the sidebar honors the same theme variables as the rest of
  the app in both themes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The dashboard MUST relocate the primary tab group and the active tab's
  secondary pill group from the top band into a left-side navigation region. The FIRE-mode
  toggle and the Withdraw Strategy toggle are NOT moved (see FR-002a).
- **FR-002**: The header region (title, portfolio net worth, FIRE number, On-Track verdict,
  and language/theme controls) MUST remain at the top of the page, full width, visually
  unchanged.
- **FR-002a**: The mode toggle (Safe / Exact / Die W/ Zero) and the Withdraw Strategy toggle
  (Leave more behind / Pay less lifetime tax) MUST remain in the top header area, unmoved and
  fully functional.
- **FR-003**: Every control MUST retain its exact current function and outcome — selecting
  modes, tabs, pills, and the strategy toggle produces the same content changes, active-state
  highlighting, and downstream updates (verdict, chart, previews) as today. No control is
  added, removed, renamed, or rewired.
- **FR-004**: The sidebar MUST present the primary tabs as an accordion: tabs are listed
  vertically and the active tab expands to reveal its contextual pills nested beneath it.
  Exactly one tab is expanded at a time, matching today's one-active-tab behavior; pills
  remain contextual to the active tab.
- **FR-005**: The main content area MUST occupy the space to the right of the left
  navigation region and MUST gain the vertical space formerly consumed by the two relocated
  rows (content begins higher).
- **FR-006**: The change MUST be applied identically to both `FIRE-Dashboard.html` (RR) and
  `FIRE-Dashboard-Generic.html` (Generic); shared navigation must look and behave the same
  in both.
- **FR-007**: On narrow / phone-width viewports the sidebar MUST collapse behind a toggle
  (☰ hamburger) and open as an overlay/drawer over the content; the content MUST stay usable
  with no horizontal scrollbar when the drawer is closed.
- **FR-008**: On desktop the sidebar MUST be persistent (always visible) and MUST stay in
  view while the content scrolls (sticky/pinned), so the tab/pill navigation remains reachable
  on long pages.
- **FR-009**: The relocation MUST preserve the existing visual design language (dark-theme
  CSS variables, accent colors, selected-state styling); it is a layout move, not a restyle.
- **FR-010**: The relocation MUST NOT change any calculation, chart, data persistence, or
  internationalization behavior — it is purely a navigation/layout reorganization.
- **FR-011**: Existing selected/active states, and any current keyboard or focus behavior of
  the controls, MUST continue to work after the move.

### Key Entities

- **Navigation region (left sidebar)**: the new left-side container that holds the primary
  tabs and the active tab's pills as an accordion. Attributes: position (left), persistence
  (visible + sticky on desktop), responsive state (hamburger drawer overlay on narrow screens).
- **Control groups**: (1) primary tabs and (2) contextual pills move into the sidebar — each a
  group with exactly one active member; the active tab's accordion section is expanded. The
  mode + Withdraw Strategy toggles remain a top-header group (unmoved).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a standard desktop viewport, the first content element starts higher than
  before by approximately the combined height of the two relocated rows (the tab + pill band
  between the mode/strategy row and the content is eliminated).
- **SC-002**: 100% of relocated controls (every mode, tab, pill, and the strategy toggle)
  produce the same result as before the move, verified by navigation/parity tests passing.
- **SC-003**: The navigation MUST NOT introduce horizontal overflow at common viewport widths
  down to a typical phone width (≈320px): the nav layout wrapper clamps to the viewport and the
  off-canvas rail adds no scroll width. (Scope note: the Generic dashboard has a PRE-EXISTING
  wide content card in the Plan → Profile panel — present before feature 035 — that overflows
  the document at phone width independent of navigation. Eliminating that is a separate
  content-layer follow-up, not part of this nav relocation.)
- **SC-004**: Both dashboards exhibit identical behavior for all shared navigation controls.
- **SC-005**: No calculation, chart, persistence, or i18n regressions — the existing unit
  and end-to-end suites remain green after the change.
- **SC-006**: A returning user can locate and operate any previously-top control in the new
  sidebar on first attempt without instruction (selection states make the current view
  obvious).

## Assumptions

- **Scope = both dashboards**: Per the project's lockstep rule, the change ships to both
  `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` (the request said "the dashboard"
  generically, not scoped to one file).
- **Mode/strategy row stays on top** (clarified): Only the primary tabs and contextual pills
  move to the sidebar; the Safe/Exact/DWZ + Withdraw Strategy row remains in the top header
  area (FR-002a). The vertical-space win is therefore from two rows, not three.
- **Accordion presentation** (clarified): Tabs are listed vertically; the active tab expands
  to reveal its pills nested beneath it. One tab expanded at a time; pills stay contextual.
- **Sticky on desktop, hamburger drawer on narrow** (clarified): On desktop the sidebar is
  always visible and pinned in view while content scrolls; on narrow/phone viewports it
  collapses behind a ☰ toggle and opens as an overlay/drawer.
- **Layout-only change**: No new behavior, no calc/persistence/i18n string changes; only DOM
  placement and styling move. Existing theme variables and accent colors are reused. (A small
  amount of new UI copy may be needed for the mobile drawer toggle's accessible label.)
- **Header contents unchanged**: The header keeps its current elements and position; only the
  tab and pill rows below the mode/strategy band are relocated.
