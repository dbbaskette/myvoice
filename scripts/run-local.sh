#!/usr/bin/env bash
# Run myvoice from the local venv created by ./scripts/install-local.sh.
# With no arguments, runs `myvoice serve`. Any arguments are forwarded:
#
#   ./scripts/run-local.sh                       # myvoice serve
#   ./scripts/run-local.sh serve --no-browser    # explicit args
#   ./scripts/run-local.sh version               # myvoice version

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="$REPO_DIR/local-venv"

if [ ! -x "$VENV_DIR/bin/myvoice" ]; then
  echo "Error: local venv not found at $VENV_DIR" >&2
  echo "Run ./scripts/install-local.sh first." >&2
  exit 1
fi

if [ $# -eq 0 ]; then
  exec "$VENV_DIR/bin/myvoice" serve
fi

exec "$VENV_DIR/bin/myvoice" "$@"
