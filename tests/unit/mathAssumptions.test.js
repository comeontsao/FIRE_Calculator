/**
 * Feature 033 — math-assumptions cleanup.
 *
 * Part 1 (T003): unit contract for calc/assumptions.js — the realRate Fisher
 *   identities and the CASH_REAL_RETURN bounds/constancy guarantees.
 * Part 2 (T011, US1): static guard (a) — no hardcoded cash-growth multiplier
 *   may exist anywhere in the simulators outside calc/assumptions.js.
 * Part 3 (T023, US3): static guard (b) — no subtraction-form real-rate
 *   derivation may exist in simulator code.
 *
 * Contract of record:
 *   specs/033-math-assumptions-cleanup/contracts/assumptions.contract.md
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const { CASH_REAL_RETURN, realRate } = require(path.join(REPO_ROOT, 'calc', 'assumptions.js'));

// ---------------------------------------------------------------------------
// Part 1 — module contract (T003)
// ---------------------------------------------------------------------------

test('CASH_REAL_RETURN is 0.0 (clarification Q1) and within bounds', () => {
  assert.strictEqual(CASH_REAL_RETURN, 0.0);
  assert.ok(Number.isFinite(CASH_REAL_RETURN));
  assert.ok(CASH_REAL_RETURN >= -0.05 && CASH_REAL_RETURN <= 0.05);
});

test('realRate identity: realRate(x, 0) === x', () => {
  for (const x of [0, 0.005, 0.03, 0.07, 0.12, -0.02]) {
    assert.ok(Math.abs(realRate(x, 0) - x) < 1e-12, `realRate(${x}, 0)`);
  }
});

test('realRate identity: realRate(x, x) === 0 (SS-COLA default is exactly 0)', () => {
  for (const x of [0, 0.02, 0.04, 0.07]) {
    assert.ok(Math.abs(realRate(x, x)) < 1e-12, `realRate(${x}, ${x})`);
  }
});

test('realRate canonical example: realRate(0.07, 0.04) ≈ 0.0288462 (NOT 0.03)', () => {
  const r = realRate(0.07, 0.04);
  assert.ok(Math.abs(r - (1.07 / 1.04 - 1)) < 1e-12);
  assert.ok(Math.abs(r - 0.0288461538) < 1e-9);
  // The subtraction shortcut overstates by ~0.115%/yr at these rates.
  assert.ok(0.03 - r > 0.001 && 0.03 - r < 0.0013);
});

test('undisturbed cash pool holds constant purchasing power at CASH_REAL_RETURN = 0', () => {
  let pCash = 80_000;
  for (let y = 0; y < 57; y += 1) pCash *= (1 + CASH_REAL_RETURN);
  assert.strictEqual(pCash, 80_000);
});

// ---------------------------------------------------------------------------
// Static-guard scaffolding (Parts 2 & 3 land with US1/US3 — see T011/T023).
// The file-set helper is defined now so the guards bolt on without rework.
// ---------------------------------------------------------------------------

const fs = require('node:fs');

/** Both dashboards + every browser-loaded calc module (from script tags). */
function simulatorSurfaces() {
  const surfaces = [];
  for (const html of ['FIRE-Dashboard.html', 'FIRE-Dashboard-Generic.html']) {
    const p = path.join(REPO_ROOT, html);
    const src = fs.readFileSync(p, 'utf8');
    surfaces.push({ name: html, src });
    const re = /<script\s+src="(calc\/[\w.-]+\.js)"/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const rel = m[1];
      if (rel === 'calc/assumptions.js') continue; // the one defining location
      if (!surfaces.some((s) => s.name === rel)) {
        surfaces.push({ name: rel, src: fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8') });
      }
    }
  }
  // Node-only canonical-input builder shares the same math rules.
  surfaces.push({
    name: 'calc/getCanonicalInputs.js',
    src: fs.readFileSync(path.join(REPO_ROOT, 'calc', 'getCanonicalInputs.js'), 'utf8'),
  });
  return surfaces;
}

module.exports = { simulatorSurfaces };

// ---------------------------------------------------------------------------
// Part 2 (T011, US1) — static guard (a): no hardcoded cash-growth multiplier
// outside calc/assumptions.js. Exclusion ledger per research.md §R1 + the
// US1 implementation findings.
// ---------------------------------------------------------------------------

/** Lines allowed to contain 1.005 / 0.005 without being cash-growth sites. */
const CASH_GUARD_EXCLUSIONS = [
  /letter-spacing/,             // CSS micro-typography
  /isTie|SAFE_TIE_FRACTION/,    // payoff-vs-invest tie thresholds
  /spread\s*[<>]|magnitude/,    // payoffVsInvest verdict thresholds
  /appreciation:\s*0\.005/,     // japan scenario constant (unrelated to cash)
];

test('static guard (a): zero hardcoded cash-growth multipliers outside calc/assumptions.js', () => {
  const offenders = [];
  for (const { name, src } of simulatorSurfaces()) {
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      if (!/1\.005|0\.005/.test(line)) return;
      if (CASH_GUARD_EXCLUSIONS.some((re) => re.test(line))) return;
      offenders.push(`${name}:${i + 1}: ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(offenders, [],
    `Hardcoded cash-growth multiplier(s) found — every cash-growth site MUST consume ` +
    `CASH_REAL_RETURN from calc/assumptions.js (feature 033 FR-003):\n  ${offenders.join('\n  ')}`);
});
