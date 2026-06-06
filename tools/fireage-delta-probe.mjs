// Feature 033 (T001/T025) — FIRE-age delta probe.
// Captures, per FIRE mode, the candidate FIRE age, end balance, verdict, and
// winner strategy from the audit snapshot's `gates` array on RR live defaults
// (cold load, no localStorage). Run once on the pre-feature commit
// (→ specs/033-math-assumptions-cleanup/baseline-before.json) and once on the
// feature head; CLOSEOUT.md records the per-mode before/after table (FR-012).
// Usage: node tools/fireage-delta-probe.mjs [abs-path-to-html]
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url))).replace(/\\/g, '/');
const target = process.argv[2] || `${ROOT}/FIRE-Dashboard.html`;

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 150)));

await page.goto('file:///' + target.replace(/\\/g, '/'));
await page.waitForFunction(() => !!window._lastAuditSnapshot, null, { timeout: 30000 });

const out = await page.evaluate(() => {
  const s = window._lastAuditSnapshot;
  return {
    generatedAt: s.generatedAt || null,
    displayedFireAge: s.fireAgeResolution?.displayedFireAge ?? null,
    winnerId: s.strategyRanking?.winnerId ?? null,
    modes: (s.gates || []).map((g) => ({
      mode: g.mode,
      candidateFireAge: g.candidateFireAge ?? null,
      endBalance: g.formulaInputs?.endBalance ?? null,
      verdict: g.verdict ?? null,
      strategyUsed: g.strategyUsed?.id ?? null,
    })),
    nonExpectedWarnings: (s.crossValidationWarnings || [])
      .filter((w) => w && w.expected !== true)
      .map((w) => w.kind),
  };
});

console.log(JSON.stringify({ target: target.split('/').pop(), ...out, pageErrors: errors }, null, 2));
await browser.close();
process.exit(errors.length ? 1 : 0);
