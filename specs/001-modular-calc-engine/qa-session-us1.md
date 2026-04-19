# Manual Validation Session — Phase 3 (US1 MVP)

**Feature**: `001-modular-calc-engine`
**For**: The user (Roger)
**Expected runtime**: ~20 minutes
**Branch**: `001-modular-calc-engine` @ `d5a949e`
**What you're validating**: That dragging the FIRE marker, confirming the override, resetting, switching modes, and infeasibility all behave as designed — on both RR and Generic dashboards.

You don't need any tools beyond a modern browser (Chrome or Edge). Open DevTools whenever asked. For every step, tick the checkbox and jot anything weird in the NOTES column.

> **Heads-up before you start**: there is **one known MEDIUM concern** flagged in the static audit (`qa-audit-us1.md §7 R-A`): when you confirm an override to an unsustainable age, the infeasibility banner may NOT light up immediately because `setOverride` does not currently re-evaluate feasibility. It DOES re-evaluate when you switch solver mode. Session §9 covers both paths so you can confirm the gap and we can decide whether to patch it now or log it as a known limitation.

---

## §1 Preflight — both files load cleanly

Double-click `FIRE-Dashboard.html` (opens in your default browser). Open DevTools (F12). Repeat for `FIRE-Dashboard-Generic.html` in a second tab.

| # | Step | Expected | DevTools verify | Pass | Notes |
|---|---|---|---|---|---|
| 1.1 | RR loads | Dashboard renders within 1s | Console: no errors, no module-resolution failures | ☐ | |
| 1.2 | Generic loads | Same | Same | ☐ | |
| 1.3 | chartState singleton present | — | Console: `window.chartState` → returns object with `state`, `setOverride`, `setCalculated`, `clearOverride`, `revalidateFeasibilityAt`, `onChange` | ☐ | |
| 1.4 | State shape | — | Console: `window.chartState.state` → frozen object: `{ calculatedFireAge: N, overrideFireAge: null, effectiveFireAge: N, source: 'calculated', feasible: true }` | ☐ | |
| 1.5 | Repeat on Generic | Same singleton + same shape | | ☐ | |

**Blocker if any of these fail** — stop the session and route to Frontend Engineer.

---

## §2 Drag-affordance discoverability (FR-019)

Focus on the Full Portfolio Lifecycle chart (the big stacked growth chart).

| # | Step | Expected | Pass | Notes |
|---|---|---|---|---|
| 2.1 | Hover over the FIRE marker | Cursor becomes `grab` (open-hand) | ☐ | |
| 2.2 | Mouse down on marker (don't move yet) | Cursor becomes `grabbing` (closed-hand) | ☐ | |
| 2.3 | "drag me" hint visible near marker | Italic label positioned just below the marker | ☐ | |
| 2.4 | First page load of the session | Marker pulses subtly for ~3 seconds | ☐ | Clear `localStorage['fire:dragHintSeen']` in DevTools first if you've already dragged |
| 2.5 | After first successful drag→confirm | Hint opacity drops (~0.7 → ~0.3) | ☐ | Check later during §4 |

> **Verify**: in DevTools console, `localStorage.getItem('fire:dragHintSeen')` should be `null` before your first confirm and `'1'` after.

---

## §3 Drag preview-only behavior (US1 Scenario 1 — FR-014/FR-018)

**This is the core MVP behavior.** Do it SLOWLY so you can see the contrast.

| # | Step | Expected | Pass | Notes |
|---|---|---|---|---|
| 3.1 | Note current calculated age X and "Years to FIRE" KPI value | Write them in the NOTES column | ☐ | X = ____, Years = ____ |
| 3.2 | Slowly drag the marker from X to X − 3 | Growth chart's FIRE marker moves; preview band updates | ☐ | |
| 3.3 | While still dragging, look at Years to FIRE KPI | KPI value UNCHANGED from step 3.1 | ☐ | |
| 3.4 | Other charts (Roth Ladder / Drawdown / Timeline) | ALL UNCHANGED during drag | ☐ | |
| 3.5 | Release mouse | Confirm overlay appears near the marker with text "Recalculate for retirement at age X − 3?" | ☐ | |

> **Verify**: at step 3.3, in DevTools `window.chartState.state.source` should still be `'calculated'`. No chartState mutation until you click Recalculate.

---

## §4 Confirm flow (US1 Scenario 3)

| # | Step | Expected | Pass | Notes |
|---|---|---|---|---|
| 4.1 | Click the **Recalculate** button on the overlay | Overlay disappears | ☐ | |
| 4.2 | Every FIRE-age-dependent chart updates | Growth chart, Roth Ladder, Drawdown, Timeline, Coast-FIRE, Mortgage verdict all reflect age X − 3 | ☐ | Note any that do NOT update |
| 4.3 | KPIs update | Years to FIRE, FIRE Net Worth, Progress % all reflect X − 3 | ☐ | |
| 4.4 | Scenario cards / Healthcare delta update | Reflect X − 3 | ☐ | |
| 4.5 | Reset button becomes visible | Located near the lifecycle chart | ☐ | |
| 4.6 | DevTools check | `window.chartState.state` → `{ ..., overrideFireAge: X − 3, effectiveFireAge: X − 3, source: 'override' }` | ☐ | |

> **Note on ordering**: per `qa-audit-us1.md §7 R-C`, KPI card refresh is currently driven by `recalcAll()`, not by a dedicated chartState listener. You may see the growth chart update ~1 frame before KPIs. Not a bug — it's a documented deferred cleanup (US2/T048).

---

## §5 Cancel flow (US1 Scenario 4 — Edge Case E-4)

| # | Step | Expected | Pass | Notes |
|---|---|---|---|---|
| 5.1 | From the post-confirm state of §4, drag again to X − 5 | New confirm overlay appears | ☐ | |
| 5.2 | Click the `✕` cancel button | Overlay disappears; growth chart marker snaps back to X − 3 (the previous effective age) | ☐ | |
| 5.3 | DevTools check | `window.chartState.state.source === 'override'` (still X − 3, not X − 5) | ☐ | |
| 5.4 | Drag again, release, then press **Escape** | Overlay disappears; marker reverts | ☐ | |
| 5.5 | Drag once more; while overlay is visible, start a new drag | Old overlay hides; new drag proceeds (tests Edge Case E-10 single-overlay invariant) | ☐ | |

---

## §6 Reset flow (US1 Scenario 6 — FR-003)

With a confirmed override still active from §4:

| # | Step | Expected | Pass | Notes |
|---|---|---|---|---|
| 6.1 | Click the **Reset to calculated FIRE age** button | All charts/KPIs return to calculated age X | ☐ | |
| 6.2 | Reset button hides itself | `#overrideReset` no longer visible | ☐ | |
| 6.3 | DevTools check | `window.chartState.state.source === 'calculated'`, `overrideFireAge === null` | ☐ | |

---

## §7 Input-change wipes override (US1 Scenario 5 — FR-014 / SC-009)

| # | Step | Expected | Pass | Notes |
|---|---|---|---|---|
| 7.1 | Drag to X − 3, click Recalculate | Override active | ☐ | |
| 7.2 | Change any non-retirement input (e.g., annual spend by $500, or change return rate slider) | Override silently wipes; solver re-runs fresh | ☐ | |
| 7.3 | Reset button hides | Back to calculated-state UI | ☐ | |
| 7.4 | DevTools check | `window.chartState.state.source === 'calculated'` | ☐ | |

---

## §8 Mode-switch PRESERVES override (US1 Scenario 9 — THE NEW BEHAVIOR)

This is the behavior added in this phase that did not exist before.

| # | Step | Expected | Pass | Notes |
|---|---|---|---|---|
| 8.1 | Drag to X − 3, click Recalculate | Override active | ☐ | |
| 8.2 | Toggle solver mode: Safe → Exact | Every chart/KPI STAYS at X − 3. Reset button STAYS visible | ☐ | |
| 8.3 | Toggle again: Exact → Die-with-Zero | STAYS at X − 3 | ☐ | |
| 8.4 | DevTools check throughout | `window.chartState.state.source === 'override'` for all three modes. `overrideFireAge` stays at X − 3 | ☐ | |
| 8.5 | The infeasibility banner MAY appear / disappear as the mode changes the feasibility rules | That's expected — banner only tracks `feasible`, not the age | ☐ | Note whether banner toggled |
| 8.6 | Click Reset | NOW solver runs fresh under the current mode; new calculated age is displayed | ☐ | |

---

## §9 Infeasibility indicator (US1 Scenario 7 — FR-004)

> **This is the step flagged by `qa-audit-us1.md §7 R-A`. Please pay extra attention.**

| # | Step | Expected (per spec) | What might happen | Pass | Notes |
|---|---|---|---|---|---|
| 9.1 | Drag the marker to an age far below what portfolio can sustain (e.g., X − 15 or lower) | Preview shows the aggressive age | | ☐ | |
| 9.2 | Release, click Recalculate | Infeasibility banner **should** activate (red, "This retirement age is not sustainable under your current plan.") | Banner may NOT light up yet — the `setOverride` path doesn't re-evaluate feasibility (R-A gap) | ☐ | If banner visible: PASS. If not: note "R-A confirmed" |
| 9.3 | With override still active, toggle solver mode | Banner state now reflects feasibility under current mode (should activate under a tighter mode if 9.2 didn't trigger it) | Expected behavior — mode switch DOES re-evaluate feasibility | ☐ | |
| 9.4 | Click Reset | Banner clears | ☐ | |

**If step 9.2 fails but 9.3 succeeds, the R-A gap is confirmed.** That's a one-line code fix; route back to Frontend Engineer when you're ready.

---

## §10 Second drag before confirming (Edge Case E-10 / E-5)

Already partially covered in §5.5. Explicit check:

| # | Step | Expected | Pass | Notes |
|---|---|---|---|---|
| 10.1 | Ensure state is calculated (no override). Drag to X − 3, release — overlay appears | Overlay visible | ☐ | |
| 10.2 | DO NOT click Recalculate. Drag again to X − 5 | First overlay hides; preview updates during new drag; only ONE overlay is present at any time | ☐ | |
| 10.3 | Release second drag → new overlay for X − 5 | Overlay text reflects X − 5, not X − 3 | ☐ | |
| 10.4 | Confirm or cancel | Works as usual | ☐ | |

> **Verify**: `document.querySelectorAll('#overrideConfirm:not([hidden])')` should never return more than 1 element.

---

## §11 Parity between RR and Generic

Repeat **§3 through §10** on `FIRE-Dashboard-Generic.html`. Behavior should be visually and functionally identical except for the displayed personal data (Roger/Rebecca labels don't exist in Generic).

| # | Step | Pass | Notes |
|---|---|---|---|
| 11.1 | §3 drag preview-only — identical | ☐ | |
| 11.2 | §4 confirm flow — identical | ☐ | |
| 11.3 | §5 cancel flow — identical | ☐ | |
| 11.4 | §6 reset flow — identical | ☐ | |
| 11.5 | §7 input-change wipe — identical | ☐ | |
| 11.6 | §8 mode-switch preserves — identical | ☐ | |
| 11.7 | §9 infeasibility — identical (same R-A gap expected on both) | ☐ | |
| 11.8 | §10 second drag — identical | ☐ | |

---

## §12 i18n sanity (T030)

RR has a language toggle; Generic can be spot-checked via the `t()` helper in DevTools.

| # | Step | Expected | Pass | Notes |
|---|---|---|---|---|
| 12.1 | RR: switch to Chinese | Reset button text changes to `重設為計算出的 FIRE 年齡` | ☐ | |
| 12.2 | RR: drag and release, confirm overlay visible | Overlay label starts with `以 … 歲退休重新計算？`; Apply button reads `重新計算` | ☐ | |
| 12.3 | RR: drag to unsustainable age, confirm → if banner shows | Banner text reads `以目前的規劃，這個退休年齡不可持續。` | ☐ | |
| 12.4 | Drag-hint `drag me` → `拖曳我` | ☐ | |
| 12.5 | Switch back to English — all 6 strings revert | ☐ | |
| 12.6 | Repeat 12.1–12.5 on Generic if Generic has a language toggle. If not, spot-check via DevTools: `t('override.resetButton')` and `t('override.confirmLabel', 50)` return translated values | ☐ | |

---

## §13 Known deferred items — NOT BUGS

Things you may notice that are **already on the roadmap** for a later US and should not be flagged:

1. **`#infeasibilityDeficit` is empty.** The deficit dollar value next to the infeasibility banner is intentionally blank. Wiring is deferred to US2 T046/T047 (`fireCalculator.deficitReal`).
2. **KPI cards refresh via `recalcAll()`, not via a dedicated `chartState.onChange` listener.** You may see a 1-frame order difference where growth chart updates before KPIs. Cleanup is T048/T049 in US2.
3. **No automated Playwright tests run yet.** Per `test-matrix.md §9 R-2`, Playwright drag automation over a `<canvas>` is non-trivial; T031 explicitly allows manual validation for MVP. That's why this document exists.
4. **Touch/keyboard drag not supported.** Mouse-only per `research.md §R5`. Out of US1 scope.
5. **`#infeasibilityBanner` may not light up immediately on confirming an infeasible age** — see §9 above and audit §7 R-A. Documented gap, small fix available if user wants it patched now.

---

## §14 If anything fails

For each FAIL row, capture:
1. A screenshot of the browser state.
2. The DevTools Console output.
3. `window.chartState.state` at the moment of failure.
4. Which step (§N.M) failed.

Route to:
- Rendering / UI bug → Frontend Engineer (owns both HTML files).
- chartState contract violation → Backend Engineer (owns `calc/chartState.js`).
- Parity drift (RR vs Generic behaving differently) → Manager decides routing.

After any fix, re-run **at minimum §1, §3, §4, §8, and §9** before declaring US1 done.

---

## §15 Sign-off

When every box above is ticked (or explicitly documented as a known-deferred item from §13), Phase 3 / US1 MVP is validated and ready to merge to `main`.

**Session runner**: ________
**Date**: ________
**Overall verdict**: [ ] MVP validated [ ] Route fixes back to team
