#!/usr/bin/env bash
# Run myvoice from the local venv created by ./scripts/install-local.sh.
# With no arguments, runs `myvoice serve`. Any arguments are forwarded:
#
#   ./scripts/run-local.sh                       # myvoice serve
#   ./scripts/run-local.sh serve --no-browser    # explicit args
#   ./scripts/run-local.sh version               # myvoice version
#
# When starting the server, any already-running instance is stopped first
# (so you don't get an "address already in use" error from a stale process).

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="$REPO_DIR/local-venv"

if [ ! -x "$VENV_DIR/bin/myvoice" ]; then
  echo "Error: local venv not found at $VENV_DIR" >&2
  echo "Run ./scripts/install-local.sh first." >&2
  exit 1
fi

# Stop any already-running myvoice server before starting a new one.
# Kills both prior servers launched from this venv and whatever currently
# holds the target port (default 7878, or the value of --port).
kill_existing_server() {
  local port=7878 prev=""
  for arg in "$@"; do
    [ "$prev" = "--port" ] && port="$arg"
    prev="$arg"
  done

  # 1) Servers started from this venv (any port).
  pkill -f "$VENV_DIR/bin/myvoice serve" 2>/dev/null || true

  # 2) Anything bound to the target port (covers --dev reloader children and
  #    instances started another way).
  if command -v lsof >/dev/null 2>&1; then
    local pids
    pids="$(lsof -ti "tcp:$port" 2>/dev/null || true)"
    if [ -n "$pids" ]; then
      echo "Stopping existing process on port $port (pid: $(echo "$pids" | tr '\n' ' '))" >&2
      # shellcheck disable=SC2086
      kill $pids 2>/dev/null || true
    fi
  fi

  # Give the OS a moment to release the socket before rebinding.
  sleep 0.5
}

if [ $# -eq 0 ]; then
  kill_existing_server
  exec "$VENV_DIR/bin/myvoice" serve
fi

if [ "${1:-}" = "serve" ]; then
  kill_existing_server "$@"
fi

exec "$VENV_DIR/bin/myvoice" "$@"
