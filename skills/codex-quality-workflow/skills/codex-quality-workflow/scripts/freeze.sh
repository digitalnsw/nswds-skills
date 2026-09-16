#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "freeze: not inside a Git repository" >&2
  exit 1
}
cd "$repo_root"

if [[ -n "$(git status --porcelain=v1 --untracked-files=all)" ]]; then
  echo "freeze: working tree is not clean; inspect and commit the intended implementation first" >&2
  git status --short >&2
  exit 1
fi

requested_branch="${1:-}"
base_ref=""

resolve_branch() {
  local requested="$1"
  if git show-ref --verify --quiet "refs/heads/$requested"; then
    printf '%s\n' "$requested"
  elif git show-ref --verify --quiet "refs/remotes/$requested"; then
    printf '%s\n' "$requested"
  elif git show-ref --verify --quiet "refs/remotes/origin/$requested"; then
    printf 'origin/%s\n' "$requested"
  else
    return 1
  fi
}

if [[ -n "$requested_branch" ]]; then
  if [[ "$requested_branch" =~ ^[0-9a-fA-F]{7,64}$ ]]; then
    echo "freeze: '$requested_branch' looks like a commit SHA; provide the branch this work will merge into, such as main" >&2
    exit 1
  fi
  base_ref="$(resolve_branch "$requested_branch" || true)"
  if [[ -z "$base_ref" ]]; then
    echo "freeze: '$requested_branch' is not a local or remote branch" >&2
    echo "Available branches:" >&2
    git for-each-ref --format='  %(refname:short)' refs/heads refs/remotes >&2
    exit 1
  fi
else
  remote_head="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || true)"
  for candidate in "$remote_head" origin/main main origin/master master; do
    [[ -n "$candidate" ]] || continue
    if git show-ref --verify --quiet "refs/heads/$candidate" || git show-ref --verify --quiet "refs/remotes/$candidate"; then
      base_ref="$candidate"
      break
    fi
  done
fi

if [[ -z "$base_ref" ]]; then
  echo "freeze: could not safely infer the branch this work will merge into" >&2
  echo "Choose the destination branch from this list, then invoke the codex-quality-workflow skill with freeze <branch>:" >&2
  git for-each-ref --format='  %(refname:short)' refs/heads refs/remotes >&2
  exit 1
fi

current_branch="$(git branch --show-current)"
if [[ "$current_branch" == "$base_ref" || "origin/$current_branch" == "$base_ref" ]]; then
  echo "freeze: the current branch '$current_branch' is also the selected base; switch to the feature branch first" >&2
  exit 1
fi

base_sha="$(git merge-base "$base_ref" HEAD)"
implementation_sha="$(git rev-parse HEAD)"
state_dir="$(git rev-parse --git-path codex-quality-workflow)"
mkdir -p "$state_dir"
state_file="$state_dir/freeze.env"
# Retain the previous run for inspection, but never reuse its repair/evidence state.
archive_dir="$state_dir/history/$(date +%s)-$$"
for old_state in freeze.env repair-state.json repair-candidate.json repair-verification.json progress.md current-evidence.env; do
  if [[ -f "$state_dir/$old_state" ]]; then
    mkdir -p "$archive_dir"
    mv "$state_dir/$old_state" "$archive_dir/$old_state"
  fi
done

{
  printf 'BASE_REF=%s\n' "$base_ref"
  printf 'BASE_SHA=%s\n' "$base_sha"
  printf 'IMPLEMENTATION_SHA=%s\n' "$implementation_sha"
  printf 'FROZEN_AT_UTC=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$state_file"

echo "Frozen review target"
echo "  base branch:    $base_ref"
echo "  merge base:     $base_sha"
echo "  implementation: $implementation_sha"
echo "  state:          $state_file"
echo "The base branch is the branch this work will merge into. Its merge base with"
echo "the current branch lets review isolate only the work introduced here."
