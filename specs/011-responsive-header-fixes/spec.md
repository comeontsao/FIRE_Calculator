# Feature Specification: Generic Dashboard — Responsive Header Layout Fixes

**Feature Branch**: `011-responsive-header-fixes`
**Created**: 2026-04-24
**Status**: Draft
**Input**: User description: "Two pre-existing responsive bugs in the Generic dashboard's site header: (1) title wraps word-by-word onto 6+ lines on narrow/zoomed viewports because the three-column CSS grid squeezes the title below min-content width, and the `.fire-status` pill overlaps the wrapped title; (2) when the lifecycle sidebar chart is toggled on, the sticky header's background does not extend across the full viewport width on the right side where the sidebar sits, producing a visible seam that makes the header look truncated. CSS or CSS+light-HTML fix. Playwright smoke at three viewports (phone ~400px, tablet ~768px, desktop ~1440px) × two sidebar states (open, closed). Must keep EN + zh-TW title strings readable without word-by-word wrapping. Generic-only."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Readable title on narrow and zoomed viewports (Priority: P1)

A user opens the Generic dashboard on a vertical tablet, a half-width desktop window, or a desktop at 150–175% zoom. The site header's title ("FIRE Command Center — Universal Template" in EN, "FIRE 指揮中心 — 通用版" in zh-TW) remains readable — at most 2 visual lines, never one-word-per-line, never overlapped by the FIRE-status pill. The right-side controls (language toggle, theme toggle, sidebar toggle, Reset button) remain visible and operable without horizontal scrolling.

**Why this priority**: Broken title text is a first-impression credibility problem. Users on iPads, split-screen laptops, and zoomed desktops currently see a stack of six single-word lines plus an overlapping status pill — the dashboard looks visually broken before any calculation is even visible.

**Independent Test**: Load `FIRE-Dashboard-Generic.html` in a browser at viewport widths 400px, 768px, and 1440px. At each size, verify: (a) the title fits on at most 2 lines, (b) no word breaks mid-word or stands alone on its own line, (c) the `fire-status` pill does not overlap or obscure the title, (d) all four right-side controls remain visible and clickable.

**Acceptance Scenarios**:

1. **Given** viewport width 1440px (wide desktop), **When** the page loads, **Then** the title renders on a single line, the subtitle on a single line below it, and the status pill + controls align on the right at the same vertical center.
2. **Given** viewport width 768px (vertical tablet), **When** the page loads, **Then** the title renders on at most 2 lines, no word is isolated on its own line, and the status pill + controls reflow to a second row below the title rather than overlapping it.
3. **Given** viewport width 400px (phone), **When** the page loads, **Then** the title renders on at most 2 lines at a reduced but legible font size, the status pill wraps below the title, and the four right-side controls either stack or compress to fit on a single row.
4. **Given** desktop at 200% zoom with a 1440px base viewport, **When** the page renders, **Then** the behaviour matches the 768px scenario — no word-by-word wrapping.
5. **Given** language toggle is set to zh-TW, **When** any of the above scenarios is tested, **Then** the Chinese title "FIRE 指揮中心 — 通用版" is similarly readable and never breaks character-by-character into multi-line stacks.

---

### User Story 2 — Header background extends full width even when the sidebar chart is open (Priority: P1)

A user toggles the lifecycle sidebar chart on (via `#sidebarToggle`). The site header's dark background stays visually continuous across the entire viewport width — no visible seam between the header and the sidebar panel on the right side.

**Why this priority**: The seam makes the header look cut off or truncated, suggesting a layout bug even though the rest of the dashboard works. On dark themes the seam is especially obvious because the `var(--bg-deep)` of the header and whatever the sidebar renders behind it are different shades.

**Independent Test**: Open the Generic dashboard. Toggle the lifecycle sidebar chart on via `#sidebarToggle`. Take a screenshot. The horizontal band occupied by the sticky header must render a single continuous background colour from left edge to right edge of the viewport — no vertical seam, no colour change, no transparency leak showing a different layer behind. Repeat with sidebar closed; behaviour must be equally continuous.

**Acceptance Scenarios**:

1. **Given** the sidebar is closed, **When** the page renders, **Then** the header's background colour spans the full viewport width from left to right without any visible discontinuity.
2. **Given** the user toggles the sidebar on, **When** the sidebar panel animates into view, **Then** the header's background remains visually continuous across the full width — the sidebar panel either sits BELOW the header in the z-order OR the header's background visually covers the sidebar's top edge.
3. **Given** the sidebar is open and the user scrolls down, **When** the header enters its compact-sticky state (`.header--compact`), **Then** the same full-width background continuity holds in the compact state.

---

### User Story 3 — Sticky-compact behaviour and all existing header controls are preserved (Priority: P2)

A user scrolls down the page. The header transitions to its compact state (smaller title, hidden subtitle, translucent background) via the existing `.header--compact` mechanism. All right-side controls (EN/中文 toggle, theme toggle, sidebar toggle, Reset to Defaults button) remain visible and functional. The compact-state transition must be preserved exactly as it works today.

**Why this priority**: The compact-sticky header is a polished, intentional interaction introduced in an earlier feature. This feature 011 MUST NOT regress it — the fix is scoped to layout and background-continuity, not to the compact-state animation or its triggering logic.

**Independent Test**: At desktop viewport, scroll the page. Observe: (a) header enters compact state smoothly, (b) title shrinks from ~2.2rem to ~1.1rem with the existing 240ms transition, (c) subtitle collapses, (d) all four controls stay visible, (e) the `fire-status` pill remains visible in its compact form. Repeat at tablet and phone viewports — the compact transition works at every viewport size.

**Acceptance Scenarios**:

1. **Given** any viewport size with the sidebar closed, **When** the user scrolls past the `#headerSentinel` threshold, **Then** the header enters `.header--compact` with title/subtitle/background transitions identical to pre-feature-011 behaviour.
2. **Given** any viewport size with the sidebar open, **When** the compact state activates, **Then** the full-width background continuity from US2 is preserved across the state transition.
3. **Given** all four header controls (EN/中文 toggle, theme toggle, sidebar toggle, Reset) are visible at each viewport size, **When** the user clicks any control, **Then** the control behaves identically to pre-feature-011 — no click intercepted, no z-index stacking error.

---

### User Story 4 — FIRE-status pill remains legible at every viewport size (Priority: P2)

The `#fireStatus` pill ("Needs Optimization — 16 years at current pace · 100.0% there" or equivalent) remains readable at every viewport size and is never allowed to overlap the title. On narrow viewports the pill may reflow to a new row, compress its font size, or truncate its inner text gracefully — but it must never stack on top of the title.

**Why this priority**: The overlap in Bug 1 is not just a title problem; the status pill itself becomes unreadable when stacked against the wrapped title. A correct fix must address both sides of the collision.

**Independent Test**: At 400px, 768px, 1440px viewports, inspect the position of `#fireStatus` relative to the title. The two elements MUST have non-overlapping bounding rectangles at every viewport size. The pill's text must remain fully visible (not clipped by `overflow: hidden` on a parent).

**Acceptance Scenarios**:

1. **Given** viewport ≥ 1024px, **When** the page renders, **Then** the title and status pill sit on a single row with the pill right-aligned and non-overlapping.
2. **Given** viewport < 1024px, **When** the page renders, **Then** the status pill either wraps to a second row, compresses font size, or shortens its text — and in all cases does not visually overlap the title's bounding rectangle.
3. **Given** the user toggles the status content (e.g., FIRE progress crosses a threshold and the pill text changes from "Needs Optimization — X years" to "On Track — X years"), **When** the pill re-renders, **Then** its new text fits its container at the current viewport size without overlapping the title.

---

### User Story 5 — Playwright smoke tests lock the fix across viewports (Priority: P2)

A new Playwright E2E test suite verifies the above acceptance scenarios at three viewport sizes (400 × 800, 768 × 1024, 1440 × 900) with sidebar both open and closed, for both language toggles (EN and zh-TW). Any regression of the layout bug fails CI.

**Why this priority**: The constitution's Principle IV (Gold-Standard Regression Coverage) is NON-NEGOTIABLE. Responsive CSS regressions are especially prone to sneaking back in during unrelated refactors. A locked test matrix prevents re-occurrence.

**Independent Test**: Run `npx playwright test tests/e2e/responsive-header.spec.ts`. All 12 matrix combinations (3 viewports × 2 sidebar states × 2 languages) must pass. Failing any combination blocks merge.

**Acceptance Scenarios**:

1. **Given** the CI pipeline runs Playwright, **When** a commit changes header CSS, HTML, or sidebar JS, **Then** all 12 matrix cells run and fail CI if any single cell's visual/geometric assertions fail.
2. **Given** a developer runs the smoke locally, **When** they inspect the test output, **Then** failing cells produce a screenshot artifact showing the broken state and a clear message identifying which acceptance scenario failed.

---

### Edge Cases

- **Extreme zoom (250%)**: dashboard remains usable; title may shrink further or break to a third line, but never word-by-word. No hard guarantee beyond 200% zoom.
- **Extremely narrow viewport (<320px)**: dashboard gracefully degrades — controls may stack vertically, title may truncate with ellipsis. Not a supported device class, but layout must not visually shatter.
- **Sidebar toggled during scroll**: if the user opens the sidebar mid-scroll (header is in compact state), the background continuity still holds — no flicker, no seam appearing during the sidebar's slide-in animation.
- **Language toggle mid-scroll**: switching EN ↔ zh-TW while the header is in compact state MUST not break the layout. Chinese title in compact state is shorter by character count than English; both must fit the compact row.
- **Reset to Defaults pressed at narrow viewport**: if the Reset button wraps to a second row, it must still be clickable. The confirm overlay it raises must not inherit the header's compact state.
- **Theme toggle (light/dark)**: background-continuity fix must work in BOTH themes. Dark-theme seam is most visible today; light-theme seam may be subtler but must be equally absent.

## Requirements *(mandatory)*

### Functional Requirements

**Header layout structure**

- **FR-001**: At viewport widths ≥ 1024px, the header MUST render its title, status pill, and controls on a single row.
- **FR-002**: At viewport widths 768px–1023px, the header MUST stack the title on the first row and the status pill + controls on a second row below it, without the title wrapping word-by-word.
- **FR-003**: At viewport widths < 768px, the header MUST stack into at most three rows (title, status pill, controls) with the title occupying the first row and reducing font-size gracefully so it fits on at most 2 visual lines.
- **FR-004**: At every viewport size, the title MUST NOT break individual words onto their own lines. If the viewport is narrower than the title's min-content width at the current font size, the title's font-size MUST shrink via a `clamp()` or equivalent responsive rule until the title fits on at most 2 lines.

**Title typography**

- **FR-005**: The title's CSS MUST include a word-break rule (e.g., `word-break: keep-all` for zh-TW support) or an equivalent mechanism to prevent per-word breaking at word boundaries. Line breaking, when it does occur, MUST happen at the em-dash separator ("—") or between the logical title segments (e.g., "FIRE Command Center" / "Universal Template"), never inside either segment.
- **FR-006**: The title's responsive font-size range (currently `clamp(1.8rem, 2.4vw + 0.5rem, 2.35rem)`) MUST be preserved or extended so that at the phone viewport (400px) the title is no smaller than 1.2rem.
- **FR-007**: zh-TW title rendering MUST maintain the same 2-line-max invariant. If Chinese characters render narrower per line than the English equivalent, the layout MUST NOT grant the title extra vertical space just for one language.

**FIRE-status pill**

- **FR-008**: The `#fireStatus` pill MUST be a layout-participating flex/grid sibling of the title block — not absolutely positioned. Narrow viewports MUST reflow it below the title rather than producing overlap.
- **FR-009**: At viewport widths < 768px, the pill MUST either (a) reduce its text size by one step, (b) wrap its text to 2 lines, or (c) gracefully truncate with ellipsis — whichever produces the most legible result. Choice of behaviour is an implementation detail for the Frontend Engineer.
- **FR-010**: The pill's bounding rectangle at every viewport size MUST have zero geometric overlap with the title's bounding rectangle (verified by Playwright via `getBoundingClientRect` assertions per US5).

**Background continuity (sidebar-open case)**

- **FR-011**: The sticky header's background colour MUST span the full viewport width from left edge to right edge regardless of whether the lifecycle sidebar chart is open or closed.
- **FR-012**: The sidebar panel, when open, MUST either (a) sit BELOW the sticky header in visual z-order (header visually covers the sidebar's top edge), OR (b) have its top edge begin at or below the header's bottom edge so no background seam appears.
- **FR-013**: The background-continuity guarantee MUST hold in both the expanded header state and the compact `.header--compact` sticky state.
- **FR-014**: The background-continuity guarantee MUST hold in both light and dark themes.

**Existing behaviour preservation**

- **FR-015**: The existing `.header--compact` sticky-collapse transition (title shrink from ~2.2rem to ~1.1rem, subtitle fade-out, background opacity change, 240ms cubic-bezier timing) MUST be preserved exactly. No visual or timing regression.
- **FR-016**: All four header controls (EN/中文 toggle, theme toggle `#themeToggle`, sidebar toggle `#sidebarToggle`, Reset to Defaults button) MUST remain visible and clickable at every viewport size covered by FR-001 through FR-003.
- **FR-017**: The header's `data-i18n` bindings on `header.title` and `header.subtitle` MUST continue to work unchanged. No new i18n keys are introduced by this feature (layout-only).
- **FR-018**: Chart.js loading, KPI-card rendering, and all other dashboard elements below the header MUST remain unaffected by this feature.

**Test coverage**

- **FR-019**: A new Playwright test suite at `tests/e2e/responsive-header.spec.ts` MUST exercise three viewport sizes (400 × 800, 768 × 1024, 1440 × 900) × two sidebar states (open, closed) × two languages (EN, zh-TW) = 12 matrix cells.
- **FR-020**: Each matrix cell MUST assert: (a) title bounding rectangle does not overlap the status pill's bounding rectangle, (b) title occupies ≤ 2 visual lines (bounded by `getBoundingClientRect().height` / line-height), (c) header background colour sampled at (viewport_width − 1, header_bottom − 1) matches the colour sampled at (1, header_bottom − 1), and (d) all four header controls are visible (`.isVisible()` returns true for each).
- **FR-021**: On failure, each cell MUST produce a screenshot artifact in `tests/e2e/artifacts/responsive-header/` for debugging.

**Scope boundaries**

- **FR-022**: This feature is **Generic-only**. `FIRE-Dashboard.html` (RR) is not present in this repository; scope is `FIRE-Dashboard-Generic.html` + `tests/e2e/` + new Playwright config if needed.
- **FR-023**: This feature is **layout-only**. No calc logic, no i18n string changes, no chart data changes, no persistence changes.
- **FR-024**: This feature MUST NOT introduce a build step, bundler, framework, or new runtime dependency beyond Playwright (which is a dev-only dependency already anticipated by constitution §Development Workflow).

### Key Entities *(include if feature involves data)*

- **`#siteHeader`** — the sticky header element, direct child of `<body>`. Currently uses CSS grid `1fr auto auto`. Must become responsive via media queries that adjust `grid-template-columns` / `grid-template-rows` / `flex-wrap` depending on viewport width.
- **`.header__brand`** — wraps `<h1>` + `.subtitle`. Currently the `1fr` column. Must accept `min-width: 0` or equivalent to participate in flex/grid shrinking without overflow.
- **`.fire-status` pill** — currently lives in `.header__status` column. Must become a layout-participating flex/grid child, not absolutely positioned.
- **`.header__controls`** — wraps the four buttons. Must gracefully wrap or compress at narrow widths.
- **Lifecycle sidebar panel** — a separate positioned element that currently overlaps the header's right edge. Must either have its top edge adjusted to sit below the header OR be placed below the header in the DOM/z-index stack.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At viewport width 1440px, the header renders on a single row with title + status pill + controls horizontally aligned. Verified by Playwright `getBoundingClientRect` assertions.
- **SC-002**: At viewport width 768px, the header title fits on ≤ 2 lines, and the status pill + controls occupy a second row below the title. Verified by Playwright.
- **SC-003**: At viewport width 400px, the header title fits on ≤ 2 lines at ≥ 1.2rem font size, and no word appears isolated on its own line. Verified by counting words vs line count: `title.textContent.split(/\s+/).length > title.boundingClientRect.height / line-height`.
- **SC-004**: At every viewport size and sidebar state, the header background sampled at the right edge (viewport_width − 1px, header_bottom − 1px) matches the background sampled at the left edge (1px, header_bottom − 1px) within visual tolerance (≤ 2 RGB-unit delta per channel). Verified by Playwright pixel-colour sampling.
- **SC-005**: The `#fireStatus` pill and `h1` title have zero geometric overlap at every viewport size covered by FR-001 through FR-003. Verified by Playwright DOMRect intersection check.
- **SC-006**: The `.header--compact` sticky-collapse transition fires at the same scroll threshold and with the same timing (240ms ± 30ms) as pre-feature-011 behaviour. Verified by Playwright `expect(page.locator('.header')).toHaveClass(/header--compact/)` after programmatic scroll.
- **SC-007**: All four header controls (`#langEN`, `#langZH`, `#themeToggle`, `#sidebarToggle`, Reset) are `visible` and `clickable` at every viewport size. Verified by Playwright.
- **SC-008**: The Playwright test suite at `tests/e2e/responsive-header.spec.ts` completes in ≤ 60 seconds locally on a mid-range laptop and has 12 passing cells with 0 skipped.
- **SC-009**: Visual regression: a human reviewer loads the dashboard at each of the three viewport sizes × two sidebar states × two languages (12 screenshots total) and confirms the header looks polished, continuous, and professional — no seams, no overlaps, no word-by-word stacks.
- **SC-010**: Zero regression in pre-feature-011 behaviour: the 161 existing unit tests remain green. If any unit test touches header-adjacent logic (unlikely — most unit tests are pure calc), it must continue to pass.

## Assumptions

- The existing CSS grid structure in `.header` (three-column `1fr auto auto`) is kept as the ≥ 1024px baseline. Media queries add responsive variants below that breakpoint.
- The breakpoint choices (1024px, 768px, 400px) follow common web responsive conventions; other feature specs in this project have not established project-specific breakpoints, so these new ones become the de-facto standard.
- The lifecycle sidebar panel's current z-index / positioning is controlled by CSS in `FIRE-Dashboard-Generic.html`; reading its current style inline is sufficient to diagnose the seam fix. No sidebar logic changes are expected.
- Playwright is available as a dev dependency; if not, the feature installs it under `devDependencies` in a new or existing `package.json`. No runtime bundle impact.
- Playwright tests run against the static HTML file opened via `file://` or a local `http-server`. The existing Node test runner (used for unit tests) does NOT run Playwright — they are separate commands.
- The `word-break: keep-all` rule is safe for both English and Chinese. For English it prevents mid-word breaks (unlikely anyway) and segment-isolated wraps; for Chinese `keep-all` is the correct behaviour to avoid character-by-character wrap, though modern browsers default to that for CJK.
- The FIRE-status pill's current absolute positioning (if any is relied upon by CSS in the file) will be refactored to a flex/grid sibling in the same commit. This is a layout-structural change, not a visual one.
- Viewport sizes below 320px are not supported. The design target is iPhone SE (375px) as the smallest reasonable mobile viewport; 400px is used in the test matrix as a safety margin.
- No new runtime dependencies. Playwright is dev-only.
- The RR dashboard (`FIRE-Dashboard.html`) is NOT in this repository; lockstep per constitution Principle I is vacuously satisfied. If RR ever returns to the repo, the same responsive header fixes must be ported in parallel — track that as a BACKLOG item when RR is reinstated.
