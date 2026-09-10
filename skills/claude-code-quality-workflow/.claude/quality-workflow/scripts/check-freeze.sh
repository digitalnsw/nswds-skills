#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "check-freeze: not inside a Git repository" >&2
  exit 1
}
cd "$repo_root"
state_file="$(git rev-parse --git-path claude-quality-workflow)/freeze.env"

if [[ ! -f "$state_file" ]]; then
  echo "check-freeze: no checkpoint; commit the implementation and run /freeze-review" >&2
  exit 1
fi

read_value() {
  sed -n "s/^$1=//p" "$state_file" | head -n 1
}

base_sha="$(read_value BASE_SHA)"
implementation_sha="$(read_value IMPLEMENTATION_SHA)"
if [[ ! "$base_sha" =~ ^[0-9a-fA-F]{40,64}$ ]] || [[ ! "$implementation_sha" =~ ^[0-9a-fA-F]{40,64}$ ]]; then
  echo "check-freeze: malformed checkpoint state" >&2
  exit 1
fi
git cat-file -e "${base_sha}^{commit}" 2>/dev/null || {
  echo "check-freeze: recorded base commit is unavailable" >&2
  exit 1
}
git cat-file -e "${implementation_sha}^{commit}" 2>/dev/null || {
  echo "check-freeze: recorded implementation commit is unavailable" >&2
  exit 1
}
if ! git merge-base --is-ancestor "$implementation_sha" HEAD; then
  echo "check-freeze: HEAD no longer descends from the frozen implementation; freeze is stale" >&2
  exit 1
fi

echo "BASE_SHA=$base_sha"
echo "IMPLEMENTATION_SHA=$implementation_sha"
echo "HEAD_SHA=$(git rev-parse HEAD)"

