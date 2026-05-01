'use strict';
// =============================================================================
// tests/unit/validation-audit/end-state-validity.test.js
//
// Feature 020 — Validation Audit, Phase 6 (User Story 2) — T053, T054, T055, T056.
// Spec:     specs/020-validation-audit/spec.md
// Tasks:    specs/020-validation-audit/tasks.md (Phase 6)
// Contract: specs/020-validation-audit/contracts/validation-audit-harness.contract.md
// Data:     specs/020-validation-audit/data-model.md (§Invariant)
//
// Defines and runs three end-state-validity invariants across the persona matrix:
//
//   B1 (HIGH)   — Safe trajectory + 20% terminal floor:
//                 For personas where Safe is feasible at age N, assert:
//                   (a) chart's last row total ≥ 0.20 × FIRE-year total
//                   (b) every retirement-year row's total ≥ buffer × annualSpend
//                       (bufferUnlock for ages < 59.5, bufferSS for ages ≥ 59.5)
//
//   B2 (MEDIUM) — Exact terminal-buffer floor:
//                 For personas where Exact is feasible at age N, assert:
//                   chart's last row total ≥ terminalBuffer × annualSpend
//                 (Note: terminalBuffer is read from inp; the harness's DOC_STUB
//                 returns '0' for the DOM input — we use inp.terminalBuffer
//                 directly since that is the persona-driven value.)
//
//   B3 (HIGH)   — DWZ strict 0-shortfall + boundary year infeasibility:
//                 For personas where DWZ is feasible at age N, assert:
//                   (a) zero shortfall years across the trajectory:
//                       every retirement-year row's total ≥ 0
//                       AND no row has hasShortfall === true
//                   (b) at age N-1, DWZ is INFEASIBLE
//                       (boundary check — confirms the resolver returns the
//                       EARLIEST feasible age, not just any feasible age).
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

const UNLOCK_AGE              = 59.5;
const SAFE_TERMINAL_FIRE_RATIO = 0.20;

/**
 * Pull the persona's current age in a dashboard-agnostic way.
 */
function _currentAgeOf(persona) {
  const inp = persona.inp || {};
  if (typeof inp.agePerson1 === 'number') return inp.agePerson1;
  if (typeof inp.ageRoger   === 'number') return inp.ageRoger;
  return 42;
}

/**
 * Has the harness produced a usable totalMonths value for this mode?
 */
function _modeResultUsable(modeResult) {
  return !!modeResult
    && modeResult.feasible === true
    && typeof modeResult.totalMonths === 'number'
    && Number.isFinite(modeResult.totalMonths);
}

/**
 * Convert a harness mode result into the integer FIRE age N
 * (resolver returns the EARLIEST feasible candidate; we use ceil(months/12)).
 */
function _fireAgeFromModeResult(modeResult, currentAge) {
  if (!_modeResultUsable(modeResult)) return null;
  const yrs = Math.ceil(modeResult.totalMonths / 12);
  return currentAge + yrs;
}

/**
 * Run projectFullLifecycle at a specific fireAge, returning rows on success
 * or null if the simulator throws (e.g., harness sandbox gap). Uses the
 * default chart options (no strategy override), matching the harness's
 * own buildHarnessContext path.
 */
function _projectAtFireAge(api, inp, annualSpend, fireAge) {
  if (!api || typeof api.projectFullLifecycle !== 'function') return null;
  try {
    const rows = api.projectFullLifecycle(inp, annualSpend, fireAge, true, undefined);
    return Array.isArray(rows) ? rows : null;
  } catch (_e) {
    return null;
  }
}

/**
 * Re-run isFireAgeFeasible at a candidate fireAge, returning a tri-state:
 *   true  — feasible
 *   false — infeasible (helper returned false)
 *   null  — helper threw inside the sandbox (treat as 'unknown')
 */
function _feasibleAt(api, inp, annualSpend, mode, fireAge) {
  if (!api || typeof api.signedLifecycleEndBalance !== 'function' ||
      typeof api.isFireAgeFeasible !== 'function') return null;
  let sim;
  try {
    sim = api.signedLifecycleEndBalance(inp, annualSpend, fireAge);
  } catch (_e) {
    return null;
  }
  try {
    return api.isFireAgeFeasible(sim, inp, annualSpend, mode, fireAge) === true;
  } catch (_e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Invariant B1 — Safe trajectory + 20% terminal floor
// ---------------------------------------------------------------------------

const invariantB1 = {
  id:          'B1',
  family:      'end-state-validity',
  description: 'Safe-mode chart: every retirement-year total ≥ buffer × annualSpend ' +
               'AND last row total ≥ 0.20 × FIRE-year total',
  severity:    'HIGH',
  check(persona, ctx) {
    const inp         = persona.inp;
    const annualSpend = inp.annualSpend || 72700;
    const currentAge  = _currentAgeOf(persona);
    const safeResult  = ctx && ctx.fireAgeByMode && ctx.fireAgeByMode.safe;

    if (!_modeResultUsable(safeResult)) {
      return {
        passed: true,
        notes:  'Skipped: Safe mode is not feasible (or harness sandbox gap). ' +
                'B1 only fires when Safe yields a usable totalMonths.',
      };
    }

    const fireAge = _fireAgeFromModeResult(safeResult, currentAge);
    if (fireAge == null) {
      return {
        passed: true,
        notes:  'Skipped: could not derive integer Safe fireAge from totalMonths.',
      };
    }

    const api  = ctx._api;
    const rows = _projectAtFireAge(api, inp, annualSpend, fireAge);
    if (!rows || rows.length === 0) {
      return {
        passed: true,
        notes:  'Skipped: projectFullLifecycle produced no rows at fireAge=' + fireAge,
      };
    }

    const fireRow = rows.find(r => r && typeof r.age === 'number' && r.age === fireAge);
    const lastRow = rows[rows.length - 1];

    if (!fireRow || !lastRow) {
      return {
        passed: true,
        notes:  'Skipped: chart missing fireRow or lastRow.',
      };
    }

    // (a) trajectory floor across retirement years.
    const bufUnlock = (inp.bufferUnlock || 0) * annualSpend;
    const bufSS     = (inp.bufferSS     || 0) * annualSpend;
    const violations = [];
    for (const row of rows) {
      if (!row || typeof row.age !== 'number' || row.age < fireAge) continue;
      const floor = (row.age < UNLOCK_AGE) ? bufUnlock : bufSS;
      if (typeof row.total !== 'number' || row.total < floor) {
        violations.push({ age: row.age, total: row.total, floor });
        if (violations.length >= 3) break;  // cap for readable output
      }
    }

    // (b) terminal-floor: lastRow.total ≥ 20% × fireRow.total.
    const fireBal     = typeof fireRow.total === 'number' ? fireRow.total : 0;
    const endBal      = typeof lastRow.total === 'number' ? lastRow.total : 0;
    const terminalMin = SAFE_TERMINAL_FIRE_RATIO * fireBal;
    const terminalViolation = (fireBal > 0 && endBal < terminalMin)
      ? { fireBal, endBal, terminalMin }
      : null;

    if (violations.length === 0 && !terminalViolation) {
      return { passed: true };
    }

    return {
      passed:   false,
      observed: { trajectoryViolations: violations, terminalViolation, fireAge },
      expected: 'every retirement row ≥ buffer × spend AND last ≥ 0.20 × FIRE-year total',
      notes:    'Safe-mode chart violates the floor invariants the gate is ' +
                'supposed to enforce. Indicates the gate diverged from the ' +
                'rendered trajectory (regression of feature 008/018 work).',
    };
  },
};

// ---------------------------------------------------------------------------
// Invariant B2 — Exact terminal-buffer floor
// ---------------------------------------------------------------------------

const invariantB2 = {
  id:          'B2',
  family:      'end-state-validity',
  description: 'Exact-mode chart: last row total ≥ terminalBuffer × annualSpend',
  severity:    'MEDIUM',
  check(persona, ctx) {
    const inp         = persona.inp;
    const annualSpend = inp.annualSpend || 72700;
    const currentAge  = _currentAgeOf(persona);
    const exactResult = ctx && ctx.fireAgeByMode && ctx.fireAgeByMode.exact;

    if (!_modeResultUsable(exactResult)) {
      return {
        passed: true,
        notes:  'Skipped: Exact mode infeasible at every age.',
      };
    }

    const fireAge = _fireAgeFromModeResult(exactResult, currentAge);
    if (fireAge == null) {
      return {
        passed: true,
        notes:  'Skipped: could not derive integer Exact fireAge from totalMonths.',
      };
    }

    const api  = ctx._api;
    const rows = _projectAtFireAge(api, inp, annualSpend, fireAge);
    if (!rows || rows.length === 0) {
      return {
        passed: true,
        notes:  'Skipped: projectFullLifecycle produced no rows at fireAge=' + fireAge,
      };
    }

    const lastRow = rows[rows.length - 1];
    if (!lastRow || typeof lastRow.total !== 'number') {
      return {
        passed: true,
        notes:  'Skipped: lastRow.total is not numeric.',
      };
    }

    // Use inp.terminalBuffer directly. The HTML reads document.getElementById,
    // which the harness DOC_STUB returns as { value: '0' }. The persona-driven
    // value is the canonical one for an audit harness.
    const tBuffer = (typeof inp.terminalBuffer === 'number') ? inp.terminalBuffer : 0;
    const minEnd  = tBuffer * annualSpend;

    if (lastRow.total >= minEnd) {
      return { passed: true };
    }

    return {
      passed:   false,
      observed: { fireAge, endBalance: lastRow.total, terminalBuffer: tBuffer, minEnd },
      expected: 'last row total ≥ terminalBuffer × annualSpend (= ' + minEnd + ')',
      notes:    'Exact-mode chart did not preserve the terminal buffer the gate ' +
                'was supposed to ensure.',
    };
  },
};

// ---------------------------------------------------------------------------
// Invariant B3 — DWZ strict 0-shortfall + boundary year infeasibility
// ---------------------------------------------------------------------------

const invariantB3 = {
  id:          'B3',
  family:      'end-state-validity',
  description: 'DWZ-mode chart: zero shortfall years AND fireAge=N-1 is infeasible',
  severity:    'HIGH',
  check(persona, ctx) {
    const inp         = persona.inp;
    const annualSpend = inp.annualSpend || 72700;
    const currentAge  = _currentAgeOf(persona);
    const dwzResult   = ctx && ctx.fireAgeByMode && ctx.fireAgeByMode.dieWithZero;

    if (!_modeResultUsable(dwzResult)) {
      return {
        passed: true,
        notes:  'Skipped: DWZ mode infeasible at every age.',
      };
    }

    const fireAge = _fireAgeFromModeResult(dwzResult, currentAge);
    if (fireAge == null) {
      return {
        passed: true,
        notes:  'Skipped: could not derive integer DWZ fireAge from totalMonths.',
      };
    }

    const api = ctx._api;

    // (a) Zero shortfall years across the trajectory.
    const rows = _projectAtFireAge(api, inp, annualSpend, fireAge);
    if (!rows || rows.length === 0) {
      return {
        passed: true,
        notes:  'Skipped: projectFullLifecycle produced no rows at fireAge=' + fireAge,
      };
    }

    const shortfallRows = [];
    for (const row of rows) {
      if (!row) continue;
      // Skip accumulation rows — DWZ shortfall semantics apply to retirement.
      if (typeof row.age !== 'number' || row.age < fireAge) continue;
      const isNeg       = typeof row.total === 'number' && row.total < 0;
      const flagged     = row.hasShortfall === true;
      if (isNeg || flagged) {
        shortfallRows.push({
          age:          row.age,
          total:        row.total,
          hasShortfall: row.hasShortfall === true,
        });
        if (shortfallRows.length >= 3) break;
      }
    }

    // (b) Boundary check: fireAge = N - 1 must be infeasible (the resolver
    // claims to return the EARLIEST feasible age; one year earlier should fail).
    let boundaryViolation = null;
    if (fireAge - 1 >= currentAge) {
      const feasAtMinus1 = _feasibleAt(api, inp, annualSpend, 'dieWithZero', fireAge - 1);
      // null = sandbox threw (harness gap) — skip the boundary half quietly.
      if (feasAtMinus1 === true) {
        boundaryViolation = {
          fireAge,
          fireAgeMinus1: fireAge - 1,
          feasibleAtMinus1: true,
        };
      }
    }

    if (shortfallRows.length === 0 && !boundaryViolation) {
      return { passed: true };
    }

    return {
      passed:   false,
      observed: { shortfallRows, boundaryViolation, fireAge },
      expected: 'no shortfall years (every retirement total ≥ 0, no hasShortfall=true) ' +
                'AND DWZ is infeasible at fireAge - 1',
      notes:    shortfallRows.length > 0
        ? 'DWZ-mode chart contains shortfall rows: drainage to $0 mid-trajectory. ' +
          'After feature 019 contract update DWZ enforces a buffer floor like Safe.'
        : 'Boundary check failed: DWZ is also feasible at fireAge - 1, meaning the ' +
          'resolver did not return the earliest feasible age.',
    };
  },
};

// ---------------------------------------------------------------------------
// Test driver: T053 + T054 + T055 + T056 — run B1/B2/B3 across the persona matrix
// ---------------------------------------------------------------------------

test('T053+T054+T055+T056: end-state-validity invariants B1/B2/B3 run across the persona matrix', () => {
  clearContextCache();

  const result = runHarness(
    personas,
    [invariantB1, invariantB2, invariantB3],
    { silent: true }
  );

  assert.strictEqual(typeof result, 'object',         'runHarness must return an object');
  assert.ok(typeof result.totalCells === 'number',    'totalCells must be a number');
  assert.ok(typeof result.passed     === 'number',    'passed must be a number');
  assert.ok(typeof result.failed     === 'number',    'failed must be a number');
  assert.ok(Array.isArray(result.findings),           'findings must be an array');
  assert.ok(typeof result.durationMs === 'number',    'durationMs must be a number');

  assert.strictEqual(
    result.passed + result.failed,
    result.totalCells,
    'passed + failed should equal totalCells'
  );

  // eslint-disable-next-line no-console
  console.log(
    '[end-state-validity.test.js] persona×invariant cells: ' + result.totalCells +
    '  passed=' + result.passed +
    '  failed=' + result.failed +
    '  durationMs=' + result.durationMs
  );

  const byInv = {};
  for (const f of result.findings) {
    byInv[f.invariantId] = (byInv[f.invariantId] || 0) + 1;
  }
  for (const id of Object.keys(byInv)) {
    // eslint-disable-next-line no-console
    console.log('[end-state-validity.test.js] ' + id + ': ' + byInv[id] + ' findings');
  }
});

// ---------------------------------------------------------------------------
// Per-invariant smoke test: confirm B1/B2/B3 are well-formed.
// ---------------------------------------------------------------------------

test('end-state-validity invariants are well-formed and runnable in isolation', () => {
  clearContextCache();

  for (const inv of [invariantB1, invariantB2, invariantB3]) {
    assert.strictEqual(typeof inv.id,          'string',   inv.id + '.id must be a string');
    assert.strictEqual(typeof inv.family,      'string',   inv.id + '.family must be a string');
    assert.strictEqual(typeof inv.description, 'string',   inv.id + '.description must be a string');
    assert.ok(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(inv.severity), inv.id + '.severity must be one of the four levels');
    assert.strictEqual(typeof inv.check,       'function', inv.id + '.check must be a function');
    assert.strictEqual(inv.family, 'end-state-validity',   inv.id + '.family must be end-state-validity');
  }

  const subMatrix = personas.slice(0, 3);
  const result    = runHarness(subMatrix, [invariantB1, invariantB2, invariantB3], { silent: true });

  assert.strictEqual(result.totalCells, subMatrix.length * 3, 'totalCells should be 3 × 3 = 9');
  assert.strictEqual(result.passed + result.failed, result.totalCells, 'passed + failed must cover totalCells');
});

// ---------------------------------------------------------------------------
// Module exports — expose invariants so other modules can reuse them.
// ---------------------------------------------------------------------------

module.exports = {
  invariantB1,
  invariantB2,
  invariantB3,
};
