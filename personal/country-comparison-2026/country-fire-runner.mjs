/*
 * country-fire-runner.mjs
 *
 * Multi-country FIRE comparison for Roger (Boss), age 42, plan-to age 100.
 * Uses the FIRE Calculator's canonical calc engine WITHOUT modifying the HTML.
 *
 * Methodology:
 *   1. Build a legacy `inp` object matching Boss's RR Dashboard parameters.
 *   2. Override `selectedScenario` per country (drives healthcare in scenario.healthcareScenario).
 *   3. Override `annualSpendReal` AFTER getCanonicalInputs() with our researched 2026
 *      upper-middle-class numbers (the dashboard's stale baseline is bypassed).
 *   4. Call solveFireAge() for both 'safe' and 'exact' modes.
 *   5. Capture FIRE age, FIRE number, lifetime spend, end balance.
 */

import { getCanonicalInputs } from '../FIRE_Calculator/calc/getCanonicalInputs.js';
import { solveFireAge } from '../FIRE_Calculator/calc/fireCalculator.js';

// ====================================================================
// BOSS'S BASELINE — extracted from FIRE-Dashboard.html (RR Dashboard).
// User stated age 42; Roger=43 in dashboard, so we treat user age as 42
// and Rebecca as 41 (one year younger) to preserve the relative gap.
// ====================================================================
const ROGER_BASELINE = {
  // Ages (user is 42 today, plan to age 100)
  ageRoger: 42,
  ageRebecca: 41,
  ageKid1: 10,
  ageKid2: 4,
  collegeKid1: 'us-private',
  collegeKid2: 'us-private',
  loanPctKid1: 0,
  loanPctKid2: 0,
  loanParentPctKid1: 100,
  loanParentPctKid2: 100,
  loanRate: 6.53,
  loanTerm: 10,
  stockGainPct: 0.60,

  // Income & tax
  annualIncome: 150000,
  raiseRate: 0.02,
  taxRate: 0.28,

  // Portfolio (from dashboard inputs)
  roger401kTrad: 25000,
  roger401kRoth: 58000,
  rogerStocks: 190000,
  rebeccaStocks: 200000,
  cashSavings: 0,
  otherAssets: 0,

  // Returns & inflation
  returnRate: 0.07,
  return401k: 0.07,
  inflationRate: 0.03,
  ssCOLARate: 0.03,
  swr: 0.04,

  // Contributions
  monthlySavings: 2000,
  contrib401kTrad: 8550,
  contrib401kRoth: 2850,
  taxTrad: 0.15,
  empMatch: 7200,

  // Social Security
  ssWorkStart: 2019,
  ssAvgEarnings: 100000,
  ssRebeccaOwn: 0,
  ssClaimAge: 67,

  // Buffers (for SAFE mode)
  bufferUnlock: 2,   // 2× annualSpend buffer at 401k unlock (age 60)
  bufferSS: 3,       // 3× annualSpend buffer at SS claim (age 67)

  // Horizon: USER WANTS PLAN TO 100 (default dashboard is 95)
  endAge: 100,

  // Misc
  safetyMargin: 0.05,
  rule55: { enabled: false, separationAge: 54 },
  irmaaThreshold: 212000,
};

// ====================================================================
// COUNTRY SCENARIOS — RESEARCHED 2026 NUMBERS
// Lifestyle: upper-middle-class, couple post-college (kids grown by retire age).
// Healthcare: local public + supplementary private (per Boss's preference).
// All values: USD/year, real (today's purchasing power).
// ====================================================================
const COUNTRIES = [
  {
    id: 'us',
    name: 'US (Massachusetts/Boston metro)',
    flag: '🇺🇸',
    annualSpend: 96000,   // $8k/mo: comfortable post-college, modest housing, ACA + supplemental
    notes: 'ACA marketplace pre-65, Medicare 65+. Family is settled, no relocation cost. Highest housing in lineup.',
    relocationCost: 0,
  },
  {
    id: 'taiwan',
    name: 'Taiwan (Taichung)',
    flag: '🇹🇼',
    annualSpend: 42000,   // $3.5k/mo: NHI is gold-standard cheap, Taichung 30-40% below Taipei
    notes: 'NHI ~$30/mo per person + private supplement ~$100/mo. Roger speaks Mandarin — huge daily-life lift.',
    relocationCost: 15000,
  },
  {
    id: 'thailand',
    name: 'Thailand (Bangkok)',
    flag: '🇹🇭',
    annualSpend: 54000,   // $4.5k/mo: nice condo Sukhumvit/Sathorn, premium private health
    notes: 'LTR / Thailand Elite visa. Bumrungrad/BNH private healthcare ~$3-5k/yr family premium.',
    relocationCost: 10000,
  },
  {
    id: 'china',
    name: 'China (Shanghai)',
    flag: '🇨🇳',
    annualSpend: 66000,   // $5.5k/mo: tier-1 expat 2BR + private health
    notes: 'Shanghai tier-1 cost. ParkwayHealth/UFH expat clinics are pricey. Visa & capital controls add friction.',
    relocationCost: 15000,
  },
  {
    id: 'vietnam',
    name: 'Vietnam (HCM/Da Nang)',
    flag: '🇻🇳',
    annualSpend: 36000,   // $3k/mo: premium expat lifestyle
    notes: 'No formal retirement visa yet (5-yr E-visa workaround). Private hospitals (FV, Vinmec) are good and cheap.',
    relocationCost: 8000,
  },
  {
    id: 'philippines',
    name: 'Philippines (Boracay)',
    flag: '🇵🇭',
    annualSpend: 30000,   // $2.5k/mo: beachfront living, English speaking
    notes: 'SRRV retirement visa easy. Imported goods pricey on Boracay; medical evac to Manila/Cebu for serious care.',
    relocationCost: 10000,
  },
  {
    id: 'indonesia',
    name: 'Indonesia (Bali, Ubud)',
    flag: '🇮🇩',
    annualSpend: 42000,   // $3.5k/mo: villa with pool, premium private health
    notes: 'KITAS retirement visa 55+ (Boss qualifies in 13 years). Prime hospital is BIMC; Singapore for serious care.',
    relocationCost: 10000,
  },
  {
    id: 'japan',
    name: 'Japan (Tokyo)',
    flag: '🇯🇵',
    annualSpend: 66000,   // $5.5k/mo: central Tokyo 2BR, NHI + supplement
    notes: 'NHI is excellent and cheap (~$300/mo couple post-65). Japanese language is the daily-life tax.',
    relocationCost: 20000,
  },
  {
    id: 'singapore',
    name: 'Singapore',
    flag: '🇸🇬',
    annualSpend: 120000,  // $10k/mo: condo $4-5k/mo + IPMI for older couple
    notes: 'Most expensive in Asia. Hard to get long-stay residency without employment. IPMI ~$8-10k/yr for 50s couple.',
    relocationCost: 20000,
  },
];

// ====================================================================
// RUN CALCULATIONS
// ====================================================================

function buildInputsForCountry(country, mode) {
  const legacy = {
    ...ROGER_BASELINE,
    selectedScenario: country.id,
    fireMode: mode,
  };

  const canonical = getCanonicalInputs(legacy);

  // Override the canonical annualSpendReal AFTER getCanonicalInputs.
  // The adapter looks up the dashboard's stale baseline; we want our 2026 research.
  const overridden = {
    ...canonical,
    annualSpendReal: country.annualSpend,
    scenarioSpendReal: country.annualSpend,
  };
  return Object.freeze(overridden);
}

function runCountry(country) {
  const results = {};
  for (const mode of ['safe', 'exact']) {
    try {
      const inputs = buildInputsForCountry(country, mode);
      const result = solveFireAge({ inputs, helpers: {} });
      results[mode] = {
        feasible: result.feasible,
        fireAge: result.fireAge,
        yearsToFire: result.yearsToFire,
        endBalanceReal: result.endBalanceReal,
        balanceAtUnlockReal: result.balanceAtUnlockReal,
        balanceAtSSReal: result.balanceAtSSReal,
        // FIRE number = annualSpend / SWR (4% rule)
        fireNumberSWR: country.annualSpend / 0.04,
        // FIRE number from solver: balance at fireAge that justifies retirement
        balanceAtFireAge: result.lifecycle.find(r => r.agePrimary === result.fireAge)?.totalReal ?? 0,
        // For lifetime spend reporting
        lifecycleLength: result.lifecycle.length,
      };
    } catch (err) {
      results[mode] = { error: err.message };
    }
  }
  return results;
}

// ====================================================================
// EXECUTE
// ====================================================================
const allResults = COUNTRIES.map(c => ({
  country: c,
  results: runCountry(c),
}));

console.log('\n=================================================================');
console.log('   FIRE Calculator — Multi-Country Comparison for Boss');
console.log('   Age 42 today, plan to age 100. Upper-middle-class lifestyle.');
console.log('=================================================================\n');

console.log('Baseline portfolio (from RR Dashboard):');
console.log(`  Roger 401(k) trad:      $${ROGER_BASELINE.roger401kTrad.toLocaleString()}`);
console.log(`  Roger 401(k) Roth:      $${ROGER_BASELINE.roger401kRoth.toLocaleString()}`);
console.log(`  Roger taxable stocks:   $${ROGER_BASELINE.rogerStocks.toLocaleString()}`);
console.log(`  Rebecca taxable stocks: $${ROGER_BASELINE.rebeccaStocks.toLocaleString()}`);
console.log(`  Cash + other:           $${(ROGER_BASELINE.cashSavings + ROGER_BASELINE.otherAssets).toLocaleString()}`);
const totalNW = ROGER_BASELINE.roger401kTrad + ROGER_BASELINE.roger401kRoth +
                ROGER_BASELINE.rogerStocks + ROGER_BASELINE.rebeccaStocks +
                ROGER_BASELINE.cashSavings + ROGER_BASELINE.otherAssets;
console.log(`  TOTAL NET WORTH:        $${totalNW.toLocaleString()}\n`);

console.log('Annual contributions:');
console.log(`  Monthly savings:  $${(ROGER_BASELINE.monthlySavings * 12).toLocaleString()}/yr`);
console.log(`  401k Trad:        $${ROGER_BASELINE.contrib401kTrad.toLocaleString()}/yr`);
console.log(`  401k Roth:        $${ROGER_BASELINE.contrib401kRoth.toLocaleString()}/yr`);
console.log(`  Employer match:   $${ROGER_BASELINE.empMatch.toLocaleString()}/yr`);
const totalContrib = ROGER_BASELINE.monthlySavings * 12 + ROGER_BASELINE.contrib401kTrad +
                     ROGER_BASELINE.contrib401kRoth + ROGER_BASELINE.empMatch;
console.log(`  TOTAL ANNUAL:     $${totalContrib.toLocaleString()}/yr\n`);

console.log('Assumptions: 7% nominal return, 3% inflation = 4% real. SS claim age 67. End age 100.');
console.log('SAFE mode = 2× spend buffer at age 60 + 3× spend buffer at age 67 + lifecycle feasible.');
console.log('EXACT mode = lifecycle feasible to age 100 with end balance ≥ 0.\n');
console.log('=================================================================\n');

// Print results table
console.log('SAFE MODE (recommended for retirement planning):');
console.log('-----------------------------------------------------------------');
console.log('Country                        | Annual$   | Yrs | FIRE@ | EndBal($)');
console.log('-----------------------------------------------------------------');
for (const r of allResults) {
  const safe = r.results.safe;
  if (safe.error) {
    console.log(`${(r.country.flag + ' ' + r.country.name).padEnd(31)} | ERROR: ${safe.error}`);
    continue;
  }
  const annual = '$' + (r.country.annualSpend / 1000).toFixed(0) + 'k';
  const yrs = safe.feasible ? safe.yearsToFire.toString() : 'N/A';
  const fireAge = safe.feasible ? safe.fireAge.toString() : 'N/A';
  const endBal = safe.feasible ? '$' + (safe.endBalanceReal / 1e6).toFixed(2) + 'M' : 'INFEASIBLE';
  console.log(`${(r.country.flag + ' ' + r.country.name).padEnd(31)} | ${annual.padStart(9)} | ${yrs.padStart(3)} | ${fireAge.padStart(5)} | ${endBal}`);
}

console.log('\nEXACT MODE (no buffer; tighter, end balance ≥ 0):');
console.log('-----------------------------------------------------------------');
console.log('Country                        | Annual$   | Yrs | FIRE@ | EndBal($)');
console.log('-----------------------------------------------------------------');
for (const r of allResults) {
  const exact = r.results.exact;
  if (exact.error) {
    console.log(`${(r.country.flag + ' ' + r.country.name).padEnd(31)} | ERROR: ${exact.error}`);
    continue;
  }
  const annual = '$' + (r.country.annualSpend / 1000).toFixed(0) + 'k';
  const yrs = exact.feasible ? exact.yearsToFire.toString() : 'N/A';
  const fireAge = exact.feasible ? exact.fireAge.toString() : 'N/A';
  const endBal = exact.feasible ? '$' + (exact.endBalanceReal / 1e6).toFixed(2) + 'M' : 'INFEASIBLE';
  console.log(`${(r.country.flag + ' ' + r.country.name).padEnd(31)} | ${annual.padStart(9)} | ${yrs.padStart(3)} | ${fireAge.padStart(5)} | ${endBal}`);
}

// Save JSON for downstream Excel/PPTX builders
import { writeFileSync } from 'fs';
const out = {
  generated: new Date().toISOString(),
  baseline: { ...ROGER_BASELINE, totalNetWorth: totalNW, totalAnnualContribution: totalContrib },
  countries: allResults.map(r => ({
    id: r.country.id,
    name: r.country.name,
    flag: r.country.flag,
    annualSpend: r.country.annualSpend,
    notes: r.country.notes,
    relocationCost: r.country.relocationCost,
    safe: r.results.safe,
    exact: r.results.exact,
    fireNumberSWR: r.country.annualSpend / 0.04,
    lifetimeSpend58yrs: r.country.annualSpend * 58,  // 58 years from 42 to 100
  })),
};
writeFileSync('/sessions/modest-confident-hypatia/mnt/outputs/country-fire-results.json',
              JSON.stringify(out, null, 2));
console.log('\nResults written to outputs/country-fire-results.json');
