/*
 * calc/calcAudit.js — Audit Snapshot Assembler (pure observability layer).
 *
 * Feature: 014-calc-audit
 * Contract: specs/014-calc-audit/contracts/audit-assembler.contract.md
 * Data model: specs/014-calc-audit/data-model.md
 *
 * Inputs:
 *   - options: an object with these required keys:
 *       inputs                       — resolved-input snapshot (from getInputs())
 *       fireAge                      — number (currently displayed FIRE age)
 *       fireMode                     — 'safe' | 'exact' | 'dieWithZero'
 *       annualSpend                  — number (post-mortgage-adjusted spend)
 *       rawAnnualSpend               — number (pre-adjustment spend)
 *       effectiveSpendByYear         — Array<{age:number, spend:number}>
 *       lastStrategyResults          — object | null (canonical _lastStrategyResults)
 *       fireAgeCandidates            — Array<{age, signedEndBalance, feasibleUnderActiveMode}>
 *       projectFullLifecycle         — calc-engine function reference
 *       signedLifecycleEndBalance    — calc-engine function reference
 *       isFireAgeFeasible            — calc-engine function reference
 *       getActiveChartStrategyOptions — calc-engine function reference
 *       t                            — i18n helper (key, ...args) => string
 *       doc                          — Document | null (null in Node tests)
 *     Optional:
 *       prebuiltChart                — pre-computed chart rows (perf opt; if
 *                                      provided, the assembler does not call
 *                                      projectFullLifecycle for the lifecycle
 *                                      projection section)
 *
 * Outputs: AuditSnapshot per data-model.md, with these top-level keys:
 *   {
 *     schemaVersion: '1.0',
 *     generatedAt: ISO 8601 string,
 *     flowDiagram: { stages: [6 stages] },
 *     resolvedInputs: { raw, derivedFrom, composition },
 *     spendingAdjustments: { rawAnnualSpend, mortgageAdjustedAnnualSpend, ...},
 *     gates: [GateEvaluation x3 in order safe/exact/dieWithZero],
 *     fireAgeResolution: { displayedFireAge, searchMethod, candidates, ... },
 *     strategyRanking: { winnerId, rows, barChartSeries },
 *     lifecycleProjection: { rows, thumbnailSeries, fireAgeRowIndex },
 *       — rows[*].hasShortfall: boolean (Feature 015 US1, FR-004) flags years
 *         where the active strategy could not fund spending from any pool.
 *     crossValidationWarnings: CrossValidationWarning[],
 *   }
 *
 * Consumers:
 *   - FIRE-Dashboard.html — Audit-tab renderers (flow diagram + 7 detail
 *     sections + chart-instance builders) and the Copy Debug button serializer.
 *   - FIRE-Dashboard-Generic.html — same renderers (lockstep).
 *   - tests/unit/calcAudit.test.js — locks the contract.
 *
 * Invariants:
 *   - Determinism: same `options` produce byte-identical output (modulo
 *     the `generatedAt` timestamp).
 *   - Pure: no DOM, no Chart.js, no globals, no module-scope mutation.
 *     All state arrives via `options`. `doc` may be `null` in tests; the
 *     assembler degrades gracefully.
 *   - Numeric values rounded to integer dollars.
 *   - gates always [safe, exact, dieWithZero] regardless of fireMode.
 *   - Exactly one gate has isActiveMode: true.
 *   - Calc-function failures never bubble: caught and surfaced as an
 *     'assembler-degraded' CrossValidationWarning.
 *
 * Purity: no DOM, no Chart.js, no globals, no I/O, no module-scope mutation.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCHEMA_VERSION = '1.0';

/** Fixed gate order — the assembler MUST emit exactly these in this sequence. */
const GATE_ORDER = ['safe', 'exact', 'dieWithZero'];

/** Required option keys per contract §Required options. */
const REQUIRED_OPTION_KEYS = [
  'inputs',
  'fireAge',
  'fireMode',
  'annualSpend',
  'rawAnnualSpend',
  'effectiveSpendByYear',
  'lastStrategyResults', // null permitted, but the key must be present
  'fireAgeCandidates',
  'projectFullLifecycle',
  'signedLifecycleEndBalance',
  'isFireAgeFeasible',
  'getActiveChartStrategyOptions',
  't',
  'doc', // null permitted (Node tests), but the key must be present
];

/** Cross-validation A: signed-sim is bracket-fill-only by design. */
const BRACKET_FILL_STRATEGY_ID = 'bracket-fill-smoothed';

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Round to integer dollars; preserves NaN/Infinity as 0 to keep JSON valid. */
function _round(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
  return Math.round(n);
}

/** Safe percentage: returns 0 when denominator is 0 to avoid Infinity. */
function _pct(num, denom) {
  if (!Number.isFinite(num) || !Number.isFinite(denom) || denom === 0) return 0;
  return Math.round((num / denom) * 1000) / 10; // one decimal
}

/**
 * Validate required options. Throws TypeError listing the first missing key.
 * Per contract: missing required → throw; we allow null/0/'' as valid because
 * they're meaningful sentinels for things like lastStrategyResults / doc /
 * fireAge=0. We only reject `undefined`.
 */
function _validateRequired(options) {
  if (!options || typeof options !== 'object') {
    throw new TypeError("assembleAuditSnapshot: 'options' object is required");
  }
  for (const key of REQUIRED_OPTION_KEYS) {
    if (options[key] === undefined) {
      throw new TypeError(
        `assembleAuditSnapshot: required option '${key}' missing`,
      );
    }
  }
}

/**
 * Locate the active strategy id given a `lastStrategyResults` object.
 * Returns the explicit `winnerId`, or the row marked `isWinner: true`,
 * or null if neither is determinable.
 */
function _getActiveStrategyId(lastStrategyResults) {
  if (!lastStrategyResults || typeof lastStrategyResults !== 'object') return null;
  if (typeof lastStrategyResults.winnerId === 'string'
    && lastStrategyResults.winnerId.length > 0) {
    return lastStrategyResults.winnerId;
  }
  const rows = Array.isArray(lastStrategyResults.rows) ? lastStrategyResults.rows : [];
  const winnerRow = rows.find((r) => r && r.isWinner === true);
  return winnerRow ? winnerRow.strategyId : null;
}

/** Pick the active strategy row (or null). */
function _getActiveStrategyRow(lastStrategyResults, activeId) {
  if (!lastStrategyResults || !Array.isArray(lastStrategyResults.rows)) return null;
  if (!activeId) return null;
  return lastStrategyResults.rows.find((r) => r && r.strategyId === activeId) || null;
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function _buildResolvedInputs(inputs) {
  const raw = inputs && typeof inputs === 'object' ? { ...inputs } : {};
  const composition = {
    accessibleStocks: _round(raw.pStocksTaxable || 0),
    cash: _round(raw.pCashTaxable || 0),
    locked401kTrad: _round(raw.p401kTrad || 0),
    locked401kRoth: _round(raw.p401kRoth || 0),
  };
  // derivedFrom: surface a few well-known defaults so the user can see when a
  // value came from the default vs an explicit input. The `bufferUnlock`,
  // `bufferSS`, and `terminalBuffer` defaults are 1, 1, 0 respectively in the
  // dashboard; if the resolved value matches the default, mark it.
  const derivedFrom = [];
  if (raw.bufferUnlock === 1) derivedFrom.push({ key: 'bufferUnlock', value: 1, source: 'default' });
  if (raw.bufferSS === 1) derivedFrom.push({ key: 'bufferSS', value: 1, source: 'default' });
  if (raw.terminalBuffer === 0) derivedFrom.push({ key: 'terminalBuffer', value: 0, source: 'default' });
  return { raw, derivedFrom, composition };
}

function _buildSpendingAdjustments(options) {
  const rawAnnualSpend = _round(options.rawAnnualSpend);
  const mortgageAdjustedAnnualSpend = _round(options.annualSpend);
  const mortgageDelta = mortgageAdjustedAnnualSpend - rawAnnualSpend;
  const effectiveSpendByYear = Array.isArray(options.effectiveSpendByYear)
    ? options.effectiveSpendByYear.map((p) => ({
      x: typeof p.age === 'number' ? p.age : 0,
      y: _round(p.spend),
    }))
    : [];

  // College years and home2 are nice-to-have; pull from inputs if present.
  const inp = options.inputs || {};
  const collegeYears = Array.isArray(inp.collegeYears) ? inp.collegeYears : [];
  const home2 = (inp.home2 && typeof inp.home2 === 'object')
    ? {
      buyAge: typeof inp.home2.buyAge === 'number' ? inp.home2.buyAge : null,
      sellAge: typeof inp.home2.sellAge === 'number' ? inp.home2.sellAge : null,
      annualCarry: _round(inp.home2.annualCarry || 0),
    }
    : { buyAge: null, sellAge: null, annualCarry: 0 };

  return {
    rawAnnualSpend,
    mortgageAdjustedAnnualSpend,
    mortgageDelta,
    collegeYears,
    home2,
    effectiveSpendByYear,
  };
}

/**
 * Walk a chart row array and emit per-row floor violations for safe/DWZ gates.
 * The floor is `bufferUnlock × annualSpend` for ages < 59.5 and
 * `bufferSS × annualSpend` for ages >= 59.5.
 *
 * Returns { violations: [{age,total,floor}], trajectorySeries, floorSeries }.
 */
function _scanFloorViolations(chart, inp, annualSpend, fireAge) {
  const violations = [];
  const trajectorySeries = [];
  const floorSeries = [];
  if (!Array.isArray(chart)) {
    return { violations, trajectorySeries, floorSeries, firstViolationAge: null };
  }
  const bufUnlock = (inp.bufferUnlock || 0) * annualSpend;
  const bufSS = (inp.bufferSS || 0) * annualSpend;
  const UNLOCK_AGE = 59.5;

  let firstViolationAge = null;
  for (const row of chart) {
    if (!row || typeof row.age !== 'number') continue;
    const total = typeof row.total === 'number' ? row.total : 0;
    const floor = (row.age < UNLOCK_AGE) ? bufUnlock : bufSS;
    trajectorySeries.push({ x: row.age, y: _round(total) });
    floorSeries.push({ x: row.age, y: _round(floor) });
    if (typeof fireAge === 'number' && row.age < fireAge) continue;
    if (total < floor) {
      violations.push({ age: row.age, total: _round(total), floor: _round(floor) });
      if (firstViolationAge === null) firstViolationAge = row.age;
    }
  }
  return { violations, trajectorySeries, floorSeries, firstViolationAge };
}

/**
 * Build a single GateEvaluation. Calls into projectFullLifecycle to produce
 * the per-gate trajectory; never throws (errors caught upstream).
 */
function _buildGate(mode, options, ctx) {
  const { inputs, fireAge, annualSpend, t } = options;
  const isActive = options.fireMode === mode;
  const activeStrategyId = ctx.activeStrategyId;

  // For the gate's strategy: under the constitution rule, the gate evaluates
  // the same strategy the chart renders. Use options.getActiveChartStrategyOptions
  // to match. For non-active modes we still report what would happen if that
  // mode were active — using the same active strategy.
  let chartOpts;
  try {
    const got = options.getActiveChartStrategyOptions();
    chartOpts = got || undefined;
  } catch (_e) {
    chartOpts = undefined;
  }

  let chart = ctx.prebuiltChart;
  if (!Array.isArray(chart)) {
    try {
      chart = options.projectFullLifecycle(inputs, annualSpend, fireAge, true, chartOpts);
    } catch (_e) {
      chart = null;
    }
  }

  // Scan floor violations against this gate's contract.
  let violations = [];
  let trajectorySeries = [];
  let floorSeries = [];
  let firstViolationAge = null;
  if (Array.isArray(chart)) {
    const scanned = _scanFloorViolations(chart, inputs, annualSpend, fireAge);
    trajectorySeries = scanned.trajectorySeries;
    floorSeries = scanned.floorSeries;
    if (mode === 'safe' || mode === 'dieWithZero') {
      violations = scanned.violations;
      firstViolationAge = scanned.firstViolationAge;
    }
  }

  // Determine verdict per gate's contract.
  // Safe: no floor violations AND endBalance >= 0
  // DieWithZero: no floor violations AND endBalance >= 0 (drain target = 0)
  // Exact: endBalance >= terminalBuffer × annualSpend
  let verdict;
  let reason;
  let formulaInputs;
  let formulaPlainEnglish;

  const lastTotal = (Array.isArray(chart) && chart.length > 0)
    ? (chart[chart.length - 1].total || 0)
    : 0;
  const floor = _round(((inputs.bufferUnlock || 0) * annualSpend));
  const floorSS = _round(((inputs.bufferSS || 0) * annualSpend));
  const terminalThreshold = _round(((inputs.terminalBuffer || 0) * annualSpend));

  if (mode === 'safe') {
    const passesEnd = lastTotal >= 0;
    const passesFloor = violations.length === 0;
    verdict = passesEnd && passesFloor;
    formulaInputs = {
      floor,
      floorSS,
      endAge: inputs.endAge,
      endBalance: _round(lastTotal),
    };
    if (verdict) {
      reason = t('audit.gate.safe.verdict.feasible', { floor, floorSS });
      formulaPlainEnglish = reason;
    } else {
      const args = {
        floor,
        floorSS,
        firstViolationAge,
        endBalance: _round(lastTotal),
      };
      reason = t('audit.gate.safe.verdict.infeasible', args);
      formulaPlainEnglish = reason;
    }
  } else if (mode === 'dieWithZero') {
    const passesEnd = lastTotal >= 0;
    const passesFloor = violations.length === 0;
    verdict = passesEnd && passesFloor;
    formulaInputs = {
      floor,
      floorSS,
      drainTarget: 0,
      endBalance: _round(lastTotal),
    };
    if (verdict) {
      reason = t('audit.gate.dieWithZero.verdict.feasible', { floor, floorSS });
      formulaPlainEnglish = reason;
    } else {
      const args = {
        floor,
        floorSS,
        firstViolationAge,
        endBalance: _round(lastTotal),
      };
      reason = t('audit.gate.dieWithZero.verdict.infeasible', args);
      formulaPlainEnglish = reason;
    }
  } else {
    // exact
    verdict = lastTotal >= terminalThreshold;
    formulaInputs = {
      terminalBuffer: inputs.terminalBuffer || 0,
      threshold: terminalThreshold,
      endBalance: _round(lastTotal),
    };
    if (verdict) {
      reason = t('audit.gate.exact.verdict.feasible', {
        endBalance: _round(lastTotal),
        threshold: terminalThreshold,
      });
      formulaPlainEnglish = reason;
    } else {
      reason = t('audit.gate.exact.verdict.infeasible', {
        endBalance: _round(lastTotal),
        threshold: terminalThreshold,
      });
      formulaPlainEnglish = reason;
    }
  }

  return {
    mode,
    isActiveMode: isActive,
    candidateFireAge: fireAge,
    strategyUsed: {
      id: activeStrategyId || BRACKET_FILL_STRATEGY_ID,
      theta: ctx.activeStrategyRow && typeof ctx.activeStrategyRow.chosenTheta !== 'undefined'
        ? ctx.activeStrategyRow.chosenTheta
        : null,
    },
    formulaPlainEnglish,
    formulaInputs,
    verdict,
    reason,
    violations,
    trajectorySeries,
    floorSeries,
  };
}

function _buildFireAgeResolution(options) {
  const candidates = Array.isArray(options.fireAgeCandidates)
    ? options.fireAgeCandidates.map((c) => ({
      age: typeof c.age === 'number' ? c.age : 0,
      signedEndBalance: _round(c.signedEndBalance),
      feasibleUnderActiveMode: c.feasibleUnderActiveMode === true,
    }))
    : [];

  // Search method: month-precision-interp is signaled by a non-integer
  // displayedFireAge when fireMode is 'dieWithZero'; otherwise integer-year.
  const isFractional = (typeof options.fireAge === 'number')
    && options.fireAge !== Math.floor(options.fireAge);
  const searchMethod = (options.fireMode === 'dieWithZero' && isFractional)
    ? 'month-precision-interp'
    : 'integer-year';

  let monthPrecisionResult = null;
  if (isFractional && options.fireMode === 'dieWithZero') {
    const totalMonths = Math.round(options.fireAge * 12);
    monthPrecisionResult = {
      totalMonths,
      fractionalAge: options.fireAge,
    };
  }

  return {
    displayedFireAge: options.fireAge,
    searchMethod,
    candidates,
    monthPrecisionResult,
  };
}

function _buildStrategyRanking(lastStrategyResults) {
  if (!lastStrategyResults || !Array.isArray(lastStrategyResults.rows)) {
    return {
      winnerId: null,
      rows: [],
      barChartSeries: { labels: [], datasets: [] },
    };
  }
  const winnerId = _getActiveStrategyId(lastStrategyResults);
  const rows = lastStrategyResults.rows.map((r) => ({
    strategyId: r.strategyId,
    chosenTheta: typeof r.chosenTheta !== 'undefined' ? r.chosenTheta : null,
    endBalance: _round(r.endBalance),
    lifetimeFederalTax: _round(r.lifetimeFederalTax),
    violations: typeof r.violations === 'number' ? r.violations : 0,
    firstViolationAge: typeof r.firstViolationAge === 'number' ? r.firstViolationAge : null,
    shortfallYears: typeof r.shortfallYears === 'number' ? r.shortfallYears : 0,
    firstShortfallAge: typeof r.firstShortfallAge === 'number' ? r.firstShortfallAge : null,
    hasShortfall: r.hasShortfall === true,
    safe_feasible: r.safe_feasible === true,
    exact_feasible: r.exact_feasible === true,
    dieWithZero_feasible: r.dieWithZero_feasible === true,
    feasibleUnderCurrentMode: r.feasibleUnderCurrentMode === true,
    isWinner: r.isWinner === true || r.strategyId === winnerId,
  }));

  const labels = rows.map((r) => r.strategyId);
  const datasets = [
    { label: 'End Balance ($)', data: rows.map((r) => r.endBalance) },
    { label: 'Lifetime Federal Tax ($)', data: rows.map((r) => r.lifetimeFederalTax) },
    { label: 'Floor Violations (count)', data: rows.map((r) => r.violations) },
  ];

  return {
    winnerId,
    rows,
    barChartSeries: { labels, datasets },
  };
}

function _buildLifecycleProjection(chart, fireAge) {
  if (!Array.isArray(chart) || chart.length === 0) {
    return { rows: [], thumbnailSeries: [], fireAgeRowIndex: -1 };
  }
  const rows = chart.map((r) => ({
    age: typeof r.age === 'number' ? r.age : 0,
    phase: typeof r.phase === 'string' ? r.phase : 'unknown',
    total: _round(r.total),
    p401k: _round(r.p401k),
    pStocks: _round(r.pStocks),
    pCash: _round(r.pCash),
    pRoth: _round(r.pRoth),
    ssIncome: _round(r.ssIncome),
    // Feature 015 follow-up — the simulator emits `withdrawal` (singular);
    // earlier audit code read `withdrawals` (plural) and so always serialized 0.
    // Read both names with the singular taking precedence.
    withdrawals: _round(typeof r.withdrawal === 'number' ? r.withdrawal : r.withdrawals),
    syntheticConversion: _round(r.syntheticConversion),
    // Feature 015 US1 (FR-004) — per-row shortfall flag. Defensive fallback to
    // false so legacy snapshots that pre-date the field still serialize cleanly.
    hasShortfall: r.hasShortfall === true,
  }));
  const thumbnailSeries = rows.map((r) => ({ x: r.age, y: r.total }));
  const fireAgeRowIndex = rows.findIndex((r) => r.age === fireAge);
  return { rows, thumbnailSeries, fireAgeRowIndex };
}

function _buildFlowDiagram(options, ctx) {
  const { inputs, fireAge, fireMode, annualSpend } = options;
  const inputsHeadline =
    `${inputs.ageRoger || '?'}yo · `
    + `$${_round((inputs.pStocksTaxable || 0) + (inputs.pCashTaxable || 0)
      + (inputs.p401kTrad || 0) + (inputs.p401kRoth || 0))} NW · `
    + `$${_round(annualSpend)} spend`;

  const spendingHeadline = `effective spend $${_round(options.rawAnnualSpend)} → $${_round(annualSpend)}`;

  // Gate headline: build a tiny summary inline using the active fireMode's
  // verdict from ctx if available; otherwise generic text.
  const gateVerdictText = (ctx.gateVerdicts && ctx.gateVerdicts[fireMode]) ? '✓' : '✗';
  const gatesHeadline = `${fireMode} ${gateVerdictText} at age ${fireAge}`;

  const fireAgeHeadline = `age ${fireAge}`;
  const winner = ctx.activeStrategyId || BRACKET_FILL_STRATEGY_ID;
  const strategyHeadline = `winner: ${winner}`;
  const lifecycleHeadline = ctx.lastTotal != null
    ? `end balance $${_round(ctx.lastTotal)} at age ${inputs.endAge || '?'}`
    : 'pending';

  // Feature 015 follow-up — `subSteps` enumerates the ORDERED sub-operations
  // the calc engine performs within each stage. The audit UI renders them
  // as a numbered list below each stage's headline so the user can see the
  // actual flow of computation, not just an opaque "stage" label.
  return {
    stages: [
      {
        stageId: 'inputs',
        label: 'Inputs',
        headlineOutput: inputsHeadline,
        downstreamArrowLabel: 'inputs',
        subSteps: [
          'Read 50+ DOM inputs via getInputs()',
          'Resolve scenario selection (geo-arbitrage country)',
          'Resolve fire mode (Safe / Exact / DWZ)',
          'Resolve objective (Preserve / Minimize Tax)',
          'Apply FIRE-age override (if drag-confirmed)',
        ],
      },
      {
        stageId: 'spending',
        label: 'Spending Adjustments',
        headlineOutput: spendingHeadline,
        downstreamArrowLabel: 'effectiveSpend',
        subSteps: [
          'Start with base annualSpend',
          'Apply mortgage P&I + tax + insurance + HOA delta',
          'Add college tuition + loan-repayment overlay (per-year)',
          'Add healthcare delta (pre-65 vs post-65)',
          'Add Home #2 annual carry (P&I + tax + other − rental)',
          'Subtract Social Security income (when ssActive)',
        ],
      },
      {
        stageId: 'gates',
        label: 'Gate Evaluations',
        headlineOutput: gatesHeadline,
        downstreamArrowLabel: 'verdict + active strategy',
        subSteps: [
          'Safe: every retirement-year total ≥ buffer × spend AND endBalance ≥ 0',
          'Exact: endBalance ≥ terminalBuffer × annualSpend',
          'DWZ: endBalance ≈ $0 at plan age',
          'All three use signedLifecycleEndBalance (bracket-fill default)',
        ],
      },
      {
        stageId: 'fireAge',
        label: 'FIRE Age Resolution',
        headlineOutput: fireAgeHeadline,
        downstreamArrowLabel: `fireAge = ${fireAge}`,
        subSteps: [
          'Linear scan from currentAge to endAge − 1',
          'For each candidate: signedLifecycleEndBalance simulation',
          'Apply isFireAgeFeasible(active mode) filter',
          'Return earliest passing age (Architecture B: single global age)',
          'Per-strategy ages computed via findPerStrategyFireAge (audit display only)',
        ],
      },
      {
        stageId: 'strategy',
        label: 'Strategy Ranking',
        headlineOutput: strategyHeadline,
        downstreamArrowLabel: 'strategy + θ',
        subSteps: [
          'Simulate all 7 strategies via _simulateStrategyLifetime',
          'tax-optimized-search: 3-pass θ-sweep (simulate 11 θ → filter feasibility → rank by tax)',
          'Spending-floor pass when Trad available but other pools depleted',
          'Compute residualArea + cumulativeFederalTax per strategy',
          'Resolve sort key via getActiveSortKey({mode, objective})',
          'Sort: primary → tie-breakers → strategyId alphabetical',
          'Pick winner (rankIndex 0); apply objective’s sort-key chain',
        ],
      },
      {
        stageId: 'lifecycle',
        label: 'Lifecycle Projection',
        headlineOutput: lifecycleHeadline,
        downstreamArrowLabel: '(end of pipeline)',
        subSteps: [
          'Call projectFullLifecycle(inp, spend, fireAge, true, options)',
          'Thread winner strategy + chosenTheta through options',
          'Per-year retirement loop calls taxOptimizedWithdrawal:',
          '  Step 1 — RMD floor (age 73+)',
          '  Step 2 — Bracket-fill smoothing (pTrad / yearsRemaining cap)',
          '  Step 3-6 — Compute mix (Trad → Roth → Stocks → Cash)',
          '  Step 7 — IRMAA cap (age 63+, may reduce Trad)',
          '  Step 7.5 — Spending-floor pass (Feature 015 — fund spending if Trad available)',
          '  Step 8 — Synthetic conversion (excess net into stocks)',
          'Mark hasShortfall on per-year rows when residual unfunded > 0',
          'Return per-year rows for chart + audit consumption',
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Cross-validation invariants (R-005, contract §Cross-validation invariants)
// ---------------------------------------------------------------------------

/**
 * Invariant A: signed-sim end balance vs chart-sim end balance.
 *   warn-if delta > $1000 AND deltaPct > 1
 *   expected-if active strategy is set AND != 'bracket-fill-smoothed'
 */
function _invariantA(options, ctx) {
  const out = [];
  let A;
  let B;
  try {
    const r = options.signedLifecycleEndBalance(options.inputs, options.annualSpend, options.fireAge);
    A = r && typeof r.endBalance === 'number' ? r.endBalance : null;
  } catch (_e) {
    return out; // Treated separately by degraded path elsewhere
  }
  if (!Array.isArray(ctx.chart) || ctx.chart.length === 0) return out;
  const lastRow = ctx.chart[ctx.chart.length - 1];
  B = lastRow && typeof lastRow.total === 'number' ? lastRow.total : null;

  if (A === null || B === null) return out;
  const delta = Math.abs(A - B);
  const denom = Math.max(Math.abs(A), Math.abs(B), 1);
  const deltaPct = (delta / denom) * 100;
  if (delta > 1000 && deltaPct > 1) {
    const expected = !!(ctx.activeStrategyId
      && ctx.activeStrategyId !== BRACKET_FILL_STRATEGY_ID);
    out.push({
      kind: 'endBalance-mismatch',
      valueA: _round(A),
      valueB: _round(B),
      delta: _round(delta),
      deltaPct: Math.round(deltaPct * 10) / 10,
      expected,
      reason: expected
        ? `signedLifecycleEndBalance is bracket-fill-only — active strategy is ${ctx.activeStrategyId}.`
        : 'signed-sim end balance differs from chart-sim end balance.',
      dualBarSeries: {
        labels: ['signed-sim', 'chart-sim'],
        data: [_round(A), _round(B)],
      },
    });
  }
  return out;
}

/**
 * Invariant B: ranker feasibleUnderCurrentMode vs chart-feasibility (via
 * isFireAgeFeasible) for the active strategy.
 *   warn-if A !== B
 *   expected-if false (always real)
 */
function _invariantB(options, ctx) {
  const out = [];
  if (!ctx.activeStrategyRow) return out;
  const A = ctx.activeStrategyRow.feasibleUnderCurrentMode === true;
  // Build a synthetic sim-like object for isFireAgeFeasible's signature; the
  // strategy-aware path uses projectFullLifecycle internally so the sim
  // argument is best-effort.
  let B;
  try {
    const sim = ctx.signedSim || { endBalance: 0, minBalancePhase1: Infinity, minBalancePhase2: Infinity, minBalancePhase3: Infinity };
    B = options.isFireAgeFeasible(sim, options.inputs, options.annualSpend, options.fireMode, options.fireAge) === true;
  } catch (_e) {
    return out;
  }
  if (A === B) return out;
  out.push({
    kind: 'feasibility-mismatch',
    valueA: A,
    valueB: B,
    delta: 1,
    deltaPct: 100,
    expected: false,
    reason: `internal-sim feasibility (${A}) disagrees with chart-sim (${B}) for strategy ${ctx.activeStrategyId}.`,
    dualBarSeries: {
      labels: ['internal-sim', 'chart-sim'],
      data: [A ? 1 : 0, B ? 1 : 0],
    },
  });
  return out;
}

/**
 * Invariant C: displayed FIRE age vs lastStrategyResults.fireAge.
 *   warn-if (B != null) AND (A !== B)
 *   expected-if false
 */
function _invariantC(options) {
  const out = [];
  const A = options.fireAge;
  const lsr = options.lastStrategyResults;
  if (!lsr || typeof lsr.fireAge !== 'number') return out;
  const B = lsr.fireAge;
  if (A === B) return out;
  out.push({
    kind: 'fireAge-mismatch',
    valueA: A,
    valueB: B,
    delta: Math.abs(A - B),
    deltaPct: _pct(Math.abs(A - B), B),
    expected: false,
    reason: `displayed FIRE age (${A}) differs from ranker FIRE age (${B}).`,
    dualBarSeries: {
      labels: ['displayed', 'ranker'],
      data: [A, B],
    },
  });
  return out;
}

/**
 * Invariant D: floor violation count consistency. The signal: if
 * isFireAgeFeasible returns true, count must be 0; if false, count must be > 0.
 */
function _invariantD(options, ctx) {
  const out = [];
  if (!Array.isArray(ctx.chart)) return out;
  const scanned = _scanFloorViolations(ctx.chart, options.inputs, options.annualSpend, options.fireAge);
  const chartViolationCount = scanned.violations.length;

  let isFeasible;
  try {
    const sim = ctx.signedSim || { endBalance: 0, minBalancePhase1: Infinity, minBalancePhase2: Infinity, minBalancePhase3: Infinity };
    isFeasible = options.isFireAgeFeasible(sim, options.inputs, options.annualSpend, options.fireMode, options.fireAge) === true;
  } catch (_e) {
    return out;
  }
  // Only Safe and DWZ check the floor; Exact does not.
  if (options.fireMode === 'exact') return out;

  const A = isFeasible ? 0 : Math.max(1, chartViolationCount);
  const B = chartViolationCount;
  if (A === B) return out;
  out.push({
    kind: 'violationCount-mismatch',
    valueA: A,
    valueB: B,
    delta: Math.abs(A - B),
    deltaPct: _pct(Math.abs(A - B), Math.max(B, 1)),
    expected: false,
    reason: `floor-violation count via isFireAgeFeasible (${A}) differs from chart per-year count (${B}).`,
    dualBarSeries: {
      labels: ['isFireAgeFeasible', 'chart-per-year'],
      data: [A, B],
    },
  });
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * assembleAuditSnapshot — pure assembler. Builds the AuditSnapshot consumed
 * by the Audit-tab UI and the Copy Debug serializer.
 *
 * @param {object} options — see contract §Required options.
 * @returns {object} AuditSnapshot
 * @throws {TypeError} if any required option is missing.
 */
function assembleAuditSnapshot(options) {
  _validateRequired(options);

  // Track non-fatal failures and surface as 'assembler-degraded' warnings.
  /** @type {Array<{kind:string, reason:string, expected:boolean, valueA:any, valueB:any, delta:number, deltaPct:number, dualBarSeries:object}>} */
  const degradedWarnings = [];

  const activeStrategyId = _getActiveStrategyId(options.lastStrategyResults);
  const activeStrategyRow = _getActiveStrategyRow(options.lastStrategyResults, activeStrategyId);

  // Compute the chart once (or use prebuilt) — this is the canonical chart
  // every section reads from.
  let chart = null;
  let chartOpts;
  try {
    chartOpts = options.getActiveChartStrategyOptions() || undefined;
  } catch (_e) {
    chartOpts = undefined;
  }
  if (Array.isArray(options.prebuiltChart) && options.prebuiltChart.length > 0) {
    chart = options.prebuiltChart;
  } else {
    try {
      chart = options.projectFullLifecycle(options.inputs, options.annualSpend, options.fireAge, true, chartOpts);
    } catch (err) {
      degradedWarnings.push({
        kind: 'assembler-degraded',
        reason: `projectFullLifecycle threw: ${err && err.message ? err.message : String(err)}`,
        expected: false,
        valueA: null,
        valueB: null,
        delta: 0,
        deltaPct: 0,
        dualBarSeries: { labels: ['n/a', 'n/a'], data: [0, 0] },
      });
      chart = null;
    }
  }

  // Signed-sim end balance (best-effort; failures degrade).
  let signedSim = null;
  try {
    signedSim = options.signedLifecycleEndBalance(options.inputs, options.annualSpend, options.fireAge) || null;
  } catch (err) {
    degradedWarnings.push({
      kind: 'assembler-degraded',
      reason: `signedLifecycleEndBalance threw: ${err && err.message ? err.message : String(err)}`,
      expected: false,
      valueA: null,
      valueB: null,
      delta: 0,
      deltaPct: 0,
      dualBarSeries: { labels: ['n/a', 'n/a'], data: [0, 0] },
    });
    signedSim = null;
  }

  const ctx = {
    activeStrategyId,
    activeStrategyRow,
    chart,
    signedSim,
    prebuiltChart: chart,
  };

  // Build sections.
  const resolvedInputs = _buildResolvedInputs(options.inputs);
  const spendingAdjustments = _buildSpendingAdjustments(options);

  // Build all 3 gates in fixed order [safe, exact, dieWithZero].
  const gates = GATE_ORDER.map((mode) => _buildGate(mode, options, ctx));
  // Track per-mode verdicts for flow diagram headline.
  const gateVerdicts = {};
  for (const g of gates) gateVerdicts[g.mode] = g.verdict;
  ctx.gateVerdicts = gateVerdicts;
  ctx.lastTotal = (Array.isArray(chart) && chart.length > 0)
    ? chart[chart.length - 1].total
    : null;

  const fireAgeResolution = _buildFireAgeResolution(options);
  const strategyRanking = _buildStrategyRanking(options.lastStrategyResults);
  const lifecycleProjection = _buildLifecycleProjection(chart, options.fireAge);
  const flowDiagram = _buildFlowDiagram(options, ctx);

  // Cross-validation (only when chart was built successfully).
  const crossValidationWarnings = [];
  if (chart) {
    crossValidationWarnings.push(..._invariantA(options, ctx));
    crossValidationWarnings.push(..._invariantB(options, ctx));
    crossValidationWarnings.push(..._invariantD(options, ctx));
  }
  crossValidationWarnings.push(..._invariantC(options));

  // Pending state: lastStrategyResults === null → emit explicit warning.
  if (options.lastStrategyResults === null) {
    crossValidationWarnings.push({
      kind: 'strategy-ranking-pending',
      valueA: null,
      valueB: null,
      delta: 0,
      deltaPct: 0,
      expected: true,
      reason: 'Strategy ranking pending — no recalc has run yet.',
      dualBarSeries: { labels: [], data: [] },
    });
  }

  // Surface degraded-path warnings last so they appear at the bottom but
  // remain present even when the chart was the failure point.
  for (const w of degradedWarnings) crossValidationWarnings.push(w);

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    flowDiagram,
    resolvedInputs,
    spendingAdjustments,
    gates,
    fireAgeResolution,
    strategyRanking,
    lifecycleProjection,
    crossValidationWarnings,
  };
}

// ---------------------------------------------------------------------------
// UMD wrapper — works under Node `require` AND under file:// classic <script>.
// Mirror calc/tabRouter.js lines ~672–691. Constitution Principle V: zero-
// build, zero-dependency. ES `export` would force <script type="module"> which
// silently fails on file:// — so we use this hybrid pattern instead.
// ---------------------------------------------------------------------------

const _api = { assembleAuditSnapshot: assembleAuditSnapshot };
if (typeof module !== 'undefined' && module && module.exports) {
  module.exports = _api;
}
if (typeof globalThis !== 'undefined') {
  globalThis.assembleAuditSnapshot = assembleAuditSnapshot;
}
