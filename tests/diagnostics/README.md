# tests/diagnostics

Ad-hoc Node-runnable diagnostic scripts. **Not part of `node --test` runs** —
these are manual debugging tools invoked directly with `node tests/diagnostics/<file>.js`.

## Inventory

| Script | Feature | Purpose |
|--------|---------|---------|
| `us1-sweep.js` | 026 US1 | Probe `findEarliestFeasibleAge` across a monthly-savings sweep to diagnose the "always 1 months" verdict-pill pathology |
| `us2-counterfactual.js` | 026 US2 | Run the SC-026-A withdrawal-strategy counterfactual study (current "leave-more-behind" vs. "10%-bracket-smoothed") |
