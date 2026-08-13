# Quickstart: Year-by-Year Lifecycle Spreadsheet Export

**Feature**: 037-lifecycle-excel-export
**Date**: 2026-08-13

How to exercise and verify this feature by hand. Automated coverage is specified in
[contracts/lifecycle-export.contract.md](./contracts/lifecycle-export.contract.md) §C-4.

---

## Prerequisites

- A dashboard open with a rendered Lifecycle chart (Retirement → Lifecycle) and KPI cards showing
  real numbers — not "Calculating…".
- A network connection **on first export** (ExcelJS lazy-loads from cdnjs on first click; see
  research.md R1). Subsequent exports in the same page session need none.
- Excel, or any spreadsheet program that opens `.xlsx`.

---

## The 60-second happy path (US1)

1. Open `FIRE-Dashboard.html`; wait for the Lifecycle chart to render.
2. Go to **History → Snapshots**.
3. Click **📊 Export Projection (Excel)** — the new button, beside the existing 📤 Export CSV.
4. A file named `FIRE-Lifecycle-Projection-YYYY-MM-DD.xlsx` downloads.
5. Open it. Expect: **no repair prompt, no import wizard** (SC-011).

**Check immediately**:

- Sheet 1 `Projection`: row 1 headers, row 2 = the **current year**, last row = the plan's final year.
- One row per year, ascending, no gaps (SC-003).
- Scroll down — the header row stays visible. Scroll right — Year and Age stay visible (SC-014).
- Sheet 2 `Settings`: FIRE mode, active withdrawal strategy, retirement transition year, timestamp.

---

## Verify it matches the chart (US1 / SC-002 — the credibility check)

1. On the Lifecycle chart, hover a year in the middle of the plan; note the total.
2. Find that year in the workbook; compare the **money** total column.
3. They must match. **If they differ, the export is wrong** — the chart is the authority (FR-019).

Repeat at three points: an accumulation year, the retirement transition year, and a late-plan year.

---

## Verify both frames (US2)

1. In the **current year** row, compare a measure's money and purchasing-power columns — **equal**
   (no inflation has elapsed).
2. In a late year, the **money** figure must be the **larger** (INV-3).
3. Read the two headers cold: it must be obvious which is a statement dollar and which is today's
   spending power, with no explanation (SC-005).

---

## Verify it follows the on-screen plan (US3 — the drift check)

1. Export once. Note the FIRE transition year.
2. Change the **FIRE mode** (Safe → Exact → DWZ). Let the chart re-render.
3. Export again. The two files must differ, consistently with the chart's change (SC-004).
4. Repeat for the **withdrawal strategy** — pick a non-default winner and confirm the export follows
   it rather than falling back to bracket-fill.
5. Turn **"I've retired"** on with a retirement year. Export. Employment income and contributions
   must stop at that year, matching the chart (FR-021).
6. Each file's Settings sheet must record the settings in force for **that** export.

---

## Verify transitions and shortfalls (US4)

1. Scan the **Plan phase** column: it must change exactly at the retirement transition, the
   penalty-free-access age, and the SS claim age.
2. Force a shortfall (raise spending hard, or retire far too early). Re-render, export.
3. The **Shortfall this year** column must flag exactly the years the chart tints, and the earliest
   flagged year must equal the year named in the on-screen verdict (SC-007).
4. A depleted year must be identifiable — not a clean `0` implying solvency (INV-8).

---

## Verify blanks read correctly (INV-7 — easy to get wrong)

| Look at | Expect | Not |
|---|---|---|
| Accumulation year, withdrawal columns | **blank** | `0` |
| Retirement year, employment-income columns | **blank** | `0` |
| Retirement year, contribution columns | `0` | blank |
| A pool held at zero all plan | `0` throughout, column present | column dropped |

A blank must never read as "measured zero", and a zero must never read as "not applicable".

---

## Failure paths (SC-010 — must be verified, not assumed)

| Force this | Expect |
|---|---|
| Click export before the chart has rendered | Plain-language message, **no file** |
| Block cdnjs (DevTools request blocking) then click | "Export library unavailable" message, **no file** — never a 0-byte or corrupt download |
| Any failure above | No partial file; no zeros substituted for real values (FR-025) |

---

## Purity check (FR-022 / INV-6)

1. Note the KPI values and a couple of inputs.
2. Export.
3. Confirm **nothing** changed: inputs identical, KPIs identical, chart not re-rendered, no new
   snapshot recorded, `localStorage` untouched.

---

## Lockstep + bilingual (SC-009 / Principle VII)

1. Repeat the happy path on `FIRE-Dashboard-Generic.html`. Same structure, same column count.
2. Switch to zh-TW. The button, progress state, and error messages must all be translated — and the
   workbook's column headers too (research.md R8).

---

## Merge gate

Automatable — run before merge:

```
npm run test:unit
npx playwright test                              # FULL suite, not just this feature's spec
node tools/console-probe.mjs <abs path to each HTML file>   # errorCount 0 on both
node tools/smoke-032.mjs
```

Human-only — genuinely visual, cannot be automated:

- Workbook opens cleanly in **real Excel** (not just a parser) with no repair prompt.
- The 68-column sheet is actually navigable with the frozen panes as configured.
- Column headers read sensibly in both languages at their set widths.

Per the project's Process Lessons, "browser smoke skipped" is not an acceptable merge note — and
features 035 and 036 both merged with their human gate unsigned. Do not make it three.
