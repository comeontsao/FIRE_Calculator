/*
 * calc/taxEstimator.js — Year Tax Estimator (feature 034).
 *
 * Pure, frame-agnostic single-year federal tax estimate with LTCG stacking,
 * 0%/15%/20% capital-gains schedule, and IRMAA / NIIT signals. SEPARATE from
 * calc/tax.js computeTax: that module deliberately taxes LTCG on its own
 * schedule with NO stacking and NO standard deduction (a documented FIRE-
 * projection simplification consumed by the withdrawal engine). This module
 * does the honest stacking the user reasons about — it does NOT replace
 * computeTax and does NOT touch it.
 *
 * Inputs (EstimatorInput — see specs/034-year-tax-estimator/data-model.md):
 *   {
 *     year:              integer  — label only; math is frame-agnostic
 *     otherOrdinary:     number ≥ 0  — taxable SS portion + taxable interest
 *     tradWithdrawal:    number ≥ 0  — Traditional 401k/IRA draw (ordinary)
 *     rothConversion:    number ≥ 0  — Roth conversion (ordinary)
 *     ltcg:              number ≥ 0  — realized long-term capital gain
 *     standardDeduction: number ≥ 0
 *     ordinaryBrackets:  { threshold:number, rate:number }[]  — ascending, threshold:0 lowest
 *     ltcg0Ceiling:      number ≥ 0  — top of the 0% LTCG band
 *     ltcg15Ceiling:     number ≥ 0  — 15%→20% breakpoint (Infinity disables 20% layer)
 *     irmaaThreshold:    number ≥ 0  — IRMAA Tier 1 MAGI threshold (0 disables flag)
 *     niitThreshold:     number ≥ 0  — NIIT MAGI threshold, caller-supplied FIXED $250k (NOT inflated here)
 *     niitRate:          number     — 0.038
 *   }
 *   Defensive coercion: non-finite → 0; negative incomes → 0; thresholds clamp to ≥ 0.
 *
 * Outputs (EstimatorOutput — deeply frozen):
 *   {
 *     ordinary: { gross, standardDeduction, taxable, layers[], tax },
 *     ltcg:     { gain, shelteredByDeduction, taxableGain, ordinaryTaxableStacked, layers[], tax },
 *     signals:  { roomLeftAt0, irmaa:{crossed,threshold,magi}, niit:{crossed,threshold,amount} },
 *     marginal: { nextOrdinaryRate, nextLtcgRate },
 *     totalTax, effectiveRate,
 *     steps:    { key:string, args:(string|number)[] }[]  — structured descriptors, NOT sentences
 *   }
 *
 * Consumers (Constitution VI):
 *   - renderYearTaxEstimator() in FIRE-Dashboard.html (RR only) — the sole UI consumer.
 *   - tests/unit/taxEstimator.test.js — regression pin.
 *   (FIRE-Dashboard-Generic.html loads the <script> for calc-layer lockstep but does
 *    NOT consume it — documented Principle-I divergence.)
 *
 * FRAME: nominal-$ (caller-supplied; conversion upstream in renderer via inflation.js).
 *   This module performs NO real↔nominal conversion (FR-017 single-conversion-site rule).
 *
 * Purity: no DOM, no Chart.js, no globals read, no localStorage, no t(), no module-scope mutation.
 */

'use strict';

/** Coerce to a finite number; non-finite → 0. */
function _num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Income field: non-finite → 0, negative → 0. */
function _income(v) {
  const n = _num(v);
  return n > 0 ? n : 0;
}

/** Threshold field: non-finite → 0, negative → 0; Infinity preserved (disables a layer). */
function _threshold(v) {
  const n = Number(v);
  if (n === Infinity) return Infinity;
  if (!Number.isFinite(n)) return 0;
  return n > 0 ? n : 0;
}

/**
 * Apply marginal brackets to a non-negative taxable income, emitting a per-layer
 * breakdown. Mirrors calc/tax.js applyMarginalBrackets; brackets ascending with a
 * threshold:0 lowest band. Only layers with dollarsInLayer > 0 are emitted.
 *
 * @returns {{ layers: object[], tax: number, topRate: number }}
 */
function _ordinaryLayers(income, brackets) {
  const layers = [];
  let tax = 0;
  let topRate = 0;
  if (!Array.isArray(brackets) || brackets.length === 0 || !(income > 0)) {
    return { layers, tax, topRate };
  }
  for (let i = 0; i < brackets.length; i += 1) {
    const lower = _num(brackets[i].threshold);
    if (income <= lower) break;
    const rate = _num(brackets[i].rate);
    const upper = i + 1 < brackets.length ? _num(brackets[i + 1].threshold) : Infinity;
    const dollarsInLayer = Math.min(income, upper) - lower;
    if (dollarsInLayer > 0) {
      const layerTax = dollarsInLayer * rate;
      layers.push(Object.freeze({
        lowerThreshold: lower,
        upperThreshold: upper,
        dollarsInLayer: dollarsInLayer,
        rate: rate,
        tax: layerTax,
      }));
      tax += layerTax;
      topRate = rate;
    }
  }
  return { layers, tax, topRate };
}

/** Rate of the bracket band that contains `taxable` (the next ordinary dollar's rate). */
function _bandRate(taxable, brackets) {
  if (!Array.isArray(brackets) || brackets.length === 0) return 0;
  let rate = _num(brackets[0].rate);
  for (let i = 0; i < brackets.length; i += 1) {
    if (taxable >= _num(brackets[i].threshold)) {
      rate = _num(brackets[i].rate);
    } else {
      break;
    }
  }
  return rate;
}

/**
 * Estimate a single year's federal tax with LTCG stacking.
 * @param {object} params EstimatorInput
 * @returns {object} frozen EstimatorOutput
 */
function estimateYearTax(params) {
  const p = params || {};

  // --- Coerce inputs (defensive boundary) ---
  const otherOrdinary = _income(p.otherOrdinary);
  const tradWithdrawal = _income(p.tradWithdrawal);
  const rothConversion = _income(p.rothConversion);
  const ltcg = _income(p.ltcg);
  const standardDeduction = _threshold(p.standardDeduction);
  const ordinaryBrackets = Array.isArray(p.ordinaryBrackets) ? p.ordinaryBrackets : [];
  const ltcg0Ceiling = _threshold(p.ltcg0Ceiling);
  const ltcg15Ceiling = _threshold(p.ltcg15Ceiling);
  const irmaaThreshold = _threshold(p.irmaaThreshold);
  const niitThreshold = _threshold(p.niitThreshold);
  const niitRate = _num(p.niitRate);

  // --- Ordinary income ---
  const gross = otherOrdinary + tradWithdrawal + rothConversion;
  const taxable = Math.max(0, gross - standardDeduction);
  const ord = _ordinaryLayers(taxable, ordinaryBrackets);

  // --- Standard-deduction shelter on LTCG ---
  // The standard deduction reduces TOTAL taxable income (ordinary + gains). It
  // offsets ordinary income first; any portion NOT used by ordinary income then
  // shelters capital gains (they simply aren't taxable). Only the deduction-
  // adjusted gain enters the 0%/15%/20% schedule. This is why a MFJ couple with
  // no other income can realize ltcg0Ceiling + standardDeduction of gain at $0
  // federal tax (e.g. 2024: $94,050 + $29,200 = $123,250), not just the ceiling.
  const unusedDeduction = Math.max(0, standardDeduction - gross);
  const shelteredGain = Math.min(ltcg, unusedDeduction);
  const taxableGain = ltcg - shelteredGain; // = max(0, ltcg − unusedDeduction)

  // --- LTCG stacking (research D1) — the TAXABLE gain stacks on ordinary taxable. ---
  const zeroRoom = Math.max(0, ltcg0Ceiling - taxable);
  const gainAt0 = Math.min(taxableGain, zeroRoom);
  const fifteenRoom = Math.max(0, ltcg15Ceiling - Math.max(taxable, ltcg0Ceiling));
  const gainAt15 = Math.min(taxableGain - gainAt0, fifteenRoom);
  const gainAt20 = Math.max(0, taxableGain - gainAt0 - gainAt15);

  const ltcgLayers = [];
  if (gainAt0 > 0) ltcgLayers.push(Object.freeze({ rate: 0.00, dollars: gainAt0, tax: 0 }));
  if (gainAt15 > 0) ltcgLayers.push(Object.freeze({ rate: 0.15, dollars: gainAt15, tax: gainAt15 * 0.15 }));
  if (gainAt20 > 0) ltcgLayers.push(Object.freeze({ rate: 0.20, dollars: gainAt20, tax: gainAt20 * 0.20 }));
  const ltcgTax = ltcgLayers.reduce((s, l) => s + l.tax, 0);

  // --- Signals ---
  // Additional LONG-TERM GAIN that can still be realized this year at 0% federal
  // tax. Because the unused standard deduction shelters gains, this is measured
  // against (ceiling + standardDeduction), not the ceiling alone — and it shrinks
  // dollar-for-dollar as EITHER gains OR ordinary income rise (every added dollar
  // of either lifts total taxable income toward the ceiling).
  const roomLeftAt0 = Math.max(0, ltcg0Ceiling + standardDeduction - gross - ltcg);
  // Total long-term gain realizable at 0% this year given current ordinary income
  // (the "0% pool"): the ceiling plus whatever standard deduction the ordinary
  // income doesn't consume. roomLeftAt0 = gainPool − ltcg already realized.
  const gainPool = Math.max(0, ltcg0Ceiling + standardDeduction - gross);
  const magi = gross + ltcg;

  const irmaaCrossed = irmaaThreshold > 0 && magi > irmaaThreshold;
  const niitCrossed = magi > niitThreshold;
  const niitAmount = niitCrossed ? niitRate * Math.min(ltcg, magi - niitThreshold) : 0;

  // --- Marginal next-dollar rates ---
  const nextOrdinaryRate = _bandRate(taxable, ordinaryBrackets);
  let nextLtcgRate;
  if (roomLeftAt0 > 0) {
    nextLtcgRate = 0;
  } else if (taxable + taxableGain >= ltcg15Ceiling) {
    nextLtcgRate = 0.20;
  } else {
    nextLtcgRate = 0.15;
  }

  const totalTax = ord.tax + ltcgTax;
  const denom = gross + ltcg;
  const effectiveRate = denom > 0 ? totalTax / denom : 0;

  // --- Steps: structured {key, args} descriptors (renderer resolves via t()) ---
  const steps = [];
  steps.push(Object.freeze({ key: 'te.step.ordGross', args: [otherOrdinary, tradWithdrawal, rothConversion, gross] }));
  steps.push(Object.freeze({ key: 'te.step.ordMinusStd', args: [gross, standardDeduction, taxable] }));
  for (const l of ord.layers) {
    steps.push(Object.freeze({
      key: 'te.step.ordLayer',
      args: [l.lowerThreshold, l.upperThreshold, l.dollarsInLayer, l.rate * 100, l.tax],
    }));
  }
  steps.push(Object.freeze({ key: 'te.step.ordTotal', args: [ord.tax] }));
  // Show the deduction sheltering gains whenever ordinary income didn't consume
  // the whole standard deduction (explains why the taxable gain < the gain you
  // entered, and why the 0% room is larger than the bare ceiling).
  if (shelteredGain > 0) {
    steps.push(Object.freeze({ key: 'te.step.ltcgShelter', args: [shelteredGain, taxableGain] }));
  }
  steps.push(Object.freeze({ key: 'te.step.ltcgStack', args: [taxable, ltcg0Ceiling, zeroRoom] }));
  for (const l of ltcgLayers) {
    steps.push(Object.freeze({ key: 'te.step.ltcgLayer', args: [l.rate * 100, l.dollars, l.tax] }));
  }
  steps.push(Object.freeze({ key: 'te.step.ltcgTotal', args: [ltcgTax] }));
  // Bottom-line 0% pool summary: total realizable at 0% − already realized = room left.
  steps.push(Object.freeze({ key: 'te.step.ltcgPool', args: [gainPool, ltcg, roomLeftAt0] }));

  return Object.freeze({
    ordinary: Object.freeze({
      gross: gross,
      standardDeduction: standardDeduction,
      taxable: taxable,
      layers: Object.freeze(ord.layers),
      tax: ord.tax,
    }),
    ltcg: Object.freeze({
      gain: ltcg,
      shelteredByDeduction: shelteredGain,
      taxableGain: taxableGain,
      ordinaryTaxableStacked: taxable,
      layers: Object.freeze(ltcgLayers),
      tax: ltcgTax,
    }),
    signals: Object.freeze({
      roomLeftAt0: roomLeftAt0,
      irmaa: Object.freeze({ crossed: irmaaCrossed, threshold: irmaaThreshold, magi: magi }),
      niit: Object.freeze({ crossed: niitCrossed, threshold: niitThreshold, amount: niitAmount }),
    }),
    marginal: Object.freeze({
      nextOrdinaryRate: nextOrdinaryRate,
      nextLtcgRate: nextLtcgRate,
    }),
    totalTax: totalTax,
    effectiveRate: effectiveRate,
    steps: Object.freeze(steps),
  });
}

// ---------------------------------------------------------------------------
// UMD wrapper — works under Node `require` AND under file:// classic <script>.
// Mirror calc/cashSweep.js lines ~79-96. Constitution Principle V.
//
// NOTE: the const name must be UNIQUE across all browser-loaded calc/*.js —
// classic <script> tags share ONE global lexical scope, so a duplicate
// top-level `const` throws SyntaxError and silently kills the entire module.
// (See CLAUDE.md: cashSweep.js / withdrawalTooltipFrame.js both used `_api`.)
// ---------------------------------------------------------------------------
const _taxEstimatorApi = { estimateYearTax: estimateYearTax };
if (typeof module !== 'undefined' && module && module.exports) {
  module.exports = _taxEstimatorApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.estimateYearTax = estimateYearTax;
}
