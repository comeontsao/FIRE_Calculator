// Targeted smoke for the Traditional-401K funding-source split (RR only).
// Verifies: both inputs exist, their SUM drives every calc (net worth moves by
// the combined delta), the total readout echoes the sum, legacy single-field
// localStorage migrates into self, snapshot history records the split, the CSV
// carries the two appended columns, and Copy Debug emits both halves + the sum.
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url))).replace(/\\/g, '/');
const RR = `file:///C:/Users/roger/Documents/GitHub/FIRE_Calculator/FIRE-Dashboard.html`;
const results = [];
const check = (name, pass, detail) => results.push({ name, pass, detail: detail ?? '' });

const browser = await chromium.launch();
const errors = [];

// ---------- A. Fresh load: inputs exist, sum feeds the math ----------
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 160)));

  await page.goto(RR);
  await page.waitForFunction(() => !!window._lastAuditSnapshot, null, { timeout: 30000 });

  const present = await page.evaluate(() => ({
    self: !!document.getElementById('roger401kSelf'),
    match: !!document.getElementById('roger401kMatch'),
    old: !!document.getElementById('roger401k'),
    total: !!document.getElementById('roger401kTradTotal'),
  }));
  check('split inputs exist', present.self && present.match, JSON.stringify(present));
  check('legacy single input removed', !present.old, `#roger401k present=${present.old}`);
  check('total readout element exists', present.total);

  // Set a known split and confirm getInputs() sums it.
  const sums = await page.evaluate(() => {
    const set = (id, v) => {
      const el = document.getElementById(id);
      el.value = String(v);
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('roger401kSelf', 26000);
    set('roger401kMatch', 8091);
    const inp = getInputs();
    return {
      self: inp.roger401kSelf,
      match: inp.roger401kMatch,
      trad: inp.roger401kTrad,
      total401k: inp.roger401k,
      roth: inp.roger401kRoth,
      readout: document.getElementById('roger401kTradTotal').textContent,
    };
  });
  check('inp.roger401kTrad === self + match', sums.trad === 34091,
    `self=${sums.self} match=${sums.match} trad=${sums.trad}`);
  check('inp.roger401k still = trad + roth', sums.total401k === sums.trad + sums.roth,
    `${sums.total401k} === ${sums.trad}+${sums.roth}`);
  check('total readout echoes the sum', sums.readout === '$34,091', sums.readout);

  // Equivalence: the SAME total entered two different ways must produce an
  // identical net worth. This is the "calculations unchanged" guarantee.
  const equiv = await page.evaluate(() => {
    const set = (id, v) => {
      const el = document.getElementById(id);
      el.value = String(v);
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const nw = () => document.getElementById('totalNetWorth').textContent;
    set('roger401kSelf', 34091); set('roger401kMatch', 0);
    const allSelf = nw();
    set('roger401kSelf', 20000); set('roger401kMatch', 14091);
    const split = nw();
    set('roger401kSelf', 0); set('roger401kMatch', 34091);
    const allMatch = nw();
    return { allSelf, split, allMatch };
  });
  check('net worth depends only on the SUM, not the split',
    equiv.allSelf === equiv.split && equiv.split === equiv.allMatch,
    JSON.stringify(equiv));

  await ctx.close();
}

// ---------- B. Legacy state migration ----------
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('PAGEERROR(migrate): ' + String(e).slice(0, 160)));

  // Seed a pre-split saved state carrying only the old single key.
  await page.goto(RR);
  await page.evaluate(() => {
    localStorage.setItem('fire_dashboard_state', JSON.stringify({
      roger401k: '34091', roger401kRoth: '67805', rogerStocks: '240000',
    }));
  });
  await page.reload();
  await page.waitForFunction(() => !!window._lastAuditSnapshot, null, { timeout: 30000 });

  const migrated = await page.evaluate(() => ({
    self: document.getElementById('roger401kSelf').value,
    match: document.getElementById('roger401kMatch').value,
    trad: getInputs().roger401kTrad,
  }));
  check('legacy roger401k migrates into self', migrated.self === '34091', `self=${migrated.self}`);
  check('legacy migration sets match to 0', migrated.match === '0', `match=${migrated.match}`);
  check('legacy migration preserves the Traditional TOTAL', migrated.trad === 34091, `trad=${migrated.trad}`);

  // A real split must survive a save/reload round-trip (and never be clobbered
  // by the migration branch on subsequent loads).
  await page.evaluate(() => {
    const set = (id, v) => {
      const el = document.getElementById(id);
      el.value = String(v);
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('roger401kSelf', 26000);
    set('roger401kMatch', 8091);
  });
  await page.reload();
  await page.waitForFunction(() => !!window._lastAuditSnapshot, null, { timeout: 30000 });
  const persisted = await page.evaluate(() => ({
    self: document.getElementById('roger401kSelf').value,
    match: document.getElementById('roger401kMatch').value,
  }));
  check('split persists across reload (migration does not clobber)',
    persisted.self === '26000' && persisted.match === '8091', JSON.stringify(persisted));

  // ---------- C. Snapshot + CSV ----------
  const snap = await page.evaluate(() => {
    const inp = getInputs();
    // Build the snapshot fields the way saveSnapshot() does, then round-trip
    // through the real serializer/parser.
    const row = {
      date: new Date().toISOString(),
      roger401k: inp.roger401k, rogerStocks: inp.rogerStocks,
      rebeccaStocks: inp.rebeccaStocks, cashSavings: inp.cashSavings,
      otherAssets: inp.otherAssets, annualIncome: inp.annualIncome,
      monthlySpend: 6000, contrib401k: inp.contrib401k, empMatch: inp.empMatch,
      monthlySavings: inp.monthlySavings, netWorth: 1, accessible: 1, locked: 1,
      savingsRate: 30, fireTarget: 1, yearsToFire: 5,
      targetCountry: 'Taiwan', targetCountryId: 'tw',
      rogerRothIra: inp.rogerRothIra, rebeccaRothIra: inp.rebeccaRothIra,
      roger401kSelf: inp.roger401kSelf, roger401kMatch: inp.roger401kMatch,
    };
    const csv = snapshotsToCSV([row]);
    const back = csvToSnapshots(csv);
    return {
      headerCols: csv.split('\n')[0].split(',').length,
      lastHeaders: csv.split('\n')[0].split(',').slice(-2),
      self: back[0].roger401kSelf,
      match: back[0].roger401kMatch,
      combined: back[0].roger401k,
      rebeccaRothIra: back[0].rebeccaRothIra,
    };
  });
  check('CSV has 23 columns', snap.headerCols === 23, String(snap.headerCols));
  check('CSV appends the two split columns last',
    snap.lastHeaders.join('|') === 'Roger 401K Trad Self|Roger 401K Trad Match',
    snap.lastHeaders.join('|'));
  check('CSV round-trip preserves the split', snap.self === 26000 && snap.match === 8091,
    `self=${snap.self} match=${snap.match}`);
  check('CSV split halves sum to the Traditional balance', snap.self + snap.match === 34091,
    String(snap.self + snap.match));
  check('CSV 401K column still = Trad + Roth total', snap.combined === 34091 + 67805,
    String(snap.combined));
  check('feature-032 Roth IRA column did not shift', snap.rebeccaRothIra === 59021,
    String(snap.rebeccaRothIra));

  // ---------- D. History table sub-line ----------
  const rowHTML = await page.evaluate(() => {
    const mk = (self, match) => ({
      date: '2026-08-07T00:00:00.000Z', roger401k: 101896, rogerStocks: 1,
      rebeccaStocks: 1, cashSavings: 1, otherAssets: 0, annualIncome: 1,
      monthlySpend: 1, contrib401k: 1, empMatch: 1, monthlySavings: 1,
      netWorth: 1, accessible: 1, locked: 1, savingsRate: 1, fireTarget: 1,
      yearsToFire: 1, targetCountry: 'US', targetCountryId: 'us',
      rogerRothIra: 0, rebeccaRothIra: 0,
      roger401kSelf: self, roger401kMatch: match,
    });
    // Legacy row (no split) + new row (with split).
    localStorage.setItem('fire_dashboard_snapshots',
      JSON.stringify([mk(undefined, undefined), mk(26000, 8091)]));
    renderSnapshotHistory();
    const rows = document.querySelectorAll('#snapshotBody tr');
    // Table renders newest-first, so rows[0] is the split row.
    return { newRow: rows[0].cells[3].innerHTML, legacyRow: rows[1].cells[3].innerHTML };
  });
  check('history 401K cell shows the self/match sub-line',
    /self/.test(rowHTML.newRow) && /\$26K/.test(rowHTML.newRow) && /\$8K/.test(rowHTML.newRow),
    rowHTML.newRow.replace(/<[^>]+>/g, ' ').trim());
  check('history legacy row renders NO misleading $0 sub-line',
    !/self/.test(rowHTML.legacyRow),
    rowHTML.legacyRow.replace(/<[^>]+>/g, ' ').trim());

  // ---------- E. Copy Debug ----------
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(() => {
    const set = (id, v) => {
      const el = document.getElementById(id);
      el.value = String(v);
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('roger401kSelf', 26000);
    set('roger401kMatch', 8091);
  });
  await page.click('#debugSnapshotBtn');
  await page.waitForTimeout(1200);
  const dbg = await page.evaluate(async () => {
    const txt = await navigator.clipboard.readText();
    const o = JSON.parse(txt);
    return {
      comp: o.trad401kComposition,
      inSelf: o.inputs.roger401kSelf,
      inMatch: o.inputs.roger401kMatch,
      hasOldKey: Object.prototype.hasOwnProperty.call(o.inputs, 'roger401k'),
      topKeys: Object.keys(o).length,
    };
  });
  check('Copy Debug produces parseable JSON', dbg.topKeys > 5, `${dbg.topKeys} top-level keys`);
  check('Copy Debug inputs carry both halves',
    dbg.inSelf === '26000' && dbg.inMatch === '8091', JSON.stringify({ s: dbg.inSelf, m: dbg.inMatch }));
  check('Copy Debug echoes the derived Traditional total',
    dbg.comp && dbg.comp.self === 26000 && dbg.comp.employerMatch === 8091 && dbg.comp.tradTotal === 34091,
    JSON.stringify(dbg.comp));
  check('Copy Debug no longer emits the removed roger401k input', !dbg.hasOldKey);

  await ctx.close();
}

check('zero console errors across all scenarios', errors.length === 0, errors.join(' | ').slice(0, 300));

await browser.close();

let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  [${r.detail}]` : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
