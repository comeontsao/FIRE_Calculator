# Quickstart / Verification: Year Tax Estimator

## Run the calc unit tests

```bash
node --test tests/unit/taxEstimator.test.js
# or the project's existing runner:
npm test            # full unit suite (must stay green)
```

Expect the 7 edge-case fixtures + the 9 behavioral guarantees to pass.

## Global-scope collision guard

```bash
node --test tests/unit/globalScopeCollision.test.js
```

Must still pass after `calc/taxEstimator.js` is added to the browser-loaded script list
(unique global `estimateYearTax`, unique UMD const `_taxEstimatorApi`).

## Browser smoke (RR — the only file with the UI)

1. Open `FIRE-Dashboard.html` via `file://` (double-click) AND via `python -m http.server`.
2. Go to **Withdrawal Strategy** tab; scroll to the bottom → **Year Tax Estimator** block.
3. Confirm on cold load: a year is pre-selected, inputs are populated (not blank/NaN), both
   breakdown cards render, and the four signal chips show. The persistent "does not sync with
   the Lifecycle chart" caption is visible.
4. **Year picker:** change the year → all inputs repopulate with that year's nominal numbers.
5. **Edit + recompute:** raise "Traditional 401k/IRA withdrawal" → ordinary tax, room-left,
   and marginal chips update live.
6. **Reset:** press Reset → inputs return to the auto-pulled values for the selected year.
7. **No write-back:** note the Lifecycle chart's "end balance" / lifetime-tax figures, make
   several estimator edits, return to the Lifecycle chart → figures UNCHANGED. (SC-004)
8. **Tooltips:** hover every ⓘ icon → plain-English explanation appears (EN). Toggle 中文 →
   labels/tooltips/breakdown flip to zh-TW. (Principle VII)
9. **DevTools console:** zero red errors, zero `[<shim>] canonical threw:` messages.

## Automated console probe (CLI)

```bash
node tools/console-probe.mjs "<abs path>/FIRE-Dashboard.html"
node tools/console-probe.mjs "<abs path>/FIRE-Dashboard-Generic.html"   # confirm script loads, no errors, no UI block
```

## Generic regression

Open `FIRE-Dashboard-Generic.html` → confirm it is UNCHANGED except that
`calc/taxEstimator.js` loads without error and the placeholder divergence comment exists at
the Withdrawal Strategy location. No estimator UI in Generic.

## E2E

```bash
npm run test:e2e      # FULL suite must be green (CLAUDE.md gate), not just the new spec
```

New spec `year-tax-estimator.spec.*` asserts: block renders, year-pick repopulates,
edit-then-Reset round-trips, and Lifecycle KPI unchanged after edits.

## Done-when

- [ ] `calc/taxEstimator.js` unit tests + collision guard green
- [ ] RR browser smoke (file:// AND http) all 9 steps pass
- [ ] Generic regression: script loads, no UI, no console errors
- [ ] Full Playwright suite green
- [ ] EN + zh-TW present for every new string; Translation Catalog updated
- [ ] No "real $" in any user-facing copy; "dollars/gains/tax owed" used
- [ ] `FIRE-Dashboard-Roadmap.md` marks feature 034
