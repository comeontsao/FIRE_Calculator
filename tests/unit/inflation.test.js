import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fixtures from '../fixtures/inflation.js';
// Feature 015 follow-up — inflation.js converted to UMD classic script.
const require = createRequire(import.meta.url);
const { makeInflation } = require('../../calc/inflation.js');

test('inflation: identity at base year', () => {
  const inf = makeInflation(fixtures.inputs.inflationRate, fixtures.inputs.baseYear);
  const { year, amount, realExpected, nominalExpected } = fixtures.expected.identity;
  assert.equal(inf.toReal(amount, year), realExpected);
  assert.equal(inf.toNominal(amount, year), nominalExpected);
});

test('inflation: round-trip', () => {
  const inf = makeInflation(fixtures.inputs.inflationRate, fixtures.inputs.baseYear);
  const { pairs, tolerance } = fixtures.expected.roundTrip;
  for (const { amount, year } of pairs) {
    const roundTrip = inf.toNominal(inf.toReal(amount, year), year);
    assert.ok(
      Math.abs(roundTrip - amount) < tolerance,
      `round-trip for ${amount} at year ${year}: got ${roundTrip}`,
    );
  }
});

test('inflation: three-percent-ten-year', () => {
  const inf = makeInflation(fixtures.inputs.inflationRate, fixtures.inputs.baseYear);
  const { realAtBaseYear, yearAtHorizon, nominalExpected, tolerance } =
    fixtures.expected.threePercentTenYear;
  // $100 real at baseYear should be ($100 * 1.03^10) nominal ten years later.
  const actual = inf.toNominal(realAtBaseYear, yearAtHorizon);
  assert.ok(
    Math.abs(actual - nominalExpected) < tolerance,
    `expected ${nominalExpected}, got ${actual}`,
  );
});
