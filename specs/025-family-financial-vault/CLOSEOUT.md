# Feature 025 — Family Financial Vault (RR-only) — CLOSEOUT

**Feature**: 025-family-financial-vault
**Status**: Implementation complete; **awaiting user browser smoke + UPPAbaby HR contact info** for final merge
**Date**: 2026-05-04
**Predecessor**: Feature 024 (deferred-fixes-cleanup), merged 2026-05-04

## Summary

Brand-new RR-only single-file HTML app — `FIRE-Family-Vault-RR.html` — that doubles as a living monthly financial check-in **and** a death-procedure playbook for Rebecca. Bilingual EN + zh-TW from v1. Claude Opus 4.7 chatbox (off by default, opt-in with API key). Zero outbound network calls in chatbox-disabled mode.

The file is a complete companion to FIRE-Dashboard.html — beside it, not depending on it (independent localStorage namespace, no shared code, no lockstep rule).

## What Shipped

| Story | Priority | Status | Surface area |
|-------|----------|--------|--------------|
| US1 — Account inventory CRUD | P1 | ✅ | Add / edit / delete; filter chips (Owner / Country); bilingual labels |
| US2 — Death-procedure playbook | P1 | ✅ | 13 categories × EN + zh-TW; "Procedure" button on every account row; print button |
| US3 — Inherited-account withdrawal calculator | P1 | ✅ | 3-strategy comparison (lump / even-tenths / bracket-fill); IRMAA + ACA + AMT cliff badges; year-by-year drilldown; Roth-aware |
| US9 — Privacy architecture | P1 | ✅ | Static grep test enforces no external scripts/links/CDN; allow-list for inline URL references |
| US7 — Critical Family Info | P2 | ✅ | 8 subsections (will, POAs, healthcare directive, guardianship, life insurance[], password vault, funeral, contacts[]); inline auto-save |
| US4 — Recurring tax obligations calendar | P2 | ✅ | 10 obligations pre-populated; per-year done flags; overdue + 30-day banners; deep links to FBAR / IRS portals |
| US6 — Monthly snapshot history | P2 | ✅ | Refresh-balances flow; per-account `history[]`; CSV export; total / delta / stale-account summary |
| US5 — Claude API chatbox | P2 | ✅ | Sidebar UI; locked-context system prompt embedding the vault JSON; refusal patterns; model dropdown (Opus 4.7 default); show-system-prompt debug |
| US8 — Import from RR FIRE Dashboard | P3 | ✅ | Settings → "Inspect FIRE Dashboard localStorage" reads `fire_dashboard_state` and surfaces bucket totals for manual allocation |

## Tests

- **Vault tests added (`tests/vault/*.test.js`)**: 54 across 4 files
- **Project test count**: 503 + 54 = **557 total, 556 pass + 1 intentional skip, 0 failures**
- Test coverage focuses on pure modules: schema validation, privacy invariants (static grep), procedure-lookup completeness, withdrawal calculator math + cliff detection. UI behavior verified via the preview panel during development.

## Locked Decisions Honored

All seven user decisions (2026-05-04) implemented:

1. **Bilingual EN + zh-TW** from v1 → every string + procedure block has both
2. **Default model `claude-opus-4-7`** → set in `emptyVault()`; downgrade dropdown for cost-conscious sessions
3. **Encryption default OFF** → settings toggle present, cipher implementation deferred to v1.1
4. **No nag UI** → US6 shows passive "Last updated: N days ago" caption only
5. **Same repo** → file committed beside FIRE-Dashboard.html
6. **UPPAbaby HR contact baked in** → placeholders in employer-401k-* procedure entries (Roger fills before merge)
7. **All cliff warnings on Roth** → IRMAA + ACA + AMT detection runs on MAGI regardless of `isRoth`

## Documentation

- `spec.md` — locked decisions, 9 user stories, edge cases, FRs, key entities, success criteria
- `plan.md` — 12 phases, technical context, constitution check (all green / N-A), risks
- `tasks.md` — 93 tasks T001–T093 (sequential build, not multi-wave parallel)
- `research.md` — R1–R10 source-of-truth references for every dollar number
- `data-model.md` — Vault root schema, Account, ProcedureEntry, CriticalFamilyInfo, MonthlySnapshot
- `contracts/procedure-entry.contract.md` — JSON shape, required fields, bilingual completeness invariant
- `contracts/chatbox-locked-context.contract.md` — system prompt template, refusal patterns, citation rules
- `contracts/encryption.contract.md` — AES-GCM-256 + PBKDF2-SHA-256 (300k iter) parameters
- `contracts/withdrawal-calc.contract.md` — calculator interface, fixture data, expected output shape
- `quickstart.md` — manual browser-smoke checklist for SC-001..SC-012
- `audit-report.md` — verification status of all 12 success criteria + privacy invariants + decisions

## What's Pending Before Final Merge

### User-side blockers

1. **Browser smoke per `quickstart.md`** — open `FIRE-Family-Vault-RR.html` in Chrome / Firefox, walk all 8 SC sections. Confirm zero red errors in DevTools console + 0 requests in Network tab (chatbox disabled).
2. **UPPAbaby HR contact info** — name / phone / email of HR contact to bake into `VAULT_PROCEDURES.employer-401k-roth.en.hrContactName`, `.hrContactPhone`, `.hrContactEmail`, and the parallel zh-TW + employer-401k-trad entries.

### Optional v1.1 follow-ups

- **Encryption cipher** — toggle is present (default OFF), but AES-GCM-256 + PBKDF2 round-trip not yet implemented. Spec FR-043 documents the algorithm. Adding it is ~50 LOC + ~5 unit tests.
- **`tests/chatbox-refusal.md`** — author the 20-question manual refusal test set on first key-paste.
- **Account sparkline** — 12-month inline SVG mini-chart per account in the snapshots tab. Currently the `history[]` array persists numerically.
- **Tax-bracket year refresh** — currently 2024 brackets (matches project convention via `calc/taxBrackets.js`). 2026 numbers are a 1-line update once IRS publishes Rev. Proc. for the year.

## How to Resume

If the user wants to keep iterating on this feature:

1. To bake in HR contact info, edit `VAULT_PROCEDURES['employer-401k-roth'].en.hrContactName` (and 5 other parallel fields) in `FIRE-Family-Vault-RR.html`.
2. To run the test suite: `node --test tests/vault/*.test.js`.
3. To preview live: open `FIRE-Family-Vault-RR.html` in any browser via `file://` or a local static server.
4. To extend with v1.1 features, branch from `main` once 025 merges and follow the same speckit pattern (spec → plan → tasks → research → contracts → tests).
