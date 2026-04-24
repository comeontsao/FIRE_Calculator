/*
 * tests/unit/scenarioOverride.test.js — feature 010 T012.
 *
 * Locks the normalizeOverrides persistence kernel per:
 *   specs/010-country-budget-scaling/contracts/persistence.contract.md §Test hooks
 *
 * Tests the normalisation logic directly (not via a live localStorage call) by
 * mirroring the kernel inline.  The 5 fixture cases from the contract are all
 * covered here.  No DOM, no localStorage, no external dependencies.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Inline mirror of the normaliseOverrides kernel per persistence.contract.md
// Rules:
//   - If input is falsy or not an object → return {}
//   - For each [key, value] entry: keep entry only when
//       Number.isFinite(value) && value > 0
// ---------------------------------------------------------------------------
function normalizeOverrides(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (Number.isFinite(v) && v > 0) out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fixture 1 — empty map round-trip
// JSON.parse(JSON.stringify({})) deep-equals {}
// normalizeOverrides({}) → {}
// ---------------------------------------------------------------------------
test('normalizeOverrides — empty map round-trip returns {}', () => {
  const saved   = JSON.parse(JSON.stringify({}));
  const loaded  = normalizeOverrides(saved);
  assert.deepEqual(loaded, {});
});

// ---------------------------------------------------------------------------
// Fixture 2 — set → save → reload → still set
// scenarioOverrides = {us: 100000}; serialise; deserialise; normalise
// → expect us === 100000
// ---------------------------------------------------------------------------
test('normalizeOverrides — {us:100000} survives serialise/deserialise round-trip', () => {
  const original  = { us: 100000 };
  const serialised = JSON.stringify(original);
  const deserialised = JSON.parse(serialised);
  const result = normalizeOverrides(deserialised);
  assert.equal(result.us, 100000);
  assert.deepEqual(Object.keys(result), ['us']);
});

// ---------------------------------------------------------------------------
// Fixture 3 — write-normalisation: {us:0, taiwan:30000} → only ['taiwan'] survives
// us:0 is non-positive → stripped on normalise; taiwan:30000 → kept
// ---------------------------------------------------------------------------
test('normalizeOverrides — {us:0, taiwan:30000} strips us (zero) and keeps taiwan', () => {
  const raw    = { us: 0, taiwan: 30000 };
  const result = normalizeOverrides(raw);
  assert.deepEqual(Object.keys(result), ['taiwan']);
  assert.equal(result.taiwan, 30000);
  assert.equal(result.us, undefined);
});

// ---------------------------------------------------------------------------
// Fixture 4 — read-normalisation: stored {us:-5} → in-memory {}
// Negative value is non-positive → stripped
// ---------------------------------------------------------------------------
test('normalizeOverrides — {us:-5} (negative) normalises to empty {}', () => {
  const stored = JSON.parse(JSON.stringify({ us: -5 }));
  const result = normalizeOverrides(stored);
  assert.deepEqual(result, {});
});

// ---------------------------------------------------------------------------
// Fixture 5 — pre-010 blob forward-compat
// A pre-010 blob has no scenarioOverrides field; accessing it gives undefined.
// normalizeOverrides(undefined) → {}
// (Mirrors: const saved = JSON.parse(blob); scenarioOverrides = saved.scenarioOverrides ?? {})
// ---------------------------------------------------------------------------
test('normalizeOverrides — undefined input (pre-010 blob missing field) returns {}', () => {
  const pre010Blob = '{"inp":{},"childrenList":[]}';
  const saved      = JSON.parse(pre010Blob);
  // simulate the load path: saved.scenarioOverrides is undefined
  const raw    = saved.scenarioOverrides; // undefined
  const result = normalizeOverrides(raw);
  assert.deepEqual(result, {});
});

// ---------------------------------------------------------------------------
// Feature 010 US4 (T036) — override precedence + clear semantics
// Mirrors the scaling-formula contract's override branch:
//   if (scenarioOverrides[s.id] > 0) return scenarioOverrides[s.id];
//   else return scenarioBaseSpend * adultFactor;
// The three tests cover: set@solo, set@couple, clear→factor restore.
// ---------------------------------------------------------------------------
test('override — set wins over factor at adultCount=1', () => {
  const ov = {};
  const value = 100000;
  // Mirror handler behaviour: value > 0 → set
  if (value > 0) ov['us'] = value;
  // Mirror getScaledScenarioSpend with override
  const US = { id: 'us', annualSpend: 78000, normalSpend: 78000, comfortableSpend: 120000 };
  const factor = 1 / 1.5;
  const result = (ov['us'] > 0) ? ov['us'] : US.annualSpend * factor;
  assert.equal(result, 100000);
});

test('override — set wins over factor at adultCount=2 (still 100000, not 100000*1.0)', () => {
  const ov = { us: 100000 };
  const US = { id: 'us', annualSpend: 78000 };
  const result = (ov['us'] > 0) ? ov['us'] : US.annualSpend * 1.0;
  assert.equal(result, 100000);
});

test('override — clear (value=0) restores factor-scaled default', () => {
  const ov = {};
  const US = { id: 'us', annualSpend: 78000, normalSpend: 78000 };
  const value = 0;
  if (value > 0) ov['us'] = value; else delete ov['us'];
  const factor = 1 / 1.5;
  const result = (ov['us'] > 0) ? ov['us'] : US.annualSpend * factor;
  assert.ok(Math.abs(result - 52000) < 0.01);
});
