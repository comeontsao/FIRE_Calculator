# Quickstart: Country Budget Scaling — Manual Verification

**Feature**: 010-country-budget-scaling
**Audience**: QA Engineer (Manager-triggered browser smoke gate per `CLAUDE.md` Process Lessons).
**Environment**: Any evergreen browser + local file-serve (`python -m http.server 8000` from repo root or direct `file://`).

---

## Setup

1. Check out branch `010-country-budget-scaling`.
2. From repo root: `python -m http.server 8000` (or open `FIRE-Dashboard-Generic.html` directly).
3. Browse to `http://localhost:8000/FIRE-Dashboard-Generic.html` (or the direct file URL).
4. Open DevTools console. Leave the Network tab open too to confirm no errors.

**Baseline state**: fresh browser profile (no prior localStorage). Expected defaults: Adults=2, Children=2 (two default kids), language=EN.

---

## Smoke path 1 — Adults=2 regression (ZERO visual change)

**Goal**: confirm FR-002 / SC-003. Every existing Adults=2 user (with any child count) sees NO country-card number movement on first post-010 load.

1. On fresh state, locate the country comparison grid.
2. Record US card annual budget: should read `$78,000/yr`. Record Taiwan: `$36,000/yr`. Record Japan: `$42,000/yr`. Thailand: `$24,000/yr`.
3. Scaling indicator (new, below or above the country grid) MUST show:
   - Line 1: `Country budget: 2 adults → 1.00× couple baseline`
   - Line 2: `+ per-child allowance during pre-college years (2 children tracked)` (assuming the two default kids)
4. Console: zero red errors, zero `[<shim-name>] canonical threw:` messages.

**Pass**: all country numbers match pre-010 values byte-for-byte. Line 1 reads exactly `1.00×`.

---

## Smoke path 2 — Solo planner sees 0.67× country budgets

**Goal**: confirm User Story 1 / SC-001 / SC-002.

1. Remove both default kids: click `− Remove Child` twice. Confirm `childCountDisplay` reads `0`.
2. Click the Adults counter `−` button to go from 2 → 1.
3. Country grid updates immediately:
   - US: `$78,000/yr` → `$52,000/yr` (exactly `78000 × 0.667`).
   - Taiwan: `$36,000/yr` → `$24,000/yr`.
   - Japan: `$42,000/yr` → `$28,000/yr`.
4. Scaling indicator:
   - Line 1: `Country budget: 1 adult → 0.67× couple baseline`
   - Line 2: HIDDEN (no children tracked).
5. FIRE target number in the header banner DROPS by ~33%.
6. Two-Phase FIRE number in the deep-dive panel drops proportionally.
7. Lifestyle toggle (Lean/Normal/Comfortable): every tier shows the 0.67× factor preserved; tier ratios unchanged.
8. Console: zero errors.

**Pass**: all three tiers show 0.67× baseline values. Indicator Line 2 is hidden.

---

## Smoke path 3 — Single parent gets adults-only country card + allowance in Lifecycle

**Goal**: confirm User Story 2 / SC-004.

1. At Adults=1 (from smoke path 2), click `+ Add Child` once. Pick the default birthdate (will be ~age 5 at today's year). Leave `us-private` college plan.
2. Country grid: US still shows `$52,000/yr` (UNCHANGED — kids don't move the factor).
3. Scaling indicator Line 2 re-appears: `+ per-child allowance during pre-college years (1 children tracked)`.

   *(Minor English note: "1 children" — if the team wants grammatical plural, add a `geo.scale.childTracked` singular variant in a follow-up. Non-blocking for this feature.)*

4. Open the Full Portfolio Lifecycle chart. Post-FIRE spend curve in the early years shows the country budget + \$2,000/yr (child age 0–12).
5. Fast-forward visually (hover the chart at a year when the child would be 13): the curve bumps UP by \$500 at age 13, again at 14, then by \$1,000 at 15, 16, 17. At the college-start year, the per-child allowance drops to \$0 and tuition takes over.

**Pass**: country card doesn't change when adding a child; Lifecycle chart's post-FIRE curve shows the ramp-up and the college-transition drop.

---

## Smoke path 4 — Per-country Adjust Annual Spend override

**Goal**: confirm User Story 4 / FR-015a–d / SC-010.

1. Remove the child added in smoke path 3 (back to Adults=1, 0 kids).
2. Click the US country card to open its deep-dive panel (`scenarioInsight` below).
3. Locate the new `💰 Adjust Annual Spend:` input (should be right below `Annual Visa Cost:`). Confirm it's empty / shows `0` placeholder.
4. Type `100000`. Blur.
5. Country grid US card updates: `$100,000/yr` (NOT `$100,000 × 0.67 = $67,000`; override wins).
6. Scaling indicator Line 1 still reads `1 adult → 0.67× couple baseline` (factor itself hasn't changed — only the US override is active).
7. Taiwan card still reads `$24,000/yr` (0.67× scaled; unaffected by US override).
8. Toggle Adults 1 → 2: US stays at `$100,000/yr`. Taiwan goes back to `$36,000/yr`.
9. Toggle Adults 2 → 1: US stays at `$100,000/yr`. Taiwan goes to `$24,000/yr`.
10. Clear the US input (type 0 or empty, blur): US reverts to `$52,000/yr` (0.67× scaled at Adults=1).

**Pass**: override survives Adults toggling; clearing restores auto-scaling.

**Persistence check**: Reload the page mid-override (step 5 state). Override value persists; country card reads `$100,000/yr` on reload.

---

## Smoke path 5 — Strategy-vs-requirement independence

**Goal**: confirm FR-015e–g / SC-009.

1. Clear any override from smoke path 4. Set Adults=1, 2 kids (ages ~5 and ~8 via default birthdates).
2. Locate the withdrawal strategy selector (DWZ / SAFE / bracket-fill / low-tax / etc.) — typically in the Strategy Compare card or main scenario chooser.
3. Record the Lifecycle chart's post-FIRE year-by-year spend curve shape (scroll hover values: age 50, 55, 60, 65, 70). This is the REQUIREMENT curve.
4. Switch strategy from DWZ to SAFE. The DRAWDOWN curve (portfolio balance over time) changes — strategy funds the requirement differently.
5. Re-hover the same ages. The spend REQUIREMENT curve MUST show the same values at each age (same allowance bumps at ages 13, 15; same college transitions).
6. Cycle through all available strategies. Requirement curve unchanged at every step.

**Pass**: spend requirement is strategy-independent; drawdown curve changes per strategy.

---

## Smoke path 6 — Language toggle

**Goal**: confirm Principle VII / SC-007.

1. Click the language toggle (EN ↔ 繁體中文).
2. Scaling indicator Line 1 and Line 2 flip to Traditional Chinese.
3. Scaling indicator help tooltip (hover): Traditional Chinese.
4. Open the US deep-dive panel: `💰 調整年度花費：` visible, note text `（覆蓋此國家的生活方式預設）` visible.
5. No English leaks anywhere in the new feature-010 UI.

**Pass**: every feature-010 string flips. No mixed-language stragglers.

---

## Smoke path 7 — Snapshot CSV (no schema change)

**Goal**: confirm FR-019.

1. At any household composition, save a snapshot via the existing snapshot button.
2. Open `FIRE-snapshots-generic.csv`. Confirm column headers are unchanged from pre-010 (20 columns including `Adults` at position 20, `Locked` at position 21).
3. Confirm the new row's `Monthly Spend` and `FIRE Target` reflect what the dashboard currently shows (scaled + allowance + any override, if applicable).

**Pass**: no new columns; numeric values are internally consistent with the displayed dashboard state.

---

## Regression gate (MANAGER must run before merge)

Per `CLAUDE.md` Process Lessons §"Browser smoke before claiming a feature done":

- [ ] Both smoke paths 1 and 2 executed in a real browser with DevTools open.
- [ ] Console: zero red errors across all 7 smoke paths.
- [ ] No KPI shows `NaN`, `Calculating…`, `—`, `$0`, or `40+` unexpectedly.
- [ ] FIRE marker drag on the Lifecycle chart still produces same-frame updates (feature-009 behaviour preserved).
- [ ] `FIRE-Dashboard.html` (RR) UNCHANGED — open it, confirm it behaves exactly as before feature 010 (no new Adults scaling, no new indicator, no state-shape changes).

If any check fails, BLOCK the merge and route the failure to the appropriate Engineer per `CLAUDE.md` File Ownership.
