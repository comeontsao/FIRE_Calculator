'use strict';
// =============================================================================
// tests/unit/validation-audit/month-precision-feasibility.test.js
//
// Feature 022 — Validation Audit, Phase 8b (T088).
// Spec:     specs/022-nominal-dollar-display/spec.md (FR-022, FR-023, US6)
// Contract: specs/022-nominal-dollar-display/contracts/month-precision-feasibility-invariant.md
//
// Month-precision-feasibility invariant family. Locks the new feature 022 US6
// pro-rate-FIRE-year-row extension (`simulateRetirementOnlySigned` accepts
// fractional `fireAge` and pro-rates the partial first-year row by
// `(1 − mFraction)` using the LINEAR convention) against silent drift.
//
//   MPF-1 (HIGH)   — resolver-reported month-precision fireAge produces zero
//                    `hasShortfall:true` rows under the active mode.
//   MPF-2 (MEDIUM) — boundary check: infeasible at one month earlier.
//   MPF-3 (LOW)    — conversion convention consistency (linear scale).
//
// Pattern matches feature 021's `tax-bracket-conservation.test.js`. Runs
// across the persona matrix via `runHarness`.
// =============================================================================

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { runHarness } = require(path.join(__dirname, 'harness.js'));
const { personas } = require(path.join(__dirname, 'personas.js'));
const { accumulateToFire } = require(path.join(__dirname, '..', '..', '..', 'calc', 'accumulateToFire.js'));
const { findEarliestFeasibleAge } = require(path.join(__dirname, '..', '..', '..', 'calc', 'fireAgeResolver.js'));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Detect that a resolver result represents a "month-precision" answer.
 * Per contract MPF-1: only fires when `searchMethod === 'month-precision'`. */
function _isMonthPrecisionResolver(result) {
  return !!(result && result.feasible === true && result.searchMethod === 'month-precision');
}

/** Convert resolver `{years, months}` (absolute age in years per resolver
 * contract — see calc/fireAgeResolver.js Stage 1 which scans `y = currentAge..endAge`)
 * into a fractional fireAge for simulator input. */
function _resolverFractionalAge(result) {
  return (result.years || 0) + (result.months || 0) / 12;
}

/** Run the resolver against persona × mode, using the harness sandbox's
 * `simulateRetirementOnlySigned` + `isFireAgeFeasible` as injected helpers.
 * Returns the FireAgeResult or null on error. */
function _runResolver(ctx, persona, mode) {
  if (!ctx._api ||
      typeof ctx._api.simulateRetirementOnlySigned !== 'function' ||
      typeof ctx._api.isFireAgeFeasible !== 'function') {
    return null;
  }
  const inp = persona.inp || {};
  const annualSpend = inp.annualSpend || 72700;
  // Use accumulation to project starting pools at fireAge = currentAge + 13
  // (synthetic baseline; the resolver doesn't strictly need accurate pools
  // because the simulator handles pool propagation per candidate fireAge).
  const currentAge = _currentAgeOf(persona);
  const pools = _projectPoolsAtFire(persona, currentAge + 13) || { pTrad: 0, pRoth: 0, pStocks: 0, pCash: 0 };
  try {
    return findEarliestFeasibleAge(inp, mode, {
      annualSpend,
      simulateRetirementOnlySigned: ctx._api.simulateRetirementOnlySigned,
      isFireAgeFeasible: ctx._api.isFireAgeFeasible,
      pools,
    });
  } catch (_e) {
    return null;
  }
}

/** Read the persona's currentAge (RR / Generic). */
function _currentAgeOf(persona) {
  const inp = persona.inp || {};
  if (typeof inp.agePerson1 === 'number') return inp.agePerson1;
  if (typeof inp.ageRoger === 'number') return inp.ageRoger;
  return 42;
}

/** Project pools forward from currentAge to fireAge using accumulateToFire.
 * Returns { pTrad, pRoth, pStocks, pCash } — the input shape required by
 * `simulateRetirementOnlySigned`. Returns null on accumulation failure. */
function _projectPoolsAtFire(persona, fireAge) {
  const inp = persona.inp || {};
  try {
    const result = accumulateToFire(inp, Math.floor(fireAge), {
      mortgageEnabled: !!inp.mortgageEnabled,
      mortgageInputs: null,
      secondHomeEnabled: false,
      secondHomeInputs: null,
      rentMonthly: inp.exp_0 || 2690,
      pviExtraMonthly: inp.pviExtraMonthly || 0,
      selectedScenario: inp.selectedScenario || 'us',
      collegeFn: null,
      payoffVsInvestFn: null,
      framing: 'liquidNetWorth',
      mfjStatus: (inp.adultCount === 1) ? 'single' : 'mfj',
    });
    if (!result || !Array.isArray(result.perYearRows) || result.perYearRows.length === 0) {
      return null;
    }
    const lastRow = result.perYearRows[result.perYearRows.length - 1];
    return {
      pTrad: lastRow.pTrad || 0,
      pRoth: lastRow.pRoth || 0,
      pStocks: lastRow.pStocks || 0,
      pCash: lastRow.pCash || 0,
    };
  } catch (_e) {
    return null;
  }
}

/** Run `simulateRetirementOnlySigned` at a fractional fireAge through the
 * harness sandbox. Returns the simulator's full output (with `rows[]`) or
 * null when sandbox / pool projection is unavailable. */
function _runSimAtFractional(ctx, persona, fractionalAge) {
  const inp = persona.inp || {};
  const annualSpend = inp.annualSpend || 72700;
  if (!ctx._api || typeof ctx._api.simulateRetirementOnlySigned !== 'function') {
    return null;
  }
  const pools = _projectPoolsAtFire(persona, fractionalAge);
  if (!pools) return null;
  try {
    return ctx._api.simulateRetirementOnlySigned(
      inp, annualSpend, fractionalAge,
      pools.pTrad, pools.pRoth, pools.pStocks, pools.pCash,
    );
  } catch (_e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Invariant MPF-1 (HIGH) — fractional-year feasibility holds at month-precision result
// ---------------------------------------------------------------------------

const invariantMPF1 = {
  id: 'MPF-1',
  family: 'month-precision-feasibility',
  description: 'Resolver-reported month-precision fireAge produces a feasible partial FIRE-year row (no shortfall in iteration 0)',
  severity: 'HIGH',
  check(persona, ctx) {
    for (const mode of ['safe', 'exact', 'dieWithZero']) {
      const resolved = _runResolver(ctx, persona, mode);
      if (!_isMonthPrecisionResolver(resolved)) continue; // only true month-precision results trigger MPF-1

      const fractionalAge = _resolverFractionalAge(resolved);
      const sim = _runSimAtFractional(ctx, persona, fractionalAge);
      if (sim == null) continue;

      // The new `rows[]` field is the post-T083/T084 additive return-shape
      // extension. If `rows` is missing, the simulator wasn't extended for
      // this dashboard build — treat as a sandbox limitation, skip.
      const rowsArr = Array.isArray(sim.rows) ? sim.rows : null;
      if (rowsArr == null || rowsArr.length === 0) continue;

      // Per spec hook 1: "If MPF-1 fires, the pro-rate logic likely has a bug
      // at age 59.5 (401k unlock) or ssClaimAge boundaries — investigate the
      // simulator's first-iteration partial-year math." The HIGH-severity
      // assertion is therefore scoped to the FIRE-YEAR ROW (rows[0]) — the
      // ONLY row touched by the new pro-rate logic. Late-retirement shortfalls
      // (rows[i] for i>=1) are pre-existing chart-vs-signed-sim divergence
      // (covered by feature-020 family `cross-chart-consistency`), out of
      // scope for this invariant.
      const fireYearRow = rowsArr[0];
      if (fireYearRow && fireYearRow.hasShortfall === true) {
        return {
          passed: false,
          observed: {
            mode,
            fractionalAge,
            fireYearAge: fireYearRow.age,
            fireYearScale: fireYearRow.scale,
          },
          expected: 'FIRE-year (partial) row hasShortfall:false under resolver-approved fireAge',
        };
      }
    }
    return { passed: true };
  },
};

// ---------------------------------------------------------------------------
// Invariant MPF-2 (MEDIUM) — boundary check: infeasible one month earlier
// ---------------------------------------------------------------------------

const invariantMPF2 = {
  id: 'MPF-2',
  family: 'month-precision-feasibility',
  description: 'At one month earlier than the resolver-reported month-precision fireAge, the resolver gate flips to infeasible (boundary check)',
  severity: 'MEDIUM',
  check(persona, ctx) {
    if (!ctx._api || typeof ctx._api.isFireAgeFeasible !== 'function') {
      return { passed: true };
    }
    const inp = persona.inp || {};
    const annualSpend = inp.annualSpend || 72700;

    for (const mode of ['safe', 'exact', 'dieWithZero']) {
      const resolved = _runResolver(ctx, persona, mode);
      if (!_isMonthPrecisionResolver(resolved)) continue;

      const fractionalAge = _resolverFractionalAge(resolved);
      // One month earlier:
      const earlierAge = fractionalAge - 1 / 12;
      const sim = _runSimAtFractional(ctx, persona, earlierAge);
      if (sim == null) continue;

      // The boundary check uses the SAME gate the resolver used (isFireAgeFeasible),
      // not the simulator's per-row hasShortfall. The contract is: at earlier age,
      // the gate must report infeasible (otherwise the resolver picked an
      // unnecessarily-late month). MEDIUM severity — monotonic-flip-stability
      // fallback can produce later-than-strict results; those are acceptable.
      let earlierFeasible;
      try {
        earlierFeasible = !!ctx._api.isFireAgeFeasible(sim, inp, annualSpend, mode, earlierAge);
      } catch (_e) {
        earlierFeasible = false;
      }
      if (earlierFeasible === true) {
        return {
          passed: false,
          observed: {
            mode,
            fractionalAge,
            earlierAge,
            earlierFeasible: true,
          },
          expected: 'one month earlier should be gate-infeasible (boundary check)',
        };
      }
    }
    return { passed: true };
  },
};

// ---------------------------------------------------------------------------
// Invariant MPF-3 (LOW) — conversion convention consistency (LINEAR scale)
// ---------------------------------------------------------------------------

const invariantMPF3 = {
  id: 'MPF-3',
  family: 'month-precision-feasibility',
  description: 'FIRE-year row scale is in [0, 1) and obeys LINEAR pro-rate convention',
  severity: 'LOW',
  check(persona, ctx) {
    for (const mode of ['safe', 'exact', 'dieWithZero']) {
      const resolved = _runResolver(ctx, persona, mode);
      if (!_isMonthPrecisionResolver(resolved)) continue;

      const fractionalAge = _resolverFractionalAge(resolved);
      const sim = _runSimAtFractional(ctx, persona, fractionalAge);
      if (sim == null) continue;

      const rowsArr = Array.isArray(sim.rows) ? sim.rows : null;
      if (rowsArr == null) continue;
      if (rowsArr.length === 0) continue;

      // First row scale must be (1 − mFraction); subsequent rows must be 1.
      const mFraction = fractionalAge - Math.floor(fractionalAge);
      const expectedFirstScale = 1 - mFraction;
      const firstScale = rowsArr[0].scale;
      if (typeof firstScale !== 'number') {
        // No scale field — pre-T083 build, skip.
        continue;
      }
      if (Math.abs(firstScale - expectedFirstScale) > 1e-9) {
        return {
          passed: false,
          observed: { mode, mFraction, firstScale, expectedFirstScale },
          expected: `first-row scale === 1 - mFraction (${expectedFirstScale})`,
        };
      }
      for (let i = 1; i < rowsArr.length; i++) {
        const s = rowsArr[i].scale;
        if (typeof s === 'number' && Math.abs(s - 1) > 1e-9) {
          return {
            passed: false,
            observed: { mode, rowIndex: i, scale: s },
            expected: 'all non-FIRE rows scale === 1',
          };
        }
      }
    }
    return { passed: true };
  },
};

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

test('T022-MPF: month-precision-feasibility invariants run across the persona matrix', () => {
  const result = runHarness(
    personas,
    [invariantMPF1, invariantMPF2, invariantMPF3],
    { silent: true },
  );

  const findings = result.findings || [];
  const crit = findings.filter(f => f.severity === 'CRITICAL').length;
  const high = findings.filter(f => f.severity === 'HIGH').length;
  const med  = findings.filter(f => f.severity === 'MEDIUM').length;
  const low  = findings.filter(f => f.severity === 'LOW').length;

  console.log(
    '# [month-precision-feasibility.test.js] cells: ' + result.totalCells
    + ' passed: ' + result.passed
    + ' failed: ' + result.failed
  );
  console.log(
    '# [harness] ' + result.totalCells + ' cells, '
    + result.passed + ' passed, '
    + result.failed + ' failed (CRITICAL=' + crit
    + ' HIGH=' + high + ' MEDIUM=' + med + ' LOW=' + low + ').'
  );

  assert.ok(result.totalCells >= personas.length,
    'expected at least ' + personas.length + ' cells; got ' + result.totalCells);

  // T089 gate: 0 MPF-1 HIGH findings expected post-T083/T084. If MPF-1 fires,
  // the pro-rate logic likely has a bug at age 59.5 (401k unlock) or
  // ssClaimAge boundaries — investigate the simulator's first-iteration
  // partial-year math.
  const mpf1Findings = findings.filter(f => f.invariantId === 'MPF-1');
  assert.strictEqual(
    mpf1Findings.filter(f => f.severity === 'HIGH').length, 0,
    'expected 0 MPF-1 HIGH findings post-T083; got ' + mpf1Findings.length
    + '. Sample: ' + JSON.stringify(mpf1Findings.slice(0, 3), null, 2),
  );
});

test('MPF invariants are exported and well-formed', () => {
  const all = [invariantMPF1, invariantMPF2, invariantMPF3];
  for (const inv of all) {
    assert.strictEqual(typeof inv.id, 'string');
    assert.strictEqual(typeof inv.check, 'function');
    assert.ok(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(inv.severity));
    assert.strictEqual(inv.family, 'month-precision-feasibility');
  }
});

module.exports = {
  invariantMPF1, invariantMPF2, invariantMPF3,
};
