/**
 * Feature 026 US3 — Header zoom-resilience matrix (FR-010 / SC-006 / SC-007 / SC-008).
 *
 * Loads each HTML file (FIRE-Dashboard.html, FIRE-Dashboard-Generic.html) in
 * each language (en, zh) and exercises browser zoom at 75% / 100% / 125% / 150%
 * via `document.body.style.zoom`. For each (file, language, zoom) cell asserts:
 *
 *   B1. Header height bound per zoom level (75: <=150, 100: <=200, 125: <=280,
 *       150: no upper bound — degrades to vertical stack).
 *   B2. No header child element's bounding rect intersects another's by > 2px.
 *   B3. At 100% zoom: title fits within ~2.6 visual lines (no wrap-explosion).
 *
 * Anchored to specs/026-withdrawal-tax-and-ui-fixes/contracts/header-layout.contract.md.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, expect, type Page } from '@playwright/test';
import { rectsIntersect, setLanguage, type Language } from './helpers';

interface DashboardFile {
  readonly name: 'rr' | 'generic';
  readonly relPath: string;
}

const dashboardFiles: readonly DashboardFile[] = [
  { name: 'rr', relPath: 'FIRE-Dashboard.html' },
  { name: 'generic', relPath: 'FIRE-Dashboard-Generic.html' },
];

interface ZoomLevel {
  readonly zoom: number;
  readonly label: '75' | '100' | '125' | '150';
  readonly maxHeaderHeightPx: number | null;
}

const zoomLevels: readonly ZoomLevel[] = [
  { zoom: 0.75, label: '75', maxHeaderHeightPx: 150 },
  { zoom: 1.00, label: '100', maxHeaderHeightPx: 200 },
  { zoom: 1.25, label: '125', maxHeaderHeightPx: 280 },
  { zoom: 1.50, label: '150', maxHeaderHeightPx: null },
];

const languages: readonly Language[] = ['en', 'zh'];
const SETTLE_MS = 350;
const VIEWPORT = { width: 1920, height: 1080 } as const;
const OVERLAP_TOLERANCE_PX = 2;

async function loadFile(page: Page, relPath: string): Promise<void> {
  const url = pathToFileURL(path.resolve(__dirname, '..', '..', relPath)).href;
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

async function setBrowserZoom(page: Page, zoom: number): Promise<void> {
  await page.evaluate((z) => {
    (document.body.style as CSSStyleDeclaration & { zoom: string }).zoom = String(z);
  }, zoom);
  await page.waitForTimeout(SETTLE_MS);
}

test.describe('header zoom matrix (Feature 026 US3)', () => {
  test.use({ viewport: VIEWPORT });

  for (const file of dashboardFiles) {
    for (const language of languages) {
      for (const zoomLevel of zoomLevels) {
        const cellName = `${file.name}-${language}-zoom${zoomLevel.label}`;

        test(cellName, async ({ page }) => {
          await loadFile(page, file.relPath);
          await setLanguage(page, language);
          await setBrowserZoom(page, zoomLevel.zoom);

          const header = page.locator('.header').first();
          const headerBox = await header.boundingBox();
          expect(headerBox, 'header bounding box must exist').not.toBeNull();
          if (!headerBox) return;

          // B1 — header height bound (when defined for this zoom level).
          if (zoomLevel.maxHeaderHeightPx !== null) {
            expect(
              headerBox.height,
              `header too tall at ${cellName}: ${headerBox.height.toFixed(1)}px > ${zoomLevel.maxHeaderHeightPx}px`,
            ).toBeLessThanOrEqual(zoomLevel.maxHeaderHeightPx);
          }

          // B2 — no header child overlaps another by > 2px.
          const childRects = await page.evaluate(() => {
            const root = document.querySelector('.header');
            if (!root) return [];
            const visibleChildren = Array.from(root.children).filter((c) => {
              const r = c.getBoundingClientRect();
              return r.width > 0 && r.height > 0;
            });
            return visibleChildren.map((c) => {
              const r = c.getBoundingClientRect();
              return {
                tag: c.tagName.toLowerCase(),
                cls: (c as HTMLElement).className || '',
                x: r.x, y: r.y, width: r.width, height: r.height,
              };
            });
          });

          for (let i = 0; i < childRects.length; i++) {
            for (let j = i + 1; j < childRects.length; j++) {
              const a = childRects[i];
              const b = childRects[j];
              const shrunkA = {
                x: a.x + OVERLAP_TOLERANCE_PX,
                y: a.y + OVERLAP_TOLERANCE_PX,
                width: Math.max(0, a.width - 2 * OVERLAP_TOLERANCE_PX),
                height: Math.max(0, a.height - 2 * OVERLAP_TOLERANCE_PX),
              };
              const shrunkB = {
                x: b.x + OVERLAP_TOLERANCE_PX,
                y: b.y + OVERLAP_TOLERANCE_PX,
                width: Math.max(0, b.width - 2 * OVERLAP_TOLERANCE_PX),
                height: Math.max(0, b.height - 2 * OVERLAP_TOLERANCE_PX),
              };
              expect(
                rectsIntersect(shrunkA, shrunkB),
                `child ${a.cls || a.tag} overlaps ${b.cls || b.tag} by > ${OVERLAP_TOLERANCE_PX}px at ${cellName}`,
              ).toBe(false);
            }
          }

          // B3 — at 100% zoom, title fits within ~2.6 visual lines.
          if (zoomLevel.label === '100') {
            const titleLocator = page.locator('.header h1').first();
            const titleBox = await titleLocator.boundingBox();
            expect(titleBox).not.toBeNull();
            if (!titleBox) return;
            const lineHeightPx = await titleLocator.evaluate((el) => {
              const cs = getComputedStyle(el);
              const lh = parseFloat(cs.lineHeight);
              if (Number.isFinite(lh) && lh > 0) return lh;
              const fs = parseFloat(cs.fontSize);
              return 1.2 * (Number.isFinite(fs) ? fs : 16);
            });
            expect(
              titleBox.height / lineHeightPx,
              `title too tall (>2.6 lines) at ${cellName}: ${(titleBox.height / lineHeightPx).toFixed(2)} lines`,
            ).toBeLessThanOrEqual(2.6);
          }
        });
      }
    }
  }
});
