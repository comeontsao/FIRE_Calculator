# Implementation Plan: Browser Smoke-Test Harness

**Branch**: `003-browser-smoke-harness` | **Date**: 2026-04-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-browser-smoke-harness/spec.md`

## Summary

Ship a small Node-runnable harness that proves the canonical calc engine
(`calc/*.js` modules from feature 001) can consume the two dashboards' cold-load
form defaults without throwing and returns a shape the HTML glue can actually
use. Extend it with a parity smoke that locks the RR-path vs Generic-path
equivalence contract on every non-declared-divergent field. Wire both into
GitHub Actions CI so every push / PR gets a green-or-red status.

This feature is a **gate, not a product**. Its entire reason to exist is to
catch the class of failure that killed feature 001's U2B-4a refactor: unit
tests stayed green while the HTML integration silently broke. Without this
harness in place, feature 004 (HTML canonical wire-up) can't be attempted
safely. With it, feature 004 becomes a mechanical swap.

Technical approach: three new files in `tests/baseline/` (two frozen-object
defaults files + one test file), one new GitHub Actions workflow at
`.github/workflows/tests.yml`. Zero runtime changes. Zero new deps. A small
prototype `getCanonicalInputs()` adapter lives inside the test file and is
explicitly marked temporary — feature 004 replaces it with the production
adapter.

## Technical Context

**Language/Version**: JavaScript (ES2022, native ES modules). No TypeScript.

**Primary Dependencies**: Chart.js (CDN, unchanged runtime dep — unused in this
feature). Dev-only: `node:test` + `node:assert/strict` (built-ins). **No new
deps of any kind.**

**Storage**: N/A. No persistence. Defaults snapshots are frozen constants
compiled into the test bundle.

**Testing**: Node 20+ via existing `tests/runner.sh`. Three new test blocks
land in `tests/baseline/browser-smoke.test.js` (RR smoke, Generic smoke,
parity smoke). Expect runner count to tick from 77 → 80.

**Target Platform**:
- Local dev: Node 20+ on Windows / macOS / Linux (any platform the existing
  `tests/runner.sh` works on).
- CI: GitHub Actions `ubuntu-latest` runner, Node 20.

**Project Type**: Dev tooling addition only. No changes to the runtime
dashboards or calc modules.

**Performance Goals**: Smoke harness runs in under 5 seconds wall-clock
locally (SC-003). Total test runner stays under the 10-second Principle V
budget. CI end-to-end (checkout → node setup → test run → status report)
under 5 minutes (SC-002).

**Constraints**:
- Zero new runtime or dev deps (Principle V).
- No `package.json`, no `node_modules`, no installable test framework.
- No browser automation (no Playwright, no jsdom, no headless Chrome —
  explicitly out of scope per FR-014).
- The prototype `getCanonicalInputs()` adapter is temporary and documented
  as such; feature 004 replaces it.

**Scale/Scope**:
- 3 new files: `tests/baseline/rr-defaults.mjs`, `generic-defaults.mjs`,
  `browser-smoke.test.js`.
- 1 new CI file: `.github/workflows/tests.yml`.
- 3 new test blocks (RR smoke, Generic smoke, parity smoke).
- Expected ~300 LoC total across all new files.
- Zero modifications to existing HTML, calc, or test code.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|---|---|---|
| I. Dual-Dashboard Lockstep (NON-NEGOTIABLE) | ✅ | This feature doesn't modify either dashboard. Both RR and Generic get a dedicated defaults snapshot + smoke assertion; both are exercised symmetrically. Lockstep is not applicable to test-tooling additions, but the coverage is balanced. |
| II. Pure Calculation Modules with Declared Contracts | ✅ | No `calc/*.js` modification. The prototype adapter in the test file is explicitly NOT a calc module — it's a test fixture scaffolding marked temporary. |
| III. Single Source of Truth for Interactive State | ✅ | No `chartState` changes. |
| IV. Gold-Standard Regression Coverage (NON-NEGOTIABLE) | ✅ | This feature IS regression coverage — it adds gates that catch an entire class of failure unit tests miss. The prototype adapter itself is validated against canonical engine output shape; drift fails loudly. |
| V. Zero-Build, Zero-Dependency Delivery | ✅ | No `package.json`, no `node_modules`, no bundler, no new runtime or dev deps. CI workflow installs zero packages — only invokes Node built-ins and `bash`. The GitHub Actions YAML file itself ships with the repo and runs on GitHub's managed runners. |
| VI. Explicit Chart ↔ Module Contracts | ✅ | No chart renderers or calc-module `Consumers:` lists touched. US4 meta-test stays skipped. |

**Gate result: PASS.** No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/003-browser-smoke-harness/
├── plan.md              # This file
├── research.md          # Phase 0 — key design decisions (already-resolved Q1 + Q2 plus adapter prototype strategy)
├── data-model.md        # Phase 1 — snapshot shapes + smoke-result shapes
├── quickstart.md        # Phase 1 — <5-minute verification recipe
├── contracts/           # Phase 1 — harness contract + CI workflow contract
│   ├── smoke-harness.contract.md
│   └── ci-workflow.contract.md
├── checklists/
│   └── requirements.md  # all ✅ post-clarification
└── tasks.md             # Phase 2 (/speckit-tasks output — not created here)
```

### Source Code (repository root)

```text
# Dev-only additions in this feature
tests/baseline/
├── rr-defaults.mjs              # NEW — frozen snapshot of RR cold-load form values (legacy inp shape)
├── generic-defaults.mjs         # NEW — frozen snapshot of Generic cold-load form values
└── browser-smoke.test.js        # NEW — three smoke tests (RR, Generic, parity) + prototype adapter

.github/
└── workflows/
    └── tests.yml                # NEW — GitHub Actions workflow: Node 20 ubuntu-latest, runs bash tests/runner.sh on push + PR

# Unchanged
calc/*.js                        # canonical engine — no modifications
FIRE-Dashboard.html              # runtime — no modifications
FIRE-Dashboard-Generic.html      # runtime — no modifications
FIRE-Dashboard Translation Catalog.md
FIRE-snapshots.csv
tests/baseline/inline-harness.mjs       # separate regression oracle — unchanged
tests/baseline/inline-harness.test.js
tests/unit/*.test.js             # canonical-engine unit tests — unchanged
tests/fixtures/*.js              # existing fixture corpus — unchanged
tests/meta/*.test.js             # unchanged
tests/runner.sh                  # unchanged (existing glob already picks up new .test.js file)
```

**Structure Decision**: Infrastructure addition, not refactor. Three new files
in one existing directory + one new CI workflow. No code moved; no existing
tests modified. Cleanest possible additive shape.

## Complexity Tracking

*No violations. Section intentionally empty.*
