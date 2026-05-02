'use strict';
// =============================================================================
// tests/unit/validation-audit/accumulation-spend-consistency.test.js
//
// Feature 023 — Accumulation-vs-Retirement Spend Separation
// Spec:     specs/023-accumulation-spend-separation/spec.md US5 (FR-014)
// Contract: specs/023-accumulation-spend-separation/contracts/accumulationSpendConsistency-invariant.md
//
// Invariants:
//   AS-1 (HIGH)   — Per persona × mode, every row produced by accumulateToFire
//                   when invoked with `_accumOpts` synthesized via
//                   `resolveAccumulationOptions` reads the same `annualSpending`
//                   value. This is the post-fix invariant — pre-feature-023
//                   the value would have been $0 or some other fallback.
//   AS-2 (MEDIUM) — Every row's `spendSource` field equals
//                   `'options.accumulationSpend'` (NOT a fallback tier).
//                   Catches harness misconfig where the new options field
//                   wasn't plumbed through.
//
// Cell count: 92 personas × 2 invariants = 184 cells (single-mode is sufficient
// because accumulateToFire's behavior is mode-independent — mode affects only
// retirement-phase logic which this test does not exercise).
//
// CommonJS (Constitution Principle V — file:// compatible).
// =============================================================================

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { personas } = require(path.join(__dirname, 'personas.js'));
const { accumulateToFire } = require(path.join(__dirname, '..', '..', '..', 'calc', 'accumulateToFire.js'));

// Mirror of harness's resolveAccumulationOptions stub (post-T032 update).
// Kept inline so the invariant file is self-contained and tests the
// harness contract independently.
function _harnessResolveAccumulationOptions(inp) {
  let _accumSpend;
  if (typeof inp.accumulationSpend === 'number' && inp.accumulationSpend >= 0) {
    _accumSpend = inp.accumulationSpend;
  } else if (typeof inp.monthlySpend === 'number' && inp.monthlySpend > 0) {
    _accumSpend = inp.monthlySpend * 12;
  } else {
    _accumSpend = 120000;
  }
  return {
    mortgageStrategyOverride: 'invest-keep-paying',
    mortgageEnabled:          false,
    mortgageInputs:           null,
    secondHomeEnabled:        false,
    secondHomeInputs:         null,
    rentMonthly:              2690,
    pviExtraMonthly:          0,
    selectedScenario:         inp.selectedScenario || 'us',
    collegeFn:                null,
    payoffVsInvestFn:         null,
    framing:                  'liquidNetWorth',
    mfjStatus:                (inp.adultCount === 2) ? 'mfj' : 'single',
    accumulationSpend:        _accumSpend,
  };
}

function _currentAgeOf(persona) {
  const inp = persona.inp || {};
  if (typeof inp.agePerson1 === 'number') return inp.agePerson1;
  if (typeof inp.ageRoger === 'number') return inp.ageRoger;
  return 42;
}

// ---------------------------------------------------------------------------
// AS-1 — All accumulation rows agree on annualSpending
// ---------------------------------------------------------------------------

test('AS-1 (HIGH): per-persona accumulation rows have consistent annualSpending', () => {
  const failures = [];
  for (const persona of personas) {
    const inp = persona.inp || {};
    const currentAge = _currentAgeOf(persona);
    const fireAge = currentAge + 10;

    let result;
    try {
      result = accumulateToFire(inp, fireAge, _harnessResolveAccumulationOptions(inp));
    } catch (err) {
      failures.push(`[AS-1] ${persona.id}: accumulateToFire threw — ${err.message}`);
      continue;
    }

    if (!result || !Array.isArray(result.perYearRows) || result.perYearRows.length === 0) {
      failures.push(`[AS-1] ${persona.id}: no perYearRows returned`);
      continue;
    }

    // All rows for a single-persona, single-options-bag invocation must agree
    // on annualSpending (FR-011: spending is constant in real-$ across years).
    const expected = result.perYearRows[0].annualSpending;
    for (const row of result.perYearRows) {
      if (Math.abs(row.annualSpending - expected) > 0.01) {
        failures.push(`[AS-1] ${persona.id}/age${row.age}: annualSpending=${row.annualSpending} ` +
                      `disagrees with row[0]=${expected}`);
        break;
      }
    }
  }

  assert.deepEqual(failures, [],
    `[AS-1] ${failures.length}/${personas.length} personas failed:\n${failures.join('\n')}`);
});

// ---------------------------------------------------------------------------
// AS-2 — Every row's spendSource is 'options.accumulationSpend' (preferred path)
// ---------------------------------------------------------------------------

test('AS-2 (MEDIUM): every accumulation row uses the preferred spendSource path', () => {
  const failures = [];
  for (const persona of personas) {
    const inp = persona.inp || {};
    const currentAge = _currentAgeOf(persona);
    const fireAge = currentAge + 10;

    let result;
    try {
      result = accumulateToFire(inp, fireAge, _harnessResolveAccumulationOptions(inp));
    } catch (_err) {
      // AS-1 already records this; skip silently here.
      continue;
    }

    if (!result || !Array.isArray(result.perYearRows)) continue;

    for (const row of result.perYearRows) {
      if (row.spendSource !== 'options.accumulationSpend') {
        failures.push(`[AS-2] ${persona.id}/age${row.age}: spendSource=${row.spendSource} ` +
                      `(expected 'options.accumulationSpend')`);
        break;  // one report per persona
      }
    }
  }

  assert.deepEqual(failures, [],
    `[AS-2] ${failures.length}/${personas.length} personas failed:\n${failures.join('\n')}`);
});

// ---------------------------------------------------------------------------
// AS-3 (additional): explicit options.accumulationSpend = 0 is honored, NOT
//                    treated as MISSING (validates the >= 0 guard distinguishes
//                    "user explicitly set zero" from "field absent").
// ---------------------------------------------------------------------------

test('AS-3 (LOW): explicit options.accumulationSpend = 0 produces spendSource=options.accumulationSpend', () => {
  const failures = [];
  for (const persona of personas.slice(0, 5)) {  // small subset is sufficient
    const inp = persona.inp || {};
    const currentAge = _currentAgeOf(persona);
    const fireAge = currentAge + 5;

    const opts = _harnessResolveAccumulationOptions(inp);
    opts.accumulationSpend = 0;  // explicit zero, not absent

    let result;
    try {
      result = accumulateToFire(inp, fireAge, opts);
    } catch (_err) { continue; }

    if (!result || !Array.isArray(result.perYearRows)) continue;

    for (const row of result.perYearRows) {
      if (row.spendSource !== 'options.accumulationSpend') {
        failures.push(`[AS-3] ${persona.id}/age${row.age}: explicit zero coerced to spendSource=${row.spendSource}`);
        break;
      }
      if (row.annualSpending !== 0) {
        failures.push(`[AS-3] ${persona.id}/age${row.age}: explicit zero produced annualSpending=${row.annualSpending}`);
        break;
      }
    }
  }

  assert.deepEqual(failures, [],
    `[AS-3] ${failures.length} sample personas failed:\n${failures.join('\n')}`);
});
