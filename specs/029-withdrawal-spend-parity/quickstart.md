# Quickstart: Feature 029 Verification

**Feature**: 029-withdrawal-spend-parity
**Audience**: User-side verification at merge gate (T-final manual browser smoke)

## Repro fixture (RR — Roger & Rebecca)

Inputs (default RR dashboard after page load, no edits required):

- Roger age: 42, Rebecca age: 42
- Kid1 age: 9, Kid2 age: 3
- College kid1: `us-public-oos`, College kid2: `us-public-oos`
- Strategies enabled (default): all 8 registered
- Active mode: **Exact**
- Active objective: **Leave more behind** (Preserve)
- Geography scenario: **Taiwan** (default)
- Mortgage: no
- Second Home: no (or as default)
- Investment annual return: 7% (stocks), 7% (401k), 4% inflation
- Annual spend: as default (RR scenario ≈ $73.4K/yr real)

Expected winner under defaults: **aggressive-bracket-fill** (feature 027).

## Pre-fix observations (current main branch — BUG state)

1. Open `FIRE-Dashboard.html` (RR).
2. Switch to **Retirement → Withdrawal Strategy** tab.
3. Hover the bar at age 57 (kid2's first college year).
4. Tooltip shows:
   - Taxable stocks (LTCG): **$132.2K** (Book Value)
   - ≈ **$73.4K** (purchasing power)
5. Switch to **Retirement → Lifecycle** tab. Hover age 57 → Total Portfolio = $2,621,964. Hover age 58 → Total Portfolio = $2,607,416 (DROP of $14.5K).
6. Open **Audit** tab → look for `crossValidationWarnings` → see entry of `kind: endBalance-mismatch` with valueA ≈ $271K and valueB ≈ $324K.

This is the bug: the chart bar says $132K is drawn but the portfolio drops as though $184K were drawn (because base spend + kid2 tuition is being withdrawn). The audit warning is the second symptom.

## Post-fix expected behavior (this feature)

After feature 029 lands, repeat steps 1–6:

1. Withdrawal Strategy chart bar at age 57 should sum to **~$184K nominal** total (purchasing power ~$102K). Stacked bar may show Taxable stocks (LTCG) ~$184K + small Trad contributions if strategy mixes, totaling the overlay-inclusive amount.
2. Lifecycle chart unchanged — Total Portfolio still drops from $2,621K → $2,607K (the drop was always correct; only the BAR display was wrong).
3. Audit `crossValidationWarnings`:
   - Either **empty array** (preferred), OR
   - Contains a `simulator-grossSpend-parity` entry with `diff < $1` (parity passes silently in correct operation; if visible, indicates floating-point noise needs tolerance review).
4. No `endBalance-mismatch` warning under default-strategy + active-strategy windowing — but under `expected: true` clamp-noise scenarios, the suppression rule keeps the user's audit panel clean.

## Smoke checklist (T-final manual browser gate)

Per CLAUDE.md "Browser smoke before claiming a feature done":

- [ ] Open `FIRE-Dashboard.html` in real browser (Chrome / Edge).
- [ ] Wait 2 seconds cold load. All KPI cards numeric (no `Calculating…`).
- [ ] DevTools console: zero red errors, zero `[<shim-name>] canonical threw:` messages.
- [ ] Retirement → Withdrawal Strategy → hover age 57 → bar sum ~$184K nominal.
- [ ] Repeat for age 58, 59, 60 (kid2 college years). All bars overlay-inclusive.
- [ ] Hover age 65 (no overlay year — only base spend + small pre-65 healthcare delta if any). Bar sum ≈ base + hc delta only. No regression at non-overlay ages.
- [ ] Cycle Mode: Safe / Exact / DWZ. Each produces a Withdrawal Strategy chart with overlay-inclusive bars (no Mode-specific regression).
- [ ] Cycle Objective: Preserve / Minimize Tax. Same.
- [ ] Audit tab → `crossValidationWarnings` contains zero `endBalance-mismatch` entries on default settings.
- [ ] Switch language EN ↔ 中文. Tooltip values match across locales (numbers in same currency frame; labels translate).
- [ ] Repeat all of the above for `FIRE-Dashboard-Generic.html` (Generic).
- [ ] Strategy ranker table — winner may change vs pre-fix (acceptable). Confirm displayed winner's `endBalance` in the ranker table matches the Lifecycle chart's age-100 Total Portfolio when that strategy is selected for display.

## Negative cases (must NOT regress)

- Open a scenario with **no kids in college and post-65 age range** (e.g., manually set `ageKid1`, `ageKid2` to age 30+ so they're already done with college). Hover Withdrawal Strategy chart at any age. Bar height must equal base spend + healthcare delta only — must NOT inflate vs current correct behavior.
- Disable Second Home (default). h2Carry = 0. No change to bars vs pre-fix at any age.
- Set strategy winner to `bracket-fill-smoothed` (the default — feature 027's `aggressive` is only the winner under specific conditions). Bars use `computeWithdrawalStrategy`'s formula (already correct pre-fix). No visible change.

## What this proves

- Bug A closed: chart bars truthfully represent annual portfolio outflow.
- Bug B addressed: audit panel no longer shows misleading `endBalance-mismatch` warning when both simulators agree on feasibility verdict.
- Future regressions caught: `simulator-grossSpend-parity` invariant fires immediately on any new simulator drift.
- Lockstep preserved: RR and Generic produce identical bar values for identical inputs.
- i18n unaffected: number changes only; no new strings.
