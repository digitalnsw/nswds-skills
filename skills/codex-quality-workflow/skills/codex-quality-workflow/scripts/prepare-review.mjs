#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const target = process.argv[2] ?? "initial";
if (!new Set(["initial", "final"]).has(target)) {
  console.error("usage: prepare-review.sh [initial|final]");
  process.exit(2);
}

const run = (command, args, options = {}) => spawnSync(command, args, {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
  ...options
});
const git = (args, options = {}) => {
  const result = run("git", args, options);
  if (result.status !== 0) throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
};
const gitRaw = (args, options = {}) => {
  const result = run("git", args, options);
  if (result.status !== 0) throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  return result.stdout;
};
const safeName = (value) => value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-|-$/g, "") || "analyzer";
const readEnv = (path) => Object.fromEntries(readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map((line) => {
  const separator = line.indexOf("=");
  return [line.slice(0, separator), line.slice(separator + 1)];
}));

try {
  const repo = git(["rev-parse", "--show-toplevel"]);
  process.chdir(repo);
  const workflowDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const stateDir = resolve(repo, git(["rev-parse", "--git-path", "codex-quality-workflow"]));
  const freezeFile = join(stateDir, "freeze.env");
  if (!existsSync(freezeFile)) throw new Error("no frozen checkpoint; run $codex-quality-workflow freeze or $codex-quality-workflow first");
  const frozen = readEnv(freezeFile);
  if (target === "final") {
    const check = run("bash", [join(workflowDir, "scripts", "check-freeze.sh")]);
    if (check.status !== 0) throw new Error("stale freeze: " + check.stderr);
  }
  const currentHead = git(["rev-parse", "HEAD"]);
  let head = frozen.IMPLEMENTATION_SHA;
  let acceptedRepairState = false;

  if (target === "initial") {
    if (currentHead !== frozen.IMPLEMENTATION_SHA) throw new Error("HEAD moved after freeze; freeze the intended implementation again");
    const status = git(["status", "--porcelain=v1", "--untracked-files=all"]);
    if (status) throw new Error("initial review preparation requires a clean frozen implementation");
  } else {
    const stateScript = join(workflowDir, "scripts", "repair-state.mjs");
    if (existsSync(join(stateDir, "repair-state.json"))) {
      const checked = run("node", [stateScript, "check"], { cwd: repo });
      if (checked.status !== 0) throw new Error(checked.stderr.trim() || "working tree differs from accepted repairs");
      acceptedRepairState = true;
    } else {
      const status = git(["status", "--porcelain=v1", "--untracked-files=all"]);
      if (status) throw new Error("final preparation requires clean code or an accepted automated repair snapshot");
      head = currentHead;
    }
  }

  // repair-state.json is JSON; resolve the accepted snapshot after the validation above.
  if (target === "final" && existsSync(join(stateDir, "repair-state.json"))) {
    head = JSON.parse(readFileSync(join(stateDir, "repair-state.json"), "utf8")).acceptedCommit;
  }

  const base = frozen.BASE_SHA;
  git(["cat-file", "-e", `${base}^{commit}`]);
  git(["cat-file", "-e", `${head}^{commit}`]);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const evidenceDir = join(stateDir, "evidence", `${target}-${head.slice(0, 12)}-${timestamp}`);
  const analyzerDir = join(evidenceDir, "analyzers");
  mkdirSync(analyzerDir, { recursive: true });

  const diff = gitRaw(["diff", "--binary", "--find-renames", `${base}...${head}`]);
  const contextDiff = gitRaw(["diff", "--find-renames", "--unified=80", `${base}...${head}`]);
  const tree = git(["ls-tree", "-r", "--name-only", head]);
  writeFileSync(join(evidenceDir, "diff.patch"), diff);
  writeFileSync(join(evidenceDir, "diff-context.patch"), contextDiff);
  writeFileSync(join(evidenceDir, "tree.txt"), `${tree}\n`);

  const numstat = git(["diff", "--numstat", "--find-renames", `${base}...${head}`]);
  const changedFiles = numstat ? numstat.split("\n").map((line) => {
    const [added, deleted, ...pathParts] = line.split("\t");
    return { path: pathParts.join("\t"), added: added === "-" ? null : Number(added), deleted: deleted === "-" ? null : Number(deleted) };
  }) : [];
  writeFileSync(join(evidenceDir, "changed-files.json"), `${JSON.stringify(changedFiles, null, 2)}\n`);

  const treeFiles = tree ? tree.split("\n") : [];
  const instructionPaths = treeFiles.filter((path) =>
    /(^|\/)(CLAUDE\.md|AGENTS\.md|CONTRIBUTING\.md|README\.md|copilot-instructions\.md|[^/]+\.instructions\.md)$/i.test(path)
    || /^(docs|\.github\/instructions)\//.test(path)
  );
  writeFileSync(join(evidenceDir, "instruction-paths.json"), `${JSON.stringify(instructionPaths, null, 2)}\n`);

  const testInventory = treeFiles.filter((path) =>
    /(^|\/)(__tests__|tests?|specs?|\.github\/workflows)(\/|$)/i.test(path)
    || /\.(test|spec)\.[^.]+$/i.test(path)
  );
  writeFileSync(join(evidenceDir, "test-inventory.json"), `${JSON.stringify(testInventory, null, 2)}\n`);

  const declarationPattern = /(?:class|interface|type|enum|function|def|func|struct|trait|const|let|var)\s+([A-Za-z_$][\w$]*)|(?:export\s+default\s+)([A-Za-z_$][\w$]*)/g;
  const symbols = new Set();
  for (const line of diff.split("\n")) {
    if (!/^[+-]/.test(line) || /^(---|\+\+\+)/.test(line)) continue;
    for (const match of line.matchAll(declarationPattern)) symbols.add(match[1] || match[2]);
    if (symbols.size >= 100) break;
  }
  const symbolContext = [];
  for (const symbol of symbols) {
    const references = run("git", ["grep", "-n", "-F", "-e", symbol, head, "--"], { cwd: repo });
    symbolContext.push({
      symbol,
      references: references.status === 0 ? references.stdout.trim().split("\n").slice(0, 50) : []
    });
  }
  writeFileSync(join(evidenceDir, "symbol-context.json"), `${JSON.stringify(symbolContext, null, 2)}\n`);

  let pullRequest = { available: false };
  if (run("gh", ["--version"], { cwd: repo }).status === 0) {
    const pr = run("gh", ["pr", "view", "--json", "number,title,body,baseRefName,headRefOid,url"], { cwd: repo });
    if (pr.status === 0) pullRequest = { available: true, ...JSON.parse(pr.stdout) };
  }
  writeFileSync(join(evidenceDir, "pull-request.json"), `${JSON.stringify(pullRequest, null, 2)}\n`);

  const verify = run(join(workflowDir, "scripts", "verify.sh"), ["full", "--reuse"], { cwd: repo });
  writeFileSync(join(evidenceDir, "validation.log"), `${verify.stdout}${verify.stderr}`);
  const validationPaths = [join(repo, ".codex", "quality-workflow", "validation.commands"), join(repo, ".claude", "quality-workflow", "validation.commands"), join(workflowDir, "validation.commands")];
  const selectedValidation = validationPaths.find(existsSync);
  const validationConfigured = Boolean(selectedValidation && readFileSync(selectedValidation, "utf8").split(/\r?\n/).some(line => line.trim() && !/^\s*#/.test(line)));

  const analyzerResults = [];
  const changedPathOutput = gitRaw(["diff", "--name-only", "-z", "--diff-filter=ACMR", `${base}...${head}`]);
  const changedPaths = changedPathOutput.split("\0").filter(Boolean).filter((path) => existsSync(join(repo, path)));
  const eslint = join(repo, "node_modules", ".bin", "eslint");
  const eslintFiles = changedPaths.filter((path) => /\.[cm]?[jt]sx?$/.test(path));
  if (existsSync(eslint) && eslintFiles.length) {
    const result = run(eslint, ["--format", "json", ...eslintFiles], { cwd: repo });
    writeFileSync(join(analyzerDir, "eslint.json"), result.stdout || "[]\n");
    writeFileSync(join(analyzerDir, "eslint.stderr.log"), result.stderr);
    analyzerResults.push({ name: "eslint", source: "built-in", status: result.status, outcome: result.status === 0 ? "clean" : result.status === 1 ? "findings" : "error", output: "analyzers/eslint.json" });
  }
  const pythonFiles = changedPaths.filter((path) => /\.pyi?$/.test(path));
  if (pythonFiles.length && run("ruff", ["--version"], { cwd: repo }).status === 0) {
    const result = run("ruff", ["check", "--output-format", "json", ...pythonFiles], { cwd: repo });
    writeFileSync(join(analyzerDir, "ruff.json"), result.stdout || "[]\n");
    writeFileSync(join(analyzerDir, "ruff.stderr.log"), result.stderr);
    analyzerResults.push({ name: "ruff", source: "built-in", status: result.status, outcome: result.status === 0 ? "clean" : result.status === 1 ? "findings" : "error", output: "analyzers/ruff.json" });
  }

  const codexAnalysis = join(repo, ".codex", "quality-workflow", "analysis.commands");
  const projectAnalysis = existsSync(codexAnalysis) ? codexAnalysis : join(repo, ".claude", "quality-workflow", "analysis.commands");
  const globalAnalysis = join(workflowDir, "analysis.commands");
  const analysisFile = existsSync(projectAnalysis) ? projectAnalysis : globalAnalysis;
  if (existsSync(analysisFile)) {
    for (const line of readFileSync(analysisFile, "utf8").split(/\r?\n/)) {
      if (!line.trim() || /^\s*#/.test(line)) continue;
      const [policy, name, ...commandParts] = line.split("\t");
      const command = commandParts.join("\t");
      if (!new Set(["required", "advisory"]).has(policy) || !name || !command) throw new Error(`invalid analysis.commands line: ${line}`);
      const result = run("bash", ["-o", "pipefail", "-c", command], {
        cwd: repo,
        env: {
          ...process.env,
          QUALITY_EVIDENCE_DIR: evidenceDir,
          QUALITY_BASE_SHA: base,
          QUALITY_HEAD_SHA: head,
          QUALITY_DIFF_FILE: join(evidenceDir, "diff.patch")
        }
      });
      const outputName = `analyzers/${safeName(name)}.log`;
      writeFileSync(join(evidenceDir, outputName), `${result.stdout}${result.stderr}`);
      analyzerResults.push({ name, source: "configured", policy, status: result.status, outcome: result.status === 0 ? "completed" : "failed", output: outputName });
    }
  }

  const statusAfter = git(["status", "--porcelain=v1", "--untracked-files=all"]);
  let repositoryStateSafe = !statusAfter && git(["rev-parse", "HEAD"]) === currentHead;
  if (acceptedRepairState) {
    const recheck = run("node", [join(workflowDir, "scripts", "repair-state.mjs"), "check"], { cwd: repo });
    repositoryStateSafe = recheck.status === 0 && git(["rev-parse", "HEAD"]) === currentHead;
  }
  const requiredAnalyzerFailure = analyzerResults.some((item) => item.policy === "required" && item.status !== 0);
  const warnings = [];
  if (!validationConfigured) warnings.push("Validation used generic auto-detection, not a repository-defined merge-gate command list.");
  if (analyzerResults.length === 0) warnings.push("No ESLint, Ruff, or configured static analyzer produced structured evidence.");
  if (!repositoryStateSafe) warnings.push("A deterministic command changed the reviewed repository state; evidence is not safe to review.");
  const ready = verify.status === 0 && !requiredAnalyzerFailure && repositoryStateSafe;
  const manifest = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    target,
    ready,
    repository: repo,
    baseBranch: frozen.BASE_REF,
    baseSha: base,
    headSha: head,
    implementationSha: frozen.IMPLEMENTATION_SHA,
    pullRequest,
    context: {
      changedFileCount: changedFiles.length,
      changedFiles: "changed-files.json",
      diff: "diff.patch",
      expandedDiff: "diff-context.patch",
      repositoryTree: "tree.txt",
      instructionPaths: "instruction-paths.json",
      testInventory: "test-inventory.json",
      symbolContext: "symbol-context.json"
    },
    validation: {
      status: verify.status,
      configured: validationConfigured,
      output: "validation.log"
    },
    analyzers: analyzerResults,
    warnings
  };
  writeFileSync(join(evidenceDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(stateDir, "current-evidence.env"), [
    `EVIDENCE_DIR=${evidenceDir}`,
    `TARGET=${target}`,
    `BASE_SHA=${base}`,
    `HEAD_SHA=${head}`,
    `READY=${ready ? 1 : 0}`,
    ""
  ].join("\n"));

  console.log(`EVIDENCE_DIR=${evidenceDir}`);
  console.log(`BASE_SHA=${base}`);
  console.log(`HEAD_SHA=${head}`);
  console.log(`CHANGED_FILES=${changedFiles.length}`);
  console.log(`VALIDATION=${verify.status === 0 ? "passed" : "failed"}`);
  console.log(`VALIDATION_SCOPE=${validationConfigured ? "repository-configured" : "generic-auto-detected"}`);
  console.log(`ANALYZERS=${analyzerResults.map((item) => `${item.name}:${item.outcome}`).join(",") || "none"}`);
  for (const warning of warnings) console.log(`WARNING=${warning}`);
  console.log(`READY=${ready ? 1 : 0}`);
  if (!ready) process.exit(1);
} catch (error) {
  console.error(`prepare-review: ${error.message}`);
  process.exit(1);
}
