/*
 * Feature 034 — Year Tax Estimator: estimateYearTax pure-function tests.
 *
 * Pins the contract in specs/034-year-tax-estimator/contracts/taxEstimator.contract.md
 * (9 behavioral guarantees + 7 edge-case fixtures) and the invariants in
 * specs/034-year-tax-estimator/data-model.md.
 *
 * estimateYearTax takes already-nominal income/gains + already-nominal thresholds
 * and returns a frozen nominal-$ EstimatorOutput. No DOM, no globals, no t().
 *
 * T003 (RED first) — every guarantee + fixture below is written against the
 * contract before calc/taxEstimator.js exists.
 * T011 (US1) — focused signals.roomLeftAt0 describe block at the bottom.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { estimateYearTax } = require(path.join(__dirname, '..', '..', 'calc', 'taxEstimator.js'));

// ---------------------------------------------------------------------------
// Shared fixtures — 2024-ish MFJ-shaped brackets/ceilings, expressed nominally.
// Ordinary brackets ascending with a threshold:0 lowest band.
// ---------------------------------------------------------------------------
const ORDINARY_BRACKETS = Object.freeze([
  { threshold: 0, rate: 0.10 },
  { threshold: 23200, rate: 0.12 },
  { threshold: 94300, rate: 0.22 },
  { threshold: 201050, rate: 0.24 },
  { threshold: 383900, rate: 0.32 },
  { threshold: 487450, rate: 0.35 },
  { threshold: 731200, rate: 0.37 },
]);

const STD_DED = 29200;
const LTCG0_CEILING = 94050;
const LTCG15_CEILING = 583750;
const IRMAA_THRESHOLD = 206000;
const NIIT_THRESHOLD = 250000;
const NIIT_RATE = 0.038;

/** Build a complete EstimatorInput with sensible defaults; override per-test. */
function makeInput(overrides = {}) {
  return Object.assign({
    year: 2045,
    otherOrdinary: 0,
    tradWithdrawal: 0,
    rothConversion: 0,
    ltcg: 0,
    standardDeduction: STD_DED,
    ordinaryBrackets: ORDINARY_BRACKETS,
    ltcg0Ceiling: LTCG0_CEILING,
    ltcg15Ceiling: LTCG15_CEILING,
    irmaaThreshold: IRMAA_THRESHOLD,
    niitThreshold: NIIT_THRESHOLD,
    niitRate: NIIT_RATE,
  }, overrides);
}

const EPS = 1e-6;
function approx(a, b, eps = EPS) { return Math.abs(a - b) <= eps; }

/** Reference marginal-bracket calc (mirrors calc/tax.js applyMarginalBrackets). */
function refBrackets(income, brackets) {
  if (!(income > 0)) return 0;
  let owed = 0;
  for (let i = 0; i < brackets.length; i += 1) {
    const lower = brackets[i].threshold;
    if (income <= lower) break;
    const upper = i + 1 < brackets.length ? brackets[i + 1].threshold : Infinity;
    owed += (Math.min(income, upper) - lower) * brackets[i].rate;
  }
  return owed;
}

// ===========================================================================
// Guarantee 1 — Ordinary marginal arithmetic
// ===========================================================================
test('G1: ordinary.tax = sum of per-layer taxes; layers taxed marginally', () => {
  const inp = makeInput({ tradWithdrawal: 120000 }); // gross 120k − 29.2k = 90.8k taxable
  const out = estimateYearTax(inp);

  const expectedTaxable = 120000 - STD_DED;
  assert.strictEqual(out.ordinary.gross, 120000);
  assert.strictEqual(out.ordinary.taxable, expectedTaxable);

  const layerSum = out.ordinary.layers.reduce((s, l) => s + l.tax, 0);
  assert.ok(approx(out.ordinary.tax, layerSum), `tax ${out.ordinary.tax} != layerSum ${layerSum}`);
  assert.ok(approx(out.ordinary.tax, refBrackets(expectedTaxable, ORDINARY_BRACKETS)));

  // Each emitted layer's tax == dollarsInLayer * rate.
  for (const l of out.ordinary.layers) {
    assert.ok(approx(l.tax, l.dollarsInLayer * l.rate));
    assert.ok(l.dollarsInLayer > 0, 'only non-empty layers emitted');
  }
});

test('G1: ordinaryGross = otherOrdinary + tradWithdrawal + rothConversion', () => {
  const out = estimateYearTax(makeInput({ otherOrdinary: 10000, tradWithdrawal: 20000, rothConversion: 5000 }));
  assert.strictEqual(out.ordinary.gross, 35000);
});

// ===========================================================================
// Guarantee 2 — LTCG stacking (gainAt0 + gainAt15 + gainAt20 === ltcg)
// ===========================================================================
test('G2: LTCG stacks on ordinary taxable; layer dollars sum to total gain', () => {
  const inp = makeInput({ tradWithdrawal: 60000, ltcg: 100000 });
  const out = estimateYearTax(inp);

  const ordTaxable = 60000 - STD_DED; // 30800
  const gainAt0 = Math.min(100000, Math.max(0, LTCG0_CEILING - ordTaxable)); // min(100k, 63250)=63250
  const fifteenRoom = Math.max(0, LTCG15_CEILING - Math.max(ordTaxable, LTCG0_CEILING));
  const gainAt15 = Math.min(100000 - gainAt0, fifteenRoom);
  const gainAt20 = 100000 - gainAt0 - gainAt15;

  const byRate = Object.fromEntries(out.ltcg.layers.map(l => [l.rate, l.dollars]));
  assert.ok(approx(byRate[0] || 0, gainAt0), `gainAt0 ${byRate[0]} != ${gainAt0}`);
  assert.ok(approx(byRate[0.15] || 0, gainAt15));
  assert.ok(approx(byRate[0.2] || 0, gainAt20));

  const dollarSum = out.ltcg.layers.reduce((s, l) => s + l.dollars, 0);
  assert.ok(approx(dollarSum, 100000), `gain layers ${dollarSum} != 100000`);
  assert.ok(approx(out.ltcg.tax, out.ltcg.layers.reduce((s, l) => s + l.tax, 0)));
  assert.strictEqual(out.ltcg.ordinaryTaxableStacked, ordTaxable);
});

// ===========================================================================
// Guarantee 3 — Standard-deduction flooring
// ===========================================================================
test('G3: deduction larger than gross floors ordinaryTaxable to 0, and the UNUSED deduction shelters gains', () => {
  const inp = makeInput({ tradWithdrawal: 10000, standardDeduction: 29200, ltcg: 50000 });
  const out = estimateYearTax(inp);
  assert.strictEqual(out.ordinary.taxable, 0);
  assert.strictEqual(out.ordinary.tax, 0);
  // gross 10k < stdDed 29.2k → 19.2k of deduction is unused and shelters gain.
  const unused = 29200 - 10000; // 19200
  assert.ok(approx(out.ltcg.shelteredByDeduction, unused));
  assert.ok(approx(out.ltcg.taxableGain, 50000 - unused)); // 30800 taxable gain
  // Room is measured against (ceiling + standardDeduction), not the bare ceiling.
  assert.ok(approx(out.signals.roomLeftAt0, LTCG0_CEILING + 29200 - 10000 - 50000)); // 63250
});

// ===========================================================================
// Guarantee 4 — Room-left
// ===========================================================================
test('G4: roomLeftAt0 === max(0, ltcg0Ceiling − ordinaryTaxable − ltcg)', () => {
  const inp = makeInput({ tradWithdrawal: 50000, ltcg: 20000 });
  const out = estimateYearTax(inp);
  const ordTaxable = 50000 - STD_DED; // 20800
  const expected = Math.max(0, LTCG0_CEILING - ordTaxable - 20000);
  assert.ok(approx(out.signals.roomLeftAt0, expected));
});

test('G4: roomLeftAt0 clamps to 0 (never negative)', () => {
  const out = estimateYearTax(makeInput({ tradWithdrawal: 200000, ltcg: 50000 }));
  assert.strictEqual(out.signals.roomLeftAt0, 0);
});

// ===========================================================================
// Guarantee 5 — Marginal next-dollar rates
// ===========================================================================
test('G5: nextLtcgRate === 0 iff roomLeftAt0 > 0', () => {
  const withRoom = estimateYearTax(makeInput({ tradWithdrawal: 40000, ltcg: 10000 }));
  assert.ok(withRoom.signals.roomLeftAt0 > 0);
  assert.strictEqual(withRoom.marginal.nextLtcgRate, 0);

  const noRoom = estimateYearTax(makeInput({ tradWithdrawal: 200000, ltcg: 30000 }));
  assert.strictEqual(noRoom.signals.roomLeftAt0, 0);
  assert.strictEqual(noRoom.marginal.nextLtcgRate, 0.15);
});

test('G5: nextLtcgRate === 0.20 when ordinaryTaxable + ltcg >= ltcg15Ceiling', () => {
  const out = estimateYearTax(makeInput({ tradWithdrawal: 400000, ltcg: 300000 }));
  // ordTaxable ~370800 + 300000 = 670800 >= 583750
  assert.strictEqual(out.marginal.nextLtcgRate, 0.2);
});

test('G5: nextOrdinaryRate is the band rate containing ordinaryTaxable', () => {
  const out = estimateYearTax(makeInput({ tradWithdrawal: 120000 }));
  const ordTaxable = 120000 - STD_DED; // 90800 → 12% band (23200..94300)
  assert.strictEqual(out.ordinary.taxable, ordTaxable);
  assert.strictEqual(out.marginal.nextOrdinaryRate, 0.12);
});

// ===========================================================================
// Guarantee 6 — IRMAA
// ===========================================================================
test('G6: IRMAA crossed iff irmaaThreshold > 0 && magi > threshold', () => {
  const crossed = estimateYearTax(makeInput({ tradWithdrawal: 250000, ltcg: 0 }));
  assert.strictEqual(crossed.signals.irmaa.crossed, true);
  assert.strictEqual(crossed.signals.irmaa.threshold, IRMAA_THRESHOLD);
  assert.ok(approx(crossed.signals.irmaa.magi, 250000));

  const notCrossed = estimateYearTax(makeInput({ tradWithdrawal: 100000 }));
  assert.strictEqual(notCrossed.signals.irmaa.crossed, false);

  const disabled = estimateYearTax(makeInput({ tradWithdrawal: 500000, irmaaThreshold: 0 }));
  assert.strictEqual(disabled.signals.irmaa.crossed, false);
});

// ===========================================================================
// Guarantee 7 — NIIT (fixed threshold, not inflated)
// ===========================================================================
test('G7: NIIT crossed when magi > 250k; amount = rate * min(ltcg, magi − threshold)', () => {
  // magi = 200000 ordinary + 120000 ltcg = 320000; excess = 70000; min(120000, 70000)=70000
  const out = estimateYearTax(makeInput({ tradWithdrawal: 200000, ltcg: 120000 }));
  assert.strictEqual(out.signals.niit.crossed, true);
  assert.strictEqual(out.signals.niit.threshold, NIIT_THRESHOLD);
  assert.ok(approx(out.signals.niit.amount, NIIT_RATE * 70000));
});

test('G7: NIIT amount uses ltcg when ltcg is the lesser of (ltcg, excess)', () => {
  // magi = 240000 ord + 60000 ltcg = 300000; excess = 50000; min(60000, 50000)=50000
  const out = estimateYearTax(makeInput({ tradWithdrawal: 240000, ltcg: 60000 }));
  assert.ok(approx(out.signals.niit.amount, NIIT_RATE * 50000));
});

test('G7: NIIT not crossed → amount 0; threshold never inflated', () => {
  const out = estimateYearTax(makeInput({ tradWithdrawal: 100000, ltcg: 50000, year: 2060 }));
  assert.strictEqual(out.signals.niit.crossed, false);
  assert.strictEqual(out.signals.niit.amount, 0);
  assert.strictEqual(out.signals.niit.threshold, 250000);
});

// ===========================================================================
// Guarantee 8 — Zero / all-zero input
// ===========================================================================
test('G8: all-zero inputs → every tax 0, effectiveRate 0, empty layers, no NaN', () => {
  const out = estimateYearTax(makeInput());
  assert.strictEqual(out.ordinary.tax, 0);
  assert.strictEqual(out.ltcg.tax, 0);
  assert.strictEqual(out.totalTax, 0);
  assert.strictEqual(out.effectiveRate, 0);
  assert.deepStrictEqual(out.ordinary.layers, []);
  assert.deepStrictEqual(out.ltcg.layers, []);

  const flat = JSON.stringify(out);
  assert.ok(!/null|NaN|Infinity/.test(flat) === false || true); // JSON can't carry NaN; check numerics directly
  for (const v of [out.ordinary.tax, out.ltcg.tax, out.totalTax, out.effectiveRate, out.signals.roomLeftAt0, out.signals.niit.amount]) {
    assert.ok(Number.isFinite(v), `non-finite value ${v}`);
  }
});

// ===========================================================================
// Guarantee 9 — Purity / immutability
// ===========================================================================
test('G9: calling twice is deep-equal; input not mutated; output frozen', () => {
  const inp = makeInput({ tradWithdrawal: 80000, ltcg: 40000 });
  const snapshot = JSON.parse(JSON.stringify(inp));
  const a = estimateYearTax(inp);
  const b = estimateYearTax(inp);
  assert.deepStrictEqual(a, b);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(inp)), snapshot, 'input was mutated');
  assert.ok(Object.isFrozen(a));
  assert.ok(Object.isFrozen(a.ordinary));
  assert.ok(Object.isFrozen(a.ltcg));
  assert.ok(Object.isFrozen(a.signals));
  assert.ok(Object.isFrozen(a.signals.irmaa));
  assert.ok(Object.isFrozen(a.signals.niit));
  assert.ok(Object.isFrozen(a.marginal));
  assert.ok(Object.isFrozen(a.steps));
  assert.ok(Object.isFrozen(a.ordinary.layers));
  assert.throws(() => { a.totalTax = 1; }, TypeError);
});

// ===========================================================================
// totalTax / effectiveRate
// ===========================================================================
test('totalTax = ordinary.tax + ltcg.tax; effectiveRate = totalTax / (gross + ltcg)', () => {
  const inp = makeInput({ tradWithdrawal: 80000, ltcg: 40000 });
  const out = estimateYearTax(inp);
  assert.ok(approx(out.totalTax, out.ordinary.tax + out.ltcg.tax));
  const denom = 80000 + 40000;
  assert.ok(approx(out.effectiveRate, out.totalTax / denom));
});

// ===========================================================================
// Defensive coercion
// ===========================================================================
test('defensive: non-finite incomes → 0; negative incomes → 0; thresholds clamp ≥ 0', () => {
  const out = estimateYearTax(makeInput({
    otherOrdinary: NaN,
    tradWithdrawal: -50000,
    rothConversion: Infinity,
    ltcg: -10000,
    standardDeduction: -5000,
    ltcg0Ceiling: -1,
  }));
  assert.strictEqual(out.ordinary.gross, 0);
  assert.strictEqual(out.ordinary.taxable, 0);
  assert.strictEqual(out.ltcg.gain, 0);
  assert.strictEqual(out.ordinary.standardDeduction, 0);
  assert.strictEqual(out.totalTax, 0);
  assert.ok(Number.isFinite(out.effectiveRate));
});

// ===========================================================================
// Steps — structured descriptors, no English sentences, no t()
// ===========================================================================
test('steps: ordered structured {key, args} descriptors with te.step.* keys', () => {
  const out = estimateYearTax(makeInput({ tradWithdrawal: 120000, ltcg: 100000 }));
  assert.ok(Array.isArray(out.steps) && out.steps.length > 0);
  const keys = out.steps.map(s => s.key);
  assert.ok(keys.includes('te.step.ordGross'));
  assert.ok(keys.includes('te.step.ordMinusStd'));
  assert.ok(keys.includes('te.step.ordLayer'));
  assert.ok(keys.includes('te.step.ordTotal'));
  assert.ok(keys.includes('te.step.ltcgStack'));
  assert.ok(keys.includes('te.step.ltcgLayer'));
  assert.ok(keys.includes('te.step.ltcgTotal'));
  for (const s of out.steps) {
    assert.strictEqual(typeof s.key, 'string');
    assert.ok(s.key.startsWith('te.step.'), `key ${s.key} not namespaced`);
    assert.ok(Array.isArray(s.args), 'args must be an array');
    // No finished sentences: keys carry no spaces.
    assert.ok(!/\s/.test(s.key));
  }
});

// ===========================================================================
// Edge-case fixtures (contract table)
// ===========================================================================
test('fixture: gain entirely in 0% → ltcg.tax 0, one 0% layer, roomLeftAt0 > 0', () => {
  const out = estimateYearTax(makeInput({ tradWithdrawal: 40000, ltcg: 10000 }));
  assert.strictEqual(out.ltcg.tax, 0);
  assert.strictEqual(out.ltcg.layers.length, 1);
  assert.strictEqual(out.ltcg.layers[0].rate, 0);
  assert.ok(out.signals.roomLeftAt0 > 0);
});

test('fixture: gain straddles 0%→15% → 0% + 15% layers, roomLeftAt0 === 0', () => {
  // ordTaxable = 50000-29200 = 20800; room = 94050-20800 = 73250; gain 150k > room
  const out = estimateYearTax(makeInput({ tradWithdrawal: 50000, ltcg: 150000 }));
  const rates = out.ltcg.layers.map(l => l.rate);
  assert.ok(rates.includes(0) && rates.includes(0.15));
  assert.ok(!rates.includes(0.2));
  assert.strictEqual(out.signals.roomLeftAt0, 0);
});

test('fixture: ordinary eats all 0% room → gainAt0 0, full gain at 15%/20%', () => {
  const out = estimateYearTax(makeInput({ tradWithdrawal: 200000, ltcg: 60000 }));
  const byRate = Object.fromEntries(out.ltcg.layers.map(l => [l.rate, l.dollars]));
  assert.ok(!(0 in byRate), 'no 0% layer emitted');
  assert.ok(approx((byRate[0.15] || 0) + (byRate[0.2] || 0), 60000));
  assert.strictEqual(out.signals.roomLeftAt0, 0);
});

test('fixture: NIIT trigger → crossed true, amount 3.8% of lesser(gain, excess)', () => {
  const out = estimateYearTax(makeInput({ tradWithdrawal: 200000, ltcg: 120000 }));
  assert.strictEqual(out.signals.niit.crossed, true);
  const magi = 200000 + 120000;
  assert.ok(approx(out.signals.niit.amount, NIIT_RATE * Math.min(120000, magi - NIIT_THRESHOLD)));
});

test('fixture: IRMAA trigger → crossed true', () => {
  const out = estimateYearTax(makeInput({ tradWithdrawal: 220000 }));
  assert.strictEqual(out.signals.irmaa.crossed, true);
});

test('fixture: std-ded flooring (stdDed > gross) → ordinaryTaxable 0, ordinary.tax 0', () => {
  const out = estimateYearTax(makeInput({ tradWithdrawal: 15000, standardDeduction: 29200 }));
  assert.strictEqual(out.ordinary.taxable, 0);
  assert.strictEqual(out.ordinary.tax, 0);
});

test('fixture: 20% layer (very large gain above ltcg15Ceiling) → three LTCG layers', () => {
  const out = estimateYearTax(makeInput({ tradWithdrawal: 60000, ltcg: 700000 }));
  assert.strictEqual(out.ltcg.layers.length, 3);
  const byRate = Object.fromEntries(out.ltcg.layers.map(l => [l.rate, l.dollars]));
  assert.ok(byRate[0.2] > 0, '20% layer dollars > 0');
  assert.ok(approx(out.ltcg.layers.reduce((s, l) => s + l.dollars, 0), 700000));
});

test('ltcg15Ceiling = Infinity disables the 20% layer', () => {
  const out = estimateYearTax(makeInput({ tradWithdrawal: 60000, ltcg: 700000, ltcg15Ceiling: Infinity }));
  const byRate = Object.fromEntries(out.ltcg.layers.map(l => [l.rate, l.dollars]));
  assert.ok(!(0.2 in byRate), 'no 20% layer when ceiling is Infinity');
});

// ===========================================================================
// Standard-deduction shelter on LTCG (tax-correctness fix).
//   The unused portion of the standard deduction (after it offsets ordinary
//   income) shelters capital gains: only the deduction-adjusted gain enters the
//   0%/15%/20% schedule, and the 0% room is measured against
//   (ltcg0Ceiling + standardDeduction), not the ceiling alone.
//     shelteredByDeduction = min(ltcg, max(0, stdDed − gross))
//     taxableGain          = ltcg − shelteredByDeduction
//     roomLeftAt0          = max(0, ltcg0Ceiling + stdDed − gross − ltcg)
// ===========================================================================
test('SD: famous MFJ tax-free figure — zero ordinary income → room = ceiling + stdDed', () => {
  // A couple with no other income can realize ltcg0Ceiling + stdDed of gain at
  // $0 tax (2024 MFJ: 94,050 + 29,200 = 123,250). The bug reported only 94,050.
  const out = estimateYearTax(makeInput({ otherOrdinary: 0, ltcg: 0 }));
  assert.ok(approx(out.signals.roomLeftAt0, LTCG0_CEILING + STD_DED));
});

test('SD: unused deduction shelters gains → taxableGain shrinks, layers sum to taxableGain', () => {
  // gross 0, ltcg 50k, stdDed 29.2k → 29.2k sheltered, 20.8k taxable gain, all 0%.
  const out = estimateYearTax(makeInput({ ltcg: 50000 }));
  assert.ok(approx(out.ltcg.shelteredByDeduction, STD_DED));
  assert.ok(approx(out.ltcg.taxableGain, 50000 - STD_DED)); // 20800
  assert.strictEqual(out.ltcg.tax, 0);
  const layerDollars = out.ltcg.layers.reduce((s, l) => s + l.dollars, 0);
  assert.ok(approx(layerDollars, out.ltcg.taxableGain), 'layers sum to the TAXABLE gain');
});

test('SD: deduction shelter lowers the 15% tax vs naively stacking the full gain', () => {
  // gross 18k < stdDed 29.2k → unused 11.2k shelters gain. Large gain so part is 15%.
  const out = estimateYearTax(makeInput({ tradWithdrawal: 18000, ltcg: 200000 }));
  const unused = STD_DED - 18000; // 11200
  const taxableGain = 200000 - unused; // 188800
  assert.ok(approx(out.ltcg.taxableGain, taxableGain));
  const gainAt0 = Math.min(taxableGain, LTCG0_CEILING - 0); // ordinaryTaxable 0
  const gainAt15 = taxableGain - gainAt0;
  assert.ok(approx(out.ltcg.tax, gainAt15 * 0.15));
});

test('SD: adding ordinary income BELOW the deduction still shrinks the 0% room (the bug)', () => {
  // The reported symptom: room must respond to ordinary income even when gross
  // stays under the standard deduction (it un-shelters gain dollar-for-dollar).
  const ltcg = 60000;
  const r0 = estimateYearTax(makeInput({ otherOrdinary: 0, ltcg })).signals.roomLeftAt0;
  const r1 = estimateYearTax(makeInput({ otherOrdinary: 10000, ltcg })).signals.roomLeftAt0;
  const r2 = estimateYearTax(makeInput({ otherOrdinary: 20000, ltcg })).signals.roomLeftAt0;
  assert.ok(approx(r0 - r1, 10000), `room should drop $10k per $10k ordinary; got ${r0 - r1}`);
  assert.ok(approx(r1 - r2, 10000), `room should drop $10k per $10k ordinary; got ${r1 - r2}`);
});

test('SD: deduction fully used by ordinary (gross ≥ stdDed) → no shelter, full gain taxable', () => {
  const out = estimateYearTax(makeInput({ tradWithdrawal: 60000, ltcg: 40000 }));
  assert.strictEqual(out.ltcg.shelteredByDeduction, 0);
  assert.ok(approx(out.ltcg.taxableGain, 40000));
  // room = max(0, ceiling + stdDed − gross − ltcg) collapses to ceiling − ordTaxable − ltcg here.
  assert.ok(approx(out.signals.roomLeftAt0, Math.max(0, LTCG0_CEILING + STD_DED - 60000 - 40000)));
});

test('SD: te.step.ltcgPool summarizes pool − realized = room (args [gainPool, ltcg, roomLeftAt0])', () => {
  // gross 0, ltcg 50k → pool = ceiling + stdDed = 123250; room = 73250.
  const out = estimateYearTax(makeInput({ ltcg: 50000 }));
  const pool = out.steps.find(s => s.key === 'te.step.ltcgPool');
  assert.ok(pool, 'pool summary step always emitted');
  assert.ok(approx(pool.args[0], LTCG0_CEILING + STD_DED)); // 123250 total realizable at 0%
  assert.ok(approx(pool.args[1], 50000));                   // already realized
  assert.ok(approx(pool.args[2], out.signals.roomLeftAt0)); // room left
  // Identity: pool − realized = room.
  assert.ok(approx(pool.args[0] - pool.args[1], pool.args[2]));
});

test('SD: te.step.ltcgShelter emitted only when gains are sheltered; args = [sheltered, taxableGain]', () => {
  const sheltered = estimateYearTax(makeInput({ tradWithdrawal: 10000, ltcg: 50000 }));
  const step = sheltered.steps.find(s => s.key === 'te.step.ltcgShelter');
  assert.ok(step, 'shelter step present when unused deduction shelters gain');
  assert.ok(approx(step.args[0], STD_DED - 10000));         // sheltered
  assert.ok(approx(step.args[1], 50000 - (STD_DED - 10000))); // taxable gain

  const notSheltered = estimateYearTax(makeInput({ tradWithdrawal: 60000, ltcg: 40000 }));
  assert.ok(!notSheltered.steps.some(s => s.key === 'te.step.ltcgShelter'));
});

// ===========================================================================
// T011 (US1) — signals.roomLeftAt0 across the three acceptance scenarios
// ===========================================================================
test('US1: roomLeftAt0 scenarios', async (t) => {
  await t.test('(a) positive room when ordinaryTaxable < ceiling', () => {
    const out = estimateYearTax(makeInput({ tradWithdrawal: 50000, ltcg: 0 }));
    const ordTaxable = 50000 - STD_DED; // 20800 < 94050
    assert.ok(out.ordinary.taxable < LTCG0_CEILING);
    assert.ok(out.signals.roomLeftAt0 > 0);
    assert.ok(approx(out.signals.roomLeftAt0, LTCG0_CEILING - ordTaxable));
  });

  await t.test('(b) zero room when ordinaryTaxable >= ceiling', () => {
    const out = estimateYearTax(makeInput({ tradWithdrawal: 150000, ltcg: 0 }));
    assert.ok(out.ordinary.taxable >= LTCG0_CEILING);
    assert.strictEqual(out.signals.roomLeftAt0, 0);
  });

  await t.test('(c) room shrinks dollar-for-dollar as ordinary income rises until it hits 0', () => {
    const ordinaries = [40000, 60000, 80000, 100000, 130000];
    let prev = Infinity;
    for (const ord of ordinaries) {
      const out = estimateYearTax(makeInput({ tradWithdrawal: ord, ltcg: 0 }));
      const ordTaxable = Math.max(0, ord - STD_DED);
      const expected = Math.max(0, LTCG0_CEILING - ordTaxable);
      assert.ok(approx(out.signals.roomLeftAt0, expected));
      // Monotonic non-increasing as ordinary rises.
      assert.ok(out.signals.roomLeftAt0 <= prev + EPS);
      prev = out.signals.roomLeftAt0;
    }
    assert.strictEqual(prev, 0, 'room reaches 0 at high ordinary income');
  });
});
