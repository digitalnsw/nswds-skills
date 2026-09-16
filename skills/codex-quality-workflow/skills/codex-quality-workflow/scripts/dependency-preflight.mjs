#!/usr/bin/env node
import {readFileSync, existsSync, lstatSync, realpathSync, statSync, mkdirSync, writeFileSync, unlinkSync, rmdirSync} from 'node:fs';
import {resolve, join, relative, isAbsolute, dirname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync, execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');
const readJSON = path => JSON.parse(readFileSync(path, 'utf8'));
const git = (repo, ...args) => execFileSync('git', ['-C',repo,...args], {encoding:'utf8',maxBuffer:64*1024*1024}).trim();
const gitPath = (repo, name) => resolve(repo, git(repo,'rev-parse','--git-path',name));
const dependencyFields = ['dependencies','devDependencies','optionalDependencies'];
const same = (a,b) => JSON.stringify(Object.entries(a || {}).sort()) === JSON.stringify(Object.entries(b || {}).sort());
const lstatExists = path => {try {lstatSync(path); return true;} catch {return false;}};
const contained = (root, path) => {
  const rel = relative(root, path);
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel));
};
function existingPathContained(repo, path) {
  const root = realpathSync(repo);
  let current = path;
  while (!lstatExists(current)) {
    const parent = dirname(current);
    if (parent === current) return false;
    current = parent;
  }
  try {return contained(root, realpathSync(current));} catch {return false;}
}

export function inspectDependencies(repo) {
  const manifestPath = join(repo,'package.json');
  if (!existsSync(manifestPath)) return {status:'NOT_APPLICABLE',issues:[]};
  const manifest = readJSON(manifestPath);
  const manager = manifest.packageManager?.split('@')[0];
  const lockName = existsSync(join(repo,'npm-shrinkwrap.json')) ? 'npm-shrinkwrap.json' : 'package-lock.json';
  if ((manager && manager !== 'npm') || !existsSync(join(repo,lockName))) {
    const needsManager = manifest.workspaces || dependencyFields.some(key=>Object.keys(manifest[key] || {}).length);
    return {status:needsManager ? 'MANUAL_PREFLIGHT' : 'NOT_APPLICABLE', issues:needsManager ? ['Use the declared package manager and frozen lockfile; npm restoration is not applicable.'] : []};
  }
  const lock = readJSON(join(repo,lockName));
  if (!lock.packages?.['']) return {status:'MANUAL_PREFLIGHT',issues:['An npm v2/v3 package lock with package records is required.']};
  const issues = [], blockers = [], links = [];
  for (const field of dependencyFields) {
    if (!same(manifest[field],lock.packages[''][field])) blockers.push(`Root ${field} differs from the lockfile`);
  }
  if (!same(manifest.workspaces,lock.packages[''].workspaces)) blockers.push('Workspace declarations differ from the lockfile');
  for (const [path,entry] of Object.entries(lock.packages)) {
    if (!entry.link) continue;
    const destination = resolve(repo,path), target = resolve(repo,entry.resolved || '');
    if (!destination.startsWith(repo+'/') || !target.startsWith(repo+'/')) {
      blockers.push(`Link escapes repository: ${path}`); continue;
    }
    const workspaceManifest = join(target,'package.json');
    if (!existsSync(workspaceManifest)) {blockers.push(`Missing local package: ${entry.resolved}`); continue;}
    const declared = readJSON(workspaceManifest), locked = lock.packages[entry.resolved];
    if (!locked) {blockers.push(`Missing lock entry: ${entry.resolved}`); continue;}
    for (const field of dependencyFields) {
      if (!same(declared[field],locked[field])) blockers.push(`${entry.resolved} ${field} differs from the lockfile`);
    }
    let valid = false;
    try {valid = lstatSync(destination).isSymbolicLink() && realpathSync(destination) === realpathSync(target);} catch {}
    links.push({path,target:entry.resolved,valid});
    if (!valid) issues.push(`Missing or incorrect workspace link: ${path}`);
  }
  const installedLockPath = join(repo,'node_modules/.package-lock.json');
  const installedSafe = existingPathContained(repo, installedLockPath);
  if (!installedSafe) blockers.push('Installed dependency tree resolves outside repository');
  const installed = installedSafe && existsSync(installedLockPath) ? readJSON(installedLockPath) : null;
  if (!installed) issues.push('Installed dependency inventory is missing');
  for (const [path,entry] of Object.entries(lock.packages)) {
    if (!path.includes('node_modules/') || entry.link || entry.optional || entry.devOptional) continue;
    const full=resolve(repo,path);
    if (!contained(resolve(repo),full) || !existingPathContained(repo,full)) {blockers.push(`Locked path escapes repository: ${path}`); continue;}
    const packagePath=join(full,'package.json');
    if (!existsSync(packagePath)) issues.push(`Required locked package is missing: ${path}`);
    else if (entry.version && readJSON(packagePath).version !== entry.version) issues.push(`Installed version differs from lockfile: ${path}`);
  }
  // Check packages npm actually recorded, avoiding false alarms for optional
  // packages intentionally omitted on this operating system.
  for (const [path,entry] of Object.entries(installed?.packages || {})) {
    if (!path.includes('node_modules/')) continue;
    const full = resolve(repo,path);
    if (!contained(resolve(repo),full) || !existingPathContained(repo,full)) {blockers.push(`Installed path escapes repository: ${path}`); continue;}
    if (!existsSync(full)) issues.push(`Installed package is missing: ${path}`);
    const expected = lock.packages[path];
    if (!expected || expected.version !== entry.version || expected.resolved !== entry.resolved) issues.push(`Installed inventory differs from lockfile: ${path}`);
  }
  return {status:blockers.length ? 'BLOCKED_LOCKFILE' : issues.length ? 'NEEDS_RESTORE' : 'READY',lockName,issues:[...blockers,...issues],links};
}

export function sourceFingerprint(repo) {
  const parts = [git(repo,'rev-parse','HEAD'),git(repo,'diff','--binary','HEAD','--'),git(repo,'diff','--cached','--binary','--')];
  const paths = execFileSync('git',['-C',repo,'ls-files','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean).sort();
  for (const path of paths) parts.push(path,git(repo,'hash-object','--',path));
  return hash(JSON.stringify(parts));
}

export function dependencyFingerprint(repo) {
  const paths = ['package-lock.json','npm-shrinkwrap.json','node_modules/.package-lock.json'];
  return hash(JSON.stringify([process.version,...paths.map(path=>{
    const full=join(repo,path);
    return existsSync(full) ? [path,hash(readFileSync(full)),statSync(full).mtimeMs] : [path,null];
  })]));
}

export function restoreDependencies(repo) {
  const initial = inspectDependencies(repo);
  if (initial.status !== 'NEEDS_RESTORE') return {code:initial.status === 'READY' || initial.status === 'NOT_APPLICABLE' ? 0 : 78,...initial};
  const tracked = execFileSync('git',['-C',repo,'ls-files','-z'],{encoding:'utf8'}).split('\0');
  if (tracked.some(path=>path.split('/').includes('node_modules'))) return {code:78,status:'UNSAFE_TREE',issues:['Tracked node_modules content would be deleted by clean installation; manual preparation is required.']};
  const modules = join(repo,'node_modules');
  if (existsSync(modules) && lstatSync(modules).isSymbolicLink()) return {code:78,status:'UNSAFE_TREE',issues:['node_modules is a symlink; refuse to replace a shared dependency tree.']};
  const before = sourceFingerprint(repo);
  const state = gitPath(repo,'quality-workflow-dependencies');
  mkdirSync(state,{recursive:true});
  const attempt = join(state,`${before}.json`);
  if (existsSync(attempt)) return {code:78,status:'RESTORE_EXHAUSTED',issues:['One restore was already attempted for this exact source state. Diagnose the saved result; do not loop or delete the record to reset the budget.'],attempt};
  const locks=[];
  try {
    // Reserve both adapters' existing validation locks, so restore cannot collide
    // with validation or another restore in this worktree. Do not remove stale
    // locks belonging to someone else.
    for (const engine of ['claude','codex']) {
      const parent=gitPath(repo,`${engine}-quality-workflow`);
      mkdirSync(parent,{recursive:true});
      const lock=join(parent,'validation.lock');
      try {mkdirSync(lock);} catch (error) {if(error.code==='EEXIST') return {code:75,status:'BUSY',issues:['Validation or dependency setup is already running. Wait for it; do not start a competing install.']}; throw error;}
      locks.push(lock);
      writeFileSync(join(lock,'owner'),`PID=${process.pid}\nSTARTED_AT_EPOCH=${Math.floor(Date.now()/1000)}\n`);
    }
    // wx makes the one-attempt budget persistent even after an interrupted run.
    writeFileSync(attempt,JSON.stringify({status:'STARTED',before,issues:initial.issues},null,2),{flag:'wx'});
    console.log('Restoring npm dependencies from the existing lockfile; lifecycle scripts are disabled.');
    const result=spawnSync('npm',['ci','--ignore-scripts','--include=dev','--no-audit','--no-fund','--cache',join(state,'npm-cache')],{cwd:repo,stdio:'inherit',timeout:15*60*1000,env:{...process.env,npm_config_package_lock:'true'}});
    const unchanged=sourceFingerprint(repo)===before;
    const checked=inspectDependencies(repo);
    const report={status:!unchanged ? 'SOURCE_CHANGED' : result.status !== 0 ? 'RESTORE_FAILED' : checked.status,issues:checked.issues,sourceUnchanged:unchanged,exitCode:result.status,error:result.error?.message,before};
    writeFileSync(attempt,JSON.stringify(report,null,2));
    return {code:unchanged && result.status===0 && checked.status==='READY' ? 0 : 78,...report,attempt};
  } finally {
    for (const lock of locks.reverse()) {if(existsSync(join(lock,'owner'))) unlinkSync(join(lock,'owner')); rmdirSync(lock);}
  }
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const action=process.argv[2] || 'check';
    const repo=git(process.cwd(),'rev-parse','--show-toplevel');
    if (action==='fingerprint') console.log(dependencyFingerprint(repo));
    else if (action==='check' || action==='restore') {
      const result=action==='restore' ? restoreDependencies(repo) : inspectDependencies(repo);
      console.log(JSON.stringify(result,null,2));
      process.exitCode=result.code ?? (['READY','NOT_APPLICABLE'].includes(result.status) ? 0 : 78);
    } else throw new Error('usage: dependency-preflight.mjs [check|restore|fingerprint]');
  } catch(error) {console.error(error.message);process.exitCode=78;}
}
