# Quickstart — 026

How to reproduce the three issues, run the diagnostic harnesses, and verify the fixes.

---

## Prerequisites

- Node 18+ for unit tests + diagnostic harness.
- A modern desktop browser (Chrome / Edge / Firefox / Safari) for browser smoke.
- This branch checked out: `git checkout 026-withdrawal-tax-and-ui-fixes`.

---

## Reproduce US1 — verdict pill stuck at "1 months"

1. Open `FIRE-Dashboard.html` (the RR file) in a browser. Wait 2 seconds for full render.
2. Locate the verdict pill at the top — it reads `🔥 On Track — FIRE in N years M months (age K) · X% there`.
3. Slowly drag the **monthly savings** input (Plan tab) from $2,000 → $14,000 in $500 increments. Note the displayed `M` value at each position.
4. **Expected (post-fix):** `M` takes on at least 4 distinct values across the sweep.
5. **Actual (pre-fix):** `M` stays at `1` for almost every position.

Repeat for `FIRE-Dashboard-Generic.html` to confirm the bug exists in both files (Constitution I lockstep).

### Run the Node sweep diagnostic (FR-001)

Once `tests/diagnostics/us1-sweep.js` exists (Phase 2 task):

```bash
node tests/diagnostics/us1-sweep.js
```

Output: a table of `{monthlySaving, years, months, totalMonths, searchMethod}`. Use this table to triangulate which layer (resolver / simulator / verdict-wiring / staleness) is producing the stuck value. See `research.md` Section 1 hypotheses table.

---

## Reproduce US2 — withdrawal-strategy tax cliff at age 69

1. Open `FIRE-Dashboard.html`.
2. Set FIRE age = 53, mode = Die-With-Zero, withdraw strategy = "Leave more behind".
3. Open the **Retirement → Withdrawal Strategy** tab.
4. Hover age 69 in the chart. Tooltip shows `Trad 401k draw (taxed) ≈ $269K`, `Tax owed ≈ $7.1K (7.6% effective)` — while ages 60–68 show 0% tax.
5. The cliff is the trigger for the US2 investigation — confirmed reproducible.

### Run the SC-026-A counterfactual study

Once `tests/fixtures/sc026a-counterfactual.js` and the harness exist (Phase 2 task):

```bash
node tests/diagnostics/us2-counterfactual.js > /tmp/sc026a-output.txt
```

Output: per-year tables (current + counterfactual), delta tables, sensitivity sweep, constraint-breach audit. Pasted into `research.md` Section 2.

---

## Reproduce US3 — header oversized at non-100% zoom

1. Open `FIRE-Dashboard.html`.
2. Set browser zoom to 125% (Ctrl + once on Windows; Cmd + on macOS).
3. Observe: title wraps to 2 lines, verdict pill wraps below, first KPI row pushed below the fold.
4. Set browser zoom to 150%. Worse: header occupies ~50% of viewport height.
5. Repeat for `FIRE-Dashboard-Generic.html` and for zh-TW (toggle 中文 first).

### Verify the fix (FR-010)

After the CSS change lands:

1. Reload the page at 75% / 100% / 125% / 150% zoom.
2. Confirm `#siteHeader.getBoundingClientRect().height` per the bounds in `contracts/header-layout.contract.md` visual-contract table.
3. Confirm no element overlap (visually + via the Playwright matrix below).

---

## Verify all three fixes

### Unit tests

```bash
node --test tests/unit/monthPrecisionResolver.test.js   # existing — must not regress
node --test tests/unit/fireAgeResolverSweep.test.js     # NEW — US1 regression guard
```

### E2E tests

```bash
npx playwright test tests/e2e/verdict-pill-sweep.spec.js     # NEW — US1
npx playwright test tests/e2e/header-zoom-matrix.spec.js     # NEW — US3
```

### Manual browser smoke (REQUIRED gate per CLAUDE.md)

For each of the four scenarios — load page → confirm clean render → exercise:

1. Both HTML files in EN.
2. Both HTML files in zh-TW.
3. Sweep monthly savings in 10 steps; confirm verdict-pill months value takes ≥ 3 distinct values across the sweep (US1).
4. Step zoom 75 → 100 → 125 → 150%; confirm header bounds per `contracts/header-layout.contract.md` (US3).
5. Confirm zero red errors in DevTools console.

### Read the research deliverable

```bash
cat specs/026-withdrawal-tax-and-ui-fixes/research.md
```

Confirm Section 2 has all six required subsections (fixture / current / counterfactual / deltas / sensitivity / recommendation) per `contracts/withdrawal-counterfactual.contract.md`.

---

## Troubleshooting

- **Sweep test passes locally but verdict pill is still stuck in browser:** the bug is likely Hypothesis B (in-HTML simulator pro-rate) or Hypothesis D (snapshot staleness). The Node sweep won't catch these — only the Playwright spec does. Run that next.
- **CSS fix breaks the 100% zoom snapshot:** SC-008 violation. Re-tune the `clamp()` ranges so the 100% values match the pre-fix layout within ±2px.
- **zh-TW header overflows where EN doesn't:** widen the `clamp()` lower bound on title font-size, or let the title wrap one line earlier in zh-TW. Don't shrink the EN target.
