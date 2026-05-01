# Quickstart — Feature 021 Browser Smoke Checklist

**Feature**: Tax expense category + audit-harness carry-forward
**Branch**: `021-tax-category-and-audit-cleanup`
**Use this checklist**: T080-equivalent — manual gate before merge to `main`.

This is the user-side gate. CLI-driven tests (Node unit tests + audit harness) cover the calc layer. The browser smoke verifies the UI behavior in a real browser. Capture screenshots in `specs/021-tax-category-and-audit-cleanup/browser-smoke/`.

---

## Prerequisites

- All `node --test` runs green: unit + audit-harness + meta tests.
- Both HTMLs load without console errors at cold start (`file://` open).
- Latest commit on branch reflects all phases 1–11 complete.

---

## Step 1 — Cold load

1. Open `FIRE-Dashboard.html` in your browser (double-click or `file://` URL).
2. Wait 2 seconds for Chart.js + state hydration.
3. Open DevTools console.

**Expected**:
- ✅ Zero red errors.
- ✅ Zero `[<shim-name>] canonical threw:` messages.
- ✅ KPI card shows "Years to FIRE" (or "X Years Y Months" from feature 020) — not "—" / "NaN" / "Calculating…".
- ✅ Default RR-baseline scenario loads with familiar numbers (no regression vs main).

Repeat for `FIRE-Dashboard-Generic.html`. Both must pass.

---

## Step 2 — Plan tab → Expenses pill (US1 + US2)

1. Click the **Plan** tab.
2. Click the **Expenses** pill.
3. Scroll to the expense breakdown table.

**Expected**:
- ✅ A new top-level **Tax** category appears (alongside Pets, Travel, Hobbies, etc.).
- ✅ Tax category has TWO sub-rows:
  - 🔒 **Income tax** — read-only, lock icon visible, shows monthly $ amount AND effective rate %.
  - ✏️ **Other tax** — editable input, defaults to $0.

For RR-baseline (Roger + Rebecca, MFJ, $150k joint income, $20k pretax 401k):
- ✅ Income tax row shows ≈ $1,980/mo (within $50 of target).
- ✅ Effective rate shows ≈ 15.8% (one decimal place).

For Generic with adultCount=1 (single filer, $80k income, $10k pretax 401k):
- ✅ Income tax row uses single-filer brackets (NOT MFJ).
- ✅ Computed value matches IRS 2024 single-filer table within ±$5.

4. Hover over the lock icon on Income tax.
- ✅ Tooltip explains: *"Income tax = federal income tax + FICA. Computed automatically. Already deducted from income on the savings side; does NOT add to your monthly spend budget."*
- ✅ Tooltip translates to zh-TW when language is switched to 中文.

5. Type **$200** into the Other tax field.
- ✅ `monthlySpend` total at the bottom of the expense breakdown increases by $200.
- ✅ Lifecycle chart re-renders to reflect the new spend.

6. Switch country scenario from US to Japan.
- ✅ Other tax stays at $200 (manual value preserved per FR-009).
- ✅ Income tax row continues to show US progressive + FICA (per Q2 clarification — pre-FIRE always uses US tax).

7. Reload the page.
- ✅ Other tax persists at $200 (localStorage `exp_tax_other`).

---

## Step 3 — Investment tab → Auto toggle (US3)

1. Click the **Plan** tab → **Investment** pill.
2. Locate the existing `taxRate` slider.

**Expected**:
- ✅ A new **Auto** toggle appears next to the slider.
- ✅ For RR-baseline (existing user with non-zero saved `taxRate`): Auto = OFF, slider active at saved value.
- ✅ For a new user (or after explicitly clearing taxRate to 0): Auto = ON, slider grayed out, shows "Auto: 15.8%" (or whatever the auto-computed effective rate is).

3. Toggle Auto OFF and ON repeatedly.
- ✅ Slider transitions smoothly between active and grayed-out states.
- ✅ Income tax row in Expenses pill updates to reflect the new mode.
- ✅ When OFF, slider is editable; when ON, slider is read-only and shows the computed rate.

4. With Auto ON, drag the gross-income slider from $150k to $250k.
- ✅ Income tax row monthly $ updates within one animation frame (no visible lag).
- ✅ Auto label updates to reflect the new effective rate.

5. Reload the page.
- ✅ Auto state persists (localStorage `taxRateAutoMode`).

---

## Step 4 — Audit dump (FR-016a)

1. Click the **Audit** tab.
2. Locate the per-year accumulation row table.

**Expected**:
- ✅ Each row now shows `federalTax` AND `ficaTax` columns.
- ✅ Hovering a row reveals the breakdown tooltip (or expanding shows: bracket10 / bracket12 / bracket22 / etc. + standardDeduction + taxableIncome for federal; socialSecurity / medicare / additionalMedicare / ssWageBaseHit for FICA).

3. Click **Copy Debug**.
4. Paste into a text editor.
- ✅ JSON contains `lifecycleProjection.rows[i].federalTaxBreakdown` and `ficaBreakdown` per row.
- ✅ JSON contains `summary.totalFicaTax`.
- ✅ Aggregate `federalTax` equals sum of breakdown components within $1 (manual spot-check).

---

## Step 5 — Strategy ranker stability (US4 / B-020-4)

1. Click the **Plan** tab → **Investment** pill.
2. Note the current strategy winner (shown in Strategy Ranking card).
3. Drag the FIRE marker on the Lifecycle chart by ±1 year.
4. Drag back to the original position.

**Expected**:
- ✅ Strategy winner does NOT flip back-and-forth on each tiny drag (hysteresis blocks knife-edge flips).
- ✅ Genuine winner changes (when crossing a real strategy-better boundary) DO occur — hysteresis only blocks noise.

---

## Step 6 — Verdict pill + Lifecycle chart consistency

1. With RR-baseline (Safe mode + Leave more behind objective):
- ✅ Verdict pill shows "On Track — FIRE in X Years Y Months".
- ✅ Lifecycle chart shows trajectory consistent with verdict.
- ✅ FIRE NUMBER displayed matches the chart's FIRE-year total.

2. Switch mode to DWZ.
- ✅ All three (verdict, chart, FIRE NUMBER) update consistently.
- ✅ Chart trajectory drains to ~$0 at endAge under DWZ semantics.
- ✅ No `hasShortfall:true` rows mid-trajectory (B3 fix from feature 020 holds; new B3 regression test pinned this).

---

## Step 7 — Bilingual smoke

1. Toggle EN ↔ 中文 multiple times during steps 2–5.

**Expected**:
- ✅ All Tax category labels translate.
- ✅ Income tax tooltip translates.
- ✅ Auto toggle label translates ("Auto" / "自動").
- ✅ Effective rate format reads naturally in both languages.
- ✅ No half-translated UI; no missing keys (would render as `expenses.tax.foo`).

---

## Step 8 — Console silence

After Steps 1–7, with both files exercised:
- ✅ Zero red console errors.
- ✅ Zero `[<shim-name>] canonical threw:` messages.
- ✅ No NaN cascades.
- ✅ No "TypeError: Cannot read properties of undefined" stack traces.

---

## Step 9 — File:// delivery

1. Close the browser.
2. Re-open both HTMLs by double-clicking the file (no http server, no localhost).

**Expected**:
- ✅ Both files load and behave identically to step 1–8.
- ✅ All UI works under `file://` (Constitution Principle V).

---

## Pass criteria

All ✅ items pass for BOTH `FIRE-Dashboard.html` AND `FIRE-Dashboard-Generic.html`. Capture screenshots of:

- Step 2: Tax category in Expenses pill (RR + Generic, EN + 中文).
- Step 3: Auto toggle ON state with grayed-out slider.
- Step 4: Audit dump showing breakdown fields.
- Any unexpected behavior (red console errors, NaN values, etc.).

Save in `specs/021-tax-category-and-audit-cleanup/browser-smoke/`.

---

## Sign-off

Once all steps pass, merge to `main` with:

```bash
git checkout main
git pull origin main
git merge --no-ff 021-tax-category-and-audit-cleanup -m "feat(021): tax expense category + audit-harness carry-forward"
git push origin main
```

Same workflow as feature 020 merge (commit `3d45eab`).
