# `tests/baseline/` — Inline-engine regression oracle

This directory contains a **Node-runnable faithful port** of the FIRE
Calculator's inline (browser-dashboard) engine. Its purpose: capture the
pre-refactor output of the inline math for canonical input sets so that
US2b's canonical-engine extraction has a locked-down oracle to measure
against.

## Files

| File | Purpose |
|---|---|
| `inline-harness.mjs` | The extracted engine. Port of `signedLifecycleEndBalance` + `findFireAgeNumerical` + all transitive helpers from `FIRE-Dashboard.html` / `FIRE-Dashboard-Generic.html`. Pure JS, no DOM, no deps. |
| `inputs-rr.mjs` | Canonical RR input set matching `baseline-rr-inline.md §A`. |
| `inputs-generic.mjs` | Canonical Generic input set matching `baseline-rr-inline.md §B`. |
| `run-and-report.mjs` | CLI script that runs the harness on both fixtures under all three modes and prints a report. |
| `inline-harness.test.js` | Self-regression test — locks the harness's output against extraction-time constants. |

## Usage

```bash
# Print the baseline report
node tests/baseline/run-and-report.mjs

# Run the regression test (also runs via the main test runner)
node --test tests/baseline/inline-harness.test.js

# Full test suite (includes this)
bash tests/runner.sh
```

## Design notes

1. **Faithful port, not a corrected engine.** The harness REPLICATES inline
   behavior exactly, including the known audit bugs documented in
   `baseline-rr-inline.md §C` (real/nominal mixing, silent shortfall
   absorption via negative pools, etc.). These are deliberate — the harness
   is the baseline against which canonical-engine corrections are measured.

2. **Deterministic.** The harness reads no DOM, no `new Date()`, no globals.
   The two canonical fixtures (`inputs-rr.mjs`, `inputs-generic.mjs`) pin
   every value the inline engine would otherwise read from the browser:
   `currentYear`, `currentAgePrimaryCalendar`, `selectedScenario`,
   `ssEarningsHistory`, etc.

3. **Solver-only scope.** The harness ports the subset of the inline engine
   that produces the five baseline KPIs (`fireAge`, `yearsToFire`,
   `balanceAtUnlockReal`, `balanceAtSSReal`, `endBalanceReal`). It does NOT
   port `projectFullLifecycle` (the per-year chart-rendering simulator) —
   those outputs are not needed for the baseline set and would double the
   surface area. If a future US2b task needs per-year lifecycle records as
   an oracle, extend `inline-harness.mjs` then.

4. **Zero-dep.** No `package.json`, no `node_modules`, no bundler. Runs on
   Node 22+ with ES modules, using `node --test` for regression.

## Updating the baseline

If the inline engine in `FIRE-Dashboard.html` or `FIRE-Dashboard-Generic.html`
is modified (rare — US2b is extracting it OUT, not changing it), or if one
of the canonical inputs changes:

1. Update `inline-harness.mjs` / `inputs-*.mjs` to match.
2. Run `node tests/baseline/run-and-report.mjs` to capture fresh output.
3. Update the `EXPECTED_*` constants in `inline-harness.test.js`.
4. Update the observed tables in `specs/001-modular-calc-engine/baseline-rr-inline.md`.
5. Run `bash tests/runner.sh` — must be green.
6. Commit with a message documenting WHAT inline behavior changed and WHY.
