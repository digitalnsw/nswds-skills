#!/usr/bin/env node
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  return result.stdout;
}
const temp = mkdtempSync(join(tmpdir(), "codex-quality-review-"));
const repo = join(temp, "repo");
mkdirSync(repo);
run("git", ["init", "-b", "main"], repo);
run("git", ["config", "user.email", "test@example.invalid"], repo);
run("git", ["config", "user.name", "Test"], repo);
writeFileSync(join(repo, "base.txt"), "base\n");
run("git", ["add", "base.txt"], repo);
run("git", ["commit", "-m", "base"], repo);
run("git", ["checkout", "-b", "feature"], repo);
writeFileSync(join(repo, "feature.txt"), "feature\n");
run("git", ["add", "feature.txt"], repo);
run("git", ["commit", "-m", "feature"], repo);
writeFileSync(join(repo, "working.txt"), "working\n");
const scope = run("node", [join(root, "skills/codex-quality-review/scripts/review-scope.mjs"), "main"], repo);
for (const expected of ["Base branch: main", "Current branch: feature", "feature.txt", "working.txt"]) {
  if (!scope.includes(expected)) throw new Error(`scope output missing ${expected}`);
}
const detectedScope = run("node", [join(root, "skills/codex-quality-review/scripts/review-scope.mjs")], repo);
if (!detectedScope.includes("Base branch: main")) throw new Error("default branch was not detected");

const target = join(temp, "agents", "skills");
mkdirSync(join(target, "codex-quality-workflow"), { recursive: true });
mkdirSync(join(temp, "agents", "quality-workflow-backups"), { recursive: true });
writeFileSync(join(target, "codex-quality-workflow", "SKILL.md"), "old\n");
run("node", [join(root, "scripts/install.mjs"), "--target", target], root);
run("node", [join(root, "scripts/install.mjs"), "--target", target], root);
if (existsSync(join(target, "codex-quality-workflow"))) throw new Error("legacy skill remains");
if (existsSync(join(temp, "agents", "quality-workflow-backups"))) throw new Error("legacy backups remain");
for (const name of ["codex-quality-review", "codex-fix-review", "codex-final-review"]) {
  if (!existsSync(join(target, name, "SKILL.md"))) throw new Error(`missing installed skill ${name}`);
}
console.log("Codex quality review self-test passed");
