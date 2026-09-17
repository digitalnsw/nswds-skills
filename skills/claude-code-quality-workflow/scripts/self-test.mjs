#!/usr/bin/env node
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  return result.stdout;
}
function runExpectingFailure(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status === 0) throw new Error(`${command} ${args.join(" ")} unexpectedly succeeded`);
  return `${result.stdout}${result.stderr}`;
}
const temp = mkdtempSync(join(tmpdir(), "claude-quality-review-"));
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
const scope = run("node", [join(root, ".claude/quality-review/scripts/review-scope.mjs"), "main"], repo);
for (const expected of ["Base branch: main", "Current branch: feature", "feature.txt", "working.txt"]) {
  if (!scope.includes(expected)) throw new Error(`scope output missing ${expected}`);
}
const detectedScope = run("node", [join(root, ".claude/quality-review/scripts/review-scope.mjs")], repo);
if (!detectedScope.includes("Base branch: main")) throw new Error("default branch was not detected");

const target = join(temp, "claude");
const outsideSentinel = join(temp, "outside.txt");
mkdirSync(join(target, "quality-workflow", "scripts"), { recursive: true });
mkdirSync(join(target, "agents"), { recursive: true });
writeFileSync(outsideSentinel, "keep\n");
writeFileSync(join(target, "quality-workflow", "install-manifest.json"), JSON.stringify({ files: ["agents/senior-code-reviewer.md", "../outside.txt", outsideSentinel] }));
writeFileSync(join(target, "agents", "senior-code-reviewer.md"), "old\n");
const unrelatedHook = "/tmp/another/quality-workflow/scripts/custom.sh";
writeFileSync(join(target, "settings.json"), JSON.stringify({ hooks: { Stop: [{ hooks: [
  { type: "command", command: `"${target}/quality-workflow/scripts/verify-on-stop.sh"` },
  { type: "command", command: unrelatedHook }
] }] } }));
writeFileSync(join(target, "CLAUDE.md"), "keep\n\n<!-- claude-quality-workflow:start -->\n@old\n<!-- claude-quality-workflow:end -->\n");
run("node", [join(root, "scripts/install.mjs"), "--target", target], root);
run("node", [join(root, "scripts/install.mjs"), "--target", target], root);
if (existsSync(join(target, "quality-workflow"))) throw new Error("legacy runtime remains");
if (existsSync(join(target, "agents/senior-code-reviewer.md"))) throw new Error("legacy agent remains");
if (!existsSync(outsideSentinel)) throw new Error("invalid manifest entry removed a file outside the target");
if (readFileSync(join(target, "CLAUDE.md"), "utf8") !== "keep\n") throw new Error("legacy CLAUDE.md marker was not removed cleanly");
const remainingHooks = JSON.parse(readFileSync(join(target, "settings.json"), "utf8")).hooks.Stop?.flatMap((group) => group.hooks ?? []) ?? [];
if (remainingHooks.length !== 1 || remainingHooks[0].command !== unrelatedHook) throw new Error("hook cleanup did not preserve only the unrelated hook");
for (const name of ["quality-review", "fix-review", "final-review"]) {
  if (!existsSync(join(target, "skills", name, "SKILL.md"))) throw new Error(`missing installed skill ${name}`);
}

const symlinkReferent = join(temp, "symlink-referent");
const symlinkTarget = join(temp, "symlink-target");
mkdirSync(symlinkReferent);
writeFileSync(join(symlinkReferent, "sentinel.txt"), "keep\n");
symlinkSync(symlinkReferent, symlinkTarget, "dir");
const symlinkFailure = runExpectingFailure("node", [join(root, "scripts/install.mjs"), "--target", symlinkTarget], root);
if (!symlinkFailure.includes("symbolic-link destination")) throw new Error("symlinked target failed for the wrong reason");
if (!existsSync(join(symlinkReferent, "sentinel.txt")) || existsSync(join(symlinkReferent, "skills"))) throw new Error("symlinked target referent was modified");
console.log("Claude quality review self-test passed");
