---
name: repair-diff-review
description: Read-only review of the current repair diff against its confirmed finding batch.
argument-hint: "<1-5 finding IDs and complete findings>"
disable-model-invocation: true
context: fork
agent: repair-diff-reviewer
background: false
---

Review only the current repair diff for this coherent finding batch: `$ARGUMENTS`.

Return the shared structured review schema. Clean means `COMPLETE` with an empty
findings array; partial output is not clean. Never edit, expand into a whole-branch
audit, or repair what you find.
