/**
 * Feature 031 — US2 (T009): FIRE-marker drag keeps the Lifecycle chart and the
 * Withdrawal Strategy chart on a CONSISTENT strategy basis for the previewed age.
 *
 * Defect 2 (research.md): during a FIRE-marker drag, `renderGrowthChart` re-renders
 * the Lifecycle chart at `_previewFireAge` but threads `_lastStrategyResults.winnerId`
 * — a winner ranked at the COMMITTED age, not the preview age. The Withdrawal Strategy
 * chart is not re-rendered during the drag at all. Result: the two surfaces describe
 * two different strategies mid-drag (contract C2 prohibition: "rendering a preview-age
 * balance trajectory using a winner ranked at a different age").
 *
 * Re-running `scoreAndRank` on every mousemove is too costly for the ≥30fps drag floor
 * (it simulates every strategy, and tax-optimized-search runs multiple θ sweeps). The
 * fix instead pins the preview to a single well-defined basis: while `_previewFireAge`
 * is active, the Lifecycle chart renders BRACKET-FILL at the preview age (the always-
 * available default), so it can never thread a stale committed-age winner. On mouseup,
 * recalcAll → scoreAndRank → US1's post-rank render restores the winner authoritatively.
 *
 * This spec asserts, against the LIVE Chart.js instance (`Chart.getChart('growthChart')`):
 *   - With a non-default winner active (Exact + "Leave more behind"), the COMMITTED
 *     Lifecycle Trad series differs from bracket-fill (proves a non-default winner is live).
 *   - DURING a drag preview to a higher age, the rendered Lifecycle Trad series equals
 *     `projectFullLifecycle(..., previewAge, true, {})` (bracket-fill at the preview age)
 *     — NOT the committed-age winner trajectory. (C2 consistency.)
 *   - AFTER release+cancel (preview reverts), the chart is back on the committed winner.
 *
 * EXPECTED FAILURE STATE AT WRITE-TIME (pre-T010):
 *   The preview render threads the committed-age winner, so the DURING-drag Trad series
 *   matches the winner trajectory, NOT bracket-fill → the C2 assertion FAILS.
 *
 * Constitution I — runs against BOTH dashboards. Loads over HTTP (playwright.config.ts
 * webServer starts `python -m http.server 8766`).
 */

import { test, expect, type Page } from '@playwright/test';

interface DashboardFixture {
  readonly key: 'rr' | 'generic';
  readonly fileName: 'FIRE-Dashboard.html' | 'FIRE-Dashboard-Generic.html';
}

const DASHBOARDS: readonly DashboardFixture[] = [
  { key: 'rr',      fileName: 'FIRE-Dashboard.html' },
  { key: 'generic', fileName: 'FIRE-Dashboard-Generic.html' },
];

const HTTP_BASE = 'http://127.0.0.1:8766';

/** Max per-point rounding slack (chart rounds to whole dollars). */
const ROUND_SLACK = 2;

async function loadDashboard(page: Page, fileName: string): Promise<void> {
  await page.goto(`${HTTP_BASE}/${fileName}`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(
    () => {
      const el = document.getElementById('fireStatus');
      return el != null && el.textContent != null && !el.textContent.includes('Calculating');
    },
    { timeout: 10_000 },
  );
  // The Lifecycle (growthChart) canvas lives under the retirement tab's "lifecycle"
  // pill (feature 013 tabbed nav). Activate tab + pill so the canvas is laid out and
  // Chart.js resizes it to a real bounding box for drag pointer math.
  await page.click('#tabBtn-retirement');
  await page.click('.pill[data-tab="retirement"][data-pill="lifecycle"]');
  // Chart.js sizes the canvas only after the pill host becomes visible and resize()
  // fires; wait for a non-zero canvas box rather than CSS visibility.
  await page.waitForFunction(
    () => {
      const c = document.getElementById('growthChart') as HTMLCanvasElement | null;
      return c != null && c.getBoundingClientRect().width > 50 && c.getBoundingClientRect().height > 50;
    },
    { timeout: 10_000 },
  );
  await page.waitForTimeout(300);
}

/**
 * Force a non-default winning strategy: Exact mode + "Leave more behind"
 * objective (the bug repro from research.md). Recalc and let the engine settle.
 */
async function forceNonDefaultWinner(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as Record<string, (...a: unknown[]) => unknown>;
    if (typeof w.setFireMode === 'function') w.setFireMode('exact');
    if (typeof w.setWithdrawalObjective === 'function') w.setWithdrawalObjective('leave-more-behind');
  });
  await page.waitForTimeout(600);
}

/**
 * Read the Lifecycle chart's per-age Trad (p401kTrad) series straight off the
 * live Chart.js instance, paired with the age parsed from each x-label
 * (labels look like "2042 (53)"). Uses Chart.js 4's `Chart.getChart` registry —
 * the framework-supported way to read rendered datasets without reaching into
 * the page's lexical state.
 */
async function readLifecycleTradByAge(page: Page): Promise<Record<number, number>> {
  return page.evaluate(() => {
    const ChartGlobal = (window as unknown as { Chart?: { getChart(id: string): unknown } }).Chart;
    if (!ChartGlobal || typeof ChartGlobal.getChart !== 'function') return {};
    const chart = ChartGlobal.getChart('growthChart') as
      | { data?: { labels?: string[]; datasets?: Array<{ label?: string; data?: number[] }> } }
      | undefined;
    if (!chart || !chart.data || !chart.data.datasets) return {};
    const labels = chart.data.labels || [];
    // The Trad line is the dataset whose label contains "Trad" / "401k Trad".
    const ds = chart.data.datasets.find(
      (d) => typeof d.label === 'string' && /trad/i.test(d.label),
    );
    if (!ds || !Array.isArray(ds.data)) return {};
    const out: Record<number, number> = {};
    for (let i = 0; i < labels.length; i++) {
      const m = String(labels[i]).match(/\((\d+)\)/);
      if (m && typeof ds.data[i] === 'number') out[parseInt(m[1], 10)] = ds.data[i];
    }
    return out;
  });
}

/**
 * Largest absolute per-age Trad difference between two age→value maps, over the
 * ages they share that are strictly greater than `afterAge` (retirement years,
 * where the withdrawal-strategy basis actually drives the trajectory — the
 * pre-FIRE accumulation years are basis-invariant).
 */
function maxTradDiffAfter(
  a: Record<number, number>,
  b: Record<number, number>,
  afterAge: number,
): { maxDiff: number; sharedCount: number } {
  let maxDiff = 0;
  let sharedCount = 0;
  for (const k of Object.keys(a)) {
    const age = parseInt(k, 10);
    if (age > afterAge && b[age] !== undefined) {
      sharedCount++;
      maxDiff = Math.max(maxDiff, Math.abs(a[age] - b[age]));
    }
  }
  return { maxDiff, sharedCount };
}

/**
 * Strategy ids that `scoreAndRank` can pick as a non-default winner. Used to
 * calibrate which strategy + spend the COMMITTED chart was drawn with so the
 * preview-age references are computed on the identical pipeline/frame.
 */
const CANDIDATE_STRATEGIES = [
  'aggressive-bracket-fill',
  'tax-optimized-search',
  'leave-more-behind',
  null, // bracket-fill default
] as const;

/**
 * Compute a Book-Value Trad-by-age trajectory for `fireAge` on a given strategy
 * basis, using the EXACT chart pipeline: `projectFullLifecycle` (+ the always-on
 * `invest-keep-paying` mortgage no-op the chart merges) followed by
 * `_extendRowsWithBookValues` and the chart's `_bvOrReal` fallback. This is the
 * frame-faithful reference the rendered Lifecycle Trad line maps from.
 *
 * `strategyId === null` ⇒ bracket-fill default (no strategyOverride).
 */
async function referenceTradByAge(
  page: Page,
  fireAge: number,
  spend: number,
  strategyId: string | null,
): Promise<Record<number, number>> {
  return page.evaluate(
    ({ fireAge, spend, strategyId }) => {
      const w = window as unknown as Record<string, (...a: unknown[]) => unknown>;
      const getInputs = w.getInputs as (() => Record<string, number>) | undefined;
      const proj = w.projectFullLifecycle as
        | ((inp: object, sp: number, fa: number, withSS: boolean, opts?: object) =>
            Array<{ age: number; p401kTrad: number; p401kTradBookValue?: number }>)
        | undefined;
      const extend = w._extendRowsWithBookValues as
        | ((rows: unknown[], curAge: number, infl: number, fields: string[]) => void)
        | undefined;
      if (typeof getInputs !== 'function' || typeof proj !== 'function') return {};
      const inp = getInputs();
      const opts = Object.assign(
        {},
        strategyId ? { strategyOverride: strategyId } : null,
        { mortgageStrategyOverride: 'invest-keep-paying' },
      );
      const rows = proj(inp, spend, fireAge, true, opts);
      // RR's chart passes inp.ageRoger; Generic's passes inp.agePerson1. Use
      // whichever current-age field this dashboard exposes so the Book-Value
      // conversion matches the rendered chart's frame.
      const curAge = typeof inp.agePerson1 === 'number' ? inp.agePerson1 : inp.ageRoger;
      if (typeof extend === 'function') {
        try { extend(rows, curAge, inp.inflationRate, ['p401kTrad']); } catch { /* leave real-$ */ }
      }
      const out: Record<number, number> = {};
      for (const r of rows) {
        if (r && typeof r.age === 'number') {
          const v = Number.isFinite(r.p401kTradBookValue as number)
            ? (r.p401kTradBookValue as number)
            : r.p401kTrad;
          out[r.age] = Math.round((v || 0) as number);
        }
      }
      return out;
    },
    { fireAge, spend, strategyId },
  );
}

/**
 * Recover the FIRE marker's current age from the live chart (parsed from the
 * x-label at the marker dataset's single plotted point).
 */
async function readMarkerAge(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const ChartGlobal = (window as unknown as { Chart?: { getChart(id: string): unknown } }).Chart;
    const chart = ChartGlobal?.getChart('growthChart') as
      | { _fireMarkerIdx?: number; data: { labels: string[]; datasets: Array<{ data: Array<number | null> }> } }
      | undefined;
    if (!chart) return null;
    const idx = typeof chart._fireMarkerIdx === 'number' && chart._fireMarkerIdx >= 0 ? chart._fireMarkerIdx : 3;
    const ds = chart.data.datasets[idx];
    for (let i = 0; i < ds.data.length; i++) {
      if (ds.data[i] !== null && ds.data[i] !== undefined) {
        const m = String(chart.data.labels[i]).match(/\((\d+)\)/);
        return m ? parseInt(m[1], 10) : null;
      }
    }
    return null;
  });
}

/**
 * Calibrate (spend, winnerStrategyId) against the COMMITTED chart so references
 * at other ages use the identical basis. Scans plausible scenario spends ×
 * candidate strategies and returns the pair whose reference matches `committed`
 * within rounding. Returns null if nothing matches (then the test skips, rather
 * than asserting on an unverified basis).
 */
async function calibrateBasis(
  page: Page,
  committed: Record<number, number>,
  committedAge: number,
): Promise<{ spend: number; strategyId: string | null } | null> {
  const SPENDS = [60000, 60100, 120000, 102000, 72000, 45600, 42000, 78000, 36000, 73400];
  for (const spend of SPENDS) {
    for (const strategyId of CANDIDATE_STRATEGIES) {
      const ref = await referenceTradByAge(page, committedAge, spend, strategyId);
      const { maxDiff, sharedCount } = maxTradDiffAfter(committed, ref, committedAge - 1);
      if (sharedCount > 5 && maxDiff <= ROUND_SLACK) {
        return { spend, strategyId };
      }
    }
  }
  return null;
}

/**
 * Drive a real FIRE-marker drag from its current x to a higher age, leaving the
 * mouse button DOWN at `holdAtFraction` of the canvas width so the preview is
 * active when the caller samples the chart. Returns the canvas box so the caller
 * can release later. Performs a near-marker mousedown (the handler only engages
 * within 28px of the marker).
 */
async function startDragHoldPreview(
  page: Page,
): Promise<{ box: { x: number; y: number; width: number; height: number } }> {
  const box = await page.locator('#growthChart').boundingBox();
  if (!box) throw new Error('growthChart canvas has no bounding box');

  // Find the marker pixel via the exposed helper if available; otherwise fall
  // back to a horizontal scan for the marker dataset's first plotted point.
  const markerXY = await page.evaluate(() => {
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
    if (!meta || !meta.data || !ds) return null;
    for (let i = 0; i < ds.data.length; i++) {
      if (ds.data[i] !== null && ds.data[i] !== undefined && meta.data[i]?.getCenterPoint) {
        const p = meta.data[i].getCenterPoint!();
        return { x: p.x, y: p.y };
      }
    }
    return null;
  });
  if (!markerXY) throw new Error('could not locate FIRE marker on growthChart');

  const startX = box.x + markerXY.x;
  const startY = box.y + markerXY.y;
  // Drag well to the right (toward older ages) but stay within the canvas.
  const endX = box.x + box.width * 0.75;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Several incremental moves so the throttle releases at least one preview render.
  for (let f = 0; f <= 4; f++) {
    await page.mouse.move(startX + ((endX - startX) * f) / 4, startY, { steps: 3 });
    await page.waitForTimeout(80);
  }
  return { box };
}

for (const { key, fileName } of DASHBOARDS) {
  test.describe(`031 lifecycle/withdrawal drag parity — ${key}`, () => {
    test('drag preview keeps Lifecycle on a consistent (bracket-fill) basis for the preview age', async ({ page }) => {
      await loadDashboard(page, fileName);
      await forceNonDefaultWinner(page);

      // Committed (post-rank) Trad series — reflects the non-default winner (US1).
      const committedTrad = await readLifecycleTradByAge(page);
      expect(Object.keys(committedTrad).length, 'committed chart must have Trad data').toBeGreaterThan(0);
      const committedAge = await readMarkerAge(page);
      expect(committedAge, 'committed FIRE age must be recoverable').not.toBeNull();
      const cAge = committedAge as number;

      // Calibrate the chart's (spend, winnerStrategy) basis from the committed render
      // so the preview-age references below use the identical pipeline + frame.
      const basis = await calibrateBasis(page, committedTrad, cAge);
      test.skip(basis === null, 'could not calibrate the committed chart basis (live-input dependent)');
      const { spend, strategyId: winnerStrategyId } = basis!;
      // The whole point of the fixture is a NON-default winner.
      expect(winnerStrategyId, 'committed winner must be a non-default strategy for this fixture').not.toBeNull();

      // Drag the FIRE marker to a later age and HOLD the preview open.
      const { box } = await startDragHoldPreview(page);
      const previewTrad = await readLifecycleTradByAge(page);
      const previewAge = await readMarkerAge(page);
      await page.mouse.up();

      expect(previewAge, 'preview age must be recoverable from the marker').not.toBeNull();
      const pAge = previewAge as number;
      expect(pAge, 'drag must have moved the marker to a later age').toBeGreaterThan(cAge);

      // Two references at the PREVIEW age, on the calibrated spend:
      //   - bracket-fill (the consistent preview basis the fix pins to)
      //   - the committed winner applied at the preview age (the C2-prohibited basis)
      const bracketFillAtPreview = await referenceTradByAge(page, pAge, spend, null);
      const winnerAtPreview = await referenceTradByAge(page, pAge, spend, winnerStrategyId);

      // (a) C2 consistency: the rendered preview MUST match bracket-fill at the preview age.
      const matchBf = maxTradDiffAfter(previewTrad, bracketFillAtPreview, pAge);
      expect(matchBf.sharedCount, 'must have post-preview-age points to compare vs bracket-fill').toBeGreaterThan(0);
      expect(
        matchBf.maxDiff,
        `during drag preview the Lifecycle Trad series MUST match bracket-fill at the preview age ` +
          `(consistent basis, contract C2). Max per-age divergence was $${Math.round(matchBf.maxDiff)} ` +
          `at preview age ${pAge} (winner=${winnerStrategyId}).`,
      ).toBeLessThanOrEqual(ROUND_SLACK);

      // (b) C2 prohibition: the rendered preview MUST NOT be the committed winner
      //     trajectory applied at the preview age (a winner ranked at a different age).
      //     This is only OBSERVABLE when the winner's Trad trajectory actually diverges
      //     from bracket-fill at the preview age. For some inputs (notably the Generic
      //     dashboard's defaults, where `leave-more-behind` wins and its Trad line
      //     coincides with bracket-fill) the two references are numerically identical,
      //     so the bug produces no visible difference and there is nothing to catch.
      //     We assert (b) only when the references diverge, and annotate otherwise so a
      //     green Generic run is not mistaken for active discrimination. The RR fixture
      //     (winner = aggressive-bracket-fill, ~$166K divergence) is the discriminating
      //     case that proves the fix; the lockstep byte-identical edit covers Generic.
      const winnerVsBf = maxTradDiffAfter(winnerAtPreview, bracketFillAtPreview, pAge);
      if (winnerVsBf.maxDiff > 1000) {
        const matchWinner = maxTradDiffAfter(previewTrad, winnerAtPreview, pAge);
        expect(
          matchWinner.maxDiff,
          `during drag preview the Lifecycle Trad series MUST NOT thread the committed-age winner ` +
            `(${winnerStrategyId}) at the preview age (C2 prohibition). It matched the winner too closely ` +
            `(max divergence only $${Math.round(matchWinner.maxDiff)}).`,
        ).toBeGreaterThan(1000);
      } else {
        test.info().annotations.push({
          type: 'note',
          description:
            `winner (${winnerStrategyId}) coincides with bracket-fill at the preview age for this fixture ` +
            `(divergence $${Math.round(winnerVsBf.maxDiff)}); the C2 prohibition is not numerically observable here.`,
        });
      }

      expect(box.width).toBeGreaterThan(0);
    });

    test('after confirming the drag, Lifecycle + Withdrawal stay consistent at the override age (C2 on commit)', async ({ page }) => {
      await loadDashboard(page, fileName);
      await forceNonDefaultWinner(page);

      // Drag to a later age and confirm (click Apply on the override overlay).
      await startDragHoldPreview(page);
      const confirmedAge = await readMarkerAge(page);
      await page.mouse.up();
      const applyBtn = page.locator('#overrideConfirmApply');
      await expect(applyBtn, 'confirm overlay Apply button must be visible after a move').toBeVisible({ timeout: 5_000 });
      await applyBtn.click();
      await page.waitForTimeout(700); // let the override render fan-out settle

      expect(confirmedAge, 'confirmed age recoverable').not.toBeNull();
      const xAge = confirmedAge as number;

      // The marker should now rest at the confirmed (override) age — proving the
      // preview was promoted into a real override (no leftover preview state).
      const restAge = await readMarkerAge(page);
      expect(restAge, 'marker rests at the confirmed override age after Apply').toBe(xAge);

      const postCommit = await readLifecycleTradByAge(page);

      // C2-on-commit guarantee: both the Lifecycle chart AND the Withdrawal Strategy
      // chart re-render from the SAME `_lastStrategyResults` winner at the override age
      // (their onChange listeners both fire on setOverride). So the Lifecycle Trad line
      // must be a COHERENT winner-strategy trajectory at the override age — never the
      // bracket-fill default while a non-default strategy is the active winner, and
      // never NaN/empty. Calibrate the post-commit chart against the candidate
      // strategies AT the override age and require a clean match.
      //
      // NOTE: this asserts the surfaces are mutually CONSISTENT and coherent at the
      // override age (the C2 contract), not that the ranker was re-run. The drag
      // commit promotes the preview via chartState.setOverride (the same path the
      // reset button and mode switches use); a full recalc/re-rank on every override
      // gesture is a separate, pre-existing architectural item out of US2's scope.
      const SPENDS = [60000, 60100, 120000, 102000, 72000, 45600, 42000, 78000, 36000, 73400, 20000];
      let matched: { spend: number; strategyId: string | null } | null = null;
      for (const spend of SPENDS) {
        for (const strategyId of CANDIDATE_STRATEGIES) {
          const ref = await referenceTradByAge(page, xAge, spend, strategyId);
          const { maxDiff, sharedCount } = maxTradDiffAfter(postCommit, ref, xAge - 1);
          if (sharedCount > 5 && maxDiff <= ROUND_SLACK) { matched = { spend, strategyId }; break; }
        }
        if (matched) break;
      }
      expect(
        matched,
        `after confirming the drag to age ${xAge}, the Lifecycle Trad series must match a coherent ` +
          `strategy trajectory at the override age (shared with the Withdrawal chart). It matched none — ` +
          `the chart is on a stale-frame or incoherent basis.`,
      ).not.toBeNull();
    });

    test('after release the Lifecycle chart returns to the committed winner basis', async ({ page }) => {
      await loadDashboard(page, fileName);
      await forceNonDefaultWinner(page);

      const before = await readLifecycleTradByAge(page);

      // Drag, hold, then release WITHOUT confirming the move (Escape cancels the
      // confirm overlay → `_cancelPreviewAndRevert` snaps the chart back).
      await startDragHoldPreview(page);
      await page.mouse.up();
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(400);

      const after = await readLifecycleTradByAge(page);

      // The committed series must be restored (preview reverted): same ages,
      // same values within rounding.
      const ages = Object.keys(before).map((a) => parseInt(a, 10));
      let maxDiff = 0;
      for (const a of ages) {
        if (after[a] !== undefined) maxDiff = Math.max(maxDiff, Math.abs(before[a] - after[a]));
      }
      expect(
        maxDiff,
        `after canceling the drag, the Lifecycle Trad series must return to the committed basis; ` +
          `max divergence $${Math.round(maxDiff)}.`,
      ).toBeLessThanOrEqual(ROUND_SLACK);
    });
  });
}
