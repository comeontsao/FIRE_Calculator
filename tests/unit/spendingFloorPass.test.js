// ==================== TEST SUITE: spending-floor pass (B-015-6) ====================
// Feature 015 follow-up — verifies taxOptimizedWithdrawal funds spending FIRST
// when only Trad 401k is available pre-SS, instead of letting bracket-fill
// smoothing cap the draw and produce a starvation-level shortfall.
//
// Scenario from user's audit (2026-04-27): age 65, pTrad=$325k, all other pools
// empty, grossSpend=$60.1k, ssIncome=0. Pre-fix: shortfall ≈ $50.8k. Post-fix:
// shortfall ≈ 0 (or trivially small from gross-up rounding).
// =====================================================================================

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HTML_PATH = path.join(REPO_ROOT, 'FIRE-Dashboard-Generic.html');
const HTML = fs.readFileSync(HTML_PATH, 'utf8');

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

function buildApi() {
  const fns = ['taxOptimizedWithdrawal','calcOrdinaryTax','calcLTCGTax','getRMDDivisor'];
  const fnCode = fns.map(n => extractFn(n)).join('\n\n');
  const ctx = new Function(`${fnCode}\nreturn { taxOptimizedWithdrawal };`);
  return ctx();
}

const BRACKETS = {
  stdDed: 30000, top10: 23200, top12: 94300, top22: 201050,
  top24: 383900, top32: 487450, top35: 731200,
  ltcg0Top: 94050, ltcg15Top: 583750, // LTCG bands required by calcLTCGTax
};

test('floor pass: only-Trad pre-SS scenario funds spending (was a $50k shortfall pre-fix)', () => {
  const { taxOptimizedWithdrawal } = buildApi();
  // User's exact scenario: age 65, pTrad=$325k, no other pools, $60.1k spend, no SS
  const r = taxOptimizedWithdrawal(
    /*grossSpend*/ 60100, /*ssIncome*/ 0,
    /*pTrad*/ 325000, /*pRoth*/ 0, /*pStocks*/ 0, /*pCash*/ 0,
    /*age*/ 65, BRACKETS, /*stockGainPct*/ 0.6,
    { safetyMargin: 0.05, endAge: 100, irmaaThreshold: 212000 }
  );
  // Pre-fix: wTrad ≈ $9286 (smoothed), shortfall ≈ $50,814
  // Post-fix: wTrad covers spending + tax, shortfall ≈ 0 (or tiny rounding residue)
  assert.ok(r.wTrad > 60000, `expected wTrad > $60k after floor pass, got $${r.wTrad}`);
  assert.ok(r.shortfall < 100,
    `expected shortfall ≈ 0 after floor pass, got $${r.shortfall}`);
});

test('floor pass: Roth available pre-SS — Roth is consumed BEFORE the floor pass kicks in', () => {
  const { taxOptimizedWithdrawal } = buildApi();
  // pTrad small ($50k); pRoth large ($200k). The original mix should fund from
  // Roth without needing the floor pass to grow wTrad.
  const r = taxOptimizedWithdrawal(
    60100, 0, 50000, 200000, 0, 0, 65, BRACKETS, 0.6,
    { safetyMargin: 0.05, endAge: 100 }
  );
  assert.strictEqual(r.shortfall, 0, 'shortfall must be 0 when Roth is sufficient');
  assert.ok(r.wRoth > 0, 'expected Roth to be drawn before floor pass');
});

test('floor pass: respects pTrad ceiling — cannot draw more than available', () => {
  const { taxOptimizedWithdrawal } = buildApi();
  // pTrad=$10k only — not enough to fund $60k spend. Floor pass draws ALL of pTrad
  // and the residual remains as shortfall.
  const r = taxOptimizedWithdrawal(
    60100, 0, 10000, 0, 0, 0, 65, BRACKETS, 0.6,
    { safetyMargin: 0.05, endAge: 100 }
  );
  assert.ok(r.wTrad <= 10000, `wTrad must respect pTrad ceiling, got ${r.wTrad}`);
  assert.ok(r.shortfall > 40000, `expected residual shortfall > $40k, got ${r.shortfall}`);
});

test('floor pass: deactivated when stocks are sufficient (no Trad over-draw)', () => {
  const { taxOptimizedWithdrawal } = buildApi();
  // Plenty of stocks AND plenty of Trad. The original mix funds entirely from
  // stocks + bracket-fill Trad — floor pass should NOT activate, wTrad should
  // stay at the smoothed bracket-fill level (~$9-12k for this scenario).
  const r = taxOptimizedWithdrawal(
    60100, 0, 325000, 0, 500000, 50000, 65, BRACKETS, 0.6,
    { safetyMargin: 0.05, endAge: 100 }
  );
  assert.strictEqual(r.shortfall, 0, 'shortfall must be 0 when stocks are sufficient');
  // wTrad should equal the bracket-fill smoothed cap (~$9,286 for this scenario)
  // — NOT inflated by the floor pass since stocks already cover spending.
  assert.ok(r.wTrad < 30000,
    `wTrad must stay near smoothed bracket-fill cap (no floor over-draw); got ${r.wTrad}`);
});

test('floor pass: pre-unlock case unchanged — cannot draw Trad before unlock age', () => {
  const { taxOptimizedWithdrawal } = buildApi();
  // Age 50 (pre-unlock), pTrad locked, all other pools empty. Shortfall stands;
  // no Trad floor pass because canAccess401k === false.
  const r = taxOptimizedWithdrawal(
    60100, 0, 325000, 0, 0, 0, 50, BRACKETS, 0.6,
    { safetyMargin: 0.05, endAge: 100 }
  );
  assert.strictEqual(r.wTrad, 0, 'pre-unlock: wTrad must remain 0');
  assert.ok(r.shortfall > 60000,
    `pre-unlock: shortfall must reflect inability to access 401k; got ${r.shortfall}`);
});

test('floor pass: SS-active scenario (age 70+) — SS reduces the shortfall before floor pass', () => {
  const { taxOptimizedWithdrawal } = buildApi();
  // Age 75, SS=$40k/yr, pTrad=$325k, no other pools. The floor pass needs to
  // cover only ~$20k of remaining spend (60.1 − 40 = 20.1).
  const r = taxOptimizedWithdrawal(
    60100, 40000, 325000, 0, 0, 0, 75, BRACKETS, 0.6,
    { safetyMargin: 0.05, endAge: 100 }
  );
  assert.strictEqual(r.shortfall, 0, 'shortfall must be 0 with SS + Trad available');
  assert.ok(r.wTrad >= 20000,
    `wTrad must cover the gap above SS income; got ${r.wTrad}`);
});

test('floor pass: idempotent — running on a fully-funded scenario does not over-draw', () => {
  const { taxOptimizedWithdrawal } = buildApi();
  // No shortfall scenario (lots of stocks). wTrad should match what
  // bracket-fill smoothing would compute — not inflated by floor pass.
  const r = taxOptimizedWithdrawal(
    60000, 0, 200000, 100000, 1_000_000, 100000, 65, BRACKETS, 0.6,
    { safetyMargin: 0.05, endAge: 100 }
  );
  assert.strictEqual(r.shortfall, 0);
  // wTrad should be the smoothed bracket-fill amount (~$5-12k typical)
  // — NOT $60k+, which would happen if floor pass over-fired.
  assert.ok(r.wTrad < 30000,
    `idempotency: wTrad ${r.wTrad} suggests floor pass mis-activated`);
});
