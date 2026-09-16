#!/usr/bin/env node
// Parent-only, inspected local build recovery. Never infer commands from errors.
import {existsSync, mkdirSync, readFileSync, writeFileSync, openSync, closeSync, unlinkSync, rmdirSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {execFileSync, spawnSync, spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sourceFingerprint} from './dependency-preflight.mjs';

const git = (repo, ...args) => execFileSync('git', ['-C', repo, ...args], {encoding:'utf8'}).trim();
async function runProducer(repo, command, fd, timeoutMs) {
  return new Promise(resolveResult => {
    const child = spawn(command[0], command.slice(1), {cwd:repo,stdio:['ignore',fd,fd],detached:true});
    let interrupted = false;
    const stop = () => {
      interrupted = true;
      // Kill the whole producer group before releasing locks or checking source.
      try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    };
    const timer = setTimeout(stop, timeoutMs);
    process.once('SIGTERM', stop); process.once('SIGINT', stop);
    const finish = result => {
      clearTimeout(timer); process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop);
      resolveResult({...result,interrupted});
    };
    child.once('error', error => finish({status:null,error}));
    child.once('close', status => finish({status}));
  });
}
export async function recoverBuild(repo, plan, {timeoutMs=600000}={}) {
  if (process.platform === 'win32') throw new Error('Build recovery requires POSIX process-group isolation');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 600000) throw new Error('Invalid recovery timeout');
  if (!Array.isArray(plan.command) || !plan.command.length || !plan.command.every(x => typeof x === 'string' && x) ||
      !Array.isArray(plan.outputs) || !plan.outputs.length || typeof plan.reason !== 'string' || !plan.reason.trim())
    throw new Error('Plan requires inspected command argv, exact ignored outputs, and an evidence-backed reason');
  const outputs = plan.outputs.map(path => {
    if (typeof path !== 'string') throw new Error('Invalid output');
    const full = resolve(repo, path);
    if (!full.startsWith(repo + '/')) throw new Error('Output escapes repository');
    const ignored = spawnSync('git', ['check-ignore', '-q', '--', path], {cwd:repo});
    if (ignored.status !== 0) throw new Error('Recovery outputs must be ignored, untracked build artifacts: ' + path);
    return full;
  });
  if (outputs.every(existsSync)) return {status:'NOT_NEEDED',code:0};
  const before = sourceFingerprint(repo);
  const state = resolve(repo, git(repo, 'rev-parse', '--git-path', 'quality-workflow-build-recovery'));
  mkdirSync(state, {recursive:true});
  const record = join(state, before + '.json');
  const log = join(state, before + '.log');
  const locks = [];
  try {
    for (const engine of ['claude', 'codex']) {
      const parent = resolve(repo, git(repo, 'rev-parse', '--git-path', engine + '-quality-workflow'));
      mkdirSync(parent, {recursive:true});
      const lock = join(parent, 'validation.lock');
      try { mkdirSync(lock); } catch (error) {
        if (error.code === 'EEXIST') return {status:'BUSY',code:75};
        throw error;
      }
      locks.push(lock);
      writeFileSync(join(lock, 'owner'), 'PID=' + process.pid + '\nSTARTED_AT_EPOCH=' + Math.floor(Date.now()/1000) + '\n');
    }
    if (existsSync(record)) return {status:'RECOVERY_EXHAUSTED',code:78,record};
    writeFileSync(record, JSON.stringify({status:'STARTED',before,plan,log}), {flag:'wx'});
    const fd = openSync(log, 'w');
    let result;
    try {
      result = await runProducer(repo, plan.command, fd, timeoutMs);
    } finally { closeSync(fd); }
    const sourceUnchanged = sourceFingerprint(repo) === before;
    const missing = outputs.filter(path => !existsSync(path));
    const status = !sourceUnchanged ? 'SOURCE_CHANGED' : result.interrupted || result.status !== 0 || missing.length ? 'RECOVERY_FAILED' : 'RECOVERED';
    const report = {status,code:status === 'RECOVERED' ? 0 : 78,sourceUnchanged,missing,exitCode:result.status,error:result.error?.message,before,plan,log};
    writeFileSync(record, JSON.stringify(report,null,2) + '\n');
    return {...report,record};
  } finally {
    for (const lock of locks.reverse()) { unlinkSync(join(lock,'owner')); rmdirSync(lock); }
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const repo = git(process.cwd(), 'rev-parse', '--show-toplevel');
    const plan = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    const result = await recoverBuild(repo, plan);
    console.log(JSON.stringify(result,null,2)); process.exitCode = result.code;
  } catch (error) { console.error(error.message); process.exitCode = 78; }
}
