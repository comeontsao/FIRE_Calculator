# Quickstart — Implementing the Payoff vs Invest pill

**Feature**: 016-mortgage-payoff-vs-invest
**For**: the implementation engineer (whether the Manager dispatches a Backend + Frontend split or it's done by one engineer)
**Read this AFTER**: spec.md (problem statement) + plan.md (gates) + research.md (technical decisions) + the three contracts.

---

## Order of work (lowest-risk path)

1. **Calc module first** — `calc/payoffVsInvest.js`. Pure JS, classic-script wrapper, UMD export. No DOM, no Chart.js. Get it working against the unit tests in `tests/unit/payoffVsInvest.test.js` before anything else.
2. **Tab router** — add the new pill to `calc/tabRouter.js`'s `TABS` constant. Add a one-line test in `tests/unit/tabRouter.test.js` asserting the pill is in the list. Verify URL hash routing works.
3. **HTML scaffolding (lockstep both files)** — add the `<div class="pill-host" data-tab="plan" data-pill="payoff-invest">…</div>` block in both HTML files. Include all five input controls + the three canvases + the verdict banner + the factor-breakdown card. Mark it `hidden` so it doesn't auto-render.
4. **Translations (lockstep both files)** — drop every key from the i18n table in `payoffVsInvest-charts.contract.md` into both `TRANSLATIONS.en` and `TRANSLATIONS.zh`. Update `FIRE-Dashboard Translation Catalog.md`.
5. **`recomputePayoffVsInvest()` + renderers** — assemble inputs → call `computePayoffVsInvest(inputs)` → render all three charts + banner + breakdown. Hook each new input control's `oninput` to call `recomputePayoffVsInvest()` directly (NOT `recalcAll()`).
6. **Wire into `recalcAll()`** — single line at the bottom of `recalcAll()` to call `recomputePayoffVsInvest()` (so any change to the existing inputs that affects the comparison — mortgage rate, stocks return, inflation, FIRE age — re-flows into the new pill).
7. **`saveState` / `restoreState` extension** — add the `state._payoffVsInvest` block per the state contract.
8. **Browser smoke regression** — extend `tests/baseline/browser-smoke.test.js` with the snapshot-before / snapshot-after assertion (SC-004 proof).
9. **Manual browser smoke** — open both HTML files, navigate to Plan → Payoff vs Invest, verify each scenario in the spec's Edge Cases table, drag every slider, toggle 中文.

---

## Constitution gates to satisfy at PR time

Before merging, the PR description MUST confirm:

- [ ] Both HTML files modified in lockstep (Principle I).
- [ ] Calc module is pure (no DOM, no Chart.js, no globals beyond UMD attach) (Principle II).
- [ ] Calc module emits `subSteps[]` for audit-observability (Principle II v1.2.0 sub-requirement).
- [ ] Calc module ships as UMD-classic-script with NO `export` keyword (Principle V file-protocol rule).
- [ ] Three new chart renderers each declare `// Module: calc/payoffVsInvest.js (computePayoffVsInvest)` in their comment headers (Principle VI).
- [ ] All new user-visible strings landed in `TRANSLATIONS.en` AND `TRANSLATIONS.zh`, including chart legend labels and tooltip callbacks (Principle VII).
- [ ] Fixture-locked unit tests in `tests/unit/payoffVsInvest.test.js` cover the table in `payoffVsInvest-calc.contract.md` test contract (Principle IV).
- [ ] Browser smoke regression assertion added (SC-004 proof).
- [ ] No changes to `taxOptimizedWithdrawal`, `_drawByPoolOrder`, any strategy `computePerYearMix`, `rankByObjective`, `scoreAndRank`, or `getActiveSortKey` (Principles VIII / IX gate-skip evidence).

---

## Common pitfalls

- **Don't call `recalcAll()` from the pill's input handlers.** That triggers the full FIRE-projection pipeline and risks side effects on other charts. Always call `recomputePayoffVsInvest()` directly.
- **Don't mutate `inputs` inside the calc module.** Construct fresh output records. Mutating an input mid-call breaks determinism.
- **The effective-rate override is verdict-only.** The amortization schedule must use the nominal contractual rate. Re-read research.md R4 if you're tempted to short-circuit this.
- **The refi resets the amortization clock.** Don't carry forward the original term; the new schedule is `newTerm × 12` months at `newRate` from `refiYear` forward (research.md R5).
- **Crossover detection uses linear interpolation between two annual rows.** Don't try to month-step a root-finder for v1 (research.md R6).
- **The pill must work when mortgage is OFF.** Test that path early. Show the explainer card; do not render an empty Chart.js canvas (which produces console errors and wastes the user's attention).
- **`stockGainPct` defaults to 0.6.** The LTCG drag is `ltcgRate × stockGainPct` applied continuously to the real return rate. Don't apply the full LTCG rate.

---

## Verification recipe

After your code change is in:

```bash
# 1. Unit tests — calc module
node --test tests/unit/payoffVsInvest.test.js

# 2. Full unit suite — should stay green (currently 289 tests)
node --test tests/unit/*.test.js

# 3. Browser smoke regression
node tests/baseline/browser-smoke.test.js

# 4. Open both HTML files in a browser and walk the Edge Cases table from spec.md.
#    Specifically verify: mortgage off, mortgage paid off, planned refi visible
#    on the trajectory, override slider shifts the verdict, 中文 toggle.
```

If any of those four steps fails, do not merge.

---

## Out of scope reminders

The following are deliberately deferred to future features. Do NOT pull them into this PR:

- Monte Carlo / variance bands.
- Refi closing costs / no-cost-refi modeling.
- Federal mortgage interest deduction at IRS itemization level.
- 401K / Roth as the extra-money vehicle.
- HELOC / cash-out refinance.
- Refi-as-a-third-strategy (a third trajectory line). The planned refi we DO model is shared by both prepay and invest; the spec is explicit on this.
- Per-state tax-rate table (we use the single FR-021 effective-rate override slider instead).
- Snapshot CSV extension (the comparison is exploratory; it does not become a tracked dimension).
