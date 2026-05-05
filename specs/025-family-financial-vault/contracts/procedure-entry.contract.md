# Contract: ProcedureEntry

**Feature**: 025
**Module**: inline `VAULT_PROCEDURES` JS object in `FIRE-Family-Vault-RR.html`
**Consumers**: `renderProcedurePanel(account)`; `renderInheritedAccountCalculator(account)` (for retirement categories only); `tests/vault/procedure-lookup.test.js`

## Inputs

`category: AccountCategory` (one of 13 enum values defined in [data-model.md](../data-model.md#accountcategory-enum)).

## Outputs

`ProcedureEntry | undefined` — undefined if category not present; the consumer falls back to the `other` entry.

## Required fields per language block

Every entry MUST have BOTH `en` and `zh-TW` blocks. Each block MUST contain:

- `whoToContact` (string, required, non-empty) — narrative paragraph naming who the surviving spouse should contact and how.
- `expectedTimeline` (string, required, non-empty) — e.g., "2–6 weeks per bank" or "30–60 days".
- `paperworkChecklist` (string[], required, length ≥ 1) — bulleted list items (no leading bullets — UI adds them).
- `taxStrategyNotes` (string, required, non-empty) — markdown-light. Lists tax pitfalls and the bracket-fill strategy reference where applicable.
- `commonMistakes` (string[], required, length ≥ 1) — bullet list of failure modes the surviving spouse should avoid.

For `employer-401k-roth`, `employer-401k-trad`, `traditional-ira`, `roth-ira`, the entry MAY ADDITIONALLY include:

- `hrContactName` (string | null) — name of HR contact at the institution. v1 placeholder = `null`; user provides at user gate phase 14.
- `hrContactPhone` (string | null) — phone.
- `hrContactEmail` (string | null) — email.

## Disclaimer banner (rendered, not in JSON)

The procedure panel renderer ALWAYS prepends a disclaimer banner, in the active locale, NOT stored per-entry:

- EN: "This procedure is general information, not legal or tax advice. Consult a licensed estate attorney and CPA before acting."
- zh-TW: "此流程說明僅為一般性參考，並非法律或稅務建議。執行前請諮詢執照律師及會計師。"

## Bilingual completeness invariant

`tests/vault/bilingual-completeness.test.js` enforces:

- For every category in `VAULT_PROCEDURES`, both `en` and `zh-TW` blocks exist.
- Within each block, all 5 required fields are non-empty / length ≥ 1.
- Field count and structure parity: `en.paperworkChecklist.length === zh-TW.paperworkChecklist.length` and `en.commonMistakes.length === zh-TW.commonMistakes.length`. (Bilingual entries should be 1:1 translations, not summaries.)

## Anti-patterns

- ❌ Putting jurisdiction-specific dollar thresholds inline in the procedure (e.g., "Taiwan inheritance tax exemption is NT$1,200,000"). Thresholds change. Reference the source instead.
- ❌ Recommending specific lawyers or financial advisors by name.
- ❌ Hardcoding tax brackets in `taxStrategyNotes` (use the live calculator instead).
- ❌ Embedding URLs that may change (institution login URLs go on the Account record, not in the procedure).

## Example (skeleton, EN block only)

```js
"foreign-bank-taiwan": {
  category: "foreign-bank-taiwan",
  en: {
    whoToContact: "Visit the inheritance desk at each Taiwan bank where Roger had accounts. Bring the documents listed below. Most major Taiwan banks have English-speaking staff for inheritance cases. If you don't speak Mandarin, consider hiring a Taiwan-licensed lawyer (typically NT$30,000–NT$60,000 flat fee).",
    expectedTimeline: "2–6 weeks per bank.",
    paperworkChecklist: [
      "Apostilled US death certificate (or TECRO authentication if not Hague-Convention)",
      "Certified Mandarin translation of the death certificate",
      "Roger's Taiwan National ID or Passport scan (whichever the bank holds on file)",
      "Your (Rebecca's) ROC ID or Passport",
      "Marriage certificate (apostilled + translated)",
      "Bank's inheritance application form (request from each bank's website or branch)"
    ],
    taxStrategyNotes: "Taiwan inheritance tax exemption is generous for Class A heirs (spouse + children). Roger's combined Taiwan accounts (~$28K USD per his 2025 FBAR) are well below typical thresholds, so no Taiwan tax due. **No US tax** on the inheritance itself either (US has no inheritance tax at this estate size). However, the FOREIGN ACCOUNTS continue triggering FBAR + Form 8938 for you under your sole ownership. Continue filing both annually.",
    commonMistakes: [
      "Trying to repatriate before inheritance procedure completes — banks freeze the account immediately on death notification.",
      "Forgetting to update FBAR / Form 8938 with the new account ownership in your filing.",
      "Closing accounts to repatriate ALL funds — Taiwan capital is harder to redeploy from the US than to keep onshore for future visits."
    ],
    hrContactName: null,
    hrContactPhone: null,
    hrContactEmail: null
  },
  "zh-TW": { /* parallel structure in Mandarin */ }
}
```
