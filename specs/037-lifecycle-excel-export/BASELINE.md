# Pre-Feature Regression Anchor (T001)

**Feature**: 037-lifecycle-excel-export
**Captured**: 2026-08-13, on `main` @ `6ad049e` (the merge-base for this branch)

Recorded so the final gate (T039) can classify any failure as **flake** or **regression** instead of
guessing. Features 035 and 036 both merged without this, which is why nobody could tell whether the
E2E failures on those branches were new.

## Unit

```
npm run test:unit  →  760 tests / 760 pass / 0 fail
```

## Full Playwright suite

```
npx playwright test  →  197 passed / 4 failed  (14.3m)
```

**All 4 failures pass in isolation** — they are parallel-load contention, NOT regressions:

| Spec | Test | Isolated result |
|---|---|---|
| `retirement-status.spec.ts:248` | `[generic]` status/year persist across reload (SC-003) | ✅ 14/14 |
| `calc-audit.spec.ts:404` | `[generic]` `audit.schemaVersion === "1.0"` | ✅ 53/53 |
| `feature-018-strategy-matrix.spec.ts:199` | `[generic]` KPI/sidebar on every strategy radio | ✅ (same run) |
| `feature-018-strategy-matrix.spec.ts:292` | `[rr]` full matrix sweep — no console errors | ✅ (same run) |

Failure modes seen: a 45 s `waitForFunction` timeout, and spurious 404s on resource loads — both
signatures of contention, not logic.

**Root cause**: four spec files each exceed 5 minutes, so the suite saturates its workers —
`tab-navigation` 8.6m, `left-sidebar-nav` 6.1m, `feature-018-ui-coverage` 5.3m,
`header-zoom-matrix` 5.2m. This predates feature 037 and is worth its own task (shard or serialize).

## Console probe

```
node tools/console-probe.mjs FIRE-Dashboard.html          →  errorCount 0, all module flags true
node tools/console-probe.mjs FIRE-Dashboard-Generic.html  →  errorCount 0, all module flags true
```

## Browser smoke

```
node tools/smoke-032.mjs  →  15/15 passed
```

Live RR values at capture (useful as a sanity reference for the export's own numbers):

- Net worth **$532,021**
- FIRE number **🇹🇼 $1,335,336**
- Verdict **🔥 On Track — FIRE in 6 years 2 months (age 49)**

## Post-feature gate result (T039, 2026-08-13)

```
npx playwright test  →  220 passed / 1 failed  (9.9m)   [221 total = 201 baseline + 20 new 037 tests]
```

The single failure — `feature-018-ui-coverage.spec.ts:139 linkage: monthlySavings → pviExtraMonthly (generic)`
— is **NOT in the table above**, so by this file's own rule it was treated as a regression until
disproven. Re-run in isolation: **10/10 pass**. Same 404-resource-under-load signature as the
baseline's two `feature-018-strategy-matrix` entries, and `feature-018-ui-coverage` is one of the
>5-minute files already named as contention-prone.

**Verdict: flake, not regression** — but a *new member* of the family, recorded here rather than
silently folded in:

| Spec | Test | Isolated result |
|---|---|---|
| `feature-018-ui-coverage.spec.ts:139` | `(generic)` monthlySavings → pviExtraMonthly | ✅ 10/10 |

Note the baseline's own 4 failures did **not** recur this run, and the run was ~4.4 minutes faster
(9.9m vs 14.3m). Which specific tests lose the contention race varies per run — further evidence
the family is load-dependent rather than logic-dependent. The underlying suite-sharding problem
remains unfixed and is worth its own task.

**Caution for the next person**: `npx playwright test 2>&1 | tail -N` reports **`tail`'s** exit
code, not Playwright's. This run printed `exited with code 0` while reporting `1 failed`. Read the
summary line; do not trust the piped exit status.

## How to use this at the gate

A T039 failure is a **regression** if it is not in the table above. If it IS in the table, re-run
that spec in isolation to confirm it still passes; only then call it a flake. Do not wave through a
new failure because "the suite is known-flaky" — the known flakes are enumerated here precisely so
that excuse cannot be used generically.
