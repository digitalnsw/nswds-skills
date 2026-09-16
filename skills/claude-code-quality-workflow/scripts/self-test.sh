#!/usr/bin/env bash
set -euo pipefail

root="$(cd -- "$(dirname -- "$0")/.." && pwd)"
node "$root/scripts/init-test.mjs"
node "$root/scripts/dependency-test.mjs"

for script in "$root"/.claude/quality-workflow/scripts/*.sh "$root/install.sh"; do
  bash -n "$script"
done
for script in "$root"/.claude/quality-workflow/scripts/*.mjs "$root"/scripts/*.mjs; do
  node --check "$script"
done

node -e 'for (const path of process.argv.slice(1)) JSON.parse(require("fs").readFileSync(path, "utf8"))' \
  "$root/.claude/settings.json" \
  "$root/.claude/.claude-plugin/plugin.json" \
  "$root/.claude/quality-workflow/schemas/review-findings.schema.json" \
  "$root/.claude/quality-workflow/schemas/review-evidence.schema.json" \
  "$root/.claude/quality-workflow/examples/findings.example.json" \
  "$root/.claude/quality-workflow/examples/partial-findings.example.json"

node "$root/.claude/quality-workflow/scripts/validate-findings.mjs" \
  "$root/.claude/quality-workflow/examples/findings.example.json"
node "$root/.claude/quality-workflow/scripts/validate-findings.mjs" \
  "$root/.claude/quality-workflow/examples/partial-findings.example.json"

if command -v shellcheck >/dev/null; then
  shellcheck "$root"/.claude/quality-workflow/scripts/*.sh "$root/install.sh" "$root/scripts/self-test.sh"
fi
if command -v claude >/dev/null; then
  claude plugin validate "$root/.claude"
fi

echo "quality-workflow package self-test passed"
