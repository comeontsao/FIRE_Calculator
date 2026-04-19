# Quickstart — Modular Calc Engine

**Feature**: `001-modular-calc-engine`
**Audience**: The engineer (Frontend, Backend, QA, or Manager) picking up this work.

This doc is the end-to-end verification recipe. If every step below passes, the
feature meets its acceptance criteria.

---

## Prerequisites

- **Node 20+** (for `node:test`). Verify: `node --version`.
- **A modern browser** (Chrome/Firefox/Safari, last two major versions).
- Repository clone at a clean `001-modular-calc-engine` branch.

No `npm install`. No build step. That's the point.

---

## Step 1 — Unit test suite green

```bash
node --test tests/
```

**Expected**:
- All unit tests in `tests/unit/*.test.js` pass.
- Meta-tests in `tests/meta/module-boundaries.test.js` pass:
  - No DOM/Chart.js/`window`/`document`/`localStorage` reference in any `calc/*.js`.
  - Every `calc/*.js` begins with the required `Inputs / Outputs / Consumers` header.
  - Every chart renderer's `@module:` comment has a reciprocal `Consumers:` entry in the cited module.
- Parity test in `tests/parity/rr-vs-generic.test.js` passes — RR's PersonalData-enriched
  inputs on the canonical parity fixture produce byte-identical `FireSolverResult` to
  Generic's direct inputs on the same fixture.
- Wall-clock runtime ≤ 10 s (SC-003).

---

## Step 2 — Open each dashboard in a browser

```text
# Windows
start FIRE-Dashboard.html
start FIRE-Dashboard-Generic.html

# macOS
open FIRE-Dashboard.html
open FIRE-Dashboard-Generic.html
```

**Expected**:
- First chart visible in < 1 s (SC-001/perf floor).
- DevTools console: zero errors, zero warnings.
- DevTools Network tab: Chart.js loaded from CDN; every `./calc/*.js` loaded as a
  module from `file://`.

---

## Step 3 — Manual: drag-affordance discoverability (FR-019, SC-008)

On the Full Portfolio Lifecycle chart:
1. Hover the FIRE-age marker → cursor changes to `grab`.
2. Italic hint label "drag me" visible below the marker (first session).
3. On first page load of the session, the marker pulses subtly for ~3 seconds.

---

## Step 4 — Manual: drag → confirm → reset flow (FR-014, FR-018, FR-020)

1. Click-drag the marker from calculated age X to age X − 3.
2. While dragging, the lifecycle chart shows a preview; KPIs and other charts have
   **NOT** yet updated.
3. Release the drag. An inline "Recalculate for retirement at age X − 3" button appears.
4. Click confirm. **All** dependents update to reflect X − 3:
   - KPI cards: "Years to FIRE", "FIRE Net Worth", "Progress %".
   - Lifetime Withdrawal / Roth Ladder chart.
   - Portfolio Drawdown With-vs-Without SS chart.
   - Timeline chart (if present).
   - Scenario-card FIRE impact.
   - Healthcare delta.
   - Coast-FIRE indicator.
   - Mortgage verdict.
   - Banner shows "Override active — calculated FIRE age: X".
   - Reset button visible.
5. Click Reset. Override clears, all dependents snap back to calculated X.

---

## Step 5 — Manual: override wipe on input change (FR-014, SC-009)

1. Drag to X − 3, click confirm. Confirm override is active.
2. Change any input (e.g., annual spend + $500). Any recalculation trigger.
3. **Expected**: override silently wipes; solver re-runs; charts reflect the newly
   calculated FIRE age based on the updated input. Reset button hidden.

---

## Step 6 — Manual: mode switch preserves override (FR-015, US1 Scenario 9)

1. Drag to X − 3, click confirm. Confirm override is active.
2. Toggle solver mode: Safe → Exact → Die-with-Zero.
3. **Expected**: `effectiveFireAge` (visible in every chart and KPI) stays at X − 3.
   `overrideFireAge` stays at X − 3. `calculatedFireAge` is NOT refreshed (still the
   value from the last full solve). Only the `feasible` flag updates — the
   infeasibility banner may appear / disappear as the mode's buffer rules tighten /
   loosen. The Reset button remains visible throughout.
4. Click Reset. NOW the solver runs fresh under the current mode, and the newly
   calculated FIRE age is displayed.
5. Verify in devtools: `window.chartState.state` shows `source === 'override'`
   throughout steps 2–3 (only after step 4 does it return to `'calculated'`).

---

## Step 7 — Manual: infeasibility indicator (FR-004)

1. Drag to an age below the calculated age by a large margin (e.g., X − 15).
2. Click confirm.
3. **Expected**: dashboard surfaces a visible infeasibility indicator (warning badge,
   changed banner color). No chart shows an "empty but pretending to succeed" state.
   The `deficitReal` value is visible somewhere in the UI.

---

## Step 8 — Repeat on both dashboards

Every step 3–7 MUST produce behavior that is visually and numerically identical
between `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` on shared inputs.
The only permitted difference is content that RR's personal-data adapter supplies
(Roger's actual SS earnings, Janet/Ian's college years, etc.).

---

## Step 9 — Independent-reader audit (SC-002)

Pick a random number displayed on the dashboard (e.g., "Years to FIRE: 8").
Task an independent reader:

1. Open the browser devtools → Elements → hover over the displayed "8".
2. Find the chart/KPI renderer in the HTML file (search for the DOM id).
3. Read the renderer's `@module:` comment block.
4. Open the cited module's `Inputs/Outputs/Consumers` header.

**Expected**: reader can articulate "this number comes from `fireCalculator.js` via
`chartState.js`, input from the `Inputs` shape" in under 30 seconds.

---

## Step 10 — LoC parity check (SC-007)

```bash
wc -l FIRE-Dashboard.html FIRE-Dashboard-Generic.html calc/*.js personal/*.js
```

**Expected**:
- Both HTML files shrunk significantly (from ~7 000 → ~5 000 lines).
- `calc/*.js` directory ≈ 3 000 lines.
- On any future feature PR touching the calc layer, diff to `FIRE-Dashboard.html` and
  `FIRE-Dashboard-Generic.html` are near-identical (glue-layer differences only).

---

## Step 11 — Acceptance scenario smoke test

For every acceptance scenario in `spec.md` §User Scenarios, spot-check one. The
above steps cover them all; this is a final sanity pass.

---

## If anything fails

- Stop. The feature is not done.
- Capture the failure (screenshot + console log + `node --test` output).
- Route back to the responsible Engineer (see `CLAUDE.md` team roles):
  - Calc-module bug → Backend Engineer.
  - Chart-propagation / UI bug → Frontend Engineer.
  - Parity drift → Manager decides whether the fix belongs in `personal-rr.js`
    (Frontend + Backend collab) or in a shared module (Backend).
- Re-run this quickstart from Step 1 after the fix.
