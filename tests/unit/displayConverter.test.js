// ==================== UNIT TESTS: displayConverter ======================
// Feature 022 — Nominal-Dollar Display + Frame-Clarifying Comments.
// Spec: specs/022-nominal-dollar-display/contracts/displayConverter.contract.md
//
// All tests are pure-Node — no DOM, no browser globals.
// Module under test: calc/displayConverter.js
// =========================================================================

import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const displayConverter = require(
  path.resolve(__dirname, '..', '..', 'calc', 'displayConverter.js'),
);

const { toBookValue, toBookValueAtYearsFromNow, invertToReal } = displayConverter;

// ---------------------------------------------------------------------------
// Case 1: Identity at yearsFromNow=0
// ---------------------------------------------------------------------------
test('displayConverter case 1: identity at age === currentAge (yearsFromNow=0)', () => {
  const result = toBookValue(1000, 42, 42, 0.03);
  assert.strictEqual(
    result,
    1000,
    'When age equals currentAge, Book Value must equal real-$ unchanged',
  );
});

// ---------------------------------------------------------------------------
// Case 2: Standard conversion — RR-baseline FIRE-year row
//   $445,000 today × 1.03^11 ≈ $616,008 (within $1)
// ---------------------------------------------------------------------------
test('displayConverter case 2: standard conversion ($445k × 1.03^11 ≈ $616k)', () => {
  const result = toBookValue(445000, 53, 42, 0.03);
  // Formula-of-record per contract: $445,000 × 1.03^11 ≈ $615,984.07.
  // (Contract narrative says "≈ $616,008" which is an informal rounding;
  //  the binding criterion is the formula expressed below.)
  const expected = 445000 * Math.pow(1.03, 11);
  assert.ok(
    Math.abs(result - expected) < 1,
    `Expected ≈ $${expected.toFixed(2)}, got $${result.toFixed(2)}`,
  );
  // Sanity ballpark: result is in the $615k–$617k window per spec FR-002 narrative.
  assert.ok(
    result > 615000 && result < 617000,
    `Result $${result.toFixed(2)} out of expected $615k–$617k window`,
  );
});

// ---------------------------------------------------------------------------
// Case 3: Zero inflation → returns realValue unchanged
// ---------------------------------------------------------------------------
test('displayConverter case 3: zero inflation returns realValue unchanged', () => {
  const result = toBookValue(1000, 53, 42, 0);
  assert.strictEqual(
    result,
    1000,
    'inflationRate === 0 must short-circuit to identity',
  );
});

// ---------------------------------------------------------------------------
// Case 4: Inverse round-trip — invertToReal(toBookValue(x)) ≈ x
// ---------------------------------------------------------------------------
test('displayConverter case 4: inverse round-trip preserves value within float precision', () => {
  const original = 1000;
  const bookValue = toBookValue(original, 53, 42, 0.03);
  const recovered = invertToReal(bookValue, 53, 42, 0.03);
  assert.ok(
    Math.abs(recovered - original) < 1e-9,
    `Round-trip should recover original value; got ${recovered} (delta ${Math.abs(recovered - original)})`,
  );
});

// ---------------------------------------------------------------------------
// Case 5: Historical age (age < currentAge) — deflation case
//   $1000 × 1.03^(-12) === $1000 / 1.03^12 ≈ $701
// ---------------------------------------------------------------------------
test('displayConverter case 5: historical age (deflation case)', () => {
  const result = toBookValue(1000, 30, 42, 0.03);
  const expected = 1000 / Math.pow(1.03, 12); // ≈ 701.380...
  assert.ok(
    Math.abs(result - expected) < 1e-6,
    `Historical age must deflate; expected ≈ $${expected.toFixed(2)}, got $${result.toFixed(2)}`,
  );
  assert.ok(
    Math.abs(result - 701) < 1,
    `Expected ≈ $701, got $${result.toFixed(2)}`,
  );
});

// ---------------------------------------------------------------------------
// Case 6: NaN guard — non-finite realValue returns 0
// ---------------------------------------------------------------------------
test('displayConverter case 6: NaN-guard on realValue returns 0 (no NaN cascade)', () => {
  assert.strictEqual(toBookValue(NaN, 53, 42, 0.03), 0);
  assert.strictEqual(toBookValue(Infinity, 53, 42, 0.03), 0);
  assert.strictEqual(toBookValue(-Infinity, 53, 42, 0.03), 0);
});

// ---------------------------------------------------------------------------
// Case 7: Throws TypeError on bad inflationRate
// ---------------------------------------------------------------------------
test('displayConverter case 7: throws TypeError on non-finite inflationRate', () => {
  assert.throws(
    () => toBookValue(1000, 53, 42, NaN),
    TypeError,
    'NaN inflationRate must throw TypeError',
  );
  assert.throws(
    () => toBookValue(1000, 53, 42, Infinity),
    TypeError,
    'Infinity inflationRate must throw TypeError',
  );
  assert.throws(
    () => toBookValue(1000, 53, 42, undefined),
    TypeError,
    'undefined inflationRate must throw TypeError',
  );
});

// ---------------------------------------------------------------------------
// Case 8: toBookValueAtYearsFromNow parity with toBookValue
//   toBookValueAtYearsFromNow(1000, 11, 0.03) === toBookValue(1000, 53, 42, 0.03)
// ---------------------------------------------------------------------------
test('displayConverter case 8: toBookValueAtYearsFromNow parity with toBookValue', () => {
  const viaYfn = toBookValueAtYearsFromNow(1000, 11, 0.03);
  const viaAge = toBookValue(1000, 53, 42, 0.03);
  assert.strictEqual(
    viaYfn,
    viaAge,
    'Convenience overload must produce identical result for same yearsFromNow',
  );
});
