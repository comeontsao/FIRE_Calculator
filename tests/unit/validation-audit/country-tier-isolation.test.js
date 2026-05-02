'use strict';
// =============================================================================
// tests/unit/validation-audit/country-tier-isolation.test.js
//
// Feature 023 — Accumulation-vs-Retirement Spend Separation
// Spec:     specs/023-accumulation-spend-separation/spec.md US2 (FR-005)
// Plan:     specs/023-accumulation-spend-separation/plan.md Phase 4 T021
//
// Invariant:
//   CTI-1 (HIGH) — Switching country-tier value MUST NOT change accumulation-
//                  phase pool trajectories. accumulateToFire's output (end +
//                  perYearRows) MUST be byte-identical (within ±$0.01) when
//                  invoked with the same `accumulationSpend` but different
//                  conceptual "post-FIRE annualSpend" values.
//
//                  This test exercises the calc-engine guarantee that
//                  accumulateToFire does NOT read country-tier `annualSpend`
//                  — its only spending-related input is options.accumulationSpend.
//                  Because of this, country-tier swap CAN'T contaminate
//                  accumulation by construction. The invariant locks this
//                  contract against future drift (e.g., if a refactor were
//                  to add an annualSpend reading inside accumulateToFire's loop).
//
// Cell count: 92 personas × 1 invariant = 92 cells.
//
// CommonJS (Constitution Principle V — file:// compatible).
// =============================================================================

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { personas } = require(path.join(__dirname, 'personas.js'));
const { accumulateToFire } = require(path.join(__dirname, '..', '..', '..', 'calc', 'accumulateToFire.js'));

function _currentAgeOf(persona) {
  const inp = persona.inp || {};
  if (typeof inp.agePerson1 === 'number') return inp.agePerson1;
  if (typeof inp.ageRoger === 'number') return inp.ageRoger;
  return 42;
}

// Minimal options bag with a fixed accumulationSpend ($120k, US baseline).
// The test invokes accumulateToFire twice per persona, varying ONLY the
// fields that would correspond to country-tier identity (e.g., selectedScenario)
// and asserting the output is identical.
function _optsForScenario(selectedScenario, accumulationSpend) {
  return {
    mortgageStrategyOverride: 'invest-keep-paying',
    mortgageEnabled:          false,
    mortgageInputs:           null,
    secondHomeEnabled:        false,
    secondHomeInputs:         null,
    rentMonthly:              2690,
    pviExtraMonthly:          0,
    selectedScenario,
    collegeFn:                null,
    payoffVsInvestFn:         null,
    framing:                  'liquidNetWorth',
    mfjStatus:                'mfj',
    accumulationSpend,
  };
}

function _poolDeltaCents(a, b) {
  return Math.round((a - b) * 100);
}

// ---------------------------------------------------------------------------
// CTI-1 — country-tier swap leaves accumulation pools byte-identical
// ---------------------------------------------------------------------------

test('CTI-1 (HIGH): country-tier swap with same accumulationSpend produces identical pool trajectories', () => {
  const failures = [];
  for (const persona of personas) {
    const inp = persona.inp || {};
    const currentAge = _currentAgeOf(persona);
    const fireAge = currentAge + 10;
    const accumSpend = 120000;  // user's US baseline; country tier doesn't matter here

    // Two runs: TW vs Stay-in-US scenario IDs. accumulationSpend is held fixed.
    const optsTW = _optsForScenario('taiwan', accumSpend);
    const optsUS = _optsForScenario('us', accumSpend);

    let resultTW, resultUS;
    try {
      resultTW = accumulateToFire(inp, fireAge, optsTW);
      resultUS = accumulateToFire(inp, fireAge, optsUS);
    } catch (err) {
      failures.push(`[CTI-1] ${persona.id}: accumulateToFire threw — ${err.message}`);
      continue;
    }

    // End-state pools must match within ±$0.01 (cents-level rounding).
    const endFields = ['pTrad', 'pRoth', 'pStocks', 'pCash'];
    for (const f of endFields) {
      const dCents = _poolDeltaCents(resultTW.end[f] || 0, resultUS.end[f] || 0);
      if (Math.abs(dCents) > 1) {
        failures.push(`[CTI-1] ${persona.id}: end.${f} differs across country-tier swap ` +
                      `(TW=${resultTW.end[f]} US=${resultUS.end[f]}, Δ¢=${dCents})`);
      }
    }

    // Per-row pool trajectories must match.
    if (!resultTW.perYearRows || !resultUS.perYearRows ||
        resultTW.perYearRows.length !== resultUS.perYearRows.length) {
      failures.push(`[CTI-1] ${persona.id}: perYearRows length differs ` +
                    `(TW=${resultTW.perYearRows.length} US=${resultUS.perYearRows.length})`);
      continue;
    }
    for (let i = 0; i < resultTW.perYearRows.length; i++) {
      const rowTW = resultTW.perYearRows[i];
      const rowUS = resultUS.perYearRows[i];
      for (const f of endFields) {
        const dCents = _poolDeltaCents(rowTW[f] || 0, rowUS[f] || 0);
        if (Math.abs(dCents) > 1) {
          failures.push(`[CTI-1] ${persona.id}/age${rowTW.age}: row.${f} differs ` +
                        `(TW=${rowTW[f]} US=${rowUS[f]}, Δ¢=${dCents})`);
          break;
        }
      }
      // annualSpending must also be identical (driven by accumulationSpend, not selectedScenario).
      if (Math.abs(rowTW.annualSpending - rowUS.annualSpending) > 0.01) {
        failures.push(`[CTI-1] ${persona.id}/age${rowTW.age}: annualSpending differs ` +
                      `(TW=${rowTW.annualSpending} US=${rowUS.annualSpending}) ` +
                      `— calc engine MUST NOT read country-tier annualSpend`);
        break;
      }
    }
  }

  assert.deepEqual(failures, [],
    `[CTI-1] ${failures.length} cells failed:\n${failures.slice(0, 10).join('\n')}` +
    (failures.length > 10 ? `\n... and ${failures.length - 10} more` : ''));
});

// ---------------------------------------------------------------------------
// CTI-2 (additional smoke) — accumulationSpend swap DOES change accumulation
// ---------------------------------------------------------------------------

test('CTI-2 (LOW): accumulationSpend swap DOES change accumulation pool trajectories (negative-control)', () => {
  // Negative control: if changing accumulationSpend doesn't change pCash trajectories,
  // it means the spending baseline isn't actually being consumed — bug rebirth signal.
  const failures = [];
  let anyDifference = false;

  for (const persona of personas.slice(0, 10)) {
    const inp = Object.assign({}, persona.inp || {}, {
      annualIncome: 200000,  // sufficient income so the residual is sensitive to spend
      taxRate: 0.25,
    });
    delete inp.annualSpend;  // ensure no fallback contamination
    delete inp.monthlySpend;

    const currentAge = _currentAgeOf(persona);
    const fireAge = currentAge + 5;

    const optsLow = _optsForScenario('us', 50000);
    const optsHigh = _optsForScenario('us', 150000);

    let resultLow, resultHigh;
    try {
      resultLow = accumulateToFire(inp, fireAge, optsLow);
      resultHigh = accumulateToFire(inp, fireAge, optsHigh);
    } catch (_err) {
      continue;  // skip personas that can't run with these synthetic inputs
    }

    // Higher spending → lower (or equal) pCash. If pCash is strictly equal across
    // both runs, the calc engine isn't reading accumulationSpend at all.
    const pCashLow = resultLow.end.pCash || 0;
    const pCashHigh = resultHigh.end.pCash || 0;
    if (pCashLow !== pCashHigh) anyDifference = true;
  }

  if (!anyDifference) {
    failures.push('[CTI-2] across 10 sample personas, no pCash difference observed when ' +
                  'switching accumulationSpend $50k vs $150k. Either the calc engine isn\'t ' +
                  'reading the field (bug rebirth) or the test inputs were uniformly clamped.');
  }

  assert.deepEqual(failures, [],
    `[CTI-2] negative-control failed:\n${failures.join('\n')}`);
});
