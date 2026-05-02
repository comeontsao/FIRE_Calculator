# Quickstart — Feature 022 Browser Smoke Checklist

**Feature**: Nominal-dollar display + frame-clarifying comments + B-021 carry-forward
**Branch**: `022-nominal-dollar-display`
**Use this checklist**: T088-equivalent — manual gate before merge to `main`.

This is the user-side gate. CLI-driven tests cover calc + audit + meta layers. The browser smoke verifies UI behavior across all 14 in-scope charts in real browsers. Capture screenshots in `specs/022-nominal-dollar-display/browser-smoke/`.

---

## Prerequisites

- Full test suite green: `node --test tests/unit/*.test.js tests/unit/validation-audit/*.test.js tests/meta/*.test.js`
- Both HTMLs load without console errors at cold start (`file://` open).
- Latest commit on branch reflects all phases 1–12 complete.

---

## Step 1 — Cold load + console silence

1. Open `FIRE-Dashboard.html` (double-click → `file://`).
2. Wait 2 seconds for Chart.js + state hydration.
3. Open DevTools console.

**Expected**:
- ✅ Zero red errors.
- ✅ Zero `[<shim-name>] canonical threw:` messages.
- ✅ KPI cards show numeric values (no NaN, no "—" for live values).
- ✅ Default RR-baseline scenario loads with familiar numbers.

Repeat for `FIRE-Dashboard-Generic.html`.

---

## Step 2 — Lifecycle chart Book Value verification

1. Click **Retirement** tab → **Lifecycle** pill.
2. RR-baseline (Roger + Rebecca, MFJ, $150k income, $20k pretax 401k, age 42 today, 7% nominal stocks return, 3% inflation).

**Expected**:
- ✅ Y-axis values are in nominal future dollars (Book Value).
- ✅ Age-53 total ≈ **$1,126k** (within ±$30k of `$445k × 1.07^11 + $12k annuity_factor_11_at_7%`).
- ✅ Caption near chart title: "Book Value at 3% assumed annual inflation" / zh-TW "帳面價值 (假設年通膨率 3%)".
- ✅ Hover tooltip shows: "$1,126k Book Value · ≈ $822k purchasing power" (or zh-TW equivalent).
- ✅ Drag the inflation rate slider 3% → 5%. Lifecycle chart values shift up; caption updates to "Book Value at 5% assumed annual inflation".

---

## Step 3 — All 14 in-scope charts use Book Value

For each chart in the inventory, verify Y-axis (or relevant value) is Book Value with caption + tooltip companion. Capture one screenshot per check:

| # | Chart | Tab → Pill | Verification |
|---|---|---|---|
| 1 | Lifecycle | Retirement → Lifecycle | (covered in Step 2) |
| 2 | Withdrawal Strategy | Retirement → Withdrawal Strategy | per-year withdrawal $ amounts in Book Value |
| 3 | Drawdown | Retirement → Drawdown | running balance + draws in Book Value |
| 4 | Roth Ladder | Retirement → Drawdown (secondary) | conversion amounts + post-conversion balance |
| 5 | Healthcare delta | Geography → Healthcare | premium + subsidy delta |
| 6 | Mortgage payoff bar | Plan → Mortgage | principal + interest + total |
| 7 | Payoff vs Invest brokerage trajectory | Plan → Payoff vs Invest | both prepay + invest paths |
| 8 | Payoff vs Invest amortization split | Plan → Payoff vs Invest | (already a Book Value chart pre-022; unchanged values, gains caption) |
| 9 | Country budget tier comparison | Geography → Scenarios | tier $ amounts; tooltip says "Cost in today's $ inflated to retirement year for projections" |
| 10 | Country deep-dive insight | Geography → Scenarios | spending $ amounts |
| 11 | Strategy ranker score bar chart | Audit (or sidebar) | strategy $ scores |
| 12 | Plan-tab Expenses pill (Income tax row) | Plan → Expenses | row amount in Book Value at fireAge |
| 13 | KPI cards (5 cards) | header | Current Net Worth unchanged; FIRE NUMBER + Total at FIRE in Book Value at fireAge |
| 14 | Verdict pill + verdict banner | header / Plan tab | verdict $ amounts in Book Value |
| — | Audit-tab tables | Audit | column headers show frame label "(Book Value)" or "(purchasing power)" |
| — | Snapshots history chart | History | UNCHANGED — already nominal historical balances per FR-001a |

**Expected for each row**: ✅ Y-axis / value in Book Value; ✅ caption present; ✅ tooltip companion line present.

---

## Step 4 — Drag-preview overlay

1. Click **Retirement** → **Lifecycle**. Drag the FIRE marker (🔥 triangle) from age 53 to age 55.
2. **Hold** the drag (don't release).

**Expected**:
- ✅ Drag-preview floating tooltip shows: "If you retire at 55: $X.XM Book Value · ≈ $Y.YM purchasing power" (or zh-TW equivalent).
- ✅ Temporary chart re-render shows projected curve in Book Value at the new fireAge.
- ✅ Same-frame update (no visible lag at 60fps).
3. Release WITHOUT clicking "Recalculate at age 55".
- ✅ Chart reverts to pre-drag fireAge=53 view in Book Value (per FR-008c).
4. Drag again to age 55 and click confirm.
- ✅ All 14 charts re-render in Book Value at the new fireAge.
- ✅ Conversion factor `(1 + i)^(age − currentAge)` recomputes per data point per FR-008b.

---

## Step 5 — Mode + objective + country + inflation slider

For each user-input change, all in-scope charts must re-render in Book Value with the new state:

| Change | Verification |
|---|---|
| Mode toggle Safe → Exact → DWZ | All charts re-render; verdict pill updates; Book Value preserved |
| Objective toggle Leave-more-behind → Pay-less-tax | Same |
| Country switch US → Japan → Taiwan | All charts re-render; country budget tier tooltip shows "Cost in today's $..."; Book Value reflects country budget tier inflated to retirement year |
| Inflation slider 3% → 5% | All charts re-render with higher Book Value totals; caption updates to "5% assumed annual inflation" |
| Income slider $150k → $250k | Income tax sub-row Book Value updates within one frame |
| `taxRate` Auto toggle ON / OFF | Charts re-render; effective rate label updates |

---

## Step 6 — Audit dump frame labels

1. Click **Audit** tab.
2. Click **Copy Debug**.
3. Paste into a text editor.

**Expected**:
- ✅ Per-row fields include `*BookValue` companions: `totalBookValue`, `federalTaxBookValue`, etc.
- ✅ Audit-tab table column headers visually distinguish frame: "Total (Book Value)" / "Taxable Income (purchasing power)".
- ✅ `summary` block includes `totalAtFireBookValue`, `fireNumberBookValue`.

---

## Step 7 — `// FRAME:` comment audit

1. Run `node --test tests/meta/frame-coverage.test.js`.

**Expected**:
- ✅ Test passes with ≥95% qualifying-line coverage.
- ✅ Output reports per-file coverage breakdown.

2. Run `node --test tests/meta/snapshot-frame-coverage.test.js`.

**Expected**:
- ✅ Test passes; every chart-consumed snapshot field has its `bookValue` companion.

---

## Step 8 — Conservation invariants (US3 fix verification)

1. Run `node --test tests/unit/accumulateToFire.test.js`.
- ✅ All v4-FRAME-* tests pass (8 new tests).
- ✅ Existing v3-CF-* + v3-TX-* tests pass with `// 022:` annotations.

2. Run `node --test tests/unit/validation-audit/tax-bracket-conservation.test.js`.
- ✅ TBC-1 through TBC-5 all green (feature 021 invariants stay locked).

3. Run `node --test tests/unit/spendingFloorPass.test.js`.
- ✅ 7/7 green (Constitution VIII gate).

---

## Step 9 — Audit harness full run

1. Run `node --test tests/unit/validation-audit/`.

**Expected**:
- ✅ 0 CRITICAL findings.
- ✅ 0 HIGH findings (E3 cleared via US5 fix; new month-precision-feasibility family green via US6).
- ✅ MEDIUM/LOW findings ≤ feature 021 baseline.

---

## Step 10 — `file://` delivery + bilingual

1. Close browsers. Re-open both HTMLs by double-click.
2. Toggle EN ↔ 中文 multiple times during steps 2–6.

**Expected**:
- ✅ Both files load and behave identically to step 1–9 under `file://`.
- ✅ "Book Value" / "帳面價值" labels translate.
- ✅ "purchasing power" / "約等於今日價值" companion lines translate.
- ✅ Caption "Book Value at 3% assumed annual inflation" / "帳面價值 (假設年通膨率 3%)" translates.
- ✅ No half-translated UI; no missing keys (would render as `display.frame.bookValue` raw).

---

## Pass criteria

All ✅ items pass for BOTH `FIRE-Dashboard.html` AND `FIRE-Dashboard-Generic.html`. Capture screenshots of:

- Step 2 (Lifecycle chart with caption + tooltip).
- Step 3 (one screenshot per in-scope chart family).
- Step 4 (drag-preview overlay showing Book Value + purchasing-power lines).
- Step 6 (audit dump frame labels + Copy Debug paste).
- Any unexpected behavior.

Save in `specs/022-nominal-dollar-display/browser-smoke/`.

---

## Sign-off

Once all steps pass, merge to `main` with:

```bash
git checkout main
git pull origin main
git merge --no-ff 022-nominal-dollar-display -m "feat(022): nominal-dollar display + frame-clarifying comments + B-021 carry-forward"
git push origin main
```

Same workflow as features 020 + 021 merges.

## OPTIONAL — US7 toggle (skip unless user reports UX confusion)

If during 1-2 weeks of use the always-Book-Value display causes user confusion (e.g., "$1.13M FIRE NUMBER" panic without realizing it's tomorrow's $), implement US7:

- Add header toggle next to language switcher: "Purchasing Power" ⇄ "Book Value".
- localStorage `displayDollarMode` persists state.
- "Purchasing Power" mode reproduces feature 021 visual exactly.

Otherwise, skip — feature 022 is complete without US7.
