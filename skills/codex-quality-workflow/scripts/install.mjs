#!/usr/bin/env node
import { createHash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let target = join(homedir(), ".agents", "skills");
let dryRun = false;
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--dry-run") dryRun = true;
  else if (args[index] === "--target" && args[index + 1]) target = resolve(args[++index]);
  else throw new Error("usage: install.sh [--dry-run] [--target <skills-directory>]");
}

function lstatIfPresent(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function assertNoSymlinkComponents(path, boundary = target) {
  const resolvedBoundary = resolve(boundary);
  let cursor = resolve(path);
  const fromBoundary = relative(resolvedBoundary, cursor);
  if (fromBoundary === ".." || fromBoundary.startsWith(`..${sep}`) || isAbsolute(fromBoundary)) {
    throw new Error(`destination escapes installation boundary: ${cursor}`);
  }
  for (;;) {
    if (lstatIfPresent(cursor)?.isSymbolicLink()) throw new Error(`refusing symbolic-link destination: ${cursor}`);
    if (cursor === resolvedBoundary) return;
    cursor = dirname(cursor);
  }
}

assertNoSymlinkComponents(target);

function remove(path, boundary = target) {
  assertNoSymlinkComponents(path, boundary);
  if (!existsSync(path)) return;
  console.log(`${dryRun ? "would remove" : "removing"}: ${path}`);
  if (!dryRun) rmSync(path, { recursive: true, force: true });
}
for (const legacy of ["codex-quality-workflow", "codex-prepare-review"]) remove(join(target, legacy));
const legacyBackupRoot = join(dirname(target), "quality-workflow-backups");
remove(legacyBackupRoot, legacyBackupRoot);

const files = [];
function inventory(source, destination) {
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") continue;
    const src = join(source, entry.name);
    const dest = join(destination, entry.name);
    if (entry.isDirectory()) inventory(src, dest);
    else if (entry.isFile()) files.push({ src, dest });
  }
}
inventory(join(root, "skills"), target);
const digest = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
for (const { src, dest } of files) {
  assertNoSymlinkComponents(dest);
  if (existsSync(dest) && statSync(dest).isFile() && digest(src) === digest(dest)) continue;
  console.log(`${dryRun ? "would install" : "installing"}: ${dest}`);
  if (!dryRun) { mkdirSync(dirname(dest), { recursive: true }); cpSync(src, dest); }
}

if (!dryRun) {
  assertNoSymlinkComponents(target);
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, ".codex-quality-review-manifest.json"), `${JSON.stringify({ version: "1.0.0", files: files.map(({ dest }) => relative(target, dest)).sort() }, null, 2)}\n`);
}
console.log(`${dryRun ? "Dry run complete" : "Installation complete"}: ${target}`);
console.log("Skills: $codex-quality-review, $codex-fix-review, $codex-final-review");
