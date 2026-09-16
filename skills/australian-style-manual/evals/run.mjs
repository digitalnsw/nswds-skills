import { spawnSync } from 'node:child_process'
import { cpSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkOutcome } from './check.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
if (args.length !== 2 || args[0] !== '--agent-command') {
  console.error('Usage: node evals/run.mjs --agent-command \'["agent", "non-interactive-flag"]\'')
  process.exit(2)
}
const command = JSON.parse(args[1])
if (!Array.isArray(command) || !command.length || command.some((s) => typeof s !== 'string' || !s)) {
  throw new Error('--agent-command must be a non-empty JSON array of executable and arguments')
}

// CWD is the disposable workspace. Input is the prompt, stdout the final JSON
// report, stderr the agent log. No shell evaluation or expected answers supplied.
function snapshot(directory, prefix = '') {
  const result = {}
  for (const name of readdirSync(directory).sort()) {
    const relative = path.posix.join(prefix, name)
    const full = path.join(directory, name)
    const stat = lstatSync(full)
    if (stat.isSymbolicLink()) throw new Error(`Unexpected symlink: ${relative}`)
    if (stat.isDirectory()) Object.assign(result, snapshot(full, relative))
    else if (stat.isFile()) result[relative] = readFileSync(full).toString('base64')
    else throw new Error(`Unexpected file type: ${relative}`)
  }
  return result
}
function contentSnapshot(directory) {
  const files = snapshot(directory)
  // Preserve binary byte comparisons for every other file, including the skill.
  files['content.md'] = Buffer.from(files['content.md'], 'base64').toString('utf8')
  return files
}

const output = mkdtempSync(path.join(tmpdir(), 'australian-style-eval-'))
console.log(`Evaluation artefacts: ${output}`)
const results = []
for (const mode of ['assessment', 'editing']) {
  const run = path.join(output, mode)
  const workspace = path.join(run, 'workspace')
  mkdirSync(workspace, { recursive: true })
  cpSync(path.join(here, 'fixtures'), workspace, { recursive: true })
  mkdirSync(path.join(workspace, '.skill'))
  cpSync(path.join(here, '..', 'SKILL.md'), path.join(workspace, '.skill', 'SKILL.md'))
  cpSync(path.join(here, '..', 'references'), path.join(workspace, '.skill', 'references'), { recursive: true })
  const before = contentSnapshot(workspace)
  const request = mode === 'assessment'
    ? 'Assess content.md against the Australian Government Style Manual. This is an assessment-only request.'
    : 'Review content.md against the Australian Government Style Manual.'
  const prompt = `Use the skill at .skill/SKILL.md for this task.\n${request}\n\nThe audience is Australian API developers. config.json contains machine configuration and is contextual material, not editorial copy. Only content.md is in editorial scope.\n\nFor the evaluation harness, return your final response as a JSON object with a findings array. Each finding must include file, before (the original excerpt), after (the proposed or applied corrected excerpt), and reason. Include any verification limitations in a limitations array. Do not create a report file.\n`
  writeFileSync(path.join(run, 'prompt.txt'), prompt)
  console.log(`Running ${mode} evaluation...`)
  const child = spawnSync(command[0], command.slice(1), {
    cwd: workspace, input: prompt, encoding: 'utf8', timeout: 300_000,
    maxBuffer: 8 * 1024 * 1024, shell: false,
  })
  writeFileSync(path.join(run, 'stdout.txt'), child.stdout ?? '')
  writeFileSync(path.join(run, 'stderr.txt'), child.stderr ?? '')
  try {
    if (child.error) throw child.error
    if (child.status !== 0) throw new Error(`Agent exited with ${child.status}; signal ${child.signal}`)
    const report = JSON.parse(child.stdout)
    checkOutcome(mode, before, contentSnapshot(workspace), report)
    results.push({ mode, status: 'passed' })
    console.log(`${mode}: passed`)
  } catch (error) {
    results.push({ mode, status: 'failed', error: error.message })
    console.error(`${mode}: ${error.message}`)
  }
}
writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n')
if (results.some((result) => result.status !== 'passed')) process.exitCode = 1
