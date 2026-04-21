# Feature 006 — Closeout

**Feature**: UI Noise Reset + Lifecycle Dock
**Branch**: `006-ui-noise-reset-lifecycle-dock`
**Date**: 2026-04-21
**Author (QA Engineer sign-off)**: Phase 6 verification

Related artifacts:
- Spec: [spec.md](./spec.md)
- Plan: [plan.md](./plan.md)
- Tasks: [tasks.md](./tasks.md)
- Quickstart: [quickstart.md](./quickstart.md)
- Research: [research.md](./research.md)
- Data model: [data-model.md](./data-model.md)
- Contracts: [contracts/](./contracts/)

---

## What shipped

All three user stories from [spec.md](./spec.md) delivered to both `FIRE-Dashboard.html` (RR) and `FIRE-Dashboard-Generic.html` (Generic) in lockstep per Constitution Principle I.

### US1 — Pinnable Lifecycle Sidebar (P1) — [spec.md §US1](./spec.md)

- Right-edge `<aside id="lifecycleSidebar">` drawer with simplified mirror of the Full Portfolio Lifecycle chart.
- Three modes: `hidden` / `docked` (desktop, main content reflows by 420px) / `overlay` (mobile, scrim overlay).
- Pin preference persists per-file: RR uses `fire_dashboard_sidebar_pinned`, Generic uses `fire_dashboard_generic_sidebar_pinned`.
- Resize crossing 780px flips `docked` ↔ `overlay`; scrim click + Escape close the overlay.
- Mirror chart reads `_lastLifecycleDataset` — **no parallel calc** (Constitution Principle III honored).
- Sidebar listener registered AFTER primary `renderGrowthChart` so the cached dataset is always fresh when the mirror consumes it.
- Chart.js resize via `transitionend` + `setTimeout(fire, 350)` fallback (research.md R6).
- Focus management (A11y-5) restores focus to the element that triggered the open.

### US2 — Sticky compact header (P1) — [spec.md §US2](./spec.md)

- Header is now `<header id="siteHeader" class="header">` with `position: sticky; top: 0; z-index: 100;` and a 1px `#headerSentinel` sibling placed immediately before it.
- `IntersectionObserver` on the sentinel toggles `.header--compact` — **no scroll listener in the header path** (research.md R1).
- Compact state drops padding to `10px 24px`, applies `backdrop-filter: blur(12px)` + `rgba(15,16,22,0.85)` background fallback, and reveals `#headerYearsValue` / `#headerProgressValue` live chips.
- `renderCompactHeaderStats(state)` reads `_lastKpiSnapshot` (Constitution Principle III — single source of truth) and is registered as a `chartState.onChange` listener so chips update on the same frame as KPI cards.
- `prefers-reduced-motion: reduce` disables all header transitions.
- Language toggle (EN / 中文) and `#sidebarToggle` live inside `.header__controls` in both states.

### US3 — Noise-reduction pass (P2) — [spec.md §US3](./spec.md)

All 12 visual-system policies from [contracts/visual-system.contract.md](./contracts/visual-system.contract.md) applied:

| Policy | Delivered |
|--------|-----------|
| V1 Surface tiers | 10 `surface--secondary` tags per file (chart cards demoted to border-only); hover limited to `.card.is-interactive` |
| V2 KPI accent policy | All four KPI `.value` elements use `var(--text)`; no `text-accent` / `text-green` / `text-yellow` on KPI values |
| V3 Card-title typography | `.card-title` is `font-size: 0.95em; font-weight: 500;` — no uppercase, no letter-spacing |
| V4 Section dividers | 4 `<div class="section-divider">` elements per file (Profile & Plan, Outlook, Compare, Track) |
| V5 Hover discipline | Only `.card.is-interactive` gets the accent border-color animation |
| V6 FIRE Progress rail | `.card.span-3` FIRE-progress card removed; replaced with thin `.progress-rail` directly under KPI row |
| V7 Filter demotion | `.filter-row` + `.filter-pill` + `.filter-pill--active` replaces the old `.tab-row` / `.tab-btn`; `filter.label` prefix added |
| V8 Emoji discipline | Chart-card titles have no emoji; concept cards retain their existing emoji |
| V9 Language-toggle relocation | Moved from absolute-positioned floating div into `.header__controls` |
| V10 Border cleanup | Inner sub-panel borders removed where the outer card already frames them |
| V11 Footer tip softening | `.footer-panel__tip` border-left: `var(--border)` (was `var(--accent)`) |
| V12 New i18n keys | 13 new keys added to both EN and ZH dicts in both files, plus the Translation Catalog |

---

## Test results

### Unit tests (T056)

Command: `node --test tests/unit/*.test.js`
Result: **65/65 pass** (matches baseline from before feature work started). No calc modules were modified.

### Existing browser smoke (baseline, pre-extension)

Command: `node tests/baseline/browser-smoke.test.js`
Result before extension: **3/3 pass** (RR cold-load smoke, Generic cold-load smoke, Parity smoke).

### Extended browser smoke (T057 + T058)

Added one new test case to `tests/baseline/browser-smoke.test.js`:
`feature-006 DOM contract: sticky header + sidebar + visual system present in RR and Generic`

Assertions (all zero-dep, text-level grep on the raw HTML source):
- Sticky-header hooks: `#headerSentinel`, `#siteHeader`, `#headerYearsValue`, `#headerProgressValue`, `#sidebarToggle`, `.header--compact` CSS class present in both files.
- Sidebar hooks: `#lifecycleSidebar`, `#lifecycleSidebarCanvas`, `#sidebarScrim`, `#sidebarFireAge`, `#sidebarEndPortfolio` present in both files.
- Visual system: `.section-divider` ≥4 occurrences, `.progress-rail` ≥1, `.filter-row__label` ≥1; old `.card span-3` wrapper around FIRE Progress is gone (heuristic 200-char preceding-window check).
- i18n: all 13 new keys (`section.profile`, `section.outlook`, `section.compare`, `section.track`, `filter.label`, `header.yearsChipLabel`, `header.progressChipLabel`, `sidebar.title`, `sidebar.pinAria`, `sidebar.closeAria`, `sidebar.toggleAria`, `sidebar.fireAgeLabel`, `sidebar.endPortfolioLabel`) present in both the `en: {` and `zh: {` sub-dicts of both files.

Result after extension: **4/4 pass** (3 baseline + 1 new feature-006 DOM contract).

### Quickstart walkthroughs (T059–T063)

QA could not drive a real browser from the agent environment, so each check was converted to a **static verification** using grep + file reads against the authoritative contract. All five checks passed on the static pass — see the verification report in the Manager's session transcript for line-number evidence. A human-in-browser pass is still required before marking the feature user-facing complete (see "Manual browser-verification note" below).

---

## Parity audit (T066)

Expected divergences between RR and Generic (all legitimate):
- Personal content: "Roger" / "Rebecca" / real birthdates vs "Person 1" / "Person 2" / the generic "FIRE Command Center" brand.
- Field naming: `roger401k*` / `rebeccaStocks` / `ageRoger` vs `person1_401k*` / `person2Stocks` / `agePerson1`.
- localStorage keys: `fire_dashboard_*` vs `fire_dashboard_generic_*` (including the new `SIDEBAR_KEY`).
- Generic-only: the MIT credit line in `footer.attribution` (inherited from feature 005).

No unexpected structural, CSS, or JS selector divergence found. Constitution Principle I satisfied.

---

## Deferred / non-goals

- `#progressCurrent` / `#progressPct` nodes: the V6 progress-rail refactor removed the card but kept `#progressBar` and `#progressTarget` intact (existing JS writes to them). Any historical selectors tied to `#progressCurrent` / `#progressPct` should be audited in a follow-up; spec.md did not call them out as required, and grep confirms no feature-005/006 test references them.
- Sidebar drag-to-resize: explicitly out of scope per `lifecycle-sidebar.contract.md Non-goals`.
- Left-edge dock or multi-chart sidebar: explicitly out of scope.
- Color palette / typography family changes: out of scope per `visual-system.contract.md Non-goals`.

---

## Follow-up work identified during implementation

- **Snapshot-history parity check**: feature 006 tagged `is-interactive` on scenario cards and snapshot rows, but the QA pass only confirmed class presence — a future QA extension could add a Playwright test that asserts hover border-color animation is indeed gated to those rows.
- **Reduced-motion visual confirmation**: the CSS media query is present in both files, but static verification cannot prove the browser actually honors it. A human-in-browser `prefers-reduced-motion` toggle check is still recommended before widescale release.
- **Frame-rate floors (SC-003)**: Quickstart Check 5 asks for a 60fps scroll + ≥30fps slider drag measurement with the sidebar pinned. This can only be validated in a real browser using DevTools Performance tab — deferred to human verification.

---

## Manual browser-verification note

Per the Manager's gate in [CLAUDE.md → "Browser smoke before claiming a feature done"](../../CLAUDE.md), a human operator must still:

1. Open both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` in Chrome or Edge (desktop ≥1280px viewport).
2. Wait 2 seconds for cold load.
3. Confirm every KPI card shows a numeric value (NOT "Calculating…", NaN, $0, `—`, or "40+").
4. Open DevTools console — confirm zero red errors AND zero `[<shim-name>] canonical threw:` messages.
5. Walk through [quickstart.md](./quickstart.md) Checks 1–5 end-to-end with scroll + slider drag + pin/unpin + language switch + mobile-emulation resize crossing 780px.
6. Drag the FIRE marker on the lifecycle chart with the sidebar pinned — confirm same-frame update between primary and mirror chart.

Only after step 6 returns clean should the branch be merged to `main`.

---

## Merge readiness

**Status: GO (conditional on human-in-browser pass)**

All automated gates green: 65/65 unit tests, 4/4 smoke tests (3 baseline + 1 feature-006 DOM contract), parity audit clean. No calc modules changed, so non-regression against feature 005's country-drift fix and PERSIST_IDS contract is mechanical — both preserved.

Confidence level: **high for code correctness**, **pending-human-verification for visual + interactive behavior** (frame rates, animation smoothness, drag performance, reduced-motion feel — none of these are provable from static analysis).

Recommendation: Manager should run the human-in-browser pass on a fresh clone of the branch; if clean, merge as a single commit to `main` and tag as feature 006 close.
