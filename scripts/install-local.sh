#!/usr/bin/env bash
# Build the myvoice wheel from this repo and install it into a local venv at
# ./local-venv/. After this completes, `./local-venv/bin/myvoice` is ready
# to use, or run via `./scripts/run-local.sh`.
#
# Requires: uv, pnpm. Recreates ./local-venv/ from scratch each run.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="$REPO_DIR/local-venv"

cd "$REPO_DIR"

echo "==> Building wheel (make build)"
rm -rf dist
make build

WHEEL=$(ls "$REPO_DIR"/dist/myvoice-*-py3-none-any.whl | head -1)
if [ -z "$WHEEL" ]; then
  echo "Error: no wheel produced under $REPO_DIR/dist" >&2
  exit 1
fi

echo "==> Recreating venv at $VENV_DIR"
rm -rf "$VENV_DIR"
uv venv "$VENV_DIR" --python 3.11 -q

echo "==> Installing $(basename "$WHEEL")"
uv pip install --python "$VENV_DIR/bin/python" "$WHEEL" -q

echo ""
echo "Installed:"
"$VENV_DIR/bin/myvoice" version
echo ""
echo "Run with:  ./scripts/run-local.sh"
echo "       or: $VENV_DIR/bin/myvoice serve"
