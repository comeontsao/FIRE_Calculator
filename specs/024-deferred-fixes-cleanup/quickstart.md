# Feature 024 — Browser Smoke Quickstart (User Gate)

**Feature**: Deferred Fixes Cleanup
**Branch**: `024-deferred-fixes-cleanup`
**Purpose**: Manual smoke checklist before merge to `main`. Run after all 9 implementation phases complete and CLI tests pass.

---

## Prerequisites

- All `node --test tests/**/*.test.js` passing (target: ≥515 tests, was 501 baseline + ~13 net new).
- Audit harness reports total findings: 0 LOW (down from 1 LOW post-023).
- Both HTMLs lockstep-verified by sentinel grep.
- Branch tip is `024-deferred-fixes-cleanup` HEAD.

## 6-step checklist

### Step 1 — Cold load + console silence

1. Open `FIRE-Dashboard.html` in Chrome via `file://` (double-click).
2. Wait 2 seconds for cold render.
3. Open DevTools console.
4. **Pass**: zero red errors. No `[ssCOLA]` errors. No NaN renders on healthcare cards.
5. Repeat for `FIRE-Dashboard-Generic.html`.

### Step 2 — SS COLA slider behavior (US4 / B-023-5)

1. Click Investment tab → INVESTMENT & SAVINGS card.
2. Locate "SS COLA Rate" slider (new) — should default to current Inflation Rate value.
3. Click 中文 toggle; verify the slider label shows "社安福利調整率" or equivalent.
4. Toggle back to EN.
5. Switch to Retirement tab → Withdrawal Strategy.
6. Note the SS bars (blue) growth pattern. Capture the bar height at age 70 and age 100.
7. Set "SS COLA Rate" slider to 2.5% (with Inflation Rate at 3%).
8. **Pass**: SS bars (blue) at age 100 grow noticeably less than the inflation-coupled baseline. Specifically: post-fix age-100 SS Book Value should be ~13% lower than the baseline (= `1.03^30 / 1.025^30 - 1` ≈ 13%).
9. Reset SS COLA back to match inflation; bars should match the original chart.

### Step 3 — Healthcare cards Book Value (US3 / B-022-3)

1. Click Geography tab → Country Chart sub-tab → US scenario card.
2. Verify each card displays "Pre-65 cost" and "Post-65 cost" with values in **Book Value** frame at the phase midpoint age.
3. Quick math check: US pre-65 cost in real-$ ≈ $14,400; with currentAge=42 and inflation=3%, pre-65 midpoint is age 53.5 (= 11.5 years from now); 1.03^11.5 ≈ 1.405; so displayed value should be ≈ $20,200 ± rounding.
4. Toggle to 中文; verify card frame suffix renders ("帳面價值" or equivalent).

### Step 4 — Audit cross-validation 'expected' flag (US5 / B-023-6)

1. Click Audit tab → scroll to Cross-Validation section.
2. **Pass for feasible scenarios**: any `endBalance-mismatch` warning shows the `expected: true` flag (if delta is < 1% of total). Visual de-emphasis applies (reduced opacity).
3. **Pass for tight DWZ scenarios**: switch to DWZ mode; if a divergence still appears, verify it's < 1% (post-fix) OR `expected: false` with delta ≥ 1% (genuine bug — escalate).

### Step 5 — Strategy ranker stability under perturbation (US1 / B-022-1)

1. Note the current strategy ranker winner.
2. Open Audit tab → E3 invariant section (or run audit harness).
3. **Pass**: zero E3 LOW findings reported. The previous `RR-pessimistic-frugal` finding is cleared.

### Step 6 — `scenario.tax.china` deduplication (US2 / B-022-2)

1. Geography tab → China scenario.
2. Verify the tax note displays in EN (when EN selected) and zh-TW (when 中文 selected).
3. Switch language and re-verify the note text changes correctly.
4. **Pass**: no duplicate keys in either HTML (sentinel grep confirms).

---

## Failure escalation

If any step fails:

1. Capture screenshot of the failing chart/console state.
2. Save the Copy Debug JSON.
3. File a follow-up note in `BACKLOG.md` (B-024-*) and pause merge.

## Sign-off

Once all 6 steps PASS:

```bash
git checkout main && git pull origin main
git merge --no-ff 024-deferred-fixes-cleanup \
  -m "Merge feature 024-deferred-fixes-cleanup: B-022-1 + B-022-2 + B-022-3 + B-023-5 + B-023-6 + 023 docs catch-up"
git push origin main
git push origin --delete 024-deferred-fixes-cleanup  # optional remote cleanup
git branch -d 024-deferred-fixes-cleanup
```

## Pre-merge gate matrix

| Gate | Target | Actual | Pass? |
|---|---|---|---|
| Tests passing | ≥515 / ≥515 | (fill at closeout) | (fill) |
| Audit findings | 0 LOW | (fill) | (fill) |
| Strategy E3 stability | 0 findings | (fill) | (fill) |
| Sim mismatch annotation | 100% < 1% delta auto-expected | (fill) | (fill) |
| Lockstep parity | RR + Generic identical (sentinel grep) | (fill) | (fill) |
| Bilingual coverage | EN + zh-TW for all new strings | (fill) | (fill) |
| Constitution VIII gate | 7/7 | (fill) | (fill) |
