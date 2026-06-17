---
description: "Task list for Left-Sidebar Navigation (feature 035)"
---

# Tasks: Left-Sidebar Navigation

**Input**: Design documents from `/specs/035-left-sidebar-nav/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ui-navigation.contract.md, quickstart.md

**Tests**: INCLUDED — the contract defines a navigation-parity E2E spec and SC-002/SC-005 gate
on green suites. Tests here are Playwright E2E (no calc module is touched, so no Node unit tests).

**Organization**: By user story. US1 (desktop sidebar + accordion) is the MVP; US2 (behavior
parity) guarantees the "don't change button functions" constraint; US3 (mobile drawer) is the
responsive layer.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies).
- **Lockstep note (Constitution I)**: Tasks that edit the dashboards apply to **BOTH**
  `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` in the same change set. These are
  intentionally NOT marked `[P]` across the two files — they must stay byte-identical in the
  nav chrome, so each is one task touching both files.

## Path Conventions

Two single-file dashboards at repo root: `FIRE-Dashboard.html` (RR), `FIRE-Dashboard-Generic.html`
(Generic). E2E specs under `tests/e2e/`. i18n catalog `FIRE-Dashboard Translation Catalog.md`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Enumerate the exact rewire surface before touching code (caller-audit lesson).

- [ ] T001 Caller-audit both HTML files + inline JS: grep `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` for `.pill-bar`, `> .pill-bar`, `--tabbar-bottom`, `_rebindStickyHeaderObserver`, `pillBarsByTab`, `#tabBar`, and `--sidebar-width`; record every structural reference that must be rewired or must NOT be reused (write the list into the PR/commit notes). No code change.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The rail/accordion CSS scaffold + layout container that BOTH the desktop move
(US1) and the mobile drawer (US3) build on.

**⚠️ CRITICAL**: No user-story work begins until this phase is complete.

- [ ] T002 [P] Add the nav-rail CSS scaffold in BOTH dashboards: define `--navrail-width` (do NOT reuse the existing `--sidebar-width`), `#navRail`/`.nav-rail` styles (left column, `position:sticky; top: var(--gate-bottom)`, `max-height: calc(100vh - var(--gate-bottom))`, internal `overflow:auto`, `z-index:50`), accordion rules (`#navRail .pill-bar{display:none}` + `#navRail[data-active-tab="X"] .pill-bar[data-tab="X"]{display:flex}`), and a `#contentArea` rail+content grid/flex row. Reuse existing dark-theme accent/selected variables. (`FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`)
- [ ] T003 Insert the layout container markup in BOTH dashboards: add an empty `#navRail` directly after `#gateSelector`, and wrap the existing tab-panels/content region in `#contentArea`, forming the two-column row below the header/gate band. (`FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`)

**Checkpoint**: Rail shell + accordion CSS exist (empty rail); content reflows to the right.

---

## Phase 3: User Story 1 - Reclaim vertical space (Priority: P1) 🎯 MVP

**Goal**: Move the primary tabs + per-tab pill-bars into the sticky left rail as an accordion;
content starts higher; navigation still works on desktop.

**Independent Test**: On desktop, header + mode/strategy stay on top; tabs are a vertical list
in the left rail; the active tab is expanded showing its pills; clicking tabs/pills switches
content exactly as before; the first content card sits higher than before.

### Implementation for User Story 1

- [ ] T004 [US1] Move the `#tabBar` node into `#navRail` (as the accordion's tab headers) in BOTH dashboards, preserving its id, `data-tab` buttons, roles, and `data-i18n`. (`FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`)
- [ ] T005 [US1] Move all five per-tab `.pill-bar` nodes (`#tab-{plan,geography,retirement,history,audit} > .pill-bar`) out of their `.tab-panel`s into `#navRail`, keeping each bar's `data-tab` so the accordion CSS can match it; leave every `.pill-host` content panel in place inside `#contentArea`. (`FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`)
- [ ] T006 [US1] Update the `tabRouter.init({...})` config in BOTH dashboards: change `pillBarsByTab` selectors from `#tab-X > .pill-bar` to resolve the relocated bars (e.g. `#navRail .pill-bar[data-tab="X"]`). Leave `getTabButton/getPillButton/getPillHost`, `TABS`, and activation order unchanged. (`FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`)
- [ ] T007 [US1] Wire the accordion in BOTH dashboards: in `tabRouter`'s `onAfterActivate(state)`, set `document.getElementById('navRail').setAttribute('data-active-tab', state.tab)`; ensure `data-active-tab` is set for the initially-active tab on load. (`FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`)
- [ ] T008 [US1] Sticky-chrome rewire in BOTH dashboards: the top sticky stack is now `#siteHeader` → `#gateSelector` only; the rail consumes `top: var(--gate-bottom)`; simplify `_rebindStickyHeaderObserver` to stop tracking the active pill-bar top band; remove/neutralize the `--tabbar-bottom` layout consumers identified in T001. (`FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`)

**Checkpoint**: Desktop MVP — sidebar accordion fully functional; content reclaimed.

---

## Phase 4: User Story 2 - Identical navigation behavior (Priority: P1)

**Goal**: Prove every relocated control does exactly what it did before; catch any selector
drift from the move.

**Independent Test**: Drive every tab, pill, mode toggle, and the Withdraw Strategy toggle and
confirm identical content/active-state/downstream updates, on both dashboards.

### Tests for User Story 2

- [ ] T009 [P] [US2] Author `tests/e2e/left-sidebar-nav.spec.ts` (desktop): assert the layout + behavioral contract from `contracts/ui-navigation.contract.md` — header + mode/strategy remain on top; tabs/pills live in `#navRail`; selecting each tab opens the same panel + reveals its pills; selecting each pill opens the same `.pill-host`; exactly one `.pill-bar` visible (matches `#navRail[data-active-tab]`); mode + Withdraw Strategy still update verdict/chart; runs against BOTH `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html`.

### Implementation for User Story 2

- [ ] T010 [US2] Run `npx playwright test tests/e2e/left-sidebar-nav.spec.ts` + `node tools/console-probe.mjs` on BOTH files; remediate any selector drift or `errorCount>0` surfaced (cross-check against the T001 audit list). Confirm green on both dashboards.

**Checkpoint**: Navigation parity guaranteed (US1 + US2 both pass) — "don't change the buttons" verified.

---

## Phase 5: User Story 3 - Usable on narrow / mobile screens (Priority: P2)

**Goal**: On narrow viewports the rail collapses behind a ☰ drawer; content stays usable with
no horizontal scroll.

**Independent Test**: At phone width, the rail is hidden and a ☰ toggle shows; opening overlays
the rail (scrim behind); picking a tab/pill changes the view and closes the drawer; closed
state is full-width with no horizontal scrollbar — on both dashboards.

### Implementation for User Story 3

- [ ] T011 [US3] Add the `#navDrawerToggle` (☰) button and a `.nav-scrim` element in BOTH dashboards (toggle placed in/adjacent to the gate band; hidden on desktop). (`FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`)
- [ ] T012 [US3] Add the mobile CSS in BOTH dashboards: below the existing mobile breakpoint, take `#navRail` off-canvas (translateX) and show `#navDrawerToggle`; open state slides the rail in as an overlay (`z-index:65`, clears `#gateSelector`@60, below `.override-confirm`@70) with the `.nav-scrim` beneath it; ensure no horizontal scrollbar when closed; desktop layout unchanged. (`FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`)
- [ ] T013 [US3] Add the drawer JS in BOTH dashboards: toggle open/close on `#navDrawerToggle`/scrim; close the drawer after a tab/pill selection; force-close on resize back to desktop width. Keep navigation state owned by `tabRouter` (drawer only controls rail visibility). (`FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`)
- [ ] T014 [P] [US3] Add the drawer toggle's bilingual label (EN + zh-TW) to the `TRANSLATIONS` dicts in BOTH dashboards and to `FIRE-Dashboard Translation Catalog.md` (accessible `aria-label`, e.g. "Open navigation" / "開啟導覽"). (`FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`, `FIRE-Dashboard Translation Catalog.md`)
- [ ] T015 [US3] Extend `tests/e2e/left-sidebar-nav.spec.ts` with narrow-viewport cases: ☰ visible + rail hidden + no horizontal scrollbar; open drawer → select tab/pill → view changes + drawer closes; both dashboards.

**Checkpoint**: All three stories independently functional on desktop and mobile.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T016 [P] Verify SC-001 (first content element starts higher by ≈ the two relocated rows' height) and the sticky-rail behavior on a long view (Retirement → Withdrawal Strategy); note the before/after offset.
- [ ] T017 Full pre-merge gate: `npm run test:unit` (must stay green — no calc touched), `npx playwright test` (full suite; record any known feature-018 flakes and confirm they pass in isolation), and `node tools/console-probe.mjs` → `errorCount:0` on BOTH files.
- [ ] T018 Lockstep verification: diff the nav-chrome region between `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` and confirm it is identical except personal header content (Constitution I); update `FIRE-Dashboard-Roadmap.md` to reflect feature 035.
- [ ] T019 Human visual smoke (genuinely-visual checks only): desktop accordion expand/collapse feel, sticky rail while scrolling, mobile drawer open/close + scrim, aesthetics in light + dark themes and EN + zh-TW, on both dashboards.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 first — produces the rewire-surface list everything else relies on.
- **Foundational (Phase 2)**: T002, T003 — block all user stories (the rail shell must exist).
- **US1 (Phase 3)**: after Foundational. The MVP.
- **US2 (Phase 4)**: depends on US1 (verifies the move). T009 (spec authoring) can be written
  in parallel with US1; T010 (run + remediate) requires US1 complete.
- **US3 (Phase 5)**: after Foundational; independent of US2. Builds on the rail from US1/T002
  for the off-canvas behavior, so sequence after US1 in practice.
- **Polish (Phase 6)**: after all desired stories.

### Within Each Story

- US1: T004 → T005 (move nodes) → T006 (rewire config) → T007 (accordion) → T008 (sticky). T006
  depends on T004/T005 (nodes must be in `#navRail` for the new selectors to resolve).
- US3: T011 (markup) → T012 (CSS) → T013 (JS) → T014 (i18n) → T015 (tests).

### Parallel Opportunities

- T002 is `[P]` (CSS block, isolated) but T003 (markup container) should land with it before US1.
- T009 (`[P]`, new test file) can be authored alongside US1 implementation.
- T014 (`[P]`, i18n/catalog) can proceed alongside T012/T013.
- T016 (`[P]`) measurement is independent of T017/T018.

---

## Parallel Example: User Story 1 + its test

```bash
# While implementing US1 (T004–T008), author the parity spec in parallel:
Task: "T009 [P] [US2] Author tests/e2e/left-sidebar-nav.spec.ts desktop parity assertions"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 (T001 audit) → Phase 2 (T002–T003 scaffold) → Phase 3 (T004–T008).
2. **STOP and VALIDATE**: desktop sidebar accordion works; content reclaimed; navigation
   behaves as before (manual click-through).
3. This is a demoable MVP on its own.

### Incremental Delivery

1. Setup + Foundational → rail shell ready.
2. US1 → desktop sidebar (MVP) → validate.
3. US2 → lock parity with the E2E spec → validate.
4. US3 → mobile drawer → validate at phone width.
5. Polish → full gate + lockstep diff + visual smoke → merge.

---

## Notes

- `[P]` = different files, no dependencies. Cross-file dashboard edits are deliberately one
  task each (lockstep), not split RR/Generic.
- No calc module is touched → unit suite must remain green unchanged (a regression there means
  something out of scope was edited).
- Navigation state stays owned by `window.tabRouter`; the drawer only controls rail visibility
  (no second source of truth — Principle III).
- Commit after each task or logical group; keep both HTML files in the same commit.
- Genuinely-visual checks (T019) are the only human-gated step; everything else is automatable.
