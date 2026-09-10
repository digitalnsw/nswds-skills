#!/usr/bin/env bash
set -euo pipefail

mode="${1:-full}"
reuse="${2:-}"
if [[ "$mode" != "quick" && "$mode" != "full" ]] || [[ -n "$reuse" && "$reuse" != "--reuse" ]]; then
  echo "usage: verify.sh [quick|full] [--reuse]" >&2
  exit 2
fi

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "verify: not inside a Git repository" >&2
  exit 1
}
cd "$repo_root"
script_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
workflow_dir="$(cd -- "$script_dir/.." && pwd)"
project_commands="$repo_root/.codex/quality-workflow/validation.commands"
if [[ ! -f "$project_commands" ]]; then project_commands="$repo_root/.claude/quality-workflow/validation.commands"; fi
global_commands="$workflow_dir/validation.commands"
if [[ -f "$project_commands" ]]; then commands_file="$project_commands"; else commands_file="$global_commands"; fi
ran=0

workspace_fingerprint() {
  {
    git rev-parse HEAD
    git diff --binary HEAD --
    while IFS= read -r -d '' untracked; do
      printf '%s\0' "$untracked"
      git hash-object -- "$untracked"
    done < <(git ls-files --others --exclude-standard -z)
  } | git hash-object --stdin
}

gate_fingerprint() {
  if [[ -f "$commands_file" ]]; then
    { printf 'configured\n'; git hash-object "$commands_file"; } | git hash-object --stdin
  else
    printf 'auto-detect-v2\n' | git hash-object --stdin
  fi
}

run_gate() {
  local command_text="$1"
  echo "+ $command_text"
  bash -o pipefail -c "$command_text"
  ran=$((ran + 1))
}

echo "+ git diff --check"
git diff --check
ran=$((ran + 1))
if [[ "$mode" == "quick" ]]; then
  echo "quick validation passed ($ran gate)"
  exit 0
fi

state_dir="$(git rev-parse --git-path codex-quality-workflow)"
mkdir -p "$state_dir"
lock_dir="$state_dir/validation.lock"
result_file="$state_dir/last-validation.env"
lock_token="$$-$(date +%s)"
starting_fingerprint="$(workspace_fingerprint)"
starting_gate_fingerprint="$(gate_fingerprint)"
cache_seconds="${QUALITY_VALIDATION_CACHE_SECONDS:-600}"
wait_seconds="${QUALITY_VALIDATION_WAIT_SECONDS:-60}"

read_result_value() {
  [[ -f "$result_file" ]] || return 0
  sed -n "s/^$1=//p" "$result_file" | head -n 1
}

reuse_cached_result() {
  local cached_workspace cached_gate cached_status completed_at now age
  cached_workspace="$(read_result_value WORKSPACE_FINGERPRINT)"
  cached_gate="$(read_result_value GATE_FINGERPRINT)"
  cached_status="$(read_result_value STATUS)"
  completed_at="$(read_result_value COMPLETED_AT_EPOCH)"
  [[ "$cached_workspace" == "$starting_fingerprint" ]] || return 125
  [[ "$cached_gate" == "$starting_gate_fingerprint" ]] || return 125
  [[ "$cached_status" =~ ^[0-9]+$ ]] || return 125
  [[ "$completed_at" =~ ^[0-9]+$ ]] || return 125
  now="$(date +%s)"
  age=$((now - completed_at))
  (( age >= 0 && age <= cache_seconds )) || return 125
  if [[ "$cached_status" -eq 0 ]]; then
    echo "full validation already passed for this exact repository state (${age}s ago); reusing result"
    return 0
  fi
  echo "the latest full validation failed for this exact repository state (${age}s ago)" >&2
  return "$cached_status"
}

try_reuse_or_continue() {
  local cached_code
  set +e
  reuse_cached_result
  cached_code=$?
  set -e
  if [[ "$cached_code" -ne 125 ]]; then exit "$cached_code"; fi
}

if [[ "$reuse" == "--reuse" ]]; then try_reuse_or_continue; fi

waited=0
while ! mkdir "$lock_dir" 2>/dev/null; do
  lock_pid="$(sed -n 's/^PID=//p' "$lock_dir/owner" 2>/dev/null | head -n 1 || true)"
  lock_started="$(sed -n 's/^STARTED_AT_EPOCH=//p' "$lock_dir/owner" 2>/dev/null | head -n 1 || true)"
  stale_lock=0
  if [[ "$lock_pid" =~ ^[0-9]+$ ]] && ! kill -0 "$lock_pid" 2>/dev/null; then
    stale_lock=1
  elif [[ "$lock_started" =~ ^[0-9]+$ ]] && (( $(date +%s) - lock_started > 3600 )); then
    stale_lock=1
  elif [[ ! "$lock_pid" =~ ^[0-9]+$ ]] && (( waited >= 2 )); then
    stale_lock=1
  fi
  if [[ "$stale_lock" -eq 1 ]]; then
    stale_dir="$state_dir/validation.lock.stale.$(date +%s).$$"
    if mv "$lock_dir" "$stale_dir" 2>/dev/null; then
      echo "verify: recovered a stale validation lock" >&2
      continue
    fi
  fi
  if [[ "$reuse" != "--reuse" ]]; then
    echo "verify: another full validation is already running for this repository" >&2
    exit 75
  fi
  if (( waited >= wait_seconds )); then
    echo "verify: validation is still running after ${wait_seconds}s; not starting a competing run" >&2
    exit 75
  fi
  if (( waited == 0 )); then echo "verify: another full validation is running; waiting for its result"; fi
  sleep 1
  waited=$((waited + 1))
  if [[ ! -d "$lock_dir" ]]; then
    starting_fingerprint="$(workspace_fingerprint)"
    starting_gate_fingerprint="$(gate_fingerprint)"
    try_reuse_or_continue
  fi
done

{
  printf 'PID=%s\n' "$$"
  printf 'TOKEN=%s\n' "$lock_token"
  printf 'STARTED_AT_EPOCH=%s\n' "$(date +%s)"
} > "$lock_dir/owner"

finish_validation() {
  local result=$?
  set +e
  current_token="$(sed -n 's/^TOKEN=//p' "$lock_dir/owner" 2>/dev/null | head -n 1)"
  if [[ "$current_token" == "$lock_token" ]]; then
    ending_fingerprint="$(workspace_fingerprint 2>/dev/null)"
    result_temp="$state_dir/last-validation.env.$$"
    {
      printf 'WORKSPACE_FINGERPRINT=%s\n' "$ending_fingerprint"
      printf 'GATE_FINGERPRINT=%s\n' "$starting_gate_fingerprint"
      printf 'STATUS=%s\n' "$result"
      printf 'COMPLETED_AT_EPOCH=%s\n' "$(date +%s)"
    } > "$result_temp"
    mv "$result_temp" "$result_file"
    rm -f "$lock_dir/owner"
    rmdir "$lock_dir" 2>/dev/null
  fi
  exit "$result"
}
trap finish_validation EXIT

if [[ -f "$commands_file" ]] && grep -Eq '^[[:space:]]*[^#[:space:]]' "$commands_file"; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*$ ]] && continue
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    run_gate "$line"
  done < "$commands_file"
  echo "full validation passed ($ran gates, configured by $commands_file)"
  exit 0
fi

package_runner=""
if [[ -f pnpm-lock.yaml ]] && command -v pnpm >/dev/null; then package_runner="pnpm"
elif [[ -f yarn.lock ]] && command -v yarn >/dev/null; then package_runner="yarn"
elif [[ -f bun.lockb || -f bun.lock ]] && command -v bun >/dev/null; then package_runner="bun"
elif [[ -f package.json ]] && command -v npm >/dev/null; then package_runner="npm"
fi

has_package_script() {
  node -e 'const p=require("./package.json"); process.exit(p.scripts && p.scripts[process.argv[1]] ? 0 : 1)' "$1" 2>/dev/null
}
run_package_script() {
  local script_name="$1"
  case "$package_runner" in
    npm) run_gate "npm run $script_name" ;;
    pnpm) run_gate "pnpm run $script_name" ;;
    yarn) run_gate "yarn $script_name" ;;
    bun) run_gate "bun run $script_name" ;;
  esac
}

if [[ -n "$package_runner" ]] && command -v node >/dev/null; then
  for script_name in format:check lint typecheck test build; do
    if has_package_script "$script_name"; then run_package_script "$script_name"; fi
  done
fi
if [[ -f pyproject.toml || -f setup.cfg || -f tox.ini ]]; then
  command -v ruff >/dev/null && run_gate "ruff check ."
  command -v ruff >/dev/null && run_gate "ruff format --check ."
  command -v pytest >/dev/null && run_gate "pytest"
fi
if [[ -f go.mod ]] && command -v go >/dev/null; then run_gate "go vet ./..."; run_gate "go test ./..."; fi
if [[ -f Cargo.toml ]] && command -v cargo >/dev/null; then
  run_gate "cargo fmt --check"
  run_gate "cargo clippy --all-targets --all-features -- -D warnings"
  run_gate "cargo test --all-features"
fi
if [[ "$ran" -eq 1 ]]; then
  echo "verify: no project gates were detected; configure $project_commands" >&2
  exit 1
fi
echo "auto-detected baseline validation passed ($ran gates); configure validation.commands for the authoritative merge gate"
