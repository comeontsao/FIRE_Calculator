---

description: "Task list for feature 003-browser-smoke-harness"
---

# Tasks: Browser Smoke-Test Harness

**Input**: Design documents from `/specs/003-browser-smoke-harness/`
**Prerequisites**: plan.md (✅), spec.md (✅), research.md (✅), data-model.md (✅), contracts/ × 2 (✅), quickstart.md (✅)

**Tests**: This feature's entire output IS tests — three new regression/smoke tests. Constitution Principle IV (gold-standard regression coverage, NON-NEGOTIABLE) codifies this. The test tasks ARE the implementation.

**Organization**: Two user-story phases (US1 P1 MVP for cold-load smoke + CI, US2 P2 for parity smoke) bracketed by a Foundational phase (shared scaffolding) and a Polish phase.

## Format: `[ID] [P?] [Story] Description`

- Task IDs T001–T0XX sequential.
- `[P]` = parallelizable (different files, no incomplete-task dependency).
- `[US*]` label on every user-story-phase task.
- Setup / Foundational / Polish tasks omit the story label.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: Create the three scaffolding files every smoke test depends on — two frozen defaults snapshots + the test-file skeleton containing the prototype adapter. Nothing in US1 or US2 can start until these land.

⚠️ No user-story work begins until this phase is complete.

- [ ] T001 [P] Create `tests/baseline/rr-defaults.mjs`. Frozen `export default Object.freeze({...})` mirroring the RR dashboard's cold-load form values in the legacy `inp` shape. Use `Grep` + targeted `Read` on `FIRE-Dashboard.html` to extract the current defaults: age fields derived from Roger's 1983-06-15 and Rebecca's 1984-04-01 birthdates (floor to integers as of today); portfolios (rogerStocks, roger401kTrad, roger401kRoth, rogerCash, rebeccaStocks, etc.); returnRate, inflationRate, monthlySavings, retireSpend, country/scenario, fireMode, bufferUnlock, bufferSS, taxTrad, ssClaimAge, mortgage fields, second-home fields, kid/college fields — the full `inp` shape that `getInputs()` returns at page load. Header comment MUST include the SOURCE OF TRUTH path (`FIRE-Dashboard.html`), the 4-step update procedure from `research.md §R2`, and today's date as `Last synced: 2026-04-20`.
- [ ] T002 [P] Create `tests/baseline/generic-defaults.mjs`. Same pattern as T001 but mirrors `FIRE-Dashboard-Generic.html`'s cold-load defaults. Field names differ per Generic's form (`agePerson1` / `agePerson2` / `person1Stocks` etc.). Header comment names `FIRE-Dashboard-Generic.html` as the source of truth.
- [ ] T003 Scaffold `tests/baseline/browser-smoke.test.js` with: (a) standard `import test from 'node:test'` + `import assert from 'node:assert/strict'` prologue; (b) imports for `RR_DEFAULTS` + `GENERIC_DEFAULTS` + canonical-engine exports (`solveFireAge` from `calc/fireCalculator.js`, plus helper factories `makeInflation`, `computeTax`, `computeWithdrawal`, `projectSS`, `getHealthcareCost`, `resolveMortgage` + `computeMortgage`, `computeCollegeCosts`, `resolveSecondHome`, `computeStudentLoan` from their respective `calc/*.js` modules); (c) a `buildHelpers(inputs)` factory that returns the DI bundle expected by `solveFireAge`; (d) the `_prototypeGetCanonicalInputs(inp)` function per `contracts/smoke-harness.contract.md` — prefixed with the exact `TEMPORARY` block comment from `research.md §R1`; (e) NO test blocks yet — those land in the user-story phases. Verify `bash tests/runner.sh` still reports 77 pass / 0 fail / 1 skip (scaffolding alone adds no assertions).

**Checkpoint**: three new files in `tests/baseline/`. Runner unchanged at 77/0/1. Any user-story task can now proceed.

---

## Phase 3: User Story 1 — Cold-load smoke tests + CI workflow (Priority: P1) 🎯 MVP

**Goal**: Both dashboards' cold-load defaults flow through the canonical engine without throwing and produce a sane `FireSolverResult` shape. GitHub Actions runs the suite on every push and PR.

**Independent Test**: `bash tests/runner.sh` reports 79 pass / 0 fail / 1 skip (two new smokes added). Push to feature branch; GitHub Actions shows a green check within 5 minutes.

### Implementation for US1

- [ ] T004 [US1] Add the RR cold-load smoke test to `tests/baseline/browser-smoke.test.js` per `contracts/smoke-harness.contract.md` Test 1. Name the test `'RR cold-load smoke: canonical solveFireAge returns sane shape'`. Implement the 10 assertions from the contract: adapter returns without throw, solver returns without throw, `typeof result.fireAge === 'number'`, typeof checks for yearsToFire / feasible / endBalanceReal / balanceAtUnlockReal / balanceAtSSReal, `Array.isArray(result.lifecycle) && length > 0`, range checks `fireAge ∈ [18, 110]` + `yearsToFire ∈ [0, 100]`. Each assertion MUST carry a custom failure message naming the field (per `research.md §R5`).
- [ ] T005 [US1] Add the Generic cold-load smoke test. Identical structure to T004 but with `GENERIC_DEFAULTS`, test name prefixed `Generic cold-load smoke:`, failure messages prefixed `Generic smoke:`.
- [ ] T006 [P] [US1] Create `.github/workflows/tests.yml` per `contracts/ci-workflow.contract.md`. Create parent directories as needed (`.github/` and `.github/workflows/`). Content EXACTLY matches the contract's "Required shape" block: `name: Tests`, triggers `push: branches: ['**']` and `pull_request: branches: [main]`, single job named `test`, runs-on `ubuntu-latest`, three steps (checkout@v4, setup-node@v4 with `node-version: '20'`, run `bash tests/runner.sh`). No install step, no cache, no matrix, no secrets. This task runs in parallel with T004/T005 because it's a different file.
- [ ] T007 [US1] Local verification. Run `bash tests/runner.sh 2>&1 | tail -10`. **Expected**: **79 pass / 0 fail / 1 skip** (77 baseline + RR smoke + Generic smoke). Wall-clock under 10 seconds. If either smoke fails: diagnose using the failure message (which names the specific field), fix the prototype adapter or the defaults snapshot, rerun. Do NOT silently widen an assertion to make it pass.
- [ ] T008 [US1] CI verification. Commit T001–T007 changes, push the `003-browser-smoke-harness` branch to GitHub. Within 5 minutes of push: a "Tests" workflow run appears in the repo's Actions tab; it completes green. The commit's status API shows the green checkmark. If red: open the Actions log, diagnose, fix locally, push again. The workflow must NOT install any packages or create any `package.json` during its run.

**Checkpoint**: cold-load smoke coverage live locally and in CI. US1 is independently deliverable as MVP.

---

## Phase 4: User Story 2 — Parity smoke (Priority: P2)

**Goal**: The canonical `rr-generic-parity` fixture runs through both an "RR-path" simulated adapter call and a "Generic-path" direct call; every `FireSolverResult` field not listed in `fixture.divergent[]` matches byte-for-byte (via `assert.deepStrictEqual`). Today degenerate (both paths identical); activates real drift detection when feature 004 lands `personal-rr.js`.

**Independent Test**: `bash tests/runner.sh` reports 80 pass / 0 fail / 1 skip. The parity test passes trivially today (both paths compute identically). Deliberately modify the RR-path adapter call (e.g., add 1 to `currentAgePrimary` on the RR path only); confirm the parity test fails with a named drifted field.

### Implementation for US2

- [ ] T009 [US2] Add the parity smoke test to `tests/baseline/browser-smoke.test.js` per `contracts/smoke-harness.contract.md` Test 3. Name the test `'Parity smoke: RR-path and Generic-path outputs match on non-divergent fields'`. Import `tests/fixtures/rr-generic-parity.js`. Call `_prototypeGetCanonicalInputs(fixture.inputs)` twice — label one `rrPath` (with an inline TODO comment: `// Feature 004 will extend this path with personal-rr.js adapter`) and one `genericPath`. Run `solveFireAge` on each. Compare the whitelisted fields (yearsToFire, fireAge, feasible, endBalanceReal, balanceAtUnlockReal, balanceAtSSReal) via `assert.deepStrictEqual`, skipping fields listed in `fixture.divergent`. Do NOT compare `lifecycle` (too large; feature 004 adds if needed). Failure message names the drifted field and references `fixture.divergent[]` as the remediation path.
- [ ] T010 [US2] Local verification. `bash tests/runner.sh 2>&1 | tail -10` reports **80 pass / 0 fail / 1 skip**. Wall-clock under 10 seconds (SC-003). The parity test passes (degenerate today — both paths identical). Grep the test body to confirm: (a) two distinct calls to `_prototypeGetCanonicalInputs`, (b) a TODO comment referencing feature 004, (c) the whitelist of compared fields matches the contract, (d) `fixture.divergent` is read and its entries skipped.

**Checkpoint**: parity smoke scaffold live. US2 is independently deliverable on top of US1.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T011 [P] Contrived-failure diagnostic (SC-005). In a scratch edit of `tests/baseline/browser-smoke.test.js`, temporarily set one field in `_prototypeGetCanonicalInputs`'s returned object to `undefined` (e.g., `currentAgePrimary: undefined`). Run `bash tests/runner.sh`. Time how long it takes a reader to diagnose which field broke from the failure message alone — target < 30 seconds. If > 30 seconds, the failure message is insufficient; improve it per `research.md §R5`. Revert the scratch edit.
- [ ] T012 [P] Zero-dep discipline audit (SC-004 + Principle V). Confirm after this feature's commits: `ls package.json node_modules 2>&1` → both absent; `git status --short` shows no such files introduced; CI workflow contains no `npm install` step; no `.nvmrc`, `yarn.lock`, `pnpm-lock.yaml`, or equivalent anywhere.
- [ ] T013 [P] Update `BACKLOG.md`. Move F1 + T1 + T6 from their current P2/P4 sections into the Changelog section at the bottom with a line `F1 + T1 + T6 — Done in feature 003-browser-smoke-harness (commit <SHA>)`. Remove them from their original sections. Keep the prose describing the bug-fixed (F1's "Browser-side smoke test harness" block) as a pointer to this feature's artifacts.
- [ ] T014 [P] Verify the lockstep / symmetry discipline — Principle I sanity. The RR and Generic smoke tests (T004 + T005) MUST be structurally symmetric: same 10 assertions, same field names, same failure-message pattern. Run `diff` or eyeball-compare the two test blocks; any divergence must be for a legitimate dashboard-specific reason (none expected in this feature). Document any findings in the commit message.
- [ ] T015 PR prep + commit. Compose the commit message referencing: (a) the three smoke test names shipped, (b) the CI workflow, (c) `research.md §R1–R6` decisions, (d) BACKLOG items F1 + T1 + T6 closed, (e) pointer to `baseline-rr-inline.md` (predecessor regression harness for contrast). Push to GitHub, open a PR against `main`, confirm CI status check appears on the PR view.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)** — no dependencies; starts immediately. BLOCKS all user stories.
- **US1 (Phase 3)** — depends on Foundational (needs both defaults files + test scaffolding).
- **US2 (Phase 4)** — depends on Foundational + US1 (the parity smoke reuses the `_prototypeGetCanonicalInputs` helper validated by US1's smokes; if US1 fails, US2 won't meaningfully pass either).
- **Polish (Phase 5)** — depends on US1 + US2 complete.

### Within-Phase Dependencies

- **Foundational**: T001 ‖ T002 (different files; parallel). T003 is sequential after — its scaffold imports both defaults files.
- **US1**: T004 → T005 (same file, sequential to avoid edit conflict). T006 ‖ T004/T005 (different file — CI workflow). T007 gates on T004 + T005 + T006 all landed. T008 gates on T007 green + a push.
- **US2**: T009 is single. T010 gates on T009.
- **Polish**: T011 ‖ T012 ‖ T013 ‖ T014 (all independent). T015 sequential after — commit assembly.

### Parallel Opportunities

- **Foundational**: T001 and T002 in parallel (two-file independent creation).
- **US1**: T006 (CI workflow) runs in parallel with T004/T005 (test additions) — different files.
- **Polish**: T011, T012, T013, T014 are all `[P]` — any order or concurrency works.

### Critical path

Fastest sequence, if executed strictly sequentially: T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013 → T014 → T015. Expect ~2 hours total for this path.

With parallelism (one engineer multitasking small concurrent edits): ~90 minutes.

---

## Parallel Example: Foundational + US1 with shared engineer

```text
# Batch 1 — foundational files in parallel:
T001 (rr-defaults.mjs)
T002 (generic-defaults.mjs)

# Batch 2 — scaffolding (depends on Batch 1):
T003 (browser-smoke.test.js with adapter, no tests yet)

# Batch 3 — US1 implementation in parallel where possible:
T004 (RR smoke block)    } sequential within the test file
T005 (Generic smoke block)
T006 (CI workflow)       } parallel — different file

# Batch 4 — US1 verification (sequential):
T007 (local runner green) → T008 (CI green)
```

---

## Implementation Strategy

### Commit structure

**Two-commit plan preferred**:

1. **Commit 1**: Foundational + US1 (T001–T008).
   Message: `feat(003): browser smoke harness + CI workflow (US1)`
2. **Commit 2**: US2 + Polish (T009–T015).
   Message: `feat(003): parity smoke + polish`

Keeps each commit reviewable; each leaves the runner green. One-commit fallback is fine if the diff is small enough.

### MVP sequence

1. Phase 2 Foundational (3 files, ~20 min).
2. Phase 3 US1 (5 tasks, ~40 min — most time goes to T008 GitHub round-trip).
3. **STOP and VALIDATE** — US1 MVP shipped: cold-load smokes + CI.
4. Phase 4 US2 (parity smoke, ~15 min).
5. Phase 5 Polish (~25 min).

Total ~2 hours of focused work.

### Verification gates between phases

- After Foundational (T003): runner reports 77/0/1 unchanged. Defaults files shape-valid on import.
- After US1 (T008): runner reports 79/0/1 locally; CI green on remote.
- After US2 (T010): runner reports 80/0/1.
- After Polish (T015): `BACKLOG.md` updated, no `package.json` in tree, PR open with green check.

Do not advance past a phase until its verification gate is green.

---

## Notes

- **Test-naming discipline** (SC-005 diagnostic time): every test's name AND every assertion's failure message names the specific field/condition. "RR smoke" alone is insufficient — append the failing field.
- **Prototype adapter marker** (research §R1): the `TEMPORARY` block comment in `_prototypeGetCanonicalInputs` is non-optional. Feature 004 will grep for it to locate the scaffold to replace.
- **Parity smoke degenerate-today is correct** (research §R3): the test must exist and pass with two identical-path calls today. When feature 004 introduces real RR-path divergence, the smoke activates without a harness change here.
- **CI workflow is MINIMAL** (research §R4 + ci-workflow.contract.md): 14 lines, no matrix, no cache, no install step. Expanding it is a separate feature with its own justification.
- **Zero-build discipline** (Principle V NON-NEGOTIABLE): no `package.json`, no `node_modules`, no `.nvmrc`. CI reproduces local-dev invariants exactly.

---

**Total tasks**: 15 across 4 phases (Setup phase empty — no separate scaffolding needed). Target overall wall-clock: ~2 hours solo.
