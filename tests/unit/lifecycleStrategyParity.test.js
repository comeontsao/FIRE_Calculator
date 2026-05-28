/*
 * Feature 031 — US1: Lifecycle chart post-rank re-render (single source of truth).
 *
 * Mirrors the structural-extraction pattern of
 * tests/unit/cashSweepSimulatorIntegration.test.js and
 * tests/unit/signedSimStrategyOptions.test.js: the inline-HTML render pipeline
 * (`recalcAll`, ~1000 LOC with DOM/chartState/strategy co-dependencies) cannot
 * be trivially evaluated in a Node sandbox, so we verify the ORDERING contract
 * via brace-balanced function-body extraction + textual offset assertions.
 *
 * ROOT CAUSE (specs/031-lifecycle-strategy-parity/research.md):
 *   In `recalcAll`, the Lifecycle chart renders via the `chartState.onChange`
 *   listener fired inside `_setCalculatedFire(...)` BEFORE
 *   `_lastStrategyResults = scoreAndRank(...)` populates the winner. Unlike the
 *   Withdrawal Strategy chart — which gets a post-rank re-render via
 *   `renderRothLadder(getInputs())` immediately after the scoreAndRank
 *   assignment — the Lifecycle chart gets NO post-rank re-render, so it draws
 *   the default bracket-fill strategy while every other surface draws the
 *   winner. Two different strategies on screen at once.
 *
 * CONTRACT (contracts/lifecycle-strategy-parity.contract.md):
 *   C1 — After `scoreAndRank` resolves `_lastStrategyResults.winnerId`, the
 *        recalc pipeline MUST (re-)render the Lifecycle chart AND its sidebar
 *        so they consume that winner — mirroring the existing post-rank
 *        `renderRothLadder` render.
 *   C6 — When bracket-fill is the winner, output is unchanged (regression
 *        guard): the post-rank render is unconditional and idempotent, so the
 *        bracket-fill-winner case re-renders to the identical trajectory.
 *
 * WHY STRUCTURAL (regex/offset) INSTEAD OF NUMERICAL?
 *   The fix is purely an ORDERING fix in the inline pipeline: add a second
 *   `renderGrowthChart(...)` (+ lifecycle sidebar render) AFTER the winner is
 *   resolved. The numerical correctness of "Lifecycle reads the winner" is
 *   already exercised by the strategy-aware simulator tests
 *   (signedSimStrategyOptions.test.js) and the runtime audit invariants. What
 *   THIS suite guards against is the exact regression of record: "recalcAll
 *   resolves the winner but never re-renders the Lifecycle chart, so it shows
 *   the stale onChange (winner=null) bracket-fill draw."
 *
 * EXPECTED FAILURE STATE AT WRITE-TIME (T005, RED):
 *   Before T006 ships, `recalcAll` contains a post-rank `renderRothLadder(`
 *   call after the scoreAndRank assignment but NO post-rank `renderGrowthChart(`
 *   call. The "renderGrowthChart after scoreAndRank" assertions WILL FAIL until
 *   the post-rank Lifecycle re-render is added in both HTMLs.
 *
 * Test scope:
 *   Per HTML (RR + Generic):
 *     - recalcAll body: a `renderGrowthChart(` call appears AFTER the
 *       `_lastStrategyResults = scoreAndRank(` assignment (the post-rank
 *       Lifecycle re-render) — 2 cases.
 *     - recalcAll body: a `renderLifecycleSidebarChart(` call appears AFTER the
 *       scoreAndRank assignment (the sidebar mirror) — 2 cases.
 *     - recalcAll body: the post-rank `renderGrowthChart(` appears AFTER the
 *       pre-existing post-rank `renderRothLadder(` (proves it sits in the same
 *       post-rank block, not the earlier KPI/FIRE-number probe) — 2 cases.
 *   Total: 6 cases.
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
 * (exclusive). Mirrors cashSweepSimulatorIntegration.test.js.
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

/**
 * Index of the FIRST `_lastStrategyResults = scoreAndRank(` assignment in the
 * body. This is the winner-resolution point: every strategy-dependent surface
 * must re-render AFTER this index.
 */
function scoreAndRankIndex(body) {
  const idx = body.indexOf('_lastStrategyResults = scoreAndRank(');
  assert.ok(idx !== -1, 'recalcAll must contain `_lastStrategyResults = scoreAndRank(`');
  return idx;
}

/**
 * The unconditional post-rank re-render block (added by feature 031) is
 * identified by its loud-catch prefix `[strategies] post-rank renderGrowthChart`,
 * mirroring the existing `[strategies] post-rank renderRothLadder threw` block.
 *
 * NOTE: we MUST NOT match the pre-existing `renderGrowthChart(inp)` inside the
 * `if (!_cs())` cold-load fallback (RR ~:13919). That call only fires when
 * chartState has NOT bootstrapped (first paint before the ES module runs); on
 * every normal post-bootstrap recalc it is SKIPPED, so it does NOT fix the
 * stale-strategy race. The marker prefix scopes the assertion to the real fix.
 */
const POST_RANK_GROWTH_MARKER = 'post-rank renderGrowthChart';

HTML_PATHS.forEach(({ name, file }) => {
  test(`${name}: recalcAll has an UNCONDITIONAL post-rank renderGrowthChart re-render after scoreAndRank (not the if(!_cs()) cold-load fallback)`, () => {
    const src = fs.readFileSync(file, 'utf8');
    const body = extractFunctionBody(src, 'recalcAll');
    const rankIdx = scoreAndRankIndex(body);
    const postRank = body.slice(rankIdx);
    // Require the dedicated post-rank Lifecycle re-render block, identified by
    // its loud-catch marker. A bare /renderGrowthChart\s*\(/ would false-pass on
    // the if(!_cs()) cold-load fallback, which does NOT run on normal recalcs.
    const markerIdx = postRank.indexOf(POST_RANK_GROWTH_MARKER);
    assert.ok(
      markerIdx !== -1,
      `${name}: expected a dedicated post-rank Lifecycle re-render block ` +
      `(loud-catch marker "${POST_RANK_GROWTH_MARKER}") after ` +
      `_lastStrategyResults = scoreAndRank(...) so the Lifecycle chart consumes ` +
      `the resolved winner (Constitution III / contract C1). The if(!_cs()) ` +
      `cold-load fallback does NOT count — it is skipped on every normal recalc, ` +
      `leaving the chart on the stale winner=null bracket-fill trajectory.`,
    );
    const afterMarker = postRank.slice(markerIdx);
    assert.ok(
      /renderGrowthChart\s*\(/.test(afterMarker),
      `${name}: the "${POST_RANK_GROWTH_MARKER}" block must actually call ` +
      `renderGrowthChart(getInputs()).`,
    );
  });

  test(`${name}: recalcAll re-renders the Lifecycle sidebar (renderLifecycleSidebarChart) AFTER scoreAndRank`, () => {
    const src = fs.readFileSync(file, 'utf8');
    const body = extractFunctionBody(src, 'recalcAll');
    const rankIdx = scoreAndRankIndex(body);
    const postRank = body.slice(rankIdx);
    assert.ok(
      /renderLifecycleSidebarChart\s*\(/.test(postRank),
      `${name}: expected a post-rank renderLifecycleSidebarChart( re-render ` +
      `after scoreAndRank so the pinned sidebar mirror matches the Lifecycle ` +
      `chart's winner (contract C1; mirrors the objective-toggle handler trio).`,
    );
  });

  test(`${name}: post-rank Lifecycle re-render sits AFTER the existing post-rank renderRothLadder (canonical trio order)`, () => {
    const src = fs.readFileSync(file, 'utf8');
    const body = extractFunctionBody(src, 'recalcAll');
    const rankIdx = scoreAndRankIndex(body);
    const postRank = body.slice(rankIdx);
    // The pre-existing post-rank Withdrawal-chart re-render is identified by its
    // unique loud-catch prefix. The new Lifecycle re-render must live in the
    // same post-rank block, AFTER the renderRothLadder re-render — mirroring the
    // objective-toggle handler's (renderRothLadder → renderGrowthChart →
    // renderLifecycleSidebarChart) trio. This is NOT the earlier KPI FIRE-number
    // probe (which calls projectFullLifecycle but does not re-render the chart)
    // nor the if(!_cs()) cold-load fallback.
    const rothLadderIdx = postRank.indexOf('post-rank renderRothLadder threw');
    assert.ok(
      rothLadderIdx !== -1,
      `${name}: expected the existing post-rank renderRothLadder block ` +
      `(loud-catch prefix "[strategies] post-rank renderRothLadder threw") ` +
      `after scoreAndRank — anchor for the new Lifecycle re-render.`,
    );
    const growthMarkerIdx = postRank.indexOf(POST_RANK_GROWTH_MARKER);
    assert.ok(
      growthMarkerIdx !== -1 && growthMarkerIdx > rothLadderIdx,
      `${name}: expected the dedicated post-rank Lifecycle re-render block ` +
      `("${POST_RANK_GROWTH_MARKER}") to appear AFTER the post-rank ` +
      `renderRothLadder block (canonical trio order).`,
    );
  });
});
