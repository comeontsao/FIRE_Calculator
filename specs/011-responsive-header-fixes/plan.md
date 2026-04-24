# Implementation Plan: Generic Dashboard — Responsive Header Layout Fixes

**Branch**: `011-responsive-header-fixes` | **Date**: 2026-04-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/011-responsive-header-fixes/spec.md`

## Summary

Fix two responsive layout bugs on `FIRE-Dashboard-Generic.html`'s site header via CSS media queries + minor HTML restructuring, backed by a new Playwright E2E test suite that locks the fix across 3 viewports × 2 sidebar states × 2 languages = 12 matrix cells.

**Bug 1 fix approach**: The current `.header` grid is `1fr auto auto` (line 143) which squeezes the `<h1>` title below min-content at narrow viewports, causing word-by-word wrapping. The `.fire-status` pill (currently the middle `auto` column) then visually overlaps the wrapped title. Fix: introduce three responsive breakpoints (≥1024px single-row, 768–1023px two-row, <768px three-row) via media queries that restructure `.header`'s `grid-template-columns` / `grid-template-rows`; apply `word-break: keep-all` + segment-hinting on `<h1>`; extend the existing `clamp()` font-size rule to shrink further at narrow widths (floor 1.2rem).

**Bug 2 fix approach**: The sidebar (`.sidebar` at line 1289) is `position: fixed; top: 0; right: 0; bottom: 0; z-index: 90` with `background: var(--card)` — a DIFFERENT shade from the header's `var(--bg-deep)`. The header IS z-index 100 (higher), but the sidebar's `top: 0` still visually butts against the header's top edge, producing a horizontal seam where the two backgrounds meet. Fix: set sidebar `top` to a dynamic `var(--header-height, 0px)` CSS custom property, updated by JS on resize / header-compact transitions. This pushes the sidebar BELOW the header's bottom edge so backgrounds never collide.

**Technical approach**: CSS-only for Bug 1 (media queries + title typography); CSS + ~10 lines of JS for Bug 2 (ResizeObserver on `.header` updates `--header-height` on `:root`). One minor HTML restructure: confirm `.fire-status` is a flex/grid sibling of `.header__brand` (not absolutely positioned) so it can reflow. Playwright is a new dev-only dependency (constitution Principle V explicitly permits it as test tooling); a new `package.json` with dev-only `devDependencies` is introduced.

**Scope**: Generic-only (FR-022). Layout-only (FR-023). No calc logic touched; `getAdultsOnlyFactor` / `calcPerChildAllowance` / etc. from feature 010 unaffected. No new i18n keys (FR-017). Total: ~80–150 LoC CSS delta, ~10 LoC JS, ~200 LoC new Playwright test, 1 new `package.json`, 1 new `playwright.config.ts`.

## Technical Context

**Language/Version**: Vanilla JavaScript (ES2020), CSS (including `clamp()`, `color-mix()`, media queries). No transpile.
**Primary Dependencies**: Chart.js (CDN, already loaded — unchanged). New dev-only: Playwright (`@playwright/test`).
**Storage**: No change. `FIRE-snapshots-generic.csv` schema untouched. `localStorage` schema untouched.
**Testing**:
- Pre-existing: Node built-in `node --test tests/unit/*.test.js` — 161 tests green as of feature 010 merge. Must stay green (FR-018, SC-010).
- New: Playwright E2E at `tests/e2e/responsive-header.spec.ts` — 12-cell matrix per FR-019.
**Target Platform**: Any evergreen browser opening the HTML file directly. Mobile (≥ 400 px), tablet (~768 px), desktop (≤ 1440 px primary target).
**Project Type**: Zero-build single-file HTML dashboard + Node unit tests + Playwright E2E (new).
**Performance Goals**: First meaningful chart < 1 s cold (constitution §Performance floor — unchanged). Header layout recompute on viewport resize within 100 ms.
**Constraints**:
- Principle I (lockstep): N/A — `FIRE-Dashboard.html` (RR) not in this repo (confirmed during feature 010 merge). No divergence risk.
- Principle II (pure calc modules): N/A — this feature touches only layout CSS + minor JS glue, no calc modules.
- Principle IV: new Playwright matrix is the gold-standard regression coverage. Existing 161 unit tests must remain green.
- Principle V (zero-build delivery): the runtime HTML stays directly-openable with no build step. Playwright is a test-tooling exception explicitly permitted by Principle V's carve-out clause. A new `package.json` is introduced BUT its only purpose is `devDependencies`; the dashboard itself does not import from `node_modules`.
- Principle VI (chart ↔ module contracts): N/A — no calc module changes.
- Principle VII (bilingual NON-NEGOTIABLE): no new user-visible strings added. `data-i18n` bindings on `header.title` / `header.subtitle` preserved. The spec's `word-break: keep-all` rule is designed to work for both EN and zh-TW.
**Scale/Scope**: ~150 LoC CSS delta across 3 media query blocks + typography rules. ~10 LoC JS for the `--header-height` ResizeObserver. ~1 new `package.json` (~20 lines). ~1 `playwright.config.ts` (~40 lines). ~1 test file (`responsive-header.spec.ts`) with 12 test cases in a parametrised matrix (~200 LoC).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| # | Principle | Gate | Status |
|---|-----------|------|--------|
| I | Dual-Dashboard Lockstep (NON-NEGOTIABLE) | Both HTML files ship changes in lockstep OR divergence is documented. | **N/A (vacuous).** `FIRE-Dashboard.html` (RR) is not present in this repository (confirmed during feature 010 merge). If RR is reinstated later, the same responsive header fixes must be ported in the same change set — tracked as an assumption in spec.md. |
| II | Pure Calculation Modules with Declared Contracts | Every touched calc module keeps its fenced header synced. | **Pass (vacuous).** No calc modules are touched. All changes are layout CSS + one minor JS glue function (`updateHeaderHeight`) that reads the header's DOM measurements — but that function is NOT a calc module; it's a presentation helper that writes a CSS custom property. No purity invariant to preserve. |
| III | Single Source of Truth for Interactive State | One resolver per shared state field. | **Pass.** The `--header-height` CSS custom property becomes the single source of truth for the sidebar's top offset. Both `.sidebar` CSS (consumer) and `updateHeaderHeight()` (producer) reference this one variable. |
| IV | Gold-Standard Regression Coverage (NON-NEGOTIABLE) | New branches get locked fixtures; test count stays green and grows. | **Pass.** A new Playwright suite at `tests/e2e/responsive-header.spec.ts` locks the acceptance scenarios from US1–US4 via a 12-cell matrix (FR-019). The 161 existing unit tests remain untouched and green (SC-010). Playwright is permitted by Principle V as test tooling. |
| V | Zero-Build, Zero-Dependency Delivery | No bundler, no runtime deps, no framework. | **Pass with documented addition.** Playwright is added under `devDependencies` in a new `package.json`. Principle V's explicit carve-out clause permits this: "Test tooling (Node for unit tests on extracted calc modules, Playwright for E2E) is permitted because it does not ship to users." The dashboard HTML continues to have zero runtime dependencies beyond the Chart.js CDN script tag. `node_modules/` gets `.gitignore`'d; nothing is vendored. See Complexity Tracking for the justification of introducing `package.json`. |
| VI | Explicit Chart ↔ Module Contracts | Comments sync between chart renderers and calc modules. | **N/A (vacuous).** No calc modules, no chart changes. |
| VII | Bilingual First-Class — EN + zh-TW (NON-NEGOTIABLE) | Every new visible string has both translations in the same commit. | **Pass.** Zero new user-visible strings introduced (FR-017). Existing `header.title` and `header.subtitle` i18n keys continue to flow through `data-i18n` unchanged. The `word-break: keep-all` CSS rule is designed to work for both languages (it's the correct behaviour for CJK line-breaking while preserving English word integrity). zh-TW rendering is explicitly exercised in the Playwright matrix (FR-019: 12 cells = 3 viewports × 2 sidebar states × 2 languages). |

**Overall Gate: PASS** with one documented addition (Playwright dev dependency + `package.json`) justified under Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/011-responsive-header-fixes/
├── plan.md                      # This file (/speckit-plan command output)
├── spec.md                      # Feature specification (already present)
├── research.md                  # Phase 0 output — CSS approach decisions + Playwright setup decisions
├── data-model.md                # Phase 1 output — DOM entities + CSS custom property contract
├── quickstart.md                # Phase 1 output — manual verification at 3 viewports × 2 sidebar states × 2 languages
├── contracts/                   # Phase 1 output
│   ├── header-layout.contract.md       # Breakpoint grid specification
│   ├── sidebar-offset.contract.md      # --header-height CSS var + JS producer
│   └── playwright-matrix.contract.md   # 12-cell matrix structure + assertions
├── checklists/
│   └── requirements.md          # Already present from /speckit-specify
└── tasks.md                     # Phase 2 output — /speckit-tasks creates this, NOT /speckit-plan
```

### Source Code (repository root — affected paths only)

```text
FIRE_Calculator/
├── FIRE-Dashboard-Generic.html          # TOUCHED. CSS media queries (header grid + typography +
│                                         # sidebar top offset via CSS var), ~10 LoC JS for
│                                         # ResizeObserver-based --header-height updater, minor
│                                         # HTML restructure (.fire-status position confirmation).
├── package.json                         # NEW. devDependencies: @playwright/test. No runtime deps.
├── playwright.config.ts                 # NEW. Viewport matrix, test artifacts dir, reporters.
├── .gitignore                           # UPDATED. Add node_modules/ if not already present.
├── tests/
│   ├── unit/                            # UNCHANGED. 161 tests stay green (SC-010).
│   └── e2e/                             # NEW directory.
│       ├── responsive-header.spec.ts    # NEW. 12-cell matrix per FR-019. ~200 LoC.
│       └── artifacts/                   # NEW. Screenshot output dir (gitignored).
│           └── responsive-header/       # Per-cell screenshots on failure.
└── (no changes to calc/, FIRE-snapshots-generic.csv, FIRE-Dashboard Translation Catalog.md,
   CLAUDE.md (except active-feature pointer update below), BACKLOG.md, .specify/)
```

**Structure Decision**: Single-file HTML + ES-module calc lib + two test tiers (`tests/unit/` existing, `tests/e2e/` new). No new top-level directories apart from `tests/e2e/`. The `.gitignore` update is a one-line addition (`node_modules/`) plus possibly an artifacts ignore for Playwright screenshots. CSS changes live inline in `FIRE-Dashboard-Generic.html` alongside the existing header styles (lines 138–250 and 1434–1505 — two CSS blocks cover the header currently).

## Phase 0 — Outline & Research

See [research.md](./research.md). Key decisions:

1. **Breakpoint strategy**: 3 breakpoints (1024px, 768px, <768px) per spec FR-001–FR-003. Rationale: matches common web responsive conventions; differentiates desktop-single-row, tablet-two-row, mobile-three-row cases; avoids introducing an arbitrary fourth breakpoint.
2. **Title word-break rule**: `word-break: keep-all` (preserves EN word integrity and CJK natural wrapping). Alternatives (`word-break: break-word`, `overflow-wrap: anywhere`) considered and rejected — they would allow mid-word breaks.
3. **Title font-size shrink**: extend the existing `clamp(1.8rem, 2.4vw + 0.5rem, 2.35rem)` to a narrower floor. Decision: `clamp(1.2rem, 2.4vw + 0.5rem, 2.35rem)` — preserves the middle slope, lowers the floor by 0.6rem for phone viewports.
4. **Sidebar offset mechanism**: CSS custom property `--header-height` on `:root`, updated by a JS `ResizeObserver` on `.header`. Alternatives (hardcoded `top: 80px`, CSS-only solutions via `:has()`, sidebar restructured to be inside `<main>` below header) all considered. The ResizeObserver approach handles the compact-sticky transition (which changes header height from ~100px to ~50px) elegantly.
5. **Playwright bootstrap**: `npm init -y` + `npm install -D @playwright/test` + `npx playwright install chromium`. Single-browser target (chromium) for speed; matches the dashboard's evergreen-browser target. Config uses `testDir: tests/e2e`, `reporter: [['list'], ['html', { open: 'never' }]]`, screenshots on failure only.
6. **Test fixture for sidebar state**: toggle via `page.click('#sidebarToggle')` and wait for `.sidebar--open` class. Language toggle via `page.click('#langZH')` and wait for `html[lang="zh"]` or equivalent signal.
7. **Visual background-continuity assertion**: pixel-colour sample via `page.evaluate(() => document.elementFromPoint(...).style.background)` + `window.getComputedStyle`. Rationale: avoids full-screenshot diffing (brittle, slow) while directly validating FR-011.

**Output**: `research.md` with all 7 decisions + alternatives considered.

## Phase 1 — Design & Contracts

See [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md).

**Contracts produced**:

- `header-layout.contract.md` — Specifies the three-breakpoint CSS grid structure. At ≥1024px: `grid-template-columns: 1fr auto auto` (current baseline, unchanged). At 768–1023px: `grid-template-columns: 1fr auto` with `.header__brand` on row 1 (spanning both columns) and `.header__status` + `.header__controls` on row 2. At <768px: `grid-template-columns: 1fr` with all three children stacked. Includes typography rules (`word-break: keep-all`, `clamp()` font size, title segment hints).
- `sidebar-offset.contract.md` — Specifies the `--header-height` CSS custom property producer (JS `updateHeaderHeight()` via ResizeObserver) and consumer (`.sidebar { top: var(--header-height, 0px); }`). Includes the edge case where the compact-sticky state changes header height and the observer must fire to update the variable.
- `playwright-matrix.contract.md` — Specifies the 12-cell test matrix: `[{width:400,height:800},{width:768,height:1024},{width:1440,height:900}] × ['sidebar-closed','sidebar-open'] × ['en','zh']`. Each cell asserts: (a) title ≤ 2 lines, (b) title/pill DOMRects don't intersect, (c) left vs right edge background sample matches ≤ 2 RGB unit delta, (d) all 4 controls `visible()`. Screenshot-on-failure to `tests/e2e/artifacts/responsive-header/`.

**Agent context update**: `CLAUDE.md`'s `<!-- SPECKIT START -->` / `<!-- SPECKIT END -->` block updates its active-feature pointer from `specs/010-country-budget-scaling/plan.md` → `specs/011-responsive-header-fixes/plan.md`.

**Post-design Constitution re-check**: every principle listed above remains PASS. Playwright addition remains the only documented complexity; no new violations surfaced by the contracts.

## Complexity Tracking

> Principle V (Zero-Build Delivery) remains upheld — runtime HTML stays directly-openable — but a `package.json` + `devDependencies: { "@playwright/test": ... }` is introduced. Documented here with a simpler-alternative analysis per constitution §Complexity justification.

| Addition | Why Needed | Simpler Alternative Rejected Because |
|----------|------------|--------------------------------------|
| **`package.json` + `devDependencies: { "@playwright/test": ^1.x }`** | Principle IV (Gold-Standard Regression Coverage) is NON-NEGOTIABLE, and this feature's entire value is making responsive CSS regressions visibly fail. Manual browser smoke passes alone are not sufficient — they aren't executed on every PR. Playwright fills the gap with automated cross-viewport assertions. Principle V explicitly carves out test tooling ("Playwright for E2E is permitted") so this is explicitly allowed. | **Alt A — do only manual browser smoke.** Rejected: no CI gate, no regression protection, fails Principle IV. **Alt B — use a lighter headless-browser library (puppeteer, webdriver-manager).** Rejected: Playwright is the industry standard for this use case; switching for marginal gains introduces a different dev-dep with the same class of footprint. **Alt C — use a CSS-visual-regression tool instead (BackstopJS, Percy).** Rejected: full-screenshot diffing is brittle across font rendering across machines; this feature's acceptance criteria are geometric/DOMRect-based (which Playwright does cleanly) rather than pixel-exact. |
| **One-line `node_modules/` entry in `.gitignore`** | Needed to prevent `node_modules/` from being committed after `npm install`. No other impact. | No simpler alternative; this is the standard pattern. |

---

**Ready for**: `/speckit-tasks` — generate the dependency-ordered task list that turns this plan into concrete commits.
