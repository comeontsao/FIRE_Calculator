<!--
SYNC IMPACT REPORT
==================
Version change: 1.1.0 → 1.2.0
Bump rationale: MINOR — two new principles ratified (VIII Spending Funded First,
IX Mode/Objective Orthogonality) and Principle V materially expanded with
file:// compatibility + UMD-style classic-script loading rules. Per the
constitution's own versioning policy, "new principle or materially expanded
section" maps to MINOR. No principles removed or redefined; therefore not MAJOR.

Modified principles:
  - II. Pure Calculation Modules with Declared Contracts → expanded with audit
        observability requirement (every stage's subSteps must surface in the
        audit flow diagram).
  - IV. Gold-Standard Regression Coverage → expanded with Strategy Matrix
        requirement (any new withdrawal strategy must include a starvation-locus
        regression test in tests/unit/strategyMatrix.test.js).
  - V.  Zero-Build, Zero-Dependency Delivery → materially expanded with file://
        compatibility rule (calc modules MUST be UMD-classic-script loadable;
        ES module syntax requiring CORS-clean origins is PROHIBITED).

Added principles:
  - VIII. Spending Funded First (NON-NEGOTIABLE) — calc engine MUST never
          optimize-away the user's spending need; tax optimization is refinement.
  - IX.   Mode and Objective are Orthogonal — strategy ranker has two
          independent axes (Mode = end-state filter, Objective = sort key);
          neither MAY silently override the other.

Added sections:
  - Sticky-Chrome Discipline (Additional Constraints) — z-index hierarchy +
    live CSS variable composition rules.
  - File-Protocol Delivery (Additional Constraints) — file:// must remain a
    first-class delivery mode.

Removed sections: none.

Templates requiring updates:
  - ✅ .specify/templates/plan-template.md — Constitution Check gate reads this
       file at runtime; principle count moved 7 → 9 but the gate iterates over
       the file. Verified.
  - ✅ .specify/templates/spec-template.md — no constitution-specific tokens; OK.
  - ✅ .specify/templates/tasks-template.md — no constitution-specific tokens; OK.
  - ✅ CLAUDE.md — process-lessons section already records the underlying
       discoveries; constitution amendment is the canonical record.

Follow-up TODOs: none. All placeholders resolved.
-->

# FIRE Calculator Constitution

## Core Principles

### I. Dual-Dashboard Lockstep (NON-NEGOTIABLE)

The project ships two parallel single-file dashboards — `FIRE-Dashboard.html`
(Roger & Rebecca's personalized "RR" version) and `FIRE-Dashboard-Generic.html`
(public Generic version) — and every shared feature, bug fix, UI adjustment, chart,
calculation, or i18n string MUST land in both files in the same change set.

Only **personal content** (Roger/Rebecca's names, real birthdates, actual Social
Security earnings history, private dollar figures, family-specific college years)
MAY live in RR only. Everything else — structure, styling, Chart.js wiring, event
handlers, calculation logic, default parameters — MUST be identical.

**Why:** The two files are 95 % duplicated by design. Allowing silent drift
produces divergent calculations (e.g., RR's `inp.ageRoger` vs Generic's
`inp.agePerson1`) and undermines the Generic dashboard as a demonstrable public
artifact.

**Enforcement:** Any PR that modifies one file without the other is rejected
unless its description explicitly states the change is personal-content-only and
identifies the equivalent line range in the untouched file as intentionally
divergent.

### II. Pure Calculation Modules with Declared Contracts

All FIRE mathematics — years-to-FIRE solvers, lifecycle simulators, withdrawal
strategies, tax/healthcare/mortgage/college adjustments, Social Security
projections, Monte Carlo (when introduced), inflation handling — MUST live in
modules that are:

1. **Pure.** No DOM access, no Chart.js calls, no `localStorage` reads, no
   reading from global mutable state inside the function body.
2. **Contract-documented.** Each module begins with a fenced comment header
   declaring `Inputs:`, `Outputs:`, and `Consumers:` (which charts/KPIs depend
   on it). Consumers list MUST be kept accurate when charts are added or
   removed.
3. **Independently unit-testable.** Running a calc module's tests MUST NOT
   require loading either HTML file or a browser.
4. **Audit-observable.** Every calculation STAGE in the audit's flow diagram
   MUST expose its ordered sub-operations via the `subSteps: string[]` field
   in the assembled `AuditSnapshot.flowDiagram.stages[]`. Knowing "Strategy
   Ranking happens" is insufficient diagnostic surface; knowing "Strategy
   Ranking → simulate 7 strategies → 3-pass θ-sweep → spending-floor pass →
   sort by getActiveSortKey({mode, objective}) → pick winner" lets the user
   trace a specific anomaly to its source operation.

Modules MAY remain as fenced `<script>` blocks inside the HTML files during the
transitional extraction phase; they MUST eventually migrate to a `calc/` or
`lib/` directory.

**Why:** The April 2026 audit found mixed real/nominal returns, silent shortfall
absorption, and deterministic "Monte Carlo" — all symptoms of calc code
entangled with rendering. Purity and contracts make each formula auditable in
isolation. The audit-observability sub-requirement was added in v1.2.0 after
Feature 015 spending-floor pass shipped; the user couldn't diagnose the
"$50k shortfall while $325k pTrad available" pathology because the audit only
showed stage names, not the ordered sub-operations within each stage.

### III. Single Source of Truth for Interactive State

Any state that drives more than one chart or KPI — most importantly the
effective retirement/FIRE age (override vs calculated), current age, annual
spend, scenario selection, and return/inflation assumptions — MUST be resolved
in one place and read from that single source by every dependent renderer.

Specifically: charts, KPI cards, verdict banners, and any derived delta
(healthcare, mortgage, scenario impact) MUST NOT separately re-derive FIRE age
from `calculatedFireAge` while other charts read `fireAgeOverride`. One
`effectiveFireAge` resolver, consumed uniformly.

**Why:** The audit confirmed that dragging the FIRE marker on the Full Portfolio
Lifecycle chart updated only the lifecycle and Roth Ladder charts, while the
KPI cards, Timeline chart, healthcare delta, and mortgage verdict silently went
stale — and that touching any input reset the override. Centralizing the
resolution eliminates this class of bug by construction.

### IV. Gold-Standard Regression Coverage (NON-NEGOTIABLE)

Every calculation module MUST have a set of fixture cases — canonical
`{inputs} → {expected outputs}` pairs — that lock in its current behavior.
Changes to calc logic MUST update both the fixture and the module in the same
commit, with the fixture change described in the commit body.

At minimum, the fixture corpus MUST include:

- One accumulation-phase-only case (young saver, decades to FIRE).
- One case spanning all three retirement phases (taxable-only → 401(k)-unlocked
  → Social Security active).
- One Coast-FIRE edge case (future-value already sufficient without new
  contributions).
- One infeasible case (spend exceeds projected withdrawal capacity) that the
  solver must flag, not silently round.
- Parity cases that pass identically against RR and Generic with identical
  shared inputs, to enforce Principle I numerically.
- **Strategy Matrix coverage (v1.2.0).** Any new withdrawal strategy added to
  the strategy registry (`STRATEGIES` array in either HTML file) MUST come
  with a regression test in `tests/unit/strategyMatrix.test.js` that exercises
  the strategy at the canonical "starvation locus" scenario:
  `pTrad=$325k, pRoth=0, pStocks=0, pCash=0, ssIncome=0, age=65, grossSpend=$60100`.
  The strategy MUST close the spending shortfall to < $100. This locks
  Principle VIII (Spending Funded First) into the strategy registry's
  contract — any future strategy that fails to honor the spending floor will
  fire the regression test before reaching production.

New charts MAY NOT ship without at least one fixture case tying their displayed
values back to the module that produced them.

**Why:** Without locked fixtures, subtle drift (off-by-one ages, real-vs-nominal
mix-ups, tax-rate changes) ships undetected. Fixtures turn every calc regression
into a visible test failure. The Strategy Matrix sub-requirement was added
after Feature 015's discovery that `taxOptimizedWithdrawal` (bracket-fill default)
AND `TAX_OPTIMIZED_SEARCH.computePerYearMix` (θ-sweep) both had separate
spending-floor bugs that needed independent fixes. Without a matrix, future
strategies could regress the same way.

### V. Zero-Build, Zero-Dependency Delivery

The dashboards MUST remain runnable by opening the HTML file directly in a
browser — no bundler, no npm install, no transpile step, no framework runtime.
Chart.js is loaded from its CDN; any other third-party library requires
explicit user approval and an equivalent no-build delivery path (CDN or
vendored single file).

**File-protocol compatibility (v1.2.0).** Every calc module under `calc/` MUST
load as a CLASSIC `<script src="calc/...">` tag — NOT exclusively as an ES
module. The required module pattern is UMD-style:

1. Define the module's exports as plain `const` / `function` declarations
   (no `export` keyword at the top level, which is parse-error in classic
   scripts).
2. Register on the global at the file's bottom:
   `if (typeof globalThis !== 'undefined') { globalThis.X = X; }`
3. Provide a CommonJS export for Node tests:
   `if (typeof module !== 'undefined' && module.exports) { module.exports = { X }; }`

Tests MAY use `createRequire(import.meta.url)` to consume CommonJS exports from
ES test files. ES module syntax (`export const`, `export function`) is
PROHIBITED in calc modules because ES module imports under `file://` require
CORS-clean origins which `file://` fails — silently breaking the dashboard for
users who open it via double-click.

Test tooling (Node for unit tests on extracted calc modules, Playwright for
E2E) is permitted because it does not ship to users. It MUST NOT become a
runtime dependency of the dashboards.

**Why:** The product is a personal, file-share-friendly artifact. Preserving
the "double-click to open" property is a feature, not an accident. The file://
compatibility rule was elevated in v1.2.0 after Feature 015's discovery that
`chartState.js` and `inflation.js` (then ES modules loaded via
`<script type="module">`) silently failed under `file://`, breaking the Apply
button on the FIRE-marker drag-confirm overlay until the user happened to open
DevTools and notice the CORS errors.

### VI. Explicit Chart ↔ Module Contracts

Every Chart.js chart MUST declare, in a comment at its render function, exactly
which calc module(s) it consumes and which named output fields it reads. The
corresponding calc module's `Consumers:` list MUST name that chart.

When a chart changes — new series, new axis, new interaction — the renderer's
comment and the module's `Consumers:` list MUST both be updated in the same
commit. A chart that reads data from multiple modules MUST list all of them.

**Why:** Two-way links between charts and modules make it trivial to answer
"what breaks if I change this formula?" and "where does this number come from?"
— the two questions this codebase currently forces a human to trace through
7 000-line files to answer.

### VII. Bilingual First-Class — EN + zh-TW (NON-NEGOTIABLE)

Every user-visible string added to either dashboard MUST ship with BOTH English
AND Traditional Chinese translations in the same change set. No new
hardcoded-English DOM text, JS template literal, chart title, tooltip, legend
label, or status message. This is a merge gate, not a post-hoc cleanup task.

**Required patterns for new strings:**

1. **Static DOM text** — wire via `data-i18n="<key>"` (or `data-i18n-html` for
   HTML-carrying strings) and add the key to the `TRANSLATIONS.en` AND
   `TRANSLATIONS.zh` dicts in BOTH HTML files.
2. **JS-rendered text** — use the `t(key, ...args)` helper with `{0}`, `{1}`,
   ... placeholders. Never interpolate user-visible English directly into a
   template literal. `switchLanguage` must trigger re-render so dynamic
   strings flip with the toggle.
3. **Chart.js titles / axis labels / legend / tooltip callbacks** — call `t(...)`
   at the option-definition site.
4. **Select `<option>` labels** — each option carries its own `data-i18n`.
5. **Catalog sync** — add the new keys to `FIRE-Dashboard Translation
   Catalog.md` in the same commit as the code change.

**Exemptions (named identifiers that may stay English globally):**

- **Proper names:** Roger, Rebecca, Janet, Ian (RR-personal content)
- **FIRE-specific terms:** FIRE, Fat FIRE, Coast FIRE, Die With Zero, DWZ
- **Industry-standard financial acronyms:** 401K, IRA, Roth, LTCG, RMD, MFJ,
  AMT, SSA, PIA, FRA, SWR, P&I, HOA, NHI, APRC, SS, LTD
- **Currency + numeric values:** `$`, dollar amounts, percentages
- **Country ISO codes / ticker symbols:** US, TW, JP, etc. when used as
  two-letter prefixes in flags or option IDs
- **Emoji** (🔥 💀 🛡️ etc.) — language-neutral

Prose that happens to contain acronyms is NOT exempt: "401K annual return"
translates to "401K 年回報率", not left as English. The acronym stays; the
surrounding words translate.

**Enforcement:**

- Any PR that adds user-visible English text without a paired zh-TW translation
  is rejected unless the entire string falls under an Exemption above.
- Manager-side quick audit: `grep -oE '[A-Za-z]{4,}' <changed html fragment>`
  before merge — every match must be either inside `TRANSLATIONS`, behind a
  `data-i18n` / `t()` call, or on the Exemption list.
- Engineers dispatched on UI tasks MUST include translation work in their
  task brief. Manager MUST reject engineer reports that claim "translation
  deferred as tech debt" for user-visible strings unless the feature spec
  explicitly defers i18n (rare; document the rationale).

**Why:** The product serves bilingual households and a Taiwanese friend
network. An English-only string silently breaks the 中文 toggle — users
see half-translated UI and lose trust. Accumulated translation debt (caught
in feature 005 cleanup) costs 3 phases of agent dispatch to undo. This
principle prevents regression by making bilingual-at-merge the rule.

### VIII. Spending Funded First (NON-NEGOTIABLE)

The calc engine MUST never optimize-away the user's need to fund spending.
When stocks/cash/Roth are exhausted and only Trad 401k remains accessible,
the active withdrawal strategy MUST draw from Trad to cover the year's spending
need before respecting any tax-optimization cap (bracket-fill smoothing,
IRMAA threshold, θ knob, RMD-only mode, etc.).

**Tax optimization is REFINEMENT. Spending funding is a HARD FLOOR.**

**Required patterns:**

1. Every withdrawal strategy's `computePerYearMix` (or `taxOptimizedWithdrawal`
   for the bracket-fill default) MUST include a **spending-floor pass** AFTER
   its tax-optimization passes. The floor pass iterates with a marginal-tax
   gross-up until `shortfall ≈ 0` OR the underlying pool is exhausted —
   whichever comes first.
2. The floor pass MAY breach the IRMAA threshold or push beyond the 12% bracket
   cap. The audit's `irmaaBreached` flag captures this so the user sees the
   trade-off transparently. The alternative — silent starvation — is
   unacceptable.
3. The simulator MUST emit a per-year `hasShortfall: boolean` flag whenever the
   floor pass cannot fully fund spending (e.g., pTrad genuinely exhausted, or
   pre-401k-unlock with no taxable pools). The dashboard's lifecycle chart MUST
   visually mark these years (red-tinted overlay) and the audit's per-year
   table MUST flag them with a `has-shortfall` row class.
4. Pre-401k-unlock years (`canAccess401k === false`) are exempt from the floor
   pass for Trad specifically — Trad is structurally inaccessible. A genuine
   pre-unlock shortfall is a TRUE infeasibility, not a strategy bug, and MUST
   still be flagged via `hasShortfall: true`.

**Why:** Pre-Feature-015, the bracket-fill-smoothed and tax-optimized-search
strategies returned a shortfall of $50K+ per year for 11 retirement years
while $325K of pTrad sat untouched. The dashboard reported "On Track —
FIRE in 6 years" while the signed simulator showed a −$2.1M end balance —
the chart was clamping pools to 0 and synthesizing a fake $65K end balance.
The user's RR scenario was reported feasible while genuinely insolvent.

This principle elevates the spending-floor pass from a tactical fix to a
design contract: any future strategy added to the registry MUST honor it,
verified by the Strategy Matrix tests (Principle IV).

### IX. Mode and Objective are Orthogonal

The strategy ranker has TWO independent axes that compose, not collide:

- **Mode** (`safe` / `exact` / `dieWithZero`) is an end-state CONSTRAINT at
  plan age. Mode is applied as a feasibility FILTER before the sort.
- **Objective** (`leave-more-behind` / `retire-sooner-pay-less-tax`) is a
  path-shape SORT KEY applied across mode-feasible candidates.

Neither axis MAY silently override the other. The full resolution table
(specification of record):

| Mode | Objective | Primary sort | Tie-breaker 1 | Tie-breaker 2 |
|------|-----------|--------------|---------------|---------------|
| `safe` | preserve | `endBalance` desc | `residualArea` desc | `strategyId` asc |
| `safe` | minimizeTax | `cumulativeFederalTax` asc | `endBalance` desc | `strategyId` asc |
| `exact` | preserve | `endBalance` desc | `residualArea` desc | `strategyId` asc |
| `exact` | minimizeTax | `cumulativeFederalTax` asc | `endBalance` desc | `strategyId` asc |
| `dieWithZero` | preserve | `residualArea` desc | `\|endBalance\|` asc | `strategyId` asc |
| `dieWithZero` | minimizeTax | `cumulativeFederalTax` asc | `residualArea` desc | `strategyId` asc |

**Required patterns:**

1. Sort-key dispatch MUST be centralized in a single pure function
   `getActiveSortKey({mode, objective}) → ActiveSortKeyChain` that returns
   `{primary, tieBreakers, modeConstraintLabel, objectiveLabel}`.
2. Both the strategy ranker AND the audit's Strategy Ranking section MUST
   consume `getActiveSortKey` identically. The audit MUST display the active
   chain in plain bilingual text on every recalc so QA can verify the rank
   order matches user expectation.
3. The terminal tie-breaker MUST be `strategyId` alphabetical so two
   consecutive recalcs with no input change produce byte-identical row order
   (no flicker from map-iteration nondeterminism).
4. The "smallest end balance among feasible" sort key is degenerate under
   DWZ (every feasible candidate has `endBalance ≈ $0` by construction) and
   MUST NOT be used as the primary sort under any (Mode, Objective) pair.
   It survives only as a tertiary diagnostic.

**Why:** Pre-Feature-015, DWZ silently overrode the user's objective and
forced "smallest end balance" as the sort key. A user who selected
"Preserve estate + DWZ" got an aggressive front-loaded drain — the OPPOSITE
of preserve. The user identified this in clarification 2026-04-27: a person
planning DWZ to age 95 may die at 80, and PATH SHAPE between FIRE and 95
determines what residual exists at the actual (early) death age. Mode and
Objective MUST compose; one MUST NOT silently override the other.

## Additional Constraints & Technology Standards

**Runtime stack.** Vanilla JavaScript, Chart.js (CDN), HTML, inline CSS using
the existing dark-theme CSS-variable system (`--bg`, `--card`, `--accent*`,
etc.). Mobile-responsive layouts are required for every new component.

**Data persistence.** Snapshots append-only to `FIRE-snapshots.csv` with ISO
8601 dates and stable column ordering; new columns are appended, never inserted
between existing ones. `localStorage` keys are documented in a central schema
file and migrated with a version field. No server, no ORM, no cloud backend
without a separately approved migration plan.

**i18n.** All user-visible copy flows through `FIRE-Dashboard Translation
Catalog.md`. Ad-hoc hardcoded strings in the HTML are prohibited once the
catalog is live for that string.

**Performance floor.** The dashboard MUST render a first meaningful chart in
under 1 second on a mid-range laptop with a cold cache. Drag interactions on
the Full Portfolio Lifecycle chart MUST sustain at least 30 fps.

**Security baseline.** No secrets in source. No external API calls that leak
personal figures. `FIRE-Dashboard.html` with real Roger/Rebecca data is
considered sensitive and MUST NOT be pushed to public branches without review.

**Sticky-Chrome Discipline (v1.2.0).** The dashboard's persistent chrome
(header → gateSelector → tab-bar → pill-bar) is composed via live CSS
variables published by a `ResizeObserver`:

| Variable | Source | Consumer |
|----------|--------|----------|
| `--header-height` | `#siteHeader` bottom edge | `#gateSelector top` |
| `--gate-bottom`   | `#gateSelector` bottom edge | `.tab-bar top` |
| `--tabbar-bottom` | `#tabBar` bottom edge | `.pill-bar top` |

Z-index hierarchy (canonical, do NOT lower these without amendment):

| Element | z-index | Rationale |
|---------|---------|-----------|
| `#siteHeader` | 100 | Always wins; brand + global controls |
| `.override-confirm` | 70 | Drag-confirm overlay must beat sticky stack |
| `#gateSelector` | 60 | Mode + Withdraw Strategy buttons |
| `.tab-bar` | 50 | Top-level tabs (Plan/Geography/...) |
| `.pill-bar` | 40 | Sub-tabs (Social Security/...) |
| Other content | < 40 | Default |

Any new floating UI element with interactive controls MUST carry z-index > 60
to clear the gateSelector, OR explicitly justify the lower value in its CSS
comment. New sticky bands MUST consume one of the published `--*-bottom` vars
(or extend the chain via `ResizeObserver`) to compose tight without visible
gaps.

**File-Protocol Delivery (v1.2.0).** The dashboard MUST work when opened via
`file://` (double-click). This is non-negotiable per Principle V. Every test
that exercises the dashboard SHOULD ideally run against this delivery mode in
addition to HTTP. ES modules requiring CORS-clean origins are PROHIBITED in
calc modules per Principle V's expanded rules.

## Development Workflow & Quality Gates

**Team model.** The main session acts as Manager. Specialized Engineers
(Frontend, Backend, DB, QA) are dispatched per `CLAUDE.md`. Each task prompt
includes the Engineer's constitution excerpt, file ownership, and skills to
invoke. The Manager verifies lockstep (Principle I) before closing any task.

**Spec-driven flow.** Non-trivial changes (any new chart, any calc change, any
cross-file refactor) follow `/speckit-specify` → `/speckit-plan` →
`/speckit-tasks` → `/speckit-implement`. Bug fixes smaller than a single
function and purely cosmetic CSS tweaks MAY bypass the spec flow but MUST still
satisfy Principles I, IV, and VI.

**Review gates (all MUST pass before merge):**

1. Both HTML files modified in lockstep, or the commit explicitly documents a
   personal-content-only divergence.
2. All fixture cases pass (unit tests on extracted calc modules, manual parity
   check until the test harness exists).
3. Interaction propagation verified: for any change touching shared state,
   the author lists every chart/KPI that should update and confirms each one
   does.
4. Chart ↔ Module comment annotations updated on both sides.
5. `FIRE-Dashboard-Roadmap.md` updated if the change introduces or completes a
   tracked feature.
6. **Spending-Funded-First gate (v1.2.0).** Any change to `taxOptimizedWithdrawal`,
   `_drawByPoolOrder`, OR any strategy's `computePerYearMix` MUST include a
   passing run of `tests/unit/strategyMatrix.test.js` and
   `tests/unit/spendingFloorPass.test.js`. These tests prevent silent
   regressions of Principle VIII.
7. **Sort-key orthogonality gate (v1.2.0).** Any change to
   `rankByObjective`, `scoreAndRank`, or `getActiveSortKey` MUST include a
   passing run of `tests/unit/modeObjectiveOrthogonality.test.js`. This
   prevents reintroduction of a Mode-overrides-Objective bug per
   Principle IX.

**Complexity justification.** Any PR that adds a runtime dependency, a build
step, a new global mutable variable, or a calculation function that touches
the DOM MUST include a `Complexity Tracking` entry in its plan explaining why
the simpler alternative was rejected.

## Governance

This constitution supersedes ad-hoc conventions. Where `CLAUDE.md` and this
document address the same topic (team roles, lockstep), this constitution is
authoritative; `CLAUDE.md` is the operational playbook that implements it.

**Amendments** require: (a) a written rationale in the commit message or
associated PR, (b) a version bump per the rules below, (c) propagation of the
change to any dependent template in `.specify/templates/`, and (d) an update
of `CLAUDE.md` if the Manager/Engineer workflow is affected.

**Versioning policy (semantic):**

- **MAJOR** — removal of a principle, redefinition that invalidates prior
  guidance, or governance change that breaks existing plans.
- **MINOR** — new principle or materially expanded section.
- **PATCH** — clarification, wording fix, non-semantic refinement.

**Compliance review.** Every `/speckit-plan` run evaluates its feature against
the Constitution Check gate (the plan template reads this file). Violations
MUST be listed under `Complexity Tracking` with justification, or the plan
MUST be revised until compliant. Two consecutive justified violations of the
same principle trigger a constitution amendment discussion.

**Version**: 1.2.0 | **Ratified**: 2026-04-19 | **Last Amended**: 2026-04-27

**Changelog:**
- 1.2.0 (2026-04-27, MINOR): Added Principle VIII — Spending Funded First
  (NON-NEGOTIABLE) and Principle IX — Mode and Objective are Orthogonal.
  Materially expanded Principle V with file:// compatibility / UMD-style
  classic-script loading rules. Expanded Principle II with audit-observability
  sub-requirement (subSteps in flow diagram). Expanded Principle IV with
  Strategy Matrix coverage requirement. Added "Sticky-Chrome Discipline"
  and "File-Protocol Delivery" subsections under Additional Constraints.
  Added review gates 6 (Spending-Funded-First) and 7 (Sort-key orthogonality).
  All amendments derived from Feature 015 follow-up work shipped 2026-04-27.
- 1.1.0 (2026-04-21, MINOR): Added Principle VII — Bilingual First-Class
  (EN + zh-TW NON-NEGOTIABLE for all new user-visible strings).
- 1.0.0 (2026-04-19, MAJOR): Initial ratification. Six core principles
  established (I — Dual-Dashboard Lockstep through VI — Explicit Chart ↔
  Module Contracts).
