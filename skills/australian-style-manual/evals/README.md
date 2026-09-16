# Behavioural evaluations

These opt-in evaluations run the actual skill against isolated copies of a small content fixture. They cover an explicit assessment-only request and an ordinary review request, which should apply corrections by default. Both runs need the same write permissions so the assessment test can detect unintended edits.

The checks require findings for four clear editorial issues. Assessment must leave every file unchanged. Editing must correct heading and label case and an Australian date while preserving URLs, acronyms, identifiers, placeholders, a code block, configuration and already-correct prose. The editing comparison allows non-breaking spaces and line-ending differences, but otherwise expects the smallest corrections to this deliberately simple fixture; it is not a general editorial-quality scorer.

## Run

Requires Node.js 18 or newer and an installed, authenticated agent. Run from the repository root:

```sh
node --test skills/australian-style-manual/evals/check.test.mjs
node skills/australian-style-manual/evals/run.mjs --agent-command '["codex","exec","--skip-git-repo-check","--ephemeral","--sandbox","workspace-write","-"]'
```

The first command tests the outcome checker with deliberately failing examples. It does not evaluate a model. The second runs two live agent evaluations and consumes model usage. It is not automatically run by installation or CI.

The agent command is a JSON argument array executed directly without a shell. To use another agent, supply a non-interactive command or adapter that reads the prompt from stdin, works in its current directory, writes only its final JSON response to stdout, sends logs to stderr and exits non-zero on execution failure. Configure its permissions to restrict writes to the temporary workspace. The runner itself is not a sandbox and does not alter the agent's settings or permissions.

Each run receives only the current skill, references and input fixtures, not the expected corrections or checker. The runner retains prompts, stdout, stderr, resulting workspaces and results.json in a printed temporary directory. Each agent process has a 5-minute timeout. Missing findings, unwanted writes, malformed output, execution errors and absent corrections fail the run. Inspect retained outputs to distinguish content failures from agent configuration or source-access limitations. No live content is published or messages sent by the harness.

Passing these cases demonstrates these bounded behaviours for that agent run, not universal compliance or deterministic model behaviour. Read source-access limitations in the final report; the skill's provisional offline behaviour remains applicable.
