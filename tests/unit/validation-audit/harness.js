'use strict';
// =============================================================================
// tests/unit/validation-audit/harness.js
//
// Feature 020 — Validation Audit Harness (T011)
// Spec: specs/020-validation-audit/tasks.md T011
// Contract: specs/020-validation-audit/contracts/validation-audit-harness.contract.md
//
// Exports:
//   buildHarnessContext(persona) → HarnessContext
//   runHarness(personas, invariants, options) → HarnessResult
//
// CommonJS (Constitution Principle V — file:// compatible, no ES module syntax).
//
// Sandbox extraction pattern mirrors:
//   tests/unit/wCashSumRegression.test.js
//   tests/unit/strategies.test.js
//
// The harness extracts the following functions from the appropriate HTML file
// using the brace-balanced extractor and wraps them in a Node sandbox:
//   signedLifecycleEndBalance, isFireAgeFeasible, findFireAgeNumerical,
//   projectFullLifecycle, scoreAndRank, and all their transitive dependencies.
//
// Stub functions injected into the sandbox (DOM-free):
//   getMortgageInputs()          → derived from persona.inp
//   getSecondHomeInputs()        → derived from persona.inp (returns null for now)
//   getTotalCollegeCostForYear() → returns 0
//   getHealthcareDeltaAnnual()   → returns 0
//   getActiveChartStrategyOptions()    → returns undefined (default strategy)
//   getActiveMortgageStrategyOptions() → derived from persona.inp
//   resolveAccumulationOptions()       → synthesized from persona.inp
//   getSelectedRelocationCost()        → returns 0 (country relocation cost stub)
//   getSelectedVisaCostAnnual()        → returns 0
//   calcRealisticSSA()                 → extracted from HTML (pure)
//   getSSAnnual()                      → extracted from HTML (pure via calcRealisticSSA)
// =============================================================================

const fs   = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

// Paths to the two HTML dashboards.
const HTML_PATHS = {
  RR:      path.join(REPO_ROOT, 'FIRE-Dashboard.html'),
  Generic: path.join(REPO_ROOT, 'FIRE-Dashboard-Generic.html'),
};

// Load accumulateToFire from the canonical CommonJS module.
const { accumulateToFire: _accumulateToFire } = require(path.join(REPO_ROOT, 'calc', 'accumulateToFire.js'));

// Feature 021 US4 (B-020-4): inject strategy-ranker hysteresis helpers into
// the sandbox so the extracted scoreAndRank() can apply hysteresis. Without
// this, `typeof _newWinnerBeats === 'function'` is false in the sandbox and
// hysteresis is silently skipped — defeating the E3 invariant fix.
//
// Strip the trailing CommonJS export + globalThis-registration block (which
// would pollute the Node global from inside `new Function`) and keep only
// the function declarations + HYSTERESIS_YEARS const that the sandbox needs.
const _STRATEGY_RANKER_FULL_SRC = fs.readFileSync(
  path.join(REPO_ROOT, 'calc', 'strategyRanker.js'), 'utf8'
);
const _STRATEGY_RANKER_INJECTED_SRC = (function() {
  const cutMarker = '// ---- Module exports ----';
  const cutIdx = _STRATEGY_RANKER_FULL_SRC.indexOf(cutMarker);
  return cutIdx > 0
    ? _STRATEGY_RANKER_FULL_SRC.slice(0, cutIdx)
    : _STRATEGY_RANKER_FULL_SRC;
})();

// ---------------------------------------------------------------------------
// HTML loading — cached once per dashboard key so repeated calls are fast.
// ---------------------------------------------------------------------------

/** @type {Map<string, string>} */
const _htmlCache = new Map();

/**
 * Load and cache an HTML file by dashboard key ('RR' | 'Generic').
 * @param {'RR'|'Generic'} dashboard
 * @returns {string} raw HTML content
 */
function _loadHtml(dashboard) {
  if (_htmlCache.has(dashboard)) return _htmlCache.get(dashboard);
  const p = HTML_PATHS[dashboard];
  if (!p) throw new Error('[harness] Unknown dashboard key: ' + dashboard);
  const content = fs.readFileSync(p, 'utf8');
  _htmlCache.set(dashboard, content);
  return content;
}

// ---------------------------------------------------------------------------
// Brace-balanced function extractor (mirrors wCashSumRegression.test.js pattern).
// ---------------------------------------------------------------------------

/**
 * Extract the source of a named function from an HTML string using a
 * brace-balanced scanner. Handles // comments, /* comments, and quoted strings.
 *
 * @param {string} html  Raw HTML content
 * @param {string} name  Function name to extract
 * @returns {string}     Full function source from `function <name>(` to matching `}`
 */
function _extractFn(html, name) {
  const pat = new RegExp('function\\s+' + name + '\\s*\\(', 'g');
  const m = pat.exec(html);
  if (!m) throw new Error('[harness._extractFn] Function \'' + name + '\' not found in HTML');
  let i = html.indexOf('{', m.index) + 1;
  let depth = 1;
  while (depth > 0 && i < html.length) {
    const ch = html[i];
    if (ch === '/' && html[i + 1] === '/') {
      i = html.indexOf('\n', i);
      if (i < 0) break;
      i++;
      continue;
    }
    if (ch === '/' && html[i + 1] === '*') {
      i = html.indexOf('*/', i);
      if (i < 0) break;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch;
      i++;
      while (i < html.length && html[i] !== q) {
        if (html[i] === '\\') i++;
        i++;
      }
      i++;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    i++;
  }
  return html.slice(m.index, i);
}

/**
 * Extract a named block by start/end marker strings.
 *
 * @param {string} html
 * @param {string} startMarker
 * @param {string} endMarker
 * @returns {string}
 */
function _extractBlock(html, startMarker, endMarker) {
  const s = html.indexOf(startMarker);
  if (s < 0) throw new Error('[harness._extractBlock] start marker not found: ' + startMarker);
  const e = html.indexOf(endMarker, s);
  if (e < 0) throw new Error('[harness._extractBlock] end marker not found: ' + endMarker);
  return html.slice(s, e);
}

// ---------------------------------------------------------------------------
// Sandbox factory — built once per dashboard, cached.
// The sandbox is a function factory: given persona-specific stubs, it
// returns the API objects the harness needs.
// ---------------------------------------------------------------------------

/** @type {Map<string, Function>} */
const _sandboxFactoryCache = new Map();

/**
 * Build (or retrieve cached) sandbox factory for a given dashboard.
 *
 * The sandbox factory is a `new Function(...)` closure that captures:
 *   - All extracted HTML functions as strings
 *   - Dependency stubs as overrides
 *   - The accumulateToFire CommonJS module
 *
 * The factory is called with persona-specific values (inp, mtg, scenario, etc.)
 * and returns the live API functions.
 *
 * @param {'RR'|'Generic'} dashboard
 * @returns {Function} sandboxFactory(inp, mtg, scenario, adultCount, accumulateToFire)
 */
function _getSandboxFactory(dashboard) {
  if (_sandboxFactoryCache.has(dashboard)) return _sandboxFactoryCache.get(dashboard);

  const html = _loadHtml(dashboard);

  // Functions to extract (order matters for dependency resolution inside new Function).
  const FNAMES = [
    // Low-level math helpers (no DOM, no globals)
    'calcMortgagePayment',
    'calcMortgageImpactAtYear',
    'calcOrdinaryTax',
    'calcLTCGTax',
    'getRMDDivisor',
    'detectMFJ',

    // SS calculation (pure, depends on calcRealisticSSA)
    'calcRealisticSSA',
    'getSSAnnual',

    // Tax brackets (reads DOM but we stub document)
    'getTaxBrackets',

    // Withdrawal core
    'taxOptimizedWithdrawal',

    // Feasibility + search
    'isFireAgeFeasible',
    'findFireAgeNumerical',

    // Signed sim (depends on getMortgageInputs stub, getSSAnnual, etc.)
    'signedLifecycleEndBalance',

    // Retirement-only signed sim (used by feature 022 month-precision-feasibility
    // audit invariant; pro-rates first iteration by (1 - mFraction) for fractional
    // fireAge). Returns { endBalance, balanceAtUnlock, balanceAtSS, balanceAtFire,
    // minBalancePhase1..3, rows[] }.
    'simulateRetirementOnlySigned',

    // Full lifecycle (depends on resolveAccumulationOptions stub, accumulateToFire)
    'projectFullLifecycle',
  ];

  // Strategies block (for scoreAndRank)
  let strategiesBlock = '';
  try {
    strategiesBlock = _extractBlock(
      html,
      '// ==================== Feature 008 — Strategy Policies ====================',
      '// Feature 007 — each strategy.push row includes'
    );
  } catch (_e) {
    // If marker not found, try alternative extraction
    strategiesBlock = '';
  }

  // Extract each function, skipping any that are not found.
  const fnCode = FNAMES.map(n => {
    try { return _extractFn(html, n); } catch (_e) { return ''; }
  }).join('\n\n');

  // scoreAndRank — extracted separately since it may depend on the strategies block
  let scoreAndRankFn = '';
  try { scoreAndRankFn = _extractFn(html, 'scoreAndRank'); } catch (_e) { /* not required */ }
  let rankByObjectiveFn = '';
  try { rankByObjectiveFn = _extractFn(html, 'rankByObjective'); } catch (_e) { /* not required */ }

  // ----- Override / stub block -----
  // These stubs replace DOM-dependent or global-state-dependent helpers.
  // They read persona data from sandbox parameters rather than DOM globals.
  const OVERRIDES = `
// ---- HARNESS STUBS (injected by harness.js buildSandboxFactory) ----

// Stub: getMortgageInputs — reads from _harnessPersonaInp (persona.inp)
function getMortgageInputs() {
  var inp = _harnessPersonaInp;
  if (!inp.mortgageEnabled) return null;
  // Map persona inp fields to the mtg object shape accumulateToFire expects.
  var buyInYears = inp.mtgBuyInYears || 0;
  var yearsPaid  = inp.mtgYearsPaid  || 0;
  var ownership;
  if (buyInYears > 0) {
    ownership = 'buying-in';
  } else if (yearsPaid > 0) {
    ownership = 'already-own';
  } else {
    ownership = 'buying-now';
  }
  return {
    ownership:    ownership,
    buyInYears:   buyInYears,
    yearsPaid:    yearsPaid,
    homePrice:    inp.mtgHomePrice    || 600000,
    downPayment:  inp.mtgDownPayment  || 120000,
    closingCosts: inp.mtgClosingCosts || 17000,
    rate:         inp.mtgRate         || 0.06,
    term:         inp.mtgTerm         || 30,
    propertyTax:  inp.mtgPropertyTax  || 8000,
    insurance:    inp.mtgInsurance    || 2400,
    hoa:          inp.mtgHOA          || 200,
    sellAtFire:   (inp.mtgSellAtFire === 'yes' || inp.mtgSellAtFire === true),
    homeLocation: inp.mtgHomeLocation || 'us',
    apprec:       inp.mtgApprec       || 0.02,
  };
}

// Stub: getSecondHomeInputs — returns null (second home not exercised in harness baseline)
function getSecondHomeInputs() {
  return null;
}

// Stub: getTotalCollegeCostForYear — returns 0
function getTotalCollegeCostForYear(inp, yearsFromNow) { return 0; }

// Stub: getHealthcareDeltaAnnual — returns 0
function getHealthcareDeltaAnnual(scenarioId, age, inp) { return 0; }

// Stub: calcPerChildAllowance — returns 0
function calcPerChildAllowance(children, projYear, fireYear) { return 0; }

// Stub: getActiveChartStrategyOptions — returns undefined (use default bracket-fill)
function getActiveChartStrategyOptions() { return undefined; }

// Stub: getActiveMortgageStrategyOptions — derived from persona.inp flags
function getActiveMortgageStrategyOptions() {
  var inp = _harnessPersonaInp;
  var strat = 'invest-keep-paying';
  if (inp.pviStrategyPrepay)         strat = 'prepay-extra';
  if (inp.pviStrategyInvestLumpSum)  strat = 'invest-lump-sum';
  return { mortgageStrategyOverride: strat };
}

// Stub: resolveAccumulationOptions — synthesized from persona.inp
function resolveAccumulationOptions(inp, fireAge, mortgageStrategyOverride) {
  var _mtg = (inp.mortgageEnabled) ? getMortgageInputs() : null;
  var strat = mortgageStrategyOverride || getActiveMortgageStrategyOptions().mortgageStrategyOverride;
  return {
    mortgageStrategyOverride: strat,
    mortgageEnabled:          !!(inp.mortgageEnabled && _mtg),
    mortgageInputs:           _mtg,
    secondHomeEnabled:        false,
    secondHomeInputs:         null,
    rentMonthly:              inp.exp_0 || 2690,
    pviExtraMonthly:          inp.pviExtraMonthly || 0,
    selectedScenario:         inp.selectedScenario || 'us',
    collegeFn:                null,
    payoffVsInvestFn:         null,
    framing:                  'liquidNetWorth',
    mfjStatus:                (inp.adultCount === 2) ? 'mfj' : 'single',
  };
}

// Stub: getMortgageAdjustedRetirement — returns base spend unchanged (simplified)
// The full version reads DOM; we use a simplified version for the harness.
// For tests that need exact mortgage retirement math, use the invariant's
// ctx.chart rows which use the full projectFullLifecycle.
function getMortgageAdjustedRetirement(scenarioAnnualSpend, yrsToFire) {
  if (!_harnessPersonaInp.mortgageEnabled) return { annualSpend: scenarioAnnualSpend, saleProceeds: 0 };
  var mtg = getMortgageInputs();
  if (!mtg) return { annualSpend: scenarioAnnualSpend, saleProceeds: 0 };
  // Simplified: if selling at FIRE, remove rent-equivalent from spend
  if (mtg.sellAtFire) {
    return { annualSpend: scenarioAnnualSpend, saleProceeds: 0 };
  }
  return { annualSpend: scenarioAnnualSpend, saleProceeds: 0 };
}

// Stub: getSelectedRelocationCost — returns 0 (country relocation cost)
function getSelectedRelocationCost() { return 0; }

// Stub: getSelectedVisaCostAnnual — returns 0
function getSelectedVisaCostAnnual() { return 0; }

// Stub: yearsToFIREcache — used by projectFullLifecycle when overrideFireAge is null
var yearsToFIREcache = 10;

// Constant: SAFE_TERMINAL_FIRE_RATIO — defined at top-level in HTML (line 8889);
// brace-balanced extractor only captures function declarations, so we redeclare here
// so isFireAgeFeasible / findFireAgeNumerical can resolve it under Safe mode.
var SAFE_TERMINAL_FIRE_RATIO = 0.20;

// Stub: _lastStrategyResults / _previewStrategyId — no active strategy preview
var _lastStrategyResults = null;
var _previewStrategyId   = null;

// Stub: _dwzPreciseCache — consumed by DWZ wrappers
var _dwzPreciseCache = null;

// Stub: childrenList (per-child allowance overlay)
var childrenList = [];

// Stub: scenarios array (for country scenario lookup)
var scenarios = [
  { id: 'us',     relocationCost: 0, visaCostAnnual: 0, budgetTiers: { lean: 40000, normal: 70000, comfortable: 120000 } },
  { id: 'japan',  relocationCost: 5000, visaCostAnnual: 0, budgetTiers: { lean: 30000, normal: 50000, comfortable: 80000 } },
  { id: 'taiwan', relocationCost: 3000, visaCostAnnual: 0, budgetTiers: { lean: 25000, normal: 40000, comfortable: 65000 } },
];

// Stub: selectedScenario global (mirrors HTML global)
var selectedScenario = _harnessSelectedScenario;

// Stub: mortgageEnabled global (mirrors HTML global)
var mortgageEnabled = !!_harnessPersonaInp.mortgageEnabled;

// Stub: secondHomeEnabled global
var secondHomeEnabled = !!_harnessPersonaInp.secondHomeEnabled;

// Stub: chartState / getChartState / setChartState (needed by findFireAgeNumerical callers)
var _chartState = { calculatedFireAge: null, fireAgeOverride: null };
function getChartState() { return _chartState; }
function setChartState(k, v) { _chartState[k] = v; }

// Stub: SS globals needed by calcRealisticSSA → getSSAnnual
var ssEarningsHistory = [
  { year: 2019, earnings: 90000,  credits: 4 },
  { year: 2020, earnings: 95000,  credits: 4 },
  { year: 2021, earnings: 100000, credits: 4 },
  { year: 2022, earnings: 105000, credits: 4 },
  { year: 2023, earnings: 110000, credits: 4 },
  { year: 2024, earnings: 115000, credits: 4 },
  { year: 2025, earnings: 120000, credits: 4 },
];
var SS_EARNINGS_CAP = 168600;

// Stub: BIRTHDATES — used by calcAge (called inside getFullEarningsHistory)
var BIRTHDATES = {
  person1: new Date(2026 - (_harnessPersonaInp.agePerson1 || _harnessPersonaInp.ageRoger || 42), 0, 1),
  person2: new Date(2026 - (_harnessPersonaInp.agePerson2 || _harnessPersonaInp.ageRebecca || 42), 0, 1),
};

// Stub: calcAge — returns age from a birthdate relative to today
function calcAge(birthDate) {
  if (!birthDate) return 42;
  var today = new Date(2026, 3, 30); // fixed date anchor
  var age = today.getFullYear() - birthDate.getFullYear();
  var m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
}

// Stub: getFullEarningsHistory — returns a simplified earnings history
// so calcRealisticSSA can compute PIA without DOM access.
function getFullEarningsHistory(fireAge) {
  var inp = _harnessPersonaInp;
  var currentAge = inp.agePerson1 || inp.ageRoger || 42;
  var currentYear = 2026;
  var fireYear = currentYear + (fireAge - currentAge);
  var avgEarnings = inp.ssAvgEarnings || 100000;
  var workStart = inp.ssWorkStart || 2019;

  var allEarnings = [];
  for (var y = workStart; y < fireYear; y++) {
    var yearsOut = y - workStart;
    var earnings = Math.min(
      Math.round(avgEarnings * Math.pow(1.03, yearsOut)),
      SS_EARNINGS_CAP
    );
    allEarnings.push({ year: y, earnings: earnings, credits: 4 });
  }
  return allEarnings;
}

// ---- END HARNESS STUBS ----
`;

  // Minimal document stub for functions that call document.getElementById
  // Functions like findFireAgeNumerical may check DOM for inp fields — stub them.
  const DOC_STUB = {
    getElementById: function(id) {
      // Common IDs queried by the HTML functions
      const vals = {
        terminalBuffer:     { value: '0' },
        exp_0:              { value: '2690' },
        endAge:             { value: '100' },
        rule55Enabled:      { checked: false },
        rule55SeparationAge: { value: '54' },
        safetyMargin:       { value: '5' },
        irmaaThreshold:     { value: '212000' },
        twStdDed:           { value: '30000' },
        twTop12:            { value: '94300' },
        twTop22:            { value: '201050' },
        adultCount:         { value: '2' },
        pviStrategyPrepay:  { checked: false },
        pviStrategyInvestLumpSum: { checked: false },
      };
      return vals[id] || null;
    },
  };

  // Build the full sandbox code string.
  // Parameters: _harnessPersonaInp, _harnessSelectedScenario, document, window, accumulateToFire
  // Feature 021 US4: prepend the strategy-ranker hysteresis source so
  // _newWinnerBeats / _scoreDeltaToYears / HYSTERESIS_YEARS are in scope for
  // the extracted scoreAndRank() to call.
  const sandboxCode = [
    _STRATEGY_RANKER_INJECTED_SRC,
    fnCode,
    strategiesBlock,
    scoreAndRankFn,
    rankByObjectiveFn,
    OVERRIDES,
    // Return the harness API
    'return {',
    '  signedLifecycleEndBalance:    (typeof signedLifecycleEndBalance !== "undefined")    ? signedLifecycleEndBalance    : null,',
    '  simulateRetirementOnlySigned: (typeof simulateRetirementOnlySigned !== "undefined") ? simulateRetirementOnlySigned : null,',
    '  isFireAgeFeasible:            (typeof isFireAgeFeasible !== "undefined")            ? isFireAgeFeasible            : null,',
    '  findFireAgeNumerical:         (typeof findFireAgeNumerical !== "undefined")         ? findFireAgeNumerical         : null,',
    '  projectFullLifecycle:         (typeof projectFullLifecycle !== "undefined")         ? projectFullLifecycle         : null,',
    '  scoreAndRank:                 (typeof scoreAndRank !== "undefined")                 ? scoreAndRank                 : null,',
    '};',
  ].join('\n');

  let factory;
  try {
    factory = new Function(
      '_harnessPersonaInp',
      '_harnessSelectedScenario',
      'document',
      'window',
      'accumulateToFire',
      sandboxCode
    );
  } catch (err) {
    throw new Error('[harness._getSandboxFactory] Failed to compile sandbox for ' + dashboard + ': ' + err.message);
  }

  // Wrap factory to also pass the doc stub and a minimal window stub.
  // Build the DOC_STUB PER-PERSONA so persona-driven fields (terminalBuffer,
  // safetyMargin, etc.) flow into HTML helpers that read via document.getElementById.
  // Otherwise findFireAgeNumerical falls back to static stubs (e.g.,
  // terminalBuffer='0') and produces trivially-feasible results.
  const boundFactory = function(inp, scenario) {
    const _win = {
      computePayoffVsInvest: null,  // no PvI in harness baseline
    };
    inp = inp || {};
    const _v = function(key, fb) { return (inp[key] != null) ? { value: String(inp[key]) } : { value: fb }; };
    const _c = function(key, fb) { return { checked: (inp[key] != null) ? !!inp[key] : fb }; };
    const _personaVals = {
      terminalBuffer:           _v('terminalBuffer', '2'),
      exp_0:                    _v('exp_0', '2690'),
      endAge:                   _v('endAge', '100'),
      rule55Enabled:            _c('rule55Enabled', false),
      rule55SeparationAge:      _v('rule55SeparationAge', '54'),
      safetyMargin:             _v('safetyMargin', '5'),
      irmaaThreshold:           _v('irmaaThreshold', '212000'),
      twStdDed:                 _v('twStdDed', '30000'),
      twTop12:                  _v('twTop12', '94300'),
      twTop22:                  _v('twTop22', '201050'),
      adultCount:               _v('adultCount', '2'),
      pviStrategyPrepay:        _c('pviStrategyPrepay', false),
      pviStrategyInvestLumpSum: _c('pviStrategyInvestLumpSum', false),
      bufferUnlock:             _v('bufferUnlock', '1.5'),
      bufferSS:                 _v('bufferSS', '1.0'),
    };
    const _personaDoc = { getElementById: function(id) { return _personaVals[id] || null; } };
    return factory(inp, scenario, _personaDoc, _win, _accumulateToFire);
  };

  _sandboxFactoryCache.set(dashboard, boundFactory);
  return boundFactory;
}

// ---------------------------------------------------------------------------
// HarnessContext cache — cached per persona ID (avoids re-running expensive sims)
// ---------------------------------------------------------------------------

/** @type {Map<string, object>} */
const _contextCache = new Map();

/**
 * Build (or retrieve cached) HarnessContext for a persona.
 *
 * HarnessContext shape (per data-model.md):
 * {
 *   chart: LifecycleChartRows[]         // projectFullLifecycle output
 *   signedSim: SignedLifecycleResult    // signedLifecycleEndBalance output
 *   strategyRanking: StrategyRankingResult  // scoreAndRank output (may be null if unavailable)
 *   fireAgeByMode: { safe, exact, dieWithZero }
 *   fireNumberByMode: { safe, exact, dieWithZero }
 *   _api: object                        // raw sandbox API (for invariants needing direct access)
 * }
 *
 * Throws if the persona's sandbox cannot be constructed or the simulation throws.
 * The harness catches this and creates a special persona-construction-failed finding.
 *
 * @param {object} persona  { id, dashboard, inp, notes }
 * @returns {object} HarnessContext
 */
function buildHarnessContext(persona) {
  if (!persona || typeof persona.id !== 'string') {
    throw new Error('[harness.buildHarnessContext] persona.id must be a string');
  }

  if (_contextCache.has(persona.id)) return _contextCache.get(persona.id);

  const { dashboard, inp } = persona;
  const factory = _getSandboxFactory(dashboard);
  const api = factory(inp, inp.selectedScenario || 'us');

  if (!api.signedLifecycleEndBalance) {
    throw new Error('[harness.buildHarnessContext] signedLifecycleEndBalance not found in ' + dashboard + ' sandbox');
  }
  if (!api.findFireAgeNumerical) {
    throw new Error('[harness.buildHarnessContext] findFireAgeNumerical not found in ' + dashboard + ' sandbox');
  }
  if (!api.projectFullLifecycle) {
    throw new Error('[harness.buildHarnessContext] projectFullLifecycle not found in ' + dashboard + ' sandbox');
  }

  const annualSpend = inp.annualSpend || 72700;

  // Compute fireAge by each mode using the signed sim's findFireAgeNumerical.
  const fireAgeByMode = {};
  const fireNumberByMode = {};

  for (const mode of ['safe', 'exact', 'dieWithZero']) {
    try {
      const result = api.findFireAgeNumerical(inp, annualSpend, mode);
      fireAgeByMode[mode]   = result;
      // FIRE number = annualSpend / SWR (conventional 4% rule estimate)
      const swr = inp.swr || 0.04;
      fireNumberByMode[mode] = annualSpend / swr;
    } catch (err) {
      // Non-fatal: record sentinel
      fireAgeByMode[mode]   = { years: null, months: 0, totalMonths: null, feasible: false, error: err.message };
      fireNumberByMode[mode] = annualSpend / (inp.swr || 0.04);
    }
  }

  // Use the 'safe' FIRE age for the primary lifecycle projection.
  const safeModeResult = fireAgeByMode['safe'];
  const currentAge = inp.agePerson1 != null ? inp.agePerson1 : (inp.ageRoger || 42);
  const rawFireAge = safeModeResult && safeModeResult.feasible
    ? currentAge + safeModeResult.years
    : currentAge + 13;  // fallback for unreachable FIRE scenarios
  // B-020-7 / Feature 021 US6 clamp: bound fireAge ≤ endAge to mirror live UI.
  // The browser dashboard clamps fireAge ≤ endAge in `findFireAgeNumerical`'s
  // post-processing (so charts never project beyond the plan horizon). The
  // harness's sandboxed extraction of findFireAgeNumerical does not include
  // that clamp wrapper, so without this line edge personas like
  // `RR-edge-fire-at-endage` (currentAge + accumulationYears > endAge) feed an
  // out-of-horizon fireAge into projectFullLifecycle / signedLifecycleEndBalance,
  // producing artificial endBalance-mismatch warnings (HIGH C3 finding in
  // feature 020 audit). The clamp brings the harness in lockstep with the UI.
  const endAge = inp.endAge || 100;
  const defaultFireAge = Math.min(rawFireAge, endAge);

  // Run projectFullLifecycle for the chart context.
  let chart = [];
  try {
    const lifecycleResult = api.projectFullLifecycle(inp, annualSpend, defaultFireAge, true, undefined);
    chart = Array.isArray(lifecycleResult) ? lifecycleResult : [];
  } catch (err) {
    // Non-fatal chart failure — log and continue with empty chart
    console.error('[harness.buildHarnessContext] projectFullLifecycle threw for persona ' + persona.id + ':', err.message);
    chart = [];
  }

  // Run signedLifecycleEndBalance for the signed sim context.
  let signedSim = null;
  try {
    signedSim = api.signedLifecycleEndBalance(inp, annualSpend, defaultFireAge);
  } catch (err) {
    console.error('[harness.buildHarnessContext] signedLifecycleEndBalance threw for persona ' + persona.id + ':', err.message);
    signedSim = null;
  }

  // Run scoreAndRank if available.
  let strategyRanking = null;
  if (api.scoreAndRank) {
    try {
      strategyRanking = api.scoreAndRank(inp, defaultFireAge, 'safe', 'leave-more-behind');
    } catch (err) {
      console.error('[harness.buildHarnessContext] scoreAndRank threw for persona ' + persona.id + ':', err.message);
      strategyRanking = null;
    }
  }

  const ctx = {
    chart,
    signedSim,
    strategyRanking,
    fireAgeByMode,
    fireNumberByMode,
    _api: api,
    _defaultFireAge: defaultFireAge,
  };

  _contextCache.set(persona.id, ctx);
  return ctx;
}

// ---------------------------------------------------------------------------
// runHarness — the main entry point
// ---------------------------------------------------------------------------

/**
 * Run the full persona × invariant matrix.
 *
 * @param {object[]} personas   Array of Persona objects
 * @param {object[]} invariants Array of Invariant objects
 *   Each invariant must have: { id, family, description, severity, check(persona, ctx) }
 * @param {object}  [options]
 *   options.onFinding(finding)  — called for each finding as it is discovered
 *   options.silent              — suppress console summary if true
 * @returns {object} HarnessResult {
 *   totalCells, passed, failed, findings, durationMs
 * }
 */
function runHarness(personas, invariants, options) {
  const opts = options || {};

  // Env-var filters (per contract §Filtering)
  const filterPersona   = process.env.PERSONA   || null;
  const filterInvariant = process.env.INVARIANT  || null;
  const filterFamily    = process.env.FAMILY     || null;

  // Apply persona filter
  const activePersonas = filterPersona
    ? personas.filter(p => p.id === filterPersona)
    : personas;

  // Apply invariant filter
  const activeInvariants = invariants.filter(inv => {
    if (filterInvariant && inv.id !== filterInvariant) return false;
    if (filterFamily && inv.family !== filterFamily) return false;
    return true;
  });

  const findings   = [];
  let   passed     = 0;
  let   failed     = 0;
  const startMs    = Date.now();

  const totalCells = activePersonas.length * activeInvariants.length;

  for (const persona of activePersonas) {
    // Build harness context (cached after first build per persona).
    let ctx;
    let contextError = null;

    const cellStart = Date.now();
    try {
      ctx = buildHarnessContext(persona);
    } catch (err) {
      contextError = err;
    }
    const contextDuration = Date.now() - cellStart;

    if (contextDuration > 5000) {
      console.error('[harness] SLOW CELL WARNING: persona=' + persona.id + ' context build took ' + contextDuration + 'ms');
    }

    if (contextError) {
      // Special finding per contract §Lifecycle step 4
      const specialFinding = {
        invariantId:          'harness/persona-construction-failed',
        invariantDescription: 'Harness context construction failed — persona could not be evaluated.',
        invariantSeverity:    'CRITICAL',
        invariantFamily:      'harness',
        personaId:            persona.id,
        observed:             contextError.message,
        expected:             'HarnessContext built without throwing',
        severity:             'CRITICAL',
        status:               'OPEN',
        fixCommitHash:        undefined,
        deferralRationale:    undefined,
        discoveredAt:         new Date().toISOString(),
        notes:                'Context build threw: ' + contextError.stack,
      };
      findings.push(specialFinding);
      failed += activeInvariants.length;  // count all invariants as failed for this persona
      if (typeof opts.onFinding === 'function') opts.onFinding(specialFinding);
      continue;
    }

    // Run each invariant against this persona's context.
    for (const invariant of activeInvariants) {
      let result;
      try {
        result = invariant.check(persona, ctx);
      } catch (checkErr) {
        // If the invariant check itself throws, treat as a check failure.
        result = {
          passed:   false,
          observed: 'check threw: ' + checkErr.message,
          expected: 'invariant check to complete without throwing',
          notes:    checkErr.stack,
        };
      }

      if (!result || result.passed === true) {
        passed++;
      } else {
        failed++;
        const finding = {
          invariantId:          invariant.id,
          invariantDescription: invariant.description || '',
          invariantSeverity:    invariant.severity || 'LOW',
          invariantFamily:      invariant.family   || 'unknown',
          personaId:            persona.id,
          observed:             result.observed,
          expected:             result.expected,
          severity:             invariant.severity || 'LOW',
          status:               'OPEN',
          fixCommitHash:        undefined,
          deferralRationale:    undefined,
          discoveredAt:         new Date().toISOString(),
          notes:                result.notes || undefined,
        };
        findings.push(finding);
        if (typeof opts.onFinding === 'function') opts.onFinding(finding);
      }
    }
  }

  const durationMs = Date.now() - startMs;

  // Console summary (per contract §Output)
  if (!opts.silent) {
    const critCount   = findings.filter(f => f.severity === 'CRITICAL').length;
    const highCount   = findings.filter(f => f.severity === 'HIGH').length;
    const medCount    = findings.filter(f => f.severity === 'MEDIUM').length;
    const lowCount    = findings.filter(f => f.severity === 'LOW').length;
    console.log(
      '[harness] ' + totalCells + ' cells, ' + passed + ' passed, ' + failed + ' failed' +
      ' (CRITICAL=' + critCount + ' HIGH=' + highCount + ' MEDIUM=' + medCount + ' LOW=' + lowCount + ').' +
      ' Duration ' + (durationMs / 1000).toFixed(1) + 's.'
    );
  }

  return {
    totalCells,
    passed,
    failed,
    findings,
    durationMs,
  };
}

/**
 * Clear the HarnessContext cache.
 * Useful in tests that need a fresh build per test case.
 */
function clearContextCache() {
  _contextCache.clear();
}

/**
 * Clear the sandbox factory cache.
 * Useful if HTML files are modified between runs (rare in tests).
 */
function clearSandboxCache() {
  _sandboxFactoryCache.clear();
  _htmlCache.clear();
}

module.exports = {
  buildHarnessContext,
  runHarness,
  clearContextCache,
  clearSandboxCache,
  // Expose extractor for tests that need to build custom sandboxes
  _extractFn,
};
