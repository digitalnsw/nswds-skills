#!/usr/bin/env node
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
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
mkdirSync(join(target, "quality-workflow", "scripts"), { recursive: true });
mkdirSync(join(target, "agents"), { recursive: true });
writeFileSync(join(target, "quality-workflow", "install-manifest.json"), JSON.stringify({ files: ["agents/senior-code-reviewer.md"] }));
writeFileSync(join(target, "agents", "senior-code-reviewer.md"), "old\n");
writeFileSync(join(target, "settings.json"), JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: `${target}/quality-workflow/scripts/verify-on-stop.sh` }] }] } }));
writeFileSync(join(target, "CLAUDE.md"), "keep\n\n<!-- claude-quality-workflow:start -->\n@old\n<!-- claude-quality-workflow:end -->\n");
run("node", [join(root, "scripts/install.mjs"), "--target", target], root);
run("node", [join(root, "scripts/install.mjs"), "--target", target], root);
if (existsSync(join(target, "quality-workflow"))) throw new Error("legacy runtime remains");
if (existsSync(join(target, "agents/senior-code-reviewer.md"))) throw new Error("legacy agent remains");
if (readFileSync(join(target, "CLAUDE.md"), "utf8") !== "keep\n") throw new Error("legacy CLAUDE.md marker was not removed cleanly");
if ((JSON.parse(readFileSync(join(target, "settings.json"), "utf8")).hooks.Stop ?? []).length !== 0) throw new Error("legacy hook remains");
for (const name of ["quality-review", "fix-review", "final-review"]) {
  if (!existsSync(join(target, "skills", name, "SKILL.md"))) throw new Error(`missing installed skill ${name}`);
}
console.log("Claude quality review self-test passed");
