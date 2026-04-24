---

description: "Task list for feature 011 implementation"
---

# Tasks: Generic Dashboard — Responsive Header Layout Fixes

**Input**: Design documents from `/specs/011-responsive-header-fixes/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Tests are REQUIRED by constitution Principle IV (NON-NEGOTIABLE) and are the core deliverable for User Story 5 (Playwright 12-cell matrix). All implementation phases must pair with the relevant Playwright cells before merge.

**Organization**: Tasks are grouped by user story (US1–US5 from spec.md) to enable independent implementation and verification. Feature 011 is CSS-heavy — Frontend Engineer owns most tasks; QA Engineer owns the Playwright scaffold + test authoring.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1, US2, US3, US4, US5 — omitted for Setup / Foundational / Polish phases
- Include exact file paths in descriptions

## Path Conventions

- Main dashboard file: `FIRE-Dashboard-Generic.html` (existing CSS + JS inline)
- New E2E tests: `tests/e2e/responsive-header.spec.ts`
- New config files: `package.json`, `playwright.config.ts` (repo root)
- Existing Node unit tests under `tests/unit/` are UNCHANGED throughout this feature
- `FIRE-Dashboard.html` (RR) is not in this repo — FR-022 constraint is vacuously satisfied

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install Playwright dev dependency, scaffold `package.json` and config, set up `.gitignore` entries. No code logic yet.

- [ ] T001 Create `package.json` at repo root with `{ "name": "fire-calculator", "private": true, "devDependencies": { "@playwright/test": "^1.47.0" } }` and a minimal `scripts` section: `{ "test:unit": "node --test tests/unit/*.test.js", "test:e2e": "playwright test" }`. This is the first `package.json` in the repo; Principle V carve-out documented in plan.md Complexity Tracking.
- [ ] T002 Create `playwright.config.ts` at repo root per `contracts/playwright-matrix.contract.md` §Playwright config requirements. Chromium-only, testDir `tests/e2e`, 30s timeout, HTML reporter to `tests/e2e/artifacts/html-report/`, screenshot-on-failure to `tests/e2e/artifacts/`.
- [ ] T003 Update `.gitignore` to add `node_modules/` and `tests/e2e/artifacts/` (if not already present). Verify with `git check-ignore -v node_modules` after the edit.
- [ ] T004 Run `npm install` from repo root to hydrate `node_modules/` with `@playwright/test`. Then run `npx playwright install chromium` to download the chromium binary. Report any install warnings.
- [ ] T005 Create empty directory structure: `mkdir -p tests/e2e/artifacts/responsive-header`. The directory is gitignored per T003, but the path must exist for Playwright to write into it.

**Checkpoint**: `npm install` succeeds, `npx playwright test --list` prints zero tests (but exits 0). Ready for foundational phase.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared test helpers + any common CSS variable declarations. Every user story depends on the test infrastructure; the CSS custom property `--header-height` is declared here so US2's wiring has a landing place.

**⚠️ CRITICAL**: No user story work (other than US1's purely visual CSS) should begin until this phase is complete.

- [ ] T006 In `FIRE-Dashboard-Generic.html`, add `--header-height: 0px;` to the existing `:root { ... }` CSS block (Grep for `:root {` to find it — should be near the other CSS custom properties like `--bg`, `--accent`). This is the default fallback; the JS producer (T014) will overwrite it with the live value.
- [ ] T007 [P] Create `tests/e2e/helpers.ts` with shared utilities used across the matrix:
  - `loadDashboard(page)` — `page.goto('file://<repo>/FIRE-Dashboard-Generic.html')` + clear localStorage + reload
  - `setLanguage(page, 'en' | 'zh')` — click `#langEN` or `#langZH` + wait for settle
  - `setSidebarState(page, 'open' | 'closed')` — click `#sidebarToggle` only if current state differs
  - `rectsIntersect(a, b)` — pure DOMRect intersection helper
  - `parseRgb(colorString)` — parses `rgb(...)` / `rgba(...)` to `[r, g, b]` array
  - `sampleBackgroundAt(page, x, y)` — returns computed `background-color` at a point via `page.evaluate(() => document.elementFromPoint(x, y))`

**Checkpoint**: `:root { --header-height: 0px; }` rendered in browser; `helpers.ts` compiles under Playwright's TypeScript runner (`npx playwright test --list` still clean).

---

## Phase 3: User Story 1 — Readable title on narrow and zoomed viewports (Priority: P1) 🎯 MVP

**Goal**: The header title fits on ≤2 lines at every viewport ≥400px, never word-by-word, at both EN and zh-TW. Responsive breakpoints at 1024px / 768px.

**Independent Test**: Open `FIRE-Dashboard-Generic.html` in a browser. Resize viewport to 1440px (single-line title), 768px (≤2-line title on its own row with pill + controls on a second row), 400px (≤2-line title at ≥1.15rem font size in a three-row stack). Toggle language; repeat. Title is never word-by-word. Ref: quickstart.md smoke paths 1, 3, 5, 7.

### Implementation

- [ ] T008 [US1] In `FIRE-Dashboard-Generic.html` around the existing `.header` CSS block (line ~138), add a new `@media (max-width: 1023px)` block per `contracts/header-layout.contract.md` §"768–1023px — two-row". Restructures `grid-template-columns` to `1fr auto`, places `.header__brand` on row 1 (full-span), `.header__status` + `.header__controls` on row 2.
- [ ] T009 [US1] Add a new `@media (max-width: 767px)` block per `contracts/header-layout.contract.md` §"<768px — three-row stack". Sets `grid-template-columns: 1fr`, stacks all three children in three rows, tightens padding to `16px 20px`, wraps `.header__controls` via flex.
- [ ] T010 [US1] Within the same `@media (max-width: 1023px)` block, update `.header h1` with: `font-size: clamp(1.2rem, 2.4vw + 0.5rem, 2.35rem); word-break: keep-all; overflow-wrap: normal; hyphens: manual; line-height: 1.2;` per `contracts/header-layout.contract.md` §"Narrow-viewport overrides".
- [ ] T011 [US1] Within the `@media (max-width: 767px)` block, further adjust `.header h1` with `font-size: clamp(1.15rem, 3vw + 0.2rem, 1.8rem); line-height: 1.25;` per the same contract.
- [ ] T012 [US1] Audit the second header CSS block around line ~1434 (the "skin" / theme block). Verify no additional media query is needed there — the current `clamp(1.8rem, 2.4vw + 0.5rem, 2.35rem)` at that site must be SUPERSEDED by T010's narrower `clamp` via cascade order. Confirm via Grep that the two blocks don't accidentally conflict. If conflict found, extend T010/T011 to override explicitly.

### Playwright assertions for US1 (within the full matrix — T027)

- [ ] T013 [US1] Ensure the Playwright spec authored in T027 covers US1 invariants at all 12 cells: title ≤ 2 lines (A1), word-per-line check (A2). No standalone test — merged into the matrix authored later.

**Checkpoint**: At each of the three viewport sizes × both languages, the title renders cleanly without word-by-word stacking. Visual verification via browser DevTools device emulator. (Playwright will lock this in T027.)

---

## Phase 4: User Story 2 — Header background extends full width with sidebar open (Priority: P1)

**Goal**: Seam between header and sidebar backgrounds eliminated via `--header-height` CSS custom property driven by `ResizeObserver`. Sidebar top offset follows the header's live height.

**Independent Test**: Open dashboard. Toggle sidebar on via `#sidebarToggle`. Take screenshot. Sample the background color at the top-left edge (1px, 50px) and top-right edge (viewport_width − 1px, 50px). The two samples match within ≤2 RGB delta per channel. Repeat at each viewport size and sidebar-open state. Ref: quickstart.md smoke paths 2, 4, 6.

### Implementation

- [ ] T014 [US2] In `FIRE-Dashboard-Generic.html`, add the `updateHeaderHeight()` function + its `ResizeObserver` IIFE initialiser per `contracts/sidebar-offset.contract.md` §"JS producer". Place near other DOMContentLoaded-initialised helpers (Grep for `DOMContentLoaded` to find the existing cluster).
- [ ] T015 [US2] In `FIRE-Dashboard-Generic.html` `.sidebar` CSS rule (line ~1289), change `top: 0;` to `top: var(--header-height, 0px);` per `contracts/sidebar-offset.contract.md` §"CSS change". The fallback `0px` preserves pre-011 behaviour if JS fails.
- [ ] T016 [US2] Verify (no code change) that `switchLanguage()` (Grep for `function switchLanguage`) does NOT need an explicit call to `updateHeaderHeight()` — the ResizeObserver should pick up the title-length change automatically. If browser testing reveals a visible flicker after language toggle, add an explicit `updateHeaderHeight()` call at the end of `switchLanguage()` as a safety net (documented in the contract).
- [ ] T017 [US2] Verify (no code change) that the existing `.header--compact` transition triggers a ResizeObserver callback. If the transition doesn't change the element's `getBoundingClientRect().height` synchronously (because it uses padding/font-size transitions that may fire only after animation complete), add an explicit `updateHeaderHeight()` call inside the IntersectionObserver callback that applies/removes `.header--compact` (Grep for `header--compact` to find that logic).

### Playwright assertions for US2 (within the full matrix — T027)

- [ ] T018 [US2] Ensure T027 covers the background-continuity assertion (A4): sample left and right pixel colors at `header_bottom - 1px`, expect ≤ 2 RGB delta. This is the direct validation of FR-011.

**Checkpoint**: Visual verification — toggle sidebar at each viewport, confirm NO seam at the header/sidebar boundary. Scroll to trigger compact-sticky with sidebar open; seam still absent.

---

## Phase 5: User Story 3 — Compact-sticky + all controls preserved (Priority: P2)

**Goal**: Pre-011 compact-sticky transition fires at same threshold with same timing. All 4 header controls remain clickable at every viewport.

**Independent Test**: Scroll past `#headerSentinel`. Header enters `.header--compact` with 240ms ± 30ms transition. Title shrinks, subtitle fades, background turns translucent. All 4 controls remain visible and clickable at 1440px, 768px, 400px. Ref: quickstart.md smoke path 8.

### Implementation

- [ ] T019 [US3] Verify (no code change expected) that the existing `.header--compact` CSS block (line ~156) is NOT accidentally overridden by the new `@media` rules from T008–T009. Specifically: media-query `.header` rules must NOT `!important`-override the `padding` or `background` that `.header--compact` changes. If conflict exists, restructure with `:not(.header--compact)` selectors or move the media queries outside.
- [ ] T020 [US3] Verify (via browser test) that at each viewport size × with sidebar both open and closed, all 4 controls (`#langEN`, `#langZH`, `#themeToggle`, `#sidebarToggle`, Reset button) remain visible and clickable. No code change expected IF T008/T009 are correct; if failures found, adjust the flex/wrap rules on `.header__controls` in T009.

### Playwright assertions for US3 (within the full matrix — T027)

- [ ] T021 [US3] Ensure T027 covers the control-visibility assertion (A5): each of `#langEN`, `#langZH`, `#themeToggle`, `#sidebarToggle`, and the Reset button are `.toBeVisible()` at every cell. Also add a separate Playwright test (outside the 12-cell matrix) that scrolls past the sentinel, asserts `.header--compact` is applied within 300ms, and confirms the same controls stay visible. Place in `tests/e2e/responsive-header.spec.ts` as `test('compact-sticky preserved across breakpoints', ...)`.

**Checkpoint**: Scrolled-compact state looks identical to pre-011 behaviour. No visual or timing regression.

---

## Phase 6: User Story 4 — FIRE-status pill legible at every viewport size (Priority: P2)

**Goal**: Pill and title have zero geometric overlap at every viewport. At narrow widths the pill reflows to its own row (covered by US1's grid restructure).

**Independent Test**: At each of 1440px, 768px, 400px viewports, inspect the DOMRect of the title and the pill — they must not intersect. Pill text remains fully visible (not clipped). Ref: spec §US4.

### Implementation

- [ ] T022 [US4] Most of US4 is already delivered by US1's media queries (the pill reflows to row 2 or row 3 naturally via the grid restructure). Audit: no additional CSS rule should be needed. Confirm by Grep that `.fire-status` is NOT styled with `position: absolute` anywhere, and is NOT inside a `overflow: hidden` container that would clip its text.
- [ ] T023 [US4] Add pill size shrink at <768px per `contracts/header-layout.contract.md` §"Minor pill size adjustment": inside the existing `@media (max-width: 767px)` block from T009, append `.fire-status { font-size: 0.78rem !important; padding: 6px 12px !important; }`. Preserves the existing `!important` convention on the `.fire-status` rule's base styles.

### Playwright assertions for US4 (within the full matrix — T027)

- [ ] T024 [US4] Ensure T027 covers the title/pill non-intersection assertion (A3) at every cell. This is the direct validation of FR-010.

**Checkpoint**: Pill visible and non-overlapping at every viewport × language × sidebar state combination.

---

## Phase 7: User Story 5 — Playwright 12-cell matrix (Priority: P2)

**Goal**: Automated regression coverage for the full US1–US4 invariants across 3 viewports × 2 sidebar states × 2 languages.

**Independent Test**: Run `npx playwright test tests/e2e/responsive-header.spec.ts`. All 12 matrix cells pass in <60 seconds. HTML report generated at `tests/e2e/artifacts/html-report/index.html`. Ref: spec §US5, `contracts/playwright-matrix.contract.md`.

### Implementation

- [ ] T025 [US5] Create `tests/e2e/responsive-header.spec.ts` with imports: `@playwright/test`, `path`, and the helpers from `tests/e2e/helpers.ts`. Add the matrix constants from `contracts/playwright-matrix.contract.md` §"Matrix definition": `viewports`, `sidebarStates`, `languages`.
- [ ] T026 [US5] Implement `setupCell(page, viewport, sidebarState, language)` per `contracts/playwright-matrix.contract.md` §"Test setup per cell". Uses `helpers.ts`' `loadDashboard`, `setLanguage`, `setSidebarState`. Waits 300ms after setup for transitions + ResizeObserver to settle.
- [ ] T027 [US5] Generate the 12-cell matrix using nested `test.describe` + `test` loops. Each cell:
  1. Calls `setupCell(page, viewport, sidebarState, language)`
  2. Runs all 5 assertions (A1–A5 from `contracts/playwright-matrix.contract.md` §"Per-cell assertions") against the fresh page state.
  3. Names the test descriptively: `${viewport.name}-${sidebarState}-${language}` (e.g., `phone-sidebar-open-zh`).
- [ ] T028 [US5] Add the separate `test('compact-sticky preserved across breakpoints', ...)` from T021 outside the matrix loops. Programmatically scrolls via `page.evaluate(() => window.scrollTo(0, 500))`, waits 300ms, asserts `page.locator('.header')` has class `header--compact`, asserts each control is visible. Runs at one representative viewport (1440 × 900) to keep the suite fast.
- [ ] T029 [US5] Run `npx playwright test tests/e2e/responsive-header.spec.ts --reporter=list` and confirm 12 cells + 1 sticky test = 13 passing tests in <60 seconds. If any cell fails, screenshot lands in `tests/e2e/artifacts/responsive-header/` — diagnose, fix the underlying CSS/JS in the relevant US1–US4 task, and re-run.

**Checkpoint**: 13/13 Playwright tests green. HTML report available for manual review. Test suite runs locally in <60s.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Constitution gates, documentation sync, roadmap update, RR vacuous-check, final verification.

### Constitution gates

- [ ] T030 Grep `FIRE-Dashboard-Generic.html` for any new `[A-Za-z]{4,}` tokens introduced by this feature inside user-visible DOM. All new CSS selector / variable names (e.g., `--header-height`) are implementation details not user-visible. Confirm zero new raw-English user-visible strings (Principle VII vacuously satisfied since no new i18n keys are added per FR-017).
- [ ] T031 Confirm Principle V carve-out compliance: `npm install` creates `node_modules/` locally; `node_modules/` is gitignored (T003); the dashboard HTML does NOT import from `node_modules` (Grep `FIRE-Dashboard-Generic.html` for `node_modules` — expect 0 hits); Chart.js is still loaded from CDN (unchanged).
- [ ] T032 Confirm the 161 pre-011 unit tests stay green: `node --test tests/unit/*.test.js 2>&1 | tail -6`. Expected: `# pass 161 # fail 0`. No regression from feature-011 work (should be impossible since we don't touch any calc logic, but verify).

### Documentation

- [ ] T033 [P] Update `FIRE-Dashboard-Roadmap.md` with a feature 011 entry. Place under the same `## ✅ Recently shipped` section where features 009 + 010 live. Include: status (Implemented), branch name, spec link, 1-paragraph summary (what the fix does + test matrix).
- [ ] T034 [P] Verify `CLAUDE.md`'s SPECKIT block still points at `specs/011-responsive-header-fixes/plan.md` (updated during `/speckit-plan`; sanity check).

### Final manual smoke (Manager merge gate per CLAUDE.md Process Lessons)

- [ ] T035 Execute quickstart.md smoke path 1 (desktop, sidebar closed): baseline unchanged.
- [ ] T036 Execute quickstart.md smoke path 2 (desktop, sidebar open): no seam.
- [ ] T037 Execute quickstart.md smoke path 3 (tablet, sidebar closed): 2-row layout.
- [ ] T038 Execute quickstart.md smoke path 4 (tablet, sidebar open): 2-row + no seam.
- [ ] T039 Execute quickstart.md smoke path 5 (phone, sidebar closed): 3-row stack, title ≤ 2 lines.
- [ ] T040 Execute quickstart.md smoke path 6 (phone, sidebar open): 3-row + no seam.
- [ ] T041 Execute quickstart.md smoke path 7 (zh-TW at all viewports): Chinese title renders cleanly.
- [ ] T042 Execute quickstart.md smoke path 8 (compact-sticky transition): preserved at every viewport × sidebar state.
- [ ] T043 Execute quickstart.md smoke path 9 (extreme zoom 150 / 175 / 200 %): behaves like narrow viewports.

### RR vacuous check

- [ ] T044 Confirm `FIRE-Dashboard.html` is still absent from the repo (not created by this feature). `ls FIRE-Dashboard.html 2>&1` should return "No such file or directory". FR-022 vacuously satisfied.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup** (T001–T005): No prerequisites. Must complete before Phase 7 (Playwright needs `@playwright/test` installed). Does NOT block US1/US2 implementation (those are pure CSS/JS additions to the HTML).
- **Phase 2 Foundational** (T006–T007): Depends on Phase 1. `--header-height` declaration in T006 is consumed by T015 (US2). `tests/e2e/helpers.ts` in T007 is consumed by T026 (US5).
- **Phase 3 US1** (T008–T013): Depends on Phase 2 (T006). Can proceed in parallel with Phase 4 (US2) because the CSS changes are in different grid blocks vs custom-property declarations.
- **Phase 4 US2** (T014–T018): Depends on Phase 2 (T006). Can proceed in parallel with Phase 3.
- **Phase 5 US3** (T019–T021): Depends on Phase 3 (verification that US1's media queries don't break `.header--compact`).
- **Phase 6 US4** (T022–T024): Depends on Phase 3 (US1's grid restructure handles most of US4).
- **Phase 7 US5** (T025–T029): Depends on Phase 1 (Playwright installed) + Phase 2 (helpers) + Phase 3–6 (the invariants being tested must be live).
- **Phase 8 Polish** (T030–T044): Depends on all prior phases complete.

### User Story Dependencies

- **US1 (P1 MVP)**: needs Setup + Foundational. Delivers the core title-readability fix.
- **US2 (P1)**: needs Setup + Foundational. Delivers the background-continuity fix. Can run in parallel with US1.
- **US3 (P2)**: needs US1 (so compact-sticky can be verified against the new media queries).
- **US4 (P2)**: needs US1 (pill reflow is a side effect of US1's grid restructure).
- **US5 (P2)**: needs Setup + Foundational + US1 + US2 + US3 + US4 (tests exercise the invariants delivered by those stories).

### Within Each User Story

- CSS changes land in the same commit as the contracts-documented rules.
- JS changes (US2 only) land in the same commit as the consumer CSS rule and the initial ResizeObserver wiring.
- Playwright assertions are authored in Phase 7 as a single integrated suite — NOT split per story — because the matrix structure is more maintainable as one file.

### Parallel Opportunities

- **Phase 1**: T001, T002, T003 are different files — can run in parallel. T004 depends on T001. T005 is quick.
- **Phase 3 ↔ Phase 4**: US1 and US2 can be implemented by two engineers in parallel (different CSS sections + different JS sites).
- **Phase 8**: T033 and T034 are [P] — different files.

---

## Parallel Example: Phase 3 + Phase 4 parallel dispatch

```text
# After Setup + Foundational complete, dispatch two Frontend engineers in parallel:
Engineer A (Frontend): Phase 3 US1 — title + layout media queries (T008–T012)
Engineer B (Frontend + JS): Phase 4 US2 — --header-height + ResizeObserver + sidebar top (T014–T017)

# Once A completes, Engineer A moves to Phase 5 US3 + Phase 6 US4 verification
# Once B completes, QA picks up Phase 7 US5 Playwright authoring
```

---

## Implementation Strategy

### MVP (User Stories 1 + 2)

1. Phase 1 Setup → Phase 2 Foundational → Phase 3 US1 + Phase 4 US2 (parallel).
2. **STOP and VALIDATE**: run quickstart.md smoke paths 1–6 manually. These are the P1 fixes.
3. If visually correct, ship as MVP. US3/US4/US5 can land in a follow-up.

### Incremental Delivery

1. Setup + Foundational → infrastructure ready.
2. + US1 → title readability at all viewports. Smoke paths 1/3/5/7 pass. **Partial ship.**
3. + US2 → sidebar seam gone. Smoke paths 2/4/6 pass. **Shippable.**
4. + US3 → compact-sticky verified; smoke path 8 passes.
5. + US4 → pill legibility locked; smoke paths 3/5 re-verify.
6. + US5 → 12-cell Playwright matrix green. **CI-ready.**
7. + Polish → docs + roadmap + RR vacuous check.

### Parallel Team Strategy

With Manager + Frontend + QA:

1. Manager: T001–T005 (Setup + Playwright install).
2. Frontend A: T008–T013 (US1 media queries + typography).
3. Frontend B: T014–T018 (US2 CSS var + ResizeObserver).
4. After US1/US2 complete, Frontend A: T019–T024 (US3/US4 verification + minor pill-size fix).
5. QA: T025–T029 (Playwright suite authoring + matrix execution).
6. Manager: T030–T044 (polish + manual smoke + RR check).

---

## Notes

- `FIRE-Dashboard.html` (RR): NOT IN REPO. Do NOT attempt to touch it. Lockstep exception vacuous per FR-022.
- This feature touches ZERO calc logic. Feature-010's `getAdultsOnlyFactor` / `calcPerChildAllowance` / `getScaledScenarioSpend` are untouched. The 161 unit tests MUST remain green throughout.
- CSS changes commit together with their associated Playwright test when possible (constitution Principle IV).
- Playwright binary is platform-specific and NOT checked in. Each developer runs `npx playwright install chromium` once after `npm install`.
- On CI (future): Playwright browser can be cached via `~/.cache/ms-playwright`. Out of scope for feature 011.
- The `package.json` introduced here is a first for this repo; treat it carefully. `npm install` must NOT pull runtime dependencies — only `@playwright/test` as a devDependency.
