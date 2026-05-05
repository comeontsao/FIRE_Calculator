/*
 * hybrid-runner.mjs
 *
 * Hybrid Japan + Taiwan FIRE calc.
 * 6 mo Japan @ $66k/yr pro-rated = $33k
 * 6 mo Taiwan @ $42k/yr pro-rated = $21k
 * Plus 2 round-trip flights/yr Tokyo↔Taipei + transit / extras = ~$3k
 * Hybrid annual spend = $57k
 *
 * Compare against Taiwan-only ($42k) and Japan-only ($66k) baselines.
 */
import { getCanonicalInputs } from '../FIRE_Calculator/calc/getCanonicalInputs.js';
import { solveFireAge } from '../FIRE_Calculator/calc/fireCalculator.js';

const ROGER_BASELINE = {
  ageRoger: 42, ageRebecca: 41, ageKid1: 10, ageKid2: 4,
  collegeKid1: 'us-private', collegeKid2: 'us-private',
  loanPctKid1: 0, loanPctKid2: 0, loanParentPctKid1: 100, loanParentPctKid2: 100,
  loanRate: 6.53, loanTerm: 10, stockGainPct: 0.60,
  annualIncome: 150000, raiseRate: 0.02, taxRate: 0.28,
  roger401kTrad: 25000, roger401kRoth: 58000,
  rogerStocks: 190000, rebeccaStocks: 200000,
  cashSavings: 0, otherAssets: 0,
  returnRate: 0.07, return401k: 0.07, inflationRate: 0.03,
  ssCOLARate: 0.03, swr: 0.04,
  monthlySavings: 2000, contrib401kTrad: 8550, contrib401kRoth: 2850,
  taxTrad: 0.15, empMatch: 7200,
  ssWorkStart: 2019, ssAvgEarnings: 100000, ssRebeccaOwn: 0,
  ssClaimAge: 67,
  bufferUnlock: 2, bufferSS: 3,
  endAge: 100,
  safetyMargin: 0.05,
  rule55: { enabled: false, separationAge: 54 },
  irmaaThreshold: 212000,
};

const SCENARIOS = [
  { id: 'hybrid_jp_tw', name: 'Hybrid: Japan + Taiwan (50/50)', annualSpend: 57000,
    notes: '6mo Japan ($33k) + 6mo Taiwan ($21k) + flights/transit ($3k). <180 days each = no tax residency anywhere extra.' },
  { id: 'hybrid_jp_th', name: 'Hybrid: Japan + Thailand (50/50)', annualSpend: 60000,
    notes: '6mo Japan ($33k) + 6mo Thailand ($27k) + flights ($3k). LTR visa needed for Thailand half.' },
  { id: 'hybrid_jp_ph', name: 'Hybrid: Japan + Philippines (50/50)', annualSpend: 51000,
    notes: '6mo Japan ($33k) + 6mo Philippines ($15k) + flights ($3k). SRRV needed for PH half.' },
  { id: 'hybrid_jp_id', name: 'Hybrid: Japan + Indonesia/Bali (50/50)', annualSpend: 57000,
    notes: '6mo Japan ($33k) + 6mo Bali ($21k) + flights ($3k). Retirement KITAS needed for Bali half (age 55+). WEATHER: Bali wet season Nov-Apr conflicts with winter-escape goal.' },
  // Re-include the relevant baselines for context
  { id: 'taiwan_only', name: 'Taiwan only', annualSpend: 42000, notes: 'Boss\'s baseline Taiwan scenario' },
  { id: 'japan_only',  name: 'Japan only',  annualSpend: 66000, notes: 'Boss\'s baseline Japan scenario' },
];

function buildInputs(scenarioId, annualSpend, mode) {
  const legacy = { ...ROGER_BASELINE, selectedScenario: 'us', fireMode: mode };
  const canonical = getCanonicalInputs(legacy);
  return Object.freeze({
    ...canonical,
    annualSpendReal: annualSpend,
    scenarioSpendReal: annualSpend,
  });
}

console.log('\n=== HYBRID FIRE COMPARISON ===\n');
console.log('Annual Spend  | Yrs | FIRE@ | EndBal | FIRE# (4%)');
console.log('-'.repeat(75));
const results = [];
for (const sc of SCENARIOS) {
  try {
    const inputs = buildInputs(sc.id, sc.annualSpend, 'safe');
    const result = solveFireAge({ inputs, helpers: {} });
    const row = {
      ...sc,
      fireAge: result.fireAge,
      yearsToFire: result.yearsToFire,
      feasible: result.feasible,
      endBalanceReal: result.endBalanceReal,
      balanceAtUnlockReal: result.balanceAtUnlockReal,
      balanceAtSSReal: result.balanceAtSSReal,
      fireNumber: sc.annualSpend / 0.04,
      lifetimeSpend: sc.annualSpend * 58,
    };
    results.push(row);
    const annual = '$' + (sc.annualSpend / 1000).toFixed(0) + 'k';
    const yrs = result.feasible ? result.yearsToFire.toString() : 'N/A';
    const fa = result.feasible ? result.fireAge.toString() : 'N/A';
    const eb = result.feasible ? '$' + (result.endBalanceReal / 1e6).toFixed(2) + 'M' : '—';
    const fn = '$' + (sc.annualSpend / 0.04 / 1e6).toFixed(2) + 'M';
    console.log(`${sc.name.padEnd(32)} | ${annual.padStart(5)} | ${yrs.padStart(3)} | ${fa.padStart(5)} | ${eb.padStart(7)} | ${fn}`);
  } catch (err) {
    console.error(`${sc.name}: ERROR — ${err.message}`);
  }
}

import { writeFileSync } from 'fs';
writeFileSync('/sessions/modest-confident-hypatia/mnt/outputs/hybrid-results.json',
              JSON.stringify({ generated: new Date().toISOString(), scenarios: results }, null, 2));
console.log('\nWritten: hybrid-results.json')