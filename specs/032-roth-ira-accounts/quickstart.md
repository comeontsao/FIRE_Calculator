# Quickstart: Roth IRA Accounts (Feature 032)

**Feature**: 032-roth-ira-accounts
**Phase**: 1 (Design — Manual Smoke Checklist)
**Date**: 2026-05-28
**Merge gate**: This checklist MUST be executed by the Manager (you) before merging this feature to `main`. Browser smoke is the final gate (matches the pattern from features 020, 030, 031).

## Prerequisites

- All 622+ existing unit tests pass (`npm test` or equivalent).
- All Playwright E2E tests pass (`npx playwright test`).
- New tests for this feature pass (per `tasks.md`).
- Linter / formatter green.

## Smoke procedure

Open BOTH dashboards in a browser. The Generic dashboard is checked for regression — its UI must remain unchanged by this feature (FR-018).

### 1. Cold load — RR dashboard

1. Clear browser localStorage for the dashboard origin.
2. Open `FIRE-Dashboard.html` directly via `file://` double-click (Principle V).
3. Wait 2 seconds for cold-load.
4. **Expected:**
   - The header **WHOLE PORTFOLIO NET WORTH** displays a numeric value (not `—`, not `Calculating…`, not `NaN`).
   - The "Locked" sub-label under the header shows a non-zero amount (because Rebecca's locked Roth IRA default = $59,021 contributes to it).
   - Navigate to Plan → Assets tab. The new "🔒 Roth IRA" block is visible immediately to the right of (or below, on narrow viewports) the existing "🔒 Locked until 59.5 (401K)" block.
   - The block contains TWO inputs:
     - "Roger's Roth IRA" → `0`
     - "Rebecca's Roth IRA" → `59021`
   - Navigate to Plan → Investment tab. The new "Roth IRA Contributions (annual)" section is visible directly below the existing "401K: Roth Contribution (after-tax)" slider.
   - The section contains TWO number inputs:
     - "Roger's Roth IRA Contribution" → `7000`
     - "Rebecca's Roth IRA Contribution" → `7000`
   - Each input shows a helper tooltip with text containing "2026 IRS limit: $7,000 base / $8,000 catch-up".

### 2. localStorage persistence

1. Change Roger's Roth IRA balance to `25000`. Change Roger's Roth IRA Contribution to `7500`.
2. Reload the page.
3. **Expected:** both values restore to `25000` and `7500` (NOT the defaults `0` and `7000`).

### 3. Header total recalculation

1. Set Roger's Roth IRA balance to `50000` and Rebecca's Roth IRA balance to `50000`.
2. Note the previous header net-worth value.
3. Type the new values (or use a small +50000 / -50000 change).
4. **Expected:** the WHOLE PORTFOLIO NET WORTH header total changes by exactly the delta of the input change. The "Locked" sub-label changes by the same delta.

### 4. Lifecycle chart updates

1. With non-zero Roth IRA balances and contributions, observe the Lifecycle chart.
2. **Expected:**
   - A new stacked-area series labeled "Roth IRA" is visible.
   - The series uses a distinct color (lighter purple than the existing Roth 401K series).
   - The series is non-zero across all simulated years (it grows during accumulation, may shrink in retirement depending on strategy).
   - No NaN, no `null`, no missing data points.
   - The legend includes the new "Roth IRA" entry.

### 5. FIRE feasibility verdict updates

1. Switch the FIRE mode to **Safe**.
2. Note the displayed FIRE age / "On Track / Behind" verdict.
3. Set Roger's Roth IRA balance to `200000`.
4. **Expected:**
   - The verdict updates within 1 second.
   - The FIRE age moves earlier (or the verdict shifts to "Already FIRE" if the increase is large enough).
   - The Lifecycle chart visibly reflects the higher starting balance.
   - The chart's depicted balance trajectory at FIRE age matches the verdict's claimed `endBalance` (per the FR-021e effective-balance formula extension).
5. Repeat for **Exact** mode and **Die With Zero** mode. Each must show a consistent verdict + chart state.

### 6. Drag-FIRE-marker preview parity (Feature 031 contract)

1. With non-zero Roth IRA balances, click and hold the FIRE marker on the Lifecycle chart.
2. Drag the marker left and right slowly across ~10 years.
3. **Expected:**
   - At every drag position, the verdict, the chart's depicted balance trajectory, and the drag-preview tooltip remain mutually consistent.
   - No flicker, no stale strategy, no NaN.
   - The Withdrawal Strategy tooltip (if visible) also stays in sync.

### 7. Withdrawal-strategy panel updates

1. With non-zero Roth IRA balances and the FIRE marker at a retirement-age year, hover the withdrawal-strategy comparison panel.
2. **Expected:**
   - The tooltip shows a `rothIra` line in the pool-by-pool draw breakdown.
   - In years where the strategy draws Roth IRA, the line shows a non-zero positive amount.
   - In years where the strategy doesn't draw Roth IRA (because spending was already covered by earlier pools), the line shows `0` or is hidden.
3. Switch to a Roth-ladder-style strategy. The `rothIra` line should show non-zero draws in early retirement years (subject to the 59.5 lock).
4. Switch to a `trad-first` strategy. The `rothIra` line should show draws only after `roth`, `cash`, and `taxable` are exhausted.

### 8. RMD exemption

1. Set the user's plan age to 95 and the FIRE age to 50 (so retirement spans ages 50–95).
2. Set Roger's Roth IRA balance to `500000` and a moderate annual spend.
3. **Expected:**
   - In years where age ≥ 73 (RMD start), the RMD logic draws ONLY from `trad`, never from `rothIra`.
   - The Lifecycle chart's Roth IRA series declines (or remains flat) only when the active strategy draws it intentionally, never via the RMD branch.

### 9. Snapshot save + reload

1. With non-zero Roth IRA balances, click "Save snapshot" (or whichever button triggers a CSV row append).
2. Open `FIRE-snapshots.csv` in a text editor.
3. **Expected:**
   - The first row (header) ends with `…,rogerRothIra,rebeccaRothIra`.
   - The newest data row contains the entered Roth IRA balance values in those columns.
   - Older rows (from before this feature shipped) are unchanged — they simply don't have values for the new columns.
4. Reload the dashboard. Navigate to the History tab.
5. **Expected:**
   - The history table renders without errors.
   - The newest row shows the saved Roth IRA values.
   - Older rows show `0` (or blank) for the Roth IRA columns; no row is missing or corrupted.

### 10. Language toggle

1. With the new Roth IRA inputs visible, switch the language from English to Traditional Chinese (中文).
2. **Expected:**
   - The block header "🔒 Roth IRA" remains as is (locked emoji + acronym — exempted per Principle VII).
   - "Roger's Roth IRA" → "Roger 的 Roth IRA (個人退休帳戶)".
   - "Rebecca's Roth IRA" → "Rebecca 的 Roth IRA (個人退休帳戶)".
   - "Roth IRA Contributions (annual)" → "Roth IRA 年度供款".
   - All input values remain unchanged (only labels update).
3. Switch back to English. All labels restore.

### 11. Copy-debug snapshot

1. With non-zero Roth IRA balances, trigger the copy-debug action (whatever invokes the JSON export).
2. Paste the JSON into a text editor.
3. **Expected:**
   - The JSON contains `pRothIra` at the end-of-accumulation snapshot.
   - The JSON contains both Roger's and Rebecca's Roth IRA values in both real-$ and book-value (nominal-$) frames.

### 12. Audit invariants

1. With non-zero Roth IRA balances, navigate to the Audit tab.
2. Run the audit (or wait for it to auto-execute).
3. **Expected:**
   - All audit invariants (currently `_invariantA` through `_invariantF`) pass with green status.
   - The audit composition snapshot displays `lockedRothIra` alongside `lockedRoth401k`.
   - No `[shim-name] canonical threw:` errors in the DevTools console.

### 13. Generic dashboard regression

1. Open `FIRE-Dashboard-Generic.html` directly via `file://`.
2. Navigate to Plan → Assets.
3. **Expected:**
   - NO new "🔒 Roth IRA" block is visible (FR-018 — Generic UI untouched).
   - The existing Roth 401K inputs remain in place, unmodified.
   - The header NET WORTH total matches what it showed before this feature.
4. Navigate to Plan → Investment.
5. **Expected:**
   - NO new "Roth IRA Contributions (annual)" section is visible.
   - The existing 401K Roth Contribution slider remains in place, unmodified.
6. Drag the FIRE marker. Confirm verdict + chart + tooltip stay in sync (no regression from the calc-layer changes).
7. **Expected:** Generic dashboard's calc engine works identically to its pre-feature state. The Roth IRA pool exists in the calc layer but defaults to 0 because no UI input feeds it.

### 14. DevTools console — zero errors

1. With both dashboards loaded and exercised, open DevTools console.
2. **Expected:**
   - Zero red errors.
   - Zero `[shim-name] canonical threw:` messages.
   - Zero NaN warnings.
   - Yellow warnings are permitted if they exist in the pre-feature baseline (compare).

## Acceptance

Pass criteria:
- Every step above produces the Expected outcome.
- No NaN, no undefined, no unhandled exceptions in either dashboard.
- Generic dashboard's UI is byte-identical to its pre-feature state (modulo the inline calc-code lockstep changes, which don't manifest as UI changes).

If any step fails: STOP. Document the failure in the commit message or a new BACKLOG entry. Do NOT merge until resolved.

## Sign-off

| Surface | Pass / Fail | Notes |
|---|---|---|
| Cold load (RR) | | |
| localStorage persistence | | |
| Header total recalc | | |
| Lifecycle chart series | | |
| FIRE verdict (Safe / Exact / DWZ) | | |
| Drag-FIRE-marker parity | | |
| Withdrawal-strategy tooltip | | |
| RMD exemption | | |
| Snapshot save + reload | | |
| Language toggle | | |
| Copy-debug snapshot | | |
| Audit invariants | | |
| Generic regression | | |
| DevTools console clean | | |
