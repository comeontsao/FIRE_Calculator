import { test, expect, type Page } from '@playwright/test';

const HTTP_BASE = 'http://127.0.0.1:8766';

async function load(page: Page, file: string) {
  await page.goto(`${HTTP_BASE}/${file}`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => {
    const el = document.getElementById('fireStatus');
    return el != null && el.textContent != null && !el.textContent.includes('Calculating');
  }, { timeout: 15000 });
}

test('probe: mobile drawer header overlap', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await load(page, 'FIRE-Dashboard.html');
  await page.locator('#navDrawerToggle').click();
  await page.waitForTimeout(400);

  const data = await page.evaluate(() => {
    const header = document.getElementById('siteHeader')!.getBoundingClientRect();
    const gate = document.getElementById('gateSelector')!.getBoundingClientRect();
    const rail = document.getElementById('navRail')!.getBoundingClientRect();
    const tabs = Array.from(document.querySelectorAll('#navRail #tabBar .tab')).map((t) => {
      const r = (t as HTMLElement).getBoundingClientRect();
      // What element is at the center of this tab button?
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const top = document.elementFromPoint(cx, cy);
      return {
        tab: (t as HTMLElement).dataset.tab,
        rect: { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left) },
        topElAtCenter: top ? `${top.tagName}#${top.id}.${(top.className || '').toString().slice(0,30)}` : null,
        coveredByHeader: top ? document.getElementById('siteHeader')!.contains(top) : false,
      };
    });
    return {
      header: { top: Math.round(header.top), bottom: Math.round(header.bottom), zIndex: getComputedStyle(document.getElementById('siteHeader')!).zIndex },
      gate: { top: Math.round(gate.top), bottom: Math.round(gate.bottom) },
      rail: { top: Math.round(rail.top), bottom: Math.round(rail.bottom), zIndex: getComputedStyle(document.getElementById('navRail')!).zIndex },
      tabs,
    };
  });
  console.log('PROBE_RESULT=' + JSON.stringify(data, null, 2));
});
