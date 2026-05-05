/*
 * save-by-runner.mjs
 *
 * For each country (and the hybrid plans), compute:
 *   - balance at FIRE age (real $) — Boss's actual save-by target
 *   - balance at FIRE age (nominal Book Value) — what the broker statement will read
 *   - 4% rule conservative target — annual × 25
 *   - calc-engine required portfolio (lifecycle[fireAge].totalReal which already accounts for SS)
 *   - savings milestones: ages at which portfolio crosses $500k, $1M, $2M, $3M
 *
 * Outputs save-by-results.json
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
  { id: 'us', name: 'US (Massachusetts)', annualSpend: 96000 },
  { id: 'taiwan', name: 'Taiwan (Taichung)', annualSpend: 42000 },
  { id: 'thailand', name: 'Thailand (Bangkok)', annualSpend: 54000 },
  { id: 'china', name: 'China (Shanghai)', annualSpend: 66000 },
  { id: 'vietnam', name: 'Vietnam (HCM/Da Nang)', annualSpend: 36000 },
  { id: 'philippines', name: 'Philippines (Boracay)', annualSpend: 30000 },
  { id: 'indonesia', name: 'Indonesia (Bali, Ubud)', annualSpend: 42000 },
  { id: 'japan', name: 'Japan (Tokyo)', annualSpend: 66000 },
  { id: 'singapore', name: 'Singapore', annualSpend: 120000 },
  // Hybrids
  { id: 'hybrid_jp_tw', name: 'Hybrid: Japan + Taiwan', annualSpend: 57000, isHybrid: true },
  { id: 'hybrid_jp_th', name: 'Hybrid: Japan + Thailand', annualSpend: 60000, isHybrid: true },
  { id: 'hybrid_jp_ph', name: 'Hybrid: Japan + Philippines', annualSpend: 51000, isHybrid: true },
];

function buildInputs(annualSpend) {
  const legacy = { ...ROGER_BASELINE, selectedScenario: 'us', fireMode: 'safe' };
  const canonical = getCanonicalInputs(legacy);
  return Object.freeze({
    ...canonical,
    annualSpendReal: annualSpend,
    scenarioSpendReal: annualSpend,
  });
}

const INFLATION = 0.03;
function nominalize(real$, yearsFromNow) {
  return real$ * Math.pow(1 + INFLATION, yearsFromNow);
}

function findMilestone(lifecycle, target) {
  const rec = lifecycle.find(r => r.totalReal >= target);
  return rec ? { age: rec.agePrimary, year: rec.year, balance: rec.totalReal } : null;
}

const results = SCENARIOS.map(sc => {
  const inputs = buildInputs(sc.annualSpend);
  const r = solveFireAge({ inputs, helpers: {} });
  if (!r.feasible) {
    return { ...sc, feasible: false };
  }
  // Find balance AT fireAge in the lifecycle
  const fireRec = r.lifecycle.find(rec => rec.agePrimary === r.fireAge);
  const portfolioAtFire_real = fireRec ? fireRec.totalReal : 0;
  const portfolioAtFire_effReal = fireRec ? fireRec.effBalReal : 0;
  // Nominal Book Value at FIRE day (what the broker statement will literally read)
  const portfolioAtFire_nominal = nominalize(portfolioAtFire_real, r.yearsToFire);
  const portfolioAtFire_eff_nominal = nominalize(portfolioAtFire_effReal, r.yearsToFire);
  // Milestones: when does the portfolio cross each threshold (in REAL $)
  const milestones = {
    '500k': findMilestone(r.lifecycle, 500_000),
    '1M':   findMilestone(r.lifecycle, 1_000_000),
    '2M':   findMilestone(r.lifecycle, 2_000_000),
    '3M':   findMilestone(r.lifecycle, 3_000_000),
  };
  return {
    ...sc,
    feasible: true,
    fireAge: r.fireAge,
    yearsToFire: r.yearsToFire,
    annualSpend: sc.annualSpend,
    // Three target views
    fourPctRuleTarget: sc.annualSpend / 0.04,        // Conservative: SWR with no SS
    calcEngineRequired_real: portfolioAtFire_real,    // Actual minimum (calc engine confirmed feasible)
    calcEngineRequired_eff_real: portfolioAtFire_effReal,  // After 401k tax-drag discount
    // Nominal Book Value at FIRE day (broker statement equivalent)
    saveByTarget_nominal: portfolioAtFire_nominal,
    saveByTarget_eff_nominal: portfolioAtFire_eff_nominal,
    // Milestones in real $
    milestones,
    // End balance
    endBalanceReal: r.endBalanceReal,
  };
});

console.log('\n=== SAVE-BY TARGETS (per country, SAFE mode) ===\n');
console.log('Country                         | FIRE@ | Annual$ | 4%-Rule#  | CalcReq(real)$ | NominalBookValue@FIRE');
console.log('-'.repeat(110));
results.forEach(r => {
  if (!r.feasible) {
    console.log(`${r.name.padEnd(32)} | INFEASIBLE`);
    return;
  }
  const fmt = n => '$' + (n / 1e6).toFixed(2) + 'M';
  console.log(
    `${r.name.padEnd(32)} | ${String(r.fireAge).padStart(5)} | ` +
    `$${(r.annualSpend / 1000).toFixed(0)}k`.padStart(7) + ' | ' +
    fmt(r.fourPctRuleTarget).padStart(9) + ' | ' +
    fmt(r.calcEngineRequired_real).padStart(14) + ' | ' +
    fmt(r.saveByTarget_nominal)
  );
});

console.log('\n=== SAVINGS MILESTONES (real $, age when portfolio crosses threshold) ===\n');
console.log('Country (US scenario shown — milestones are country-independent)');
console.log('All scenarios use the same baseline portfolio + contributions.');
console.log('-'.repeat(80));
const usResult = results.find(r => r.id === 'us');
if (usResult && usResult.milestones) {
  for (const [thresh, ms] of Object.entries(usResult.milestones)) {
    if (ms) {
      console.log(`Cross $${thresh}: age ${ms.age} (${ms.year}), real balance $${(ms.balance / 1e6).toFixed(2)}M`);
    } else {
      console.log(`Cross $${thresh}: never reached during accumulation`);
    }
  }
}

import { writeFileSync } from 'fs';
writeFileSync('/sessions/modest-confident-hypatia/mnt/outputs/save-by-results.json',
              JSON.stringify({ generated: new Date().toISOString(), scenarios: results }, null, 2));
console.log('\nWritten: save-by-results.json');
