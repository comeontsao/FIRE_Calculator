# Contract: `calc/socialSecurity.js`

**Role**: Social Security projection. Two modes: generic curve (based on current
earnings only) and actual-earnings-history mode (used by RR's personal adapter).

## Inputs
```js
projectSS({
  currentAge: number,
  ssStartAge: number,               // 62 / 67 / 70
  earnings: SSEarnings | null,      // null ⇒ generic mode
  inflationRate: number
}) => SSProjection
```

## Outputs
```js
{
  ssAgeStart: number,
  annualBenefitReal: number,
  indexedEarnings?: number          // (actual-earnings mode only) the 35-year-indexed avg
}
```

## Consumers
- `lifecycle.js` — adds `ssIncomeReal` to retirement years starting at `ssAgeStart`.
- `ssChart` renderer — shows with-vs-without-SS portfolio curves.

## Invariants
- In generic mode, produces a curve that matches current SSA claiming-age adjustments
  (62 → reduction, 70 → delayed-retirement credit).
- In actual-earnings mode, computes 35-year-indexed earnings per SSA's formula and applies
  the 2026 bend points (code documents the version; when bend points update, update
  the fixture).
- `annualBenefitReal` is a real-dollar number (no nominal bleeding in).

## Purity
No DOM, no Chart.js, no globals.

## Fixtures
- Generic single-earner at age 45, claiming at 67. Locks benefit.
- Actual-earnings mode with a 35-year pre-computed earnings fixture (synthetic). Locks
  indexed earnings and resulting benefit.
- Early/late claiming — claim at 62 and at 70 produce expected percentage changes
  relative to FRA benefit.
