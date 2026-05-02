// Feature 023 — getAccumulationSpend(inp) helper unit tests.
//
// The helper itself lives as inline JavaScript in BOTH HTMLs (per Phase 0 R3
// decision — see specs/023-accumulation-spend-separation/research.md and
// specs/023-accumulation-spend-separation/contracts/getAccumulationSpend-helper.contract.md).
// Because it's not in a calc/ module, this test file uses a wrapper
// `_harnessGetAccumulationSpend` that mirrors the inline body byte-exact and
// accepts an injected `getTotalMonthlyExpensesFn` for stub-ability.
//
// FRAME: real-$ — output is in today's purchasing power.

const { test } = require('node:test');
const assert = require('node:assert/strict');

// Mirror of the inline helper body in FIRE-Dashboard.html and
// FIRE-Dashboard-Generic.html (added 2026-05-02 alongside resolveAccumulationOptions
// extension). MUST stay byte-equivalent to the in-HTML body.
function _harnessGetAccumulationSpend(inp, getTotalMonthlyExpensesFn) {
  const monthlySum = (typeof getTotalMonthlyExpensesFn === 'function')
    ? getTotalMonthlyExpensesFn()
    : 0;
  const annualSum = monthlySum * 12;
  if (annualSum >= 1000) return annualSum;
  return 120000;
}

test('getAccumulationSpend: empty Plan tab returns $120k fallback (FR-002a)', () => {
  const result = _harnessGetAccumulationSpend({}, () => 0);
  assert.equal(result, 120000);
});

test('getAccumulationSpend: $50/mo (sub-floor $600/yr) triggers fallback', () => {
  const result = _harnessGetAccumulationSpend({}, () => 50);
  assert.equal(result, 120000);
});

test('getAccumulationSpend: $100/mo ($1,200/yr) just above floor passes through', () => {
  const result = _harnessGetAccumulationSpend({}, () => 100);
  assert.equal(result, 1200);
});

test('getAccumulationSpend: $5,000/mo frugal user returns $60k', () => {
  const result = _harnessGetAccumulationSpend({}, () => 5000);
  assert.equal(result, 60000);
});

test('getAccumulationSpend: $10,000/mo RR-baseline returns $120k (matches floor coincidentally)', () => {
  const result = _harnessGetAccumulationSpend({}, () => 10000);
  assert.equal(result, 120000);
});

test('getAccumulationSpend: undefined getTotalMonthlyExpensesFn returns $120k fallback (test harness without DOM)', () => {
  const result = _harnessGetAccumulationSpend({}, undefined);
  assert.equal(result, 120000);
});

test('getAccumulationSpend: $20,000/mo wealthy user returns $240k (above floor)', () => {
  const result = _harnessGetAccumulationSpend({}, () => 20000);
  assert.equal(result, 240000);
});

test('getAccumulationSpend: NaN from getTotalMonthlyExpensesFn returns $120k fallback', () => {
  const result = _harnessGetAccumulationSpend({}, () => NaN);
  assert.equal(result, 120000);
});

test('getAccumulationSpend: $83.33/mo edge-case ($999.96/yr) below floor triggers fallback', () => {
  const result = _harnessGetAccumulationSpend({}, () => 83.33);
  assert.equal(result, 120000);
});

test('getAccumulationSpend: $83.34/mo edge-case ($1,000.08/yr) above floor passes through', () => {
  const result = _harnessGetAccumulationSpend({}, () => 83.34);
  assert.ok(result > 1000);
  assert.ok(result < 1001);
});
