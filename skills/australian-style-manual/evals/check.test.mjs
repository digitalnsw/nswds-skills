import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { checkOutcome, corrections } from './check.mjs'

const before = {
  'content.md': readFileSync(new URL('./fixtures/content.md', import.meta.url), 'utf8'),
  'config.json': readFileSync(new URL('./fixtures/config.json', import.meta.url), 'utf8'),
  '.skill/SKILL.md': 'Skill instructions must not be edited by the evaluated agent.',
}
const report = { findings: corrections.map(([before, after]) => ({ file: 'content.md', before, after })) }
const edited = { ...before, 'content.md': corrections.reduce((text, [a, b]) => text.replace(a, b), before['content.md']) }

test('accepts findings without edits in assessment mode', () => checkOutcome('assessment', before, { ...before }, report))
test('rejects any content edit in assessment mode', () => assert.throws(() => checkOutcome('assessment', before, edited, report), /Unexpected edit/))
test('rejects reports that omit planted findings', () => assert.throws(() => checkOutcome('assessment', before, before, { findings: [] }), /Missing finding/))
test('accepts the required edits and preserved content', () => checkOutcome('editing', before, edited, report))
test('rejects claimed corrections without file edits', () => assert.throws(() => checkOutcome('editing', before, before, report), /Corrections missing/))
for (const [name, original, replacement] of [
  ['acronym', 'API response URLs', 'Api response urls'],
  ['URL', 'https://example.com/Color/API?token=AbC', 'https://example.com/color/api?token=abc'],
  ['identifier', '`colorName`', '`colourName`'],
  ['placeholder', '{firstName}', '{givenName}'],
  ['obligation', 'You must submit', 'You may submit'],
  ['already-correct prose', 'by the deadline.', 'before it is too late.'],
]) {
  test(`rejects changed ${name}`, () => {
    const bad = { ...edited, 'content.md': edited['content.md'].replace(original, replacement) }
    assert.throws(() => checkOutcome('editing', before, bad, report), /Corrections missing/)
  })
}
test('rejects edited configuration', () => assert.throws(() => checkOutcome('editing', before, { ...edited, 'config.json': '{}' }, report), /Unexpected edit/))
test('rejects edited skill instructions', () => assert.throws(() => checkOutcome('editing', before, { ...edited, '.skill/SKILL.md': 'changed' }, report), /Unexpected edit/))
test('rejects new files', () => assert.throws(() => checkOutcome('assessment', before, { ...before, 'extra.md': 'report' }, report), /Files added or removed/))
test('rejects deleted files', () => { const bad = { ...edited }; delete bad['config.json']; assert.throws(() => checkOutcome('editing', before, bad, report), /Files added or removed/) })
