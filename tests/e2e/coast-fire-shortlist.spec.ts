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
 * Timeline rows as {year, amount} pairs, in render order. `amount` is the
 * trailing dollar figure on the card, or null where a card carries none.
 */
async function timelineYearAmounts(page: Page): Promise<Array<{ year: number; amount: number | null }>> {
  const items = await timelineItems(page);
  return items.map((txt) => {
    const year = /^(\d{4})/.exec(txt);
    const amount = /\$([\d,]+)\s*$/.exec(txt);
    return {
      year: year ? Number(year[1]) : Number.NaN,
      amount: amount ? Number(amount[1].replace(/,/g, '')) : null,
    };
  });
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
async function fundProfile(page: Page, dash: DashboardFixture, stocks = 800_000, cash = 100_000): Promise<void> {
  await page.evaluate(
    ([stocksId, stocksVal, cashVal]) => {
      const set = (id: string, v: number): void => {
        const el = document.getElementById(id) as HTMLInputElement | null;
        if (!el) throw new Error(`fundProfile: missing input #${id}`);
        el.value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      set(stocksId as string, stocksVal as number);
      set('cashSavings', cashVal as number);
    },
    [dash.stocksSel, stocks, cash] as [string, number, number],
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
        const coast = items.find((s) => s.includes(`${name} Coast FIRE`));
        const fire = items.find((s) => s.includes(`FIRE (${name})`));
        if (!coast || !fire) continue; // country unreachable in this plan

        // Compare YEARS, not DOM position. Within a single year cards are
        // ordered by dollar figure, and a Coast marker's figure is normally the
        // smaller of the pair — so a same-year pair legitimately renders Coast
        // first. That is presentation, not a violation of the invariant.
        const coastYear = Number(/^(\d{4})/.exec(coast)?.[1]);
        const fireYear = Number(/^(\d{4})/.exec(fire)?.[1]);
        expect(Number.isFinite(coastYear) && Number.isFinite(fireYear)).toBe(true);
        expect(
          coastYear,
          `${name}: Coast (${coastYear}) precedes its FIRE marker (${fireYear}) — ` +
            'the frozen-savings path cannot beat the still-contributing path',
        ).toBeGreaterThanOrEqual(fireYear);
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
// Timeline ordering. The panel is a net-worth LADDER, not a chronology: the
// money cards sort by dollar figure ascending so it reads as "the next number I
// have to hit, then the next". Years deliberately do NOT ascend — a cheap
// country can want less money in a later year than an expensive one wants
// sooner. Event cards (college = a cost, Social Security = an income stream)
// carry figures that are not net-worth targets, so they are slotted by YEAR
// instead of laddered, and "Now" is pinned to the top as the reference point.
// ---------------------------------------------------------------------------

/** Language-independent markers for the two event card types. */
const EVENT_GLYPHS = ['\u{1F393}', '\u{1F3DB}']; // graduation cap, classical building

function isEventCard(text: string): boolean {
  return EVENT_GLYPHS.some((g) => text.includes(g));
}

for (const dash of DASHBOARDS) {
  test.describe(`timeline ordering — ${dash.key}`, () => {
    test('"Now" anchors the top and the money cards ladder by amount', async ({ page }) => {
      await loadDashboard(page, dash.fileName);
      await fundProfile(page, dash);
      await setShortlist(page, ['taiwan', 'japan', 'thailand', 'vietnam', 'philippines', 'china']);

      const items = await timelineItems(page);
      const rows = await timelineYearAmounts(page);
      expect(rows.length).toBeGreaterThan(5);

      // The starting point is where you stand, not a target — it stays first
      // even when a country's target sits below today's net worth.
      expect(items[0], '"Now" must anchor the top of the ladder').toContain('Now');

      // Money cards ascend by figure. Skip index 0 (the anchor) and every event.
      let prev: number | null = null;
      for (let i = 1; i < rows.length; i++) {
        if (isEventCard(items[i])) continue;
        const amount = rows[i].amount;
        if (amount === null) continue;
        if (prev !== null) {
          expect(
            amount,
            `money cards must ascend by figure: ${prev} then ${amount} (${items[i].slice(0, 50)})`,
          ).toBeGreaterThanOrEqual(prev);
        }
        prev = amount;
      }
      expect(prev, 'expected at least one money card after the anchor').not.toBeNull();
    });

    test('event cards sit in front of the first money card at or after their year', async ({ page }) => {
      await loadDashboard(page, dash.fileName);
      await fundProfile(page, dash);
      await setShortlist(page, ['taiwan', 'japan', 'thailand', 'vietnam', 'philippines', 'china']);

      const items = await timelineItems(page);
      const rows = await timelineYearAmounts(page);

      for (let i = 0; i < items.length; i++) {
        if (!isEventCard(items[i])) continue;
        const eventYear = rows[i].year;

        // Nothing BEFORE this event may be a money card dated at/after it.
        // Index 0 is the "Now" anchor, which is exempt by construction.
        for (let j = 1; j < i; j++) {
          if (isEventCard(items[j])) continue;
          expect(
            rows[j].year,
            `${items[i].slice(0, 40)} (${eventYear}) should sit before ` +
              `${items[j].slice(0, 40)} (${rows[j].year})`,
          ).toBeLessThan(eventYear);
        }

        // And the next money card after it, if any, is dated at/after the event.
        const offset = items.slice(i + 1).findIndex((txt) => !isEventCard(txt));
        if (offset !== -1) {
          expect(rows[i + 1 + offset].year).toBeGreaterThanOrEqual(eventYear);
        }
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Engine provenance. The panel MUST date its cards off projectFullLifecycle —
// the same engine the Lifecycle chart draws — and not off a private curve.
//
// It previously used projectGrowth(), which never learned about the rothIra
// pool added in feature 032: it started $59,021 low and missed $14,000/yr of
// contributions, so the panel's own "Now" card disagreed with the curve dating
// every other card. That drift was silent for three features. These tests make
// it loud.
// ---------------------------------------------------------------------------

for (const dash of DASHBOARDS) {
  test.describe(`timeline engine provenance — ${dash.key}`, () => {
    test('the "Now" card agrees with the net-worth KPI', async ({ page }) => {
      // NOTE: this is a consistency check, NOT a provenance check. The Now card
      // reads calcNetWorth() directly and never touches the projection, so it
      // cannot detect which curve dates the other cards. The test below does.
      await loadDashboard(page, dash.fileName);
      await fundProfile(page, dash);

      const items = await timelineItems(page);
      const rows = await timelineYearAmounts(page);
      expect(items[0]).toContain('Now');

      const kpi = await page.evaluate(() => {
        const el = document.getElementById('totalNetWorth');
        return el ? Number((el.textContent || '').replace(/[^0-9.-]/g, '')) : null;
      });
      expect(rows[0].amount).toBe(kpi);
    });

    test('the $1M date does not move when the primary country changes', async ({ page }) => {
      // This is how the "curve must keep working" invariant is observable from
      // the OUTSIDE. If the dating curve retires at the selected country's FIRE
      // age it bends downward from that age, so picking a cheap country (early
      // FIRE) can push the curve's peak below $1M and the milestone vanishes
      // entirely. A keep-working curve is country-independent by construction.
      //
      // Checking the panel's own output, not a curve computed alongside it —
      // an earlier version of this test recomputed the curve itself and passed
      // happily with the bug reintroduced.
      await loadDashboard(page, dash.fileName);
      await fundProfile(page, dash, 300_000, 50_000);

      const readMillionYear = async (): Promise<number | null> => {
        const rows = await timelineYearAmounts(page);
        const i = rows.findIndex((r) => r.amount === 1_000_000);
        return i === -1 ? null : rows[i].year;
      };

      const setPrimary = async (id: string): Promise<void> => {
        await page.evaluate(`(() => { selectedScenario = ${JSON.stringify(id)}; recalcAll(); })()`);
        await page.waitForTimeout(SETTLE_MS);
      };

      // Cheapest country in the table => earliest FIRE age => earliest bend.
      await setPrimary('vietnam');
      const withCheap = await readMillionYear();
      await setPrimary('us');
      const withExpensive = await readMillionYear();

      expect(withCheap, 'the $1M milestone vanished when a cheap country was primary').not.toBeNull();
      expect(withExpensive, 'the $1M milestone vanished when an expensive country was primary').not.toBeNull();
      expect(
        withCheap,
        `$1M dated ${withCheap} with Vietnam primary but ${withExpensive} with the US primary — ` +
          'the dating curve is retiring at the FIRE age of the selected country instead of working on',
      ).toBe(withExpensive);
    });

    test('the $1M milestone is dated by the Lifecycle engine, not projectGrowth', async ({ page }) => {
      await loadDashboard(page, dash.fileName);
      // Deliberately modest: net worth must stay BELOW $1M or the Millionaire
      // card renders as "already achieved" at 2026 and there is no date to check.
      await fundProfile(page, dash, 300_000, 50_000);

      const both = (await page.evaluate(`(() => {
        const inp = getInputs();
        const spend = getScenarioEffectiveSpend(scenarios.find(s => s.id === selectedScenario));
        // inp.endAge as the FIRE age => the "keep working" curve, which is what
        // renderTimeline dates against. Passing null would retire at the selected
        // country's FIRE age and bend the curve down, which is the bug this
        // whole test family exists to catch.
        const life = projectFullLifecycle(inp, spend, inp.endAge, true, {});
        const grow = projectGrowth(inp, 25);
        const lifeHit = life.find(r => r.total >= 1000000);
        const growHit = grow.find(r => r.total >= 1000000);
        return {
          lifecycleYear: lifeHit ? lifeHit.year : null,
          growthYear: growHit ? growHit.year : null,
          nw: Math.round(calcNetWorth(inp)),
        };
      })()`)) as { lifecycleYear: number | null; growthYear: number | null; nw: number };

      expect(both.nw, 'fixture must start below $1M for this test to mean anything').toBeLessThan(1_000_000);
      expect(both.lifecycleYear, 'lifecycle must reach $1M inside the plan').not.toBeNull();

      // The whole point: the two engines must actually disagree, or this test
      // proves nothing. They disagree wherever a pool exists that projectGrowth
      // never learned about — the rothIra pool from feature 032 on RR. Generic
      // has no Roth IRA inputs (FR-018), so there the curves can legitimately
      // coincide and there is nothing to discriminate.
      test.skip(
        both.lifecycleYear === both.growthYear,
        'both engines date $1M to the same year for this fixture — nothing to discriminate',
      );

      const rows = await timelineYearAmounts(page);
      const millionIdx = rows.findIndex((r) => r.amount === 1_000_000);
      expect(millionIdx, 'expected a future $1,000,000 milestone card').toBeGreaterThanOrEqual(0);

      expect(
        rows[millionIdx].year,
        `$1M dated ${rows[millionIdx].year}; Lifecycle says ${both.lifecycleYear}, ` +
          `projectGrowth says ${both.growthYear} — the panel is on the wrong engine`,
      ).toBe(both.lifecycleYear);
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
