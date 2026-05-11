# Quickstart: Feature 030 Verification

**Feature**: 030-cash-sweep-stocks
**Audience**: User-side verification at merge gate (manual browser smoke test)

## Repro fixture (RR canonical)

Inputs (default RR dashboard, no edits needed):

- Roger age: 42, Rebecca age: 42
- Cash savings: $80,000 (initial)
- Stocks: $465K (Roger $235K + Rebecca $230K)
- Inflation: 4%, Stock return: 7%, 401K return: 7%
- All other defaults

## Pre-feature observations (current `main` — toggle does not exist yet)

1. Open `FIRE-Dashboard.html`.
2. Switch to **Retirement → Lifecycle** tab.
3. Hover age 100 on the chart.
4. Tooltip shows: Cash ≈ **$110K** (Book Value) — equivalent to ~$354K real.

This is the unrealistic monotonic-cash-growth pattern the feature addresses.

## Post-feature expected behavior (this feature)

After feature 030 lands and you flip the new toggle:

### Default state (toggle OFF — should match pre-feature)

1. Reload page. Find the new toggle in **Plan → Investment** section: "Sweep excess cash into stocks each year". Confirm checkbox is unchecked by default.
2. Hover age 100 on Lifecycle chart → Cash still ≈ $110K (Book Value). Byte-identical to pre-feature.
3. Open Audit tab → Confirm `crossValidationWarnings` contains zero `simulator-cash-sweep-parity` entries.

### Toggle ON, default $10K threshold

1. Click the toggle. Confirm the "Cash floor to keep" input becomes visible, pre-filled with `$10,000`.
2. Dashboard recalcs automatically.
3. Hover age 0 / Roger 42 on Lifecycle chart → Cash = **$80K real** (= `inp.cashSavings`, preserved per clarification).
4. Hover age 43 (one year into accumulation) → Cash has dropped or stayed near threshold — depends on year-1 spending + sweep interaction.
5. Hover age 100 → Cash ≈ **$10K real** (purchasing power) — was $354K real pre-toggle. Stocks at age 100 visibly higher than pre-toggle (the swept dollars compounded into the stock pool).
6. Open Audit tab → `crossValidationWarnings` still contains zero `simulator-cash-sweep-parity` entries (all simulators agree post-sweep).

### Adjust threshold (e.g., to $50K)

1. Change "Cash floor to keep" from $10,000 to $50,000.
2. Lifecycle chart re-renders within one recalc cycle.
3. Hover age 100 → Cash ≈ **$50K real**. Stocks slightly lower than the $10K-threshold case (less cash got swept).

### Threshold = $0 (sweep everything)

1. Change threshold to $0.
2. Hover age 100 → Cash ≈ **$0**. Stocks maximally higher.
3. No NaN, no chart-rendering errors.

### Threshold = $10,000,000 (effectively disabled)

1. Change threshold to $10,000,000.
2. Hover age 100 → Cash ≈ $354K real (pre-toggle value). Behavior matches toggle-OFF numerically.

### Negative threshold (UI validation)

1. Try to enter -1000 into the threshold input.
2. Either (a) UI rejects via `min="0"` attribute (browser-native), OR (b) input accepts but `getInputs()` clamps to 0. Either is acceptable per FR-002.

### Language toggle

1. With sweep ON at default threshold, click **中文** in the language switcher.
2. Toggle label, threshold input label, and info-tip text all translate.
3. Toggle state and threshold value persist across the language switch.
4. Click **EN** to return; labels revert to English.

### Reload persistence

1. With sweep ON at $50K threshold, reload the page.
2. Toggle remains ON; threshold remains $50K (persisted via `localStorage`).

## Smoke checklist (merge gate)

Per CLAUDE.md "Browser smoke before claiming a feature done":

- [ ] Open `FIRE-Dashboard.html` in real browser. Wait 2s cold load. All KPI cards numeric.
- [ ] DevTools console: zero red errors, zero `[<shim-name>] canonical threw:` messages.
- [ ] Plan → Investment → confirm new toggle visible, unchecked by default.
- [ ] Flip toggle ON. Threshold input becomes visible, defaults to `$10,000`.
- [ ] Lifecycle tab → hover age 0 / Roger 42 → cash = `$80K real` (starting cash preserved).
- [ ] Hover age 100 → cash ≈ `$10K real`. Stocks at age 100 visibly higher than pre-toggle.
- [ ] Change threshold to $50K → cash at age 100 ≈ `$50K real`.
- [ ] Change threshold to $0 → cash at age 100 ≈ `$0`. No NaN.
- [ ] Audit tab → `crossValidationWarnings` array contains zero `simulator-cash-sweep-parity` entries.
- [ ] Switch language EN ↔ 中文 → labels translate, state persists.
- [ ] Reload page → toggle state and threshold value persist via `localStorage`.
- [ ] Flip toggle OFF → confirm chart returns to pre-toggle behavior (Cash at age 100 ≈ $354K real).
- [ ] Repeat all above for `FIRE-Dashboard-Generic.html` (Generic).

## Negative cases (must NOT regress)

- With toggle OFF (default state), `FIRE-snapshots.csv` history rows remain reproducible (existing user numbers don't shift).
- With toggle OFF, strategy ranker winner and end-balance for each strategy match pre-feature values.
- With toggle ON but threshold extremely high ($10M+), end-of-life cash matches toggle-OFF value (sweep effectively disabled).

## What this proves

- The visible bug pattern (monotonic cash growth across decades) is closed when the user opts in.
- Existing users with saved snapshots are protected: toggle defaults OFF → zero numerical change.
- All 6 simulators agree on the post-sweep state: audit invariant returns silent.
- UI is bilingual and persists user preference.
- Edge cases ($0 floor, very-high floor, negative input) handled gracefully.
