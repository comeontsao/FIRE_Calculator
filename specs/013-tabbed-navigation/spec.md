# Feature Specification: Tabbed Dashboard Navigation

**Feature Branch**: `013-tabbed-navigation`
**Created**: 2026-04-25
**Status**: Draft
**Input**: User description: "Lets work on both of the dashboards, right now the page interface is too noisy with too much information shown in the same time. I think this can be solved by deviding the information into tabs. For example, the 1. Your Plan is a tab, under it, we have different catagories that we have to fill in. Just like those Tax filing websites, where they have each catagory and item we must go through for the first time, but once they are filled, we can switch in between them to adjust the information inside, so there is a 'work flow' to fill in the first time. I want to make sure all the calculation logic is the same, the only difference is on the frontend look page logic. Please don't hesitate to ask questions if you have any, I want this to be planned properly"

## Summary

Replace the current single-scrolling layout of `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` with a **4-tab themed navigation** (Plan · Geography · Retirement · History). Each tab has its own **sub-tab pill bar** that exposes the existing input cards and charts one at a time, with a `Next →` button on each card to walk through pills like a tax-filing wizard. The KPI ribbon, FIRE-mode gate selector, language toggle, and right-edge Lifecycle sidebar remain pinned across every tab so headline numbers never disappear. **Calculation logic, chart data sources, and formulas are not modified.** The change is pure frontend reorganization.

The current 18-section single scroll forces the user to skim past unrelated content every session. Tabbing into 4 themes reduces what is on screen at once by ~70%, gives each surface one story, and gives a clear "first-time fill it in / later edit any tab" workflow without building a separate wizard mode.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Navigate the dashboard via 4 themed tabs (Priority: P1)

A returning user opens the dashboard and sees four tabs at the top — **Plan · Geography · Retirement · History**. Clicking any tab reveals its sub-tab pill bar and shows the active pill's card. Switching tabs and pills never causes the KPI ribbon, FIRE-mode gate, or right-edge Lifecycle sidebar to disappear, so the user always sees the live FIRE age and progress while editing.

**Why this priority**: This is the MVP. Without tab navigation, no other story exists. It delivers the entire visible reorganization promise on its own.

**Independent Test**: Open either dashboard, confirm 4 tabs render with correct labels and a pill bar appears under the active tab; click each tab and verify its pills appear and only the active pill's content is visible; verify KPI ribbon + Lifecycle sidebar stay visible during every switch; verify all input fields and charts that exist today are reachable through some tab+pill combination.

**Acceptance Scenarios**:

1. **Given** the dashboard at first load, **When** the user reads the page, **Then** they see exactly 4 top-level tabs in order Plan · Geography · Retirement · History, with a sub-tab pill bar under the active tab.
2. **Given** the **Plan** tab is active, **When** the user reads the sub-tab pill bar, **Then** they see exactly 6 pills in order: Profile · Assets · Investment · Mortgage · Expenses · Summary.
3. **Given** the **Geography** tab is active, **When** the user reads the sub-tab pill bar, **Then** they see exactly 4 pills in order: Scenarios · Country Chart · Healthcare · Country Deep-Dive.
4. **Given** the **Retirement** tab is active, **When** the user reads the sub-tab pill bar, **Then** they see exactly 5 pills in order: Social Security · Withdrawal Strategy · Drawdown · Lifecycle · Milestones.
5. **Given** the **History** tab is active, **When** the user reads the sub-tab pill bar, **Then** they see exactly 1 pill: Snapshots.
6. **Given** any pill is active, **When** the user clicks any other pill in the same tab, **Then** only the new pill's card is visible and the previous pill's card is hidden, with no page scroll jump.
7. **Given** the user clicks a different tab, **When** the new tab activates, **Then** the new tab's first pill is the active pill and its card is rendered.
8. **Given** the active pill contains a Chart.js chart, **When** the pill becomes visible after a tab/pill switch, **Then** the chart renders at the correct width within 200 ms with no clipping or zero-width artifact.
9. **Given** any tab/pill is active, **When** the user inspects the page, **Then** the site header, KPI ribbon, FIRE-mode gate selector (Safe/Exact/DWZ), language toggle, right-edge Lifecycle sidebar, and footer remain present and interactive.
10. **Given** the user adjusts an input inside an active pill (e.g., changes income on Plan/Profile), **When** the recalc fires, **Then** the KPI ribbon and Lifecycle sidebar update immediately with the same numbers they would show in the pre-tabbed layout.

---

### User Story 2 — Persist last-viewed tab+pill across reloads and support deep links (Priority: P2)

A user navigating to Retirement → Lifecycle and reloading the page lands back on Retirement → Lifecycle, not on the home view. A user who pastes a deep-link URL (e.g., shared from a different machine) lands directly on the specified tab and pill.

**Why this priority**: Without persistence, every reload feels like restarting a tax form. Deep-links also unlock the ability to bookmark specific surfaces (e.g., "the Withdrawal Strategy view"). The feature works without P2 (P1 alone is usable), but P2 multiplies the value of P1.

**Independent Test**: Navigate to a non-default tab+pill, hard-reload the page, verify the same tab+pill is restored; copy the URL and open it in a new browser session, verify the same tab+pill opens; clear localStorage and load the page with no hash, verify Plan/Profile opens.

**Acceptance Scenarios**:

1. **Given** the user navigates to Retirement → Lifecycle, **When** the page reloads, **Then** Retirement is the active tab and Lifecycle is the active pill within 2 seconds of load.
2. **Given** the user navigates anywhere, **When** the URL is inspected, **Then** the URL hash reflects the current state in the format `#tab=<tab>&pill=<pill>`.
3. **Given** a URL with hash `#tab=geography&pill=healthcare` is pasted into a fresh browser tab, **When** the page loads, **Then** Geography is the active tab and Healthcare is the active pill, regardless of what is in localStorage.
4. **Given** a fresh browser with empty localStorage and no URL hash, **When** the page loads, **Then** Plan is the active tab and Profile is the active pill.
5. **Given** the URL hash references a non-existent pill (e.g., `#tab=plan&pill=xyz`), **When** the page loads, **Then** the system falls back to the first pill of the named tab without throwing.
6. **Given** the URL hash references a non-existent tab, **When** the page loads, **Then** the system falls back to Plan/Profile without throwing.
7. **Given** the user uses browser Back/Forward after several tab/pill changes, **When** navigation history is replayed, **Then** the active tab+pill follows the history, matching the URL hash for each step.

---

### User Story 3 — Workflow `Next →` button to walk through a tab one card at a time (Priority: P2)

A first-time user opens the dashboard on Plan/Profile, fills in the Profile card, clicks **Next →**, and is moved to the Assets pill where they continue. Successive Next clicks walk through Profile → Assets → Investment → Mortgage → Expenses → Summary inside the Plan tab. The same `Next →` pattern works inside Geography and Retirement.

**Why this priority**: This delivers the "tax-website workflow" feeling the user explicitly asked for. Without it, the pill bar still works (you can click pills directly), so it is independent of P1; with it, first-time setup is markedly easier. P2 priority because the feature is usable without it.

**Independent Test**: Open Plan/Profile, locate the Next → button on the Profile card, click it and verify Assets becomes the active pill; repeat through all pills in Plan; on Plan/Summary (the last pill), verify Next → is disabled or hidden; repeat across Geography and Retirement.

**Acceptance Scenarios**:

1. **Given** the user is on Plan/Profile, **When** they click `Next →`, **Then** the active pill becomes Plan/Assets and the Profile card is hidden.
2. **Given** the user is on Plan/Summary (the last pill in Plan), **When** they read the card, **Then** the `Next →` button is either disabled, omitted, or replaced with a non-action label (no auto-advance to the Geography tab).
3. **Given** the user is on History/Snapshots (a tab with one pill), **When** they read the card, **Then** there is no `Next →` button (or it is disabled) since there is no next pill in the tab.
4. **Given** any tab+pill, **When** the user clicks `Next →`, **Then** the URL hash and localStorage update to reflect the new pill (consistent with P2).

---

### User Story 4 — Mobile pill bars scroll horizontally instead of wrapping (Priority: P2)

A user on a phone (≤767px viewport) sees a horizontal pill bar that scrolls left/right on touch instead of stacking onto multiple lines. The same applies to the sub-tab pill bar.

**Why this priority**: Without it, mobile users see ugly multi-line wrapped pills that consume vertical space. The dashboards are routinely viewed on phone for snapshot entry and quick checks. P2 because the desktop experience already works without this story.

**Independent Test**: Resize the browser to 767px or use device emulation; verify the top tab bar and sub-tab bar render in a single horizontal row with overflow scrolling enabled; verify scroll position persists when switching pills (best-effort).

**Acceptance Scenarios**:

1. **Given** the viewport is ≤767px, **When** the page renders, **Then** the top tab pill bar fits in a single row with horizontal scrolling enabled (`overflow-x: auto`, `flex-wrap: nowrap`).
2. **Given** the viewport is ≤767px, **When** any tab is active, **Then** its sub-tab pill bar renders in a single row with horizontal scrolling enabled.
3. **Given** the viewport is ≤767px, **When** the user touches and drags the pill bar, **Then** it scrolls horizontally without triggering pill activation.
4. **Given** the viewport is ≤767px, **When** the user clicks a pill that is partially off-screen, **Then** the pill bar scrolls (smoothly is acceptable but not required) so the active pill is fully visible.

---

### Edge Cases

- **Stale localStorage from before the feature ships**: keys for old layout state (none expected, but verify) are ignored. The new key `dashboardActiveView` is the only persistence touched by this feature.
- **localStorage write failure** (private browsing quota): tab/pill state is in-memory only for that session; the page must not throw.
- **Hash with extra params** (e.g., `#tab=plan&pill=profile&foo=bar`): unknown params are ignored.
- **Two browser tabs with different active views**: each writes its own state to localStorage; last write wins. No cross-tab synchronization required.
- **Language toggle while on a pill**: the active pill is preserved by ID; only the visible labels swap.
- **Country card click in Geography → Scenarios**: must switch the active pill to Geography → Country Deep-Dive (preserves the current click-to-deep-dive UX).
- **Charts inside an initially-hidden tab**: charts that were never visible at load must resize correctly when their pill is first revealed (no zero-width canvas).
- **Click on already-active tab or pill**: no-op (no flicker, no double event, no redundant render).
- **Sticky compact header observer (Feature 006 US2)**: was observing scroll position of cards that will move into hidden tabs. Must be scoped to the active tab or rewired to a fixed-height anchor inside the tab container.
- **Right-edge Lifecycle sidebar (Feature 006 US1)**: lives outside the tab container; behavior unchanged.
- **Quick What-If references in JS**: any leftover `getElementById('quickWhatIf*')` calls must be deleted, not silently fall through.

## Requirements *(mandatory)*

### Functional Requirements

**Tab and pill structure**

- **FR-001**: Both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` MUST render a top-level tab bar with exactly 4 tabs in fixed order: Plan, Geography, Retirement, History.
- **FR-002**: The **Plan** tab MUST contain exactly 6 sub-tab pills in fixed order: Profile, Assets, Investment, Mortgage, Expenses, Summary.
- **FR-003**: The **Geography** tab MUST contain exactly 4 sub-tab pills in fixed order: Scenarios, Country Chart, Healthcare, Country Deep-Dive.
- **FR-004**: The **Retirement** tab MUST contain exactly 5 sub-tab pills in fixed order: Social Security, Withdrawal Strategy, Drawdown, Lifecycle, Milestones.
- **FR-005**: The **History** tab MUST contain exactly 1 sub-tab pill: Snapshots.
- **FR-006**: Existing input/output cards MUST be relocated into pills per the mapping table below; no card content is rewritten beyond what is required to host it inside its pill container.
- **FR-007**: Quick What-If markup, JavaScript event handlers, and i18n keys MUST be removed entirely from both files (not hidden, removed).

**Pill content mapping**

| Tab | Pill | Existing card(s) hosted |
|-----|------|------------------------|
| Plan | Profile | Profile & Income (`sec.profileIncome`) |
| Plan | Assets | Current Assets (`sec.currentAssets`) |
| Plan | Investment | Investment & Savings (`sec.investSavings`) |
| Plan | Mortgage | Mortgage Scenario (`sec.mortgage`) and any associated mortgage-impact subcards |
| Plan | Expenses | Monthly Expense Breakdown (`sec.expenses`) |
| Plan | Summary | Savings Rate (`sec.savingsRate`) + Net Worth Breakdown pie (`sec.netWorthPie`) + Expense Distribution pie (`sec.expenseDist`) |
| Geography | Scenarios | Geo-Arbitrage Scenarios card (`sec.geoArbitrage`) |
| Geography | Country Chart | Years to FIRE by Retirement Location chart (`sec.countryChart`) |
| Geography | Healthcare | Healthcare by Country (`sec.healthcare`) |
| Geography | Country Deep-Dive | Country deep-dive panel currently rendered after the Geo-Arbitrage card |
| Retirement | Social Security | Social Security — Realistic Estimator & Three-Phase FIRE (`sec.socialSecurity`) |
| Retirement | Withdrawal Strategy | Feature 007 (Bracket-Fill) controls + Feature 008 (Multi-Strategy) controls and ranked comparison |
| Retirement | Drawdown | Portfolio Drawdown: With vs Without SS chart (`sec.drawdown`) |
| Retirement | Lifecycle | Full Portfolio Lifecycle chart, expanded view (`sec.lifecycle`) |
| Retirement | Milestones | FIRE Milestone Timeline (`sec.milestones`) |
| History | Snapshots | Snapshot History — Track Your Progress Over Time (`sec.snapshots`) |

**Tab and pill behavior**

- **FR-008**: At any time, exactly one tab MUST be marked active and exactly one pill within the active tab MUST be marked active.
- **FR-009**: Clicking a non-active tab MUST switch the active tab and reset the active pill to the new tab's first pill.
- **FR-010**: Clicking a non-active pill within the active tab MUST switch the active pill without changing the active tab.
- **FR-011**: Inactive tabs and inactive pills MUST hide their card content via CSS class (e.g., `display:none`) without removing it from the DOM.
- **FR-012**: All 4 tabs and all pills MUST be present in the DOM at first page load (no lazy mount), so existing Chart.js instances and event listeners persist across tab switches.
- **FR-013**: Switching to a pill containing one or more Chart.js charts MUST trigger `chart.resize()` (or equivalent) for each chart in that pill within 200 ms of the switch.
- **FR-014**: Clicking the already-active tab or already-active pill MUST be a no-op (no event, no re-render, no flicker).

**Persistent chrome**

- **FR-015**: The site header, language toggle, KPI ribbon (FIRE age / years-to-FIRE / progress / net worth), FIRE-mode gate selector (Safe / Exact / DWZ), right-edge pinned Lifecycle sidebar, and footer MUST remain rendered and interactive across all tab/pill switches.
- **FR-016**: The right-edge Lifecycle sidebar MUST continue to mirror `_lastLifecycleDataset` per Feature 006 US1 contract; this feature does not relocate or modify the sidebar.
- **FR-017**: The sticky compact header (Feature 006 US2) MUST continue to function correctly when the user scrolls inside the active tab; the IntersectionObserver that drives it MUST be scoped to the active tab content or rewired to a fixed-height anchor inside the tab container.

**`Next →` button workflow**

- **FR-018**: Each card inside every pill (except the last pill of each tab) MUST include a `Next →` button (i18n key `nav.next`) that, when clicked, advances to the next pill in the same tab.
- **FR-019**: The last pill of each tab (Plan/Summary, Geography/Country Deep-Dive, Retirement/Milestones, History/Snapshots) MUST NOT auto-advance to the next tab. The `Next →` button on these pills MUST be disabled, omitted, or replaced with a non-action label.
- **FR-020**: Clicking `Next →` MUST update the URL hash and localStorage state consistent with FR-024 and FR-025.

**State, persistence, routing**

- **FR-021**: The active tab+pill MUST be persisted to `localStorage` under the single key `dashboardActiveView` as a JSON object `{tab: <string>, pill: <string>}`.
- **FR-022**: On page load with non-empty `dashboardActiveView` and no URL hash, the system MUST restore the saved tab+pill.
- **FR-023**: The URL hash MUST reflect the current tab+pill in the format `#tab=<tab>&pill=<pill>`. URL updates MAY use `history.replaceState` to avoid polluting browser history on every change, EXCEPT when the user clicks `Next →` or a tab/pill explicitly — those MUST use `history.pushState` so Back/Forward navigation works.
- **FR-024**: On page load with a non-empty URL hash, the URL hash MUST take precedence over `dashboardActiveView`.
- **FR-025**: A first-time visitor (empty `dashboardActiveView` and empty URL hash) MUST land on Plan / Profile.
- **FR-026**: An invalid tab name in the hash or localStorage MUST fall back to Plan / Profile without throwing.
- **FR-027**: An invalid pill name (valid tab, unknown pill) MUST fall back to the first pill of the named tab without throwing.
- **FR-028**: The browser `popstate` event MUST drive tab+pill changes so Back / Forward navigation matches the URL hash.

**Cross-pill click handlers**

- **FR-029**: Clicking a country card in Geography → Scenarios MUST switch the active pill to Geography → Country Deep-Dive (preserves the existing click-to-deep-dive UX).

**Mobile responsive**

- **FR-030**: At viewport widths ≤767px, the top tab pill bar and the sub-tab pill bar MUST scroll horizontally without wrapping (`overflow-x: auto`, `flex-wrap: nowrap`, momentum scroll on iOS).
- **FR-031**: At viewport widths ≤767px, no tab or pill label may be truncated to the point where its meaning is lost; if needed, labels may be shortened via shorter i18n strings, but every tab/pill must remain identifiable.

**Lockstep across both HTML files**

- **FR-032**: `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` MUST have identical tab/pill structure, identical IDs, identical class names, and identical CSS styles for all tabs/pills/sub-pill bars so that the same JavaScript drives both files.
- **FR-033**: Personal-only content unique to `FIRE-Dashboard.html` (Roger/Rebecca named labels, private numeric defaults) MUST live inside the same pills as the corresponding Generic content; no new "personal" pill is added.

**i18n**

- **FR-034**: New i18n keys MUST be added in both EN and zh-TW for every tab label and every pill label, plus the `Next →` button label. Estimated total: 21 new key pairs (4 tabs + 16 pills [Plan 6 + Geography 4 + Retirement 5 + History 1] + 1 button).
- **FR-035**: Tab and pill labels MUST update when the language toggle is used; pill state (active pill ID) MUST be preserved across language switches.

**Calc and data invariants (negative requirements)**

- **FR-036**: This feature MUST NOT modify any calculation logic, formula, chart data source, chart type, or dataset transformation. Existing 161 unit tests MUST pass without changes.
- **FR-037**: This feature MUST NOT add new input fields, MUST NOT rename existing input field IDs, and MUST NOT change any existing event handler signature.
- **FR-038**: This feature MUST NOT add new localStorage keys beyond `dashboardActiveView`. Existing keys (`scenarioOverrides`, `ssEarningsHistory`, snapshot blobs, etc.) are unchanged.
- **FR-039**: This feature MUST NOT change the FIRE-mode gate behavior (Safe/Exact/DWZ feasibility — see CLAUDE.md "FIRE-mode gates" rule).

### Key Entities

- **Tab**: a top-level theme. Has an `id` (`plan`, `geography`, `retirement`, `history`), a `labelKey` (i18n key), and an ordered list of pills.
- **Pill**: a sub-tab inside a tab. Has an `id` (e.g., `profile`, `lifecycle`, `ss`), a `labelKey`, and references one or more existing card DOM nodes that it hosts.
- **ActiveView**: the persisted state object `{tab: <tab.id>, pill: <pill.id>}`. Stored in `localStorage` under `dashboardActiveView` and reflected in the URL hash.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After the change, the number of cards visible above the fold at first page load is reduced by at least 70% compared to the pre-tabbed layout, on a 1440×900 desktop viewport.
- **SC-002**: A user can navigate from any tab to any other tab in 1 click, and from any pill to any other pill in the same tab in 1 click.
- **SC-003**: Time from page load to first interactive view (Plan/Profile pill rendered with all its inputs editable) is under 1.5 seconds on a broadband connection.
- **SC-004**: Switching to a pill that contains 2+ Chart.js charts completes chart rendering within 200 ms of the click, with no zero-width or clipped chart.
- **SC-005**: After navigating to Retirement → Lifecycle, hard-reloading the page restores Retirement → Lifecycle within 2 seconds of load.
- **SC-006**: A deep-link URL (`#tab=<tab>&pill=<pill>`) opened in a fresh browser session lands on the specified tab+pill 100% of the time across 4 tabs × all pills.
- **SC-007**: All existing unit tests pass without modification (161 tests as of feature 011); the calc engine is verified unchanged via at least one golden-input → golden-output snapshot test in the test suite.
- **SC-008**: Zero `console.error` messages with `[<shim-name>] canonical threw:` prefixes are emitted during a manual smoke walk through every tab and every pill on both HTML files.
- **SC-009**: A Playwright DOM-diff or snapshot test verifies that `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` produce identical tab/pill structure (same tab IDs, same pill IDs, same order, same active class).
- **SC-010**: KPI ribbon and right-edge Lifecycle sidebar remain visible (>0px height, in viewport) during 100% of tab and pill switches; verified by Playwright across at least one switch on each tab.
- **SC-011**: At viewport widths ≤767px, the top tab pill bar and sub-tab pill bar render in a single horizontal row (verified by `flex-wrap: nowrap` computed style and a Playwright screenshot diff).
- **SC-012**: Quick What-If markup is fully removed: a grep for `quickWhatIf` (case-insensitive) in both HTML files returns zero hits.
- **SC-013**: Browser Back/Forward after navigating through 3+ tabs/pills correctly restores each prior view (URL hash matches the active tab+pill at each history step).

## Assumptions

- The project remains a zero-dependency vanilla-JS + Chart.js single-file HTML app — no framework, no bundler, no build step is introduced by this feature.
- Inline `<script>` calc blocks and `<script>` UI handlers stay inline; this feature does not extract any module out of HTML.
- The right-edge pinned Lifecycle sidebar (Feature 006 US1) lives outside the tab container — the sidebar host is a sibling of the tab container, not a child of any tab.
- The sticky compact header (Feature 006 US2) is rewired to either scope its IntersectionObserver to the active tab content or anchor on a fixed-height sentinel inside the tab container; either approach is acceptable as long as the sticky behavior continues to work.
- The FIRE-mode gate selector (Safe / Exact / DWZ) and the strategy selector (Feature 008) remain in the persistent chrome above or near the KPI ribbon — exact placement is an implementation detail, but they MUST stay visible across all tabs.
- Existing localStorage keys for input data and snapshots are not touched. The only new persistence key is `dashboardActiveView`.
- Both HTML files ship the change in the same PR (Constitution Principle I — lockstep). Personal-only content stays unique to `FIRE-Dashboard.html` but lives inside the same pill IDs as the corresponding Generic content.
- The README at the project root will be updated as part of this feature's PR to describe the new tab structure for users opening the dashboard for the first time.
- 161 existing unit tests (as of feature 011) pass before and after this feature with no modification.
- The i18n catalog (`FIRE-Dashboard Translation Catalog.md`) will be extended with the new tab/pill/Next keys (EN + zh-TW).

## Out of Scope

- No first-run wizard mode with progress checkmarks and a one-time guided walk-through (rejected during brainstorming — `Next →` button + pill bar is sufficient).
- No left-rail vertical tab placement (rejected — top horizontal only).
- No new charts, no new metrics, no new input fields.
- No calc/formula changes, no withdrawal-strategy changes, no SS estimator changes.
- No data migrations on `FIRE-snapshots.csv` or any localStorage value other than the new `dashboardActiveView`.
- No removal of existing functionality other than the explicitly-removed Quick What-If section.
- No tab placement variants (no left rail, no right rail, no breadcrumb extra row).
