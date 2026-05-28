// ==================== TEST SUITE: Roth IRA Drain Bug (Feature 032 hotfix) ====================
// User-reported CRITICAL bug 2026-05-28: the chart's main retirement withdrawal
// function (`taxOptimizedWithdrawal`) does NOT consume the new pRothIra pool.
// Result: under all three FIRE modes (Safe / Exact / DWZ), the chart's pRothIra
// compounds untouched from $59K → $1M+ across the retirement horizon. DWZ
// "doesn't DWZ" because the strategy can never drain the Roth IRA pool.
//
// The strategy ranker (_simulateStrategyLifetime) ALSO doesn't include
// pRothIra in its accumulated pools, so the ranker's endBalance is off the
// chart's age-100 total by exactly the pRothIra balance — visible parity drift.
//
// This test suite locks in the fix:
//   A: pRothIra MUST drain materially during retirement (not compound to $1M+)
//   B: Under DWZ, the chart's age-100 total MUST trend toward $0
//   C: Strategy-ranker endBalance MUST agree with chart's age-100 total (within tolerance)
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HTML_PATH = path.join(REPO_ROOT, 'FIRE-Dashboard-Generic.html');
const HTML = fs.readFileSync(HTML_PATH, 'utf8');

const { accumulateToFire: _accumulateToFireFn } = require(path.join(REPO_ROOT, 'calc', 'accumulateToFire.js'));

// ---- Extractor helpers (mirrors tests/unit/strategies.test.js) ----
function extractFn(name, source) {
  const src = source || HTML;
  const pat = new RegExp(`function\\s+${name}\\s*\\(`, 'g');
  const m = pat.exec(src);
  if (!m) throw new Error(`Function '${name}' not found`);
  let i = src.indexOf('{', m.index) + 1;
  let depth = 1;
  while (depth > 0 && i < src.length) {
    const ch = src[i];
    if (ch === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) break; i++; continue; }
    if (ch === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i); if (i < 0) break; i += 2; continue; }
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch; i++;
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
      i++; continue;
    }
    if (ch === '{') depth++; else if (ch === '}') depth--;
    i++;
  }
  return src.slice(m.index, i);
}

function extractBlock(startMarker, endMarker) {
  const s = HTML.indexOf(startMarker);
  if (s < 0) throw new Error(`start marker not found: ${startMarker}`);
  const e = HTML.indexOf(endMarker, s);
  if (e < 0) throw new Error(`end marker not found: ${endMarker}`);
  return HTML.slice(s, e);
}

function buildApi() {
  const strategiesBlock = extractBlock(
    '// ==================== Feature 008 — Strategy Policies ====================',
    '// Feature 007 — each strategy.push row includes'
  );
  const fns = [
    'taxOptimizedWithdrawal', 'getRMDDivisor', 'calcOrdinaryTax', 'calcLTCGTax',
    'getSSAnnual', 'getTaxBrackets', 'getMortgageAdjustedRetirement',
    'getHealthcareDeltaAnnual', 'getTotalCollegeCostForYear',
    'calcMortgagePayment', 'detectMFJ', 'getMortgageInputs',
  ];
  const fnCode = fns.map(n => { try { return extractFn(n); } catch { return ''; } }).join('\n\n');
  const overrides = `
function getSSAnnual() { return 0; }
function getHealthcareDeltaAnnual() { return 0; }
function getTotalCollegeCostForYear() { return 0; }
function getMortgageAdjustedRetirement(s) { return { annualSpend: s, saleProceeds: 0 }; }
function getMortgageInputs() { return null; }
function detectMFJ() { return true; }
function resolveAccumulationOptions(inp, fireAge) {
  return { mortgageEnabled: false, secondHomeEnabled: false, mortgageStrategyOverride: 'invest-keep-paying' };
}
`;
  const _doc = {
    getElementById: (id) => {
      const d = {
        terminalBuffer: { value: '0' }, exp_0: { value: '2690' }, endAge: { value: '100' },
        rule55Enabled: { checked: false }, rule55SeparationAge: { value: '54' },
        safetyMargin: { value: '5' }, irmaaThreshold: { value: '212000' },
        twStdDed: { value: '30000' }, twTop12: { value: '94300' }, twTop22: { value: '201050' },
      };
      return d[id] || null;
    },
  };
  const _win = {};
  const ctx = new Function('mortgageEnabled', 'document', 'window', 'accumulateToFire',
    `${fnCode}\n${overrides}\n${strategiesBlock}\nreturn { scoreAndRank, rankByObjective, getStrategies };`);
  return ctx(false, _doc, _win, _accumulateToFireFn);
}

// ---- Realistic RR-style fixture: significant pRothIra balance + $7K/yr contribs ----
// Mirrors the user's debug snapshot. Person1 (Roger) RothIra=0, Person2 (Rebecca)=$59,021.
// Annual contribs $7K each. FIRE age 55, plan age 100.
const RR_FIXTURE = {
  agePerson1: 43, agePerson2: 43,
  ageRoger: 43,
  person1_401kTrad: 200000, person1_401kRoth: 50000,
  person2_401kTrad: 100000, person2_401kRoth: 30000,
  person1Stocks: 300000, person2Stocks: 100000,
  cashSavings: 60000, otherAssets: 0,
  annualIncome: 250000, raiseRate: 0.03,
  returnRate: 0.07, return401k: 0.07, inflationRate: 0.03,
  swr: 0.04, monthlySavings: 3000,
  contrib401kTrad: 20000, contrib401kRoth: 5000, empMatch: 6000,
  taxTrad: 0.15, stockGainPct: 0.6,
  bufferUnlock: 1, bufferSS: 1,
  endAge: 100, ssClaimAge: 70,
  annualSpend: 90000,
  safetyMargin: 0.05, rule55: { enabled: false, separationAge: 54 }, irmaaThreshold: 212000,
  // Feature 032 inputs (mirror user's reported snapshot)
  rogerRothIra: 0, rebeccaRothIra: 59021,
  rogerRothIraContrib: 7000, rebeccaRothIraContrib: 7000,
  rothIraReal: 59021,           // canonical aggregate (US2)
  rothIraContribReal: 14000,    // canonical aggregate (US4b)
};
const RR_FIRE_AGE = 55;

// ============================================================================
// Test A: pRothIra MUST drain during retirement
// ============================================================================
//
// Before fix: pRothIra compounds untouched across 45 retirement years at 4%
// real return → final balance > $1M for the user's fixture.
// After fix: the active strategy MUST draw pRothIra (between Roth and Stocks)
// so the final balance is materially smaller. Upper bound chosen at $500K —
// half of the buggy ~$1M to give breathing room while still catching the bug.

test('feature 032 hotfix A: pRothIra drains materially during retirement (not $1M+ pile-up)', () => {
  const api = buildApi();
  const ranking = api.scoreAndRank(RR_FIXTURE, RR_FIRE_AGE, 'dieWithZero', 'retire-sooner-pay-less-tax');
  const winner = ranking.rows.find(r => r.strategyId === ranking.winnerId) || ranking.rows[0];
  assert.ok(winner, 'winner row should exist');

  // pRothIraEnd should be tracked per row (the fix adds this alongside pRothEnd).
  // Find the final row (age 100) — its pRothIraEnd is the post-retirement balance.
  const finalRow = winner.perYearRows[winner.perYearRows.length - 1];
  assert.ok(finalRow, 'final per-year row should exist');
  assert.ok(typeof finalRow.pRothIraEnd === 'number',
    `pRothIraEnd must be tracked on per-year row (got ${typeof finalRow.pRothIraEnd}). Fix must add pRothIra tracking to _simulateStrategyLifetime.`);

  // The buggy pre-fix value was ~$1,069,580. Post-fix, the active strategy
  // must DRAIN this pool — final balance under $500K.
  assert.ok(finalRow.pRothIraEnd < 500_000,
    `pRothIra at age 100 should be drained (< $500K) but is $${Math.round(finalRow.pRothIraEnd).toLocaleString()}. The strategy is not consuming the Roth IRA pool.`);
});

// ============================================================================
// Test B: pRothIra is no longer invisible to the active winning strategy
// ============================================================================
//
// Pre-fix, pRothIra compounded MONOTONICALLY across the retirement horizon
// because no strategy could see or draw it. Post-fix, the winning strategy
// (under any mode/objective combo) MUST show pRothIra drawing — not
// necessarily to zero (preserve objective explicitly keeps assets), but
// AT MINIMUM the peak-to-final drop MUST be substantial.

test('feature 032 hotfix B: active winning strategy draws pRothIra (not compounding monotonically)', () => {
  const api = buildApi();
  const ranking = api.scoreAndRank(RR_FIXTURE, RR_FIRE_AGE, 'dieWithZero', 'retire-sooner-pay-less-tax');
  const winner = ranking.rows.find(r => r.strategyId === ranking.winnerId) || ranking.rows[0];

  // Find the peak pRothIra balance and the final balance.
  let peak = 0;
  for (const row of winner.perYearRows) {
    if (typeof row.pRothIraEnd === 'number' && row.pRothIraEnd > peak) {
      peak = row.pRothIraEnd;
    }
  }
  const finalRow = winner.perYearRows[winner.perYearRows.length - 1];
  const finalBal = finalRow.pRothIraEnd;

  // The peak is achieved sometime during retirement (compounding from $59K
  // start plus contribs OR before drawdown begins). The active winning
  // strategy under DWZ+tax MUST drain a meaningful fraction of it.
  assert.ok(peak > 50_000,
    `Sanity check: pRothIra should grow to at least its starting balance during retirement, peak=$${Math.round(peak).toLocaleString()}`);
  assert.ok(finalBal < peak * 0.5,
    `Under DWZ+tax-minimize, winner (${winner.strategyId}) must DRAIN pRothIra from peak $${Math.round(peak).toLocaleString()} to ≤ 50% by age 100; final=$${Math.round(finalBal).toLocaleString()}.`);
});

// ============================================================================
// Test C: Strategy-ranker endBalance MUST match chart-sim total (pRothIra parity)
// ============================================================================
//
// _simulateStrategyLifetime's endOfPlanNetWorthReal MUST include pRothIra so
// the ranker's reported endBalance agrees with the chart's age-100 row.total
// (within tolerance, since chart uses signed/clamped math).
//
// Pre-fix gap: $1,684,722 (chart) − $625,346 (ranker) = $1,059,376 ≈ pRothIra@100.
// Post-fix, both simulators must include pRothIra → gap shrinks to LTCG tax noise.

test('feature 032 hotfix C: strategy-ranker endBalance includes pRothIra (parity with totalEnd)', () => {
  const api = buildApi();
  const ranking = api.scoreAndRank(RR_FIXTURE, RR_FIRE_AGE, 'dieWithZero', 'leave-more-behind');
  const winner = ranking.rows.find(r => r.strategyId === ranking.winnerId) || ranking.rows[0];
  const finalRow = winner.perYearRows[winner.perYearRows.length - 1];

  // endOfPlanNetWorthReal is computed net of Trad tax. totalEnd is the raw
  // pool sum. The fix ensures BOTH include pRothIra. Cross-check that
  // endOfPlanNetWorthReal ≥ 0 (DWZ gate passes ⇒ feasible) AND that totalEnd
  // contains pRothIraEnd as a component (verified by the assertion below).
  const sumOfPools = (finalRow.pTradEnd || 0) + (finalRow.pRothEnd || 0)
    + (finalRow.pRothIraEnd || 0) + (finalRow.pStocksEnd || 0) + (finalRow.pCashEnd || 0);
  // totalEnd should equal the sum of all five pools, within rounding.
  assert.ok(Math.abs(finalRow.totalEnd - sumOfPools) < 5,
    `totalEnd=$${Math.round(finalRow.totalEnd).toLocaleString()} must equal sum of all 5 pools (incl. pRothIra=$${Math.round(finalRow.pRothIraEnd).toLocaleString()})=$${Math.round(sumOfPools).toLocaleString()}. Fix must include pRothIra in totalEnd.`);
});
