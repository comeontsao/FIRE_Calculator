// ==================== TEST SUITE: Safe terminal-floor (20% × FIRE balance) ====================
// Locks in the user's 2026-04-28 directive: Safe mode must require
// endBalance ≥ SAFE_TERMINAL_FIRE_RATIO × balance-at-FIRE so the chart's tail
// trends upward instead of grinding to ~$0.
//
// Specifically guards the signed-sim FALLBACK path inside isFireAgeFeasible —
// the path used by findMinAccessibleAtFireNumerical (the FIRE-NUMBER binary
// search). Before the fix, the fallback only checked sim.endBalance >= 0,
// which made Safe FIRE-number identical to DWZ FIRE-number even though the
// user expected Safe to be strictly stricter.
//
// Both the chart-consistent path (when fireAge is supplied) and the signed
// fallback (when fireAge is omitted) must enforce the 20% rule.
// ===================================================================================

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function extractFn(html, name) {
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

function buildGate(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const isFireAgeFeasibleSrc = extractFn(html, 'isFireAgeFeasible');
  const getActiveChartStrategyOptionsSrc = extractFn(html, 'getActiveChartStrategyOptions');
  // Stub projectFullLifecycle as undefined so the chart-consistent branch
  // short-circuits and we exercise the signed-sim fallback path directly.
  const factory = new Function(
    'document',
    `
    const SAFE_TERMINAL_FIRE_RATIO = 0.20;
    var _previewStrategyId = null;
    var _lastStrategyResults = null;
    var projectFullLifecycle; // undefined — forces signed-sim fallback
    ${getActiveChartStrategyOptionsSrc}
    ${isFireAgeFeasibleSrc}
    return isFireAgeFeasible;
    `
  );
  // Minimal document stub so terminalBuffer reads work for the Exact branch.
  const _doc = { getElementById: () => ({ value: '0' }) };
  return factory(_doc);
}

const RR_HTML = path.join(REPO_ROOT, 'FIRE-Dashboard.html');
const GENERIC_HTML = path.join(REPO_ROOT, 'FIRE-Dashboard-Generic.html');

const baseInp = { bufferUnlock: 0, bufferSS: 0 };
const ANNUAL_SPEND = 50000;

for (const [label, htmlPath] of [['RR', RR_HTML], ['Generic', GENERIC_HTML]]) {
  test(`${label}: Safe gate (signed-sim) — endBalance below 20% of balanceAtFire is infeasible`, () => {
    const isFireAgeFeasible = buildGate(htmlPath);
    const sim = {
      endBalance: 100,
      balanceAtFire: 1000,
      balanceAtUnlock: 0,
      balanceAtSS: 0,
      minBalancePhase1: Infinity,
      minBalancePhase2: Infinity,
      minBalancePhase3: Infinity,
    };
    // 100 < 0.20 × 1000 = 200 → infeasible
    assert.strictEqual(isFireAgeFeasible(sim, baseInp, ANNUAL_SPEND, 'safe'), false);
  });

  test(`${label}: Safe gate (signed-sim) — endBalance at 20% of balanceAtFire is feasible`, () => {
    const isFireAgeFeasible = buildGate(htmlPath);
    const sim = {
      endBalance: 200,
      balanceAtFire: 1000,
      balanceAtUnlock: 0,
      balanceAtSS: 0,
      minBalancePhase1: Infinity,
      minBalancePhase2: Infinity,
      minBalancePhase3: Infinity,
    };
    // 200 ≥ 0.20 × 1000 = 200 → feasible
    assert.strictEqual(isFireAgeFeasible(sim, baseInp, ANNUAL_SPEND, 'safe'), true);
  });

  test(`${label}: Safe gate (signed-sim) — endBalance above 20% of balanceAtFire is feasible`, () => {
    const isFireAgeFeasible = buildGate(htmlPath);
    const sim = {
      endBalance: 500,
      balanceAtFire: 1000,
      balanceAtUnlock: 0,
      balanceAtSS: 0,
      minBalancePhase1: Infinity,
      minBalancePhase2: Infinity,
      minBalancePhase3: Infinity,
    };
    assert.strictEqual(isFireAgeFeasible(sim, baseInp, ANNUAL_SPEND, 'safe'), true);
  });

  test(`${label}: Safe vs DWZ — Safe rejects what DWZ accepts when tail bleeds out`, () => {
    const isFireAgeFeasible = buildGate(htmlPath);
    // endBalance = $50, balanceAtFire = $1M. DWZ only requires endBalance ≥ 0,
    // so this passes DWZ. Safe requires ≥ 20% × $1M = $200k → fails Safe.
    const sim = {
      endBalance: 50,
      balanceAtFire: 1000000,
      balanceAtUnlock: 0,
      balanceAtSS: 0,
      minBalancePhase1: Infinity,
      minBalancePhase2: Infinity,
      minBalancePhase3: Infinity,
    };
    assert.strictEqual(isFireAgeFeasible(sim, baseInp, ANNUAL_SPEND, 'dieWithZero'), true,
      'DWZ should accept (endBalance ≥ 0)');
    assert.strictEqual(isFireAgeFeasible(sim, baseInp, ANNUAL_SPEND, 'safe'), false,
      'Safe should reject (endBalance < 20% × balanceAtFire)');
  });

  test(`${label}: Safe gate — guard against zero balanceAtFire (avoid div-by-zero)`, () => {
    const isFireAgeFeasible = buildGate(htmlPath);
    // balanceAtFire = 0 means the user retires with $0 — terminal-floor is
    // also 0, so the rule degenerates to endBalance ≥ 0. This must NOT crash.
    const sim = {
      endBalance: 0,
      balanceAtFire: 0,
      balanceAtUnlock: 0,
      balanceAtSS: 0,
      minBalancePhase1: Infinity,
      minBalancePhase2: Infinity,
      minBalancePhase3: Infinity,
    };
    assert.strictEqual(isFireAgeFeasible(sim, baseInp, ANNUAL_SPEND, 'safe'), true);
  });

  test(`${label}: Safe gate is deterministic — same sim, same verdict (idempotence)`, () => {
    const isFireAgeFeasible = buildGate(htmlPath);
    const sim = {
      endBalance: 250,
      balanceAtFire: 1000,
      balanceAtUnlock: 0,
      balanceAtSS: 0,
      minBalancePhase1: Infinity,
      minBalancePhase2: Infinity,
      minBalancePhase3: Infinity,
    };
    const r1 = isFireAgeFeasible(sim, baseInp, ANNUAL_SPEND, 'safe');
    const r2 = isFireAgeFeasible(sim, baseInp, ANNUAL_SPEND, 'safe');
    const r3 = isFireAgeFeasible(sim, baseInp, ANNUAL_SPEND, 'safe');
    assert.strictEqual(r1, r2);
    assert.strictEqual(r2, r3);
  });
}
