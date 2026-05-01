'use strict';
// =============================================================================
// tests/unit/validation-audit/harness.test.js
//
// Feature 020 — Validation Audit Harness meta-tests (T013)
// Spec: specs/020-validation-audit/tasks.md T013
// Contract: specs/020-validation-audit/contracts/validation-audit-harness.contract.md
//
// Meta-tests validate the harness infrastructure itself, NOT the audit invariants.
// Each test constructs its own minimal persona + invariant inline so there is
// no dependency on the full personas.js matrix.
//
// CommonJS (Constitution Principle V).
// Tests use node:test (Node ≥ 18, matches existing test suite conventions).
// =============================================================================

const { test } = require('node:test');
const assert   = require('node:assert');
const path     = require('path');

const HARNESS_PATH = path.join(__dirname, 'harness.js');
const { runHarness, buildHarnessContext, clearContextCache } = require(HARNESS_PATH);

// ---------------------------------------------------------------------------
// Minimal persona builder for meta-tests.
// Constructs a self-contained persona that exercises no DOM or mortgage paths,
// minimising the chance of a sandbox runtime error in a meta-test.
// ---------------------------------------------------------------------------

/**
 * A minimal but complete Generic persona with no mortgage and no mortgage stubs needed.
 */
function _minimalGenericPersona(id, overrides) {
  const base = {
    id,
    dashboard: 'Generic',
    notes: 'meta-test minimal persona',
    inp: Object.assign({
      // Identity
      ageRoger:            42,
      ageRebecca:          42,
      agePerson1:          42,
      agePerson2:          42,
      adultCount:          2,

      // Pools
      roger401kTrad:       26454,
      person1_401kTrad:    26454,
      roger401kRoth:       58000,
      person1_401kRoth:    58000,
      rogerStocks:         215000,
      rebeccaStocks:       230000,
      person1Stocks:       215000,
      person2Stocks:       230000,
      cashSavings:         80000,
      otherAssets:         0,

      // Returns
      returnRate:          0.07,
      return401k:          0.07,
      inflationRate:       0.03,

      // Income
      annualIncome:        130000,
      raiseRate:           0.02,
      taxRate:             0.28,
      monthlySavings:      1000,
      contrib401kTrad:     16500,
      contrib401kRoth:     2900,
      empMatch:            7200,

      // Tax
      taxTrad:             0.15,
      stockGainPct:        0.6,
      bufferUnlock:        1.0,
      bufferSS:            1.0,
      terminalBuffer:      2.0,
      safetyMargin:        0.05,
      swr:                 0.04,

      // SS
      ssClaimAge:          70,
      ssWorkStart:         2019,
      ssAvgEarnings:       100000,
      ssRebeccaOwn:        0,
      ssSpouseOwn:         0,

      // No mortgage
      mortgageEnabled:     false,
      mtgHomeLocation:     'us',
      mtgYearsPaid:        0,
      mtgBuyInYears:       0,
      mtgHomePrice:        600000,
      mtgDownPayment:      120000,
      mtgClosingCosts:     17000,
      mtgRate:             0.06,
      mtgTerm:             30,
      mtgPropertyTax:      8000,
      mtgInsurance:        2400,
      mtgHOA:              200,
      mtgApprec:           0.02,
      mtgSellAtFire:       'yes',

      // No second home
      secondHomeEnabled:   false,
      mtg2Destiny:         'no',
      mtg2BuyInYears:      5,
      mtg2HomePrice:       400000,
      mtg2DownPayment:     80000,
      mtg2ClosingCosts:    10000,
      mtg2Rate:            0.065,
      mtg2Term:            30,
      mtg2PropertyTax:     4000,
      mtg2Insurance:       1200,
      mtg2HOA:             0,
      mtg2Apprec:          0.02,

      // Mortgage strategy
      pviStrategyPrepay:         false,
      pviStrategyInvestKeep:     true,
      pviStrategyInvestLumpSum:  false,
      pviExtraMonthly:           0,
      pviRefiEnabled:            false,
      pviCashflowOverrideEnabled: false,
      pviCashflowOverride:        0,

      // Country
      selectedScenario:    'us',

      // Expenses
      exp_0: 2690,
      annualSpend:         72700,

      // Plan
      endAge:              100,
      rule55Enabled:       false,
      rule55:              { enabled: false, separationAge: 54 },
      rule55SeparationAge: 54,
      irmaaThreshold:      212000,
    }, overrides || {}),
  };
  return base;
}

// ---------------------------------------------------------------------------
// Minimal invariant factories for meta-tests.
// ---------------------------------------------------------------------------

/** A known-failing invariant: always returns { passed: false, observed: X, expected: Y }. */
function _alwaysFailInvariant() {
  return {
    id:          'META-FAIL-01',
    family:      'meta-test',
    description: 'Always-failing invariant for harness meta-tests',
    severity:    'HIGH',
    check(persona, ctx) {
      return {
        passed:   false,
        observed: 'always-fail',
        expected: 'this invariant never passes',
        notes:    'meta-test: always-failing invariant',
      };
    },
  };
}

/** A known-passing invariant: always returns { passed: true }. */
function _alwaysPassInvariant() {
  return {
    id:          'META-PASS-01',
    family:      'meta-test',
    description: 'Always-passing invariant for harness meta-tests',
    severity:    'LOW',
    check(persona, ctx) {
      return { passed: true };
    },
  };
}

/** A family-specific invariant under family 'mode-ordering'. */
function _modeOrderingInvariant() {
  return {
    id:          'META-FAMILY-01',
    family:      'mode-ordering',
    description: 'Family-filtered invariant for harness meta-tests',
    severity:    'MEDIUM',
    check(persona, ctx) {
      return { passed: true };
    },
  };
}

/** A family-specific invariant under a different family. */
function _otherFamilyInvariant() {
  return {
    id:          'META-OTHER-FAMILY-01',
    family:      'end-state-validity',
    description: 'Different-family invariant for harness meta-tests',
    severity:    'MEDIUM',
    check(persona, ctx) {
      return { passed: true };
    },
  };
}

// ---------------------------------------------------------------------------
// Meta-test 1: Known-good persona + known-failing invariant → 1 finding
//
// The harness should:
// - Build a harness context for the persona without throwing
// - Run the always-failing invariant
// - Record exactly 1 finding with the correct invariantId and personaId
// ---------------------------------------------------------------------------

test('T013-01: known-good persona + known-failing invariant produces exactly 1 finding', () => {
  clearContextCache();  // ensure fresh build

  const persona   = _minimalGenericPersona('meta-test-persona-fail');
  const invariant = _alwaysFailInvariant();

  const result = runHarness([persona], [invariant], { silent: true });

  assert.strictEqual(
    result.totalCells,
    1,
    'totalCells should be 1 (1 persona × 1 invariant)'
  );
  assert.strictEqual(
    result.passed,
    0,
    'passed should be 0 — the invariant always fails'
  );
  assert.strictEqual(
    result.failed,
    1,
    'failed should be 1'
  );
  assert.strictEqual(
    result.findings.length,
    1,
    'findings array should contain exactly 1 finding'
  );

  const finding = result.findings[0];
  assert.strictEqual(finding.invariantId, invariant.id,   'finding.invariantId must match invariant.id');
  assert.strictEqual(finding.personaId,  persona.id,      'finding.personaId must match persona.id');
  assert.strictEqual(finding.severity,   invariant.severity, 'finding.severity must mirror invariant.severity');
  assert.strictEqual(finding.status,     'OPEN',          'new finding status must be OPEN');
  assert.strictEqual(finding.observed,   'always-fail',   'finding.observed must match check result');
  assert.ok(typeof finding.discoveredAt === 'string', 'finding.discoveredAt must be an ISO string');
});

// ---------------------------------------------------------------------------
// Meta-test 2: Known-good persona + known-passing invariant → 0 findings
//
// The harness should:
// - Build a harness context for the persona without throwing
// - Run the always-passing invariant
// - Record 0 findings, passed=1, failed=0
// ---------------------------------------------------------------------------

test('T013-02: known-good persona + known-passing invariant produces 0 findings', () => {
  clearContextCache();

  const persona   = _minimalGenericPersona('meta-test-persona-pass');
  const invariant = _alwaysPassInvariant();

  const result = runHarness([persona], [invariant], { silent: true });

  assert.strictEqual(result.totalCells, 1,   'totalCells should be 1');
  assert.strictEqual(result.passed,     1,   'passed should be 1');
  assert.strictEqual(result.failed,     0,   'failed should be 0');
  assert.strictEqual(result.findings.length, 0, 'findings array should be empty');
  assert.ok(typeof result.durationMs === 'number', 'durationMs must be a number');
  assert.ok(result.durationMs >= 0, 'durationMs must be non-negative');
});

// ---------------------------------------------------------------------------
// Meta-test 3: Persona construction failure → special harness/persona-construction-failed finding
//
// We construct a persona whose inp causes the sandbox context build to throw.
// A persona with ageRoger=NaN should cause signedLifecycleEndBalance to produce
// NaN values. However, we need the context BUILD itself to throw.
// We do this by providing an inp with a missing required field that causes
// _getSandboxFactory to fail, OR by providing a persona with an invalid dashboard key.
//
// Per contract §Lifecycle step 4: the harness must NOT crash; it must record a
// special finding with invariantId = 'harness/persona-construction-failed'.
// ---------------------------------------------------------------------------

test('T013-03: persona-construction failure produces special harness/persona-construction-failed finding and does not crash', () => {
  clearContextCache();

  // Force a construction error by using an unknown dashboard key.
  // The harness's _getSandboxFactory will throw for an unknown key.
  const malformedPersona = {
    id:        'meta-test-persona-construction-fail',
    dashboard: 'UNKNOWN_DASHBOARD_KEY_THAT_DOES_NOT_EXIST',
    inp:       { agePerson1: 42, annualSpend: 72700 },
    notes:     'meta-test: malformed persona with bad dashboard key',
  };

  const invariant = _alwaysPassInvariant();

  // Should not throw — the harness must catch the error gracefully.
  let result;
  assert.doesNotThrow(() => {
    result = runHarness([malformedPersona], [invariant], { silent: true });
  }, 'runHarness must not throw even when context construction fails');

  assert.ok(result, 'result must be defined');
  assert.ok(
    result.findings.length >= 1,
    'there must be at least 1 finding for the failed context build'
  );

  const specialFinding = result.findings.find(
    f => f.invariantId === 'harness/persona-construction-failed'
  );
  assert.ok(
    specialFinding !== undefined,
    'findings must include a harness/persona-construction-failed finding'
  );
  assert.strictEqual(
    specialFinding.personaId,
    malformedPersona.id,
    'special finding must reference the failing persona\'s ID'
  );
  assert.strictEqual(
    specialFinding.severity,
    'CRITICAL',
    'persona-construction-failed must be severity CRITICAL'
  );
  assert.strictEqual(
    specialFinding.status,
    'OPEN',
    'new special finding must have status OPEN'
  );
});

// ---------------------------------------------------------------------------
// Meta-test 4: PERSONA env filter limits run to one persona
//
// When PERSONA=<id> is set, the harness should only evaluate that persona
// regardless of how many are in the personas array.
// ---------------------------------------------------------------------------

test('T013-04: PERSONA env filter limits the run to exactly one persona', () => {
  clearContextCache();

  const personaA = _minimalGenericPersona('meta-filter-persona-A');
  const personaB = _minimalGenericPersona('meta-filter-persona-B');

  // Use the always-failing invariant so we can verify which persona was evaluated
  // (the filtered one produces a finding; the non-filtered one should not appear).
  const invariant = _alwaysFailInvariant();

  // Set the PERSONA env var to persona A's ID only.
  const originalEnv = process.env.PERSONA;
  process.env.PERSONA = 'meta-filter-persona-A';

  let result;
  try {
    result = runHarness([personaA, personaB], [invariant], { silent: true });
  } finally {
    // Restore env var
    if (originalEnv === undefined) {
      delete process.env.PERSONA;
    } else {
      process.env.PERSONA = originalEnv;
    }
  }

  // Only persona A should have been evaluated.
  assert.strictEqual(
    result.totalCells,
    1,
    'totalCells should be 1 when PERSONA filter is set — only 1 persona evaluated'
  );
  assert.strictEqual(
    result.findings.length,
    1,
    'exactly 1 finding should exist (for persona A)'
  );
  assert.strictEqual(
    result.findings[0].personaId,
    'meta-filter-persona-A',
    'the finding must reference the filtered persona A'
  );
});

// ---------------------------------------------------------------------------
// Meta-test 5 (bonus): FAMILY env filter limits invariants to one family
//
// When FAMILY=<family> is set, only invariants in that family should run.
// ---------------------------------------------------------------------------

test('T013-05: FAMILY env filter limits the run to invariants in one family', () => {
  clearContextCache();

  const persona = _minimalGenericPersona('meta-family-filter-persona');

  // Two invariants in different families.
  // mode-ordering invariant always passes.
  // end-state-validity invariant always fails.
  const modeOrderingInv    = _modeOrderingInvariant();
  const otherFamilyInv     = _otherFamilyInvariant();

  // Set FAMILY filter to 'mode-ordering' — only modeOrderingInv should run.
  const originalFamily = process.env.FAMILY;
  process.env.FAMILY = 'mode-ordering';

  let result;
  try {
    result = runHarness([persona], [modeOrderingInv, otherFamilyInv], { silent: true });
  } finally {
    if (originalFamily === undefined) {
      delete process.env.FAMILY;
    } else {
      process.env.FAMILY = originalFamily;
    }
  }

  // Only 1 invariant (mode-ordering) should have run.
  assert.strictEqual(
    result.totalCells,
    1,
    'totalCells should be 1 when FAMILY filter is set — only 1 invariant evaluated'
  );
  // mode-ordering invariant always passes → 0 findings
  assert.strictEqual(
    result.findings.length,
    0,
    'no findings when only the always-passing mode-ordering invariant runs'
  );
  assert.strictEqual(result.passed, 1, 'passed should be 1');
  assert.strictEqual(result.failed, 0, 'failed should be 0');
});

// ---------------------------------------------------------------------------
// Meta-test 6: HarnessResult shape validation
//
// Verifies that runHarness always returns the expected HarnessResult shape
// regardless of input.
// ---------------------------------------------------------------------------

test('T013-06: runHarness always returns the expected HarnessResult shape', () => {
  clearContextCache();

  const persona   = _minimalGenericPersona('meta-shape-persona');
  const invariant = _alwaysPassInvariant();

  const result = runHarness([persona], [invariant], { silent: true });

  assert.ok(typeof result === 'object' && result !== null, 'result must be a non-null object');
  assert.ok(typeof result.totalCells  === 'number',  'totalCells must be a number');
  assert.ok(typeof result.passed      === 'number',  'passed must be a number');
  assert.ok(typeof result.failed      === 'number',  'failed must be a number');
  assert.ok(Array.isArray(result.findings),           'findings must be an array');
  assert.ok(typeof result.durationMs  === 'number',  'durationMs must be a number');

  // Invariant: totalCells = passed + failed
  assert.strictEqual(
    result.passed + result.failed,
    result.totalCells,
    'passed + failed must equal totalCells'
  );
});
