#!/usr/bin/env bash
set -euo pipefail
repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "full-validation: not in a Git repository" >&2; exit 1; }
cd "$repo_root"
script_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
state_dir="$(git rev-parse --git-path codex-quality-workflow)"
run_dir="$state_dir/full-validation-runs/$(date +%s)-$$"
mkdir -p "$run_dir"
log="$run_dir/validation.log"
receipt="$run_dir/receipt.env"
started="$(date +%s)"
starting_head="$(git rev-parse HEAD)"
starting_status_fingerprint="$(git status --porcelain=v1 --untracked-files=all | git hash-object --stdin)"
set +e
bash "$script_dir/verify.sh" full > "$log" 2>&1
status=$?
set -e
ending_head="$(git rev-parse HEAD)"
ending_status_fingerprint="$(git status --porcelain=v1 --untracked-files=all | git hash-object --stdin)"
state_unchanged=0
if [[ "$starting_head" == "$ending_head" && "$starting_status_fingerprint" == "$ending_status_fingerprint" ]]; then state_unchanged=1; fi
{
  printf 'STATUS=%s\n' "$status"
  printf 'HEAD=%s\n' "$ending_head"
  printf 'STATE_UNCHANGED=%s\n' "$state_unchanged"
  printf 'STATUS_FINGERPRINT=%s\n' "$ending_status_fingerprint"
  printf 'STARTED_AT_EPOCH=%s\n' "$started"
  printf 'COMPLETED_AT_EPOCH=%s\n' "$(date +%s)"
  printf 'LOG=%s\n' "$log"
} > "$receipt"
printf 'STATUS=%s\nHEAD=%s\nSTATE_UNCHANGED=%s\nLOG=%s\nRECEIPT=%s\n' "$status" "$ending_head" "$state_unchanged" "$log" "$receipt"
if [[ "$state_unchanged" -ne 1 ]]; then exit 74; fi
exit "$status"
