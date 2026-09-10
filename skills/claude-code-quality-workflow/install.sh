#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
if ! command -v node >/dev/null 2>&1; then
  echo "Global installation requires Node.js 18 or newer." >&2
  exit 1
fi
exec node "$script_dir/scripts/install-global.mjs" "$@"

