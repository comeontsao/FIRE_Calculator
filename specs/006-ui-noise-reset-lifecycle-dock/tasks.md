---

description: "Task list for feature 006 UI Noise Reset + Lifecycle Dock"
---

# Tasks: UI Noise Reset + Lifecycle Dock

**Input**: Design documents from `specs/006-ui-noise-reset-lifecycle-dock/`
**Prerequisites**: [plan.md](./plan.md) ✅, [spec.md](./spec.md) ✅, [research.md](./research.md) ✅, [data-model.md](./data-model.md) ✅, [contracts/](./contracts/) ✅, [quickstart.md](./quickstart.md) ✅

**Tests**: This project uses a manual browser smoke harness (`tests/baseline/browser-smoke.test.js`) plus Node unit tests on calc modules. Since this feature introduces no calc changes, the non-regression contract is: existing unit + smoke tests must stay green, and the smoke harness gets two tiny extensions for the new DOM (sticky header + sidebar presence). No new test suites.

**Organization**: Three user stories from spec (US1, US2, US3). Per Constitution Principle I, every implementation task ships to BOTH `FIRE-Dashboard.html` (RR) and `FIRE-Dashboard-Generic.html` (Generic) in lockstep. Generic uses `inp.agePerson1` and `person1_*` field naming; RR uses `inp.ageRoger` and `roger*`. Legacy file (`FIRE-Dashboard - Legacy.html`) is OUT OF SCOPE.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files or independent concern, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1 = sidebar, US2 = sticky header, US3 = noise reduction)
- Include exact file paths in descriptions

## Path Conventions

- Dashboards (single-file HTML, no build): `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html` at repo root
- Translation catalog: `FIRE-Dashboard Translation Catalog.md` at repo root
- Smoke harness: `tests/baseline/browser-smoke.test.js`
- Legacy (excluded): `FIRE-Dashboard - Legacy.html` — DO NOT MODIFY

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm environment + baseline sanity before touching either dashboard.

- [ ] T001 Confirm current branch is `006-ui-noise-reset-lifecycle-dock` and working tree is clean; run `git status` and `git branch --show-current`
- [ ] T002 [P] Open both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` in a browser; confirm they render, no console errors, merged footer from feature 005 visible, country-drift fix from feature 005 behaves (click between countries — numbers stable); record the baseline as a dated screenshot in `specs/006-ui-noise-reset-lifecycle-dock/baseline-screenshots/` for before/after comparison during Phase 6 verification
- [ ] T003 [P] Run existing Node unit tests `node --test tests/unit/` and the browser smoke test `node tests/baseline/browser-smoke.test.js`; record results as the green baseline (any failure here blocks the feature)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared infrastructure that US1, US2, and US3 all depend on.

**⚠️ CRITICAL**: No user story implementation may begin until this phase is complete.

- [ ] T004 [P] Add new i18n keys to `FIRE-Dashboard.html` (RR) `TRANSLATIONS.en` and `TRANSLATIONS.zh` dicts per [visual-system.contract.md §V12](./contracts/visual-system.contract.md): `section.profile`, `section.outlook`, `section.compare`, `section.track`, `filter.label`, `header.yearsChipLabel`, `header.progressChipLabel`, `sidebar.title`, `sidebar.pinAria`, `sidebar.closeAria`, `sidebar.toggleAria`, `sidebar.fireAgeLabel`, `sidebar.endPortfolioLabel`
- [ ] T005 [P] Add the same i18n keys to `FIRE-Dashboard-Generic.html` `TRANSLATIONS.en` and `TRANSLATIONS.zh` (identical values)
- [ ] T006 [P] Add the same keys to `FIRE-Dashboard Translation Catalog.md` so the catalog stays in sync (Constitution Principle VII)
- [ ] T007 In `FIRE-Dashboard.html`, locate the primary lifecycle chart render function (`renderGrowthChart(inp)` around line ~5395 area; confirm via grep `function renderGrowthChart`). Introduce module-scope `let _lastLifecycleDataset = null;` near the other module-scope caches (`_lastKpiSnapshot` lives around line ~8868). Populate `_lastLifecycleDataset` inside `renderGrowthChart` immediately after the dataset is built, BEFORE `new Chart(...)` / `chart.update(...)` is called. Add a comment block at the cache declaration: `// Shared lifecycle dataset — consumed by: renderGrowthChart (primary), renderLifecycleSidebarChart (secondary)`.
- [ ] T008 In `FIRE-Dashboard-Generic.html`, repeat T007's change in the Generic file (same function name `renderGrowthChart`; `inp.agePerson1` is the age field — mirror the same `_lastLifecycleDataset` cache wiring)
- [ ] T009 Verify `chartState.onChange` listener ordering contract: in both files, confirm that the primary `renderGrowthChart` listener is already registered and that any NEW listener added for the sidebar (US1) or compact header stats (US2) will fire AFTER it. Document the ordering in a comment near the listener registration block (RR ~8781 area, Generic similar)

**Checkpoint**: Foundation ready. All three user stories can now proceed in parallel.

---

## Phase 3: User Story 1 — Pinnable lifecycle sidebar (Priority: P1) 🎯 MVP

**Goal**: Deliver a right-edge drawer hosting a mirror of the Full Portfolio Lifecycle chart. Pinned state persists; mobile overlay mode; chart stays in sync with primary via shared `_lastLifecycleDataset`.

**Independent Test**: Pin the sidebar, drag any input slider that affects the lifecycle projection, confirm the docked sidebar chart updates on the same frame as the primary chart. Reload page — sidebar is still pinned. Resize to <780px — sidebar becomes overlay. Tap outside → closes.

### Implementation for User Story 1

#### DOM + CSS (sidebar structure)

- [ ] T010 [P] [US1] Add the sidebar `<aside id="lifecycleSidebar">` HTML structure to `FIRE-Dashboard.html` at end of `<body>` (after footer, before closing `</body>`), matching the DOM in [lifecycle-sidebar.contract.md — Required DOM](./contracts/lifecycle-sidebar.contract.md). Also add `<div id="sidebarScrim" class="sidebar-scrim" aria-hidden="true"></div>` as a sibling.
- [ ] T011 [P] [US1] Add the identical sidebar DOM + scrim to `FIRE-Dashboard-Generic.html`
- [ ] T012 [P] [US1] Add the `.sidebar`, `.sidebar--open`, `.sidebar-scrim`, `.sidebar-scrim--visible`, `body.sidebar-docked .dashboard`, `body.sidebar-docked .footer-panel`, mobile `@media` and `prefers-reduced-motion` CSS rules to the `<style>` block of `FIRE-Dashboard.html` (full spec in [lifecycle-sidebar.contract.md — CSS Contract](./contracts/lifecycle-sidebar.contract.md))
- [ ] T013 [P] [US1] Add the identical sidebar CSS block to `FIRE-Dashboard-Generic.html`

#### Mirror chart wiring

- [ ] T014 [US1] In `FIRE-Dashboard.html`, implement `renderLifecycleSidebarChart(state)` that reads `_lastLifecycleDataset` (populated by T007), `_lastKpiSnapshot.fireAge`, and `_lastKpiSnapshot.endPortfolio`; instantiates a lazily-created Chart.js instance on `#lifecycleSidebarCanvas` (lazy: chart is created on first open, not on page load); writes `sidebarFireAge` and `sidebarEndPortfolio` text; guards with `if (sidebarMode === 'hidden') return;` to no-op when sidebar is closed. Place the function near `renderGrowthChart`. Add the Constitution-VI comment block: `// Inputs: _lastLifecycleDataset (from renderGrowthChart), _lastKpiSnapshot.fireAge, _lastKpiSnapshot.endPortfolio | Consumers: #lifecycleSidebar`.
- [ ] T015 [US1] In `FIRE-Dashboard-Generic.html`, implement the same `renderLifecycleSidebarChart(state)` (same function body; `inp.agePerson1` used wherever age is referenced in the dataset)
- [ ] T016 [US1] Register `renderLifecycleSidebarChart` as a `chartState.onChange` listener in BOTH files AFTER the primary lifecycle listener registration (order: primary produces dataset → sidebar consumes it)
- [ ] T017 [US1] In both files, update the primary lifecycle module's `Consumers:` comment (the comment block above `renderGrowthChart` — there is an existing Chart ↔ Module contract comment per Constitution Principle VI) to add `lifecycleSidebar` to the Consumers list. Also verify `calc/lifecycle.js` has a matching `Consumers:` update if it declares one.

#### State machine + persistence

- [ ] T018 [US1] In `FIRE-Dashboard.html`, implement the sidebar mode state machine per [lifecycle-sidebar.contract.md Behavioral Contract BH-1 through BH-12](./contracts/lifecycle-sidebar.contract.md):
  - Module-scope: `let sidebarMode = 'hidden';` and `const SIDEBAR_KEY = 'fire_dashboard_sidebar_pinned';`
  - Function `openSidebarDocked()`, `openSidebarOverlay()`, `closeSidebar()`, `toggleSidebarPin()`, `handleSidebarResize()`
  - Pin preference read in init: `localStorage.getItem(SIDEBAR_KEY) === '1'`
  - Pin preference write on every pin/unpin: wrapped in try/catch (BH-11)
  - Resize listener: crossing 780px flips mode per BH-9
  - Scrim click + Escape key → `closeSidebar()` (BH-7, BH-8)
- [ ] T019 [US1] Repeat T018 in `FIRE-Dashboard-Generic.html`. The ONLY file-specific diff: `const SIDEBAR_KEY = 'fire_dashboard_generic_sidebar_pinned';`
- [ ] T020 [US1] In both files, wire the sidebar pin button and close button click handlers to `toggleSidebarPin()` and `closeSidebar()` respectively. Wire the `#sidebarToggle` button in the header (to be added in T024) to the appropriate toggle function based on viewport (`openSidebarDocked` / `openSidebarOverlay` / `closeSidebar`)

#### Chart.js resize handling

- [ ] T021 [US1] In both files, after pin/unpin transitions, call `chart.resize()` on every registered Chart.js instance. Attach a `transitionend` listener on `.dashboard` that fires `resizeAllCharts()` when `event.propertyName === 'margin-right'`. Include a `setTimeout(resizeAllCharts, 350)` fallback for browsers that do not fire `transitionend` reliably (per [research.md R6](./research.md))
- [ ] T022 [US1] Verify FIRE-marker drag on the lifecycle chart still sustains ≥30 fps while the sidebar is pinned (Constitution performance floor). Manual check: open Chrome Performance tab, record a 5-second drag session with sidebar pinned on a desktop viewport; confirm frame rate stays above 30fps

#### Accessibility

- [ ] T023 [US1] In both files, implement focus management (per [lifecycle-sidebar.contract.md A11y-5](./contracts/lifecycle-sidebar.contract.md)): opening the sidebar moves focus to the pin button; closing restores focus to the element that triggered the open. Store `_lastSidebarTrigger` in module scope.

**Checkpoint**: User Story 1 complete. The sidebar can be pinned/unpinned, overlay mode works on mobile, chart stays in sync, preference persists, reduced-motion honored.

---

## Phase 4: User Story 2 — Sticky compact header (Priority: P1)

**Goal**: Header sticks to the top while scrolling; below ~80px it collapses to a compact form-factor with live "Years to FIRE" and "Progress %" chips. Animated transition honors `prefers-reduced-motion`. Language toggle and sidebar toggle live inside the header in both states.

**Independent Test**: Load the dashboard. Scroll past the first screen. Header remains visible, transitions smoothly to a compact bar with live chips. Scroll back — expands. Edit a slider — chip values update on the same frame as the KPI row. Enable `prefers-reduced-motion` in DevTools — state switches are instant.

### Implementation for User Story 2

#### DOM restructure

- [ ] T024 [US2] In `FIRE-Dashboard.html`, restructure the header per [sticky-header.contract.md Required DOM](./contracts/sticky-header.contract.md):
  - Add `<div id="headerSentinel" aria-hidden="true"></div>` immediately BEFORE the existing `<div class="header">` (becomes `<header id="siteHeader" class="header">`)
  - Reorganize header children into `.header__brand` (h1 + subtitle), `.header__status` (FIRE status pill + `.header__live-chips` container with `#headerYearsValue` and `#headerProgressValue` strongs), `.header__controls` (language toggle + `#sidebarToggle`)
  - Move the EN / 中文 language buttons from the absolutely-positioned `<div>` (current line ~961) into `.header__controls`; delete the absolute-positioned wrapper
  - Add `#sidebarToggle` button to `.header__controls` with `aria-pressed="false"` and `data-i18n-aria="sidebar.toggleAria"`
- [ ] T025 [US2] In `FIRE-Dashboard-Generic.html`, repeat T024's restructure

#### CSS

- [ ] T026 [P] [US2] In `FIRE-Dashboard.html`, replace the existing `.header`, `.header h1`, `.header .subtitle`, `.header .fire-status` CSS block with the new sticky header CSS from [sticky-header.contract.md CSS Contract](./contracts/sticky-header.contract.md). Include the `#headerSentinel` rule, `.header--compact` rule, `.header__live-chips` rules, and the `prefers-reduced-motion` media query
- [ ] T027 [P] [US2] Apply the identical CSS changes to `FIRE-Dashboard-Generic.html`

#### JS (IntersectionObserver + live stats)

- [ ] T028 [US2] In `FIRE-Dashboard.html`, implement the sticky header state toggle:
  - Inside the init block, create `const _headerObserver = new IntersectionObserver(entries => { const s = entries[0]; document.getElementById('siteHeader').classList.toggle('header--compact', !s.isIntersecting); }, { threshold: 0 });`
  - Observe `#headerSentinel`
  - No scroll listener; IntersectionObserver is the ONLY trigger (per [research.md R1](./research.md))
- [ ] T029 [US2] Repeat T028 in `FIRE-Dashboard-Generic.html`
- [ ] T030 [US2] In `FIRE-Dashboard.html`, implement `renderCompactHeaderStats(state)` per [sticky-header.contract.md Live Data Contract](./contracts/sticky-header.contract.md):
  - Read `_lastKpiSnapshot.yearsToFire` → `#headerYearsValue.textContent`
  - Read `_lastKpiSnapshot.progressPct` → `#headerProgressValue.textContent`
  - If undefined → `—`
  - Never trigger a recalc
  - Register as a `chartState.onChange` listener
- [ ] T031 [US2] Repeat T030 in `FIRE-Dashboard-Generic.html`

#### Wire sidebar toggle to US1 state machine

- [ ] T032 [US2] In both files, wire the `#sidebarToggle` click handler (implemented as stub in US1 T020) to actually open/close the sidebar based on viewport: `window.innerWidth >= 780 ? toggleSidebarPin() : (sidebarMode === 'hidden' ? openSidebarOverlay() : closeSidebar())`. Update `aria-pressed` on the toggle to reflect the sidebar's open/closed state.

**Checkpoint**: User Story 2 complete. Sticky header behaves per contract, live chips update in real time, language toggle still works, sidebar toggle wires through to US1.

---

## Phase 5: User Story 3 — Noise-reduction pass (Priority: P2)

**Goal**: Apply the 12 visual-system policy items (V1–V12 per [visual-system.contract.md](./contracts/visual-system.contract.md)) to both dashboards. Surface tiers, KPI accent policy, title typography, hover discipline, FIRE progress rail, filter demotion, emoji trim, language toggle relocation already done in US2, border cleanup, footer tip softening, section dividers.

**Independent Test**: With US1 and US2 complete, scan the page top-to-bottom. Count filled vs border-only cards → roughly half/half. KPI values all neutral color. Card titles title-case, no shouting uppercase. Four section dividers visible. FIRE Progress is a thin rail, not a card. Filter pills are demoted. Chart cards have no emoji. Footer tip border is neutral.

### Implementation for User Story 3

#### V1 Surface tiers (FR-020)

- [ ] T033 [P] [US3] In `FIRE-Dashboard.html`, add the `.card.surface--secondary { background: transparent; }` and `.card.is-interactive:hover { border-color: var(--accent) }` CSS rules per [visual-system.contract.md V1](./contracts/visual-system.contract.md). Remove the existing `.card:hover` accent rule (de-fault hover).
- [ ] T034 [P] [US3] Repeat T033 in `FIRE-Dashboard-Generic.html`
- [ ] T035 [US3] In `FIRE-Dashboard.html`, tag chart card wrappers with `class="card surface--secondary"` per the assignment table in [visual-system.contract.md V1](./contracts/visual-system.contract.md): Full Portfolio Lifecycle, Lifetime Withdrawal Strategy, Roth Ladder, Social Security, Net Worth Pie, Expense Pie, FIRE-by-Country ranked bar chart, Milestone Timeline, Healthcare comparison chart. Tag scenario cards and snapshot rows with `class="scenario-card is-interactive"` / `class="is-interactive"` on row `<tr>`s
- [ ] T036 [US3] Repeat T035 in `FIRE-Dashboard-Generic.html`

#### V2 KPI accent policy (FR-021)

- [ ] T037 [P] [US3] In `FIRE-Dashboard.html`, remove the color classes (`text-accent`, `text-green`, `text-yellow`) from the four KPI `.value` elements (`#kpiNetWorth`, `#kpiFIRENum`, `#kpiProgress`, `#kpiYears`). Update `.kpi .value` CSS to `color: var(--text)`. Add `.kpi .sub--delta-up/down/flat` variants for the trend lines.
- [ ] T038 [P] [US3] Repeat T037 in `FIRE-Dashboard-Generic.html`

#### V3 Card title typography (FR-022)

- [ ] T039 [P] [US3] In `FIRE-Dashboard.html`, replace the `.card-title` CSS block (remove `text-transform: uppercase; letter-spacing: 1.5px; font-size: 0.85em`) with the new quiet title-case treatment from [visual-system.contract.md V3](./contracts/visual-system.contract.md)
- [ ] T040 [P] [US3] Repeat T039 in `FIRE-Dashboard-Generic.html`

#### V4 Section dividers (FR-023)

- [ ] T041 [US3] In `FIRE-Dashboard.html`, add the `.section-divider` CSS rule. Insert four `<div class="section-divider"><span data-i18n="section.*">...</span></div>` elements at the section boundaries per [data-model.md §5](./data-model.md) (Profile & Plan, Outlook, Compare, Track). The KPI row + progress rail sit above the first divider (implicit "Now" region); "Outlook" divider precedes the lifecycle chart and associated chart cards.
- [ ] T042 [US3] Repeat T041 in `FIRE-Dashboard-Generic.html` (matching structure)

#### V5 Hover interactivity (FR-024)

- [ ] T043 [US3] In both files, verify that `.card.is-interactive` is applied ONLY to scenario cards and snapshot rows (already done in T035/T036). Delete any remaining inline or CSS `:hover` border-color rules on chart cards or control cards. (T033/T034 removed the default rule — this task is the audit check.)

#### V6 FIRE Progress rail (FR-025)

- [ ] T044 [US3] In `FIRE-Dashboard.html`, REMOVE the existing `<div class="card span-3">` block containing the FIRE Progress title + progress bar (around line ~1000 area, grep `data-i18n="sec.fireProgress"`). Insert the new `<div class="progress-rail">` block per [visual-system.contract.md V6](./contracts/visual-system.contract.md) directly AFTER the KPI row. Add the `.progress-rail`, `.progress-rail__ticks`, `.progress-rail__track`, `.progress-rail__fill` CSS rules. Keep `#progressBar` ID and `#progressTarget` ID intact — existing JS writes to them.
- [ ] T045 [US3] Repeat T044 in `FIRE-Dashboard-Generic.html`
- [ ] T046 [US3] Confirm the existing `.dashboard` grid's `span-3` tracking still balances without the removed card (it might be fine; may need to drop a grid row). Inspect visually; if layout shifts, add appropriate grid-row handling.

#### V7 Filter-pill demotion (FR-026)

- [ ] T047 [US3] In `FIRE-Dashboard.html`, replace the existing `<div class="tab-row">` with the `<div class="filter-row">` structure per [visual-system.contract.md V7](./contracts/visual-system.contract.md): prefix with `<span class="filter-row__label" data-i18n="filter.label">` and swap `class="tab-btn"` → `class="filter-pill"` + active state `filter-pill--active`. Add the `.filter-row`, `.filter-row__label`, `.filter-pill`, `.filter-pill--active` CSS rules. Update the single line in `filterScenarios(filter, btn)` that toggles `.active` to toggle `.filter-pill--active` instead.
- [ ] T048 [US3] Repeat T047 in `FIRE-Dashboard-Generic.html`

#### V8 Emoji discipline (FR-027)

- [ ] T049 [P] [US3] In `FIRE-Dashboard.html`, remove emoji from chart/data card titles per [visual-system.contract.md V8](./contracts/visual-system.contract.md) "REMOVE emoji from" list. Retain emoji on cards in the "KEEP emoji on" list. Update both EN and ZH string values in `TRANSLATIONS.en` / `TRANSLATIONS.zh` for the affected keys (the translation string values drop the emoji; the keys stay).
- [ ] T050 [P] [US3] Repeat T049 in `FIRE-Dashboard-Generic.html`. Also update `FIRE-Dashboard Translation Catalog.md` to match.

#### V10 Border cleanup (FR-030)

- [ ] T051 [US3] In `FIRE-Dashboard.html`, audit for redundant borders per [visual-system.contract.md V10](./contracts/visual-system.contract.md). Remove the inner-panel border on mortgage ownership buttons sub-panel; remove the wrapper border on the healthcare comparison table if present; any other inner sub-panel sharing chrome with its outer card.
- [ ] T052 [US3] Repeat T051 in `FIRE-Dashboard-Generic.html`

#### V11 Footer tip softening (FR-029)

- [ ] T053 [P] [US3] In `FIRE-Dashboard.html`, change `.footer-panel__tip { border-left: 3px solid var(--accent); }` to `border-left: 3px solid var(--border);` per [visual-system.contract.md V11](./contracts/visual-system.contract.md)
- [ ] T054 [P] [US3] Repeat T053 in `FIRE-Dashboard-Generic.html`

#### Parity check

- [ ] T055 [US3] Diff the two dashboard files with a visual check: `git diff --stat` and scan any non-personal lines for drift. Personal content (Roger/Rebecca names, real birthdates) is allowed to differ; structure, styling, chart wiring, filter logic, i18n keys (not values), and CSS must match. If any non-personal divergence is found, reconcile.

**Checkpoint**: User Story 3 complete. All 12 visual-system policy items applied; both dashboards visually calm; Constitution Principle I satisfied.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verification, non-regression gates, documentation.

- [ ] T056 [P] Run the existing Node unit tests `node --test tests/unit/` — must pass unchanged (no calc modules changed in this feature)
- [ ] T057 [P] Extend `tests/baseline/browser-smoke.test.js` with new assertions for the feature's DOM contracts (per test-hooks sections of the three contract files):
  - Both files contain `#headerSentinel`, `#siteHeader` with `position: sticky` computed style, `#headerYearsValue`, `#headerProgressValue`, `#sidebarToggle`
  - Both files contain `#lifecycleSidebar`, `#lifecycleSidebarCanvas`, `#sidebarScrim`, `#sidebarFireAge`, `#sidebarEndPortfolio`
  - Both files have at least 4 `.section-divider` elements
  - Both files have `.progress-rail` and NO `.card.span-3` containing FIRE Progress
  - Both files have `.filter-row__label`
  - All new i18n keys resolve in both EN and ZH dicts
- [ ] T058 [P] Run the extended smoke test and confirm green across both dashboards
- [ ] T059 Walk through [quickstart.md](./quickstart.md) Check 1 (sticky header) end-to-end on both dashboards; record result
- [ ] T060 Walk through [quickstart.md](./quickstart.md) Check 2 (sidebar) end-to-end on both dashboards; record result
- [ ] T061 Walk through [quickstart.md](./quickstart.md) Check 3 (noise reduction) on both dashboards; count filled vs border-only cards (expect ≥50% drop) and section dividers (expect 4); record result
- [ ] T062 Walk through [quickstart.md](./quickstart.md) Check 4 (non-regression): verify persistence of `roger401kRoth` / `person1_401kRoth`, `contrib401kRoth`, `taxTrad`; verify country-drift fix still holds; verify merged footer; verify language switch works on both header states
- [ ] T063 Walk through [quickstart.md](./quickstart.md) Check 5 (performance sanity): DevTools Performance recording of scroll + slider drag with sidebar pinned; confirm 60fps scroll, ≥30fps drag
- [ ] T064 [P] Update `FIRE-Dashboard-Roadmap.md` to mark feature 006 complete with a brief description and link to `specs/006-ui-noise-reset-lifecycle-dock/spec.md`
- [ ] T065 [P] Write `specs/006-ui-noise-reset-lifecycle-dock/CLOSEOUT.md` summarizing what shipped, what was deferred, and any follow-up items discovered during implementation
- [ ] T066 Final parity audit: `git diff FIRE-Dashboard.html FIRE-Dashboard-Generic.html` — confirm only personal-content differences remain; any structural/CSS/JS divergence must be reconciled (Constitution Principle I)

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)**: No dependencies. Can start immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1. Must complete before any user story starts (provides i18n keys + `_lastLifecycleDataset` cache).
- **Phase 3 (US1 — sidebar)**: Depends on Phase 2. Can run in parallel with Phase 4 and Phase 5 if staffed.
- **Phase 4 (US2 — sticky header)**: Depends on Phase 2. Can run in parallel with Phase 3 and Phase 5. Note: T032 in Phase 4 wires the `#sidebarToggle` to US1's state machine, so US1's T020 must be at least STUB-complete before T032 runs. If US1 and US2 ship in parallel, dispatch US1 first to the state-machine-stub task, then proceed.
- **Phase 5 (US3 — noise reduction)**: Depends on Phase 2. Can run in parallel with Phase 3 and Phase 4 (touches different selectors, different parts of the CSS block).
- **Phase 6 (Polish)**: Depends on Phase 3 + 4 + 5 all complete.

### User story independence

- **US1 (sidebar)**: Can ship on its own — produces a working sidebar (toggle button could temporarily live outside the header until US2 relocates it).
- **US2 (sticky header)**: Can ship on its own — produces a sticky compact header with live stats; the sidebar toggle button exists but is a no-op until US1 lands.
- **US3 (noise reduction)**: Can ship on its own — produces a quieter dashboard; sticky header and sidebar are not required.

### Within each user story

- DOM + CSS tasks come before JS wiring.
- Mirror chart wiring (T014–T017) must come AFTER the cache in Phase 2 T007/T008.
- State machine (T018–T019) must come BEFORE the button wiring (T020, T032).

### Parallel opportunities

- **Phase 1**: T002 + T003 in parallel.
- **Phase 2**: T004 + T005 + T006 in parallel (three different files). T007 + T008 in parallel (two different HTML files).
- **Phase 3 US1**: T010+T011 parallel (DOM paired RR/Generic). T012+T013 parallel (CSS paired). T014 + T015 parallel (JS paired). T018 + T019 parallel (state machine paired).
- **Phase 4 US2**: T026 + T027 parallel (CSS paired). T028 + T029 parallel (JS paired). T030 + T031 parallel (live stats paired).
- **Phase 5 US3**: T033+T034, T037+T038, T039+T040, T049+T050, T053+T054 all are RR/Generic pairs that can run in parallel. T035/T036, T041/T042, T044/T045, T047/T048, T051/T052 touch different sections of the same file so within each story they're sequential per file but RR/Generic pairs are parallel.
- **Phase 6**: T056 + T057 parallel (unit test vs smoke test). T064 + T065 parallel (roadmap vs closeout).

### Cross-story dispatch order (if three agents)

Agent A (Frontend, sidebar) → Phase 2 → US1 sequentially.
Agent B (Frontend, sticky header) → Phase 2 → US2 sequentially.
Agent C (Frontend, noise reduction) → Phase 2 → US3 sequentially.
Manager → Phase 1 + Phase 6 gating.

---

## Parallel Example — Phase 2 Foundational

```bash
# Three tasks can run truly in parallel, each touching a different file:
Task: "T004 — Add new i18n keys to FIRE-Dashboard.html TRANSLATIONS dicts"
Task: "T005 — Add new i18n keys to FIRE-Dashboard-Generic.html TRANSLATIONS dicts"
Task: "T006 — Add new i18n keys to FIRE-Dashboard Translation Catalog.md"
```

## Parallel Example — US1 DOM phase

```bash
# Sidebar DOM and CSS are independent across files:
Task: "T010 — Add sidebar DOM to FIRE-Dashboard.html"
Task: "T011 — Add sidebar DOM to FIRE-Dashboard-Generic.html"
Task: "T012 — Add sidebar CSS to FIRE-Dashboard.html"
Task: "T013 — Add sidebar CSS to FIRE-Dashboard-Generic.html"
```

## Parallel Example — US3 color/typography rollout

```bash
# Five visual policies x two files = 10 independent tasks, all parallelizable:
Task: "T033 — V1 surface CSS in RR"
Task: "T034 — V1 surface CSS in Generic"
Task: "T037 — V2 KPI accent CSS in RR"
Task: "T038 — V2 KPI accent CSS in Generic"
Task: "T039 — V3 card-title CSS in RR"
Task: "T040 — V3 card-title CSS in Generic"
Task: "T049 — V8 emoji trim in RR"
Task: "T050 — V8 emoji trim in Generic"
Task: "T053 — V11 footer tip CSS in RR"
Task: "T054 — V11 footer tip CSS in Generic"
```

---

## Implementation Strategy

The user has explicitly asked (session context) to "apply all 10 noise items at once" and "see how they work out together." So the recommended path is **NOT strict MVP-first** but rather **coordinated all-three stories**. However, for safe incremental delivery (if user changes their mind):

### Option A — All three stories shipped together (recommended by user)

1. Phase 1 Setup.
2. Phase 2 Foundational (blocks all).
3. Phases 3, 4, 5 in parallel (three frontend agents, or sequential by same agent).
4. Phase 6 Polish + verification.
5. Single merge commit to main after full quickstart validation.

### Option B — MVP first (US1 sidebar only)

1. Phase 1 + Phase 2.
2. Phase 3 (US1).
3. Phase 6 smoke/non-regression.
4. Merge and demo.
5. Later: ship US2 and US3 as follow-up features.

### Option C — Incremental delivery

1. Phase 1 + Phase 2.
2. Phase 3 → checkpoint → demo.
3. Phase 4 → checkpoint → demo.
4. Phase 5 → checkpoint → demo.
5. Phase 6 → merge.

---

## Notes

- Every task that modifies either dashboard HTML also modifies the other in lockstep. `[P]` marks on paired RR/Generic tasks indicate they can be dispatched to two agents concurrently (different files) — not that either can ship alone.
- Personal-content divergence (names, real birthdates) is permitted in RR only and is NOT a violation of Principle I.
- No new external dependency, build step, or framework is introduced. The `script` tag for Chart.js in both files stays as-is.
- Failure of T003 (baseline tests) blocks the feature. Failure of T058 (post-implementation smoke) blocks merge.
- All user-visible new strings (T004–T006) ship with EN + zh-TW pair in the same commit per Constitution Principle VII.
- Chart ↔ Module comment updates (T017) are Constitution Principle VI bookkeeping, not a visual change; easy to forget — check explicitly in code review.
