/*
 * tests/unit/lifecycle.test.js — locks the calc/lifecycle.js contract (T038).
 *
 * Covers the four fixture classes from
 *   specs/001-modular-calc-engine/contracts/lifecycle.contract.md §Fixtures:
 *     1. accumulation-only — 30yo single, $100k portfolio, $24k spend, $20k contribs.
 *        Analytical closed-form: FV(PV, r, n) + PMT·((1+r)^n - 1)/r.
 *     2. three-phase-retirement — 45yo $1.2M, FIRE at 53. Complex fixture;
 *        tests assert structural invariants + sane-range checks.
 *     3. infeasible — $500k portfolio, $80k spend, retire-now. Must flag
 *        feasible:false with deficitReal>0; no silent absorption.
 *     4. real-nominal-check — healthcare cost supplied as nominal; lifecycle
 *        MUST route through inflation.toReal at the boundary. Locks FR-017.
 *
 * RED phase: calc/lifecycle.js does not yet exist. The import below will
 * fail with ERR_MODULE_NOT_FOUND — expected until T046.
 *
 * Contract invariants (lifecycle.contract.md §Invariants):
 *   - Output length === endAge - currentAgePrimary + 1.
 *   - Years strictly monotonic.
 *   - All money in real dollars; nominal conversion ONLY via inflation.js.
 *   - totalReal === sum of four pool fields every year.
 *   - Any pool going negative flags feasible:false + deficitReal.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { runLifecycle } from '../../calc/lifecycle.js';
import accumulationOnly from '../fixtures/accumulation-only.js';
import threePhase from '../fixtures/three-phase-retirement.js';
import infeasible from '../fixtures/infeasible.js';
import realNominalCheck from '../fixtures/real-nominal-check.js';

/** Sum the four pool fields of a single lifecycle record. */
function sumPools(rec) {
  return (
    rec.trad401kReal +
    rec.rothIraReal +
    rec.taxableStocksReal +
    rec.cashReal
  );
}

test('lifecycle: accumulation-only fixture — monotonic growth, feasible every year, checkpoints within ±1%', () => {
  const { inputs, expected } = accumulationOnly;
  const result = runLifecycle({
    inputs,
    fireAge: inputs.endAge, // never retires — accumulation-only
    helpers: {},
  });

  // Structural invariants.
  assert.ok(Array.isArray(result), 'returns LifecycleRecord[]');
  const expectedLen = inputs.endAge - inputs.currentAgePrimary + 1;
  assert.equal(
    result.length,
    expectedLen,
    `length must equal endAge - currentAge + 1 = ${expectedLen}`,
  );

  // Every year feasible; monotonic totalReal; totalReal === sum(pools).
  for (let i = 0; i < result.length; i++) {
    const rec = result[i];
    assert.equal(rec.feasible, true, `accumulation-only ⇒ feasible every year (year index ${i})`);
    assert.ok(
      Math.abs(rec.totalReal - sumPools(rec)) < 1e-3,
      `totalReal must === sum(pools) at year index ${i}`,
    );
    if (i > 0) {
      assert.ok(
        rec.totalReal >= result[i - 1].totalReal - 1e-3,
        `accumulation-only ⇒ monotonic non-decreasing totalReal at year index ${i}`,
      );
    }
  }

  // Analytical checkpoints (locked in the fixture).
  for (const cp of expected.lifecycleCheckpoints) {
    const rec = result.find((r) => r.agePrimary === cp.age);
    assert.ok(rec, `lifecycle must contain a record for age ${cp.age}`);
    const relError = Math.abs(rec.totalReal - cp.totalReal) / cp.totalReal;
    assert.ok(
      relError <= cp.tolerance,
      `age ${cp.age}: expected ${cp.totalReal} ±${cp.tolerance * 100}%, got ${rec.totalReal} (rel err ${(relError * 100).toFixed(3)}%)`,
    );
  }
});

test('lifecycle: three-phase-retirement fixture — structural + phase invariants (values locked in T046 GREEN)', () => {
  const { inputs, expected } = threePhase;
  // Pick a plausible fireAge for structural assertions; exact solver-found
  // fireAge comes from fireCalculator in T047.
  const fireAge = 53;
  const result = runLifecycle({ inputs, fireAge, helpers: {} });

  // Length and monotonic-year invariants hold regardless of fixture lock-in.
  const expectedLen = inputs.endAge - inputs.currentAgePrimary + 1;
  assert.equal(result.length, expectedLen, `length must === ${expectedLen}`);
  for (let i = 1; i < result.length; i++) {
    assert.ok(
      result[i].year > result[i - 1].year,
      `years strictly monotonic at index ${i}`,
    );
    assert.ok(
      result[i].agePrimary === result[i - 1].agePrimary + 1,
      `age advances by exactly 1 per year at index ${i}`,
    );
  }

  // Phase transitions — accumulation while working; post-fireAge not accumulation.
  const accumulationRec = result.find((r) => r.agePrimary === inputs.currentAgePrimary);
  assert.equal(accumulationRec.phase, 'accumulation');
  const postFireRec = result.find((r) => r.agePrimary === fireAge + 1);
  assert.ok(postFireRec, 'post-fire record exists');
  assert.notEqual(postFireRec.phase, 'accumulation', 'post-fire year must not be accumulation');

  // totalReal === sum(pools) every year.
  for (const rec of result) {
    assert.ok(
      Math.abs(rec.totalReal - sumPools(rec)) < 1e-3,
      `totalReal === sum(pools) at age ${rec.agePrimary}`,
    );
  }

  // Fixture-lock assertions: structural today, tightening once T046 locks.
  for (const cp of expected.lifecycleCheckpoints) {
    const rec = result.find((r) => r.agePrimary === cp.age);
    assert.ok(rec, `checkpoint record at age ${cp.age} exists`);
    if (typeof cp.totalReal === 'number') {
      const relError = Math.abs(rec.totalReal - cp.totalReal) / cp.totalReal;
      assert.ok(
        relError <= cp.tolerance,
        `age ${cp.age}: expected ${cp.totalReal} ±${cp.tolerance * 100}%, got ${rec.totalReal}`,
      );
    } else {
      // Placeholder — sanity-range only until T046 locks.
      assert.equal(typeof rec.totalReal, 'number', `totalReal is numeric at age ${cp.age}`);
      assert.ok(
        rec.totalReal >= 0 && rec.totalReal < 1e9,
        `totalReal in sane range at age ${cp.age}: got ${rec.totalReal}`,
      );
    }
  }
});

test('lifecycle: infeasible fixture — flag propagates, deficitReal>0, no silent absorption', () => {
  const { inputs, expected } = infeasible;
  // Force retire-now by passing currentAge as fireAge.
  const result = runLifecycle({
    inputs,
    fireAge: inputs.currentAgePrimary,
    helpers: {},
  });

  // At least one record must be infeasible.
  const badRecs = result.filter((r) => r.feasible === false);
  assert.ok(
    badRecs.length > 0,
    `infeasible fixture MUST produce ≥1 feasible:false record (no silent absorption)`,
  );

  // Every infeasible record carries deficitReal > 0.
  for (const rec of badRecs) {
    assert.equal(
      typeof rec.deficitReal,
      'number',
      `feasible:false record MUST carry deficitReal (age ${rec.agePrimary})`,
    );
    assert.ok(
      rec.deficitReal > 0,
      `deficitReal must be > 0 at age ${rec.agePrimary}; got ${rec.deficitReal}`,
    );
  }

  // Placeholder-aware sanity check against expected.
  if (typeof expected.feasible === 'boolean') {
    // Globally feasible iff every record feasible.
    const globallyFeasible = result.every((r) => r.feasible);
    assert.equal(globallyFeasible, expected.feasible);
  }
});

test('lifecycle: real-nominal-check fixture — nominal healthcare cost converted to real at boundary (FR-017)', () => {
  const { inputs, expected } = realNominalCheck;
  const result = runLifecycle({
    inputs,
    fireAge: inputs.currentAgePrimary, // retire immediately for clean isolation
    helpers: {},
  });

  // Find the lifecycle record at the horizon age.
  const horizonRec = result.find((r) => r.agePrimary === expected.horizonAge);
  assert.ok(
    horizonRec,
    `lifecycle must contain a record for horizon age ${expected.horizonAge}`,
  );

  // The record must include a real-dollar healthcare field. Field name is
  // implementer-defined within the LifecycleRecord shape; we accept any of
  // the common spellings listed in the data model.
  const realHealthcare =
    horizonRec.healthcareCostReal ??
    horizonRec.healthcareReal ??
    horizonRec.healthcareRealCost;
  assert.equal(
    typeof realHealthcare,
    'number',
    `horizon record must expose a real-dollar healthcare field; got ${JSON.stringify(horizonRec)}`,
  );

  // The real-dollar value must equal nominal / (1+i)^years — NOT the nominal itself.
  // If implementer silently pipes nominal through as real, this fails visibly.
  assert.ok(
    Math.abs(realHealthcare - expected.expectedHealthcareRealAtHorizon) < expected.tolerance,
    `real healthcare at horizon must equal ${expected.expectedHealthcareRealAtHorizon} (nominal/(1+i)^y); got ${realHealthcare}`,
  );
  assert.ok(
    Math.abs(realHealthcare - expected.nominalHealthcareCost) > 1_000,
    `real value MUST differ materially from nominal (anti-leak check); got real=${realHealthcare}, nominal=${expected.nominalHealthcareCost}`,
  );
});

/*
 * US2b extensions (TB11) — four RED tests covering lifecycle-engine support
 * for the new Inputs fields declared in data-model.md §1:
 *   (a) contributionSplit override (60/20/20 default → custom 40/40/20)
 *   (b) employerMatchReal adds to trad401k in accumulation years
 *   (c) relocationCostReal applies at fireAge
 *   (d) homeSaleAtFireReal adds to taxable stocks at fireAge
 *
 * RED until TB17/TB18 teach the module to consume these fields.
 *
 * All four tests extend the `accumulation-only` fixture (simple analytical
 * case — isolates the effect of each override without coupling to SS / tax
 * / mortgage / college).
 */

/**
 * Deep-clone the accumulation-only inputs so we can apply overrides without
 * mutating the frozen fixture.
 */
function cloneInputs(srcInputs) {
  // Shallow spreads of the nested objects are sufficient because we only
  // override top-level fields or replace whole sub-objects.
  return {
    ...srcInputs,
    portfolioPrimary: { ...srcInputs.portfolioPrimary },
    buffers: { ...srcInputs.buffers },
    scenario: { ...srcInputs.scenario },
    tax: {
      ...srcInputs.tax,
      ordinaryBrackets: [...srcInputs.tax.ordinaryBrackets],
      ltcgBrackets: [...srcInputs.tax.ltcgBrackets],
    },
    colleges: [...srcInputs.colleges],
  };
}

test('lifecycle: contributionSplit override reallocates accumulation contributions away from default 60/20/20', () => {
  const baseInputs = cloneInputs(accumulationOnly.inputs);
  // Default (no override) — uses 60/20/20.
  const defaultResult = runLifecycle({
    inputs: baseInputs,
    fireAge: baseInputs.endAge,
    helpers: {},
  });

  // Override — 40/40/20 (trad down, roth up, taxable unchanged). Given
  // identical annualContributionReal, the trad401k growth trajectory must
  // differ from the default result.
  const overrideInputs = {
    ...cloneInputs(baseInputs),
    contributionSplit: {
      trad401kFraction: 0.40,
      rothFraction: 0.40,
      taxableFraction: 0.20,
    },
  };
  const overrideResult = runLifecycle({
    inputs: overrideInputs,
    fireAge: overrideInputs.endAge,
    helpers: {},
  });

  // The trad balance trajectory must diverge. Pick a mid-accumulation year.
  const defaultMidRec = defaultResult.find((r) => r.agePrimary === 50);
  const overrideMidRec = overrideResult.find((r) => r.agePrimary === 50);
  assert.ok(defaultMidRec && overrideMidRec, 'mid-accumulation records exist in both runs');
  // Override routes less to trad (0.40 vs 0.60 of the same annual contribution)
  // ⇒ trad401kReal must be smaller under the override at the same age.
  assert.ok(
    overrideMidRec.trad401kReal < defaultMidRec.trad401kReal,
    `contributionSplit override (0.40 trad) must produce LESS trad401kReal than default ` +
      `(0.60 trad); got override=${overrideMidRec.trad401kReal}, default=${defaultMidRec.trad401kReal}`,
  );
  // Meaningful delta — this separates an honored override from a ignored field.
  const relDelta =
    Math.abs(overrideMidRec.trad401kReal - defaultMidRec.trad401kReal) /
    defaultMidRec.trad401kReal;
  assert.ok(
    relDelta > 0.10,
    `override must materially change trad401kReal (relative delta > 10%); got ${(relDelta * 100).toFixed(2)}%`,
  );
});

test('lifecycle: employerMatchReal augments trad401kReal growth during accumulation', () => {
  const baseInputs = cloneInputs(accumulationOnly.inputs);
  const withoutMatch = runLifecycle({
    inputs: baseInputs,
    fireAge: baseInputs.endAge,
    helpers: {},
  });

  const matchInputs = { ...cloneInputs(baseInputs), employerMatchReal: 5_000 };
  const withMatch = runLifecycle({
    inputs: matchInputs,
    fireAge: matchInputs.endAge,
    helpers: {},
  });

  // At every accumulation year >= 1, trad401kReal with match MUST exceed
  // trad401kReal without match. The match is contributed to the Traditional
  // pool only, so other pools (roth, taxable) must match within a small
  // tolerance (no second-order effects from match money leaking to other pools).
  for (let age = baseInputs.currentAgePrimary + 1; age < baseInputs.endAge; age++) {
    const base = withoutMatch.find((r) => r.agePrimary === age);
    const matched = withMatch.find((r) => r.agePrimary === age);
    assert.ok(base && matched, `records at age ${age} exist in both runs`);
    assert.ok(
      matched.trad401kReal > base.trad401kReal,
      `match must increase trad401kReal at age ${age}; got matched=${matched.trad401kReal}, base=${base.trad401kReal}`,
    );
  }

  // Sanity: at age currentAgePrimary + 10, the cumulative match benefit should
  // be approximately 5000 × ((1+r)^10 - 1)/r compounded — and definitely > 50_000.
  const tenYearsIn = withMatch.find(
    (r) => r.agePrimary === baseInputs.currentAgePrimary + 10,
  );
  const tenYearsInBase = withoutMatch.find(
    (r) => r.agePrimary === baseInputs.currentAgePrimary + 10,
  );
  const cumulativeMatchEffect =
    tenYearsIn.trad401kReal - tenYearsInBase.trad401kReal;
  assert.ok(
    cumulativeMatchEffect > 50_000,
    `10 years of $5k/yr match must compound to > $50k extra trad401kReal; got ${cumulativeMatchEffect}`,
  );
});

test('lifecycle: relocationCostReal appears as one-time outflow at fireAge', () => {
  // Accumulation-only fixture retires at endAge; force an earlier fireAge
  // so relocation has a real year to apply at.
  const baseInputs = cloneInputs(accumulationOnly.inputs);
  const fireAge = 55;
  const relocationCostReal = 50_000;
  const inputs = { ...baseInputs, relocationCostReal };

  const result = runLifecycle({ inputs, fireAge, helpers: {} });

  const fireYearRec = result.find((r) => r.agePrimary === fireAge);
  assert.ok(fireYearRec, `record at fireAge ${fireAge} exists`);
  assert.ok(
    (fireYearRec.oneTimeOutflowReal || 0) >= relocationCostReal - 1e-6,
    `relocationCostReal must appear as oneTimeOutflowReal at fireAge; ` +
      `expected >= ${relocationCostReal}, got ${fireYearRec.oneTimeOutflowReal}`,
  );

  // Before fireAge: oneTimeOutflowReal attributable to relocation is 0.
  const preFireAttr = result.filter(
    (r) =>
      r.agePrimary < fireAge &&
      (r.oneTimeOutflowReal || 0) >= relocationCostReal,
  );
  assert.equal(
    preFireAttr.length,
    0,
    'relocationCostReal outflow must NOT appear in any pre-fireAge year',
  );
});

test('lifecycle: homeSaleAtFireReal adds to taxableStocksReal at fireAge relative to no-sale baseline', () => {
  // Accumulation-only fixture retires at endAge; force an earlier fireAge.
  const baseInputs = cloneInputs(accumulationOnly.inputs);
  const fireAge = 55;
  const homeSaleAtFireReal = 300_000;

  const baselineResult = runLifecycle({
    inputs: baseInputs,
    fireAge,
    helpers: {},
  });

  const withSaleInputs = { ...baseInputs, homeSaleAtFireReal };
  const withSaleResult = runLifecycle({
    inputs: withSaleInputs,
    fireAge,
    helpers: {},
  });

  const baselineAtFire = baselineResult.find((r) => r.agePrimary === fireAge);
  const withSaleAtFire = withSaleResult.find((r) => r.agePrimary === fireAge);
  assert.ok(baselineAtFire && withSaleAtFire, 'records at fireAge exist in both runs');

  // taxableStocksReal at fireAge must increase by approximately homeSaleAtFireReal.
  const delta = withSaleAtFire.taxableStocksReal - baselineAtFire.taxableStocksReal;
  // Tolerance allows for small compounding effects if the sale proceeds
  // are injected at the start or middle of the year; the load-bearing
  // assertion is that the delta is ≥ 95% of the sale value and ≤ 110%.
  assert.ok(
    delta >= homeSaleAtFireReal * 0.95,
    `homeSaleAtFireReal must increase taxableStocksReal at fireAge by ≈ ${homeSaleAtFireReal}; ` +
      `got delta=${delta}`,
  );
  assert.ok(
    delta <= homeSaleAtFireReal * 1.10,
    `delta should not exceed the sale value by more than 10%; got delta=${delta}`,
  );
});
