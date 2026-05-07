/**
 * verdict-pill-probe.js — patch the resolver to log result to window,
 * then inspect what searchMethod returns for various input states.
 */
'use strict';

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8766/FIRE-Dashboard.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(
    () => {
      const el = document.getElementById('fireStatus');
      return el && el.textContent && !el.textContent.includes('Calculating');
    },
    { timeout: 10000 }
  );
  await page.waitForTimeout(500);

  // Patch findEarliestFeasibleAge to log results to window.
  await page.evaluate(() => {
    const orig = window.findEarliestFeasibleAge;
    window._resolverLog = [];
    window.findEarliestFeasibleAge = function (...args) {
      const r = orig.apply(this, args);
      window._resolverLog.push({ mode: args[1], result: r });
      return r;
    };
  });

  // Probe scenarios that might push FIRE age out.
  // Try Exact mode (matches user's screenshot).
  await page.evaluate(() => { if (typeof setFireMode === 'function') setFireMode('exact'); });
  await page.waitForTimeout(300);

  // Try selecting different scenarios to push FIRE age out.
  const scenarioIds = await page.evaluate(() => {
    return (typeof scenarios !== 'undefined') ? scenarios.map(s => ({ id: s.id, flag: s.flag })) : [];
  });
  console.log('Available scenarios:', JSON.stringify(scenarioIds.slice(0, 8)));

  for (const sc of scenarioIds.slice(0, 8)) {
    await page.evaluate((id) => {
      if (typeof selectScenario === 'function') selectScenario(id);
      else if (typeof setSelectedScenario === 'function') setSelectedScenario(id);
      else { window.selectedScenario = id; if (typeof recalcAll === 'function') recalcAll(); }
    }, sc.id);
    await page.waitForTimeout(400);
    const data = await page.evaluate(() => {
      const log = window._resolverLog || [];
      const last = log[log.length - 1];
      return {
        text: document.getElementById('fireStatus')?.textContent ?? null,
        resolver: last ? last.result : null,
      };
    });
    console.log(`scenario=${sc.id.padEnd(20)} | ${data.text}`);
    if (data.resolver) {
      console.log(`  resolver: years=${data.resolver.years} months=${data.resolver.months} method=${data.resolver.searchMethod} feasible=${data.resolver.feasible}`);
    }
  }
  await browser.close();
})();
