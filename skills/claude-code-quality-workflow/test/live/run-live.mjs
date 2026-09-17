#!/usr/bin/env node
// Behavioural tests that run the installed commands through the real Claude
// Code CLI against fixture repositories. They use model quota, so they are not
// part of `node --test`; run them before releasing a change to the commands.
//
//   node test/live/run-live.mjs [--keep] [--out <dir>] [defect|clean|hook|all]
//
// Requires: the package installed globally (./install.sh) and `claude` signed in.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { installer, makeRepo, ok, run, scripts, tempDir } from "../helpers.mjs";
import { lintReport } from "../../.claude/skills/quality-review/scripts/report-lint.mjs";

const args = process.argv.slice(2);
const outAt = args.indexOf("--out");
const out = outAt === -1 ? tempDir("quality-review-live-") : args[outAt + 1];
const which = args.find((arg, index) => !arg.startsWith("--") && index !== outAt + 1) ?? "all";
mkdirSync(out, { recursive: true });

const results = [];
function check(name, condition, detail = "") {
  results.push({ name, passed: Boolean(condition) });
  console.log(`${condition ? "ok  " : "FAIL"} ${name}${!condition && detail ? `\n       ${detail}` : ""}`);
}

const stale = ok("node", [installer, "--dry-run"]);
if (/would (install|update|remove)/.test(stale)) {
  console.error("The globally installed commands differ from this checkout. Run ./install.sh first.\n" + stale);
  process.exit(1);
}

function claude(repo, prompt, { resume = "", edits = false, label }) {
  const cli = ["-p", prompt, "--output-format", "json", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}',
    "--allowedTools", "Bash(npm run *)", "Bash(npm test*)", "Bash(node --test*)"];
  const debugLog = join(out, `${label}.debug.log`);
  cli.push("--debug-file", debugLog);
  if (edits) cli.push("--permission-mode", "acceptEdits");
  if (resume) cli.push("--resume", resume);
  const started = Date.now();
  const result = spawnSync("claude", cli, { cwd: repo, encoding: "utf8", timeout: 20 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 });
  let parsed = {};
  try { parsed = JSON.parse(result.stdout); } catch { /* reported below */ }
  const text = String(parsed.result ?? "");
  writeFileSync(join(out, `${label}.md`), text || `${result.stdout}\n${result.stderr}`);
  const seconds = Math.round((Date.now() - started) / 1000);
  console.log(`\n== ${label}: ${seconds}s, ${parsed.num_turns ?? "?"} turns, $${Number(parsed.total_cost_usd ?? 0).toFixed(2)} (API-equivalent), models: ${Object.keys(parsed.modelUsage ?? {}).join(", ") || "?"}`);
  check(`${label}: the command ran to completion`, result.status === 0 && text, (result.stderr || result.stdout).slice(0, 400));
  let debug = "";
  try { debug = readFileSync(debugLog, "utf8"); } catch { /* no debug log: the hook check below reports it */ }
  return { text, session: parsed.session_id, turns: parsed.num_turns, hookRan: /Removing one-shot hook for event Stop in skill/.test(debug), debug };
}

const state = (repo) => [ok("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: repo }), ok("git", ["rev-parse", "HEAD"], { cwd: repo }), ok("git", ["stash", "list"], { cwd: repo }), ok("node", [join(scripts, "review-scope.mjs"), "--fingerprint"], { cwd: repo })].join("|");
const findingAbout = (text, pattern) => {
  const block = text.split(/^(?=###\s+F\d+\b)/m).filter((part) => /^###\s+F\d+\b/.test(part)).map((part) => part.split(/^##\s/m)[0]).find((part) => pattern.test(part));
  return block ? /^###\s+(F\d+)/.exec(block)[1] : "";
};

function reviewIsWellFormed(label, repo, text, { final = false } = {}) {
  const facts = JSON.parse(ok("node", [join(scripts, "review-scope.mjs"), "--json"], { cwd: repo }));
  const print = /: (\w+)/.exec(ok("node", [join(scripts, "review-scope.mjs"), "--fingerprint"], { cwd: repo }))[1];
  const problems = lintReport(text, { final, scope: facts, currentFingerprint: print });
  check(`${label}: is a complete Markdown report, not JSON, apology, status or promise`, problems.length === 0, problems.join(" | "));
  check(`${label}: states the automatically selected base and merge base`, text.includes("main") && text.includes(facts.base.mergeBase.slice(0, 7)));
}

const packageJson = (scriptsField) => `${JSON.stringify({ name: "orders", version: "1.0.0", private: true, type: "module", scripts: scriptsField }, null, 2)}\n`;
const lintScript = `import { readFileSync, readdirSync } from "node:fs";
let failed = false;
for (const file of readdirSync("src")) {
  readFileSync(\`src/\${file}\`, "utf8").split("\\n").forEach((line, index) => {
    if (/^\\s*var\\s/.test(line)) { console.error(\`src/\${file}:\${index + 1} no-var: use const or let\`); failed = true; }
  });
}
process.exit(failed ? 1 : 0);
`;
const ci = "name: CI\non:\n  pull_request:\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm run lint\n      - run: npm run typecheck\n      - run: npm test\n";

// Scenario 1: two real defects on two surfaces, one clean surface, a failing
// lint check, and a typecheck command whose tool is not installed.
function defectScenario() {
  const { repo } = makeRepo({
    base: {
      "package.json": packageJson({ lint: "node scripts/lint.js", typecheck: "tsc --noEmit", test: "node --test" }),
      ".github/workflows/ci.yml": ci,
      "scripts/lint.js": lintScript,
      "src/format.js": "export function formatCurrency(cents) {\n  return `$${(cents / 100).toFixed(2)}`;\n}\n",
      "src/config.js": "export const config = { pageSize: 20 };\n",
      "src/orders.js": "import { config } from \"./config.js\";\n\nexport function listOrders(orders) {\n  return orders.slice(0, config.pageSize);\n}\n",
      "src/report.js": "import { formatCurrency } from \"./format.js\";\n\nexport function reportLine(order) {\n  return `${order.id}: ${formatCurrency(order.totalCents)}`;\n}\n",
      "test/report.test.js": "import assert from \"node:assert/strict\";\nimport { test } from \"node:test\";\nimport { reportLine } from \"../src/report.js\";\n\ntest(\"formats a report line\", () => {\n  assert.equal(reportLine({ id: \"A1\", totalCents: 1250 }), \"A1: $12.50\");\n});\n"
    },
    feature: {
      "src/paginate.js": "// Returns one page of items. Pages are numbered from 1, as in the orders UI.\nexport function paginate(items, page, pageSize) {\n  var start = page * pageSize;\n  return items.slice(start, start + pageSize);\n}\n",
      "src/orders.js": "import { config } from \"./config.js\";\nimport { paginate } from \"./paginate.js\";\n\n// page is 1-based: listOrders(orders) returns the first page.\nexport function listOrders(orders, page = 1) {\n  return paginate(orders, page, config.pageSize);\n}\n",
      "src/format.js": "export function formatMoney(cents, currency = \"AUD\") {\n  return new Intl.NumberFormat(\"en-AU\", { style: \"currency\", currency }).format(cents / 100);\n}\n",
      "src/config.js": "export const config = { pageSize: 20, maxPageSize: 100 };\n",
      "test/paginate.test.js": "import assert from \"node:assert/strict\";\nimport { test } from \"node:test\";\nimport { paginate } from \"../src/paginate.js\";\n\ntest(\"returns at most one page of items\", () => {\n  const items = Array.from({ length: 50 }, (_, index) => index);\n  assert.equal(paginate(items, 1, 20).length, 20);\n});\n"
    }
  });
  const before = state(repo);
  const review = claude(repo, "/quality-review", { label: "1-defect-quality-review" });
  check("defect: the review did not modify the repository", state(repo) === before);
  reviewIsWellFormed("defect", repo, review.text);
  const pagination = findingAbout(review.text, /paginate\.js:\d+/);
  const rename = findingAbout(review.text, /formatCurrency/);
  check("defect: reports the 1-based pagination defect at src/paginate.js with a line", pagination, "no finding cites src/paginate.js:<line>");
  check("defect: traces the renamed export to its unchanged consumer src/report.js", rename && /report\.js/.test(review.text));
  check("defect: a failing lint check did not replace the implementation review", pagination && rename && /lint/i.test(review.text));
  check("defect: the unavailable typecheck is recorded, not fatal", /typecheck/i.test(review.text) && /tsc|not (run|installed|available|found)/i.test(review.text));
  const coverageSection = review.text.slice(review.text.search(/^## Coverage/m));
  check("defect: all four changed production surfaces appear in Coverage", ["src/paginate.js", "src/orders.js", "src/format.js", "src/config.js"].every((path) => coverageSection.includes(path)));
  check("defect: finished within the turn budget", Number(review.turns) > 0 && Number(review.turns) <= 45, `turns: ${review.turns}`);
  if (!pagination || !review.session) return;

  // Repair only the pagination finding; the rename finding must stay untouched.
  const fix = claude(repo, `/fix-review ${pagination}`, { resume: review.session, edits: true, label: "2-defect-fix-review" });
  const changed = ok("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: repo }).split("\n").filter(Boolean).map((line) => line.slice(3));
  check("fix: changed only files that belong to the selected finding", changed.length > 0 && changed.every((path) => /^(src\/paginate\.js|test\/paginate\.test\.js)$/.test(path)), `changed: ${changed.join(", ")}`);
  const probe = run("node", ["--input-type=module", "-e", "import { listOrders } from './src/orders.js'; const o = Array.from({ length: 50 }, (_, i) => i); process.exit(listOrders(o)[0] === 0 && listOrders(o, 2)[0] === 20 ? 0 : 1);"], { cwd: repo });
  check("fix: the selected defect is actually repaired", probe.status === 0, probe.stderr.slice(0, 300));
  check("fix: left the repair uncommitted and reported what remains", ok("git", ["log", "--oneline"], { cwd: repo }).trim().split("\n").length === 2 && /## Not repaired/.test(fix.text) && /## Repaired/.test(fix.text));
  check("fix: does not claim the unselected finding was repaired", rename ? new RegExp(`## Not repaired[\\s\\S]*${rename}\\b`).test(fix.text) : true);

  const beforeFinal = state(repo);
  const final = claude(repo, "/final-review", { resume: fix.session ?? review.session, label: "3-defect-final-review" });
  check("final: the review did not modify the repository", state(repo) === beforeFinal);
  reviewIsWellFormed("final", repo, final.text, { final: true });
  const resolution = final.text.slice(final.text.search(/^## Finding resolution/m), final.text.search(/^## Coverage/m));
  check("final: confirms the repaired finding as resolved from the code", new RegExp(`${pagination}\\b[^\\n]*\\bResolved`).test(resolution), resolution.slice(0, 400));
  check("final: does not call the unrepaired finding resolved", rename ? new RegExp(`${rename}\\b[^\\n]*\\b(Not resolved|Not attempted)`).test(resolution) : true, resolution.slice(0, 400));
  return repo;
}

// Scenario 2: a correct, tested change. The right answer is no findings.
function cleanScenario() {
  const { repo } = makeRepo({
    base: {
      "package.json": packageJson({ test: "node --test" }),
      "src/slug.js": "export function slugify(text) {\n  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, \"-\").replace(/^-+|-+$/g, \"\");\n}\n",
      "test/slug.test.js": "import assert from \"node:assert/strict\";\nimport { test } from \"node:test\";\nimport { slugify } from \"../src/slug.js\";\n\ntest(\"slugifies\", () => {\n  assert.equal(slugify(\" Hello, World! \"), \"hello-world\");\n});\n"
    },
    feature: {
      "src/truncate.js": "// Shortens text to at most `limit` Unicode code points, ending with an ellipsis when it was cut.\n// Code points, not grapheme clusters: callers pass plain product names, and the limit is a storage limit.\nexport function truncate(text, limit) {\n  if (!Number.isInteger(limit) || limit < 1) throw new RangeError(\"limit must be a positive integer\");\n  const characters = Array.from(text);\n  if (characters.length <= limit) return text;\n  return `${characters.slice(0, limit - 1).join(\"\")}…`;\n}\n",
      "test/truncate.test.js": "import assert from \"node:assert/strict\";\nimport { test } from \"node:test\";\nimport { truncate } from \"../src/truncate.js\";\n\ntest(\"leaves short text alone\", () => {\n  assert.equal(truncate(\"abc\", 3), \"abc\");\n});\n\ntest(\"cuts long text to the limit including the ellipsis\", () => {\n  assert.equal(truncate(\"abcdef\", 4), \"abc…\");\n  assert.equal(truncate(\"abcdef\", 1), \"…\");\n});\n\ntest(\"counts characters, not UTF-16 units\", () => {\n  assert.equal(truncate(\"👍👍👍\", 2), \"👍…\");\n});\n\ntest(\"rejects a limit that is not a positive integer\", () => {\n  assert.throws(() => truncate(\"abc\", 0), RangeError);\n  assert.throws(() => truncate(\"abc\", 1.5), RangeError);\n});\n"
    }
  });
  const before = state(repo);
  const review = claude(repo, "/quality-review", { label: "4-clean-quality-review" });
  check("clean: the review did not modify the repository", state(repo) === before);
  reviewIsWellFormed("clean", repo, review.text);
  check("clean: the completion hook ran on the final answer", review.hookRan, "the session debug log does not show the one-shot Stop hook completing");
  check("clean: reports `No actionable findings` and invents none", /No actionable findings/.test(review.text) && !/^###\s+F\d+/m.test(review.text));
  check("clean: ran the repository's test command as evidence", /(npm (run )?test|node --test)[^\n]*pass/i.test(review.text));
}

// Scenario 3: the completion hook inside real Claude Code. A probe command
// with the same hook is told to answer with a promise; the hook must send the
// answer back, and the promise must not be what the user receives.
function hookScenario() {
  const { repo } = makeRepo({ base: { "src/a.js": "export const a = 1;\n" }, feature: { "src/a.js": "export const a = 2;\n" } });
  const probe = join(repo, ".claude", "skills", "hook-probe");
  mkdirSync(probe, { recursive: true });
  writeFileSync(join(repo, ".git", "info", "exclude"), ".claude/\n");
  writeFileSync(join(probe, "SKILL.md"), `---
name: hook-probe
description: Test probe for the review completion hook.
disable-model-invocation: true
model: haiku
hooks:
  Stop:
    - hooks:
        - type: command
          command: node "${join(scripts, "report-lint.mjs")}" --hook
          once: true
          timeout: 30
---

Reply with exactly this sentence and nothing else, without using any tools: I'll reopen the diff and come back with findings shortly.
`);
  const answer = claude(repo, "/hook-probe", { label: "5-hook-probe" });
  check("hook: the promise was sent back by the completion hook", /The review is not complete/.test(answer.debug) || /report-lint|Stop hook/i.test(answer.debug) && Number(answer.turns) > 1, `turns: ${answer.turns}`);
  check("hook: the promise is not what the user received", !/come back with findings shortly/.test(answer.text), answer.text.slice(0, 300));
}

console.log(`Reports are written to ${out}`);
if (which === "all" || which === "defect") defectScenario();
if (which === "all" || which === "clean") cleanScenario();
if (which === "all" || which === "hook") hookScenario();
const failed = results.filter((result) => !result.passed);
console.log(`\n${results.length - failed.length}/${results.length} live checks passed. Reports: ${out}`);
process.exit(failed.length ? 1 : 0);
