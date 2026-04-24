# Phase 0 Research: Responsive Header Layout Fixes

**Feature**: 011-responsive-header-fixes
**Date**: 2026-04-24
**Status**: Complete — no unresolved `[NEEDS CLARIFICATION]`.

---

## 1. Breakpoint strategy

**Decision**: Three breakpoints — ≥1024px (single-row), 768–1023px (two-row), <768px (three-row).

**Rationale**:
- Matches common web responsive conventions (Bootstrap `md` = 768px, `lg` = 992–1024px; Tailwind `md` = 768px, `lg` = 1024px). Reduces learning curve for any future contributor.
- At 1024px+ the header has enough horizontal runway to fit title + status pill + four controls on one row at their comfortable font sizes. Baseline current behaviour preserved.
- At 768–1023px (vertical tablets, half-width desktop windows) the pill + controls still fit on one row, but the title needs its own row to avoid squeeze. Two-row layout.
- Below 768px (phones, heavily zoomed desktops) even the controls may need to stack; three-row layout accommodates this with title on row 1, pill on row 2, controls on row 3.

**Alternatives considered**:
- **Two breakpoints only (e.g., just 768px)**: rejected — phone viewports at 400px would still have controls cramped on a single row; the three-row structure gives them breathing space.
- **Four breakpoints (add a 1280px tier)**: rejected — the feature doesn't need a separate "just comfortable desktop" class; single-row works at 1024px and everything above.
- **No media queries, use `flex-wrap` with `min-width` on children**: rejected — less predictable behaviour at intermediate widths, harder to write deterministic Playwright assertions against.

---

## 2. Title `word-break` rule

**Decision**: `word-break: keep-all` on `.header h1`.

**Rationale**:
- CSS spec: `keep-all` means "Word breaks should not be used for Chinese/Japanese/Korean (CJK) text. Non-CJK text behaviour is the same as normal." This is EXACTLY the invariant we need: don't mid-word break, don't character-break CJK.
- Without this rule, browsers default to allowing breaks at word boundaries — which produces the word-per-line stack the user reported when the container is narrower than the title's longest line.
- `keep-all` + the existing `clamp()` font-size rule combined: narrow viewports shrink the title font until the title fits on 1–2 lines naturally.

**Alternatives considered**:
- **`word-break: break-word` or `overflow-wrap: anywhere`**: rejected — these allow mid-word breaks. "FIRE Command Cent" on one line with "er — Universal…" on the next is worse than the current bug.
- **`white-space: nowrap` + `text-overflow: ellipsis`**: rejected — hides content. The title should fit at every supported viewport, not truncate.
- **Hard `<br>` tags in the i18n string**: rejected — couples content to layout; each language would need separate break points; violates Principle VII's clean-i18n discipline.

---

## 3. Title font-size range

**Decision**: Extend the existing `clamp(1.8rem, 2.4vw + 0.5rem, 2.35rem)` to `clamp(1.2rem, 2.4vw + 0.5rem, 2.35rem)` at the ≥768px media breakpoint, and to `clamp(1.15rem, 3vw + 0.2rem, 1.8rem)` below 768px.

**Rationale**:
- At 400px viewport, the `2.4vw + 0.5rem` middle slope yields `9.6px + 8px = 17.6px ≈ 1.1rem`. Floor of 1.2rem gives a legible-but-tight phone size.
- At 768px viewport, `18.43px + 8px = 26.4px ≈ 1.65rem`. Comfortable tablet size.
- At 1024px+, the `2.35rem` ceiling kicks in and matches the current desktop look.
- The <768px version (`clamp(1.15rem, 3vw + 0.2rem, 1.8rem)`) gives a slightly steeper slope for phones so the title doesn't look too large at 500–700px widths.

**Alternatives considered**:
- **Keep current `clamp(1.8rem, ...)` everywhere**: rejected — at 400px the minimum 1.8rem is too large; the title literally won't fit on 2 lines.
- **Switch to container-query sizing**: rejected — `@container` is newer CSS, support is fine in evergreen browsers but adds complexity for no benefit here. Viewport units are sufficient.

---

## 4. `.fire-status` pill layout role

**Decision**: Confirm `.fire-status` is a flex/grid sibling of `.header__brand`, not absolutely positioned. Currently it already is a grid child (middle `auto` column at line 143). Our media queries simply change its grid-row/column at narrow widths.

**Rationale**:
- The spec's FR-008 requires the pill to be layout-participating so narrow viewports reflow it below the title rather than overlap.
- Auditing the current CSS confirms `.fire-status` has no `position: absolute` rule — it's `display: inline-flex` (line 196) and sits inside `.header__status` which is a grid child. The current overlap is a SYMPTOM of the title's word-by-word wrap growing tall and the pill's fixed row center misaligning.
- Fix: ensure the pill's grid-row / flex-order reflows below the title at narrow widths — purely a media-query adjustment. No HTML restructure needed.

**Alternatives considered**:
- **Refactor to pure flexbox with explicit wrap**: rejected — the existing grid works fine; changing to flex is unnecessary churn.
- **Keep pill positioned absolutely with `top` based on header height**: rejected — fragile; flex/grid is simpler.

---

## 5. Sidebar top-offset mechanism

**Decision**: Expose header height as a CSS custom property `--header-height` on `:root`, updated by a JavaScript `ResizeObserver` on the `.header` element. The sidebar's `top` rule becomes `top: var(--header-height, 0px)`.

**Rationale**:
- The sidebar is `position: fixed; top: 0; right: 0; bottom: 0` at line 1289. Its background (`var(--card)`) differs from the header's background (`var(--bg-deep)`), creating the visible seam at the top-right edge when the sidebar is open.
- Although z-index ordering puts the header (100) above the sidebar (90), the sidebar's top: 0 still overlaps the header's space — and any transparency or border on the sidebar manifests as the seam the user reported.
- Pushing the sidebar DOWN to start at `top: var(--header-height, 0px)` eliminates the overlap entirely. No more seam possible.
- `ResizeObserver` handles the compact-sticky transition automatically: when `.header--compact` reduces the header height from ~100px to ~50px, the observer fires and the CSS variable updates. The sidebar's top offset re-adjusts in the same render pass.
- Fallback `0px` in the CSS `var()` default ensures the page doesn't break if JS fails to run (rare).

**Alternatives considered**:
- **Hardcode `top: 80px`**: rejected — fragile against the compact-sticky state (where header height becomes ~50px); also breaks if the header's padding changes in a future refactor.
- **CSS `:has()` selector to target sidebar based on scroll state**: rejected — `:has()` support is fine in evergreen browsers but can't read actual pixel heights of other elements.
- **Move sidebar inside a layout wrapper below the header in the DOM**: rejected — the sidebar is `position: fixed` (viewport-relative), so moving its DOM parent doesn't change its visual rendering; only `top` offset matters. Plus the sidebar's HTML location is a feature-006 design decision we shouldn't disturb.
- **Set sidebar `z-index` below header and add a `background` to `.header::before` that extends full viewport width**: rejected — already the case (header z-index 100 vs sidebar 90), yet the seam persists in the user's screenshot. The issue isn't layering; it's that the sidebar OCCUPIES the top strip. Pushing it down is the cleaner fix.

---

## 6. Playwright bootstrap

**Decision**: Introduce `package.json` with `devDependencies: { "@playwright/test": "^1.x" }` and a `playwright.config.ts` targeting chromium only. Run via `npx playwright test`.

**Rationale**:
- Principle V carves out test tooling including Playwright explicitly: "Test tooling (Node for unit tests on extracted calc modules, Playwright for E2E) is permitted because it does not ship to users."
- Chromium-only (vs webkit/firefox multi-browser) keeps the test run fast (<60s target per SC-008) and matches the user's primary dev environment. Cross-browser testing is out of scope for this feature; if reported as a separate bug later, easy to add.
- `@playwright/test` bundles the test runner + expect API + fixtures. No separate Jest / Mocha needed.
- The existing Node-builtin `node --test` for unit tests is UNCHANGED — the two test tiers run independently.

**Alternatives considered**:
- **Cypress**: rejected — heavier install, requires a running dev server, slower startup. Playwright runs against `file://` URLs cleanly.
- **Puppeteer (without Playwright)**: rejected — no built-in test runner, would require a separate runner dep (Mocha/Jest), more boilerplate.
- **Vendor Playwright manually (no `package.json`)**: rejected — Playwright's binary is platform-specific and large; `npm install` + gitignored `node_modules` is the idiomatic approach.

---

## 7. Visual background-continuity assertion

**Decision**: Pixel-colour sample via `page.evaluate()` that reads `window.getComputedStyle` on the header at two x-coordinates (left edge = 1px, right edge = viewport_width − 1px) at a single y-coordinate (header_bottom − 1px).

**Rationale**:
- Direct validation of FR-011 (full-width background continuity).
- Avoids full-screenshot diffing, which is brittle across machines (antialiasing, subpixel positioning, GPU acceleration differences).
- The assertion is: `leftSample === rightSample` within ≤2 RGB-unit delta per channel (allows tiny sub-pixel/anti-alias variance).
- If the sidebar's background intrudes on the right edge of the header strip, the right sample matches the sidebar's `var(--card)` color while the left matches `var(--bg-deep)` — the delta exceeds 2 units and the test fails.

**Alternatives considered**:
- **Full-screenshot visual regression (BackstopJS, Percy, Playwright's own `toHaveScreenshot()`)**: rejected — brittle across font rendering, theme, machine differences. Would require per-machine baseline images.
- **DOM-based check (e.g., "is the sidebar's bounding rect overlapping the header's?")**: already done by the general overlap assertion (FR-010/SC-005). But that assertion passes when sidebar is below the header, which is the post-fix state. It DOESN'T detect the pre-fix bug because the sidebar overlaps the header visually but not in the flat DOMRect sense when we use the raw header rect. So pixel-colour sampling is the more direct test.
- **Color at a single corner pixel**: rejected — too sensitive to border rendering. Sampling just inside the corner (1px from edge) avoids the border.

---

**Output**: 7 decisions locked. No `[NEEDS CLARIFICATION]` remaining. Ready for Phase 1.
