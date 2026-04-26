---
description: "Task list for feature 013 — Tabbed Dashboard Navigation"
---

# Tasks: Tabbed Dashboard Navigation

**Input**: Design documents from `/specs/013-tabbed-navigation/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: This feature includes **unit tests for `calc/tabRouter.js`** (per Constitution Principle IV — non-negotiable for any new module) and **Playwright E2E tests** (per the project's existing pattern from Feature 011 + the contract test surface in `contracts/tab-routing.contract.md`).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing. The four user stories from `spec.md` are:

- **US1 (P1)**: Navigate the dashboard via 4 themed tabs — the MVP.
- **US2 (P2)**: Persist last-viewed tab+pill across reloads and support deep links.
- **US3 (P2)**: Workflow `Next →` button to walk through a tab one card at a time.
- **US4 (P2)**: Mobile pill bars scroll horizontally instead of wrapping.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks).
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4).
- File paths are absolute or repo-rooted as appropriate.

## Path Conventions

This is a single-file HTML application with a thin `calc/` directory for testable pure modules. The feature touches:

- `FIRE-Dashboard.html` — RR (Roger & Rebecca) dashboard.
- `FIRE-Dashboard-Generic.html` — Public Generic dashboard.
- `calc/tabRouter.js` — NEW pure routing controller.
- `tests/unit/tabRouter.test.js` — NEW unit tests.
- `tests/e2e/tab-navigation.spec.ts` — NEW Playwright E2E tests.
- `FIRE-Dashboard Translation Catalog.md` — i18n catalog.
- `FIRE-Dashboard-Roadmap.md` — master roadmap.

Per Constitution Principle I (Dual-Dashboard Lockstep, NON-NEGOTIABLE), every task that modifies one HTML file MUST modify the other in the same change. Tasks below state both files explicitly.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create skeleton files for the new module and its tests.

- [ ] T001 Create skeleton `calc/tabRouter.js` with the `Inputs: / Outputs: / Consumers:` fenced module header per Constitution Principle II — header MUST list inputs (URL hash, localStorage, DOM containers, chart instances), outputs (DOM class flips, history state, localStorage writes, chart resize calls), and consumers (`#tabBar` and `.pill-bar` elements in both HTML files). Stub the four public methods (`init`, `activate`, `registerChart`, `getState`) so tests can import.
- [ ] T002 [P] Create skeleton `tests/unit/tabRouter.test.js` — import `tabRouter` from `../../calc/tabRouter.js`, scaffold a single `describe('tabRouter', ...)` block with a placeholder `it.todo` for each of the 11 contract test cases T1–T11 from `contracts/tab-routing.contract.md`.
- [ ] T003 [P] Create skeleton `tests/e2e/tab-navigation.spec.ts` — import `@playwright/test`, scaffold a top-level `test.describe('Tabbed Dashboard Navigation', ...)` block with one placeholder `test.skip` for each user story (US1–US4) and the lockstep DOM-diff. Reuse the project conventions from `tests/e2e/responsive-header.spec.ts` (Feature 011) for fixture setup.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement the core routing module, its unit tests, all i18n keys, all CSS, and the script tag — everything every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T004 Implement the full `calc/tabRouter.js` module per `contracts/tab-routing.contract.md` — `init(options)` (parse URL hash → fall back to localStorage → fall back to default Plan/Profile, normalize via `replaceState`, attach delegated click handlers, attach `popstate` listener, attach Next-button delegation), `activate(tabId, pillId, source)` (validate IDs with FR-026/027 fallbacks, no-op on same state, DOM class flips, hash sync via `pushState`/`replaceState` per `source`, `localStorage.setItem` wrapped in `try/catch`, chart resize, sticky-header sentinel rebind), `registerChart(pillId, chartInstance)` (registry append, throw developer error on unknown pillId), `getState()` (return fresh `{tab, pill}` copy). Module attaches to `window.tabRouter`. Path: `calc/tabRouter.js`.
- [ ] T005 Write the 11 unit tests T1–T11 in `tests/unit/tabRouter.test.js` per `contracts/tab-routing.contract.md` "Test surface" — covering: empty state default, hash-priority over localStorage, localStorage fallback when hash invalid, both invalid → default, invalid tab → Plan/Profile, valid tab + invalid pill → first pill of tab, no-op on same state, popstate uses replaceState, localStorage write failure does not throw, `registerChart` with unknown pillId throws, `getState()` returns fresh copy. Use Node's built-in mock `Storage` (or simple in-memory mock) and a mock `Window` with `location` and `history`. Path: `tests/unit/tabRouter.test.js`.
- [ ] T006 Run `node --test "tests/unit/*.test.js"` from repo root and confirm all 11 new `tabRouter` cases pass AND all 161 pre-existing tests (Features 001–012) still pass with zero modifications (FR-036, SC-007). If any pre-existing test breaks, stop and investigate — `tabRouter` MUST be additive only.
- [ ] T007 Add the 21 new i18n key pairs from `contracts/tab-i18n.contract.md` to BOTH `TRANSLATIONS.en` AND `TRANSLATIONS.zh` dictionaries in BOTH `FIRE-Dashboard.html` AND `FIRE-Dashboard-Generic.html`. Group them under a comment block `// === Feature 013: Tab navigation ===`. Verify byte-identical key set across both files. Paths: `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`.
- [ ] T008 [P] Append a new section `## Feature 013 — Tab Navigation (i18n)` to `FIRE-Dashboard Translation Catalog.md` containing the 21 key pairs in markdown table form (Key · EN · zh-TW). Path: `FIRE-Dashboard Translation Catalog.md`.
- [ ] T009 Add CSS rules per `contracts/tab-ui.contract.md` — `.tab-bar`, `.tab`, `.tab.active`, `.pill-bar`, `.pill`, `.pill.active`, `.pill-host[hidden]`, `.tab-panel[hidden]`, `.tab-scroll-sentinel`, `.next-pill-btn:disabled`, plus the `@media (max-width: 767px)` block — to BOTH `FIRE-Dashboard.html` AND `FIRE-Dashboard-Generic.html`. Place inside the existing `<style>` block, after the existing skin block (per Feature 011 cascade ordering rule). Use existing CSS variables (`--bg`, `--card`, `--accent`, `--accent-soft`, `--border`, `--text`, `--header-height`). Paths: `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`.
- [ ] T010 Add `<script src="calc/tabRouter.js" defer></script>` to BOTH `FIRE-Dashboard.html` AND `FIRE-Dashboard-Generic.html` — placement: after Chart.js CDN load and before any inline `<script>` block that registers charts (so `window.tabRouter.registerChart` is defined when chart-init code runs). Use `defer` to preserve DOMContentLoaded ordering. Paths: `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`.

**Checkpoint**: `tabRouter` module passes all 11 unit tests; both HTML files have i18n keys, CSS, and script tag in place. User story implementation can begin.

---

## Phase 3: User Story 1 — 4-tab navigation MVP (Priority: P1) 🎯 MVP

**Goal**: Replace the single-scroll layout with 4 themed tabs and 16 sub-tab pills. Every existing card is reachable through some tab+pill combination. Persistent chrome (KPI ribbon, gate selector, Lifecycle sidebar) stays visible. Calc engine and chart code unchanged.

**Independent Test**: Open either dashboard, confirm 4 tabs render with correct labels and a pill bar appears under the active tab; click each tab and pill, verify only the active pill's content is visible; verify KPI ribbon and right-edge Lifecycle sidebar remain visible during every switch; verify all input fields and charts that exist today are reachable through some tab+pill combination; verify console shows zero red errors during the walk.

### Implementation for User Story 1

- [ ] T011 [US1] Add the top-level tab markup per `contracts/tab-ui.contract.md` to BOTH HTML files: `<nav id="tabBar" class="tab-bar" role="tablist" aria-label="Dashboard sections">` containing 4 `<button class="tab" data-tab="<id>" role="tab" data-i18n="nav.tab.<id>">` elements (plan/geography/retirement/history), followed by `<div id="tabContainer">` containing 4 `<section class="tab-panel" id="tab-<id>" data-tab="<id>" role="tabpanel">` elements (initially with `hidden` on all but `#tab-plan`). Insert this markup AFTER the persistent chrome (`#kpiRibbon`, `#gateSelector`) and BEFORE the right-edge Lifecycle sidebar / footer. Paths: `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`.
- [ ] T012 [US1] Wrap Plan-tab existing cards into `pill-host` containers and add the Plan pill-bar inside `#tab-plan`: pills in order Profile · Assets · Investment · Mortgage · Expenses · Summary. Each pill-host has `data-tab="plan" data-pill="<id>"` and (except `profile`) the `hidden` attribute. The `summary` pill-host wraps THREE existing cards together: Savings Rate (`sec.savingsRate`), Net Worth Breakdown pie (`sec.netWorthPie`), Expense Distribution pie (`sec.expenseDist`). Existing card markup is preserved verbatim — only the wrapping `pill-host` divs are added. Paths: `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`.
- [ ] T013 [US1] Wrap Geography-tab cards into `pill-host` containers inside `#tab-geography` with the Geography pill-bar: Scenarios (hosting `sec.geoArbitrage`) · Country Chart (hosting `sec.countryChart`) · Healthcare (hosting `sec.healthcare`) · Country Deep-Dive (hosting the existing deep-dive panel). Each pill-host has the appropriate `data-pill` attribute and `hidden` on all but Scenarios. Paths: `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`.
- [ ] T014 [US1] Wrap Retirement-tab cards into `pill-host` containers inside `#tab-retirement` with the Retirement pill-bar: Social Security (hosting `sec.socialSecurity`) · Withdrawal Strategy (hosting Feature 007 bracket-fill controls + Feature 008 multi-strategy comparison panel together) · Drawdown (hosting `sec.drawdown`) · Lifecycle (hosting `sec.lifecycle`) · Milestones (hosting `sec.milestones`). The Withdrawal Strategy pill-host MUST contain BOTH the bracket-fill control block and the multi-strategy ranked comparison; do not split them. Paths: `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`.
- [ ] T015 [US1] Wrap History-tab card into a `pill-host` container inside `#tab-history` with the History pill-bar containing one pill: Snapshots (hosting `sec.snapshots`). Paths: `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`.
- [ ] T016 [US1] Add `<div class="tab-scroll-sentinel" aria-hidden="true"></div>` as the FIRST child of every `<section class="tab-panel">` (4 sentinels per file × 2 files). Paths: `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`.
- [ ] T017 [US1] Wire `window.tabRouter.init({...})` call inside the existing `DOMContentLoaded` handler (or its equivalent boot block) AFTER Chart.js charts are instantiated AND after their `registerChart` calls (T018) have executed. Pass references to `#tabBar`, `#tabContainer`, and an object mapping each `tabId` to its `.pill-bar` element. Paths: `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`.
- [ ] T018 [US1] Add `window.tabRouter.registerChart('<pillId>', <chartInstance>)` call after every existing `new Chart(...)` instantiation site in both files. Mapping: country chart → `'country-chart'`; healthcare chart → `'healthcare'`; SS chart → `'ss'`; drawdown chart → `'drawdown'`; lifecycle chart → `'lifecycle'`; milestones chart → `'milestones'`; savings-rate chart, net-worth pie, expense-dist pie → all three → `'summary'`; mortgage-impact chart (if present) → `'mortgage'`; multi-strategy lifetime-withdrawal chart → `'withdrawal'`. Paths: `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`.
- [ ] T019 [US1] Rewire Feature 006 US2 sticky compact header IntersectionObserver: replace its currently-observed element with the active tab's `.tab-scroll-sentinel`. Inside `tabRouter.activate`, after the DOM class flip, the activator must call a callback (`onAfterActivate`) supplied via `init()` that disconnects the old observer target and observes the new tab's sentinel. The sticky header behavior MUST remain visually identical to Feature 006 US2. Paths: `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`.
- [ ] T020 [US1] Rewire the existing country-card click handler in Geography → Scenarios: after it sets the deep-dive panel's content (existing behavior), call `window.tabRouter.activate('geography', 'country-deep-dive', 'click')`. Verify the panel becomes visible because its `pill-host` un-hides via the activation, not via a separate `display:block` from the click handler (remove any such legacy line). Paths: `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`.
- [ ] T021 [US1] Remove Quick What-If completely: (a) delete the `sec.whatIf` card block from both HTML files; (b) delete the `getElementById('quickWhatIf*')` lookups, all bound event handlers, and any `quickWhatIf*` helper functions from both files; (c) delete every key under `whatIf.*` and the `sec.whatIf` key from both `TRANSLATIONS.en` and `TRANSLATIONS.zh` in both files; (d) remove the corresponding row(s) from `FIRE-Dashboard Translation Catalog.md`. Verify with `grep -in "quickwhatif\|whatif" FIRE-Dashboard.html FIRE-Dashboard-Generic.html "FIRE-Dashboard Translation Catalog.md"` returning zero matches (SC-012). Paths: `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`, `FIRE-Dashboard Translation Catalog.md`.
- [ ] T022 [US1] Browser smoke walk per CLAUDE.md "Browser smoke before claiming a feature 'done'" rule. Serve via `python -m http.server 8766`. For BOTH `FIRE-Dashboard.html` AND `FIRE-Dashboard-Generic.html`: load with empty localStorage and no hash → confirm Plan/Profile renders; click through every tab and every pill (4 tabs × 16 pills total = 16 activations × 2 files = 32 walks); after each activation confirm (a) only the new pill's content is visible, (b) every chart in the new pill renders at full width with no clipping, (c) KPI ribbon shows numeric values (no NaN, "Calculating…", or "—"), (d) DevTools console shows zero red errors AND zero `[shim-name] canonical threw:` messages (SC-008). Drag the FIRE marker on the lifecycle chart while inside Retirement → Lifecycle and confirm same-frame update.

**Checkpoint**: At this point, US1 is fully functional. The dashboard navigates as a 4-tab app on both files. KPI ribbon and Lifecycle sidebar persist. Calc engine unchanged. This is shippable as MVP.

---

## Phase 4: User Story 2 — Persistence & Deep Linking (Priority: P2)

**Goal**: User's last tab+pill is remembered across reloads via localStorage; URL hash format `#tab=…&pill=…` supports bookmarks and deep links; browser Back/Forward navigates through view changes.

**Independent Test**: Navigate to a non-default tab+pill, hard-reload — confirm the same view restores. Copy the URL, open in a fresh private window — confirm the same view opens. Use browser Back/Forward through 3+ tab changes — confirm each step restores the prior view.

> US2's implementation logic is already shipped in `tabRouter.js` (Phase 2 T004) and unit-tested (T005). This phase adds E2E coverage and verification.

- [ ] T023 [US2] Add Playwright tests for persistence and deep-linking flows in `tests/e2e/tab-navigation.spec.ts`. Five test cases: (a) **first-time visitor** (clean storage, no hash) → page opens with Plan tab + Profile pill active; URL becomes `#tab=plan&pill=profile`; (b) **reload restores** → navigate to Retirement → Lifecycle, hard reload, confirm Retirement → Lifecycle is active within 2s (SC-005); (c) **deep link** → open `#tab=geography&pill=healthcare` in a fresh context with empty storage, confirm Geography → Healthcare is active (SC-006); (d) **invalid hash falls back** → load `#tab=foo&pill=bar`, confirm Plan/Profile is active and URL normalizes; (e) **Back/Forward navigates** → click through Plan/Profile → Plan/Assets → Plan/Investment → Geography/Scenarios, press Back 3×, confirm each step regresses (SC-013). Run on both `FIRE-Dashboard.html` AND `FIRE-Dashboard-Generic.html`. Path: `tests/e2e/tab-navigation.spec.ts`.

**Checkpoint**: US2 verified end-to-end. Persistence + deep linking work in real browsers on both HTML files.

---

## Phase 5: User Story 3 — `Next →` Button Workflow (Priority: P2)

**Goal**: First-time user (or anyone) can walk through a tab one card at a time using a `Next →` button on each card. Clicking Next on the last pill of a tab is a no-op (button disabled). No auto-cross-tab advance.

**Independent Test**: Open Plan/Profile, click `Next →`, confirm Plan/Assets becomes active. Continue through all pills in Plan. On Plan/Summary confirm the Next button is disabled. Repeat in Geography (last pill = Country Deep-Dive) and Retirement (last pill = Milestones). On History/Snapshots confirm Next is disabled.

- [ ] T024 [US3] Add `<button type="button" class="next-pill-btn" data-action="next-pill" data-i18n="nav.next">Next →</button>` element at the bottom of every pill-host card in BOTH `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html`. 16 pill-hosts × 2 files = 32 buttons added. Place each button as the LAST child of its pill-host so it appears below the card content. Paths: `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`.
- [ ] T025 [US3] Add the `disabled` HTML attribute to the Next button on the last pill of each tab — Plan/Summary, Geography/Country-Deep-Dive, Retirement/Milestones, History/Snapshots — in BOTH `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html`. 4 disabled buttons × 2 files = 8 `disabled` attributes added. The router's delegated click handler (already in T004) is also defensive and treats clicks on disabled buttons as no-ops. Paths: `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`.
- [ ] T026 [US3] Add Playwright test for the Next-button workflow in `tests/e2e/tab-navigation.spec.ts`. Test cases: (a) **Plan walkthrough** — start on Plan/Profile, click Next 5×, confirm pills advance Profile → Assets → Investment → Mortgage → Expenses → Summary; (b) **Plan/Summary disabled** — confirm Plan/Summary's Next button has `disabled` attribute and clicking it does NOT advance to Geography; (c) **Geography walkthrough** — Scenarios → Country Chart → Healthcare → Country Deep-Dive; last pill's Next is disabled; (d) **Retirement walkthrough** — SS → Withdrawal → Drawdown → Lifecycle → Milestones; last pill's Next is disabled; (e) **History/Snapshots disabled** — single pill, Next disabled. Run on both HTML files. Path: `tests/e2e/tab-navigation.spec.ts`.

**Checkpoint**: US3 fully testable. The wizard-feel walk-through works on both files.

---

## Phase 6: User Story 4 — Mobile Responsive Pill Bars (Priority: P2)

**Goal**: At ≤767px viewports, both the top tab pill bar and every sub-tab pill bar render in a single horizontal row with overflow scrolling — no wrap to multiple lines.

**Independent Test**: Resize browser to ≤767px (or use DevTools device toolbar at iPhone SE 375×667). Confirm pill bars render in single row, overflow horizontally, scroll on touch/drag, do not wrap. Active pill remains identifiable. Tabs/pills still activate on click; drag does not trigger activation.

> US4's CSS is already shipped in Phase 2 T009 (the `@media (max-width: 767px)` block plus `flex-wrap: nowrap; overflow-x: auto;` on `.tab-bar` and `.pill-bar`). This phase adds verification.

- [ ] T027 [US4] Add Playwright test for ≤767px viewport behavior in `tests/e2e/tab-navigation.spec.ts`. Test cases: (a) at 375×667 viewport, assert `flex-wrap: nowrap` and `overflow-x: auto` are computed-style values on `#tabBar` and on each `.pill-bar`; (b) assert no `.tab` or `.pill` element wraps to a second row (verified by checking the bounding rect's top coordinate is identical for all siblings within a bar); (c) simulate horizontal scroll on `.pill-bar` and confirm pills shift horizontally without activating. Run on both `FIRE-Dashboard.html` AND `FIRE-Dashboard-Generic.html`. Path: `tests/e2e/tab-navigation.spec.ts`.
- [ ] T028 [US4] Manual mobile-viewport verification per `quickstart.md` Step 11: open DevTools device toolbar at iPhone SE 375×667, load both HTML files, walk through all tabs, verify pill bars scroll horizontally and pills are tappable. Capture a screenshot of each file in the spec directory under `specs/013-tabbed-navigation/screenshots/` (create the dir).

**Checkpoint**: US4 verified on real mobile viewports. All four user stories shipped.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Lockstep enforcement, regression coverage across all user stories, documentation, and final validation.

- [ ] T029 [P] Add Playwright DOM-diff test asserting `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` produce byte-identical tab/pill structure (SC-009). Test serializes — for each file — the `outerHTML` of `#tabBar` and every `.pill-bar`, plus the set of `(data-tab, data-pill)` pairs from every `.pill-host`; asserts the two serializations are identical (after stripping any personal-content text inside cards, which is allowed to differ per Principle I). Path: `tests/e2e/tab-navigation.spec.ts`.
- [ ] T030 [P] Update `FIRE-Dashboard-Roadmap.md` — under "Recently shipped" (or "in progress" while merge is pending), add an entry for **Feature 013 — Tabbed Dashboard Navigation** summarizing the 4-tab structure, Quick What-If removal, persistence, deep-link support, and Next-button workflow; link to spec, plan, tasks. Path: `FIRE-Dashboard-Roadmap.md`.
- [ ] T031 Run full Node unit test suite: `node --test "tests/unit/*.test.js"` from repo root. Confirm all 161 pre-existing tests pass AND all 11 new `tabRouter` tests pass. Total: 172+ green (FR-036, SC-007).
- [ ] T032 Run full Playwright E2E suite: `npx playwright test`. Confirm all pre-existing tests (e.g., `tests/e2e/responsive-header.spec.ts` from Feature 011) still green AND all new `tests/e2e/tab-navigation.spec.ts` cases pass. Capture trace artifacts on any failure for diagnosis.
- [ ] T033 Quickstart end-to-end validation: walk through all 16 manual steps in `specs/013-tabbed-navigation/quickstart.md` on BOTH `FIRE-Dashboard.html` AND `FIRE-Dashboard-Generic.html`. Mark each step pass/fail; resolve failures before moving on.
- [ ] T034 SC-012 final verification: `grep -in "quickwhatif\|whatif" FIRE-Dashboard.html FIRE-Dashboard-Generic.html "FIRE-Dashboard Translation Catalog.md"` MUST return zero matches.
- [ ] T035 Lockstep audit per Constitution Principle I: run `diff <(awk '/<nav id="tabBar"/,/<aside id="lifecycleSidebar"/' FIRE-Dashboard.html) <(awk '/<nav id="tabBar"/,/<aside id="lifecycleSidebar"/' FIRE-Dashboard-Generic.html)` (or equivalent) — the diff MUST be empty for tab/pill markup; the only allowed differences are inside individual cards where personal content (Roger/Rebecca's names, private numeric defaults) legitimately differs.
- [ ] T036 Update README's "What's next" section to a "Recently shipped" entry (or remove the "What's next" mention entirely if shipping in this PR), pointing readers to the closeout (CLOSEOUT.md to be written under `specs/013-tabbed-navigation/` after merge). Path: `README.md`.
- [ ] T037 Update `CLAUDE.md` SPECKIT block: change "Next step" line from `/speckit-tasks` to `/speckit-implement` (during work) or to a closeout link (after merge). Path: `CLAUDE.md`.

**Checkpoint**: Feature 013 is ready to merge.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies. T002 + T003 can run in parallel after T001 starts.
- **Foundational (Phase 2)**: Depends on Setup. T005 depends on T004's API surface. T006 depends on T004 + T005. T007–T010 depend on T004 (script tag must reference an existing file). T008 [P] is independent of T009/T010.
- **US1 (Phase 3)**: Depends on Phase 2 complete. Internal sequencing: T011 → T012/T013/T014/T015 (markup wraps require tab-panels in place) → T016 (sentinels go inside panels) → T018 (registerChart calls fire after panels exist) → T017 (init must be the last call so all charts are registered before init) → T019 (sticky-header rewire reads sentinels added in T016) → T020 (cross-pill click). T021 (Quick What-If purge) is independent of T011–T020 and can run in parallel with the markup work, but it's listed in US1 because it's a structural cleanup that should land in the same change set. T022 (browser smoke) depends on ALL of T011–T021.
- **US2 (Phase 4)**: Depends on Phase 2 (`tabRouter.js` already implements US2 logic) AND Phase 3 (US1's tab markup must exist for E2E to drive it). The single E2E task T023 is the entire phase.
- **US3 (Phase 5)**: Depends on Phase 2 and Phase 3. T024 + T025 add Next button markup. T026 adds E2E.
- **US4 (Phase 6)**: Depends on Phase 2 (CSS already in T009) and Phase 3 (markup exists). T027 + T028 verify.
- **Polish (Phase 7)**: Depends on US1–US4 complete.

### User Story Dependencies

- **US1 (P1)**: Independent — can ship as MVP without US2/US3/US4.
- **US2 (P2)**: Implementation already in `tabRouter.js` (T004); E2E coverage independent of US3/US4. Can verify after US1 ships.
- **US3 (P2)**: Independent of US2 — Next-button markup is purely additive.
- **US4 (P2)**: Independent of US2/US3 — CSS-only verification.

### Within Each User Story

- Markup tasks (T011–T015) precede tabRouter wiring (T017, T018) because the router needs target elements to exist.
- Browser smoke (T022) is the last gate inside US1.
- E2E test tasks (T023, T026, T027, T029) can run after their respective implementation tasks.

### Parallel Opportunities

- T002 + T003 can run in parallel after T001.
- T008 (catalog) can run in parallel with T007 (HTML keys), T009 (HTML CSS), and T010 (HTML script tag).
- T029 (lockstep DOM-diff E2E) and T030 (roadmap update) are independent — different files, different concerns.
- E2E test tasks (T023, T026, T027, T029) all live in the same file (`tests/e2e/tab-navigation.spec.ts`) so they cannot run truly in parallel; sequence them or merge into one writing pass.

---

## Parallel Example: Phase 1 — Setup

```text
# Three skeleton-creation tasks, three different files
Task: T001 — Create skeleton calc/tabRouter.js with module header
Task: T002 [P] — Create skeleton tests/unit/tabRouter.test.js with 11 it.todo cases
Task: T003 [P] — Create skeleton tests/e2e/tab-navigation.spec.ts with story-level test.skip blocks
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Complete Phase 1: Setup (3 tasks).
2. Complete Phase 2: Foundational (7 tasks) — `tabRouter.js` works, tested, both files have CSS + i18n + script tag.
3. Complete Phase 3: User Story 1 (12 tasks).
4. **STOP and VALIDATE**: smoke walk both files; run unit tests; confirm KPI ribbon + Lifecycle sidebar persist; confirm zero red console errors.
5. If desired, ship as MVP at this point — US2/US3/US4 are additive enhancements.

### Incremental Delivery

1. Setup + Foundational + US1 → MVP shipped.
2. Add US2 (E2E coverage of persistence) → ship.
3. Add US3 (Next button) → ship.
4. Add US4 (mobile verification) → ship.
5. Polish phase → final merge.

Each phase preserves the previous (US1 still works after US3 lands; US3 still works after US4 lands).

### Single-Engineer Strategy

Manager dispatches Frontend Engineer for T011–T021 and T024–T025 (markup work in both HTML files). Backend Engineer for T001, T004 (the pure module) and T005 (its tests). QA Engineer for T002–T003 skeletons, T006 (run tests), T022 (browser smoke), T023, T026, T027, T029 (E2E tests), T028 (manual mobile), T031–T035 (final verification). DB Engineer is unused — no schema change.

---

## Notes

- Every task that modifies an HTML file modifies BOTH `FIRE-Dashboard.html` AND `FIRE-Dashboard-Generic.html` per Constitution Principle I (Lockstep, NON-NEGOTIABLE). Manager MUST verify lockstep at every checkpoint.
- Every task that adds user-visible text adds EN + zh-TW pair per Constitution Principle VII.
- Tests must be written and pass before claiming a phase complete (Principle IV).
- No calc/chart logic is changed in any task. If a task author finds themselves modifying calc behavior, STOP and confirm scope.
- Browser smoke (T022) is a hard gate per CLAUDE.md "Browser smoke before claiming a feature 'done'" rule. Skip it and risk feature-004-class regressions where CI is green but the dashboard is broken.
- After all phases complete, write a closeout: `specs/013-tabbed-navigation/CLOSEOUT.md` summarizing what shipped, what changed in scope, lessons learned. Update `FIRE-Dashboard-Roadmap.md` to reference the closeout.
