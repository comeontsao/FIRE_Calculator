// Verify Trad bracket-fill smoothing distributes tax evenly across retirement years.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(REPO_ROOT, 'FIRE-Dashboard-Generic.html'), 'utf8');

function extractFn(name) {
  const pat = new RegExp(`function\\s+${name}\\s*\\(`, 'g');
  const m = pat.exec(HTML);
  if (!m) throw new Error(name);
  let i = HTML.indexOf('{', m.index) + 1;
  let depth = 1;
  while (depth > 0 && i < HTML.length) {
    const ch = HTML[i];
    if (ch === '/' && HTML[i + 1] === '/') { i = HTML.indexOf('\n', i); if (i < 0) break; i++; continue; }
    if (ch === '/' && HTML[i + 1] === '*') { i = HTML.indexOf('*/', i); if (i < 0) break; i += 2; continue; }
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch; i++;
      while (i < HTML.length && HTML[i] !== q) { if (HTML[i] === '\\') i++; i++; }
      i++; continue;
    }
    if (ch === '{') depth++; else if (ch === '}') depth--;
    i++;
  }
  return HTML.slice(m.index, i);
}
const fns = ['taxOptimizedWithdrawal','getRMDDivisor','calcOrdinaryTax','calcLTCGTax','getTaxBrackets','detectMFJ'];
const fnCode = fns.map(n => { try { return extractFn(n); } catch { return ''; } }).join('\n\n');
global.document = { getElementById: (id) => ({ value: { twStdDed: '30000', twTop12: '94300', twTop22: '201050' }[id] || '0' }) };
global.window = {};
const ctx = new Function(`${fnCode}\nreturn {taxOptimizedWithdrawal, getTaxBrackets};`);
const api = ctx();

const brackets = api.getTaxBrackets(true);
const grossSpend = 72000;
const stockGainPct = 0.6;
const bfOpts = {
  safetyMargin: 0.03,
  rule55: { enabled: false, separationAge: 54 },
  irmaaThreshold: 212000,
  endAge: 100,
};

// Simulate a tight Trad balance over ages 60–85 with the smoothing
let pTrad = 600000;
let pRoth = 0;
let pStocks = 1000000;
let pCash = 80000;

console.log('age | pTrad start | wTrad | taxOwed | effRate | synthConv');
console.log('----+-------------+-------+---------+---------+----------');
for (let age = 60; age <= 85; age++) {
  const ss = age >= 67 ? 48000 : 0;
  const mix = api.taxOptimizedWithdrawal(grossSpend, ss, pTrad, pRoth, pStocks, pCash, age, brackets, stockGainPct, bfOpts);
  console.log(`${String(age).padStart(3)} | ${('$' + Math.round(pTrad).toLocaleString()).padStart(11)} | ${('$' + Math.round(mix.wTrad).toLocaleString()).padStart(5)} | ${('$' + Math.round(mix.taxOwed).toLocaleString()).padStart(7)} | ${(mix.effRate * 100).toFixed(1).padStart(5)}% | ${('$' + Math.round(mix.syntheticConversion || 0).toLocaleString()).padStart(8)}`);
  // Apply withdrawals + synthetic conv (mimics projectFullLifecycle timing)
  pTrad -= mix.wTrad;
  pRoth -= mix.wRoth;
  pStocks -= mix.wStocks;
  pCash -= mix.wCash;
  if (mix.syntheticConversion > 0) pStocks += mix.syntheticConversion;
  // Compound
  pTrad = Math.max(0, pTrad) * 1.04;
  pRoth = Math.max(0, pRoth) * 1.04;
  pStocks = Math.max(0, pStocks) * 1.04;
  pCash = Math.max(0, pCash) * 1.005;
}
