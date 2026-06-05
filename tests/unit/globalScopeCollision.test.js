/**
 * Global-scope collision guard (hotfix on 032 branch, 2026-06-05).
 *
 * Classic <script src="calc/X.js"> tags share ONE global lexical scope in the
 * browser. A duplicate top-level `const`/`let`/`class` name across two loaded
 * modules throws SyntaxError at script evaluation and SILENTLY kills the
 * entire second module — every caller degrades through its `typeof` fallback.
 *
 * This actually happened: calc/cashSweep.js and calc/withdrawalTooltipFrame.js
 * both declared top-level `const _api`, colliding with calc/calcAudit.js.
 * Result: `_applyCashSweep` (feature 030) and the tooltip-frame helpers never
 * loaded in any real browser, while Node unit tests (separate module scopes)
 * stayed green. Detected only by the browser console-clean E2E gate.
 *
 * This test statically extracts the <script src="calc/..."> list from BOTH
 * dashboards and asserts every top-level lexical declaration name is unique
 * across the modules each HTML file loads.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const HTML_FILES = ['FIRE-Dashboard.html', 'FIRE-Dashboard-Generic.html'];

/** Extract calc/*.js paths referenced via <script src> in an HTML file. */
function loadedCalcScripts(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const out = [];
  const re = /<script\s+src="(calc\/[\w.-]+\.js)"/g;
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

/**
 * Extract top-level declaration names from a JS file, split by kind:
 *   - lexical (const/let/class): collide with ANY other top-level declaration
 *     of the same name in another classic script (SyntaxError).
 *   - varLike (var/function): two var-likes coexist fine, but a var-like
 *     colliding with a lexical in another script still throws.
 * Top-level = column 0. Indented declarations are function/block scoped.
 */
function topLevelNames(jsPath) {
  const src = fs.readFileSync(jsPath, 'utf8');
  const lexical = [];
  const varLike = [];
  const re = /^(?:(const|let|class)|(var|function|async function))\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (m[1]) lexical.push(m[3]);
    else varLike.push(m[3]);
  }
  return { lexical, varLike };
}

for (const htmlFile of HTML_FILES) {
  test(`no top-level lexical name collisions across calc scripts loaded by ${htmlFile}`, () => {
    const htmlPath = path.join(REPO_ROOT, htmlFile);
    const scripts = loadedCalcScripts(htmlPath);
    assert.ok(scripts.length >= 5, `expected ≥5 calc script tags in ${htmlFile}, found ${scripts.length}`);

    // name → { file, kind } of first declaration. A collision is any repeat
    // where at least ONE of the two declarations is lexical (const/let/class).
    // (Two var/function declarations across scripts merge silently — legal.)
    const owner = new Map();
    const collisions = [];
    for (const rel of scripts) {
      const jsPath = path.join(REPO_ROOT, rel);
      assert.ok(fs.existsSync(jsPath), `script tag references missing file: ${rel}`);
      const { lexical, varLike } = topLevelNames(jsPath);
      for (const [kind, names] of [['lexical', lexical], ['varLike', varLike]]) {
        for (const name of names) {
          const prev = owner.get(name);
          if (prev && prev.file !== rel) {
            if (prev.kind === 'lexical' || kind === 'lexical') {
              collisions.push(`'${name}' (${prev.kind} in ${prev.file}, ${kind} in ${rel})`);
            }
          } else if (!prev) {
            owner.set(name, { file: rel, kind });
          }
        }
      }
    }
    assert.deepEqual(collisions, [],
      `Duplicate top-level lexical declarations would throw SyntaxError in the browser ` +
      `and silently kill the second module:\n  ${collisions.join('\n  ')}`);
  });

  test(`sidebarMode is declared with var (TDZ-safe) in ${htmlFile}`, () => {
    const html = fs.readFileSync(path.join(REPO_ROOT, htmlFile), 'utf8');
    assert.ok(/^var sidebarMode = /m.test(html),
      `expected 'var sidebarMode' — a 'let' here is read during boot via ` +
      `renderLifecycleSidebarChart and throws a TDZ ReferenceError on every cold load`);
    assert.ok(!/^let sidebarMode = /m.test(html), `found 'let sidebarMode' — must be var`);
  });
}
