import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { makeRepo, ok, run, scripts, tempDir, write } from "./helpers.mjs";

const scopeScript = join(scripts, "review-scope.mjs");
const scope = (repo, ...args) => JSON.parse(ok("node", [scopeScript, "--json", ...args], { cwd: repo }));

test("selects the local default branch with no user input", () => {
  const { repo } = makeRepo({ base: { "src/a.js": "export const a = 1;\n" }, feature: { "src/a.js": "export const a = 2;\n" } });
  const result = scope(repo);
  assert.equal(result.base.ref, "main");
  assert.equal(result.commits, 1);
  assert.match(result.base.mergeBase, /^[0-9a-f]{40}$/);
});

test("selects master when there is no main", () => {
  const { repo } = makeRepo({ defaultBranch: "master", base: { "a.js": "1\n" }, feature: { "a.js": "2\n" } });
  assert.equal(scope(repo).base.ref, "master");
});

test("prefers the remote default branch, even when it has an unconventional name", () => {
  const { repo, git } = makeRepo({ defaultBranch: "stable", base: { "a.js": "1\n" }, feature: { "a.js": "2\n" } });
  const remote = tempDir();
  ok("git", ["clone", "-q", "--bare", repo, join(remote, "origin.git")]);
  git("remote", "add", "origin", join(remote, "origin.git"));
  git("fetch", "-q", "origin");
  git("remote", "set-head", "origin", "stable");
  const result = scope(repo);
  assert.equal(result.base.ref, "origin/stable");
  assert.match(result.base.reason, /default branch of remote/);
});

test("prefers a recorded pull-request base over the default branch", () => {
  const { repo, git } = makeRepo({ base: { "a.js": "1\n" } });
  git("checkout", "-q", "-b", "release", "main");
  write(repo, { "r.js": "r\n" }); git("add", "-A"); git("commit", "-q", "-m", "release work");
  git("checkout", "-q", "-b", "hotfix");
  write(repo, { "h.js": "h\n" }); git("add", "-A"); git("commit", "-q", "-m", "hotfix");
  git("config", "branch.hotfix.gh-merge-base", "release");
  const result = scope(repo);
  assert.equal(result.base.ref, "release");
  assert.deepEqual(result.files.map((file) => file.path), ["h.js"]);
});

test("chooses the nearest merge base and states the assumption when candidates disagree", () => {
  const { repo, git } = makeRepo({ base: { "a.js": "1\n" } });
  git("checkout", "-q", "-b", "develop", "main");
  write(repo, { "d.js": "d\n" }); git("add", "-A"); git("commit", "-q", "-m", "develop work");
  git("checkout", "-q", "-b", "topic");
  write(repo, { "t.js": "t\n" }); git("add", "-A"); git("commit", "-q", "-m", "topic");
  const result = scope(repo);
  assert.equal(result.base.ref, "develop");
  assert.match(result.base.assumption, /main/);
});

test("reports that no base exists instead of guessing, and never fails in skill mode", () => {
  const { repo, git } = makeRepo({ defaultBranch: "solo", base: { "a.js": "1\n" } });
  git("branch", "-D", "solo");
  const strict = run("node", [scopeScript], { cwd: repo });
  assert.equal(strict.status, 3);
  const skill = run("node", [scopeScript, "--skill", ""], { cwd: repo });
  assert.equal(skill.status, 0);
  assert.match(skill.stdout, /No base branch could be established/);
});

test("skill mode treats a free-text argument as an instruction, not a branch", () => {
  const { repo } = makeRepo({ base: { "a.js": "1\n" }, feature: { "a.js": "2\n" } });
  const output = ok("node", [scopeScript, "--skill", "focus on the parser; ignore docs"], { cwd: repo });
  assert.match(output, /Base: main/);
  assert.match(output, /focus on the parser; ignore docs/);
  assert.match(ok("node", [scopeScript, "--skill", "nonexistent-branch"], { cwd: repo }), /Base: main/);
});

test("inventories every changed surface, committed, uncommitted and untracked", () => {
  const { repo } = makeRepo({
    base: { "src/parse.js": "1\n", "src/old.js": "old\n", "README.md": "# x\n", "package.json": "{}\n" },
    feature: { "src/parse.js": "2\n", "src/render.js": "r\n", "test/parse.test.js": "t\n", "README.md": "# y\n", ".github/workflows/ci.yml": "on: pull_request\n", "package-lock.json": "{}\n", "skills/demo/SKILL.md": "prompt\n" }
  });
  ok("git", ["rm", "-q", "src/old.js"], { cwd: repo });
  write(repo, { "src/parse.js": "3\n", "src/untracked.js": "u\nv\n" });
  const files = Object.fromEntries(scope(repo).files.map((file) => [file.path, file]));
  assert.equal(files["src/parse.js"].kind, "production");
  assert.equal(files["src/parse.js"].uncommitted, true);
  assert.equal(files["src/render.js"].status, "A");
  assert.equal(files["src/old.js"].status, "D");
  assert.deepEqual([files["src/untracked.js"].kind, files["src/untracked.js"].added], ["production", 2]);
  assert.equal(files["test/parse.test.js"].kind, "test");
  assert.equal(files["README.md"].kind, "docs");
  assert.equal(files[".github/workflows/ci.yml"].kind, "config");
  assert.equal(files["package-lock.json"].kind, "generated");
  assert.equal(files["skills/demo/SKILL.md"].kind, "production");
});

test("discovers repository-defined checks and marks what it cannot run", () => {
  const { repo } = makeRepo({
    base: {
      "package.json": JSON.stringify({ scripts: { lint: "eslint .", test: "node --test", "test:e2e": "playwright test", build: "tsc -b", start: "node ." } }),
      ".github/workflows/ci.yml": "on:\n  pull_request:\njobs:\n  a:\n    steps:\n      - run: npm run lint\n      - run: |\n          npm ci\n          npm test\n  b:\n    uses: org/repo/.github/workflows/gate.yml@v1\n",
      ".github/workflows/release.yml": "on:\n  push:\njobs:\n  a:\n    steps:\n      - run: npm publish\n"
    },
    feature: { "src/a.js": "1\n" }
  });
  const result = scope(repo);
  const costs = Object.fromEntries(result.packages[0].commands.map((entry) => [entry.command, entry.cost]));
  assert.deepEqual(costs, { "npm run lint": "cheap", "npm run test": "cheap", "npm run test:e2e": "expensive", "npm run build": "expensive" });
  assert.equal(result.packages[0].installed, false);
  assert.deepEqual(result.ci.map((entry) => entry.workflow), [".github/workflows/ci.yml"]);
  assert.deepEqual(result.ci[0].runs, ["npm run lint", "npm ci", "npm test"]);
  assert.deepEqual(result.ci[0].reusable, ["org/repo/.github/workflows/gate.yml@v1"]);
  const rendered = ok("node", [scopeScript], { cwd: repo });
  assert.match(rendered, /dependencies are NOT installed; do not install them/);
  assert.match(rendered, /CI-only: reusable workflow/);
});

test("a repository with no checks at all still yields a scope", () => {
  const { repo } = makeRepo({ base: { "a.py": "1\n" }, feature: { "a.py": "2\n" } });
  assert.match(ok("node", [scopeScript], { cwd: repo }), /None detected\. Review without them and record the gap\./);
});

test("the fingerprint changes when the worktree changes and is otherwise stable, and the scope script writes nothing", () => {
  const { repo } = makeRepo({ base: { "a.js": "1\n" }, feature: { "a.js": "2\n" } });
  const before = ok("git", ["status", "--porcelain", "--ignored"], { cwd: repo });
  const first = ok("node", [scopeScript, "--fingerprint"], { cwd: repo });
  assert.equal(ok("node", [scopeScript, "--fingerprint"], { cwd: repo }), first);
  assert.equal(scope(repo).fingerprint, /: (\w+)/.exec(first)[1]);
  assert.equal(ok("git", ["status", "--porcelain", "--ignored"], { cwd: repo }), before);
  write(repo, { "new.js": "x\n" });
  const second = ok("node", [scopeScript, "--fingerprint"], { cwd: repo });
  assert.notEqual(second, first);
  write(repo, { "new.js": "y\n" });
  assert.notEqual(ok("node", [scopeScript, "--fingerprint"], { cwd: repo }), second);
});

test("skill mode carries the review guide, and the commands inject nothing else", async () => {
  const { readFileSync } = await import("node:fs");
  const { repo } = makeRepo({ base: { "a.js": "1\n" }, feature: { "a.js": "2\n" } });
  const output = ok("node", [scopeScript, "--skill", ""], { cwd: repo });
  assert.match(output, /# Review scope[\s\S]*# Review guide[\s\S]*## Report format/);
  assert.doesNotMatch(ok("node", [scopeScript, "--fingerprint"], { cwd: repo }), /Review guide/);
  // Claude Code aborts a command when any `!` injection is refused, and it
  // refuses `cat` outside the working directory. One node injection only.
  for (const name of ["quality-review", "final-review"]) {
    const injections = readFileSync(join(scripts, "..", "..", name, "SKILL.md"), "utf8").match(/^!`.*`$/gm) ?? [];
    assert.equal(injections.length, 1, name);
    // User text never reaches the shell: a quote in it would break the injection.
    assert.match(injections[0], /^!`node \$\{CLAUDE_SKILL_DIR\}\S*\/scripts\/review-scope\.mjs --skill`$/);
  }
});

test("a renamed and edited file keeps its line counts", () => {
  const body = Array.from({ length: 40 }, (_, index) => `export const value${index} = ${index};`).join("\n");
  const { repo, git } = makeRepo({ base: { "src/old-name.js": `${body}\n` } });
  git("mv", "src/old-name.js", "src/new-name.js");
  write(repo, { "src/new-name.js": `${body}\nexport const extra = 1;\nexport const more = 2;\n` });
  git("add", "-A"); git("commit", "-q", "-m", "rename and edit");
  const file = scope(repo).files.find((entry) => entry.path === "src/new-name.js");
  assert.deepEqual([file.status, file.added, file.removed], ["R", 2, 0]);
});

test("names what a heavily cut file lost, whatever kind of file it is", () => {
  const skills = Array.from({ length: 24 }, (_, index) => `| skill-${index} | does thing ${index} |`).join("\n");
  const { repo } = makeRepo({
    base: { "README.md": `# Project\n\n## Install\n\nnpm i\n\n## Skills\n\n${skills}\n\n## Layout\n\ntree\n` },
    feature: { "README.md": "# Project\n\n## Install\n\nnpm ci\n\n## Layout\n\ntree\n" }
  });
  const readme = scope(repo).files.find((entry) => entry.path === "README.md");
  assert.equal(readme.kind, "docs");
  assert.deepEqual(readme.lost, ["## Skills"]);
  assert.match(ok("node", [scopeScript], { cwd: repo }), /README\.md .*substantial removal[^\n]*\n  - lost and not re-added: `## Skills`/);
});
