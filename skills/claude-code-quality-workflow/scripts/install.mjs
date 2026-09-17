#!/usr/bin/env node
// Installs /quality-review, /fix-review and /final-review into a Claude Code
// configuration directory (default ~/.claude), or removes them again.
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = "usage: install.sh [--dry-run] [--uninstall] [--target <claude-config-directory>] [--model <model>]";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let target = process.env.CLAUDE_CONFIG_DIR ? resolve(process.env.CLAUDE_CONFIG_DIR) : join(homedir(), ".claude");
let dryRun = false;
let uninstall = false;
let model = "";
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--dry-run") dryRun = true;
  else if (args[index] === "--uninstall") uninstall = true;
  else if (args[index] === "--target" && args[index + 1]) target = resolve(args[++index]);
  else if (args[index] === "--model" && /^[\w.[\]-]+$/.test(args[index + 1] ?? "")) model = args[++index];
  else { console.error(USAGE); process.exit(1); }
}

const say = (now, later, detail) => console.log(`${dryRun ? later : now}: ${detail}`);
const digest = (content) => createHash("sha256").update(content).digest("hex");

function lstatIfPresent(path) {
  try { return lstatSync(path); } catch (error) { if (error?.code === "ENOENT") return null; throw error; }
}

// Every path written or removed must stay inside the target and must not pass
// through a symbolic link, so a planted link cannot redirect a write or delete.
function assertSafe(path) {
  let cursor = resolve(path);
  const fromTarget = relative(target, cursor);
  if (fromTarget === ".." || fromTarget.startsWith(`..${sep}`) || isAbsolute(fromTarget)) throw new Error(`path escapes the installation target: ${cursor}`);
  for (;;) {
    if (lstatIfPresent(cursor)?.isSymbolicLink()) throw new Error(`refusing symbolic-link destination: ${cursor}`);
    if (cursor === target) return;
    cursor = dirname(cursor);
  }
}

function safeRelative(rel) {
  if (typeof rel !== "string" || !rel || isAbsolute(rel) || normalize(rel) !== rel || rel === ".." || rel.startsWith(`..${sep}`)) throw new Error("not a normalized path inside the target");
  return rel;
}

function removeFile(path) {
  assertSafe(path);
  if (!lstatIfPresent(path)) return;
  say("removed", "would remove", path);
  if (!dryRun) rmSync(path, { recursive: true, force: true });
}

function pruneEmpty(directory) {
  for (let cursor = directory; cursor !== target && cursor.startsWith(target); cursor = dirname(cursor)) {
    try { if (readdirSync(cursor).length) return; if (!dryRun) rmdirSync(cursor); } catch { return; }
    if (dryRun) return;
  }
}

function readManifest(path) {
  assertSafe(path);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { console.warn(`warning: ignoring unreadable manifest: ${path}`); return null; }
}

process.on("uncaughtException", (error) => { console.error(`install: ${error.message}`); process.exit(1); });
assertSafe(target);
const hadVersionOneRuntime = existsSync(join(target, "quality-workflow", "install-manifest.json"));
const skillsSource = join(root, ".claude", "skills");
const reviewDirectory = join(target, "skills", "quality-review");
const manifestPath = join(reviewDirectory, ".install-manifest.json");
const backupRoot = join(target, "backups", "quality-review");

const wanted = new Map();
(function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") continue;
    const source = join(directory, entry.name);
    if (entry.isDirectory()) { collect(source); continue; }
    if (!entry.isFile()) continue;
    let content = readFileSync(source);
    if (entry.name.endsWith(".md")) {
      let text = content.toString("utf8").replaceAll("__QUALITY_REVIEW_DIR__", reviewDirectory.replaceAll("\\", "/"));
      if (model) text = text.replace(/^model: .*$/m, `model: ${model}`);
      content = Buffer.from(text);
    }
    wanted.set(join("skills", relative(skillsSource, source)), content);
  }
})(skillsSource);

// Files this package put there earlier. `owned` maps a path to the hash that was
// installed (null when an older manifest recorded the path without a hash).
const owned = new Map();
const previous = readManifest(manifestPath);
for (const [rel, hash] of Object.entries(previous?.files ?? {})) {
  try { owned.set(safeRelative(rel), hash); } catch (error) { console.warn(`warning: skipping manifest entry ${JSON.stringify(rel)}: ${error.message}`); }
}
const legacyManifests = [join(target, "quality-review", "install-manifest.json"), join(target, "quality-workflow", "install-manifest.json")];
for (const path of legacyManifests) {
  const legacy = readManifest(path);
  for (const rel of Array.isArray(legacy?.files) ? legacy.files : []) {
    try { if (!owned.has(safeRelative(rel))) owned.set(rel, null); } catch (error) { console.warn(`warning: skipping manifest entry ${JSON.stringify(rel)}: ${error.message}`); }
  }
}

function untouched(rel) {
  const path = join(target, rel);
  const stat = lstatIfPresent(path);
  if (!stat?.isFile()) return false;
  const recorded = owned.get(rel);
  return recorded === null || recorded === digest(readFileSync(path));
}

// Remove what earlier versions installed and this version does not.
for (const rel of owned.keys()) {
  if (!uninstall && wanted.has(rel)) continue;
  const path = join(target, rel);
  if (!lstatIfPresent(path)) continue;
  if (untouched(rel)) { removeFile(path); pruneEmpty(dirname(path)); }
  else console.log(`kept (modified since it was installed): ${path}`);
}
for (const path of legacyManifests) removeFile(path);
for (const name of ["quality-review", "quality-workflow"]) pruneEmpty(join(target, name));
removeLegacyWorkflow();

const backedUp = [];
if (uninstall) {
  removeFile(manifestPath);
  pruneEmpty(reviewDirectory);
} else {
  for (const [rel, content] of wanted) {
    const destination = join(target, rel);
    assertSafe(destination);
    const stat = lstatIfPresent(destination);
    if (stat?.isFile() && digest(readFileSync(destination)) === digest(content)) continue;
    if (stat && !untouched(rel)) {
      let backup = join(backupRoot, rel);
      for (let count = 1; existsSync(backup) && digest(readFileSync(backup)) !== digest(readFileSync(destination)); count += 1) backup = `${join(backupRoot, rel)}.${count}`;
      assertSafe(backup);
      backedUp.push(backup);
      if (!dryRun) { mkdirSync(dirname(backup), { recursive: true }); writeFileSync(backup, readFileSync(destination)); }
    }
    say(stat ? "updated" : "installed", stat ? "would update" : "would install", destination);
    if (!dryRun) { mkdirSync(dirname(destination), { recursive: true }); writeFileSync(destination, content); }
  }
  const manifest = `${JSON.stringify({ package: "claude-code-quality-workflow", files: Object.fromEntries([...wanted].sort(([a], [b]) => a.localeCompare(b)).map(([rel, content]) => [rel, digest(content)])) }, null, 2)}\n`;
  if (!dryRun && (!existsSync(manifestPath) || readFileSync(manifestPath, "utf8") !== manifest)) { mkdirSync(reviewDirectory, { recursive: true }); writeFileSync(manifestPath, manifest); }
}

// Version 1 of this package also registered hooks in settings.json, imported
// itself into CLAUDE.md and kept a runtime directory. Remove exactly those.
function removeLegacyWorkflow() {
  const runtime = join(target, "quality-workflow");
  const settingsPath = join(target, "settings.json");
  if (existsSync(settingsPath) && !lstatSync(settingsPath).isSymbolicLink()) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
      const legacy = new Set(["quick-check.sh", "verify-on-stop.sh"].map((name) => `"${join(runtime, "scripts", name)}"`.replaceAll("\\", "/")));
      let changed = false;
      for (const event of ["PostToolUse", "Stop"]) {
        if (!Array.isArray(settings.hooks?.[event])) continue;
        settings.hooks[event] = settings.hooks[event].flatMap((group) => {
          if (!Array.isArray(group?.hooks)) return [group];
          const hooks = group.hooks.filter((hook) => !(typeof hook?.command === "string" && legacy.has(hook.command.replaceAll("\\", "/"))));
          if (hooks.length === group.hooks.length) return [group];
          changed = true;
          return hooks.length ? [{ ...group, hooks }] : [];
        });
      }
      if (changed) {
        say("removed version 1 hooks from", "would remove version 1 hooks from", settingsPath);
        if (!dryRun) writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, { mode: statSync(settingsPath).mode });
      }
    } catch { console.warn(`warning: could not read ${settingsPath}; version 1 hooks, if any, were left in place`); }
  }
  const claudeMd = join(target, "CLAUDE.md");
  if (existsSync(claudeMd) && !lstatSync(claudeMd).isSymbolicLink()) {
    const original = readFileSync(claudeMd, "utf8");
    const cleaned = original.replace(/\n?<!-- claude-quality-workflow:start -->[\s\S]*?<!-- claude-quality-workflow:end -->\n?/g, "\n");
    if (cleaned !== original) {
      say("removed version 1 import from", "would remove version 1 import from", claudeMd);
      if (!dryRun) writeFileSync(claudeMd, cleaned.replace(/^\n+|\n+$/g, "") ? `${cleaned.replace(/^\n+|\n+$/g, "")}\n` : "", { mode: statSync(claudeMd).mode });
    }
  }
  if (hadVersionOneRuntime) removeFile(runtime);
}

if (backedUp.length) {
  console.log(`${dryRun ? "Would back up" : "Backed up"} ${backedUp.length} file(s) that this installer did not write or that changed after installation:`);
  for (const path of backedUp) console.log(`  ${path}`);
}
console.log(`${dryRun ? "Dry run complete; nothing was changed" : uninstall ? "Uninstalled from" : "Installed to"}: ${target}`);
if (!uninstall) console.log(`Commands: /quality-review, /fix-review, /final-review${model ? ` (review model: ${model})` : ""}`);
