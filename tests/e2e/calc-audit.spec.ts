/**
 * E2E coverage for feature 014-calc-audit.
 *
 * Replaces the prior `test.skip` skeleton with full assertions for tasks:
 *
 *   T019 — User Story 1: Audit tab structure + flow + per-section charts/tables.
 *   T022 — User Story 2: Copy Debug payload carries the deterministic `audit` key.
 *   T024 — User Story 3: Cross-validation rendering + planted divergence.
 *   T025 — User Story 4: Gate evaluations explicit + ordered + per-gate chart.
 *   T026 — Lockstep DOM-diff between RR and Generic (SC-010).
 *
 * Conventions follow `tests/e2e/tab-navigation.spec.ts`:
 *   - HTTP load via `playwright.config.ts > webServer` (python -m http.server 8766).
 *   - Clean localStorage + reload before each test.
 *   - Both HTML files exercised via the `DASHBOARDS` fixture loop.
 *
 * Calc-engine numbers are NEVER asserted here — only DOM/routing/structural
 * state and the SHAPE of `window._lastAuditSnapshot`. Feature 014 is a pure
 * observability layer (FR-029); calc-engine bug-spotting is downstream.
 */

import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

interface DashboardFixture {
  readonly key: 'rr' | 'generic';
  readonly fileName: 'FIRE-Dashboard.html' | 'FIRE-Dashboard-Generic.html';
}

const DASHBOARDS: readonly DashboardFixture[] = [
  { key: 'rr',      fileName: 'FIRE-Dashboard.html' },
  { key: 'generic', fileName: 'FIRE-Dashboard-Generic.html' },
];

/**
 * The dashboards import `./calc/*.js`, which Chromium blocks on `file://`.
 * `playwright.config.ts > webServer` runs `python -m http.server 8766` so we
 * can load the files over http and the modules resolve.
 */
const HTTP_BASE = 'http://127.0.0.1:8766';

/** Time to let layout/router/recalc settle after navigation or click. */
const SETTLE_MS = 400;

/** The 7 detail-section IDs that follow the flow diagram. */
const DETAIL_SECTION_IDS = [
  'audit-section-inputs',
  'audit-section-spending',
  'audit-section-gates',
  'audit-section-fireage',
  'audit-section-strategy',
  'audit-section-lifecycle',
  'audit-section-crossval',
] as const;

/** Stage IDs that must appear in the flow diagram (FR-CF-1). */
const FLOW_STAGE_IDS = [
  'inputs',
  'spending',
  'gates',
  'fireAge',
  'strategy',
  'lifecycle',
] as const;

/** Stage targets mapped to their detail-section anchor IDs. */
const FLOW_STAGE_TARGETS: ReadonlyArray<string> = [
  'audit-section-inputs',
  'audit-section-spending',
  'audit-section-gates',
  'audit-section-fireage',
  'audit-section-strategy',
  'audit-section-lifecycle',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dashboardUrl(fileName: DashboardFixture['fileName']): string {
  return `${HTTP_BASE}/${fileName}`;
}

/**
 * Wait until `tabRouter.init(...)` has run AND the canonical hash is set.
 * Mirrors `tab-navigation.spec.ts > waitForRouterInit`.
 */
async function waitForRouterInit(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const w = window as any;
      if (!w.tabRouter || typeof w.tabRouter.getState !== 'function') return false;
      const state = w.tabRouter.getState();
      if (!state || !state.tab || !state.pill) return false;
      const hash = window.location.hash;
      return /^#tab=(plan|geography|retirement|history|audit)&pill=[a-z][a-z0-9-]*$/.test(hash);
    },
    null,
    { timeout: 10_000 },
  );
}

/**
 * Navigate to a dashboard, clear localStorage, reload, wait for router init,
 * then wait until `_lastAuditSnapshot` has been populated by the bootstrap
 * recalc. The audit assembler is wired into `recalcAll()`, which runs as
 * part of boot — so the snapshot should appear shortly after init.
 */
async function loadAudit(
  page: Page,
  file: DashboardFixture['fileName'],
): Promise<void> {
  await page.goto(dashboardUrl(file));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await waitForRouterInit(page);
  await page.waitForFunction(
    () => Boolean((window as any)._lastAuditSnapshot),
    null,
    { timeout: 10_000 },
  );
  await page.waitForTimeout(SETTLE_MS);
}

/** Activate the Audit tab and re-render via the registered onAfterActivate. */
async function activateAuditTab(page: Page): Promise<void> {
  await page.click('#tabBar .tab[data-tab="audit"]');
  await page.waitForFunction(
    () => {
      const w = window as any;
      if (!w.tabRouter || typeof w.tabRouter.getState !== 'function') return false;
      return w.tabRouter.getState().tab === 'audit';
    },
    null,
    { timeout: 5_000 },
  );
  await page.waitForTimeout(SETTLE_MS);
}

/** Click a fire-mode gate button and wait for the recalc + audit re-render. */
async function setFireModeViaButton(
  page: Page,
  buttonId: 'btnSafeFire' | 'btnExact' | 'btnDieWithZero',
): Promise<void> {
  await page.click(`#${buttonId}`);
  // recalcAll fires synchronously inside setFireMode; allow microtasks to settle.
  await page.waitForTimeout(SETTLE_MS);
}

/** Read a primitive snapshot summary used by the row-count assertion. */
async function readPlanRange(
  page: Page,
): Promise<{ start: number; endAge: number; expectedRows: number }> {
  return page.evaluate(() => {
    const w = window as any;
    const inp = (typeof w.getInputs === 'function') ? w.getInputs() : {};
    // Generic uses agePerson1; RR uses ageRoger. Snapshot encodes raw inputs,
    // so we accept either field.
    const start = (typeof inp.agePerson1 === 'number') ? inp.agePerson1
                : (typeof inp.ageRoger === 'number')   ? inp.ageRoger
                : NaN;
    const endAge = (typeof inp.endAge === 'number') ? inp.endAge : NaN;
    return { start, endAge, expectedRows: endAge - start + 1 };
  });
}

// ---------------------------------------------------------------------------
// T019 — User Story 1: Audit tab structure + flow + per-section charts/tables
// ---------------------------------------------------------------------------

for (const dash of DASHBOARDS) {
  test.describe(`T019 US1 audit structure + flow + sections [${dash.key}]`, () => {
    test('a) Audit is the 5th top-level tab in fixed order', async ({ page }) => {
      await loadAudit(page, dash.fileName);

      const tabs = await page.locator('#tabBar .tab').evaluateAll((els) =>
        els.map((el) => ({
          dataTab: (el as HTMLElement).dataset.tab ?? '',
          dataI18n: (el as HTMLElement).getAttribute('data-i18n') ?? '',
        })),
      );

      expect(tabs.length).toBe(5);
      expect(tabs.map((t) => t.dataTab)).toEqual([
        'plan', 'geography', 'retirement', 'history', 'audit',
      ]);
      expect(tabs[4].dataTab).toBe('audit');
      expect(tabs[4].dataI18n).toBe('nav.tab.audit');
    });

    test('b) Flow diagram exposes 6 stages, each with a valid data-target', async ({ page }) => {
      await loadAudit(page, dash.fileName);
      await activateAuditTab(page);

      const stages = await page.locator('#audit-flow-diagram .audit-flow__stage').evaluateAll((els) =>
        els.map((el) => (el as HTMLElement).dataset.target ?? ''),
      );
      expect(stages.length).toBe(6);
      expect(stages).toEqual(FLOW_STAGE_TARGETS);

      // Every data-target must point at an element that exists in the DOM.
      for (const targetId of stages) {
        const exists = await page.locator(`#${targetId}`).count();
        expect(exists, `stage target #${targetId} must exist`).toBe(1);
      }
    });

    test('c) Every stage shows a non-empty headline output', async ({ page }) => {
      await loadAudit(page, dash.fileName);
      await activateAuditTab(page);

      // Headlines are populated by renderFlowDiagram(snapshot.flowDiagram)
      // which runs whenever the audit tab is activated.
      const headlines = await page.locator('.audit-flow__headline').evaluateAll((els) =>
        els.map((el) => (el.textContent ?? '').trim()),
      );
      expect(headlines.length).toBe(6);
      for (let i = 0; i < headlines.length; i += 1) {
        expect(
          headlines[i].length,
          `stage[${i}] headline must be non-empty (got "${headlines[i]}")`,
        ).toBeGreaterThan(0);
      }
    });

    test('d) Clicking a stage scrolls + briefly highlights its section', async ({ page }) => {
      await loadAudit(page, dash.fileName);
      await activateAuditTab(page);

      // Click the gates stage; the click handler adds .audit-section--highlight
      // synchronously and removes it after 1500ms.
      await page.click('.audit-flow__stage[data-target="audit-section-gates"]');

      // Within ~100ms: highlight class applied AND section near top of viewport.
      await page.waitForFunction(
        () => {
          const el = document.getElementById('audit-section-gates');
          if (!el) return false;
          if (!el.classList.contains('audit-section--highlight')) return false;
          const rect = el.getBoundingClientRect();
          return rect.top < 200; // smooth scroll has finished or near-finished
        },
        null,
        { timeout: 3_000 },
      );

      // After 1500ms the highlight class is removed.
      await page.waitForFunction(
        () => {
          const el = document.getElementById('audit-section-gates');
          return el !== null && !el.classList.contains('audit-section--highlight');
        },
        null,
        { timeout: 4_000 },
      );
    });

    test('e) Every detail section contains both a canvas and a table-wrap', async ({ page }) => {
      await loadAudit(page, dash.fileName);
      await activateAuditTab(page);

      for (const sectionId of DETAIL_SECTION_IDS) {
        const canvasCount = await page
          .locator(`#${sectionId} canvas`)
          .count();
        const tableWrapCount = await page
          .locator(`#${sectionId} .audit-table-wrap, #${sectionId} .audit-table-wrap--scroll`)
          .count();

        if (sectionId === 'audit-section-crossval') {
          // Cross-Validation section is a pure list; its dual-bar charts are
          // appended per warning. With no warnings, expect zero canvases AND
          // a single list container (#audit-crossval-list) — neither a
          // .audit-table-wrap nor a canvas. Skip the dual-presence rule for
          // this section per FR-CH-8 (charts only when warnings exist).
          continue;
        }

        expect(
          canvasCount,
          `${sectionId} must have at least one <canvas>`,
        ).toBeGreaterThanOrEqual(1);
        expect(
          tableWrapCount,
          `${sectionId} must have at least one .audit-table-wrap`,
        ).toBeGreaterThanOrEqual(1);
      }
    });

    test('f) Lifecycle Projection table row count equals plan range', async ({ page }) => {
      await loadAudit(page, dash.fileName);
      await activateAuditTab(page);

      const range = await readPlanRange(page);
      expect(Number.isFinite(range.start), 'start age must be finite').toBe(true);
      expect(Number.isFinite(range.endAge), 'endAge must be finite').toBe(true);
      expect(range.expectedRows).toBeGreaterThan(0);

      // The renderer writes the <table> after the snapshot is assembled.
      // Wait for the lifecycle <tbody> to be non-empty before asserting.
      await page.waitForFunction(
        () => {
          const body = document.querySelector('#audit-table-lifecycle tbody');
          return body !== null && body.children.length > 0;
        },
        null,
        { timeout: 5_000 },
      );

      const rowCount = await page
        .locator('#audit-table-lifecycle tbody tr')
        .count();
      expect(rowCount).toBe(range.expectedRows);
    });

    test('g) Lifecycle thumbnail series matches plan range and ends at endAge', async ({ page }) => {
      await loadAudit(page, dash.fileName);
      await activateAuditTab(page);

      const seriesInfo = await page.evaluate(() => {
        const w = window as any;
        const snap = w._lastAuditSnapshot || {};
        const lp = snap.lifecycleProjection || {};
        const series = Array.isArray(lp.thumbnailSeries) ? lp.thumbnailSeries : [];
        return {
          length: series.length,
          last: series.length > 0 ? series[series.length - 1] : null,
        };
      });
      const range = await readPlanRange(page);

      expect(seriesInfo.length).toBeGreaterThan(0);
      expect(seriesInfo.last).not.toBeNull();
      expect(seriesInfo.last!.x).toBe(range.endAge);
      expect(seriesInfo.length).toBe(range.expectedRows);
    });
  });
}

// ---------------------------------------------------------------------------
// T022 — User Story 2: Copy Debug payload carries deterministic `audit` key
// ---------------------------------------------------------------------------

/**
 * Click the Copy Debug button and read the resulting clipboard JSON.
 * Chromium requires `clipboard-read` permission on the BrowserContext. We
 * grant `clipboard-read` AND `clipboard-write` because `navigator.clipboard
 * .writeText` (the production path) auto-grants writes from a user gesture
 * but the explicit grant keeps the headless run deterministic.
 */
async function readCopyDebugPayload(page: Page): Promise<any> {
  // Prefer reading clipboard. If clipboard fails, fall back to the global
  // dump path the production code uses (console-only; we read the same data
  // from `_lastAuditSnapshot` directly to avoid timing flakes).
  await page.click('#debugSnapshotBtn');
  // The button's onclick runs synchronously up to the navigator.clipboard
  // promise. Wait briefly for the write to land.
  await page.waitForTimeout(SETTLE_MS);

  const text = await page.evaluate(async () => {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return null;
    }
  });
  if (typeof text === 'string' && text.length > 0) {
    return JSON.parse(text);
  }
  // Clipboard fallback: the production code does NOT mutate any global on
  // success, but `_lastAuditSnapshot` is the same object the button serializes,
  // so a structural assertion against it is equivalent for shape tests.
  return null;
}

for (const dash of DASHBOARDS) {
  test.describe(`T022 US2 Copy Debug audit key [${dash.key}]`, () => {
    // Grant clipboard-read so the headless context can read what the button
    // writes via navigator.clipboard.writeText.
    test.beforeEach(async ({ context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
        origin: HTTP_BASE,
      });
    });

    test('a) clipboard JSON has a top-level `audit` key', async ({ page }) => {
      await loadAudit(page, dash.fileName);

      const payload = await readCopyDebugPayload(page);
      expect(payload, 'clipboard payload must parse as JSON').not.toBeNull();
      expect(payload).toHaveProperty('audit');
      expect(payload.audit).not.toBeNull();
      expect(typeof payload.audit).toBe('object');
    });

    test('b) audit.schemaVersion === "1.0"', async ({ page }) => {
      await loadAudit(page, dash.fileName);
      const payload = await readCopyDebugPayload(page);
      expect(payload).not.toBeNull();
      expect(payload.audit.schemaVersion).toBe('1.0');
    });

    test('c) audit.flowDiagram.stages has 6 entries in the contract order', async ({ page }) => {
      await loadAudit(page, dash.fileName);
      const payload = await readCopyDebugPayload(page);
      expect(payload).not.toBeNull();

      const stages = payload.audit.flowDiagram?.stages;
      expect(Array.isArray(stages)).toBe(true);
      expect(stages.length).toBe(6);
      const stageIds = stages.map((s: any) => s.stageId);
      expect(stageIds).toEqual([...FLOW_STAGE_IDS]);
    });

    test('d) audit.gates has 3 entries [safe, exact, dieWithZero] in order', async ({ page }) => {
      await loadAudit(page, dash.fileName);
      const payload = await readCopyDebugPayload(page);
      expect(payload).not.toBeNull();

      const gates = payload.audit.gates;
      expect(Array.isArray(gates)).toBe(true);
      expect(gates.length).toBe(3);
      expect(gates.map((g: any) => g.mode)).toEqual([
        'safe', 'exact', 'dieWithZero',
      ]);
    });

    test('e) audit.lifecycleProjection.rows.length equals plan range', async ({ page }) => {
      await loadAudit(page, dash.fileName);
      const payload = await readCopyDebugPayload(page);
      expect(payload).not.toBeNull();

      const range = await readPlanRange(page);
      const rows = payload.audit.lifecycleProjection?.rows;
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBe(range.expectedRows);
    });

    test('f) existing top-level keys remain present (FR-020 backward-compat)', async ({ page }) => {
      await loadAudit(page, dash.fileName);
      const payload = await readCopyDebugPayload(page);
      expect(payload).not.toBeNull();

      // FR-020: the new audit key is purely additive.
      expect(payload).toHaveProperty('feasibilityProbe');
      expect(payload).toHaveProperty('summary');
      expect(payload).toHaveProperty('lifecycleSamples');
      expect(payload).toHaveProperty('inputs');
    });
  });
}

// ---------------------------------------------------------------------------
// T024 — User Story 3: Cross-validation rendering + planted divergence
// ---------------------------------------------------------------------------

for (const dash of DASHBOARDS) {
  test.describe(`T024 US3 cross-validation rendering [${dash.key}]`, () => {
    test('a) shows "All cross-checks passed" or has at least one row', async ({ page }) => {
      await loadAudit(page, dash.fileName);
      await activateAuditTab(page);

      const result = await page.evaluate(() => {
        const list = document.getElementById('audit-crossval-list');
        if (!list) return { html: '', rows: 0 };
        return {
          html: (list.textContent ?? '').toLowerCase(),
          rows: list.querySelectorAll('.audit-crossval-row').length,
        };
      });

      const hasAllPassedMessage =
        result.html.includes('all cross-checks passed') ||  // EN
        result.html.includes('全部通过') ||                  // zh-CN safety net
        result.html.includes('全部通過');                    // zh-TW
      const hasAtLeastOneRow = result.rows > 0;

      expect(
        hasAllPassedMessage || hasAtLeastOneRow,
        'Cross-Validation must show either the all-passed message or at least one warning row',
      ).toBe(true);
    });

    test('b) planting a synthetic warning renders an extra row with its reason', async ({ page }) => {
      await loadAudit(page, dash.fileName);
      await activateAuditTab(page);

      const beforeCount = await page
        .locator('#audit-crossval-list .audit-crossval-row')
        .count();

      // Plant a fake warning, then re-render via the public hook.
      await page.evaluate(() => {
        const w = window as any;
        if (!w._lastAuditSnapshot) return;
        if (!Array.isArray(w._lastAuditSnapshot.crossValidationWarnings)) {
          w._lastAuditSnapshot.crossValidationWarnings = [];
        }
        w._lastAuditSnapshot.crossValidationWarnings.push({
          kind: 'endBalance-mismatch',
          valueA: 100000,
          valueB: 200000,
          delta: 100000,
          deltaPct: 100,
          expected: false,
          reason: 'planted',
        });
        if (typeof w._renderAuditUI === 'function') {
          w._renderAuditUI(w._lastAuditSnapshot);
        }
      });

      const afterCount = await page
        .locator('#audit-crossval-list .audit-crossval-row')
        .count();
      expect(afterCount).toBe(beforeCount + 1);

      // The new row's text must contain the planted reason.
      const planted = page
        .locator('#audit-crossval-list .audit-crossval-row', { hasText: 'planted' });
      await expect(planted).toHaveCount(1);
    });

    test('c) reload clears the planted warning', async ({ page }) => {
      await loadAudit(page, dash.fileName);
      await activateAuditTab(page);

      // Plant a warning.
      await page.evaluate(() => {
        const w = window as any;
        if (!w._lastAuditSnapshot) return;
        if (!Array.isArray(w._lastAuditSnapshot.crossValidationWarnings)) {
          w._lastAuditSnapshot.crossValidationWarnings = [];
        }
        w._lastAuditSnapshot.crossValidationWarnings.push({
          kind: 'endBalance-mismatch',
          valueA: 100000,
          valueB: 200000,
          delta: 100000,
          deltaPct: 100,
          expected: false,
          reason: 'planted',
        });
        if (typeof w._renderAuditUI === 'function') {
          w._renderAuditUI(w._lastAuditSnapshot);
        }
      });

      await page.reload();
      await waitForRouterInit(page);
      await page.waitForFunction(
        () => Boolean((window as any)._lastAuditSnapshot),
        null,
        { timeout: 10_000 },
      );
      await activateAuditTab(page);

      // No row with the planted reason should remain.
      const planted = page
        .locator('#audit-crossval-list .audit-crossval-row', { hasText: 'planted' });
      await expect(planted).toHaveCount(0);
    });
  });
}

// ---------------------------------------------------------------------------
// T025 — User Story 4: Gate evaluations explicit + ordered + per-gate chart
// ---------------------------------------------------------------------------

for (const dash of DASHBOARDS) {
  test.describe(`T025 US4 gate evaluations [${dash.key}]`, () => {
    test('a) all 3 gates rendered in fixed order [safe, exact, dieWithZero]', async ({ page }) => {
      await loadAudit(page, dash.fileName);
      // Default mode is Safe per the bootstrap path; assert Safe first.
      await setFireModeViaButton(page, 'btnSafeFire');
      await activateAuditTab(page);

      const gates = await page
        .locator('#audit-section-gates .audit-gate[data-gate]')
        .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.gate ?? ''));
      expect(gates).toEqual(['safe', 'exact', 'dieWithZero']);
    });

    test('b) Safe-mode marks the safe gate active and not the others', async ({ page }) => {
      await loadAudit(page, dash.fileName);
      await setFireModeViaButton(page, 'btnSafeFire');
      await activateAuditTab(page);

      await expect(
        page.locator('#audit-section-gates .audit-gate[data-gate="safe"].audit-gate--active'),
      ).toHaveCount(1);
      await expect(
        page.locator('#audit-section-gates .audit-gate[data-gate="exact"].audit-gate--active'),
      ).toHaveCount(0);
      await expect(
        page.locator('#audit-section-gates .audit-gate[data-gate="dieWithZero"].audit-gate--active'),
      ).toHaveCount(0);
    });

    test('c) toggling Exact moves the active marker to the exact gate', async ({ page }) => {
      await loadAudit(page, dash.fileName);
      await setFireModeViaButton(page, 'btnExact');
      await activateAuditTab(page);

      await expect(
        page.locator('#audit-section-gates .audit-gate[data-gate="exact"].audit-gate--active'),
      ).toHaveCount(1);
      await expect(
        page.locator('#audit-section-gates .audit-gate[data-gate="safe"].audit-gate--active'),
      ).toHaveCount(0);
    });

    test('d) toggling DieWithZero moves the active marker to the dieWithZero gate', async ({ page }) => {
      await loadAudit(page, dash.fileName);
      await setFireModeViaButton(page, 'btnDieWithZero');
      await activateAuditTab(page);

      await expect(
        page.locator('#audit-section-gates .audit-gate[data-gate="dieWithZero"].audit-gate--active'),
      ).toHaveCount(1);
      await expect(
        page.locator('#audit-section-gates .audit-gate[data-gate="safe"].audit-gate--active'),
      ).toHaveCount(0);
      await expect(
        page.locator('#audit-section-gates .audit-gate[data-gate="exact"].audit-gate--active'),
      ).toHaveCount(0);
    });

    test('e) each gate has its own per-gate chart canvas with non-zero box', async ({ page }) => {
      await loadAudit(page, dash.fileName);
      await activateAuditTab(page);

      for (const mode of ['safe', 'exact', 'dieWithZero'] as const) {
        const canvas = page.locator(`.audit-gate[data-gate="${mode}"] canvas`).first();
        await expect(canvas, `gate ${mode} must have a canvas`).toHaveCount(1);
        const box = await canvas.boundingBox();
        expect(box, `gate ${mode} canvas bounding box`).not.toBeNull();
        expect(box!.width, `gate ${mode} canvas width > 0`).toBeGreaterThan(0);
        expect(box!.height, `gate ${mode} canvas height > 0`).toBeGreaterThan(0);
      }
    });

    test('f) each gate verdict element has non-empty text', async ({ page }) => {
      await loadAudit(page, dash.fileName);
      await activateAuditTab(page);

      const verdicts = await page.evaluate(() => {
        const ids = ['audit-gate-safe-verdict', 'audit-gate-exact-verdict', 'audit-gate-dieWithZero-verdict'];
        return ids.map((id) => {
          const el = document.getElementById(id);
          return el ? (el.textContent ?? '').trim() : null;
        });
      });

      expect(verdicts.length).toBe(3);
      for (let i = 0; i < verdicts.length; i += 1) {
        expect(
          verdicts[i],
          `verdict[${i}] must exist`,
        ).not.toBeNull();
        expect(
          (verdicts[i] ?? '').length,
          `verdict[${i}] must be non-empty`,
        ).toBeGreaterThan(0);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// T026 — Lockstep DOM-diff between RR and Generic (SC-010)
// ---------------------------------------------------------------------------

interface AuditDomShape {
  readonly auditSections: readonly string[];
  readonly auditCanvases: readonly string[];
  readonly flowStages: readonly string[];
  readonly auditPills: readonly string[];
  readonly gateIds: readonly string[];
}

async function collectAuditShape(
  page: Page,
  file: DashboardFixture['fileName'],
): Promise<AuditDomShape> {
  await loadAudit(page, file);
  await activateAuditTab(page);
  return page.evaluate(() => ({
    auditSections: Array.from(document.querySelectorAll('#tab-audit .audit-section'))
      .map((s) => (s as HTMLElement).id),
    auditCanvases: Array.from(document.querySelectorAll('#tab-audit canvas'))
      .map((c) => (c as HTMLElement).id),
    flowStages: Array.from(document.querySelectorAll('.audit-flow__stage'))
      .map((b) => (b as HTMLElement).dataset.target ?? ''),
    auditPills: Array.from(document.querySelectorAll('.pill[data-tab="audit"]'))
      .map((p) => (p as HTMLElement).dataset.pill ?? ''),
    gateIds: Array.from(document.querySelectorAll('#audit-section-gates [data-gate]'))
      .map((g) => (g as HTMLElement).dataset.gate ?? ''),
  }));
}

test.describe('T026 lockstep DOM-diff (SC-010)', () => {
  test('RR and Generic Audit tabs expose byte-identical structure', async ({ browser }) => {
    const ctxRr = await browser.newContext();
    const ctxGeneric = await browser.newContext();
    try {
      const pageRr = await ctxRr.newPage();
      const pageGeneric = await ctxGeneric.newPage();

      const [rr, generic] = await Promise.all([
        collectAuditShape(pageRr, 'FIRE-Dashboard.html'),
        collectAuditShape(pageGeneric, 'FIRE-Dashboard-Generic.html'),
      ]);

      expect(rr.auditSections).toEqual(generic.auditSections);
      expect(rr.auditCanvases).toEqual(generic.auditCanvases);
      expect(rr.flowStages).toEqual(generic.flowStages);
      expect(rr.auditPills).toEqual(generic.auditPills);
      expect(rr.gateIds).toEqual(generic.gateIds);

      // Defensive: anchor structural expectations to the contract so a
      // simultaneous drift in BOTH files (which would deceive the diff alone)
      // still trips the gate.
      expect(rr.flowStages).toEqual([...FLOW_STAGE_TARGETS]);
      expect(rr.gateIds).toEqual(['safe', 'exact', 'dieWithZero']);
      expect(rr.auditPills).toEqual(['summary']);
    } finally {
      await ctxRr.close();
      await ctxGeneric.close();
    }
  });
});
