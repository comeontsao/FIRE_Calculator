/*
 * Meta-test: `// FRAME:` annotation coverage across calc/*.js modules.
 *
 * Feature: 022-nominal-dollar-display
 * Spec:    specs/022-nominal-dollar-display/spec.md FR-011
 * Contract: specs/022-nominal-dollar-display/contracts/frame-comment-conventions.contract.md
 *
 * Walks every calc/*.js file. For each line containing a qualifying frame
 * token, checks that a `// FRAME:` annotation appears within 3 lines above
 * (inclusive of the same line, since the token may sit on its own annotation
 * line). Asserts ≥95% qualifying-line coverage:
 *   offenders.length / qualifying.length <= 0.05
 *
 * NOTE (Wave 1): This test will INITIALLY FAIL because no `// FRAME:`
 * annotations exist yet across the calc layer. The failure is by design —
 * US2 (Phase 3) closes the gap. Until then, the test should run without
 * crashing and emit a useful diagnostic listing the offenders so US2 work
 * can target them precisely.
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

/**
 * Qualifying tokens that mark a $-valued or frame-significant line. A line
 * matching this regex MUST have a `// FRAME:` annotation within 3 lines above
 * (or be itself a `// FRAME:` annotation, or live inside a block comment).
 *
 * Source: contracts/frame-comment-conventions.contract.md § Meta-test enforcement.
 */
const QUALIFYING_TOKEN_REGEX =
  /\b(realReturn|realReturnStocks|realReturn401k|inflationRate|nominalReturn|raiseRate|BookValue|toBookValue|invertToReal)\b/;

const FRAME_COMMENT_REGEX =
  /\/\/\s*FRAME:\s*(real-\$|nominal-\$|conversion|pure-data|mixed)/i;

const FRAME_INLINE_REGEX = /\/\/\s*FRAME:/i;

const COVERAGE_THRESHOLD = 0.95; // ≥95% qualifying-line coverage

/** Distance (in lines) above a qualifying line within which a FRAME comment qualifies. */
const LOOKBACK_LINES = 3;

/**
 * List `.js` files directly under `calc/`. The meta-test itself excludes
 * tests/ files (test files are not annotated; only production calc code is).
 */
async function listCalcFiles() {
  const entries = await readdir(calcDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.js'))
    .map((e) => join(calcDir, e.name));
}

/**
 * Compute, for each file's source, the set of (line-index, line-text) pairs
 * that are inside a `/* ... *\/` block comment. Block-comment lines are
 * exempt from the qualifying check (per contract).
 */
function blockCommentLineIndices(lines) {
  const insideBlock = new Set();
  let inBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (inBlock) {
      insideBlock.add(i);
      if (/\*\//.test(line)) {
        inBlock = false;
      }
      continue;
    }
    // Line opens a block comment that doesn't close on the same line.
    const openIdx = line.indexOf('/*');
    const closeIdx = line.indexOf('*/');
    if (openIdx >= 0 && (closeIdx < 0 || closeIdx < openIdx)) {
      inBlock = true;
      insideBlock.add(i);
    }
  }
  return insideBlock;
}

test('frame-coverage: ≥95% qualifying-line // FRAME: annotation coverage across calc/*.js', async () => {
  const files = await listCalcFiles();
  assert.ok(files.length > 0, 'expected at least one calc/*.js module to exist');

  /** @type {Array<{file: string, line: number, text: string}>} */
  const offenders = [];
  /** @type {Array<{file: string, line: number, text: string}>} */
  const qualifying = [];

  for (const file of files) {
    const src = await readFile(file, 'utf8');
    const lines = src.split(/\r?\n/);
    const blockLines = blockCommentLineIndices(lines);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip lines inside block comments — block comments are documentation;
      // qualifying tokens here are descriptive, not code.
      if (blockLines.has(i)) continue;

      // Skip pure single-line comments (any line starting with `//`)
      // unless it's itself a `// FRAME:` line. Single-line comments are
      // commentary, not active code.
      const trimmed = line.trim();
      if (trimmed.startsWith('//') && !FRAME_INLINE_REGEX.test(line)) {
        continue;
      }

      if (!QUALIFYING_TOKEN_REGEX.test(line)) continue;
      qualifying.push({ file, line: i + 1, text: trimmed });

      // A qualifying line passes if:
      //   (a) the line itself is a // FRAME: annotation, OR
      //   (b) any of the previous LOOKBACK_LINES lines is a // FRAME: annotation
      let covered = FRAME_COMMENT_REGEX.test(line);
      if (!covered) {
        for (let k = Math.max(0, i - LOOKBACK_LINES); k < i; k++) {
          if (FRAME_COMMENT_REGEX.test(lines[k])) {
            covered = true;
            break;
          }
        }
      }
      if (!covered) {
        offenders.push({ file, line: i + 1, text: trimmed });
      }
    }
  }

  const ratio = qualifying.length === 0 ? 1 : offenders.length / qualifying.length;
  const coverage = qualifying.length === 0 ? 1 : 1 - ratio;

  // Emit a useful diagnostic listing offenders before assertion (helpful for
  // US2 work targeting). Truncate at 50 lines to keep CI logs readable.
  const SHOW = 50;
  const offenderHead = offenders.slice(0, SHOW).map(
    (o) => `  ${o.file}:${o.line}  ${o.text}`,
  );
  const overflow = offenders.length > SHOW ? `\n  ... (+${offenders.length - SHOW} more)` : '';

  assert.ok(
    ratio <= 1 - COVERAGE_THRESHOLD,
    [
      `// FRAME: annotation coverage below ${(COVERAGE_THRESHOLD * 100).toFixed(0)}% threshold:`,
      `  qualifying lines: ${qualifying.length}`,
      `  offenders:        ${offenders.length}`,
      `  coverage:         ${(coverage * 100).toFixed(2)}%`,
      `  threshold:        ${(COVERAGE_THRESHOLD * 100).toFixed(0)}%`,
      '',
      'Offenders (line numbers in calc/*.js):',
      ...offenderHead,
      overflow,
    ].join('\n'),
  );
});
