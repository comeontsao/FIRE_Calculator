# Implementation Plan: Family Financial Vault (RR-only)

**Branch**: `025-family-financial-vault` (currently working on `claude/trusting-fermi-d9e653` since it's up-to-date with origin/main; will rename or PR with the proper branch name at merge time) | **Date**: 2026-05-04 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/025-family-financial-vault/spec.md`

## Summary

Build a brand-new RR-only single-file HTML app — `FIRE-Family-Vault-RR.html` — that doubles as a living monthly financial check-in AND a death-procedure playbook for Rebecca. Bilingual EN + zh-TW from v1. Bundles a static procedure knowledge base (rule-based, NOT LLM-generated) and an inherited-401(k) tax-strategy calculator that reuses the FIRE calculator's bracket-fill withdrawal strategy. Optional Claude API chatbox with locked-context system prompt. Local-only (zero network calls except the explicit Claude POST when chatbox is used).

This feature is **structurally different** from features 016–024:

- **No edits to existing dashboards.** This is a new file. The two-HTMLs-in-lockstep rule from CLAUDE.md does NOT apply.
- **No calc-engine math changes.** We reuse `calc/withdrawal-strategies.js` for US3, and that's the only calc dependency.
- **The tax-procedure JSON is the load-bearing artifact.** Most of the user value lives in `vault-procedures.json` content, not code.
- **Privacy is a tested invariant**, not a vibe — Phase 9 has automated checks for "0 outbound network calls when chatbox disabled".

## Technical Context

**Language/Version**: JavaScript ES2020+ (browser-runnable via classic `<script>`); Node 20 for unit-test runner. Modern browsers required for `crypto.subtle.encrypt` (AES-GCM) and `crypto.subtle.deriveKey` (PBKDF2).
**Primary Dependencies**: None at runtime. No CDN. No Chart.js (vault uses inline SVG mini-charts for balance history). Constitution Principle V — zero-dep delivery preserved.
**External APIs**: Anthropic Messages API (https://api.anthropic.com/v1/messages) — only when user types in chatbox. Default model `claude-opus-4-7`; fallback dropdown to `claude-sonnet-4-6` and `claude-haiku-4-5-20251001`. Prompt caching enabled on the system block.
**Storage**: Browser `localStorage` under namespace `vault.rr.v1`. Optional AES-GCM-256 encryption (PBKDF2-SHA-256 300k iterations) — default OFF.
**Testing**: `node --test` for pure modules (schema validation, withdrawal calc, encryption, procedure lookup). Manual browser smoke for DOM + network-invariant verification.
**Target Platform**: Modern browsers (Chrome / Firefox / Safari / Edge). `file://` delivery preserved per Principle V — Roger and Rebecca double-click the file on their laptop.
**Project Type**: Single-file dashboard (no build pipeline); RR-only — Generic dashboard NOT touched.
**Performance Goals**: Page load < 200ms cold (no network). Procedure panel render < 200ms. Chatbox first-token latency dominated by Anthropic API; no local bottleneck.
**Constraints**: Bilingual EN + zh-TW for ALL strings. Zero outbound network calls in chatbox-disabled mode. No `<script src=>` to external origins. No third-party fonts, analytics, or telemetry.
**Scale/Scope**: 1 new HTML file (estimated ~4000-6000 lines including procedures + i18n + inline CSS). 9 user stories. Estimated ~5-7 hours of implementation across all stories.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance | Evidence |
|---|---|---|
| **I. Dual-Dashboard Lockstep** | ✅ N/A | Spec is RR-only by design (decision recorded in spec.md scope note). The lockstep rule applies to FIRE-Dashboard.html ↔ FIRE-Dashboard-Generic.html, neither of which is touched here. |
| **II. Pure Calc Modules with Declared Contracts** | ✅ | US3 reuses existing `calc/withdrawal-strategies.js` (bracket-fill strategy). New pure helpers (encryption, schema validation, procedure lookup) live as inline `<script>` modules with FRAME-style contract headers (Inputs / Outputs / Consumers). |
| **III. Single Source of Truth for Interactive State** | ✅ | One root state object under `localStorage.vault.rr.v1`; locale toggle in `vault.rr.v1.locale`. No duplicate state stores. |
| **IV. Gold-Standard Regression Coverage** | ✅ | New unit tests in `tests/vault/`: schema validation, withdrawal calc parity with FIRE dashboard, encryption round-trip, procedure-category lookup, bilingual catalog completeness. SC-005 (zero network calls) is verified by a manual DevTools sweep + a static grep test (`tests/vault/no-external-resources.test.js`). |
| **V. Zero-Build, Zero-Dependency Delivery** | ✅ | Single self-contained HTML. Inline CSS, inline JS, inline SVG. No build step. `file://` delivery works. |
| **VI. Explicit Chart ↔ Module Contracts** | ✅ N/A | No Chart.js charts. Mini-balance-history graphics are inline SVG, computed from per-account `history[]` arrays. |
| **VII. Bilingual First-Class — EN + zh-TW** | ✅ | FR-061 — FR-065 enforce EN + zh-TW for ALL UI strings AND procedure JSON entries. Translation Catalog gets a new `vault.*` keyspace. |
| **VIII. Spending Funded First** | ✅ N/A | No retirement-strategy logic added. US3 uses the existing bracket-fill strategy as a black box. |
| **IX. Mode and Objective are Orthogonal** | ✅ N/A | No FIRE-mode or objective logic added. |

**No constitution violations.** Complexity Tracking section is empty.

## Project Structure

### Documentation (this feature)

```text
specs/025-family-financial-vault/
├── plan.md                              # This file
├── research.md                          # Phase 0 — R1-R6 (inherited 401k tax law, FBAR-deceased, locale catalog approach, encryption choice, model cost calc, withdrawal-strategy import path)
├── data-model.md                        # Phase 1 — Vault schema (Account, ProcedureEntry, CriticalFamilyInfo, Obligation, Vault root)
├── quickstart.md                        # Phase 1 — Manual browser smoke checklist
├── contracts/
│   ├── procedure-entry.contract.md      # NEW — JSON schema for vault-procedures.json entries
│   ├── chatbox-locked-context.contract.md   # NEW — system prompt design + refusal patterns
│   ├── encryption.contract.md           # NEW — AES-GCM + PBKDF2 parameters and round-trip guarantees
│   └── withdrawal-calc.contract.md      # NEW — interface to calc/withdrawal-strategies.js
└── tasks.md                             # Phase 2 output
```

### Source Code (repository root)

```text
FIRE-Family-Vault-RR.html               # NEW — the main artifact
                                        #   ~5000 lines including:
                                        #     - inline CSS (matches FIRE-Dashboard dark theme)
                                        #     - inline TRANSLATIONS.en + TRANSLATIONS.zh
                                        #     - inline VAULT_PROCEDURES (the static knowledge base)
                                        #     - inline schema/encryption/calc helpers (FRAME-headed)
                                        #     - inline DOM rendering + state management

calc/
└── (unchanged — withdrawal-strategies.js is imported as a pure dependency)

tests/
└── vault/                               # NEW directory
    ├── schema.test.js                   # FR-001..FR-007 schema validation
    ├── withdrawal-calc.test.js          # FR-021..FR-025 calc parity
    ├── encryption.test.js               # FR-043 AES-GCM round-trip
    ├── procedure-lookup.test.js         # FR-011..FR-015 category → procedure mapping
    ├── bilingual-completeness.test.js   # FR-061..FR-065 every UI key + procedure key has both EN and zh-TW
    └── no-external-resources.test.js    # FR-041 static grep for <script src="http"> etc.

FIRE-Dashboard Translation Catalog.md   # MODIFIED — append `vault.*` keyspace (~80 new keys, EN + zh-TW)
BACKLOG.md                              # MODIFIED — add Feature 025 "Done in" section after merge
CLAUDE.md                               # MODIFIED — flip SPECKIT block to 025 active (after 024 closeout)
```

**Structure Decision**: Single new HTML file in repo root, beside the two existing dashboards. Tests live in a new `tests/vault/` subdirectory so they don't dilute the existing FIRE calculator test suite. The Translation Catalog is appended (not forked) so EN ↔ zh-TW key audit covers vault keys too.

## Phase Plan

| Phase | Scope | Notes |
|---|---|---|
| **0** | Research | Pin inherited-401(k) tax brackets for 2026 single (Rebecca's likely filing status post-year-of-death); historical IRMAA + ACA cliff thresholds for 2026; cite-able withdrawal-spread strategy refs; choose translation-catalog file format (inline JS object vs separate JSON); confirm prompt-caching pricing for Opus 4.7 (5-min TTL) so the per-query cost label is accurate. |
| **1** | Design contracts + data model | Write data-model.md (Vault schema). Write 4 contract docs. Write quickstart.md (manual smoke checklist). |
| **2** | **US1 + US9 (P1 foundation)** | Scaffold the HTML file with dark-theme CSS, locale toggle, account inventory CRUD, schema validation, localStorage persistence. Privacy invariant: zero network calls. Inline static procedure JSON placeholder (filled in Phase 3). Translation Catalog gets the first ~20 keys. |
| **3** | **US2 (P1 procedure playbook)** | Author all 9 procedure entries (employer-401k-roth, employer-401k-trad, traditional-ira/roth-ira, us-brokerage-tod, us-brokerage-jtwros, us-bank-joint, foreign-bank-taiwan, foreign-bank-china, taiwan-life-insurance, reit-ark7) in EN + zh-TW. Render procedure panel per account. UPPAbaby HR contact = TBD placeholder. |
| **4** | **US3 (P1 inherited-account calculator)** | Wire the bracket-fill strategy from `calc/withdrawal-strategies.js` to the in-vault calculator. Render the 3-strategy comparison table. Add IRMAA / ACA / AMT cliff warnings (FR-024). |
| **5** | **US7 (P2 critical family info)** | Section UI: will, POA, healthcare directive, guardianship, life insurance, password vault, funeral, contacts. Collapsible by default; pre-expanded if "If something has happened" CTA clicked. |
| **6** | **US4 (P2 recurring obligations calendar)** | Pre-populate obligations from `2025_Tax_Filing_Guide_FATCA_FBAR.md`. Calendar widget showing next 12 months. Mark-done per year. Overdue / 30-day-warning visual states. |
| **7** | **US6 (P2 monthly snapshot history)** | Update-balances flow; history[] append per account; mini-SVG sparkline on each account; CSV export matching FIRE-snapshots.csv schema. **No nag UI** per locked decision 4. |
| **8** | **US5 (P2 chatbox with locked context)** | Settings UI for API key. Anthropic Messages API call with locked system prompt embedding the vault JSON. Refusal-pattern static fallbacks. Show-system-prompt debug toggle. Per-query cost label. Disable-chatbox toggle. |
| **9** | **US8 (P3 import from RR FIRE)** | Read `localStorage` of FIRE-Dashboard.html (cross-origin OK because both are file://); offer 4-bucket reconciliation form. |
| **10** | Bilingual + privacy + tests sweep | Run `tests/vault/bilingual-completeness.test.js`. Run `tests/vault/no-external-resources.test.js`. Manual DevTools network sweep. Print-to-PDF sample. Encryption round-trip manual test. |
| **11** | Closeout — audit-report.md + CLOSEOUT.md + BACKLOG.md update + CLAUDE.md SPECKIT flip | Final commit. |
| **12** | **USER GATE** — UPPAbaby HR contact info + browser smoke + (optional) merge to main | User provides HR name/phone/email; agent bakes them into vault-procedures.json; user opens the file in a real browser, walks the smoke checklist; user merges. |

**Sequential strategy** for this feature, NOT multi-wave parallel: each phase depends on the previous (US1 schema must exist before US2 procedures can render against it; US2 procedures must exist before US3 calculator can attach to retirement-account procedure panels; US5 chatbox needs the JSON shape stable from earlier phases). Multi-wave parallel was right for 024 (independent backlog items) but wrong here (a coherent app being built top-down).

## Risks + Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Procedure JSON has factual errors** (e.g., wrong inheritance procedure for Bank of China) | Medium | High — Rebecca acts on wrong info | Every procedure entry includes the disclaimer banner + a "consult a licensed estate attorney / CPA" referral. Phase 0 research cites primary sources (IRS Pub 590-B, FinCEN FBAR FAQ, etc.). Phase 11 closeout includes a "user reviews each procedure entry before merge" gate. |
| **Chatbox hallucinates an account or balance** | Medium | High — Rebecca trusts a wrong number | System prompt enforces "cite an account ID or procedure category for every factual claim". Refusal-pattern static fallbacks reject unverifiable outputs. Manual 20-question test set in `tests/chatbox-refusal.md`. |
| **localStorage data loss** (browser cache wipe, OS reinstall, laptop theft) | Medium | Catastrophic | "Export encrypted backup" button (FR-045). "Print full vault to PDF" button (FR-046). Manual user practice: print after every monthly update. |
| **Tax brackets / IRMAA thresholds drift year over year** | High over multi-year horizon | Medium — calculator gives stale guidance | Year-stamped constants in code (`const TAX_BRACKETS_2026 = ...`). Out of scope for v1 to auto-update; v1.1 is an annual refresh. The disclaimer reminds the user. |
| **Roger forgets to populate UPPAbaby HR contact** | Low (locked as user-deliverable in plan) | Low — placeholder remains, Rebecca has to look up | Phase 12 user gate explicitly requires the HR contact info before merge. Alternatively the placeholder can ship and be filled in a follow-up commit. |
| **Encryption forgotten passphrase** | Low (encryption default OFF anyway) | Catastrophic if enabled and forgotten | Rate-limited retry (1s → 10s → 60s, never permanent lock). Recommend storing passphrase in the family password vault (which is itself listed in CriticalFamilyInfo). |

## Complexity Tracking

*GATE: empty unless Constitution check failed.*

(Empty.)
