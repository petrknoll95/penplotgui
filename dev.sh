#!/bin/bash

# Pen Plotter GUI - Development Server
# Runs both backend (FastAPI) and frontend (Vite) concurrently

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cleanup() {
    echo "Shutting down servers..."
    kill $(jobs -p) 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

echo "Starting development servers..."
echo "Backend:  http://localhost:8000"
echo "Frontend: http://localhost:9999"
echo "Press Ctrl+C to stop."
echo ""

# Start backend
(
    cd "$SCRIPT_DIR/backend"
    source venv/bin/activate
    python main.py
) 2>&1 | sed "s/^/[backend] /" &

# Start frontend
(
    cd "$SCRIPT_DIR/frontend"
    npm run dev
) 2>&1 | sed "s/^/[frontend] /" &

wait
