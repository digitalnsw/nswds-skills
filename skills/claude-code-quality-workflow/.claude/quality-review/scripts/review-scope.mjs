#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
let requestedBase = "";
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--base") {
    requestedBase = args[++index] ?? "";
  } else if (!requestedBase && !args[index].startsWith("-")) {
    requestedBase = args[index];
  } else {
    throw new Error("usage: review-scope.mjs [--base] [branch]");
  }
}

function git(command, { optional = false } = {}) {
  const result = spawnSync("git", command, { encoding: "utf8" });
  if (result.status !== 0) {
    if (optional) return "";
    const detail = result.stderr.trim() || result.stdout.trim();
    throw new Error(`git ${command.join(" ")} failed${detail ? `: ${detail}` : ""}`);
  }
  return result.stdout.trim();
}

git(["rev-parse", "--show-toplevel"]);
const head = git(["rev-parse", "HEAD"]);
const currentBranch = git(["branch", "--show-current"], { optional: true }) || "detached HEAD";

function resolves(ref) {
  return Boolean(git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { optional: true }));
}

let base = requestedBase;
if (base && !resolves(base) && resolves(`origin/${base}`)) base = `origin/${base}`;
if (base && !resolves(base)) throw new Error(`base branch does not resolve locally: ${requestedBase}`);

if (!base) {
  const remoteHeads = ["origin", "upstream"].map((remote) =>
    git(["symbolic-ref", "--quiet", "--short", `refs/remotes/${remote}/HEAD`], { optional: true })
  ).filter(Boolean);
  const candidates = [...remoteHeads, "origin/main", "origin/master", "upstream/main", "upstream/master", "main", "master", "trunk", "develop"];
  base = candidates.find((candidate) => resolves(candidate)) ?? "";
}

if (!base) {
  throw new Error("could not detect a default branch locally; rerun with a branch name, for example: review-scope.mjs main");
}

const mergeBase = git(["merge-base", base, "HEAD"]);
const status = git(["status", "--short", "--untracked-files=all"], { optional: true });
const changed = new Set(
  git(["diff", "--name-only", `${mergeBase}...HEAD`], { optional: true }).split("\n").filter(Boolean)
);
for (const line of status.split("\n").filter(Boolean)) changed.add(line.slice(3).replace(/^.* -> /, ""));

console.log("# Review scope");
console.log(`- Base branch: ${base}`);
console.log(`- Merge base: ${mergeBase}`);
console.log(`- Head: ${head}`);
console.log(`- Current branch: ${currentBranch}`);
console.log(`- Working tree: ${status ? "has uncommitted changes" : "clean"}`);
console.log("- Diff command: `git diff " + `${mergeBase}...HEAD` + "`");
console.log("- Working-tree commands: `git diff` and `git diff --cached`");
console.log("\n## Changed paths");
if (changed.size === 0) console.log("- None");
else for (const path of [...changed].sort()) console.log(`- ${path}`);
