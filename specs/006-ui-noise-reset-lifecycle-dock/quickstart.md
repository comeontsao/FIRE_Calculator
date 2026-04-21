# Quickstart — 006 UI Noise Reset + Lifecycle Dock

**Feature**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)
**Date**: 2026-04-21

Manual verification script. Run this after `/speckit-implement` completes to confirm every acceptance criterion holds.

---

## Setup

1. Checkout the `006-ui-noise-reset-lifecycle-dock` branch.
2. Open `FIRE-Dashboard.html` in Chrome or Edge (desktop, viewport ≥1280px).
3. Open DevTools → Console. Watch for errors throughout the checks.
4. (Optional) Open `FIRE-Dashboard-Generic.html` in a second tab for lockstep parity checks.

---

## Check 1 — Sticky compact header (US2)

| Step | Expected |
|------|----------|
| 1.1 | Load page. Header renders in expanded form: gradient h1, subtitle visible, FIRE-status pill, language toggle + sidebar toggle on the right. Height ≈ 140–160px. |
| 1.2 | Scroll down to a position below the country grid (~1500px down). | Header is still visible at the top. It has transitioned to a compact bar: ~52px tall, no subtitle, smaller h1, solid accent color (no gradient). Two live chips appear next to the title: "Years to FIRE [N]" and "Progress [N%]". The FIRE-status pill is smaller but still visible. Backdrop shows a blurred translucent effect over the content scrolling beneath. |
| 1.3 | Scroll back to the top. | Header expands back smoothly (~240ms). Gradient returns, subtitle fades in, live chips hide. |
| 1.4 | In DevTools → Rendering pane, enable "Emulate CSS media feature prefers-reduced-motion → reduce". Scroll past the threshold and back. | State switches are instant (no animation), but functionally correct: compact state still applies. |
| 1.5 | Drag any input slider in the Profile or Projections section. Observe the live chips while still on the top of the page (scroll up first if needed — so the chips are hidden). Now scroll down into compact state. | Live chips show the current values. Drag another slider. | Chips update in real time as the slider moves. |
| 1.6 | Click the language toggle (EN/中文) while in compact state. | Language switches. Chip labels ("Years to FIRE" → "距 FIRE 年數", "Progress" → "進度") update immediately. No page reload. |

Pass criteria: all above behave as expected; no console errors; no visible flicker when crossing the threshold.

---

## Check 2 — Pinnable lifecycle sidebar (US1)

| Step | Expected |
|------|----------|
| 2.1 | Click the sidebar toggle (⚓ or pin icon) in the header. | Sidebar slides in from the right edge (~260ms). Main dashboard content reflows: the grid shrinks by ~420px on the right. The sidebar shows the Full Portfolio Lifecycle chart, a small caption "FIRE age [N] · End-of-life portfolio [N]", and two controls (pin and close). The pin button is visually "pressed" (aria-pressed="true"). |
| 2.2 | Reload the page. | Sidebar is already pinned on first paint. No flash of the unpinned state. |
| 2.3 | While pinned, drag any slider that affects the lifecycle projection (savings rate, return rate, end age). | Both the primary in-page lifecycle chart AND the sidebar lifecycle chart update on the same frame. The caption (FIRE age, end-of-life portfolio) updates too. |
| 2.4 | Click the pin button OR the close (×) button. | Sidebar slides out; main content reflows back to full width. Pin preference is cleared. Reload → sidebar starts hidden. |
| 2.5 | Resize the browser window to below 780px. While below, click the sidebar toggle in the header. | Sidebar opens as a full-viewport overlay with a dark scrim behind it. Main content dims beneath. |
| 2.6 | Tap/click anywhere on the dimmed area outside the sidebar. | Sidebar closes; scrim disappears. |
| 2.7 | Open the sidebar again on mobile. Press Escape on keyboard (if available) or tap the × button. | Sidebar closes. |
| 2.8 | Resize back to desktop (≥780px) with sidebar currently pinned from before. | Sidebar is docked again. Main content reflows. |

Pass criteria: all mode transitions work; no clipping on desktop; no leftover scrim on mobile dismissal; Chart.js instances render correctly at each new width.

---

## Check 3 — Noise-reduction pass (US3)

| Step | Expected |
|------|----------|
| 3.1 | Scan the KPI row at the top. | All four values (Net Worth, FIRE Number, Progress, Years) render in the same neutral white-ish color. No green, yellow, or teal on the primary numbers. Trend / sublabel underneath may have color (e.g., ↑ green delta). |
| 3.2 | Scan card titles throughout the page. | Most titles are mixed-case ("Full Portfolio Lifecycle", "Years to FIRE by Retirement Location") in a quiet weight/color. NO "LIFECYCLE" all-caps tracked treatment on regular card titles. |
| 3.3 | Locate section dividers (expect 4 per dashboard). | Each divider is a thin top-border + small all-caps tracked label (e.g., "PROFILE & PLAN", "OUTLOOK", "COMPARE", "TRACK"). This is the ONLY place uppercase+tracking is used. |
| 3.4 | Hover over a chart card (e.g., Full Portfolio Lifecycle, Net Worth Pie). | No border-color animation. Cursor is default (not pointer). |
| 3.5 | Hover over a country scenario card. | Border color animates to accent. Cursor is pointer. |
| 3.6 | Locate the FIRE Progress bar. | It appears as a thin rail (4px tall) directly under the KPI row, with tick labels ($0, $500K, $1M, Target) above the rail. NOT a large dedicated card. |
| 3.7 | Locate the country filter pills. | Prefixed with "Filter:" label in dim type. Pills are smaller than the old tab-style buttons. Active pill has a subtle underline (no solid filled background). |
| 3.8 | Scan chart card titles for emoji. | No emoji on lifecycle, withdrawal strategy, Roth ladder, SS, pies, country chart, timeline, healthcare comparison chart. |
| 3.9 | Scan controls / concept cards for emoji. | Emoji retained on: Profile & Income 👤, Mortgage 🏠, Second Home 🏖️, College Plan 🎓, Healthcare 🛡️, visa input lines 🛂, Country scenarios 🌐, Snapshot History 📸, FIRE status pill 🔥, Footer tip 💡. |
| 3.10 | Locate the language toggle. | Inside the header (top-right area of the control group). Not floating as an absolutely-positioned element. |
| 3.11 | Scroll to the bottom. Look at the Footer tip block. | Left-edge accent on the tip is a subtle neutral (--border) color, not the loud purple (--accent). |
| 3.12 | Count visible filled card surfaces at the top of the page (zoom in with DevTools if needed). | Roughly half of the cards are filled; the other half are border-only. Chart cards are border-only. |
| 3.13 | Inspect any card that previously had an inner sub-panel border (mortgage ownership buttons, healthcare comparison table wrapper). | No redundant inner border — the outer card handles framing. |

Pass criteria: all above behaviors verified on both dashboards.

---

## Check 4 — Non-regression (FR-041)

| Step | Expected |
|------|----------|
| 4.1 | Edit `roger401kRoth` (or `person1_401kRoth` in Generic) to a new value. Reload. | Value persists. |
| 4.2 | Edit `contrib401kRoth` slider. Reload. | Persists. |
| 4.3 | Edit `taxTrad` slider. Reload. | Persists. |
| 4.4 | Click between different country scenario cards (US, Thailand, Japan, …). | Each card's FIRE number stays stable regardless of which country is currently "selected" as primary. No drift. |
| 4.5 | Scroll to the bottom. | Exactly ONE merged footer panel visible (not two separate disclaimers). Footer left column shows "Last updated · Uses real (inflation-adjusted) returns" and tip; right column shows the legal disclaimer. |
| 4.6 | Switch language via toggle. | All user-visible strings translate (including new keys: Filter, section dividers, sidebar labels, compact-header chip labels). |
| 4.7 | Run the existing browser smoke test: `node tests/baseline/browser-smoke.test.js` (or equivalent). | Passes, with any new assertions for sticky header + sidebar added in this feature also passing. |
| 4.8 | Run the unit test suite: `node --test tests/unit/`. | Passes (no calc changes should cause regressions). |

Pass criteria: all above hold; dark theme visually unchanged in its color palette.

---

## Check 5 — Performance sanity (SC-003, constitution floor)

| Step | Expected |
|------|----------|
| 5.1 | DevTools → Performance tab. Record a scroll from the top of the page to the bottom and back. | Frame rate holds at 60fps on a mid-range laptop. No dropped frames clustered around the 80px threshold crossings. |
| 5.2 | While the sidebar is pinned, drag the FIRE-age marker on the primary lifecycle chart. | Drag sustains ≥30 fps (constitution floor). Both the primary chart and the sidebar chart update smoothly. No jitter in the sidebar caption values. |
| 5.3 | Drag the `savings` slider continuously for 5 seconds. | No console errors. No visible lag in any chart. |

Pass criteria: no visible jank, no dropped frames during normal interaction.

---

## Rollback plan

If any check fails and the issue cannot be fixed quickly, revert with:

```
git checkout main
git branch -D 006-ui-noise-reset-lifecycle-dock  # after abandoning
```

Alternatively, revert the feature's commits individually and reopen as follow-up tasks. The feature makes NO changes to calc modules, localStorage schema (beyond an additive key), CSV format, or i18n key deletions — so rollback is safe.
