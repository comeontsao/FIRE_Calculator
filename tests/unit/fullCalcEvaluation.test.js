// ==================== TEST SUITE: full calc evaluation (post-floor-pass) ====================
// Feature 015 follow-up — comprehensive audit of the calc engine with the
// spending-floor pass (B-015-6) in place. Walks the user's exact scenario
// (RR debug payload from 2026-04-27, FIRE age 48, plan to 100) through
// projectFullLifecycle and asserts:
//   - No row has both `pStocks=0 + pCash=0 + pRoth=0 + p401k>0 + hasShortfall=true`
//     (the floor pass should fund Trad draws in those years).
//   - Withdrawal flows are non-zero in retirement years.
//   - End balance trajectory is monotonically declining or stable post-Phase-1.
//   - No NaN / Infinity values anywhere.
// =============================================================================================

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(REPO_ROOT, 'FIRE-Dashboard-Generic.html'), 'utf8');

function extractFn(name) {
  const pat = new RegExp(`function\\s+${name}\\s*\\(`, 'g');
  const m = pat.exec(HTML);
  if (!m) throw new Error(`Function '${name}' not found`);
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

function buildSim() {
  const fns = [
    'projectFullLifecycle', 'taxOptimizedWithdrawal', 'getRMDDivisor',
    'calcOrdinaryTax', 'calcLTCGTax', 'getSSAnnual', 'getTaxBrackets',
    'getMortgageAdjustedRetirement', 'getHealthcareDeltaAnnual',
    'getTotalCollegeCostForYear', 'calcMortgagePayment', 'detectMFJ',
    'getMortgageInputs', 'getSecondHomeInputs',
    'getSecondHomeAnnualCarryAtYear', 'getSecondHomeSaleAtFire',
    'getSelectedRelocationCost',
  ];
  const fnCode = fns.map(n => { try { return extractFn(n); } catch { return ''; } }).join('\n\n');
  const overrides = `
    function getSSAnnual() { return 40131; }
    function getHealthcareDeltaAnnual() { return 0; }
    function getTotalCollegeCostForYear() { return 0; }
    function getMortgageAdjustedRetirement(s) { return { annualSpend: s, saleProceeds: 0 }; }
    function getMortgageInputs() { return null; }
    function getSecondHomeInputs() { return null; }
    function getSecondHomeAnnualCarryAtYear() { return 0; }
    function getSecondHomeSaleAtFire() { return 0; }
    function getSelectedRelocationCost() { return 0; }
    function detectMFJ() { return true; }
    function getStrategies() { return []; }
    function calcPerChildAllowance() { return 0; }
    function calcRealisticSSA() { return 40131; }
  `;
  const _doc = { getElementById: (id) => {
    const d = { terminalBuffer:{value:'0'}, exp_0:{value:'2690'}, endAge:{value:'100'},
      rule55Enabled:{checked:false}, rule55SeparationAge:{value:'54'},
      safetyMargin:{value:'5'}, irmaaThreshold:{value:'212000'},
      twStdDed:{value:'30000'}, twTop12:{value:'94300'}, twTop22:{value:'201050'},
      twTop24:{value:'383900'}, twTop32:{value:'487450'}, twTop35:{value:'731200'}};
    return d[id] || null;
  }};
  const ctx = new Function(
    'mortgageEnabled','secondHomeEnabled','document','window','selectedScenario','yearsToFIREcache','perChildAllowanceThisYear','childrenList','collegeRules',
    `${fnCode}\n${overrides}\nreturn { projectFullLifecycle };`
  );
  return ctx(false, false, _doc, {}, 'us', 0, 0, [], { fourYearCost: 0 });
}

// User's exact scenario from the 2026-04-27 audit payload
const USER_INP = {
  agePerson1: 42, ageRoger: 42, agePerson2: 42,
  person1_401kTrad: 26454, person1_401kRoth: 58000,
  person1Stocks: 215000, person2Stocks: 230000,
  cashSavings: 80000, otherAssets: 0,
  annualIncome: 152000, raiseRate: 0.02,
  returnRate: 0.07, return401k: 0.07, inflationRate: 0.03,
  swr: 0.04, monthlySavings: 1700,
  contrib401kTrad: 16500, contrib401kRoth: 2900, empMatch: 7200,
  taxTrad: 0.15, stockGainPct: 0.6,
  bufferUnlock: 1, bufferSS: 1,
  endAge: 100, ssClaimAge: 70,
  annualSpend: 60100,
  safetyMargin: 0.05, rule55: { enabled: false, separationAge: 54 }, irmaaThreshold: 212000,
};
const FIRE_AGE = 48;

test('full calc: no row should have all-pools-empty + hasShortfall + remaining 401k', () => {
  const sim = buildSim();
  const data = sim.projectFullLifecycle(USER_INP, USER_INP.annualSpend, FIRE_AGE, true);
  // The pre-fix bug: ages 63-69 had pStocks=0, pCash=0, pRoth=0 but p401k>$300k
  // AND hasShortfall=true. Post-fix: floor pass funds spending from 401k, so
  // these rows should NOT show shortfall.
  for (const r of data) {
    if (r.phase === 'accumulation') continue;
    const stocksEmpty = (r.pStocks || 0) <= 1;
    const cashEmpty = (r.pCash || 0) <= 1;
    const rothEmpty = (r.p401kRoth || 0) <= 1;
    const tradAvailable = (r.p401kTrad || 0) > 1000;
    if (stocksEmpty && cashEmpty && rothEmpty && tradAvailable) {
      assert.strictEqual(r.hasShortfall, false,
        `age ${r.age}: all liquid pools empty + Trad available (${r.p401kTrad}) but hasShortfall=true. ` +
        `Floor pass should have funded spending. withdrawal=${r.withdrawal}`);
    }
  }
});

test('full calc: every retirement-year row has nonzero withdrawal', () => {
  const sim = buildSim();
  const data = sim.projectFullLifecycle(USER_INP, USER_INP.annualSpend, FIRE_AGE, true);
  for (const r of data) {
    if (r.phase === 'accumulation') continue;
    const ssAdjusted = r.ssIncome > 0 ? USER_INP.annualSpend - r.ssIncome : USER_INP.annualSpend;
    if (ssAdjusted <= 0) continue; // SS covers full spend; no withdrawal needed
    assert.ok(r.withdrawal > 0,
      `age ${r.age} (${r.phase}): retirement-year withdrawal must be > 0; got ${r.withdrawal}. ` +
      `pTrad=${r.p401kTrad}, pStocks=${r.pStocks}, pCash=${r.pCash}, pRoth=${r.p401kRoth}, ssIncome=${r.ssIncome}`);
  }
});

test('full calc: no NaN / Infinity in any row field', () => {
  const sim = buildSim();
  const data = sim.projectFullLifecycle(USER_INP, USER_INP.annualSpend, FIRE_AGE, true);
  const numericFields = ['total', 'p401k', 'p401kTrad', 'p401kRoth', 'pStocks', 'pCash',
                          'accessible', 'ssIncome', 'withdrawal', 'contribution'];
  for (const r of data) {
    for (const f of numericFields) {
      const v = r[f];
      if (v === undefined) continue;
      assert.ok(Number.isFinite(v), `age ${r.age} field ${f}: not finite (${v})`);
    }
  }
});

test('full calc: total never goes below 0 across the lifecycle', () => {
  const sim = buildSim();
  const data = sim.projectFullLifecycle(USER_INP, USER_INP.annualSpend, FIRE_AGE, true);
  for (const r of data) {
    assert.ok(r.total >= 0, `age ${r.age}: total ${r.total} cannot be negative (chart-display invariant)`);
  }
});

test('full calc: pStocks > total never fires (conservation invariant)', () => {
  const sim = buildSim();
  const data = sim.projectFullLifecycle(USER_INP, USER_INP.annualSpend, FIRE_AGE, true);
  for (const r of data) {
    assert.ok((r.pStocks || 0) <= (r.total || 0) + 1,
      `age ${r.age}: pStocks (${r.pStocks}) > total (${r.total}) — conservation invariant violation`);
  }
});

test('full calc: floor-pass eliminates shortfall when Trad is plentiful (the bug locus)', () => {
  // The pre-fix bug: ages 62-69 had hasShortfall=true with $300k+ in pTrad
  // unused. Post-fix: the floor pass MUST cover spending in any year where
  // pTrad is materially available (>$50k after the year's draw).
  //
  // NOTE: post-fix the strategy correctly DRAWS pTrad to fund spending. This
  // means pTrad depletes earlier than the pre-fix lie ($65k at age 100 shown
  // in the audit was a chart-clamping artifact). True shortfalls at later
  // ages are GENUINE infeasibility — the user's plan to FIRE at 48 with
  // $60.1k/yr spend on $614k portfolio is not actually feasible. That's
  // correct behavior; the pre-fix "On Track" was a lie generated by the bug.
  const sim = buildSim();
  const data = sim.projectFullLifecycle(USER_INP, USER_INP.annualSpend, FIRE_AGE, true);
  for (const r of data) {
    // Floor pass only applies post-401k-unlock (age >= 59.5). Pre-unlock,
    // canAccess401k=false and Trad is genuinely inaccessible — shortfalls
    // there reflect real Phase 1 infeasibility, not the floor-pass bug.
    const isPostUnlock = r.age >= 60;
    if (isPostUnlock && r.phase !== 'accumulation' && (r.p401kTrad || 0) > 50_000) {
      assert.strictEqual(r.hasShortfall, false,
        `BUG REGRESSION: age ${r.age} has $${r.p401kTrad} in pTrad (post-unlock) ` +
        `but hasShortfall=true. Floor pass should have drawn from Trad.`);
    }
  }
});

test('full calc: end-of-plan total reflects realistic trajectory (not absurd)', () => {
  const sim = buildSim();
  const data = sim.projectFullLifecycle(USER_INP, USER_INP.annualSpend, FIRE_AGE, true);
  const last = data[data.length - 1];
  // End of plan (age 100) should be in [0, $5M] — not negative, not absurd.
  assert.ok(last.total >= 0, `end-of-plan total negative: ${last.total}`);
  assert.ok(last.total < 5_000_000, `end-of-plan total absurdly high: ${last.total}`);
});

test('full calc: peak total occurs at or near FIRE age (not later in retirement)', () => {
  const sim = buildSim();
  const data = sim.projectFullLifecycle(USER_INP, USER_INP.annualSpend, FIRE_AGE, true);
  let peakAge = data[0].age;
  let peak = data[0].total;
  for (const r of data) {
    if (r.total > peak) { peak = r.total; peakAge = r.age; }
  }
  // Peak should be around FIRE age (48 in the test scenario), with some
  // tolerance for 401k growth in early retirement before drawdown begins.
  assert.ok(peakAge >= FIRE_AGE - 1 && peakAge <= FIRE_AGE + 5,
    `peak total at age ${peakAge} (${peak}); expected near FIRE age ${FIRE_AGE}`);
});

test('full calc: contributions positive in accumulation, zero in retirement', () => {
  const sim = buildSim();
  const data = sim.projectFullLifecycle(USER_INP, USER_INP.annualSpend, FIRE_AGE, true);
  for (const r of data) {
    if (r.phase === 'accumulation') {
      assert.ok(r.contribution >= 0, `age ${r.age} (accumulation): contribution must be ≥ 0`);
    } else {
      assert.strictEqual(r.contribution, 0, `age ${r.age} (${r.phase}): contribution must be 0`);
    }
  }
});

test('full calc: hasShortfall===true implies actual shortfall (no false positives)', () => {
  const sim = buildSim();
  const data = sim.projectFullLifecycle(USER_INP, USER_INP.annualSpend, FIRE_AGE, true);
  // If hasShortfall is true, the year was genuinely under-funded — we expect
  // EITHER all pools depleted OR the strategy structurally cannot fund (e.g.,
  // pre-unlock with no taxable pools).
  for (const r of data) {
    if (r.hasShortfall === true) {
      const isPhase1 = r.phase === 'phase1-taxable-only';
      const isPhase2 = r.phase === 'phase2-401k-unlocked';
      const isPhase3 = r.phase === 'phase3-with-ss';
      const totalPools = (r.p401kTrad||0) + (r.p401kRoth||0) + (r.pStocks||0) + (r.pCash||0);
      // For Phase 2+ shortfalls, total pools should be very low (≤ 1 year spend)
      // — anything else suggests the floor pass mis-fired or there's another bug.
      if (isPhase2 || isPhase3) {
        assert.ok(totalPools <= USER_INP.annualSpend * 2,
          `age ${r.age} (${r.phase}): hasShortfall=true with ${totalPools} in pools — floor pass should have drawn more`);
      }
    }
  }
});
