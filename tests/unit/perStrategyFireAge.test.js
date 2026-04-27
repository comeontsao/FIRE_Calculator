// ==================== TEST SUITE: per-strategy FIRE age (US3) ====================
// Feature 015 Wave B — verifies findPerStrategyFireAge surfaces per-strategy
// earliest feasible ages and that the drag-skip guard global is wired up.
// Per specs/015-calc-debt-cleanup/contracts/per-strategy-fire-age.contract.md
// ===================================================================================

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HTML_PATH = path.join(REPO_ROOT, 'FIRE-Dashboard-Generic.html');
const HTML = fs.readFileSync(HTML_PATH, 'utf8');

const { SCENARIOS } = require(path.resolve(REPO_ROOT, 'tests', 'fixtures', 'feature-015', 'scenarios.js'));

test('US3 FR-010: drag-skip flag globals are present in the HTML source', () => {
  // The flags are declared in projectFullLifecycle helper section of both
  // HTML files. Smoke check that the wiring code at least parses.
  assert.ok(HTML.includes('_userDraggedFireAge'),
    'expected _userDraggedFireAge global to be declared in Generic HTML');
  assert.ok(HTML.includes('_userDraggedFireAgeValue'),
    'expected _userDraggedFireAgeValue global to be declared in Generic HTML');
});

test('US3 FR-008: findPerStrategyFireAge function is defined inline', () => {
  // The function is added by Feature 015 Wave B and surfaces per-strategy
  // ages to the audit. Verify presence and basic shape via regex.
  assert.ok(/function\s+findPerStrategyFireAge\s*\(/.test(HTML),
    'findPerStrategyFireAge must be defined inline');
  assert.ok(HTML.includes('perStrategyFireAge'),
    'findPerStrategyFireAge return shape must include perStrategyFireAge');
});

test('US3 RR-mirror: drag-skip flag wiring is present in FIRE-Dashboard.html (lockstep)', () => {
  const RR_HTML = fs.readFileSync(path.join(REPO_ROOT, 'FIRE-Dashboard.html'), 'utf8');
  assert.ok(RR_HTML.includes('_userDraggedFireAge'),
    'RR file must mirror the drag-skip flag declaration (Constitution I lockstep)');
  assert.ok(/function\s+findPerStrategyFireAge\s*\(/.test(RR_HTML),
    'RR file must define findPerStrategyFireAge (lockstep)');
});

test('US3 FR-010: drag-start handler sets _userDraggedFireAge = true', () => {
  // Both files must set the flag in the drag-start branch.
  const RR_HTML = fs.readFileSync(path.join(REPO_ROOT, 'FIRE-Dashboard.html'), 'utf8');
  for (const [name, src] of [['Generic', HTML], ['RR', RR_HTML]]) {
    const drag = src.indexOf('_fireDrag.active = true;');
    assert.ok(drag > 0, `${name}: _fireDrag.active = true assignment not found`);
    const window = src.slice(drag, drag + 800);
    assert.ok(window.includes('_userDraggedFireAge = true'),
      `${name}: drag-start must set globalThis._userDraggedFireAge = true`);
  }
});

test('US3 FR-010 idle-clear: drag-end schedules a 500ms reset', () => {
  // Both files must clear the flag after a 500ms idle window.
  const RR_HTML = fs.readFileSync(path.join(REPO_ROOT, 'FIRE-Dashboard.html'), 'utf8');
  for (const [name, src] of [['Generic', HTML], ['RR', RR_HTML]]) {
    assert.ok(/setTimeout\(\s*\(\)\s*=>\s*\{[\s\S]{0,200}_userDraggedFireAge\s*=\s*false[\s\S]{0,80}\}\s*,\s*500\s*\)/.test(src),
      `${name}: 500ms idle clear-on-idle wiring not found`);
  }
});
