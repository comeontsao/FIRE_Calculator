/*
 * tests/baseline/browser-smoke.test.js — browser-smoke regression harness.
 *
 * Feature: specs/003-browser-smoke-harness/
 *
 * Purpose: prove the canonical calc engine (calc/*.js) consumes each
 * dashboard's cold-load form defaults without throwing and returns a
 * `FireSolverResult` with every field present and correctly typed. Also
 * locks the RR-path ↔ Generic-path parity contract so feature 004's real
 * adapter swap starts detecting drift automatically.
 *
 * This file is a GATE, not a product. Zero deps; Node built-ins only.
 * Runs via `bash tests/runner.sh` locally and `.github/workflows/tests.yml`
 * in CI.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Defaults snapshots — frozen legacy-shape objects mirroring each dashboard's
// cold-load form state. When the HTML form defaults change, update these.
import RR_DEFAULTS from './rr-defaults.mjs';
import GENERIC_DEFAULTS from './generic-defaults.mjs';

// Canonical calc engine — full helpers bundle.
import { makeInflation } from '../../calc/inflation.js';
import { computeTax } from '../../calc/tax.js';
import { computeWithdrawal } from '../../calc/withdrawal.js';
import { projectSS } from '../../calc/socialSecurity.js';
import { getHealthcareCost } from '../../calc/healthcare.js';
import { resolveMortgage, computeMortgage } from '../../calc/mortgage.js';
import { computeCollegeCosts } from '../../calc/college.js';
import { resolveSecondHome } from '../../calc/secondHome.js';
import { computeStudentLoan } from '../../calc/studentLoan.js';
import { solveFireAge } from '../../calc/fireCalculator.js';

// Production adapter — feature 005 replaces the inline prototype that lived
// here for feature 003. See specs/005-canonical-public-launch/contracts/adapter.contract.md.
import { getCanonicalInputs } from '../../calc/getCanonicalInputs.js';

// Parity fixture — canonical couple used by the parity smoke (degenerate
// today; activates real divergence when feature 004 lands personal-rr.js).
import parityFixture from '../fixtures/rr-generic-parity.js';

/**
 * Build the DI helpers bundle expected by `solveFireAge`. `calc/lifecycle.js`
 * falls back to direct imports for any helper not supplied, but providing
 * the full bundle exercises the injection path and matches the shape the
 * HTML module bootstrap will use in feature 004.
 *
 * @param {object} inputs   canonical Inputs shape (for inflation's base year)
 * @returns {object}        helpers bundle
 */
function buildHelpers(inputs) {
  const baseYear = typeof inputs.baseYear === 'number' ? inputs.baseYear : new Date().getFullYear();
  // Per calc/lifecycle.js runLifecycle: each helpers.* slot is the FUNCTION
  // itself (e.g., `helpers.socialSecurity ?? projectSS`), not an object
  // wrapping the function. Supplying the direct function form mirrors the
  // fallback path exactly.
  return Object.freeze({
    inflation: makeInflation(inputs.inflationRate, baseYear),
    tax: computeTax,
    withdrawal: computeWithdrawal,
    socialSecurity: projectSS,
    healthcare: getHealthcareCost,
    mortgage: resolveMortgage,
    college: computeCollegeCosts,
    secondHome: resolveSecondHome,
    studentLoan: computeStudentLoan,
  });
}

// ============================================================================
// Test 1 — RR cold-load smoke
// ============================================================================

test('RR cold-load smoke: canonical solveFireAge returns sane shape', () => {
  // Assertion 1: adapter does not throw on RR defaults.
  let canonical;
  assert.doesNotThrow(
    () => { canonical = getCanonicalInputs(RR_DEFAULTS); },
    'RR smoke: getCanonicalInputs threw on RR_DEFAULTS. '
      + 'Fix the adapter or update tests/baseline/rr-defaults.mjs.',
  );

  // Assertion 2: solver does not throw on canonical RR inputs.
  let result;
  assert.doesNotThrow(
    () => {
      const helpers = buildHelpers(canonical);
      result = solveFireAge({ inputs: canonical, helpers });
    },
    'RR smoke: solveFireAge threw on canonical RR inputs. '
      + 'Check that getCanonicalInputs produces a shape that '
      + 'passes calc/lifecycle.js validateInputs.',
  );

  // Assertion 3: fireAge is a number.
  assert.strictEqual(
    typeof result.fireAge,
    'number',
    `RR smoke: FireSolverResult.fireAge should be a number; got ${typeof result.fireAge} = ${JSON.stringify(result.fireAge)}.`,
  );

  // Assertion 4: yearsToFire is a number.
  assert.strictEqual(
    typeof result.yearsToFire,
    'number',
    `RR smoke: FireSolverResult.yearsToFire should be a number; got ${typeof result.yearsToFire} = ${JSON.stringify(result.yearsToFire)}.`,
  );

  // Assertion 5: feasible is a boolean.
  assert.strictEqual(
    typeof result.feasible,
    'boolean',
    `RR smoke: FireSolverResult.feasible should be a boolean; got ${typeof result.feasible} = ${JSON.stringify(result.feasible)}.`,
  );

  // Assertion 6: endBalanceReal finite number.
  assert.ok(
    typeof result.endBalanceReal === 'number' && Number.isFinite(result.endBalanceReal),
    `RR smoke: FireSolverResult.endBalanceReal should be a finite number; got ${typeof result.endBalanceReal} = ${JSON.stringify(result.endBalanceReal)}.`,
  );

  // Assertion 7: balanceAtUnlockReal + balanceAtSSReal finite numbers.
  assert.ok(
    typeof result.balanceAtUnlockReal === 'number' && Number.isFinite(result.balanceAtUnlockReal),
    `RR smoke: FireSolverResult.balanceAtUnlockReal should be a finite number; got ${typeof result.balanceAtUnlockReal} = ${JSON.stringify(result.balanceAtUnlockReal)}.`,
  );
  assert.ok(
    typeof result.balanceAtSSReal === 'number' && Number.isFinite(result.balanceAtSSReal),
    `RR smoke: FireSolverResult.balanceAtSSReal should be a finite number; got ${typeof result.balanceAtSSReal} = ${JSON.stringify(result.balanceAtSSReal)}.`,
  );

  // Assertion 8: lifecycle is a non-empty array.
  assert.ok(
    Array.isArray(result.lifecycle) && result.lifecycle.length > 0,
    `RR smoke: FireSolverResult.lifecycle should be a non-empty array; got length=${Array.isArray(result.lifecycle) ? result.lifecycle.length : 'not-array'}.`,
  );

  // Assertion 9: fireAge ∈ [18, 110].
  assert.ok(
    result.fireAge >= 18 && result.fireAge <= 110,
    `RR smoke: FireSolverResult.fireAge should be in [18, 110]; got fireAge=${result.fireAge}.`,
  );

  // Assertion 10: yearsToFire ∈ [0, 100].
  assert.ok(
    result.yearsToFire >= 0 && result.yearsToFire <= 100,
    `RR smoke: FireSolverResult.yearsToFire should be in [0, 100]; got yearsToFire=${result.yearsToFire}.`,
  );
});

// ============================================================================
// Test 2 — Generic cold-load smoke
// ============================================================================

test('Generic cold-load smoke: canonical solveFireAge returns sane shape', () => {
  // Assertion 1: adapter does not throw on Generic defaults.
  let canonical;
  assert.doesNotThrow(
    () => { canonical = getCanonicalInputs(GENERIC_DEFAULTS); },
    'Generic smoke: getCanonicalInputs threw on GENERIC_DEFAULTS. '
      + 'Fix the adapter or update tests/baseline/generic-defaults.mjs.',
  );

  // Assertion 2: solver does not throw on canonical Generic inputs.
  let result;
  assert.doesNotThrow(
    () => {
      const helpers = buildHelpers(canonical);
      result = solveFireAge({ inputs: canonical, helpers });
    },
    'Generic smoke: solveFireAge threw on canonical Generic inputs. '
      + 'Check that getCanonicalInputs produces a shape that '
      + 'passes calc/lifecycle.js validateInputs.',
  );

  // Assertion 3: fireAge is a number.
  assert.strictEqual(
    typeof result.fireAge,
    'number',
    `Generic smoke: FireSolverResult.fireAge should be a number; got ${typeof result.fireAge} = ${JSON.stringify(result.fireAge)}.`,
  );

  // Assertion 4: yearsToFire is a number.
  assert.strictEqual(
    typeof result.yearsToFire,
    'number',
    `Generic smoke: FireSolverResult.yearsToFire should be a number; got ${typeof result.yearsToFire} = ${JSON.stringify(result.yearsToFire)}.`,
  );

  // Assertion 5: feasible is a boolean.
  assert.strictEqual(
    typeof result.feasible,
    'boolean',
    `Generic smoke: FireSolverResult.feasible should be a boolean; got ${typeof result.feasible} = ${JSON.stringify(result.feasible)}.`,
  );

  // Assertion 6: endBalanceReal finite number.
  assert.ok(
    typeof result.endBalanceReal === 'number' && Number.isFinite(result.endBalanceReal),
    `Generic smoke: FireSolverResult.endBalanceReal should be a finite number; got ${typeof result.endBalanceReal} = ${JSON.stringify(result.endBalanceReal)}.`,
  );

  // Assertion 7: balanceAtUnlockReal + balanceAtSSReal finite numbers.
  assert.ok(
    typeof result.balanceAtUnlockReal === 'number' && Number.isFinite(result.balanceAtUnlockReal),
    `Generic smoke: FireSolverResult.balanceAtUnlockReal should be a finite number; got ${typeof result.balanceAtUnlockReal} = ${JSON.stringify(result.balanceAtUnlockReal)}.`,
  );
  assert.ok(
    typeof result.balanceAtSSReal === 'number' && Number.isFinite(result.balanceAtSSReal),
    `Generic smoke: FireSolverResult.balanceAtSSReal should be a finite number; got ${typeof result.balanceAtSSReal} = ${JSON.stringify(result.balanceAtSSReal)}.`,
  );

  // Assertion 8: lifecycle is a non-empty array.
  assert.ok(
    Array.isArray(result.lifecycle) && result.lifecycle.length > 0,
    `Generic smoke: FireSolverResult.lifecycle should be a non-empty array; got length=${Array.isArray(result.lifecycle) ? result.lifecycle.length : 'not-array'}.`,
  );

  // Assertion 9: fireAge ∈ [18, 110].
  assert.ok(
    result.fireAge >= 18 && result.fireAge <= 110,
    `Generic smoke: FireSolverResult.fireAge should be in [18, 110]; got fireAge=${result.fireAge}.`,
  );

  // Assertion 10: yearsToFire ∈ [0, 100].
  assert.ok(
    result.yearsToFire >= 0 && result.yearsToFire <= 100,
    `Generic smoke: FireSolverResult.yearsToFire should be in [0, 100]; got yearsToFire=${result.yearsToFire}.`,
  );
});

// ============================================================================
// Test 3 — Parity smoke (RR-path vs Generic-path)
// ============================================================================

/**
 * Fields to compare between the RR-path and Generic-path outputs. Excludes
 * `lifecycle` (per smoke-harness.contract.md §Test 3 — too large for byte-
 * identity; feature 004 may add per-record parity).
 */
const PARITY_FIELDS = Object.freeze([
  'yearsToFire',
  'fireAge',
  'feasible',
  'endBalanceReal',
  'balanceAtUnlockReal',
  'balanceAtSSReal',
]);

test('Parity smoke: RR-path and Generic-path outputs match on non-divergent fields', () => {
  // The parity fixture already holds a CANONICAL Inputs object (not the
  // legacy inp shape). Feature 004's personal-rr.js will enrich canonical
  // inputs directly, so the adapter-path exercise happens through the two
  // cold-load smokes above (which DO drive `getCanonicalInputs` end-to-end).
  // TODAY: we feed the canonical inputs directly to solveFireAge on both
  // paths — the adapter is a no-op on already-canonical data, and both paths
  // compute identically (degenerate-today semantics; research.md §R3).

  // rrPath — feature 004 will extend this with a personal-rr.js adapter call.
  const rrInputs = parityFixture.inputs; // canonical; RR-path is passthrough today
  // genericPath — direct canonical, no adapter.
  const genericInputs = parityFixture.inputs;

  const helpers = buildHelpers(rrInputs);
  const rrResult = solveFireAge({ inputs: rrInputs, helpers });
  const genericResult = solveFireAge({ inputs: genericInputs, helpers });

  // Apply the fixture's `divergent[]` allowlist. A field listed in
  // `divergent` is legitimately expected to differ (e.g., SS projections
  // when RR uses actual earnings vs Generic's curve). Fields not in the
  // allowlist MUST be byte-identical between the two paths.
  const divergent = new Set(parityFixture.divergent ?? []);

  for (const field of PARITY_FIELDS) {
    if (divergent.has(field)) continue;
    assert.deepStrictEqual(
      rrResult[field],
      genericResult[field],
      `Parity smoke: field '${field}' drifted between RR-path and Generic-path.\n`
        + `  rrPath:      ${JSON.stringify(rrResult[field])}\n`
        + `  genericPath: ${JSON.stringify(genericResult[field])}\n`
        + `Either (1) update the RR-path adapter to align, OR (2) add '${field}' to `
        + `tests/fixtures/rr-generic-parity.js divergent[] with a comment explaining `
        + `the legitimate divergence.`,
    );
  }
});

// ============================================================================
// Test 4 — feature-006 DOM contract (RR + Generic)
// ============================================================================
//
// Feature: specs/006-ui-noise-reset-lifecycle-dock/
//
// Purpose: lock the DOM + CSS contracts added by feature 006 — sticky compact
// header (US2), pinnable lifecycle sidebar (US1), and the noise-reduction
// visual-system pass (US3). Text-level grep on the raw HTML source; zero
// deps, zero browser. Mirrors the existing smoke-harness style.
//
// Contracts enforced:
//   - specs/006-ui-noise-reset-lifecycle-dock/contracts/sticky-header.contract.md
//   - specs/006-ui-noise-reset-lifecycle-dock/contracts/lifecycle-sidebar.contract.md
//   - specs/006-ui-noise-reset-lifecycle-dock/contracts/visual-system.contract.md

const __dirname_006 = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT_006 = path.resolve(__dirname_006, '..', '..');
const RR_HTML_PATH = path.join(REPO_ROOT_006, 'FIRE-Dashboard.html');
const GENERIC_HTML_PATH = path.join(REPO_ROOT_006, 'FIRE-Dashboard-Generic.html');

/**
 * Count non-overlapping literal-substring occurrences of `needle` in `haystack`.
 * Zero-dep; avoids regex escaping edge cases for selectors that contain `-`, `__`, etc.
 */
function countSubstr(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while (true) {
    const next = haystack.indexOf(needle, idx);
    if (next === -1) return count;
    count += 1;
    idx = next + needle.length;
  }
}

/**
 * Assert both dashboards contain `needle` at least `min` times.
 */
function assertPresentInBoth(haystacks, needle, { min = 1, label = needle } = {}) {
  for (const [fileLabel, src] of haystacks) {
    const occurrences = countSubstr(src, needle);
    assert.ok(
      occurrences >= min,
      `feature-006 DOM contract: ${fileLabel} is missing '${label}' (expected ≥${min}, got ${occurrences}).`,
    );
  }
}

const NEW_I18N_KEYS_006 = Object.freeze([
  'section.profile',
  'section.outlook',
  'section.compare',
  'section.track',
  'filter.label',
  // header.yearsChipLabel + header.progressChipLabel removed — compact-header
  // chips were folded into the #fireStatus pill (see feature-007 bug-fix).
  'sidebar.title',
  'sidebar.pinAria',
  'sidebar.closeAria',
  'sidebar.toggleAria',
  'sidebar.fireAgeLabel',
  'sidebar.endPortfolioLabel',
]);

test('feature-006 DOM contract: sticky header + sidebar + visual system present in RR and Generic', () => {
  const rrSrc = fs.readFileSync(RR_HTML_PATH, 'utf8');
  const genericSrc = fs.readFileSync(GENERIC_HTML_PATH, 'utf8');
  const pairs = [
    ['FIRE-Dashboard.html', rrSrc],
    ['FIRE-Dashboard-Generic.html', genericSrc],
  ];

  // --- Sticky compact header (US2) ---
  // Note: #headerYearsValue and #headerProgressValue were removed —
  // years-to-FIRE + progress % now live in the single #fireStatus pill.
  assertPresentInBoth(pairs, 'id="headerSentinel"', { label: '#headerSentinel' });
  assertPresentInBoth(pairs, 'id="siteHeader"', { label: '#siteHeader' });
  assertPresentInBoth(pairs, 'id="fireStatus"', { label: '#fireStatus (status pill)' });
  assertPresentInBoth(pairs, 'id="sidebarToggle"', { label: '#sidebarToggle' });
  assertPresentInBoth(pairs, 'header--compact', { label: '.header--compact CSS class', min: 2 });

  // --- Pinnable lifecycle sidebar (US1) ---
  assertPresentInBoth(pairs, 'id="lifecycleSidebar"', { label: '#lifecycleSidebar' });
  assertPresentInBoth(pairs, 'id="lifecycleSidebarCanvas"', { label: '#lifecycleSidebarCanvas' });
  assertPresentInBoth(pairs, 'id="sidebarScrim"', { label: '#sidebarScrim' });
  assertPresentInBoth(pairs, 'id="sidebarFireAge"', { label: '#sidebarFireAge' });
  assertPresentInBoth(pairs, 'id="sidebarEndPortfolio"', { label: '#sidebarEndPortfolio' });

  // --- Visual system (US3) ---
  assertPresentInBoth(pairs, 'section-divider', { label: '.section-divider', min: 4 });
  assertPresentInBoth(pairs, 'progress-rail', { label: '.progress-rail (rail refactor)', min: 1 });
  assertPresentInBoth(pairs, 'filter-row__label', { label: '.filter-row__label (filter demotion)', min: 1 });

  // FIRE Progress refactored to rail — the old span-3 FIRE-progress card must be gone.
  // We assert the full composite string is NOT present. span-3 itself is used elsewhere
  // in the grid, so we only guard the FIRE-progress wrapper specifically.
  for (const [fileLabel, src] of pairs) {
    // The old markup was: <div class="card span-3"> ... data-i18n="sec.fireProgress" ...
    // Find every occurrence of `"sec.fireProgress"` and confirm the preceding ~200 chars
    // do NOT contain `card span-3`. This is a heuristic but tight enough for a smoke gate.
    let searchFrom = 0;
    while (true) {
      const hit = src.indexOf('sec.fireProgress', searchFrom);
      if (hit === -1) break;
      const window = src.slice(Math.max(0, hit - 200), hit);
      assert.ok(
        !window.includes('card span-3'),
        `feature-006 DOM contract: ${fileLabel} still wraps FIRE Progress in a 'card span-3' card — expected progress-rail refactor.`,
      );
      searchFrom = hit + 1;
    }
  }

  // --- i18n keys (V12) — both EN and ZH dicts, both files ---
  // The `const TRANSLATIONS = { en: {...}, zh: {...} };` block is a single
  // module-scope JS dict inside each HTML. We locate the `en: {` and `zh: {`
  // openings relative to the outer `TRANSLATIONS` declaration and slice each
  // dict body to confirm every new key appears inside it.
  for (const [fileLabel, src] of pairs) {
    const translationsAnchor = src.indexOf('const TRANSLATIONS');
    assert.ok(translationsAnchor >= 0, `feature-006 DOM contract: ${fileLabel} has no 'const TRANSLATIONS' block.`);

    const enStart = src.indexOf('en: {', translationsAnchor);
    const zhStart = src.indexOf('zh: {', translationsAnchor);
    assert.ok(enStart >= 0, `feature-006 DOM contract: ${fileLabel} has no 'en: {' dict opener inside TRANSLATIONS.`);
    assert.ok(zhStart >= 0, `feature-006 DOM contract: ${fileLabel} has no 'zh: {' dict opener inside TRANSLATIONS.`);
    assert.ok(zhStart > enStart, `feature-006 DOM contract: ${fileLabel} has 'zh' dict before 'en' dict — unexpected ordering.`);

    // en dict: from `en: {` to `zh: {`.
    // zh dict: from `zh: {` forward ~200k chars (safety cap past the zh body).
    const enSlice = src.slice(enStart, zhStart);
    const zhSlice = src.slice(zhStart, Math.min(src.length, zhStart + 200_000));

    for (const key of NEW_I18N_KEYS_006) {
      assert.ok(
        enSlice.includes(`'${key}'`) || enSlice.includes(`"${key}"`),
        `feature-006 DOM contract: ${fileLabel} TRANSLATIONS.en is missing key '${key}'.`,
      );
      assert.ok(
        zhSlice.includes(`'${key}'`) || zhSlice.includes(`"${key}"`),
        `feature-006 DOM contract: ${fileLabel} TRANSLATIONS.zh is missing key '${key}'.`,
      );
    }
  }
});

// ============================================================================
// Test 5 — feature-007 DOM contract (RR + Generic)
// ============================================================================
//
// Feature: specs/007-bracket-fill-tax-smoothing/
//
// Purpose: lock the DOM + i18n contracts added by feature 007 — bracket-fill
// controls (US1), transparency indicators (US2), and info panel. Text-level
// grep on the raw HTML source; zero deps, zero browser. Mirrors feature-006
// style above.
//
// Contracts enforced:
//   - specs/007-bracket-fill-tax-smoothing/contracts/ui-controls.contract.md
//   - specs/007-bracket-fill-tax-smoothing/contracts/chart-transparency.contract.md
//   - specs/007-bracket-fill-tax-smoothing/contracts/bracket-fill-algorithm.contract.md

/**
 * Feature-007 DOM ids expected exactly once in each HTML file. Each id has a
 * specific purpose documented in the contracts; a duplicate implies a broken
 * refactor and a zero count implies the feature regressed.
 */
const FEATURE_007_IDS = Object.freeze([
  'safetyMargin',              // US1 — safety margin slider
  'rule55Enabled',             // US1 — Rule of 55 checkbox
  'rule55SeparationAge',       // US1 — Rule of 55 separation-age input
  'irmaaThreshold',            // US1 — IRMAA threshold input
  'ssReductionCaption',        // US2 — SS integration transparency caption
  'lifetimeTaxComparison',     // US1 — bracket-fill vs no-smoothing caption
  'dwzCaveat',                 // US1 — DWZ-mode caveat caption
  'rule55InvalidSeparation',   // US2 — Rule of 55 invalid separation warning
  'irmaaDisabledHint',         // US2 — IRMAA-disabled hint
  'roth5YearBanner',           // US2 — 5-year Roth warning banner (placeholder)
]);

/**
 * Feature-007 i18n keys added by task T004/T005. All must resolve in both
 * TRANSLATIONS.en and TRANSLATIONS.zh dicts in both HTML files, and appear
 * at least once in FIRE-Dashboard Translation Catalog.md.
 */
const FEATURE_007_I18N_KEYS = Object.freeze([
  'bracketFill.safetyMarginLabel',
  'bracketFill.safetyMarginTip',
  'bracketFill.rule55Label',
  'bracketFill.rule55Tip',
  'bracketFill.rule55SeparationAgeLabel',
  'bracketFill.rule55SeparationAgeTip',
  'bracketFill.rule55InvalidSeparation',
  'bracketFill.irmaaThresholdLabel',
  'bracketFill.irmaaThresholdTip',
  'bracketFill.irmaaDisabled',
  'bracketFill.infoSummary',
  'bracketFill.infoBody1',
  'bracketFill.infoBody2',
  'bracketFill.infoBody3',
  'bracketFill.infoBody4',
  'chart.bracketFillExcess',
  'chart.irmaaThresholdLine',
  'chart.rule55Unlock',
  'chart.ssReductionCaption',
  'chart.lifetimeTaxComparison',
  'chart.dwzCaveat',
  'chart.strategyNarrativeBracketFill',
  'chart.roth5YearWarning',
  'chart.roth5YearWarningBanner',
]);

const CATALOG_PATH_007 = path.join(REPO_ROOT_006, 'FIRE-Dashboard Translation Catalog.md');

test('feature-007 DOM contract: bracket-fill controls + transparency indicators + info panel present in RR and Generic', () => {
  const rrSrc = fs.readFileSync(RR_HTML_PATH, 'utf8');
  const genericSrc = fs.readFileSync(GENERIC_HTML_PATH, 'utf8');
  const catalogSrc = fs.readFileSync(CATALOG_PATH_007, 'utf8');
  const pairs = [
    ['FIRE-Dashboard.html', rrSrc],
    ['FIRE-Dashboard-Generic.html', genericSrc],
  ];

  // --- Each feature-007 id appears EXACTLY ONCE in each HTML file ---
  // Duplicates imply the Frontend refactor accidentally duplicated the node
  // (e.g., a copy-paste between RR and Generic sections). Zero means the
  // feature regressed.
  for (const [fileLabel, src] of pairs) {
    for (const idName of FEATURE_007_IDS) {
      const needle = `id="${idName}"`;
      const occurrences = countSubstr(src, needle);
      assert.strictEqual(
        occurrences,
        1,
        `feature-007 DOM contract: ${fileLabel} must contain '${needle}' exactly once (got ${occurrences}).`,
      );
    }
  }

  // --- Info panel must match id AND class simultaneously ---
  // Matching only the id risks false-positiving on feature-005's existing
  // "<details>" tax-strategy panel (which is a different element). The
  // contract (T046 and T041/T042) requires BOTH id="bracketFillInfo" AND
  // class="bracketFill-info" on the same <details> tag.
  for (const [fileLabel, src] of pairs) {
    const infoPanelRegex = /<details\s+id="bracketFillInfo"\s+class="bracketFill-info"/;
    assert.ok(
      infoPanelRegex.test(src),
      `feature-007 DOM contract: ${fileLabel} must contain '<details id="bracketFillInfo" class="bracketFill-info" ...>' — `
        + `id or class alone is insufficient (would false-positive on feature-005's "📖 New to this?" panel).`,
    );
  }

  // --- All feature-007 i18n keys resolve in en + zh dicts in both HTML files ---
  // Reuses the same translation-dict slicing strategy as the feature-006
  // smoke above.
  for (const [fileLabel, src] of pairs) {
    const translationsAnchor = src.indexOf('const TRANSLATIONS');
    assert.ok(
      translationsAnchor >= 0,
      `feature-007 DOM contract: ${fileLabel} has no 'const TRANSLATIONS' block.`,
    );
    const enStart = src.indexOf('en: {', translationsAnchor);
    const zhStart = src.indexOf('zh: {', translationsAnchor);
    assert.ok(enStart >= 0, `feature-007 DOM contract: ${fileLabel} has no 'en: {' dict opener inside TRANSLATIONS.`);
    assert.ok(zhStart >= 0, `feature-007 DOM contract: ${fileLabel} has no 'zh: {' dict opener inside TRANSLATIONS.`);
    assert.ok(zhStart > enStart, `feature-007 DOM contract: ${fileLabel} has 'zh' dict before 'en' dict — unexpected ordering.`);

    const enSlice = src.slice(enStart, zhStart);
    const zhSlice = src.slice(zhStart, Math.min(src.length, zhStart + 400_000));

    for (const key of FEATURE_007_I18N_KEYS) {
      assert.ok(
        enSlice.includes(`'${key}'`) || enSlice.includes(`"${key}"`),
        `feature-007 DOM contract: ${fileLabel} TRANSLATIONS.en is missing key '${key}'.`,
      );
      assert.ok(
        zhSlice.includes(`'${key}'`) || zhSlice.includes(`"${key}"`),
        `feature-007 DOM contract: ${fileLabel} TRANSLATIONS.zh is missing key '${key}'.`,
      );
    }
  }

  // --- Every feature-007 key documented in the translation catalog ---
  for (const key of FEATURE_007_I18N_KEYS) {
    assert.ok(
      catalogSrc.includes(key),
      `feature-007 DOM contract: 'FIRE-Dashboard Translation Catalog.md' is missing key '${key}' — `
        + `every new key introduced by feature 007 must be documented there per T006.`,
    );
  }
});
