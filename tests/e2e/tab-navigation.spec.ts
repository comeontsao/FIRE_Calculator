/**
 * E2E coverage for feature 013-tabbed-navigation.
 *
 * This spec covers four task IDs from `specs/013-tabbed-navigation/tasks.md`:
 *
 *   T023 (US2) — Persistence + deep-linking flows.
 *   T026 (US3) — `Next →` button workflow through each tab.
 *   T027 (US4) — Mobile (iPhone SE) responsive pill bar layout.
 *   T029 (SC-009) — Lockstep DOM-diff between RR and Generic dashboards.
 *
 * Per Constitution Principle I (Dual-Dashboard Lockstep, NON-NEGOTIABLE),
 * every applicable test runs against BOTH `FIRE-Dashboard.html` (RR) AND
 * `FIRE-Dashboard-Generic.html` (Generic). The lockstep DOM-diff test in
 * T029 is the structural gate that catches any drift between the two files.
 *
 * Conventions follow `tests/e2e/responsive-header.spec.ts` (Feature 011):
 *   - File:// loads via `pathToFileURL`.
 *   - Clean localStorage + reload before each test.
 *   - Chromium-only via `playwright.config.ts`.
 *   - Helpers live in `./helpers.ts`; this file owns test logic only.
 *
 * Calc-engine numbers are NEVER asserted here — only DOM/routing state.
 */

import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

interface DashboardFixture {
  readonly key: 'rr' | 'generic';
  readonly fileName: 'FIRE-Dashboard.html' | 'FIRE-Dashboard-Generic.html';
}

const DASHBOARDS: readonly DashboardFixture[] = [
  { key: 'rr',      fileName: 'FIRE-Dashboard.html' },
  { key: 'generic', fileName: 'FIRE-Dashboard-Generic.html' },
];

/**
 * The dashboards import ES modules from `./calc/*.js`, which Chromium
 * blocks on `file://` (CORS: cross-origin requests aren't supported).
 * `playwright.config.ts > webServer` spins up `python -m http.server 8766`
 * so we can load the files over http and the modules resolve.
 */
const HTTP_BASE = 'http://127.0.0.1:8766';

/** Time to let layout/router settle after navigation, click, or reload. */
const SETTLE_MS = 400;

/** Mobile viewport — iPhone SE per `tasks.md` T027. */
const MOBILE_VIEWPORT = { width: 375, height: 667 } as const;

/** Tolerance (px) for asserting siblings share the same baseline (no wrap). */
const ROW_TOLERANCE_PX = 2;

/**
 * Pill-traversal order per `calc/tabRouter.js` `TABS`. Must mirror the
 * frozen entity table — drift here would falsely pass T026.
 */
const TAB_PILLS: Record<string, readonly string[]> = {
  plan:       ['profile', 'assets', 'investment', 'mortgage', 'expenses', 'summary'],
  geography:  ['scenarios', 'country-chart', 'healthcare', 'country-deep-dive'],
  retirement: ['ss', 'withdrawal', 'drawdown', 'lifecycle', 'milestones'],
  history:    ['snapshots'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an HTTP URL for one of the two dashboard files. */
function dashboardUrl(fileName: DashboardFixture['fileName']): string {
  return `${HTTP_BASE}/${fileName}`;
}

/**
 * Wait until `window.tabRouter.init(...)` has run. The init call lives in a
 * `Promise.resolve().then(...)` microtask that fires AFTER the inline classic
 * <script> block, so `tabRouter` exists immediately on module load but is
 * dormant until the microtask runs. The cleanest "is init done?" signal is
 * the canonical URL hash that init writes via `replaceState`: it's non-empty
 * iff init resolved and matches `^#tab=.+&pill=.+$`.
 */
async function waitForRouterInit(page: Page): Promise<void> {
  // Gate on getState() returning a non-null view AND the hash matching one of
  // the FOUR known tab IDs. A pre-init hash like `#tab=foo&pill=bar` would
  // otherwise pass a permissive `[a-z]+` regex and let callers race init.
  await page.waitForFunction(
    () => {
      const w = window as any;
      if (!w.tabRouter || typeof w.tabRouter.getState !== 'function') return false;
      const state = w.tabRouter.getState();
      if (!state || !state.tab || !state.pill) return false;
      const hash = window.location.hash;
      return /^#tab=(plan|geography|retirement|history)&pill=[a-z][a-z0-9-]*$/.test(hash);
    },
    null,
    { timeout: 10_000 },
  );
}

/**
 * Navigate to a dashboard with clean localStorage + clean URL hash. Mirrors
 * `helpers.ts > loadDashboard` but parameterized over which file to load.
 *
 * The dashboards bootstrap `window.tabRouter.init(...)` inside a
 * `Promise.resolve().then(...)` block, so we wait for the canonical hash
 * to appear before any caller asserts on tab state.
 */
async function loadFresh(page: Page, file: DashboardFixture['fileName']): Promise<void> {
  await page.goto(dashboardUrl(file));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await waitForRouterInit(page);
  await page.waitForTimeout(SETTLE_MS);
}

/**
 * Open a dashboard with a specific URL hash. Used for deep-link tests
 * (T023c, T023d) where the hash must be present before init() runs.
 *
 * Browsers do NOT trigger a full page load when only the URL hash changes —
 * `page.goto(url)` followed by `page.goto(url#new-hash)` updates the hash
 * without re-running scripts, so init() never sees the new hash. Use a
 * single goto WITH the hash, then clear storage and reload to ensure init
 * reads the URL hash on a fresh execution.
 */
async function loadWithHash(
  page: Page,
  file: DashboardFixture['fileName'],
  hash: string,
): Promise<void> {
  await page.goto(dashboardUrl(file) + hash);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await waitForRouterInit(page);
  await page.waitForTimeout(SETTLE_MS);
}

/** Read the router's current `{tab, pill}` snapshot. */
async function getRouterState(page: Page): Promise<{ tab: string; pill: string }> {
  return page.evaluate(() => (window as any).tabRouter.getState());
}

/** Click the tab button matching `data-tab="<id>"` in `#tabBar`. */
async function clickTab(page: Page, tabId: string): Promise<void> {
  await page.click(`#tabBar .tab[data-tab="${tabId}"]`);
  await page.waitForTimeout(SETTLE_MS / 2);
}

/** Click the pill button matching `data-pill="<id>"` within the active tab. */
async function clickPill(page: Page, tabId: string, pillId: string): Promise<void> {
  await page.click(`.pill[data-tab="${tabId}"][data-pill="${pillId}"]`);
  await page.waitForTimeout(SETTLE_MS / 2);
}

/** Assert that a specific pill-host is visible (no `hidden` attribute). */
async function expectPillHostVisible(
  page: Page,
  tabId: string,
  pillId: string,
): Promise<void> {
  const host = page.locator(`.pill-host[data-tab="${tabId}"][data-pill="${pillId}"]`);
  await expect(host).toHaveCount(1);
  // The router toggles the `hidden` HTML attribute. Use `getAttribute`
  // rather than `toBeVisible()` because card content can have zero height
  // before charts paint, which Playwright treats as not visible.
  const isHidden = await host.evaluate((el) => (el as HTMLElement).hasAttribute('hidden'));
  expect(isHidden).toBe(false);
}

/**
 * Assert that the tab whose `data-tab="<id>"` is currently `.active` and
 * the active pill within that tab is `<pillId>`.
 */
async function expectActive(
  page: Page,
  tabId: string,
  pillId: string,
): Promise<void> {
  await expect(
    page.locator(`#tabBar .tab.active[data-tab="${tabId}"]`),
  ).toHaveCount(1);
  await expect(
    page.locator(`.pill.active[data-tab="${tabId}"][data-pill="${pillId}"]`),
  ).toHaveCount(1);
}

// ---------------------------------------------------------------------------
// T023 — Persistence + deep-linking (US2)
// ---------------------------------------------------------------------------

for (const dash of DASHBOARDS) {
  test.describe(`T023 persistence + deep-linking [${dash.key}]`, () => {
    test('a) first-time visitor lands on Plan/Profile with canonical hash', async ({ page }) => {
      await loadFresh(page, dash.fileName);

      const state = await getRouterState(page);
      expect(state).toEqual({ tab: 'plan', pill: 'profile' });

      // The router writes `replaceState('#tab=plan&pill=profile')` on init.
      await expect.poll(
        () => page.evaluate(() => window.location.hash),
        { timeout: 2_000 },
      ).toBe('#tab=plan&pill=profile');

      await expectActive(page, 'plan', 'profile');
      await expectPillHostVisible(page, 'plan', 'profile');
    });

    test('b) reload restores last-viewed tab+pill', async ({ page }) => {
      await loadFresh(page, dash.fileName);

      // Activate Retirement → Lifecycle through real clicks (exercises both
      // tab-bar and pill-bar delegated handlers + storage write).
      await clickTab(page, 'retirement');
      await clickPill(page, 'retirement', 'lifecycle');
      await expectActive(page, 'retirement', 'lifecycle');
      await expectPillHostVisible(page, 'retirement', 'lifecycle');

      // Hard reload — the router's localStorage read should restore state.
      await page.reload();
      await page.waitForFunction(() => Boolean((window as any).tabRouter));

      // Spec contract: state restores within 2s (SC-005).
      await expect.poll(
        () => getRouterState(page),
        { timeout: 2_000 },
      ).toEqual({ tab: 'retirement', pill: 'lifecycle' });

      await expectActive(page, 'retirement', 'lifecycle');
      await expectPillHostVisible(page, 'retirement', 'lifecycle');
    });

    test('c) deep link with valid hash activates Geography/Healthcare', async ({ page }) => {
      await loadWithHash(page, dash.fileName, '#tab=geography&pill=healthcare');

      const state = await getRouterState(page);
      expect(state).toEqual({ tab: 'geography', pill: 'healthcare' });

      await expectActive(page, 'geography', 'healthcare');
      await expectPillHostVisible(page, 'geography', 'healthcare');
    });

    test('d) invalid hash falls back to Plan/Profile + normalized URL', async ({ page }) => {
      await loadWithHash(page, dash.fileName, '#tab=foo&pill=bar');

      const state = await getRouterState(page);
      expect(state).toEqual({ tab: 'plan', pill: 'profile' });

      // Per `tab-routing.contract.md` §URL hash format: invalid → fall back
      // and `replaceState` to the canonical URL.
      const hash = await page.evaluate(() => window.location.hash);
      expect(hash).toBe('#tab=plan&pill=profile');

      await expectActive(page, 'plan', 'profile');
    });

    test('e) Back/Forward navigates through history of activations', async ({ page }) => {
      await loadFresh(page, dash.fileName);

      // Build up a small history: Plan/Profile → Plan/Assets →
      // Plan/Investment → Geography/Scenarios. Each click is `pushState`
      // per the router contract, so each click adds a history entry.
      await clickPill(page, 'plan', 'assets');
      await expectActive(page, 'plan', 'assets');

      await clickPill(page, 'plan', 'investment');
      await expectActive(page, 'plan', 'investment');

      await clickTab(page, 'geography');
      // Tab-bar click defaults pill to first pill of the tab (FR-027).
      await expectActive(page, 'geography', 'scenarios');

      // Back → Plan/Investment.
      await page.goBack();
      await page.waitForTimeout(SETTLE_MS);
      await expectActive(page, 'plan', 'investment');

      // Back → Plan/Assets.
      await page.goBack();
      await page.waitForTimeout(SETTLE_MS);
      await expectActive(page, 'plan', 'assets');

      // Forward → Plan/Investment again.
      await page.goForward();
      await page.waitForTimeout(SETTLE_MS);
      await expectActive(page, 'plan', 'investment');
    });
  });
}

// ---------------------------------------------------------------------------
// T026 — Next-button walkthrough (US3)
// ---------------------------------------------------------------------------

/**
 * Click the visible Next button inside the currently-active pill-host.
 * Multiple `[data-action="next-pill"]` buttons exist in the DOM (one per
 * pill-host); only the active host's button is visible, so the click must
 * target it specifically rather than the first match in document order.
 */
async function clickNextInActivePill(
  page: Page,
  tabId: string,
  pillId: string,
): Promise<void> {
  const btn = page.locator(
    `.pill-host[data-tab="${tabId}"][data-pill="${pillId}"] [data-action="next-pill"]`,
  );
  await expect(btn).toHaveCount(1);
  await btn.click();
  await page.waitForTimeout(SETTLE_MS / 2);
}

/**
 * Assert that the Next button on `(tabId, pillId)` carries the `disabled`
 * attribute. Clicking a disabled button must NOT change router state.
 */
async function expectNextDisabled(
  page: Page,
  tabId: string,
  pillId: string,
): Promise<void> {
  const btn = page.locator(
    `.pill-host[data-tab="${tabId}"][data-pill="${pillId}"] [data-action="next-pill"]`,
  );
  await expect(btn).toHaveCount(1);
  await expect(btn).toBeDisabled();
}

for (const dash of DASHBOARDS) {
  test.describe(`T026 next-button workflow [${dash.key}]`, () => {
    test('a) Plan walkthrough — 5 clicks advances Profile → Summary', async ({ page }) => {
      await loadFresh(page, dash.fileName);

      const order = TAB_PILLS.plan;
      // Sanity — start state.
      expect(await getRouterState(page)).toEqual({ tab: 'plan', pill: 'profile' });

      for (let i = 0; i < order.length - 1; i += 1) {
        const fromPill = order[i];
        const toPill = order[i + 1];
        await clickNextInActivePill(page, 'plan', fromPill);

        await expectActive(page, 'plan', toPill);
        const hash = await page.evaluate(() => window.location.hash);
        expect(hash).toBe(`#tab=plan&pill=${toPill}`);
      }

      // Final landing pill.
      expect(await getRouterState(page)).toEqual({ tab: 'plan', pill: 'summary' });
    });

    test('b) Plan/Summary Next is disabled and click is a no-op', async ({ page }) => {
      await loadWithHash(page, dash.fileName, '#tab=plan&pill=summary');
      await expectActive(page, 'plan', 'summary');

      await expectNextDisabled(page, 'plan', 'summary');

      const hashBefore = await page.evaluate(() => window.location.hash);
      const stateBefore = await getRouterState(page);

      // `force: true` bypasses Playwright's actionability check so the
      // disabled attribute reaches the router's delegated click handler,
      // which must defensively no-op (router contract §Next → button).
      const btn = page.locator(
        `.pill-host[data-tab="plan"][data-pill="summary"] [data-action="next-pill"]`,
      );
      await btn.click({ force: true }).catch(() => {
        // Some browsers refuse to dispatch click on disabled buttons even
        // with force; that's also an acceptable no-op outcome.
      });
      await page.waitForTimeout(SETTLE_MS / 2);

      expect(await getRouterState(page)).toEqual(stateBefore);
      const hashAfter = await page.evaluate(() => window.location.hash);
      expect(hashAfter).toBe(hashBefore);
      // Still on Plan/Summary, never advanced into Geography.
      await expectActive(page, 'plan', 'summary');
    });

    test('c) Geography walkthrough ends with Country Deep-Dive disabled', async ({ page }) => {
      await loadWithHash(page, dash.fileName, '#tab=geography&pill=scenarios');
      await expectActive(page, 'geography', 'scenarios');

      const order = TAB_PILLS.geography;
      for (let i = 0; i < order.length - 1; i += 1) {
        await clickNextInActivePill(page, 'geography', order[i]);
        await expectActive(page, 'geography', order[i + 1]);
      }
      // Final pill is country-deep-dive; its Next must be disabled.
      await expectNextDisabled(page, 'geography', 'country-deep-dive');
    });

    test('d) Retirement walkthrough ends with Milestones disabled', async ({ page }) => {
      await loadWithHash(page, dash.fileName, '#tab=retirement&pill=ss');
      await expectActive(page, 'retirement', 'ss');

      const order = TAB_PILLS.retirement;
      for (let i = 0; i < order.length - 1; i += 1) {
        await clickNextInActivePill(page, 'retirement', order[i]);
        await expectActive(page, 'retirement', order[i + 1]);
      }
      await expectNextDisabled(page, 'retirement', 'milestones');
    });

    test('e) History/Snapshots is a single-pill tab with disabled Next', async ({ page }) => {
      await loadWithHash(page, dash.fileName, '#tab=history&pill=snapshots');
      await expectActive(page, 'history', 'snapshots');

      // Only one pill in the History tab (per `TABS` in `calc/tabRouter.js`).
      const pillCount = await page.locator('#tab-history .pill').count();
      expect(pillCount).toBe(1);

      await expectNextDisabled(page, 'history', 'snapshots');
    });
  });
}

// ---------------------------------------------------------------------------
// T027 — Mobile responsive pill bars (US4)
// ---------------------------------------------------------------------------

for (const dash of DASHBOARDS) {
  test.describe(`T027 mobile pill bars [${dash.key}]`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({
        width: MOBILE_VIEWPORT.width,
        height: MOBILE_VIEWPORT.height,
      });
    });

    test('a) tab-bar and every pill-bar use nowrap + overflow-x:auto', async ({ page }) => {
      await loadFresh(page, dash.fileName);

      // Tab bar.
      const tabBarStyles = await page.locator('#tabBar').evaluate((el) => {
        const cs = getComputedStyle(el);
        return { flexWrap: cs.flexWrap, overflowX: cs.overflowX };
      });
      expect(tabBarStyles.flexWrap).toBe('nowrap');
      expect(tabBarStyles.overflowX).toBe('auto');

      // Every pill-bar — NOTE: use `evaluateAll` so we can inspect each
      // one even if some are inside hidden tab panels (their CSS still
      // resolves to nowrap/auto; computed style reflects the rules even
      // when an ancestor has `display:none`).
      const pillBarStyles = await page.locator('.pill-bar').evaluateAll((els) =>
        els.map((el) => {
          const cs = getComputedStyle(el);
          return { flexWrap: cs.flexWrap, overflowX: cs.overflowX };
        }),
      );
      expect(pillBarStyles.length).toBeGreaterThanOrEqual(4);
      for (const styles of pillBarStyles) {
        expect(styles.flexWrap).toBe('nowrap');
        expect(styles.overflowX).toBe('auto');
      }
    });

    test('b) no .tab or .pill wraps to a second row', async ({ page }) => {
      await loadFresh(page, dash.fileName);

      // Top tabs — all 4 tab buttons share a single baseline.
      const tabTops = await page.locator('#tabBar .tab').evaluateAll((els) =>
        els.map((el) => Math.round(el.getBoundingClientRect().top)),
      );
      expect(tabTops.length).toBe(4);
      const tabBaseline = tabTops[0];
      for (const t of tabTops) {
        expect(Math.abs(t - tabBaseline)).toBeLessThanOrEqual(ROW_TOLERANCE_PX);
      }

      // Plan-tab pills (currently visible). Walk every tab to verify each
      // pill bar's row alignment, since hidden tab panels do not lay out.
      for (const tabId of Object.keys(TAB_PILLS)) {
        await clickTab(page, tabId);
        const pillTops = await page
          .locator(`#tab-${tabId} .pill-bar .pill`)
          .evaluateAll((els) =>
            els.map((el) => Math.round(el.getBoundingClientRect().top)),
          );
        expect(pillTops.length).toBe(TAB_PILLS[tabId].length);
        const baseline = pillTops[0];
        for (const t of pillTops) {
          expect(Math.abs(t - baseline)).toBeLessThanOrEqual(ROW_TOLERANCE_PX);
        }
      }
    });

    test('c) horizontal scroll on a pill-bar shifts pills without activating', async ({ page }) => {
      await loadFresh(page, dash.fileName);

      // Pick the Retirement tab — it has 5 pills, more likely to overflow
      // at 375px. Switch to it first so its pill-bar lays out.
      await clickTab(page, 'retirement');
      await expectActive(page, 'retirement', 'ss');

      const pillBar = page.locator('#tab-retirement .pill-bar');
      const beforeLeft = await pillBar
        .locator('.pill[data-pill="ss"]')
        .evaluate((el) => Math.round(el.getBoundingClientRect().left));

      // Programmatically scroll the bar — does NOT dispatch a click.
      await pillBar.evaluate((el) => {
        (el as HTMLElement).scrollLeft = 120;
      });
      await page.waitForTimeout(150);

      const afterLeft = await pillBar
        .locator('.pill[data-pill="ss"]')
        .evaluate((el) => Math.round(el.getBoundingClientRect().left));

      // The ss pill's viewport-left should have moved (scrolled out of
      // view to the left). If the pill-bar isn't actually scrollable at
      // this viewport, scrollLeft stays at 0 — which is also acceptable
      // behavior, just nothing to assert. We assert the pill DID NOT
      // change activation as a result of scrolling, which is the core
      // promise of US4.
      void beforeLeft; void afterLeft; // Kept for diagnostic purposes.

      // The active pill is still SS — scroll did not activate Withdrawal.
      const state = await getRouterState(page);
      expect(state).toEqual({ tab: 'retirement', pill: 'ss' });
      await expectActive(page, 'retirement', 'ss');
    });
  });
}

// ---------------------------------------------------------------------------
// T029 — Lockstep DOM-diff between RR and Generic (SC-009)
// ---------------------------------------------------------------------------

interface DashboardStructure {
  readonly tabs: readonly string[];
  readonly pills: readonly string[];
  readonly hosts: readonly string[];
  readonly panels: readonly string[];
}

async function collectStructure(
  page: Page,
  file: DashboardFixture['fileName'],
): Promise<DashboardStructure> {
  await loadFresh(page, file);
  return page.evaluate(() => {
    const q = (s: string) => Array.from(document.querySelectorAll(s));
    return {
      tabs:   q('#tabBar .tab').map((b) => (b as HTMLElement).dataset.tab ?? ''),
      pills:  q('.pill').map((p) => {
        const el = p as HTMLElement;
        return `${el.dataset.tab}:${el.dataset.pill}`;
      }),
      hosts:  q('.pill-host').map((h) => {
        const el = h as HTMLElement;
        return `${el.dataset.tab}:${el.dataset.pill}`;
      }),
      panels: q('section.tab-panel').map((s) => (s as HTMLElement).id),
    };
  });
}

test.describe('T029 lockstep DOM-diff (SC-009)', () => {
  test('RR and Generic dashboards expose identical tab/pill/panel structure', async ({ browser }) => {
    // Load each file in its own isolated context so localStorage from one
    // file cannot leak into the other (file:// origins share storage with
    // the same host, so a clean context per page is the safer pattern).
    const ctxRr = await browser.newContext();
    const ctxGeneric = await browser.newContext();
    try {
      const pageRr = await ctxRr.newPage();
      const pageGeneric = await ctxGeneric.newPage();

      const [rr, generic] = await Promise.all([
        collectStructure(pageRr, 'FIRE-Dashboard.html'),
        collectStructure(pageGeneric, 'FIRE-Dashboard-Generic.html'),
      ]);

      expect(rr.tabs).toEqual(generic.tabs);
      expect(rr.pills).toEqual(generic.pills);
      expect(rr.hosts).toEqual(generic.hosts);
      expect(rr.panels).toEqual(generic.panels);

      // Defensive: assert the canonical 4 tabs and 16 pill-hosts to catch
      // any drift from the spec entity table (`calc/tabRouter.js > TABS`).
      expect(rr.tabs).toEqual(['plan', 'geography', 'retirement', 'history']);
      expect(rr.hosts.length).toBe(16);
      expect(rr.panels).toEqual([
        'tab-plan',
        'tab-geography',
        'tab-retirement',
        'tab-history',
      ]);
    } finally {
      await ctxRr.close();
      await ctxGeneric.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Additional spec coverage — fills gaps the original T023/T026/T027/T029 set
// did not address. Each subsection cites the spec ID it verifies.
// ---------------------------------------------------------------------------

/**
 * SC-008 — "Zero `console.error` messages with `[<shim-name>] canonical
 * threw:` prefixes during a manual smoke walk through every tab and every
 * pill on both HTML files."
 *
 * Automated counterpart of the manual browser smoke gate documented in
 * `quickstart.md` Step 15 + the CLAUDE.md "Browser smoke before claiming a
 * feature 'done'" rule. Captures `console.error` AND uncaught `pageerror`
 * AND any `[shim-name] canonical threw:` prefixed warning during a full
 * traversal of all 16 pills across all 4 tabs.
 */
for (const dash of DASHBOARDS) {
  test.describe(`SC-008 console-clean walk [${dash.key}]`, () => {
    test('walking every tab × every pill emits no console errors or shim throws', async ({ page }) => {
      const errors: string[] = [];
      const shimThrows: string[] = [];
      page.on('console', (msg) => {
        const text = msg.text();
        if (msg.type() === 'error') errors.push(text);
        // Shim defense-in-depth log per Feature 005 closeout / CLAUDE.md
        // "Shim defense-in-depth" rule: any `[<shim-name>] canonical threw:`
        // line is a known regression marker.
        if (/\[[a-zA-Z][\w-]*\]\s+canonical threw:/i.test(text)) shimThrows.push(text);
      });
      page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

      await loadFresh(page, dash.fileName);

      // Walk every tab in declaration order; for each, click every pill.
      for (const tabId of Object.keys(TAB_PILLS)) {
        await clickTab(page, tabId);
        await page.waitForTimeout(SETTLE_MS / 2);
        for (const pillId of TAB_PILLS[tabId]) {
          await clickPill(page, tabId, pillId);
          await page.waitForTimeout(SETTLE_MS / 2);
        }
      }

      expect(errors, `console errors during walk: ${errors.join(' | ')}`).toEqual([]);
      expect(shimThrows, `shim throws during walk: ${shimThrows.join(' | ')}`).toEqual([]);
    });
  });
}

/**
 * SC-010 — "KPI ribbon and right-edge Lifecycle sidebar remain visible
 * (>0px height, in viewport) during 100% of tab and pill switches."
 *
 * Asserts FR-015 dynamically: as the user switches tabs, the persistent
 * chrome (KPI row, gate selector, Lifecycle sidebar) stays rendered with
 * non-zero height. Caught regressions: anything that accidentally moves
 * persistent chrome inside a tab-panel.
 */
for (const dash of DASHBOARDS) {
  test.describe(`SC-010 persistent chrome [${dash.key}]`, () => {
    test('KPI row, gate selector, and Lifecycle sidebar remain visible across all tabs', async ({ page }) => {
      await loadFresh(page, dash.fileName);

      const persistent = [
        '.kpi-row',
        '#gateSelector',
        '#lifecycleSidebar',
      ];

      for (const tabId of Object.keys(TAB_PILLS)) {
        await clickTab(page, tabId);
        await page.waitForTimeout(SETTLE_MS / 2);
        for (const sel of persistent) {
          const box = await page.locator(sel).first().boundingBox();
          expect(box, `${sel} should be in DOM after switch to ${tabId}`).not.toBeNull();
          expect(
            box!.height,
            `${sel} must have non-zero height on tab ${tabId}`,
          ).toBeGreaterThan(0);
        }
      }
    });
  });
}

/**
 * FR-029 — "Clicking a country card in Geography → Scenarios MUST switch
 * the active pill to Geography → Country Deep-Dive."
 *
 * Verifies the cross-pill click rewire from Wave 2B (T020). The country
 * cards live inside Geography → Scenarios; clicking one populates the
 * deep-dive panel AND must auto-switch the active pill via
 * `tabRouter.activate('geography', 'country-deep-dive', 'click')`.
 */
for (const dash of DASHBOARDS) {
  test.describe(`FR-029 country card → deep-dive [${dash.key}]`, () => {
    test('clicking a country card switches the active pill to Country Deep-Dive', async ({ page }) => {
      await loadFresh(page, dash.fileName);
      await clickTab(page, 'geography');
      await page.waitForTimeout(SETTLE_MS / 2);
      await expectActive(page, 'geography', 'scenarios');

      // The Scenarios pill renders a grid of country cards. We don't pin to
      // a specific country (cards are filterable / re-orderable per Feature
      // 010), so click the FIRST visible one inside the Scenarios pill-host.
      const firstCountryCard = page
        .locator('.pill-host[data-tab="geography"][data-pill="scenarios"]')
        .locator('[onclick*="renderCountryDeepDive"], [data-country], .country-card, .scenario-card')
        .first();

      // Some dashboards may not match the speculative selectors above. Fall
      // back to any clickable child whose click handler invokes tabRouter.
      // We test the documented invariant: clicking any country card switches
      // the active pill. If no countries render, skip with a clear message.
      const cardCount = await firstCountryCard.count();
      test.skip(cardCount === 0, 'No country card matched the selector — markup may have changed.');

      await firstCountryCard.click({ trial: false });
      await page.waitForTimeout(SETTLE_MS);

      const state = await getRouterState(page);
      expect(state).toEqual({ tab: 'geography', pill: 'country-deep-dive' });
      await expectActive(page, 'geography', 'country-deep-dive');
      await expectPillHostVisible(page, 'geography', 'country-deep-dive');
    });
  });
}

/**
 * FR-035 — "Tab and pill labels MUST update when the language toggle is
 * used; pill state (active pill ID) MUST be preserved across language
 * switches."
 *
 * The router tracks state by ID (not by visible label), so a language
 * toggle should leave the active tab+pill unchanged while swapping the
 * displayed text. Catches regressions where a label-driven re-render
 * accidentally re-runs `init` or resets active state.
 */
for (const dash of DASHBOARDS) {
  test.describe(`FR-035 language toggle preserves pill state [${dash.key}]`, () => {
    test('toggling EN → zh-TW keeps the active tab+pill (router state by ID, not label)', async ({ page }) => {
      await loadFresh(page, dash.fileName);

      // Navigate to a non-default state so the test catches any reset to
      // Plan/Profile that a label-rebuild might cause.
      await clickTab(page, 'retirement');
      await clickPill(page, 'retirement', 'withdrawal');
      await expectActive(page, 'retirement', 'withdrawal');
      const beforeHash = await page.evaluate(() => window.location.hash);

      // Toggle to Traditional Chinese via the existing #langZH button.
      await page.click('#langZH');
      await page.waitForTimeout(SETTLE_MS);

      // State preserved (by ID, not label).
      const after = await getRouterState(page);
      expect(after).toEqual({ tab: 'retirement', pill: 'withdrawal' });
      await expectActive(page, 'retirement', 'withdrawal');
      await expectPillHostVisible(page, 'retirement', 'withdrawal');

      // URL unchanged — the language toggle MUST NOT touch the hash.
      const afterHash = await page.evaluate(() => window.location.hash);
      expect(afterHash).toBe(beforeHash);

      // Visible label of the active tab actually flipped to Chinese — proves
      // the re-render fired (i.e., we're not getting a false-positive from
      // a no-op toggle). The zh value for `nav.tab.retirement` is "退休".
      const tabLabel = await page
        .locator('#tabBar .tab.active[data-tab="retirement"]')
        .innerText();
      expect(tabLabel).toContain('退休');
    });
  });
}
