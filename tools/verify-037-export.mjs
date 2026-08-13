// Feature 037 — numeric verifier for the Lifecycle Excel export.
//
// Proves the exported .xlsx matches the calculation engine on the RR dashboard
// with its REAL current numbers: every year's money `total` must equal the
// Lifecycle chart's own cached projection (SC-002), the row range must equal
// the plan range (SC-003), the two frames must behave (INV-3), the Settings
// sheet must record the on-screen mode (FR-020), and the export must change
// nothing (INV-6 / SC-008).
//
// Usage: node tools/verify-037-export.mjs [--generic] [--headed]
//
// Style/output mirrors tools/smoke-032.mjs: one PASS/FAIL line per check, a
// final `N/M passed`, exit non-zero on any failure.
//
// Self-contained by design:
//   - serves the repo over an ephemeral-port Node HTTP server (no python, no
//     playwright webServer), because classic `calc/*.js` resolution is more
//     reliable over http:// than file://.
//   - reads the .xlsx with a minimal ZIP + SpreadsheetML reader built on Node's
//     built-in zlib, so the verifier never depends on ExcelJS having loaded a
//     second time. An xlsx is a ZIP; `inflateRawSync` is all that is needed.
//
// Network IS required on first export: ExcelJS lazy-loads from cdnjs (research
// R1), exactly as Chart.js already does.

import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import os from 'node:os';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const ARGS = new Set(process.argv.slice(2));
const HEADED = ARGS.has('--headed');
// `--file=<name>` serves an arbitrary dashboard from the repo root. Used to
// point the verifier at a deliberately-broken COPY when proving that a check
// can actually go red (see the mutation notes on the INV-9 block below).
const FILE_ARG = [...ARGS].find((a) => a.startsWith('--file='));
const DASHBOARD = FILE_ARG
  ? FILE_ARG.slice('--file='.length)
  : (ARGS.has('--generic') ? 'FIRE-Dashboard-Generic.html' : 'FIRE-Dashboard.html');

// ---------------------------------------------------------------------------
// Check harness (same shape as tools/smoke-032.mjs)
// ---------------------------------------------------------------------------

const results = [];
const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail ?? '' });

/** Records a hard stop: the remaining checks cannot run, so say so explicitly
 *  rather than reporting a silent short list. */
function abort(reason, detail) {
  check(`ABORT — ${reason}`, false, detail ?? '');
  report();
}

function report() {
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`);
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Minimal static server
// ---------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

function startServer() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '');
    const abs = path.join(ROOT, rel);
    // Directory-traversal guard — this serves the whole repo to a local browser.
    if (!abs.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
    fs.readFile(abs, (err, buf) => {
      if (err) { res.writeHead(404).end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// ---------------------------------------------------------------------------
// Minimal ZIP reader (an .xlsx IS a ZIP; store + deflate are all Excel emits)
// ---------------------------------------------------------------------------

function readZip(buf) {
  const EOCD_SIG = 0x06054b50;
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 0xffff; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a ZIP archive (no end-of-central-directory record)');
  const entryCount = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  if (ptr === 0xffffffff) throw new Error('ZIP64 archives are not supported by this reader');

  const files = new Map();
  for (let n = 0; n < entryCount; n++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) throw new Error(`corrupt central directory at entry ${n}`);
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOff = buf.readUInt32LE(ptr + 42);
    const name = buf.toString('utf8', ptr + 46, ptr + 46 + nameLen);

    if (buf.readUInt32LE(localOff) !== 0x04034b50) throw new Error(`corrupt local header for ${name}`);
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    files.set(name, method === 0 ? Buffer.from(raw) : zlib.inflateRawSync(raw));

    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

// ---------------------------------------------------------------------------
// Minimal SpreadsheetML reader
// ---------------------------------------------------------------------------

const decodeXml = (s) =>
  s.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

/** "C" -> 2, "AB" -> 27 */
function colToIndex(ref) {
  const letters = ref.replace(/\d+$/, '');
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const out = [];
  for (const m of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    // Rich text splits one string across several <t> runs — concatenate them.
    let s = '';
    for (const t of m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) s += decodeXml(t[1]);
    out.push(s);
  }
  return out;
}

/**
 * Returns a dense 2D grid. A cell that is genuinely absent from the XML is
 * `undefined` — that distinction is load-bearing (INV-7: blank != zero).
 */
function parseSheet(xml, shared) {
  const grid = [];
  for (const rowM of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rAttr = /\br="(\d+)"/.exec(rowM[1]);
    const rowIdx = rAttr ? Number(rAttr[1]) - 1 : grid.length;
    const cells = [];
    for (const cM of rowM[2].matchAll(/<c\b([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cM[1];
      const body = cM[3] || '';
      const refM = /\br="([A-Z]+\d+)"/.exec(attrs);
      const ci = refM ? colToIndex(refM[1]) : cells.length;
      const tM = /\bt="([^"]+)"/.exec(attrs);
      const type = tM ? tM[1] : 'n';
      let value;
      if (type === 'inlineStr') {
        let s = '';
        for (const t of body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) s += decodeXml(t[1]);
        value = s;
      } else {
        const vM = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body);
        if (vM) {
          const raw = decodeXml(vM[1]);
          if (type === 's') value = shared[Number(raw)];
          else if (type === 'b') value = raw === '1';
          else if (type === 'str' || type === 'e') value = raw;
          else value = Number(raw);
        }
      }
      cells[ci] = value;
    }
    grid[rowIdx] = cells;
  }
  // Normalise holes to empty rows so callers can index safely.
  for (let i = 0; i < grid.length; i++) if (!grid[i]) grid[i] = [];
  return grid;
}

/** buffer -> { sheets: [{name, grid, xml}] } in workbook order. */
function readXlsx(buf) {
  const files = readZip(buf);
  const txt = (n) => (files.has(n) ? files.get(n).toString('utf8') : null);

  const wb = txt('xl/workbook.xml');
  if (!wb) throw new Error('xl/workbook.xml missing — not an xlsx');
  const rels = txt('xl/_rels/workbook.xml.rels') || '';
  const relTarget = new Map();
  for (const m of rels.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g)) {
    relTarget.set(m[1], m[2].replace(/^\/?xl\//, '').replace(/^\.\//, ''));
  }
  const shared = parseSharedStrings(txt('xl/sharedStrings.xml'));

  const sheets = [];
  let ordinal = 0;
  for (const m of wb.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = decodeXml((/\bname="([^"]*)"/.exec(m[1]) || [, ''])[1]);
    const rid = (/r:id="([^"]+)"/.exec(m[1]) || [])[1];
    ordinal++;
    const target = (rid && relTarget.get(rid)) || `worksheets/sheet${ordinal}.xml`;
    const xml = txt(`xl/${target}`);
    if (!xml) throw new Error(`sheet part xl/${target} missing for sheet "${name}"`);
    sheets.push({ name, xml, grid: parseSheet(xml, shared) });
  }
  return { sheets, files };
}

// ---------------------------------------------------------------------------
// Column resolution — by header text, never by blind position
// ---------------------------------------------------------------------------

const IS_PP = (h) => /purchas|today'?s|購買力|今日/i.test(String(h ?? ''));

/**
 * A money column and its purchasing-power sibling for the TOTAL PORTFOLIO.
 * Anchored so it cannot drift onto "401K total", "Withdrawals total", or the
 * INV-8 diagnostic "Total portfolio before depletion clamp".
 */
function resolveTotalColumns(headers) {
  const candidates = headers
    .map((h, i) => ({ h: String(h ?? ''), i }))
    .filter((c) => /^total portfolio\s*[(（]/i.test(c.h) || /^總投資組合\s*[(（]/.test(c.h));
  return {
    money: candidates.find((c) => !IS_PP(c.h)),
    pp: candidates.find((c) => IS_PP(c.h)),
    candidates,
  };
}

/** The money / purchasing-power index pair for any measure, by header regex. */
function measurePair(headers, re) {
  return {
    money: headers.findIndex((h) => re.test(String(h ?? '')) && !IS_PP(h)),
    pp: headers.findIndex((h) => re.test(String(h ?? '')) && IS_PP(h)),
  };
}

function resolveHeader(headers, re) {
  const i = headers.findIndex((h) => re.test(String(h ?? '')));
  return i < 0 ? null : i;
}

/**
 * INV-3, sign-aware. The money frame is the purchasing-power figure grossed up
 * by inflation, so it preserves sign and never shrinks in magnitude. Asserting
 * `money >= purchasingPower` is WRONG once a value goes negative:
 *   pp = -50,000 -> money = -57,964   (money < pp, but |money| > |pp|)
 */
function frameInvariantViolation(money, pp, isCurrentYear) {
  if (typeof money !== 'number' || typeof pp !== 'number') return 'non-numeric';
  if (Math.sign(money) !== Math.sign(pp)) return `sign mismatch (money ${money}, pp ${pp})`;
  if (Math.abs(money) + 1e-6 < Math.abs(pp)) return `|money| shrank (|${money}| < |${pp}|)`;
  if (!isCurrentYear && pp !== 0 && Math.abs(Math.abs(money) - Math.abs(pp)) <= 1e-6) {
    return `frames equal outside the current year (${money})`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const { server, port } = await startServer();
const BASE = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ headless: !HEADED });
const ctx = await browser.newContext({ acceptDownloads: true });
const page = await ctx.newPage();

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); });
page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 160)));

const cleanup = async () => {
  try { await browser.close(); } catch { /* ignore */ }
  try { server.close(); } catch { /* ignore */ }
};
process.on('exit', () => { try { server.close(); } catch { /* ignore */ } });

// --- 1. Cold load -----------------------------------------------------------

await page.goto(`${BASE}/${DASHBOARD}`);
try {
  await page.waitForFunction(
    () => {
      const el = document.getElementById('fireStatus');
      return !!window._lastLifecycleCache
        && Array.isArray(window._lastLifecycleCache.rows)
        && window._lastLifecycleCache.rows.length > 0
        && el && el.textContent && !el.textContent.includes('Calculating');
    },
    null,
    { timeout: 45_000 },
  );
} catch (e) {
  await cleanup();
  abort('cold load never completed (no lifecycle cache / verdict stuck on "Calculating")', String(e).slice(0, 160));
}
// Let the strategy ranker + BookValue extension settle.
await page.waitForTimeout(1500);

const isNumericKpi = (s) => /\d/.test(String(s)) && !/NaN|Calculating|—|40\+/.test(String(s));

// --- 2. Read the in-page truth ---------------------------------------------

const truth = await page.evaluate(() => {
  const lc = window._lastLifecycleCache;
  const rows = lc.rows;
  const chart = (typeof charts !== 'undefined' && charts.growth) ? charts.growth : null;
  const inp = (typeof getInputs === 'function') ? getInputs() : {};
  let strategy = null;
  try {
    if (typeof _lastStrategyResults !== 'undefined' && _lastStrategyResults) {
      strategy = { winnerId: _lastStrategyResults.winnerId, objective: _lastStrategyResults.objective };
    }
  } catch (e) { /* strategy ranker not available */ }
  const snapshotInputs = () => {
    const out = {};
    for (const el of document.querySelectorAll('input, select, textarea')) {
      if (!el.id) continue;
      out[el.id] = (el.type === 'checkbox' || el.type === 'radio') ? String(el.checked) : String(el.value);
    }
    return out;
  };
  const snapshotStorage = () => {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      out[k] = localStorage.getItem(k);
    }
    return out;
  };
  return {
    fireAge: lc.fireAge,
    previewActive: !!lc.previewActive,
    fireMode: window.fireMode,
    strategy,
    chartOpts: (typeof getActiveChartStrategyOptions === 'function') ? getActiveChartStrategyOptions() : null,
    mortgageOpts: (typeof getActiveMortgageStrategyOptions === 'function') ? getActiveMortgageStrategyOptions() : null,
    retirement: (typeof getRetirementStatus === 'function') ? getRetirementStatus() : null,
    currentAge: (typeof inp.ageRoger === 'number') ? inp.ageRoger : inp.agePerson1,
    endAge: inp.endAge || 95,
    rows: rows.map((r) => ({
      year: r.year, age: r.age, phase: r.phase,
      total: r.total,
      totalBookValue: Number.isFinite(r.totalBookValue) ? r.totalBookValue : null,
      hasShortfall: r.hasShortfall === true,
    })),
    chartLabels: chart ? chart.data.labels.slice() : null,
    chartTotals: chart ? chart.data.datasets[0].data.slice() : null,
    chartSeriesLabel: chart ? chart.data.datasets[0].label : null,
    kpi: {
      netWorth: document.getElementById('ikpiNetWorth')?.textContent || '',
      fireNum: document.getElementById('ikpiFIRENum')?.textContent || '',
      verdict: document.getElementById('fireStatus')?.textContent || '',
    },
    inputs: snapshotInputs(),
    storage: snapshotStorage(),
    exportFnType: typeof window.exportLifecycleProjectionXlsx,
    buildFnType: typeof globalThis.buildLifecycleExport,
  };
});

check('cold load: net worth KPI is numeric', isNumericKpi(truth.kpi.netWorth), truth.kpi.netWorth.trim());
check('cold load: FIRE number KPI is numeric', isNumericKpi(truth.kpi.fireNum), truth.kpi.fireNum.trim());
check('cold load: Lifecycle chart rendered a total series',
  Array.isArray(truth.chartTotals) && truth.chartTotals.length === truth.rows.length,
  `chartPoints=${truth.chartTotals?.length} cacheRows=${truth.rows.length}`);
check('calc/lifecycleExport.js is loaded (globalThis.buildLifecycleExport)',
  truth.buildFnType === 'function', `typeof=${truth.buildFnType}`);
check('exportLifecycleProjectionXlsx() is defined',
  truth.exportFnType === 'function', `typeof=${truth.exportFnType}`);

// --- 3. The button ----------------------------------------------------------

const BTN_SEL = '#saveBar #btnExportProjectionXlsx, #saveBar button[onclick*="exportLifecycleProjectionXlsx"], button[onclick*="exportLifecycleProjectionXlsx"]';
const btnInfo = await page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return { found: false };
  return {
    found: true,
    text: (el.textContent || '').trim().slice(0, 60),
    inSaveBar: !!el.closest('#saveBar'),
    distinctFromCsv: !/export csv/i.test(el.textContent || ''),
  };
}, BTN_SEL);
check('FR-001/FR-002: export button exists in the History → Snapshots action row (#saveBar)',
  btnInfo.found && btnInfo.inSaveBar, btnInfo.found ? `"${btnInfo.text}" inSaveBar=${btnInfo.inSaveBar}` : 'no matching button');
check('FR-023a: export button is visually distinct from "Export CSV"',
  btnInfo.found && btnInfo.distinctFromCsv, btnInfo.found ? `"${btnInfo.text}"` : 'n/a');

if (truth.exportFnType !== 'function' && !btnInfo.found) {
  await cleanup();
  abort('nothing to export — neither the button nor exportLifecycleProjectionXlsx() exists yet',
    'feature 037 implementation not present in this working tree');
}

// --- 4. Export --------------------------------------------------------------

let downloadPath = null;
let suggestedFilename = null;
let exportError = null;
try {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    // Trigger via the real button when present (proves the wiring), but with
    // el.click() so a collapsed/inactive History tab does not block the check.
    page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) el.click();
      else window.exportLifecycleProjectionXlsx();
    }, BTN_SEL),
  ]);
  suggestedFilename = download.suggestedFilename();
  downloadPath = path.join(os.tmpdir(), `verify-037-${Date.now()}.xlsx`);
  await download.saveAs(downloadPath);
} catch (e) {
  exportError = String(e).slice(0, 200);
}

check('SC-001: clicking export downloads a file', !!downloadPath, exportError || suggestedFilename);

if (!downloadPath) {
  const onScreen = await page.evaluate(() => document.body.innerText.slice(0, 0) || '');
  await cleanup();
  abort('no workbook was produced — remaining checks cannot run', exportError || onScreen);
}

const stat = fs.statSync(downloadPath);
check('FR-025: downloaded file is non-empty', stat.size > 0, `${stat.size} bytes`);

const today = new Date();
const pad = (n) => String(n).padStart(2, '0');
const expectedName = `FIRE-Lifecycle-Projection-${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}.xlsx`;
check('FR-011: filename is FIRE-Lifecycle-Projection-YYYY-MM-DD.xlsx',
  suggestedFilename === expectedName, `got="${suggestedFilename}" want="${expectedName}"`);

// --- 5. Parse the workbook --------------------------------------------------

let book = null;
try {
  book = readXlsx(fs.readFileSync(downloadPath));
} catch (e) {
  check('SC-011: workbook is a readable xlsx (ZIP + SpreadsheetML)', false, String(e.message).slice(0, 160));
  await cleanup();
  report();
}
check('SC-011: workbook is a readable xlsx (ZIP + SpreadsheetML)', true,
  book.sheets.map((s) => s.name).join(' + '));

const projection = book.sheets[0];
const settings = book.sheets[1];
check('FR-011c: sheet 1 is "Projection", sheet 2 is "Settings"',
  book.sheets.length === 2 && projection?.name === 'Projection' && settings?.name === 'Settings',
  book.sheets.map((s) => s.name).join(', '));

if (!projection) { await cleanup(); report(); }

const headers = (projection.grid[0] || []).map((h) => String(h ?? ''));
const dataRows = projection.grid.slice(1).filter((r) => r && r.some((c) => c !== undefined && c !== ''));

check('FR-007: row 1 is a non-empty header row of text labels',
  headers.length > 0 && headers.every((h) => h.length > 0) && headers.some((h) => /[A-Za-z一-鿿]/.test(h)),
  `${headers.length} headers, first=${JSON.stringify(headers.slice(0, 4))}`);

const yearCol = resolveHeader(headers, /^year\b|年份|^年$/i);
const ageCol = resolveHeader(headers, /^age\b|年齡/i);
check('FR-008: a Year column and an Age column are present',
  yearCol !== null && ageCol !== null, `yearCol=${yearCol} ageCol=${ageCol}`);

// --- 6. Row range and year sequence ----------------------------------------

check('SC-003: one row per year — workbook row count equals the plan range',
  dataRows.length === truth.rows.length,
  `workbook=${dataRows.length} chartCache=${truth.rows.length} (age ${truth.currentAge}..${truth.endAge})`);

if (yearCol !== null) {
  const wbYears = dataRows.map((r) => r[yearCol]);
  const currentCalendarYear = new Date().getFullYear();

  check('FR-006: first data row is the current calendar year',
    wbYears[0] === currentCalendarYear,
    `first=${wbYears[0]} currentYear=${currentCalendarYear}`);

  check('FR-006: last data row is the plan\'s final year',
    wbYears[wbYears.length - 1] === truth.rows[truth.rows.length - 1].year,
    `workbook=${wbYears[wbYears.length - 1]} chart=${truth.rows[truth.rows.length - 1].year}`);

  const gaps = [];
  for (let i = 1; i < wbYears.length; i++) {
    if (wbYears[i] !== wbYears[i - 1] + 1) gaps.push(`${wbYears[i - 1]}->${wbYears[i]}`);
  }
  check('SC-003/INV-2: years ascend by exactly 1 with no gaps or duplicates',
    gaps.length === 0, gaps.slice(0, 5).join(', '));
}

// --- 7. THE credibility check: money total vs the chart --------------------

const { money: moneyTotal, pp: ppTotal, candidates } = resolveTotalColumns(headers);
check('US2/FR-014: a money total column and a purchasing-power total sibling both exist',
  !!moneyTotal && !!ppTotal,
  candidates.length ? candidates.map((c) => `${c.i}:"${c.h}"`).join(' | ') : `no "total" header found in: ${JSON.stringify(headers.slice(0, 12))}`);

if (moneyTotal && ppTotal) {
  check('US2/FR-014: the purchasing-power sibling sits immediately after its money column',
    ppTotal.i === moneyTotal.i + 1, `money@${moneyTotal.i} pp@${ppTotal.i}`);
}

// Tolerance: the workbook may hold the raw value while the chart plots
// Math.round(); 0.51 covers rounding without hiding a real disagreement.
const TOL = 0.51;
const cmp = (a, b) => Math.abs(a - b) <= Math.max(TOL, Math.abs(b) * 1e-9);

if (moneyTotal && yearCol !== null) {
  const mismatches = [];
  const n = Math.min(dataRows.length, truth.rows.length);
  for (let i = 0; i < n; i++) {
    const expected = truth.rows[i].totalBookValue ?? truth.rows[i].total;
    const actual = dataRows[i][moneyTotal.i];
    if (typeof actual !== 'number' || !cmp(actual, expected)) {
      mismatches.push(`${dataRows[i][yearCol]}: want ${expected} got ${actual} (Δ ${typeof actual === 'number' ? (actual - expected).toFixed(2) : 'n/a'})`);
    }
  }
  check(`SC-002: every year's money total equals the chart's cached projection (${n} years)`,
    mismatches.length === 0, mismatches.slice(0, 6).join(' ; ') + (mismatches.length > 6 ? ` ; +${mismatches.length - 6} more` : ''));

  // Second, independent comparison against the pixels: the Chart.js dataset.
  if (Array.isArray(truth.chartTotals)) {
    const plotMismatches = [];
    const m = Math.min(dataRows.length, truth.chartTotals.length);
    for (let i = 0; i < m; i++) {
      const plotted = truth.chartTotals[i];
      const actual = dataRows[i][moneyTotal.i];
      if (typeof actual !== 'number' || Math.round(actual) !== Math.round(plotted)) {
        plotMismatches.push(`${dataRows[i][yearCol]} (${truth.chartLabels?.[i]}): plotted ${plotted} got ${actual}`);
      }
    }
    check(`SC-002: every year's money total equals the RENDERED Chart.js value (${m} points)`,
      plotMismatches.length === 0, plotMismatches.slice(0, 6).join(' ; ') + (plotMismatches.length > 6 ? ` ; +${plotMismatches.length - 6} more` : ''));
  }
}

if (ppTotal && yearCol !== null) {
  const mismatches = [];
  const n = Math.min(dataRows.length, truth.rows.length);
  for (let i = 0; i < n; i++) {
    const expected = truth.rows[i].total;
    const actual = dataRows[i][ppTotal.i];
    if (typeof actual !== 'number' || !cmp(actual, expected)) {
      mismatches.push(`${dataRows[i][yearCol]}: want ${expected} got ${actual}`);
    }
  }
  check(`SC-002: every year's purchasing-power total equals the projection's real-frame total (${n} years)`,
    mismatches.length === 0, mismatches.slice(0, 6).join(' ; ') + (mismatches.length > 6 ? ` ; +${mismatches.length - 6} more` : ''));
}

// --- 8. Frame behaviour (INV-3) --------------------------------------------

if (moneyTotal && ppTotal && dataRows.length > 1) {
  const first = dataRows[0];
  const last = dataRows[dataRows.length - 1];
  check('US2/INV-3: current-year money equals current-year purchasing power',
    typeof first[moneyTotal.i] === 'number' && typeof first[ppTotal.i] === 'number'
      && cmp(first[moneyTotal.i], first[ppTotal.i]),
    `money=${first[moneyTotal.i]} pp=${first[ppTotal.i]}`);

  // INV-3 across the WHOLE range, sign-aware. Checking only the last row would
  // miss a mid-plan depleted year, which is exactly where a naive
  // `money >= purchasingPower` assertion breaks.
  const frameViolations = [];
  dataRows.forEach((r, i) => {
    const v = frameInvariantViolation(r[moneyTotal.i], r[ppTotal.i], i === 0);
    if (v) frameViolations.push(`${r[yearCol]}: ${v}`);
  });
  check(`US2/INV-3: money and purchasing power share a sign and money never shrinks in magnitude (${dataRows.length} years)`,
    frameViolations.length === 0, frameViolations.slice(0, 6).join(' ; '));

  check('US2/INV-3: a late-plan year\'s money frame is strictly larger in magnitude',
    typeof last[moneyTotal.i] === 'number' && typeof last[ppTotal.i] === 'number'
      && Math.abs(last[moneyTotal.i]) > Math.abs(last[ppTotal.i]),
    `year=${yearCol !== null ? last[yearCol] : '?'} money=${last[moneyTotal.i]} pp=${last[ppTotal.i]}`);

  // The equality above is vacuous on a plan whose current-year portfolio is $0
  // (the Generic dashboard's default). Repeat it on a measure that is
  // definitely non-zero in year one so the check has teeth on both files.
  const isPP = (h) => /purchas|today'?s|購買力|今日/i.test(h);
  const incMoney = headers.findIndex((h) => /employment\s*income/i.test(h) && !isPP(h));
  const incPP = headers.findIndex((h) => /employment\s*income/i.test(h) && isPP(h));
  if (incMoney >= 0 && incPP >= 0) {
    check('US2/INV-3: current-year frames agree on a NON-ZERO measure (employment income)',
      typeof first[incMoney] === 'number' && first[incMoney] > 0 && cmp(first[incMoney], first[incPP]),
      `money=${first[incMoney]} pp=${first[incPP]}`);
  } else {
    check('US2/INV-3: current-year frames agree on a NON-ZERO measure (employment income)',
      false, `no employment-income column pair found in ${JSON.stringify(headers.slice(0, 30))}`);
  }
}

// --- 8b. The withdrawal join (the silent failure mode) ---------------------
//
// The withdrawal columns are sourced from the ACTIVE STRATEGY's rows, joined
// onto the lifecycle rows by `age`. Hand the builder the wrong array and ~18
// columns render blank and NOTHING throws — blank is a legitimate value in this
// model, and meta.frameFallback stays false. Only a value check catches it.
//
// Two teeth, because each alone is insufficient:
//   (a) at least one retirement year carries a non-blank money value  -> the
//       join found rows at all;
//   (b) in a late year that money value DIFFERS from its purchasing-power
//       sibling -> the `<field>BookValue` companion was found, rather than the
//       money cell silently falling back to the base (real-frame) field.

{
  const wTradRe = /^withdrawn from traditional 401k\s*[(（]/i;
  const wTradZh = /^自傳統 401K 提領\s*[(（]/;
  const wTradCands = headers
    .map((h, i) => ({ h, i }))
    .filter((c) => wTradRe.test(c.h) || wTradZh.test(c.h));
  const wMoney = wTradCands.find((c) => !IS_PP(c.h));
  const wPP = wTradCands.find((c) => IS_PP(c.h));

  check('FR-015: a Traditional-401K withdrawal column pair exists',
    !!wMoney && !!wPP,
    wTradCands.length ? wTradCands.map((c) => `${c.i}:"${c.h}"`).join(' | ') : 'no wTrad header found');

  if (wMoney && wPP) {
    // Retirement years, by the projection's own phase field.
    const retiredIdx = [];
    for (let i = 0; i < Math.min(dataRows.length, truth.rows.length); i++) {
      if (truth.rows[i].phase && truth.rows[i].phase !== 'accumulation') retiredIdx.push(i);
    }

    const populated = retiredIdx.filter((i) => typeof dataRows[i][wMoney.i] === 'number');
    const nonZero = populated.filter((i) => dataRows[i][wMoney.i] !== 0);
    check(`INV-9: withdrawal columns are populated from the active strategy, not a wrong-array join (${retiredIdx.length} retirement years)`,
      populated.length > 0,
      populated.length === 0
        ? `ALL ${retiredIdx.length} retirement years have a BLANK "${wMoney.h}" — the strategy-row join found nothing`
        : `${populated.length} populated, ${nonZero.length} of them non-zero`);

    // (b) Frame companion. Use the LATEST retirement year with a non-zero
    // value: the further from the current year, the larger the gross-up, so a
    // silent base-field fallback cannot hide inside rounding.
    const lateIdx = nonZero.length ? nonZero[nonZero.length - 1] : -1;
    if (lateIdx >= 0) {
      const m = dataRows[lateIdx][wMoney.i];
      const p = dataRows[lateIdx][wPP.i];
      check('INV-9/INV-3: a late retirement year\'s withdrawal money value differs from its purchasing-power sibling (BookValue companion found)',
        typeof m === 'number' && typeof p === 'number' && Math.abs(m) > Math.abs(p) + 1e-6,
        `year=${yearCol !== null ? dataRows[lateIdx][yearCol] : '?'} money=${m} pp=${p}`);
    } else {
      check('INV-9/INV-3: a late retirement year\'s withdrawal money value differs from its purchasing-power sibling (BookValue companion found)',
        false,
        `no retirement year carries a non-zero "${wMoney.h}" — cannot distinguish a correct join from a wrong one`);
    }
  }
}

// --- 9. Numeric cells, not strings (FR-009 / SC-006) -----------------------

if (moneyTotal) {
  const nonNumeric = dataRows.filter((r) => r[moneyTotal.i] !== undefined && typeof r[moneyTotal.i] !== 'number').length;
  check('FR-009/SC-006: money total cells are written as numbers, not formatted strings',
    nonNumeric === 0, `${nonNumeric} non-numeric cells`);
}

// --- 10. Frozen panes (FR-011b / FR-011d) ----------------------------------

const paneM = /<pane\b[^>]*>/.exec(projection.xml);
check('FR-011b/FR-011d: Projection sheet declares a frozen pane (header row + identity columns)',
  !!paneM && /state="frozen"/.test(paneM[0]) && /ySplit="[1-9]/.test(paneM[0]) && /xSplit="[1-9]/.test(paneM[0]),
  paneM ? paneM[0] : 'no <pane> element in sheet XML');

// --- 11. Settings sheet (FR-020) -------------------------------------------

if (settings) {
  const pairs = settings.grid
    .filter((r) => r && r[0] !== undefined)
    .map((r) => ({ label: String(r[0]), value: r[1] === undefined ? '' : String(r[1]) }));
  const find = (re) => pairs.find((p) => re.test(p.label));

  const modeRow = find(/fire mode|mode|模式/i);
  const modeText = modeRow ? modeRow.value.toLowerCase() : '';
  const modeAliases = { safe: /safe|安全/, exact: /exact|精確|精确/, dieWithZero: /zero|dwz|歸零|归零/ };
  check('FR-020: Settings sheet records the FIRE mode currently on screen',
    !!modeRow && modeAliases[truth.fireMode].test(modeText),
    `sheet="${modeRow ? modeRow.value : 'MISSING'}" onScreen="${truth.fireMode}"`);

  // FR-019 — the file must name the strategy the CHART is drawing, not the
  // bracket-fill default. RR ranks `aggressive-bracket-fill` on its own
  // numbers, so this is a live check rather than a tautology.
  const stratIdRow = find(/strateg.*\bid\b|策略.*id/i);
  const activeStrategy = truth.chartOpts?.strategyOverride || truth.strategy?.winnerId || 'bracket-fill-smoothed';
  check('FR-019/FR-020: Settings sheet records the ACTIVE withdrawal strategy id',
    !!stratIdRow && stratIdRow.value === activeStrategy,
    `sheet="${stratIdRow ? stratIdRow.value : 'MISSING'}" active="${activeStrategy}"`);

  const stratNameRow = pairs.find((p) => /strateg|策略/i.test(p.label) && !/\bid\b/i.test(p.label));
  check('FR-020: Settings sheet records a readable withdrawal-strategy name',
    !!stratNameRow && stratNameRow.value.length > 0,
    stratNameRow ? stratNameRow.value : 'MISSING');

  const mortRow = find(/mortgage|房貸|房贷/i);
  const activeMortgage = truth.mortgageOpts?.mortgageStrategyOverride || 'invest-keep-paying';
  check('FR-019: Settings sheet records the active mortgage strategy',
    !!mortRow && mortRow.value === activeMortgage,
    `sheet="${mortRow ? mortRow.value : 'MISSING'}" active="${activeMortgage}"`);

  const tsRow = find(/exported at|timestamp|時間|时间/i);
  check('FR-020: Settings sheet records an export timestamp',
    !!tsRow && !Number.isNaN(Date.parse(tsRow.value)),
    tsRow ? tsRow.value : 'MISSING');

  // FR-020/FR-021 — the transition year must reflect the DECLARED retirement,
  // and must read as "not applicable" (never a bare 0 or a blank) when the
  // user has not declared one.
  const transRow = find(/retirement transition year|退休.*(轉換|转换).*年/i);
  const rs = truth.retirement || {};
  const declared = rs.retired === true
    || (Array.isArray(rs.persons) && rs.persons.some((p) => p && p.retired));
  const declaredYear = rs.retirementYear
    ?? (Array.isArray(rs.persons) ? Math.max(...rs.persons.filter((p) => p && p.retired).map((p) => p.retirementYear || 0)) : 0);
  check('FR-020/FR-021: Settings sheet records the retirement transition year',
    !!transRow && (declared ? transRow.value === String(declaredYear) : /^[—-]$|not|n\/?a|無|无/i.test(transRow.value)),
    `sheet="${transRow ? transRow.value : 'MISSING'}" declared=${declared}${declared ? ' year=' + declaredYear : ''}`);
}

// --- 12. Purity (FR-022 / INV-6 / SC-008) ----------------------------------

const after = await page.evaluate(() => {
  const out = { inputs: {}, storage: {} };
  for (const el of document.querySelectorAll('input, select, textarea')) {
    if (!el.id) continue;
    out.inputs[el.id] = (el.type === 'checkbox' || el.type === 'radio') ? String(el.checked) : String(el.value);
  }
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    out.storage[k] = localStorage.getItem(k);
  }
  out.kpi = {
    netWorth: document.getElementById('ikpiNetWorth')?.textContent || '',
    fireNum: document.getElementById('ikpiFIRENum')?.textContent || '',
    verdict: document.getElementById('fireStatus')?.textContent || '',
  };
  return out;
});

const diffKeys = (a, b) => Object.keys({ ...a, ...b }).filter((k) => a[k] !== b[k]);
const inputDiff = diffKeys(truth.inputs, after.inputs);
const storageDiff = diffKeys(truth.storage, after.storage);

check('FR-022/SC-008: exporting changed no input value',
  inputDiff.length === 0, inputDiff.slice(0, 8).map((k) => `${k}: "${truth.inputs[k]}"->"${after.inputs[k]}"`).join(' ; '));
check('FR-022/INV-6: exporting wrote nothing to localStorage',
  storageDiff.length === 0, storageDiff.slice(0, 5).join(', '));
check('FR-022/SC-008: exporting changed no KPI text',
  truth.kpi.netWorth === after.kpi.netWorth
  && truth.kpi.fireNum === after.kpi.fireNum
  && truth.kpi.verdict === after.kpi.verdict,
  `netWorth "${truth.kpi.netWorth.trim()}"->"${after.kpi.netWorth.trim()}"`);

check('console is clean across load + export', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 220));

// ---------------------------------------------------------------------------

console.log(`\n--- verify-037-export: ${DASHBOARD} @ ${BASE} ---`);
console.log(`plan: age ${truth.currentAge} → ${truth.endAge} · FIRE age ${truth.fireAge} · mode ${truth.fireMode} · strategy ${truth.chartOpts?.strategyOverride || truth.strategy?.winnerId || 'bracket-fill-smoothed'}`);
console.log(`verdict: ${truth.kpi.verdict.trim()}`);
console.log(`workbook: ${suggestedFilename} (${stat.size} bytes) -> ${downloadPath}\n`);

await cleanup();
report();
