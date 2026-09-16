import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const catalogue = JSON.parse(readFileSync(new URL('../references/criteria.json', import.meta.url), 'utf8'))
const levels = ['A', 'AA', 'AAA']
const statuses = ['pass', 'fail', 'not-applicable', 'not-tested', 'blocked', 'manual-needed']
const methods = ['automated', 'dom', 'keyboard', 'pointer', 'visual', 'screen-reader', 'media', 'document', 'source', 'manual-review']
export const requirements = ['conformance-level', 'full-pages', 'complete-processes', 'accessibility-supported', 'non-interference']
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0
const list = (value) => Array.isArray(value) && value.length > 0 && value.every(nonempty)
export function criteria(level) {
  assert.ok(levels.includes(level), 'Level must be A, AA or AAA')
  return catalogue.criteria.filter((item) => levels.indexOf(item.level) <= levels.indexOf(level))
}
function uniqueScope(scope) {
  assert.ok(list(scope), 'Provide at least one non-empty scope-item ID')
  assert.equal(new Set(scope).size, scope.length, 'Duplicate scope-item IDs')
}
const emptyResult = () => ({ status: 'not-tested', methods: [], evidence: [], reason: '', remainingTests: [] })
export function initialise(level, scope) {
  uniqueScope(scope)
  return {
    wcagVersion: '2.2', level, specification: catalogue.source,
    target: '', build: '', date: '', coverageMode: 'exhaustive', environments: [],
    scope,
    results: scope.flatMap((item) => criteria(level).map((criterion) => ({
      scope: item, criterion: criterion.id, ...emptyResult(), finding: '',
    }))),
    conformanceRequirements: requirements.map((requirement) => ({ requirement, ...emptyResult() })),
  }
}
function checkResult(row, label, complete, requirement = false) {
  const allowed = requirement ? ['pass', 'fail', 'not-tested', 'blocked', 'manual-needed'] : statuses
  assert.ok(allowed.includes(row.status), `${label}: invalid status`)
  assert.ok(Array.isArray(row.methods) && row.methods.every((method) => methods.includes(method)), `${label}: invalid methods`)
  assert.ok(Array.isArray(row.evidence) && row.evidence.every(nonempty), `${label}: invalid evidence`)
  assert.equal(typeof row.reason, 'string', `${label}: reason must be a string`)
  assert.ok(Array.isArray(row.remainingTests) && row.remainingTests.every(nonempty), `${label}: invalid remainingTests`)
  if (row.status === 'pass' || row.status === 'not-applicable' || complete) {
    assert.equal(row.remainingTests.length, 0, `${label}: outstanding tests remain`)
  }
  if (row.status !== 'not-tested') assert.ok(nonempty(row.reason), `${label}: explain the result`)
  const terminal = ['pass', 'fail', 'not-applicable'].includes(row.status)
  if (terminal) {
    assert.ok(row.methods.length > 0 && row.evidence.length > 0, `${label}: evidence and methods required`)
    if (!requirement && row.status === 'fail') assert.ok(nonempty(row.finding), `${label}: link a finding`)
  }
  if (complete) assert.ok(terminal, `${label}: unfinished (${row.status})`)
}
export function validate(audit, complete = false) {
  assert.equal(audit.wcagVersion, '2.2', 'This helper supports only WCAG 2.2')
  assert.equal(audit.specification, catalogue.source, 'Unexpected pinned specification')
  uniqueScope(audit.scope)
  assert.ok(['exhaustive', 'sampled'].includes(audit.coverageMode), 'Declare exhaustive or sampled coverage')
  assert.ok(Array.isArray(audit.environments), 'Environments must be an array')
  for (const key of ['target', 'build', 'date']) assert.equal(typeof audit[key], 'string', `${key} must be a string`)
  if (complete) {
    for (const key of ['target', 'build', 'date']) assert.ok(nonempty(audit[key]), `Record ${key}`)
    assert.ok(list(audit.environments), 'Record test environments')
  }
  const expected = new Set(audit.scope.flatMap((scope) => criteria(audit.level).map((c) => JSON.stringify([scope, c.id]))))
  assert.ok(Array.isArray(audit.results), 'Results must be an array')
  const counts = Object.fromEntries(statuses.map((status) => [status, 0]))
  for (const result of audit.results) {
    const key = JSON.stringify([result.scope, result.criterion])
    assert.ok(expected.delete(key), `Unexpected or duplicate result: ${key}`)
    checkResult(result, key, complete)
    counts[result.status]++
  }
  assert.equal(expected.size, 0, `Missing ${expected.size} scope/criterion results`)
  const remaining = new Set(requirements)
  assert.ok(Array.isArray(audit.conformanceRequirements), 'Conformance requirements must be an array')
  for (const result of audit.conformanceRequirements) {
    assert.ok(remaining.delete(result.requirement), 'Unexpected or duplicate conformance requirement')
    checkResult(result, result.requirement, complete, true)
  }
  assert.equal(remaining.size, 0, 'Missing conformance requirements')
  if (audit.conformanceRequirements.find((row) => row.requirement === 'conformance-level').status === 'pass') {
    assert.ok(audit.results.every((row) => ['pass', 'not-applicable'].includes(row.status)), 'Conformance-level pass contradicts failed or unfinished criteria')
  }
  return counts
}
function main(args) {
  const [command, ...rest] = args
  if (command === 'init') {
    let level = 'AA', output
    const scope = []
    for (let i = 0; i < rest.length; i += 2) {
      const flag = rest[i], value = rest[i + 1]
      assert.ok(nonempty(value), `Missing value for ${flag}`)
      if (flag === '--level') level = value
      else if (flag === '--scope') scope.push(value)
      else if (flag === '--output') output = value
      else throw new Error(`Unknown option: ${flag}`)
    }
    assert.ok(nonempty(output), '--output is required')
    const audit = initialise(level, scope)
    writeFileSync(output, JSON.stringify(audit, null, 2) + '\n', { flag: 'wx' })
    console.log(`Created ${audit.results.length} untested criterion results and 5 untested conformance requirements.`)
  } else if (command === 'check') {
    assert.ok(rest.length >= 1 && rest.length <= 2 && (rest.length === 1 || rest[1] === '--complete'), 'Usage: check FILE [--complete]')
    const counts = validate(JSON.parse(readFileSync(rest[0], 'utf8')), rest[1] === '--complete')
    console.log(JSON.stringify(counts, null, 2))
    console.log('Coverage structure validated. Evidence quality and WCAG conformance require evaluator review.')
  } else {
    throw new Error('Usage: coverage.mjs init --level AA --scope ID [--scope ID] --output FILE | check FILE [--complete]')
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv.slice(2)) } catch (error) { console.error(error.message); process.exitCode = 1 }
}
