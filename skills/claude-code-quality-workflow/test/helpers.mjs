import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const scripts = join(packageRoot, ".claude", "skills", "quality-review", "scripts");
export const installer = join(packageRoot, "scripts", "install.mjs");

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

export function ok(command, args, options = {}) {
  const result = run(command, args, options);
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} exited ${result.status}\n${result.stdout}${result.stderr}`);
  return result.stdout;
}

export function tempDir(prefix = "quality-review-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function write(root, files) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
}

// A repository with `base` committed on the default branch and `feature`
// committed on a branch called "feature".
export function makeRepo({ base, feature = {}, defaultBranch = "main" }) {
  const repo = tempDir();
  const git = (...args) => ok("git", args, { cwd: repo });
  git("init", "-q", "-b", defaultBranch);
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "Test");
  git("config", "commit.gpgsign", "false");
  write(repo, base);
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  git("checkout", "-q", "-b", "feature");
  if (Object.keys(feature).length) {
    write(repo, feature);
    git("add", "-A");
    git("commit", "-q", "-m", "feature");
  }
  return { repo, git };
}
