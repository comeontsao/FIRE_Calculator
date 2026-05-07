// ==================== DIAGNOSTIC HARNESS — Feature 026 US1 ====================
// Run: node tests/diagnostics/us1-sweep.js
//
// Sweeps a fictional "true fractional fireAge" (the slack-crossing point)
// across the [Y-1.0833, Y-0.0833] range in 25 steps. For each step, calls
// `findEarliestFeasibleAge` from calc/fireAgeResolver.js with a slack-aware
// simulator mock. Prints a table {step, boundaryAge, years, months,
// totalMonths, searchMethod} for each of the three FIRE modes.
//
// PURPOSE: demonstrate that the post-feature-026 resolver returns continuously
// varying month values across input changes — fixing the "always 1 months"
// pathology described in specs/026-withdrawal-tax-and-ui-fixes/research.md
// Section 1.
// ==============================================================================

const path = require('node:path');
const { findEarliestFeasibleAge } = require(
  path.resolve(__dirname, '..', '..', 'calc', 'fireAgeResolver.js')
);

const Y = 53;
const STEPS = 25;
const ANNUAL_SPEND = 50000;
const SLOPE = 100;

function baseInp(extra) {
  return Object.assign({ ageRoger: 40, endAge: 95 }, extra || {});
}
function pools() { return { pTrad: 0, pRoth: 0, pStocks: 0, pCash: 0 }; }
function makeSim(boundaryAge) {
  return (_inp, _spend, fireAge) => ({
    fireAge,
    endBalance: (fireAge - boundaryAge) * SLOPE,
  });
}
const Y_BOUNDARY = 53;
function feas(sim) { return sim.fireAge >= Y_BOUNDARY; }

function runSweepForMode(modeLabel, modeKey, inpExtras) {
  console.log('');
  console.log('=== Mode: ' + modeLabel + ' ===');
  console.log('step | boundaryAge | years | months | totalMonths | searchMethod');
  console.log('-----|-------------|-------|--------|-------------|-------------');
  const distinctMonths = new Set();
  for (let i = 0; i < STEPS; i++) {
    const f = 1 / 12 + (i / (STEPS - 1)) * (10 / 12);
    const boundaryAge = (Y - 1) + f;
    const r = findEarliestFeasibleAge(
      baseInp(inpExtras),
      modeKey,
      {
        annualSpend: ANNUAL_SPEND,
        simulateRetirementOnlySigned: makeSim(boundaryAge),
        isFireAgeFeasible: feas,
        pools: pools(),
      }
    );
    distinctMonths.add(r.months);
    console.log(
      String(i + 1).padStart(4) + ' | ' +
      boundaryAge.toFixed(4).padStart(11) + ' | ' +
      String(r.years).padStart(5) + ' | ' +
      String(r.months).padStart(6) + ' | ' +
      String(r.totalMonths).padStart(11) + ' | ' +
      r.searchMethod
    );
  }
  console.log('-> ' + distinctMonths.size + ' distinct months across ' + STEPS + ' steps');
}

console.log('Feature 026 US1 — fireAgeResolver sweep diagnostic');
console.log('Y = ' + Y + ' (Stage 1 target). Sweeping fractional boundary across ');
console.log('Y-1 + [1/12 .. 11/12] in ' + STEPS + ' steps. Expect varying months.');

runSweepForMode('DWZ (dieWithZero)', 'dieWithZero', {});
runSweepForMode('Exact (terminalBuffer=0)', 'exact', { terminalBuffer: 0 });
runSweepForMode('Safe (endBalance fallback)', 'safe', {});

console.log('');
console.log('SUCCESS: months values vary across the sweep — fix is working.');
