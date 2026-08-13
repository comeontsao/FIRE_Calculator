/**
 * E2E coverage for feature 037 — Year-by-Year Lifecycle Spreadsheet Export.
 *
 * Automates `specs/037-lifecycle-excel-export/quickstart.md` and the §C-4 test
 * obligations in `specs/037-lifecycle-excel-export/contracts/lifecycle-export.contract.md`.
 * Task coverage: T015 (US1 structure), T016 (US1 chart parity), T021 (US2
 * frames), T027 (US3 fidelity + provenance), T028 (US3 purity), T032 (US4
 * transitions + shortfall), plus the SC-010 negative case.
 *
 * HOW THE WORKBOOK IS READ
 * ------------------------
 * The download is saved by Playwright, pushed back into the page as base64 and
 * parsed with the ExcelJS instance the export itself just lazy-loaded. That
 * avoids adding a spreadsheet parser to the repo's devDependencies (Principle
 * V) and reads the artifact with the same library that wrote it.
 * `tools/verify-037-export.mjs` deliberately uses an INDEPENDENT, hand-rolled
 * ZIP + SpreadsheetML reader, so the two paths cross-check each other.
 *
 * WHY COLUMNS ARE RESOLVED BY HEADER, NOT BY POSITION
 * ---------------------------------------------------
 * The registry is ~68 columns wide and its order is a contract (FR-015a/b),
 * but pinning a test to a literal index would turn any future insertion into a
 * false failure. Every lookup below goes through `findCol()` and reports the
 * whole header row when it misses, so a genuine registry change is legible.
 *
 * WHY PHASE/SHORTFALL ARE ASSERTED STRUCTURALLY
 * --------------------------------------------
 * The phase column's rendered text is localised and not fixed by the contract.
 * These tests therefore assert that the workbook's phase value changes on
 * exactly the rows where the chart's own cached `phase` changes — which is the
 * actual requirement (FR-016) and is immune to wording changes.
 *
 * Conventions follow `tests/e2e/retirement-status.spec.ts`:
 *   - Loads over HTTP (`http://127.0.0.1:8766`) so `calc/*.js` resolves.
 *   - Clean localStorage + reload, then wait for the first compute.
 *   - Chromium-only via `playwright.config.ts`.
 *   - Every case runs against BOTH dashboards (SC-009).
 *
 * NETWORK: exporting needs cdnjs on the first click of each page session
 * (ExcelJS lazy-loads, research R1) — the same requirement the Lifecycle chart
 * already has for Chart.js.
 */

import { test, expect, type Page, type Download } from '@playwright/test';
import fs from 'node:fs';

/**
 * In-page classic-script global. Declared (not imported) purely so the
 * `page.evaluate` callbacks below type-check — it only ever resolves inside
 * the browser, where it is a lexical global rather than a `window` property.
 */
declare const charts: any;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Matches `playwright.config.ts > webServer`. */
const HTTP_BASE = 'http://127.0.0.1:8766';

const RR_FILE = 'FIRE-Dashboard.html';
const GENERIC_FILE = 'FIRE-Dashboard-Generic.html';

/** Let recalc / re-render settle after a gesture. */
const SETTLE_MS = 600;

/** `RETIREMENT_BASE_YEAR` hardcoded in both dashboards. */
const CURRENT_YEAR = 2026;

/**
 * The export control. Accepts either an explicit id or the project's prevailing
 * `onclick="handler()"` wiring used by every other button in `#saveBar`.
 */
const EXPORT_BTN =
  '#btnExportProjectionXlsx, #saveBar button[onclick*="exportLifecycleProjectionXlsx"], button[onclick*="exportLifecycleProjectionXlsx"]';

/**
 * Where a refusal message may surface (FR-024). Both dashboards route it
 * through `showToast()` → `#saveToast`, which self-hides after 3 s — hence the
 * short poll in the SC-010 test rather than a read after the download timeout.
 * Kept as one constant so a change in the messaging surface is a one-line fix.
 * `alert()` dialogs are captured separately.
 */
const MESSAGE_SELECTORS =
  '#saveToast, #lifecycleExportStatus, #exportProjectionStatus, [role="alert"], .toast, .export-error';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface DashboardFixture {
  readonly key: 'rr' | 'generic';
  readonly fileName: string;
  /** Retirement controls diverge between the two files — see retirement-status.spec.ts. */
  readonly toggleSel: string;
  readonly yearSel: string;
  readonly ageField: 'ageRoger' | 'agePerson1';
}

const DASHBOARDS: readonly DashboardFixture[] = [
  {
    key: 'rr',
    fileName: RR_FILE,
    toggleSel: '#retirementToggle',
    yearSel: '#retirementYear',
    ageField: 'ageRoger',
  },
  {
    key: 'generic',
    fileName: GENERIC_FILE,
    toggleSel: '#retirementTogglePerson1',
    yearSel: '#retirementYearPerson1',
    ageField: 'agePerson1',
  },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Cell = string | number | boolean | undefined;

interface ParsedSheet {
  name: string;
  rows: Cell[][];
  /** JSON of `worksheet.views` — carries the frozen-pane declaration. */
  views: string;
}

interface ChartTruth {
  fireAge: number;
  fireMode: string;
  currentAge: number;
  endAge: number;
  strategyId: string;
  rows: Array<{
    year: number;
    age: number;
    phase: string;
    total: number;
    totalBookValue: number | null;
    hasShortfall: boolean;
  }>;
  /** The literal numbers Chart.js plotted for the total-portfolio series. */
  chartTotals: number[];
  verdict: string;
}

// ---------------------------------------------------------------------------
// Load helpers
// ---------------------------------------------------------------------------

/** Waits until the plan has computed AND the Lifecycle chart has cached its rows. */
async function waitForProjection(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const el = document.getElementById('fireStatus');
      const lc = (window as any)._lastLifecycleCache;
      return (
        el != null &&
        el.textContent != null &&
        !el.textContent.includes('Calculating') &&
        lc != null &&
        Array.isArray(lc.rows) &&
        lc.rows.length > 0
      );
    },
    undefined,
    { timeout: 20_000 },
  );
}

async function loadDashboard(page: Page, fileName: string): Promise<void> {
  await page.goto(`${HTTP_BASE}/${fileName}`);
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await waitForProjection(page);
  // The strategy ranker and the *BookValue extension settle just after the
  // first verdict paints; exporting before that would read a half-built cache.
  await page.waitForTimeout(SETTLE_MS);
}

/** Generic only: force single-adult mode so its Person-1 controls stand in for RR's flat toggle. */
async function prepareSingleEarner(page: Page, dash: DashboardFixture): Promise<void> {
  if (dash.key !== 'generic') return;
  const current = Number(await page.locator('#adultCount').inputValue());
  if (current === 1) return;
  await page.locator('#adultCountDec').click();
  await page.waitForTimeout(SETTLE_MS);
}

// ---------------------------------------------------------------------------
// Truth readers
// ---------------------------------------------------------------------------

async function readChartTruth(page: Page): Promise<ChartTruth> {
  return page.evaluate(() => {
    const lc = (window as any)._lastLifecycleCache;
    // `charts` is a top-level classic-script binding, NOT a window property —
    // reading `window.charts` silently yields undefined (see CLAUDE.md's
    // "classic-script global scope is ONE shared lexical scope" lesson).
    const chart = typeof charts !== 'undefined' && charts.growth ? charts.growth : null;
    const inp = (window as any).getInputs();
    let strategyId = 'bracket-fill-smoothed';
    try {
      const opts = (window as any).getActiveChartStrategyOptions?.();
      if (opts && opts.strategyOverride) strategyId = opts.strategyOverride;
    } catch {
      /* default strategy */
    }
    return {
      fireAge: lc.fireAge,
      fireMode: (window as any).fireMode,
      currentAge: typeof inp.ageRoger === 'number' ? inp.ageRoger : inp.agePerson1,
      endAge: inp.endAge || 95,
      strategyId,
      rows: lc.rows.map((r: any) => ({
        year: r.year,
        age: r.age,
        phase: r.phase,
        total: r.total,
        totalBookValue: Number.isFinite(r.totalBookValue) ? r.totalBookValue : null,
        hasShortfall: r.hasShortfall === true,
      })),
      chartTotals: chart ? chart.data.datasets[0].data.slice() : [],
      verdict: (document.getElementById('fireStatus')?.textContent || '').trim(),
    };
  });
}

interface StateSnapshot {
  inputs: Record<string, string>;
  storage: Record<string, string>;
  kpi: Record<string, string>;
}

async function snapshotState(page: Page): Promise<StateSnapshot> {
  return page.evaluate(() => {
    const inputs: Record<string, string> = {};
    document.querySelectorAll('input, select, textarea').forEach((node) => {
      const el = node as HTMLInputElement;
      if (!el.id) return;
      inputs[el.id] = el.type === 'checkbox' || el.type === 'radio' ? String(el.checked) : String(el.value);
    });
    const storage: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      storage[k] = localStorage.getItem(k)!;
    }
    return {
      inputs,
      storage,
      kpi: {
        netWorth: document.getElementById('ikpiNetWorth')?.textContent || '',
        fireNum: document.getElementById('ikpiFIRENum')?.textContent || '',
        verdict: document.getElementById('fireStatus')?.textContent || '',
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Export + parse
// ---------------------------------------------------------------------------

/** Clicks the export control. `el.click()` so an inactive History tab cannot block it. */
async function triggerExport(page: Page): Promise<void> {
  await page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) throw new Error(`export control not found (selector: ${sel})`);
    el.click();
  }, EXPORT_BTN);
}

/**
 * Reads a downloaded workbook with the page's own ExcelJS instance.
 * `null` cells (genuinely empty) come back as `undefined` so blank stays
 * distinguishable from a measured zero (INV-7).
 */
async function parseWorkbook(page: Page, download: Download): Promise<ParsedSheet[]> {
  const filePath = await download.path();
  expect(filePath, 'Playwright should have persisted the download to disk').toBeTruthy();
  const b64 = fs.readFileSync(filePath!).toString('base64');

  return page.evaluate(async (data: string) => {
    const Excel = (window as any).ExcelJS;
    if (!Excel) throw new Error('window.ExcelJS is not defined — the export did not leave its library loaded');
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const wb = new Excel.Workbook();
    await wb.xlsx.load(bytes.buffer);

    const norm = (v: any) => {
      if (v === null || v === undefined) return undefined;
      if (typeof v === 'object') {
        if (Array.isArray(v.richText)) return v.richText.map((r: any) => r.text).join('');
        if ('result' in v) return v.result;
        if ('text' in v) return v.text;
        if (v instanceof Date) return v.toISOString();
        return String(v);
      }
      return v;
    };

    const sheets: Array<{ name: string; rows: any[][]; views: string }> = [];
    wb.eachSheet((ws: any) => {
      const rows: any[][] = [];
      ws.eachRow({ includeEmpty: true }, (row: any) => {
        const cells: any[] = [];
        row.eachCell({ includeEmpty: true }, (cell: any, colNumber: number) => {
          cells[colNumber - 1] = norm(cell.value);
        });
        rows.push(cells);
      });
      sheets.push({ name: ws.name, rows, views: JSON.stringify(ws.views || []) });
    });
    return sheets;
  }, b64);
}

/** Export and parse in one step. Fails loudly if no download arrives. */
async function exportAndParse(page: Page): Promise<ParsedSheet[]> {
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), triggerExport(page)]);
  return parseWorkbook(page, download);
}

// ---------------------------------------------------------------------------
// Sheet helpers
// ---------------------------------------------------------------------------

const headerRow = (sheet: ParsedSheet): string[] => (sheet.rows[0] || []).map((c) => String(c ?? ''));

const dataRows = (sheet: ParsedSheet): Cell[][] =>
  sheet.rows.slice(1).filter((r) => r && r.some((c) => c !== undefined && c !== ''));

const IS_PP = /purchas|today'?s|購買力|今日/i;

/** Resolves a column by header regex; throws with the full header row on a miss. */
function findCol(headers: string[], re: RegExp, label: string): number {
  const i = headers.findIndex((h) => re.test(h));
  if (i < 0) {
    throw new Error(`No column header matched ${label} (${re}). Header row was:\n${JSON.stringify(headers, null, 1)}`);
  }
  return i;
}

/**
 * The money / purchasing-power pair for the TOTAL PORTFOLIO measure — the one
 * SC-002 is about. Deliberately anchored so it cannot drift onto a neighbour
 * that merely contains the word ("401K total", "Withdrawals total", "Total
 * portfolio before depletion clamp").
 */
function totalColumns(headers: string[]): { money: number; pp: number } {
  const candidates = headers
    .map((h, i) => ({ h, i }))
    .filter((c) => /^total portfolio\s*[(（]/i.test(c.h) || /^總投資組合\s*[(（]/.test(c.h));
  const money = candidates.find((c) => !IS_PP.test(c.h));
  const pp = candidates.find((c) => IS_PP.test(c.h));
  if (!money || !pp) {
    throw new Error(
      `Expected a "Total portfolio" money column and its purchasing-power sibling. ` +
        `Matched: ${JSON.stringify(candidates)}. Header row was:\n${JSON.stringify(headers, null, 1)}`,
    );
  }
  return { money: money.i, pp: pp.i };
}

const num = (c: Cell): number => {
  expect(typeof c, `FR-009: cell must be a number, got ${typeof c} (${String(c)})`).toBe('number');
  return c as number;
};

/** Rounding tolerance: the workbook may hold the raw value, the chart plots Math.round(). */
const NEAR = 0.51;

// ===========================================================================
// T015 [US1] — structure: one row per year, current year → plan end
// ===========================================================================

test.describe('037 lifecycle-export — US1: the whole plan as one year-per-row table', () => {
  for (const dash of DASHBOARDS) {
    test(`[${dash.key}] downloads a workbook with one row per plan year, no gaps (SC-003)`, async ({ page }) => {
      await loadDashboard(page, dash.fileName);
      const truth = await readChartTruth(page);

      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30_000 }),
        triggerExport(page),
      ]);

      // FR-011 — dated, collision-free filename.
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      expect(download.suggestedFilename()).toBe(
        `FIRE-Lifecycle-Projection-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.xlsx`,
      );

      const sheets = await parseWorkbook(page, download);

      // FR-011c — two sheets, in order.
      expect(sheets.map((s) => s.name)).toEqual(['Projection', 'Settings']);

      const projection = sheets[0];
      const headers = headerRow(projection);
      const rows = dataRows(projection);

      // FR-007 — header row of plain-language labels.
      expect(headers.length, 'the sheet must be wide (FR-015: every per-year figure)').toBeGreaterThan(10);
      expect(headers.every((h) => h.trim().length > 0), `blank header found in ${JSON.stringify(headers)}`).toBe(true);

      // FR-008 — year and age on every row.
      const yearCol = findCol(headers, /^year\b|年份|^年$/i, 'Year');
      const ageCol = findCol(headers, /^age\b|年齡/i, 'Age');

      // SC-003 / FR-005 — exactly one row per year of the plan.
      expect(rows.length, 'workbook row count must equal the chart projection row count').toBe(truth.rows.length);

      const years = rows.map((r) => num(r[yearCol]));

      // FR-006 — first row is the current calendar year. If this fails on a
      // New Year rollover, RETIREMENT_BASE_YEAR in both dashboards is stale.
      expect(years[0], 'FR-006: first data row must be the current calendar year').toBe(new Date().getFullYear());
      expect(years[years.length - 1], "FR-006: last data row must be the plan's final year").toBe(
        truth.rows[truth.rows.length - 1].year,
      );

      // No gaps, no duplicates, strictly ascending by 1 (INV-2).
      for (let i = 1; i < years.length; i++) {
        expect(years[i], `year sequence broke at row ${i + 2}`).toBe(years[i - 1] + 1);
      }

      // Ages track the plan range and stay aligned with the projection.
      rows.forEach((r, i) => expect(num(r[ageCol])).toBe(truth.rows[i].age));

      // FR-011b / FR-011d — frozen header row AND frozen identity columns.
      expect(projection.views, 'FR-011b/d: Projection sheet must declare frozen panes').toMatch(/"state"\s*:\s*"frozen"/);
      const view = JSON.parse(projection.views)[0] || {};
      expect(view.ySplit, 'FR-011b: header row must stay visible while scrolling down').toBeGreaterThanOrEqual(1);
      expect(view.xSplit, 'FR-011d: identity columns must stay visible while scrolling right').toBeGreaterThanOrEqual(1);
    });
  }
});

// ===========================================================================
// T016 [US1] — chart parity, the feature's credibility check (SC-002)
// ===========================================================================

test.describe('037 lifecycle-export — US1: the file agrees with the Lifecycle chart', () => {
  for (const dash of DASHBOARDS) {
    test(`[${dash.key}] every year's money total equals the rendered chart value (SC-002)`, async ({ page }) => {
      await loadDashboard(page, dash.fileName);
      const truth = await readChartTruth(page);

      const sheets = await exportAndParse(page);
      const projection = sheets[0];
      const headers = headerRow(projection);
      const rows = dataRows(projection);
      const { money, pp } = totalColumns(headers);
      const yearCol = findCol(headers, /^year\b|年份|^年$/i, 'Year');

      // Sample the three years the quickstart names explicitly...
      const transitionIdx = truth.rows.findIndex((r) => r.age === truth.fireAge);
      const sampleIdx = [1, transitionIdx >= 0 ? transitionIdx : Math.floor(rows.length / 2), rows.length - 1];
      for (const i of sampleIdx) {
        const expected = truth.rows[i].totalBookValue ?? truth.rows[i].total;
        expect(
          num(rows[i][money]),
          `SC-002: year ${rows[i][yearCol]} money total must match the chart projection`,
        ).toBeCloseTo(expected, 1);
      }

      // ...then prove it for the FULL range, which is what SC-002 actually says
      // ("zero disagreements across the full plan range").
      const cacheMismatches: string[] = [];
      const plottedMismatches: string[] = [];
      rows.forEach((r, i) => {
        const expected = truth.rows[i].totalBookValue ?? truth.rows[i].total;
        const actual = r[money];
        if (typeof actual !== 'number' || Math.abs(actual - expected) > NEAR) {
          cacheMismatches.push(`${r[yearCol]}: want ${expected} got ${String(actual)}`);
        }
        const plotted = truth.chartTotals[i];
        if (typeof actual !== 'number' || Math.round(actual) !== Math.round(plotted)) {
          plottedMismatches.push(`${r[yearCol]}: plotted ${plotted} got ${String(actual)}`);
        }
      });
      expect(cacheMismatches, 'SC-002: money total vs the cached chart projection').toEqual([]);
      expect(plottedMismatches, 'SC-002: money total vs the values Chart.js actually plotted').toEqual([]);

      // The purchasing-power sibling must track the projection's real frame.
      const ppMismatches: string[] = [];
      rows.forEach((r, i) => {
        const actual = r[pp];
        if (typeof actual !== 'number' || Math.abs(actual - truth.rows[i].total) > NEAR) {
          ppMismatches.push(`${r[yearCol]}: want ${truth.rows[i].total} got ${String(actual)}`);
        }
      });
      expect(ppMismatches, 'SC-002: purchasing-power total vs the projection').toEqual([]);
    });
  }
});

// ===========================================================================
// T021 [US2] — both frames, unambiguously labelled
// ===========================================================================

test.describe('037 lifecycle-export — US2: money and purchasing power side by side', () => {
  for (const dash of DASHBOARDS) {
    test(`[${dash.key}] current-year frames are equal and a late year's money is larger (INV-3)`, async ({ page }) => {
      await loadDashboard(page, dash.fileName);

      const sheets = await exportAndParse(page);
      const projection = sheets[0];
      const headers = headerRow(projection);
      const rows = dataRows(projection);
      const { money, pp } = totalColumns(headers);

      const first = rows[0];
      const last = rows[rows.length - 1];

      // US2 scenario 3 — no inflation has elapsed in the current year.
      expect(num(first[money]), 'INV-3: current-year money must equal current-year purchasing power').toBeCloseTo(
        num(first[pp]),
        1,
      );

      // US2 scenario 4 — under positive inflation, later money is the larger.
      // Guard the premise: with a zero balance the comparison is vacuous.
      expect(num(last[pp]), 'a late-plan year must carry a non-zero balance for this comparison to mean anything')
        .toBeGreaterThan(0);
      expect(num(last[money]), "INV-3: a late year's money must exceed its purchasing power").toBeGreaterThan(
        num(last[pp]),
      );

      // FR-014 / contract C-1.3 — every money column has an adjacent
      // purchasing-power sibling, and no purchasing-power column is orphaned.
      const ppIdx = headers.map((h, i) => ({ h, i })).filter((c) => IS_PP.test(c.h));
      expect(ppIdx.length, 'FR-014: the sheet must carry purchasing-power columns').toBeGreaterThan(0);
      const orphans = ppIdx.filter((c) => c.i === 0 || IS_PP.test(headers[c.i - 1]));
      expect(
        orphans.map((c) => `${c.i}:"${c.h}"`),
        'C-1.3: each purchasing-power column must sit immediately after its money sibling',
      ).toEqual([]);

      // SC-005 — the frame must be legible from the header alone.
      expect(
        headers[money],
        'SC-005: the money header must name its frame (money / statement dollars), never "real $"',
      ).not.toMatch(/real\s*\$|real dollars/i);
      expect(headers[pp], 'SC-005: the purchasing-power header must say so').toMatch(IS_PP);
    });
  }
});

// ===========================================================================
// T027 [US3] — the file reflects the plan currently on screen
// ===========================================================================

test.describe('037 lifecycle-export — US3: the export follows the on-screen plan', () => {
  for (const dash of DASHBOARDS) {
    test(`[${dash.key}] changing the FIRE mode re-exports rows that match the new chart (SC-004)`, async ({ page }) => {
      test.slow(); // two full exports plus a mode change and re-render
      await loadDashboard(page, dash.fileName);

      const before = await readChartTruth(page);
      const sheetsBefore = await exportAndParse(page);
      const colsBefore = totalColumns(headerRow(sheetsBefore[0]));
      const totalsBefore = dataRows(sheetsBefore[0]).map((r) => r[colsBefore.money]);

      // Safe → Exact: Exact drops the per-phase trajectory buffers, so it is
      // the gate most likely to move the FIRE age. It is NOT guaranteed to —
      // whether a gate change moves a given plan depends on which constraint
      // binds, so the assertion below is a biconditional against the chart
      // rather than an unconditional "the files differ".
      await page.locator('#btnExact').click();
      await waitForProjection(page);
      await page.waitForTimeout(SETTLE_MS);

      const after = await readChartTruth(page);
      expect(after.fireMode, 'the mode switch must take effect before re-exporting').toBe('exact');

      const sheetsAfter = await exportAndParse(page);
      const headersAfter = headerRow(sheetsAfter[0]);
      const colsAfter = totalColumns(headersAfter);
      const rowsAfter = dataRows(sheetsAfter[0]);

      // FR-015b — the column set is a function of the registry, not of the data.
      expect(headersAfter, 'FR-015b: column order must be stable across exports').toEqual(headerRow(sheetsBefore[0]));

      // FR-020 — the file records the mode that produced it, always.
      const modeRow = sheetsAfter[1].rows
        .filter((r) => r && r[0] !== undefined)
        .map((r) => ({ label: String(r[0]), value: String(r[1] ?? '') }))
        .find((p) => /fire mode|模式/i.test(p.label));
      expect(modeRow?.value, 'FR-020: the Settings sheet must record the NEW mode').toMatch(/exact|精確|精确/i);

      // SC-004 — the second file matches the NEWLY rendered chart, in full.
      const mismatches: string[] = [];
      rowsAfter.forEach((r, i) => {
        const expected = after.rows[i].totalBookValue ?? after.rows[i].total;
        const actual = r[colsAfter.money];
        if (typeof actual !== 'number' || Math.abs(actual - expected) > NEAR) {
          mismatches.push(`${String(r[0])}: want ${expected} got ${String(actual)}`);
        }
      });
      expect(mismatches, 'SC-004: after a mode change the export must match the re-rendered chart').toEqual([]);

      // The chart is the authority on whether the plan changed, so assert the
      // biconditional in BOTH directions. Chart moved but file didn't = the
      // export served stale rows. File moved but chart didn't = the export
      // recomputed under its own settings. Either is the drift failure US3
      // exists to prevent. (Some plans are legitimately gate-invariant — every
      // gate binds on the same constraint — which is why "the files differ"
      // cannot be asserted unconditionally.)
      const chartMoved =
        after.fireAge !== before.fireAge ||
        after.rows.some(
          (r, i) =>
            Math.abs(
              (r.totalBookValue ?? r.total) - (before.rows[i].totalBookValue ?? before.rows[i].total),
            ) > NEAR,
        );
      const totalsAfter = rowsAfter.map((r) => r[colsAfter.money]);
      if (chartMoved) {
        expect(totalsAfter, 'SC-004: the chart moved, so the re-export must differ too').not.toEqual(totalsBefore);
      } else {
        expect(
          totalsAfter,
          `SC-004: the chart did NOT move (FIRE age stayed ${after.fireAge} under both gates), ` +
            'so the re-export must be identical — a difference would mean the export computed its own plan',
        ).toEqual(totalsBefore);
      }
    });

    test(`[${dash.key}] the Settings sheet records the state that produced the file (FR-020)`, async ({ page }) => {
      await loadDashboard(page, dash.fileName);
      const truth = await readChartTruth(page);

      const sheets = await exportAndParse(page);
      const settings = sheets[1];
      expect(settings?.name, 'FR-011c: sheet 2 must be the Settings block').toBe('Settings');

      const pairs = settings.rows
        .filter((r) => r && r[0] !== undefined && String(r[0]).trim() !== '')
        .map((r) => ({ label: String(r[0]), value: r[1] === undefined ? '' : String(r[1]) }));
      const find = (re: RegExp) => pairs.find((p) => re.test(p.label));
      const dump = JSON.stringify(pairs, null, 1);

      const modeRow = find(/fire mode|模式/i);
      expect(modeRow, `FR-020: Settings must name the FIRE mode. Settings sheet was:\n${dump}`).toBeTruthy();
      const modeAlias: Record<string, RegExp> = {
        safe: /safe|安全/i,
        exact: /exact|精確|精确/i,
        dieWithZero: /zero|dwz|歸零|归零/i,
      };
      expect(modeRow!.value, `FR-020: Settings FIRE mode must match the on-screen mode "${truth.fireMode}"`).toMatch(
        modeAlias[truth.fireMode],
      );

      // FR-019 — a non-default winner must be what the file reports. RR ranks
      // `aggressive-bracket-fill` on its default inputs, so this is a live check.
      const stratRow = find(/strateg|策略/i);
      expect(stratRow, `FR-020: Settings must name the active withdrawal strategy. Settings sheet was:\n${dump}`)
        .toBeTruthy();
      expect(stratRow!.value.length, 'FR-020: the strategy value must not be blank').toBeGreaterThan(0);

      expect(find(/timestamp|exported|時間|时间|日期/i), `FR-020: Settings must carry an export timestamp.\n${dump}`)
        .toBeTruthy();
      expect(find(/retirement|transition|退休/i), `FR-020: Settings must carry the retirement transition year.\n${dump}`)
        .toBeTruthy();
    });

    test(`[${dash.key}] retirement status ON stops employment income at the declared year (FR-021)`, async ({ page }) => {
      test.slow();
      await loadDashboard(page, dash.fileName);
      await prepareSingleEarner(page, dash);

      // Baseline export BEFORE retiring. Unlike a FIRE-mode switch (which some
      // plans are invariant to), declaring retirement always moves the
      // transition age — so this pair DOES prove the "re-export differs" path
      // on both dashboards.
      const sheetsBefore = await exportAndParse(page);
      const colsBefore = totalColumns(headerRow(sheetsBefore[0]));
      const totalsBefore = dataRows(sheetsBefore[0]).map((r) => r[colsBefore.money]);

      const retireYear = CURRENT_YEAR + 5;
      await page.locator(dash.toggleSel).check();
      await page.waitForFunction(() => (window as any)._retirementOverrideActive === true, undefined, {
        timeout: 10_000,
      });
      await page.locator(dash.yearSel).fill(String(retireYear));
      await page.locator(dash.yearSel).dispatchEvent('change');
      // The year handler is debounced (feature 036 perf fix) — wait for the
      // transition age to settle rather than racing a fixed timeout.
      await page.waitForFunction(
        (yr) => {
          const inp = (window as any).getInputs();
          const cur = typeof inp.ageRoger === 'number' ? inp.ageRoger : inp.agePerson1;
          return (window as any).fireAgeOverride === Math.max(cur, cur + (yr - 2026));
        },
        retireYear,
        { timeout: 10_000 },
      );
      await waitForProjection(page);
      await page.waitForTimeout(SETTLE_MS);

      const sheets = await exportAndParse(page);
      const headers = headerRow(sheets[0]);
      const rows = dataRows(sheets[0]);
      const yearCol = findCol(headers, /^year\b|年份|^年$/i, 'Year');

      // US3 — declaring retirement changed the plan, so the file must change.
      const totalsAfter = rows.map((r) => r[totalColumns(headers).money]);
      expect(totalsAfter, 'SC-004: declaring retirement must produce a different file').not.toEqual(totalsBefore);

      // Employment income in the money frame — explicitly NOT the Social
      // Security income columns, and not the purchasing-power sibling.
      const incomeCol = headers.findIndex(
        (h) => /employment\s*income|受僱收入|就業收入/i.test(h) && !/social|\bss\b|社會|社会/i.test(h) && !IS_PP.test(h),
      );
      expect(
        incomeCol,
        `FR-021 needs an employment-income column. Header row was:\n${JSON.stringify(headers, null, 1)}`,
      ).toBeGreaterThanOrEqual(0);

      const working = rows.filter((r) => num(r[yearCol]) < retireYear);
      const retired = rows.filter((r) => num(r[yearCol]) >= retireYear);
      expect(working.length, 'expected at least one pre-retirement working year').toBeGreaterThan(0);
      expect(retired.length, 'expected at least one post-retirement year').toBeGreaterThan(0);

      for (const r of working) {
        expect(
          num(r[incomeCol]),
          `FR-021: employment income must be positive in working year ${String(r[yearCol])}`,
        ).toBeGreaterThan(0);
      }
      // Data-model §2 — a retirement year has NO employment-income concept, so
      // the cell must be blank, never a zero that reads as "earned nothing".
      for (const r of retired) {
        expect(
          r[incomeCol],
          `FR-021/INV-7: employment income must be blank (not 0) in retired year ${String(r[yearCol])}`,
        ).toBeUndefined();
      }
    });
  }
});

// ===========================================================================
// T028 [US3] — purity (FR-022 / INV-6 / SC-008)
// ===========================================================================

test.describe('037 lifecycle-export — US3: exporting is read-only', () => {
  for (const dash of DASHBOARDS) {
    test(`[${dash.key}] export changes no input, KPI, or localStorage (INV-6)`, async ({ page }) => {
      await loadDashboard(page, dash.fileName);

      const before = await snapshotState(page);
      const chartBefore = await readChartTruth(page);

      await exportAndParse(page);
      await page.waitForTimeout(SETTLE_MS);

      const after = await snapshotState(page);
      const chartAfter = await readChartTruth(page);

      const changedInputs = Object.keys({ ...before.inputs, ...after.inputs }).filter(
        (k) => before.inputs[k] !== after.inputs[k],
      );
      expect(changedInputs, 'FR-022: no input value may change as a side effect of exporting').toEqual([]);

      const changedStorage = Object.keys({ ...before.storage, ...after.storage }).filter(
        (k) => before.storage[k] !== after.storage[k],
      );
      expect(changedStorage, 'INV-6: exporting must not write localStorage').toEqual([]);

      expect(after.kpi, 'SC-008: KPI text must be unchanged after export').toEqual(before.kpi);

      // FR-022 — no chart re-render: the projection the chart holds must be
      // the identical run, not a recomputed one that happens to agree.
      expect(chartAfter.fireAge).toBe(chartBefore.fireAge);
      expect(chartAfter.chartTotals).toEqual(chartBefore.chartTotals);
    });
  }
});

// ===========================================================================
// T032 [US4] — transitions and shortfalls
// ===========================================================================

test.describe('037 lifecycle-export — US4: read the transitions, not just the balances', () => {
  for (const dash of DASHBOARDS) {
    test(`[${dash.key}] the phase column changes on exactly the years the projection changes phase (FR-016)`, async ({
      page,
    }) => {
      await loadDashboard(page, dash.fileName);
      const truth = await readChartTruth(page);

      const sheets = await exportAndParse(page);
      const headers = headerRow(sheets[0]);
      const rows = dataRows(sheets[0]);
      const yearCol = findCol(headers, /^year\b|年份|^年$/i, 'Year');
      const phaseCol = findCol(headers, /phase|階段|阶段/i, 'Plan phase');
      const unlockCol = findCol(headers, /401.?k.*(unlock|access)|unlock/i, '401K unlocked');

      // Structural, wording-agnostic: the phase value must change on exactly
      // the rows where the projection's own `phase` changes. That covers the
      // retirement transition, the penalty-free-access age and the SS claim
      // age in one assertion (they are the only phase boundaries).
      const expectedChangeYears = truth.rows
        .filter((r, i) => i > 0 && r.phase !== truth.rows[i - 1].phase)
        .map((r) => r.year);
      const actualChangeYears = rows
        .filter((r, i) => i > 0 && String(r[phaseCol]) !== String(rows[i - 1][phaseCol]))
        .map((r) => num(r[yearCol]));
      expect(actualChangeYears, 'FR-016: phase transitions must land on the projection\'s own transition years').toEqual(
        expectedChangeYears,
      );
      expect(expectedChangeYears.length, 'premise: the plan must contain at least one phase transition').toBeGreaterThan(
        0,
      );

      // The same value must be constant within a phase, i.e. one distinct
      // value per phase — not a per-row string that only looks like a phase.
      const distinctPhases = new Set(rows.map((r) => String(r[phaseCol])));
      expect(distinctPhases.size).toBe(new Set(truth.rows.map((r) => r.phase)).size);

      // 401K-unlock flag flips exactly once, at 59.5 (age >= 60 in the rows).
      const unlockFlipYears = rows
        .filter((r, i) => i > 0 && String(r[unlockCol]) !== String(rows[i - 1][unlockCol]))
        .map((r) => num(r[yearCol]));
      const expectedUnlockFlips = truth.rows
        .filter((r, i) => i > 0 && r.age >= 59.5 !== truth.rows[i - 1].age >= 59.5)
        .map((r) => r.year);
      expect(unlockFlipYears, 'FR-016: the 401K-unlocked flag must flip at the penalty-free-access age').toEqual(
        expectedUnlockFlips,
      );
    });

    test(`[${dash.key}] the shortfall column matches the plan, and its earliest year matches the verdict (SC-007)`, async ({
      page,
    }) => {
      test.slow();
      await loadDashboard(page, dash.fileName);
      await prepareSingleEarner(page, dash);

      // Retiring immediately, on the default plan, is the cleanest way to
      // drive the projection short without editing a dozen inputs — and it is
      // the only state in which the dashboard names a shortfall YEAR on screen
      // (feature 036's retired verdict branch).
      await page.locator(dash.toggleSel).check();
      await page.waitForFunction(() => (window as any)._retirementOverrideActive === true, undefined, {
        timeout: 10_000,
      });
      await waitForProjection(page);
      await page.waitForTimeout(SETTLE_MS);

      const truth = await readChartTruth(page);

      const sheets = await exportAndParse(page);
      const headers = headerRow(sheets[0]);
      const rows = dataRows(sheets[0]);
      const yearCol = findCol(headers, /^year\b|年份|^年$/i, 'Year');
      const shortfallCol = findCol(headers, /shortfall|短缺/i, 'Shortfall this year');

      const isFlagged = (c: Cell) => c === true || c === 1 || /^(true|yes|y|1|是)$/i.test(String(c ?? ''));
      const flaggedYears = rows.filter((r) => isFlagged(r[shortfallCol])).map((r) => num(r[yearCol]));
      const expectedYears = truth.rows.filter((r) => r.hasShortfall).map((r) => r.year);

      // FR-017 — the flag must be set on exactly the projection's short years.
      expect(flaggedYears, 'FR-017: shortfall flags must match the projection year for year').toEqual(expectedYears);

      const verdictMatch = /(\d{4})/.exec(truth.verdict);
      const atRisk = /at risk|風險|风险/i.test(truth.verdict) && verdictMatch !== null;

      if (atRisk) {
        // SC-007 — the earliest flagged year is the year the verdict names.
        expect(flaggedYears.length, `verdict says "${truth.verdict}" so the file must flag at least one year`)
          .toBeGreaterThan(0);
        expect(flaggedYears[0], `SC-007: earliest flagged year must equal the verdict's year in "${truth.verdict}"`)
          .toBe(Number(verdictMatch![1]));
      } else {
        // US4 scenario 3 — a plan that never runs short flags nothing.
        expect(flaggedYears, `verdict "${truth.verdict}" reports no shortfall, so no year may be flagged`).toEqual([]);
      }
    });
  }
});

// ===========================================================================
// Negative — SC-010: refuse loudly, download nothing
// ===========================================================================

test.describe('037 lifecycle-export — failure behaviour', () => {
  for (const dash of DASHBOARDS) {
    test(`[${dash.key}] export with the projection unavailable shows a message and downloads no file (SC-010)`, async ({
      page,
    }) => {
      await loadDashboard(page, dash.fileName);

      const dialogs: string[] = [];
      page.on('dialog', async (d) => {
        dialogs.push(d.message());
        await d.dismiss();
      });

      // FR-024's trigger, made deterministic: the cached chart projection is
      // the export's only data source (contract C-2.1 step 1), so removing it
      // reproduces "clicked before the chart rendered" without racing load.
      await page.evaluate(() => {
        delete (window as any)._lastLifecycleCache;
      });

      let gotDownload = false;
      const downloadWatch = page
        .waitForEvent('download', { timeout: 6_000 })
        .then(() => {
          gotDownload = true;
        })
        .catch(() => {
          /* expected: no download */
        });

      await triggerExport(page);

      // FR-024 — capture the message WHILE it is on screen. `showToast()`
      // strips its visible class after 3 s, so reading only after the download
      // timeout would find an empty stage and report a false negative.
      // `offsetParent` is unusable here: the toast is position:fixed, for which
      // offsetParent is null even when fully visible.
      let inlineMessage = '';
      for (let i = 0; i < 25 && !inlineMessage; i++) {
        inlineMessage = await page.evaluate((sel) => {
          const parts: string[] = [];
          document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return;
            const txt = (el.innerText || el.textContent || '').trim();
            if (txt) parts.push(txt);
          });
          return parts.join(' | ');
        }, MESSAGE_SELECTORS);
        if (!inlineMessage) await page.waitForTimeout(100);
      }

      await downloadWatch;

      // SC-010 / FR-025 — nothing may be produced.
      expect(gotDownload, 'SC-010: a refused export must not download a file').toBe(false);

      const message = [...dialogs, inlineMessage].filter(Boolean).join(' | ');
      expect(
        message.length,
        `FR-024: a refusal must surface a message. Checked alert()/confirm() dialogs and "${MESSAGE_SELECTORS}".`,
      ).toBeGreaterThan(0);
      // FR-025 — the message must not read as data (no zeros masquerading).
      expect(message, 'FR-024: the message must be plain language, not a raw error object').not.toMatch(
        /\[object Object\]|undefined|NaN/,
      );
    });
  }
});
