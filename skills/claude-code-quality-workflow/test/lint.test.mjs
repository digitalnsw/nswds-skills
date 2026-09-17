import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { makeRepo, ok, run, scripts } from "./helpers.mjs";
import { lintReport } from "../.claude/skills/quality-review/scripts/report-lint.mjs";

const lintScript = join(scripts, "report-lint.mjs");
const finding = `### F1 · High · Discount is applied twice
**Location:** \`src/price.js:12-15\` · **Confidence:** high
The loop multiplies by the rate on every line item and again on the total.
**Trigger:** \`total([{ price: 100 }], 0.1)\`
**Consequence:** returns 81 instead of 90.
**Fix direction:** apply the rate once, on the total.
`;
const coverage = (rows = "| `src/price.js` | Assessed | behaviour, callers |") => `## Coverage

| Surface | Status | What was checked |
| --- | --- | --- |
${rows}

**Checks run:** \`npm test\` → failed (1 assertion in price.test.js)
**Worktree:** opening fingerprint abc, closing fingerprint abc — unchanged
`;
const header = "# Quality review: feature\n\n**Base:** main · **Merge base:** 1234567 · **Head:** 89abcde\n";
const withFinding = `${header}**Outcome:** 1 finding (1 high)\n\n## Findings\n\n${finding}\n${coverage()}`;
const clean = `${header}**Outcome:** No actionable findings\n\n${coverage()}`;

test("accepts a report with findings and a clean report", () => {
  assert.deepEqual(lintReport(withFinding), []);
  assert.deepEqual(lintReport(clean), []);
});

test("rejects the real failure: an apology and a promise instead of a review", () => {
  const problems = lintReport("You’re right — I reduced the review to a single CI observation instead of delivering a proper defect review of the implementation. I’m reopening the full branch diff now and will return only concrete behavioural findings.");
  assert.ok(problems.some((problem) => problem.includes("apology")));
  assert.ok(problems.some((problem) => problem.includes("promise")));
  assert.ok(problems.some((problem) => problem.includes("neither a finding")));
  assert.ok(problems.some((problem) => problem.includes("## Coverage")));
});

for (const [name, tail] of [
  ["a promise", "I'll continue with the remaining files next."],
  ["a future-tense plan", "I will now check the callers."],
  ["a request to resume", "I ran out of turns. Should I continue?"],
  ["an offer", "Say the word and I can resume the reviewer."],
  ["a question about process", "Would you like me to run the browser suite?"],
  ["an apology", "Sorry, the test run failed so the review stopped."]
]) {
  test(`rejects an otherwise complete report that ends with ${name}`, () => {
    assert.notDeepEqual(lintReport(`${clean}\n${tail}\n`), []);
  });
}

test("does not mistake quoted code or messages for narration", () => {
  const quoted = withFinding.replace("returns 81 instead of 90.", "prints `Sorry, I will retry` and returns 81.\n\n```js\n// I'll fix this later\n```");
  assert.deepEqual(lintReport(quoted), []);
});

test("rejects JSON, fenced or bare", () => {
  const json = JSON.stringify({ findings: [], coverage: "## Coverage No actionable findings merge base" });
  assert.ok(lintReport(json).some((problem) => problem.includes("JSON")));
  assert.ok(lintReport(`\`\`\`json\n${json}\n\`\`\``).some((problem) => problem.includes("JSON")));
});

test("rejects a CI observation with no outcome and no coverage", () => {
  const problems = lintReport("# Quality review\n\nMerge base 123. `npm test` fails on this branch: 1 assertion in price.test.js.");
  assert.ok(problems.some((problem) => problem.includes("neither a finding")));
  assert.ok(problems.some((problem) => problem.includes("## Coverage")));
});

test("rejects findings that lack a location, trigger, consequence, fix direction, confidence or severity", () => {
  for (const field of ["**Location:** `src/price.js:12-15` · ", "**Trigger:**", "**Consequence:**", "**Fix direction:**", "**Confidence:** high"]) {
    assert.notDeepEqual(lintReport(withFinding.replace(field, "")), [], field);
  }
  assert.ok(lintReport(withFinding.replace("· High ·", "·")).some((problem) => problem.includes("severity")));
  assert.ok(lintReport(withFinding.replace("src/price.js:12-15", "src/price.js")).some((problem) => problem.includes("Location")));
});

test("rejects contradictory outcomes and a final review without finding resolution", () => {
  assert.ok(lintReport(`${withFinding}\nNo actionable findings\n`).some((problem) => problem.includes("Keep one outcome")));
  assert.ok(lintReport(clean, { final: true }).some((problem) => problem.includes("Finding resolution")));
  assert.deepEqual(lintReport(clean.replace("## Coverage", "## Finding resolution\n\nNo earlier findings in this conversation.\n\n## Coverage"), { final: true }), []);
});

test("requires every changed production file to be assessed or named as a gap", () => {
  const scope = { files: [
    { path: "src/price.js", kind: "production", status: "M" },
    { path: "src/cart/total.js", kind: "production", status: "A" },
    { path: "src/cart/tax.js", kind: "production", status: "A" },
    { path: "src/gone.js", kind: "production", status: "D" },
    { path: "test/price.test.js", kind: "test", status: "M", removed: 2 },
    { path: "package-lock.json", kind: "generated", status: "M", removed: 900 }
  ] };
  const gutted = { files: [{ path: "README.md", kind: "docs", status: "M", removed: 33 }] };
  assert.match(lintReport(clean, { scope: gutted })[0], /README\.md/);
  assert.deepEqual(lintReport(clean.replace("## Coverage", "## Coverage\n\n| `README.md` | Assessed | removed section is intended |"), { scope: gutted }), []);
  const problems = lintReport(clean, { scope });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /src\/cart\/total\.js, src\/cart\/tax\.js/);
  assert.doesNotMatch(problems[0], /gone|price/);
  assert.deepEqual(lintReport(clean.replace("## Coverage", "## Coverage\n\n| `src/cart/**` | Gap | not read: out of time |"), { scope }), []);
  const mentionedOnlyInFindings = withFinding.replace("src/price.js:12-15", "src/cart/total.js:3");
  assert.equal(lintReport(mentionedOnlyInFindings, { scope }).length, 1);
});

test("requires the closing worktree fingerprint", () => {
  assert.ok(lintReport(clean, { currentFingerprint: "feedfacecafe" }).some((problem) => problem.includes("feedfacecafe")));
  assert.deepEqual(lintReport(clean.replace("closing fingerprint abc", "closing fingerprint feedfacecafe"), { currentFingerprint: "feedfacecafe" }), []);
});

test("as a Stop hook: blocks an incomplete answer once, passes a complete one, and never blocks twice", () => {
  const { repo } = makeRepo({ base: { "src/price.js": "1\n" }, feature: { "src/price.js": "2\n" } });
  const print = /: (\w+)/.exec(ok("node", [join(scripts, "review-scope.mjs"), "--fingerprint"], { cwd: repo }))[1];
  const hook = (message, active = false) => run("node", [lintScript, "--hook"], { input: JSON.stringify({ cwd: repo, stop_hook_active: active, last_assistant_message: message }) });

  const blocked = hook("I'm reopening the diff now and will return findings shortly.");
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /reply with the full corrected Markdown review report/);
  assert.equal(hook("I'm reopening the diff now.", true).status, 0);

  const missingPrint = hook(clean);
  assert.equal(missingPrint.status, 2);
  assert.match(missingPrint.stderr, new RegExp(print));
  assert.equal(hook(clean.replace("closing fingerprint abc", `closing fingerprint ${print}`)).status, 0);

  assert.equal(run("node", [lintScript, "--hook"], { input: "not json" }).status, 0);
});

test("rejects narration before the report title", () => {
  const problems = lintReport(`Fingerprint unchanged. Now writing the report.\n\n${clean}`);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /does not begin with the report title/);
});
