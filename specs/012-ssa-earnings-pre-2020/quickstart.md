# Quickstart — Manual Verification

**Feature**: `specs/012-ssa-earnings-pre-2020/spec.md`
**Plan**: `specs/012-ssa-earnings-pre-2020/plan.md`
**Audience**: Manager / QA Engineer running the final manual gate before merge.
**Estimated time**: 8 minutes.

Follow these steps against the built dashboard opened in a real browser (not headless). Each step ends with a **Check:** that must be true.

## Prereqs

- Working tree is on branch `012-ssa-earnings-pre-2020` with all implementation tasks merged.
- `node --test tests/` exits 0 (existing + new test cases all green).
- Browser: any evergreen (Chrome, Edge, Firefox). Test both EN and zh-TW once.

## Cold-load smoke

1. Open `FIRE-Dashboard-Generic.html` directly via `file://` or `python -m http.server`. Wait 2 s.
2. Scroll to the Social Security card ("Social Security — Realistic Estimator & Three-Phase FIRE").
3. **Check**: two buttons visible side-by-side: `+ Add Prior Year` and `+ Add Year`. Below them, the "Earliest year" input and "Set" button. Below that, a blank status line.
4. **Check**: DevTools Console has zero red errors. The inline SS chart renders a numeric benefit (not NaN, not `—`).

## User Story 1 — Prepend one prior year

5. Click `+ Add Prior Year`.
6. **Check**: table now has a row for **2019** at the top, with earnings input showing `0` and credits `4`.
7. **Check**: status line reads `Added 2019.` (EN) or `已新增 2019。` (zh-TW), fades after ~5 s.
8. Click into the 2019 earnings input and enter `62000`, press Tab.
9. **Check**: SS projection numbers (Primary PIA, AIME, combined-at-FRA) update within one frame; none are NaN.

## Prepend-repeat

10. Click `+ Add Prior Year` three more times.
11. **Check**: table now has rows for 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025 in ascending order.

## User Story 2 — Bulk "Earliest year"

12. In the "Earliest year" number input, type `1995`, click `Set`.
13. **Check**: the table now includes a row for **1995** at the top. (Per helper contract §`setEarliestYear` empty-history note and the ascending-bulk-prepend path: all years from 1995 through 2015 are prepended, so the record now has rows 1995, 1996, ..., 2025.) Status line reads `Added 1995.` (EN) or `已新增 1995。` (zh-TW).
14. **Check**: the "Credits: N/40" badge reflects 4 × new-row-count credits.

## User Story 3 — Guards

15. Type `2024` into "Earliest year", click `Set`.
16. **Check**: no rows are added; status line reads `Already covered — no change.` (EN) / `已涵蓋此年份，未變更。` (zh-TW).
17. Type `1959` into "Earliest year", click `Set`.
18. **Check**: rows 1960 through current-first-year are prepended; status line reads `Earliest supported year is 1960.` (EN) / `最早可輸入年份為 1960。` (zh-TW). The record now starts at 1960.
19. Click `+ Add Prior Year` (now at floor).
20. **Check**: no change to table; status line reads `Earliest supported year is 1960.` The existing 1960 row is not duplicated.

## User Story 3 — Invalid edit

21. Click into any row's earnings input. Type `abc`, press Tab.
22. **Check**: the input coerces to `0` (existing behaviour from `updateSSEarning`'s `parseFloat || 0`). SS projection remains finite — no NaN, no `−Infinity`.

## Persistence

23. Hard-reload the page (Ctrl+Shift+R / Cmd+Shift+R).
24. **Check**: the full prepended history (1960–2025 from step 18) is still present with all entered values intact. In particular, the $62,000 entered in step 8 for 2019 is still there.

## Language toggle

25. Toggle to zh-TW.
26. **Check**: all seven new strings flip to the translations in `contracts/ss-i18n.contract.md`. The still-visible status line text also updates immediately (no stale English residue).
27. Toggle back to EN.
28. **Check**: full parity with step 27 in reverse.

## Lockstep (forward-looking; skip if RR file absent)

29. If `FIRE-Dashboard.html` exists in the working tree, repeat steps 1–9 against it.
30. **Check**: identical behaviour to Generic. If any divergence beyond personal-content (names, birthdates, dollar amounts), reject merge.

## Exit criteria

- All 28 checks above pass on at least one evergreen browser.
- `node --test tests/` exits 0.
- Playwright E2E suite from feature 011 (`tests/e2e/responsive-header.spec.ts`) still passes (not affected by this feature but the smoke layer stays green).
- No new console errors or warnings attributable to this feature.

Failure to meet any of the above blocks merge. Log failures in the PR as inline comments tagged `qa-finding`.
