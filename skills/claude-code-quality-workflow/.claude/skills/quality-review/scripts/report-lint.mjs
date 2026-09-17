#!/usr/bin/env node
// Checks that a review command ended with a completed Markdown review rather
// than JSON, an apology, a status update or a promise.
//
//   report-lint.mjs [--final] [--repo <dir>] < report.md   lint a report from stdin
//   report-lint.mjs --hook [--final]                  Stop-hook mode (hook JSON on stdin)
//
// Hook mode blocks the stop once (exit 2, reasons on stderr) so the model
// rewrites its answer, and never blocks twice in a row.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fingerprint, reviewScope } from "./review-scope.mjs";

const FORBIDDEN = [
  [/\b(sorry|apologi[sz]e|apologies|you(?:'|’)re right|you are right|my mistake)\b/i, "apology"],
  [/\bI(?:(?:'|’)ll| will| shall|(?:'|’)m going to| am going to|(?:'|’)m (?:now )?(?:re)?(?:opening|reading|reviewing|checking|running)| am (?:now )?(?:re)?(?:opening|reading|reviewing|checking|running))\b/i, "future-tense promise or progress narration"],
  [/\b(say the word|shall I|should I (?:continue|resume|proceed|go on)|would you like me to|do you want me to|want me to (?:continue|resume|proceed)|let me know (?:if|when|whether) you(?:(?:'|’)d| would)? (?:like|want)|I can (?:continue|resume|pick up))\b/i, "request to manage the review's internal process"],
  [/\b(to be continued|review (?:is )?(?:still )?in progress|still (?:reviewing|working|running)|ran out of (?:turns|time|context)|hit (?:the|my) (?:turn|tool|context) limit)\b/i, "unfinished review"]
];
const SEVERITIES = /\b(blocker|high|medium|low)\b/i;
const FIELDS = [
  [/\*\*Location:?\*\*:?\s*`?[^\s`]+:\d+/i, "a **Location:** with `path:line`"],
  [/\*\*Confidence:?\*\*/i, "**Confidence:**"],
  [/\*\*Trigger:?\*\*/i, "**Trigger:**"],
  [/\*\*Consequence:?\*\*/i, "**Consequence:**"],
  [/\*\*Fix direction:?\*\*/i, "**Fix direction:**"]
];

function prose(markdown) {
  return markdown.replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]*`/g, " ").replace(/^>.*$/gm, " ");
}

export function lintReport(report, { final = false, scope = null, currentFingerprint = "" } = {}) {
  const problems = [];
  const text = report.trim();
  if (!text) return ["The answer is empty. Write the review report."];

  const unfenced = text.replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/, "$1").trim();
  if (/^[{[]/.test(unfenced)) {
    try { JSON.parse(unfenced); problems.push("The answer is JSON. Write the report as Markdown for a human reader."); } catch { /* not JSON */ }
  }

  const findings = [...text.matchAll(/^###\s+F-?\d+\b.*$/gm)];
  const clean = /\bNo actionable findings\b/.test(text);
  if (findings.length === 0 && !clean) problems.push("The answer has neither a finding (`### F1 · <Severity> · <title>`) nor the exact phrase `No actionable findings`. A review must end in one of those two outcomes.");
  if (findings.length > 0 && clean) problems.push("The answer reports findings and also says `No actionable findings`. Keep one outcome.");

  findings.forEach((match, index) => {
    const end = index + 1 < findings.length ? findings[index + 1].index : text.search(/^##\s+Coverage\b/m) > match.index ? text.search(/^##\s+Coverage\b/m) : text.length;
    const block = text.slice(match.index, end);
    const id = match[0].replace(/^###\s+/, "").slice(0, 60);
    if (!SEVERITIES.test(match[0])) problems.push(`Finding "${id}" has no severity (Blocker, High, Medium or Low) in its heading.`);
    for (const [pattern, label] of FIELDS) if (!pattern.test(block)) problems.push(`Finding "${id}" is missing ${label}.`);
  });

  const coverageAt = text.search(/^##\s+Coverage\b/m);
  if (coverageAt === -1) problems.push("There is no `## Coverage` section.");
  if (!/merge base/i.test(text)) problems.push("The report does not state the base branch and merge base.");
  if (final && !/^##\s+Finding resolution\b/m.test(text)) problems.push("There is no `## Finding resolution` section.");

  for (const [pattern, label] of FORBIDDEN) {
    const hit = pattern.exec(prose(text));
    if (hit) problems.push(`The answer contains ${label} ("${hit[0]}"). Report only what was reviewed and found; state anything unreviewed as a coverage gap.`);
  }

  if (scope?.files && coverageAt !== -1) {
    const coverage = text.slice(coverageAt);
    const missing = scope.files.filter((file) => file.kind === "production" && file.status !== "D").map((file) => file.path).filter((path) => {
      if (coverage.includes(path)) return false;
      const parts = path.split("/");
      for (let depth = parts.length - 1; depth > 0; depth -= 1) {
        const directory = parts.slice(0, depth).join("/");
        if (coverage.includes(`${directory}/**`) || coverage.includes(`${directory}/*`)) return false;
      }
      return true;
    });
    if (missing.length) problems.push(`The Coverage section does not account for these changed production files: ${missing.slice(0, 15).join(", ")}${missing.length > 15 ? ` and ${missing.length - 15} more` : ""}. List each as assessed, or as an unverified gap with the reason. A directory may be written as \`dir/**\`.`);
  }
  if (currentFingerprint && !text.includes(currentFingerprint)) {
    problems.push(`The Coverage section does not record the closing worktree fingerprint (${currentFingerprint}). State whether it matches the opening fingerprint from the review scope.`);
  }
  return problems;
}

function repositoryFacts(report, cwd) {
  try {
    const stated = /\*\*Base:?\*\*:?\s*`?([^\s`·|,()]+)/i.exec(report)?.[1] ?? "";
    let scope;
    try { scope = reviewScope({ requested: stated, cwd, usePullRequest: false }); } catch { scope = reviewScope({ cwd, usePullRequest: false }); }
    return { scope: scope.base ? scope : null, currentFingerprint: fingerprint(scope.root) };
  } catch {
    return {};
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const final = args.includes("--final");
  if (args.includes("--hook")) {
    try {
      const input = JSON.parse(readFileSync(0, "utf8"));
      if (input.stop_hook_active) process.exit(0);
      const report = String(input.last_assistant_message ?? "");
      const problems = lintReport(report, { final, ...repositoryFacts(report, input.cwd || process.cwd()) });
      if (problems.length === 0) process.exit(0);
      console.error(`The review is not complete. Do not explain, apologise or describe what comes next: reply with the full corrected Markdown review report and nothing else. If something could not be reviewed, list it under Coverage as a gap.\n- ${problems.join("\n- ")}`);
      process.exit(2);
    } catch {
      process.exit(0); // A broken hook must never trap the session.
    }
  }
  const repoAt = args.indexOf("--repo");
  const repo = repoAt === -1 ? "" : args[repoAt + 1];
  const report = readFileSync(0, "utf8");
  const problems = lintReport(report, { final, ...(repo ? repositoryFacts(report, repo) : {}) });
  if (problems.length) { console.error(problems.map((problem) => `- ${problem}`).join("\n")); process.exit(1); }
  console.log("report-lint: ok");
}
