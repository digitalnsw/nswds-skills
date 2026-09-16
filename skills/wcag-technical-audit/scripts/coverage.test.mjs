import assert from 'node:assert/strict'
import test from 'node:test'
import { criteria, initialise, validate } from './coverage.mjs'

const draft = () => initialise('AA', ['/sign-in#empty;desktop', '/sign-in#error;desktop'])
function completed() {
  const audit = draft()
  Object.assign(audit, { target: 'Local fixture', build: 'test build', date: '2026-09-16', environments: ['Test fixture environment'] })
  for (const row of [...audit.results, ...audit.conformanceRequirements]) {
    Object.assign(row, { status: 'pass', methods: ['manual-review'], evidence: ['fixture-evidence'], reason: 'Synthetic validator test only' })
  }
  return audit
}
test('includes lower levels and all active criteria, excluding removed parsing', () => {
  assert.equal(criteria('A').length, 31)
  assert.equal(criteria('AA').length, 55)
  assert.equal(criteria('AAA').length, 86)
  assert.equal(new Set(criteria('AAA').map((c) => c.id)).size, 86)
  assert.ok(!criteria('AAA').some((c) => c.id === '4.1.1'))
  for (const id of ['2.4.11', '2.5.7', '2.5.8', '3.2.6', '3.3.7', '3.3.8']) assert.ok(criteria('AA').some((c) => c.id === id))
  assert.ok(!criteria('AA').some((c) => c.id === '2.4.13'))
})
test('initialises every scope/criterion pair as untested', () => {
  const audit = draft()
  assert.equal(validate(audit)['not-tested'], 110)
  assert.ok(audit.conformanceRequirements.every((row) => row.status === 'not-tested'))
})
test('rejects missing and duplicate coverage', () => {
  const missing = draft(); missing.results.pop()
  assert.throws(() => validate(missing), /Missing 1/)
  const duplicate = draft(); duplicate.results[1] = duplicate.results[0]
  assert.throws(() => validate(duplicate), /duplicate result/)
})
test('rejects unknown criteria and version mixing', () => {
  const audit = draft(); audit.results[0].criterion = '4.1.1'
  assert.throws(() => validate(audit), /Unexpected/)
  const old = draft(); old.wcagVersion = '2.1'
  assert.throws(() => validate(old), /only WCAG 2.2/)
})
test('rejects unsupported pass and not-applicable claims', () => {
  for (const status of ['pass', 'not-applicable']) {
    const audit = draft(); Object.assign(audit.results[0], { status, reason: 'Claim without evidence' })
    assert.throws(() => validate(audit), /evidence and methods/)
  }
})
test('requires failure findings and conformance-requirement coverage', () => {
  const audit = completed(); audit.results[0].status = 'fail'
  assert.throws(() => validate(audit, true), /link a finding/)
  audit.results[0].finding = 'F-001'; audit.conformanceRequirements[0].status = 'fail'; validate(audit, true)
  audit.conformanceRequirements.pop()
  assert.throws(() => validate(audit), /Missing conformance/)
})
test('incomplete evidence cannot pass the completion gate', () => {
  for (const status of ['blocked', 'manual-needed', 'not-tested']) {
    const audit = completed(); audit.results[0].status = status
    audit.conformanceRequirements[0].status = 'not-tested'
    validate(audit)
    assert.throws(() => validate(audit, true), /unfinished/)
  }
})
test('requires environment metadata for completion', () => {
  const audit = completed(); audit.environments = []
  assert.throws(() => validate(audit, true), /test environments/)
})
test('complete audit can contain failures without claiming conformance', () => {
  const audit = completed(); Object.assign(audit.results[0], { status: 'fail', finding: 'F-001' })
  audit.conformanceRequirements[0].status = 'fail'
  assert.equal(validate(audit, true).fail, 1)
})
test('rejects duplicate scopes, blank IDs and unsupported levels', () => {
  assert.throws(() => initialise('AA', ['/', '/']), /Duplicate/)
  assert.throws(() => initialise('AA', ['']), /non-empty/)
  assert.throws(() => initialise('AAAA', ['/']), /Level/)
})
test('rejects a conformance-level pass when a criterion fails', () => {
  const audit = completed(); Object.assign(audit.results[0], { status: 'fail', finding: 'F-001' })
  assert.throws(() => validate(audit), /contradicts/)
})
test('preserves unfinished checks even when a failure is already established', () => {
  const audit = completed()
  Object.assign(audit.results[0], { status: 'fail', finding: 'F-001', remainingTests: ['Check the other applicable clause'] })
  audit.conformanceRequirements[0].status = 'fail'
  validate(audit)
  assert.throws(() => validate(audit, true), /outstanding tests/)
  audit.results[0].status = 'pass'
  assert.throws(() => validate(audit), /outstanding tests/)
})
