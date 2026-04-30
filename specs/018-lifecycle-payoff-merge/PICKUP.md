# Feature 018 — Pickup Notes (v2)

**Last session:** 2026-04-30 (continuation of 2026-04-29 implementation session)
**Branch:** `018-lifecycle-payoff-merge`
**State:** Implementation **done + matrix-tested**. Awaiting (a) user manual browser smoke per `quickstart.md` S1–S16, (b) commit decision, (c) optional follow-ups listed below.

---

## What's done

- **US1, US2, US4, US3** — all four user stories shipped lockstep across both HTMLs.
- **Calc v3** — `LumpSumEvent.actualDrawdown` (Option B), trigger threshold corrected, `homeSaleEvent` + `postSaleBrokerageAtFire` + Section 121 + Inv-3 inhibition.
- **Option-1 fold-in** — home sale folded into PvI calc paths so the brokerage line shows the equity injection at fireAge (matching the lifecycle chart).
- **Q1 fix (UI)** — verdict `progressPct` capped at 99 when `yrsToFire > 0`, so "Needs Optimization · 100% there" can no longer display together.
- **Slider linkage** — `monthlySavings` (Plan→Investment) and `pviExtraMonthly` (Plan→PvI) now bidirectionally synced; same slider params (max=6000, step=100); hydration extended.
- **Calc bug fix (buyInMonth ownership gating)** — `calc/payoffVsInvest.js:453`. The dashboard's `buyInYears` slider was being read unconditionally, so the calc was treating the first 36 months of `buying-now` simulations as pre-buy-in (zero P&I). This made Prepay's brokerage explode in early years once feature 018 connected the calc's amortization to the lifecycle. Fixed by gating buyInMonth on `ownership === 'buying-in'`.
- **CLOSEOUT.md, BACKLOG.md, FIRE-Dashboard-Roadmap.md, CLAUDE.md SPECKIT block** all updated.
- **Translation Catalog** updated with all 11 new keys (EN + zh-TW).

## Test status — 163/163 passing

```
node --test tests/unit/payoffVsInvest.test.js          →  51/51
node --test tests/unit/lifecyclePayoffMerge.test.js    →  4/4
                                                          Total: 55/55 unit
npx playwright test                                    →  108/108 E2E
                                                          Grand total: 163/163
```

E2E specs covering feature 018 specifically:
- `tests/e2e/feature-018-strategy-matrix.spec.ts` — 8 tests; 3 strategies × 2 home destinies × 2 HTMLs.
- `tests/e2e/feature-018-savings-redirect.spec.ts` — 2 tests; locks Prepay's brokerage ≤ Invest's brokerage.
- `tests/e2e/feature-018-ui-coverage.spec.ts` — 10 tests; Q1 progress cap, slider linkage matrix (5 values × 2 directions × 2 HTMLs), hydration sync, full strategy × slider sweep.

---

## What's NOT done — pickup items

### 1. Manual browser smoke (user task)

User to run `quickstart.md` S1–S16 in real browser sessions on BOTH dashboards (`file://` and `http://`). Per CLAUDE.md "Browser smoke before claiming a feature done" — this is the gate before merging to `main`.

Expected to verify:
- S1–S2: PvI radio toggles change the lifecycle chart visibly.
- S3: Sidebar mortgage-status indicator updates on radio change.
- S4–S5: Prepay vs Invest+lump-sum lifecycle reactions look right.
- S6–S7: FIRE-age verdict + ranker auto-react.
- S8–S12: Sell-at-FIRE × strategy composition (8 cells).
- S13–S14: Audit subSteps + copyDebug payload shape.
- S15–S16: Bilingual flips (EN ↔ 中文) + file:// delivery.

### 2. Git commit / merge decision (user task)

Working tree has uncommitted changes since `dcfd8cf wip(018): checkpoint`. Files modified:

```
M  BACKLOG.md
M  CLAUDE.md
M  FIRE-Dashboard Translation Catalog.md
M  FIRE-Dashboard-Generic.html
M  FIRE-Dashboard-Roadmap.md
M  FIRE-Dashboard.html
M  calc/payoffVsInvest.js
M  specs/018-lifecycle-payoff-merge/contracts/payoffVsInvest-calc-v3.contract.md
M  tests/unit/lifecyclePayoffMerge.test.js
M  tests/unit/payoffVsInvest.test.js
?? specs/018-lifecycle-payoff-merge/CLOSEOUT.md
?? tests/e2e/feature-018-strategy-matrix.spec.ts
?? tests/e2e/feature-018-savings-redirect.spec.ts
?? tests/e2e/feature-018-ui-coverage.spec.ts
```

When user is ready: choose between (a) one squash commit "feat(018): lifecycle-payoff-merge complete", or (b) a few logical commits (calc v3 / UI lockstep / E2E coverage / closeout). Then merge `018-lifecycle-payoff-merge` → `main`.

### 3. Optional follow-ups (user discretion — none blocking)

- **Q3 follow-up — lifecycle chart UX clarity.** User asked why the portfolio drops after FIRE; the answer is "drawdown phase" + "home sale converts illiquid equity to liquid (no net change)". I offered two optional UX improvements that were deferred:
  - (3a) Add a transparent "Home Equity" band to the pre-FIRE portfolio so users can SEE the home-equity → brokerage conversion at FIRE.
  - (3b) Annotate the FIRE marker tooltip to show "Pre-sale liquid: $1.1M → Post-sale liquid: $1.4M (home equity converted)".

- **PvI v2 markers may overlap home-sale marker.** When `sellAtFire=true` AND prepay's accelerated payoff hits the same age, the red X (Prepay payoff), blue X (Invest payoff), and green star (sale) all overlap at fireAge. Visual polish only.

- **monthlySavings / pviExtraMonthly slider params alignment.** Both now `max=6000, step=100`. If user wants finer granularity, increase to step=50 or higher max.

---

## Resume plan (for next session)

1. **If user has done browser smoke:** record results in CLOSEOUT.md, then commit + merge per their preferred granularity.
2. **If browser smoke surfaced issues:** triage; route fixes via the Manager pattern (Backend / Frontend / QA agents per task brief).
3. **If user wants any of the optional follow-ups (3a, 3b, or other):** brainstorm + plan + implement on this same branch (still pre-merge).
4. **Final close:** flip CLAUDE.md SPECKIT block to confirmation that 018 has merged, archive PICKUP.md, update memory.

## Where to find things

- Spec / Plan / Tasks: `specs/018-lifecycle-payoff-merge/`
- Calc module: `calc/payoffVsInvest.js`
- Both HTMLs: `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`
- Unit tests: `tests/unit/payoffVsInvest.test.js`, `tests/unit/lifecyclePayoffMerge.test.js`
- E2E tests: `tests/e2e/feature-018-*.spec.ts`
- Project memory entry: `~/.claude/projects/.../memory/MEMORY.md` (update on next pickup with branch/commit status).
