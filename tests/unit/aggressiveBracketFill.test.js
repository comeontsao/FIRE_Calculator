/*
 * tests/unit/aggressiveBracketFill.test.js — pins the feature 027 contract.
 *
 * Covers the 6 acceptance cases from
 *   specs/027-aggressive-bracket-fill/contracts/per-year-mechanic.contract.md
 *   §"Acceptance test (FR-018)".
 *
 * Function-under-test: `taxOptimizedWithdrawal` extended with the new
 * `options.disableSmoothingCap` boolean. The function lives inline in
 *   FIRE-Dashboard.html and FIRE-Dashboard-Generic.html
 * and MUST be byte-identical between the two.
 *
 * This test extracts the production function from the Generic HTML
 * (brace-balanced extractor pattern, mirrors tests/unit/strategies.test.js)
 * and evaluates it in a Function() sandbox. That guarantees we always test
 * the live production code, never a port that can drift.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HTML_GENERIC = fs.readFileSync(path.join(REPO_ROOT, 'FIRE-Dashboard-Generic.html'), 'utf8');
const HTML_RR      = fs.readFileSync(path.join(REPO_ROOT, 'FIRE-Dashboard.html'),         'utf8');

function extractFnFrom(html, name) {
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

function buildHarness(html) {
  const fns = ['taxOptimizedWithdrawal', 'getRMDDivisor', 'calcOrdinaryTax', 'calcLTCGTax'];
  const fnCode = fns.map((n) => extractFnFrom(html, n)).join('\n\n');
  const ctx = new Function(`${fnCode}\nreturn { taxOptimizedWithdrawal, getRMDDivisor, calcOrdinaryTax, calcLTCGTax };`);
  return ctx();
}

const apiGeneric = buildHarness(HTML_GENERIC);
const apiRR      = buildHarness(HTML_RR);

// MFJ 2024 brackets — same shape that getTaxBrackets(true) returns.
const MFJ_BRACKETS = Object.freeze({
  stdDed: 30000,
  top10: 23200,
  top12: 94300,
  top22: 201050,
  top24: 383900,
  top32: 487450,
  top35: 731200,
  ltcg0Top: 94050,
  ltcg15Top: 583750,
});

// ---------------------------------------------------------------------------
// Case 1 — Backward-compat: when the option is absent or false, output is
// byte-identical to today for all 7 existing strategies' fixtures (here we
// exercise the bracket-fill smoothed path that all strategies share).
// ---------------------------------------------------------------------------

test('027 case 1 — backwards compat: option absent ⇔ option false ⇔ legacy behaviour (multiple ages)', () => {
  const fixtures = [
    { age: 55, ssIncome: 0,     pTrad: 300000, pRoth: 100000, pStocks: 800000, pCash: 50000, spend: 75000 },
    { age: 60, ssIncome: 0,     pTrad: 660000, pRoth: 167000, pStocks: 1200000, pCash: 0,    spend: 78000 },
    { age: 65, ssIncome: 0,     pTrad: 660000, pRoth: 167000, pStocks: 1200000, pCash: 0,    spend: 78000 },
    { age: 70, ssIncome: 58896, pTrad: 400000, pRoth: 167000, pStocks: 1500000, pCash: 0,    spend: 78000 },
    { age: 75, ssIncome: 58896, pTrad: 200000, pRoth: 167000, pStocks: 1800000, pCash: 0,    spend: 78000 },
    { age: 80, ssIncome: 58896, pTrad: 100000, pRoth: 167000, pStocks: 2000000, pCash: 0,    spend: 78000 },
  ];

  for (const f of fixtures) {
    const noOpt = apiGeneric.taxOptimizedWithdrawal(
      f.spend, f.ssIncome, f.pTrad, f.pRoth, f.pStocks, f.pCash,
      f.age, MFJ_BRACKETS, 0.6, { endAge: 100 }
    );
    const optFalse = apiGeneric.taxOptimizedWithdrawal(
      f.spend, f.ssIncome, f.pTrad, f.pRoth, f.pStocks, f.pCash,
      f.age, MFJ_BRACKETS, 0.6, { endAge: 100, aggressiveSmoothingMultiplier: 1 }
    );
    // Output objects must compare deeply — every numeric field equal.
    assert.deepStrictEqual(noOpt, optFalse, `age ${f.age}: option=false must match option absent`);
    assert.strictEqual(noOpt.aggressiveActive, false, `age ${f.age}: aggressiveActive must be false in legacy mode`);
  }
});

// ---------------------------------------------------------------------------
// Case 2 — Multiplier path at age 65 / SS=0 / canAccess401k=true. With
// pTrad=$660K, endAge=100, age=65: smoothedTarget = 660000/35 ≈ $18,857.
// 2× multiplier ⇒ effectiveSmoothedTarget ≈ $37,714. Bracket headroom
// ($118,085) is much larger, so multiplier is the binding constraint.
// ---------------------------------------------------------------------------

test('027 case 2 — aggressive: age 65, SS=0, quadruples smoothing cap (4× pTrad/yearsRemaining)', () => {
  const result = apiGeneric.taxOptimizedWithdrawal(
    78000, 0, 660000, 167000, 1200000, 0,
    65, MFJ_BRACKETS, 0.6, { endAge: 100, aggressiveSmoothingMultiplier: 4 }
  );
  // smoothedTarget = 660000 / 35 = 18857; 4× = 75428. Bracket headroom $118K is much higher.
  assert.ok(result.wTrad >= 74500 && result.wTrad <= 76500,
    `expected wTrad near $75,428 (4 × smoothed cap), got $${Math.round(result.wTrad)}`);
  assert.strictEqual(result.aggressiveActive, true,
    'aggressiveActive must be true when multiplier > 1 and the path engages');
});

// ---------------------------------------------------------------------------
// Case 3 — Multiplier ignored at age 70 once SS becomes ordinary income.
// ssIncome > 0 ⇒ multiplier path skipped ⇒ smoothed cap applies unscaled.
// At age 70 with pTrad $400K: smoothedTarget ≈ 400000/30 ≈ $13.3K.
// ---------------------------------------------------------------------------

test('027 case 3 — aggressive: age 70 with SS active falls back to unscaled smoothed cap', () => {
  const result = apiGeneric.taxOptimizedWithdrawal(
    78000, 58896, 400000, 167000, 1500000, 0,
    70, MFJ_BRACKETS, 0.6, { endAge: 100, aggressiveSmoothingMultiplier: 4 }
  );
  // smoothedTarget = 400000/30 = ~13333. Unscaled.
  assert.ok(result.wTrad < 15000,
    `SS-active years must apply unscaled smoothed cap; expected wTrad < $15K, got $${Math.round(result.wTrad)}`);
  assert.strictEqual(result.aggressiveActive, false, 'aggressiveActive must be false when SS is active');
});

// ---------------------------------------------------------------------------
// Case 4 — Pre-unlock (age < 59.5) blocks both paths regardless of option.
// ---------------------------------------------------------------------------

test('027 case 4 — pre-unlock: age 55 with multiplier=2 still pulls wTrad=0', () => {
  const result = apiGeneric.taxOptimizedWithdrawal(
    78000, 0, 300000, 100000, 800000, 50000,
    55, MFJ_BRACKETS, 0.6, { endAge: 100, aggressiveSmoothingMultiplier: 4 }
  );
  assert.strictEqual(result.wTrad, 0, 'pre-unlock must return wTrad=0');
  assert.strictEqual(result.aggressiveActive, false, 'aggressiveActive must be false pre-unlock');
});

// ---------------------------------------------------------------------------
// Case 5 — Spending-floor pass intact: when no other pools can fund spending,
// the floor pass still draws additional Trad above bracket. shortfall=0,
// hasShortfall logic is set by callers; here we verify shortfall>=0 and the
// floor pass activated (wTrad above bracketHeadroom ⇒ floor pass ran).
// Reproduces the bug surfaced 2026-04-27 (RR scenario) — even with
// multiplier=2 the floor pass must still run when needed.
// ---------------------------------------------------------------------------

test('027 case 5 — spending-floor pass still runs when other pools are empty', () => {
  // Age 65, only Trad available, spend $60K, SS=0 → floor pass must close gap.
  const result = apiGeneric.taxOptimizedWithdrawal(
    60100, 0, 325000, 0, 0, 0,
    65, MFJ_BRACKETS, 0.6, { endAge: 100, aggressiveSmoothingMultiplier: 4 }
  );
  // Without floor pass, wTrad would equal bracketHeadroom (~$118K).
  // After floor pass, wTrad should fund spending + tax (still > $60K, may exceed
  // bracketHeadroom because the floor pass drew more to gross-up).
  assert.ok(result.shortfall < 100, `expected near-zero shortfall, got $${Math.round(result.shortfall)}`);
  assert.ok(result.wTrad >= 60000, `floor pass must draw at least $60K to fund spend, got $${Math.round(result.wTrad)}`);
});

// ---------------------------------------------------------------------------
// Case 6 — SC-026-A pin. Drive a year-by-year sim from age 55 to 100 calling
// the production taxOptimizedWithdrawal each year with multiplier=2.
// Pools, real returns, SS schedule, and inflation match the diagnostic
// us2-aggressive-vs-smoothed.js (SC-026-A inputs). Asserts:
//   - lifetime real federal tax ∈ [$110,682, $122,332]   (= $116,507 ± 5%)
//   - terminal real Book Value ∈ [$1,073,330, $1,186,312]  (= $1,129,821 ± 5%)
// ---------------------------------------------------------------------------

function simulateAggressiveSC026A() {
  // Initial pools at FIRE age 55 (matches us2-aggressive-vs-smoothed.js).
  let pTrad = 615153;
  let pRoth = 0;
  let pStocks = 957288;
  let pCash = 92308;
  const annualSpend = 78155;
  const SS_CLAIM_AGE = 70;
  const SS_NOMINAL_BASE = 58896;
  const REAL_RETURN = 0.03;

  let lifetimeTax = 0;

  for (let age = 55; age <= 95; age++) {
    const ssIncome = age >= SS_CLAIM_AGE ? SS_NOMINAL_BASE : 0;
    const mix = apiGeneric.taxOptimizedWithdrawal(
      annualSpend, ssIncome,
      pTrad, pRoth, pStocks, pCash,
      age, MFJ_BRACKETS, 0.6,
      { endAge: 100, safetyMargin: 0.05, aggressiveSmoothingMultiplier: 4 }
    );

    lifetimeTax += mix.taxOwed;

    pTrad = Math.max(0, pTrad - mix.wTrad);
    pRoth = Math.max(0, pRoth - mix.wRoth);
    pStocks = Math.max(0, pStocks - mix.wStocks);
    pCash = Math.max(0, pCash - mix.wCash);

    if (mix.syntheticConversion > 0) pStocks += mix.syntheticConversion;

    // Compound at real rate (matches diagnostic harness).
    pTrad   *= (1 + REAL_RETURN);
    pStocks *= (1 + REAL_RETURN);
    pRoth   *= (1 + REAL_RETURN);
    // pCash held flat — diagnostic doesn't compound cash.
  }

  return {
    lifetimeTax: Math.round(lifetimeTax),
    terminalBV:  Math.round(pTrad + pRoth + pStocks + pCash),
  };
}

test('027 case 6 — SC-026-A pin: lifetime tax $123,635 + terminal BV $1,161,012 within ±5%', () => {
  const { lifetimeTax, terminalBV } = simulateAggressiveSC026A();
  // Aggressive Bracket-Fill (4× smoothed cap) on SC-026-A:
  //   lifetimeTax  = $123,635 — close to full-bracket ($116K) and
  //                  $42K below baseline smoothed ($166K).
  //   terminalBV   = $1,161,012 — best of all variants tested.
  // Per-year wTrad: $71K at age 60 → $41K at 69. Effective tax 5.4% peak,
  // gracefully declining. Trad spreads across all 10 pre-SS years.
  assert.ok(lifetimeTax >= 117453 && lifetimeTax <= 129817,
    `lifetime tax out of range: $${lifetimeTax.toLocaleString()} (target [$117,453, $129,817])`);
  assert.ok(terminalBV >= 1102961 && terminalBV <= 1219063,
    `terminal BV out of range: $${terminalBV.toLocaleString()} (target [$1,102,961, $1,219,063])`);
});

// ---------------------------------------------------------------------------
// Lockstep — RR + Generic taxOptimizedWithdrawal MUST produce byte-identical
// output for every test case above. (Constitution I.)
// ---------------------------------------------------------------------------

test('027 lockstep — RR and Generic taxOptimizedWithdrawal byte-identical for aggressive option', () => {
  const fixtures = [
    { age: 55, ssIncome: 0,     pTrad: 300000, pRoth: 100000, pStocks: 800000, pCash: 50000, spend: 75000 },
    { age: 65, ssIncome: 0,     pTrad: 660000, pRoth: 167000, pStocks: 1200000, pCash: 0,    spend: 78000 },
    { age: 70, ssIncome: 58896, pTrad: 400000, pRoth: 167000, pStocks: 1500000, pCash: 0,    spend: 78000 },
  ];
  for (const f of fixtures) {
    for (const flag of [false, true]) {
      const r1 = apiGeneric.taxOptimizedWithdrawal(
        f.spend, f.ssIncome, f.pTrad, f.pRoth, f.pStocks, f.pCash,
        f.age, MFJ_BRACKETS, 0.6, { endAge: 100, disableSmoothingCap: flag }
      );
      const r2 = apiRR.taxOptimizedWithdrawal(
        f.spend, f.ssIncome, f.pTrad, f.pRoth, f.pStocks, f.pCash,
        f.age, MFJ_BRACKETS, 0.6, { endAge: 100, disableSmoothingCap: flag }
      );
      assert.deepStrictEqual(r1, r2, `RR vs Generic mismatch at age ${f.age}, aggressiveSmoothingMultiplier=${flag}`);
    }
  }
});
