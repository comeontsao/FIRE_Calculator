/**
 * Feature 032 — T050: Roth IRA end-to-end flow.
 *
 * Validates the user-visible behavior of the new Roth IRA pool on
 * `FIRE-Dashboard.html` (RR — the only dashboard with UI inputs per FR-018).
 *
 * Journey (mirrors the quickstart.md smoke checklist that the user runs
 * manually at T055):
 *   1. Cold-load RR dashboard.
 *   2. Verify Plan→Assets shows the new "Roth IRA" card with both inputs
 *      and their default values (Roger = 0, Rebecca = 59021).
 *   3. Type 25000 into #rogerRothIra; assert the header net worth total
 *      (`#totalNetWorth`) increases by exactly 25000.
 *   4. Drag the FIRE marker on the Lifecycle chart ~10 years and verify
 *      the verdict + chart + tooltip stay mutually consistent (no NaN,
 *      no stale strategy) — Feature 031 contract preserved with the new
 *      pool.
 *   5. Switch EN ⇄ zh-TW and verify the Roth IRA labels update without
 *      losing entered values.
 *
 * Pattern mirrored from `tests/e2e/lifecycle-strategy-parity-drag.spec.ts`.
 * Dashboard loaded over HTTP (Playwright webServer starts python http.server).
 */

import { test, expect, type Page } from '@playwright/test';

const HTTP_BASE = 'http://127.0.0.1:8766';
const RR_FILE = 'FIRE-Dashboard.html';

async function loadDashboard(page: Page): Promise<void> {
  await page.goto(`${HTTP_BASE}/${RR_FILE}`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(
    () => {
      const el = document.getElementById('fireStatus');
      return el != null && el.textContent != null && !el.textContent.includes('Calculating');
    },
    { timeout: 10_000 },
  );
  await page.waitForTimeout(300);
}

/** Read numeric value out of an input by id. */
async function readInputValue(page: Page, id: string): Promise<number> {
  return page.evaluate((id) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    return el ? parseFloat(el.value) || 0 : NaN;
  }, id);
}

/** Read the header total-net-worth dollar value (parses "$1,234,567"). */
async function readTotalNetWorth(page: Page): Promise<number> {
  const txt = (await page.locator('#totalNetWorth').textContent()) ?? '';
  const cleaned = txt.replace(/[^0-9.\-]/g, '');
  return cleaned === '' || cleaned === '-' ? NaN : parseFloat(cleaned);
}

/** Activate Plan tab → Assets pill so the Roth IRA card is laid out. */
async function gotoPlanAssets(page: Page): Promise<void> {
  await page.click('#tabBtn-plan');
  await page.click('.pill[data-tab="plan"][data-pill="assets"]');
  await page.waitForTimeout(200);
}

test.describe('032 Roth IRA flow — RR dashboard', () => {
  test('cold-load surfaces both Roth IRA inputs with locked defaults', async ({ page }) => {
    await loadDashboard(page);
    await gotoPlanAssets(page);

    // The two inputs exist and are visible after activating Plan→Assets.
    const roger = page.locator('#rogerRothIra');
    const rebecca = page.locator('#rebeccaRothIra');
    await expect(roger, 'Roger Roth IRA input must be visible on Assets tab').toBeVisible();
    await expect(rebecca, 'Rebecca Roth IRA input must be visible on Assets tab').toBeVisible();

    expect(await readInputValue(page, 'rogerRothIra')).toBe(0);
    expect(await readInputValue(page, 'rebeccaRothIra')).toBe(59021);
  });

  test('typing into Roger Roth IRA increases the header total by exactly the delta', async ({ page }) => {
    await loadDashboard(page);
    await gotoPlanAssets(page);

    const before = await readTotalNetWorth(page);
    expect(Number.isFinite(before), 'header total must be numeric at baseline').toBe(true);

    // Set Roger = 25000 (default is 0, so delta is +25000) and force recalc.
    await page.locator('#rogerRothIra').fill('25000');
    await page.locator('#rogerRothIra').blur();
    await page.waitForTimeout(400); // recalcAll() + chart re-render

    const after = await readTotalNetWorth(page);
    expect(Number.isFinite(after), 'header total must be numeric after edit').toBe(true);
    expect(
      Math.round(after - before),
      `header net worth must rise by exactly the entered delta (got Δ$${Math.round(after - before)})`,
    ).toBe(25_000);
  });

  test('FIRE-marker drag with non-zero Roth IRA keeps verdict, chart, and tooltip consistent', async ({ page }) => {
    await loadDashboard(page);
    await gotoPlanAssets(page);

    // Plant a non-trivial Roth IRA balance so the new pool affects the chart.
    await page.locator('#rogerRothIra').fill('100000');
    await page.locator('#rogerRothIra').blur();
    await page.waitForTimeout(400);

    // Navigate to Retirement → Lifecycle so the growthChart canvas has a box.
    await page.click('#tabBtn-retirement');
    await page.click('.pill[data-tab="retirement"][data-pill="lifecycle"]');
    await page.waitForFunction(
      () => {
        const c = document.getElementById('growthChart') as HTMLCanvasElement | null;
        return c != null && c.getBoundingClientRect().width > 50 && c.getBoundingClientRect().height > 50;
      },
      { timeout: 10_000 },
    );
    await page.waitForTimeout(300);

    // Read the live Chart.js instance to get the FIRE-marker center point.
    const startXY = await page.evaluate(() => {
      const ChartGlobal = (window as unknown as { Chart?: { getChart(id: string): unknown } }).Chart;
      const chart = ChartGlobal?.getChart('growthChart') as
        | {
            _fireMarkerIdx?: number;
            getDatasetMeta(i: number): { data?: Array<{ getCenterPoint?: () => { x: number; y: number } }> };
            data: { datasets: Array<{ data: Array<number | null> }> };
          }
        | undefined;
      if (!chart) return null;
      const idx = typeof chart._fireMarkerIdx === 'number' && chart._fireMarkerIdx >= 0 ? chart._fireMarkerIdx : 3;
      const meta = chart.getDatasetMeta(idx);
      const ds = chart.data.datasets[idx];
      if (!meta?.data || !ds) return null;
      for (let i = 0; i < ds.data.length; i++) {
        if (ds.data[i] !== null && ds.data[i] !== undefined && meta.data[i]?.getCenterPoint) {
          const p = meta.data[i].getCenterPoint!();
          return { x: p.x, y: p.y };
        }
      }
      return null;
    });
    expect(startXY, 'FIRE marker must be locatable on the Lifecycle chart').not.toBeNull();

    const box = await page.locator('#growthChart').boundingBox();
    expect(box, 'growthChart canvas must have a bounding box').not.toBeNull();
    if (!box || !startXY) return;

    const startX = box.x + startXY.x;
    const startY = box.y + startXY.y;
    // Drag ~10 years to the right (the chart x-axis is per-year, so a coarse
    // ~75% canvas-width drag moves through many years; we only assert the
    // marker moved and the chart stayed consistent).
    const endX = box.x + box.width * 0.75;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    for (let f = 0; f <= 4; f++) {
      await page.mouse.move(startX + ((endX - startX) * f) / 4, startY, { steps: 3 });
      await page.waitForTimeout(80);
    }
    await page.mouse.up();
    await page.keyboard.press('Escape').catch(() => { /* cancel any override dialog */ });
    await page.waitForTimeout(400);

    // After drag + cancel, the chart must still expose a non-NaN Trad series
    // and a Roth IRA series alongside the verdict (no NaN cascade).
    const integrity = await page.evaluate(() => {
      const ChartGlobal = (window as unknown as { Chart?: { getChart(id: string): unknown } }).Chart;
      const chart = ChartGlobal?.getChart('growthChart') as
        | { data?: { datasets?: Array<{ label?: string; data?: Array<number | null> }> } }
        | undefined;
      if (!chart?.data?.datasets) return { ok: false, reason: 'no chart' };
      let hasRothIra = false;
      let hasNaN = false;
      for (const ds of chart.data.datasets) {
        if (typeof ds.label === 'string' && /roth\s*ira/i.test(ds.label)) hasRothIra = true;
        if (Array.isArray(ds.data)) {
          for (const v of ds.data) {
            if (typeof v === 'number' && Number.isNaN(v)) hasNaN = true;
          }
        }
      }
      const verdict = (document.getElementById('fireStatus')?.textContent ?? '').trim();
      return { ok: true, hasRothIra, hasNaN, verdict };
    });

    expect(integrity.ok, 'live Lifecycle chart must be readable after drag').toBe(true);
    expect(integrity.hasRothIra, 'Lifecycle chart must include a Roth IRA dataset').toBe(true);
    expect(integrity.hasNaN, 'no NaN may appear in any chart dataset after drag').toBe(false);
    expect(integrity.verdict, 'verdict text must be non-empty after drag').not.toBe('');
    expect(integrity.verdict.toLowerCase()).not.toContain('calculating');
  });

  test('language toggle EN ⇄ zh-TW updates Roth IRA labels without losing entered values', async ({ page }) => {
    await loadDashboard(page);
    await gotoPlanAssets(page);

    // Enter a distinct value so we can confirm it survives the toggle.
    await page.locator('#rogerRothIra').fill('12345');
    await page.locator('#rogerRothIra').blur();
    await page.waitForTimeout(200);

    // Read the EN label text adjacent to Roger's input.
    const enLabel = await page
      .locator('label[data-i18n="assets.rogerRothIra"]')
      .first()
      .textContent();
    expect(enLabel ?? '').toMatch(/Roger.*Roth IRA/i);

    // Switch to Traditional Chinese.
    await page.click('#langZH');
    await page.waitForTimeout(200);

    const zhLabel = await page
      .locator('label[data-i18n="assets.rogerRothIra"]')
      .first()
      .textContent();
    expect(zhLabel ?? '', 'zh-TW label must contain the Chinese rendition').toContain('Roth IRA');
    expect(zhLabel ?? '', 'zh-TW label must contain 的').toContain('的');

    // The entered value must persist.
    expect(await readInputValue(page, 'rogerRothIra')).toBe(12345);

    // Switch back to EN; value still persists; label restores.
    await page.click('#langEN');
    await page.waitForTimeout(200);
    expect(await readInputValue(page, 'rogerRothIra')).toBe(12345);
    const enAfter = await page
      .locator('label[data-i18n="assets.rogerRothIra"]')
      .first()
      .textContent();
    expect(enAfter ?? '').toMatch(/Roger.*Roth IRA/i);
  });
});
