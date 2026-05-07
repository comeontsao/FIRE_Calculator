/**
 * us2-multiplier-sweep.js — feature 027 follow-up.
 *
 * Probes SC-026-A under different aggressiveSmoothingMultiplier values to
 * help calibrate the "1 bracket up" effective-tax-rate target the user
 * specified in the 2026-05-07 screenshot review.
 *
 * Reports per-year wTrad, ordinary income, effective tax rate at ages
 * 60, 65, 69 + lifetime tax + terminal BV for multipliers 1, 2, 4, 5, 8.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HTML_GENERIC = fs.readFileSync(path.join(REPO_ROOT, 'FIRE-Dashboard-Generic.html'), 'utf8');

function extractFn(html, name) {
  const pat = new RegExp(`function\\s+${name}\\s*\\(`, 'g');
  const m = pat.exec(html);
  if (!m) throw new Error(`Function '${name}' not found`);
  let i = html.indexOf('{', m.index) + 1;
  let depth = 1;
  while (depth > 0 && i < html.length) {
    const ch = html[i];
    if (ch === '/' && html[i + 1] === '/') { i = html.indexOf('\n', i); if (i < 0) break; i++; continue; }
    if (ch === '/' && html[i + 1] === '*') { i = html.indexOf('*/', i); if (i < 0) break; i += 2; continue; }
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch; i++;
      while (i < html.length && html[i] !== q) { if (html[i] === '\\') i++; i++; }
      i++; continue;
    }
    if (ch === '{') depth++; else if (ch === '}') depth--;
    i++;
  }
  return html.slice(m.index, i);
}

const fns = ['taxOptimizedWithdrawal','getRMDDivisor','calcOrdinaryTax','calcLTCGTax']
  .map((n) => extractFn(HTML_GENERIC, n)).join('\n\n');
const apiCtx = new Function(`${fns}\nreturn { taxOptimizedWithdrawal };`);
const { taxOptimizedWithdrawal } = apiCtx();

const MFJ = {
  stdDed: 30000, top10: 23200, top12: 94300, top22: 201050,
  top24: 383900, top32: 487450, top35: 731200,
  ltcg0Top: 94050, ltcg15Top: 583750,
};

function simulate(multiplier) {
  let pTrad = 615153, pRoth = 0, pStocks = 957288, pCash = 92308;
  const annualSpend = 78155;
  const SS_CLAIM_AGE = 70, SS_BASE = 58896, REAL_RETURN = 0.03;
  let lifetimeTax = 0;
  const probeRows = [];
  for (let age = 55; age <= 95; age++) {
    const ssIncome = age >= SS_CLAIM_AGE ? SS_BASE : 0;
    const mix = taxOptimizedWithdrawal(
      annualSpend, ssIncome, pTrad, pRoth, pStocks, pCash,
      age, MFJ, 0.6,
      { endAge: 100, safetyMargin: 0.05, aggressiveSmoothingMultiplier: multiplier }
    );
    lifetimeTax += mix.taxOwed;
    if ([60, 62, 65, 68, 69, 70, 73].includes(age)) {
      probeRows.push({
        age, wTrad: Math.round(mix.wTrad), ordIncome: Math.round(mix.ordIncome),
        taxOwed: Math.round(mix.taxOwed),
        effRate: ((mix.taxOwed / Math.max(1, ssIncome + mix.wTrad + mix.wRoth + mix.wStocks + mix.wCash)) * 100).toFixed(1),
      });
    }
    pTrad = Math.max(0, pTrad - mix.wTrad);
    pRoth = Math.max(0, pRoth - mix.wRoth);
    pStocks = Math.max(0, pStocks - mix.wStocks);
    pCash = Math.max(0, pCash - mix.wCash);
    if (mix.syntheticConversion > 0) pStocks += mix.syntheticConversion;
    pTrad *= 1.03; pStocks *= 1.03; pRoth *= 1.03;
  }
  return { lifetimeTax: Math.round(lifetimeTax), terminalBV: Math.round(pTrad + pRoth + pStocks + pCash), probeRows };
}

console.log('SC-026-A multiplier sweep — feature 027 calibration\n');
console.log('multiplier | age | wTrad   | ordIncome | tax     | effRate%');
console.log('-----------+-----+---------+-----------+---------+--------');
for (const m of [1, 2, 4, 5, 8]) {
  const r = simulate(m);
  for (const p of r.probeRows) {
    console.log(`${String(m).padStart(2)}×        | ${String(p.age).padStart(3)} | $${String(p.wTrad).padStart(6)} | $${String(p.ordIncome).padStart(8)} | $${String(p.taxOwed).padStart(6)} | ${String(p.effRate).padStart(5)}%`);
  }
  console.log(`${String(m).padStart(2)}× lifetime tax: $${r.lifetimeTax.toLocaleString().padStart(9)}   |   terminal BV: $${r.terminalBV.toLocaleString()}`);
  console.log('-----------+-----+---------+-----------+---------+--------');
}
