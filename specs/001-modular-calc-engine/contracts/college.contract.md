# Contract: `calc/college.js`

**Role**: Merge per-child college cost windows into a year-indexed cost curve.

## Inputs
```js
computeCollegeCosts({
  kids: [{ name: string, currentAge: number, fourYearCostReal: number, startAge?: number }],
  currentYear: number
}) => CollegeSchedule
```

## Outputs
```js
{
  perYear: [{ year, age, costReal, kidNames: [...] }]   // only years with nonzero cost
}
```

## Consumers
- `lifecycle.js` — subtracts `costReal` from withdrawable income in the relevant years.
- `timelineChart` renderer — displays per-kid college windows.

## Invariants
- Default `startAge = 18` if not provided.
- Four-year window: college cost applies to years `[startAge, startAge+3]` inclusive.
- Overlapping windows (two kids simultaneously) sum correctly in `costReal`.
- Empty `kids` array → empty `perYear`.

## Purity
No DOM, no Chart.js, no globals.

## Fixtures
- Two kids 5 years apart (like Janet/Ian) — expected non-overlapping windows.
- Two kids 2 years apart — expected overlap in two years with doubled cost.
- No kids — empty schedule.
