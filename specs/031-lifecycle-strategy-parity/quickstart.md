# Quickstart / Browser Smoke: Feature 031 — Lifecycle Strategy Parity

Manual verification gate (Manager-executed before merge, per CLAUDE.md "browser smoke before done").
Run against BOTH `FIRE-Dashboard.html` (RR) and `FIRE-Dashboard-Generic.html` (Generic).

## Setup
1. Open the dashboard in a real browser (double-click for `file://`, or via `python -m http.server`).
2. Wait ~2s for cold load. Open DevTools console.

## Core checks

### 1. Lifecycle matches the displayed winner (FR-001/002) — the headline fix
- Set Mode = **Exact**, Objective = **Leave more behind** (the scenario from the bug report).
- Open Retirement → **Withdrawal Strategy**; note the age at which Trad 401K draws begin (~60) and roughly the draw size.
- Switch to Retirement → **Lifecycle**. **PASS**: the green Trad 401K balance line now declines from ~60 (consistent with the winner's draws), NOT climbing to ~72.
- **Regression guard**: switch to a scenario/Objective where bracket-fill wins — the Lifecycle chart looks as it did before.

### 2. No manual-toggle dependency (SC-001)
- Do a fresh recalc (change any input and revert, or reload). **PASS**: the Lifecycle chart shows the winner's trajectory immediately — you should NOT have to click an Objective button to "fix" it.

### 3. Drag keeps surfaces in sync (FR-003/SC-003)
- On the Lifecycle chart, drag the FIRE marker to several ages. **PASS**: at each previewed age, the Lifecycle Trad trajectory, the Withdrawal Strategy bars, and the verdict pill reflect the same strategy. Release and confirm the committed render also matches.

### 4. Verdict judged on the displayed winner (FR-004) — gatekeeper integrity
- For each Mode (Safe / Exact / DWZ), confirm the verdict pill's feasibility + FIRE age correspond to the strategy actually drawn (not a different one). **PASS**: verdict and chart never tell different stories.

### 5. Tooltip reconciles (FR-005/SC-004)
- Hover a retirement-year bar on the Withdrawal Strategy chart. **PASS**: the per-pool draw lines sum to the displayed total within rounding; the purchasing-power figure is labeled as a comparison. Toggle EN ↔ 中文 and confirm the label translates.

### 6. Cash-sweep parity (FR-006)
- Enable cash-sweep (Plan → Investment). **PASS**: no console errors; the Lifecycle and other charts stay consistent. Disable (default) → behavior unchanged.

### 7. Console hygiene
- **PASS**: zero red errors; zero `[<shim-name>] canonical threw:` messages; every KPI card shows a numeric value (no "Calculating…", NaN, $0, or "40+").

## Automated (run before smoke)
```
npm run test:unit
```
Expected: all unit tests pass (baseline + new lifecycle-vs-withdrawal parity tests + updated fixtures);
`strategyMatrix`, `spendingFloorPass`, `modeObjectiveOrthogonality`, `cashSweep*`, and `calcAudit`
suites green.

## Lockstep
Repeat all checks on the OTHER dashboard file. RR and Generic must behave identically on every check.
