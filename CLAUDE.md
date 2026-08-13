<!-- SPECKIT START -->
**Active feature**: 037 (lifecycle-excel-export) — PLANNED on branch `037-lifecycle-excel-export` (specified + planned; tasks/impl pending). One button in **History → Snapshots** (beside the existing `📤 Export CSV`) downloads a real `.xlsx`: **one row per calendar year**, current year → plan end, carrying every per-year figure the Lifecycle projection computes, in **both** money and purchasing-power frames, matching the chart exactly. **Structural finding driving the work (research R2)**: `projectFullLifecycle` emits **two different row shapes** — accumulation rows have 27 fields incl. full cash-flow detail (RR ~11614), retirement rows have only 15 and **no cash-flow detail** (RR ~11884) — and withdrawals-by-source (`wTrad`/`wRoth`/…) live on the **strategy** rows entirely. So "all the numbers" = a **union of 3 sources joined by `age`** (~68 columns), with **blank ≠ zero** semantics (data-model §2). **Principle V exception, user-approved 2026-08-13**: adds **ExcelJS 4.4.0** (cdnjs, MIT, 926 KB, verified classic UMD / zero ESM syntax), **lazy-loaded on first click** so cold load is unchanged. SheetJS CE was rejected — freeze panes are Pro-only. Corrected during planning: the "must export offline" bar was incoherent (Chart.js is already CDN-only, so charts don't render offline either). **Known gap (research R4)**: retirement-year federal tax is computed inside `taxOptimizedWithdrawal` and **surfaced nowhere** — Phase F adds it as an additive sibling field, and is skippable. Architecture: pure `calc/lifecycleExport.js` (UMD const **`_lifecycleExportApi`, never `_api`**) does all the logic Node-testably; a thin browser shim writes bytes. Plan: [`specs/037-lifecycle-excel-export/plan.md`](./specs/037-lifecycle-excel-export/plan.md).

**Prior feature**: 036 (retirement-status) — **merged to main 2026-08-13** (branch `036-retirement-status` fast-forwarded + deleted local/remote). Implementation landed in both dashboards + `calc/accumulateToFire.js` v8. Verified at merge: **760/760 unit**, full Playwright **197 pass / 4 fail where all 4 pass in isolation** (parallel-load flakes — 4 spec files exceed 5 min each), console-probe `errorCount 0` on both HTML files, `tools/smoke-032.mjs` 15/15. **`tasks.md` was never ticked during the work (0/29); its tick-state was reconstructed post-merge 2026-08-13 by auditing the merged code** — 26 `[X]`, T005 `[~]`, T001 unverifiable, **T029 (human browser smoke) genuinely still open**. No CLOSEOUT.md. **Two places where the shipped code contradicts the written spec**: (a) T005/C-1.1 — the `options.retirement` descriptor is threaded in Generic only (RR relies on `overrideFireAge` alone; equivalent for a single household but not lockstep); (b) **FR-011/T015 — the drag was NOT made inert; it stays live and writes the retirement year on confirm ("US3 revised" in-code)**, so `spec.md` FR-011 is now wrong. **Untracked scope**: commit `dddbe4a` shipped Snapshot Analytics tagged in-code as "Feature 036" but absent from 036's spec/tasks — needs a retroactive number or an amended spec. Separates *when the user CAN retire* (existing Safe/Exact/DWZ feasibility) from *when the user HAS retired* (a user-asserted fact). New **"I've retired"** switch + retirement **year** → maps to a transition age fed through the ONE `effectiveFireAge` path (`fireAgeOverride ?? calculatedFireAge`, RR ~15406) — status ON supersedes the drag `fireAgeOverride` (drag goes inert, FR-011) and stops all employment income + new contributions from that year (SS/passive stay on `ssClaimAge`, FR-004). Transition mechanism reuses `projectFullLifecycle`'s `overrideFireAge` + a new optional `options.retirement` descriptor on `calc/accumulateToFire.js` (per-year income masking; contributions scale proportional to remaining working income). Verdict block (RR ~14511) gains a **retired branch**: reframes "FIRE in N years" → sustainability readout ("sustainable to age N" / "at risk — shortfall in {year}"), reusing the existing stop-gap `projectFullLifecycle` probe + `hasShortfall` (FR-006/FR-014). **Deliberate Principle-I divergence (C1)**: RR = single household date; Generic = per-person staggered retirement (up to 2 earners) which adds new `person1Income`/`person2Income` inputs replacing the single `annualIncome` (FR-019, migration back-fills). Persistence: additive `state._retirementStatus` — **must NOT bump `GENERIC_VERSION` (wipes data)**. Auto-suggest (US4/FR-012): session-scoped dismissible nudge. Plan: [`specs/036-retirement-status/plan.md`](./specs/036-retirement-status/plan.md).

**Earlier**: 035 (left-sidebar-nav) — **merged to main** (commit `293d24a` "left side bar"; branch `035-left-sidebar-nav` no longer exists). Shipped in both dashboards, lockstep-verified (`--navrail-width` 4/4, `#navRail` 1/1, `#contentArea` 1/1, `data-active-tab` 9/9, `onAfterActivate` 6/6, `#navDrawerToggle` 1/1, `nav-scrim` 4/4, `nav.drawerToggle` EN+zh in both + catalog). Same bookkeeping gap as 036: **`tasks.md` was never ticked (0/19); reconstructed post-merge 2026-08-13** — 17 `[X]`, T001 unverifiable (its deliverable was a rewire list "in the PR/commit notes"; no PR exists), **T019 (human visual smoke) genuinely still open**. No CLOSEOUT.md. Caveat found in the audit: `--tabbar-bottom` was neutralized but **not removed** (still declared + written live by the observer in both files) — dead-code candidate. Carried-forward out-of-scope bug: a **pre-existing** ~590px Generic Plan→Profile card overflows at phone width (predates the nav work). Layout-only: relocate the primary tab group (`#tabBar`) + the per-tab `.pill-bar`s out of the top sticky stack into a persistent, sticky left sidebar (`#navRail`) rendered as an **accordion** (active tab expands to reveal its pills). The header + the mode/Withdraw-Strategy band (`#gateSelector`) **STAY on top** — clarified: only 2 of the 3 rows move. Mobile: **hamburger drawer**. **No button-behavior change** — navigation stays owned by `window.tabRouter`; only its `pillBarsByTab` selectors + an `onAfterActivate` accordion hook + the sticky-chrome `ResizeObserver` chain are rewired; `.pill-host` content panels stay put. Both dashboards (lockstep). New CSS var `--navrail-width` (NOT the existing `--sidebar-width`); z-index: rail 50, mobile drawer 65. Plan: [`specs/035-left-sidebar-nav/plan.md`](./specs/035-left-sidebar-nav/plan.md).

**Earlier still**: 034 (year-tax-estimator) — merged to main 2026-06-16. RR-only single-year federal tax microscope (Withdrawal Strategy tab): year picker → auto-pull projected ordinary income + LTCG (real→nominal) → LTCG-on-ordinary stacking with **standard-deduction shelter** (unused deduction shelters gains; `roomLeftAt0 = max(0, ceiling + stdDed − gross − ltcg)`; matches the IRS QDCGT worksheet / the ~$123,250 MFJ tax-free-gains figure), "Room left at 0%" + "Ordinary-income headroom" headlines (same 0% pool, two framings), marginal/IRMAA/NIIT chips, a methodology ⓘ on the title, and show-your-work cards (incl. deduction-shelter + 0%-pool steps). Indexed thresholds (standard deduction + 0% ceiling) are shown in the **selected year's nominal dollars and used as-is** (year-stamped labels, e.g. "(2036)"). Pure UMD `calc/taxEstimator.js` loads in both files; UI + `renderYearTaxEstimator()` RR-only (Principle-I divergence). **Tests: 735/735 unit; 034 E2E 5/5; full Playwright 166 pass (the 2 feature-018 failures pass 8/8 in isolation — pre-existing flakes, not a regression); console-probe errorCount 0 on both.** Plan: [`specs/034-year-tax-estimator/plan.md`](./specs/034-year-tax-estimator/plan.md).

**Older**: 033 (math-assumptions-cleanup) — merged to main 2026-06-06 (all 27 tasks; 697/697 unit + 163/163 full E2E + smoke 15/15). One wave, three corrections: `calc/assumptions.js` single-source registry (`CASH_REAL_RETURN = 0.0` superseding feature-030 FR-016's hardcoded ×1.005 across ~20 sites; Fisher `realRate()` across ~60 sites), honest shortfall funding ladder in `calc/accumulateToFire.js` v7 (cut stock contribution → draw cash → draw brokerage; conservation residual −$32K → $0, live-verified), conservation block v4 + bilingual `CONTRIBUTION_REDUCED` flag. **RR cold-load: FIRE age unchanged at 50; end balance −43.7% ($845K → $476K of phantom money removed — $239K ladder + $131K Fisher).** Exposed-and-fixed: DWZ interpolation accepting gate-rejected fractional ages, DWZ gate's vacuous clamped-endBalance check (now also requires signed ≥ 0), `yearsToFIRE` flooring month-precise results, `getCanonicalInputs.js` ESM/require guard silently binding undefined. Static guards in `tests/unit/mathAssumptions.test.js` prevent regression. Deferred: B-033-1/2/3. Detail: [`CLOSEOUT.md`](./specs/033-math-assumptions-cleanup/CLOSEOUT.md).

**Oldest**: 032 (roth-ira-accounts) — merged to main 2026-06-05. Dedicated `rothIra` withdrawal pool (sibling of Roth-401K) + four RR-only inputs (Roger $0 / Rebecca $59,021 balances, $7,000 annual contributions each); full lock until 59.5; CSV append-only schema bump; separate Lifecycle series; RR-only UI with calc-layer lockstep in both HTML files. Tests 682/682 unit + **163/163 full Playwright E2E** + automated browser smoke 15/15 (`tools/smoke-032.mjs`). Merge includes the **2026-06-05 hotfix wave**: fixed pre-existing global-scope collisions that had silently prevented `calc/cashSweep.js` (feature 030!) and `calc/withdrawalTooltipFrame.js` from ever loading in a real browser, a `sidebarMode` TDZ ReferenceError on every cold load, and six stale-fixture E2E groups red since ~feature 015/016 (see `tests/unit/globalScopeCollision.test.js` + Process Lessons). Spec docs under [`specs/032-roth-ira-accounts/`](./specs/032-roth-ira-accounts/).

- Constitution: [.specify/memory/constitution.md](./.specify/memory/constitution.md)
- Backlog: [BACKLOG.md](./BACKLOG.md)
- Predecessor features: [specs/001-modular-calc-engine/CLOSEOUT.md](./specs/001-modular-calc-engine/CLOSEOUT.md), [specs/002-inline-bugfix/](./specs/002-inline-bugfix/), [specs/003-browser-smoke-harness/](./specs/003-browser-smoke-harness/), [specs/004-html-canonical-swap/ABANDONED.md](./specs/004-html-canonical-swap/ABANDONED.md), [specs/005-canonical-public-launch/CLOSEOUT.md](./specs/005-canonical-public-launch/CLOSEOUT.md), [specs/006-ui-noise-reset-lifecycle-dock/CLOSEOUT.md](./specs/006-ui-noise-reset-lifecycle-dock/CLOSEOUT.md), [specs/007-bracket-fill-tax-smoothing/CLOSEOUT.md](./specs/007-bracket-fill-tax-smoothing/CLOSEOUT.md), [specs/008-multi-strategy-withdrawal-optimizer/](./specs/008-multi-strategy-withdrawal-optimizer/), [specs/009-single-person-mode/](./specs/009-single-person-mode/), [specs/010-country-budget-scaling/](./specs/010-country-budget-scaling/), [specs/011-responsive-header-fixes/](./specs/011-responsive-header-fixes/), [specs/012-ssa-earnings-pre-2020/](./specs/012-ssa-earnings-pre-2020/), [specs/013-tabbed-navigation/](./specs/013-tabbed-navigation/), [specs/014-calc-audit/](./specs/014-calc-audit/), [specs/015-calc-debt-cleanup/](./specs/015-calc-debt-cleanup/), [specs/016-mortgage-payoff-vs-invest/CLOSEOUT.md](./specs/016-mortgage-payoff-vs-invest/CLOSEOUT.md), [specs/017-payoff-vs-invest-stages-and-lumpsum/CLOSEOUT.md](./specs/017-payoff-vs-invest-stages-and-lumpsum/CLOSEOUT.md), [specs/018-lifecycle-payoff-merge/CLOSEOUT.md](./specs/018-lifecycle-payoff-merge/CLOSEOUT.md), [specs/019-accumulation-drift-fix/](./specs/019-accumulation-drift-fix/), [specs/020-validation-audit/CLOSEOUT.md](./specs/020-validation-audit/CLOSEOUT.md), [specs/021-tax-category-and-audit-cleanup/CLOSEOUT.md](./specs/021-tax-category-and-audit-cleanup/CLOSEOUT.md), [specs/022-nominal-dollar-display/CLOSEOUT.md](./specs/022-nominal-dollar-display/CLOSEOUT.md), [specs/023-accumulation-spend-separation/CLOSEOUT.md](./specs/023-accumulation-spend-separation/CLOSEOUT.md), [specs/024-deferred-fixes-cleanup/CLOSEOUT.md](./specs/024-deferred-fixes-cleanup/CLOSEOUT.md), [specs/025-family-financial-vault/CLOSEOUT.md](./specs/025-family-financial-vault/CLOSEOUT.md), [specs/026-withdrawal-tax-and-ui-fixes/CLOSEOUT.md](./specs/026-withdrawal-tax-and-ui-fixes/CLOSEOUT.md), [specs/027-aggressive-bracket-fill/CLOSEOUT.md](./specs/027-aggressive-bracket-fill/CLOSEOUT.md), [specs/028-strategy-aware-fire-age/CLOSEOUT.md](./specs/028-strategy-aware-fire-age/CLOSEOUT.md), [specs/029-withdrawal-spend-parity/CLOSEOUT.md](./specs/029-withdrawal-spend-parity/CLOSEOUT.md), [specs/030-cash-sweep-stocks/CLOSEOUT.md](./specs/030-cash-sweep-stocks/CLOSEOUT.md), [specs/031-lifecycle-strategy-parity/](./specs/031-lifecycle-strategy-parity/)
<!-- SPECKIT END -->

# FIRE Calculator

A personal Financial Independence / Retire Early dashboard built as a zero-dependency single-file HTML app.

## The Two Active Dashboards (READ FIRST)

There are **two main files** the user actively works on, and they are maintained **in lockstep**:

1. **`FIRE-Dashboard.html`** — the **RR FIRE dashboard** (Roger & Rebecca's personalized version)
2. **`FIRE-Dashboard-Generic.html`** — the **Generic FIRE dashboard** (public version)

**Default rule:** When the user says "fix this," "change this," "the dashboard," "the chart," or any similar phrasing without naming a specific file, apply the change to **BOTH** files. Only scope to one file when the user explicitly says so (e.g., "only the RR version," "Generic only," "the personalized one").

Personal-only content (Roger/Rebecca's names, private figures) lives in `FIRE-Dashboard.html` only. Everything else — structure, styling, charts, calc logic, i18n wiring — stays identical between the two files.

Always report which file(s) you modified.

## Other project files

- `FIRE-snapshots.csv` — append-only history of net worth + FIRE metrics
- `FIRE-Dashboard-Roadmap.md` — master planning document for features
- `FIRE-Dashboard Translation Catalog.md` — i18n strings

## Team Structure

This project uses a Claude Code agent team. The main session acts as the **Manager** who orchestrates work across specialized Engineers.

### Manager (Team Lead — this session)

You are the Manager. Your job:

1. Receive tasks from the user.
2. Break tasks into subtasks appropriate for each Engineer.
3. Spawn teammates for the relevant Engineer roles.
4. Monitor progress via the shared task list.
5. Combine results and verify consistency across Engineers' work — especially that both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` stay in sync.
6. Decide: assign follow-up tasks to Engineers, OR stop and report back to the user for further instructions.

**Decision criteria for continuing vs. stopping:**

- Continue if: subtasks are well-defined and don't need user clarification, Engineers' outputs need integration work, there are clear next steps.
- Stop and ask if: requirements are ambiguous, a major design decision is needed, Engineers reported blockers, the task scope is expanding beyond what was originally asked.

When spawning teammates, give each one a detailed prompt that includes:

- Their role and constitution (from below).
- The specific subtask to complete.
- Which files/directories they own (to avoid conflicts).
- Any context from other Engineers' completed work.
- **Which skills to invoke** — always include their pre-assigned skills, plus any task-specific skills from the Skill Registry (see Dynamic Skill Assignment below).

### Dynamic Skill Assignment Protocol

Before delegating ANY task to an Engineer, the Manager MUST evaluate whether additional skills (beyond the Engineer's pre-assigned defaults) would benefit them for this specific task:

1. **Analyze the task** — What methodology does it need? (TDD? Security review? API design? Data migration?)
2. **Check the Skill Registry** below for skills that match the task but are NOT already in the Engineer's defaults.
3. **Equip the Engineer** — Include skill invocation instructions in their prompt:

   > "Before starting this task, invoke these skills using the Skill tool:
   > - `/skill-name` — reason this skill helps for this task"

4. **Multiple skills are OK** — An Engineer can invoke several skills for complex tasks.
5. **Don't over-equip** — Only assign skills that are genuinely useful for the specific task. More skills = more context consumed.

Example: The Backend Engineer is asked to add a Monte Carlo projection module. The Manager sees `/superpowers:writing-plans` in the registry. Even though it's not in the Backend defaults, the Manager includes it:

> "Before starting, invoke these skills:
> - `/superpowers:writing-plans` — projection engine is multi-step and needs a written plan
> - `/superpowers:test-driven-development` — already in your defaults, apply it
> Then implement: a pure `runMonteCarlo(inputs) → { p10, p50, p90 }` module used by the projection chart."

### Skill Registry

All skills available in this project (pre-assigned + unassigned). The Manager can assign ANY of these to ANY Engineer at task time.

| Skill | Description |
|-------|-------------|
| `/frontend-design:frontend-design` | Create distinctive, production-grade frontend interfaces; avoids generic AI aesthetics. |
| `/everything-claude-code:frontend-patterns` | Frontend development patterns for React, state management, performance, UI best practices. |
| `/everything-claude-code:coding-standards` | Universal TS/JS coding standards — naming, structure, error handling, immutability. |
| `/everything-claude-code:backend-patterns` | Backend architecture patterns, API design, service layers. Useful for calc-module design. |
| `/everything-claude-code:api-design` | REST/module interface design — resource naming, contracts, versioning. |
| `/everything-claude-code:database-migrations` | Migration best practices for schema changes and data migrations. |
| `/everything-claude-code:e2e-testing` | Playwright E2E patterns: POM, config, CI/CD, artifacts, flaky test handling. |
| `/everything-claude-code:e2e` | Generate and run Playwright tests; creates journeys, runs tests, captures screenshots/traces. |
| `/everything-claude-code:verification-loop` | Comprehensive verification system before claiming work complete. |
| `/everything-claude-code:tdd-workflow` | Enforces test-driven development with 80%+ coverage. |
| `/everything-claude-code:security-review` | Security checklist for auth, input handling, secrets, APIs. |
| `/everything-claude-code:search-first` | Research-before-coding — search for existing tools/libs before writing custom code. |
| `/everything-claude-code:plan` | Restate requirements, assess risks, build step-by-step plan before touching code. |
| `/superpowers:brainstorming` | Required before any creative work — clarifies user intent before implementation. |
| `/superpowers:test-driven-development` | Rigid TDD workflow: red → green → refactor. |
| `/superpowers:systematic-debugging` | Methodical debugging for any bug, test failure, or unexpected behavior. |
| `/superpowers:writing-plans` | Write implementation plans for multi-step tasks before coding. |
| `/superpowers:executing-plans` | Execute written plans with review checkpoints. |
| `/superpowers:requesting-code-review` | Verify work meets requirements before merging. |
| `/superpowers:verification-before-completion` | Requires running verification commands and confirming output before any success claims. |
| `/superpowers:dispatching-parallel-agents` | When facing 2+ independent tasks that can be worked on without shared state. |
| `/exploratory-data-analysis` | Audit CSV structure, catch schema drift, validate data quality. |
| `/code-review:code-review` | Code review a pull request or set of changes. |
| `/commit-commands:commit` | Create a clean git commit. |
| `/commit-commands:commit-push-pr` | Commit, push, and open a PR. |
| `/plotly` | Interactive visualization (reference only — dashboard uses Chart.js, not Plotly). |
| `/statistical-analysis` | Test selection, assumption checking, APA-formatted results. Useful for projection validation. |
| `/defuddle` | Extract clean markdown from web pages — for research into FIRE formulas, tax rules. |

### Default Skill Assignments

- **Frontend Engineer**: `/frontend-design:frontend-design`, `/everything-claude-code:frontend-patterns`, `/everything-claude-code:coding-standards`, `/superpowers:brainstorming`
- **Backend Engineer**: `/everything-claude-code:coding-standards`, `/everything-claude-code:api-design`, `/superpowers:test-driven-development`, `/superpowers:systematic-debugging`
- **DB Engineer**: `/exploratory-data-analysis`, `/everything-claude-code:database-migrations`, `/everything-claude-code:coding-standards`, `/superpowers:brainstorming`
- **QA Engineer**: `/everything-claude-code:e2e-testing`, `/everything-claude-code:e2e`, `/everything-claude-code:verification-loop`, `/superpowers:verification-before-completion`

### Engineers

#### Frontend Engineer

**Constitution:**
Vanilla JS + Chart.js, single-file HTML. Stay in the current architecture: no build step, inline CSS/JS, Chart.js loaded from CDN. Keep both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` in lockstep — every feature ships to both unless the roadmap explicitly says otherwise. Mobile-responsive. Preserve the existing dark-theme CSS variable system (`--bg`, `--card`, `--accent*`, etc.). Never add a bundler, framework, or build tool without explicit user approval.

**Assigned Skills:**

- `/frontend-design:frontend-design` — create distinctive, production-grade UI; avoids generic AI aesthetics.
- `/everything-claude-code:frontend-patterns` — frontend patterns for state, performance, UI best practices.
- `/everything-claude-code:coding-standards` — universal JS coding standards.
- `/superpowers:brainstorming` — required before any creative UI work.

When starting a task, check if any of your assigned skills apply. If so, invoke them with the Skill tool before beginning implementation. The Manager may also assign additional skills in your task prompt — invoke those first.

**When to spawn:** Any UI change, new chart, layout adjustment, styling, responsive fix, i18n string wiring, client-side interactivity, or changes to either HTML dashboard file.

**Owns:** `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`, `FIRE-Dashboard.ico`, `fire-dashboard-icon-v2.png`, `FIRE-Dashboard Translation Catalog.md`.

#### Backend Engineer

**Constitution:**
Owns the **modular calculation engine**. There is no server. This role focuses on extracting and maintaining pure JavaScript calculation functions that power the dashboard's charts and metrics. Every calculation module must:

1. Have a clearly documented input contract (what raw inputs it consumes).
2. Have a clearly documented output contract (which named values it produces and which chart(s) consume them).
3. Be pure — no DOM access, no global state, no side effects. Only inputs in, outputs out.
4. Be independently unit-testable without loading the HTML.

When a chart is added or modified, the Backend Engineer ensures there is a dedicated calc module (or a well-scoped function in an existing module) that the Frontend Engineer can call. The goal: any reader can open a calc module and immediately see "which charts depend on my output, and what are my guaranteed inputs/outputs."

For now these modules can live as inline `<script>` sections inside the HTML files, but each calc module should be clearly fenced with a comment header declaring its Inputs, Outputs, and Consumers. When the project eventually extracts calc code out of HTML (see Frontend migration options), these fenced blocks are the migration units.

**Assigned Skills:**

- `/everything-claude-code:coding-standards` — module boundaries, naming, function design for a well-factored calc layer.
- `/everything-claude-code:api-design` — for designing calc module interfaces (inputs, outputs, chart contracts).
- `/superpowers:test-driven-development` — essential: every formula gets a test first.
- `/superpowers:systematic-debugging` — for when projections or formulas produce surprising numbers.

When starting a task, check if any of your assigned skills apply. If so, invoke them with the Skill tool before beginning implementation. The Manager may also assign additional skills in your task prompt — invoke those first.

**When to spawn:** Any change to FIRE math (savings rate, years-to-FIRE, projection curves, tax modeling, withdrawal rules, inflation adjustments, Monte Carlo), adding a new metric, refactoring calculations, or when a chart's numbers don't match expectations.

**Owns:** All `<script>` calculation blocks inside the HTML files, and any future `calc/` or `lib/` directory containing extracted calculation modules. Coordinates with Frontend Engineer on integration.

#### DB Engineer

**Constitution:**
Stay on CSV + localStorage for now — schema discipline only. The DB Engineer:

1. Owns the `FIRE-snapshots.csv` schema — every column is documented, ordering is stable, new columns are appended not inserted.
2. Owns the localStorage key namespace used by the dashboards — names are consistent between the two HTML files, values are JSON-schema-documented, migrations are versioned.
3. Defines the CSV row format for appending new snapshots (handling of quoted strings, dates in ISO 8601, numeric types).
4. Plans (but does not prematurely execute) the future migration path from CSV/localStorage → SQLite → cloud DB. Write the migration plan as documentation before there's a database.
5. Flags any data-loss risk (schema changes that break historical rows, non-idempotent writes).

No ORMs, no servers, no cloud yet. If the product grows past CSV, the DB Engineer proposes the migration and the user decides.

**Assigned Skills:**

- `/exploratory-data-analysis` — audit CSV structure, catch schema drift, validate data quality in `FIRE-snapshots.csv`.
- `/everything-claude-code:database-migrations` — useful when eventually migrating CSV → SQLite/Supabase.
- `/everything-claude-code:coding-standards` — shared standards for persistence helper code.
- `/superpowers:brainstorming` — for schema design decisions before cementing them.

When starting a task, check if any of your assigned skills apply. If so, invoke them with the Skill tool before beginning implementation. The Manager may also assign additional skills in your task prompt — invoke those first.

**When to spawn:** Any change to `FIRE-snapshots.csv` columns, localStorage key shape, data export/import format, or discussions about moving beyond CSV.

**Owns:** `FIRE-snapshots.csv`, any future `schema/` or `migrations/` directory, and documentation of the localStorage key schema (can live in `docs/` or inline README).

#### QA Engineer

**Constitution:**
Playwright E2E + manual calculation checks. The QA Engineer:

1. Maintains Playwright tests that drive both HTML dashboards through real browser interactions.
2. Maintains a set of **gold-standard input → output cases** for FIRE projection math. A canonical fixture (e.g., "Alice at 35, $200k net worth, $3k/month spend, 20% savings rate") maps to a known `years_to_FIRE` result. If that number ever changes, a test fails.
3. Runs tests against both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` — they must behave identically on shared features.
4. Captures screenshots, videos, and traces for any failing run; uploads to an artifacts directory.
5. Gates PRs on passing tests before the Manager merges work.

The QA Engineer does NOT write production code — only test code and fixtures. They report regressions back to the Manager who routes fixes to the appropriate engineer.

**Assigned Skills:**

- `/everything-claude-code:e2e-testing` — Playwright patterns: POM, config, CI/CD, artifacts, flaky test handling.
- `/everything-claude-code:e2e` — generate and run Playwright tests; creates journeys, runs tests, captures screenshots/traces.
- `/everything-claude-code:verification-loop` — comprehensive verification system before claiming work complete.
- `/superpowers:verification-before-completion` — requires running verification commands and confirming output before any success claims.

When starting a task, check if any of your assigned skills apply. If so, invoke them with the Skill tool before beginning implementation. The Manager may also assign additional skills in your task prompt — invoke those first.

**When to spawn:** Any new feature (needs tests), any bug report (needs a regression test first), any PR before merge (needs a green run), any suspected calculation regression.

**Owns:** `tests/`, `e2e/`, `playwright.config.*`, fixtures directory, `.github/workflows/` for test CI.

## Workflow

1. User gives a task to the Manager.
2. Manager analyzes the task and identifies which Engineers are needed.
3. Manager spawns teammates with role-specific prompts (constitution + subtask + file ownership + skills to invoke).
4. Engineers work independently in their assigned file areas.
5. Manager reviews completed work for consistency across engineers and across the two dashboard files.
6. Manager either assigns follow-up tasks or reports back to user.

## File Ownership

To prevent merge conflicts, each Engineer should work in designated areas:

- **Frontend:** `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`, icons, translation catalog, any future `src/components/`, `src/styles/`, `public/`.
- **Backend:** inline `<script>` calc blocks in the HTML files, any future `calc/` or `lib/` calculation modules.
- **DB:** `FIRE-snapshots.csv`, any future `schema/`, `migrations/`, localStorage schema docs.
- **QA:** `tests/`, `e2e/`, `playwright.config.*`, `.github/workflows/`.

Adjust these paths as the project structure evolves.

## Money Terminology (NON-NEGOTIABLE in conversation with user)

The user explicitly rejected economics jargon. In **all conversation, chat
output, error messages, audit-report prose, CLOSEOUT.md narrative, and any
user-facing tooltip / caption**, use this terminology pair:

| Say this | For values that are | Never call it |
|---|---|---|
| **"money" / "dollars" / "broker dollars" / "Book Value"** | Nominal dollars as they appear on bank or brokerage statements | "real $" / "real money" / "real dollars" |
| **"purchasing power"** | The today's-equivalent of a future dollar amount; an abstract comparison metric | "real value" without qualification |

**The rule**: Money is what the user sees on their account statement. Purchasing
power is a *comparison* to today's spending capacity. Calling purchasing-power
numbers "real money" conflicts with how an actual bank balance reads.

**Where the technical `real` / `nominal` pair IS still allowed**:
- Inside `calc/*.js` source code, in `// FRAME:` annotations (Constitution VI;
  feature 022 conventions). The technical pair has audit-test enforcement.
- Inside spec.md / plan.md / tasks.md / contracts/ files for *internal*
  cross-reference. User-facing text *inside* those documents (acceptance
  scenarios, success criteria, captions) uses the conversational pair.
- Inside `tests/meta/frame-coverage.test.js` regex patterns (technical).

**Right vs wrong:**

> ❌ "At age 70, your real portfolio is $328k. The chart shows $750k Book Value."
>
> ✅ "At age 70, your portfolio is **$750k** — that's what your broker statement
> will show in 2054. The purchasing-power equivalent is about $328k of today's
> spending capacity."

**Why:** the dashboard ships nominal-$ Book Value as the primary chart frame
per feature 022 (US1 / FR-001 a-n). The user's mental model — and every dollar
they actually own — is in nominal frame. Talking to them in their frame is
table stakes.

## Process Lessons

Codified from past features. Apply these to every future refactor that touches
calc modules, inline helpers, or the dual-HTML bootstrap.

### Caller-audit before extraction

Before any refactor that deletes or extracts inline helpers, run
`grep -n "<helper-name>" FIRE-Dashboard.html FIRE-Dashboard-Generic.html` and
every relevant `calc/*.js` / `tests/**` file that might use them. Count call
sites. Confirm every caller is handled by the refactor (either rewired,
rewritten, or also scheduled for deletion in the same commit).

**Why:** Feature 004 (`specs/004-html-canonical-swap/ABANDONED.md`) deleted `isFireAgeFeasible` without auditing its shimmed caller `findMinAccessibleAtFireNumerical`; the half-done refactor cascaded into a browser NaN issue.

**How to apply:** Before every `Edit` that deletes a function, grep the whole repo for the function name; document the caller count in the commit message. If any caller is out-of-scope, stop and expand the spec.

### Shim defense-in-depth

Every shim that wraps a potentially-throwing canonical call MUST satisfy all
four of:

1. Live in a Node-importable module (`calc/shims.js`) — not as an inline
   `<script>` definition that only runs in the browser.
2. Use `try/catch` with a documented fallback value per
   `specs/005-canonical-public-launch/contracts/shims.contract.md`.
3. Log `console.error('[<shim-name>] canonical threw:', err, <context>);` on
   every catch. The `[<shim-name>]` prefix is non-negotiable — it's what makes
   the failure grep-findable in a 7000-line browser console.
4. Have a Node unit test in `tests/unit/shims.test.js` that stubs the canonical
   helper to throw and asserts the fallback return + the `[shim-name]` prefix.

**Why:** Feature 004 shipped green CI but the browser showed a NaN cascade — the shim's `try/catch` worked, but its fallback VALUE (`NaN`) cascaded through the DOM. The harness tested `adapter → canonical`, never `shim → canonical`.

**How to apply:** Every commit that changes shim behavior MUST touch the shim unit test in the same commit. If you can't write the test, you don't understand the fallback contract well enough to ship the code.

### Browser smoke before claiming a feature "done"

CI green + runner green is necessary but insufficient. For any feature that
touches the HTML boot path or anything `window`-exposed:

1. Open both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` in a real
   browser (either via a local `python -m http.server` or by loading the repo
   into GitHub Pages preview).
2. Wait 2 seconds for cold load.
3. Confirm every KPI card shows a numeric value (NOT "Calculating…", NaN, $0,
   `—`, or "40+").
4. Open DevTools console. Confirm zero red errors AND zero
   `[<shim-name>] canonical threw:` messages.
5. Drag the FIRE marker; confirm same-frame update.

Skip this and you risk feature-004-class failures where the runner is green
but the dashboard is visibly broken. Treat this as a Manager-executed gate
BEFORE merging.

**UPDATE 2026-06-05 — the smoke is now automatable from CLI.** Run
`node tools/console-probe.mjs <abs-path-to-html>` (console errors + module-load
flags), `node tools/smoke-032.mjs` (KPI numerics, persistence, audit warnings,
Generic regression), and `node tools/bug1-repro-probe.mjs` (per-mode
crossValidationWarnings). "Browser smoke skipped per user" is no longer an
acceptable merge note — only genuinely visual checks (drag feel, aesthetics)
still need a human.

### Classic-script global scope is ONE shared lexical scope

All `<script src="calc/X.js">` modules and both HTML files' inline scripts
share a single global lexical environment. A duplicate top-level `const`/`let`
across any two of them throws SyntaxError at load and SILENTLY kills the
entire second script — every caller then degrades through its `typeof`
fallback, which is invisible in Node tests (separate module scopes).

**This actually shipped broken:** `calc/cashSweep.js` and
`calc/withdrawalTooltipFrame.js` never executed in any real browser between
feature 030's merge and 2026-06-05 (duplicate `const _api` + a
`const _applyCashSweep` eval-time-capture in accumulateToFire.js), so the
cash sweep was a browser no-op while 587 unit tests stayed green.

**How to apply:** (1) every calc module's UMD-export const gets a unique
per-module name (`_cashSweepApi`, not `_api`); (2) cross-module references
resolve lazily at call time, never at eval time (script-tag order matters);
(3) `tests/unit/globalScopeCollision.test.js` statically guards every
browser-loaded calc script — keep it passing; (4) `typeof x` does NOT protect
`let`/`const` TDZ — boot-path-reachable module state uses `var`.

### The FULL Playwright suite is the gate, not feature-specific specs

The full E2E suite was quietly red from ~feature 015/016 until 2026-06-05
(24 failures on main) because CLOSEOUTs cited unit counts plus only the new
feature's specs ("6/6 drag tests"). Stale fixtures accumulated: pill lists
missing feature-016's `payoff-invest`, retired `.kpi-row` selectors,
born-red contract tests never revisited after integration landed.

**How to apply:** before merging any feature, `npm run test:e2e` (full suite)
must be green. When a test goes stale because the product legitimately moved,
fix the FIXTURE in the same commit as the feature that moved it — and when a
TDD-style spec ships expected-red, file a follow-up task to flip it green.

### FIRE-mode gates (Safe / Exact / DWZ) MUST evaluate the displayed strategy

The three FIRE modes are **gates** that determine the FIRE age. The earliest
age that passes the gate is what the dashboard reports as "FIRE in N years".
Each mode has its own contract:

- **Safe** — every retirement-year `total ≥ buffer × annualSpend` (where buffer
  is `bufferUnlock` for ages < 59.5, `bufferSS` for ages ≥ 59.5), AND
  `endBalance ≥ 0` at plan age. Trajectory enforcement across ALL three
  retirement phases.
- **Exact** — `endBalance ≥ terminalBuffer × annualSpend` at plan age. No
  trajectory enforcement; intermediate years can dip arbitrarily.
- **DieWithZero** — `endBalance ≥ 0` at plan age. Targets exactly $0 surplus.

**The non-negotiable rule:** the gate MUST evaluate the SAME simulated lifecycle that the chart renders. The active strategy (feature 008's `_lastStrategyResults.winnerId`, or `_previewStrategyId` during hover) is the last factor before chart creation. If the gate evaluates a different strategy than the chart, the verdict drifts out of sync — e.g., "On Track — FIRE at 48" alongside a chart that visibly depletes to $0 at age 70.

**Why:** before the fix, `isFireAgeFeasible` called `projectFullLifecycle` with no `options`, silently using the bracket-fill default. When feature 008's ranking picked a non-default winner, the chart drew the winner while the gate checked bracket-fill — which passed the floor when the displayed strategy did not.

**How to apply:**

1. Any code that decides the FIRE age (`findFireAgeNumerical`,
   `isFireAgeFeasible`, future bisection helpers, etc.) MUST consume the same
   strategy options as `projectFullLifecycle` is called with on the chart side
   (line 10690 in RR / Generic — `options.strategyOverride`,
   `options.thetaOverride`).
2. Use the helper `getActiveChartStrategyOptions()` defined alongside
   `isFireAgeFeasible`. It mirrors the chart's strategy detection logic in
   one place and returns `{strategyOverride, thetaOverride}` or `undefined`
   when the default (`bracket-fill-smoothed`) is active.
3. When adding a new feasibility helper, audit it against this rule:
   *"If the chart can render strategy X, can my gate accidentally evaluate
   strategy Y?"* If yes, thread the strategy options through.
4. The `signedLifecycleEndBalance` simulator is bracket-fill-only — used for
   `endBalance` (Exact / DWZ gates) and as the Safe-mode fallback when
   `projectFullLifecycle` is unavailable. If the chart and the signed sim ever
   disagree on end-balance sign, that is its own bug (separate from this rule).

**Test for regression:** the TEMP debug button (when present) emits a `feasibilityProbe` recording `isFeasible_safe`, `defaultChartViolations`, `overrideChartViolations`. Invariant: `isFeasible_safe === true` ⇒ `overrideChartViolations === 0`. Any divergence is a regression.

### Mortgage strategy threading must follow the options-override pattern

Extends the strategy-parity rule to mortgage strategy. Feature 018 ships `getActiveMortgageStrategyOptions()` alongside `getActiveChartStrategyOptions()` — same shape, same call-site discipline.

The non-negotiable rule: every code path that runs `projectFullLifecycle` (chart render, FIRE-feasibility probe, strategy ranker, audit recompute, copy-debug snapshot) MUST consume the SAME `mortgageStrategyOverride`. Mismatches reproduce the feature-014 drift failure.

**Apply:** when adding a new caller of `projectFullLifecycle`, audit it
against this rule. Use `getActiveMortgageStrategyOptions()` (don't read
`state._payoffVsInvest.mortgageStrategy` directly inside the caller — the
helper centralizes the resolution including the v017 `lumpSumPayoff` fallback
and the `'invest-keep-paying'` no-op short-circuit).

**LumpSumEvent v3 contract reminder:** `paidOff` keeps v2 semantics (= what
the bank receives = `realBalance`). The v3 `actualDrawdown` is the true
brokerage drop including LTCG gross-up (`paidOff × (1 + ltcgRate ×
stockGainPct)`). The trigger fires on `investedI >= actualDrawdown`, not
`>= realBalance` — required so brokerage cannot go negative.

### Calc-contract field-semantics extensions need test audits BEFORE landing

When a calc-contract field gains new semantics mid-feature (here: LTCG gross-up on `LumpSumEvent`), pre-existing tests asserting on the OLD contract become silent landmines. Feature 018 caught this only because the resume session ran tests first.

**Apply:** when a calc-contract field gains new semantics, run a tests audit BEFORE landing the change. Grep the field name across all test files; for each hit, decide whether the test still holds or needs updating in the same change set.

**Sibling-field beats overloading.** When a v2 field is given new v3 meaning,
prefer adding a sibling field (`actualDrawdown`) over redefining the
original (`paidOff`). Preserves backwards-compat readability and makes the
diff-of-record clean.

### Audit-harness wiring needs persona-aware DOM stubs and explicit constants

Two sandbox-only harness gaps surfaced ~250 false-positives in feature 020's first audit run (calc layer unaffected).

**Gap 1 — static `DOC_STUB` returns wrong values for persona-driven fields.** Any helper reading `document.getElementById(<id>).value` for a persona-varying field (`terminalBuffer`, `safetyMargin`, `bufferUnlock`, `bufferSS`, `irmaaThreshold`, …) needs its DOM stub built **per persona**, not cached at factory time. A static `terminalBuffer: '0'` made Exact-mode trivially feasible for all 92 personas. Fix: bind the doc stub inside the per-persona `boundFactory` closure, reading `persona.inp[<id>]` with a fallback.

**Gap 2 — top-level HTML constants need explicit `OVERRIDES` redeclaration.** The extractor captures function declarations, not `const`s. Constants like `SAFE_TERMINAL_FIRE_RATIO = 0.20` must be redeclared as `var <NAME> = <value>;` in the `OVERRIDES` string, else Safe-mode `findFireAgeNumerical` throws and Safe invariants silently skip.

**Apply:** when adding a persona axis or an invariant family hitting a previously-unrun path, audit (a) every `document.getElementById` call serves the right persona value, AND (b) every top-level `const` it references is in `OVERRIDES`.

### Multi-agent dispatch produces lockstep results when each agent gets the contract path

Feature 020's resume run dispatched 5 parallel agents (UI, Backend, 2 QA, Research) that all succeeded first-try. The pattern: each prompt named (1) the exact contract/spec doc to read first, (2) the EXACT files to edit and to leave alone, (3) the test suite to run before declaring done; (4) agents touched disjoint files; (5) Manager committed at the end.

**Apply:** when a feature has phase parallelism (calc + UI + tests + research), prefer multi-agent parallel dispatch (4–5× throughput). Mitigate file-scope conflicts by reviewing the ownership table per agent before dispatching.

## Spec-Driven Development

This project uses [spec-kit](https://github.com/github/spec-kit) for specification-driven development. Before implementing non-trivial features:

1. `/speckit-constitution` — establish project principles.
2. `/speckit-specify` — create baseline specification.
3. `/speckit-clarify` — de-risk ambiguous areas (optional).
4. `/speckit-plan` — create implementation plan.
5. `/speckit-tasks` — generate actionable tasks.
6. `/speckit-analyze` — cross-artifact consistency check (optional).
7. `/speckit-implement` — execute implementation.

Specifications live under `.specify/`. The Manager should invoke these before spawning Engineers on any substantial feature.

## Companion Documents

- `FIRE-Dashboard-Roadmap.md` — master planning doc. The Manager should consult this before spawning work; every new feature should be reflected there.
- `FIRE-Dashboard Translation Catalog.md` — i18n strings. The Frontend Engineer maintains this when adding user-visible copy.

## YOLO Mode

This project has YOLO mode enabled. To start a session without permission prompts:

- **Windows:** Double-click `start.cmd` or run `./start.cmd`
- **Mac/Linux:** Run `./start.sh`

This runs `claude --dangerously-skip-permissions`, which skips all permission checks. The agent team can create files, run commands, and modify code without asking. Use this when you trust the workflow and want maximum speed.
