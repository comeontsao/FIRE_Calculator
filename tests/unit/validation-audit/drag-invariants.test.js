'use strict';
// =============================================================================
// tests/unit/validation-audit/drag-invariants.test.js
//
// Feature 020 — Phase 8 (User Story 5) — Drag Invariants
// Spec: specs/020-validation-audit/tasks.md T061-T064
// Contract: specs/020-validation-audit/contracts/validation-audit-harness.contract.md
//
// Three invariants exercised across the persona × invariant matrix:
//   E1 (MEDIUM) — Monotonic feasibility for Safe + Exact: if feasible at age N,
//                 must remain feasible at age N+1 across the sweep
//                 [currentAge+5, currentAge+30].
//   E2 (MEDIUM) — DWZ boundary semantics: if DWZ is feasible at age N,
//                 (a) at N-1 DWZ should be infeasible (boundary),
//                 (b) at N+1 DWZ should still be feasible (DWZ is a strict
//                     lower bound — extending the horizon adds slack to the
//                     end balance) and the run stays non-negative.
//   E3 (LOW)    — Strategy ranker stability: perturb annualSpend by ±$1 and
//                 currentAge by ±0.01 yr; assert winner strategyId is unchanged.
//
// CommonJS (Constitution Principle V).
//
// All three invariants reuse the harness's signedLifecycleEndBalance,
// findFireAgeNumerical, and scoreAndRank — no auxiliary sandbox needed.
// =============================================================================

const { test } = require('node:test');
const assert   = require('node:assert');
const path     = require('path');

const HARNESS_PATH  = path.join(__dirname, 'harness.js');
const PERSONAS_PATH = path.join(__dirname, 'personas.js');

const { runHarness, clearContextCache } = require(HARNESS_PATH);
const { personas } = require(PERSONAS_PATH);

// ---------------------------------------------------------------------------
// Helper: derive currentAge from persona.inp matching HTML conventions.
// ---------------------------------------------------------------------------
function _currentAge(inp) {
  if (typeof inp.agePerson1 === 'number') return inp.agePerson1;
  if (typeof inp.ageRoger   === 'number') return inp.ageRoger;
  return 42;
}

// Helper: probe feasibility at a candidate fireAge using the harness API.
// Returns true if the signed sim AND isFireAgeFeasible both report feasible.
// Returns false on any error (degenerate / out-of-bound ages).
function _isFeasibleAt(ctx, persona, fireAge, mode) {
  const api = ctx._api;
  if (!api || !api.signedLifecycleEndBalance || !api.isFireAgeFeasible) return false;
  const annualSpend = persona.inp.annualSpend || 72700;
  let sim;
  try {
    sim = api.signedLifecycleEndBalance(persona.inp, annualSpend, fireAge);
  } catch (_e) {
    return false;
  }
  if (!sim) return false;
  try {
    return api.isFireAgeFeasible(sim, persona.inp, annualSpend, mode, fireAge) === true;
  } catch (_e) {
    return false;
  }
}

// Helper: probe end balance at a fireAge for DWZ checks (signed sim's endBalance).
function _endBalanceAt(ctx, persona, fireAge) {
  const api = ctx._api;
  if (!api || !api.signedLifecycleEndBalance) return null;
  const annualSpend = persona.inp.annualSpend || 72700;
  try {
    const sim = api.signedLifecycleEndBalance(persona.inp, annualSpend, fireAge);
    return sim && typeof sim.endBalance === 'number' ? sim.endBalance : null;
  } catch (_e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// E1: Monotonic feasibility for Safe + Exact across the fireAge sweep.
//
// Sweep ages [currentAge+5, currentAge+30]. For each mode in [safe, exact],
// once feasibility flips from false → true at age N, it MUST remain true at
// every age N+1, N+2, ... up to the upper sweep bound.
//
// A regression where feasibility goes true → false at a later age (e.g., due
// to a numerical artifact in the gate evaluator) is the failure mode this
// invariant catches.
// ---------------------------------------------------------------------------

const E1 = {
  id:          'E1',
  family:      'drag-invariants',
  description: 'Monotonic feasibility for Safe + Exact across fireAge sweep',
  severity:    'MEDIUM',
  check(persona, ctx) {
    const currentAge = _currentAge(persona.inp);
    const lo = currentAge + 5;
    const hi = currentAge + 30;
    if (hi <= lo) return { passed: true, notes: 'E1-skip: degenerate sweep range' };

    for (const mode of ['safe', 'exact']) {
      let firstFeasibleAge = null;
      const flips = []; // record true→false transitions

      for (let age = lo; age <= hi; age++) {
        const feasible = _isFeasibleAt(ctx, persona, age, mode);
        if (feasible && firstFeasibleAge === null) firstFeasibleAge = age;
        if (firstFeasibleAge !== null && !feasible) {
          flips.push(age);
        }
      }

      if (flips.length > 0) {
        return {
          passed:   false,
          observed: { mode, firstFeasibleAge, regressionAges: flips.slice(0, 5) },
          expected: 'feasibility once-true stays true for all subsequent ages',
          notes:    'E1: ' + mode + ' mode regressed from feasible→infeasible at age(s) ' + flips.join(',')
                  + ' after first-feasible age ' + firstFeasibleAge + '.',
        };
      }
    }
    return { passed: true };
  },
};

// ---------------------------------------------------------------------------
// E2: DWZ boundary semantics.
//
// (a) If DWZ is feasible at age N (per the harness fireAgeByMode.dieWithZero
//     result), then at age N-1 DWZ should be infeasible — N is the boundary.
// (b) At age N+1 DWZ should remain feasible AND endBalance should be ≥ 0
//     (DWZ allows residual surplus; adding a year of pre-FIRE accumulation
//     does not turn a feasible plan infeasible).
//
// If the harness's dieWithZero search yielded `feasible: false`, this
// invariant is skipped.
// ---------------------------------------------------------------------------

const E2 = {
  id:          'E2',
  family:      'drag-invariants',
  description: 'DWZ boundary: feasible at N implies infeasible at N-1 and feasible+non-negative at N+1',
  severity:    'MEDIUM',
  check(persona, ctx) {
    const dwz = ctx.fireAgeByMode && ctx.fireAgeByMode.dieWithZero;
    if (!dwz || !dwz.feasible || typeof dwz.years !== 'number') {
      return { passed: true, notes: 'E2-skip: DWZ infeasible across the matrix' };
    }
    const currentAge = _currentAge(persona.inp);
    const N = currentAge + dwz.years;
    if (!Number.isFinite(N) || N <= currentAge + 1) {
      return { passed: true, notes: 'E2-skip: DWZ N too close to currentAge' };
    }

    // (a) N-1 should be infeasible under DWZ.
    // Note: numerical search may settle at a coarser-grained age; allow a
    // 1-year tolerance so we only flag when N-1 is firmly inside the
    // feasibility region (which would indicate the search truly missed
    // the boundary by more than a year).
    const feasibleAtNm1 = _isFeasibleAt(ctx, persona, N - 1, 'dieWithZero');
    if (feasibleAtNm1) {
      return {
        passed:   false,
        observed: { boundaryAge: N, dwzFeasibleAtNm1: true },
        expected: 'DWZ infeasible at N-1 (boundary semantics)',
        notes:    'E2(a): DWZ reported feasible at age ' + (N - 1)
                + ' but the harness search returned ' + N + ' as boundary — search may have missed by >1 yr.',
      };
    }

    // (b) N+1 should remain feasible AND endBalance ≥ 0.
    const feasibleAtNp1 = _isFeasibleAt(ctx, persona, N + 1, 'dieWithZero');
    if (!feasibleAtNp1) {
      return {
        passed:   false,
        observed: { boundaryAge: N, dwzFeasibleAtNp1: false },
        expected: 'DWZ feasible at N+1 (extending horizon adds slack)',
        notes:    'E2(b): DWZ infeasible at age ' + (N + 1) + ' despite being feasible at age ' + N + '.',
      };
    }
    const endBalanceNp1 = _endBalanceAt(ctx, persona, N + 1);
    if (endBalanceNp1 != null && endBalanceNp1 < 0) {
      return {
        passed:   false,
        observed: { boundaryAge: N, endBalanceAtNp1: Math.round(endBalanceNp1) },
        expected: 'endBalance ≥ 0 at N+1 under DWZ',
        notes:    'E2(b): negative end-balance at age ' + (N + 1) + ' signals DWZ bleed-through.',
      };
    }
    return { passed: true };
  },
};

// ---------------------------------------------------------------------------
// E3: Strategy ranker stability under tiny perturbations.
//
// Perturb annualSpend by ±$1 and currentAge by ±0.01 yr; assert the winner
// strategyId stays unchanged across all four perturbations.
//
// Cells skipped:
//   - Personas where ctx.strategyRanking is null (ranker not available in
//     sandbox — RR / Generic both expose it but extraction may fail for some
//     personas).
// ---------------------------------------------------------------------------

const E3 = {
  id:          'E3',
  family:      'drag-invariants',
  description: 'Strategy ranker winner stable under ±$1 spend and ±0.01yr age perturbations',
  severity:    'LOW',
  check(persona, ctx) {
    const api = ctx._api;
    if (!api || !api.scoreAndRank) {
      return { passed: true, notes: 'E3-skip: scoreAndRank unavailable in sandbox' };
    }
    if (!ctx.strategyRanking) {
      return { passed: true, notes: 'E3-skip: ranker returned null in baseline' };
    }
    const baselineWinner = ctx.strategyRanking.winnerId
      || (Array.isArray(ctx.strategyRanking.rows) && ctx.strategyRanking.rows.find(r => r.isWinner)?.strategyId)
      || null;
    if (!baselineWinner) {
      return { passed: true, notes: 'E3-skip: baseline ranker has no winnerId' };
    }

    const currentAge = _currentAge(persona.inp);
    const fireAge    = ctx._defaultFireAge || (currentAge + 13);

    // Build four perturbations.
    function perturb(deltaSpend, deltaAge) {
      const inp2 = Object.assign({}, persona.inp);
      inp2.annualSpend = (inp2.annualSpend || 72700) + deltaSpend;
      // Apply tiny age perturbation. We perturb whichever age field was used.
      if (typeof inp2.agePerson1 === 'number') inp2.agePerson1 = inp2.agePerson1 + deltaAge;
      if (typeof inp2.ageRoger   === 'number') inp2.ageRoger   = inp2.ageRoger   + deltaAge;
      return inp2;
    }
    const cases = [
      { label: '+$1 spend', inp: perturb(+1, 0)     },
      { label: '-$1 spend', inp: perturb(-1, 0)     },
      { label: '+0.01yr age', inp: perturb(0, +0.01) },
      { label: '-0.01yr age', inp: perturb(0, -0.01) },
    ];

    const flips = [];
    for (const c of cases) {
      let r;
      try {
        // Feature 021 US4 (B-020-4): pass baselineWinner as previousWinnerId
        // so the ranker's hysteresis gate can block sub-threshold flips
        // (±0.01yr / ±$1 perturbations whose primary-metric delta lies
        // within HYSTERESIS_YEARS = 0.05 years' equivalent score margin).
        r = api.scoreAndRank(c.inp, fireAge, 'safe', 'leave-more-behind', baselineWinner);
      } catch (_e) {
        continue; // skip this perturbation if ranker throws
      }
      if (!r) continue;
      const winnerHere = r.winnerId
        || (Array.isArray(r.rows) && r.rows.find(row => row.isWinner)?.strategyId)
        || null;
      if (winnerHere && winnerHere !== baselineWinner) {
        flips.push({ perturbation: c.label, winner: winnerHere });
      }
    }

    if (flips.length > 0) {
      return {
        passed:   false,
        observed: { baselineWinner, flips },
        expected: 'winner stable across ±$1 spend and ±0.01yr perturbations',
        notes:    'E3: ranker winner changed under tiny perturbation — numerical instability.',
      };
    }
    return { passed: true };
  },
};

// ---------------------------------------------------------------------------
// node:test entry — run the harness with E1, E2, E3 across all personas.
// ---------------------------------------------------------------------------

test('Phase 8 — Drag invariants (E1, E2, E3) across persona matrix', { timeout: 600000 }, () => {
  clearContextCache();

  const result = runHarness(personas, [E1, E2, E3], { silent: false });

  console.log('[Phase 8] cells: ' + result.totalCells
            + ' passed: ' + result.passed
            + ' failed: ' + result.failed
            + ' personas: ' + personas.length);
  if (result.findings.length > 0) {
    const byInv = result.findings.reduce((acc, f) => {
      acc[f.invariantId] = (acc[f.invariantId] || 0) + 1;
      return acc;
    }, {});
    console.log('[Phase 8] findings by invariant: ' + JSON.stringify(byInv));
    for (const inv of ['E1', 'E2', 'E3']) {
      const sample = result.findings.filter(f => f.invariantId === inv).slice(0, 3);
      for (const f of sample) {
        console.log('  ' + f.invariantId + ' / ' + f.personaId + ': ' + JSON.stringify(f.observed));
      }
    }
  }

  assert.ok(result, 'runHarness must return a result object');
  assert.strictEqual(typeof result.totalCells, 'number');
  assert.strictEqual(typeof result.passed,     'number');
  assert.strictEqual(typeof result.failed,     'number');
  assert.ok(Array.isArray(result.findings),   'findings must be an array');
  assert.strictEqual(result.passed + result.failed, result.totalCells,
    'passed + failed must equal totalCells');

  // Honor env-var filters so PERSONA / INVARIANT / FAMILY scoping still works.
  const expectedPersonaCount = process.env.PERSONA
    ? personas.filter(p => p.id === process.env.PERSONA).length
    : personas.length;
  const expectedInvariantCount = (process.env.INVARIANT || process.env.FAMILY)
    ? [E1, E2, E3].filter(i => {
        if (process.env.INVARIANT && i.id     !== process.env.INVARIANT) return false;
        if (process.env.FAMILY    && i.family !== process.env.FAMILY)   return false;
        return true;
      }).length
    : 3;
  assert.strictEqual(
    result.totalCells,
    expectedPersonaCount * expectedInvariantCount,
    'totalCells must equal active personas × active invariants'
  );
});
