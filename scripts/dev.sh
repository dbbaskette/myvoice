#!/usr/bin/env bash
# Start the dev workflow: FastAPI backend on :7878 + Vite dev server on :7879
# with HMR. Both logs stream to stdout with [api] / [web] prefixes.
# Ctrl-C stops both.
#
# Requires: uv, pnpm.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

# Ensure frontend deps are installed (idempotent, fast if already done).
if [ ! -d "packages/web/node_modules" ]; then
  echo "==> Installing frontend deps (first run)"
  (cd packages/web && pnpm install --frozen-lockfile)
fi

pids=()
cleanup() {
  for pid in "${pids[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "==> Starting backend (FastAPI) on http://127.0.0.1:7878"
uv run myvoice serve --dev --no-browser 2>&1 | sed -u 's/^/[api] /' &
pids+=($!)

echo "==> Starting frontend (Vite) on http://127.0.0.1:7879"
(cd packages/web && pnpm dev) 2>&1 | sed -u 's/^/[web] /' &
pids+=($!)

echo "==> Open http://127.0.0.1:7879  (Vite proxies /api/* to :7878)"
echo "==> Ctrl-C to stop both"
wait
