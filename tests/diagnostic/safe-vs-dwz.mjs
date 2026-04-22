// Safe vs DWZ direct comparison — confirm whether they match in user's scenarios
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
const fns = ['taxOptimizedWithdrawal','signedLifecycleEndBalance','isFireAgeFeasible','findFireAgeNumerical','projectFullLifecycle','getRMDDivisor','calcOrdinaryTax','calcLTCGTax','getSSAnnual','getTaxBrackets','getMortgageAdjustedRetirement','getHealthcareDeltaAnnual','getTotalCollegeCostForYear','getSecondHomeAnnualCarryAtYear','getSecondHomeSaleAtFire','calcMortgagePayment','getSelectedRelocationCost','detectMFJ','getMortgageInputs','getSecondHomeInputs'];
const fnCode = fns.map(n => { try { return extractFn(n); } catch { return ''; } }).join('\n\n');
const overrides = `
function getSSAnnual() { return 56292; }
function getHealthcareDeltaAnnual() { return 0; }
function getTotalCollegeCostForYear(_i, y) { let t = 0; if (y >= 10 && y < 14) t += 80000; if (y >= 13 && y < 17) t += 80000; return t; }
function getSecondHomeAnnualCarryAtYear() { return 0; }
function getSecondHomeSaleAtFire() { return 0; }
function getSelectedRelocationCost() { return 0; }
function getMortgageAdjustedRetirement(s) { return { annualSpend: s, saleProceeds: 0 }; }
function getMortgageInputs() { return null; }
function getSecondHomeInputs() { return null; }
function detectMFJ() { return true; }
`;
global.document = { getElementById: (id) => {
  const d = { terminalBuffer:{value:'0'}, exp_0:{value:'2690'}, endAge:{value:'100'},
    rule55Enabled:{checked:false}, rule55SeparationAge:{value:'54'},
    safetyMargin:{value:'3'}, irmaaThreshold:{value:'212000'},
    twStdDed:{value:'30000'}, twTop12:{value:'94300'}, twTop22:{value:'201050'}};
  return d[id] || null;
}};
global.window = {};
let fireMode='safe', mortgageEnabled=false, secondHomeEnabled=false, selectedScenario='us';
const ctx = new Function('fireMode','mortgageEnabled','secondHomeEnabled','selectedScenario',
  `${fnCode}\n${overrides}\nreturn {findFireAgeNumerical, projectFullLifecycle, signedLifecycleEndBalance, isFireAgeFeasible, setFireMode:(m)=>{fireMode=m;}};`);
const api = ctx(fireMode,mortgageEnabled,secondHomeEnabled,selectedScenario);

const inp = {
  agePerson1:42, agePerson2:42,
  person1_401kTrad:100000, person1_401kRoth:0,
  person1Stocks:280000, person2Stocks:150000,
  cashSavings:50000, otherAssets:0,
  annualIncome:200000, raiseRate:0.03,
  returnRate:0.07, return401k:0.07, inflationRate:0.03,
  swr:0.04, monthlySavings:3000,
  contrib401kTrad:15000, contrib401kRoth:0, empMatch:5000,
  taxTrad:0.15, stockGainPct:0.6,
  bufferUnlock:1, bufferSS:1,
  endAge:100, ssClaimAge:70,
  safetyMargin:0.03, rule55:{enabled:false, separationAge:54}, irmaaThreshold:212000,
};

console.log('Safe vs DWZ at various spends + buffers (college on):');
console.log('spend | buffer | SafeFIRE | DWZFIRE | match? | SafeSignedEnd | DWZSignedEnd');
console.log('------+--------+----------+---------+--------+---------------+-------------');
for (const spend of [60000, 70300, 75000, 80000, 90000, 100000]) {
  for (const buf of [1, 2, 3, 5]) {
    const inp2 = { ...inp, bufferUnlock: buf, bufferSS: buf };
    api.setFireMode('safe');
    const sf = api.findFireAgeNumerical(inp2, spend, 'safe');
    api.setFireMode('dieWithZero');
    const dwz = api.findFireAgeNumerical(inp2, spend, 'dieWithZero');
    const match = sf.years === dwz.years ? 'YES' : ` ${sf.years - dwz.years}`;
    console.log(`$${spend.toString().padStart(6)} | ${buf.toString().padStart(5)} | ${(42+sf.years).toString().padStart(7)} | ${(42+dwz.years).toString().padStart(6)} | ${match.padStart(4)} | $${Math.round(sf.endBalance).toLocaleString().padStart(12)} | $${Math.round(dwz.endBalance).toLocaleString().padStart(10)}`);
  }
}
