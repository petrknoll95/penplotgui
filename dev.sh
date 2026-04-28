#!/usr/bin/env bash

# Pen Plotter GUI - Development Server
# Runs both backend (FastAPI) and frontend (Vite) concurrently

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PORT="${PLOTTER_PORT:-8000}"
FRONTEND_PORT=9999
PIDS=()

is_port_busy() {
    lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

print_port_owner() {
    lsof -nP -iTCP:"$1" -sTCP:LISTEN 2>/dev/null || true
}

require_free_port() {
    local port="$1"
    local label="$2"

    if is_port_busy "$port"; then
        echo "Cannot start $label: port $port is already in use."
        print_port_owner "$port"
        echo ""
        echo "Stop the existing process, then run ./dev.sh again."
        exit 1
    fi
}

cleanup() {
    local status="${1:-0}"
    echo "Shutting down servers..."

    if [ "${#PIDS[@]}" -gt 0 ]; then
        kill "${PIDS[@]}" 2>/dev/null || true
        wait "${PIDS[@]}" 2>/dev/null || true
    fi

    exit "$status"
}

trap 'cleanup 130' SIGINT
trap 'cleanup 143' SIGTERM

require_free_port "$BACKEND_PORT" "backend"
require_free_port "$FRONTEND_PORT" "frontend"

echo "Starting development servers..."
echo "Backend:  http://localhost:$BACKEND_PORT"
echo "Frontend: http://localhost:$FRONTEND_PORT"
echo "Press Ctrl+C to stop."
echo ""

# Start backend
(
    cd "$SCRIPT_DIR/backend"
    source venv/bin/activate
    python main.py
) > >(sed "s/^/[backend] /") 2>&1 &
BACKEND_PID=$!
PIDS+=("$BACKEND_PID")

# Give uvicorn enough time to fail fast on common startup issues such as port conflicts.
sleep 1
if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    set +e
    wait "$BACKEND_PID"
    BACKEND_STATUS=$?
    set -e
    echo "Backend failed to start."
    cleanup "$BACKEND_STATUS"
fi

# Start frontend
(
    cd "$SCRIPT_DIR/frontend"
    npm run dev
) > >(sed "s/^/[frontend] /") 2>&1 &
FRONTEND_PID=$!
PIDS+=("$FRONTEND_PID")

while true; do
    sleep 1

    for pid in "${PIDS[@]}"; do
        if ! kill -0 "$pid" 2>/dev/null; then
            set +e
            wait "$pid"
            STATUS=$?
            set -e
            echo "A development server exited with status $STATUS."
            cleanup "$STATUS"
        fi
    done
done
