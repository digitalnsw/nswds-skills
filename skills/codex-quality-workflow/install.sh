#!/usr/bin/env bash
set -euo pipefail

package_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
exec node "$package_dir/scripts/install.mjs" "$@"
