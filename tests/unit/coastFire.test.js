/**
 * Unit tests — calc/coastFire.js (feature 038, per-country Coast FIRE markers).
 *
 * The question these markers answer: "if I stop contributing TODAY, when could I
 * retire in each shortlisted country?" — NOT "when do I earn the right to coast".
 * The latter is unanswerable and this module deliberately cannot express it: a
 * FIRE age is the first year the target is met WHILE STILL CONTRIBUTING, so
 * removing contributions can only push it later. The crossing never precedes the
 * FIRE age, for anyone, ever.
 *
 * coastFIRECheck() in the dashboards is untouched and still answers its own
 * separate, hardcoded-age-60 question for the Savings-card badge.
 *
 * Contract notes exercised here:
 *   - split growth rates (accessible pool vs locked 401k/Roth pool), matching
 *     coastFIRECheck's model exactly;
 *   - mortgage sale proceeds arrive via a caller-supplied pure callback so this
 *     module stays DOM-free;
 *   - the shortlist sanitiser is total: any junk in localStorage degrades to the
 *     fallback rather than emptying the user's timeline.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const coastFire = require('../../calc/coastFire.js');

// ---------------------------------------------------------------------------
// coastFundedTotal — the growth model
// ---------------------------------------------------------------------------

test('coastFundedTotal: zero years of growth returns the starting pools untouched', () => {
  const total = coastFire.coastFundedTotal({
    accessibleReal: 300_000,
    lockedReal: 200_000,
    yearsOfGrowth: 0,
    realReturnAccessible: 0.05,
    realReturn401k: 0.04,
    saleProceedsReal: 0,
  });
  assert.equal(total, 500_000);
});

test('coastFundedTotal: grows each pool at its OWN real rate', () => {
  const total = coastFire.coastFundedTotal({
    accessibleReal: 100_000,
    lockedReal: 50_000,
    yearsOfGrowth: 10,
    realReturnAccessible: 0.05,
    realReturn401k: 0.04,
    saleProceedsReal: 0,
  });
  const expected = 100_000 * Math.pow(1.05, 10) + 50_000 * Math.pow(1.04, 10);
  assert.ok(Math.abs(total - expected) < 1e-6, `${total} !== ${expected}`);
  // Guard against a single-blended-rate regression: the two pools must NOT be
  // grown at the same rate (that was the bug in the old timeline coast scan).
  const blended = 150_000 * Math.pow(1.05, 10);
  assert.ok(Math.abs(total - blended) > 1000, 'pools were blended into one rate');
});

test('coastFundedTotal: sale proceeds are added AFTER growth, not compounded', () => {
  const total = coastFire.coastFundedTotal({
    accessibleReal: 100_000,
    lockedReal: 0,
    yearsOfGrowth: 10,
    realReturnAccessible: 0.05,
    realReturn401k: 0.04,
    saleProceedsReal: 250_000,
  });
  const expected = 100_000 * Math.pow(1.05, 10) + 250_000;
  assert.ok(Math.abs(total - expected) < 1e-6, `${total} !== ${expected}`);
});

test('coastFundedTotal: negative yearsOfGrowth clamps to 0 (never discounts backwards)', () => {
  // RR's coastFIRECheck computes `60 - age` with no clamp, so a past-60 user
  // discounts backwards. This module refuses to.
  const total = coastFire.coastFundedTotal({
    accessibleReal: 100_000,
    lockedReal: 100_000,
    yearsOfGrowth: -5,
    realReturnAccessible: 0.05,
    realReturn401k: 0.04,
    saleProceedsReal: 0,
  });
  assert.equal(total, 200_000);
});

test('coastFundedTotal: non-finite balances degrade to 0, not NaN', () => {
  const total = coastFire.coastFundedTotal({
    accessibleReal: NaN,
    lockedReal: undefined,
    yearsOfGrowth: 5,
    realReturnAccessible: 0.05,
    realReturn401k: 0.04,
    saleProceedsReal: null,
  });
  assert.equal(total, 0);
});

test('coastFundedTotal: non-finite rates throw TypeError', () => {
  assert.throws(() => coastFire.coastFundedTotal({
    accessibleReal: 100,
    lockedReal: 0,
    yearsOfGrowth: 1,
    realReturnAccessible: NaN,
    realReturn401k: 0.04,
    saleProceedsReal: 0,
  }), TypeError);
});

// ---------------------------------------------------------------------------
// findCoastFireAge — "if I stop saving today, when could I retire?"
//
// NOT "when do I earn the right to coast". That question is unanswerable: your
// FIRE age is by definition the first year you hit the target WHILE STILL
// contributing, so dropping contributions can only push it later — the crossing
// never happens before the FIRE age. This module answers the reachable version.
// ---------------------------------------------------------------------------

test('findCoastFireAge: finds the earliest age where frozen savings meet that age target', () => {
  // Money frozen at 100k growing 10%/yr vs a target falling 10k/yr from 200k.
  const age = coastFire.findCoastFireAge({
    accessibleReal: 100_000,
    lockedReal: 0,
    currentAge: 40,
    maxAge: 60,
    realReturnAccessible: 0.10,
    realReturn401k: 0.10,
    targetTotalFor: (a) => 200_000 - (a - 40) * 10_000,
  });
  // 40:100k vs 200k, 41:110k vs 190k, 42:121k vs 180k, 43:133k vs 170k,
  // 44:146k vs 160k, 45:161k vs 150k ✓
  assert.equal(age, 45);
});

test('findCoastFireAge: returns the current age when already funded today', () => {
  const age = coastFire.findCoastFireAge({
    accessibleReal: 5_000_000,
    lockedReal: 0,
    currentAge: 43,
    maxAge: 80,
    realReturnAccessible: 0.05,
    realReturn401k: 0.04,
    targetTotalFor: () => 1_000_000,
  });
  assert.equal(age, 43);
});

test('findCoastFireAge: returns null when the target is never met by maxAge', () => {
  const age = coastFire.findCoastFireAge({
    accessibleReal: 1_000,
    lockedReal: 0,
    currentAge: 40,
    maxAge: 60,
    realReturnAccessible: 0.05,
    realReturn401k: 0.04,
    targetTotalFor: () => 10_000_000,
  });
  assert.equal(age, null);
});

test('findCoastFireAge: never scans past maxAge', () => {
  const seen = [];
  coastFire.findCoastFireAge({
    accessibleReal: 1_000,
    lockedReal: 0,
    currentAge: 40,
    maxAge: 45,
    realReturnAccessible: 0.05,
    realReturn401k: 0.04,
    targetTotalFor: (a) => { seen.push(a); return 10_000_000; },
  });
  assert.deepEqual(seen, [40, 41, 42, 43, 44, 45]);
});

test('findCoastFireAge: grows the two pools at their own rates', () => {
  // Locked pool must compound at realReturn401k, not the accessible rate.
  const args = {
    accessibleReal: 0,
    lockedReal: 100_000,
    currentAge: 40,
    maxAge: 60,
    realReturnAccessible: 0.99, // absurd, must be IGNORED for the locked pool
    realReturn401k: 0.05,
    targetTotalFor: () => 100_000 * Math.pow(1.05, 10),
  };
  assert.equal(coastFire.findCoastFireAge(args), 50);
});

test('findCoastFireAge: threads sale proceeds through the callback with years-from-now', () => {
  const seen = [];
  const age = coastFire.findCoastFireAge({
    accessibleReal: 100_000,
    lockedReal: 0,
    currentAge: 40,
    maxAge: 44,
    realReturnAccessible: 0,
    realReturn401k: 0,
    saleProceedsFor: (yearsFromNow) => { seen.push(yearsFromNow); return yearsFromNow * 50_000; },
    targetTotalFor: () => 250_000,
  });
  assert.equal(age, 43); // 100k + 3×50k = 250k
  assert.deepEqual(seen, [0, 1, 2, 3]);
});

test('findCoastFireAge: minAge skips ages the caller knows are impossible', () => {
  const seen = [];
  const age = coastFire.findCoastFireAge({
    accessibleReal: 100_000,
    lockedReal: 0,
    currentAge: 40,
    minAge: 50,
    maxAge: 60,
    realReturnAccessible: 0.05,
    realReturn401k: 0.04,
    targetTotalFor: (a) => { seen.push(a); return 1; },
  });
  assert.equal(age, 50, 'first scanned age wins');
  assert.equal(seen[0], 50, 'ages below minAge are never even priced');
});

test('findCoastFireAge: minAge below currentAge cannot drag the scan into the past', () => {
  const seen = [];
  coastFire.findCoastFireAge({
    accessibleReal: 1,
    lockedReal: 0,
    currentAge: 40,
    minAge: 20,
    maxAge: 42,
    realReturnAccessible: 0.05,
    realReturn401k: 0.04,
    targetTotalFor: (a) => { seen.push(a); return 1e9; },
  });
  assert.deepEqual(seen, [40, 41, 42]);
});

test('findCoastFireAge: growth origin stays currentAge even when minAge moves the scan', () => {
  // 100k frozen at 40, scanned from 50: the age-50 value must be 10 years of
  // growth from TODAY (162,889), not 0 years from the scan floor.
  const priced = [];
  coastFire.findCoastFireAge({
    accessibleReal: 100_000,
    lockedReal: 0,
    currentAge: 40,
    minAge: 50,
    maxAge: 50,
    realReturnAccessible: 0.05,
    realReturn401k: 0.04,
    saleProceedsFor: (yearsFromNow) => { priced.push(yearsFromNow); return 0; },
    targetTotalFor: () => 1e9,
  });
  assert.deepEqual(priced, [10], 'sale proceeds priced 10 years out, not 0');
});

test('findCoastFireAge: a throwing target callback propagates (callers guard, module stays honest)', () => {
  assert.throws(() => coastFire.findCoastFireAge({
    accessibleReal: 100_000,
    lockedReal: 0,
    currentAge: 40,
    maxAge: 60,
    realReturnAccessible: 0.05,
    realReturn401k: 0.04,
    targetTotalFor: () => { throw new Error('solver blew up'); },
  }), /solver blew up/);
});

test('findCoastFireAge: a missing target callback is a contract violation, not a silent null', () => {
  assert.throws(() => coastFire.findCoastFireAge({
    accessibleReal: 100_000,
    lockedReal: 0,
    currentAge: 40,
    maxAge: 60,
    realReturnAccessible: 0.05,
    realReturn401k: 0.04,
  }), TypeError);
});

test('findCoastFireAge: non-finite ages return null rather than looping', () => {
  const base = {
    accessibleReal: 100_000,
    lockedReal: 0,
    realReturnAccessible: 0.05,
    realReturn401k: 0.04,
    targetTotalFor: () => 1,
  };
  assert.equal(coastFire.findCoastFireAge({ ...base, currentAge: NaN, maxAge: 60 }), null);
  assert.equal(coastFire.findCoastFireAge({ ...base, currentAge: 40, maxAge: undefined }), null);
  assert.equal(coastFire.findCoastFireAge({ ...base, currentAge: 60, maxAge: 40 }), null);
});

// ---------------------------------------------------------------------------
// resolveShortlist — persisted pin list sanitiser
// ---------------------------------------------------------------------------

const VALID = ['us', 'taiwan', 'japan', 'thailand', 'vietnam', 'philippines', 'china'];
const FALLBACK = ['taiwan', 'japan'];

test('resolveShortlist: keeps known ids in the order the user pinned them', () => {
  assert.deepEqual(
    coastFire.resolveShortlist(['japan', 'taiwan', 'china'], VALID, FALLBACK),
    ['japan', 'taiwan', 'china'],
  );
});

test('resolveShortlist: drops unknown ids and de-duplicates', () => {
  assert.deepEqual(
    coastFire.resolveShortlist(['japan', 'atlantis', 'japan', 'china'], VALID, FALLBACK),
    ['japan', 'china'],
  );
});

test('resolveShortlist: a stored list of only-junk falls back rather than emptying', () => {
  assert.deepEqual(coastFire.resolveShortlist(['atlantis', 'narnia'], VALID, FALLBACK), FALLBACK);
});

test('resolveShortlist: missing / malformed storage falls back', () => {
  assert.deepEqual(coastFire.resolveShortlist(null, VALID, FALLBACK), FALLBACK);
  assert.deepEqual(coastFire.resolveShortlist(undefined, VALID, FALLBACK), FALLBACK);
  assert.deepEqual(coastFire.resolveShortlist('taiwan', VALID, FALLBACK), FALLBACK);
  assert.deepEqual(coastFire.resolveShortlist({ 0: 'taiwan' }, VALID, FALLBACK), FALLBACK);
  assert.deepEqual(coastFire.resolveShortlist([1, 2, 3], VALID, FALLBACK), FALLBACK);
});

test('resolveShortlist: an explicitly EMPTY list is honoured, not overridden', () => {
  // "I unpinned everything" is a real user state and must survive a reload —
  // the caller (not this module) decides that empty means "show all countries".
  assert.deepEqual(coastFire.resolveShortlist([], VALID, FALLBACK), []);
});

test('resolveShortlist: returns a fresh array; callers cannot mutate the fallback', () => {
  const out = coastFire.resolveShortlist(null, VALID, FALLBACK);
  out.push('china');
  assert.deepEqual(FALLBACK, ['taiwan', 'japan'], 'fallback was mutated by a caller');
});
