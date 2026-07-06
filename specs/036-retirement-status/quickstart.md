# Quickstart: Explicit Retirement Status — manual verification

Run after implementation. Exercises each user story against **both** dashboards. Browser smoke is a Manager-executed merge gate (constitution + CLAUDE.md Process Lessons).

## Prereqs

```powershell
# Unit + contract tests (Node)
npm test
node --test tests/unit/accumulateToFire.retirement.test.js

# E2E
npm run test:e2e            # FULL suite must be green (not just the feature spec)

# Browser smoke (both files) — errorCount must be 0
node tools/console-probe.mjs "C:\Users\roger\Documents\GitHub\FIRE_Calculator\FIRE-Dashboard.html"
node tools/console-probe.mjs "C:\Users\roger\Documents\GitHub\FIRE_Calculator\FIRE-Dashboard-Generic.html"
```

## US1 — Declare "I've retired" (P1) — both dashboards

1. Open dashboard, note the "FIRE in N years" verdict.
2. Toggle **I've retired** ON; set retirement year = current year.
3. ✅ Every projected year from now on shows **no employment income** and **no new contributions**; balances draw down (SC-002).
4. Set retirement year **earlier than the "safe" age** with modest balances.
5. ✅ Projection shows the honest drawdown including a **shortfall year** (red-tinted lifecycle years); never shows the user still working (SC-005 / FR-007).
6. Reload the page.
7. ✅ Retirement status + year persist (SC-003).
8. Toggle OFF.
9. ✅ Projection reverts **exactly** to the feasibility-driven result (SC-004 / INV-1).

## US2 — Feasibility becomes an "on-track" readout (P2)

1. Status ON, balances sufficient to plan end.
2. ✅ Headline = "Retired — sustainable to age {endAge}", **no countdown** (FR-014 / SC-001).
3. Reduce balances until money runs short before plan end.
4. ✅ Headline = "Retired — at risk · shortfall in {year}" naming the correct first shortfall year (FR-006).

## US3 — Planning lever preserved for the not-yet-retired (P2)

1. Status OFF: drag the FIRE marker.
2. ✅ Planned FIRE age updates as today (FR-010).
3. Status ON: attempt to drag the FIRE marker.
4. ✅ Drag is inert; marker reflects the actual retirement age; no second "retirement age" appears (FR-011).

## US4 — Auto-suggest marking retired (P3)

1. Status OFF; adjust inputs so numbers newly cross the feasible line (feasible today).
2. ✅ A dismissible banner appears: "Looks like you could retire as of {year} — mark yourself retired?"
3. Dismiss it.
4. ✅ No projection change; it does not reappear this session (FR-012). Reload in a new session → may reappear.
5. Trigger again and **accept**.
6. ✅ Status turns ON with retirement year = current year (delegates to US1).

## US5 — Staggered retirement for two earners (Generic only)

1. Generic dashboard, `adultCount = 2`. Enter **Person 1 income** and **Person 2 income** (distinct amounts).
2. ✅ Household income = P1 + P2 (INV-6); RR dashboard shows a single household income (Principle I divergence — expected).
3. Set Person 1 retirement year `Y1` earlier than Person 2's `Y2`.
4. ✅ Interim years [Y1, Y2): only Person 1's income/contributions removed; Person 2's income continues (SC-008 / FR-018).
5. ✅ Years ≥ Y2: all employment income and new contributions stopped; pure drawdown thereafter.
6. Switch `adultCount = 1`.
7. ✅ Person 2 income + Person 2 retirement controls hidden/ignored; behaves as single-earner household (FR-020).

## Lockstep & i18n gate

- ✅ Both HTML files changed in the same set (Principle I); only the single-date (RR) vs per-person (Generic) divergence differs.
- ✅ Every new string appears in `TRANSLATIONS.en` **and** `TRANSLATIONS.zh` in both files and in `FIRE-Dashboard Translation Catalog.md`; toggle 中文 and confirm all retirement copy flips (Principle VII).
- ✅ Any new floating banner clears the sticky chrome (z-index > 60 or justified).

## Definition of done

All unit + contract fixtures (C-5) green; full E2E green; console-probe errorCount 0 on both files; the 6 invariants (data-model) hold; roadmap updated.
