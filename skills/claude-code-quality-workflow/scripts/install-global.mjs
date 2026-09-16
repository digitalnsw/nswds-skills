#!/usr/bin/env node

import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
let dryRun = false;
let target = process.env.CLAUDE_CONFIG_DIR
  ? resolve(process.env.CLAUDE_CONFIG_DIR)
  : join(homedir(), ".claude");

for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === "--dry-run") {
    dryRun = true;
  } else if (argument === "--target") {
    if (!args[index + 1]) throw new Error("--target requires a path");
    target = resolve(args[index + 1]);
    index += 1;
  } else if (argument === "--help" || argument === "-h") {
    console.log("usage: ./install.sh [--dry-run] [--target <claude-config-directory>]");
    process.exit(0);
  } else {
    throw new Error(`unknown argument: ${argument}`);
  }
}

const settingsPath = join(target, "settings.json");
const claudeMdPath = join(target, "CLAUDE.md");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = join(target, "quality-workflow-backups", timestamp);
const backedUp = new Set();
const installed = [];

const readExistingSettings = () => {
  if (!existsSync(settingsPath)) return {};
  try {
    const value = JSON.parse(readFileSync(settingsPath, "utf8"));
    if (!value || Array.isArray(value) || typeof value !== "object") {
      throw new Error("root value must be an object");
    }
    return value;
  } catch (error) {
    throw new Error(`cannot merge ${settingsPath}: ${error.message}`);
  }
};

const originalSettings = readExistingSettings();
const originalClaudeMd = existsSync(claudeMdPath) ? readFileSync(claudeMdPath, "utf8") : "";

const hashFile = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const sameFile = (left, right) => existsSync(right) && statSync(right).isFile() && hashFile(left) === hashFile(right);

const backup = (destination) => {
  if (!existsSync(destination) || backedUp.has(destination)) return;
  const backupPath = join(backupRoot, relative(target, destination));
  console.log(`${dryRun ? "would back up" : "backing up"}: ${destination} -> ${backupPath}`);
  if (!dryRun) {
    mkdirSync(dirname(backupPath), { recursive: true });
    cpSync(destination, backupPath, { recursive: true, preserveTimestamps: true });
  }
  backedUp.add(destination);
};

const installFile = (source, destination) => {
  installed.push(relative(target, destination));
  if (sameFile(source, destination)) {
    console.log(`unchanged: ${destination}`);
    return;
  }
  backup(destination);
  console.log(`${dryRun ? "would install" : "installing"}: ${destination}`);
  if (!dryRun) {
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination, { preserveTimestamps: true });
  }
};

const copyTree = (sourceRoot, destinationRoot) => {
  for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") continue;
    const source = join(sourceRoot, entry.name);
    const destination = join(destinationRoot, entry.name);
    if (entry.isDirectory()) copyTree(source, destination);
    else if (entry.isFile()) installFile(source, destination);
  }
};

copyTree(join(packageRoot, ".claude", "agents"), join(target, "agents"));
copyTree(join(packageRoot, ".claude", "skills"), join(target, "skills"));
copyTree(join(packageRoot, ".claude", "quality-workflow"), join(target, "quality-workflow"));
installFile(join(packageRoot, "CLAUDE.md"), join(target, "quality-workflow", "global-rules.md"));

const hookCommand = (name) => `"${join(target, "quality-workflow", "scripts", name)}"`;
const settings = structuredClone(originalSettings);
settings.hooks ??= {};
settings.hooks.PostToolUse ??= [];
settings.hooks.Stop ??= [];

const upsertHook = (groups, matcher, scriptName, timeout) => {
  const suffix = `/quality-workflow/scripts/${scriptName}`;
  for (const group of groups) {
    if (!Array.isArray(group?.hooks)) continue;
    for (const hook of group.hooks) {
      if (typeof hook?.command === "string" && hook.command.replaceAll("\\", "/").includes(suffix)) {
        hook.command = hookCommand(scriptName);
        if (timeout !== undefined) hook.timeout = timeout;
        return;
      }
    }
  }
  const group = { hooks: [{ type: "command", command: hookCommand(scriptName) }] };
  if (matcher) group.matcher = matcher;
  if (timeout !== undefined) group.hooks[0].timeout = timeout;
  groups.push(group);
};

upsertHook(settings.hooks.PostToolUse, "Edit|Write", "quick-check.sh");
upsertHook(settings.hooks.Stop, null, "verify-on-stop.sh", 600);
const settingsText = `${JSON.stringify(settings, null, 2)}\n`;
if (settingsText !== `${JSON.stringify(originalSettings, null, 2)}\n`) {
  backup(settingsPath);
  console.log(`${dryRun ? "would merge" : "merging"}: ${settingsPath}`);
  if (!dryRun) {
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(settingsPath, settingsText, { mode: 0o600 });
  }
}

const markerStart = "<!-- claude-quality-workflow:start -->";
const markerEnd = "<!-- claude-quality-workflow:end -->";
const importBlock = `${markerStart}\n@${join(target, "quality-workflow", "global-rules.md")}\n${markerEnd}`;
const markerPattern = /<!-- claude-quality-workflow:start -->[\s\S]*?<!-- claude-quality-workflow:end -->/;
let claudeMd = originalClaudeMd;
if (markerPattern.test(claudeMd)) {
  claudeMd = claudeMd.replace(markerPattern, importBlock);
} else {
  claudeMd = `${claudeMd.trimEnd()}${claudeMd.trim() ? "\n\n" : ""}${importBlock}\n`;
}
if (claudeMd !== originalClaudeMd) {
  backup(claudeMdPath);
  console.log(`${dryRun ? "would update" : "updating"}: ${claudeMdPath}`);
  if (!dryRun) {
    mkdirSync(dirname(claudeMdPath), { recursive: true });
    writeFileSync(claudeMdPath, claudeMd);
  }
}

const manifestPath = join(target, "quality-workflow", "install-manifest.json");
const manifest = {
  version: "3.0.0",
  installedAt: new Date().toISOString(),
  packageRoot,
  target,
  files: [...new Set(installed)].sort()
};
if (!dryRun) writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log("");
console.log(`${dryRun ? "Dry run complete" : "Global installation complete"}: ${target}`);
if (backedUp.size > 0) console.log(`Backups: ${backupRoot}`);
console.log("Restart Claude Code if this was the first time ~/.claude/agents was created.");
