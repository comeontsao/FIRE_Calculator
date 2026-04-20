# Feature Specification: Browser Smoke-Test Harness

**Feature Branch**: `003-browser-smoke-harness`
**Created**: 2026-04-20
**Status**: Draft
**Input**: User description: "Build a Node-runnable smoke-test harness that loads both HTML dashboards' default form values, runs them through the canonical calc engine (`getCanonicalInputs` logic → `solveFireAge` canonical), and asserts no throw + sane output shape. Reuse the `tests/baseline/inline-harness.mjs` pattern. Zero new deps. Goal: catch the class of failure that killed feature 001's U2B-4a before any HTML-calc wire-up ships. Also extend to cover the parity-fixture shape. Add to CI via a GitHub Actions workflow. Covers BACKLOG items F1 + T1 + T6."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Catch HTML ↔ calc integration failures before they ship (Priority: P1)

A developer working on feature 004 (HTML canonical-engine wire-up) runs the test suite before pushing a commit. If their `getCanonicalInputs()` adapter produces a canonical `Inputs` object that causes `solveFireAge` to throw — or returns a shape the dashboard's DOM glue can't consume — a named test fails **immediately**, with a message identifying the broken field. Before this harness exists, the only way to catch that class of failure is to open each HTML file in a browser and visually confirm the dashboard renders; that's what failed to catch the U2B-4a regression that eventually shipped to main and had to be reverted.

**Why this priority**: This is the blocker that makes feature 004 safe to attempt. Without it, we either fly blind again or never tackle the HTML wire-up. Single P1 because the feature has one job.

**Independent Test**: Run `bash tests/runner.sh`. The new smoke-test suite runs against both dashboards' cold-load default form values, produces a sane `FireSolverResult`, and is included in the runner's pass count. Deliberately break the canonical adapter (e.g., set a required `Inputs` field to `undefined`); confirm the harness fails with a message naming the offending field.

**Acceptance Scenarios**:

1. **Given** RR's HTML form at its cold-load default values, **When** the smoke harness extracts them and runs `solveFireAge(canonical)`, **Then** the call returns without throwing and the result has `{yearsToFire, fireAge, feasible, endBalanceReal, balanceAtUnlockReal, balanceAtSSReal, lifecycle}` all present with correct types (number / number / boolean / number / number / number / array).
2. **Given** Generic's HTML form at its cold-load default values, **When** the same harness runs, **Then** same assertions pass.
3. **Given** a deliberately-broken adapter that omits `inputs.ssStartAgePrimary`, **When** the harness runs, **Then** the test fails with a message identifying the missing field (either caught by the canonical engine's validation throw or by the harness's shape check). The failure is actionable in under 30 seconds of reading.
4. **Given** the smoke harness passes locally, **When** a developer pushes to any branch, **Then** GitHub Actions runs the suite and reports green/red on the commit.
5. **Given** the smoke harness is wired into CI, **When** a PR is opened against `main`, **Then** CI status must be green before merge is permitted (by convention — branch-protection can be added later by the repo admin).

---

### User Story 2 - Parity-fixture provides a cross-dashboard oracle (Priority: P2)

A developer adding a new field to the canonical `Inputs` shape (e.g., for feature 004) sees whether their change breaks the declared "RR and Generic produce identical outputs on the canonical pipeline" invariant. The parity fixture's current `divergent[]` allow-list is small (`ssPrimary.annualEarningsNominal` only); the smoke harness verifies that no other field legitimately differs between the RR path and the Generic path on the same canonical inputs.

**Why this priority**: Lower than US1 because the parity invariant has limited value until feature 004 lands (today, only the canonical engine is exercised; the dashboards don't consume it). But shipping the parity smoke with US1 means US3 (RR/Generic parity) becomes a one-line test activation instead of a new feature. P2 rather than P3 because it's a small addition to the same harness being built for US1.

**Independent Test**: With the parity fixture (`tests/fixtures/rr-generic-parity.js`) loaded, run the canonical engine twice on its inputs — once through a "pretend I'm RR" path (PersonalData adapter call when it exists) and once through a "pretend I'm Generic" path (direct canonical consumption). Every field NOT in `divergent[]` must be byte-identical.

**Acceptance Scenarios**:

1. **Given** the `rr-generic-parity` fixture, **When** the smoke harness runs both paths, **Then** all non-divergent fields match byte-for-byte.
2. **Given** a developer adds a new field to `Inputs` that causes RR and Generic to produce different outputs without updating `divergent[]`, **When** the parity smoke runs, **Then** it fails with a message naming the drifted field so the developer can either (a) fix the drift or (b) explicitly mark it divergent with a rationale.

---

### Edge Cases

- **Default form values change after a future HTML edit** — per FR-007 we use hardcoded snapshots (`tests/baseline/rr-defaults.mjs` + `tests/baseline/generic-defaults.mjs`), so the harness won't auto-track HTML changes. Mitigation: the smoke will either (a) still pass if the new default produces a valid canonical shape, or (b) fail with a clear canonical-engine validation message. In case (a), the snapshot may lag reality silently but never breaks — the harness is still catching its real job (no-throw, sane shape). In case (b), update the offending snapshot field. The snapshot files' header comments document the one-file-one-line update procedure.
- **Canonical engine grows a new required field** — if `Inputs` gains a required field, both the harness's default values and the adapter logic must update; expect a failed smoke run to name the missing field. Documented workflow: add to `Inputs` typedef → add to adapter → add to default snapshots → re-run smoke.
- **Parity fixture needs a new `divergent[]` entry** — a legitimately RR-only field (e.g., actual earnings history) added to `Inputs` must be marked divergent; otherwise the parity smoke fails loudly. This is the intended signal.
- **CI runner version mismatch** — GitHub Actions runner must use Node 20+ matching the local test-runner requirement. Pin the version explicitly.
- **HTML file opened in a non-default locale** — form default values may differ by locale (e.g., number formatting). Scope: English locale only for this feature; non-en defaults out of scope.
- **Smoke harness itself drifts from inline-harness** — if the inline harness changes (e.g., feature 002 added a B3 regression test), the smoke harness doesn't need to re-mirror — they test different layers. Document the distinction so no one accidentally duplicates coverage.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The smoke harness MUST load the RR dashboard's cold-load default form values and run them through the canonical calc engine's full pipeline (`getCanonicalInputs()` logic → `solveFireAge(canonical)`), asserting that the call returns without throwing.
- **FR-002**: The smoke harness MUST perform the same check (FR-001) on the Generic dashboard's cold-load default form values.
- **FR-003**: The smoke harness MUST assert the returned `FireSolverResult` has every required field present with the expected type: `yearsToFire: number`, `fireAge: number`, `feasible: boolean`, `endBalanceReal: number`, `balanceAtUnlockReal: number`, `balanceAtSSReal: number`, `lifecycle: array of objects`.
- **FR-004**: The smoke harness MUST assert each numeric result falls in a sane range: `yearsToFire ∈ [0, 100]`, `fireAge ∈ [18, 110]`, balance values are finite (non-NaN, non-Infinity).
- **FR-005**: The smoke harness MUST NOT assert specific numeric values (no `fireAge === 54` locks). Its job is to catch type / shape / throw failures, not to lock behavioral numbers — that's the inline-harness's job.
- **FR-006**: When any smoke assertion fails, the failure message MUST name the specific field or condition that failed in actionable language (e.g., `"RR smoke: FireSolverResult.balanceAtUnlockReal is undefined; canonical engine returned an incomplete shape"` rather than generic `"assertion failed"`).
- **FR-007**: Default form values for both dashboards MUST be captured as hardcoded frozen snapshots in dedicated files (`tests/baseline/rr-defaults.mjs` and `tests/baseline/generic-defaults.mjs`). Each snapshot mirrors the legacy `inp` shape the current HTML engine consumes at cold-load, as the single source of truth the smoke harness reads from. When the HTML's cold-load defaults change (e.g., a form input's `value=` attribute is edited), the corresponding snapshot MUST be updated in the same PR. The snapshot files each carry a header comment naming: (a) the HTML file the values mirror, (b) the update procedure ("edit the HTML → run `node tests/baseline/browser-smoke.test.js` → observe the failure → update this file → rerun"), (c) a date of last sync.
- **FR-008**: The harness MUST include a parity smoke that runs the `tests/fixtures/rr-generic-parity.js` canonical input set through the canonical engine along two paths: an RR-path (inputs + personal-data-passthrough simulation — using the fixture's primary-person fields as if they'd come through `personal-rr.js`'s adapter) and a Generic-path (inputs consumed directly as canonical). For every field in the resulting `FireSolverResult` NOT listed in the fixture's `divergent[]` allow-list, the two paths MUST produce byte-identical output. Any drift fails a named test identifying the drifted field and suggesting the developer either fix the adapter or add the field to `divergent[]` with a rationale.
- **FR-009**: The smoke harness MUST run as part of `bash tests/runner.sh`. No separate invocation required for local use.
- **FR-010**: The smoke harness MUST be added to GitHub Actions CI via a new workflow file (`.github/workflows/tests.yml` or equivalent). The workflow runs on every push to any branch AND on every pull request targeting `main`. The workflow uses Node 20+, runs `bash tests/runner.sh`, and reports green/red status on the commit.
- **FR-011**: The CI workflow MUST NOT install any npm packages, MUST NOT generate any `package.json`, MUST NOT introduce any new runtime or build dependency (Principle V preservation). Only Node built-ins and `bash`.
- **FR-012**: The smoke harness source and fixtures MUST live alongside the existing `tests/baseline/` harness as a sibling test file. Naming mirrors the pattern: `tests/baseline/browser-smoke.test.js` (or equivalent).
- **FR-013**: When the canonical engine is updated to add a new required `Inputs` field, the smoke harness's default-value snapshots MUST fail a test pointing at the missing field — not silently pass with stale values. This is enforced by the canonical engine's input validation throwing on missing fields; FR-003 + FR-006 surface the failure.
- **FR-014**: The smoke harness MUST NOT introduce a browser dependency (no Playwright, no jsdom, no headless Chrome). It runs in pure Node and simulates the adapter pathway only.

### Key Entities *(include if feature involves data)*

- **DashboardDefaults**: a frozen object per dashboard recording the HTML form's cold-load values. Two of these — `RR_DEFAULTS` and `GENERIC_DEFAULTS`. Shape mirrors the legacy `inp` shape (not the canonical shape); adapters translate to canonical downstream.
- **SmokeResult**: the typed output of running one snapshot through the canonical engine. Same shape as `FireSolverResult` from feature 001's `data-model.md §4`.
- **ParitySmokeResult**: two `SmokeResult` instances (one via RR path, one via Generic path) plus a diff report of fields that differ after excluding `fixture.divergent`.
- **CIWorkflow**: the GitHub Actions YAML definition that runs `bash tests/runner.sh` on push + PR events. Minimal shape — OS: ubuntu-latest, Node: 20, command: `bash tests/runner.sh`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer working on feature 004's HTML canonical wire-up who introduces a `getCanonicalInputs()` bug catches that bug via the smoke harness in under 10 seconds of local test-runner wall-clock, without opening a browser.
- **SC-002**: GitHub Actions reports the test-suite status on every commit pushed to any branch within 5 minutes of the push event.
- **SC-003**: The smoke harness runs in under 5 seconds wall-clock on a developer laptop. (Tight because the overall test budget is 10 seconds per Constitution Principle V; the smoke harness is a small addition.)
- **SC-004**: Zero `package.json` / `node_modules` / new dependency files in the repo after this feature ships, verified by `git status` and by CI's absence of a dependency-install step.
- **SC-005**: A developer breaking the canonical engine's `FireSolverResult` shape (e.g., renaming `fireAge` to `retirementAge`) sees the smoke harness fail with a message naming `fireAge` as missing or wrong-typed. No silent passes.
- **SC-006**: The parity smoke fails loudly if a new `Inputs` field causes RR and Generic outputs to differ without being listed in `divergent[]`. The failure message names the drifted field.
- **SC-007**: A developer updating the HTML form's default values (e.g., raising default annual spend from $60 k to $65 k) can update the harness's pinned snapshot in under 5 minutes by editing one clearly-named file.
- **SC-008**: A future session resuming this work 6 months later can execute the full spec-kit implementation plan without requiring the original author's context — the harness design is self-documenting via `FR-*` requirements and the module header.

## Assumptions

- **Node 20+ is available in CI.** GitHub Actions' `ubuntu-latest` runner provides this by default as of 2026.
- **The canonical calc engine's public API is stable** — `solveFireAge({inputs, helpers}) → FireSolverResult` signature doesn't change mid-feature. If it changes, this feature's harness updates in lockstep.
- **`getCanonicalInputs()` does not yet exist** — this feature does NOT build it. Feature 004 builds it. This feature builds a PROTOTYPE adapter inside the harness (a simplified `getCanonicalInputs()`-like function that maps the legacy HTML form shape to canonical `Inputs`). When feature 004 ships its real adapter, this harness points at the real one instead. Documented migration path: "the prototype adapter in `tests/baseline/browser-smoke.test.js` is temporary; replace with a call to the production `getCanonicalInputs()` once feature 004 lands."
- **Default form values are pinned manually**, not parsed — per Q1 resolution, we use hardcoded snapshots in `tests/baseline/rr-defaults.mjs` + `tests/baseline/generic-defaults.mjs`. The snapshots are the source of truth for the smoke harness; drift against the HTML is possible but manageable. For JS-computed defaults (e.g., "age = current year − 1983"), the snapshot records the observed value with a comment explaining the derivation.
- **Parity fixture's current divergent list is complete** — `tests/fixtures/rr-generic-parity.js` currently lists only `ssPrimary.annualEarningsNominal` as divergent. This feature assumes that list is correct for today's state; any drift surfaced by the parity smoke is a real signal, not a pre-existing false positive.
- **CI failure behavior is observe-only for now** — the workflow reports status but does not block merge via GitHub branch protection (the repo admin can add that later if desired).
- **Windows development environment** — the developer runs `bash tests/runner.sh` locally on Windows via Git Bash. CI runs on Linux. Scripts must be compatible with both (already true of the existing runner).
- **No secrets required** — the CI workflow doesn't need GitHub secrets, API keys, or environment variables. Pure read-only test execution.
