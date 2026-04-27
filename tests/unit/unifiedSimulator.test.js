// ==================== TEST SUITE: unified simulator (US6) ====================
// Feature 015 Wave C Step 1 — verifies the simulateLifecycle entry point and
// the noiseModel reservation. Migration steps 2-4 (parity test, flip call
// sites, delete retired sims) are tracked as follow-up work in tasks.md.
// Per specs/015-calc-debt-cleanup/contracts/unified-simulator.contract.md
// ==================================================================================

import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { simulateLifecycle } = require(path.resolve(__dirname, '..', '..', 'calc', 'simulateLifecycle.js'));

const VALID_INPUTS = {
  scenarioInputs: { annualSpend: 60000 },
  fireAge: 55,
  planAge: 95,
  strategyOverride: undefined,
  thetaOverride: undefined,
  overlays: { mortgage: false, college: false, home2: false },
  noiseModel: null,
};

test('US6 FR-021: simulateLifecycle throws when noiseModel is non-null', () => {
  assert.throws(
    () => simulateLifecycle({ ...VALID_INPUTS, noiseModel: { samples: 100 } }),
    /reserved for future Monte Carlo/
  );
});

test('US6 FR-021: simulateLifecycle accepts null noiseModel', () => {
  assert.doesNotThrow(() =>
    simulateLifecycle({ ...VALID_INPUTS, noiseModel: null })
  );
});

test('US6 FR-021: simulateLifecycle accepts undefined noiseModel', () => {
  assert.doesNotThrow(() =>
    simulateLifecycle({ ...VALID_INPUTS, noiseModel: undefined })
  );
});

test('US6 FR-021: simulateLifecycle throws on partial Monte Carlo config (defensive)', () => {
  assert.throws(
    () => simulateLifecycle({ ...VALID_INPUTS, noiseModel: { returns: { distribution: 'normal' } } }),
    /reserved for future Monte Carlo/
  );
  assert.throws(
    () => simulateLifecycle({ ...VALID_INPUTS, noiseModel: {} }),
    /reserved for future Monte Carlo/
  );
});

test('US6 FR-020: simulateLifecycle returns the contract output shape', () => {
  const out = simulateLifecycle(VALID_INPUTS);
  assert.ok(Array.isArray(out.perYearRows), 'perYearRows must be an array');
  assert.strictEqual(typeof out.endBalance, 'number');
  assert.strictEqual(typeof out.hasShortfall, 'boolean');
  assert.ok(Array.isArray(out.shortfallYearAges));
  assert.ok(Array.isArray(out.floorViolations));
  assert.strictEqual(typeof out.cumulativeFederalTax, 'number');
  assert.strictEqual(typeof out.residualArea, 'number');
});

test('US6 FR-020: hasShortfall === (shortfallYearAges.length > 0) invariant', () => {
  // Inject a fake legacy projectFullLifecycle that returns rows with shortfall
  const mockSims = {
    projectFullLifecycle: () => [
      { age: 55, total: 100000, hasShortfall: false },
      { age: 56, total: 50000, hasShortfall: true },
      { age: 57, total: 20000, hasShortfall: true },
    ],
  };
  const out = simulateLifecycle({ ...VALID_INPUTS, _legacySimulators: mockSims });
  assert.strictEqual(out.hasShortfall, true);
  assert.deepStrictEqual(out.shortfallYearAges, [56, 57]);
});

test('US6 FR-020: residualArea and cumulativeFederalTax are rounded to nearest dollar', () => {
  const mockSims = {
    projectFullLifecycle: () => [
      { age: 55, total: 100.5, federalTax: 10.5, hasShortfall: false },
      { age: 56, total: 100.5, federalTax: 10.4, hasShortfall: false },
    ],
  };
  const out = simulateLifecycle({ ...VALID_INPUTS, _legacySimulators: mockSims });
  // 201 dollars → rounds to 201; 20.9 → 21
  assert.strictEqual(out.residualArea, 201);
  assert.strictEqual(out.cumulativeFederalTax, 21);
});

test('US6 FR-020: empty legacy simulators returns deterministic empty result', () => {
  // No _legacySimulators injection — should return a valid empty SimulationResult
  const out = simulateLifecycle(VALID_INPUTS);
  assert.deepStrictEqual(out, {
    perYearRows: [],
    endBalance: 0,
    hasShortfall: false,
    shortfallYearAges: [],
    floorViolations: [],
    cumulativeFederalTax: 0,
    residualArea: 0,
  });
});
