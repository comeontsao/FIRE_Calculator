// Temp diagnostic: BUG-1 reproduction check (bug report 2026-06-05).
// Loads FIRE-Dashboard.html (RR live defaults) cold, then for each FIRE mode
// (safe / exact / dieWithZero) reads window._lastAuditSnapshot's
// crossValidationWarnings and reports any non-expected entries — in particular
// the `endBalance-mismatch` (signed-sim vs chart-sim) the report cites at
// 15.2% / $54,955.
// Usage: node tools/bug1-repro-probe.mjs <abs-path-to-html>
import { chromium } from '@playwright/test';

const target = process.argv[2];
if (!target) { console.error('usage: node tools/bug1-repro-probe.mjs <abs-path-to-html>'); process.exit(2); }

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 200)));

await page.goto('file:///' + target.replace(/\\/g, '/'));
// Wait for the audit snapshot to exist (recalcAll + strategy ranking done).
await page.waitForFunction(() => !!window._lastAuditSnapshot, null, { timeout: 30000 });

const modes = ['safe', 'exact', 'dieWithZero'];
const results = {};
for (const mode of modes) {
  await page.evaluate((m) => { window._lastAuditSnapshot = null; setFireMode(m); }, mode);
  await page.waitForFunction(() => !!window._lastAuditSnapshot, null, { timeout: 30000 });
  results[mode] = await page.evaluate(() => {
    const s = window._lastAuditSnapshot || {};
    const ws = Array.isArray(s.crossValidationWarnings) ? s.crossValidationWarnings : [];
    return {
      fireAge: s.fireAge ?? null,
      winner: (s.lastStrategyResults && s.lastStrategyResults.winnerId) || s.activeStrategyId || null,
      warningCount: ws.length,
      nonExpected: ws.filter(w => w && w.expected !== true).map(w => ({
        kind: w.kind, delta: w.delta, deltaPct: w.deltaPct,
        signed: w.signedEndBalance ?? w.valueA, chart: w.chartEndBalance ?? w.valueB,
        strategy: w.activeStrategyId, mode: w.mode, reason: (w.reason || '').slice(0, 160),
      })),
      expectedKinds: ws.filter(w => w && w.expected === true).map(w => w.kind),
    };
  });
}

console.log(JSON.stringify({ results, consoleErrorCount: consoleErrors.length, consoleErrors }, null, 2));
await browser.close();
