/**
 * E2E coverage for feature 036 — Explicit Retirement Status.
 *
 * Separates "when the user CAN retire" (existing feasibility scan) from
 * "when the user HAS retired" (a durable, user-asserted fact). See
 * `specs/036-retirement-status/spec.md` (US1-US5, SC-001..SC-008) and
 * `specs/036-retirement-status/quickstart.md` for the acceptance scripts
 * this spec automates.
 *
 * IMPORTANT — verified shape divergence between the two dashboards (read
 * directly from source, not assumed):
 *   - RR (`FIRE-Dashboard.html`) keeps the ORIGINAL flat, single-household
 *     control surface: `#retirementToggle` / `#retirementYear` /
 *     `#retirementYearWrap`, and `getRetirementStatus()` returns
 *     `{ retired, retirementYear }`.
 *   - Generic (`FIRE-Dashboard-Generic.html`) ships the full US5 per-person
 *     surface instead: `#retirementTogglePerson1/2` / `#retirementYearPerson1/2`
 *     / `#retirementYearWrapPerson1/2`, and `getRetirementStatus()` returns
 *     `{ persons: [{retired, retirementYear}, {retired, retirementYear}] }`.
 *     There is NO plain `#retirementToggle` on Generic.
 *   - `resolveRetirementTransitionAge` truncates `persons[]` to the live
 *     `adultCount` before evaluating "is everyone retired", so putting
 *     Generic into single-adult mode (`adultCount = 1`) and driving the
 *     Person-1 controls is the correct like-for-like stand-in for RR's
 *     single flat toggle in the shared US1-US4 tests below.
 *
 * The shared (`DASHBOARDS`) test blocks use a small per-dashboard fixture
 * (`toggleSel`/`yearSel`/`yearWrapSel`/`ageField`) plus `getPrimaryRetired()`
 * to read "is the primary/only earner retired" uniformly across both shapes,
 * so the same test body exercises the real selectors on each file rather
 * than papering over the divergence.
 *
 * Conventions follow `tests/e2e/left-sidebar-nav.spec.ts` and
 * `tests/e2e/year-tax-estimator.spec.ts`:
 *   - Loads over HTTP (`http://127.0.0.1:8766`) so `calc/*.js` modules resolve
 *     (Chromium blocks classic-script/module resolution on file://).
 *   - Clean localStorage + reload, then wait until `#fireStatus` has computed
 *     (no "Calculating…") before any assertion.
 *   - Chromium-only via `playwright.config.ts`.
 *
 * US5 (staggered per-person retirement) is Generic-only per the spec's
 * deliberate Principle-I divergence (RR keeps one household date).
 */

import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Matches `playwright.config.ts > webServer` (python -m http.server 8766). */
const HTTP_BASE = 'http://127.0.0.1:8766';

const RR_FILE = 'FIRE-Dashboard.html';
const GENERIC_FILE = 'FIRE-Dashboard-Generic.html';

/** Let recalc / re-render settle after a gesture. */
const SETTLE_MS = 500;

/** `RETIREMENT_BASE_YEAR` hardcoded in both dashboards — matches "now". */
const CURRENT_YEAR = 2026;

interface DashboardFixture {
  readonly key: 'rr' | 'generic';
  readonly fileName: string;
  /** Primary (or only, once Generic is forced single-adult) retirement checkbox. */
  readonly toggleSel: string;
  readonly yearSel: string;
  readonly yearWrapSel: string;
  readonly ageField: 'ageRoger' | 'agePerson1';
}

/**
 * Shared US1-US4 fixture. Generic is driven through its Person-1 controls
 * with `adultCount` forced to 1 first (see file header) so the two rows
 * exercise equivalent single-earner semantics despite the different DOM/
 * state shape.
 */
const DASHBOARDS: readonly DashboardFixture[] = [
  {
    key: 'rr',
    fileName: RR_FILE,
    toggleSel: '#retirementToggle',
    yearSel: '#retirementYear',
    yearWrapSel: '#retirementYearWrap',
    ageField: 'ageRoger',
  },
  {
    key: 'generic',
    fileName: GENERIC_FILE,
    toggleSel: '#retirementTogglePerson1',
    yearSel: '#retirementYearPerson1',
    yearWrapSel: '#retirementYearWrapPerson1',
    ageField: 'agePerson1',
  },
];

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
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await page.waitForFunction(
    () => {
      const el = document.getElementById('fireStatus');
      return el != null && el.textContent != null && !el.textContent.includes('Calculating');
    },
    undefined,
    { timeout: 15_000 },
  );
}

/** Reload IN PLACE (no localStorage clear) — used for persistence checks. */
async function reloadInPlace(page: Page): Promise<void> {
  await page.reload();
  await page.waitForFunction(
    () => {
      const el = document.getElementById('fireStatus');
      return el != null && el.textContent != null && !el.textContent.includes('Calculating');
    },
    undefined,
    { timeout: 15_000 },
  );
}

/**
 * Generic-only: set `#adultCount` via the `#adultCountDec`/`#adultCountInc`
 * counter buttons (the field itself is `type="hidden"`). No-op if already at
 * the target count. Mirrors the real user gesture (`changeAdultCount()`),
 * which also runs `syncAdultCountVisibility()` + `recalcAll()`.
 */
async function setAdultCount(page: Page, count: 1 | 2): Promise<void> {
  const current = Number(await page.locator('#adultCount').inputValue());
  if (current === count) return;
  const btnSel = count < current ? '#adultCountDec' : '#adultCountInc';
  await page.locator(btnSel).click();
  await page.waitForTimeout(SETTLE_MS);
}

/**
 * Forces Generic into single-adult mode so its Person-1 controls behave as
 * the single-earner equivalent of RR's flat toggle (see file header). No-op
 * for RR (which has no adultCount concept).
 */
async function prepareSingleEarner(page: Page, dash: DashboardFixture): Promise<void> {
  if (dash.key === 'generic') {
    await setAdultCount(page, 1);
  }
}

/**
 * Reads "is the primary/only earner retired" uniformly across RR's flat
 * `{retired}` shape and Generic's `{persons:[...]}` shape.
 */
async function getPrimaryRetired(page: Page, key: 'rr' | 'generic'): Promise<boolean> {
  return page.evaluate((k) => {
    const st = (window as any).getRetirementStatus();
    if (k === 'rr') return !!(st && st.retired);
    return !!(st && Array.isArray(st.persons) && st.persons[0] && st.persons[0].retired);
  }, key);
}

/** Reads the dashboard's own notion of "current age" for the primary earner. */
async function getCurrentAge(page: Page, ageField: 'ageRoger' | 'agePerson1'): Promise<number> {
  return page.evaluate((field) => {
    const inp = (window as any).getInputs();
    return inp[field];
  }, ageField);
}

/** Trimmed text of `#fireStatus`. */
async function readVerdict(page: Page): Promise<string> {
  return (await page.locator('#fireStatus').innerText()).trim();
}

// ===========================================================================
// US1 — Declare "I've retired" (both dashboards)
// ===========================================================================

test.describe('036 retirement-status — US1: declare "I\'ve retired"', () => {
  for (const dash of DASHBOARDS) {
    test(`[${dash.key}] toggle ON at current year activates the override at the current age`, async ({ page }) => {
      await loadDashboard(page, dash.fileName);
      await prepareSingleEarner(page, dash);

      // Precondition: fresh load, not retired, no override.
      expect(await getPrimaryRetired(page, dash.key)).toBe(false);
      expect(await page.evaluate(() => (window as any)._retirementOverrideActive)).toBeFalsy();

      // Default retirement-year input is already the current year (2026 ===
      // RETIREMENT_BASE_YEAR in both files) — toggling ON alone retires "now".
      expect(await page.locator(dash.yearSel).inputValue()).toBe(String(CURRENT_YEAR));

      const curAge = await getCurrentAge(page, dash.ageField);

      await page.locator(dash.toggleSel).check();
      await page.waitForFunction(() => (window as any)._retirementOverrideActive === true, undefined, {
        timeout: 10_000,
      });

      expect(await getPrimaryRetired(page, dash.key), 'getRetirementStatus() must reflect retired').toBe(true);

      const fireAgeOverride = await page.evaluate(() => (window as any).fireAgeOverride);
      expect(
        fireAgeOverride,
        `FR-005: fireAgeOverride must equal the current age (${curAge}) when retiring "now"`,
      ).toBe(curAge);

      // The year-wrap control is revealed once retired.
      await expect(page.locator(dash.yearWrapSel)).toBeVisible();
    });

    test(`[${dash.key}] toggle OFF clears the override and reverts the verdict (SC-004)`, async ({ page }) => {
      await loadDashboard(page, dash.fileName);
      await prepareSingleEarner(page, dash);

      await page.locator(dash.toggleSel).check();
      await page.waitForFunction(() => (window as any)._retirementOverrideActive === true, undefined, {
        timeout: 10_000,
      });
      await expect(page.locator('#fireStatus')).toContainText(/Retired/i);

      await page.locator(dash.toggleSel).uncheck();
      await page.waitForFunction(() => (window as any)._retirementOverrideActive === false, undefined, {
        timeout: 10_000,
      });

      expect(await getPrimaryRetired(page, dash.key), 'getRetirementStatus() must clear retired').toBe(false);

      const verdict = await readVerdict(page);
      expect(verdict, 'SC-004: verdict must revert to a non-"Retired" string after toggling OFF').not.toMatch(
        /Retired/i,
      );

      // Year-wrap control hides again once not retired.
      await expect(page.locator(dash.yearWrapSel)).toBeHidden();
    });

    test(`[${dash.key}] retirement status and year persist across a reload (SC-003)`, async ({ page }) => {
      await loadDashboard(page, dash.fileName);
      await prepareSingleEarner(page, dash);

      await page.locator(dash.toggleSel).check();
      await page.waitForFunction(() => (window as any)._retirementOverrideActive === true, undefined, {
        timeout: 10_000,
      });
      const yearBefore = await page.locator(dash.yearSel).inputValue();

      // Reload IN PLACE — localStorage must carry the saved `_retirementStatus`
      // (state key `fire_dashboard_state` / `fire_dashboard_generic_state`).
      await reloadInPlace(page);

      // Restore is deferred one macrotask (`setTimeout(fn, 0)` in
      // `syncRetirementStatusUI` per the restore path) — wait for the checkbox
      // to actually flip rather than racing a fixed timeout.
      await page.waitForFunction(
        (sel) => {
          const cb = document.getElementById(sel.replace('#', ''));
          return cb instanceof HTMLInputElement && cb.checked === true;
        },
        dash.toggleSel,
        { timeout: 10_000 }, // deferred setTimeout(0) restore + recalc
      );

      expect(await page.locator(dash.toggleSel).isChecked()).toBe(true);
      expect(await page.locator(dash.yearSel).inputValue()).toBe(yearBefore);
      expect(await getPrimaryRetired(page, dash.key), 'restored state must read retired=true').toBe(true);
    });
  }
});

// ===========================================================================
// US2 — Feasibility becomes an "on-track" readout once retired (both)
// ===========================================================================

test.describe('036 retirement-status — US2: verdict reframes to a sustainability readout', () => {
  for (const dash of DASHBOARDS) {
    test(`[${dash.key}] #fireStatus reads "Retired" and never a FIRE-in-N countdown (FR-014)`, async ({ page }) => {
      await loadDashboard(page, dash.fileName);
      await prepareSingleEarner(page, dash);

      await page.locator(dash.toggleSel).check();
      await page.waitForFunction(() => (window as any)._retirementOverrideActive === true, undefined, {
        timeout: 10_000,
      });
      await page.waitForTimeout(SETTLE_MS);

      const verdict = await readVerdict(page);
      expect(verdict, 'FR-014/SC-001: retired verdict must read "Retired"').toMatch(/Retired/i);
      expect(
        verdict,
        'FR-014/SC-001: retired verdict must never show a "FIRE in N years" countdown',
      ).not.toMatch(/FIRE in \d+ year/i);
    });
  }
});

// ===========================================================================
// US3 — Planning lever preserved for the not-yet-retired (both)
// ===========================================================================

test.describe('036 retirement-status — US3: FIRE-marker drag edits the retirement year while retired', () => {
  for (const dash of DASHBOARDS) {
    test(`[${dash.key}] while ON, the marker reflects the retirement age and a confirmed drag sets the Retirement year (US3 revised)`, async ({
      page,
    }) => {
      await loadDashboard(page, dash.fileName);
      await prepareSingleEarner(page, dash);

      await page.locator(dash.toggleSel).check();
      await page.waitForFunction(() => (window as any)._retirementOverrideActive === true, undefined, {
        timeout: 10_000,
      });

      const curAge = await getCurrentAge(page, dash.ageField);
      const fireAgeOverrideBefore = await page.evaluate(() => (window as any).fireAgeOverride);
      expect(
        fireAgeOverrideBefore,
        'marker (fireAgeOverride) must reflect the retirement transition age while ON',
      ).toBe(curAge);

      // Revised US3: the drag stays LIVE when retired and, on confirm, edits the
      // retirement YEAR (single source of truth) rather than a separate override.
      // The drag-confirm overlay commits via `applyRetirementDragAge(age)`; we
      // exercise that commit directly (headless canvas can't reliably drive
      // pixel-perfect marker geometry).
      const targetAge = curAge + 6;
      await page.evaluate((a) => (window as any).applyRetirementDragAge(a), targetAge);
      await page.waitForTimeout(SETTLE_MS);

      // Marker re-pins to the dragged age...
      expect(
        await page.evaluate(() => (window as any).fireAgeOverride),
        'a confirmed drag re-pins the marker to the dragged age',
      ).toBe(targetAge);
      // ...by writing the Retirement-year field (marker + field stay in sync).
      const expectedYear = CURRENT_YEAR + (targetAge - curAge);
      expect(
        Number(await page.locator(dash.yearSel).inputValue()),
        'a confirmed drag updates the Retirement-year field (single source of truth)',
      ).toBe(expectedYear);
      expect(await page.evaluate(() => (window as any)._retirementOverrideActive)).toBe(true);
    });
  }
});

// ===========================================================================
// US4 — Auto-suggest marking retired (both)
// ===========================================================================

test.describe('036 retirement-status — US4: auto-suggest banner', () => {
  for (const dash of DASHBOARDS) {
    test(`[${dash.key}] banner shows on trigger, dismiss suppresses it for the session, accept retires (FR-012)`, async ({
      page,
    }) => {
      await loadDashboard(page, dash.fileName);

      expect(await getPrimaryRetired(page, dash.key), 'must start not-retired').toBe(false);
      expect(await page.evaluate(() => sessionStorage.getItem('fire:retireSuggestDismissed'))).toBeNull();

      const dismissBtn = page.locator('#retirementSuggestBanner button[onclick="onRetirementSuggestDismiss()"]');
      const acceptBtn = page.locator('#retirementSuggestBanner button[onclick="onRetirementSuggestAccept()"]');

      // Force-trigger via the documented API — feasible=true, yrsToFire<=0 —
      // rather than contorting inputs to actually cross the feasible line.
      await page.evaluate(() => {
        (window as any).maybeShowRetirementSuggest((window as any).getInputs(), 0, true);
      });
      await expect(page.locator('#retirementSuggestBanner')).toBeVisible();

      // Dismiss: banner hides, no projection change, sessionStorage flag set.
      await dismissBtn.click();
      await expect(page.locator('#retirementSuggestBanner')).toBeHidden();
      expect(await page.evaluate(() => sessionStorage.getItem('fire:retireSuggestDismissed'))).toBe('1');
      expect(await getPrimaryRetired(page, dash.key), 'dismiss must not change retirement status').toBe(false);

      // Re-triggering this session must NOT reopen it (no repeat nag).
      await page.evaluate(() => {
        (window as any).maybeShowRetirementSuggest((window as any).getInputs(), 0, true);
      });
      await expect(page.locator('#retirementSuggestBanner')).toBeHidden();

      // Accept path: clear the session dismiss flag, re-show, accept → retired.
      await page.evaluate(() => sessionStorage.removeItem('fire:retireSuggestDismissed'));
      await page.evaluate(() => {
        (window as any).maybeShowRetirementSuggest((window as any).getInputs(), 0, true);
      });
      await expect(page.locator('#retirementSuggestBanner')).toBeVisible();

      await acceptBtn.click();
      await page.waitForFunction(
        () => (window as any)._retirementOverrideActive === true,
        undefined,
        { timeout: 10_000 },
      );

      expect(await getPrimaryRetired(page, dash.key), 'accepting the suggestion must mark the user retired').toBe(
        true,
      );
      await expect(page.locator('#retirementSuggestBanner')).toBeHidden();
      await expect(page.locator(dash.toggleSel)).toBeChecked();
    });
  }
});

// ===========================================================================
// US5 — Staggered retirement for two earners (Generic ONLY, FR-018/FR-019/FR-020)
// ===========================================================================

test.describe('036 retirement-status — US5: staggered per-person retirement [generic only]', () => {
  test('two earners with distinct incomes and staggered retirement years (SC-008)', async ({ page }) => {
    await loadDashboard(page, GENERIC_FILE);
    await setAdultCount(page, 2);

    // Distinct per-person incomes (FR-019); household income = sum (INV-6).
    await page.locator('#person1Income').fill('90000');
    await page.locator('#person1Income').dispatchEvent('change');
    await page.locator('#person2Income').fill('60000');
    await page.locator('#person2Income').dispatchEvent('change');
    await page.waitForTimeout(SETTLE_MS);

    expect(await page.evaluate(() => (window as any).getInputs().annualIncome)).toBe(150_000);

    // Person 1 retires in 2 years (Y1); Person 2 retires 6 years out (Y2).
    // Y1 is deliberately NOT "now" so at least one accumulation row exists
    // BEFORE either retirement (both incomes combined) to serve as the
    // "before" baseline for the SC-008 income-drop comparison below — an
    // immediate (current-year) Person-1 retirement would make the very
    // first accumulation row already reflect the post-retirement income,
    // leaving no combined-income row to compare against.
    const Y1 = CURRENT_YEAR + 2;
    const Y2 = CURRENT_YEAR + 6;

    // The year input is inside `#retirementYearWrapPersonN`, which stays
    // `display:none` until its checkbox is checked (mirrors RR's single
    // `#retirementYearWrap`) — check first, THEN set the year.
    await page.locator('#retirementTogglePerson1').check();
    await expect(page.locator('#retirementYearWrapPerson1')).toBeVisible();
    await page.locator('#retirementYearPerson1').fill(String(Y1));
    await page.locator('#retirementYearPerson1').dispatchEvent('change');
    await page.waitForTimeout(SETTLE_MS);

    await page.locator('#retirementTogglePerson2').check();
    await expect(page.locator('#retirementYearWrapPerson2')).toBeVisible();
    await page.locator('#retirementYearPerson2').fill(String(Y2));
    await page.locator('#retirementYearPerson2').dispatchEvent('change');

    // Household is fully retired only once BOTH earners have a retirement
    // date (per `resolveRetirementTransitionAge`'s persons[] "anyWorking"
    // check) — the transition age is then the LATER (Person 2's) age.
    // NOTE: the year-change handler is debounced (feature 036 perf fix), so the
    // re-pin of fireAgeOverride to Person 2's age lands ~250ms after the last
    // edit — wait for that SETTLED value, not just the toggle-time recalc.
    await page.waitForFunction((y2) => {
      const inp = (window as any).getInputs();
      const cur = inp.agePerson1;
      const expected = Math.max(cur, cur + (y2 - 2026)); // 2026 = RETIREMENT_BASE_YEAR
      return (window as any)._retirementOverrideActive === true && (window as any).fireAgeOverride === expected;
    }, Y2, { timeout: 10_000 });

    const status = await page.evaluate(() => (window as any).getRetirementStatus());
    expect(status.persons?.[0]?.retired).toBe(true);
    expect(status.persons?.[1]?.retired).toBe(true);
    expect(status.persons?.[0]?.retirementYear).toBe(Y1);
    expect(status.persons?.[1]?.retirementYear).toBe(Y2);

    const { curAge, fireAgeOverride, lifecycle } = await page.evaluate(() => {
      const inp = (window as any).getInputs();
      const age = inp.agePerson1;
      const override = (window as any).fireAgeOverride;
      const rows = (window as any).projectFullLifecycle(inp, 60000, override, true, {});
      return { curAge: age, fireAgeOverride: override, lifecycle: rows };
    });

    const ageFromYear = (yr: number) => Math.max(curAge, curAge + (yr - CURRENT_YEAR));
    const y1Age = ageFromYear(Y1);
    const y2Age = ageFromYear(Y2);

    // The household transition (fireAgeOverride) must land on the LATER
    // (Person 2) age — the earlier earner's own retirement does not end
    // accumulation while the other still works (FR-018).
    expect(fireAgeOverride, 'the household transition must be Person 2\'s (later) retirement age').toBe(y2Age);

    const accumRows: Array<Record<string, any>> = (lifecycle as Array<Record<string, any>>).filter(
      (r) => r.phase === 'accumulation',
    );
    expect(accumRows.length, 'expected at least one accumulation-phase row').toBeGreaterThan(0);

    const firstRow = accumRows.reduce((min, r) => (r.age < min.age ? r : min), accumRows[0]);
    const interimRow = accumRows.find((r) => r.age === y1Age);

    expect(firstRow.grossIncome, 'the pre-retirement (combined) year must show positive income').toBeGreaterThan(0);
    expect(interimRow, `expected an accumulation row at age ${y1Age} (interim between Y1 and Y2)`).toBeTruthy();

    // SC-008: in the interim years [Y1, Y2), only Person 2's income remains —
    // strictly less than the combined pre-retirement income, but still > 0.
    expect(
      interimRow!.grossIncome,
      'FR-018/SC-008: interim-year income (Person 1 retired, Person 2 still working) must be LESS than the combined pre-retirement income',
    ).toBeLessThan(firstRow.grossIncome);
    expect(
      interimRow!.grossIncome,
      'FR-018/SC-008: interim-year income must still be > 0 (Person 2 has not retired yet)',
    ).toBeGreaterThan(0);

    // SC-008: at/after Y2 all employment income has stopped — the projection
    // is pure drawdown, so no accumulation-phase row exists at or beyond the
    // later retirement age.
    const rowsAtOrAfterY2 = accumRows.filter((r) => r.age >= y2Age);
    expect(
      rowsAtOrAfterY2.length,
      'FR-018/SC-008: no accumulation/employment-income rows should exist at or after the later retirement age (Y2)',
    ).toBe(0);
  });

  test('single-adult mode hides Person 2 income and Person 2 retirement controls (FR-020)', async ({ page }) => {
    await loadDashboard(page, GENERIC_FILE);

    // Sanity: at adultCount=2 (default), Person 2's controls are visible.
    await setAdultCount(page, 2);
    await expect(page.locator('#person2IncomeGroup')).toBeVisible();
    await expect(page.locator('#retirementPerson2Row')).toBeVisible();

    await setAdultCount(page, 1);
    await expect(page.locator('#person2IncomeGroup')).toBeHidden();
    await expect(page.locator('#retirementPerson2Row')).toBeHidden();

    // FR-020: household income falls back to Person 1 only.
    const inp = await page.evaluate(() => (window as any).getInputs());
    expect(inp.annualIncome).toBe(inp.person1Income);
  });
});
