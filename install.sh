#!/usr/bin/env bash
set -euo pipefail
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required but was not found." >&2
  echo "Install it from https://nodejs.org and run this again." >&2
  exit 1
fi
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "$DIR/install.mjs" "$@"
