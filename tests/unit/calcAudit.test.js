/*
 * tests/unit/calcAudit.test.js — locks the calc/calcAudit.js contract.
 *
 * Ref: specs/014-calc-audit/contracts/audit-assembler.contract.md §Test surface
 *
 * Covers the 14 cases enumerated in the contract:
 *   T1  Snapshot shape — required top-level keys + correct types
 *   T2  Determinism — same options yield byte-identical output (modulo generatedAt)
 *   T3  Schema version — 'schemaVersion: 1.0' always
 *   T4  Empty/pending state — lastStrategyResults===null → empty rows + warning
 *   T5  Gates fixed order — [safe, exact, dieWithZero] regardless of fireMode
 *   T6  Active-mode flag — exactly one gate has isActiveMode: true
 *   T7  Cross-val A planted — endBalance mismatch warning with delta $100K
 *   T8  Cross-val A expected — same setup but tax-optimized-search → expected: true
 *   T9  Cross-val B planted — feasibility-mismatch
 *   T10 Cross-val C planted — fireAge-mismatch
 *   T11 All clear — crossValidationWarnings: []
 *   T12 Bilingual verdicts — t() called with right keys + args
 *   T13 Calc-function failure — projectFullLifecycle throws → assembler-degraded
 *   T14 FIRE-age scatter shape — chosen age has feasibleUnderActiveMode + first
 *
 * Harness: Node built-in node:test runner. CommonJS require to match
 * tests/unit/tabRouter.test.js style (UMD module under test).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { assembleAuditSnapshot } = require('../../calc/calcAudit.js');

// ----------------------------------------------------------------------------
// Helpers — build standard fake calc references and a minimal options bundle.
// ----------------------------------------------------------------------------

/**
 * The stock chart simulation used across many tests. Mimics the per-row shape
 * `projectFullLifecycle` returns: { age, total, p401k, pStocks, pCash, pRoth,
 * ssIncome, withdrawals, syntheticConversion, phase }. Total values are
 * comfortably above floor so the all-clear path passes invariant B/D.
 */
function makeStockChart({ fireAge = 48, endAge = 100, total = 700000 } = {}) {
  const rows = [];
  for (let age = fireAge; age <= endAge; age += 1) {
    rows.push({
      age,
      total,
      p401k: 100000,
      pStocks: 400000,
      pCash: 50000,
      pRoth: 50000,
      ssIncome: 0,
      withdrawals: 0,
      syntheticConversion: 0,
      phase: age === fireAge ? 'phase1-taxable-only' : 'phase2-unlocked',
    });
  }
  return rows;
}

/**
 * Build a stock `lastStrategyResults` object — 7 rows with bracket-fill-smoothed
 * as the winner. Caller can override individual fields.
 */
function makeLastStrategyResults(overrides = {}) {
  const baseRow = (id, isWinner = false, overrides2 = {}) => ({
    strategyId: id,
    chosenTheta: null,
    endBalance: 175000,
    lifetimeFederalTax: 12000,
    violations: 0,
    firstViolationAge: null,
    shortfallYears: 0,
    firstShortfallAge: null,
    hasShortfall: false,
    safe_feasible: true,
    exact_feasible: false,
    dieWithZero_feasible: true,
    feasibleUnderCurrentMode: true,
    isWinner,
    ...overrides2,
  });
  const rows = [
    baseRow('bracket-fill-smoothed', true),
    baseRow('tax-optimized-search', false, { chosenTheta: 0.7, endBalance: 200000, lifetimeFederalTax: 8000 }),
    baseRow('roth-ladder'),
    baseRow('trad-first'),
    baseRow('trad-last'),
    baseRow('proportional'),
    baseRow('conventional'),
  ];
  return {
    winnerId: 'bracket-fill-smoothed',
    fireAge: 48,
    objective: 'minimize-tax',
    rows,
    ...overrides,
  };
}

/**
 * Build the option bundle. Lets each test override individual keys.
 */
function buildOptions(overrides = {}) {
  const fireAge = overrides.fireAge !== undefined ? overrides.fireAge : 48;
  const fireMode = overrides.fireMode !== undefined ? overrides.fireMode : 'safe';
  const annualSpend = 60000;
  const rawAnnualSpend = 62000;
  const inputs = {
    ageRoger: 42,
    ageRebecca: 42,
    endAge: 100,
    bufferUnlock: 1,
    bufferSS: 1,
    terminalBuffer: 0,
    swr: 0.04,
    pStocksTaxable: 445000,
    pCashTaxable: 80000,
    p401kTrad: 26454,
    p401kRoth: 58000,
    annualIncome: 200000,
    monthlySavings: 5000,
  };
  const stockChart = makeStockChart({ fireAge, endAge: inputs.endAge });

  const fakeProjectFullLifecycle = overrides.projectFullLifecycle
    || (() => stockChart);
  const fakeSignedLifecycleEndBalance = overrides.signedLifecycleEndBalance
    || (() => ({ endBalance: stockChart[stockChart.length - 1].total }));
  const fakeIsFireAgeFeasible = overrides.isFireAgeFeasible
    || (() => true);
  const fakeGetActiveChartStrategyOptions = overrides.getActiveChartStrategyOptions
    || (() => undefined);

  const tHelper = overrides.t || ((key, ...args) => {
    if (args.length === 0) return key;
    return `${key}|${args.map((a) => JSON.stringify(a)).join(',')}`;
  });

  return {
    inputs,
    fireAge,
    fireMode,
    annualSpend,
    rawAnnualSpend,
    effectiveSpendByYear: [
      { age: 42, spend: 0 },
      { age: 48, spend: 60000 },
      { age: 60, spend: 56000 },
      { age: 100, spend: 56000 },
    ],
    lastStrategyResults: overrides.lastStrategyResults !== undefined
      ? overrides.lastStrategyResults
      : makeLastStrategyResults(),
    fireAgeCandidates: overrides.fireAgeCandidates || [
      { age: 45, signedEndBalance: -50000, feasibleUnderActiveMode: false },
      { age: 46, signedEndBalance: -20000, feasibleUnderActiveMode: false },
      { age: 47, signedEndBalance: -5000, feasibleUnderActiveMode: false },
      { age: 48, signedEndBalance: 5000, feasibleUnderActiveMode: true },
      { age: 49, signedEndBalance: 30000, feasibleUnderActiveMode: true },
    ],
    projectFullLifecycle: fakeProjectFullLifecycle,
    signedLifecycleEndBalance: fakeSignedLifecycleEndBalance,
    isFireAgeFeasible: fakeIsFireAgeFeasible,
    getActiveChartStrategyOptions: fakeGetActiveChartStrategyOptions,
    t: tHelper,
    doc: null,
    ...overrides._extra,
  };
}

// ----------------------------------------------------------------------------
// T1 — Snapshot shape
// ----------------------------------------------------------------------------

test('T1: snapshot has required top-level keys with correct types', () => {
  const snap = assembleAuditSnapshot(buildOptions());

  assert.equal(typeof snap, 'object', 'snapshot must be an object');
  assert.equal(typeof snap.schemaVersion, 'string');
  assert.equal(typeof snap.generatedAt, 'string');
  assert.equal(typeof snap.flowDiagram, 'object');
  assert.ok(Array.isArray(snap.flowDiagram.stages));
  assert.equal(typeof snap.resolvedInputs, 'object');
  assert.equal(typeof snap.spendingAdjustments, 'object');
  assert.ok(Array.isArray(snap.gates));
  assert.equal(typeof snap.fireAgeResolution, 'object');
  assert.equal(typeof snap.strategyRanking, 'object');
  assert.equal(typeof snap.lifecycleProjection, 'object');
  assert.ok(Array.isArray(snap.crossValidationWarnings));
});

// ----------------------------------------------------------------------------
// T2 — Determinism
// ----------------------------------------------------------------------------

test('T2: same options yield byte-identical output (modulo generatedAt)', () => {
  const opts = buildOptions();
  const a = assembleAuditSnapshot(opts);
  const b = assembleAuditSnapshot(opts);

  // generatedAt may differ — strip both before comparing.
  const aStripped = { ...a, generatedAt: '__stripped__' };
  const bStripped = { ...b, generatedAt: '__stripped__' };

  const aJson = JSON.stringify(aStripped);
  const bJson = JSON.stringify(bStripped);

  assert.equal(aJson, bJson, 'snapshots must be byte-identical excluding generatedAt');
});

// ----------------------------------------------------------------------------
// T3 — Schema version
// ----------------------------------------------------------------------------

test('T3: schemaVersion is always "1.0"', () => {
  const snap = assembleAuditSnapshot(buildOptions());
  assert.equal(snap.schemaVersion, '1.0');
});

// ----------------------------------------------------------------------------
// T4 — Empty / pending
// ----------------------------------------------------------------------------

test('T4: lastStrategyResults===null produces empty rows + strategy-ranking-pending warning', () => {
  const snap = assembleAuditSnapshot(buildOptions({ lastStrategyResults: null }));

  assert.equal(snap.strategyRanking.winnerId, null);
  assert.deepEqual(snap.strategyRanking.rows, []);

  const pendingWarn = snap.crossValidationWarnings.find(
    (w) => w.kind === 'strategy-ranking-pending',
  );
  assert.ok(pendingWarn, 'must emit strategy-ranking-pending warning');
  assert.equal(pendingWarn.expected, true);
});

// ----------------------------------------------------------------------------
// T5 — Gates fixed order
// ----------------------------------------------------------------------------

test('T5: gates are always [safe, exact, dieWithZero] regardless of active fireMode', () => {
  for (const mode of ['safe', 'exact', 'dieWithZero']) {
    const snap = assembleAuditSnapshot(buildOptions({ fireMode: mode }));
    assert.equal(snap.gates.length, 3, `gates count under mode=${mode}`);
    assert.equal(snap.gates[0].mode, 'safe', `gates[0] under mode=${mode}`);
    assert.equal(snap.gates[1].mode, 'exact', `gates[1] under mode=${mode}`);
    assert.equal(snap.gates[2].mode, 'dieWithZero', `gates[2] under mode=${mode}`);
  }
});

// ----------------------------------------------------------------------------
// T6 — Active-mode flag — exactly one
// ----------------------------------------------------------------------------

test('T6: exactly one gate has isActiveMode: true matching fireMode', () => {
  const cases = [
    { mode: 'safe',        idx: 0 },
    { mode: 'exact',       idx: 1 },
    { mode: 'dieWithZero', idx: 2 },
  ];
  for (const { mode, idx } of cases) {
    const snap = assembleAuditSnapshot(buildOptions({ fireMode: mode }));
    const activeFlags = snap.gates.map((g) => g.isActiveMode === true);
    const activeCount = activeFlags.filter(Boolean).length;
    assert.equal(activeCount, 1, `exactly one active gate under mode=${mode}`);
    assert.equal(activeFlags[idx], true, `gates[${idx}] should be active under mode=${mode}`);
  }
});

// ----------------------------------------------------------------------------
// T7 — Cross-val A planted (endBalance mismatch)
// ----------------------------------------------------------------------------

test('T7 (UPDATED Feature 029 / Bug B): bothFeasible + no strategyMismatch → endBalance-mismatch warning SUPPRESSED', () => {
  // Feature 029 (US3) — suppress the audit warning when both sims agree on
  // feasibility verdict (A ≥ 0 AND B ≥ 0) AND no strategy-axis mismatch.
  // The dollar-amount difference under these conditions is the documented
  // clamping-vs-signed-debt design intent (Feature 015 invariant). Surfacing
  // this every recalc clutters the Audit panel without revealing a real bug.
  //
  // Pre-029 behavior (T7 original): warning fires with `expected: true`.
  // Post-029 behavior (this test): warning is suppressed entirely.
  // The warning still fires under (a) strategyMismatch path (T8) and
  // (b) signed<0 + chart>0 verdict disagreement (T7b).
  const fakeChart = makeStockChart();
  fakeChart[fakeChart.length - 1].total = 200000;

  const snap = assembleAuditSnapshot(buildOptions({
    signedLifecycleEndBalance: () => ({ endBalance: 100000 }),
    projectFullLifecycle: () => fakeChart,
  }));

  const warn = snap.crossValidationWarnings.find((w) => w.kind === 'endBalance-mismatch');
  assert.strictEqual(warn, undefined,
    'Feature 029: when both sims feasible and no strategyMismatch, endBalance-mismatch warning must be suppressed (clamping-artifact noise filter)');
});

test('T7b (NEW Feature 024 / B-023-6): signed-sim negative + chart-sim positive remains a non-expected warning', () => {
  // When signed sim catches shortfall (negative endBalance) but chart sim
  // clamps to a positive value, the divergence IS a genuine signal — the
  // signed sim is correctly surfacing what the chart's clamping hides.
  const fakeChart = makeStockChart();
  fakeChart[fakeChart.length - 1].total = 50000; // chart clamped to positive

  const snap = assembleAuditSnapshot(buildOptions({
    signedLifecycleEndBalance: () => ({ endBalance: -150000 }), // signed sees infeasibility
    projectFullLifecycle: () => fakeChart,
  }));

  const warn = snap.crossValidationWarnings.find((w) => w.kind === 'endBalance-mismatch');
  assert.ok(warn, 'expected endBalance-mismatch warning');
  // Genuine bug class: chart hides what signed sim flagged.
  assert.equal(warn.expected, false);
  assert.match(warn.reason, /shortfall.*chart-sim clamping hides/);
});

// ----------------------------------------------------------------------------
// T8 — Cross-val A divergence under a non-bracket-fill winner
//
// UPDATED Feature 031 (US3 / T014, T016): the signed sim is now strategy-aware
// (it is threaded with the active winner's options, calcAudit.js:669-685) AND
// the live verdict re-evaluates on the displayed winner (HTML US3 change). Both
// surfaces therefore consume the SAME winner, so a genuine end-balance
// divergence under a non-bracket-fill winner is NO LONGER auto-expected via the
// old `strategyMismatch → expected = true` suppression — it is a genuine signal
// that the strategy-options threading or the two sims' math have drifted. It
// must flag (expected: false), per contract C3:
//   "_invariantA MUST NOT mark a lifecycle-vs-signed end-balance divergence as
//    `expected` once both consume the winner; genuine divergence MUST flag."
// ----------------------------------------------------------------------------

test('T8 (UPDATED Feature 031): genuine endBalance divergence under tax-optimized-search winner FLAGS (expected: false)', () => {
  const fakeChart = makeStockChart();
  fakeChart[fakeChart.length - 1].total = 200000; // chart sim under winner

  const lsr = makeLastStrategyResults({ winnerId: 'tax-optimized-search' });
  // Mark the winning row as the actual winner.
  lsr.rows = lsr.rows.map((r) => ({ ...r, isWinner: r.strategyId === 'tax-optimized-search' }));

  const snap = assembleAuditSnapshot(buildOptions({
    signedLifecycleEndBalance: () => ({ endBalance: 100000 }), // signed sim under winner
    projectFullLifecycle: () => fakeChart,
    lastStrategyResults: lsr,
  }));

  const warn = snap.crossValidationWarnings.find((w) => w.kind === 'endBalance-mismatch');
  assert.ok(warn, 'expected endBalance-mismatch warning (genuine $100K divergence)');
  assert.equal(warn.expected, false,
    'Feature 031: once both sims consume the winner, a non-bracket-fill divergence is a genuine signal, not auto-expected');
});

test('T8b (NEW Feature 031): genuine AGREEMENT under a non-bracket-fill winner emits NO endBalance-mismatch warning', () => {
  // Both sims consume the winner and agree within tolerance → no warning at all.
  const fakeChart = makeStockChart();
  fakeChart[fakeChart.length - 1].total = 200000;

  const lsr = makeLastStrategyResults({ winnerId: 'tax-optimized-search' });
  lsr.rows = lsr.rows.map((r) => ({ ...r, isWinner: r.strategyId === 'tax-optimized-search' }));

  const snap = assembleAuditSnapshot(buildOptions({
    signedLifecycleEndBalance: () => ({ endBalance: 200000 }), // agrees with chart sim
    projectFullLifecycle: () => fakeChart,
    lastStrategyResults: lsr,
  }));

  const warn = snap.crossValidationWarnings.find((w) => w.kind === 'endBalance-mismatch');
  assert.strictEqual(warn, undefined,
    'Feature 031: genuine agreement under the winner must NOT emit an endBalance-mismatch warning');
});

// ----------------------------------------------------------------------------
// T8c (NEW Feature 031 — part 1 apples-to-apples): under a non-bracket-fill
// winner, when BOTH sims are feasible (>= 0) AND the signed sim's trajectory
// dipped negative somewhere (any minBalancePhase < 0), the dollar-amount delta
// is the documented Feature-015 clamp-vs-signed-debt artifact (amplified by the
// post-flow cash-sweep operating on clamped pools in the chart vs unclamped
// pools in the signed sim). That difference is BY DESIGN — not a strategy-
// threading bug — so it MUST be marked expected:true and suppressed.
//
// This is the corrected criterion that stops the user-reported false positive
// (signed $554K vs chart $604K, 8.4%, winner=aggressive-bracket-fill, exact,
// cashSweepEnabled). Both feasible + signed dipped negative ⇒ clamp artifact.
// ----------------------------------------------------------------------------

test('T8c (NEW Feature 031): winner + both feasible + signed-sim dipped negative → clamp artifact SUPPRESSED', () => {
  const fakeChart = makeStockChart();
  fakeChart[fakeChart.length - 1].total = 604637; // chart-sim clamped end balance

  const lsr = makeLastStrategyResults({ winnerId: 'tax-optimized-search' });
  lsr.rows = lsr.rows.map((r) => ({ ...r, isWinner: r.strategyId === 'tax-optimized-search' }));

  const snap = assembleAuditSnapshot(buildOptions({
    // Signed sim diverges by 8.4% AND records a negative-pool dip mid-trajectory:
    // that negative dip is the clamp-path evidence that explains the delta.
    signedLifecycleEndBalance: () => ({
      endBalance: 554038,
      minBalancePhase1: 12000,
      minBalancePhase2: -45000, // dipped negative — signed debt the chart clamps
      minBalancePhase3: 8000,
    }),
    projectFullLifecycle: () => fakeChart,
    lastStrategyResults: lsr,
  }));

  const warn = snap.crossValidationWarnings.find((w) => w.kind === 'endBalance-mismatch');
  assert.strictEqual(warn, undefined,
    'Feature 031: under a winner, both feasible + signed dipped negative is the by-design clamp/sweep artifact — must be suppressed, NOT flagged as a threading bug');
});

// ----------------------------------------------------------------------------
// T8d (NEW Feature 031 — part 1 apples-to-apples GUARD): under a non-bracket-fill
// winner, when BOTH sims are feasible (>= 0) AND the signed sim NEVER dipped
// negative (all minBalancePhase >= 0), the clamp path could not have fired, so a
// dollar-amount divergence cannot be a clamp artifact — it IS a genuine
// strategy-threading or simulator-math bug and MUST flag (expected:false). This
// preserves the US3 intent: a true winner-divergence still flags.
// ----------------------------------------------------------------------------

test('T8d (NEW Feature 031): winner + both feasible + signed NEVER dipped negative + divergence → GENUINE bug FLAGS', () => {
  const fakeChart = makeStockChart();
  fakeChart[fakeChart.length - 1].total = 600000;

  const lsr = makeLastStrategyResults({ winnerId: 'tax-optimized-search' });
  lsr.rows = lsr.rows.map((r) => ({ ...r, isWinner: r.strategyId === 'tax-optimized-search' }));

  const snap = assembleAuditSnapshot(buildOptions({
    // Divergence with NO negative dip anywhere → clamp cannot explain it → genuine.
    signedLifecycleEndBalance: () => ({
      endBalance: 400000,
      minBalancePhase1: 50000,
      minBalancePhase2: 30000,
      minBalancePhase3: 20000,
    }),
    projectFullLifecycle: () => fakeChart,
    lastStrategyResults: lsr,
  }));

  const warn = snap.crossValidationWarnings.find((w) => w.kind === 'endBalance-mismatch');
  assert.ok(warn, 'expected endBalance-mismatch warning (genuine divergence, no clamp evidence)');
  assert.equal(warn.expected, false,
    'Feature 031: divergence under a winner with no negative dip is a genuine threading/math bug — must flag');
});

// ----------------------------------------------------------------------------
// T9 — Cross-val B planted (feasibility mismatch)
// ----------------------------------------------------------------------------

test('T9: feasibility mismatch between internal-sim and chart-sim produces feasibility-mismatch', () => {
  const lsr = makeLastStrategyResults();
  // Plant: winner row says feasibleUnderCurrentMode = false ...
  lsr.rows = lsr.rows.map((r) =>
    r.strategyId === 'bracket-fill-smoothed'
      ? { ...r, feasibleUnderCurrentMode: false }
      : r,
  );
  // ... but isFireAgeFeasible (chart-sim) says true.
  const snap = assembleAuditSnapshot(buildOptions({
    lastStrategyResults: lsr,
    isFireAgeFeasible: () => true,
  }));

  const warn = snap.crossValidationWarnings.find((w) => w.kind === 'feasibility-mismatch');
  assert.ok(warn, 'expected feasibility-mismatch warning');
  assert.equal(warn.expected, false);
});

// ----------------------------------------------------------------------------
// T10 — Cross-val C planted (fireAge mismatch)
// ----------------------------------------------------------------------------

test('T10: displayed fireAge != ranker fireAge produces fireAge-mismatch', () => {
  const lsr = makeLastStrategyResults({ fireAge: 50 });
  const snap = assembleAuditSnapshot(buildOptions({
    fireAge: 48,
    lastStrategyResults: lsr,
  }));

  const warn = snap.crossValidationWarnings.find((w) => w.kind === 'fireAge-mismatch');
  assert.ok(warn, 'expected fireAge-mismatch warning');
  assert.equal(warn.valueA, 48);
  assert.equal(warn.valueB, 50);
  assert.equal(warn.expected, false);
});

// ----------------------------------------------------------------------------
// T11 — All clear
// ----------------------------------------------------------------------------

test('T11: when all 4 invariants pass, crossValidationWarnings is empty', () => {
  const snap = assembleAuditSnapshot(buildOptions());
  assert.deepEqual(snap.crossValidationWarnings, [],
    `expected zero warnings, got ${JSON.stringify(snap.crossValidationWarnings)}`);
});

// ----------------------------------------------------------------------------
// T12 — Bilingual verdicts
// ----------------------------------------------------------------------------

test('T12: gate verdicts call t() with the right keys and args', () => {
  const calls = [];
  const tSpy = (key, ...args) => {
    calls.push({ key, args });
    return key + (args.length > 0 ? `|${JSON.stringify(args)}` : '');
  };

  // Plant a feasible Safe gate (default chart is comfortably above floor).
  const snap = assembleAuditSnapshot(buildOptions({ t: tSpy }));

  // Find the Safe gate and look at its formulaPlainEnglish; should reference
  // a key like 'audit.gate.safe.verdict.feasible' with args including the floor.
  const safeGate = snap.gates.find((g) => g.mode === 'safe');
  assert.ok(safeGate);
  assert.equal(typeof safeGate.formulaPlainEnglish, 'string');

  // Confirm a feasible-key call was made for safe:
  const safeFeasibleCall = calls.find(
    (c) => c.key === 'audit.gate.safe.verdict.feasible',
  );
  assert.ok(safeFeasibleCall, 'expected t("audit.gate.safe.verdict.feasible", ...) call');
  // Args are positional and map to the template's {0}/{1} placeholders:
  // {0} = floor (comma-formatted string), {1} = endBalance (comma-formatted string).
  assert.equal(safeFeasibleCall.args.length, 2, 'feasible-safe expects 2 positional args');
  assert.equal(typeof safeFeasibleCall.args[0], 'string', 'arg[0] is the formatted floor');
  assert.ok(/^\d{1,3}(,\d{3})*$/.test(safeFeasibleCall.args[0]),
    'arg[0] should be a comma-formatted integer (e.g., "72,700")');

  // Now plant an INFEASIBLE Safe — chart dips below floor at age 60.
  const fakeChart = makeStockChart();
  for (const row of fakeChart) {
    if (row.age === 60) row.total = 1000; // way below 60000 floor
  }
  const calls2 = [];
  const tSpy2 = (key, ...args) => {
    calls2.push({ key, args });
    return key;
  };
  const snap2 = assembleAuditSnapshot(buildOptions({
    t: tSpy2,
    projectFullLifecycle: () => fakeChart,
  }));
  const safeInfeasCall = calls2.find(
    (c) => c.key === 'audit.gate.safe.verdict.infeasible',
  );
  assert.ok(safeInfeasCall, 'expected t("audit.gate.safe.verdict.infeasible", ...) call');
  // Positional args: {0}=floor, {1}=firstViolationAge, {2}=violation total.
  assert.equal(safeInfeasCall.args.length, 3, 'infeasible-safe expects 3 positional args');
  assert.equal(safeInfeasCall.args[1], 60, 'arg[1] is the first-violation age');
});

// ----------------------------------------------------------------------------
// T13 — Calc-function failure
// ----------------------------------------------------------------------------

test('T13: when projectFullLifecycle throws, returns degraded snapshot rather than throwing', () => {
  let snap;
  assert.doesNotThrow(() => {
    snap = assembleAuditSnapshot(buildOptions({
      projectFullLifecycle: () => { throw new Error('synthetic failure'); },
    }));
  }, 'assembler must not bubble calc-function errors');

  const warn = snap.crossValidationWarnings.find((w) => w.kind === 'assembler-degraded');
  assert.ok(warn, 'expected assembler-degraded warning');
  assert.ok(/projectFullLifecycle/.test(String(warn.reason || '')),
    'reason should mention failing function');
});

// ----------------------------------------------------------------------------
// T14 — FIRE-age scatter shape
// ----------------------------------------------------------------------------

test('T14: fireAgeResolution.candidates includes chosen age as first feasibleUnderActiveMode entry', () => {
  const snap = assembleAuditSnapshot(buildOptions());

  assert.ok(Array.isArray(snap.fireAgeResolution.candidates));
  assert.ok(snap.fireAgeResolution.candidates.length > 0,
    'candidates array must not be empty');

  const firstFeasibleIdx = snap.fireAgeResolution.candidates.findIndex(
    (c) => c.feasibleUnderActiveMode === true,
  );
  assert.notEqual(firstFeasibleIdx, -1, 'expected at least one feasible candidate');
  const firstFeasible = snap.fireAgeResolution.candidates[firstFeasibleIdx];
  assert.equal(firstFeasible.age, snap.fireAgeResolution.displayedFireAge,
    'displayedFireAge must equal first feasible candidate age');
});

// ----------------------------------------------------------------------------
// Required-options error handling — bonus coverage for the contract's
// "throw TypeError on missing required option" rule.
// ----------------------------------------------------------------------------

test('Required options: missing inputs throws TypeError', () => {
  const opts = buildOptions();
  delete opts.inputs;
  assert.throws(
    () => assembleAuditSnapshot(opts),
    /TypeError: assembleAuditSnapshot: required option 'inputs' missing/,
  );
});

test('Required options: missing fireAge throws TypeError', () => {
  const opts = buildOptions();
  delete opts.fireAge;
  assert.throws(
    () => assembleAuditSnapshot(opts),
    /TypeError: assembleAuditSnapshot: required option 'fireAge' missing/,
  );
});
