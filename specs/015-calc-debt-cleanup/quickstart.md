# Quickstart — Feature 015 Manual Verification

End-to-end manual verification organized by wave. Run the steps in order; each wave has a Manager-driven smoke gate before proceeding to the next wave.

## Prerequisites

- Both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` open in a real browser (Chrome / Edge / Firefox / Safari).
- DevTools console visible.
- Optionally, a local dev server: `python -m http.server 8000` from the repo root, then visit `http://localhost:8000/FIRE-Dashboard.html`.

---

## Wave A — Shortfall visibility + θ-sweep feasibility-first (US1 + US2)

### A1. Plant the user's θ=0 shortfall scenario

1. Open `FIRE-Dashboard.html`.
2. Switch Strategy override to `tax-optimized-search` (or use the default if `tax-optimized-search` is the natural winner).
3. Load the canonical "θ=0 shortfall" fixture (documented in `tests/unit/shortfallVisibility.test.js` as `FIXTURE_THETA_ZERO_SHORTFALL`).

### A2. Verify chart shortfall overlay

- Look at the Full Portfolio Lifecycle chart.
- **Expected:** A red-tinted vertical band covers the years where shortfall fires (e.g., ages 60–67).
- **Expected:** A bilingual caption appears immediately below the chart: "Red-shaded years: active strategy cannot fund spending from any allowed pool." Toggle to zh-TW; caption updates to "紅色標示年份：當前策略無法從任何允許的資金池支應該年度支出。"

### A3. Verify audit table row class

- Switch to the Audit tab.
- Scroll to the per-year Lifecycle Projection table.
- **Expected:** The same age rows that the chart's red band covered have `class="has-shortfall"` and a faint red background.

### A4. Verify Copy Debug payload

- Click "Copy Debug Payload" button (existing from feature 014).
- Paste into a JSON viewer.
- **Expected:** `audit.lifecycleProjection.rows[*]` each has a `hasShortfall: boolean` field; the `true` rows match the chart's red band.

### A5. Verify θ-sweep filtering

- Stay on the same fixture.
- Scroll to the audit's Strategy Ranking section.
- **Expected:** The `tax-optimized-search` row shows `chosenTheta > 0` (NOT 0.0) and `shortfallYears === 0`.
- **Expected:** The active winner is no longer "tax-opt-search-θ=0".

### A6. Verify zero false positives

- Load a known-feasible fixture (e.g., the default scenario for a young saver).
- **Expected:** Lifecycle chart has NO red overlay; caption hidden; audit table has zero `has-shortfall` rows; Copy Debug shows every row's `hasShortfall === false`.

### A7. Lockstep DOM-diff

- Repeat A1–A6 on `FIRE-Dashboard-Generic.html`.
- **Expected:** Identical visual output (modulo personal-content like name, default income).

### Wave A smoke gate (Manager)

1. Open BOTH HTML files.
2. Wait 2 seconds for cold load.
3. Confirm every KPI card shows numeric value.
4. Confirm zero red console errors AND zero `[<shim-name>] canonical threw:` messages.
5. Drag the FIRE marker; confirm same-frame update of all dependent renderers.

PASS → proceed to Wave B. FAIL → return to engineering.

---

## Wave B — Per-strategy FIRE age + Mode/Objective orthogonality (US3 + US4)

### B1. Verify recalc convergence

- Open DevTools console.
- Run `recalcAll()` (or trigger by re-entering a value with no change).
- Run `recalcAll()` again immediately.
- Click "Copy Debug Payload" twice between the runs.
- Diff the two payloads.
- **Expected:** Byte-identical `audit` block (excluding `generatedAt` timestamp).

### B2. Verify cross-strategy boundary stability

- Construct a scenario at the boundary between bracket-fill and tax-opt-search winning (e.g., adjust `monthlySpend` until the audit shows alternating winners).
- Make 3 small input changes (e.g., spend by $10).
- After each change, click Copy Debug.
- **Expected:** The dashboard reaches a stable `(fireAge, winnerStrategyId)` pair within ≤ 2 recalcs of each change.

### B3. Verify drag-skip guard

- Open the Performance tab in DevTools.
- Drag the FIRE marker on the lifecycle chart.
- **Expected:** Each drag frame's recalc takes < 30ms (the per-strategy finder is short-circuited).
- Release; wait 500ms.
- **Expected:** A subsequent recalc (next input change or natural recalc) takes the full per-strategy finder time.

### B4. Verify Mode toggle preserves objective behavior

- Switch Objective to "Preserve estate".
- Toggle Mode: Safe → Exact → DWZ.
- Watch the lifecycle chart's trajectory shape under each mode.
- **Expected:** Trajectory shape changes ONLY due to the mode constraint (e.g., DWZ drains to ≈ $0 at plan age while Safe maintains buffer floor). The path-shape preference (slow drain, preserve growth pools longer) is consistent across modes.

### B5. Verify Objective toggle under DWZ produces different trajectories

- Stay in DWZ mode.
- Toggle Objective: "Preserve estate" → "Minimize lifetime tax".
- Watch the lifecycle chart's per-pool composition.
- **Expected:** Per-year rows differ on at least one row by ≥ $100 in at least one pool (Cash, 401k, Stocks, Roth).
- **Expected:** Both trajectories reach `endBalance ≈ $0` at plan age (within $1).

### B6. Verify audit Strategy Ranking labels

- Switch to the Audit tab → Strategy Ranking section.
- For each (Mode, Objective) of the 6 cells:
  - **Expected:** Display shows `Mode constraint: <text>`, `Objective: <text>`, `Primary sort: <text>`, `Tie-breakers: <text> → <text>`.
  - The text matches the resolution table in `contracts/mode-objective-orthogonality.contract.md`.

### B7. Lockstep DOM-diff

- Repeat B1–B6 on `FIRE-Dashboard-Generic.html`.
- **Expected:** Identical behavior.

### Wave B smoke gate (Manager)

Standard 5-step smoke walk + Wave B additions:

- After drag release + 500ms idle, the per-strategy finder re-runs (verified by `_userDraggedFireAge` flag transitioning back to `false`).
- Mode toggle (Safe → Exact → DWZ) produces visibly different chart trajectories.
- Objective toggle (Preserve → Minimize Tax) under DWZ produces visibly different chart trajectories.

PASS → proceed to Wave C. FAIL → return to engineering.

---

## Wave C — Objective label verification + Unified simulator (US5 + US6)

### C1. Run US5 verification fixture

- Run `node --test tests/e2e/objective-label-verification.spec.ts` (or the Playwright equivalent).
- **Expected:** The test reports either:
  - PASS: At least one of 9 (3 scenarios × 3 modes) cells shows different `displayedFireAge` between Preserve and Minimize Tax → existing label preserved.
  - FAIL: Zero cells differ → rename to "Minimize lifetime tax" in EN + zh-TW; the test instructs the engineer to run the rename task.

### C2. Verify Cross-Validation section is clean

- Open the Audit tab → Cross-Validation section.
- **Expected:** Display shows "All cross-checks passed" (no warnings) on the default scenario.
- Try several scenarios. **Expected:** Zero warnings carry `{expected: true, reason: 'different sim contracts'}`.

### C3. Verify per-year totals agree across surfaces

- Click Copy Debug.
- Compare:
  - Chart's last per-year total (drag marker to plan-age year, read tooltip).
  - Audit table's last row total (last row of Lifecycle Projection table).
  - `audit.strategyRanking.perStrategyResults[winner].endBalance`.
- **Expected:** All three agree within $1.

### C4. Verify retired simulators are gone

- `grep -rn 'signedLifecycleEndBalance\|projectFullLifecycle\|_simulateStrategyLifetime' calc/ FIRE-Dashboard.html FIRE-Dashboard-Generic.html`
- **Expected:** Zero matches (or only matches in `simulateLifecycle.js`'s comment header listing what was retired).

### C5. Verify noiseModel reservation

- In DevTools console: `simulateLifecycle({ ...validInputs, noiseModel: { samples: 100 } })`.
- **Expected:** Throws `Error: simulateLifecycle: noiseModel is reserved for future Monte Carlo support and must be null in this build (feature 015).`
- `simulateLifecycle({ ...validInputs, noiseModel: null })` — does NOT throw.

### C6. Run full test suite

- `npm test` (Node `--test` for unit tests).
- `npm run test:e2e` (Playwright).
- **Expected:** All 211 unit tests + 95 Playwright tests + new tests from feature 015 pass. Zero regressions.

### Wave C final smoke gate (Manager)

Standard 5-step smoke walk on both HTML files. Then verify:

- Audit Cross-Validation section displays "All cross-checks passed."
- Chart, audit, ranker per-year totals agree within $1.
- All language toggles work for new strings (US1 caption, US4 audit labels, possibly US5 rename).

PASS → feature 015 ships. FAIL → punch list.

---

## Rollback procedure

If a wave fails the smoke gate and the team decides to revert:

- **Wave A revert:** `git revert` the Wave A commits. The audit's `audit.lifecycleProjection.rows[*].hasShortfall` field disappears (consumers must tolerate its absence — already verified by additive-only design).
- **Wave B revert:** `git revert` the Wave B commits. Per-strategy FIRE age reverts to feature 008's Architecture B; `getActiveSortKey` reverts to the silent-override behavior. The audit invariant C reverts to the global-FIRE-age form.
- **Wave C revert:** `git revert` the Wave C commits. The three retired simulators are restored from their last commit. `simulateLifecycle.js` is deleted (or kept as dead code with a TODO note).

Each wave is a complete unit; a partial-wave revert is unsafe.
