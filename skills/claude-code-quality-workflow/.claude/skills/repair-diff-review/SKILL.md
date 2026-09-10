---
name: repair-diff-review
description: Read-only review of the current uncommitted repair diff against one confirmed finding.
argument-hint: "<finding ID and complete finding>"
disable-model-invocation: true
context: fork
agent: repair-diff-reviewer
background: false
---

Review only the uncommitted repair diff for: `$ARGUMENTS`.

Return the shared structured review schema. Clean means `COMPLETE` with an empty
findings array; partial output is not clean. Never edit, expand into a whole-branch
audit, or repair what you find.
