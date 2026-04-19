# FIRE Calculator — Backlog

**Status**: living document. Updated 2026-04-19 after feature `001-modular-calc-engine` merged to main (`2ae5e0c`).

This file catalogs every unfinished item surfaced during the session that shipped US1 MVP + the canonical calc engine foundations. Each item is scoped tightly enough to become a future spec (`/speckit-specify <item>`). Items are grouped by priority and include current-state pointers so future work can pick up from the right place.

---

## How to use this file

1. Pick an item (or a grouped theme — several items often belong to one spec).
2. Run `/speckit-specify` with the item's one-line title as the feature description.
3. The spec-kit flow pulls from these pointers, then the Manager dispatches Engineers.
4. When the item ships, delete its entry here and add a one-line "Done in feature 00X" pointer to the CHANGELOG section at the bottom.

---

## 🚨 P1 — Latent correctness bugs in production

These bugs exist in the inline engine that currently drives both dashboards. The canonical engine under `calc/` fixes each of them; they reach users only after the HTML wire-up (item F1 below).

### B1. Real/nominal dollar mixing in healthcare + college costs

- **Where**: `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` — inline `projectFullLifecycle` adds healthcare / college costs as **nominal** dollars while the rest of the projection uses **real** returns.
- **Impact**: Inflates FIRE age by ~1 year on typical inputs (Roger/Rebecca baseline shifts by ~1 yr when corrected).
- **Fix**: Canonical `calc/lifecycle.js` converts at the module boundary via `calc/inflation.js` (`§C.1` in `specs/001-modular-calc-engine/baseline-rr-inline.md`). Waiting on HTML wire-up.
- **Standalone fix possible?** Yes — can be patched directly in the inline engine as a fast win without HTML wire-up. ~1 hour.

### B2. Silent shortfall absorption in withdrawal phase

- **Where**: inline `signedLifecycleEndBalance` pushes negative pool balances into `pStocks` without surfacing. Audit-identified.
- **Impact**: A dashboard-"feasible" retirement plan can actually run out of money. The user sees green lights while the math is bleeding red.
- **Fix**: Canonical `calc/withdrawal.js` returns typed `{feasible: false, deficitReal}` (§C.2). FR-013. Waiting on HTML wire-up.
- **Standalone fix possible?** Partial — flagging the case in the inline engine (returning a warning) is ~30 minutes. Cleaner typed-result path requires the full canonical swap.

### B3. Generic's FIRE solver ignores the secondary person's portfolio

- **Where**: `FIRE-Dashboard-Generic.html` — the inline solver reads `inp.ageRoger`-equivalent (`inp.agePerson1`) but doesn't sum `portfolioSecondary` fields into the accumulation pool.
- **Impact**: For a two-person household on Generic, doubling the spouse's 401(k) has zero effect on `yearsToFire`. Real bug for any couple using Generic.
- **Fix**: Canonical `calc/fireCalculator.js` + `calc/lifecycle.js` already sum both portfolios. The `SC-005` parity test in `tests/unit/fireCalculator.test.js` locks this. Waiting on HTML wire-up.
- **Standalone fix possible?** Yes — directly patch Generic's inline solver to include `portfolioSecondary`. ~45 minutes. **Recommended fast win.**

### B4. "Monte Carlo" is deterministic

- **Where**: Comments in the inline engine claim Monte Carlo simulation; code uses point-estimate returns. No percentile bands, no failure-rate metric.
- **Impact**: Users think they're seeing stochastic projections. They aren't.
- **Fix**: Out of scope for the current calc engine — would be a new feature building on `calc/lifecycle.js` once wired up. Not a quick fix.

---

## ⏸ P2 — Deferred feature work (ordered by dependency)

These items were explicitly scoped into `001-modular-calc-engine` but deferred at merge.

### F1. Browser-side smoke test harness (blocker for everything below)

- **Why**: `node --test` validates calc modules in isolation but cannot catch "module works, but throws on the HTML's default form values and freezes the dashboard". This is exactly what caused U2B-4a to be reverted.
- **Two viable designs**:
  - **Node-runnable** — extend `tests/baseline/inline-harness.mjs` pattern. Hard-code the HTML's cold-load form values, run them through `getCanonicalInputs()` logic, assert `solveFireAge(canonical)` doesn't throw and returns sane shape. Preserves Principle V (zero-dep).
  - **Playwright** — actual browser automation. Better coverage (chart rendering, drag interactions), but violates Principle V as currently written. Requires a **constitution amendment** discussion before adoption.
- **Estimated effort**: 2–4 hours for the Node harness; 1 day for Playwright setup + initial E2E suite.
- **Recommendation**: start with the Node harness. Add Playwright later if the team feels the gap.

### F2. US2 HTML wire-up (TB22–T25 in `specs/001-modular-calc-engine/tasks-us2b.md`)

- **What**: Replace inline `projectFullLifecycle` / `findFireAgeNumerical` / `signedLifecycleEndBalance` / `yearsToFIRE` / `getTwoPhaseFireNum` / `taxAwareWithdraw` / related helpers with calls into `calc/*.js`.
- **Depends on**: F1 (smoke-test harness) must land first. Then the staged U2B-4a → U2B-4b → U2B-4c approach proposed by the Frontend Engineer.
- **Visible impact**: fixes B1 / B2 / B3. FIRE age will shift by ~1–4 years (Roger) / ~3–10 years (Generic). Documented in `baseline-rr-inline.md §C`.
- **Estimated effort**: 1–2 days after F1 lands.

### F3. US3 — RR personal-data adapter + parity test

- **What**: Extract Roger/Rebecca's personal data (birthdates, SS earnings, Janet/Ian college years) from `FIRE-Dashboard.html` into `personal/personal-rr.js`. Both HTML files then consume identical `calc/*.js` sources; personal-rr.js is imported only by the RR file.
- **Depends on**: F2 (HTML wire-up).
- **Unlocks**: the parity test at `tests/parity/rr-vs-generic.test.js` (not yet created but fixture exists at `tests/fixtures/rr-generic-parity.js`) becomes mechanically enforceable.
- **Estimated effort**: ~½ day.

### F4. US4 — Bidirectional chart↔module annotations

- **What**: Every chart renderer in both HTML files gets a `@chart: / @module:` header comment naming the module(s) consumed. Every `calc/*.js` module's `Consumers:` list names every chart that reads it. Meta-test `tests/meta/module-boundaries.test.js` check (c) is enabled (currently skipped).
- **Depends on**: F2 (HTML wire-up).
- **Impact**: any reviewer can answer "which module produced this number?" in under 30 seconds. SC-002.
- **Estimated effort**: ~½ day.

### F5. Polish phase tasks (T068–T076 in `specs/001-modular-calc-engine/tasks.md`)

- `FIRE-Dashboard-Roadmap.md` — mark modular calc engine complete, note Monte Carlo now unblocked.
- README for new contributors pointing at `calc/` + `tests/` + quickstart.
- Performance benchmarks — instrument `calc/lifecycle.js`, confirm drag ≥ 30 fps, recalc ≤ 16 ms.
- Accessibility pass — keyboard focus / `aria-live` / screen-reader labels on confirm overlay + Reset button.
- Full quickstart re-run.

---

## 👁 P3 — Visible UX gaps

### U1. Infeasibility deficit amount not displayed

- **Where**: `#infeasibilityDeficit` DOM element exists but renders empty. Listener waits for `chartState.state.deficitReal` which isn't populated until lifecycle is the authoritative engine.
- **Fix**: Part of F2 (HTML wire-up).

### U2. KPI cards refresh via `recalcAll()` rather than `chartState.onChange` listeners

- **Where**: "Years to FIRE", "FIRE Net Worth", "Progress %" update inside `recalcAll()`. Flagged by Frontend Engineer during T019–T023 dispatch.
- **Impact**: one-frame ordering artifact — the FIRE marker on the chart moves before the KPI card updates. Barely noticeable.
- **Fix**: migrate each KPI into a dedicated `chartState.onChange` subscriber. Cleaner model. ~1 hour.

### U3. Language toggle during confirm overlay visibility resets interpolated label

- **Where**: if user switches EN ↔ 中文 while "Recalculate at age X?" overlay is visible, the label reverts to raw template `{0}`.
- **Fix**: `switchLanguage()` should re-run `_showConfirmOverlay(previewAge)` when the overlay is visible. ~10 minutes.

### U4. Drag is mouse-only (no touch, no keyboard)

- **Where**: drag handler on Full Portfolio Lifecycle chart uses mouse events exclusively.
- **Impact**: dashboard is unusable for override-exploration on mobile / tablet. Keyboard users can't drag at all (no screen-reader path).
- **Fix**: add touch events (pointer API) + keyboard handling (arrow keys while marker focused). Research in `specs/001-modular-calc-engine/research.md §R5` flagged this as deferred. ~2–3 hours.

### U5. Fractional age rounding rule not verified end-to-end

- **Where**: `data-model.md §1` declares `Math.floor` for RR's birthdate-derived age. Not verified against actual dashboard behavior.
- **Fix**: write a test that loads RR's dashboard with Roger's birthday set to 1983-06-15, asserts `chartState` sees `currentAgePrimary = 42` (not 43) on 2026-04-19. ~30 minutes.

---

## 🧪 P4 — Testing & infrastructure gaps

### T1. No browser-side automated testing

See F1 — this is the single biggest testing gap and the root cause of the U2B-4a revert.

### T2. SC-009 ("override wipe in under one animation frame") has soft coverage only

- **Current**: `tests/unit/chartState.test.js` locks atomic transitions in pure JS. No visible-DOM timing assertion.
- **Fix**: requires browser automation (F1). Once available, add a test that drives a drag → confirm → input change and observes the DOM update within one `requestAnimationFrame`.

### T3. No accessibility audit

- **Planned in** `tasks.md` T072 but not executed.
- **Fix**: keyboard navigation, focus rings, `aria-live` announcements when override activates / deactivates, screen-reader labels on all new controls. Could be paired with U4 (keyboard drag).

### T4. No performance benchmarks

- **Planned in** `tasks.md` T071 but not executed.
- **Fix**: `performance.now()` instrumentation in `calc/lifecycle.js`; assert drag sustains ≥ 30 fps; recalc ≤ 16 ms on canonical fixture.

### T5. Parity fixture's `divergent[]` list is minimal

- **Current**: `tests/fixtures/rr-generic-parity.js` lists only `ssPrimary.annualEarningsNominal`.
- **Fix**: expand after F3 lands and reveals which other fields legitimately differ (e.g., RR's kid college years vs Generic's parametric kids).

### T6. No CI integration

- **Current**: tests run locally via `tests/runner.sh`. No `.github/workflows/*` yet.
- **Fix**: add a GitHub Actions workflow running `node --test tests/` on push. Zero-dep, aligns with Principle V. ~20 minutes.

---

## 🧹 P5 — Technical debt / cleanup

### D1. Compat shim `normalizeMortgageShape` in `calc/lifecycle.js`

- **What**: translates legacy `{balanceReal, interestRate, yearsRemaining}` into `{ownership: 'already-own', ...}`.
- **Fix**: remove once F2 is done and HTML passes canonical mortgage shape directly.

### D2. Transitional aliases `p401kTradReal` / `p401kRothReal`

- **Where**: every `LifecycleRecord` carries these + their canonical counterparts `trad401kReal` / `rothIraReal`.
- **Fix**: remove after F2 + F4 (chart renderers renamed to canonical names).

### D3. `coast-fire.js` fixture has a `TBD_LOCK_IN_T038` placeholder

- **Where**: `tests/fixtures/coast-fire.js`, `lifecycleCheckpoints[0].totalReal`.
- **Fix**: run the canonical engine with that fixture's inputs, lock the value. ~5 minutes.

### D4. `calc/studentLoan.js` is a thin wrapper around `computeMortgage`

- **Where**: `calc/studentLoan.js` delegates entirely to `calc/mortgage.js::computeMortgage`.
- **Option A**: leave as-is — the indirection documents intent.
- **Option B**: remove the module, have `calc/lifecycle.js` call `computeMortgage` directly for each student loan.
- **Recommendation**: leave as-is unless we're actively refactoring the module set for other reasons.

### D5. Generic DWZ fireAge display mismatch

- **Where**: inline reports "64 (28y 8m)"; chart rounds to 65; canonical reports 64 only.
- **Fix**: canonical fireCalculator could emit both `.fireAge` and `.fireAgeChartRounded`. Or the inline engine's chart could stop rounding. Decide during F2.

### D6. `isFireAgeFeasible` kept with `// TODO` in both HTML files

- **Where**: has 3 callers inside `findMinAccessibleAtFireNumerical`, which stays inline per the narrow U2B-4a scope.
- **Fix**: port `findMinAccessibleAtFireNumerical` to canonical during F2's U2B-4b phase, then delete `isFireAgeFeasible`.

---

## 🛠 P6 — Process & tooling improvements

### P1. Codify "audit every caller before an extraction refactor"

- **Lesson**: the original TB22–T25 dispatch was over-scoped because the Manager didn't require a caller-audit step before dispatching. The Frontend Engineer's U2B-4a escalation caught it.
- **Fix**: amend `CLAUDE.md` Manager playbook to require a call-site grep table as input to any "replace inline X with canonical Y" dispatch.

### P2. Add defense-in-depth to shim bodies

- **Lesson**: U2B-4a shims had no `try/catch`. One canonical throw froze the entire dashboard.
- **Fix**: any future shim wrapping a canonical call should `try/catch` and fall back to the inline implementation on error, logging to console. Cheap insurance.

### P3. Constitution amendment discussion: Playwright

- **Current**: Principle V forbids any runtime dependency. Unit-test tooling (Node built-ins) is permitted.
- **Question**: is dev-only Playwright that ships with nothing (same class as `node:test`) acceptable under Principle V's spirit?
- **Process**: if yes, amend constitution v1.0.0 → v1.1.0 (MINOR — expanded guidance), write ADR, proceed.

### P4. Manager-side tracking for multi-phase features

- **Lesson**: feature `001-modular-calc-engine` spanned 7 phases × 76 tasks + a 31-task US2b extension. Tracking "where are we?" across 20+ commits was manual.
- **Fix**: the `TaskCreate` tool is meant for this. Using it from the outset (rather than rediscovering each phase) would keep momentum visible.

---

## 📄 P7 — Documentation gaps

### Doc1. No user-facing README

- **What**: a top-level `README.md` explaining what the project is, how to open the dashboards, how to run the tests, what lives in `calc/` vs `tests/` vs `specs/`.
- **Effort**: ~1 hour.

### Doc2. No CONTRIBUTING guide

- **What**: how new contributors add features — spec-kit flow, team-role conventions (Frontend / Backend / DB / QA), lockstep rules, test-gating.
- **Effort**: ~1 hour. Can be derived from `CLAUDE.md`.

### Doc3. `FIRE-Dashboard-Roadmap.md` not updated

- **Current**: unchanged since before this feature merged.
- **Fix**: reflect US1 MVP completion, note the ordered backlog here as "near-term", and update any feature-flag lists.

### Doc4. `CLAUDE.md` doesn't reference current branch state

- **Current**: SPECKIT block points at `specs/001-modular-calc-engine/plan.md`. Now that the feature is merged and paused, the pointer is stale.
- **Fix**: either remove the SPECKIT block entirely (feature merged), or update to point at the next active feature. Leave `CLOSEOUT.md` + `BACKLOG.md` references in place.

---

## 🔮 P8 — Future feature ideas (out of scope for everything above)

These are genuine "next features", not backlog items from `001-modular-calc-engine`. Listing here so they don't get lost.

### X1. Real Monte Carlo simulation

- **Why**: the dashboard claims Monte Carlo but uses deterministic returns. See B4.
- **Scope**: new `calc/monteCarlo.js` module producing `{p10, p50, p90}` from a stochastic lifecycle. Builds on `calc/lifecycle.js`.
- **Dependency**: F2 must land first so `calc/lifecycle.js` is authoritative.

### X2. CSV snapshot schema + localStorage migration

- **Why**: `FIRE-snapshots.csv` is growing; `localStorage` keys need documented schema.
- **Owner**: DB Engineer (per `CLAUDE.md` roles).
- **Scope**: dedicated feature. Plan the CSV → SQLite migration path without executing.

### X3. Mobile-first UX pass

- **Why**: dashboard is desktop-centric. Drag is mouse-only (U4). Tables overflow on phones.
- **Scope**: responsive layout review + touch drag + collapsible sections.

### X4. Export / sharing feature

- **Why**: users want to save a specific scenario, or send "here's my plan" to a partner.
- **Scope**: URL-encoded state; PDF export of the dashboard; maybe shareable JSON bundles.

### X5. Tax optimizer / bracket-fill suggestions

- **Why**: current dashboard shows the plan; doesn't suggest tax moves (Roth ladder optimization, realized-LTCG harvesting up to the 0% bracket).
- **Scope**: new `calc/taxOptimizer.js` that reads a lifecycle and emits per-year optimization suggestions.

### X6. Scenario-compare side-by-side

- **Why**: dashboard supports one plan at a time. Would be powerful to put "Taiwan move" vs "stay in US" vs "Portugal" side by side.
- **Scope**: UI shell that renders 2–3 lifecycle charts at once with a shared x-axis.

---

## Suggested grouping into future specs

| Spec name | Backlog items covered | Priority |
|---|---|---|
| `002-inline-bugfix` | B1 + B3 (fast wins, no HTML swap) | High |
| `003-browser-smoke-harness` | F1 + T1 + T6 | High (blocker for 004) |
| `004-html-canonical-swap` | F2 + U1 + D1 + D2 + D6 | High |
| `005-rr-generic-parity` | F3 + T5 | Medium |
| `006-chart-module-annotations` | F4 | Medium |
| `007-polish-and-accessibility` | F5 + T3 + T4 + U2 + U3 + U4 + U5 | Medium |
| `008-monte-carlo` | X1 + B4 | Low |
| `009-db-schema-migration` | X2 | Low |
| `meta/process-improvements` | P1 + P2 + P3 + P4 + Doc1 + Doc2 + Doc3 + Doc4 | Low — bundle into a meta-PR |

A pragmatic order: 002 (quick wins first), 003 (unblock), 004 (big one), then pick from 005–009 by appetite.

---

## Changelog (items completed)

*(Empty — items are added here with a one-line "Done in feature 00X" pointer as they ship.)*
