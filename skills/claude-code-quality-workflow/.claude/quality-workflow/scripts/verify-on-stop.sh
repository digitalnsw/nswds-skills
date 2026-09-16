#!/usr/bin/env bash
set -euo pipefail

payload="$(cat || true)"
if [[ "${QUALITY_SKIP_STOP_VERIFY:-0}" == "1" ]]; then
  exit 0
fi
if printf '%s' "$payload" | grep -Eq '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$repo_root" ]] || exit 0
cd "$repo_root"
if [[ -z "$(git status --porcelain=v1 --untracked-files=all)" ]]; then
  exit 0
fi

script_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
set +e
"$script_dir/verify.sh" full --reuse
verify_status=$?
set -e
if [[ "$verify_status" -ne 0 ]]; then
  if [[ "$verify_status" -eq 78 ]]; then
    echo "Dependency preflight needs attention. Follow dependency-preflight.md in the parent workflow; do not edit source to hide a missing dependency. The Stop hook does not install packages." >&2
    exit 2
  fi
  if [[ "$verify_status" -eq 75 ]]; then
    echo "A full validation is already running. Wait for it to finish; the stop hook will reuse its result instead of starting a competing run." >&2
    exit 2
  fi
  echo "Deterministic validation failed. Fix the failure without weakening the gate, then rerun it." >&2
  exit 2
fi
