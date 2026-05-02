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

### ~~B1. Real/nominal dollar mixing in healthcare + college costs~~ — INVESTIGATED, NO FIX REQUIRED

**Status**: Closed in feature `002-inline-bugfix` (2026-04-19) after an independent line-level audit contradicted the original §C.1 claim.

- **Original claim** (feature 001 audit, `baseline-rr-inline.md §C.1`): inline `projectFullLifecycle` adds healthcare / college costs as nominal dollars; fix by dividing by `(1+inflation)^n`.
- **Finding** (feature 002 audit, `specs/002-inline-bugfix/audit-B1-real-vs-nominal.md`, Verdict A at 9/10 confidence): The `HEALTHCARE_BY_COUNTRY` table comment literally says "TODAY's USD"; the receiving variable `retireSpend` is a constant-dollar slider value; the projection loop uses `realReturn = returnRate - inflationRate`. Tables are already real. Real + real = real. The proposed B1 "fix" would INTRODUCE a bug by shrinking real-dollar costs artificially over time.
- **Applied fix and reverted**: We did apply the B1 conversion experimentally; it shifted RR fireAge by 1 year (wrongly — plan became rosier than it should be) and did NOT shift Generic at all (Safe-mode integer-year solver absorbed the effect). The test that would have locked this shift failed to meet the [0.5, 1.5] delta gate on Generic, triggering the FR-011 investigation path — which is what exposed the misdiagnosis. Fully reverted; no code change shipped.
- **Record**: `specs/002-inline-bugfix/audit-B1-real-vs-nominal.md` preserves the line-level evidence. `specs/002-inline-bugfix/site-audit.md` has the post-audit resolution note.
- **Note for future healthcare-override work**: if a future feature adds a DIFFERENT healthcare pathway that explicitly accepts nominal-dollar inputs (e.g., a "cost in 2035 dollars" override), THAT pathway would need a real/nominal conversion at its boundary. The current scenario-table pathway does not.

### ~~B2. Silent shortfall absorption in withdrawal phase~~ — INVESTIGATED, NO FIX REQUIRED

**Status**: Closed 2026-04-20. Independent audit at `specs/audits/B2-silent-shortfall.md` returned Verdict B (misdiagnosis) with 9/10 confidence.

- **Original claim** (feature 001 audit, `baseline-rr-inline.md §C.2`): inline `signedLifecycleEndBalance` silently absorbs negative pool balances into `pStocks` without surfacing infeasibility; fix via canonical's typed `{feasible:false, deficitReal}` return.
- **Finding**: the inline engine DELIBERATELY allows pools to go negative as the feasibility signal. Convergent evidence: (a) function name literally contains "signed"; (b) explicit code comment at `FIRE-Dashboard.html:3816` says "Allow pools to go NEGATIVE"; (c) another explicit comment at L3829 says "accumulate shortfall here"; (d) `endBalance` sum at L3856 is unclamped; (e) `isFireAgeFeasible` at L3877/L3882/L3889 gates on `endBalance >= 0` — using the signed value as the flag; (f) `findFireAgeNumerical` returns `feasible: false` when the loop exhausts without finding a nonnegative age.
- **Reclassification**: canonical's typed `{feasible:false, deficitReal}` is a richer DIAGNOSTIC (exposes the deficit dollar amount, which inline cannot), not a CORRECTNESS FIX. Both engines produce the same feasibility verdict; canonical just labels it better.
- **Future UX enhancement**: if we want to surface `deficitReal` on the infeasibility banner after feature 004's canonical wire-up lands, that's a separate feature (estimated ~1 hour). Not tracked here until prioritized.
- **Pattern recap**: this is the THIRD misdiagnosis in `baseline-rr-inline.md §C` (B1 + B3 + B2). The §C audit was overconfident; every specific claim has needed independent verification.

### ~~B3. Generic's FIRE solver ignores the secondary person's portfolio~~ — ALREADY CORRECT; REGRESSION-LOCKED

**Status**: Closed in feature `002-inline-bugfix` (2026-04-19).

- **Original claim** (feature 001 audit, `baseline-rr-inline.md §C.3`): Generic's inline solver doesn't sum `portfolioSecondary` into the accumulation pool; doubling spouse's portfolio has zero effect on `yearsToFire`.
- **Finding** (feature 002 site-audit, line 3480 of `FIRE-Dashboard-Generic.html`): the pool summation `pStocks = inp.person1Stocks + inp.person2Stocks` is ALREADY in place. Generic's form has no `person2_401kTrad/Roth` or `ssClaimAgeSecondary` fields, so the "portfolio + contributions + SS" scope we asked about in the clarification pass was moot — only the taxable-stocks pool is separately maintained per person, and it IS summed correctly. Behavior observed: doubling `inp.person2Stocks` from $0 to $300k shifts fireAge from 65 to 58 (7-year change — huge sensitivity, matching what you'd expect).
- **What shipped**: a one-line code comment pointer at the pool-summation site in both Generic HTML and the harness, plus a regression test (`tests/baseline/inline-harness.test.js`) that locks the 7-year sensitivity. If a future change accidentally removes the pool summation, the test fails immediately with a named message.
- **Note for future**: the audit's §C.3 claim conflated "Generic doesn't have per-person 401(k) / SS fields" (true — form limitation) with "Generic ignores the secondary person entirely" (false — pool summation works). If a future feature adds per-person 401(k) / SS fields to Generic, that's a separate spec to design the form and wire the solver to the new fields.

### B4. "Monte Carlo" is deterministic

- **Where**: Comments in the inline engine claim Monte Carlo simulation; code uses point-estimate returns. No percentile bands, no failure-rate metric.
- **Impact**: Users think they're seeing stochastic projections. They aren't.
- **Fix**: Out of scope for the current calc engine — would be a new feature building on `calc/lifecycle.js` once wired up. Not a quick fix.

---

## ⏸ P2 — Deferred feature work (ordered by dependency)

These items were explicitly scoped into `001-modular-calc-engine` but deferred at merge.

### ~~F1. Browser-side smoke test harness (blocker for everything below)~~ — DONE, see feature 003

**Status**: Closed in feature `003-browser-smoke-harness` (2026-04-20). Shipped the Node-runnable design (extended `tests/baseline/*` with a zero-dep smoke harness + CI workflow at `.github/workflows/tests.yml`). Playwright path deferred pending constitution-amendment discussion (P3 below).

- **Why**: `node --test` validates calc modules in isolation but cannot catch "module works, but throws on the HTML's default form values and freezes the dashboard". This is exactly what caused U2B-4a to be reverted.
- **Two viable designs**:
  - **Node-runnable** — extend `tests/baseline/inline-harness.mjs` pattern. Hard-code the HTML's cold-load form values, run them through `getCanonicalInputs()` logic, assert `solveFireAge(canonical)` doesn't throw and returns sane shape. Preserves Principle V (zero-dep).
  - **Playwright** — actual browser automation. Better coverage (chart rendering, drag interactions), but violates Principle V as currently written. Requires a **constitution amendment** discussion before adoption.
- **Estimated effort**: 2–4 hours for the Node harness; 1 day for Playwright setup + initial E2E suite.
- **Recommendation**: start with the Node harness. Add Playwright later if the team feels the gap.
- **Shipped**: `tests/baseline/browser-smoke.test.js` (RR + Generic + parity smokes), `tests/baseline/rr-defaults.mjs`, `tests/baseline/generic-defaults.mjs`, `.github/workflows/tests.yml`. Prototype `_prototypeGetCanonicalInputs` marker is in place for feature 004 to replace.

### F2. US2 HTML wire-up — PARTIAL (feature 005, 2026-04-20) · ROLLED BACK same day

- **What shipped (retained)**: Extracted the 4 HTML shim functions (`yearsToFIRE`, `findFireAgeNumerical`, `_evaluateFeasibilityAtAge`, `findMinAccessibleAtFireNumerical`) into `calc/shims.js` as a Node-testable glue layer with documented `try/catch` + fallback + `[<shim-name>]` prefix logging. Added production adapter `calc/getCanonicalInputs.js`. Restored `evaluateFeasibility({inputs,fireAge,helpers}) → boolean` as a named export in `calc/fireCalculator.js`. Added `tests/unit/shims.test.js` with 4 shim-fallback unit tests. Retargeted `tests/baseline/browser-smoke.test.js` at the production adapter. These artifacts remain on disk + Node-tested.
- **What rolled back (same day, browser smoke)**: the HTML bootstrap no longer wires the canonical engine — both dashboards restored the inline solver from `FIRE-Dashboard - Legacy.html`. Cause: canonical adapter only saw `inp`, but 4 critical UI states (`selectedScenario`, `mortgageEnabled`, `secondHomeEnabled`, month-precise DWZ) live in module-scope globals outside `inp`. This made country selection, home disposition, second-home, and DWZ all no-ops in the browser. See §D8 for the parity gates required before re-attempting the swap.
- **See**: `specs/005-canonical-public-launch/CLOSEOUT.md` §"US1 scope correction".

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

### ~~U1. Infeasibility deficit amount not displayed~~ — DONE (feature 005, 2026-04-20)

- **What was done**: `#infeasibilityDeficit` now surfaces ` Short by $<amount>` when solver returns `feasible: false` with a numeric deficit. Aggregate deficit computed inline as MAX across infeasible years. See `specs/005-canonical-public-launch/` FR-022 / Phase 6 T050-T051.

### ~~U2. KPI cards refresh via `recalcAll()` rather than `chartState.onChange` listeners~~ — DONE (feature 005, 2026-04-20)

- **What was done**: 4 primary KPI cards (Years to FIRE, FIRE Net Worth, FIRE Number, Progress %) migrated to a single `renderKpiCards(state)` function registered as a `cs.onChange(...)` subscriber. Every KPI value gated on `Number.isFinite(...) ? formatted : '—'` per FR-024 — regressions now show `—` placeholder instead of cascading `NaN`. See feature 005 FR-023 / FR-024 / Phase 6 T052-T054.

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

### U6. SSA Earnings Record cannot add pre-2020 years

- **Where**: `FIRE-Dashboard-Generic.html` — `ssEarningsHistory` is initialised at line ~3286 starting 2020; "add year" button (line ~3325) only appends `lastYear + 1`. There is no button to insert a PRIOR year.
- **Impact**: any user with US work history before 2020 cannot enter those earnings, which are needed for SSA's highest-35-years AIME calculation. Pre-2020 high-earning years silently count as \$0, understating projected SS benefit.
- **Parity note**: check whether RR (`FIRE-Dashboard.html`) has the same limitation or already supports earlier years — fix in both if lockstep applies.
- **Proposed fix** (future feature, target branch `012-ssa-earnings-pre-2020`):
  1. Add "Add prior year" button next to "Add year" — prepends `firstYear − 1` to the list.
  2. Floor: sensible minimum year (e.g., 1960, covering anyone currently planning FIRE who started working as a teen in that era) or compute from an "earliest work year" input the user can set.
  3. Input validation: years must be strictly increasing; duplicates rejected; empty earnings treated as \$0 with a warning (still a valid record — SSA allows \$0 years for highest-35).
  4. i18n: EN + zh-TW labels for the new button (reuse `ss.addYear` pattern).
  5. Unit test: prepend + validate + sort invariant + AIME computation includes prepended years.
- **Effort**: small spec + ~40 LoC UI change + 2–3 unit tests. Independent from feature 010 (country budget scaling).
- **Status**: in-progress on branch `012-ssa-earnings-pre-2020` (spec: `specs/012-ssa-earnings-pre-2020/`). Helpers extracted to `calc/ssEarningsRecord.js` — RR can reuse them when reintroduced.

---

## 🧪 P4 — Testing & infrastructure gaps

### ~~T1. No browser-side automated testing~~ — DONE, see feature 003

**Status**: Closed in feature `003-browser-smoke-harness` (2026-04-20). Covered by F1's shipped smoke harness. Browser-automated coverage (Playwright) still deferred pending P3 constitution-amendment discussion; the Node smoke harness closes the single-biggest gap (cold-load canonical validation).

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

### ~~T6. No CI integration~~ — DONE, see feature 003

**Status**: Closed in feature `003-browser-smoke-harness` (2026-04-20). `.github/workflows/tests.yml` shipped — 14-line minimal workflow, `ubuntu-latest`, Node 20, invokes `bash tests/runner.sh`. No `npm install`, no `package.json`, Principle V preserved.

- **Current**: tests run locally via `tests/runner.sh`. No `.github/workflows/*` yet.
- **Fix**: add a GitHub Actions workflow running `node --test tests/` on push. Zero-dep, aligns with Principle V. ~20 minutes.

---

## 🧹 P5 — Technical debt / cleanup

### ~~D1. Compat shim `normalizeMortgageShape` in `calc/lifecycle.js`~~ — DONE (feature 005, 2026-04-20)

- **What was done**: `normalizeMortgageShape` + its call site deleted per feature 005 FR-025. `calc/getCanonicalInputs.js` now passes canonical mortgage shape directly.

### D2. Transitional aliases `p401kTradReal` / `p401kRothReal`

- **Where**: every `LifecycleRecord` carries these + their canonical counterparts `trad401kReal` / `rothIraReal`.
- **Fix**: remove after F2 + F4 (chart renderers renamed to canonical names).

### ~~D3. `coast-fire.js` fixture has a `TBD_LOCK_IN_T038` placeholder~~ — DONE (feature 005, 2026-04-20)

- **What was done**: Placeholder at `lifecycleCheckpoints[0].totalReal` replaced with canonical engine output `8_519_863.55` per feature 005 FR-026 / T058-T060. Fixture `notes` + file header doc updated.

### D4. `calc/studentLoan.js` is a thin wrapper around `computeMortgage`

- **Where**: `calc/studentLoan.js` delegates entirely to `calc/mortgage.js::computeMortgage`.
- **Option A**: leave as-is — the indirection documents intent.
- **Option B**: remove the module, have `calc/lifecycle.js` call `computeMortgage` directly for each student loan.
- **Recommendation**: leave as-is unless we're actively refactoring the module set for other reasons.

### D5. Generic DWZ fireAge display mismatch

- **Where**: inline reports "64 (28y 8m)"; chart rounds to 65; canonical reports 64 only.
- **Fix**: canonical fireCalculator could emit both `.fireAge` and `.fireAgeChartRounded`. Or the inline engine's chart could stop rounding. Decide during F2.

### D8. Canonical-engine HTML swap is rolled back — restore only after parity gates

- **Where**: `FIRE-Dashboard.html` + `FIRE-Dashboard-Generic.html` — both files now use the inline solver (restored from `FIRE-Dashboard - Legacy.html`) rather than the canonical engine via `calc/shims.js`. `calc/getCanonicalInputs.js`, `calc/shims.js`, and `calc/fireCalculator.js::evaluateFeasibility` remain on disk with their Node unit tests intact, but the HTML bootstrap no longer exposes `window._solveFireAge`, `window._evaluateFeasibility`, `window._runLifecycle`, `window.getCanonicalInputs`, or the 4 shim functions.
- **Why rolled back (2026-04-20)**: browser verification after feature 005 revealed 4 calculation-correctness regressions:
  1. **Country scenario selection had no effect on FIRE years** — all 10 scenarios returned identical output because `getInputs()` does not include `selectedScenario` (lives in module-scope global, line 2670 of RR HTML). Canonical adapter fell back to `'us'` for every user.
  2. **Home disposition (Sell at FIRE / Live in / Inherit) had no effect** — `inp.mortgage` was never populated because `mortgageEnabled` + `getMortgageInputs()` output also live in module-scope globals. Canonical saw no home at all.
  3. **Second-home toggle had no effect** — same root cause as #2 via `secondHomeEnabled`.
  4. **DWZ precision regression** — canonical mode=`'dieWithZero'` collapses to `'exact'` (integer-year precision), hiding the inline engine's month-precise DWZ solver (documented separately as D7).
- **Fix (future)**: before re-attempting the canonical swap, all of the following MUST be in place:
  1. **Context-aware adapter**: rewrite `calc/getCanonicalInputs.js` to accept a richer input shape that includes `selectedScenario`, mortgage config (including home disposition enum), second-home config, children-loan plan, actual SS earnings history. Either extend `getInputs()` in both HTML files to bundle all this into `inp`, or pass a separate `context` parameter alongside `inp`.
  2. **Canonical mortgage + home-disposition support**: `calc/lifecycle.js` must handle the three home-disposition modes (Sell at FIRE / Live in / Inherit) with proper rent-vs-mortgage deltas, home-sale proceeds at FIRE, and imputed housing costs.
  3. **Month-precise DWZ solver** (D7): implement a dedicated DWZ mode in `calc/fireCalculator.js` that returns fractional-year precision. Extend `FireSolverResult` with a `months` field; extend `shims.js::findFireAgeNumerical` to surface it.
  4. **Full parity test harness**: a parity fixture for every country × mode combination, asserting canonical output within tolerance of the inline engine's output for the same inputs. This closes the gap that let the current regression ship.
  5. **Browser-smoke gate in CI**: a real browser-driven test (Playwright or similar) that clicks through scenarios and home dispositions, asserting the FIRE number shifts. Would have caught this regression pre-merge.
- **Estimated effort**: 3–5 days. Do NOT re-attempt the canonical swap piecemeal; the above items together are the parity bar.

### D7. Canonical DWZ mode has no month-precise search — collapses to Exact

- **Where**: `calc/fireCalculator.js:138-145` — `dieWithZero` branch of `_evaluateFeasibilityFromLifecycle` is documented as "Without a dedicated die-with-zero withdrawal strategy (out of scope for this feature), dieWithZero collapses to 'earliest age at which every year is feasible' — identical to 'exact'." The shim `findFireAgeNumerical` always returns `months: 0`, so `_dwzPreciseCache` in both HTML files always holds a year-granular answer.
- **User-visible symptom (identified 2026-04-20)**: when `fireMode === 'dieWithZero'`, the dashboard reports the same integer-year retirement age as Exact. True DWZ would be month-precise AND would find an earlier retirement age whose lifecycle depletes the portfolio exactly at `endAge` (±tolerance), not the earliest year where `endBalance >= 0` (which leaves significant residual).
- **Regression origin**: pre-feature-005 the inline `findFireAgeNumerical(inp, annualSpend, 'dieWithZero')` implemented a dedicated month-precise solver. Feature 005 replaced that inline solver with a shim that delegates to the canonical engine — which never implemented real DWZ. The HTML now shows an honest "integer-year precision; month-precise search not yet implemented" note (feature 005 follow-up edit, 2026-04-20).
- **Fix (future)**: implement a month-precise DWZ search in `calc/fireCalculator.js`. Search strategy: binary-search (or linear scan with interpolation) over fireAge fractions; at each candidate age, run `runLifecycle` and find the fractional age where `endBalanceReal === 0` (with tolerance). Return `{fireAge, yearsToFire, monthsToFire, endBalanceReal ≈ 0}`. Requires extending the `FireSolverResult` shape to carry month precision, AND extending `shims.js::findFireAgeNumerical` to surface `r.months` from the canonical result rather than hard-coding `months: 0`.
- **Estimated effort**: ~4–6 hours (solver + shim wiring + tests + honest-note rewrite in both HTMLs).

### ~~D6. `isFireAgeFeasible` kept with `// TODO` in both HTML files~~ — DONE (feature 005, 2026-04-20)

- **What was done**: `findMinAccessibleAtFireNumerical` shimmed into `calc/shims.js` as the 4th glue-layer export (feature 005 FR-009). `isFireAgeFeasible` + 3 other dead inline helpers deleted from both HTML files per FR-008 / T026-T029. Caller audit pre-deletion confirmed zero orphan call sites.

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

- **B1 (~~Real/nominal mixing~~)** — Closed in feature `002-inline-bugfix` (2026-04-19). Investigated, no fix required. Original §C.1 audit claim contradicted by line-level evidence (Verdict A, 9/10 confidence). Record preserved in `specs/002-inline-bugfix/audit-B1-real-vs-nominal.md`.
- **B3 (~~Generic secondary-person ignored~~)** — Closed in feature `002-inline-bugfix` (2026-04-19). Pool summation was already correct (`pStocks = person1Stocks + person2Stocks` at Generic HTML L3480). Regression test added to `tests/baseline/inline-harness.test.js` locks the 7-year sensitivity so future edits can't silently break it.
- **B2 (~~Silent shortfall absorption~~)** — Closed 2026-04-20 via independent audit. Investigated, no fix required. Original §C.2 claim contradicted by line-level evidence (Verdict B, 9/10 confidence): signed balances ARE the feasibility signal by design. Record preserved in `specs/audits/B2-silent-shortfall.md`. Noted pattern: this is the third §C misdiagnosis in a row (B1 + B3 + B2 all reclassified on line-level re-audit).
- **F1 + T1 + T6 (~~Browser smoke harness + CI~~)** — Closed in feature `003-browser-smoke-harness` (2026-04-20). Shipped: `tests/baseline/browser-smoke.test.js` (RR + Generic + parity smokes), frozen defaults snapshots (`tests/baseline/rr-defaults.mjs`, `generic-defaults.mjs`), and `.github/workflows/tests.yml` (Node 20, ubuntu-latest, runs `bash tests/runner.sh` on every push + PR). First CI run caught a Node 20 glob-expansion bug on the runner script; fixed in `842464e`. Runner count: 77 → 80.
- **F2 (HTML canonical swap) — FEATURE 004 ATTEMPTED AND ABANDONED 2026-04-20.** Smoke/CI gate passed, but in-browser the dashboard showed NaN values, empty charts, and nonsensical FIRE numbers — every one of those symptoms proved a shim's `try/catch` caught a canonical throw and returned its safe fallback. The class-of-failure the smoke harness was supposed to catch STILL slipped through because the smoke tests the adapter against a hardcoded snapshot, not against shim-layer behavior with live DOM `getInputs()`. Branch `004-html-canonical-swap` deleted; full abandonment record and lessons preserved at `specs/004-html-canonical-swap/ABANDONED.md`. Retry lives in feature 005 (shim extraction + Node-testable shim-layer first).

---

## Done in feature 018 — Lifecycle Payoff Merge (2026-04-29)

- **US1 (P1 / MVP) — Mortgage strategy drives the lifecycle simulation**: replaced the old `pviLumpSumPayoff` checkbox with a 3-option radio (Prepay / Invest-keep-paying / Invest-lump-sum). New `getActiveMortgageStrategyOptions()` helper threads `mortgageStrategyOverride` through every `projectFullLifecycle` call site (chart render + FIRE-age search + audit). Lifecycle simulator reads strategy-aware monthly P&I from calc's per-year `amortizationSplit`. Default `'invest-keep-paying'` path bypasses the precompute (zero perf impact).
- **US4 (P2) — Sell-at-FIRE × strategy composition**: new `homeSaleEvent` and `postSaleBrokerageAtFire` outputs. Section 121 exclusion modeled (MFJ $500K / single $250K). Lump-sum trigger inhibited at age ≥ FIRE under `sellAtFire=true`. PvI brokerage chart shows green-star sell marker at FIRE; verdict banner Line 4 surfaces sale proceeds. Lifecycle truncates mortgage cash flow at FIRE when sale event present and seeds retirement-phase brokerage from `postSaleBrokerageAtFire[strategyKey]`.
- **US2 (P2) — Sidebar mortgage indicator**: `#sidebarMortgageStatus` element in both HTMLs. Reads `mortgageActivePayoffAge[strategyKey]` and surfaces a one-line "Mortgage: {strategy} · paid off at age {N}" indicator. Updates on every recompute.
- **US3 (P3) — FIRE verdict + ranker auto-react**: radio-change handler clears `fireAgeOverride = null` then re-runs both PvI recompute and `recalcAll()`. Audit `subSteps[]` flow verbatim from calc outputs (5 new v3 strings). `copyDebugInfo()` exposes `mortgageStrategy`, `mortgageActivePayoffAge`, `lumpSumEvent`, `homeSaleEvent`, `postSaleBrokerageAtFire`; `feasibilityProbe` records `activeMortgageStrategy` for LH-Inv-1 verifiability.
- **Calc module v3**: `LumpSumEvent` typedef extended with v3 `actualDrawdown` field (Option B); trigger threshold corrected to `investedI >= actualDrawdown` so brokerage cannot go negative. `paidOff` retains v2 semantics (= what bank receives). v3 contract updated; 50/50 fixture tests + 4/4 lifecycle handoff tests = 55/55 pass.
- **Lockstep delivery**: both HTMLs shipped together; sentinel-symbol audit confirms parity. 11 new translation keys (EN + zh-TW) bilingual.
- Spec / Plan / Tasks / CLOSEOUT: see [`specs/018-lifecycle-payoff-merge/`](./specs/018-lifecycle-payoff-merge/) — awaiting user browser-smoke per `quickstart.md` S1–S16 before merge to `main`.

## Done in feature 016 — Mortgage Payoff vs Invest (2026-04-28)

- **US1 MVP — chart + verdict + amortization split**: Read-only Plan sub-pill that visualizes whether prepaying the mortgage or investing extra cash yields more wealth year-by-year. Three new charts: Wealth Trajectory, "Where each dollar goes" (per-year interest+principal stacked-bar), Verdict banner with winner + dollar margin at FIRE-age and plan-end. Crossover marker drawn when the lines cross.
- **US2 — Factor Breakdown + Refi inputs + State-MID effective-rate override**: Factor card lists 7+ drivers (real-spread, time-horizon, LTCG drag, mortgage years remaining, etc.) with directional arrows. Optional planned mid-window refi (year + new rate + new term) shared by both strategies. Effective-rate override slider for state-MID approximation (verdict-only, doesn't change amortization).
- **Calc module**: `calc/payoffVsInvest.js` — pure UMD module with month-stepped simulation, refi handling, crossover detection via linear interpolation, factor evaluation. 12 fixture-locked unit tests in `tests/unit/payoffVsInvest.test.js` covering SC-002 / SC-003 / SC-008 / SC-009 / SC-010.
- **Lockstep delivery**: both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` shipped together. Bilingual EN+zh-TW for every new string. Tab router updated to register the new pill.
- **Read-only contract enforced**: pill never writes to FIRE-age, FIRE-number, scenario, snapshot CSV, or strategy ranker state. Toggle the slider freely; no other chart's numbers change.
- Spec / Plan / Tasks: see [`specs/016-mortgage-payoff-vs-invest/`](./specs/016-mortgage-payoff-vs-invest/) and its `CLOSEOUT.md`.

## Done in feature 015 — Calc-Engine Debt Cleanup (2026-04-27)

- **US1 Shortfall visibility on lifecycle chart**: red overlay + bilingual caption + audit row class + Copy Debug `hasShortfall` field. Closed.
- **US2 `tax-optimized-search` θ-sweep filters feasibility BEFORE ranking by tax**: 3-pass refactor (simulate → filter → rank). Closed.
- **US3 Per-strategy FIRE age finder + drag-skip guard**: shipped as Wave B. Per-strategy ages + drag-skip flag wired. Deeper recalc-orchestration restructure (use winner's per-strategy age as displayed) tracked as follow-up.
- **US4 Mode/Objective orthogonality** (silent DWZ override removed): `rankByObjective` rewritten — DWZ + Preserve uses `residualArea` desc, DWZ + Minimize Tax uses `cumulativeFederalTax` asc. Audit Strategy Ranking section displays the active sort-key chain in plain bilingual text. Closed.
- **US5 Objective label verification**: visible label was already accurate (`Pay less lifetime tax` / `繳最少終身稅`). No rename needed. Closed.
- **US6 Unified simulator (Step 1)**: `calc/simulateLifecycle.js` shipped with `noiseModel` reservation that throws on non-null. Future Monte Carlo can extend without re-touching the signature. Migration Steps 2-4 (parity-test, flip 4 call sites, delete 3 retired sims) tracked as follow-up.

## New backlog items from feature 015 follow-up

### B-015-6. ✅ DONE — Spending-floor pass in `taxOptimizedWithdrawal` (2026-04-27 evening)

The bracket-fill-smoothed strategy was treating spending as a budget cap rather than a floor. Pre-fix: when only Trad 401k remained pre-SS, strategy drew only ~$9k/year (smoothed cap) leaving ~$50k/year shortfall. Fix: Step 7.5 spending-floor pass draws additional Trad to fund spending. 17 new tests pin the behavior; 5 of 7 strategies were already correct (use `_drawByPoolOrder` fixed-point iteration), only the 2 going through `taxOptimizedWithdrawal` (bracket-fill default + tax-opt-search) needed the fix. Closed.

### B-015-1. US6 migration Steps 2-4 — retire `signedLifecycleEndBalance`, `projectFullLifecycle`, `_simulateStrategyLifetime`

Per `specs/015-calc-debt-cleanup/contracts/unified-simulator.contract.md` §2:
1. Parity-test every existing fixture against `simulateLifecycle()` — assert byte-equivalent outputs.
2. Flip chart renderer call site → run full suite.
3. Flip audit assembler call site → run full suite.
4. Flip strategy ranker call site → run full suite.
5. Flip per-strategy finder call site → run full suite.
6. Delete the three retired simulators only when all 4 call sites are flipped AND parity tests stay green AND audit cross-validation emits zero "different sim contracts" warnings.

### B-015-2. US3 deeper integration — winner's per-strategy FIRE age becomes displayed FIRE age

Today the displayed FIRE age is still produced by the Architecture-B `findFireAgeNumerical`. The audit shows per-strategy ages but the chart pipeline still uses the global age. Follow-up: restructure recalc to call `findPerStrategyFireAge` per strategy, then use winner's age as the displayed/chart age. Requires budget measurement (250ms recalc budget) — fall back to Option A (iterate-to-convergence) if budget breached.

### B-015-3. Playwright E2E specs for feature 015 user-facing behaviors

Spec'd in `specs/015-calc-debt-cleanup/contracts/*` and `quickstart.md` but not authored. Targets:
- `tests/e2e/shortfall-overlay.spec.ts` — pixel-sample chart canvas; verify caption bilingual toggle.
- `tests/e2e/strategy-orthogonality.spec.ts` — DWZ + Preserve vs DWZ + Tax produces ≥ $100 trajectory diff per row.
- `tests/e2e/recalc-convergence.spec.ts` — 2 consecutive recalcs produce byte-identical Copy Debug.
- `tests/e2e/objective-label-verification.spec.ts` — 3×3 cell verification fixture for US5 (preserved as a regression watchdog).

### B-015-4. Monte Carlo activation referencing `noiseModel` hook

When ready, extend `calc/simulateLifecycle.js` to interpret a non-null `noiseModel` per the JSDoc-documented planned shape: `{ returns: {distribution, mean, std}, inflation: {...}, lifespan: {...}, samples, seed? }`. Run `samples` trials, return percentile aggregates (p10/p50/p90).

### B-015-5. Manager-driven browser smoke walks on both HTML files

Remaining manual gate: open both files in a real browser, run the 5-step smoke per `CLAUDE.md > Browser smoke before claiming a feature "done"`, plus the wave-specific checks in `specs/015-calc-debt-cleanup/quickstart.md`. Cannot be automated.

---

## Done in feature 022 — Nominal-Dollar Display + Frame-Clarifying Comments + B-021 Carry-Forward (2026-05-01)

- **US1 (P1 / MVP) — Nominal-$ Book Value display across all 14 in-scope charts**: Switched the dashboard's display layer from real-$ (today's purchasing power) to nominal-$ (Book Value — what brokerage statements literally show on a future date). 14 in-scope charts/displays converted: Lifecycle, Withdrawal Strategy, Drawdown, Roth Ladder, Country comparison + deep-dive, Mortgage payoff, PvI brokerage trajectory + amortization split + verdict banner, Strategy ranker bar, Plan-tab Expenses pill (Income tax sub-row), KPI cards (FIRE NUMBER + Total at FIRE; Current Net Worth unchanged at year-0), verdict pill + verdict banner, drag-preview overlay, Audit-tab tables (per-column frame labels). Snapshots history chart deliberately untouched (already nominal historical balances). Tooltip companion line on every chart: "$X Book Value · ≈ $Y purchasing power". Caption per chart: "Book Value at {inflationRate}% assumed annual inflation". 6 new EN + zh-TW translation keys.
- **US2 (P1) — Frame-clarifying `// FRAME:` comments**: Every `calc/*.js` module + every inline simulator in both HTMLs annotated with the 4-category taxonomy (`real-$`, `nominal-$`, `conversion`, `pure-data`). Module-level `FRAME (feature 022 / FR-009)` headers document dominant frame + conversion sites. New meta-test `tests/meta/frame-coverage.test.js` enforces ≥95% qualifying-line annotation coverage on every commit. User's stated complexity hedge: future calc changes can't silently re-introduce a frame mismatch.
- **US3 (P1) — Hybrid-frame bug fix in `accumulateToFire.js` cash-flow residual**: Pre-fix residual mixed nominal income/spending with real-$ contributions, producing ~$8-15k pCash distortion over 11+ year horizons on RR-baseline. Post-fix: single-frame real-$ residual with `grossIncomeReal = annualIncomeBase × (1 + raiseRate − inflationRate)^t` and constant-real spending. Conservation invariant becomes well-defined. 8 new v4-FRAME unit tests; 0 fixture annotations needed thanks to defensive test design from features 020/021.
- **US4 (P2) — Country budget tier frame disambiguation**: Tooltip on country-budget tier display clarifies "Cost in today's $; the dashboard inflates this to your retirement year for projections". Taiwan `taxNote` string updated to mark "$33K AMT exemption" as today's $. No tier number changes.
- **US5 (P3) — Strategy ranker simulator-discreteness fix (B-021-1 RESOLVED)**: Quantize ranker age input to monthly precision in `_simulateStrategyLifetime` before iteration. E3 LOW finding count drops 17 → 1 (94% reduction). Single residual finding (`RR-pessimistic-frugal`) traces to `_chartFeasibility` discreteness, not the simulator — out of US5 strict scope. Tracked as B-022-1.
- **US6 (P3) — True fractional-year DWZ feasibility (B-021-2 / B-020-5 RESOLVED)**: Extended `simulateRetirementOnlySigned` to pro-rate the FIRE-year row by `(1 − m/12)` using linear convention `1 + r × (1 − m/12)`. `calc/fireAgeResolver.js` Edge Case 4 doc flipped from option (c) "UI display refinement" to option (b) "true fractional-year feasibility". New audit invariant family `month-precision-feasibility` (3 invariants × 92 personas × 3 modes = 276 cells; 0 findings on first run).
- **Central `recalcAll()` snapshot transformation**: Per Q5 clarification (Option B for robustness), the `bookValue` companion fields are populated centrally in `recalcAll()` via `_extendSnapshotWithBookValues`. Render functions consume `*BookValue` directly. New meta-test `tests/meta/snapshot-frame-coverage.test.js` enforces structural coverage — forgetting to read `*BookValue` becomes a visible bug, not a silent frame mismatch.
- **New module `calc/displayConverter.js`**: Pure UMD-classic-script helper exposing `toBookValue` / `toBookValueAtYearsFromNow` / `invertToReal`. 8 unit tests against IRS-style inflation tables.
- **Lockstep delivery**: both HTMLs shipped together. Test count: 449 → 478 (+29 net new tests, 1 intentional skip). Constitution VIII gate green throughout all 9 implementation phases.
- **US7 (P3 OPTIONAL) — Display toggle**: NOT implemented. Spec marked OPTIONAL with feedback-driven trigger; only ship if always-Book-Value display causes UX confusion in user feedback.
- Spec / Plan / Tasks / audit-report / CLOSEOUT: see [`specs/022-nominal-dollar-display/`](./specs/022-nominal-dollar-display/) — awaiting user browser-smoke (T099) before merge to `main`.

## New backlog items from feature 022 audit

### B-022-1. `_chartFeasibility` simulator-discreteness fix

**1 LOW finding (E3 — `RR-pessimistic-frugal`)**. US5 quantized `_simulateStrategyLifetime` but didn't extend the same monthly-precision quantization to `_chartFeasibility` (which calls `projectFullLifecycle(inp, ...)` with raw inputs). Fix: apply `Math.floor(age * 12) / 12` quantization to `_chartFeasibility`'s inputs before invoking `projectFullLifecycle`. Trivial fix (~30 min); deferred only because it's outside US5's strict scope.

### B-022-2. Pre-existing `scenario.tax.china` duplicate-key cleanup

`scenario.tax.china` is defined twice in the EN block of `FIRE-Dashboard.html` (line 5940 has zh string; line 5941 has EN string). Pre-existing bug, not introduced by feature 022. Fix: deduplicate the key. ~5 min.

### B-022-3. Healthcare delta chart frame review

`renderHealthcareCard` outputs HTML cards (not Chart.js) showing today's-$ healthcare costs as a user reference. Currently displays real-$. Decide whether to add a frame note tooltip (US4-style), convert to Book Value display per FR-001(e), or leave as today's-$ user-reference display. User-decision needed; defer to feature 023 spec discussion.

---

## Done in feature 021 — Tax Expense Category + Audit-Harness Carry-Forward (2026-05-01)

- **US3 (P1 / MVP-prerequisite) — Progressive bracket calc refactor**: `calc/accumulateToFire.js` v2 → v3. New `_computeYearTax` helper computes federal tax via IRS 2024 progressive brackets (10/12/22/24/32/35/37%) and FICA via SSA 2024 constants (SS 6.2% to wage base $168,600, Medicare 1.45%, additional Medicare 0.9% over $200k single / $250k MFJ). New per-row outputs: `ficaTax`, `federalTaxBreakdown`, `ficaBreakdown`. Flat-rate `taxRate` override path preserved for backwards-compat. New pure-data module `calc/taxBrackets.js` ships the 2024 bracket constants.
- **US3 Investment-tab Auto toggle**: New "Auto" checkbox next to existing `taxRate` slider in both HTMLs. Default ON for new users / blank `taxRate`; OFF for existing users with non-zero saved `taxRate`. When ON, slider grays out and shows "Auto: 15.8%" effective rate label. Persisted via new localStorage key `taxRateAutoMode`. EN + zh-TW translations.
- **US1 (P1 / MVP) — Income tax sub-row in Plan-tab Expenses pill**: New top-level **Tax** category with **Income tax** sub-row. Read-only, lock icon, monthly $ + effective rate %. Reads `(federalTax + ficaTax) / 12` from accumulation snapshot — single source of truth per Constitution III. Updates within one animation frame on slider drag. Tooltip explains it's already deducted on income side and does NOT add to monthly spend. Helper module `calc/taxExpenseRow.js`.
- **US2 (P2) — Other tax manual entry**: Second sub-row under Tax category. Manually editable, sums into `monthlySpend`. Defaults to $0 for ALL countries (the per-country `comfortableSpend` / `normalSpend` budget tiers in `scenarios` array already absorb foreign tax owed by US-citizen retirees per Q2 clarification). Persisted via new localStorage key `exp_tax_other`. The scenarios-array `taxNote` strings surface alongside the row when `selectedScenario !== 'us'`.
- **US4 (P3) — Strategy ranker hysteresis (B-020-4 carry-forward)**: `calc/strategyRanker.js` adds ±0.05yr equivalent score-margin hysteresis when `previousWinnerId` is provided. New helpers `_newWinnerBeats`, `_scoreDeltaToYears`, `_resolvePrimarySortKey`. PRESERVES Constitution IX (Mode/Objective orthogonality) — hysteresis is a tie-break refinement, not a sort-key change. NOTE: E3 audit findings remained at 17 LOW after fix because the audit's ±0.01yr perturbations cross simulator integer-accumulation-year boundaries (root cause is simulator-discreteness, not ranker noise) — see B-021-1 carry-forward.
- **US5 (P2) — Audit harness in CI (B-020-6 carry-forward, RESOLVED)**: `.github/workflows/audit.yml` runs validation-audit harness on every push + PR. Posts finding counts as PR comment. CRITICAL fails the build; HIGH warns. 10-min timeout. awk parser sums across multiple harness summary lines.
- **US6 (P3) — Harness fireAge ≤ endAge clamp (B-020-7 carry-forward, RESOLVED)**: One-line clamp in `tests/unit/validation-audit/harness.js` clears the lone HIGH C3 finding (`RR-edge-fire-at-endage`). Regression test pinned in `cross-chart-consistency.test.js`. **SC-009 (zero HIGH post-fixes) fully satisfied for the first time since feature 020 audit.**
- **US7 (P3 OPTIONAL) — True fractional-year DWZ feasibility (B-020-5 carry-forward, DEFERRED)**: Investigated; deferred to feature 022 with 6 spec hooks documented. Three cross-cutting risks (monotonic-flip stability, growth-multiplier convention, sub-iteration split) exceed the spec § A4 "~1 day" budget.
- **New audit invariant family** `tax-bracket-conservation` (`tests/unit/validation-audit/tax-bracket-conservation.test.js`): 5 invariants TBC-1 through TBC-5 running 460 cells (92 personas × 5). 0 findings — the new bracket math passes all conservation invariants on first run.
- **Lockstep delivery**: both HTMLs shipped together. Test count: 414 → 450 (+36 net new tests, 1 intentional skip). Constitution VIII gate green throughout.
- Spec / Plan / Tasks / audit-report / CLOSEOUT: see [`specs/021-tax-category-and-audit-cleanup/`](./specs/021-tax-category-and-audit-cleanup/) — awaiting user browser-smoke (T088) before merge to `main`.

## New backlog items from feature 021 audit

### ~~B-021-1. Strategy ranker simulator-discreteness fix~~ — RESOLVED in feature 022 (2026-05-01)

Quantize-to-monthly-precision fix shipped in `_simulateStrategyLifetime` at commit `395f8e2` (and `71b3c25` for HTML changes). E3 LOW finding count dropped 17 → 1 (94% reduction). Single residual finding (`RR-pessimistic-frugal`) traces to `_chartFeasibility` discreteness, not the simulator — out of US5 strict scope. Carried forward to B-022-1 as a trivial follow-up fix.

### ~~B-021-2. US7 fractional-year DWZ feasibility (carries B-020-5)~~ — RESOLVED in feature 022 (2026-05-01)

Shipped in feature 022 US6 at commit `71b3c25`. `simulateRetirementOnlySigned` extended to pro-rate FIRE-year row by `(1 − m/12)` using linear convention. `calc/fireAgeResolver.js` Edge Case 4 doc flipped from option (c) to option (b). New audit invariant family `month-precision-feasibility` (3 invariants × 92 personas × 3 modes = 276 cells; 0 findings on first run). All 6 spec hooks resolved.

---

## Done in feature 020 — Validation Audit + Cash-flow Rewrite (2026-04-30)

- **US4 (P1 / MVP) — Cash-flow calc engine rewrite**: `calc/accumulateToFire.js` v2 algorithm tracks per-year `grossIncome`, `federalTax`, `annualSpending`, `pretax401kEmployee`, `empMatchToTrad`, `stockContribution`, `cashFlowToCash`, `cashFlowWarning`. Tax base per IRS Topic 424 (`(grossIncome − pretax401kEmployee) × taxRate`); employer match flows direct to Trad. Override hook: `pviCashflowOverrideEnabled` + `pviCashflowOverride`. Negative residual clamps cashFlow to $0 + emits `cashFlowWarning='NEGATIVE_RESIDUAL'`. Conservation invariant verified for RR-baseline ($0 exact).
- **US4 Wave 2 — Plan tab UI**: new "Annual cash flow to savings" input + override toggle (mirrors `pviEffRateOverrideEnabled` pattern); negative-residual amber warning callout (auto-shows when any pre-FIRE row has cashFlowWarning, auto-clears when residual goes positive); `monthlySavings` relabeled "Monthly Stock Contribution" with new tooltip clarifying post-tax brokerage semantics. 6 new EN + zh-TW translation keys; Translation Catalog updated.
- **US4c (P2) — Month-precision FIRE-age header + verdict**: new `calc/fireAgeResolver.js` UMD module with year-then-month two-stage search + monotonic-flip stability fallback. KPI card renders "X Years Y Months" when month-precision applies; verdict pill renders "FIRE in X years Y months". Edge Case 4 default = option (c): UI-display refinement only; year-level feasibility unchanged.
- **US1+US2+US3+US5 — Validation audit harness**: 5 invariant test files (mode-ordering, end-state-validity, cross-chart-consistency, drag-invariants) running 1,150+ persona×invariant cells across 92 personas. After harness wiring fixes (`SAFE_TERMINAL_FIRE_RATIO` + persona-aware DOC_STUB), audit produced 38 real findings: 0 CRITICAL ✓, 12 HIGH (DEFERRED to feature 021), 6 MEDIUM, 20 LOW.
- **US6 (P3) — Withdrawal strategy survey**: `specs/020-validation-audit/withdrawal-strategy-survey.md` — 6 strategies (4% rule, VPW, Guyton-Klinger, Bucket, Vanguard Dynamic Spending, RMD-based) with definitions, citations, model-fit assessments, recommendations. **RMD-based recommended IMPLEMENT-NEXT** (only strategy that ships on existing deterministic chassis). Others DEFER pending Monte Carlo or are SKIP.
- **Lockstep delivery**: both HTMLs shipped together. Test count: 397 unit + 12 audit harness = **409 tests, 0 failures**. Constitution VIII gate green.
- Spec / Plan / Tasks / audit-report / CLOSEOUT: see [`specs/020-validation-audit/`](./specs/020-validation-audit/) — awaiting user browser-smoke (T080) before merge to `main`.

## New backlog items from feature 020 audit

### ~~B-020-1. DWZ shortfall semantics harmonization~~ — RESOLVED in Phase 11 (2026-04-30)

**Status**: ~~bundled feature 021~~ — fixed in-place during feature 020 Phase 11. **Bundles B3 (8 HIGH findings) + E2 (5 MEDIUM findings) + C2 (1 MEDIUM, incidental) + 3 of E3 (LOW, incidental).** Root cause was NOT the originally-described "chart sim flags when a single pool can't cover even when cross-pool covers" — that mischaracterized the issue. Actual root cause: all three feasibility gates (DWZ, Safe, Exact) iterated chart rows checking `row.total < floor` only; chart `total` sums ALL pools including locked Trad 401k pre-59.5, so the check passed even when `taxOptimizedWithdrawal`'s pre-unlock branch returned `shortfall > 0` (genuinely couldn't fund spend from accessible cash + stocks). Additionally, the DWZ month-precise interpolation in `findFireAgeNumerical` assumed an endBalance-monotonic crossover, which broke once `hasShortfall` joined the gate. Fix: added `if (row.hasShortfall === true) return false;` to all three gate per-row loops in both `FIRE-Dashboard.html` (DWZ ~8966, Safe ~9025, Exact ~8985) and `FIRE-Dashboard-Generic.html` (parallel sites); guarded DWZ interpolation on `prevSim.endBalance < 0`. Regression test in `tests/unit/validation-audit/end-state-validity.test.js` (`B3 regression` block). Tests: 410/410 passing post-fix.

### ~~B-020-2. Bracket-fill parity in stress regimes~~ — RESOLVED in Phase 11 (2026-04-30)

**Status**: ~~bundled feature 021~~ — fixed in-place during feature 020 Phase 11. **Bundles 3 of 4 C3 HIGH findings** (`RR-age-late`, `Generic-couple-late`, `RR-late-prepay` and `RR-edge-already-retired`). The "stress regime" framing turned out to be a misdiagnosis; root cause was NOT bracket-fill smoothing or LTCG handling. Actual root cause: `signedLifecycleEndBalance` (FIRE-Dashboard.html:8635 / Generic:9001) subtracted `mtg.downPayment + mtg.closingCosts` (and equivalent for second-home) **unconditionally** from `pCash`, allowing it to go negative when the buy-in fell during the retirement phase (`yrsToFire < buyInYears`). That negative cash compounded at 1.005 and skewed subsequent retirement-phase `taxOptimizedWithdrawal` calls against `projectFullLifecycle`'s clamp-to-zero invariant, producing systematic ~$575/year drift (cumulative $76k–$139k over a 47-year plan). Fix: aligned signed sim's upfront-cost deduction with chart's safe pattern — subtract from cash up to zero, take remainder from `Math.max(0, pStocks - remainder)`. Applied to buying-now upfront, retirement-loop buy-in, and second-home delayed-purchase branches in both HTMLs. Regression test in `tests/unit/validation-audit/cross-chart-consistency.test.js` (`Regression — C3 fix` block) pins the 3 affected personas at delta ≤ $1000. Tests: 411/411 passing post-fix.

**Remaining 1 DEFERRED**: `RR-edge-fire-at-endage` (delta $74,616) — degenerate harness edge case where persona has `endAge: 70, fireAge: 75, annualSpend: 200000` (explicitly designed infeasible). Harness `_resolveFireAge` falls back to `currentAge + safeYears = 75 > endAge`. This is a harness wiring issue, not a calc bug; cannot arise from real user inputs (UI clamps `fireAge ≤ endAge`). Tracked under B-020-7 below.

### ~~B-020-3. Already-retired verdict pill UX~~ — RESOLVED incidentally in Phase 11 (2026-04-30)

**1 MEDIUM finding (C2)**. `RR-edge-already-retired` (currentAge=65 ≥ planAge) showed pill 99% / progress card 108.9% — formula divergence. Cleared as a side effect of the B-020-1 fix (gate semantics tightening). The standalone "dedicated already-retired pill format" UX item remains a polish backlog item but is not blocking the audit.

### ~~B-020-4. Strategy ranker integer-year hysteresis~~ — PARTIALLY RESOLVED in feature 021 (2026-05-01); CARRIED TO B-021-1

**17 LOW findings (E3)**. Hysteresis SHIPPED in feature 021 per FR-018 (±0.05yr equivalent threshold) at commit `9f40bc1`, but E3 finding count remained 17 because the audit's ±0.01yr perturbations cross simulator integer-accumulation-year boundaries (yrsToFire = fireAge − age; subtracting 0.01yr adds a full extra year). Score deltas observed: 0.08–11.44 years — far above the 0.05yr threshold. Hysteresis is correctly shipped; the simulator-discreteness fix is now tracked as B-021-1.

### ~~B-020-5. Phase 4 Edge Case 4 — true fractional-year DWZ feasibility~~ — DEFERRED in feature 021; CARRIED TO B-021-2

Investigated in feature 021 US7 (`commit 09c547d`). Three cross-cutting risks surfaced (monotonic-flip stability under fractional ages, growth-multiplier convention choice, sub-iteration split at age 59.5 / ssClaimAge thresholds) that require a dedicated spec, not a phase-9 carry-forward. 6 feature-022 spec hooks documented in `specs/021-tax-category-and-audit-cleanup/audit-report.md` Phase 9 deferral section. Carried forward to B-021-2.

### ~~B-020-7. Harness fireAge bound enforcement~~ — RESOLVED in feature 021 (2026-05-01)

**1 HIGH finding (C3 — `RR-edge-fire-at-endage`)** cleared at commit `b14f369`. Harness's `findFireAgeNumerical` invocation now clamps `fireAge ≤ endAge` to mirror the live UI behavior. C3 invariant count drops 1 → 0; SC-009 (zero HIGH post-fixes) fully satisfied for the first time since feature 020 audit.

### ~~B-020-6. Audit harness drives in CI~~ — RESOLVED in feature 021 (2026-05-01)

`.github/workflows/audit.yml` shipped at commit `85af431`. Runs validation-audit harness on every push + PR. Posts finding counts as PR comment via `gh pr comment`. CRITICAL fails the build; HIGH emits warning. 10-minute timeout. awk-based finding-count parser sums across multiple harness summary lines (handles 6+ test files).
