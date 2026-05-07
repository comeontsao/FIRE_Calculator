# Quickstart — 027

How to reproduce the strategy locally and verify the SC-001 acceptance numbers.

---

## Prerequisites

- Node 18+ (`tests/unit/aggressiveBracketFill.test.js` uses `node --test`).
- Modern desktop browser for the manual smoke + Playwright spec.
- Branch `027-aggressive-bracket-fill` checked out.

---

## Verify the calc-layer change

Once `tests/unit/aggressiveBracketFill.test.js` ships (Phase 2 task):

```bash
node --test tests/unit/aggressiveBracketFill.test.js
```

Expected output: all test cases pass, including:
- `SC-026-A pin` — lifetime tax ∈ [$110.7K, $122.3K], terminal BV ∈ [$1.073M, $1.186M] (both real-$).
- `Backward compat` — existing 7 strategies' fixtures unchanged.
- `Pre-unlock blocks aggressive` — wTrad = 0 at age 55.
- `Post-SS reverts to smoothed` — wTrad ≪ bracketHeadroom at age 70.
- `Spending floor pass intact` — shortfall flag fires correctly when pools insufficient.

---

## Verify the Strategy Matrix regression

```bash
node --test tests/unit/strategyMatrix.test.js
```

Expected: starvation-locus scenario passes for ALL 8 strategies (the existing 7 + new aggressive). Per Constitution VIII, aggressive must close the spending shortfall to < $100 at the canonical fixture (`pTrad=$325k, pRoth=0, pStocks=0, pCash=0, ssIncome=0, age=65, grossSpend=$60100`).

---

## Verify Mode/Objective orthogonality

```bash
node --test tests/unit/modeObjectiveOrthogonality.test.js
```

Expected: aggressive participates in all 6 (Mode × Objective) cells, sort-key chain unchanged, no flicker on consecutive recalc.

---

## Verify the chart UI

1. Open `FIRE-Dashboard.html` in a browser. Wait 2 seconds for cold load.
2. Navigate to **Retirement → Withdrawal Strategy**.
3. Confirm **"Aggressive Bracket-Fill"** appears in the strategy registry / dropdown / card list.
4. Select it (or set objective to "Pay less lifetime tax" and let the ranker auto-pick it).
5. Hover age 60: tooltip should show `Trad 401K draw (taxed)` ≈ $50-60K + `Trad: Bracket-fill excess` ≈ $50-60K, totaling ~$118K. Effective tax rate ~9%.
6. Hover age 65: similar values; pTrad balance shrinking each year.
7. Hover age 68: pTrad approaches $0; chart's red+purple bars disappear.
8. Hover age 70: SS bar (blue) appears; small Trad bar appears (smoothed cap re-applied).
9. Compare side-by-side with **"Bracket-Fill (Smoothed)"** — visual delta in years 60-69 must be unmistakable.

Repeat all of the above for `FIRE-Dashboard-Generic.html` (Constitution I lockstep) and toggle EN ↔ 中文 to verify Constitution VII bilingual.

---

## Verify with Playwright (automated)

```bash
npx playwright test tests/e2e/aggressive-bracket-fill.spec.ts
```

Expected: spec loads each HTML file in each language, selects the new strategy, scrapes the chart bars + tooltip values, asserts the SC-001 ranges hold within ±5%.

---

## Verify the audit panel

1. Navigate to **Audit → Strategy Ranking**.
2. Confirm 8 rows visible: bracket-fill-smoothed, **aggressive-bracket-fill**, trad-first, roth-ladder, trad-last-preserve, conventional, tax-optimized-search, proportional.
3. Each row should show: endBalance, lifetimeFederalTax, violations, hasShortfall, feasibleUnderCurrentMode.
4. With objective = "Pay less lifetime tax" + Safe mode, the winner row (highlighted) should be `aggressive-bracket-fill` for SC-026-A.

---

## Reset / regression

If anything looks off, reset to the merged 026 baseline:

```bash
git checkout main && node --test tests/unit/
```

Should still pass (565 tests, 564 pass + 1 skip), confirming the `disableSmoothingCap` extension is genuinely backwards-compatible when not set.

---

## Troubleshooting

- **Chart shows no red Trad bars in 60-69:** the new strategy isn't selected, OR the registry entry's `computePerYearMix` isn't passing `disableSmoothingCap: true`.
- **Strategy Ranking shows 7 rows instead of 8:** the new entry wasn't added to `STRATEGIES` array, OR the array's `Object.freeze()` wasn't re-frozen with the new entry.
- **Aggressive lifetime tax > $122K:** the no-cap path isn't running. Check `caveats.aggressiveActive` flag in the per-year output — should be `true` for ages 60-69 in SC-026-A.
- **Untranslated EN strings under zh-TW:** Constitution VII violation. Translation keys missing from `TRANSLATIONS.zh` in one or both HTMLs.
- **Existing 7 strategies' numbers shifted:** backwards compat broken. Step 2 implementation is treating absent `disableSmoothingCap` as `true`. Fix the gate to `!!opts.disableSmoothingCap`.
