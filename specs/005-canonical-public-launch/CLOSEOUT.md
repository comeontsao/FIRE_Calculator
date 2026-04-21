# Feature 005 Closeout — Canonical Engine Swap + Public Launch

**Status**: Shipped with US1 scope correction. Inline solver restored as authoritative; canonical engine artifacts retained for future re-swap (see BACKLOG §D8).
**Date**: 2026-04-20 (initial) · 2026-04-20 (US1 rollback)
**Branch**: `005-canonical-public-launch`

## ⚠️ US1 scope correction (2026-04-20)

After initial merge, browser smoke on both dashboards revealed 4 calculation-correctness regressions caused by the canonical-engine swap:

1. **Country scenario** (10 options: US / Taiwan / Japan / Thailand / Malaysia / Singapore / Vietnam / Philippines / Mexico / Costa Rica / Portugal) had **no effect on FIRE years** — all returned identical output.
2. **Home disposition** (Sell at FIRE / Live in / Inherit) had **no effect on FIRE years** — usually a ~10-year swing.
3. **Second-home toggle** had no effect.
4. **DWZ mode** collapsed to Exact integer-year precision instead of the inline engine's month-precise solver.

**Root cause**: `calc/getCanonicalInputs.js` reads only the `inp` object returned by `getInputs()`. But `selectedScenario`, `mortgageEnabled`, `secondHomeEnabled`, mortgage/home-disposition config, and DWZ precision state all live in **module-scope globals** outside `inp`. The inline solver closes over those globals directly; the canonical adapter cannot see them.

**Remediation (executed 2026-04-20)**:
- Restored 8 inline solver functions from `FIRE-Dashboard - Legacy.html` into both HTML files (lockstep): `taxAwareWithdraw`, `yearsToFIRE`, `signedLifecycleEndBalance`, `isFireAgeFeasible`, `_evaluateFeasibilityAtAge` (minimal wrapper), `findFireAgeNumerical`, `findMinAccessibleAtFireNumerical`, `_legacySimulateDrawdown`.
- Un-wired the canonical engine from both HTML module bootstraps — bootstrap now only imports `chartState` + `makeInflation` (pre-feature-005 behavior).
- Rewrote `_computeDeficitReal` to use inline `signedLifecycleEndBalance` — the deficit banner is now driven by the inline solver.
- Reverted the DWZ precise-note wording to the legacy month-precise format (the inline solver produces real months precision).
- **Retained ALL other feature 005 deliverables**: disclaimer, LICENSE, README, index.html, PUBLISH.md, privacy scrub, KPI chartState subscribers + `—` placeholder, infeasibility deficit display wiring, Process Lessons in `CLAUDE.md`, coast-fire fixture lock, SPECKIT pointer.
- Added BACKLOG §D8 with explicit parity gates for any future canonical-swap attempt.

**Canonical engine artifacts retained** (not wired into HTML, still Node-tested):
- `calc/shims.js` — 4 shims + `tests/unit/shims.test.js` (4 fallback cases, green).
- `calc/getCanonicalInputs.js` — production adapter.
- `calc/fireCalculator.js::evaluateFeasibility` — named export.
- `tests/baseline/browser-smoke.test.js` — retargeted at production adapter; continues to gate canonical-engine behavior at the Node level.

**Net state**: the inline solver is authoritative in production (as before feature 005). The canonical engine is Node-testable but dormant in the HTML until the D8 parity work is done.

---

This closeout summarizes what shipped, what's deferred, and the hand-off to
the user for the 2-step public launch.

---

## What shipped

### US1 — Canonical engine swap that actually works in the browser (P1 MVP)

- **`calc/shims.js`** (NEW, 4 exports): Node-testable glue layer. Each shim
  wraps a canonical call with `try/catch` + documented fallback +
  `[<shim-name>]` prefix logging. Allowlisted in
  `tests/meta/module-boundaries.test.js` as a glue module (permitted to read
  `window.*` at call time; every other `calc/*.js` stays strict).
- **`calc/getCanonicalInputs.js`** (NEW): pure production adapter — auto-detects
  RR vs Generic shape, null-guards `personB`, passes mortgage shape through
  directly, `Object.freeze()`s output.
- **`calc/fireCalculator.js`** (EDIT): `evaluateFeasibility({inputs, fireAge,
  helpers}) → boolean` restored as a named export.
- **HTML bootstrap wiring** (both files, lockstep): `solveFireAge`,
  `evaluateFeasibility`, `runLifecycle`, `getCanonicalInputs`, and all 4
  shims are exposed on `window`. `fireMode` window-synced at 3 sites in each
  file.
- **Dead helpers deleted** (both files, lockstep): `isFireAgeFeasible`,
  `signedLifecycleEndBalance`, `taxAwareWithdraw`, `_legacySimulateDrawdown`,
  plus the 4 old inline shim functions that are now window-exposed from the
  module.
- **`normalizeMortgageShape`** deleted from `calc/lifecycle.js` (FR-025).
- **`tests/unit/shims.test.js`** (NEW): 4 fallback tests — one per exported
  shim — stub `window.getCanonicalInputs` to throw, assert documented
  fallback value + `[<shim-name>]` prefix. Closes the gap that let feature 004's
  regression escape to the browser.
- **`tests/baseline/browser-smoke.test.js`** (RETARGETED): imports
  `getCanonicalInputs` from the production module; prototype adapter deleted.

### US2 — Legal/CYA disclaimer (P1)

- Disclaimer `<footer class="disclaimer">` block added to both HTML files in
  lockstep. 2 new `data-i18n` keys (`disclaimer.intro`, `disclaimer.body`)
  populated in `FIRE-Dashboard Translation Catalog.md` for EN + zh-TW.
- CSS uses only existing tokens (`--card`, `--text-dim`, `--border` — the
  last substituted for the spec-referenced `--muted` which doesn't exist in
  the codebase).

### US3 — Publish-ready artifacts (P1)

- **`LICENSE`**: standard MIT, `Copyright (c) 2026 Roger Hsu` (was already in
  place).
- **`index.html`** (NEW, at repo root): ~15-line meta-refresh redirect to
  `FIRE-Dashboard-Generic.html`.
- **`README.md`** (OVERWROTE stub): 9 required sections — title,
  description, live demo, features, run locally, tech, license, contributions,
  disclaimer (full text reproduced).
- **`PUBLISH.md`** (NEW, at repo root): 2-step checklist with preconditions +
  rollback. Step 1 deletion list enumerates `FIRE-Dashboard.html`,
  `FIRE-snapshots.csv`, `tests/baseline/rr-defaults.mjs`, plus additional
  RR-specific test dependencies flagged by the privacy scrub.
- **Privacy scrub** (`specs/005-canonical-public-launch/privacy-scrub.md`):
  full per-file audit table. Findings remediated in `FIRE-Dashboard-Generic.html`
  (legacy credits footer — name + email removed; replaced with open-source
  attribution + GitHub Issues direction), `tests/baseline/generic-defaults.mjs`,
  `tests/baseline/inputs-generic.mjs`, `tests/fixtures/types.js` (all comment
  rephrases).

### US4 — UX polish (P2)

- **Infeasibility deficit** now surfaces ` Short by $<amount>` when solver
  returns `feasible: false` with a numeric deficit. Aggregate deficit computed
  inline as MAX across infeasible years. Both HTML files, lockstep.
- **KPI cards** (Years to FIRE, FIRE Net Worth, FIRE Number, Progress %)
  migrated to `renderKpiCards(state)` registered as a `cs.onChange(...)`
  subscriber. Every value gated on `Number.isFinite(...) ? formatted : '—'`
  (FR-024 placeholder on NaN / canonical throw).

### US5 — Tech debt + process + docs (P3)

- `tests/fixtures/coast-fire.js`: `TBD_LOCK_IN_T038` placeholder replaced with
  canonical engine output `8_519_863.55`. Stale commentary removed.
- **`CLAUDE.md`** gained `## Process Lessons` section with three subsections:
  "Caller-audit before extraction", "Shim defense-in-depth", "Browser smoke
  before claiming a feature done".
- **SPECKIT pointer** (CLAUDE.md top block) at `specs/005-canonical-public-launch/`.
- Stale comment in `tests/unit/lifecycle.test.js` referencing
  `TBD_LOCK_IN_T038` cleaned up.

---

## Test runner state

```
# tests 84
# pass 83
# fail 0
# skipped 1  (pre-existing US4 bidirectional meta-skip from feature 003)
```

Stable throughout the feature. Wall-clock ~700-900 ms.

## Module-boundaries meta-test

- Principle II forbidden-token scan: every `calc/*.js` except the allowlisted
  glue `calc/shims.js` stays strict (no `window`, `document`, etc.).
- Principle VI Inputs/Outputs/Consumers header scan: every `calc/*.js`
  including `shims.js` satisfies the 3-field header requirement.

## Known orphans (minor follow-ups)

- `simulateRetirementOnlySigned` in both HTML files is now orphan (was only
  called by the deleted inline `findMinAccessibleAtFireNumerical`). Safe to
  delete in a follow-up commit if desired — not shipped in this feature to
  keep the scope surgical.
- `computeMortgage` import in `calc/lifecycle.js` removed as part of
  `normalizeMortgageShape` cleanup.

---

## Deferred / out of scope

- **F3 (RR/Generic full parity test harness)**: not addressed.
- **F4 (projectFullLifecycle canonical rewrite + bidirectional chart ↔ module
  annotations)**: out of scope per FR-010.
- **B4 (Monte Carlo determinism)**: separate backlog item.
- **jsdom / Playwright integration testing**: not added — Principle V
  preserved.

---

## User hand-off: browser verification + PUBLISH.md execution

### Browser smoke verification (BEFORE merging)

⚠️ This gate was NOT closed by Engineers (static environment couldn't open a
browser). The Manager or User MUST close it:

1. Serve the repo locally: `python -m http.server 8000` (ES modules require
   HTTP, not `file://`).
2. Open `http://localhost:8000/FIRE-Dashboard.html` in Chrome/Firefox/Safari.
3. Open DevTools → Console.
4. Wait 2 seconds for cold load.
5. **Confirm**: every KPI card shows a numeric value (NOT "Calculating…",
   NOT `NaN`, NOT `$0`, NOT `—`).
6. **Confirm**: console has zero red errors; zero `[<shim-name>] canonical
   threw:` messages.
7. Repeat for `http://localhost:8000/FIRE-Dashboard-Generic.html`.
8. Repeat root-redirect: `http://localhost:8000/` → confirm redirect within
   1 s to Generic dashboard.
9. Load an infeasible scenario ($20k/month spend); confirm `Short by $X`
   surfaces; return to feasible; confirm element clears.
10. Drag FIRE marker; confirm KPIs + chart marker update same frame.
11. Toggle EN ↔ 中文; confirm disclaimer translates.

**If any of the above fails**: this is feature 004's class. DO NOT merge.
File a follow-up issue and diagnose before proceeding.

### Shim-revert drill (optional but recommended before merge — SC-004)

1. Edit `calc/shims.js`: remove the `try/catch` wrapper from any one shim.
2. Run `bash tests/runner.sh`. The matching shim test MUST fail with a named
   message.
3. Revert the edit. Confirm re-green.

### PUBLISH.md execution (AFTER merge)

See `C:\Users\roger\Documents\GitHub\FIRE_Calculator\PUBLISH.md`. Two steps:

- **Step 1**: delete RR files + push.
- **Step 2**: flip repo visibility to public + enable GitHub Pages.

Ordering is safety-critical — Step 1 before Step 2.

---

## Files created / modified

### Created
- `calc/shims.js`
- `calc/getCanonicalInputs.js`
- `index.html`
- `PUBLISH.md`
- `tests/unit/shims.test.js`
- `specs/005-canonical-public-launch/*` (entire spec directory)

### Modified
- `calc/fireCalculator.js` (restored `evaluateFeasibility` export)
- `calc/lifecycle.js` (deleted `normalizeMortgageShape` + call site)
- `FIRE-Dashboard.html` (bootstrap expansion, disclaimer, KPI subscribers,
  deficit wiring, dead-helper deletions, `fireMode` sync)
- `FIRE-Dashboard-Generic.html` (all of the above LOCKSTEP, plus
  legacy-footer scrub)
- `FIRE-Dashboard Translation Catalog.md` (2 new disclaimer keys × 2 locales)
- `tests/meta/module-boundaries.test.js` (glue-layer allowlist for shims.js)
- `tests/baseline/browser-smoke.test.js` (retargeted at production adapter)
- `tests/baseline/generic-defaults.mjs` (comment scrub)
- `tests/baseline/inputs-generic.mjs` (comment scrub)
- `tests/fixtures/coast-fire.js` (TBD_LOCK_IN_T038 locked)
- `tests/fixtures/types.js` (JSDoc scrub)
- `tests/unit/lifecycle.test.js` (stale TBD comment cleaned)
- `README.md` (overwrote stub with public-facing content)
- `CLAUDE.md` (Process Lessons + SPECKIT pointer)
- `BACKLOG.md` (F2, U1, U2, D1, D3, D6 marked closed)

### Untouched (intentional)
- `calc/` — every module except `fireCalculator.js`, `lifecycle.js`, `shims.js`,
  `getCanonicalInputs.js` was not modified.
- `FIRE-snapshots.csv` — RR snapshot history; user deletes in PUBLISH.md Step 1.
- `projectFullLifecycle` and all chart renderers — FR-010 out-of-scope.

---

## Principle compliance summary

| Principle | Status | Notes |
|---|---|---|
| I. Dual-Dashboard Lockstep (NON-NEGOTIABLE) | ✅ | 11 lockstep pairs executed; Frontend reports byte-parallel edits |
| II. Pure Calculation Modules | ✅ | `shims.js` is glue-layer allowlisted; every other calc module stays strict |
| III. Single Source of Truth for State | ✅ | KPI cards now subscribe to `chartState.onChange` (strengthens adherence) |
| IV. Gold-Standard Regression Coverage (NON-NEGOTIABLE) | ✅ | 4 shim fallback unit tests close the feature-004 gap |
| V. Zero-Build Zero-Dep | ✅ | Node built-ins only; zero new deps; no `package.json` |
| VI. Chart ↔ Module Contracts | ✅ | Renderers untouched; Consumers lists preserved |

Feature 005: ready for Manager / User to execute the browser-verification
gate, then merge and run PUBLISH.md.
