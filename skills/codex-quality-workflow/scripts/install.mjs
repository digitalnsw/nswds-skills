#!/usr/bin/env node
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let target = join(homedir(), '.agents', 'skills');
let dry = false;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dry-run') dry = true;
  else if (args[i] === '--target' && args[i + 1]) target = resolve(args[++i]);
  else throw new Error('usage: install.sh [--dry-run] [--target <skills-directory>]');
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = join(dirname(target), 'quality-workflow-backups', stamp);
const files = [];
function inventory(src, rel = '') {
  for (const entry of readdirSync(src, {withFileTypes: true})) {
    if (entry.name.startsWith('.')) continue;
    const p = join(rel, entry.name);
    if (entry.isDirectory()) inventory(join(src, entry.name), p);
    else if (entry.isFile()) files.push(p);
  }
}
inventory(join(root, 'skills'));
// Resolve all collisions before any mutation; never overwrite through symlinks.
for (const file of files) {
  let cursor = join(target, file);
  for (;;) {
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error('refusing symlink destination: ' + cursor);
    if (cursor === dirname(cursor)) break;
    cursor = dirname(cursor);
  }
}
let changes = 0;
for (const file of files) {
  const src = join(root, 'skills', file), dest = join(target, file);
  if (existsSync(dest) && readFileSync(src).equals(readFileSync(dest))) continue;
  changes++;
  if (existsSync(dest)) {
    console.log(`${dry ? 'Would back up' : 'Backing up'}: ${dest}`);
    if (!dry) {mkdirSync(dirname(join(backup, file)), {recursive: true}); cpSync(dest, join(backup, file));}
  }
  console.log(`${dry ? 'Would install' : 'Installing'}: ${dest}`);
  if (!dry) {mkdirSync(dirname(dest), {recursive: true}); cpSync(src, dest);}
}
console.log(`${dry ? 'Dry run (no files changed)' : 'Installation complete'}: ${target}; ${changes} changed files`);
console.log('Invoke $codex-quality-workflow in a repository. Existing Codex settings and Claude installation are untouched.');
