# Implementation Plan: Inline Engine Bugfix (B1 + B3)

**Branch**: `002-inline-bugfix` | **Date**: 2026-04-19 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-inline-bugfix/spec.md`

## Summary

Patch the inline dashboard engines in `FIRE-Dashboard.html` and
`FIRE-Dashboard-Generic.html` to fix two audit-identified correctness bugs
recorded in `specs/001-modular-calc-engine/baseline-rr-inline.md §C`:

- **B1 (§C.1)** — Healthcare and college overlay costs are added to the
  retirement-phase projection as nominal dollars, while the accumulation and
  withdrawal math use real (inflation-adjusted) dollars. The mismatch inflates
  FIRE age by ~1 year.
- **B3 (§C.3)** — Generic's FIRE solver ignores the secondary person's
  portfolio, annual contributions, and Social Security benefit. For two-person
  households, Generic silently behaves as single-person.

This feature does NOT swap the dashboards onto the canonical calc engine under
`calc/` — that is feature 004. This feature patches the currently-running
inline engines in place, preserving all existing behavior except the two bugs
named above. The Node-runnable inline harness (`tests/baseline/inline-harness.mjs`)
is updated in lockstep so its locked expected values become the new post-fix
regression oracle.

Scope is deliberately narrow: ~50 lines of inline-JS edits per HTML file (B1),
plus ~80 lines of Generic-specific solver changes (B3), plus harness + test
extensions. No new modules, no new UI, no new i18n strings, no chart-renderer
changes.

## Technical Context

**Language/Version**: JavaScript (ES2022). No TypeScript, no transpile.

**Primary Dependencies**: Chart.js (CDN, unchanged runtime dep). Dev-only:
`node:test` + `node:assert/strict` (built-ins). No additions.

**Storage**: N/A. `FIRE-snapshots.csv` and `localStorage` keys are untouched.

**Testing**: Node 20+ via existing `tests/runner.sh`. Two new regression tests
land in `tests/baseline/inline-harness.test.js` (B1 delta within [0.5, 1.5]
years; B3 secondary-person sensitivity).

**Target Platform**: Modern browsers (Chromium, Firefox, Safari) loaded via
`file://`. Unchanged from feature 001.

**Project Type**: Single-file-openable web app + sidecar calc modules +
dev-only test harness. Unchanged structure.

**Performance Goals**: No change. Existing budgets (first meaningful chart
< 1 s; drag ≥ 30 fps) are preserved because the patches add no expensive
operations.

**Constraints**:
- Zero build, zero new runtime deps (Principle V).
- B1 fix lands in both HTML files in one commit (Principle I lockstep).
- Harness updated in the same commit that patches the engine (so locked
  expected values never go stale).
- Canonical modules under `calc/` are NOT modified. This feature works entirely
  in the inline-engine layer.

**Scale/Scope**:
- 2 HTML files modified.
- 1 harness module (`tests/baseline/inline-harness.mjs`) modified.
- 1 test file (`tests/baseline/inline-harness.test.js`) extended.
- 1 baseline doc (`specs/001-modular-calc-engine/baseline-rr-inline.md`)
  gets a new Section D documenting post-fix observed values.
- ~2–4 new test blocks; expect runner count to tick from 76 → 78–80.
- Expected LoC delta: ~+80 / −30 net across the HTML files (B3 adds more
  than it removes; B1 is a near-zero-delta refactor).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|---|---|---|
| I. Dual-Dashboard Lockstep (NON-NEGOTIABLE) | ✅ | B1 fix ships to both HTML files in one commit. B3 is Generic-only by nature (the bug exists only in Generic); this is a legitimate divergence, documented in the commit message. |
| II. Pure Calculation Modules with Declared Contracts | ✅ | This feature does NOT modify any `calc/*.js` module. It patches inline-engine code, which Principle II acknowledges as transitional. Canonical engine stays unchanged and available for future HTML wire-up. |
| III. Single Source of Truth for Interactive State | ✅ | No changes to `chartState.js` or the FIRE-age override lifecycle. Fixes are solver-internal and never read/write `chartState` state. |
| IV. Gold-Standard Regression Coverage (NON-NEGOTIABLE) | ✅ | Two new regression tests in `tests/baseline/inline-harness.test.js` lock both fixes. Harness `EXPECTED_*` constants updated to post-fix observed values. A revert of either fix fails a named test. |
| V. Zero-Build, Zero-Dependency Delivery | ✅ | No `package.json`, no `node_modules`, no bundler. Edits are inline JavaScript and Node-built-in test code. |
| VI. Explicit Chart ↔ Module Contracts | ✅ | No chart renderers modified. No calc-module `Consumers:` lists change. US4 meta-test stays skipped. |

**Gate result: PASS.** No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/002-inline-bugfix/
├── plan.md              # This file
├── research.md          # Phase 0 — localization of B1 and B3 + fix strategies
├── data-model.md        # Phase 1 — affected inputs/outputs (no new entities)
├── quickstart.md        # Phase 1 — 5-minute end-to-end verification
├── contracts/           # Phase 1
│   └── harness-regression.contract.md
├── checklists/
│   └── requirements.md  # ✅ all items post-clarification
└── tasks.md             # Phase 2 output (created by /speckit-tasks)
```

### Source Code (repository root)

```text
# Runtime (edited in this feature)
FIRE-Dashboard.html              # RR — B1 patch (healthcare + college real-dollar conversion)
FIRE-Dashboard-Generic.html      # Generic — B1 patch (lockstep) + B3 patch (secondary person)

# Dev-only test harness (edited in this feature)
tests/baseline/inline-harness.mjs     # Mirror engine fix; update EXPECTED_* constants
tests/baseline/inline-harness.test.js # Two new regression tests (one per bug)

# Baseline doc (extended in this feature — lives in feature 001's spec dir)
specs/001-modular-calc-engine/baseline-rr-inline.md  # Add §D — post-fix observed values

# Unchanged in this feature
calc/*.js                         # canonical engine untouched
tests/unit/*.test.js              # canonical-engine unit tests untouched
FIRE-Dashboard Translation Catalog.md
FIRE-snapshots.csv
```

**Structure Decision**: This feature operates entirely within existing files.
No new directories, no new modules. The "surgical patch" shape is what makes
it a fast win relative to feature 004's full HTML wire-up.

## Complexity Tracking

*No violations. Section intentionally empty.*
