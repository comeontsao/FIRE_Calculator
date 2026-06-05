// Temp diagnostic: load a dashboard via file:// and dump console errors + KPI state.
// Usage: node tools/console-probe.mjs <abs-path-to-html>
import { chromium } from '@playwright/test';

const target = process.argv[2];
if (!target) { console.error('usage: node tools/console-probe.mjs <abs-path-to-html>'); process.exit(2); }

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text().slice(0, 300)); });
page.on('pageerror', (err) => errors.push('PAGEERROR: ' + String(err).slice(0, 300)));

await page.goto('file:///' + target.replace(/\\/g, '/'));
await page.waitForTimeout(2500);

const probe = await page.evaluate(() => ({
  applyCashSweepLoaded: typeof window._applyCashSweep === 'function',
  tooltipFrameLoaded: typeof window._buildWithdrawalTooltipLines === 'function',
  assembleAuditLoaded: typeof window.assembleAuditSnapshot === 'function',
  headerText: (document.querySelector('.kpi-value, #netWorthTotal, [data-kpi]') || {}).textContent || null,
}));

console.log(JSON.stringify({ target: target.split(/[\\/]/).pop(), probe, errorCount: errors.length, errors }, null, 2));
await browser.close();
