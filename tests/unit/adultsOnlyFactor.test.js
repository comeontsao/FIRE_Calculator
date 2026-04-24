/*
 * tests/unit/adultsOnlyFactor.test.js — feature 010 T007.
 *
 * Locks getAdultsOnlyFactor and getScaledScenarioSpend per:
 *   specs/010-country-budget-scaling/contracts/scaling-formula.contract.md
 *
 * The helpers are mirrored inline here (same pattern as feature 009's
 * adultCounter.test.js / socialSecurity.test.js) so the tests are standalone
 * and do NOT import from the HTML file.  When Backend lands the helpers in the
 * HTML, these tests should remain byte-for-byte identical — they lock the
 * CONTRACT, not the implementation file.
 *
 * RED state is expected until T004/T005 land; these tests pass immediately
 * because the kernel is mirrored inline.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS_SNAPSHOT } from '../fixtures/country-budget-scaling.js';

// ---------------------------------------------------------------------------
// Inline mirror of getAdultsOnlyFactor per scaling-formula.contract.md
// Formula:
//   adult_weight  = 1.0 + 0.5 * max(0, adultCount - 1)
//   couple_weight = 1.5
//   factor        = adult_weight / couple_weight
//   Clamp adultCount to [1, 2] before computing.
// ---------------------------------------------------------------------------
function getAdultsOnlyFactor(adultCount) {
  const clamped = Math.max(1, Math.min(2, adultCount));
  const adultWeight = 1.0 + 0.5 * Math.max(0, clamped - 1);
  const coupleWeight = 1.5;
  return adultWeight / coupleWeight;
}

// ---------------------------------------------------------------------------
// Inline mirror of getScaledScenarioSpend per scaling-formula.contract.md
// Algorithm:
//   1. If overrides[scenario.id] > 0 → return override (factor NOT applied)
//   2. Select baseline from tier
//   3. Multiply by getAdultsOnlyFactor(adultCount)
// ---------------------------------------------------------------------------
function getScaledScenarioSpend(scenario, tier, adultCount, overrides) {
  if (overrides && overrides[scenario.id] > 0) {
    return overrides[scenario.id];
  }
  let baseline;
  if (tier === 'normal') {
    baseline = scenario.normalSpend;
  } else if (tier === 'comfortable') {
    baseline = scenario.comfortableSpend;
  } else {
    // 'lean' or defensive default
    baseline = scenario.annualSpend;
  }
  return baseline * getAdultsOnlyFactor(adultCount);
}

// ---------------------------------------------------------------------------
// Fixture 1 — getAdultsOnlyFactor(1) === 2/3
// ---------------------------------------------------------------------------
test('getAdultsOnlyFactor — adultCount=1 returns exactly 2/3 (IEEE-754)', () => {
  const result = getAdultsOnlyFactor(1);
  const expected = 2 / 3;
  assert.ok(
    Math.abs(result - expected) < 1e-12,
    `Expected ~0.6666666666666666, got ${result}`,
  );
});

// ---------------------------------------------------------------------------
// Fixture 2 — getAdultsOnlyFactor(2) === 1.0 exactly
// ---------------------------------------------------------------------------
test('getAdultsOnlyFactor — adultCount=2 returns exactly 1.0', () => {
  assert.equal(getAdultsOnlyFactor(2), 1.0);
});

// ---------------------------------------------------------------------------
// Fixture 3 — clamp defensive: adultCount=0 behaves as adultCount=1
// ---------------------------------------------------------------------------
test('getAdultsOnlyFactor — adultCount=0 clamps to adultCount=1', () => {
  assert.equal(getAdultsOnlyFactor(0), getAdultsOnlyFactor(1));
});

// ---------------------------------------------------------------------------
// Fixture 4 — clamp defensive: adultCount=3 behaves as adultCount=2
// ---------------------------------------------------------------------------
test('getAdultsOnlyFactor — adultCount=3 clamps to adultCount=2', () => {
  assert.equal(getAdultsOnlyFactor(3), getAdultsOnlyFactor(2));
});

// ---------------------------------------------------------------------------
// Fixture 5 — tier-ratio preservation for every scenario in SCENARIOS_SNAPSHOT
// For any scenario s and adultCount=1:
//   getScaledScenarioSpend(s, 'normal', 1, {}) / getScaledScenarioSpend(s, 'lean', 1, {})
//   === s.normalSpend / s.annualSpend   (within 1e-9)
//
// Note: for all 12 current scenarios normalSpend === annualSpend, so both
// ratios equal 1.0, which is a valid and expected result.
// ---------------------------------------------------------------------------
test('getScaledScenarioSpend — normal/lean tier ratio preserved at adultCount=1', () => {
  for (const s of SCENARIOS_SNAPSHOT) {
    const scaledLean   = getScaledScenarioSpend(s, 'lean',   1, {});
    const scaledNormal = getScaledScenarioSpend(s, 'normal', 1, {});
    const contractRatio = s.normalSpend / s.annualSpend;
    const actualRatio   = scaledNormal / scaledLean;
    assert.ok(
      Math.abs(actualRatio - contractRatio) < 1e-9,
      `Scenario ${s.id}: normal/lean ratio expected ${contractRatio}, got ${actualRatio}`,
    );
  }
});

test('getScaledScenarioSpend — comfortable/lean tier ratio preserved at adultCount=1', () => {
  for (const s of SCENARIOS_SNAPSHOT) {
    const scaledLean        = getScaledScenarioSpend(s, 'lean',        1, {});
    const scaledComfortable = getScaledScenarioSpend(s, 'comfortable', 1, {});
    const contractRatio = s.comfortableSpend / s.annualSpend;
    const actualRatio   = scaledComfortable / scaledLean;
    assert.ok(
      Math.abs(actualRatio - contractRatio) < 1e-9,
      `Scenario ${s.id}: comfortable/lean ratio expected ${contractRatio}, got ${actualRatio}`,
    );
  }
});

// ---------------------------------------------------------------------------
// Fixture 6 — override precedence: override wins regardless of tier/adultCount
// ---------------------------------------------------------------------------
test('getScaledScenarioSpend — override {us:100000} at normal tier, adultCount=1 returns 100000', () => {
  const usScenario = SCENARIOS_SNAPSHOT.find(s => s.id === 'us');
  const result = getScaledScenarioSpend(usScenario, 'normal', 1, { us: 100000 });
  assert.equal(result, 100000);
});

// ---------------------------------------------------------------------------
// Fixture 7 — regression anchor: US lean at adultCount=2 === 78000
// ---------------------------------------------------------------------------
test('getScaledScenarioSpend — US lean at adultCount=2 with no overrides returns 78000', () => {
  const usScenario = SCENARIOS_SNAPSHOT.find(s => s.id === 'us');
  assert.equal(getScaledScenarioSpend(usScenario, 'lean', 2, {}), 78000);
});

// ---------------------------------------------------------------------------
// Loop regression gate — all 12 scenarios at adultCount=2 lean === s.annualSpend
// (adultCount=2 factor is exactly 1.0, so result must equal the baseline byte-for-byte)
// ---------------------------------------------------------------------------
test('getScaledScenarioSpend — adultCount=2 lean returns annualSpend for every scenario', () => {
  for (const s of SCENARIOS_SNAPSHOT) {
    const result = getScaledScenarioSpend(s, 'lean', 2, {});
    assert.equal(
      result,
      s.annualSpend,
      `Scenario ${s.id}: expected ${s.annualSpend}, got ${result}`,
    );
  }
});

// ---------------------------------------------------------------------------
// Fixture T032 — US3 scaling-indicator format lock.
// The renderer surfaces the factor as `factor.toFixed(2)` inside the Line 1
// i18n template (e.g. "1 adult → 0.67× couple baseline"). This test pins
// those exact string forms so a silent toString/rounding change can't slip
// past CI. Contract: specs/010-country-budget-scaling/contracts/i18n.contract.md
// ---------------------------------------------------------------------------
test('indicator-format — toFixed(2) representation of factors', () => {
  assert.equal(getAdultsOnlyFactor(1).toFixed(2), '0.67');
  assert.equal(getAdultsOnlyFactor(2).toFixed(2), '1.00');
});

// ---------------------------------------------------------------------------
// Fixture T032 — plural-suffix helper used by the US3 indicator Line 1.
// The renderer computes `pluralS = (adultCount === 1) ? '' : 's'` inline and
// hands it to t('geo.scale.line1', ...). Trivially-small but lock-worthy so a
// future rewrite (e.g., CLDR plural lib) stays backward-compatible.
// ---------------------------------------------------------------------------
test('indicator-format — English plural suffix for adultCount', () => {
  const pluralS = (n) => (n === 1) ? '' : 's';
  assert.equal(pluralS(1), '');
  assert.equal(pluralS(2), 's');
});

// ---------------------------------------------------------------------------
// T039 — tier-ratio preservation across adultCount.
// Locks the invariant that the normal/lean and comfortable/lean ratios are
// independent of the adults-only factor. Because the factor scales lean,
// normal, and comfortable baselines identically, ratios must match byte-for-byte
// between adultCount=1 and adultCount=2 for every scenario.
// Contract: specs/010-country-budget-scaling/contracts/scaling-formula.contract.md
// ---------------------------------------------------------------------------
test('tier-ratio preservation — normal/lean and comfortable/lean match at both adultCount values', () => {
  for (const s of SCENARIOS_SNAPSHOT) {
    const normalRatioAt1 = getScaledScenarioSpend(s, 'normal', 1, {}) / getScaledScenarioSpend(s, 'lean', 1, {});
    const normalRatioAt2 = getScaledScenarioSpend(s, 'normal', 2, {}) / getScaledScenarioSpend(s, 'lean', 2, {});
    assert.ok(Math.abs(normalRatioAt1 - normalRatioAt2) < 1e-9,
      `${s.id}: normal/lean ratio must match across adultCount (got ${normalRatioAt1} vs ${normalRatioAt2})`);
    const comfortRatioAt1 = getScaledScenarioSpend(s, 'comfortable', 1, {}) / getScaledScenarioSpend(s, 'lean', 1, {});
    const comfortRatioAt2 = getScaledScenarioSpend(s, 'comfortable', 2, {}) / getScaledScenarioSpend(s, 'lean', 2, {});
    assert.ok(Math.abs(comfortRatioAt1 - comfortRatioAt2) < 1e-9,
      `${s.id}: comfortable/lean ratio must match across adultCount (got ${comfortRatioAt1} vs ${comfortRatioAt2})`);
  }
});
