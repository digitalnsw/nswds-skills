---
name: quality-init
description: Discover this repository's real CI gates and save a local validation plan without changing source files. Also refresh an existing generated plan.
argument-hint: "[refresh]"
disable-model-invocation: true
---

Read `${CLAUDE_SKILL_DIR}/../../quality-workflow/init-protocol.md` completely and
perform init-only with ENGINE=claude. Resolve SCRIPTS beside that protocol.
When refresh is requested, inspect gate definitions again and save even if READY;
preserve explicit repository configuration. Do not run review or repair agents.
Do not ask the user to manually author validation.commands. This command may write
only the local Git metadata described in the protocol, not repository source.
