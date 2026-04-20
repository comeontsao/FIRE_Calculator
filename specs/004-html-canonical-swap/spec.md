# Feature Specification: HTML Canonical-Engine Swap (Narrow / U2B-4a Revisited)

**Feature Branch**: `004-html-canonical-swap`
**Created**: 2026-04-20
**Status**: Draft
**Input**: User description: "Swap both HTML dashboards from their inline calc engine to the canonical `calc/*.js` modules, starting with the narrow U2B-4a scope: bootstrap + production `getCanonicalInputs()` adapter + shim `yearsToFIRE` / `findFireAgeNumerical` / `_evaluateFeasibilityAtAge` to call canonical + delete the dead pure-feasibility inline helpers. `projectFullLifecycle` stays inline; chart renderers unchanged. The feature 003 browser smoke harness gates every merge, replacing its `_prototypeGetCanonicalInputs` prototype with the production adapter. U2B-4b (lifecycle swap) and U2B-4c (renderer rewrite) deferred to later features."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - FIRE age KPIs are now computed by the canonical engine (Priority: P1)

A Roger & Rebecca user opens the dashboard and sees the "Years to FIRE" and "FIRE Age" numbers. Under this feature those numbers are produced by `calc/fireCalculator.js`'s `solveFireAge` — the same canonical engine the test harness locks — instead of the ad-hoc inline `findFireAgeNumerical`. Every KPI card that references FIRE age reads the same result from the same solver. If a future refactor accidentally breaks the canonical engine or the adapter, the feature 003 browser smoke harness fails in CI before any regression ships.

**Why this priority**: This is the feature's primary user-visible deliverable. It also fixes — where the canonical engine is meaningfully different — the two latent bugs feature 002 investigated and the ones feature 005 will investigate (B2). The number shift is documented and accepted per baseline §C.5; the gate is that it ships only when the smoke harness proves the integration doesn't break the dashboard.

**Independent Test**: Open `FIRE-Dashboard.html` in a browser; the KPI cards render valid numbers; no "Calculating..." frozen state (the failure mode that killed U2B-4a in feature 001). DevTools console shows no unhandled errors. Change any input (spend, return rate, etc.); KPIs re-render within a frame. Same on Generic.

**Acceptance Scenarios**:

1. **Given** `FIRE-Dashboard.html` loaded fresh in a browser, **When** the page finishes initial calculation, **Then** every KPI card (Years to FIRE, FIRE Age, FIRE Net Worth, Progress %) shows a valid numeric value within 2 seconds of page load. No card stuck on "Calculating..." or similar placeholder.
2. **Given** Generic loaded fresh, **When** initial calculation finishes, **Then** same as 1.
3. **Given** the dashboard in its settled state, **When** the user changes the `Annual Spend` slider, **Then** every FIRE-age-dependent KPI re-computes within a single animation frame using the canonical solver (`chartState.setCalculated` is called after `solveFireAge` returns).
4. **Given** the feature 003 smoke harness exists, **When** a developer accidentally breaks the production `getCanonicalInputs()` adapter (e.g., omits a required canonical Inputs field), **Then** the local test runner + CI both fail with a named-field message before any commit lands on `main`. This is the guarantee the earlier U2B-4a attempt was missing.

---

### User Story 2 - Dead inline helpers are removed (Priority: P2)

A developer reading the HTML files sees a smaller inline-calc surface. The four pure-feasibility helpers (`signedLifecycleEndBalance`, `taxAwareWithdraw`, `isFireAgeFeasible`, `_legacySimulateDrawdown`) whose callers are now all shimmed through to canonical are DELETED. `projectFullLifecycle` and the other non-solver helpers (scenario cards, KPI-display math, chart data prep) stay — that's U2B-4b / U2B-4c territory for later features.

**Why this priority**: Secondary. Dead-code removal tightens review surface and prevents a future author from accidentally calling a shimmed-out helper. But deletion is safe only after the shims are proven working (US1's tests gate this).

**Independent Test**: Grep the HTML files for the four helper function names; zero hits. Grep for any other remaining reference; zero hits (all callers now route through the shims). Runner stays green.

**Acceptance Scenarios**:

1. **Given** the final feature-004 commit, **When** the developer greps `signedLifecycleEndBalance` / `taxAwareWithdraw` / `isFireAgeFeasible` / `_legacySimulateDrawdown` across both HTML files, **Then** zero function-definition hits exist; zero call-site hits exist. (A leftover call would be a bug.)
2. **Given** the deletions, **When** `bash tests/runner.sh` runs, **Then** all 80 tests (77 inherited baseline + 3 smoke from feature 003) stay GREEN. No regression.

---

### User Story 3 - Smoke harness's prototype adapter retired (Priority: P3)

The `_prototypeGetCanonicalInputs` function in `tests/baseline/browser-smoke.test.js`, marked `TEMPORARY` in feature 003, is replaced with a call to the production `getCanonicalInputs()` exposed by the HTML bootstrap (or its equivalent extracted into a tiny module that both the HTML and the smoke harness can import). The smoke harness now validates the REAL production adapter rather than a test-file scaffold.

**Why this priority**: Completes the feature 003 → 004 handoff. Lower priority because US1 still satisfies the smoke gate with the prototype in place (the prototype is already close to what a production adapter would produce, minus edge cases). But shipping with the prototype still present means US4 of the future will still refer to `TEMPORARY` code in the test file.

**Independent Test**: Grep `tests/baseline/browser-smoke.test.js` for `_prototypeGetCanonicalInputs` and `TEMPORARY`; zero hits. Smoke tests still pass; they now exercise the production adapter.

**Acceptance Scenarios**:

1. **Given** the final commit, **When** the smoke harness runs, **Then** it imports and calls the PRODUCTION `getCanonicalInputs(inp)` (from a shared module or via a defined exposure surface), not the removed prototype.
2. **Given** the harness now points at production, **When** a developer adjusts the production adapter, **Then** local + CI smoke tests reflect the adjustment without any harness code changes (other than keeping pace with breaking API-contract changes).

---

### Edge Cases

- **Browser doesn't support ES modules** — out of scope. The canonical engine is already ES-module-only per feature 001. Supported browsers are last-two-major Chromium/Firefox/Safari per the constitution.
- **HTML form changes a field name** after feature-004 ships — adapter breaks; smoke harness catches it locally + in CI with a named-field failure. Fix: update adapter + defaults snapshot. FR-014 from feature 003 already encodes this.
- **Canonical engine adds a required field** — same as above; smoke catches in CI. Fix: update adapter; add default value to both defaults snapshots.
- **Dashboard visibly shows different FIRE-age numbers** post-merge — expected per baseline §C.5. Range: RR shifts ~1–3 years depending on scope; Generic shifts ~3–10 years. Accepted correctness fix per the feature 002 investigation. Note in commit message + roadmap.
- **CI green on the merge commit but user sees `Calculating...` in browser** — this is the U2B-4a failure class. The smoke harness should catch it; if it slips through, that's a smoke-harness coverage gap, not a canonical-engine bug. Log as a follow-up ticket + expand smoke coverage.
- **`projectFullLifecycle` still inline** — by design for this feature. Chart renderers continue to consume the inline-produced lifecycle shape. Feature 005 or 006 swaps it.
- **Shimmed `findFireAgeNumerical` signature incompatibility** — the inline callers expect `{years, months, endBalance, sim, feasible}`; the shim must return that exact shape while internally calling `solveFireAge`. Any drift breaks downstream panels (mortgage verdict, scenario-card delta, what-if). FR-006 makes this explicit.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Both HTML files MUST expose the canonical calc engine to their classic-script glue via a `<script type="module">` bootstrap that imports every `calc/*.js` module and exposes a helpers bundle factory + `solveFireAge` + `runLifecycle` + `evaluateFeasibility` on `window`.
- **FR-002**: A production `getCanonicalInputs()` function MUST exist in each HTML file (or in a shared loader module) that maps the legacy `inp` shape to the canonical `Inputs` shape per `specs/001-modular-calc-engine/data-model.md §1`. The function is PURE and null-guarded for single-person Generic.
- **FR-003**: The inline solver function `yearsToFIRE(inp)` MUST become a shim: it calls the canonical `solveFireAge` via the bootstrapped entry point and returns the same SCALAR numeric result the original returned (integer years to FIRE). Original signature and return shape preserved for its ~10 call sites.
- **FR-004**: The inline solver function `findFireAgeNumerical(inp, annualSpend, mode)` MUST become a shim that returns `{years, months, endBalance, sim, feasible}` — the inline-shape result — derived from the canonical `solveFireAge` return. Original signature preserved.
- **FR-005**: The shim function `_evaluateFeasibilityAtAge(age)` (from feature 001's T023b) MUST call `calc/fireCalculator.js`'s `evaluateFeasibility({inputs, fireAge, helpers})` export added in the prior U2B-4a attempt. If that export was reverted with U2B-4a, it MUST be restored (pure, fenced-header, purity-meta-test clean).
- **FR-006**: Shims MUST wrap canonical calls in `try/catch`. On canonical throw, log to `console.error` with a named-failure message AND fall back to a documented safe default (e.g., `NaN` / `false` / empty array — whatever the original returned at runtime under the same input error). This defense-in-depth prevents a future canonical-engine throw from freezing the entire dashboard at "Calculating...".
- **FR-007**: The following four inline helper functions MUST be DELETED from both HTML files: `signedLifecycleEndBalance`, `taxAwareWithdraw`, `isFireAgeFeasible`, `_legacySimulateDrawdown`. Each deletion is safe ONLY when a grep confirms zero remaining callers.
- **FR-008**: The inline helper function `projectFullLifecycle` MUST remain in both HTML files. Chart renderers continue to consume its output. (U2B-4b scope.)
- **FR-009**: The inline helper function `findMinAccessibleAtFireNumerical` and its transitive caller `isFireAgeFeasible`-dependent paths MUST be preserved exactly as in feature 003. Deferred to a later feature.
- **FR-010**: `tests/baseline/browser-smoke.test.js`'s prototype adapter `_prototypeGetCanonicalInputs` MUST be deleted and replaced with a call to the production `getCanonicalInputs()`. The `TEMPORARY` block comment is removed. The three smoke tests continue to pass without assertion changes.
- **FR-011**: The RR and Generic HTML files MUST edit the bootstrap + adapter + shims in LOCKSTEP: the same structure, the same exposed surface, the same shim function bodies. Divergence is permitted only for dashboard-specific form-field names in the adapter's field-reading code (e.g., `inp.ageRoger` vs `inp.agePerson1`).
- **FR-012**: All four pre-existing dashboard KPI cards (Years to FIRE, FIRE Age, FIRE Net Worth, Progress %) MUST render valid numeric values within 2 seconds of page load. No "Calculating..." frozen state under any default or realistic input combination.
- **FR-013**: The feature 003 browser smoke harness + CI workflow MUST report GREEN on every commit of this feature. A red smoke run BLOCKS merge by convention — this is the gate that U2B-4a was missing.
- **FR-014**: Chart renderers MUST NOT be modified in this feature. Their data source (`projectFullLifecycle` output) is unchanged. (U2B-4c scope.)
- **FR-015**: **Shim everything; edit no call site.** Every caller of `yearsToFIRE` / `findFireAgeNumerical` / `_evaluateFeasibilityAtAge` — including the main `recalcAll()` orchestration function, KPI card updaters, mortgage verdict, scenario-card delta, what-if panel, and any other consumer — MUST call through the shim. The shim internally invokes `window._solveFireAge(canonical)` and translates the result back to the original inline return shape. This preserves ~10 call sites per HTML file without editing them, delivers the smallest possible HTML diff for the refactor, and concentrates the canonical-call surface at a single chokepoint that FR-006's defense-in-depth `try/catch` guards. A direct-read rewrite (bypass shim for some callers) is explicitly OUT OF SCOPE for this feature.
- **FR-016**: This feature does NOT propagate canonical's `{feasible:false, deficitReal}` typed-shortfall semantics to the UI. Rationale: independent B2 audit (see `specs/audits/B2-silent-shortfall.md`, Verdict B at 9/10 confidence) established that the inline engine's "silent shortfall absorption" is actually a DELIBERATE signed-balance feasibility signal, not a bug. Canonical's typed-shortfall surface is a richer DIAGNOSTIC, not a correctness fix. Any future work to surface `deficitReal` in the UI is a separate UX enhancement feature, out of this scope.

### Key Entities *(include if feature involves data)*

- **Production `getCanonicalInputs(inp)` function**: the real adapter replacing feature 003's `_prototypeGetCanonicalInputs`. Lives in each HTML's module bootstrap OR in a shared `.mjs` module both HTML and the smoke harness import.
- **Helpers bundle factory**: `buildHelpers(inputs)` per feature 003's contract, exposed on `window` so classic-script glue can build the DI bundle for each `solveFireAge` call.
- **Shim functions** (three): `yearsToFIRE`, `findFireAgeNumerical`, `_evaluateFeasibilityAtAge`. Preserve signature + return shape of the originals; internally call canonical. Defense-in-depth try/catch per FR-006.
- **Deletions** (four helpers): `signedLifecycleEndBalance`, `taxAwareWithdraw`, `isFireAgeFeasible`, `_legacySimulateDrawdown`. Leave `projectFullLifecycle` + `findMinAccessibleAtFireNumerical` untouched.
- **`evaluateFeasibility` canonical export**: added to `calc/fireCalculator.js` if not already present; exposes the mode-specific feasibility check the shimmed `_evaluateFeasibilityAtAge` calls.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` at cold load, every KPI card shows a numeric value within 2 seconds of page load. No "Calculating..." frozen state.
- **SC-002**: The CI workflow (from feature 003) reports GREEN on every commit of this feature, including the final merge commit.
- **SC-003**: Grep verification: all four named dead helpers have zero function-definition and zero call-site hits in both HTML files after the feature merges.
- **SC-004**: Grep verification: `tests/baseline/browser-smoke.test.js` has zero `TEMPORARY` and zero `_prototypeGetCanonicalInputs` mentions after the feature merges.
- **SC-005**: The three feature-003 smoke tests (RR, Generic, parity) continue to PASS after the harness is retargeted to the production adapter.
- **SC-006**: Local test runner wall-clock stays under 10 seconds (Principle V budget). Runner count ticks from 80 to AT LEAST 80 (same or higher; any new tests added by this feature's TDD cycle count on top).
- **SC-007**: A developer reverting any shim body (e.g., stripping the `try/catch` per FR-006) triggers a named-field smoke failure in local + CI within 30 seconds of the revert.
- **SC-008**: On RR and Generic canonical input sets (per `tests/baseline/rr-defaults.mjs` and `generic-defaults.mjs`), the post-feature `fireAge` lives within the predicted range from `baseline-rr-inline.md §C.5`: RR in `[51, 54]` years; Generic in `[55, 68]` years (wide bands accept the §C.3b contribution-split resolution variable). A value outside these bands triggers an investigation path, not a silent ship.

## Assumptions

- **Feature 003's browser smoke harness is authoritative.** Every commit of this feature is gated by it. The smoke-first workflow is the core risk mitigation that makes U2B-4a safe to retry.
- **`evaluateFeasibility` may need to be re-added to `calc/fireCalculator.js`.** The prior U2B-4a attempt (feature 001) added this export, but the revert commit `d080a7e` removed it along with the other U2B-4a changes. Verify its presence at feature start; restore if missing. Implementation MUST be pure and pass the module-boundaries meta-test.
- **Baseline `§C.5` deltas are accepted.** Dashboard numbers shift when canonical takes over. User has already consented to this in prior sessions. Commit message + roadmap update MUST document the shift with concrete before/after values.
- **Defense-in-depth try/catch in shims is the U2B-4a fix.** The failure mode last time was that a canonical throw propagated up through the classic script's `recalcAll` and froze the dashboard at "Calculating...". Wrapping each shim in try/catch with a logged fallback prevents this class of freeze even if the canonical engine has an unhandled case. This is belt-and-suspenders alongside the smoke harness.
- **The prototype adapter in the smoke harness is CLOSE to — but not identical to — the production adapter.** The prototype makes reasonable mapping choices; the production adapter MUST produce output that the canonical engine accepts and the dashboard's existing DOM glue consumes correctly. Differences surfaced during this feature's TDD cycle get documented as "what the prototype got wrong" in the commit body.
- **No chart renderer changes in this feature.** Chart display continues to use inline `projectFullLifecycle` output. Any delta users notice in chart content after merge is not caused by this feature — the charts read the same inline data they did before.
- **B2 audit completed 2026-04-20**: Verdict B — misdiagnosis. See `specs/audits/B2-silent-shortfall.md`. Inline engine's signed balances ARE the feasibility signal; no bug to fix. FR-016 confirms no UI change in this feature. BACKLOG.md B2 entry closed alongside feature 004's merge.
- **Merge target**: `main`. Feature 003 is already merged at `f1cd024`.
