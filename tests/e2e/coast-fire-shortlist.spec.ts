/**
 * E2E coverage for feature 038 — per-country Coast FIRE milestones + ⭐ shortlist.
 *
 * Two user-visible pieces:
 *   1. A ⭐ pin on every country card in Geography → Scenarios. Pinned countries
 *      become the shortlist; the Milestones timeline then draws ONLY those.
 *      An empty shortlist means "no shortlist" and shows every country, so the
 *      pre-038 behaviour is what an unpinned dashboard still does.
 *   2. Each shortlisted country gets a Coast FIRE marker beside its FIRE marker:
 *      the age you could retire there if you STOPPED contributing today.
 *
 * The invariant worth guarding hardest (and the reason this feature was rebuilt
 * mid-implementation): a Coast marker can never sit EARLIER than its own
 * country's FIRE marker. A FIRE age already assumes contributions continue, so
 * freezing them can only push retirement later. If a Coast marker ever appears
 * above its FIRE marker, the growth model has been wired to the wrong balances.
 *
 * Deliberate seed divergence (see CLAUDE.md — personal content lives in RR only):
 *   - RR ships pre-pinned with six countries.
 *   - Generic ships with nothing pinned.
 * Everything else is lockstep, so the shared blocks run against both files.
 *
 * Conventions follow `tests/e2e/retirement-status.spec.ts`:
 *   - Loads over HTTP (`http://127.0.0.1:8766`) so `calc/*.js` resolve
 *     (Chromium blocks classic-script resolution on file://).
 *   - Clean localStorage + reload, then wait for `#fireStatus` to compute.
 *   - Chromium-only via `playwright.config.ts`.
 */

import { test, expect, type Page } from '@playwright/test';

// Each case cold-boots a ~7000-line dashboard (~3s) and forces one or more full
// recalcs (~1s each), which brushes the 45s global budget in playwright.config.
test.describe.configure({ timeout: 90_000 });

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Matches `playwright.config.ts > webServer` (python -m http.server 8766). */
const HTTP_BASE = 'http://127.0.0.1:8766';

const RR_FILE = 'FIRE-Dashboard.html';
const GENERIC_FILE = 'FIRE-Dashboard-Generic.html';

/** Let recalc / re-render settle after a gesture. */
const SETTLE_MS = 700;

/** RR's seeded shortlist — the six countries actually under consideration. */
const RR_SEED = ['taiwan', 'china', 'japan', 'vietnam', 'thailand', 'philippines'];

interface DashboardFixture {
  readonly key: 'rr' | 'generic';
  readonly fileName: string;
  /** localStorage key holding the shortlist for this file. */
  readonly storageKey: string;
  /** Shortlist a cold-booted profile starts with. */
  readonly seed: readonly string[];
  /**
   * Taxable-stock input. The one money field whose id diverges between the two
   * builds (RR names people, Generic numbers them).
   */
  readonly stocksSel: string;
}

const DASHBOARDS: readonly DashboardFixture[] = [
  {
    key: 'rr',
    fileName: RR_FILE,
    storageKey: 'fire_dashboard_shortlist',
    seed: RR_SEED,
    stocksSel: 'rogerStocks',
  },
  {
    key: 'generic',
    fileName: GENERIC_FILE,
    storageKey: 'fire_dashboard_generic_shortlist',
    seed: [],
    stocksSel: 'person1Stocks',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function waitForCompute(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const el = document.getElementById('fireStatus');
      return el != null && el.textContent != null && !el.textContent.includes('Calculating');
    },
    undefined,
    { timeout: 15_000 },
  );
}

/** Navigate with clean storage so the shortlist boots from its seed. */
async function loadDashboard(page: Page, fileName: string): Promise<void> {
  await page.goto(`${HTTP_BASE}/${fileName}`);
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await waitForCompute(page);
}

/** Reload IN PLACE (keeps storage) — used for persistence checks. */
async function reloadInPlace(page: Page): Promise<void> {
  await page.reload();
  await waitForCompute(page);
}

/**
 * The live in-page shortlist array.
 *
 * NOTE the string-form evaluate, here and below. `shortlistedScenarios` is a
 * top-level `let` in a classic <script>, and top-level let/const create LEXICAL
 * globals that are NOT properties of `window` — `window.shortlistedScenarios` is
 * undefined. A string expression is evaluated in global scope and resolves the
 * bare identifier correctly. (`scenarios` is a top-level `const`, same story.
 * Function declarations like `recalcAll` DO land on `window`, but bare names
 * work for those too, so everything here uses one consistent form.)
 */
async function getShortlist(page: Page): Promise<string[]> {
  return page.evaluate('shortlistedScenarios') as Promise<string[]>;
}

/** One text line per rendered timeline milestone, in render (year) order. */
async function timelineItems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const host = document.getElementById('timeline');
    if (!host) return [];
    return [...host.children]
      .map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  });
}

/**
 * Index of the first timeline item matching a predicate, or -1. Timeline order
 * IS chronological order (renderTimeline sorts by year before appending), so
 * comparing indices compares dates.
 */
function indexOfItem(items: string[], test: (s: string) => boolean): number {
  return items.findIndex(test);
}

/** Localised country name exactly as the timeline renders it, e.g. "Taiwan". */
async function countryLabel(page: Page, id: string): Promise<string> {
  const expr = `(() => {
    const key = 'country.' + ${JSON.stringify(id)};
    const translated = t(key);
    if (translated !== key) return translated;
    const s = scenarios.find((x) => x.id === ${JSON.stringify(id)});
    return s ? s.name : ${JSON.stringify(id)};
  })()`;
  return page.evaluate(expr) as Promise<string>;
}

/** Set the shortlist directly, then force a re-render — faster than 12 clicks. */
async function setShortlist(page: Page, ids: string[]): Promise<void> {
  await page.evaluate(
    `(() => { shortlistedScenarios = ${JSON.stringify(ids)}; saveShortlist(); recalcAll(); })()`,
  );
  await page.waitForTimeout(SETTLE_MS);
}

/**
 * Click a ⭐ pin. The star is a small absolutely-positioned target inside a card
 * that may sit under the sticky header, so scroll it into view first — otherwise
 * Playwright's actionability hit-test can stall until the test times out.
 */
async function clickPin(page: Page, selector: string): Promise<void> {
  const pin = page.locator(selector).first();
  await pin.scrollIntoViewIfNeeded();
  await pin.click();
  await page.waitForTimeout(SETTLE_MS);
}

/**
 * Bring the country grid on screen. Both dashboards cold-boot to plan/profile,
 * so `.scenario-card` exists but is inside a hidden pill-host — clicking a pin
 * without this stalls on Playwright's visibility check until the test times out.
 */
async function openGeography(page: Page): Promise<void> {
  await page.evaluate("tabRouter.activate('geography', 'scenarios', 'click')");
  await page.waitForTimeout(SETTLE_MS);
  await page.locator('.scenario-card__pin').first().waitFor({ state: 'visible' });
}

/**
 * Put money in the plan so countries are actually reachable.
 *
 * Generic's factory profile holds $0, so every country sits beyond the 40-year
 * horizon and NO markers render at all — a marker test against stock defaults
 * would assert on an empty timeline. Funding both builds identically also keeps
 * these tests independent of whatever RR's personal numbers happen to be.
 */
async function fundProfile(page: Page, dash: DashboardFixture): Promise<void> {
  await page.evaluate(
    ([stocksId]) => {
      const set = (id: string, v: number): void => {
        const el = document.getElementById(id) as HTMLInputElement | null;
        if (!el) throw new Error(`fundProfile: missing input #${id}`);
        el.value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      set(stocksId, 800_000);
      set('cashSavings', 100_000);
    },
    [dash.stocksSel],
  );
  await page.waitForTimeout(SETTLE_MS);
}

/** The current primary FIRE target (a top-level `let`, so not on `window`). */
async function getPrimaryTarget(page: Page): Promise<string> {
  return page.evaluate('selectedScenario') as Promise<string>;
}

// ---------------------------------------------------------------------------
// Shared behaviour — both dashboards
// ---------------------------------------------------------------------------

for (const dash of DASHBOARDS) {
  test.describe(`feature 038 — ${dash.key}`, () => {
    test('every country card carries a ⭐ pin', async ({ page }) => {
      await loadDashboard(page, dash.fileName);
      const cards = await page.locator('.scenario-card').count();
      const pins = await page.locator('.scenario-card__pin').count();
      expect(cards).toBeGreaterThan(0);
      expect(pins).toBe(cards);
    });

    test(`cold boot seeds the shortlist with ${dash.seed.length} countries`, async ({ page }) => {
      await loadDashboard(page, dash.fileName);
      expect((await getShortlist(page)).sort()).toEqual([...dash.seed].sort());
      // The lit stars must agree with the state array.
      expect(await page.locator('.scenario-card__pin--on').count()).toBe(dash.seed.length);
    });

    test('pinning is additive, persists across reload, and does NOT change the primary target', async ({ page }) => {
      await loadDashboard(page, dash.fileName);
      await openGeography(page);
      const targetBefore = await getPrimaryTarget(page);

      // Pin a country that is definitely not already pinned on either build.
      await setShortlist(page, []);
      await clickPin(page, '.scenario-card__pin');

      const afterClick = await getShortlist(page);
      expect(afterClick).toHaveLength(1);

      // Clicking the star must not hijack the card's own click handler.
      const targetAfter = await getPrimaryTarget(page);
      expect(targetAfter).toBe(targetBefore);

      await reloadInPlace(page);
      expect(await getShortlist(page)).toEqual(afterClick);
    });

    test('clicking a lit star unpins it', async ({ page }) => {
      await loadDashboard(page, dash.fileName);
      await openGeography(page);
      await setShortlist(page, ['taiwan', 'japan']);
      expect(await page.locator('.scenario-card__pin--on').count()).toBe(2);

      await clickPin(page, '.scenario-card__pin--on');
      expect(await getShortlist(page)).toHaveLength(1);
    });

    test('the shortlist narrows the timeline to exactly the pinned countries', async ({ page }) => {
      await loadDashboard(page, dash.fileName);
      await fundProfile(page, dash);
      await setShortlist(page, ['taiwan', 'japan']);

      const items = await timelineItems(page);
      const taiwan = await countryLabel(page, 'taiwan');
      const japan = await countryLabel(page, 'japan');
      const thailand = await countryLabel(page, 'thailand');

      expect(items.some((s) => s.includes(taiwan))).toBe(true);
      expect(items.some((s) => s.includes(japan))).toBe(true);
      expect(items.some((s) => s.includes(thailand))).toBe(false);
    });

    test('an EMPTY shortlist falls back to showing every country', async ({ page }) => {
      await loadDashboard(page, dash.fileName);
      await fundProfile(page, dash);
      await setShortlist(page, ['taiwan']);
      const narrowed = await timelineItems(page);

      await setShortlist(page, []);
      const all = await timelineItems(page);

      expect(all.length).toBeGreaterThan(narrowed.length);
      const thailand = await countryLabel(page, 'thailand');
      expect(all.some((s) => s.includes(thailand))).toBe(true);
    });

    test('each shortlisted country gets a Coast FIRE marker', async ({ page }) => {
      await loadDashboard(page, dash.fileName);
      await fundProfile(page, dash);
      await setShortlist(page, ['taiwan', 'japan']);

      const items = await timelineItems(page);
      for (const id of ['taiwan', 'japan']) {
        const name = await countryLabel(page, id);
        const coast = items.filter((s) => s.includes(`${name} Coast FIRE`));
        expect(coast, `expected exactly one Coast marker for ${name}`).toHaveLength(1);
      }
    });

    test('INVARIANT: a Coast marker never lands earlier than its own FIRE marker', async ({ page }) => {
      await loadDashboard(page, dash.fileName);
      await fundProfile(page, dash);
      await setShortlist(page, ['taiwan', 'japan', 'thailand', 'vietnam']);

      const items = await timelineItems(page);
      for (const id of ['taiwan', 'japan', 'thailand', 'vietnam']) {
        const name = await countryLabel(page, id);
        const coastIdx = indexOfItem(items, (s) => s.includes(`${name} Coast FIRE`));
        const fireIdx = indexOfItem(items, (s) => s.includes(`FIRE (${name})`));
        if (coastIdx === -1 || fireIdx === -1) continue; // country unreachable in this plan
        expect(
          coastIdx,
          `${name}: Coast marker precedes its FIRE marker — the frozen-savings path ` +
            'cannot beat the still-contributing path',
        ).toBeGreaterThanOrEqual(fireIdx);
      }
    });

    test('the age-60 Savings-card Coast badge is untouched by the shortlist', async ({ page }) => {
      await loadDashboard(page, dash.fileName);
      await setShortlist(page, ['taiwan']);
      const withTaiwan = (await page.locator('#coastFireNote').textContent()) ?? '';

      await setShortlist(page, ['japan', 'vietnam']);
      const withOthers = (await page.locator('#coastFireNote').textContent()) ?? '';

      // The badge follows the PRIMARY target, which no pin gesture changed.
      expect(withOthers).toBe(withTaiwan);
      expect(withTaiwan).not.toContain('Calculating');
    });

    test('corrupt shortlist storage degrades to the seed instead of throwing', async ({ page }) => {
      await loadDashboard(page, dash.fileName);
      await page.evaluate((key) => localStorage.setItem(key, '{not json'), dash.storageKey);
      await reloadInPlace(page);
      expect((await getShortlist(page)).sort()).toEqual([...dash.seed].sort());
    });

    test('unknown country ids in storage are dropped', async ({ page }) => {
      await loadDashboard(page, dash.fileName);
      await page.evaluate(
        (key) => localStorage.setItem(key, JSON.stringify(['taiwan', 'atlantis'])),
        dash.storageKey,
      );
      await reloadInPlace(page);
      expect(await getShortlist(page)).toEqual(['taiwan']);
    });

  });
}

// ---------------------------------------------------------------------------
// Generic-only — 🔄 Reset to Defaults exists on Generic ONLY. RR ships the
// `btn.resetDefaults` translation string but no such function or button, so
// there is nothing to reset there.
// ---------------------------------------------------------------------------

test.describe('feature 038 — reset behaviour (Generic only)', () => {
  test('🔄 Reset to Defaults clears the plan but KEEPS the pins', async ({ page }) => {
    await loadDashboard(page, GENERIC_FILE);
    await setShortlist(page, ['japan', 'vietnam']);

    page.on('dialog', (d) => void d.accept());
    // resetToDefaults() ends in location.reload(), so the evaluate is racing a
    // navigation — fire and forget, then wait for the fresh page to compute.
    await page.evaluate('resetToDefaults()').catch(() => undefined);
    await waitForCompute(page);

    expect(await getShortlist(page)).toEqual(['japan', 'vietnam']);
  });
});

// ---------------------------------------------------------------------------
// RR-only — the seeded shortlist is personal content and must NOT reach Generic
// ---------------------------------------------------------------------------

test.describe('feature 038 — seed divergence', () => {
  test('RR seeds six countries; Generic seeds none', async ({ page }) => {
    await loadDashboard(page, RR_FILE);
    expect((await getShortlist(page)).sort()).toEqual([...RR_SEED].sort());

    await loadDashboard(page, GENERIC_FILE);
    expect(await getShortlist(page)).toEqual([]);
  });

  test('RR cold boot draws a Coast marker for each of the six seeded countries', async ({ page }) => {
    await loadDashboard(page, RR_FILE);
    const items = await timelineItems(page);
    for (const id of RR_SEED) {
      const name = await countryLabel(page, id);
      expect(
        items.some((s) => s.includes(`${name} Coast FIRE`)),
        `no Coast marker for seeded country ${name}`,
      ).toBe(true);
    }
  });
});
