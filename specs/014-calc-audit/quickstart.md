# Quickstart — Verifying the Calculation Audit Tab

**Feature**: `014-calc-audit`
**Audience**: a developer or QA engineer verifying the Audit tab end-to-end before merge.

This is the manual checklist that supplements the automated test suites (`tests/unit/calcAudit.test.js` and `tests/e2e/calc-audit.spec.ts`). All steps must pass on **both** `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html`.

---

## Prerequisites

```bash
# Serve locally OR open via file:// (Constitution Principle V — both must work)
python -m http.server 8766
# Then open both http://127.0.0.1:8766/FIRE-Dashboard.html and Generic
# OR double-click each HTML file directly
```

Open DevTools console.

---

## Step 1 — Audit tab is the 5th top-level tab (FR-001 / FR-002)

1. Confirm the top tab bar shows 5 tabs in this order: `Plan · Geography · Retirement · History · Audit`.
2. Confirm the Audit tab label is bilingual: switch to zh-TW; the label flips to `計算審查`.

---

## Step 2 — Flow diagram renders 6 clickable stages (FR-CF-1, FR-CF-2, FR-CF-3, FR-CF-4)

1. Click the Audit tab. The first thing visible at the top of the page is a horizontal flow diagram with 6 stages.
2. Confirm stage labels in order: **Inputs → Spending Adjustments → Gate Evaluations → FIRE Age Resolution → Strategy Ranking → Lifecycle Projection**.
3. Confirm each stage shows a one-line headline output of the live recalc (e.g., Inputs shows "42yo · $525K NW", Strategy shows the winner ID).
4. Confirm arrows between stages display data labels (e.g., "fireAge = 48").
5. Click the **Gates** stage. The page should smoothly scroll to the Gate Evaluations section AND that section briefly highlights (background flash for 1.5s).
6. Repeat click test for each stage — every click should scroll AND highlight the targeted section.

---

## Step 3 — Every detail section displays both a chart AND a table (FR-CH-1)

Scroll through each of the 7 detail sections (after the flow diagram). For each, verify:

| Section | Chart visible | Table visible |
|---------|---------------|---------------|
| Resolved Inputs | composition pie | inputs table |
| Spending Adjustments | spend curve line chart | adjustments table |
| Gate Evaluations | per-gate trajectory chart (×3) | per-gate violation table (×3) |
| FIRE Age Resolution | candidate-age scatter | candidates table |
| Strategy Ranking | grouped bar chart (7 strategies) | strategies table |
| Lifecycle Projection | thumbnail of lifecycle chart | per-year scrollable table |
| Cross-Validation | dual-bar chart per warning (or none if all pass) | warning rows OR "All cross-checks passed" |

If any section shows ONLY a table or ONLY a chart, this fails FR-CH-1.

---

## Step 4 — Lifecycle Projection table matches lifecycle chart (Story 1, AS-4)

1. Open Retirement → Lifecycle. Note the portfolio total at age 60 (read off the chart's tooltip).
2. Open Audit. Scroll to Lifecycle Projection.
3. Find the row for age 60 in the per-year table. The `total` column should equal the lifecycle-chart value (or differ by ≤$1).
4. Look at the chart thumbnail next to the table. The data point at age 60 should match.

---

## Step 5 — Gate Evaluations show floor + verdict + violations (FR-CH-4, Story 4)

1. Toggle Safe mode (button at the top, outside any tab).
2. Open Audit → scroll to Gate Evaluations. The Safe gate is highlighted (`audit-gate--active`).
3. Read the plain-English verdict. It should match the format described in the spec (e.g., "Safe: every retirement-year total ≥ $60,100. End balance $175,691. Verdict: feasible.").
4. Confirm the per-gate Safe chart shows:
   - The trajectory (line) the gate inspected.
   - The floor (dashed horizontal line at $60,100).
   - Any violation years marked on the chart (none if feasible).
5. Confirm the violations table is empty (when feasible) or lists every breach year.
6. Repeat for Exact and DWZ — note their verdicts may differ from Safe.

---

## Step 6 — Strategy Ranking shows all 7 strategies side-by-side (FR-CH-6)

1. Open Audit → scroll to Strategy Ranking.
2. Confirm the table has 7 rows, one per strategy.
3. The winner row is visually distinguished (`audit-table-row--winner` class — background highlight or icon).
4. Confirm the table columns include: end balance, lifetime tax, floor violations, first violation age, shortfall years, first shortfall age, safe-feasible, exact-feasible, dwz-feasible.
5. Confirm the grouped bar chart visualizes 7 strategies × 3 metrics (end balance, tax, violations).
6. Confirm the winner's bars are visually distinguished (color or border).

---

## Step 7 — Cross-Validation flags when planted (Story 3, FR-016)

This step requires planting a divergence. The simplest way:

1. With dashboard normal, confirm Cross-Validation shows "All cross-checks passed".
2. In DevTools console, simulate a planted divergence:
   ```js
   // Force a fake mismatch — ONLY for manual testing.
   window._lastAuditSnapshot.crossValidationWarnings.push({
     kind: 'endBalance-mismatch', valueA: 100000, valueB: 200000,
     delta: 100000, deltaPct: 100, expected: false, reason: 'planted'
   });
   // Then re-render the audit:
   if (window._renderAuditUI) window._renderAuditUI(window._lastAuditSnapshot);
   ```
3. Confirm Cross-Validation now displays one warning row with the dual-bar chart, the delta, and the reason.
4. Reload the page to clear the planted divergence; confirm "All cross-checks passed" returns.

---

## Step 8 — Copy Debug includes `audit` key (Story 2, FR-019)

1. Click the **Copy Debug** button (yellow button, bottom-right).
2. Paste into a JSON validator.
3. Confirm the JSON has a top-level `audit` key.
4. Confirm `audit.schemaVersion === "1.0"`.
5. Confirm `audit.flowDiagram.stages.length === 6`.
6. Confirm `audit.gates.length === 3` with modes safe, exact, dieWithZero in order.
7. Confirm `audit.lifecycleProjection.rows` has the same number of entries as the table you just viewed.
8. Confirm the existing keys (`feasibilityProbe`, `summary`, `lifecycleSamples`, `inputs`) are STILL present (FR-020 backward-compat).

---

## Step 9 — Lockstep DOM-diff (SC-010)

`tests/e2e/calc-audit.spec.ts` runs an automated DOM-diff between RR and Generic. Manually:

1. Open both files in DevTools.
2. In console of each, run:
   ```js
   JSON.stringify({
     sections: [...document.querySelectorAll('#tab-audit .audit-section')].map(s => s.id),
     canvases: [...document.querySelectorAll('#tab-audit canvas')].map(c => c.id),
     flowStages: [...document.querySelectorAll('.audit-flow__stage')].map(b => b.dataset.target),
     pillIds: [...document.querySelectorAll('.pill[data-tab="audit"]')].map(p => p.dataset.pill),
   })
   ```
3. The two outputs MUST be byte-identical.

---

## Step 10 — Mobile viewport (≤767px)

1. Resize browser to ≤767px (or DevTools device emulator at iPhone SE 375×667).
2. Open Audit tab.
3. Confirm the flow diagram now stacks vertically (stages top-to-bottom) with downward arrows.
4. Confirm `.audit-grid` collapses to 1 column (chart above table).
5. Confirm tables that overflow scroll horizontally (no layout breakage).

---

## Step 11 — file:// load works (Constitution V regression check)

1. Close the local HTTP server.
2. Double-click `FIRE-Dashboard.html` or `FIRE-Dashboard-Generic.html` to open via `file://`.
3. Open Audit tab.
4. Confirm everything renders (charts visible, tables populated).
5. Confirm DevTools console shows no `Access to script... blocked by CORS` errors related to `calc/calcAudit.js` (it's a classic script, not an ES module).

---

## Step 12 — Existing 195 unit tests + 50 E2E tests still pass (FR-030, SC-005)

```bash
node --test "tests/unit/*.test.js"
# Expected: 195 + N new calcAudit tests pass.

npx playwright test
# Expected: 50 + ≥7 new calc-audit tests pass.
```

---

## Step 13 — Bilingual end-to-end (Constitution VII)

1. Toggle language to zh-TW.
2. Confirm:
   - Tab label is `計算審查`.
   - Section headings translate.
   - Flow diagram stage labels translate.
   - Gate verdict plain-English sentences are in Chinese.
   - Table column headers translate.
   - "All cross-checks passed" / warning labels translate.
3. Toggle back to EN.
4. Confirm the active section + state are unchanged (only labels flip).

---

## Step 14 — Performance check (SC-006)

1. Open DevTools Performance tab.
2. With Audit tab NOT active (e.g., on Plan), record a recalc (change the FIRE marker by 1 year).
3. Stop recording. Note the recalc duration.
4. Switch to Audit tab.
5. Record another recalc with same input change.
6. Stop recording. The Audit-active recalc should be at most 100ms slower than the Audit-inactive one (per SC-006).

---

## Step 15 — Calc-engine zero-modification check (SC-008)

```bash
git diff main..HEAD --stat -- calc/lifecycle.js calc/withdrawal.js calc/socialSecurity.js calc/healthcare.js calc/mortgage.js calc/secondHome.js calc/college.js calc/studentLoan.js calc/inflation.js calc/tax.js calc/chartState.js calc/getCanonicalInputs.js calc/fireCalculator.js calc/shims.js
# Plus inline calc functions (signedLifecycleEndBalance, projectFullLifecycle, isFireAgeFeasible,
# scoreAndRank, _simulateStrategyLifetime, _chartFeasibility, rankByObjective, getActiveChartStrategyOptions,
# findFireAgeNumerical, getMortgageAdjustedRetirement, getTwoPhaseFireNum, computeWithdrawalStrategy)
# in FIRE-Dashboard*.html should show ZERO function-body diffs (only the call sites that pass the
# new options to assembleAuditSnapshot are allowed).
```

Expected output: zero changed lines in any calc-engine function body.

---

## All-green criteria

This feature is ready to merge when:

- ✅ All 14 manual steps above pass on both HTML files (file:// AND http://).
- ✅ `node --test "tests/unit/*.test.js"` shows 195+ pass (existing) + 14 new calcAudit pass.
- ✅ `npx playwright test` shows 50+ pass (existing) + 7 new calc-audit pass.
- ✅ `grep -in "audit\." "FIRE-Dashboard Translation Catalog.md"` returns the 37 new key pairs added.
- ✅ Lockstep DOM-diff between RR and Generic shows byte-identical Audit tab structure.
- ✅ Calc-engine functions have zero diffs (SC-008).
- ✅ `FIRE-Dashboard-Roadmap.md` updated with feature 014's status.
