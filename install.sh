#!/usr/bin/env bash
# Upgrade the existing manifest id in place, with a rollback copy. Does not rewrite seeded user assets.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec python3 "$SCRIPT_DIR/upgrade.py" "$@"
