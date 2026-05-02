<!-- SPECKIT START -->
**Active feature**: 023 (accumulation-spend-separation) — **PLAN PHASE COMPLETE**, ready for `/speckit-tasks` then implementation. Latent calc-engine bug surfaced during 022 user-validation: pre-FIRE accumulation has been spending **$0/year** because `inp.annualSpend` is never assigned on the canonical input object — every assignment is on a *cloned* copy. Fix introduces `accumulationSpend` (= `getTotalMonthlyExpenses() × 12`) plumbed via `resolveAccumulationOptions` to all **6 callers** (R2 caller-audit corrected the spec's "4 callers" estimate). RR-baseline year-1 portfolio Book Value Δ drops from **+$191,722** to **~+$96,851** (SC-001 < $100k threshold). Spec [`spec.md`](./specs/023-accumulation-spend-separation/spec.md), Plan [`plan.md`](./specs/023-accumulation-spend-separation/plan.md), Research [`research.md`](./specs/023-accumulation-spend-separation/research.md), Data Model [`data-model.md`](./specs/023-accumulation-spend-separation/data-model.md), Quickstart [`quickstart.md`](./specs/023-accumulation-spend-separation/quickstart.md), Contracts [`contracts/`](./specs/023-accumulation-spend-separation/contracts/). Predecessor 022 merged to main 2026-05-01 (merge commit `3d67c9c`); 020 + 021 merged earlier same day (`3d45eab`, `937e0d8`). Constitution gate: 9/9 principles compliant; no Complexity Tracking entries.

- Constitution: [.specify/memory/constitution.md](./.specify/memory/constitution.md)
- Backlog: [BACKLOG.md](./BACKLOG.md)
- Predecessor features: [specs/001-modular-calc-engine/CLOSEOUT.md](./specs/001-modular-calc-engine/CLOSEOUT.md), [specs/002-inline-bugfix/](./specs/002-inline-bugfix/), [specs/003-browser-smoke-harness/](./specs/003-browser-smoke-harness/), [specs/004-html-canonical-swap/ABANDONED.md](./specs/004-html-canonical-swap/ABANDONED.md), [specs/005-canonical-public-launch/CLOSEOUT.md](./specs/005-canonical-public-launch/CLOSEOUT.md), [specs/006-ui-noise-reset-lifecycle-dock/CLOSEOUT.md](./specs/006-ui-noise-reset-lifecycle-dock/CLOSEOUT.md), [specs/007-bracket-fill-tax-smoothing/CLOSEOUT.md](./specs/007-bracket-fill-tax-smoothing/CLOSEOUT.md), [specs/008-multi-strategy-withdrawal-optimizer/](./specs/008-multi-strategy-withdrawal-optimizer/), [specs/009-single-person-mode/](./specs/009-single-person-mode/), [specs/010-country-budget-scaling/](./specs/010-country-budget-scaling/), [specs/011-responsive-header-fixes/](./specs/011-responsive-header-fixes/), [specs/012-ssa-earnings-pre-2020/](./specs/012-ssa-earnings-pre-2020/), [specs/013-tabbed-navigation/](./specs/013-tabbed-navigation/), [specs/014-calc-audit/](./specs/014-calc-audit/), [specs/015-calc-debt-cleanup/](./specs/015-calc-debt-cleanup/), [specs/016-mortgage-payoff-vs-invest/CLOSEOUT.md](./specs/016-mortgage-payoff-vs-invest/CLOSEOUT.md), [specs/017-payoff-vs-invest-stages-and-lumpsum/CLOSEOUT.md](./specs/017-payoff-vs-invest-stages-and-lumpsum/CLOSEOUT.md), [specs/018-lifecycle-payoff-merge/CLOSEOUT.md](./specs/018-lifecycle-payoff-merge/CLOSEOUT.md), [specs/019-accumulation-drift-fix/](./specs/019-accumulation-drift-fix/), [specs/020-validation-audit/CLOSEOUT.md](./specs/020-validation-audit/CLOSEOUT.md), [specs/021-tax-category-and-audit-cleanup/CLOSEOUT.md](./specs/021-tax-category-and-audit-cleanup/CLOSEOUT.md), [specs/022-nominal-dollar-display/CLOSEOUT.md](./specs/022-nominal-dollar-display/CLOSEOUT.md), [specs/023-accumulation-spend-separation/](./specs/023-accumulation-spend-separation/)
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

**Why:** Feature 004 (`specs/004-html-canonical-swap/ABANDONED.md`) attempted
to delete `isFireAgeFeasible` without first auditing that its caller
`findMinAccessibleAtFireNumerical` was shimmed. The deletion stopped short and
the refactor left an inconsistent state that cascaded into the browser-level
NaN issue.

**How to apply:** Before every `Edit` that deletes a function, grep the whole
repo for the function name. Document the caller count in the commit message.
If any caller is out-of-scope, stop and expand the spec.

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

**Why:** Feature 004 shipped green CI (smoke harness + unit tests) but the
browser showed a full NaN cascade. The cause was that the shim's `try/catch`
was working — but its fallback VALUE (`NaN`) was cascading visually through
the DOM. The smoke harness tested `adapter → canonical` but never exercised
`shim → canonical`. Closing this gap is the central discipline of feature 005.

**How to apply:** Every commit that changes shim behavior MUST also touch the
shim unit test in the same commit. If you can't write the test, you don't
understand the fallback contract well enough to ship the code.

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

**The non-negotiable rule:** the gate MUST evaluate the SAME simulated
lifecycle that the chart renders. The active strategy (feature 008's
`_lastStrategyResults.winnerId`, or `_previewStrategyId` during hover) is the
last factor before chart creation. If the gate evaluates a different strategy
than the chart, the verdict drifts out of sync with what the user sees — e.g.,
"On Track — FIRE at 48" displayed alongside a chart that visibly depletes to
$0 at age 70.

**Why:** before the strategy-aware fix, `isFireAgeFeasible` always called
`projectFullLifecycle(inp, annualSpend, fireAge, true)` with no `options`,
which silently used the bracket-fill-smoothed default. When feature 008's
strategy ranking picked a non-default winner (e.g., `tax-optimized-search`),
the chart rendered the winner's trajectory while the verdict gate kept
checking bracket-fill. Bracket-fill happened to pass the buffer floor for
that scenario; the actually-displayed strategy did not.

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

**Test for regression:** the project's TEMP debug button at the bottom-right
of both HTML files (when present) emits a `feasibilityProbe` block that
records `isFeasible_safe` alongside `defaultChartViolations` and
`overrideChartViolations`. The invariant: `isFeasible_safe === true` ⇒
`overrideChartViolations === 0` (i.e., the strategy actually being drawn
passes the buffer floor everywhere). Any divergence is a regression of this
rule.

### Mortgage strategy threading must follow the options-override pattern

Extends the strategy-parity rule above to mortgage strategy. Feature 018 ships
a `getActiveMortgageStrategyOptions()` helper alongside the existing
`getActiveChartStrategyOptions()` — same shape, same call-site discipline.

The non-negotiable rule: every code path that runs `projectFullLifecycle`
(chart render, FIRE-feasibility probe, strategy ranker, audit recompute,
copy-debug snapshot) MUST consume the SAME `mortgageStrategyOverride` value.
Mismatches produce drift between what the user sees on the chart and what
the verdict gate evaluates — exactly the failure mode of feature 014.

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

When a calc module's contract field gains new semantics mid-feature (here:
LTCG gross-up extension to `LumpSumEvent`), pre-existing tests that asserted
on the OLD contract (e.g., `paidOff` equivalence to brokerage delta) become
silent landmines. Feature 018's mid-implementation pause caught this only
because the resume session ran tests as the first action.

**Apply:** any time a calc-contract field gains new semantics, run a tests
audit BEFORE landing the calc change. Grep the field name across all test
files; for each hit, decide whether the test still holds under the new
semantics or needs updating in the same change set.

**Sibling-field beats overloading.** When a v2 field is given new v3 meaning,
prefer adding a sibling field (`actualDrawdown`) over redefining the
original (`paidOff`). Preserves backwards-compat readability and makes the
diff-of-record clean.

### Audit-harness wiring needs persona-aware DOM stubs and explicit constants

Two systemic harness gaps surfaced ~250 false-positive findings during
feature 020's first audit run. Both are sandbox-only — the calc layer is
unaffected — but they teach a discipline for any future harness work.

**Gap 1 — static `DOC_STUB` returns wrong values for persona-driven fields.**
Any HTML helper that reads from `document.getElementById(<id>).value` for a
field that varies by persona (`terminalBuffer`, `safetyMargin`, `bufferUnlock`,
`bufferSS`, `irmaaThreshold`, etc.) must have its DOM stub built **per
persona**, not cached at sandbox-factory time. A static stub of
`terminalBuffer: '0'` made Exact-mode trivially feasible at currentAge for
all 92 personas — ~91 false-positive A1 + B2 findings. Fix pattern: bind
the doc stub inside the per-persona `boundFactory` closure and read from
`persona.inp[<id>]` with a sane fallback.

**Gap 2 — top-level constants in HTML need explicit `OVERRIDES` redeclaration.**
The harness's brace-balanced extractor only captures function declarations,
not `const`s. Top-level constants like `SAFE_TERMINAL_FIRE_RATIO = 0.20`
(declared at line 8889 RR) must be redeclared in the harness `OVERRIDES`
code string. Without it, every Safe-mode `findFireAgeNumerical` call threw
inside the sandbox, and Safe-dependent invariants silently skipped. Fix
pattern: add `var <CONST_NAME> = <value>;` to the `OVERRIDES` string when
adding a new audit invariant that exercises a code path reading the constant.

**Apply:** when adding a new persona axis or a new invariant family that
exercises a previously-unrun code path, audit (a) every `document.getElementById`
call in the helpers it touches and confirm the stub serves the right
persona-driven value, AND (b) every top-level `const` referenced by those
helpers is present in `OVERRIDES`. The cost of skipping these checks is
hours of false-positive triage.

### Multi-agent dispatch produces lockstep results when each agent gets the contract path

Wave 1 of feature 020's resume run dispatched 5 parallel agents (Frontend
Wave 2 UI, Backend Phase 4 module, two QA Engineers for Phase 5–8, and a
Research Agent for Phase 9). All 5 succeeded on first dispatch with no
re-work needed. The pattern that made this work:

1. Each agent prompt named the exact contract / spec doc(s) to read first.
2. Each agent prompt named the EXACT files to edit (and which to leave alone).
3. Each agent prompt named the test suite to run before declaring done.
4. Independent agents touched disjoint files (UI agent → HTMLs; Backend →
   `calc/*.js` + new test file; QA1 → `mode-ordering.test.js` +
   `end-state-validity.test.js`; QA2 → `cross-chart-consistency.test.js` +
   `drag-invariants.test.js`; Research → `withdrawal-strategy-survey.md`).
5. Each agent reported uncommitted work; Manager committed at the end.

**Apply:** when a feature has phase parallelism (e.g., calc + UI + tests +
research), prefer multi-agent parallel dispatch over sequential single-agent
work. The throughput gain is 4–5× for a multi-phase feature. The risk is
file-scope conflicts; mitigate by reviewing the file ownership table per
agent before dispatching.

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
