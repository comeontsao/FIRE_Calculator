# Contract: `calc/healthcare.js`

**Role**: Age- and scenario-sensitive healthcare cost projection.

## Inputs
```js
getHealthcareCost({
  age: number,
  scenario: Scenario,            // country + ACA/Medicare assumptions
  householdSize: number,
  overrides?: { prefireReal?, postfireTo65Real?, post65Real? }
}) => HealthcareCost
```

## Outputs
```js
{
  annualCostReal: number,        // for this specific age
  phase: 'prefire' | 'aca' | 'medicare'
}
```

## Consumers
- `lifecycle.js` — subtracts from withdrawable income each year.
- Scenario card — shows blended delta between two scenarios.
- Country-comparison chart (`countryChart`).

## Invariants
- Always returns real dollars (audit flagged nominal leakage — this contract forbids it).
- `annualCostReal > 0` for all ages.
- Scenario-specific curves document their sources inline in the module file.

## Purity
No DOM, no Chart.js, no globals.

## Fixtures
- US scenario, age 50 pre-fire → expected real dollar cost.
- US scenario, age 60 post-fire ACA → different cost.
- US scenario, age 70 Medicare → yet different cost.
- Country overrides applied — per-scenario fixtures lock the curve.
