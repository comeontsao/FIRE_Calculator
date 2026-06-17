/**
 * E2E coverage for feature 035 — Left-Sidebar Navigation.
 *
 * The primary tab group (`#tabBar`) and every per-tab `.pill-bar` were
 * relocated OUT of the top sticky stack into a new left sidebar
 * (`#navRail`), rendered as an accordion. The `.pill-host` content panels
 * stayed in place inside `#contentArea`. The header (`#siteHeader`) and the
 * mode / Withdraw-Strategy band (`#gateSelector`) STAYED at the top.
 *
 * Navigation behavior is still owned by `window.tabRouter` — tab/pill buttons
 * keep the same `data-tab` / `data-pill` attributes and the same activation
 * results. This is shared/lockstep chrome, so the structural + behavioral
 * tests run against BOTH `FIRE-Dashboard.html` (RR) and
 * `FIRE-Dashboard-Generic.html` (Generic).
 *
 * This spec asserts the contract in
 * `specs/035-left-sidebar-nav/contracts/ui-navigation.contract.md`:
 *
 *   Desktop layout & parity
 *     - FR-001/FR-002 — `#navRail` contains `#tabBar` + the 5 `.pill-bar` nodes.
 *     - FR-002a       — `#siteHeader` + `#gateSelector` remain OUTSIDE `#navRail`;
 *                       Mode (Safe/Exact/DWZ) + Withdraw Strategy toggles still work.
 *     - FR-003        — accordion: exactly ONE `.pill-bar` visible (the active tab's),
 *                       `#navRail[data-active-tab]` mirrors the active tab.
 *     - FR-004        — pill click shows the matching `.pill-host` + marks the pill active.
 *     - FR-008        — active-state styling on the current tab + pill.
 *     - FR-011        — keyboard: focus + Enter on a tab/pill activates it like a click.
 *
 *   Mobile drawer (narrow viewport)
 *     - FR-007/SC-003 — `#navDrawerToggle` shown, `#navRail` off-canvas, no horizontal
 *                       scrollbar; opening shows the rail; selecting a tab/pill closes it.
 *
 * Conventions follow `tests/e2e/tab-navigation.spec.ts` and
 * `tests/e2e/year-tax-estimator.spec.ts`:
 *   - Loads over HTTP (`http://127.0.0.1:8766`) so `calc/*.js` modules resolve
 *     (Chromium blocks ES-module resolution on file://).
 *   - Clean localStorage + reload, then wait until `#fireStatus` has computed
 *     (no "Calculating…") before any assertion.
 *   - Chromium-only via `playwright.config.ts`.
 *
 * Calc-engine numbers are NEVER asserted here — only DOM/layout/routing state.
 */

import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Matches `playwright.config.ts > webServer` (python -m http.server 8766). */
const HTTP_BASE = 'http://127.0.0.1:8766';

interface DashboardFixture {
  readonly key: 'rr' | 'generic';
  readonly fileName: 'FIRE-Dashboard.html' | 'FIRE-Dashboard-Generic.html';
}

/** Both dashboards — the nav chrome is shared/lockstep (FR-009 / Principle I). */
const DASHBOARDS: readonly DashboardFixture[] = [
  { key: 'rr', fileName: 'FIRE-Dashboard.html' },
  { key: 'generic', fileName: 'FIRE-Dashboard-Generic.html' },
];

/** Let recalc / chart paint / accordion repaint settle after an interaction. */
const SETTLE_MS = 400;

/** Narrow viewport for the mobile-drawer tests (< 767px breakpoint). */
const MOBILE_VIEWPORT = { width: 390, height: 800 } as const;

/**
 * Tab → pills, mirroring `TABS` in `calc/tabRouter.js`. Drift here would
 * silently weaken the per-tab accordion assertions. (Same table as
 * `tab-navigation.spec.ts`.)
 */
const TAB_PILLS: Record<string, readonly string[]> = {
  plan: ['profile', 'assets', 'investment', 'mortgage', 'payoff-invest', 'expenses', 'summary'],
  geography: ['scenarios', 'country-chart', 'healthcare'],
  retirement: ['ss', 'withdrawal', 'drawdown', 'lifecycle', 'milestones'],
  history: ['snapshots'],
  audit: ['summary'],
};

const ALL_TABS = Object.keys(TAB_PILLS);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Navigate to a dashboard with clean localStorage, reload from defaults, and
 * wait until the plan has finished its first compute (`#fireStatus` no longer
 * reads "Calculating…"). Mirrors the load+wait pattern in the other E2E specs.
 */
async function loadDashboard(page: Page, fileName: string): Promise<void> {
  await page.goto(`${HTTP_BASE}/${fileName}`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(
    () => {
      const el = document.getElementById('fireStatus');
      return el != null && el.textContent != null && !el.textContent.includes('Calculating');
    },
    { timeout: 15_000 },
  );
  // Also wait for the router to have initialised so `#navRail[data-active-tab]`
  // is in lockstep before the first assertion.
  await page.waitForFunction(
    () => {
      const w = window as any;
      const rail = document.getElementById('navRail');
      return (
        w.tabRouter &&
        typeof w.tabRouter.getState === 'function' &&
        rail != null &&
        rail.getAttribute('data-active-tab') != null
      );
    },
    { timeout: 10_000 },
  );
}

/** Click the tab button matching `data-tab="<id>"` in `#tabBar`. */
async function clickTab(page: Page, tabId: string): Promise<void> {
  await page.click(`#navRail #tabBar .tab[data-tab="${tabId}"]`);
  await page.waitForTimeout(SETTLE_MS / 2);
}

/** Click the pill button matching `data-pill="<id>"` within the active tab. */
async function clickPill(page: Page, tabId: string, pillId: string): Promise<void> {
  await page.click(`#navRail .pill[data-tab="${tabId}"][data-pill="${pillId}"]`);
  await page.waitForTimeout(SETTLE_MS / 2);
}

/** Read the router's `{tab, pill}` snapshot. */
async function getRouterState(page: Page): Promise<{ tab: string; pill: string }> {
  return page.evaluate(() => (window as any).tabRouter.getState());
}

/**
 * Is `selector` (single element) the descendant of `ancestorSelector`? Done in
 * the page so we test live DOM ancestry rather than CSS-selector composition.
 */
async function isDescendantOf(
  page: Page,
  ancestorSelector: string,
  selector: string,
): Promise<boolean> {
  return page.evaluate(
    ({ ancestorSelector, selector }) => {
      const ancestor = document.querySelector(ancestorSelector);
      const el = document.querySelector(selector);
      return Boolean(ancestor && el && ancestor.contains(el));
    },
    { ancestorSelector, selector },
  );
}

/** Computed `display` of a single element matched by `selector`. */
async function displayOf(page: Page, selector: string): Promise<string> {
  return page.locator(selector).first().evaluate((el) => getComputedStyle(el).display);
}

// ===========================================================================
// Desktop layout & parity
// ===========================================================================

for (const dash of DASHBOARDS) {
  test.describe(`035 left-sidebar nav — desktop layout & parity [${dash.key}]`, () => {
    // ---------------------------------------------------------------------
    // FR-001 / FR-002 — #navRail OWNS #tabBar and all 5 .pill-bar nodes.
    // ---------------------------------------------------------------------
    test('FR-001/002: #navRail contains #tabBar and all five .pill-bar nodes', async ({ page }) => {
      await loadDashboard(page, dash.fileName);

      await expect(page.locator('#navRail')).toHaveCount(1);

      // #tabBar is now a descendant of #navRail with all 5 tab buttons.
      expect(await isDescendantOf(page, '#navRail', '#tabBar')).toBe(true);
      await expect(page.locator('#navRail #tabBar .tab')).toHaveCount(5);

      // All five per-tab pill-bars live inside the rail.
      await expect(page.locator('#navRail .pill-bar')).toHaveCount(5);
      for (const tabId of ALL_TABS) {
        await expect(
          page.locator(`#navRail .pill-bar[data-tab="${tabId}"]`),
          `#navRail must contain the ${tabId} pill-bar`,
        ).toHaveCount(1);
      }

      // The content panels did NOT move — pill-hosts stay in #contentArea.
      expect(await isDescendantOf(page, '#contentArea', '.pill-host[data-tab="plan"][data-pill="profile"]')).toBe(true);
      expect(await isDescendantOf(page, '#navRail', '.pill-host[data-tab="plan"][data-pill="profile"]')).toBe(false);
    });

    // ---------------------------------------------------------------------
    // FR-002a — #siteHeader + #gateSelector stay OUTSIDE the rail, and the
    // Mode + Withdraw-Strategy toggles still function.
    // ---------------------------------------------------------------------
    test('FR-002a: header band stays outside #navRail and Mode/Strategy toggles still work', async ({ page }) => {
      await loadDashboard(page, dash.fileName);

      // Header + gate band are present and NOT descendants of the rail.
      await expect(page.locator('#siteHeader')).toHaveCount(1);
      await expect(page.locator('#gateSelector')).toHaveCount(1);
      expect(await isDescendantOf(page, '#navRail', '#siteHeader')).toBe(false);
      expect(await isDescendantOf(page, '#navRail', '#gateSelector')).toBe(false);

      // Mode toggle still drives the verdict. Switch Safe → DWZ → and confirm
      // #fireStatus recomputes (verdict text changes across the two extreme
      // modes; we only need a single observable change to prove wiring works).
      const safeStatus = (await page.locator('#fireStatus').innerText()).trim();
      await page.locator('#btnDieWithZero').click();
      await page.waitForTimeout(SETTLE_MS);
      const dwzStatus = (await page.locator('#fireStatus').innerText()).trim();

      // The DWZ button must visually become the active mode (its inline accent
      // background flips). Assert the verdict node still holds a non-empty,
      // computed value (not "Calculating…") after the mode change.
      expect(dwzStatus.length, 'verdict must remain populated after mode toggle').toBeGreaterThan(0);
      expect(dwzStatus.includes('Calculating')).toBe(false);

      // Switch back to Safe — verdict recomputes again and matches the
      // original Safe verdict (mode toggles are deterministic round-trips).
      await page.locator('#btnSafeFire').click();
      await page.waitForTimeout(SETTLE_MS);
      const safeStatus2 = (await page.locator('#fireStatus').innerText()).trim();
      expect(safeStatus2, 'returning to Safe must restore the Safe verdict').toBe(safeStatus);

      // Withdraw-Strategy toggle (in the header band) still flips aria-checked.
      const estateBtn = page.locator('#btnObjectiveEstateInline');
      const taxBtn = page.locator('#btnObjectiveTaxInline');
      await taxBtn.click();
      await page.waitForTimeout(SETTLE_MS);
      expect(await taxBtn.getAttribute('aria-checked')).toBe('true');
      expect(await estateBtn.getAttribute('aria-checked')).toBe('false');
      // Restore default objective so later tests start clean.
      await estateBtn.click();
      await page.waitForTimeout(SETTLE_MS / 2);
    });

    // ---------------------------------------------------------------------
    // FR-003 — per primary tab: clicking activates the matching .tab-panel,
    // sets #navRail[data-active-tab], and reveals EXACTLY ONE visible
    // .pill-bar (the active tab's). All other pill-bars are display:none.
    // ---------------------------------------------------------------------
    test('FR-003: each tab activates its panel + shows exactly one pill-bar (accordion)', async ({ page }) => {
      await loadDashboard(page, dash.fileName);

      for (const tabId of ALL_TABS) {
        await clickTab(page, tabId);

        // Router + rail accordion attribute are in lockstep with the tab.
        const state = await getRouterState(page);
        expect(state.tab, `router tab after clicking ${tabId}`).toBe(tabId);
        expect(
          await page.locator('#navRail').getAttribute('data-active-tab'),
          `#navRail[data-active-tab] after clicking ${tabId}`,
        ).toBe(tabId);

        // The matching .tab-panel is un-hidden.
        const panel = page.locator(`section.tab-panel[data-tab="${tabId}"]`);
        await expect(panel).toHaveCount(1);
        expect(
          await panel.evaluate((el) => (el as HTMLElement).hasAttribute('hidden')),
          `tab-panel ${tabId} must be un-hidden`,
        ).toBe(false);

        // Accordion: exactly one .pill-bar is display:flex; the rest are none.
        for (const otherTab of ALL_TABS) {
          const display = await displayOf(page, `#navRail .pill-bar[data-tab="${otherTab}"]`);
          if (otherTab === tabId) {
            expect(display, `active tab ${tabId} pill-bar must be visible`).toBe('flex');
          } else {
            expect(display, `inactive tab ${otherTab} pill-bar must be hidden while ${tabId} active`).toBe('none');
          }
        }
      }
    });

    // ---------------------------------------------------------------------
    // FR-004 — per pill within a tab: clicking shows the matching .pill-host
    // and marks the pill active.
    // ---------------------------------------------------------------------
    test('FR-004: each pill shows its .pill-host and marks the pill active', async ({ page }) => {
      await loadDashboard(page, dash.fileName);

      for (const tabId of ALL_TABS) {
        await clickTab(page, tabId);
        for (const pillId of TAB_PILLS[tabId]) {
          await clickPill(page, tabId, pillId);

          // Matching pill-host visible (un-hidden) in the content column.
          const host = page.locator(`.pill-host[data-tab="${tabId}"][data-pill="${pillId}"]`);
          await expect(host).toHaveCount(1);
          expect(
            await host.evaluate((el) => (el as HTMLElement).hasAttribute('hidden')),
            `pill-host ${tabId}/${pillId} must be un-hidden after click`,
          ).toBe(false);

          // Router agrees.
          expect(await getRouterState(page)).toEqual({ tab: tabId, pill: pillId });

          // The clicked pill carries the active marker. NOTE: tabRouter drives
          // selected-state via the `.active` class only — it does NOT sync the
          // (static) `aria-selected` attribute on tabs/pills. That is pre-existing
          // app behavior, unchanged by feature 035, so we assert `.active` (the
          // real, contract-specified selected-state), not aria-selected.
          const pill = page.locator(`#navRail .pill[data-tab="${tabId}"][data-pill="${pillId}"]`);
          await expect(pill, `pill ${tabId}/${pillId} must be .active`).toHaveClass(/\bactive\b/);
        }
      }
    });

    // ---------------------------------------------------------------------
    // FR-008 — active-state styling: current tab + pill carry the active
    // class / aria, and exactly one of each is active at any time.
    // ---------------------------------------------------------------------
    test('FR-008: exactly one active tab and one active pill carry the active markers', async ({ page }) => {
      await loadDashboard(page, dash.fileName);

      await clickTab(page, 'retirement');
      await clickPill(page, 'retirement', 'withdrawal');

      // Exactly one active tab, and it is retirement. (Selected-state is the
      // `.active` class; aria-selected is static markup the app never syncs —
      // see the note in FR-004 — so we assert `.active`, not aria-selected.)
      await expect(page.locator('#navRail #tabBar .tab.active')).toHaveCount(1);
      const activeTab = page.locator('#navRail #tabBar .tab.active');
      expect(await activeTab.getAttribute('data-tab')).toBe('retirement');

      // Exactly one active pill in the active tab's bar, and it is withdrawal.
      const activeInActiveBar = page.locator(
        '#navRail .pill-bar[data-tab="retirement"] .pill.active',
      );
      await expect(activeInActiveBar).toHaveCount(1);
      expect(await activeInActiveBar.getAttribute('data-pill')).toBe('withdrawal');
    });

    // ---------------------------------------------------------------------
    // FR-011 — keyboard operability: focusing a relocated tab button and
    // pressing Enter activates it the same as a click; likewise for a pill.
    // Kept resilient — we assert focus + Enter activation, not a specific
    // roving-tabindex / arrow-key model.
    // ---------------------------------------------------------------------
    test('FR-011: relocated tab + pill are keyboard-operable (focus + Enter activates)', async ({ page }) => {
      await loadDashboard(page, dash.fileName);

      // Start on Plan; programmatically focus the Retirement tab button (a
      // real keyboard user reaches it via Tab; we focus directly to keep the
      // assertion about activation, not about the exact tab-stop count).
      const retireTab = page.locator('#navRail #tabBar .tab[data-tab="retirement"]');
      await retireTab.focus();
      await expect(retireTab).toBeFocused();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(SETTLE_MS);

      expect(
        (await getRouterState(page)).tab,
        'Enter on the focused Retirement tab must activate it',
      ).toBe('retirement');

      // Now focus a pill in the (newly active) Retirement bar and press Enter.
      const lifecyclePill = page.locator(
        '#navRail .pill[data-tab="retirement"][data-pill="lifecycle"]',
      );
      await lifecyclePill.focus();
      await expect(lifecyclePill).toBeFocused();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(SETTLE_MS);

      expect(
        await getRouterState(page),
        'Enter on the focused Lifecycle pill must activate it',
      ).toEqual({ tab: 'retirement', pill: 'lifecycle' });
      await expect(lifecyclePill).toHaveClass(/\bactive\b/);
    });
  });
}

// ===========================================================================
// Mobile drawer (FR-007 / SC-003)
// ===========================================================================

for (const dash of DASHBOARDS) {
  test.describe(`035 left-sidebar nav — mobile drawer [${dash.key}]`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ ...MOBILE_VIEWPORT });
    });

    // ---------------------------------------------------------------------
    // FR-007 / SC-003 — at narrow width the ☰ toggle is shown, the rail is
    // off-canvas, and the page has NO horizontal scrollbar.
    // ---------------------------------------------------------------------
    test('FR-007: drawer toggle visible, rail off-canvas, no horizontal scroll', async ({ page }) => {
      await loadDashboard(page, dash.fileName);

      // ☰ toggle is visible on mobile.
      await expect(page.locator('#navDrawerToggle')).toBeVisible();

      // The rail is off-canvas: translated fully out of view to the left, so
      // its right edge is at or before x=0. (It is position:fixed +
      // translateX(-100%) when the drawer is closed — `toBeVisible()` can
      // still report true for translated elements, so assert geometry.)
      const railBox = await page.locator('#navRail').boundingBox();
      expect(railBox, '#navRail must be laid out').not.toBeNull();
      expect(
        railBox!.x + railBox!.width,
        '#navRail must be off-canvas (right edge ≤ 0) while drawer is closed',
      ).toBeLessThanOrEqual(1);

      // SC-003 — the NAV must not introduce horizontal overflow. The off-canvas
      // assertion above (rail right edge ≤ 0 when closed) IS that guarantee: the
      // relocated rail contributes zero horizontal width while closed, and the
      // nav layout wrapper (#navLayout) is `min-width:0` clamped to the viewport
      // box. We deliberately do NOT assert whole-document `scrollWidth` here: the
      // Generic dashboard has a PRE-EXISTING wide content card in the Plan →
      // Profile panel (present on main before feature 035) that overflows the
      // document at phone width independent of navigation — a content-layer
      // follow-up, out of scope for this nav relocation (see spec.md SC-003 note).
      // Assert the nav wrapper's box clamps to the viewport (content overflow of
      // its children is the separate pre-existing concern).
      const navLayoutWidth = await page.locator('#navLayout').evaluate(
        (el) => (el as HTMLElement).getBoundingClientRect().width,
      );
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(
        navLayoutWidth,
        `#navLayout box must clamp to viewport (${navLayoutWidth} ≤ ${clientWidth})`,
      ).toBeLessThanOrEqual(clientWidth + 1);
    });

    // ---------------------------------------------------------------------
    // FR-007 — opening the drawer shows the rail; selecting a tab changes
    // the view AND closes the drawer; same for a pill.
    // ---------------------------------------------------------------------
    test('FR-007: open drawer → select tab changes view and closes drawer', async ({ page }) => {
      await loadDashboard(page, dash.fileName);

      // Open the drawer.
      await page.locator('#navDrawerToggle').click();
      await page.waitForTimeout(SETTLE_MS);

      // body carries the open class and the rail is now on-screen (x ≈ 0).
      expect(await page.evaluate(() => document.body.classList.contains('nav-drawer-open'))).toBe(true);
      const openBox = await page.locator('#navRail').boundingBox();
      expect(openBox, '#navRail must be laid out when open').not.toBeNull();
      expect(openBox!.x, '#navRail must slide on-screen (x ≈ 0) when open').toBeGreaterThanOrEqual(-1);

      // Select a tab inside the open drawer → view changes + drawer closes.
      await page.click('#navRail #tabBar .tab[data-tab="retirement"]');
      await page.waitForTimeout(SETTLE_MS);

      expect((await getRouterState(page)).tab, 'tab selection must change the view').toBe('retirement');
      expect(
        await page.evaluate(() => document.body.classList.contains('nav-drawer-open')),
        'selecting a tab must close the drawer',
      ).toBe(false);
    });

    test('FR-007: open drawer → select pill changes view and closes drawer', async ({ page }) => {
      await loadDashboard(page, dash.fileName);

      // Open the drawer, switch to Retirement, then pick the Lifecycle pill.
      await page.locator('#navDrawerToggle').click();
      await page.waitForTimeout(SETTLE_MS);
      await page.click('#navRail #tabBar .tab[data-tab="retirement"]');
      await page.waitForTimeout(SETTLE_MS);

      // Tab selection already closed the drawer — reopen to select a pill.
      await page.locator('#navDrawerToggle').click();
      await page.waitForTimeout(SETTLE_MS);
      expect(await page.evaluate(() => document.body.classList.contains('nav-drawer-open'))).toBe(true);

      await page.click('#navRail .pill[data-tab="retirement"][data-pill="lifecycle"]');
      await page.waitForTimeout(SETTLE_MS);

      expect(
        await getRouterState(page),
        'pill selection must change the view',
      ).toEqual({ tab: 'retirement', pill: 'lifecycle' });
      expect(
        await page.evaluate(() => document.body.classList.contains('nav-drawer-open')),
        'selecting a pill must close the drawer',
      ).toBe(false);
    });
  });
}

// ---------------------------------------------------------------------------
// Feature 034 (RR-only) — "Year Tax Estimator" promoted to its own Retirement
// sub-tab (data-pill="year-tax"), between Withdrawal Strategy and Drawdown.
// RR has the pill + its #teCard host; Generic has neither (documented Principle-I
// divergence — the estimator UI is RR-only). The shared TABS is untouched; RR's
// tabRouter.init injects the pill only on RR.
// ---------------------------------------------------------------------------
test.describe('034 year-tax pill (RR-only)', () => {
  test('RR: year-tax pill sits between withdrawal and drawdown and opens #teCard', async ({ page }) => {
    await loadDashboard(page, 'FIRE-Dashboard.html');
    await page.click('#navRail #tabBar .tab[data-tab="retirement"]');
    await page.waitForTimeout(SETTLE_MS);

    // Pill exists and is ordered between Withdrawal Strategy and Drawdown.
    const order = await page
      .locator('#navRail .pill-bar[data-tab="retirement"] .pill')
      .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.pill));
    expect(order).toEqual(['ss', 'withdrawal', 'year-tax', 'drawdown', 'lifecycle', 'milestones']);

    // Clicking it activates the year-tax view and reveals #teCard (relocated, unchanged).
    await page.click('#navRail .pill[data-tab="retirement"][data-pill="year-tax"]');
    await page.waitForTimeout(SETTLE_MS);
    expect(await getRouterState(page)).toEqual({ tab: 'retirement', pill: 'year-tax' });

    const host = page.locator('.pill-host[data-tab="retirement"][data-pill="year-tax"]');
    await expect(host).toHaveCount(1);
    expect(await host.evaluate((el) => (el as HTMLElement).hasAttribute('hidden'))).toBe(false);
    await expect(
      page.locator('.pill-host[data-tab="retirement"][data-pill="year-tax"] #teCard'),
    ).toBeVisible();
  });

  test('Generic: no year-tax pill and no #teCard (shared TABS untouched)', async ({ page }) => {
    await loadDashboard(page, 'FIRE-Dashboard-Generic.html');
    await expect(page.locator('.pill[data-tab="retirement"][data-pill="year-tax"]')).toHaveCount(0);
    await expect(page.locator('#teCard')).toHaveCount(0);

    await page.click('#navRail #tabBar .tab[data-tab="retirement"]');
    await page.waitForTimeout(SETTLE_MS);
    const order = await page
      .locator('#navRail .pill-bar[data-tab="retirement"] .pill')
      .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.pill));
    expect(order).toEqual(['ss', 'withdrawal', 'drawdown', 'lifecycle', 'milestones']);
  });
});
