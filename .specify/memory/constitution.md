<!--
SYNC IMPACT REPORT
==================
Version change: (template / 0.0.0) → 1.0.0
Rationale: MAJOR — initial ratification of a concrete constitution replacing the
unfilled template. All principles newly defined; sets the foundation gate that all
future /speckit-plan runs will be checked against.

Modified principles:
  - (template placeholder) → I. Dual-Dashboard Lockstep (NON-NEGOTIABLE)
  - (template placeholder) → II. Pure Calculation Modules with Declared Contracts
  - (template placeholder) → III. Single Source of Truth for Interactive State
  - (template placeholder) → IV. Gold-Standard Regression Coverage (NON-NEGOTIABLE)
  - (template placeholder) → V. Zero-Build, Zero-Dependency Delivery
  - (template placeholder) → VI. Explicit Chart ↔ Module Contracts

Added sections:
  - Additional Constraints & Technology Standards
  - Development Workflow & Quality Gates
  - Governance

Removed sections: none (template placeholders replaced in place).

Templates requiring updates:
  - ✅ .specify/templates/plan-template.md — Constitution Check gate reads this file
       at runtime; no literal edit required. Verified gate alignment.
  - ✅ .specify/templates/spec-template.md — no constitution-specific tokens; OK.
  - ✅ .specify/templates/tasks-template.md — no constitution-specific tokens; OK.
  - ✅ .claude/skills/speckit-*/SKILL.md — agent-neutral language already.
  - ✅ CLAUDE.md — team structure and lockstep rule already in sync with Principle I.

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

Modules MAY remain as fenced `<script>` blocks inside the HTML files during the
transitional extraction phase; they MUST eventually migrate to a `calc/` or
`lib/` directory.

**Why:** The April 2026 audit found mixed real/nominal returns, silent shortfall
absorption, and deterministic "Monte Carlo" — all symptoms of calc code
entangled with rendering. Purity and contracts make each formula auditable in
isolation.

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

New charts MAY NOT ship without at least one fixture case tying their displayed
values back to the module that produced them.

**Why:** Without locked fixtures, subtle drift (off-by-one ages, real-vs-nominal
mix-ups, tax-rate changes) ships undetected. Fixtures turn every calc regression
into a visible test failure.

### V. Zero-Build, Zero-Dependency Delivery

The dashboards MUST remain runnable by opening the HTML file directly in a
browser — no bundler, no npm install, no transpile step, no framework runtime.
Chart.js is loaded from its CDN; any other third-party library requires
explicit user approval and an equivalent no-build delivery path (CDN or
vendored single file).

Test tooling (Node for unit tests on extracted calc modules, Playwright for
E2E) is permitted because it does not ship to users. It MUST NOT become a
runtime dependency of the dashboards.

**Why:** The product is a personal, file-share-friendly artifact. Preserving
the "double-click to open" property is a feature, not an accident.

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

**Version**: 1.1.0 | **Ratified**: 2026-04-19 | **Last Amended**: 2026-04-21

**Changelog:**
- 1.1.0 (2026-04-21, MINOR): Added Principle VII — Bilingual First-Class
  (EN + zh-TW NON-NEGOTIABLE for all new user-visible strings).
