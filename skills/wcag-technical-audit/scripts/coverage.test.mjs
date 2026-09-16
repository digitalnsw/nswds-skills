import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
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

test('validates real dates in drafts and completed records', () => {
  for (const date of ['tomorrow', '2026-02-31', '2025-02-29', '1900-02-29', '2026-00-01', '2026-13-01', '2026-01-00', '0000-01-01', '2026-1-01', '2026-09-16T00:00:00Z']) {
    const audit = completed(); audit.date = date
    for (const complete of [false, true]) assert.throws(() => validate(audit, complete), /calendar date/)
  }
  for (const date of ['2024-02-29', '2000-02-29', '2026-09-16']) {
    const audit = completed(); audit.date = date; validate(audit, true)
  }
  const audit = completed(); audit.date = ''; validate(audit)
  assert.throws(() => validate(audit, true), /calendar date/)
})
function alternateFixture() {
  const audit = completed()
  Object.assign(audit.results[0], { status: 'fail', finding: 'F-001' })
  audit.alternateVersions = [{ original: audit.scope[0], alternates: [audit.scope[1]], equivalence: ['fixture'], currency: ['fixture'], availability: ['fixture'], reachability: ['fixture'], reachabilityMode: 'accessible-mechanism' }]
  return audit
}
test('accepts evidenced alternate mappings while preserving original failures', () => {
  for (const reachabilityMode of ['accessible-mechanism', 'only-via-alternate', 'only-via-conforming-gateway']) {
    const audit = alternateFixture(); audit.alternateVersions[0].reachabilityMode = reachabilityMode
    assert.equal(validate(audit, true).fail, 1)
  }
  const legacy = completed(); delete legacy.alternateVersions; validate(legacy, true)
})
test('rejects invalid or unevidenced alternate mappings', () => {
  const mutations = [
    (a) => { a.alternateVersions = [] },
    (a) => { a.alternateVersions = null },
    (a) => { a.alternateVersions[0].alternates = ['missing'] },
    (a) => { a.alternateVersions[0].alternates = [a.scope[0]] },
    (a) => { a.alternateVersions.push(structuredClone(a.alternateVersions[0])) },
    (a) => { a.alternateVersions[0].reachabilityMode = 'unverified' },
    ...['equivalence', 'currency', 'availability', 'reachability'].map((key) => (a) => { a.alternateVersions[0][key] = [] }),
    (a) => { Object.assign(a.results.find((r) => r.scope === a.scope[1]), { status: 'fail', finding: 'F-002' }) },
    (a) => { a.results.find((r) => r.scope === a.scope[1]).status = 'manual-needed' },
    (a) => { a.results[0].remainingTests = ['unfinished original check'] },
  ]
  for (const mutate of mutations) { const audit = alternateFixture(); mutate(audit); assert.throws(() => validate(audit)) }
})
test('rejects mapping cycles and preserves non-interference requirements', () => {
  const cycle = completed()
  const mapping = alternateFixture().alternateVersions[0]
  cycle.alternateVersions = [mapping, { ...mapping, original: cycle.scope[1], alternates: [cycle.scope[0]] }]
  assert.throws(() => validate(cycle), /chain or cycle/)
  for (const criterion of ['1.4.2', '2.1.2', '2.3.1', '2.2.2']) {
    const audit = alternateFixture()
    Object.assign(audit.results.find((r) => r.scope === audit.scope[0] && r.criterion === criterion), { status: 'fail', finding: 'F-002' })
    assert.throws(() => validate(audit), /Non-interference/)
    audit.conformanceRequirements.find((r) => r.requirement === 'non-interference').status = 'fail'
    validate(audit, true)
  }
})

test('CLI persists matrices, checks completion and protects existing files', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'wcag-cli-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const script = fileURLToPath(new URL('./coverage.mjs', import.meta.url))
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { cwd: directory, encoding: 'utf8' })
  const output = join(directory, 'audit.json')
  const init = run('init', '--scope', '/', '--output', output)
  assert.equal(init.status, 0, init.stderr)
  assert.match(init.stdout, /Created 55 untested/)
  const original = readFileSync(output, 'utf8')
  assert.equal(JSON.parse(original).results.length, 55)
  assert.equal(run('check', output).status, 0)
  assert.equal(run('check', output, '--complete').status, 1)
  assert.equal(run('init', '--scope', '/', '--output', output).status, 1)
  assert.equal(readFileSync(output, 'utf8'), original)
  writeFileSync(output, JSON.stringify(completed()))
  const complete = run('check', output, '--complete')
  assert.equal(complete.status, 0, complete.stderr)
  assert.match(complete.stdout, /"pass": 110/)
  assert.match(complete.stdout, /require evaluator review/)
  for (const args of [[], ['invalid'], ['init', '--scope'], ['init', '--unknown', 'x'], ['init', '--scope', '/'], ['check'], ['check', 'missing.json'], ['check', output, '--invalid'], ['check', output, '--complete', 'extra']]) {
    const result = run(...args)
    assert.equal(result.status, 1, JSON.stringify(args))
    assert.ok(result.stderr.trim())
  }
  writeFileSync(output, '{broken')
  assert.equal(run('check', output).status, 1)
})

test('supports several alternate pages without accepting missing coverage', () => {
  const audit = alternateFixture()
  const extra = 'alternate-confirmation'
  audit.scope.push(extra)
  audit.results.push(...audit.results.filter((r) => r.scope === audit.scope[1]).map((r) => ({ ...structuredClone(r), scope: extra })))
  audit.alternateVersions[0].alternates.push(extra)
  assert.equal(validate(audit, true).fail, 1)
  audit.results.pop()
  assert.throws(() => validate(audit), /Missing 1/)
})
