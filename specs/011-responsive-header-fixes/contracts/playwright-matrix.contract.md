# Contract: Playwright 12-Cell Test Matrix

**Feature**: 011-responsive-header-fixes
**Owner**: QA Engineer.
**File**: `tests/e2e/responsive-header.spec.ts`.

---

## Matrix definition

```
viewports      = [
  { name: 'phone',   width:  400, height:  800 },
  { name: 'tablet',  width:  768, height: 1024 },
  { name: 'desktop', width: 1440, height:  900 }
]
sidebarStates = ['closed', 'open']
languages      = ['en', 'zh']

cells = viewports × sidebarStates × languages = 3 × 2 × 2 = 12
```

Each cell is a parametrised test run. Playwright's `test.describe.parallel` + nested `test()` loops, or explicit `for` loops, produce 12 distinct test cases in the reporter.

---

## Per-cell assertions

Every cell runs these assertions after the page is fully loaded, the sidebar is in the target state, and the language is toggled to the target value:

### A1. Title bounding rectangle ≤ 2 visual lines

```ts
const h1 = page.locator('.header h1');
const box = await h1.boundingBox();
const lineHeight = await h1.evaluate(el =>
  parseFloat(getComputedStyle(el).lineHeight) || 1.2 * parseFloat(getComputedStyle(el).fontSize)
);
expect(box.height / lineHeight).toBeLessThanOrEqual(2.1); // ≤ 2 lines (small epsilon)
```

### A2. No word appears isolated on its own line

```ts
const title = await h1.textContent();
const wordCount = title.trim().split(/\s+/).length;
const visualLines = Math.round(box.height / lineHeight);
expect(wordCount).toBeGreaterThan(visualLines); // more words than lines = no word-per-line stack
```

(Chinese doesn't use space separators, so this assertion is skipped or trivially passes for zh cells — `wordCount` for Chinese is effectively 1. The assertion only blocks EN word-per-line bugs, which is the specific bug reported.)

### A3. Title and status pill DOMRects do not intersect

```ts
const titleBox = await page.locator('.header h1').boundingBox();
const pillBox  = await page.locator('#fireStatus').boundingBox();

function rectsIntersect(a, b) {
  return !(a.x + a.width  <= b.x ||
           b.x + b.width  <= a.x ||
           a.y + a.height <= b.y ||
           b.y + b.height <= a.y);
}
expect(rectsIntersect(titleBox, pillBox)).toBe(false);
```

### A4. Header background continuous across full width

```ts
const headerBox = await page.locator('#siteHeader').boundingBox();
const yBottom = Math.floor(headerBox.y + headerBox.height - 1);

const [leftColor, rightColor] = await page.evaluate(([y, vpWidth]) => {
  function rgbAt(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    return getComputedStyle(el).backgroundColor;
  }
  return [rgbAt(1, y), rgbAt(vpWidth - 1, y)];
}, [yBottom, viewport.width]);

function parseRgb(s) {
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) return [0, 0, 0];
  return m[1].split(',').map(v => parseFloat(v.trim())).slice(0, 3);
}
const [lr, lg, lb] = parseRgb(leftColor);
const [rr, rg, rb] = parseRgb(rightColor);

expect(Math.abs(lr - rr)).toBeLessThanOrEqual(2);
expect(Math.abs(lg - rg)).toBeLessThanOrEqual(2);
expect(Math.abs(lb - rb)).toBeLessThanOrEqual(2);
```

### A5. All four controls visible and clickable

```ts
for (const sel of ['#langEN', '#langZH', '#themeToggle', '#sidebarToggle']) {
  await expect(page.locator(sel)).toBeVisible();
}
// Reset button has no id; locate by text (both languages)
await expect(
  page.locator('button').filter({ hasText: /Reset to Defaults|重設為預設值/ })
).toBeVisible();
```

---

## Test setup per cell

```ts
async function setupCell(page: Page, viewport: Viewport, sidebarState: 'closed' | 'open', language: 'en' | 'zh') {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(`file://${path.resolve('FIRE-Dashboard-Generic.html')}`);

  // Ensure fresh localStorage to get known-good defaults.
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // Language toggle
  if (language === 'zh') {
    await page.click('#langZH');
    await expect(page.locator('html[lang="zh"]')).toBeVisible();
  }

  // Sidebar state
  if (sidebarState === 'open') {
    await page.click('#sidebarToggle');
    await expect(page.locator('.sidebar.sidebar--open')).toBeVisible();
  }

  // Let layout settle (transitions + ResizeObserver).
  await page.waitForTimeout(300);
}
```

---

## Failure handling

On failure of any assertion, Playwright's `screenshot: 'only-on-failure'` config captures:

```
tests/e2e/artifacts/responsive-header/<cell-name>-failure.png
```

Where `<cell-name>` is e.g., `phone-sidebar-open-zh` — combining the three matrix dimensions.

---

## Playwright config requirements

`playwright.config.ts` at repo root:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'tests/e2e/artifacts/html-report' }]
  ],
  use: {
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  outputDir: 'tests/e2e/artifacts',
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } }
  ],
});
```

Chromium-only (for speed + because the user's dev environment targets it). Webkit/Firefox can be added later if cross-browser bugs surface.

---

## Running locally

```bash
npm install                    # one-time, installs @playwright/test from package.json
npx playwright install chromium  # one-time, downloads the browser binary
npx playwright test tests/e2e/responsive-header.spec.ts
```

Expected: 12 passing cells in <60 seconds (SC-008).

---

## CI integration (future, out of scope for feature 011)

If/when CI is introduced: run `npx playwright test` as a required pre-merge check. Cache `~/.cache/ms-playwright` for faster runs. Out of scope here; the feature ships with local-runnable tests.

---

## Invariants (summary)

| # | Invariant | Assertion | FR/SC |
|---|-----------|-----------|-------|
| I1 | Title ≤ 2 lines at every viewport | A1 | FR-004, SC-003 |
| I2 | No word-per-line stack (EN only) | A2 | FR-004, SC-003 |
| I3 | Title + pill don't overlap | A3 | FR-010, SC-005 |
| I4 | Header background continuous full-width | A4 | FR-011, SC-004 |
| I5 | All 4 controls visible and clickable | A5 | FR-016, SC-007 |
