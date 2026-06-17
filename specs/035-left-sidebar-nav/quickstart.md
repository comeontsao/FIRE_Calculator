# Quickstart: Verifying Left-Sidebar Navigation

Manual + automated checks to confirm the navigation chrome moved correctly and nothing about
button behavior changed. Run against **both** `FIRE-Dashboard.html` and
`FIRE-Dashboard-Generic.html`.

## Manual smoke (both files, desktop)

1. Open the dashboard (double-click → `file://`, and/or via `python -m http.server`).
2. Confirm the **header stays on top** and the **Safe/Exact/DWZ + Withdraw Strategy band**
   stays directly under it (these did NOT move).
3. Confirm the **primary tabs are a vertical list in a left rail**, and the **active tab is
   expanded showing its pills** beneath it (accordion). Other tabs show no pills.
4. Confirm the **content area starts higher** than before (the old tab + pill top bands are
   gone) and sits to the **right** of the rail.
5. Click every tab (Plan / Geography / Retirement / History / Audit): the same content opens,
   the tab highlights, and that tab's pills appear; the previous tab's pills collapse.
6. Click every pill within each tab: the same sub-view renders and highlights as before.
7. Toggle Safe/Exact/DWZ and Withdraw Strategy (still in the header): verdict + chart update
   exactly as before.
8. Scroll a long view (e.g. Retirement → Withdrawal Strategy): the **rail stays in view**
   (sticky); a long pill list scrolls within the rail.
9. Switch language EN ↔ 中文: tab/pill labels translate; rail width still fits both.
10. Toggle light/dark theme: rail honors theme variables in both.

## Manual smoke (both files, narrow / mobile)

1. Shrink to phone width (or device emulation).
2. Confirm the rail is hidden and a **☰ toggle** is visible; **no horizontal scrollbar**.
3. Open the drawer: rail overlays content (scrim behind it); pick a tab/pill → the view
   changes and the drawer closes.
4. Confirm content is full-width with the drawer closed.

## Automated

```bash
# Cold-load console check — expect errorCount: 0 on BOTH files
node tools/console-probe.mjs "FIRE-Dashboard.html"
node tools/console-probe.mjs "FIRE-Dashboard-Generic.html"

# New navigation E2E (desktop + narrow + Generic parity)
npx playwright test tests/e2e/left-sidebar-nav.spec.ts --reporter=line

# Full gate before merge (navigation parity must stay green across the suite)
npm run test:unit          # unchanged — must still pass (no calc touched)
npx playwright test --reporter=line
```

## Acceptance gate (maps to spec Success Criteria)

- [ ] SC-001 — first content element starts higher by ≈ the two relocated rows' height.
- [ ] SC-002 — every tab/pill/mode/strategy control produces the same result (E2E parity green).
- [ ] SC-003 — no horizontal scrollbar down to ~320px.
- [ ] SC-004 — both dashboards behave identically.
- [ ] SC-005 — unit + E2E suites green (no calc/chart/i18n regressions).
- [ ] SC-006 — every previously-top control is findable + operable in the rail on first try.
- [ ] Cold-load `errorCount: 0` on both files (file:// safe).
