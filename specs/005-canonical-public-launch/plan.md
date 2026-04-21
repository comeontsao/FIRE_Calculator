# Implementation Plan: Canonical Engine Swap + Public Launch

**Branch**: `005-canonical-public-launch` | **Date**: 2026-04-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-canonical-public-launch/spec.md`

## Summary

This is a composite feature doing three cohesive things:

1. **Canonical engine swap done right (F2 retry)** — extract the three HTML shim
   functions into a Node-importable `calc/shims.js` module so their try/catch +
   fallback behavior gets proper unit-test coverage (closing the gap that let
   feature 004's regression reach the browser). Add production
   `calc/getCanonicalInputs.js` adapter. Shim `findMinAccessibleAtFireNumerical`
   too, so `isFireAgeFeasible` can finally be deleted. Retarget feature 003's
   smoke harness to the production adapter.

2. **UX cleanup + tech debt closure (U1 + U2 + D1 + D3 + D6)** — surface
   `deficitReal` on the infeasibility banner; migrate KPI cards to
   `chartState.onChange` listeners; drop `normalizeMortgageShape` compat shim;
   lock the `coast-fire.js` TBD placeholder; delete `isFireAgeFeasible` (now
   unblocked by the shim of its last caller).

3. **Public launch prep (disclaimer + publish-readiness)** — add an MIT
   LICENSE, a public-facing README, an `index.html` entry point for GitHub
   Pages, a PUBLISH.md Publish-Ready Checklist (two manual steps the user
   executes after merge), and a privacy scrub of all soon-to-be-public files.
   Also ship a legal/CYA disclaimer in both HTML files (research-only, not
   financial advice, DYOR).

Technical approach: edit both HTML files in lockstep per commit; add three new
`calc/*.js` files (`shims.js`, `getCanonicalInputs.js`, plus a small restoration
in `fireCalculator.js`); add new `tests/unit/shims.test.js` with fallback
coverage. Feature 003's smoke harness is the integration gate on every commit,
now strengthened by the Node-testable shim layer.

## Technical Context

**Language/Version**: JavaScript (ES2022, native ES modules). No TypeScript.

**Primary Dependencies**: Chart.js (CDN, existing). Dev-only: `node:test` +
`node:assert/strict` (Node built-ins). **No new deps.**

**Storage**: N/A. `FIRE-snapshots.csv` + `localStorage` untouched.

**Testing**: Existing `bash tests/runner.sh` (80 tests as of main@`6ded8ba`).
New additions:
- `tests/unit/shims.test.js` — at minimum one test per shim stubbing the
  relevant `window._*` to throw + asserting the documented fallback +
  `console.error` prefix. Expected: ≥ 4 new test cases (one per shim).
- Optional `tests/unit/fireCalculator.test.js` extension covering the restored
  `evaluateFeasibility` export (4 cases: Safe feasible+buffer; Safe
  under-buffer; per-year infeasible; DWZ ignores buffer).

Expected runner count after feature merges: **≥ 84 pass** (80 inherited + ≥ 4
new shim tests + optional evaluateFeasibility tests), 0 fail, 1 skip.

**Target Platform**:
- Local dev: Node 20+ on Windows / macOS / Linux.
- CI: GitHub Actions `ubuntu-latest` + Node 20 (existing feature 003 workflow).
- Runtime: modern browsers (last-two-major Chromium / Firefox / Safari) served
  via `file://` locally OR `https://` via GitHub Pages.

**Project Type**: Composite refactor + publish-prep. In-place HTML edits +
new calc modules + new tests + new root-level docs (`LICENSE`, `README.md`,
`index.html`, `PUBLISH.md`).

**Performance Goals**:
- Both dashboards cold-load + render all KPIs within 2 s on mid-range laptop
  (SC-001).
- Existing drag ≥ 30 fps maintained.
- Test runner stays < 10 s wall-clock.
- CI end-to-end stays < 5 min.

**Constraints**:
- Zero new runtime or dev deps (Principle V).
- Both HTML files edited in LOCKSTEP per commit (Principle I).
- `projectFullLifecycle` + chart renderers MUST NOT be touched (out-of-scope
  per FR-010).
- Every commit passes `bash tests/runner.sh` locally and CI remotely.
- **Every commit that changes shim logic MUST be accompanied by a shim unit
  test update in the same commit** — the discipline that feature 004 lacked.

**Scale/Scope**:
- 2 HTML files edited (lockstep).
- 3 new files in `calc/`: `shims.js`, `getCanonicalInputs.js` (restored export
  in `fireCalculator.js` is an edit, not a new file).
- 1 new file in `tests/unit/`: `shims.test.js`.
- 4 new files at repo root: `LICENSE`, `README.md`, `index.html`, `PUBLISH.md`.
- 1 new file in `specs/005-canonical-public-launch/`: `privacy-scrub.md` (FR-019 output).
- 1 test file retargeted: `tests/baseline/browser-smoke.test.js`.
- Translation catalog extended with 2+ new disclaimer keys.
- Expected LoC: +400 (calc/shims.js + tests + new docs) / −200 (dead helper
  deletions). Net +200 across the repo.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|---|---|---|
| I. Dual-Dashboard Lockstep (NON-NEGOTIABLE) | ✅ | FR-007 + FR-011 + FR-013 mandate lockstep. Shared `calc/shims.js` module mechanically enforces shim-behavior parity between both HTML files (one source, two consumers). Disclaimer lands in both files in the same commit. |
| II. Pure Calculation Modules with Declared Contracts | ✅ | New `calc/shims.js` is pure (no DOM; purposely — the shims access `window._*` only inside try/catch wrappers that will be stubbed in tests); `calc/getCanonicalInputs.js` is pure; `evaluateFeasibility` restoration is pure. Module-boundaries meta-test enforces. **Subtle concern**: shims read `window._solveFireAge` etc. at call time. Research §R1 discusses how to reconcile "pure calc module" with "reads window at call time" — ultimately shim is a glue layer and the purity check may need a carveout. |
| III. Single Source of Truth for Interactive State | ✅ | `chartState` unchanged. FR-023 strengthens it (KPI cards subscribe directly). |
| IV. Gold-Standard Regression Coverage (NON-NEGOTIABLE) | ✅ | FR-003 mandates `tests/unit/shims.test.js` covering each shim's fallback. This IS the gap that let feature 004's bug escape; closing it is the central Principle IV action. Smoke harness retargeted per FR-007 continues to gate CI. |
| V. Zero-Build, Zero-Dependency Delivery | ✅ | No `package.json`, no `node_modules`, no new deps. Chart.js remains CDN. |
| VI. Explicit Chart ↔ Module Contracts | ✅ | FR-010 + FR-023 preserve chart renderers unchanged. Consumers lists stay accurate. US4 bidirectional meta-test still skipped pending future work. |

**Gate result: PASS.** Only one subtle concern (Principle II purity of shims module reading `window.*`); addressed in research §R1. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/005-canonical-public-launch/
├── plan.md              # This file
├── research.md          # Phase 0 — key design decisions
├── data-model.md        # Phase 1 — entities (mostly new: shims.js export shape, LICENSE, README)
├── quickstart.md        # Phase 1 — verification recipe (~10 min)
├── contracts/           # Phase 1
│   ├── shims.contract.md            # the Node-testable shims module + fallbacks
│   ├── adapter.contract.md          # getCanonicalInputs production spec
│   └── publish-ready.contract.md    # LICENSE + README + index.html + PUBLISH.md spec
├── privacy-scrub.md     # Phase 0/1 — output of the FR-019 privacy audit
├── checklists/
│   └── requirements.md  # all ✅ post-clarification
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
# Runtime — edited in lockstep
FIRE-Dashboard.html                 # bootstrap + shim imports + disclaimer
FIRE-Dashboard-Generic.html         # same; also the dashboard that becomes public

# Canonical engine — new + extended
calc/shims.js                       # NEW — Node-testable shim module with try/catch + fallbacks
calc/getCanonicalInputs.js          # NEW — production adapter (legacy inp → canonical Inputs)
calc/fireCalculator.js              # edited — restore evaluateFeasibility export

# Tests — new + retargeted
tests/unit/shims.test.js            # NEW — fallback coverage; stubs window._* to throw
tests/unit/fireCalculator.test.js   # optional extension — evaluateFeasibility unit tests
tests/baseline/browser-smoke.test.js # edited — import production getCanonicalInputs, delete prototype

# Publish-prep — new at root
index.html                          # NEW — tiny redirect page → FIRE-Dashboard-Generic.html (GitHub Pages entry)
LICENSE                             # NEW — MIT license text
README.md                           # NEW — public-facing project description + usage + disclaimer
PUBLISH.md                          # NEW — 2-step Publish-Ready Checklist for user's manual launch

# Translation catalog — edited
FIRE-Dashboard Translation Catalog.md  # +2 disclaimer keys (EN + zh-TW)

# CLAUDE.md — edited for process docs + SPECKIT pointer
CLAUDE.md                           # new "Process Lessons" section + SPECKIT pointer update

# Unchanged — out of scope
calc/{chartState,inflation,tax,withdrawal,socialSecurity,healthcare,mortgage,college,secondHome,studentLoan,lifecycle}.js
                                     # U2B-4b / U2B-4c territory; not touched by this feature
tests/fixtures/*.js
tests/meta/*.test.js
tests/baseline/{rr-defaults,generic-defaults,inline-harness}.*
.github/workflows/tests.yml          # already public-ready from feature 003
FIRE-snapshots.csv
BACKLOG.md                           # updated at the end; not a task per se
```

**Structure Decision**: Composite feature with three coherent arcs. No new
directories introduced; four new root-level docs (LICENSE, README, index.html,
PUBLISH.md) are the only conceptual additions. Lockstep discipline applies to
both HTML files + the shim contracts + the disclaimer placement.

## Complexity Tracking

*No violations. Section intentionally empty.*
