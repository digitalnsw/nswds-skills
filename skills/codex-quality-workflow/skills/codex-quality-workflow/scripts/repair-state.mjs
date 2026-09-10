#!/usr/bin/env node

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const action = process.argv[2];
const findingId = process.argv[3] ?? "";
if (!new Set(["init", "check", "candidate", "accept", "current"]).has(action)) {
  console.error("usage: repair-state.mjs <init|check|candidate|accept|current> [finding-id]");
  process.exit(2);
}

const run = (args, options = {}) => {
  const result = spawnSync("git", args, { encoding: "utf8", ...options });
  if (result.status !== 0) throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
};

const repo = run(["rev-parse", "--show-toplevel"]);
process.chdir(repo);
const gitState = run(["rev-parse", "--git-path", "codex-quality-workflow"]);
const stateDir = resolve(repo, gitState);
mkdirSync(stateDir, { recursive: true });
const stateFile = join(stateDir, "repair-state.json");
const candidateFile = join(stateDir, "repair-candidate.json");

const readState = () => {
  if (!existsSync(stateFile)) throw new Error("repair state is not initialized; run repair-state.mjs init");
  const state = JSON.parse(readFileSync(stateFile, "utf8"));
  if (run(["rev-parse", "HEAD"]) !== state.implementationCommit) throw new Error("HEAD moved since repair initialization; start a new frozen run");
  return state;
};
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

const snapshot = (label) => {
  const temporary = mkdtempSync(join(tmpdir(), "quality-workflow-index-"));
  const indexPath = join(temporary, "index");
  const env = { ...process.env, GIT_INDEX_FILE: indexPath };
  try {
    run(["read-tree", "HEAD"], { env });
    run(["add", "-A", "--", "."], { env });
    const tree = run(["write-tree"], { env });
    const commit = run(["commit-tree", tree, "-p", "HEAD"], {
      env,
      input: `quality-workflow snapshot: ${label}\n`
    });
    return { commit, tree };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
};

try {
  if (action === "init") {
    const status = run(["status", "--porcelain=v1", "--untracked-files=all"]);
    if (status) throw new Error("repair pipeline must start from a clean frozen implementation");
    const head = run(["rev-parse", "HEAD"]);
    const state = {
      implementationCommit: head,
      acceptedCommit: head,
      acceptedFindings: [],
      updatedAt: new Date().toISOString()
    };
    writeJson(stateFile, state);
    console.log(`ACCEPTED_SNAPSHOT=${head}`);
  } else if (action === "check") {
    const state = readState();
    const current = snapshot("baseline-check");
    const acceptedTree = run(["rev-parse", `${state.acceptedCommit}^{tree}`]);
    if (current.tree !== acceptedTree) {
      throw new Error("working tree differs from the last accepted repair snapshot; stop before another repair");
    }
    console.log(`ACCEPTED_SNAPSHOT=${state.acceptedCommit}`);
  } else if (action === "candidate") {
    if (!/^R-[0-9]{3,}$/.test(findingId)) throw new Error("candidate requires a finding ID such as R-001");
    const state = readState();
    const candidate = snapshot(`candidate ${findingId}`);
    const record = {
      findingId,
      baseCommit: state.acceptedCommit,
      candidateCommit: candidate.commit,
      candidateTree: candidate.tree,
      createdAt: new Date().toISOString()
    };
    writeJson(candidateFile, record);
    console.log(`FINDING_ID=${findingId}`);
    console.log(`BASE_SNAPSHOT=${record.baseCommit}`);
    console.log(`CANDIDATE_SNAPSHOT=${record.candidateCommit}`);
  } else if (action === "accept") {
    const state = readState();
    if (!existsSync(candidateFile)) throw new Error("no repair candidate exists");
    const candidate = JSON.parse(readFileSync(candidateFile, "utf8"));
    if (findingId && findingId !== candidate.findingId) throw new Error("candidate finding ID does not match");
    const current = snapshot(`accept-check ${candidate.findingId}`);
    if (current.tree !== candidate.candidateTree) throw new Error("working tree changed after repair-diff review; candidate cannot be accepted");
    state.acceptedCommit = candidate.candidateCommit;
    state.acceptedFindings = [...new Set([...state.acceptedFindings, candidate.findingId])];
    state.updatedAt = new Date().toISOString();
    writeJson(stateFile, state);
    console.log(`ACCEPTED_SNAPSHOT=${state.acceptedCommit}`);
  } else {
    const state = readState();
    console.log(`ACCEPTED_SNAPSHOT=${state.acceptedCommit}`);
  }
} catch (error) {
  console.error(`repair-state: ${error.message}`);
  process.exit(1);
}
