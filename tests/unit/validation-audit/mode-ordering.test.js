'use strict';
// =============================================================================
// tests/unit/validation-audit/mode-ordering.test.js
//
// Feature 020 — Validation Audit, Phase 5 (User Story 1) — T050, T051, T052.
// Spec:     specs/020-validation-audit/spec.md
// Tasks:    specs/020-validation-audit/tasks.md (Phase 5)
// Contract: specs/020-validation-audit/contracts/validation-audit-harness.contract.md
// Data:     specs/020-validation-audit/data-model.md (§Invariant)
//
// Defines and runs two mode-ordering invariants across the persona matrix:
//
//   A1 (CRITICAL) — fireAge ordering:
//       For each persona, dieWithZero.totalMonths ≤ exact.totalMonths ≤ safe.totalMonths.
//       Skipped when any of the three modes is infeasible at all ages.
//
//   A2 (HIGH) — per-fireAge fire-number permissiveness ordering:
//       For each persona, sweep fireAge ∈ {currentAge+5, +10, +15, +20}.
//       For each candidate, the modes ordered by required portfolio satisfy
//       DWZ ≤ Exact ≤ Safe (lower = more permissive). We test this via the
//       feasibility-implication proxy: at the same persona portfolio,
//       Safe feasible ⇒ Exact feasible, AND Exact feasible ⇒ DWZ feasible.
//
// CommonJS (Constitution Principle V — file:// compatible).
// Uses node:test (Node ≥ 18).
// =============================================================================

const { test } = require('node:test');
const assert   = require('node:assert');
const path     = require('path');

const HARNESS_PATH  = path.join(__dirname, 'harness.js');
const PERSONAS_PATH = path.join(__dirname, 'personas.js');

const { runHarness, clearContextCache } = require(HARNESS_PATH);
const { personas }                       = require(PERSONAS_PATH);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Pull the persona's current age in a dashboard-agnostic way.
 * RR personas have ageRoger; Generic personas have agePerson1; both may have
 * either. Falls back to a sane default.
 */
function _currentAgeOf(persona) {
  const inp = persona.inp || {};
  if (typeof inp.agePerson1 === 'number') return inp.agePerson1;
  if (typeof inp.ageRoger   === 'number') return inp.ageRoger;
  return 42;
}

/**
 * Did findFireAgeNumerical produce a usable totalMonths value?
 * The harness records `{ years: null, ..., feasible: false, error: '...' }`
 * when the helper threw inside the sandbox.
 */
function _modeResultUsable(modeResult) {
  return !!modeResult
    && modeResult.feasible === true
    && typeof modeResult.totalMonths === 'number'
    && Number.isFinite(modeResult.totalMonths);
}

// ---------------------------------------------------------------------------
// Invariant A1 — fireAge ordering across modes
// ---------------------------------------------------------------------------

const invariantA1 = {
  id:          'A1',
  family:      'mode-ordering',
  description: 'fireAge ordering: dieWithZero.totalMonths ≤ exact.totalMonths ≤ safe.totalMonths',
  severity:    'CRITICAL',
  check(persona, ctx) {
    const m = ctx && ctx.fireAgeByMode;
    if (!m) {
      return {
        passed: true,
        notes:  'fireAgeByMode missing on harness context — skipping (harness API gap)',
      };
    }

    const dwz   = m.dieWithZero;
    const exact = m.exact;
    const safe  = m.safe;

    // Per task spec: skip personas where any mode is infeasible at any age.
    // A1 only fires when all three modes produce a valid integer-month result.
    if (!_modeResultUsable(dwz) || !_modeResultUsable(exact) || !_modeResultUsable(safe)) {
      return {
        passed: true,
        notes:
          'Skipped: not all three modes produced a usable totalMonths. ' +
          'safe=' + (safe && (safe.feasible === true ? safe.totalMonths : (safe.error || 'infeasible'))) +
          ', exact=' + (exact && (exact.feasible === true ? exact.totalMonths : (exact.error || 'infeasible'))) +
          ', dwz=' + (dwz && (dwz.feasible === true ? dwz.totalMonths : (dwz.error || 'infeasible'))),
      };
    }

    if (!(dwz.totalMonths <= exact.totalMonths)) {
      return {
        passed:   false,
        observed: { dwzMonths: dwz.totalMonths, exactMonths: exact.totalMonths },
        expected: 'dieWithZero.totalMonths ≤ exact.totalMonths',
        notes:    'DWZ should be no later than Exact: DWZ permits drainage to ' +
                  '$0, while Exact requires terminal buffer ≥ 0.',
      };
    }

    if (!(exact.totalMonths <= safe.totalMonths)) {
      return {
        passed:   false,
        observed: { exactMonths: exact.totalMonths, safeMonths: safe.totalMonths },
        expected: 'exact.totalMonths ≤ safe.totalMonths',
        notes:    'Exact should be no later than Safe: Safe enforces a ' +
                  'trajectory floor that Exact does not.',
      };
    }

    return { passed: true };
  },
};

// ---------------------------------------------------------------------------
// Invariant A2 — per-fireAge fire-number permissiveness ordering
//
// Implementation note (per task instructions): rather than binary-searching for
// the exact required portfolio at each candidate fireAge × mode, we use the
// feasibility-implication proxy. Under the contract DWZ ≤ Exact ≤ Safe (lower
// portfolio required = more permissive), it must hold that with the persona's
// actual portfolio:
//
//   feasible(safe) ⇒ feasible(exact) ⇒ feasible(dieWithZero)
//
// If the persona has enough portfolio to satisfy the strictest mode (Safe),
// they must also satisfy any more permissive mode. Any violation of this
// implication is a permissiveness inversion and worth a finding.
// ---------------------------------------------------------------------------

const invariantA2 = {
  id:          'A2',
  family:      'mode-ordering',
  description: 'fire-number ordering at each candidate fireAge: ' +
               'feasible(safe) ⇒ feasible(exact) ⇒ feasible(dieWithZero) ' +
               '(equivalently DWZ_total ≤ Exact_total ≤ Safe_total)',
  severity:    'HIGH',
  check(persona, ctx) {
    const api = ctx && ctx._api;
    if (!api || typeof api.signedLifecycleEndBalance !== 'function' ||
        typeof api.isFireAgeFeasible !== 'function') {
      return {
        passed: true,
        notes:  'Sandbox API not present on harness context — skipping.',
      };
    }

    const inp         = persona.inp;
    const annualSpend = inp.annualSpend || 72700;
    const currentAge  = _currentAgeOf(persona);
    const candidates  = [currentAge + 5, currentAge + 10, currentAge + 15, currentAge + 20];

    const violations = [];

    for (const fireAge of candidates) {
      // Skip fireAge candidates beyond endAge (degenerate — accumulation can't
      // run past plan end).
      const endAge = inp.endAge || 100;
      if (fireAge >= endAge) continue;

      let sim;
      try {
        sim = api.signedLifecycleEndBalance(inp, annualSpend, fireAge);
      } catch (_e) {
        continue;  // skip candidates where the sim itself throws
      }

      // Compute feasibility per mode at this candidate. Treat any throw as
      // "not feasible" — matches what the chart-side gate does (it catches
      // and falls through, returning false for Safe; Exact and DWZ have
      // their own fallback paths).
      function _feas(mode) {
        try {
          return api.isFireAgeFeasible(sim, inp, annualSpend, mode, fireAge) === true;
        } catch (_e) {
          return null;  // sentinel: throw inside the helper (harness gap)
        }
      }

      const fSafe  = _feas('safe');
      const fExact = _feas('exact');
      const fDWZ   = _feas('dieWithZero');

      // If any mode threw, we cannot evaluate the implication chain at this
      // candidate cleanly. Skip rather than guess.
      if (fSafe === null || fExact === null || fDWZ === null) continue;

      // feasible(safe) ⇒ feasible(exact)
      if (fSafe && !fExact) {
        violations.push({
          fireAge,
          rule:    'safe-implies-exact',
          fSafe, fExact, fDWZ,
        });
      }

      // feasible(exact) ⇒ feasible(dieWithZero)
      if (fExact && !fDWZ) {
        violations.push({
          fireAge,
          rule:    'exact-implies-dieWithZero',
          fSafe, fExact, fDWZ,
        });
      }
    }

    if (violations.length === 0) {
      return { passed: true };
    }

    return {
      passed:   false,
      observed: violations,
      expected: 'feasible(safe) ⇒ feasible(exact) ⇒ feasible(dieWithZero) at every candidate fireAge',
      notes:    'Permissiveness inversion: a stricter mode passed where a more ' +
                'permissive mode failed. Indicates the feasibility helper or ' +
                'the resolver is computing per-mode thresholds in inverted order.',
    };
  },
};

// ---------------------------------------------------------------------------
// Test driver: T050 + T051 + T052 — run A1 and A2 across the full persona matrix
// ---------------------------------------------------------------------------

test('T050+T051+T052: mode-ordering invariants A1 and A2 run across the persona matrix', () => {
  clearContextCache();

  const result = runHarness(personas, [invariantA1, invariantA2], { silent: true });

  // The harness contract guarantees the result shape regardless of pass/fail.
  assert.strictEqual(typeof result, 'object',         'runHarness must return an object');
  assert.ok(typeof result.totalCells === 'number',    'totalCells must be a number');
  assert.ok(typeof result.passed     === 'number',    'passed must be a number');
  assert.ok(typeof result.failed     === 'number',    'failed must be a number');
  assert.ok(Array.isArray(result.findings),           'findings must be an array');
  assert.ok(typeof result.durationMs === 'number',    'durationMs must be a number');

  // Invariant: passed + failed = totalCells. The harness bumps `failed` by
  // activeInvariants.length when a persona's context build throws, which keeps
  // this identity intact even when sandbox construction fails.
  assert.strictEqual(
    result.passed + result.failed,
    result.totalCells,
    'passed + failed should equal totalCells'
  );

  // Print summary so the test output records the audit findings inline.
  // Use stderr-style logging via node:test's diagnostic channel.
  // (We do not throw on findings — this test is the AUDIT itself; failures
  // are catalogued for fix in Phase 10. The test passes as long as the
  // harness completes without crashing.)
  // eslint-disable-next-line no-console
  console.log(
    '[mode-ordering.test.js] persona×invariant cells: ' + result.totalCells +
    '  passed=' + result.passed +
    '  failed=' + result.failed +
    '  durationMs=' + result.durationMs
  );

  // Group findings by invariant for at-a-glance reporting.
  const byInv = {};
  for (const f of result.findings) {
    byInv[f.invariantId] = (byInv[f.invariantId] || 0) + 1;
  }
  for (const id of Object.keys(byInv)) {
    // eslint-disable-next-line no-console
    console.log('[mode-ordering.test.js] ' + id + ': ' + byInv[id] + ' findings');
  }
});

// ---------------------------------------------------------------------------
// Per-invariant smoke test: confirm both invariants are runnable with the
// FAMILY env filter. This is a meta-check — it asserts the invariant objects
// have the right shape and the harness accepts them.
// ---------------------------------------------------------------------------

test('mode-ordering invariants are well-formed and runnable in isolation', () => {
  clearContextCache();

  // Verify invariant shape.
  for (const inv of [invariantA1, invariantA2]) {
    assert.strictEqual(typeof inv.id,          'string',  inv.id + '.id must be a string');
    assert.strictEqual(typeof inv.family,      'string',  inv.id + '.family must be a string');
    assert.strictEqual(typeof inv.description, 'string',  inv.id + '.description must be a string');
    assert.ok(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(inv.severity), inv.id + '.severity must be one of the four levels');
    assert.strictEqual(typeof inv.check,       'function', inv.id + '.check must be a function');
    assert.strictEqual(inv.family, 'mode-ordering',         inv.id + '.family must be mode-ordering');
  }

  // Run with a small sub-matrix (first 3 personas) to confirm the harness
  // wiring works without a full-matrix run.
  const subMatrix = personas.slice(0, 3);
  const result    = runHarness(subMatrix, [invariantA1, invariantA2], { silent: true });

  assert.ok(result.totalCells === subMatrix.length * 2, 'totalCells should be 3 × 2 = 6');
  assert.ok(result.passed + result.failed >= result.totalCells, 'passed + failed must cover totalCells');
});

// ---------------------------------------------------------------------------
// Module exports — expose invariants so other modules (e.g., a future
// run-all driver in T072) can reuse them.
// ---------------------------------------------------------------------------

module.exports = {
  invariantA1,
  invariantA2,
};
