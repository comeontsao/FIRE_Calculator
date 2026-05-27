/*
 * Feature 031 — US3: the Safe/Exact/DWZ verdict evaluates the DISPLAYED winner.
 *
 * Mirrors the structural-extraction pattern of
 * tests/unit/lifecycleStrategyParity.test.js and
 * tests/unit/fireAgeResolverStrategyAware.test.js: the inline-HTML recalc
 * pipeline (`recalcAll`) cannot be trivially evaluated in a Node sandbox (DOM /
 * chartState / strategy-global co-dependencies), so we verify the ORDERING +
 * STRATEGY-SOURCE contract via brace-balanced function-body extraction +
 * textual offset assertions.
 *
 * ROOT CAUSE (specs/031-lifecycle-strategy-parity/research.md "Safe/Exact/DWZ
 * gate exposure"):
 *   In `recalcAll`, the FIRE-age search (`yearsToFIRE` → `findFireAgeNumerical`)
 *   AND the displayed feasibility verdict (`_evaluateFeasibilityAtAge(...)` →
 *   `_setCalculatedFire(...)`) both run while `_lastStrategyResults === null`
 *   (RR :13030 nulls it before :13032 runs the search; the verdict at :13066
 *   runs before `scoreAndRank` at :13084). With the winner unresolved,
 *   `getActiveChartStrategyOptions()` returns `undefined`, so `isFireAgeFeasible`
 *   evaluates the default bracket-fill trajectory — NOT the strategy the chart
 *   actually draws. The verdict pill therefore describes a different strategy
 *   than the chart (the exact "gates MUST evaluate the displayed strategy"
 *   hazard from CLAUDE.md).
 *
 * CONTRACT (contracts/lifecycle-strategy-parity.contract.md C3 / FR-004):
 *   `findFireAgeNumerical`/`isFireAgeFeasible` and the Safe/Exact/DWZ gate MUST
 *   evaluate the displayed winner via `getActiveChartStrategyOptions()` (+
 *   `getActiveMortgageStrategyOptions()`), not a pinned bracket-fill. Mode
 *   semantics unchanged; Objective stays the sort key (Constitution IX).
 *
 * DESIGN (Option ii — re-evaluate post-rank, mirroring calcAudit.js:262):
 *   The age SEARCH stays pinned to bracket-fill so it is deterministic and
 *   free of the winner-is-age-dependent circularity (see the recalcAll comment
 *   at RR :13023-13029). AFTER `scoreAndRank` resolves THIS run's winner, the
 *   displayed feasibility verdict is RE-EVALUATED under that winner (via
 *   `_evaluateFeasibilityAtAge`, whose `isFireAgeFeasible` reads
 *   `getActiveChartStrategyOptions()`) and pushed back into chartState via a
 *   second `_setCalculatedFire(...)`. This is what makes the pill the user sees
 *   match the chart the user sees, without destabilizing the search.
 *
 * EXPECTED FAILURE STATE AT WRITE-TIME (T013, RED):
 *   Before T015 ships, the ONLY `_setCalculatedFire(...)` in recalcAll runs at
 *   RR :13070 — BEFORE `_lastStrategyResults = scoreAndRank(...)`. There is no
 *   post-rank verdict re-evaluation. The "verdict re-evaluated after
 *   scoreAndRank" assertions WILL FAIL until the post-rank winner-based
 *   feasibility re-eval is added in both HTMLs.
 *
 * Test scope (per HTML, RR + Generic):
 *   1. recalcAll re-evaluates feasibility AFTER scoreAndRank, scoped to the
 *      winner (a `_evaluateFeasibilityAtAge(` call appears AFTER the
 *      `_lastStrategyResults = scoreAndRank(` assignment) — 2 cases.
 *   2. The post-rank verdict re-eval pushes the result back into chartState
 *      (a `_setCalculatedFire(` call appears AFTER scoreAndRank) — 2 cases.
 *   3. The post-rank verdict block carries the loud-catch marker so it is
 *      grep-findable and not confused with the pre-rank verdict — 2 cases.
 *   4. `isFireAgeFeasible`'s three mode branches each thread
 *      `getActiveChartStrategyOptions()` into `projectFullLifecycle` (proves the
 *      gate, once the winner is resolved, evaluates the displayed strategy under
 *      Safe AND Exact AND DWZ) — 6 cases (3 modes × 2 files).
 *   Total: 12 cases.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const HTML_PATHS = [
  { name: 'RR     ', file: path.join(__dirname, '..', '..', 'FIRE-Dashboard.html') },
  { name: 'Generic', file: path.join(__dirname, '..', '..', 'FIRE-Dashboard-Generic.html') },
];

/**
 * Extract a function body by name. Walks brace depth from the function's
 * opening `{` to the matching `}`. Returns the substring BETWEEN the braces
 * (exclusive). Mirrors lifecycleStrategyParity.test.js.
 */
function extractFunctionBody(src, fnName) {
  const startIdx = src.indexOf('function ' + fnName);
  if (startIdx === -1) throw new Error(`function ${fnName} not found`);
  let i = src.indexOf('{', startIdx);
  if (i === -1) throw new Error('No opening brace for ' + fnName);
  let depth = 1;
  i++;
  const bodyStart = i;
  while (i < src.length && depth > 0) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  if (depth !== 0) throw new Error('Unbalanced braces in ' + fnName);
  return src.slice(bodyStart, i - 1);
}

function scoreAndRankIndex(body) {
  const idx = body.indexOf('_lastStrategyResults = scoreAndRank(');
  assert.ok(idx !== -1, 'recalcAll must contain `_lastStrategyResults = scoreAndRank(`');
  return idx;
}

// The post-rank verdict re-evaluation block (added by feature 031 / US3) is
// identified by its loud-catch marker, mirroring the existing post-rank
// `[strategies] post-rank renderRothLadder` / `renderGrowthChart` markers.
const POST_RANK_VERDICT_MARKER = 'post-rank verdict';

HTML_PATHS.forEach(({ name, file }) => {
  test(`${name}: the post-rank verdict re-eval carries the loud-catch marker "${POST_RANK_VERDICT_MARKER}"`, () => {
    const src = fs.readFileSync(file, 'utf8');
    const body = extractFunctionBody(src, 'recalcAll');
    const rankIdx = scoreAndRankIndex(body);
    const postRank = body.slice(rankIdx);
    const markerIdx = postRank.indexOf(POST_RANK_VERDICT_MARKER);
    assert.ok(
      markerIdx !== -1,
      `${name}: expected the dedicated post-rank verdict re-evaluation block to ` +
      `carry the loud-catch marker "${POST_RANK_VERDICT_MARKER}" (grep-findable; ` +
      `mirrors the post-rank renderRothLadder / renderGrowthChart blocks).`,
    );
  });

  test(`${name}: the "${POST_RANK_VERDICT_MARKER}" block RE-EVALUATES feasibility (_evaluateFeasibilityAtAge) on the winner`, () => {
    const src = fs.readFileSync(file, 'utf8');
    const body = extractFunctionBody(src, 'recalcAll');
    const rankIdx = scoreAndRankIndex(body);
    const postRank = body.slice(rankIdx);
    const markerIdx = postRank.indexOf(POST_RANK_VERDICT_MARKER);
    assert.ok(markerIdx !== -1, `${name}: marker "${POST_RANK_VERDICT_MARKER}" required first`);
    // Scope to the chars following the marker — the verdict block body
    // (rationale comment + try/catch). Window covers the explanatory comment.
    const blk = postRank.slice(markerIdx, markerIdx + 2400);
    assert.ok(
      /_evaluateFeasibilityAtAge\s*\(/.test(blk),
      `${name}: expected the post-rank verdict block to call _evaluateFeasibilityAtAge( ` +
      `so the displayed feasibility verdict is judged on THIS run's resolved winner ` +
      `(contract C3 / FR-004) — getActiveChartStrategyOptions() now returns the winner ` +
      `because scoreAndRank has populated _lastStrategyResults. The pre-rank ` +
      `evaluation at :13066 used the stale winner=null bracket-fill trajectory.`,
    );
  });

  test(`${name}: the "${POST_RANK_VERDICT_MARKER}" block pushes the verdict into chartState (_setCalculatedFire)`, () => {
    const src = fs.readFileSync(file, 'utf8');
    const body = extractFunctionBody(src, 'recalcAll');
    const rankIdx = scoreAndRankIndex(body);
    const postRank = body.slice(rankIdx);
    const markerIdx = postRank.indexOf(POST_RANK_VERDICT_MARKER);
    assert.ok(markerIdx !== -1, `${name}: marker "${POST_RANK_VERDICT_MARKER}" required first`);
    const blk = postRank.slice(markerIdx, markerIdx + 2400);
    assert.ok(
      /_setCalculatedFire\s*\(/.test(blk),
      `${name}: expected the post-rank verdict block to call _setCalculatedFire( so the ` +
      `winner-based feasibility verdict reaches the pill/chartState (the pre-rank ` +
      `_setCalculatedFire at :13070 used the stale winner=null bracket-fill verdict).`,
    );
  });
});

// ---------------------------------------------------------------------------
// isFireAgeFeasible threads the displayed strategy into EACH of Safe/Exact/DWZ.
// Once the winner is resolved (post-rank), this is what makes the gate evaluate
// the displayed strategy under all three modes. We assert each mode branch
// reads getActiveChartStrategyOptions() before calling projectFullLifecycle.
// ---------------------------------------------------------------------------
HTML_PATHS.forEach(({ name, file }) => {
  ['safe', 'exact', 'dieWithZero'].forEach((mode) => {
    test(`${name}: isFireAgeFeasible ${mode}-mode gate threads getActiveChartStrategyOptions into projectFullLifecycle`, () => {
      const src = fs.readFileSync(file, 'utf8');
      const body = extractFunctionBody(src, 'isFireAgeFeasible');
      // Locate the mode's branch. Safe is the fall-through tail (no `if (mode
      // === 'safe')`), so for safe we take the segment AFTER the exact branch's
      // close; exact/dwz are explicit `mode === '<m>'` guards.
      let segment;
      if (mode === 'dieWithZero') {
        const start = body.indexOf("mode === 'dieWithZero'");
        const end = body.indexOf("mode === 'exact'");
        assert.ok(start !== -1 && end !== -1 && end > start, `${name}: dwz/exact branch markers`);
        segment = body.slice(start, end);
      } else if (mode === 'exact') {
        const start = body.indexOf("mode === 'exact'");
        // exact branch runs until the safe fall-through comment block.
        const end = body.indexOf('safe — CHART-CONSISTENT', start);
        assert.ok(start !== -1 && end !== -1 && end > start, `${name}: exact/safe branch markers`);
        segment = body.slice(start, end);
      } else {
        // safe — the fall-through tail after the exact branch.
        const start = body.indexOf('safe — CHART-CONSISTENT');
        assert.ok(start !== -1, `${name}: safe branch marker`);
        segment = body.slice(start);
      }
      assert.ok(
        /getActiveChartStrategyOptions\s*\(/.test(segment),
        `${name}: ${mode}-mode gate must read getActiveChartStrategyOptions() so it ` +
        `evaluates the displayed winner (C3).`,
      );
      assert.ok(
        /projectFullLifecycle\s*\(/.test(segment),
        `${name}: ${mode}-mode gate must call projectFullLifecycle with the ` +
        `strategy options to evaluate the displayed trajectory.`,
      );
    });
  });
});
