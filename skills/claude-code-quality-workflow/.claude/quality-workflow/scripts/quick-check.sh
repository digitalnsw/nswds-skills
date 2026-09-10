#!/usr/bin/env bash
set -euo pipefail

# Drain hook JSON input so the hook remains compatible with Claude Code's command
# hook protocol. The check intentionally does not need to parse it.
input="$(cat || true)"
: "$input"

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$repo_root" ]] || exit 0
cd "$repo_root"

if ! git diff --check; then
  echo "Post-edit check failed: resolve whitespace or conflict-marker errors." >&2
  exit 2
fi

