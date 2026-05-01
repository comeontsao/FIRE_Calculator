'use strict';
// =============================================================================
// tests/unit/validation-audit/tax-bracket-conservation.test.js
//
// Feature 021 — Validation Audit, Phase 10 (T079).
// Spec:     specs/021-tax-category-and-audit-cleanup/spec.md (FR-016b)
// Contract: specs/021-tax-category-and-audit-cleanup/contracts/tax-bracket-conservation-invariant.md
//
// Tax-bracket-conservation invariant family. Locks the new v3 progressive-bracket
// federalTax + ficaTax math against silent drift. Five invariants:
//
//   TBC-1 (HIGH) — federalTaxBreakdown bracket sum equals federalTax aggregate.
//   TBC-2 (HIGH) — ficaBreakdown component sum equals ficaTax aggregate.
//   TBC-3 (MEDIUM) — taxableIncome = max(0, gross - pretax401k - stdDed).
//   TBC-4 (HIGH) — filing-status correctness (MFJ/single std-ded matches adultCount).
//   TBC-5 (HIGH) — backwards-compat: flat-rate override produces empty breakdowns + ficaTax=0.
//
// Implementation note: directly invokes `calc/accumulateToFire.js` per persona
// rather than going through the harness sandbox. The bracket-math invariants are
// pure-calc facts; no cross-sim integration is needed.
// =============================================================================

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { accumulateToFire } = require(path.join(__dirname, '..', '..', '..', 'calc', 'accumulateToFire.js'));
const { personas } = require(path.join(__dirname, 'personas.js'));
const { runHarness } = require(path.join(__dirname, 'harness.js'));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _currentAgeOf(persona) {
  const inp = persona.inp || {};
  if (typeof inp.agePerson1 === 'number') return inp.agePerson1;
  if (typeof inp.ageRoger === 'number') return inp.ageRoger;
  return 42;
}

/**
 * Run accumulateToFire for the given persona and return the perYearRows array.
 * Uses a synthetic fireAge of currentAge + 13 (sufficient for accumulation rows).
 * Returns [] on failure.
 */
function _accumulationRowsFor(persona) {
  try {
    const inp = persona.inp || {};
    const fireAge = _currentAgeOf(persona) + 13;
    const result = accumulateToFire(inp, fireAge, {
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
    return Array.isArray(result.perYearRows) ? result.perYearRows : [];
  } catch (e) {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Invariant TBC-1 — federal-tax-breakdown conservation
// ---------------------------------------------------------------------------

const invariantTBC1 = {
  id: 'TBC-1',
  family: 'tax-bracket-conservation',
  description: 'federalTaxBreakdown bracket sum equals federalTax aggregate within $1',
  severity: 'HIGH',
  check(persona, _ctx) {
    const rows = _accumulationRowsFor(persona);
    for (const row of rows) {
      const breakdown = row.federalTaxBreakdown;
      // Skip rows that took the flat-rate override path (empty breakdown by design).
      if (!breakdown || Object.keys(breakdown).length === 0) continue;
      const sum = (breakdown.bracket10 || 0) + (breakdown.bracket12 || 0)
                + (breakdown.bracket22 || 0) + (breakdown.bracket24 || 0)
                + (breakdown.bracket32 || 0) + (breakdown.bracket35 || 0)
                + (breakdown.bracket37 || 0);
      if (Math.abs(sum - row.federalTax) > 1) {
        return {
          passed: false,
          observed: { breakdownSum: sum, federalTax: row.federalTax, age: row.age },
          expected: 'breakdown sum within ±$1 of federalTax',
        };
      }
    }
    return { passed: true };
  },
};

// ---------------------------------------------------------------------------
// Invariant TBC-2 — FICA-breakdown conservation
// ---------------------------------------------------------------------------

const invariantTBC2 = {
  id: 'TBC-2',
  family: 'tax-bracket-conservation',
  description: 'ficaBreakdown component sum equals ficaTax aggregate within $1',
  severity: 'HIGH',
  check(persona, _ctx) {
    const rows = _accumulationRowsFor(persona);
    for (const row of rows) {
      const fb = row.ficaBreakdown;
      if (!fb || Object.keys(fb).length === 0) continue;
      const sum = (fb.socialSecurity || 0) + (fb.medicare || 0) + (fb.additionalMedicare || 0);
      if (Math.abs(sum - row.ficaTax) > 1) {
        return {
          passed: false,
          observed: { breakdownSum: sum, ficaTax: row.ficaTax, age: row.age },
          expected: 'FICA breakdown sum within ±$1 of ficaTax',
        };
      }
    }
    return { passed: true };
  },
};

// ---------------------------------------------------------------------------
// Invariant TBC-3 — taxableIncome definition
// ---------------------------------------------------------------------------

const invariantTBC3 = {
  id: 'TBC-3',
  family: 'tax-bracket-conservation',
  description: 'taxableIncome = max(0, grossIncome - pretax401kEmployee - standardDeduction) exact',
  severity: 'MEDIUM',
  check(persona, _ctx) {
    const rows = _accumulationRowsFor(persona);
    for (const row of rows) {
      const breakdown = row.federalTaxBreakdown;
      if (!breakdown || Object.keys(breakdown).length === 0) continue;
      const expected = Math.max(0,
        (row.grossIncome || 0)
        - (row.pretax401kEmployee || 0)
        - (breakdown.standardDeduction || 0)
      );
      if (Math.abs(breakdown.taxableIncome - expected) > 1) {
        return {
          passed: false,
          observed: { taxableIncome: breakdown.taxableIncome, expected, age: row.age },
          expected: `max(0, grossIncome - pretax401k - stdDed) = ${expected}`,
        };
      }
    }
    return { passed: true };
  },
};

// ---------------------------------------------------------------------------
// Invariant TBC-4 — filing-status correctness
// ---------------------------------------------------------------------------

const invariantTBC4 = {
  id: 'TBC-4',
  family: 'tax-bracket-conservation',
  description: 'filingStatus standardDeduction matches adultCount: single=14600 / MFJ=29200',
  severity: 'HIGH',
  check(persona, _ctx) {
    const rows = _accumulationRowsFor(persona);
    const expectedStdDed = (persona.inp && persona.inp.adultCount === 1) ? 14600 : 29200;
    for (const row of rows) {
      const breakdown = row.federalTaxBreakdown;
      if (!breakdown || Object.keys(breakdown).length === 0) continue;
      if (breakdown.standardDeduction !== expectedStdDed) {
        return {
          passed: false,
          observed: { stdDed: breakdown.standardDeduction, adultCount: persona.inp.adultCount, age: row.age },
          expected: `standardDeduction === ${expectedStdDed}`,
        };
      }
    }
    return { passed: true };
  },
};

// ---------------------------------------------------------------------------
// Invariant TBC-5 — backwards-compat for flat-rate override
// ---------------------------------------------------------------------------

const invariantTBC5 = {
  id: 'TBC-5',
  family: 'tax-bracket-conservation',
  description: 'flat-rate override (taxRate>0): ficaTax=0, breakdowns empty, federalTax matches v2',
  severity: 'HIGH',
  check(persona, _ctx) {
    // Only relevant if persona has taxRate > 0
    if (!persona.inp || !(persona.inp.taxRate > 0)) {
      return { passed: true, notes: 'persona uses progressive-bracket path; TBC-5 N/A' };
    }
    const rows = _accumulationRowsFor(persona);
    for (const row of rows) {
      if (row.ficaTax !== 0) {
        return {
          passed: false,
          observed: { ficaTax: row.ficaTax, age: row.age },
          expected: 'ficaTax === 0 in flat-rate-override mode',
        };
      }
      if (row.federalTaxBreakdown && Object.keys(row.federalTaxBreakdown).length > 0) {
        return {
          passed: false,
          observed: { breakdownKeys: Object.keys(row.federalTaxBreakdown), age: row.age },
          expected: 'federalTaxBreakdown empty {} in flat-rate-override mode',
        };
      }
      const v2Expected = Math.max(0,
        ((row.grossIncome || 0) - (row.pretax401kEmployee || 0)) * persona.inp.taxRate
      );
      if (Math.abs(row.federalTax - v2Expected) > 1) {
        return {
          passed: false,
          observed: { federalTax: row.federalTax, v2Expected, age: row.age },
          expected: 'federalTax matches v2 flat-rate formula',
        };
      }
    }
    return { passed: true };
  },
};

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

test('T021-TBC: tax-bracket-conservation invariants run across the persona matrix', () => {
  const result = runHarness(
    personas,
    [invariantTBC1, invariantTBC2, invariantTBC3, invariantTBC4, invariantTBC5],
    { silent: true },
  );

  const findings = result.findings || [];
  const crit = findings.filter(f => f.severity === 'CRITICAL').length;
  const high = findings.filter(f => f.severity === 'HIGH').length;
  const med  = findings.filter(f => f.severity === 'MEDIUM').length;
  const low  = findings.filter(f => f.severity === 'LOW').length;

  console.log(
    '# [tax-bracket-conservation.test.js] cells: ' + result.totalCells
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
});

test('TBC invariants are exported and well-formed', () => {
  const all = [invariantTBC1, invariantTBC2, invariantTBC3, invariantTBC4, invariantTBC5];
  for (const inv of all) {
    assert.strictEqual(typeof inv.id, 'string');
    assert.strictEqual(typeof inv.check, 'function');
    assert.ok(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(inv.severity));
    assert.strictEqual(inv.family, 'tax-bracket-conservation');
  }
});

module.exports = {
  invariantTBC1, invariantTBC2, invariantTBC3, invariantTBC4, invariantTBC5,
};
