/**
 * us2-aggressive-vs-smoothed.js — direct head-to-head: smoothed vs aggressive bracket-fill
 *
 * USER'S QUESTION:
 *   "At year 60-69 the tax is 0%, so why don't we pull more Trad in those years
 *   to fill the 10/12% bracket? If we wait until 73, the same dollars get pulled
 *   into a HIGHER bracket. So smoothing Trad earlier should beat zero-tax-now /
 *   higher-tax-later. Show me mathematically why or why not."
 *
 * METHOD:
 *   Replicates the production bracket-fill-smoothed cap (FIRE-Dashboard.html
 *   line 10806-10842) for both:
 *     - PATH A (current dashboard behavior): Trad pull capped at pTrad/yearsRemaining
 *     - PATH B (user's proposed strategy):   Trad pull fills full bracketHeadroom
 *                                            (10/12% bracket up to safety margin)
 *                                            ages 60-69, after-tax residual
 *                                            reinvested in Taxable. Reverts to
 *                                            smoothed cap age 70+.
 *
 * Both paths run for ages 55-95 against the SC-026-A fixture inputs. Lifetime
 * federal tax + terminal Book Value reported for each.
 *
 * Run: node tests/diagnostics/us2-aggressive-vs-smoothed.js
 */
'use strict';

const STD_DED = 30000;
const TOP_12  = 94300;
const TOP_22  = 201050;
const SAFETY_MARGIN = 0.05;
const SS_CLAIM_AGE = 70;
const SS_NOMINAL_BASE = 58896;       // dump's age-70 SS income
const REAL_RETURN_401K = 0.03;       // 7% nominal − 4% inflation
const REAL_RETURN_STOCKS = 0.03;     // same assumption
const LTCG_RATE = 0.15;              // applies in 12%-22% ordinary band
const STOCK_GAIN_PCT = 0.60;         // dump's stockGainPct
const UNLOCK_AGE = 59.5;
const RMD_START_AGE = 73;
const END_AGE = 100;

function rmdDivisor(age) {
  if (age < 73) return Infinity;
  if (age < 75) return 27.4 - (age - 73);
  if (age < 80) return 25.5 - (age - 75);
  if (age < 90) return 21.1 - (age - 80);
  return Math.max(8, 12.2 - (age - 90));
}

function ordinaryTax(income) {
  const taxable = Math.max(0, income - STD_DED);
  let owed = 0;
  if (taxable > 0)         owed += Math.min(taxable, 23200) * 0.10;
  if (taxable > 23200)     owed += (Math.min(taxable, TOP_12) - 23200) * 0.12;
  if (taxable > TOP_12)    owed += (Math.min(taxable, TOP_22) - TOP_12) * 0.22;
  if (taxable > TOP_22)    owed += (taxable - TOP_22) * 0.24;
  return owed;
}

function ltcgTax(gain, ordinaryTaxableIncome) {
  // 0% LTCG up to top-of-12% bracket; 15% above. Simplified.
  if (ordinaryTaxableIncome >= TOP_12) return gain * 0.15;
  const room0 = Math.max(0, TOP_12 - ordinaryTaxableIncome);
  const taxedAt0 = Math.min(gain, room0);
  const taxedAt15 = Math.max(0, gain - taxedAt0);
  return taxedAt15 * 0.15;
}

/**
 * Run a single path. policy = 'smoothed' | 'aggressive'.
 * Returns { rows[], lifetimeTaxReal, terminalBVReal }.
 */
function simulate(policy) {
  // Initial pools at FIRE age 55 (extrapolated from dump's age-54 row).
  let pTrad = 615153;
  let pStocks = 957288;
  let pCash = 92308;
  const annualSpend = 78155;          // dump's age-55 withdrawals (real-$)

  const rows = [];
  let lifetimeTax = 0;

  for (let age = 55; age <= 95; age++) {
    const ssActive = age >= SS_CLAIM_AGE;
    const ssIncome = ssActive ? SS_NOMINAL_BASE : 0;
    const taxableSS = ssIncome * 0.85;
    const rmd = (age >= RMD_START_AGE && pTrad > 0) ? pTrad / rmdDivisor(age) : 0;
    const canAccess401k = age >= UNLOCK_AGE;

    // === Compute wTrad based on policy ===
    let wTrad = rmd;
    if (canAccess401k) {
      const targetBracketCap = (STD_DED + TOP_12) * (1 - SAFETY_MARGIN);
      const bracketHeadroom = Math.max(0, targetBracketCap - taxableSS - rmd);
      const yearsRemaining = Math.max(1, END_AGE - age);
      const smoothedTarget = Math.max(0, pTrad - rmd) / yearsRemaining;

      let additionalTrad;
      if (policy === 'smoothed') {
        // Production logic: min of (available, headroom, smoothedTarget)
        additionalTrad = Math.min(
          Math.max(0, pTrad - rmd),
          bracketHeadroom,
          smoothedTarget,
        );
      } else {
        // Aggressive: fill bracket at ages 60-69, then revert to smoothed.
        if (age >= 60 && age <= 69) {
          additionalTrad = Math.min(Math.max(0, pTrad - rmd), bracketHeadroom);
        } else {
          additionalTrad = Math.min(
            Math.max(0, pTrad - rmd),
            bracketHeadroom,
            smoothedTarget,
          );
        }
      }
      wTrad += additionalTrad;
    }

    // === Compute ordinary tax on Trad + taxableSS ===
    const ordinaryIncome = wTrad + taxableSS;
    const ordTax = ordinaryTax(ordinaryIncome);

    // === Net spending need after Trad + SS ===
    let needed = Math.max(0, annualSpend + ordTax - ssIncome - wTrad);
    let wStocks = 0;
    let stockGain = 0;
    if (needed > 0 && pStocks > 0) {
      // Iteratively size stock sale to cover needed + LTCG tax.
      let sell = Math.min(needed, pStocks);
      for (let iter = 0; iter < 5; iter++) {
        const gain = sell * STOCK_GAIN_PCT;
        const taxOnGain = ltcgTax(gain, Math.max(0, ordinaryIncome - STD_DED));
        const net = sell - taxOnGain;
        const gap = needed - net;
        if (Math.abs(gap) < 10 || sell >= pStocks) break;
        sell = Math.min(pStocks, sell + gap);
      }
      wStocks = sell;
      stockGain = wStocks * STOCK_GAIN_PCT;
      pStocks -= wStocks;
    }
    const ltcgTaxThisYear = ltcgTax(stockGain, Math.max(0, ordinaryIncome - STD_DED));
    const yearTax = ordTax + ltcgTaxThisYear;
    lifetimeTax += yearTax;

    // === Subtract Trad withdrawal ===
    pTrad = Math.max(0, pTrad - wTrad);

    // === Aggressive policy: reinvest after-tax Trad residual into Taxable ===
    if (policy === 'aggressive' && age >= 60 && age <= 69 && wTrad > rmd) {
      // After-tax Trad residual that wasn't needed for spending → reinvest
      const fundedFromTrad = Math.min(wTrad - ordTax, annualSpend - ssIncome);
      const surplus = (wTrad - ordTax) - Math.max(0, fundedFromTrad);
      if (surplus > 0) pStocks += surplus;
    }

    // === Compound remaining pools at real rate ===
    pTrad *= (1 + REAL_RETURN_401K);
    pStocks *= (1 + REAL_RETURN_STOCKS);

    rows.push({
      age,
      pTrad: Math.round(pTrad),
      pStocks: Math.round(pStocks),
      wTrad: Math.round(wTrad),
      taxableSS: Math.round(taxableSS),
      ordIncome: Math.round(ordinaryIncome),
      ordTax: Math.round(ordTax),
      ltcgTax: Math.round(ltcgTaxThisYear),
      yearTax: Math.round(yearTax),
      effRate: ordinaryIncome + stockGain > 0
        ? yearTax / (ordinaryIncome + stockGain) : 0,
    });
  }

  return {
    rows,
    lifetimeTaxReal: Math.round(lifetimeTax),
    terminalBVReal: Math.round(pTrad + pStocks + pCash),
  };
}

const smoothed = simulate('smoothed');
const aggressive = simulate('aggressive');

console.log('Head-to-head: SMOOTHED (current dashboard) vs AGGRESSIVE BRACKET-FILL (user proposal)');
console.log('='.repeat(110));
console.log('');
console.log('Showing: ages 60, 65, 69, 73, 80, 90 — the years that drive the lifetime-tax difference.');
console.log('');

function printSideBySide() {
  console.log('age | policy        | wTrad   | ordIncome | ordTax  | ltcgTax | yearTax | effRate | pTrad   | pStocks');
  console.log('----+---------------+---------+-----------+---------+---------+---------+---------+---------+---------');
  const showAges = [60, 62, 65, 68, 69, 70, 73, 75, 80, 85, 90];
  for (const age of showAges) {
    const sm = smoothed.rows.find(r => r.age === age);
    const ag = aggressive.rows.find(r => r.age === age);
    const fmt = (r, label) => {
      const cells = [
        String(age).padStart(3),
        label.padEnd(13),
        ('$' + r.wTrad.toLocaleString()).padStart(7),
        ('$' + r.ordIncome.toLocaleString()).padStart(9),
        ('$' + r.ordTax.toLocaleString()).padStart(7),
        ('$' + r.ltcgTax.toLocaleString()).padStart(7),
        ('$' + r.yearTax.toLocaleString()).padStart(7),
        ((r.effRate * 100).toFixed(1) + '%').padStart(7),
        ('$' + Math.round(r.pTrad / 1000) + 'K').padStart(7),
        ('$' + Math.round(r.pStocks / 1000) + 'K').padStart(7),
      ];
      console.log(cells.join(' | '));
    };
    fmt(sm, 'SMOOTHED');
    fmt(ag, 'AGGRESSIVE');
    console.log('----+---------------+---------+-----------+---------+---------+---------+---------+---------+---------');
  }
}
printSideBySide();

console.log('');
console.log('=== SUMMARY ===');
console.log('');
console.log('SMOOTHED  — lifetime federal tax (real-$): $' + smoothed.lifetimeTaxReal.toLocaleString());
console.log('SMOOTHED  — terminal BV at 95 (real-$):    $' + smoothed.terminalBVReal.toLocaleString());
console.log('');
console.log('AGGRESSIVE — lifetime federal tax (real-$): $' + aggressive.lifetimeTaxReal.toLocaleString());
console.log('AGGRESSIVE — terminal BV at 95 (real-$):    $' + aggressive.terminalBVReal.toLocaleString());
console.log('');
const taxDelta = aggressive.lifetimeTaxReal - smoothed.lifetimeTaxReal;
const bvDelta = aggressive.terminalBVReal - smoothed.terminalBVReal;
console.log('DELTA (aggressive − smoothed):');
console.log('  Lifetime tax: ' + (taxDelta < 0 ? '−' : '+') + '$' + Math.abs(taxDelta).toLocaleString() +
  '  (' + (taxDelta < 0 ? 'aggressive WINS' : 'smoothed wins') + ')');
console.log('  Terminal BV:  ' + (bvDelta < 0 ? '−' : '+') + '$' + Math.abs(bvDelta).toLocaleString() +
  '  (' + (bvDelta > 0 ? 'aggressive WINS' : 'smoothed wins') + ')');
