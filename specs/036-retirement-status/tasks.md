# Tasks: Explicit Retirement Status

**Input**: Design documents from `specs/036-retirement-status/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/retirement-status.contract.md, quickstart.md
**Branch**: `036-retirement-status`

**Tests**: INCLUDED. Constitution IV (Gold-Standard Regression Coverage, NON-NEGOTIABLE) mandates fixtures for every calc change, and the contract (C-5) enumerates six lock-in fixtures. Calc unit fixtures are written TDD-first (RED before GREEN). E2E specs drive both dashboards through real browser flows.

**Lockstep note (Principle I)**: Unless a task says "Generic only" or "RR only", every HTML-file change lands in **BOTH** `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` in the same task. The single deliberate divergence (C1) is: RR = one household retirement date; Generic = per-person staggered retirement + `person1Income`/`person2Income` inputs (US5).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US5; Setup/Foundational/Polish carry no story label

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish a green regression anchor before touching anything.

- [ ] T001 Record baseline: run `npm test`, `npm run test:e2e`, and `node tools/console-probe.mjs` on BOTH HTML files; capture pass counts + errorCount 0 as the pre-feature regression anchor (backs INV-1 / SC-004).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The calc descriptor, the single transition resolver, projection threading, and persistence — every user story depends on these.

**⚠️ CRITICAL**: No user-story work begins until this phase is complete.

- [ ] T002 [P] TDD (RED): create `tests/unit/accumulateToFire.retirement.test.js` with FAILING fixtures from contract C-5 — `retired-now`, `off-revert-parity` (== v7 when descriptor absent, INV-1), `ss-independence`, and single-earner income masking. Assert per-year `workingIncome`/contributions per data-model INV-2/INV-3.
- [ ] T003 Implement `options.retirement` descriptor in `calc/accumulateToFire.js` per contract C-1 (per-year `workingIncome(age)` masking + proportional `contribScale`); absent descriptor ⇒ byte-identical v7. Update the fenced `Inputs:`/`Outputs:`/`Consumers:` header (Principle II/VI). Make T002 GREEN.
- [ ] T004 Add pure helper `resolveRetirementTransitionAge(inp, status)` and wire the transition precedence into the ONE effective-transition path (`effectiveFireAge = fireAgeOverride ?? calculatedFireAge`, RR ~15406; `chartState.effectiveFireAge`) in BOTH HTML files per contract C-3 — status ON returns the retirement age (RR household / Generic `max` of retired earners) and supersedes the drag override. Do NOT route through `calc/fireAgeResolver.js` (display-precision only).
- [ ] T005 Thread `options.retirement` from `projectFullLifecycle` (RR ~11202 / Generic ~11280) into `accumulateToFire` via `resolveAccumulationOptions`, and pass the household transition age as `overrideFireAge` so the retirement-loop `isRetired = age >= fireAge` boundary matches the accumulator (contract C-2) in BOTH HTML files.
- [ ] T006 Add `state._retirementStatus` to persistence in BOTH HTML files: default shape (RR `{retired:false, retirementYear:<currentYear>}`; Generic `{persons:[...]}`), write in `saveState` (sibling of `_payoffVsInvest`, RR ~19206), read in `restoreState` (RR ~19221). **Do NOT bump `GENERIC_VERSION` ('v3', ~19730) — it wipes user data**; additive field needs no gate.

**Checkpoint**: Descriptor + resolver + projection + persistence exist and are unit-green; UI wiring can now begin per story.

---

## Phase 3: User Story 1 - Declare "I've retired" (Priority: P1) 🎯 MVP

**Goal**: A durable "I've retired" switch + retirement year that forces pure drawdown from that year, persists, and reverts cleanly when off.

**Independent Test**: Toggle ON with retirement year = current year → all subsequent years show zero employment income + zero new contributions and balances draw down; reload → status/year persist; toggle OFF → projection reverts exactly to feasibility-driven output.

- [ ] T007 [US1] i18n: add EN + zh-TW keys for the "I've retired" switch label, its help tip, and the "Retirement year" input label to `TRANSLATIONS.en`/`.zh` in BOTH HTML files and to `FIRE-Dashboard Translation Catalog.md` (Principle VII).
- [ ] T008 [US1] UI: add the "I've retired" toggle + a "Retirement year" number input (default = current year) to BOTH HTML files (RR single household); year input shown only when the toggle is ON; place per Sticky-Chrome Discipline (justify z-index if floating).
- [ ] T009 [US1] Wire handlers in BOTH HTML files: toggle/year `onchange` → write `state._retirementStatus` → `saveState()` → `recalcAll()`; effective transition age resolves via the T004 helper (retroactive/current year clamps to "now", FR-013).
- [ ] T010 [US1] Verify honest early-retirement drawdown in BOTH files: retiring before the "safe" age produces a complete year-by-year drawdown with the existing `hasShortfall` red-tint on shortfall years (FR-007 / SC-005) — no "still working" projection.
- [ ] T011 [P] [US1] E2E: create `tests/e2e/retirement-status.spec.ts` US1 cases (toggle on → no income/contributions; reload persistence; toggle off → revert-parity; retire-earlier shortfall) against BOTH dashboards.

**Checkpoint**: MVP — a user can declare retirement, see honest drawdown, persist it, and turn it off.

---

## Phase 4: User Story 2 - Feasibility becomes an "on-track" readout (Priority: P2)

**Goal**: When retired, the Safe/Exact/DWZ headline reframes to sustainability; never a countdown.

**Independent Test**: Status ON + money lasts → "sustainable to age N"; money runs short → "at risk — shortfall in {year}"; never "FIRE in 0 years".

- [ ] T012 [US2] i18n: add EN + zh-TW keys `retire.verdict.sustainable` ("🟢 Retired — sustainable to age {0}") and `retire.verdict.atRisk` ("⚠️ Retired — at risk · shortfall in {0}") to BOTH HTML files + catalog.
- [ ] T013 [US2] Add a retired branch (taken first) in the status-headline block (RR ~14511–14541 / Generic mirror) per contract C-4: reuse the existing stop-gap `projectFullLifecycle` probe + per-year `hasShortfall`/`total<0` to pick sustainable vs at-risk (first shortfall year); suppress every "FIRE in N years" string when status ON (FR-006 / FR-014 / SC-001). Both files.
- [ ] T014 [P] [US2] E2E: add US2 cases to `tests/e2e/retirement-status.spec.ts` — sustainable headline + at-risk headline naming the correct shortfall year, on BOTH dashboards.

**Checkpoint**: A retired user never sees a countdown; verdict matches their declared reality.

---

## Phase 5: User Story 3 - Planning lever preserved for the not-yet-retired (Priority: P2)

**Goal**: Drag works as the planning what-if when OFF; goes inert (no second retirement age) when ON.

**Independent Test**: Status OFF → dragging the marker updates planned FIRE age; status ON → drag is inert and the marker reflects the actual retirement age.

- [ ] T015 [US3] Gate the FIRE-marker drag entry points on status OFF in BOTH HTML files: mousedown hit-test (RR ~16466) and `applyOverride`/`cs.setOverride` (RR ~16795) become no-ops when ON; the marker reflects the retirement transition age and does not write `fireAgeOverride` (FR-011); re-enable + clear residual on OFF (FR-009).
- [ ] T016 [P] [US3] E2E: add US3 cases — drag adjusts age when OFF; drag inert + marker at retirement age when ON — on BOTH dashboards.

**Checkpoint**: One unambiguous retirement lever at a time.

---

## Phase 6: User Story 4 - Auto-suggest marking retired (Priority: P3)

**Goal**: A gentle, dismissible, non-nagging nudge when a not-yet-retired user crosses the feasible line.

**Independent Test**: Cross the feasible line → dismissible banner appears; dismiss → no projection change + no repeat this session; accept → status ON (delegates to US1).

- [ ] T017 [US4] i18n: add EN + zh-TW keys for the auto-suggest banner ("Looks like you could retire as of {0} — mark yourself retired?"), accept + dismiss labels, to BOTH HTML files + catalog.
- [ ] T018 [US4] Auto-suggest banner in BOTH HTML files: non-blocking, dismissible; shown only when status OFF AND feasible today (`yrsToFire <= 0`); dismissal session-scoped via `sessionStorage['fire:retireSuggestDismissed']` (mirrors `fire:dragHintSeen` pattern); accept → set `_retirementStatus.retired=true`, retirementYear=current year → US1 path; dismiss changes no projection and does not repeat this session (FR-012). z-index > 60 (Sticky-Chrome).
- [ ] T019 [P] [US4] E2E: add US4 cases — banner appears on crossing; dismiss = no-op + no repeat; accept = retired — on BOTH dashboards.

**Checkpoint**: Discoverable at the moment it matters; the switch stays the source of truth.

---

## Phase 7: User Story 5 - Staggered retirement for two earners (Generic only) (Priority: P2)

**Goal**: On Generic, two earners retire at different times; retiring one stops only their income/contributions until the other retires. RR unchanged (C1 divergence).

**Independent Test**: Generic, 2 earners, years Y1<Y2 → interim years drop only the earlier earner's income; after Y2 all employment income stops; single-adult mode hides Person 2.

- [ ] T020 [US5] i18n (Generic + catalog only): add EN + zh-TW keys for "Person 1 income" / "Person 2 income" and per-person retirement labels. RR untouched (deliberate divergence — note in commit).
- [ ] T021 [US5] Generic only — replace the single `annualIncome` input (line 3292) with `person1Income` + `person2Income`; `getInputs` sets household `annualIncome = person1Income + person2Income` (INV-6); add both to `PERSIST_IDS`; on restore back-fill `person1Income = legacy annualIncome`, `person2Income = 0` (migration). Person 2 income gated by `syncAdultCountVisibility` (hidden when `adultCount===1`, FR-020).
- [ ] T022 [US5] Generic only — per-person retirement controls: `_retirementStatus.persons[]` (two toggles + two retirement years); `adultCount===1` hides Person 2's retirement controls; household transition age = `max` of retired earners' ages (unretired earner ⇒ income to plan end).
- [ ] T023 [US5] Generic only — build the `options.retirement.households[]` descriptor from per-person income + per-person retirement ages so interim-year income masking is staggered (contract C-1); feed the household `max` age into the transition resolver (T004) and projection (T005).
- [ ] T024 [P] [US5] TDD: extend `tests/unit/accumulateToFire.retirement.test.js` with `staggered-generic` (income A+B → B-only → 0 across Y1/Y2, SC-008 / INV-5) and `rr-generic-parity` (identical shared single-earner inputs → identical output, Principle I) fixtures; make them GREEN.
- [ ] T025 [P] [US5] E2E: add US5 cases — staggered two-earner income masking year-by-year + single-adult mode hides Person 2 — on the Generic dashboard.

**Checkpoint**: All five stories independently functional; RR/Generic diverge only as designed.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T026 [P] Update `FIRE-Dashboard-Roadmap.md` to reflect feature 036 (retirement-status) status.
- [ ] T027 Lockstep + i18n audit: diff shared regions of both HTML files (confirm only the C1 divergence differs); `grep -oE '[A-Za-z]{4,}'` over every new fragment to confirm each string is behind `data-i18n`/`t()`/`TRANSLATIONS` or on the Exemption list (Principle VII enforcement).
- [ ] T028 Full regression gate: `npm test` (all unit + the retirement contract fixtures), `npm run test:e2e` (FULL suite — not just this feature's spec), and `node tools/console-probe.mjs` on BOTH files (errorCount 0). Confirm data-model INV-1..INV-6 and SC-001..SC-008 hold.
- [ ] T029 Browser smoke (Manager-executed merge gate, per quickstart.md): on BOTH files verify toggle → drawdown, reload persistence, verdict reframe, drag inert-when-ON, and (Generic) staggered two-earner masking; drag feel + aesthetics human-checked.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001)**: no dependencies.
- **Foundational (T002–T006)**: after Setup. **Blocks all user stories.** Order: T002 (RED) → T003 (GREEN) → {T004, T005, T006}. T004/T005 both touch `projectFullLifecycle`-adjacent regions of the same files → sequential; T006 touches persistence (different region) but same files → keep sequential to avoid churn conflicts.
- **User stories (Phase 3–7)**: all require Foundational complete.
- **Polish (Phase 8)**: after all targeted stories.

### User-story dependencies

- **US1 (P1)**: after Foundational. MVP. Independent.
- **US2 (P2)**: after Foundational. Independent of US1 (reads the same transition state) but best validated with US1 present.
- **US3 (P2)**: after Foundational. Independent.
- **US4 (P3)**: after Foundational; accept-path delegates to the US1 toggle wiring (T009) — sequence US4 after US1.
- **US5 (P2, Generic)**: after Foundational; extends the descriptor's per-person path (T003) and the resolver (T004). Independent of US1–US4 UI (Generic-scoped).

### Parallel opportunities

- T002 [P] runs alongside nothing else in Foundational (it precedes T003).
- Within stories, the **E2E** and **TDD** tasks marked [P] (T011, T014, T016, T019, T024, T025) are separate test files/regions and can run in parallel with each other once their story's implementation lands.
- Because most implementation tasks edit BOTH HTML files (same two files), they are **not** mutually [P] — serialize them to preserve lockstep and avoid edit conflicts. Calc-only (T003) and test-only tasks are the genuine parallel surface.
- **Cross-story parallel (multi-agent)**: after Foundational, US2 (verdict), US3 (drag gating), and US5 (Generic income) touch largely disjoint regions and can be dispatched to separate engineers; US1 and US4 share the toggle wiring and should go to one owner.

---

## Implementation Strategy

### MVP first (US1 only)

1. T001 (baseline) → T002–T006 (foundation) → T007–T011 (US1).
2. **STOP & VALIDATE**: quickstart US1 on both dashboards; toggle/persist/revert + honest early-retirement drawdown.
3. Demo-able MVP.

### Incremental delivery

Foundation → US1 (MVP) → US2 (verdict reframe) → US3 (drag inert) → US5 (Generic staggered) → US4 (auto-suggest) → Polish gate. Each story is independently testable and adds value without breaking prior ones.

### Notes

- [P] = different files, no incomplete-task dependency. Lockstep HTML edits are single tasks spanning both files.
- Every new user-visible string ships EN + zh-TW + catalog in the SAME task (Principle VII, merge gate).
- Commit after each task or logical group; keep the full E2E suite green (not just this feature's spec).
- The one allowed divergence is C1 (RR single date vs Generic per-person) — call it out explicitly in any commit that touches only one file.
