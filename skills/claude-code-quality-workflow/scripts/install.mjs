#!/usr/bin/env node
import { createHash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let target = process.env.CLAUDE_CONFIG_DIR ? resolve(process.env.CLAUDE_CONFIG_DIR) : join(homedir(), ".claude");
let dryRun = false;
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--dry-run") dryRun = true;
  else if (args[index] === "--target" && args[index + 1]) target = resolve(args[++index]);
  else throw new Error("usage: install.sh [--dry-run] [--target <claude-config-directory>]");
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

const sourceRoots = [
  [join(root, ".claude", "agents"), join(target, "agents")],
  [join(root, ".claude", "skills"), join(target, "skills")],
  [join(root, ".claude", "quality-review"), join(target, "quality-review")]
];
const current = new Set();
const files = [];
const scheduledRemovals = new Set();
function inventory(source, destination) {
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") continue;
    const src = join(source, entry.name);
    const dest = join(destination, entry.name);
    if (entry.isDirectory()) inventory(src, dest);
    else if (entry.isFile()) {
      const rel = relative(target, dest);
      current.add(rel);
      files.push({ src, dest, rel });
    }
  }
}
for (const pair of sourceRoots) inventory(...pair);

function removePath(path, label = "removing") {
  assertNoSymlinkComponents(path);
  if (!existsSync(path) || scheduledRemovals.has(path)) return;
  scheduledRemovals.add(path);
  console.log(`${dryRun ? "would remove" : label}: ${path}`);
  if (!dryRun) rmSync(path, { recursive: true, force: true });
}

const oldManifest = join(target, "quality-workflow", "install-manifest.json");
assertNoSymlinkComponents(oldManifest);
if (existsSync(oldManifest)) {
  try {
    const parsed = JSON.parse(readFileSync(oldManifest, "utf8"));
    if (!Array.isArray(parsed.files)) throw new Error("manifest files must be an array");
    for (const rel of parsed.files) {
      try {
        if (typeof rel !== "string" || rel.length === 0 || isAbsolute(rel) || normalize(rel) !== rel) {
          throw new Error("entry must be a non-empty normalized relative path");
        }
        const destination = resolve(target, rel);
        const fromTarget = relative(target, destination);
        if (!fromTarget || fromTarget === ".." || fromTarget.startsWith(`..${sep}`) || isAbsolute(fromTarget)) {
          throw new Error("entry escapes the installation target");
        }
        if (!current.has(rel)) removePath(destination);
      } catch (error) {
        console.warn(`warning: skipping invalid legacy manifest entry ${JSON.stringify(rel)}: ${error.message}`);
      }
    }
  } catch {
    console.warn(`warning: could not read legacy manifest: ${oldManifest}`);
  }
}

for (const name of ["behavior-reviewer.md", "contract-reviewer.md", "final-code-reviewer.md", "findings-triager.md", "gate-reviewer.md", "quality-orchestrator.md", "repair-diff-reviewer.md", "senior-code-reviewer.md", "targeted-repairer.md"]) {
  removePath(join(target, "agents", name));
}
for (const name of ["freeze-review", "prepare-review", "quality-init", "quality-workflow", "repair-diff-review", "repair-review-finding", "triage-findings", "validate-change"]) {
  removePath(join(target, "skills", name));
}
removePath(join(target, "quality-workflow"));
removePath(join(target, "quality-workflow-backups"));

const settingsPath = join(target, "settings.json");
if (existsSync(settingsPath) && !lstatSync(settingsPath).isSymbolicLink()) {
  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    const legacyHookCommands = new Set(["quick-check.sh", "verify-on-stop.sh"].map((name) =>
      `"${join(target, "quality-workflow", "scripts", name)}"`.replaceAll("\\", "/")
    ));
    let changed = false;
    for (const event of ["PostToolUse", "Stop"]) {
      if (!Array.isArray(settings.hooks?.[event])) continue;
      const groups = [];
      for (const group of settings.hooks[event]) {
        if (!Array.isArray(group?.hooks)) { groups.push(group); continue; }
        const hooks = group.hooks.filter((hook) => {
          const legacy = typeof hook?.command === "string" && legacyHookCommands.has(hook.command.replaceAll("\\", "/"));
          if (legacy) changed = true;
          return !legacy;
        });
        if (hooks.length) groups.push({ ...group, hooks });
        else if (group.hooks.length === 0) groups.push(group);
      }
      settings.hooks[event] = groups;
    }
    if (changed) {
      console.log(`${dryRun ? "would remove legacy hooks from" : "removing legacy hooks from"}: ${settingsPath}`);
      if (!dryRun) writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, { mode: statSync(settingsPath).mode });
    }
  } catch {
    console.warn(`warning: could not remove legacy hooks from ${settingsPath}`);
  }
}

const claudeMdPath = join(target, "CLAUDE.md");
if (existsSync(claudeMdPath) && !lstatSync(claudeMdPath).isSymbolicLink()) {
  const original = readFileSync(claudeMdPath, "utf8");
  const cleaned = original.replace(/\n?<!-- claude-quality-workflow:start -->[\s\S]*?<!-- claude-quality-workflow:end -->\n?/g, "\n").replace(/^\n+|\n+$/g, "");
  if (cleaned !== original) {
    console.log(`${dryRun ? "would remove legacy import from" : "removing legacy import from"}: ${claudeMdPath}`);
    if (!dryRun) writeFileSync(claudeMdPath, cleaned ? `${cleaned}\n` : "", { mode: statSync(claudeMdPath).mode });
  }
}

function digest(path) { return createHash("sha256").update(readFileSync(path)).digest("hex"); }
for (const { src, dest } of files) {
  assertNoSymlinkComponents(dest);
  if (existsSync(dest) && statSync(dest).isFile() && digest(src) === digest(dest)) continue;
  console.log(`${dryRun ? "would install" : "installing"}: ${dest}`);
  if (!dryRun) { mkdirSync(dirname(dest), { recursive: true }); cpSync(src, dest); }
}

if (!dryRun) {
  const manifest = join(target, "quality-review", "install-manifest.json");
  assertNoSymlinkComponents(manifest);
  mkdirSync(dirname(manifest), { recursive: true });
  writeFileSync(manifest, `${JSON.stringify({ version: "1.0.0", files: [...current].sort() }, null, 2)}\n`);
}
console.log(`${dryRun ? "Dry run complete" : "Installation complete"}: ${target}`);
console.log("Commands: /quality-review, /fix-review, /final-review");
