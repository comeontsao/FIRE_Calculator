# Quickstart: Responsive Header — Manual Verification

**Feature**: 011-responsive-header-fixes
**Audience**: QA Engineer (Manager-triggered browser smoke gate per `CLAUDE.md` Process Lessons).
**Environment**: Any evergreen browser + local file serve (`python -m http.server 8000` from repo root or direct `file://`).

---

## Setup

1. Check out branch `011-responsive-header-fixes`.
2. From repo root: `python -m http.server 8000` (or open the file directly).
3. Open `FIRE-Dashboard-Generic.html` in Chrome / Edge / Firefox / Safari.
4. Open DevTools (F12). Toggle the device toolbar (Ctrl+Shift+M or Cmd+Shift+M) to simulate viewport sizes.

---

## Smoke path 1 — Desktop (1440 × 900), sidebar closed, EN

**Goal**: confirm baseline behaviour unchanged for the common desktop user.

1. Set viewport to 1440 × 900.
2. Confirm language is EN (click `EN` button if needed).
3. Confirm sidebar is closed (chart icon in header should NOT have the open indicator).

**Expected**:
- Header title "FIRE Command Center — Universal Template" on **1 line**.
- Subtitle "Financial Independence, Retire Early — Fat FIRE with Geo-Arbitrage Strategy" on 1 line below title.
- FIRE-status pill right-aligned on the same row as title, no overlap.
- 4 controls (EN/中文 toggle, theme toggle, sidebar toggle, Reset) right-aligned.
- Header background uniform across full width.

---

## Smoke path 2 — Desktop (1440 × 900), sidebar OPEN, EN

**Goal**: confirm the seam bug is fixed on desktop with sidebar open.

1. From smoke path 1, click the sidebar toggle button.
2. Observe the sidebar slide in from the right.

**Expected**:
- Header background remains **visually continuous** across the full viewport width. NO visible vertical seam at the top where the sidebar begins.
- The sidebar's left edge is below the header's bottom edge (not overlapping).
- Title, pill, and controls still on 1 row, unchanged from smoke path 1.

---

## Smoke path 3 — Tablet (768 × 1024), sidebar closed, EN

**Goal**: confirm the two-row layout at vertical tablet width.

1. Set viewport to 768 × 1024.
2. Ensure EN, sidebar closed.

**Expected**:
- Header title on **1 line** (or 2 max) — NEVER word-by-word stacked.
- Pill + controls on a SECOND row below the title.
- No overlap between title and pill.
- Header background uniform across full width.

---

## Smoke path 4 — Tablet (768 × 1024), sidebar OPEN, EN

**Goal**: confirm seam fix holds at tablet size.

1. From smoke path 3, click sidebar toggle.

**Expected**:
- Two-row header layout preserved.
- Sidebar slides in. NO seam at the header/sidebar boundary.
- Sidebar's top edge is below the header's bottom edge.

---

## Smoke path 5 — Phone (400 × 800), sidebar closed, EN

**Goal**: confirm three-row stack at phone size.

1. Set viewport to 400 × 800.
2. Ensure EN, sidebar closed.

**Expected**:
- Header title on **at most 2 lines** at a smaller-but-legible font size (~1.15rem).
- No word appears isolated on its own line.
- Pill on its own row below the title.
- Controls wrap into 1–2 lines below the pill.
- Header background uniform across full width.

---

## Smoke path 6 — Phone (400 × 800), sidebar OPEN, EN

**Goal**: confirm seam fix at phone size.

1. From smoke path 5, click sidebar toggle.

**Expected**:
- Three-row header layout preserved.
- Sidebar slides in from right, possibly covering most of the phone's width.
- NO seam at the header/sidebar boundary regardless of how narrow the visible header strip becomes.

---

## Smoke path 7 — zh-TW at all viewports

**Goal**: confirm Chinese title behaves well.

1. At each of the three viewport sizes (1440, 768, 400), click `中文`.
2. Verify the title "FIRE 指揮中心 — 通用版" renders correctly and matches the EN invariants:
   - Desktop: 1 line.
   - Tablet: 1–2 lines.
   - Phone: 1–2 lines.
3. No character-by-character vertical stacking (`word-break: keep-all` must work for CJK).
4. Repeat each viewport × sidebar-state combination to cover the 12-cell matrix manually.

**Expected**: Chinese renders the same structural behaviour as English; font metrics may yield slightly different line counts at the same viewport but never word-by-word or character-by-character stacks.

---

## Smoke path 8 — Sticky-compact transition at all viewports

**Goal**: confirm the `.header--compact` transition still fires cleanly.

1. At each viewport size, scroll down until the header enters compact state.
2. Observe: title shrinks, subtitle fades, background turns translucent.
3. Confirm 4 controls remain visible and clickable.
4. Scroll back to top: header restores to full size smoothly.
5. Repeat with sidebar open at each viewport: compact transition works in parallel with the sidebar's continued open state; no seam appears during the transition.

**Expected**: identical 240ms-cubic-bezier timing, identical button layout, no layout shift beyond the intended compact/full transition.

---

## Smoke path 9 — Extreme zoom (desktop 150%, 175%, 200%)

**Goal**: confirm responsive behaviour holds under Ctrl++ desktop zoom.

1. At 1440 viewport, press Ctrl++ repeatedly to reach 150%, 175%, 200% zoom.
2. Observe: header transitions through the same breakpoints as narrow viewports.

**Expected**: At 200% zoom on a 1440px window (effective 720px layout width), header shows the tablet two-row layout. No word-per-line wraps at any zoom.

---

## Running Playwright (automated version of the above)

```bash
npm install                         # one-time install
npx playwright install chromium     # one-time browser download
npx playwright test tests/e2e/responsive-header.spec.ts
```

Expected: 12/12 passing cells in under 60 seconds. HTML report at `tests/e2e/artifacts/html-report/index.html`.

---

## Regression gate (Manager must run before merge)

Per `CLAUDE.md` Process Lessons §"Browser smoke before claiming done":

- [ ] Smoke paths 1–6 executed at all three viewport sizes in a real browser with DevTools open.
- [ ] Smoke path 7 (zh-TW) executed at all three sizes.
- [ ] Smoke path 8 (compact-sticky transition) executed at all three sizes with sidebar both open and closed.
- [ ] DevTools console: zero red errors.
- [ ] Playwright local run: 12/12 cells pass.
- [ ] 161 unit tests remain green (`node --test tests/unit/*.test.js`).
- [ ] FIRE-Dashboard.html (RR) UNCHANGED — `git diff main -- FIRE-Dashboard.html` returns empty (file is absent from repo, so git returns no diff — vacuously satisfied).

If any check fails, block merge and route to appropriate Engineer per `CLAUDE.md` file ownership.
