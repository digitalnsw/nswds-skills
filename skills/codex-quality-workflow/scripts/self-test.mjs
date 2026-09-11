#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, readdirSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runLane } from '../skills/codex-quality-workflow/scripts/run-lane.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const initTest = spawnSync(process.execPath, [join(root, 'scripts/init-test.mjs')], {encoding: 'utf8'});
assert.equal(initTest.status, 0, initTest.stdout + initTest.stderr);
console.log(initTest.stdout.trim());
const skill = join(root, 'skills/codex-quality-workflow');
const temp = realpathSync(mkdtempSync(join(tmpdir(), 'codex-quality-test-')));
const repo = join(temp, 'repo'); mkdirSync(repo);
const save = (p, v) => {mkdirSync(dirname(p), {recursive:true}); writeFileSync(p, typeof v === 'string' ? v : JSON.stringify(v));};
function command(binary, args, cwd = repo, expected = 0) {
  const r = spawnSync(binary, args, {cwd, encoding:'utf8', maxBuffer:16*1024*1024});
  assert.equal(r.status, expected, r.stdout + r.stderr);
  return r.stdout.trim();
}
const git = (...args) => command('git', args);
const script = (name, ...args) => command(name.endsWith('.sh') ? 'bash' : process.execPath, [join(skill, 'scripts', name), ...args]);
git('init', '-b', 'main'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
save(join(repo,'source.txt'), 'base\n'); git('add','.'); git('commit','-m','base');
git('switch','-c','feature');
save(join(repo,'source.txt'), 'feature\n');
save(join(repo,'.claude/quality-workflow/validation.commands'), 'test -f source.txt\n');
save(join(repo,'.claude/quality-workflow/analysis.commands'), 'required\tfixture\ttrue\n');
git('add','.'); git('commit','-m','feature');
script('freeze.sh'); script('prepare-review.sh','initial');
const stateDir = join(repo,'.git/codex-quality-workflow');
const evidencePath = () => readFileSync(join(stateDir,'current-evidence.env'),'utf8').split('\n').find(l=>l.startsWith('EVIDENCE_DIR=')).slice(13) + '/manifest.json';
let manifestPath = evidencePath();
let manifest = JSON.parse(readFileSync(manifestPath));
assert(manifest.ready && manifest.validation.configured);
assert.equal(git('status','--porcelain'),'');
const fixtureReport = JSON.parse(readFileSync(join(skill,'examples/findings.example.json')));
const runtime = {binary:process.execPath, prefix:[join(root,'scripts/fake-codex.mjs')]};
function job(name, overrides={}) {
  const path = join(stateDir,'jobs',name+'.json');
  save(path, {role:'gate', repository:repo, evidence:manifestPath, scope:name,
    passes:[4,7,9], baseSha:manifest.baseSha, headSha:manifest.headSha,
    target:'frozen-implementation', inputs:[], ...overrides});
  return path;
}
for (const name of ['partial-first','narration-first']) {
  const p = job(name); const result = await runLane(p,runtime);
  assert.equal(result.attempts,2); assert(result.complete);
  assert.equal((await runLane(p,runtime)).attempts,2); // cached completion, no new worker
}
save(join(repo,'source.txt'),'changed after preparation\n');
await assert.rejects(runLane(job('stale-input'),runtime), /source differs/);
save(join(repo,'source.txt'),'feature\n');
for (const name of ['always-partial','wrong-sha','missing-pass']) {
  const p = job(name);
  await assert.rejects(runLane(p,runtime), /BLOCKED_INCOMPLETE_REVIEW/);
  await assert.rejects(runLane(p,runtime), /BLOCKED_INCOMPLETE_REVIEW/); // cannot reset allowance
}
const union = join(stateDir,'union.json');
save(union,fixtureReport);
await assert.rejects(runLane(job('missing-id',{role:'triage',inputs:[union],passes:[]}),runtime),/BLOCKED_INCOMPLETE_REVIEW/);
script('repair-state.mjs','init');
const indexBefore = git('write-tree');
save(join(repo,'source.txt'),'accepted repair\n'); save(join(repo,'new-test.txt'),'regression\n');
script('repair-state.mjs','candidate','R-001'); script('repair-state.mjs','accept','R-001');
script('prepare-review.sh','final');
assert.equal(git('write-tree'),indexBefore);
const accepted = JSON.parse(readFileSync(join(stateDir,'repair-state.json'))).acceptedCommit;
assert.equal(JSON.parse(readFileSync(evidencePath())).headSha, accepted);
// Fresh freeze must archive previous repairs, not review the old accepted snapshot.
git('add','.'); git('commit','-m','accepted fixture repair'); script('freeze.sh');
assert(!existsSync(join(stateDir,'repair-state.json')));
script('prepare-review.sh','initial'); manifestPath=evidencePath(); manifest=JSON.parse(readFileSync(manifestPath));
const finding = join(stateDir,'finding.json'); save(finding,fixtureReport.findings[0]);
await assert.rejects(runLane(job('repair-once',{role:'repair',baseSha:manifest.headSha,inputs:[finding]}),runtime), /BLOCKED_REPAIR/);
assert(existsSync(join(repo,'unaccepted.txt')));
assert.equal(git('diff','--cached'),'');
// Installer dry run, copy, preservation, idempotence and isolation.
const target=join(temp,'installed-skills');
command(process.execPath,[join(root,'scripts/install.mjs'),'--dry-run','--target',target]);
assert(!existsSync(target));
command(process.execPath,[join(root,'scripts/install.mjs'),'--target',target]);
assert(existsSync(join(target,'codex-quality-workflow/SKILL.md')));
const again=command(process.execPath,[join(root,'scripts/install.mjs'),'--target',target]);
assert(again.includes('0 changed files'));
for (const f of readdirSync(join(skill,'scripts'))) {
  if (f.endsWith('.sh')) command('bash',['-n',join(skill,'scripts',f)]);
  if (f.endsWith('.mjs')) command(process.execPath,['--check',join(skill,'scripts',f)]);
}
console.log('PASS: preparation, Claude config fallback, automatic partial/narration recovery, exhaustion persistence, SHA/pass/triage gates, snapshots/index preservation, one-attempt repair, refreeze, dry-run and idempotent installation.');
console.log('Retained test evidence: '+temp);
