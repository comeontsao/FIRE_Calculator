# Research: Family Financial Vault — Phase 0

**Feature**: 025-family-financial-vault
**Date**: 2026-05-04

This doc pins down the dollar constants and external references that the vault depends on. Every dollar figure, threshold, and procedure step in `vault-procedures.json` and the inherited-account calculator must trace back to one of these sources.

---

## R1 — 2026 federal Single tax brackets

**Decision**: Reuse the existing project frozen `BRACKETS_SINGLE_2024` from [`calc/taxBrackets.js`](../../calc/taxBrackets.js) as the calculator basis, matching project convention (the FIRE dashboard treats these as today's-$ today's-rules reference per spec 022). When IRS publishes 2026 numbers via Rev. Proc. 2025-XX (typically late 2025), update `taxBrackets.js` with `BRACKETS_SINGLE_2026` and the vault picks them up automatically.

**2024 Single brackets (current source-of-truth in project)**:

| Bracket | Rate | Upper bound (taxable income) |
|---------|------|------------------------------|
| 1 | 10% | $11,600 |
| 2 | 12% | $47,150 |
| 3 | 22% | $100,525 |
| 4 | 24% | $191,950 |
| 5 | 32% | $243,725 |
| 6 | 35% | $609,350 |
| 7 | 37% | ∞ |

Standard deduction (Single 2024): **$14,600**.

**Rationale**: For Rebecca post-year-of-death, filing status drops from MFJ to Single in year T+1 (or Qualifying Surviving Spouse for two more years if dependent kids — see R7). The calculator should show Single by default with a toggle to MFJ for the year-of-death itself.

**Source**: IRS Rev. Proc. 2023-34 (cited at top of `calc/taxBrackets.js`).

---

## R2 — 2026 IRMAA single-filer threshold

**Decision**: Use **$103,000** MAGI (2024 Part B IRMAA Tier 1 threshold for single filers) as the trigger for the IRMAA cliff warning. This is what spec.md FR-024 references.

**Behavior**: The cliff warning fires when a year's projected MAGI (Rebecca's other income + that year's withdrawal) crosses the $103,000 line. Crossing means Rebecca's Medicare Part B + Part D premiums increase the following year.

**Note**: IRMAA is determined by MAGI from 2 tax years prior (so 2026 IRMAA uses 2024 MAGI). The calculator's warning is forward-looking — "if you withdraw this much, your IRMAA in two years will be Tier X".

**Source**: SSA POMS HI 01101.020; CMS published thresholds annually.

---

## R3 — 2026 ACA premium tax credit cliff

**Decision**: Use **400% FPL** as the cliff trigger. For 2026, FPL is published annually by HHS in January. As of this spec writing the most recently published is 2024 FPL ($21,150 for household of 2; $32,150 for household of 4). 400% FPL ≈ $84,600 (HoH 2) or $128,600 (HoH 4).

**Note**: The IRA-2022 / ARPA extension may have eliminated the cliff entirely (the 8.5% cap is in effect through 2025). For 2026 onward, Congress action determines whether the cliff returns. Calculator surfaces the warning conservatively: "If the ACA expanded subsidies expire after 2025, crossing 400% FPL eliminates ALL premium tax credits in one go — potentially $5K-$15K/yr." User can dismiss if they're confident the expansion continues.

**Source**: IRS Pub 974; KFF.org annual ACA brief.

---

## R4 — Inherited 401(k) / IRA stretch rules (SECURE Act 2.0)

**Decision**: Surviving spouse beneficiary has more flexibility than non-spouse beneficiaries:

- **Spousal rollover into own IRA** (most common): treats the inherited account as the spouse's own. Rebecca can defer until her own RMD age (73 currently, possibly 75 in 2033). Withdraw any amount any time after age 59½ without 10% penalty.
- **Inherited IRA** (less common for spouses): subject to the 10-year rule for non-eligible designated beneficiaries; for spouses, no 10-year rule applies — annual RMDs based on Rebecca's life expectancy or Roger's, whichever is more favorable.

**Strategy guidance for the calculator**:

- **Roth-401(k) / Roth IRA**: roll into Rebecca's own Roth IRA. Qualified distributions are tax-free if 5-year rule is met. **MAGI still matters** for IRMAA + ACA cliff warnings (FR-024, locked decision 7).
- **Traditional 401(k) / Traditional IRA**: roll into Rebecca's own Traditional IRA OR convert in slices to Roth. Bracket-fill strategy: each year, withdraw enough to top up Rebecca's other income to the 22% bracket boundary ($100,525 Single 2024), then stop. Defers the rest. If Rebecca lives 30+ more years, the 22%-cap strategy minimizes lifetime tax dramatically.

**Source**: IRS Pub 590-B; SECURE Act 2.0 (Pub. L. 117-328).

---

## R5 — FBAR for deceased filer

**Decision**: For the year of Roger's death, his executor (Rebecca, presumably) files a **final FBAR** for Roger covering his accounts up to date of death. After year of death, accounts in Roger's sole name transfer to Rebecca, joint accounts simplify, and Rebecca continues filing her own FBAR for her foreign accounts (which already exceed $10,000 aggregate).

**Procedure**:
1. File Roger's final FBAR (FinCEN Form 114) by April 15 of year following death.
2. Foreign banks transfer or close Roger's accounts per their inheritance procedures (R8).
3. Rebecca's annual FBAR continues (or starts if she didn't file solo before — she always filed her own per the 2025 Tax Execution Plan).

**Source**: FinCEN FBAR FAQ #34 (filer is deceased); 2025_Tax_Filing_Guide_FATCA_FBAR.md.

---

## R6 — Anthropic Messages API: Opus 4.7 with prompt caching

**Decision**: Default model `claude-opus-4-7`. Use `cache_control: {type: 'ephemeral'}` on the system block (which contains the embedded vault JSON). 5-minute cache TTL.

**Cost basis** (rates as of 2026-Q2):

| Model | Input ($/M tokens) | Cache write ($/M) | Cache read ($/M) | Output ($/M tokens) |
|-------|-------------------|-------------------|------------------|---------------------|
| `claude-opus-4-7` | $15.00 | $18.75 | $1.50 | $75.00 |
| `claude-sonnet-4-6` | $3.00 | $3.75 | $0.30 | $15.00 |
| `claude-haiku-4-5-20251001` | $1.00 | $1.25 | $0.10 | $5.00 |

(Verify current rates against https://docs.claude.com/en/docs/about-claude/pricing — these are subject to change.)

**Per-query cost calc** (vault JSON ≈ 5KB ≈ ~1.5K tokens; user question + reply ≈ 0.5K tokens):

- First query (cache miss): system 1.5K × $18.75/M (cache write) + question 0.5K × $15/M (input) + reply 1K × $75/M (output) ≈ $0.085
- Subsequent queries within 5 min (cache hit): 1.5K × $1.50/M (cache read) + 0.5K × $15/M + 1K × $75/M ≈ $0.083

So roughly **$0.08–$0.09 per question on Opus 4.7**. Sonnet ≈ $0.017. Haiku ≈ $0.006. The chatbox UI shows this label per model.

**Source**: docs.claude.com/en/docs/about-claude/pricing; Anthropic prompt caching docs.

---

## R7 — Qualifying Surviving Spouse (QSS) filing status

**Decision**: For the **two tax years following the year of Roger's death**, if Rebecca has a dependent child living with her, she may file as Qualifying Surviving Spouse — same brackets and standard deduction as Married Filing Jointly. After two years, she files as Single (or Head of Household if she still has a dependent child).

**Calculator implication**: The withdrawal calculator's "filing status" toggle should default to **Single** (worst-case) but offer **MFJ / QSS** for years 1-3 post-death.

**Source**: IRS Pub 501; IRC §2(a).

---

## R8 — FIRE-Dashboard.html localStorage key namespace (for US8 import)

**Confirmed via grep**:

- `STATE_KEY = 'fire_dashboard_state'` — main app state (`localStorage.fire_dashboard_state`)
- `SNAPSHOT_KEY = 'fire_dashboard_snapshots'` — append-only history
- `'fire_lang'` — language toggle
- `'fire_withdrawalObjective'` — current objective (Preserve / Minimize Tax / etc.)
- `'fire:dragHintSeen'` — UI hint flag

The vault import (US8 / T077) reads `fire_dashboard_state` and looks for the bucket aggregates (`stocks`, `cash`, `roth401k`, `ira`, `homeEquity` — verify exact field names at implementation time).

---

## R9 — Foreign-bank inheritance procedures by jurisdiction

**Decision**: Procedure entries cite local procedural references rather than reproduce them in detail.

- **Taiwan banks**: Apostilled US death certificate (or via TECRO authentication for non-Hague-Convention path), certified Chinese translation, Roger's National ID or Passport scan, account holder verification at each bank's inheritance desk. Timeline: 2-6 weeks per bank. Most Taiwanese banks have English-speaking staff for inheritance cases. Reference: Bank-specific "Account Inheritance" pages on each bank's website.
- **China banks (Bank of China, China Construction Bank)**: Capital controls require either (a) repatriation under FX quota ($50K USD/year per individual), or (b) waiting until Rebecca obtains right of inheritance documentation acceptable to PBOC. Timeline: 6 months — 2 years. Strong recommendation: retain a China-licensed lawyer if more than nominal balances ($10K+) are at stake. Reference: PBOC inheritance guidance, 2024.
- **Nan Shan Life Insurance**: standard claim procedure — beneficiary submits death certificate + policy + ID + bank account info. Timeline: 30-60 days.

**Source**: Each bank's published procedure; Roger's prior 2024 FBAR filings as evidence of current account structure.

---

## R10 — Translation catalog format

**Decision**: Inline `TRANSLATIONS.en` and `TRANSLATIONS.zh` JS objects in the HTML — matches existing FIRE-Dashboard.html convention. Append the new keys to `FIRE-Dashboard Translation Catalog.md` at the end of this feature so the catalog stays a single source-of-truth.

**Key naming**: `vault.<section>.<element>` — e.g., `vault.inventory.addAccount`, `vault.procedure.disclaimer`, `vault.calculator.lumpSum`.

---

## Open research items (none blocking implementation)

- ACA premium tax credit cliff status for 2026+ depends on Congress; user should re-verify before relying on the cliff warning.
- IRMAA brackets for 2026 may shift slightly; CMS publishes annually in October-November of prior year.
- Anthropic API pricing may shift; cost label is informational, not a contract.

These are noted in the spec's Risks table and don't block v1 shipping.
