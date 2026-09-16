import assert from 'node:assert/strict'

// These are observable fixture outcomes, not assertions about skill wording.
export const corrections = [
  ['# API Response URLs', '# API response URLs'],
  ['Enter A URL', 'Enter a URL'],
  ['## Application Requirements', '## Application requirements'],
  ['September 16th, 2026', '16 September 2026'],
]

const normalise = (value) => value.replaceAll('\u00a0', ' ').replaceAll('\r\n', '\n').trim()

export function checkOutcome(mode, before, after, report) {
  assert.ok(['assessment', 'editing'].includes(mode), 'Unknown evaluation mode')
  assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort(), 'Files added or removed')
  for (const file of Object.keys(before)) {
    if (mode === 'assessment' || file !== 'content.md') {
      assert.equal(after[file], before[file], `Unexpected edit: ${file}`)
    }
  }
  assert.ok(Array.isArray(report.findings), 'Report must contain a findings array')
  for (const [original, corrected] of corrections) {
    assert.ok(report.findings.some((finding) =>
      finding.file === 'content.md' &&
      typeof finding.before === 'string' && typeof finding.after === 'string' &&
      normalise(finding.before).includes(original.replace(/^#+ /, '')) &&
      normalise(finding.after).includes(corrected.replace(/^#+ /, '')),
    ), `Missing finding or correction: ${original}`)
  }
  if (mode === 'editing') {
    let expected = before['content.md']
    for (const [original, corrected] of corrections) expected = expected.replace(original, corrected)
    assert.equal(normalise(after['content.md']), normalise(expected),
      'Corrections missing or protected/already-correct content changed')
  }
}
