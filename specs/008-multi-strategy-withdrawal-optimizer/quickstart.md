# Quickstart: Multi-Strategy Withdrawal Optimizer

**Audience**: the engineer implementing this feature (or auditing it later).
**Assumes**: the feature branch `008-multi-strategy-withdrawal-optimizer` is checked out and `plan.md`, `research.md`, `data-model.md`, `contracts/*.contract.md` have been read.

---

## Run the dashboards locally

Both ports are different from the canonical 8000 (which you might have other tools on):

```bash
# Windows — RR dashboard on 8765
start-local.cmd
# → http://localhost:8765/FIRE-Dashboard.html

# Windows — Generic dashboard on 8766
start-local-generic.cmd
# → http://localhost:8766/FIRE-Dashboard-Generic.html
```

Non-Windows:

```bash
python -m http.server 8765
# visit http://localhost:8765/FIRE-Dashboard-Generic.html
```

---

## Develop loop

1. **Edit BOTH files in lockstep** (Principle I). Any change to `FIRE-Dashboard.html` that's not personal-content-only MUST land in `FIRE-Dashboard-Generic.html` in the same commit.

2. **Run unit tests** — fast feedback on the strategies module:

   ```bash
   node --test tests/unit/strategies.test.js
   ```

3. **Run full test suite** before opening a PR:

   ```bash
   node --test tests/unit/*.test.js tests/baseline/*.test.js
   ```

   All 95 existing tests + new strategies tests MUST pass.

4. **Hard-refresh the browser** after edits. HTML doesn't hot-reload — use Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac), or keep DevTools open with "Disable cache" checked.

5. **Manual check**: open each dashboard, toggle the objective selector, click "Compare other strategies", click a non-winner row, verify the sidebar + KPI + both charts update, click "Restore auto-selected winner", confirm snap-back.

---

## What "done" looks like

Each of the following MUST be true before marking the feature complete:

- [ ] All seven `StrategyPolicy` instances declared and named in the Consumers-list of `strategies`.
- [ ] `scoreAndRank(inp, fireAge, mode, objective)` returns a fully-populated `Ranking` for all three canonical fixtures (young-saver, three-phase-retiree, coast-fire-edge).
- [ ] `rankByObjective` is a pure sort — no simulation triggered on objective toggle.
- [ ] `chartState.previewStrategyId` is session-scoped, cleared on recalc, and drives all four chart surfaces coherently.
- [ ] Caveat captions gated by the displayed strategy's `caveatFlags` — Conventional strategy shows no bracket-fill banner; Roth-Ladder shows no IRMAA message unless RMD years breach.
- [ ] All 36 new i18n keys present in `TRANSLATIONS.en` AND `TRANSLATIONS.zh` in BOTH HTML files, and added to `FIRE-Dashboard Translation Catalog.md`.
- [ ] Chart ↔ Module comment annotations updated per `contracts/chart-dependencies.contract.md`.
- [ ] Browser-smoke test `Principle VI — strategies module consumer/upstream symmetry` passes.
- [ ] Perf test: `scoreAndRank` mean runtime < 150 ms over 10 runs on the reference scenario.
- [ ] Full recalc wall-clock stays under 250 ms (measured via `console.time` in a dev-only probe).
- [ ] `FIRE-Dashboard-Roadmap.md` updated to mark the feature as shipped + link to this folder.

---

## File layout after implementation

No new top-level files. Changes are additive inside the existing HTML files + new tests + fixtures.

```
FIRE-Dashboard.html                              # +~800 lines (strategies block + UI + i18n)
FIRE-Dashboard-Generic.html                      # +~800 lines (identical to RR mod)
FIRE-Dashboard Translation Catalog.md            # +~40 lines (new keys)
FIRE-Dashboard-Roadmap.md                        # +~15 lines (feature entry)
tests/unit/strategies.test.js                    # NEW
tests/fixtures/strategies/
  young-saver.json                               # NEW
  three-phase-retiree.json                       # NEW
  coast-fire-edge.json                           # NEW
  expected/*.json                                # NEW (per scenario × strategy)
tests/baseline/browser-smoke.test.js             # +~20 lines (Principle VI symmetry check)
```

---

## Debugging tips

- **Winner looks wrong?** Check `ranking.rows[0]` and the per-row `lifetimeFederalTaxReal` / `endOfPlanNetWorthReal` values. Add `console.log(ranking)` inside a one-shot dev probe.
- **Preview doesn't propagate?** Check `chartState.onChange` listeners are registered for all five renderers. Missing listener = missing update.
- **Perf > 250 ms?** Profile `scoreAndRank` with DevTools Performance tab. Usually a strategy's `computePerYearMix` is doing something non-O(1). Compare against `bracket-fill-smoothed` (known-fast baseline).
- **i18n missing on cold load?** The `switchLanguage` call-on-load fix from earlier in this conversation MUST already be in place. Confirm `data-i18n-html` elements populate on first paint without requiring the language toggle.
- **Fixture mismatch?** The fixture tolerance is $100 for lifetime tax and $10 for end-balance — if you're off by more, the algorithm drifted, not the fixture.

---

## Completion criteria reference

Success criteria from spec.md (re-stated for convenience):

| Criterion | How to verify |
|---|---|
| SC-001 — different winners under two objectives in ≥ 80 % of test scenarios | `tests/unit/strategies.test.js` runs 10 varied fixtures, asserts mismatch rate |
| SC-002 — "leave-more-behind" winner ≥ 3 % better end-balance than old single-strategy result in 50 % of scenarios | same test file, parity comparison fixture |
| SC-003 — "retire-sooner-pay-less-tax" winner ≥ 5 % less lifetime tax than old result in 50 % of scenarios | same file |
| SC-005 — collapse-panel expansion renders in < 500 ms | Browser smoke test with perf timing |
| SC-006 — full recalc < 250 ms | dev-only `console.time` wrap in `recalcAll` |
| SC-007 — all existing + new tests pass | CI pipeline (Node `--test`) |
