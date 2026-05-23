#!/bin/bash

# Development Environment Startup with Logging
# This script starts both server and client with proper log persistence

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$ROOT_DIR/server"
CLIENT_DIR="$ROOT_DIR/client"
SERVER_LOG_DIR="$SERVER_DIR/logs"
SERVER_LOG_FILE="$SERVER_LOG_DIR/server_$(date +%Y%m%d).log"

SERVER_PID=""
CLIENT_PID=""

# Function to handle script termination (e.g., Ctrl+C)
cleanup() {
    echo ""
    echo "Stopping all services..."

    if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
        kill "$SERVER_PID" 2>/dev/null || true
    fi

    if [[ -n "$CLIENT_PID" ]] && kill -0 "$CLIENT_PID" 2>/dev/null; then
        kill "$CLIENT_PID" 2>/dev/null || true
    fi

    wait "$SERVER_PID" "$CLIENT_PID" 2>/dev/null || true

    echo "Services stopped. Logs are preserved in:"
    echo "  - $SERVER_LOG_FILE"
    exit
}

# Trap SIGINT (Ctrl+C) and SIGTERM calls to the cleanup function
trap cleanup SIGINT SIGTERM

if [[ ! -d "$SERVER_DIR" || ! -d "$CLIENT_DIR" ]]; then
    echo "Could not find server/client directories next to dev.sh."
    echo "Expected:"
    echo "  - $SERVER_DIR"
    echo "  - $CLIENT_DIR"
    exit 1
fi

echo "========================================="
echo "  Starting Development Environment"
echo "========================================="
echo ""

# Create logs directory for server if it doesn't exist
mkdir -p "$SERVER_LOG_DIR"

# Start Server with logging
echo "✓ Starting Backend (Server) with logging..."
echo "  Log file: $SERVER_LOG_FILE"
(cd "$SERVER_DIR" && bash ./start_with_logs.sh) &
SERVER_PID=$!

# Wait a moment for server to initialize (optional but helpful)
sleep 3

# Start Client
echo ""
echo "✓ Starting Frontend (Client)..."
echo "  Client URL: http://127.0.0.1:5173/"
(cd "$CLIENT_DIR" && npm run dev -- --host 127.0.0.1) &
CLIENT_PID=$!

echo ""
echo "========================================="
echo "  Development Environment Running"
echo "========================================="
echo ""
echo "Server logs: $SERVER_LOG_FILE"
echo "Press Ctrl+C to stop all services"
echo ""

# Wait for all background processes to keep the script running
wait
