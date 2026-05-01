# Contract — `calc/accumulateToFire.js` v3

**Module**: `calc/accumulateToFire.js`
**Predecessor**: v2 (feature 020) — see `specs/020-validation-audit/contracts/accumulate-to-fire-v2.contract.md`
**Constitution**: Principles I, II, IV, V, VIII

## Function signature

```
accumulateToFire(inp, fireAge, options) → AccumulationResult

AccumulationResult = {
  end: { p401k, pStocks, pCash, pRoth },
  perYearRows: PerYearAccumulationRow[],
}
```

Function signature unchanged from v2. The only changes are inside `perYearRows` element shape (additive — existing v2 fields preserved).

## Per-year row v3 shape

v2 fields (preserved verbatim):
```
{
  age, year, total, p401k, pStocks, pCash, pRoth,
  grossIncome, federalTax, annualSpending, pretax401kEmployee,
  empMatchToTrad, stockContribution, cashFlowToCash, cashFlowWarning?,
}
```

NEW v3 fields:
```
{
  ficaTax,              // integer dollars; FICA total (SS + Medicare + additional Medicare)
  federalTaxBreakdown,  // see data-model.md TaxComputationResult.federalTaxBreakdown
  ficaBreakdown,        // see data-model.md TaxComputationResult.ficaBreakdown
}
```

## Tax computation algorithm

Inside the per-year loop, replace the v2 line:

```js
// v2:
const federalTax = Math.max(0, (grossIncome - pretax401kEmployee) * inp.taxRate);
```

with:

```js
// v3:
const taxResult = _computeYearTax(grossIncome, pretax401kEmployee, inp);
const federalTax = taxResult.federalTax;
const ficaTax = taxResult.ficaTax;
const federalTaxBreakdown = taxResult.federalTaxBreakdown;
const ficaBreakdown = taxResult.ficaBreakdown;
```

Where `_computeYearTax` is a new helper inside `accumulateToFire.js`:

```js
function _computeYearTax(grossIncome, pretax401kEmployee, inp) {
  // Override path: flat-rate taxRate has priority for backwards-compat
  if (Number.isFinite(inp.taxRate) && inp.taxRate > 0) {
    return {
      federalTax: Math.max(0, (grossIncome - pretax401kEmployee) * inp.taxRate),
      ficaTax: 0,
      federalTaxBreakdown: {},  // empty — not computed in flat-rate mode
      ficaBreakdown: {},
      computedFromBrackets: false,
    };
  }

  // Auto path: progressive brackets + FICA
  const filingStatus = (inp.adultCount === 1) ? 'single' : 'mfj';
  const brackets = (filingStatus === 'mfj') ? BRACKETS_MFJ_2024 : BRACKETS_SINGLE_2024;
  const stdDed = brackets.standardDeduction;
  const taxableIncome = Math.max(0, grossIncome - pretax401kEmployee - stdDed);

  // Walk brackets; accumulate per-bracket dollars
  const breakdown = { bracket10:0, bracket12:0, bracket22:0, bracket24:0, bracket32:0, bracket35:0, bracket37:0,
                       standardDeduction: stdDed, taxableIncome };
  let federalTax = 0;
  let prevBound = 0;
  for (const b of brackets.brackets) {
    if (taxableIncome <= prevBound) break;
    const inThisBracket = Math.min(taxableIncome, b.upperBound) - prevBound;
    if (inThisBracket > 0) {
      const taxFromThisBracket = inThisBracket * b.rate;
      const key = 'bracket' + Math.round(b.rate * 100);
      breakdown[key] = Math.round(taxFromThisBracket);
      federalTax += taxFromThisBracket;
    }
    prevBound = b.upperBound;
  }

  // FICA: split income equally between earners for MFJ; SS cap applies per individual
  const earnerCount = (filingStatus === 'mfj') ? 2 : 1;
  const incomePerEarner = grossIncome / earnerCount;
  const ssTaxablePerEarner = Math.min(incomePerEarner, FICA_SS_WAGE_BASE_2024);
  const ssTax = ssTaxablePerEarner * FICA_SS_RATE * earnerCount;
  const ssWageBaseHit = (incomePerEarner > FICA_SS_WAGE_BASE_2024);

  const medicareTax = grossIncome * FICA_MEDICARE_RATE;

  const additionalMedicareThreshold = (filingStatus === 'mfj')
    ? FICA_ADDITIONAL_MEDICARE_THRESHOLD_MFJ
    : FICA_ADDITIONAL_MEDICARE_THRESHOLD_SINGLE;
  const additionalMedicare = Math.max(0, grossIncome - additionalMedicareThreshold) * FICA_ADDITIONAL_MEDICARE_RATE;

  const ficaTax = ssTax + medicareTax + additionalMedicare;
  const ficaBreakdown = {
    socialSecurity: Math.round(ssTax),
    medicare: Math.round(medicareTax),
    additionalMedicare: Math.round(additionalMedicare),
    ssWageBaseHit,
  };

  return {
    federalTax: Math.round(federalTax),
    ficaTax: Math.round(ficaTax),
    federalTaxBreakdown: breakdown,
    ficaBreakdown,
    computedFromBrackets: true,
  };
}
```

## Backwards compatibility (v2 → v3)

When `inp.taxRate > 0`, v3 produces byte-identical `federalTax` to v2 (flat-rate path unchanged). The new fields `ficaTax`, `federalTaxBreakdown`, `ficaBreakdown` are added to the per-year row but old consumers ignoring them see no change.

When `inp.taxRate` is blank/0/undefined, v3 switches to progressive brackets + FICA. Tests with pinned `federalTax` values that previously assumed `taxRate=0.22` flat must update — annotate with `// 021:` comment per the convention from feature 020.

## Conservation invariants (locked by new tests)

For every row where `computedFromBrackets === true`:

1. `Σ(federalTaxBreakdown.bracket*) === federalTax` within ±$1.
2. `ficaBreakdown.socialSecurity + ficaBreakdown.medicare + ficaBreakdown.additionalMedicare === ficaTax` within ±$1.
3. `taxableIncome = max(0, grossIncome - pretax401kEmployee - standardDeduction)`.

## Module imports

`calc/accumulateToFire.js` v3 imports `BRACKETS_MFJ_2024`, `BRACKETS_SINGLE_2024`, `FICA_SS_RATE`, `FICA_SS_WAGE_BASE_2024`, `FICA_MEDICARE_RATE`, `FICA_ADDITIONAL_MEDICARE_RATE`, `FICA_ADDITIONAL_MEDICARE_THRESHOLD_SINGLE`, `FICA_ADDITIONAL_MEDICARE_THRESHOLD_MFJ` from `calc/taxBrackets.js` (new module per `taxBrackets-2024.contract.md`).

Pattern: at top of `accumulateToFire.js`:

```js
const _taxBrackets = (typeof require !== 'undefined') ? require('./taxBrackets.js')
                                                     : globalThis.taxBrackets;
const BRACKETS_MFJ_2024    = _taxBrackets.BRACKETS_MFJ_2024;
const BRACKETS_SINGLE_2024 = _taxBrackets.BRACKETS_SINGLE_2024;
// ... (FICA constants)
```

This works in both Node test runs (uses `require`) and the browser (uses `globalThis.taxBrackets` populated by the UMD wrapper in `taxBrackets.js`).

## Audit observability

Per Constitution Principle II §4 (audit-observability), each accumulation year's tax computation MUST surface its sub-operations in the audit flow diagram. The new `subSteps` for the cash-flow stage gain:

- "tax base = grossIncome ($X) − pretax401k ($Y)" *(unchanged from v2)*
- "filing status: <mfj|single>" *(NEW)*
- "standard deduction: $<stdDed>" *(NEW)*
- "taxable income: $<taxableIncome>" *(NEW)*
- "federal tax via brackets: 10%×$A + 12%×$B + ... = $<federalTax>" *(NEW)*
- "FICA: SS $<ss> + Medicare $<medicare> + add'l Medicare $<addMed> = $<ficaTax>" *(NEW)*
- "total income tax: $<federalTax + ficaTax>" *(NEW)*

When `computedFromBrackets === false`, only the v2 sub-step "federal tax = ($X − $Y) × <rate> = $<federalTax>" surfaces, plus a note "FICA: 0 (flat-rate override active)".
