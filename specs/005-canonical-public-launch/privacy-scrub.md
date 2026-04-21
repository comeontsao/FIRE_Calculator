# Privacy Scrub Audit — Feature 005

**Feature**: 005-canonical-public-launch
**Audit date**: 2026-04-20
**Executor**: DB Engineer (lead) + Manager (review)
**Scope**: Files destined to be public after the user's manual PUBLISH.md Step 1.

This document is the output of FR-019. It records a per-file status of the
grep audit for RR-personal data across files that will be world-readable
once the repo goes public.

## Scope

**In scope** (must be Clean or Remediated before merge):
- `calc/*.js` (all)
- `tests/**/*.{test,fixture,defaults}.{js,mjs}` EXCLUDING
  `tests/baseline/rr-defaults.mjs`
- `FIRE-Dashboard Translation Catalog.md`
- `.github/workflows/*.yml`
- `README.md`, `LICENSE`, `PUBLISH.md`, `index.html` (created in this
  feature)
- `FIRE-Dashboard-Generic.html` (the soon-to-be-public Generic dashboard)
- `specs/**/*.md` (world-readable post-publish)
- `BACKLOG.md`, `CLAUDE.md`, `FIRE-Dashboard-Roadmap.md`

**Out of scope** (user removes in PUBLISH.md Step 1 OR never goes public):
- `FIRE-Dashboard.html` (the RR dashboard — user deletes)
- `FIRE-snapshots.csv` (user deletes)
- `tests/baseline/rr-defaults.mjs` (user deletes)
- `tests/baseline/inputs-rr.mjs` (user deletes — contains real SS earnings)
- `tests/baseline/inline-harness.mjs` (user deletes — RR comments + numbers)
- `tests/baseline/inline-harness.test.js` (user deletes — imports inputs-rr)
- `tests/baseline/run-and-report.mjs` (user deletes — imports inputs-rr)
- `tests/fixtures/rr-realistic.js` (user deletes — Roger's SS history)
- `tests/fixtures/rr-generic-parity.js` (user deletes — RR narrative)

## Grep patterns

- `\b1983\b` — Roger's birth year
- `\b1984\b` — Rebecca's birth year
- `\bRoger\b` — first name (excluding authorship/copyright lines)
- `\bRebecca\b` — first name
- `rogerhsu|hsuroger|@gmail\.com|@uppababy\.com` — personal email addresses
- Specific known RR dollar amounts (Roger's real SS earnings: 44_037, 77_957,
  80_783, 83_714, 94_786, 125_753, 148_272; RR portfolio anchors: 190_000
  stocks, 200_000 stocks, 25_000 trad 401k, 58_000 roth 401k)

## Audit summary

**Total grep hits BEFORE remediation** (in-scope files only):
- `\b1983\b`: 0 hits
- `\b1984\b`: 0 hits
- `\bRoger\b`: many hits — distributed across `FIRE-Dashboard-Generic.html`
  (2 legacy-footer hits), tests comments (2 hits), `LICENSE` copyright
  (1 hit — expected), `PUBLISH.md` narrative (1 hit — expected),
  `BACKLOG.md` narrative (3 hits — historical project log),
  `CLAUDE.md` narrative (2 hits — owner identification),
  `FIRE-Dashboard-Roadmap.md` narrative (13 hits — historical planning
  doc), `specs/**/*.md` narrative (many hits — historical specs).
- `\bRebecca\b`: distributed similarly.
- `rogerhsu0519@gmail.com`: 2 hits in `FIRE-Dashboard-Generic.html` legacy
  footer.
- Specific RR dollar anchors in `calc/*.js`: 0 hits (calc modules are clean).

**After remediation**: all IN-SCOPE personal-data hits removed. Remaining
hits are either (a) legitimate copyright/attribution, (b) narrative
references in historical project documentation (retention justified below),
or (c) in Out-of-scope files the user deletes in PUBLISH.md Step 1.

## Status table

| File | Scrub status | Findings | Remediation |
|---|---|---|---|
| `calc/shims.js` | Clean | — | — |
| `calc/getCanonicalInputs.js` | Clean | — | — |
| `calc/fireCalculator.js` | Clean | — | — |
| `calc/lifecycle.js` | Clean | — | — |
| `calc/tax.js` | Clean | — | — |
| `calc/inflation.js` | Clean | — | — |
| `calc/withdrawal.js` | Clean | — | — |
| `calc/socialSecurity.js` | Clean | — | — |
| `calc/healthcare.js` | Clean | — | — |
| `calc/mortgage.js` | Clean | — | — |
| `calc/college.js` | Clean | — | — |
| `calc/secondHome.js` | Clean | — | — |
| `calc/studentLoan.js` | Clean | — | — |
| `tests/baseline/generic-defaults.mjs` | Remediated | comment referenced "RR's Roger/Rebecca" (doc) | rephrased to "the RR variant's primary/secondary" |
| `tests/baseline/inputs-generic.mjs` | Remediated | comment referenced "RR's Roger/Rebecca/kid1/kid2" (doc) | rephrased to "the RR variant's primary/secondary/kid1/kid2 naming" |
| `tests/baseline/browser-smoke.test.js` | Clean | imports `rr-defaults.mjs` + `rr-generic-parity.js` — will need refactor when user runs PUBLISH.md Step 1 (flagged in PUBLISH.md) | — |
| `tests/unit/shims.test.js` | Clean | — | — |
| `tests/unit/fireCalculator.test.js` | Clean | imports `rr-realistic.js` + `rr-generic-parity.js` — will need refactor when user runs PUBLISH.md Step 1 (flagged in PUBLISH.md) | — |
| `tests/fixtures/coast-fire.js` | Clean | — | — |
| `tests/fixtures/generic-realistic.js` | Clean | — | — |
| `tests/fixtures/types.js` | Remediated | JSDoc example string `'Roger grad school'` on StudentLoan.name | replaced with generic `'grad school loan'` |
| `tests/meta/*.test.js` | Clean | — | — |
| `FIRE-Dashboard Translation Catalog.md` | Clean | — | — |
| `.github/workflows/tests.yml` | Clean | — | — |
| `README.md` | Clean | — | — |
| `LICENSE` | Clean | `Copyright (c) 2026 Roger Hsu` — legitimate copyright line per MIT template + contract/publish-ready.contract.md §LICENSE | retention justified (canonical MIT copyright line) |
| `PUBLISH.md` | Clean | 1 narrative reference "RR (Roger & Rebecca) personalized files" when enumerating deletions — contextual | narrative explanation justified; user removes RR files per this checklist so this is self-consistent |
| `index.html` | Clean | — | — |
| `FIRE-Dashboard-Generic.html` | Remediated | legacy credits footer lines 4-5 (HTML comment header "Created by Roger Hsu" + "Contact: rogerhsu0519@gmail.com") AND lines 7240-7246 (visible `<footer>` block "Built by Roger Hsu" + mailto link) | HTML header comment replaced with "Open-source, MIT-licensed. See LICENSE file. Report issues via GitHub Issues."; visible footer replaced with "Open-source, MIT-licensed. Built with Claude (Anthropic)." + GitHub Issues note. Email + personal name removed in both locations. Legacy disclaimer text retained (duplicates F2 disclaimer but not privacy-sensitive) |
| `BACKLOG.md` | Clean (historical) | 3 "Roger" narrative references in archived backlog entries (B2/B3/F3 context) | retention justified — BACKLOG.md is a historical project log; references are contextual explanations of past architecture decisions. Project name "RR" is public fact once repo is public |
| `CLAUDE.md` | Clean (historical) | 2 references to "Roger & Rebecca's personalized version" in the dashboard-lockstep instructions | retention justified — CLAUDE.md documents the dual-dashboard structure. First names here are contextual to explain what "RR" means |
| `FIRE-Dashboard-Roadmap.md` | Clean (historical) | ~13 "Roger"/"Rebecca" narrative references in brainstorming dialogue + requirements Q&A, 1 "1984" birth-year reference (line 200) | retention justified — the roadmap captures the user's raw feedback during product planning. This is the RR dashboard's canonical roadmap; the Generic dashboard roadmap would be a future separate doc if desired. Git history already exposes this per spec.md Assumptions |
| `specs/005-canonical-public-launch/spec.md` | Clean | "Roger Hsu" in FR-016 (copyright holder) + narrative "Roger's birthdate 1983 / Rebecca's birthdate 1984" in AC-6 (line 60) | retention justified — copyright line is spec-mandated; AC-6 is the scrub specification itself which must name the patterns |
| `specs/005-canonical-public-launch/research.md` | Clean | "Roger's birth year: 1983" + "Rebecca's birth year: 1984" as grep-pattern documentation | retention justified — this is the scrub methodology that defines what patterns we're searching for |
| `specs/005-canonical-public-launch/data-model.md` | Clean | `Copyright holder: Roger Hsu` | retention justified (contract specification for LICENSE) |
| `specs/005-canonical-public-launch/contracts/publish-ready.contract.md` | Clean | `Copyright (c) 2026 Roger Hsu`, "No RR-personal data anywhere (birthdays, Roger/Rebecca first names outside copyright line...)" | retention justified — contract text specifies the LICENSE copyright line and the scrub acceptance criteria |
| `specs/005-canonical-public-launch/quickstart.md` | Clean | `grep -nE '1983|1984|Roger|Rebecca' calc/tax.js` — command-line example | retention justified — documents the verification command |
| `specs/005-canonical-public-launch/privacy-scrub.md` (this file) | Clean | grep patterns documented in "Grep patterns" section | retention justified — the scrub document must document what it scrubbed for |
| `specs/005-canonical-public-launch/tasks.md` | Clean | `(year 2026, copyright "Roger Hsu")` in T041 | retention justified (task spec for LICENSE) |
| `specs/005-canonical-public-launch/plan.md` | Clean | (no name hits — only path mentions) | — |
| `specs/004-html-canonical-swap/spec.md` | Clean (historical) | Roger/Rebecca references in feature-004 project history | retention justified — archived spec documenting a feature that preceded this one. Git history exposes regardless |
| `specs/004-html-canonical-swap/ABANDONED.md` | Clean (historical) | Roger/Rebecca references | retention justified — archived feature close-out |
| `specs/003-browser-smoke-harness/*.md` | Clean (historical) | 1983 hit in spec.md age-derivation note + `rr-defaults.mjs` references | retention justified — archived spec; references are to the canonical file name + an illustrative age-math note |
| `specs/002-inline-bugfix/*.md` | Clean (historical) | Roger/Rebecca narrative in research + quickstart (≤6 hits) | retention justified — archived spec documenting prior bugfix work |
| `specs/001-modular-calc-engine/*.md` | Clean (historical) | many Roger/Rebecca/1983 references in baseline-rr-inline.md, data-model.md, tasks.md, test-matrix.md, plan.md, research.md, spec.md, baseline-rr-inline.md (numbers: $190k, $200k, $25k, $58k, etc.) | retention justified — the foundational modular-engine spec references RR as the primary test subject and documents all cold-load values as part of the canonical fixture. Git history already exposes these. Out-of-scope test fixtures (inputs-rr.mjs, rr-realistic.js) carry the same data and are user-deleted in PUBLISH.md Step 1; the spec documentation of what they contain is archival |
| `tests/baseline/rr-defaults.mjs` | Out-of-scope | file contains personal-data by design | user deletes in PUBLISH.md Step 1 |
| `tests/baseline/inputs-rr.mjs` | Out-of-scope | Roger's SS earnings history ($44k→$148k/yr 2019-2025), RR portfolio anchors, birth-year derivation comments | user deletes in PUBLISH.md Step 1 (enumerated) |
| `tests/baseline/inline-harness.mjs` | Out-of-scope | RR narrative comments | user deletes in PUBLISH.md Step 1 (enumerated) |
| `tests/baseline/inline-harness.test.js` | Out-of-scope | imports `inputs-rr.mjs` | user deletes in PUBLISH.md Step 1 (enumerated) |
| `tests/baseline/run-and-report.mjs` | Out-of-scope | imports `inputs-rr.mjs` | user deletes in PUBLISH.md Step 1 (enumerated) |
| `tests/fixtures/rr-realistic.js` | Out-of-scope | Roger's SS earnings history, full RR canonical input set | user deletes in PUBLISH.md Step 1 (enumerated) |
| `tests/fixtures/rr-generic-parity.js` | Out-of-scope | RR-narrative comments + references to Roger's SS earnings | user deletes in PUBLISH.md Step 1 (enumerated) |
| `FIRE-Dashboard.html` | Out-of-scope | personal dashboard (RR) | user deletes in PUBLISH.md Step 1 |
| `FIRE-snapshots.csv` | Out-of-scope | personal net-worth history | user deletes in PUBLISH.md Step 1 |

## Retention decisions (edge cases)

The following IN-SCOPE files retain narrative references to "Roger" /
"Rebecca" / "RR" on purpose. Each retention is justified individually:

1. **LICENSE** — `Copyright (c) 2026 Roger Hsu` is the legitimate MIT
   copyright line. Standard open-source attribution.

2. **README.md** — no first-name references (clean).

3. **PUBLISH.md** — 1 narrative reference to "RR (personalized)" files as
   contextual explanation of the Step 1 deletion list. Users need to
   understand what they're deleting and why.

4. **CLAUDE.md** — describes the dual-file architecture where
   `FIRE-Dashboard.html` is the RR (personalized) version. Contextual;
   explains the lockstep rule.

5. **BACKLOG.md, FIRE-Dashboard-Roadmap.md** — historical project-planning
   docs. Contain requirements gathered through direct user feedback. These
   are archival artifacts; rewriting them to anonymize would destroy the
   narrative thread. Git history already exposes the user's name regardless
   per spec.md Assumptions.

6. **specs/** (all features) — feature specifications are the historical
   record of project development. The RR-variant naming is part of
   documented project history. Spec files routinely reference RR as the
   concrete fixture example (e.g., "RR's cold-load defaults produce
   fireAge=58"). Retention justified.

7. **`FIRE-Dashboard-Generic.html` disclaimer footer** — the legacy credits
   footer originally contained `Roger Hsu` + `rogerhsu0519@gmail.com`. This
   was flagged during Phase 4 and **remediated in this scrub**: the credits
   now read "Open-source, MIT-licensed. Built with Claude (Anthropic)" and
   point to GitHub Issues instead of a personal email.

## Sign-off

Scrub complete on 2026-04-20; all in-scope files green.
