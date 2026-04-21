/*
 * Meta-tests enforcing constitution Principle II (pure calc modules) and
 * Principle VI (explicit chart ↔ module contracts).
 *
 * Three checks (per research.md §R7):
 *   (a) No DOM / Chart.js / browser-globals references in calc/*.js.
 *   (b) Every calc/*.js begins with a header declaring Inputs, Outputs,
 *       Consumers within the first 80 lines.
 *   (c) Bidirectional chart ↔ module annotation bijection. DISABLED until
 *       US4 (T063). Lives as a test.skip() below.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..', '..');
const calcDir = join(repoRoot, 'calc');

/** Forbidden tokens per FR-007 and Principle II. */
const FORBIDDEN_TOKENS = Object.freeze([
  'document',
  'window',
  'Chart',
  'localStorage',
  'sessionStorage',
  'navigator',
]);

/**
 * Glue-layer allowlist — files exempt from the forbidden-token scan only.
 *
 * calc/shims.js is a glue layer per research.md §R1 (feature
 * 005-canonical-public-launch); exempt from the no-window rule because it
 * delegates 100% to canonical calc modules and wraps the boundary with
 * try/catch + documented fallbacks. Its fallback behavior is Node-unit-tested
 * in tests/unit/shims.test.js.
 *
 * The Inputs/Outputs/Consumers header check (second test below) STILL applies
 * to every file in calc/ — including allowlisted glue layers.
 */
const GLUE_LAYER_ALLOWLIST = Object.freeze([join(calcDir, 'shims.js')]);

/** Lines at the top of a calc module that must declare the contract. */
const HEADER_WINDOW = 80;
const REQUIRED_HEADER_FIELDS = Object.freeze(['Inputs:', 'Outputs:', 'Consumers:']);

/**
 * Build a boundary-boundary regex for a forbidden token so that similar but
 * legitimate words don't false-positive (e.g. `window` inside a contextually
 * safe identifier — none exist today, but guard anyway).
 */
function forbiddenRegex(token) {
  // \b only works for ASCII word chars; calc tokens are all ASCII so OK.
  return new RegExp(`\\b${token}\\b`);
}

/**
 * List `.js` files directly under `calc/` (non-recursive for now — calc is flat).
 */
async function listCalcFiles() {
  const entries = await readdir(calcDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.js'))
    .map((e) => join(calcDir, e.name));
}

test('calc modules: no forbidden DOM/browser tokens', async () => {
  const files = await listCalcFiles();
  assert.ok(files.length > 0, 'expected at least one calc/*.js module to exist');

  /** @type {string[]} */
  const offenses = [];

  for (const file of files) {
    // Glue-layer allowlist bypass: shims.js is permitted to read window.*
    // at call time (see GLUE_LAYER_ALLOWLIST doc above + research.md §R1).
    if (GLUE_LAYER_ALLOWLIST.includes(file)) {
      continue;
    }
    const src = await readFile(file, 'utf8');
    const lines = src.split(/\r?\n/);
    lines.forEach((line, idx) => {
      // Skip full-line comments — header docs mention Consumers etc and
      // sometimes need to reference chart names (e.g., "growthChart"). The
      // block-comment scanner below handles multi-line headers.
      // We still want to catch `document.getElementById` inside code, so
      // only skip lines that are clearly pure JS-line-comments.
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        return;
      }
      for (const token of FORBIDDEN_TOKENS) {
        if (forbiddenRegex(token).test(line)) {
          offenses.push(`${file}:${idx + 1}: forbidden token '${token}' — ${trimmed}`);
        }
      }
    });
  }

  assert.deepEqual(
    offenses,
    [],
    `Principle II violation — calc/*.js must not reference DOM/browser globals:\n${offenses.join('\n')}`,
  );
});

test('calc modules: Inputs/Outputs/Consumers header present', async () => {
  const files = await listCalcFiles();
  /** @type {string[]} */
  const offenses = [];

  for (const file of files) {
    const src = await readFile(file, 'utf8');
    const head = src.split(/\r?\n/).slice(0, HEADER_WINDOW).join('\n');
    const missing = REQUIRED_HEADER_FIELDS.filter((field) => !head.includes(field));
    if (missing.length > 0) {
      offenses.push(
        `${file}: missing required header fields ${JSON.stringify(missing)} ` +
          `within first ${HEADER_WINDOW} lines`,
      );
    }
  }

  assert.deepEqual(
    offenses,
    [],
    `Principle VI violation — every calc/*.js needs Inputs:/Outputs:/Consumers: header:\n${offenses.join('\n')}`,
  );
});

// TODO: enable in US4 (T063)
test.skip('charts <-> modules bijection (disabled until US4 T063)', () => {
  // Will parse @chart:/@module: blocks in FIRE-Dashboard{,-Generic}.html
  // and every calc/*.js Consumers: list, asserting bidirectional edges match.
});
