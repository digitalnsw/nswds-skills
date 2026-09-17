import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import { join } from "node:path";
import { installer, ok, run, tempDir, write } from "./helpers.mjs";

const install = (target, ...args) => ok("node", [installer, "--target", target, ...args]);
const tree = (directory, prefix = "") => existsSync(directory) ? readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? tree(join(directory, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]).sort() : [];

test("dry run reports the plan and changes nothing", () => {
  const target = join(tempDir(), "claude");
  const output = install(target, "--dry-run");
  assert.match(output, /would install: .*skills\/quality-review\/SKILL\.md/);
  assert.match(output, /nothing was changed/);
  assert.equal(existsSync(target), false);
});

test("installs the three commands with resolved hook paths, and a repeat run is a no-op", () => {
  const target = join(tempDir(), "claude");
  install(target);
  for (const name of ["quality-review", "fix-review", "final-review"]) assert.ok(existsSync(join(target, "skills", name, "SKILL.md")), name);
  for (const name of ["review-scope.mjs", "report-lint.mjs", "free-port.mjs"]) assert.ok(existsSync(join(target, "skills/quality-review/scripts", name)), name);
  for (const name of ["quality-review", "final-review"]) {
    const skill = readFileSync(join(target, "skills", name, "SKILL.md"), "utf8");
    assert.match(skill, /^          command: node$/m, name);
    assert.ok(skill.includes(`args: [${JSON.stringify(join(target, "skills/quality-review/scripts/report-lint.mjs"))}, "--hook"`), name);
    assert.doesNotMatch(skill, /__QUALITY_REVIEW_DIR__/);
  }
  assert.equal(existsSync(join(target, "agents")), false);
  assert.equal(existsSync(join(target, "backups")), false);
  const before = tree(target);
  const repeat = install(target);
  assert.doesNotMatch(repeat, /installed:|updated:|removed:|Backed up/);
  assert.deepEqual(tree(target), before);
});

test("--model rewrites the review model and is still idempotent", () => {
  const target = join(tempDir(), "claude");
  install(target, "--model", "opus");
  assert.match(readFileSync(join(target, "skills/quality-review/SKILL.md"), "utf8"), /^model: opus$/m);
  assert.doesNotMatch(readFileSync(join(target, "skills/fix-review/SKILL.md"), "utf8"), /^model:/m);
  assert.doesNotMatch(install(target, "--model", "opus"), /updated:|Backed up/);
  assert.equal(run("node", [installer, "--target", target, "--model", "x; rm -rf /"]).status, 1);
});

test("backs up only files it did not write or that the user changed, in one place, and says so", () => {
  const target = join(tempDir(), "claude");
  write(target, { "skills/fix-review/SKILL.md": "my own fix-review\n", "skills/unrelated/SKILL.md": "mine\n", "settings.json": "{}\n" });
  const first = install(target);
  assert.match(first, /Backed up 1 file\(s\)/);
  assert.deepEqual(tree(join(target, "backups")), ["quality-review/skills/fix-review/SKILL.md"]);
  assert.equal(readFileSync(join(target, "backups/quality-review/skills/fix-review/SKILL.md"), "utf8"), "my own fix-review\n");
  assert.equal(readFileSync(join(target, "skills/unrelated/SKILL.md"), "utf8"), "mine\n");
  assert.equal(readFileSync(join(target, "settings.json"), "utf8"), "{}\n");

  install(target);
  assert.deepEqual(tree(join(target, "backups")), ["quality-review/skills/fix-review/SKILL.md"]);

  writeFileSync(join(target, "skills/quality-review/review-guide.md"), "my edited guide\n");
  assert.match(install(target, "--dry-run"), /Would back up 1 file/);
  assert.equal(readFileSync(join(target, "skills/quality-review/review-guide.md"), "utf8"), "my edited guide\n");
  assert.match(install(target), /Backed up 1 file/);
  assert.deepEqual(tree(join(target, "backups")), ["quality-review/skills/fix-review/SKILL.md", "quality-review/skills/quality-review/review-guide.md"]);
});

test("uninstall removes what was installed, keeps user-modified and unrelated files", () => {
  const target = join(tempDir(), "claude");
  write(target, { "skills/unrelated/SKILL.md": "mine\n" });
  install(target);
  writeFileSync(join(target, "skills/final-review/SKILL.md"), "edited by me\n");
  assert.match(install(target, "--uninstall", "--dry-run"), /would remove/);
  assert.ok(existsSync(join(target, "skills/quality-review/SKILL.md")));
  const output = install(target, "--uninstall");
  assert.match(output, /kept \(modified since it was installed\): .*final-review/);
  assert.deepEqual(tree(target), ["skills/final-review/SKILL.md", "skills/unrelated/SKILL.md"]);
  assert.match(install(target, "--uninstall"), /Uninstalled from/);
});

test("replaces earlier versions of this package without touching anything else", () => {
  const temp = tempDir();
  const target = join(temp, "claude");
  const outside = join(temp, "outside.txt");
  writeFileSync(outside, "keep\n");
  const foreignHook = "/opt/other/quality-workflow/scripts/custom.sh";
  write(target, {
    "quality-workflow/install-manifest.json": JSON.stringify({ files: ["agents/senior-code-reviewer.md", "skills/freeze-review/SKILL.md", "quality-workflow/scripts/prepare-review.mjs", "../outside.txt", outside] }),
    "quality-workflow/scripts/prepare-review.mjs": "v1\n",
    "quality-workflow/evidence/run-1/manifest.json": "{}\n",
    "agents/senior-code-reviewer.md": "v1\n",
    "agents/my-own-agent.md": "mine\n",
    "skills/freeze-review/SKILL.md": "v1\n",
    "quality-review/install-manifest.json": JSON.stringify({ version: "1.0.0", files: ["agents/quality-reviewer.md", "quality-review/review-guide.md", "skills/quality-review/SKILL.md"] }),
    "quality-review/review-guide.md": "v2\n",
    "agents/quality-reviewer.md": "v2\n",
    "skills/quality-review/SKILL.md": "v2\n",
    "settings.json": JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: `"${target}/quality-workflow/scripts/verify-on-stop.sh"` }, { type: "command", command: foreignHook }] }] } }),
    "CLAUDE.md": "keep\n\n<!-- claude-quality-workflow:start -->\n@old\n<!-- claude-quality-workflow:end -->\n"
  });
  const output = install(target);
  assert.doesNotMatch(output, /Backed up/);
  assert.equal(existsSync(join(target, "backups")), false);
  for (const gone of ["quality-workflow", "quality-review", "agents/senior-code-reviewer.md", "agents/quality-reviewer.md", "skills/freeze-review"]) assert.equal(existsSync(join(target, gone)), false, gone);
  assert.equal(readFileSync(join(target, "agents/my-own-agent.md"), "utf8"), "mine\n");
  assert.equal(readFileSync(outside, "utf8"), "keep\n");
  assert.equal(readFileSync(join(target, "CLAUDE.md"), "utf8"), "keep\n");
  const hooks = JSON.parse(readFileSync(join(target, "settings.json"), "utf8")).hooks.Stop.flatMap((group) => group.hooks);
  assert.deepEqual(hooks.map((hook) => hook.command), [foreignHook]);
  assert.match(readFileSync(join(target, "skills/quality-review/SKILL.md"), "utf8"), /^name: quality-review$/m);
  assert.doesNotMatch(install(target), /installed:|updated:|removed/);
});

test("refuses to write through a symbolic link", () => {
  const temp = tempDir();
  const real = join(temp, "real");
  mkdirSync(real);
  symlinkSync(real, join(temp, "linked"), "dir");
  const linkedTarget = run("node", [installer, "--target", join(temp, "linked")]);
  assert.equal(linkedTarget.status, 1);
  assert.deepEqual(tree(real), []);

  const target = join(temp, "claude");
  mkdirSync(join(target, "skills"), { recursive: true });
  symlinkSync(real, join(target, "skills", "quality-review"), "dir");
  assert.equal(run("node", [installer, "--target", target]).status, 1);
  assert.deepEqual(tree(real), []);
});

test("a hostile installation path reaches the hook as one argument, never as shell text", () => {
  const target = join(tempDir(), 'cfg $(touch PWNED) `id` "q" \\ it\'s');
  install(target);
  for (const name of ["quality-review", "final-review"]) {
    const skill = readFileSync(join(target, "skills", name, "SKILL.md"), "utf8");
    const args = JSON.parse(/^          args: (\[.*\])$/m.exec(skill)[1]);
    assert.equal(args[0], join(target, "skills/quality-review/scripts/report-lint.mjs"), name);
    assert.match(skill, /^          command: node$/m);
    assert.doesNotMatch(skill, /command: .*report-lint/);
  }
  assert.doesNotMatch(install(target), /installed:|updated:/);
});

test("a directory where a file belongs stops the install before anything is written", () => {
  const target = join(tempDir(), "claude");
  mkdirSync(join(target, "skills/fix-review/SKILL.md"), { recursive: true });
  const result = run("node", [installer, "--target", target]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /exists and is not a regular file.*nothing was changed/);
  assert.deepEqual(tree(target), []);

  const installed = join(tempDir(), "claude");
  install(installed);
  rmSync(join(installed, "skills/fix-review/SKILL.md"));
  mkdirSync(join(installed, "skills/fix-review/SKILL.md"));
  assert.match(install(installed, "--uninstall"), /Uninstalled from/, "a stray directory must not block removal");
  assert.equal(existsSync(join(installed, "skills/quality-review")), false);
});

test("a directory or symbolic link at the backup name is stepped past, not read", () => {
  for (const blocker of ["directory", "link"]) {
    const temp = tempDir();
    const target = join(temp, "claude");
    const taken = join(target, "backups/quality-review/skills/fix-review/SKILL.md");
    write(target, { "skills/fix-review/SKILL.md": "mine\n" });
    writeFileSync(join(temp, "outside.txt"), "outside\n");
    mkdirSync(join(taken, ".."), { recursive: true });
    if (blocker === "directory") mkdirSync(taken); else symlinkSync(join(temp, "outside.txt"), taken);
    assert.match(install(target), /Backed up 1 file/, blocker);
    assert.equal(readFileSync(`${taken}.1`, "utf8"), "mine\n", blocker);
    assert.equal(readFileSync(join(temp, "outside.txt"), "utf8"), "outside\n", blocker);
  }
});
