#!/usr/bin/env node
// Prints the review scope for the current branch: selected base, merge base,
// change-surface inventory and the repository's own validation commands.
// Read-only: runs git queries (and `gh pr view` when available), writes nothing.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = "usage: review-scope.mjs [--json | --fingerprint] [base-branch]";

function git(args, { optional = false, cwd = process.cwd() } = {}) {
  const result = spawnSync("git", args, { encoding: "utf8", cwd, maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) {
    if (optional) return "";
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(`git ${args.join(" ")} failed${detail ? `: ${detail}` : ""}`);
  }
  return result.stdout.replace(/\n+$/, "");
}

function resolves(ref, cwd) {
  return Boolean(git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { optional: true, cwd }));
}

function distance(ref, cwd) {
  const mergeBase = git(["merge-base", ref, "HEAD"], { optional: true, cwd });
  if (!mergeBase) return null;
  return { mergeBase, ahead: Number(git(["rev-list", "--count", `${mergeBase}..HEAD`], { cwd })) };
}

function pullRequestBase(cwd) {
  const result = spawnSync("gh", ["pr", "view", "--json", "baseRefName", "--jq", ".baseRefName"], {
    encoding: "utf8", cwd, timeout: 8000, env: { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" }
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

// Order: explicit argument, pull-request metadata, remote default branch,
// then the conventional default-branch name with the nearest merge base.
export function selectBase({ requested = "", cwd = process.cwd(), usePullRequest = true } = {}) {
  const current = git(["branch", "--show-current"], { optional: true, cwd });
  const preferRemote = (name) => [`origin/${name}`, `upstream/${name}`, name].find((ref) => resolves(ref, cwd)) ?? "";

  if (requested) {
    const ref = resolves(requested, cwd) ? requested : preferRemote(requested);
    if (!ref) throw new Error(`base branch does not resolve locally: ${requested}`);
    return { ref, reason: "named explicitly", ...distance(ref, cwd) };
  }

  const recorded = current ? git(["config", "--get", `branch.${current}.gh-merge-base`], { optional: true, cwd }) : "";
  const prBase = recorded || (usePullRequest && current ? pullRequestBase(cwd) : "");
  if (prBase && prBase !== current) {
    const ref = preferRemote(prBase);
    const measured = ref && distance(ref, cwd);
    if (measured) return { ref, reason: "base branch of this branch's pull request", ...measured };
  }

  for (const remote of ["origin", "upstream"]) {
    const ref = git(["symbolic-ref", "--quiet", "--short", `refs/remotes/${remote}/HEAD`], { optional: true, cwd });
    const measured = ref && ref !== `${remote}/${current}` && resolves(ref, cwd) && distance(ref, cwd);
    if (measured) return { ref, reason: `default branch of remote "${remote}"`, ...measured };
  }

  const candidates = [];
  for (const name of ["main", "master", "trunk", "develop", "development"]) {
    for (const ref of [`origin/${name}`, `upstream/${name}`, name]) {
      if (ref === current || !resolves(ref, cwd)) continue;
      const measured = distance(ref, cwd);
      if (measured) candidates.push({ ref, ...measured });
    }
  }
  if (candidates.length === 0) return null;
  const nearest = Math.min(...candidates.map((candidate) => candidate.ahead));
  const chosen = candidates.find((candidate) => candidate.ahead === nearest);
  const others = candidates.filter((candidate) => candidate.mergeBase !== chosen.mergeBase).map((candidate) => candidate.ref);
  return {
    ...chosen,
    reason: "nearest merge base among conventional default-branch names",
    assumption: others.length ? `other candidates with a different merge base: ${others.join(", ")}` : ""
  };
}

const GENERATED = /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|uv\.lock|Pipfile\.lock|composer\.lock|Gemfile\.lock|go\.sum)$|(^|\/)(dist|build|out|coverage|vendor|node_modules|__snapshots__|\.next)\/|\.(min\.(js|css)|map|snap)$/;
const TEST = /(^|\/)(tests?|__tests__|__mocks__|spec|specs|e2e|cypress|playwright|fixtures|testdata|evals)\/|\.(test|spec|stories)\.[^/]+$|(^|\/)(test_[^/]+\.py|[^/]+_test\.(go|py|rb)|conftest\.py)$/i;
const CONFIG = /(^|\/)(\.github|\.gitlab|\.circleci|\.husky|\.vscode|\.devcontainer)\/|(^|\/)(\.gitlab-ci\.yml|Jenkinsfile|azure-pipelines\.yml|Dockerfile[^/]*|docker-compose[^/]*\.ya?ml|Makefile|package\.json|tsconfig[^/]*\.json|pyproject\.toml|setup\.(py|cfg)|tox\.ini|Cargo\.toml|go\.mod|renovate\.json|\.snyk|\.npmrc|\.nvmrc|\.gitignore|\.gitattributes|\.editorconfig)$|(^|\/)[^/]*(\.config\.[cm]?[jt]s|rc\.(json|ya?ml|[cm]?js))$|(^|\/)\.[^/]+rc$/;
// Prompt and agent definitions are Markdown, but they are behaviour, not documentation.
const PROMPT = /(^|\/)(SKILL|AGENTS|CLAUDE)\.md$|(^|\/)(skills|agents|commands|prompts)\/.+\.mdx?$/;
const DOCS = /\.(mdx?|rst|adoc|txt)$|(^|\/)(docs?|documentation)\/|(^|\/)(LICEN[CS]E|NOTICE|CODEOWNERS)[^/]*$/i;

// A modified file that lost this many lines must be accounted for in the
// report whatever its kind: silent loss hides in documentation, tests and CI.
const SUBSTANTIAL_REMOVAL = 20;
export const mustAccountFor = (file) => file.status !== "D" && file.kind !== "generated" && (file.kind === "production" || (file.status === "M" && file.removed >= SUBSTANTIAL_REMOVAL));

// Headings, definitions, tests and CI steps that a file lost and did not get
// back: evidence of what a large removal actually took out.
const LANDMARK = /^\s*(#{1,6}\s+\S|(export\s+)?(default\s+)?(async\s+)?(function|class)\s+\w|(pub\s+)?(def|fn|func)\s+\w|(test|it|describe)\s*\(|-\s+(name|run|uses):\s*\S)/;
function removedLandmarks(mergeBase, path, cwd) {
  const removed = [];
  const added = new Set();
  for (const line of git(["diff", "-U0", "-M", mergeBase, "--", path], { optional: true, cwd }).split("\n")) {
    if (/^(---|\+\+\+)/.test(line) || !LANDMARK.test(line.slice(1))) continue;
    if (line[0] === "-") removed.push(line.slice(1).trim());
    else if (line[0] === "+") added.add(line.slice(1).trim());
  }
  return removed.filter((line) => !added.has(line)).map((line) => line.slice(0, 80));
}

export function classify(path) {
  if (GENERATED.test(path)) return "generated";
  if (TEST.test(path)) return "test";
  if (CONFIG.test(path)) return "config";
  if (PROMPT.test(path) && !/(^|\/)(README|CHANGELOG)[^/]*$/i.test(path)) return "production";
  if (DOCS.test(path)) return "docs";
  return "production";
}

function changedFiles(mergeBase, cwd) {
  const files = new Map();
  const record = (path, status, added = 0, removed = 0, committed = true) => {
    const entry = files.get(path) ?? { path, status, added: 0, removed: 0, uncommitted: false };
    entry.added += added;
    entry.removed += removed;
    if (!committed) entry.uncommitted = true;
    if (status === "D" || !files.has(path)) entry.status = status;
    files.set(path, entry);
  };
  const parse = (range, committed) => {
    const statuses = new Map();
    const names = git(["diff", "--name-status", "-z", "-M", ...range], { cwd }).split("\0");
    for (let index = 0; index < names.length - 1; index += 1) {
      const code = names[index][0];
      if (code === "R" || code === "C") index += 1;
      statuses.set(names[index + 1], code);
      index += 1;
    }
    const chunks = git(["diff", "--numstat", "-z", "-M", ...range], { cwd }).split("\0");
    for (let index = 0; index < chunks.length; index += 1) {
      const match = /^(\d+|-)\t(\d+|-)\t(.*)$/s.exec(chunks[index]);
      if (!match) continue;
      // With -z a rename has an empty path here, then the old and new paths as their own chunks.
      const path = match[3] || chunks[index + 2];
      if (!match[3]) index += 2;
      if (path) record(path, statuses.get(path) ?? "M", Number(match[1]) || 0, Number(match[2]) || 0, committed);
    }
    for (const [path, code] of statuses) if (!files.has(path)) record(path, code, 0, 0, committed);
  };
  parse([`${mergeBase}`, "HEAD"], true);
  parse(["HEAD"], false);
  for (const path of git(["ls-files", "--others", "--exclude-standard", "-z"], { cwd }).split("\0").filter(Boolean)) {
    let lines = 0;
    try { lines = readFileSync(join(cwd, path), "utf8").split("\n").length - 1; } catch { /* unreadable: leave the count at zero */ }
    record(path, "A", lines, 0, false);
  }
  return [...files.values()].map((file) => ({ ...file, kind: classify(file.path) })).sort((a, b) => a.path.localeCompare(b.path))
    .map((file) => (file.status === "M" && file.removed >= SUBSTANTIAL_REMOVAL && file.kind !== "generated" ? { ...file, lost: removedLandmarks(mergeBase, file.path, cwd) } : file));
}

const CHEAP = /^(lint|eslint|stylelint|typecheck|type-check|types|tsc|check|check-types|validate|format:check|prettier:check|test|test:unit|unit|vitest|jest)(:|$)/;
const EXPENSIVE = /(e2e|playwright|cypress|browser|storybook|visual|a11y|lighthouse|integration|smoke|build|bundle|package|docker|deploy|release|publish)/i;

const BROWSER = /\b(playwright|cypress|puppeteer|webdriver|storybook|lighthouse)\b/i;

function packageChecks(directory, root) {
  const manifest = join(root, directory, "package.json");
  if (!existsSync(manifest)) return null;
  let scripts = {};
  try { scripts = JSON.parse(readFileSync(manifest, "utf8")).scripts ?? {}; } catch { return null; }
  const at = (name) => existsSync(join(root, directory, name)) || existsSync(join(root, name));
  const runner = at("pnpm-lock.yaml") ? "pnpm" : at("yarn.lock") ? "yarn" : at("bun.lockb") || at("bun.lock") ? "bun" : "npm";
  const prefix = directory ? `(cd ${directory} && ` : "";
  const suffix = directory ? ")" : "";
  const commands = Object.keys(scripts).map((name) => ({
    command: `${prefix}${runner} run ${name}${suffix}`,
    definition: String(scripts[name]).slice(0, 140),
    cost: EXPENSIVE.test(name) || BROWSER.test(scripts[name]) ? "expensive" : CHEAP.test(name) ? "cheap" : "other"
  })).filter((entry) => entry.cost !== "other");
  const installed = existsSync(join(root, directory, "node_modules")) || existsSync(join(root, "node_modules"));
  return { manifest: join(directory, "package.json"), installed, commands };
}

function ciChecks(root) {
  const directory = join(root, ".github", "workflows");
  if (!existsSync(directory)) return [];
  const entries = [];
  for (const name of readdirSync(directory).filter((file) => /\.ya?ml$/.test(file)).sort()) {
    const lines = readFileSync(join(directory, name), "utf8").split("\n");
    const triggers = /(^|\n)\s*(on:[^\n]*pull_request|pull_request(_target)?:|-\s*pull_request)/.test(lines.join("\n"));
    if (!triggers) continue;
    const runs = [];
    const reusable = [];
    for (let index = 0; index < lines.length; index += 1) {
      const uses = /^\s*uses:\s*(\S+\/\.github\/workflows\/\S+)/.exec(lines[index]);
      if (uses) reusable.push(uses[1]);
      const run = /^(\s*)(?:-\s*)?run:\s*(.*)$/.exec(lines[index]);
      if (!run) continue;
      if (/^[|>][+-]?\s*$/.test(run[2])) {
        const indent = run[1].length;
        while (index + 1 < lines.length && (lines[index + 1].trim() === "" || lines[index + 1].search(/\S/) > indent)) {
          index += 1;
          if (lines[index].trim() && !lines[index].trim().startsWith("#")) runs.push(lines[index].trim());
        }
      } else if (run[2].trim()) runs.push(run[2].trim());
    }
    entries.push({ workflow: `.github/workflows/${name}`, runs: runs.slice(0, 12), reusable });
  }
  return entries;
}

function otherChecks(root) {
  const found = [];
  if (existsSync(join(root, "Makefile"))) {
    const targets = [...readFileSync(join(root, "Makefile"), "utf8").matchAll(/^(lint|test|check|typecheck|validate|verify)[\w-]*:/gm)].map((match) => `make ${match[0].slice(0, -1)}`);
    if (targets.length) found.push(...targets);
  }
  if (existsSync(join(root, "Cargo.toml"))) found.push("cargo check", "cargo test");
  if (existsSync(join(root, "go.mod"))) found.push("go vet ./...", "go test ./...");
  if (existsSync(join(root, "pyproject.toml")) || existsSync(join(root, "tox.ini"))) found.push("pytest (if configured in pyproject.toml / tox.ini)");
  return found;
}

export function fingerprint(cwd = process.cwd()) {
  const hash = createHash("sha256");
  hash.update(git(["rev-parse", "HEAD"], { cwd }));
  hash.update(git(["status", "--porcelain=v1", "--untracked-files=all", "-z"], { cwd }));
  hash.update(git(["diff", "HEAD", "--binary"], { cwd }));
  for (const path of git(["ls-files", "--others", "--exclude-standard", "-z"], { cwd }).split("\0").filter(Boolean)) {
    hash.update(path);
    try { hash.update(readFileSync(join(cwd, path))); } catch { /* unreadable untracked file: path alone is hashed */ }
  }
  return hash.digest("hex").slice(0, 12);
}

export function reviewScope({ requested = "", cwd = process.cwd(), usePullRequest = true } = {}) {
  const root = git(["rev-parse", "--show-toplevel"], { cwd });
  const head = git(["rev-parse", "HEAD"], { cwd: root });
  const branch = git(["branch", "--show-current"], { optional: true, cwd: root }) || "detached HEAD";
  const base = selectBase({ requested, cwd: root, usePullRequest });
  if (!base) return { root, head, branch, base: null };
  const files = changedFiles(base.mergeBase, root);
  const directories = new Set([""]);
  for (const file of files) {
    for (let directory = dirname(file.path); directory !== "."; directory = dirname(directory)) {
      if (existsSync(join(root, directory, "package.json"))) { directories.add(directory); break; }
    }
  }
  const packages = [...directories].slice(0, 6).map((directory) => packageChecks(directory, root)).filter(Boolean);
  return {
    root, head, branch, base, files, packages,
    ci: ciChecks(root), other: otherChecks(root),
    commits: Number(git(["rev-list", "--count", `${base.mergeBase}..HEAD`], { cwd: root })),
    subjects: git(["log", "--format=%s", "--max-count=30", `${base.mergeBase}..HEAD`], { cwd: root }).split("\n").filter(Boolean),
    fingerprint: fingerprint(root)
  };
}

function render(scope) {
  const out = [];
  out.push("# Review scope", "");
  out.push(`- Branch: ${scope.branch} @ ${scope.head.slice(0, 12)}`);
  out.push(`- Base: ${scope.base.ref} (${scope.base.reason})`);
  if (scope.base.assumption) out.push(`- Base assumption: ${scope.base.assumption}`);
  out.push(`- Merge base: ${scope.base.mergeBase.slice(0, 12)} (${scope.commits} commit${scope.commits === 1 ? "" : "s"} on this branch)`);
  out.push(`- Committed diff: \`git diff ${scope.base.mergeBase.slice(0, 12)} HEAD\`; uncommitted: \`git diff HEAD\``);
  out.push(`- Worktree fingerprint: ${scope.fingerprint}`, "");

  if (scope.subjects.length) out.push("## What the branch says it does", "", ...scope.subjects.map((subject) => `- ${subject}`), "", "This is the author's stated intent, and the only one. A change these commits do not account for is not intended until the code shows otherwise.", "");
  out.push("## Changed surfaces", "");
  if (scope.files.length === 0) out.push("No changes against the base. Report `No actionable findings` and say the diff is empty.");
  const labels = { production: "Production", config: "Configuration and CI", test: "Tests", docs: "Documentation", generated: "Generated and lock files (skim only)" };
  for (const [kind, label] of Object.entries(labels)) {
    const all = scope.files.filter((file) => file.kind === kind);
    if (all.length === 0) continue;
    const group = all.filter((file) => file.status !== "D");
    out.push(`### ${label} (${all.length})`);
    const deleted = new Map();
    for (const file of all.filter((entry) => entry.status === "D")) {
      const directory = file.path.includes("/") ? `${file.path.split("/").slice(0, 3).join("/")}${file.path.split("/").length > 3 ? "/**" : ""}` : file.path;
      deleted.set(directory, (deleted.get(directory) ?? 0) + 1);
    }
    for (const [directory, count] of deleted) out.push(`- ${directory} [deleted${count > 1 ? `, ${count} files` : ""}] — check nothing still refers to it`);
    for (const file of group) out.push(`- ${file.path} [${file.status} +${file.added} -${file.removed}${file.uncommitted ? ", uncommitted" : ""}]${file.kind !== "production" && mustAccountFor(file) ? " — substantial removal: list this file in Coverage" : ""}${file.lost?.length ? `\n  - lost and not re-added: ${file.lost.slice(0, 10).map((line) => `\`${line}\``).join(", ")}${file.lost.length > 10 ? `, and ${file.lost.length - 10} more` : ""}` : ""}`);
    out.push("");
  }
  if (scope.files.length) out.push("Classification is by path only. Reclassify a file when this repository treats it differently.", "");

  out.push("## Repository-defined checks", "");
  let any = false;
  for (const pkg of scope.packages) {
    if (pkg.commands.length === 0) continue;
    any = true;
    out.push(`### ${pkg.manifest}${pkg.installed ? "" : " — dependencies are NOT installed; do not install them, record these as not run"}`);
    for (const entry of pkg.commands) out.push(`- ${entry.cost}: \`${entry.command}\` → ${entry.definition}`);
    out.push("");
  }
  if (scope.other.length) { any = true; out.push("### Other toolchains", ...scope.other.map((command) => `- \`${command}\``), ""); }
  for (const entry of scope.ci) {
    any = true;
    out.push(`### ${entry.workflow} (pull-request gate)`);
    for (const run of entry.runs) out.push(`- run: \`${run}\``);
    for (const workflow of entry.reusable) out.push(`- CI-only: reusable workflow ${workflow} (cannot be reproduced locally)`);
    out.push("");
  }
  if (!any) out.push("None detected. Review without them and record the gap.", "");
  return out.join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const flags = args.filter((arg) => arg.startsWith("--"));
  // --skill is how the commands call this script: the single positional is the
  // user's free-text argument, and nothing here may stop the review from starting.
  const skill = flags.includes("--skill");
  try {
    const positional = args.filter((arg) => !arg.startsWith("--") && arg.trim());
    if (flags.some((flag) => !["--json", "--fingerprint", "--skill"].includes(flag)) || (!skill && positional.length > 1)) throw new Error(USAGE);
    if (flags.includes("--fingerprint")) {
      console.log(`Worktree fingerprint: ${fingerprint(git(["rev-parse", "--show-toplevel"]))}`);
    } else {
      let requested = positional[0]?.trim() ?? "";
      let note = "";
      if (skill && requested && !/^[\w./-]+$/.test(requested)) { note = requested; requested = ""; }
      let scope;
      try {
        scope = reviewScope({ requested });
      } catch (error) {
        if (!skill || !requested) throw error;
        note = requested;
        scope = reviewScope();
      }
      if (!scope.base) {
        console.log("# Review scope\n\nNo base branch could be established: this repository has no remote default branch and no local main, master, trunk or develop branch. Say so in one sentence and ask which branch this work will merge into. This is the only situation in which the review may stop without a report.");
        if (!skill) process.exit(3);
      } else console.log(flags.includes("--json") ? JSON.stringify(scope, null, 2) : render(scope));
      if (note && scope.base) console.log(`\n## User's instruction for this review\n\n${note}\n\n(It did not name a branch, so the base was detected automatically.)`);
    }
  } catch (error) {
    console[skill ? "log" : "error"](`review-scope failed: ${error.message}`);
    if (!skill) process.exit(1);
  }
  // The commands inject this script's output into their prompt, so skill mode
  // carries the review guide too: one injection, and nothing else to go wrong.
  if (skill && !flags.includes("--fingerprint")) {
    try { console.log(`\n---\n\n${readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "review-guide.md"), "utf8")}`); } catch { console.log("\nThe review guide could not be read. Read review-guide.md in the quality-review skill directory."); }
  }
}
