# Feature Specification: Canonical Engine Swap + Public Launch

**Feature Branch**: `005-canonical-public-launch`
**Created**: 2026-04-20
**Status**: Draft
**Input**: User description: "Redo the HTML canonical-engine swap that failed in feature 004 — this time by first extracting the inline shim functions into a Node-testable JS module so the shim-layer's fallback behavior is covered by unit tests (the gap that let 004's regression reach the browser). Bundle in adjacent UX/debt items (surface infeasibility `deficitReal` on the banner; migrate KPI cards to `chartState.onChange` listeners; remove compat shims that canonical swap obsoletes; lock a fixture placeholder; codify process lessons in CLAUDE.md; refresh the SPECKIT pointer). Add a legal/CYA disclaimer to both dashboards. Then publish the Generic dashboard to GitHub Pages as a separate public mirror repo so friends can use it via a public URL without exposing the private RR version or any financial history."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Canonical-engine swap that actually works in the browser (Priority: P1) 🎯 MVP

A developer opens either `FIRE-Dashboard.html` or `FIRE-Dashboard-Generic.html` in a browser after this feature merges. Every KPI card shows a numeric value within 2 seconds. No card is stuck on "Calculating…". No card shows `NaN`, `$0`, or `40+ years` placeholder text. The Full Portfolio Lifecycle chart and Portfolio Drawdown chart both render real data. DevTools console shows zero red errors and zero `[<shim>] canonical threw:` messages. FIRE age and all derived KPIs are now computed by the canonical `calc/fireCalculator.js` engine (via shims), not by the inline legacy solver. The feature 004 regression class (shim fallback producing NaN cascade) is actively tested by new Node unit tests that stub `window._solveFireAge` to throw and assert each shim's documented fallback value + `console.error` prefix.

**Why this priority**: This is the headline deliverable. Feature 004 failed to ship this twice (U2B-4a in feature 001, then the 004 retry). This time the difference is that the shim layer is extracted into `calc/shims.js` as a real Node module, so the shim's translation logic + try/catch + fallback values get proper unit-test coverage in CI — the exact gap that let the 004 regression reach the browser.

**Independent Test**: Run `bash tests/runner.sh` — expect 80+ tests green including the new shim unit tests. Open both dashboards in a browser; confirm KPI cards render numeric values, DevTools console is clean. Deliberately break the production adapter (e.g., return an object missing `currentAgePrimary`); expect the shim's try/catch to log a named `console.error` AND the dashboard to show `—` placeholders, NOT frozen or NaN cascades. Revert the break; confirm normal numbers return.

**Acceptance Scenarios**:

1. **Given** both HTML files load fresh in a browser, **When** initial calculation finishes, **Then** every KPI card (Years to FIRE, FIRE Age, FIRE Net Worth, Progress %) shows a valid numeric value within 2 seconds.
2. **Given** the adapter produces a canonical shape `solveFireAge` accepts, **When** `recalcAll` runs, **Then** the shim returns the inline-shape result and every downstream panel consumes it unchanged.
3. **Given** a developer stubs `window._solveFireAge` to throw in a Node test, **When** the new `tests/unit/shims.test.js` runs, **Then** each shim returns its documented fallback (`NaN` / `{years:NaN, months:NaN, endBalance:NaN, sim:[], feasible:false}` / `false`) AND `console.error` is called with the `[shim-name]` prefix.
4. **Given** the smoke harness (`tests/baseline/browser-smoke.test.js`) imports the production adapter, **When** it runs against RR + Generic defaults, **Then** it produces a valid `FireSolverResult` on both inputs with zero throws.
5. **Given** a developer accidentally breaks the production adapter's mapping of a required field, **When** CI runs on the push commit, **Then** EITHER the smoke harness fails with a named-field message OR the shim unit test fails with a fallback-value-observed message. In both cases the failure surfaces BEFORE merge.

---

### User Story 2 - Legal/CYA disclaimer visible on both dashboards (Priority: P1)

A user opening either dashboard scrolls to the bottom and sees a clearly-worded disclaimer stating the tool is for research and educational purposes only, is not financial advice, and that users should do their own research (DYOR) and consult qualified advisors before making financial decisions. The disclaimer is translated for both supported locales (English + 中文) via the existing translation catalog. It is visible enough to read but unobtrusive (muted styling, subtle separator).

**Why this priority**: Bundled P1 because this disclaimer MUST ship alongside the public launch of Generic (US3). A public calculator without a disclaimer exposes you to liability risk. Since it's trivial to add (~10 lines of HTML + 2 i18n strings) it bundles into the MVP shipment.

**Independent Test**: Open both dashboards; scroll to the bottom. Confirm the disclaimer is present, legible, and covers the required points (research-only, not financial advice, DYOR). Toggle language EN ↔ 中文; confirm the disclaimer translates. Disclaimer does NOT disappear when the user scrolls back up or interacts with any control.

**Acceptance Scenarios**:

1. **Given** either dashboard is loaded, **When** the user scrolls to the bottom, **Then** a `<footer class="disclaimer">` block is visible containing at minimum: "research and educational purposes only", "not financial advice", "do your own research (DYOR)", "consult a qualified financial advisor".
2. **Given** the user switches language to 中文 via the language toggle, **When** they view the disclaimer, **Then** the text is in 中文 and carries the same disclaimer points.
3. **Given** the feature is merged, **When** `FIRE-Dashboard Translation Catalog.md` is opened, **Then** it contains at least 2 new entries keyed `disclaimer.title` (or equivalent) and `disclaimer.body` with English + 中文 translations.
4. **Given** the disclaimer's CSS, **When** it renders on the dashboard, **Then** it uses existing CSS tokens (`--text-dim`, `--muted`, `--card`) — no new hardcoded colors introduced.

---

### User Story 3 - Generic dashboard publish-ready in the existing repo (Priority: P1)

After this feature merges, the existing `FIRE_Calculator` repo contains everything needed to make the Generic dashboard live at a public URL: an `index.html` entry point that loads the Generic dashboard, a `LICENSE` file, a user-facing `README.md`, and documentation for the two manual steps YOU (the user) will handle outside this feature — (1) removing `FIRE-Dashboard.html` (RR) from the repo tree, and (2) flipping the repo visibility from private to public on GitHub. Once you complete those two manual steps, GitHub Pages activates automatically and the dashboard is live at `https://<your-github-username>.github.io/FIRE_Calculator/` within 5 minutes.

**Why this priority**: This is the user-visible launch outcome. Without it, feature 005's other work is invisible to non-developer users. P1 because it's the headline "I can share this with my friends" moment.

**Independent Test**: After feature 005 merges, execute the documented "Publish-Ready Checklist" (remove RR file + flip repo public). Visit the public Pages URL from a non-logged-in browser — Generic dashboard loads within 3 seconds, KPIs show numeric values, disclaimer is visible. Revert: make repo private again — dashboard URL 404s. The feature delivers "the tools + the checklist"; you execute the 5-minute manual launch yourself.

**Acceptance Scenarios**:

1. **Given** this feature is merged to `main`, **When** a developer inspects the repo file tree, **Then** it contains `index.html` at the repo root that loads the Generic dashboard (either as a direct copy of Generic's HTML renamed, OR a tiny redirect page pointing at `FIRE-Dashboard-Generic.html`), AND a top-level `LICENSE` file, AND a `README.md` at the repo root written for public consumption.
2. **Given** the repo is still private, **When** the user follows the Publish-Ready Checklist — Step 1: remove `FIRE-Dashboard.html` + `FIRE-snapshots.csv` + any RR-specific tests/fixtures from the working tree; commit. Step 2: flip repo visibility to public on GitHub Settings; enable Pages on the `main` branch root — **Then** the public URL is live and serves the dashboard within 5 minutes.
3. **Given** the user visits the public URL on mobile, desktop, and tablet viewports, **When** the page loads, **Then** the dashboard renders in all three (mobile-responsive layout preserved).
4. **Given** the `README.md` that ships, **When** a first-time visitor reads it, **Then** it includes: project description, link to the live dashboard, how to run locally, license, the disclaimer text from US2, and a "this is a read-only mirror for public use; for contributions, contact the author" note.
5. **Given** the existing CI workflow (from feature 003), **When** the repo becomes public, **Then** the same workflow continues running on every push + PR with zero configuration changes needed.
6. **Given** the user's privacy review, **When** they grep the calc/ + tests/ + translation-catalog for RR-specific data (Roger's birthdate `1983`, Rebecca's birthdate `1984`, specific dollar amounts), **Then** zero hits outside `FIRE-Dashboard.html` itself, `FIRE-snapshots.csv`, and `tests/baseline/rr-defaults.mjs` (the files the user will remove in Step 1).

---

### User Story 4 - UX polish: infeasibility deficit display + KPI cards via chartState listeners (Priority: P2)

A user enters an aggressive retirement scenario that the solver finds infeasible. The infeasibility banner activates (already in place from feature 001) AND now shows the specific dollar deficit ("Plan runs short by $47,200 by age 85"). Separately, when the user drags the FIRE marker on the lifecycle chart, every KPI card updates in the same animation frame (no one-frame ordering artifact) because cards now subscribe to `chartState.onChange` directly, not to the `recalcAll()` path.

**Why this priority**: U1 and U2 are quality-of-life improvements that also harden the dashboard against feature-004-class failures. If a future regression produces NaN solver output, chartState-subscriber KPI cards gracefully show `—` placeholders instead of displaying cascading NaN (they read from `chartState.state.*`, which stays last-known-good during errors). Bundled P2 since they touch adjacent code to the canonical swap.

**Independent Test**: (a) Load a scenario that's infeasible (e.g., $80k spend on $500k portfolio retiring now); infeasibility banner activates with a visible deficit dollar amount from `chartState.state.deficitReal` or equivalent. (b) With the canonical swap live, drag the FIRE marker; every KPI card updates synchronously in one frame (no stale-for-one-frame behavior).

**Acceptance Scenarios**:

1. **Given** an infeasible scenario, **When** the solver returns `{feasible: false, deficitReal: <n>}`, **Then** the `#infeasibilityDeficit` DOM element renders a dollar-formatted value reflecting the deficit.
2. **Given** a feasible scenario, **When** the solver returns `{feasible: true}`, **Then** the infeasibility banner AND the deficit element remain hidden.
3. **Given** the user drags the FIRE marker and clicks Confirm, **When** `chartState.setOverride(age)` fires, **Then** every affected KPI card (Years to FIRE, FIRE Age, FIRE Net Worth, Progress %) re-renders within the same animation frame as the chart marker move.
4. **Given** a future regression where the solver throws, **When** the shim catches and returns fallback, **Then** KPI cards subscribed to `chartState.onChange` display `—` rather than cascading `NaN`.

---

### User Story 5 - Tech debt cleanup + process hardening + docs refresh (Priority: P3)

A developer reading the code after this feature sees: no `normalizeMortgageShape` compat shim in `calc/lifecycle.js` (removed); no `TBD_LOCK_IN_T038` placeholder in `tests/fixtures/coast-fire.js` (locked); no `isFireAgeFeasible` dead helper in either HTML file (deleted after `findMinAccessibleAtFireNumerical` is also shimmed). `CLAUDE.md` gains two new sections: one codifying "caller-audit before any extraction refactor" (P1 from BACKLOG, lesson from feature 004's scope correction) and one codifying "shim try/catch with documented fallbacks" (P2, lesson from U2B-4a and feature 004). The SPECKIT pointer in `CLAUDE.md` is updated to this feature's plan.

**Why this priority**: Housekeeping. Individually low-value; bundled here because these items share the code areas touched by US1. P3 because they don't gate the public launch.

**Independent Test**: Grep each removed item; zero hits. Open `CLAUDE.md`; confirm the two new process-lesson sections are present with references to features 001, 004. Open `CLAUDE.md` SPECKIT block; confirm it points at `specs/005-canonical-public-launch/plan.md`.

**Acceptance Scenarios**:

1. **Given** `calc/lifecycle.js` after this feature, **When** grepped for `normalizeMortgageShape`, **Then** zero hits in the module (since the HTML now passes canonical mortgage shape directly).
2. **Given** `tests/fixtures/coast-fire.js` after this feature, **When** grepped for `TBD_LOCK_IN_T038` or `TBD_`, **Then** zero hits.
3. **Given** both HTML files after this feature, **When** grepped for `function isFireAgeFeasible`, **Then** zero hits (helper deleted because `findMinAccessibleAtFireNumerical` is now also a shim per US1's extended scope).
4. **Given** `CLAUDE.md` after this feature, **When** read, **Then** it contains a "Process Lessons" section (or similar) with subsections for caller-audit-before-extraction and shim-defense-in-depth, each naming the feature number that taught the lesson.
5. **Given** `CLAUDE.md` after this feature, **When** the SPECKIT block is read, **Then** it points at `specs/005-canonical-public-launch/` artifacts.

---

### Edge Cases

- **User forgets to remove RR files before flipping repo public** — the Publish-Ready Checklist is sequential; Step 2 (flip public) comes AFTER Step 1 (remove RR + snapshot). If user inverts them, RR data leaks for however long the repo is public before they remove it. Checklist explicitly warns of this ordering.
- **User forgets to enable GitHub Pages after flipping repo public** — repo is public but URL 404s. Checklist's Step 2 explicitly includes "click Settings → Pages → select main / root".
- **User modifies RR file after feature 005 merges but before making repo public** — fine, stays private until they flip it. No sync concern (single-repo model).
- **User modifies RR file after making repo public** — NEW RR edits publish automatically on next commit. User MUST NOT put RR back after publishing. Checklist warns.
- **Git history exposure** — once repo goes public, all pre-public commits (including RR content) become world-readable. User has consented per the Assumption below.
- **Canonical engine throws on a SPECIFIC live-DOM input not in defaults snapshot** — the feature 004 failure mode. US1's new shim unit tests + extended smoke assertions catch this class.
- **Dashboard displays correctly locally but differently via Pages URL** — should not happen. Both paths load identical `calc/*.js` + same HTML file. Acceptance scenario 3 verifies cross-viewport consistency.
- **Disclaimer text becomes obsolete** (e.g., tax law changes make the dashboard dangerously wrong) — disclaimer mentions "may be outdated" generically; no specific date-stamped statements.
- **User's browser blocks mixed content** — all resources (Chart.js CDN, ES modules) served over HTTPS on GitHub Pages; no mixed-content issues.
- **User doesn't speak English or 中文** — disclaimer only supports EN + zh-TW per existing i18n scope. Users in other languages see the fallback (EN).

## Requirements *(mandatory)*

### Functional Requirements

#### Canonical swap (US1 — F2 retry done right)

- **FR-001**: A new pure JS module `calc/shims.js` MUST export four functions (`yearsToFIRE`, `findFireAgeNumerical`, `_evaluateFeasibilityAtAge`, `findMinAccessibleAtFireNumerical`) wrapping canonical calls with documented `try/catch` + fallback values + `console.error` prefix logging. The module is Node-importable and has full unit-test coverage. (`findMinAccessibleAtFireNumerical` is included so that `isFireAgeFeasible` can be deleted per FR-008/FR-009.)
- **FR-002**: Both HTML files MUST import shim functions from `calc/shims.js` and expose them as the inline-named globals the existing ~10 call sites per file consume. Every call site continues to work without edit (byte-for-byte signature preservation).
- **FR-003**: `tests/unit/shims.test.js` MUST exist with unit tests for each exported shim, stubbing `window._solveFireAge` / `window._evaluateFeasibility` / `window._runLifecycle` to throw, asserting each shim returns its documented fallback AND logs `console.error` with the `[shim-name]` prefix.
- **FR-004**: A new pure module `calc/getCanonicalInputs.js` MUST exist exporting `getCanonicalInputs(inp): Inputs` per `specs/001-modular-calc-engine/data-model.md §1`. Auto-detects RR-shape vs Generic-shape; null-guards secondary person; `Object.freeze()`'s output; throws a named `Error` on unrecoverable missing fields.
- **FR-005**: The `evaluateFeasibility({inputs, fireAge, helpers}) → boolean` export MUST exist in `calc/fireCalculator.js` (restored if absent). Pure, mode-aware (Safe/Exact/DWZ), module-boundaries meta-test clean.
- **FR-006**: Both HTML files' `<script type="module">` bootstrap MUST import and expose on `window` at minimum: `chartState`, all calc helpers, `solveFireAge`, `runLifecycle`, `evaluateFeasibility`, `getCanonicalInputs`, `_calcHelpers` factory.
- **FR-007**: The feature 003 browser smoke harness MUST be retargeted to import `getCanonicalInputs` from the production module. The three existing smoke tests continue to pass without assertion changes.
- **FR-008**: The dead inline helpers `signedLifecycleEndBalance`, `taxAwareWithdraw`, `_legacySimulateDrawdown`, AND `isFireAgeFeasible` MUST be DELETED from both HTML files. Pre-deletion grep MUST confirm zero remaining call sites (with `isFireAgeFeasible` deletion requiring `findMinAccessibleAtFireNumerical` to also be shimmed OR rewritten — see FR-009).
- **FR-009**: `findMinAccessibleAtFireNumerical` MUST be handled in one of two ways (both preserve its current callers): (a) extracted into `calc/shims.js` as a fourth shim with the same try/catch + fallback discipline, OR (b) kept inline but rewritten to call canonical via the exposed helpers. Either path unblocks `isFireAgeFeasible` deletion in FR-008.
- **FR-010**: `projectFullLifecycle` and all chart renderers MUST NOT be modified in this feature. They stay on the inline lifecycle path; renderer rewrite is a future feature (F4).

#### Disclaimer (US2)

- **FR-011**: Both HTML files MUST contain a `<footer class="disclaimer">` block (or semantically equivalent) at the bottom of the `<body>` with at minimum these points: "research and educational purposes only", "not financial advice", "do your own research (DYOR)", "consult a qualified financial advisor", "projections are estimates", "authors assume no responsibility".
- **FR-012**: The disclaimer's text MUST be driven from `FIRE-Dashboard Translation Catalog.md` via at least 2 new i18n keys (`disclaimer.intro` and `disclaimer.body` or equivalent). Both EN and zh-TW translations MUST be present.
- **FR-013**: The disclaimer's styling MUST use only existing CSS variables (`--text-dim`, `--muted`, `--card`, etc.). No new color tokens introduced.
- **FR-014**: The disclaimer text MUST reference the open-source license (**MIT** per Question 1 resolution) and indicate source code availability ("source at `https://github.com/<user>/FIRE_Calculator`" or equivalent, or a shorter "open-source, MIT licensed" phrase).

#### GitHub Pages publish-readiness (US3) — single-repo approach

- **FR-015**: An `index.html` file MUST exist at the repo root after this feature merges. Either approach is acceptable: (a) `index.html` is a ~10-line HTML page that meta-refresh-redirects to `FIRE-Dashboard-Generic.html`, OR (b) `FIRE-Dashboard-Generic.html` is renamed to `index.html` and every reference across docs/specs is updated. The planning phase picks one; either satisfies Pages' default-document requirement.
- **FR-016**: A `LICENSE` file MUST exist at the repo root containing the standard **MIT License** text (per Question 1 resolution). Year 2026, Copyright holder "Roger Hsu" (or whatever name the user specifies at implementation time — the planning phase confirms the exact copyright line).
- **FR-017**: A `README.md` MUST exist at the repo root, written for a public audience. Content per FR-020 below.
- **FR-018**: A "Publish-Ready Checklist" document MUST exist in the repo (e.g., `PUBLISH.md` or `docs/PUBLISH.md`) listing the two manual steps the user performs AFTER feature 005 merges to make the repo public: (1) remove RR files + snapshot + RR-specific tests/fixtures (enumerated explicitly by path); (2) flip repo visibility + enable Pages via GitHub Settings. The checklist MUST be actionable — each step has a command or a URL.
- **FR-019**: A privacy scrub MUST be performed as a task within this feature: grep `calc/*.js` + `tests/` (excluding `rr-defaults.mjs`) + `FIRE-Dashboard Translation Catalog.md` + `.github/workflows/*.yml` + `specs/` + `BACKLOG.md` for RR-personal data (Roger's birthdate, Rebecca's birthdate, specific known RR dollar amounts). Any finding is FIXED in this feature (removed or anonymized) before publish-ready. The scrub's results are documented in a short audit file (`specs/005-canonical-public-launch/privacy-scrub.md`).
- **FR-020**: The `README.md` MUST include: project description (Generic FIRE calculator — NOT Roger/Rebecca's specific plan), link to the GitHub Pages URL once live, "How to run locally" (double-click `index.html` or serve via a static HTTP server), license identifier, a "read-only mirror for public use; contributions by contact with the author" note, and the disclaimer text from FR-011 reproduced at the bottom.
- **FR-021**: The existing `.github/workflows/tests.yml` (from feature 003) is ALREADY public-ready (no secrets, no private deps). No changes needed beyond verifying it continues to pass after this feature's edits.

#### UX polish (US4)

- **FR-022**: When the solver returns an infeasible result with a numeric `deficitReal`, the `#infeasibilityDeficit` DOM element MUST render a dollar-formatted value representing the deficit. When `deficitReal` is absent, zero, or the scenario is feasible, the element MUST NOT be visible.
- **FR-023**: The four primary KPI cards (Years to FIRE, FIRE Age, FIRE Net Worth, Progress %) MUST subscribe to `chartState.onChange` and re-render on every `effectiveFireAge` or `feasible` transition, not solely through the `recalcAll()` orchestration path.
- **FR-024**: On a canonical-engine throw (during drag preview, input change, or mode switch), KPI cards subscribed to `chartState.onChange` MUST display a documented placeholder (e.g., `—`) rather than cascading `NaN` or `$0` from a shim fallback.

#### Tech debt + process + docs (US5)

- **FR-025**: The `normalizeMortgageShape` compat shim in `calc/lifecycle.js` MUST be deleted once the production adapter passes canonical mortgage shape directly (enabled by FR-004).
- **FR-026**: The `TBD_LOCK_IN_T038` placeholder in `tests/fixtures/coast-fire.js` MUST be replaced with the actual value observed from running the canonical engine on the coast-fire fixture's inputs.
- **FR-027**: `CLAUDE.md` MUST gain a new "Process Lessons" section (or equivalent) documenting at minimum: (a) "Perform a caller-audit grep before any extraction refactor" (lesson from feature 004 scope correction, source: `specs/004-html-canonical-swap/ABANDONED.md`), (b) "Every shim that wraps a potentially-throwing call MUST use `try/catch` + documented fallback + `console.error` with prefix, AND the fallback must be Node-unit-tested" (lesson from feature 004 failure class).
- **FR-028**: The `CLAUDE.md` SPECKIT block MUST be updated to reference feature 005's artifacts.

### Key Entities *(include if feature involves data)*

- **`calc/shims.js`** (new): exports 3 or 4 shim functions wrapping canonical calls with `try/catch` + fallback. Pure; Node-importable.
- **`calc/getCanonicalInputs.js`** (new): production adapter mapping legacy `inp` → canonical `Inputs`. Pure.
- **`tests/unit/shims.test.js`** (new): unit tests for each shim's fallback behavior, stubbing canonical calls to throw.
- **Public mirror repository** (new, external): separate GitHub repo containing public-safe file subset + GitHub Pages config.
- **`PUBLISH.md` Publish-Ready Checklist** (new): documents the two manual steps the user performs AFTER feature 005 merges to go public — remove RR files + flip repo visibility + enable Pages.
- **Disclaimer DOM block + i18n keys**: footer element in both HTML files + 2 new translation-catalog entries.
- **Process-lesson sections in `CLAUDE.md`**: two new markdown subsections codifying the caller-audit and shim-defense patterns.

## Success Criteria *(mandatory)*

### Measurable Outcomes

#### Canonical swap (US1)

- **SC-001**: Both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` show numeric KPI values on every card within 2 seconds of cold page load in a default browser. No "Calculating…" frozen state; no visible `NaN` or `$0` placeholders.
- **SC-002**: `bash tests/runner.sh` reports `pass ≥ 84` (80 inherited from feature 003 + at least 4 new shim unit tests — one per exported shim in FR-001) / 0 fail / 1 skip. Wall-clock under 10 seconds.
- **SC-003**: CI on the private repo shows green on every feature-005 commit including the merge commit. Wall-clock under 5 minutes per run.
- **SC-004**: A developer reverting the `try/catch` wrapper of any shim triggers a named-test failure in local `bash tests/runner.sh` within 30 seconds of reading the output. (Closes the SC-007 drill from feature 004 that was architecturally impossible then; now works because shims are Node-testable.)

#### Disclaimer (US2)

- **SC-005**: A user scrolling to the bottom of either dashboard sees the disclaimer within 1 second of scroll-end; the disclaimer covers all required points (research-only, not advice, DYOR, consult advisor, authors disclaim liability).
- **SC-006**: The disclaimer renders in both supported languages (EN + zh-TW) via the existing language toggle, with no layout breakage.

#### GitHub Pages publish-readiness (US3) — single-repo

- **SC-007**: After the user executes the two manual Publish-Ready Checklist steps (remove RR files + flip repo public + enable Pages), a non-technical visitor on a fresh browser (not logged in to GitHub) loads the Generic dashboard from the public URL with all KPIs showing numeric values within 3 seconds.
- **SC-008**: The privacy scrub (FR-019) surfaces zero RR-personal data in the files that will be public after RR removal (`calc/`, `tests/` except `rr-defaults.mjs`, `FIRE-Dashboard Translation Catalog.md`, `.github/workflows/*.yml`, `README.md`, `LICENSE`). Any finding is remediated before feature 005 merges.
- **SC-009**: The `PUBLISH.md` (or equivalent) Publish-Ready Checklist is clear enough that a technically-literate but spec-unfamiliar user can execute both manual steps in under 10 minutes without asking for help.
- **SC-010**: The existing CI workflow continues to pass on every commit of feature 005 and on every commit after the repo goes public.
- **SC-010a**: After the user makes the repo public, `git log -p` shows the historical RR content IS visible (the user has consented to this per Assumption below). No unexpected additional personal data surfaces that wasn't already flagged.

#### UX polish (US4)

- **SC-011**: A user loading an infeasible scenario sees the specific deficit dollar amount in the infeasibility banner (not just a generic "infeasible" message).
- **SC-012**: On drag of the FIRE marker, KPI cards AND the chart marker update within the same animation frame (no one-frame-stale artifact visible to the user).

#### Tech debt + process (US5)

- **SC-013**: Greps for `normalizeMortgageShape`, `TBD_LOCK_IN_T038`, `function isFireAgeFeasible` across the repo return zero matches after this feature merges.
- **SC-014**: `CLAUDE.md` contains two new process-lesson sections with concrete references to source features (001 / 004).

## Assumptions

- **Single-repo architecture** (user-directed): the existing `FIRE_Calculator` repo becomes public after the user executes the Publish-Ready Checklist. No new public repo created. No sync mechanism needed.
- **User has consented to git-history exposure.** Once the repo becomes public, every commit in history (including commits that contained real Roger/Rebecca dollar figures via `FIRE-Dashboard.html` and `FIRE-snapshots.csv`) will be visible via `git log -p`. This is a DELIBERATE trade-off to avoid history-scrubbing complexity (BFG / `git filter-repo`). If the user later regrets this, it cannot be undone short of deleting the public repo and starting fresh. **Documented risk; feature proceeds with acceptance.**
- **RR file removal is the USER's manual step**, not this feature's work. Feature 005 prepares everything that can be prepared pre-publish (LICENSE, README, `index.html`, privacy scrub of soon-to-be-public files, Publish-Ready Checklist). The user executes removal + visibility flip when they're ready.
- **Feature 001's canonical engine + feature 002's B3 regression test + feature 003's smoke harness are authoritative infrastructure.** This feature builds on them; none are refactored.
- **Principle V (zero-build, zero-dep) is preserved.** No `package.json`, no `node_modules`, no bundler, no new dev deps. Only Node built-ins + Chart.js CDN.
- **Git history is exposed as-is under the single-repo model.** Per the architectural decision above, the existing `FIRE_Calculator` repo is flipped from private to public; no filtered-rewrite is performed. The "git history exposure accepted" assumption earlier in this list covers the trade-off.
- **`FIRE-Dashboard.html` (RR version) is deleted from the working tree** during the user's manual PUBLISH.md Step 1. This feature does NOT scrub or redact RR inside the file — the user simply removes it before flipping the repo public. The RR file's prior content remains visible in git history per the exposure assumption.
- **Sync cadence**: updates to the public repo happen when the user (or automation) explicitly pushes. No real-time mirror. The public repo is slightly-behind the private repo at any moment; that's acceptable.
- **License**: MIT (resolved via Question 1). Most permissive; standard for small personal tools.
- **Repo stays named `FIRE_Calculator`** as-is. No rename unless the user asks. Pages URL will be `https://<github-username>.github.io/FIRE_Calculator/`. If the user wants a lowercase URL, they rename the repo manually (GitHub supports rename with redirect).
- **`index.html` defaults to approach (a)**: a tiny meta-refresh page redirecting to `FIRE-Dashboard-Generic.html`. Minimal new file; keeps `FIRE-Dashboard-Generic.html` as the source of truth. Approach (b) (rename) is OK too but more grep-churn.
- **`isFireAgeFeasible` deletion requires `findMinAccessibleAtFireNumerical` to be shimmed or rewritten.** Per FR-009 this feature includes that work. Feature 004 stopped short of this; feature 005 doesn't.
- **Privacy scrub is the mitigation.** FR-019's grep audit + remediation is how we make sure `calc/`, `tests/` (excluding `rr-defaults.mjs`), translation catalog, specs, and workflow files are safe to ship publicly. Anything found is scrubbed before merge.

---

## Clarification Questions

### Q1 — License

**Context**: FR-014 + FR-016 require a `LICENSE` file at the repo root. This dictates how others may use, modify, and redistribute the Generic dashboard code once the repo goes public.

**What we need to know**: Which open-source license?

| Option | Answer | Implications |
|--------|--------|--------------|
| A | **MIT** (recommended) | Most permissive + most common for small tools. Anyone may use / modify / redistribute with attribution. Minimal restrictions. |
| B | **Apache 2.0** | Similar to MIT but includes an explicit patent grant + more formal. Slightly longer text. |
| C | **AGPLv3** | Copyleft — any derivative work (including SaaS) must also be AGPL-licensed + source-available. Protects against closed-source forks. |
| D | **No license / All rights reserved** | Viewable source but legally no rights granted to anyone. Friends may still use via the Pages URL, but technically they cannot fork or redistribute. |
| Custom | Other (e.g., GPLv3, BSD, CC-BY) | — |

**Your choice**: _[Waiting]_

---

*(Previous Q1 repo-name and Q3 sync-mechanism questions dropped — the single-repo architecture removes both. Repo stays `FIRE_Calculator`; no sync mechanism needed.)*
