# Feature 018 — CLOSEOUT

**Feature**: Merge Payoff-vs-Invest into Full Portfolio Lifecycle
**Branch**: `018-lifecycle-payoff-merge`
**Started**: 2026-04-29
**Implementation completed**: 2026-04-29 (continuation session — original session paused mid-Phase-4)
**Status**: Implementation complete; awaiting browser-smoke verification (quickstart S1–S16).

---

## Scope shipped

All four user stories landed:

- **US1 (P1 / MVP)** — Mortgage strategy radio (Prepay / Invest-keep-paying / Invest-lump-sum) replaces the old `pviLumpSumPayoff` checkbox. The strategy threads through every `projectFullLifecycle` call site (chart render + FIRE-age search + audit) via `getActiveMortgageStrategyOptions()`, mirroring the feature 008 `getActiveChartStrategyOptions()` pattern. Lifecycle simulator's pre-FIRE accumulation reads strategy-aware monthly P&I from the calc module's `amortizationSplit` per-year rows. Default `'invest-keep-paying'` path bypasses the precompute (zero perf impact).
- **US4 (P2)** — Sell-at-FIRE × strategy composition: `homeSaleEvent` + `postSaleBrokerageAtFire` outputs computed per Section 121 exclusion (MFJ $500K / single $250K). Lump-sum trigger inhibited at age ≥ FIRE when `sellAtFire=true`. PvI brokerage chart shows green-star sell marker at FIRE; banner Line 4 surfaces sale proceeds. Lifecycle simulator truncates mortgage cash flow at FIRE when sale event present and seeds retirement-phase brokerage from `postSaleBrokerageAtFire[strategyKey]`.
- **US2 (P2)** — Sidebar `#sidebarMortgageStatus` indicator. Reads `mortgageActivePayoffAge[strategyKey]` and `_formatSidebarMortgageIndicator()` to surface the active strategy + payoff age. Updates on every `recomputePayoffVsInvest()`.
- **US3 (P3)** — FIRE-age verdict + ranker auto-react: radio-change handler clears `fireAgeOverride = null` then re-runs `recomputePayoffVsInvest()` + `recalcAll()`. Audit `subSteps[]` flow verbatim from calc outputs (5 new v3 strings — strategy resolution, mortgage-trajectory compute, lump-sum trigger, sell-at-FIRE event, Section 121 calculation, post-sale brokerage handoff). `copyDebugInfo()` exposes `mortgageStrategy`, `mortgageActivePayoffAge`, `lumpSumEvent`, `homeSaleEvent`, `postSaleBrokerageAtFire`, plus `feasibilityProbe.activeMortgageStrategy` for LH-Inv-1 verifiability.

---

## Files changed

| File | Lines (approx) | Notes |
|---|---|---|
| `calc/payoffVsInvest.js` | +220 / -8 | v3 contract header; `HomeSaleEvent` + extended `LumpSumEvent` typedefs; `_normalizeStrategy`, `_section121Tax`, `_formatSidebarMortgageIndicator` helpers; LTCG gross-up + Inv-3 inhibition + `homeSaleEvent` + `postSaleBrokerageAtFire` + new `subSteps[]`. `actualDrawdown` field added (Option B). Trigger threshold uses `actualDrawdown` not `realBalance` so brokerage cannot go negative. |
| `FIRE-Dashboard.html` (RR) | ~+250 | Strategy radio fieldset; sidebar indicator div; PvI sell-event marker + banner Line 4; lifecycle simulator strategy-aware mortgage trajectory + sale-handoff truncation; `copyDebugInfo` extension; `_lastPviOutputs` window global; 11 new translation keys (EN + zh). |
| `FIRE-Dashboard-Generic.html` | ~+250 | Lockstep mirror of RR. Single divergence: Section 121 mfjStatus is derived from `inp.adultCount` (Generic) vs fixed `'mfj'` (RR). |
| `tests/unit/payoffVsInvest.test.js` | +250 | T007–T009 strategy normalization tests; T021–T024 US4 fixture tests; T036 sidebar formatter test. Test #40 (v017) updated to use `actualDrawdown` per Option B. |
| `tests/unit/lifecyclePayoffMerge.test.js` | NEW (+220) | T025a/b postSaleBrokerage handoff; T043 LH-Inv-1 strategy parity contract; T044 ranker-input divergence marker. |
| `specs/018-lifecycle-payoff-merge/` | NEW | Full speckit set: spec, plan, research, data-model, 2 contracts, quickstart, tasks, PICKUP, CLOSEOUT. |
| `FIRE-Dashboard Translation Catalog.md` | +11 keys | EN + zh-TW for `pvi.strategy.{label,prepay,investKeep,investLumpSum}`, `sidebar.mortgageStatus.{template,placeholder}`, `pvi.chart.brokerage.sellMarker`, `pvi.verdict.sale.{bannerLine,placeholder}`. |
| `CLAUDE.md` | (post-CLOSEOUT) | SPECKIT block flip; Process Lessons addition. |

---

## Tests

```
node --test tests/unit/payoffVsInvest.test.js          →  51/51 pass
node --test tests/unit/lifecyclePayoffMerge.test.js    →  4/4 pass
                                                          Total: 55/55 unit
npx playwright test                                    →  98/98 pass (full suite)
                                                          Grand total: 153/153
```

(Up from the v017 baseline of 43/43 + 0/0 = 43/43.)

## Post-implementation corrections (2026-04-29 same session)

### Slider linking + buyInMonth regression fix

User asked to link Plan→Investment "Monthly Investment" with Plan→PvI "Extra monthly cash to allocate" so they always share the same value (one bucket of monthly savings, allocated by strategy). Bidirectional sync helper `_syncMonthlySavings()` added in both HTMLs. Also asked to fix the prior caveat that "the lifecycle might not redirect monthlySavings to mortgage under Prepay."

E2E investigation revealed a deeper calc-module bug exposed by the new linkage: `buyInMonth` was being read from `inputs.mortgage.buyInYears` regardless of ownership type. The dashboard's form always renders the buyInYears slider (default 3) — so for `buying-now` ownership, the calc was treating the first 36 months as "pre-buy-in" (zero P&I in the prepay arm of `amortizationSplit`). Feature 018's strategy-aware lifecycle then misinterpreted those zero-P&I rows as "mortgage paid off," and `mtgSavingsAdjust` went negative for the first 3 years — exploding Prepay's brokerage contribution to ~$42K/yr (vs the $0/yr a correctly-paying Prepay user would see).

**Fix:** in `calc/payoffVsInvest.js:453`, gate `buyInMonth` on ownership:

```js
const buyInMonth = (inputs.mortgage.ownership === 'buying-in')
  ? Math.max(0, (inputs.mortgage.buyInYears || 0) * 12)
  : 0;
```

After the fix, Prepay's year-5 brokerage at the test scenario ($2K monthly, $440K loan, 6.5%/30y) drops below Invest's, as the conservation-of-cash invariant requires. New E2E spec `tests/e2e/feature-018-savings-redirect.spec.ts` locks the contract.

This regression existed since feature 016 but only became visible when feature 018 connected the calc's amortization to the lifecycle simulator AND the linkage made monthlySavings drive both sides.

### Option-1 fold-in (sale into PvI calc paths)

User flagged that the PvI brokerage chart's curve didn't show the home-sale equity injection at fireAge — it continued along the natural-amortization trajectory while the green star marker indicated the sale event location. Root cause: the calc module computed `homeSaleEvent` as a post-loop metadata field but never folded the `netToBrokerage` into `prepayPath[*].invested` / `investPath[*].invested`.

**Option 1 fold-in landed:** the home sale is now applied IN-LOOP at `age === fireAge`, after the month loop and before the year-end snapshot push. The path's `invested` at fireAge now includes the brokerage injection; the mortgage balance is zeroed for all rows ≥ fireAge; subsequent year iterations naturally route freed cash flow (former P&I + extra) to the brokerage. `postSaleBrokerageAtFire` simplifies to a direct read from the path. This makes the PvI chart consistent with the lifecycle chart on the other tabs.

**Side-effect (good):** the fold-in incidentally corrected a units bug in the old post-loop code — `remainingMortgageBalance` was being read from `path.mortgageBalance` (nominal $) and subtracted from `proceeds` (real $) to compute `netToBrokerage`. The new in-loop version uses real $ throughout. T025b's assertion was updated accordingly.

Tests after fold-in: 55/55 unit + 8/8 E2E = 63/63 still green.

---

## Lockstep audit (T051)

Sentinel-symbol counts — equal between RR and Generic:

| Symbol | RR | Generic |
|---|---|---|
| `mortgageStrategy` | 32 | 32 |
| `homeSaleEvent` | 13 | 13 |
| `postSaleBrokerageAtFire` | 7 | 7 |
| `sidebarMortgageStatus` | 2 | 2 |
| `pviMortgageStrategy` (radio name) | 8 | 8 |
| `pvi.strategy.{label,prepay,investKeep,investLumpSum}` | 12 | 12 |
| `pvi.chart.brokerage.sellMarker` + `pvi.verdict.sale.bannerLine` | 6 | 6 |

---

## Bilingual audit (T052)

11 new translation keys (EN + zh-TW), all present in both HTMLs and in the Translation Catalog. No hardcoded English in any new UI element.

---

## Process lessons captured

### Lockstep timing for in-flight refactors

When the calc module's contract changes mid-feature (here: LTCG gross-up extension to `LumpSumEvent`), pre-existing tests that asserted on the old contract (`paidOff` equivalence to brokerage delta) become silent landmines. The pickup-session caught this only because it ran tests as the first action. **Apply:** any time a calc-contract field gains new semantics, audit every test that touches that field BEFORE landing the calc change — not after.

### Option B beats overloading

Test 40 conflict resolution illustrates: when a v2 field is given new v3 meaning, prefer adding a sibling field (`actualDrawdown`) over redefining the original (`paidOff`). This preserves backwards-compat readability and makes diff-of-record straightforward. Codified in the v3 contract Inv-4 update.

### Trigger thresholds must consider downstream side-effects

The original LTCG gross-up landing fired the lump-sum at `investedI >= realBalance` but drew down `realBalance × grossUp`. This was self-inconsistent — brokerage could go negative. **Apply:** when a side-effect's magnitude differs from the trigger condition, verify the trigger condition encompasses the side-effect's full magnitude.

### Strategy-parity-between-probe-and-chart (LH-Inv-1)

Reinforces the feature-014 lesson: any code path that decides FIRE-feasibility must consume the SAME options thread (`mortgageStrategyOverride`) as the chart renderer. Feature 018 introduced `getActiveMortgageStrategyOptions()` as the single source of truth, mirroring `getActiveChartStrategyOptions()` from feature 008.

---

## Known follow-ups (not blockers)

- **QA finding (T044):** In the current calc, `mortgageStrategy === 'prepay-extra'` and `'invest-keep-paying'` produce structurally identical top-level outputs — only `'invest-lump-sum'` actually diverges (via `lumpSumPayoff = strategy === 'invest-lump-sum'`). The per-strategy distinction lives in the per-arm `mortgageActivePayoffAge.{prepay,invest}` and `postSaleBrokerageAtFire.{prepay,invest}` fields. The lifecycle simulator picks the right arm via `strategyKey`. This is correct behavior but worth documenting — a future feature could push strategy-aware behavior deeper into the calc's main path if a use case emerges.
- **Manual smoke (T020, T035, T042, T050, T054):** User will run quickstart.md S1–S16 in a real browser at session end.
- **CLAUDE.md SPECKIT block flip + Process Lessons addition** done in this CLOSEOUT pass (T057, T058).
- **BACKLOG.md / Roadmap update** done (T056).

---

## Constitution compliance

- **Principle I (lockstep dual HTML):** ✅ Sentinel-symbol audit passes.
- **Principle II (zero build deps):** ✅ No bundler, no framework introduced.
- **Principle III (real-dollar discipline):** ✅ All v3 fields documented as real-dollar; LTCG gross-up applied in real $.
- **Principle IV (gold-standard regression coverage):** ✅ 12 new tests across two files; existing 43-test baseline preserved.
- **Principle V (file-protocol delivery):** ✅ No top-level `export`; calc module remains UMD-classic-script.
- **Principle VI (two-way module/consumer link):** ✅ Renderer comment headers updated; calc module `subSteps[]` declares each new step.
- **Principle VII (bilingual EN + zh-TW):** ✅ All 11 new keys bilingual; Translation Catalog updated.

---

## Awaiting

User browser-smoke per `specs/018-lifecycle-payoff-merge/quickstart.md` S1–S16. After smoke passes, ready for merge to `main`.
