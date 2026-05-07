# Data Model — 026

Three entity shapes touched by feature 026. None introduce new persistent storage; all are in-memory shapes already produced or consumed by the existing calc layer.

---

## 1. FireAgeResult

**Owner:** `calc/fireAgeResolver.js` (existing — feature 020 US4c).
**Consumed by:** `_lastKpiSnapshot.fireAgeResult` capture in both HTML files; verdict-pill render block (`FIRE-Dashboard.html:12946–12968` / parallel in Generic); audit dump's `fireAgeResolution` block.

### Shape

```ts
{
  years:        number;     // integer FIRE age (NOT duration), e.g. 53
  months:       number;     // integer 0..11 — months past `years`
  totalMonths:  number;     // years * 12 + months (or -1 if infeasible)
  feasible:     boolean;
  searchMethod: 'integer-year' | 'month-precision' | 'none';
}
```

### Validation rules (US1 anchor)

- `searchMethod === 'integer-year'` ⇒ `months === 0`. If a consumer reads such a result, the consumer MUST display the year-only copy (`dyn.fireInYears`) — not append a months suffix.
- `searchMethod === 'month-precision'` ⇒ `months ∈ {1, 2, ..., 11}`. (Month 0 of any year is the integer-year boundary, which is reported as `'integer-year'`.)
- `searchMethod === 'none'` ⇒ `feasible === false`. Consumer falls back to the long-timeline copy.
- `totalMonths === years * 12 + months` is an invariant the resolver MUST preserve and the consumer MAY assume.

### Lifecycle

- Computed once per full recalc inside the dashboard's main render path.
- Stashed on the module-level snapshot variable `_lastKpiSnapshot.fireAgeResult` so the verdict pill and KPI cards read it without re-running the search.
- US1 task list MUST audit any partial-render path that fires the verdict pill without a fresh `_lastKpiSnapshot.fireAgeResult` (Hypothesis D in research.md Section 1).

---

## 2. WithdrawalTrajectory (per-year row)

**Owner:** `calc/simulateLifecycle.js` + `calc/withdrawal.js` (existing).
**Consumed by:** Withdrawal Strategy chart (Chart.js bar+line composite); Strategy Ranking audit; **and feature 026 research.md Section 2 (the SC-026-A counterfactual study).**

### Shape (subset relevant to 026)

```ts
{
  age:                       number;
  traditional401kDraw:       number;   // pre-tax, REAL $
  traditional401kBracketFill: number;  // top-of-bracket headroom utilized this year
  rothDraw:                  number;
  taxableLTCGDraw:           number;
  cashDraw:                  number;
  ssIncome:                  number;
  federalTax:                number;
  ficaTax:                   number;
  effectiveTaxRate:          number;   // federalTax / ordinaryIncome
  bookValueRemaining:        number;   // end-of-year, NOMINAL $ via displayConverter
  hasShortfall:              boolean;
  // Constraint flags (already present today; restated here for 026 visibility)
  irmaaBreached:             boolean;
  acaPtcBreached?:           boolean;  // optional — pre-65 healthcare cliff
  amtTriggered?:             boolean;
}
```

### Validation rules (US2 anchor — feature 026 research only; no behavior change in 026)

- The SC-026-A counterfactual MUST produce a `WithdrawalTrajectory[]` with the same shape (no new columns added in 026).
- `hasShortfall === true` for any year in the counterfactual ⇒ counterfactual is **infeasible** (Constitution VIII). Discarded; not recommended.
- `irmaaBreached === true` in the counterfactual is permitted but MUST be flagged in the research report's constraint-breach audit (FR-007).

---

## 3. HeaderLayoutBounds

**Owner:** CSS in both HTML files (US3 fix scope).
**Consumed by:** the user (visual). Verified programmatically via Playwright + DOM `getBoundingClientRect`.

### Shape (DOM contract)

The header consists of, in left-to-right order at canonical 100% zoom on a 1920×1080 viewport:

```text
#siteHeader (row container)
├── .brand-block        // title "ROGER & REBECCA FIRE COMMAND CENTER" + sublabels
├── .verdict-pill       // "FIRE in X years Y months" status
├── .lang-toggle        // EN / 中文
├── .theme-toggle       // sun / moon icon
└── .chart-mode-toggle  // line/area icon
```

(Exact class names taken from current dashboard source; Phase 2 task will confirm with grep before editing.)

### Validation rules (US3 anchor — SC-006 / SC-007 / SC-008)

- At 100% zoom on 1920×1080, `#siteHeader.getBoundingClientRect().height ≤ 200`.
- At 100% / 125% / 150% zoom, no header child element's bounding rect intersects another header child's by > 2px (overlap check).
- At 75% zoom, no header child element renders smaller than 10px effective font size.
- Existing 100%-zoom layout pixel-snapshot is unchanged within a 2-pixel tolerance after the fix.
- Both EN and zh-TW must satisfy all of the above with the longest title string in either language.

### Lifecycle

- Computed at every layout pass (page load + resize + zoom change).
- Sticky-Chrome Discipline (Constitution Additional Constraints): the header publishes `--header-height` via ResizeObserver; the gate-selector below the header consumes it for its `top` offset. The 026 fix MUST preserve this contract — i.e., after the CSS change, `--header-height` continues to publish a sane value at every zoom level.
