# Feature 023 — Browser Smoke Quickstart (User Gate)

**Feature**: Accumulation-vs-Retirement Spend Separation
**Branch**: `023-accumulation-spend-separation`
**Purpose**: Manual smoke checklist before merge to `main`. Run after all 9 implementation phases complete and CLI tests pass.

---

## Prerequisites

- All `node --test tests/**/*.test.js` passing (target: ≥484 tests, was 478 baseline + 6 new).
- Audit harness reports total findings ≤ 1 LOW (post-022 baseline).
- Both HTMLs lockstep-verified by sentinel grep.
- Branch tip is `023-accumulation-spend-separation` HEAD.

## 8-step checklist

### Step 1 — Cold load + console silence

1. Open `FIRE-Dashboard.html` in Chrome via `file://` (double-click).
2. Wait 2 seconds for cold render.
3. Open DevTools console.
4. **Pass**: zero red errors. No `[accumulateToFire] threw` lines. No `MISSING_SPEND` warnings (unless your Plan tab actually has zero rows).
5. Repeat for `FIRE-Dashboard-Generic.html`.

### Step 2 — Lifecycle chart year-1 sanity check (SC-001 + SC-006)

1. Confirm Plan tab has the standard expense rows totaling ≈ $10k/mo (~$120k/yr line items).
2. Confirm Geography tab shows **Taiwan** selected (or whichever country tier you use).
3. Hover the Lifecycle chart at age 42 (currentAge). Note the Total Portfolio Book Value.
4. Hover at age 43.
5. **Pass**: age-43 Total Portfolio Book Value − age-42 Total Portfolio Book Value < $100,000. Pre-feature-023 this delta was +$191,722; post-fix should be ~+$95k or less.
6. **Pass**: Cash bucket year-over-year delta is small (< $10k); the inflated cash residual is gone.

### Step 3 — Country-tier purity check (SC-003, US2)

1. With current country = Taiwan, note the FIRE age (top header) and end-of-life portfolio (Lifecycle chart's last point).
2. Switch country tier to **Stay-in-US** (top of country list).
3. Wait for re-render.
4. **Pass**: FIRE age MAY change (US $120k spending requires a larger nest egg). Lifecycle chart's accumulation-phase trajectory (ages 42 → fireAge) is **unchanged**. Only the retirement-phase (ages fireAge → endAge) trajectory changes.
5. Switch back to Taiwan. Confirm trajectory returns.

### Step 4 — Audit-tab verification (US3)

1. Click Audit tab.
2. Find the year-0 accumulation row (age = currentAge).
3. **Pass**: `annualSpending` field shows ≈ $120,000 (your line-item total, NOT $0).
4. **Pass**: `spendSource` field (new in v5) shows `options.accumulationSpend`.
5. **Pass**: `cashFlowWarning` field is empty or `NEGATIVE_RESIDUAL` (depending on your income vs spending). NOT `MISSING_SPEND`.

### Step 5 — Copy Debug verification

1. Click "Copy Debug" button (bottom-right).
2. Paste the JSON into a text editor.
3. **Pass**: Top-level fields include `accumulationSpend` (numeric, ≈ $120k) AND `annualSpend` (numeric, country-tier value, e.g., $60,100 for TW). Both NON-ZERO and DIFFERENT.
4. **Pass**: Top-level field `accumulationSpend_source = 'getAccumulationSpend(inp)'`.

### Step 6 — Bilingual EN ↔ 中文 (US6)

1. Click 中文 toggle (top right).
2. Find the Plan-tab Expenses pill caption.
3. **Pass**: The total-spending caption renders in Traditional Chinese with parallel meaning to "Current spending (US household, today's dollars)". Expected: "目前支出（美國家計，今日購買力）" or similar.
4. Toggle back to EN. Confirm English caption renders correctly.
5. **Pass**: No untranslated `[key.not.found]` or hardcoded English bleed-through.

### Step 7 — Strategy ranker + verdict pill consistency (US5)

1. Confirm verdict pill shows "On Track — FIRE in N years" (or "Adjust — ..." if currently infeasible).
2. Compare verdict-pill N to Lifecycle chart's marker age.
3. **Pass**: They match. The bug-fix accumulationSpend now flows through every caller (chart, ranker, FIRE-resolver), so the verdict and chart agree.
4. Open Withdrawal Strategy panel.
5. **Pass**: Panel renders strategy comparison with no "Calculating…" stall.

### Step 8 — File:// + cross-browser

1. Verify Step 1 in Chrome via `file://` (already done).
2. Open `FIRE-Dashboard.html` in Firefox via `file://`.
3. Repeat Steps 1, 2, 4 quickly.
4. **Pass**: Same numbers in both browsers; no console errors specific to Firefox.
5. Optional: Edge / Safari for full coverage if available.

---

## Failure escalation

If any step fails:

1. Capture a screenshot of the failing chart/console state.
2. Save the Copy Debug JSON.
3. File a follow-up note in `BACKLOG.md` (B-023-*) and pause merge.
4. The Manager dispatches a Backend Engineer or QA Engineer per the failure category.

## Sign-off

Once all 8 steps PASS:

```bash
git checkout main && git pull origin main
git merge --no-ff 023-accumulation-spend-separation \
  -m "Merge feature 023-accumulation-spend-separation: separate accumulation vs retirement spending"
git branch -d 023-accumulation-spend-separation
```

## Pre-merge gate matrix

| Gate | Target | Actual | Pass? |
|---|---|---|---|
| Tests passing | ≥484 / ≥484 | (fill at closeout) | (fill) |
| Audit findings | ≤ 1 LOW | (fill) | (fill) |
| RR-baseline year-1 Δ | < $100,000 | (fill) | (fill) |
| Country-tier purity | accumulation Δ = 0 on tier swap | (fill) | (fill) |
| Bilingual coverage | EN + zh-TW for all new strings | (fill) | (fill) |
| Lockstep parity | RR + Generic identical (sentinel grep) | (fill) | (fill) |
| Constitution VIII gate | 7/7 | (fill) | (fill) |
