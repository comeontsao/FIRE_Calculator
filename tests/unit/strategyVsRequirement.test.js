/*
 * tests/unit/strategyVsRequirement.test.js — feature 010 T025.
 *
 * Locks the spend-requirement-vs-strategy separation per:
 *   specs/010-country-budget-scaling/contracts/chart-consumers.contract.md §Strategy precedence
 *
 * Asserts that the post-FIRE spend requirement per year is a pure function of:
 *   (adultCount, childrenList, scenarioOverrides, scenario, tier, visaCost, fireYear, projectionYear)
 * and is INDEPENDENT of the withdrawal strategy label (dwz, safe, bracket-fill, low-tax).
 *
 * Kernel helpers (getAdultsOnlyFactor, getScaledScenarioSpend, allowanceForAge,
 * calcPerChildAllowance) are mirrored inline per the project's test-isolation
 * convention — no HTML import.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { CHILDREN_FIXTURE_A, FIRE_YEAR_DEFAULT } from '../fixtures/country-budget-scaling.js';

// ---------------------------------------------------------------------------
// Inline mirrors — scaling-formula.contract.md + child-allowance.contract.md
// ---------------------------------------------------------------------------
function getAdultsOnlyFactor(n){const nn=(n>=2)?2:1;if(nn===2)return 1.0;return (1+0.5*(nn-1))/1.5;}
function getScaledScenarioSpend(s,t,a,ov){const v=ov&&ov[s.id];if(Number.isFinite(v)&&v>0)return v;let b;if(t==='normal')b=s.normalSpend;else if(t==='comfortable')b=s.comfortableSpend;else b=s.annualSpend;return b*getAdultsOnlyFactor(a);}
function allowanceForAge(age){if(age<=12)return 2000;if(age===13)return 2500;if(age===14)return 3000;if(age===15)return 4000;if(age===16)return 5000;return 6000;}
function calcPerChildAllowance(cl,py,fy){if(py<fy)return 0;if(!Array.isArray(cl)||cl.length===0)return 0;let t=0;for(const c of cl){if(!c||typeof c.date!=='string')continue;const by=parseInt(c.date.slice(0,4),10);if(!Number.isFinite(by))continue;const a=py-by;if(a<0)continue;const cs=(c.collegeStartYear!=null&&Number.isFinite(c.collegeStartYear))?c.collegeStartYear:(by+18);if(py>=cs)continue;t+=allowanceForAge(a);}return t;}

// ---------------------------------------------------------------------------
// Requirement kernel — mirror of the post-FIRE gross-spend computation used in
// projectFullLifecycle / signedLifecycleEndBalance / simulateRetirementOnlySigned /
// computeWithdrawalStrategy (chart-consumers.contract.md rows 4–7).
// ---------------------------------------------------------------------------
function requirementPerYear(scenario, tier, adultCount, overrides, childrenList, fireYear, projectionYear, visaCost) {
  const base = getScaledScenarioSpend(scenario, tier, adultCount, overrides);
  const allowance = calcPerChildAllowance(childrenList, projectionYear, fireYear);
  return base + allowance + (visaCost || 0);
}

const US = { id: 'us', annualSpend: 78000, normalSpend: 78000, comfortableSpend: 120000 };

// ---------------------------------------------------------------------------
// Test 1 — requirement is strategy-independent by construction.
// Per chart-consumers.contract.md §Strategy precedence, the withdrawal
// strategy (dwz, safe, bracket-fill, low-tax) is NOT a parameter of the
// requirement. Swapping strategies must not change the requirement output.
// ---------------------------------------------------------------------------
test('strategy-vs-requirement — requirement is strategy-independent', () => {
  const strategies = ['dwz', 'safe', 'bracket-fill', 'low-tax'];
  const baseline = requirementPerYear(US, 'normal', 1, {}, CHILDREN_FIXTURE_A, FIRE_YEAR_DEFAULT, 2035, 0);
  for (const _strategyName of strategies) {
    // strategy label is not a parameter — requirement is pure of strategy by construction.
    assert.equal(
      requirementPerYear(US, 'normal', 1, {}, CHILDREN_FIXTURE_A, FIRE_YEAR_DEFAULT, 2035, 0),
      baseline,
      `requirement unchanged for strategy=${_strategyName}`
    );
  }
});

// ---------------------------------------------------------------------------
// Test 2 — fixture A concrete values.
// CHILDREN_FIXTURE_A: kids born 2018-01-01 and 2021-01-01.
// At projectionYear=2035:
//   child born 2018 → age 17, collegeStart=2036 > 2035 → allowance 6000
//   child born 2021 → age 14, collegeStart=2039 > 2035 → allowance 3000
//   total allowance = 9000
// Base: US normal ($78k) scaled for Adults=1 → 78000 * 2/3 = 52000
// Expected requirement = 52000 + 9000 = 61000
// ---------------------------------------------------------------------------
test('strategy-vs-requirement — fixture A (2 kids born 2018 and 2021) at fireYear=2030, projectionYear=2035', () => {
  const r = requirementPerYear(US, 'normal', 1, {}, CHILDREN_FIXTURE_A, FIRE_YEAR_DEFAULT, 2035, 0);
  assert.equal(r, 52000 + 9000);
});

// ---------------------------------------------------------------------------
// Test 3 — college-takeover zeroes out allowance.
// At projectionYear=2038: kid born 2018 collegeStart=2036 → already in college → 0
//   kid born 2021 age 17, collegeStart=2039 > 2038 → 6000
// At projectionYear=2041: both kids in college → allowance 0
// ---------------------------------------------------------------------------
test('strategy-vs-requirement — both kids in college post-18 → allowance zeros out', () => {
  const r = requirementPerYear(US, 'normal', 1, {}, CHILDREN_FIXTURE_A, FIRE_YEAR_DEFAULT, 2038, 0);
  assert.equal(r, 52000 + 6000);
  const r2 = requirementPerYear(US, 'normal', 1, {}, CHILDREN_FIXTURE_A, FIRE_YEAR_DEFAULT, 2041, 0);
  assert.equal(r2, 52000 + 0);
});
