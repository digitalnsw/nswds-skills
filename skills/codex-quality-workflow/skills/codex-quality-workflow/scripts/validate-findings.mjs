#!/usr/bin/env node

import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: validate-findings.mjs <review-findings.json>");
  process.exit(2);
}

let report;
try {
  report = JSON.parse(readFileSync(file, "utf8"));
} catch (error) {
  console.error(`invalid JSON: ${error.message}`);
  process.exit(1);
}

const errors = [];
const sha = /^[0-9a-f]{40,64}$/i;
const findingId = /^R-[0-9]{3,}$/;
const severities = new Set(["BLOCKING", "SHOULD_FIX", "WORTH_KNOWING"]);
const confidences = new Set(["HIGH", "MEDIUM", "LOW"]);
const statuses = new Set(["UNTRIAGED", "CONFIRMED", "REJECTED", "NEEDS_DECISION"]);
const targets = new Set(["frozen-implementation", "repair-diff", "final-branch"]);
const completionStatuses = new Set(["COMPLETE", "PARTIAL"]);

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value) => typeof value === "string" && value.trim().length > 0;
const checkText = (value, path) => {
  if (!text(value)) errors.push(`${path} must be a non-empty string`);
};
const checkStringArray = (value, path, allowEmpty = true) => {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    errors.push(`${path} must be ${allowEmpty ? "an" : "a non-empty"} array`);
    return;
  }
  value.forEach((item, index) => checkText(item, `${path}[${index}]`));
};

if (!object(report)) errors.push("report must be an object");
if (!object(report?.review)) {
  errors.push("review must be an object");
} else {
  if (!sha.test(report.review.base_sha ?? "")) errors.push("review.base_sha must be a 40-64 character hexadecimal SHA");
  if (!sha.test(report.review.head_sha ?? "")) errors.push("review.head_sha must be a 40-64 character hexadecimal SHA");
  checkText(report.review.reviewer, "review.reviewer");
  if (!targets.has(report.review.target)) errors.push("review.target is invalid");
  if (report.review.target === "repair-diff") {
    checkStringArray(report.review.assigned_finding_ids, "review.assigned_finding_ids", false);
    const ids = report.review.assigned_finding_ids;
    if (Array.isArray(ids)) {
      if (ids.some((id) => !findingId.test(id))) errors.push("review.assigned_finding_ids must contain finding IDs matching R-001");
      if (new Set(ids).size !== ids.length) errors.push("review.assigned_finding_ids must not contain duplicates");
    }
  }
}

if (!object(report?.completion)) {
  errors.push("completion must be an object");
} else {
  if (!completionStatuses.has(report.completion.status)) errors.push("completion.status must be COMPLETE or PARTIAL");
  checkStringArray(report.completion.remaining_scope, "completion.remaining_scope");
  if (typeof report.completion.continuation_notes !== "string") errors.push("completion.continuation_notes must be a string");
  if (report.completion.status === "COMPLETE") {
    if (report.completion.remaining_scope?.length !== 0) errors.push("a COMPLETE review cannot have remaining_scope");
    if (report.completion.continuation_notes !== "") errors.push("a COMPLETE review must have empty continuation_notes");
  }
  if (report.completion.status === "PARTIAL") {
    if (!report.completion.remaining_scope?.length) errors.push("a PARTIAL review must identify remaining_scope");
    checkText(report.completion.continuation_notes, "completion.continuation_notes");
  }
}

if (!Array.isArray(report?.findings)) {
  errors.push("findings must be an array");
} else {
  const ids = new Set();
  report.findings.forEach((finding, index) => {
    const path = `findings[${index}]`;
    if (!object(finding)) {
      errors.push(`${path} must be an object`);
      return;
    }
    if (!findingId.test(finding.id ?? "")) errors.push(`${path}.id must match R-001`);
    if (ids.has(finding.id)) errors.push(`${path}.id is duplicated`);
    ids.add(finding.id);
    if (!severities.has(finding.severity)) errors.push(`${path}.severity is invalid`);
    if (!confidences.has(finding.confidence)) errors.push(`${path}.confidence is invalid`);
    if (!statuses.has(finding.status)) errors.push(`${path}.status is invalid`);
    for (const field of ["title", "contract", "trigger", "observed_behavior", "expected_behavior", "consequence", "required_outcome"]) {
      checkText(finding[field], `${path}.${field}`);
    }
    checkStringArray(finding.evidence, `${path}.evidence`, false);
    if (!Array.isArray(finding.evidence_sources) || finding.evidence_sources.length === 0) {
      errors.push(`${path}.evidence_sources must be a non-empty array`);
    } else {
      const sourceKinds = new Set(["code", "contract", "test", "validation", "static-analysis", "runtime", "history"]);
      finding.evidence_sources.forEach((source, sourceIndex) => {
        const sourcePath = `${path}.evidence_sources[${sourceIndex}]`;
        if (!object(source)) {
          errors.push(`${sourcePath} must be an object`);
          return;
        }
        if (!sourceKinds.has(source.kind)) errors.push(`${sourcePath}.kind is invalid`);
        checkText(source.reference, `${sourcePath}.reference`);
        if (source.detail !== undefined) checkText(source.detail, `${sourcePath}.detail`);
      });
    }
    if (!Array.isArray(finding.locations) || finding.locations.length === 0) {
      errors.push(`${path}.locations must be a non-empty array`);
    } else {
      finding.locations.forEach((location, locationIndex) => {
        const locationPath = `${path}.locations[${locationIndex}]`;
        if (!object(location)) {
          errors.push(`${locationPath} must be an object`);
          return;
        }
        checkText(location.path, `${locationPath}.path`);
        if (!Number.isInteger(location.line) || location.line < 1) errors.push(`${locationPath}.line must be a positive integer`);
        if (location.end_line !== undefined && (!Number.isInteger(location.end_line) || location.end_line < location.line)) {
          errors.push(`${locationPath}.end_line must be at or after line`);
        }
      });
    }
    if (finding.status === "REJECTED" && !text(finding.triage_reason)) errors.push(`${path}.triage_reason is required when rejected`);
    if (finding.status === "NEEDS_DECISION") {
      checkText(finding.decision_question, `${path}.decision_question`);
      checkText(finding.decision_owner, `${path}.decision_owner`);
    }
  });
}

if (!object(report?.coverage)) {
  errors.push("coverage must be an object");
} else {
  const passes = report.coverage.passes_completed;
  if (!Array.isArray(passes) || passes.some((pass) => !Number.isInteger(pass) || pass < 1 || pass > 9)) {
    errors.push("coverage.passes_completed must contain only integers 1-9");
  }
  checkStringArray(report.coverage.commands_run, "coverage.commands_run");
  checkStringArray(report.coverage.not_run, "coverage.not_run");
  checkStringArray(report.coverage.clean_areas, "coverage.clean_areas");
}

if (errors.length > 0) {
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`valid ${report.completion.status.toLowerCase()} review report: ${report.findings.length} finding(s)`);
