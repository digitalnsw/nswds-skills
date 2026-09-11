#!/usr/bin/env node
// Shared by the Claude and Codex adapters. Discovery never executes repository code.
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync, lstatSync } from 'node:fs';
import { resolve, join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';

const digest = value => createHash('sha256').update(value).digest('hex');
const git = (repo, ...args) => execFileSync('git', ['-C', repo, ...args], {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024}).trim();
const lines = text => text.split(/\r?\n/).filter(line => line.trim() && !/^\s*#/.test(line));
const stateDir = repo => resolve(repo, git(repo, 'rev-parse', '--git-path', 'quality-workflow-init'));
const configPattern = /(^|\/)(package\.json|[^/]*lock[^/]*|pyproject\.toml|setup\.cfg|tox\.ini|Cargo\.toml|go\.mod|Makefile|Taskfile[^/]*|Jenkinsfile|\.gitlab-ci[^/]*|[^/]*(?:vitest|playwright|eslint|prettier|tsconfig|turbo)[^/]*\.(?:json|[cm]?[jt]s|yaml|yml))$|^(?:\.github\/workflows|\.circleci)\//;

function sourceHash(repo, path) {
  if (typeof path !== 'string' || isAbsolute(path) || path.split(/[\\/]/).includes('..')) throw new Error('source paths must be repository-relative');
  const full = join(repo, path);
  if (!existsSync(full)) return null;
  if (!lstatSync(full).isFile()) throw new Error(`source must be a regular file: ${path}`);
  return digest(readFileSync(full));
}

export function inventory(repo) {
  const files = execFileSync('git', ['-C', repo, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024}).split('\0').filter(Boolean);
  const sources = [...new Set(files)].filter(path => configPattern.test(path)).sort().map(path => ({path, sha256: sourceHash(repo, path)}));
  const manifests = sources.filter(item => /(^|\/)package.json$/.test(item.path)).map(item => {
    const data = item.sha256 ? JSON.parse(readFileSync(join(repo, item.path), 'utf8')) : {};
    return {path: item.path, packageManager: data.packageManager, workspaces: data.workspaces, scripts: data.scripts || {}};
  });
  return {fingerprint: digest(JSON.stringify(sources)), sources, manifests};
}

export function selectValidation(repo, workflowDir, engine) {
  if (!['claude', 'codex'].includes(engine)) throw new Error('engine must be claude or codex');
  const explicit = engine === 'codex' ? ['.codex', '.claude'] : ['.claude'];
  for (const config of explicit) {
    const path = join(repo, config, 'quality-workflow', 'validation.commands');
    if (existsSync(path)) {
      if (!lines(readFileSync(path, 'utf8')).length) throw new Error(`Explicit validation file is empty: ${path}. Populate it; it will not be silently replaced.`);
      return {status: 'READY', origin: 'repository', path, exclusions: []};
    }
  }
  const dir = stateDir(repo), planPath = join(dir, 'plan.json');
  if (existsSync(planPath)) {
    const plan = JSON.parse(readFileSync(planPath, 'utf8'));
    if (plan.version !== 1 || plan.fingerprint !== inventory(repo).fingerprint || plan.sources.some(item => sourceHash(repo, item.path) !== item.sha256)) {
      throw new Error('STALE_INIT: CI, manifests, or inspected gate sources changed. Run quality init automatically before validation.');
    }
    const contents = plan.gates.map(gate => gate.command).join('\n') + '\n';
    const path = join(dir, `${digest(contents)}.commands`);
    if (!existsSync(path) || readFileSync(path, 'utf8') !== contents) throw new Error('INVALID_INIT: generated commands missing or modified; reinitialize');
    return {status: 'READY', origin: 'local-init', path, planPath, exclusions: plan.exclusions};
  }
  const path = join(workflowDir, 'validation.commands');
  // A global fallback is useful for ad-hoc verification but not per-repo onboarding.
  if (existsSync(path) && lines(readFileSync(path, 'utf8')).length) return {status: 'NEEDS_INIT', origin: 'global', path, exclusions: []};
  return {status: 'NEEDS_INIT', origin: 'none', path: '', exclusions: []};
}

export function savePlan(repo, workflowDir, engine, plan) {
  // Never overwrite a user's explicit repo configuration, including an empty one.
  for (const name of engine === 'codex' ? ['.codex', '.claude'] : ['.claude']) {
    if (existsSync(join(repo, name, 'quality-workflow', 'validation.commands'))) throw new Error('Repository validation.commands already exists; preserve it.');
  }
  const current = inventory(repo);
  if (plan.fingerprint !== current.fingerprint) throw new Error('Discovery changed; inspect again before saving.');
  if (!Array.isArray(plan.gates) || !plan.gates.length) throw new Error('At least one real local gate is required; do not substitute a no-op.');
  const nonempty = value => typeof value === 'string' && value.trim();
  for (const gate of plan.gates) {
    if (![gate.name, gate.command, gate.source, gate.reason].every(nonempty) || /[\r\n\0]/.test(gate.command) || /^\s*#/.test(gate.command) || gate.safety !== 'local-validation') throw new Error('Each gate needs name, single-line command, source, reason, safety=local-validation.');
    // This is a tripwire, not a shell security boundary. The agent must inspect scripts.
    if (/\b(?:git\s+(?:push|commit|reset|clean)|(?:npm|pnpm|yarn|bun)\s+(?:publish|install|ci|clean-install)|snyk\s+monitor)\b|--(?:fix|write)\b|curl\b.*\|\s*(?:ba)?sh/.test(gate.command)) throw new Error(`Not a non-mutating local gate: ${gate.name}`);
  }
  if (!Array.isArray(plan.exclusions) || plan.exclusions.some(item => ![item.name, item.source, item.reason].every(nonempty))) throw new Error('exclusions must list CI-only/inapplicable checks and reasons (or [] after inspection).');
  if (!Array.isArray(plan.sources) || !plan.sources.length || plan.sources.some(path => !nonempty(path))) throw new Error('sources must name inspected gate definitions and scripts');
  const sources = [...new Set(plan.sources)].sort().map(path => {
    const sha256 = sourceHash(repo, path);
    if (!sha256) throw new Error(`Missing source: ${path}`);
    return {path, sha256};
  });
  const saved = {version: 1, fingerprint: current.fingerprint, sources, gates: plan.gates, exclusions: plan.exclusions};
  const dir = stateDir(repo);
  if (existsSync(dir) && lstatSync(dir).isSymbolicLink()) throw new Error('Refusing symlink init directory');
  mkdirSync(dir, {recursive: true});
  const atomic = (path, content) => {
    const tmp = `${path}.${randomUUID()}.tmp`;
    writeFileSync(tmp, content, {flag: 'wx', mode: 0o600});
    renameSync(tmp, path);
  };
  const commands = saved.gates.map(gate => gate.command).join('\n') + '\n';
  atomic(join(dir, `${digest(commands)}.commands`), commands);
  atomic(join(dir, 'plan.json'), JSON.stringify(saved, null, 2) + '\n');
  return selectValidation(repo, workflowDir, engine);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [engine, action, file] = process.argv.slice(2);
    if (!['claude', 'codex'].includes(engine) || !['inspect', 'save', 'resolve'].includes(action)) throw new Error('usage: quality-init.mjs claude|codex inspect|resolve|save [plan.json; defaults to stdin]');
    const repo = git(process.cwd(), 'rev-parse', '--show-toplevel');
    const workflowDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    if (action === 'inspect') {
      let selection;
      try { selection = selectValidation(repo, workflowDir, engine); }
      catch (error) { selection = {status: 'NEEDS_ATTENTION', reason: error.message}; }
      console.log(JSON.stringify({repo, stateDir: stateDir(repo), ...selection, ...inventory(repo)}, null, 2));
    } else if (action === 'save') {
      console.log(JSON.stringify(savePlan(repo, workflowDir, engine, JSON.parse(readFileSync(file || 0, 'utf8'))), null, 2));
    } else console.log(selectValidation(repo, workflowDir, engine).path);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
