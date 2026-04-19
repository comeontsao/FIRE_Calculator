/*
 * Meta-test for fixture shape conformance (research.md §R7 check 4).
 *
 * Dynamically imports every tests/fixtures/*.js file (except types.js, which
 * holds only JSDoc typedefs) and asserts each default export conforms to the
 * FixtureCase shape from data-model.md §7:
 *   { name: string, inputs: object, expected: object, kind: 'unit'|'parity'|'integration' }
 * Optional: `notes?: string`, `divergent?: string[]`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixturesDir = join(__dirname, '..', 'fixtures');

const ALLOWED_KINDS = Object.freeze(new Set(['unit', 'parity', 'integration']));

async function listFixtureFiles() {
  const entries = await readdir(fixturesDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.js') && e.name !== 'types.js')
    .map((e) => join(fixturesDir, e.name));
}

test('fixtures: every file default-exports a valid FixtureCase', async (t) => {
  const files = await listFixtureFiles();
  assert.ok(files.length > 0, 'expected at least one fixture file');

  /** @type {string[]} */
  const validated = [];

  for (const file of files) {
    const mod = await import(pathToFileURL(file).href);
    const fx = mod.default;
    const tag = `[${file}]`;

    assert.ok(fx, `${tag} default export missing`);
    assert.equal(typeof fx.name, 'string', `${tag} .name must be a string`);
    assert.ok(fx.name.length > 0, `${tag} .name must be non-empty`);
    assert.equal(
      typeof fx.inputs,
      'object',
      `${tag} .inputs must be an object`,
    );
    assert.ok(fx.inputs !== null, `${tag} .inputs must not be null`);
    assert.equal(
      typeof fx.expected,
      'object',
      `${tag} .expected must be an object`,
    );
    assert.ok(fx.expected !== null, `${tag} .expected must not be null`);
    assert.ok(
      ALLOWED_KINDS.has(fx.kind),
      `${tag} .kind must be one of ${[...ALLOWED_KINDS].join('|')}, got ${fx.kind}`,
    );

    if ('notes' in fx && fx.notes !== undefined) {
      assert.equal(typeof fx.notes, 'string', `${tag} .notes must be string when present`);
    }

    if ('divergent' in fx && fx.divergent !== undefined) {
      assert.ok(
        Array.isArray(fx.divergent),
        `${tag} .divergent must be array when present`,
      );
      for (const field of fx.divergent) {
        assert.equal(
          typeof field,
          'string',
          `${tag} .divergent[] entries must be strings`,
        );
      }
    }

    validated.push(file);
  }

  t.diagnostic(`Validated ${validated.length} fixtures:`);
  for (const f of validated) t.diagnostic(`  - ${f}`);
});
