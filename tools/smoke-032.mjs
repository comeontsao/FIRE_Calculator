// Temp diagnostic: automated subset of specs/032-roth-ira-accounts/quickstart.md
// browser smoke. Covers: cold-load KPI numerics, Roth IRA inputs + defaults (RR),
// Generic regression (NO Roth IRA UI), localStorage persistence, header-total
// delta on Roth IRA change, audit warnings, console cleanliness.
// Usage: node tools/smoke-032.mjs
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url))).replace(/\\/g, '/');
const results = [];
const check = (name, pass, detail) => results.push({ name, pass, detail: detail ?? '' });

const browser = await chromium.launch();

// ---------- RR dashboard ----------
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 150)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 150)));

  await page.goto(`file:///${ROOT}/FIRE-Dashboard.html`);
  await page.waitForFunction(() => !!window._lastAuditSnapshot, null, { timeout: 30000 });

  // 1. Cold load — KPI numerics
  const kpi = await page.evaluate(() => ({
    netWorth: document.getElementById('ikpiNetWorth')?.textContent || '',
    fireNum: document.getElementById('ikpiFIRENum')?.textContent || '',
    status: document.getElementById('fireStatus')?.textContent || '',
  }));
  const numeric = (s) => /\$?[\d,.]+/.test(s) && !/NaN|Calculating|—|40\+/.test(s);
  check('RR cold-load: net worth numeric', numeric(kpi.netWorth), kpi.netWorth);
  check('RR cold-load: FIRE number numeric', numeric(kpi.fireNum), kpi.fireNum);
  check('RR cold-load: verdict not stuck on Calculating', !/Calculating/.test(kpi.status), kpi.status.slice(0, 60));

  // 1b. Roth IRA inputs + defaults
  const inputs = await page.evaluate(() => ({
    roger: document.getElementById('rogerRothIra')?.value,
    rebecca: document.getElementById('rebeccaRothIra')?.value,
    rogerC: document.getElementById('rogerRothIraContrib')?.value,
    rebeccaC: document.getElementById('rebeccaRothIraContrib')?.value,
  }));
  check('RR: Roger Roth IRA default 0', inputs.roger === '0', String(inputs.roger));
  check('RR: Rebecca Roth IRA default 59021', inputs.rebecca === '59021', String(inputs.rebecca));
  check('RR: contribution defaults 7000/7000', inputs.rogerC === '7000' && inputs.rebeccaC === '7000', `${inputs.rogerC}/${inputs.rebeccaC}`);

  // 3. Header total recalculation — +50000 to Roger's Roth IRA
  const parseMoney = (s) => Number(String(s).replace(/[^0-9.-]/g, ''));
  const before = await page.evaluate(() => document.getElementById('ikpiNetWorth')?.textContent);
  // Inputs live on the (initially hidden) Plan → Assets tab — set via JS +
  // dispatch the same events the inline handlers listen for.
  await page.evaluate(() => {
    const el = document.getElementById('rogerRothIra');
    el.value = '50000';
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => document.getElementById('ikpiNetWorth')?.textContent);
  const delta = parseMoney(after) - parseMoney(before);
  check('RR: header total moves by +$50,000 (±$1)', Math.abs(delta - 50000) <= 1, `before=${before} after=${after} delta=${delta}`);

  // 2. localStorage persistence
  await page.evaluate(() => {
    const el = document.getElementById('rogerRothIraContrib');
    el.value = '7500';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(1000);
  await page.reload();
  await page.waitForFunction(() => !!window._lastAuditSnapshot, null, { timeout: 30000 });
  const restored = await page.evaluate(() => ({
    roger: document.getElementById('rogerRothIra')?.value,
    rogerC: document.getElementById('rogerRothIraContrib')?.value,
  }));
  check('RR: localStorage persistence (50000/7500)', restored.roger === '50000' && restored.rogerC === '7500', `${restored.roger}/${restored.rogerC}`);

  // 12. Audit invariants on the modified plan
  const audit = await page.evaluate(() => {
    const ws = window._lastAuditSnapshot?.crossValidationWarnings || [];
    return { count: ws.length, nonExpected: ws.filter(w => w?.expected !== true).map(w => w.kind) };
  });
  check('RR: zero non-expected audit warnings', audit.nonExpected.length === 0, JSON.stringify(audit));

  // 14. Console clean
  check('RR: zero console errors', errors.length === 0, errors.join(' | ').slice(0, 200));
  await ctx.close();
}

// ---------- Generic dashboard ----------
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 150)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 150)));

  await page.goto(`file:///${ROOT}/FIRE-Dashboard-Generic.html`);
  await page.waitForFunction(() => !!window._lastAuditSnapshot, null, { timeout: 30000 });

  // 13. Generic regression — NO Roth IRA UI (FR-018)
  const gen = await page.evaluate(() => ({
    rothIraInput: !!document.getElementById('rogerRothIra') || !!document.getElementById('rebeccaRothIra'),
    rothIraContrib: !!document.getElementById('rogerRothIraContrib'),
    netWorth: document.getElementById('ikpiNetWorth')?.textContent || '',
  }));
  check('Generic: NO Roth IRA balance inputs (FR-018)', !gen.rothIraInput);
  check('Generic: NO Roth IRA contribution inputs (FR-018)', !gen.rothIraContrib);
  const numeric = (s) => /\$?[\d,.]+/.test(s) && !/NaN|Calculating|—/.test(s);
  check('Generic cold-load: net worth numeric', numeric(gen.netWorth), gen.netWorth);

  const audit = await page.evaluate(() => {
    const ws = window._lastAuditSnapshot?.crossValidationWarnings || [];
    return { count: ws.length, nonExpected: ws.filter(w => w?.expected !== true).map(w => w.kind) };
  });
  check('Generic: zero non-expected audit warnings', audit.nonExpected.length === 0, JSON.stringify(audit));
  check('Generic: zero console errors', errors.length === 0, errors.join(' | ').slice(0, 200));
  await ctx.close();
}

await browser.close();
const failed = results.filter(r => !r.pass);
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
