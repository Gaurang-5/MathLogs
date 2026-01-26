#!/bin/bash

# Development Environment Startup with Logging
# This script starts both server and client with proper log persistence

# Function to handle script termination (e.g., Ctrl+C)
cleanup() {
    echo ""
    echo "Stopping all services..."
    kill $(jobs -p) 2>/dev/null
    echo "Services stopped. Logs are preserved in:"
    echo "  - server/logs/server_$(date +%Y%m%d).log"
    exit
}

# Trap SIGINT (Ctrl+C) and SIGTERM calls to the cleanup function
trap cleanup SIGINT SIGTERM

echo "========================================="
echo "  Starting Development Environment"
echo "========================================="
echo ""

# Create logs directory for server if it doesn't exist
mkdir -p server/logs

# Start Server with logging
echo "✓ Starting Backend (Server) with logging..."
echo "  Log file: server/logs/server_$(date +%Y%m%d).log"
(cd server && ./start_with_logs.sh) &

# Wait a moment for server to initialize (optional but helpful)
sleep 3

# Start Client
echo ""
echo "✓ Starting Frontend (Client)..."
echo "  Client runs in browser console (check DevTools)"
(cd client && npm run dev) &

echo ""
echo "========================================="
echo "  Development Environment Running"
echo "========================================="
echo ""
echo "Server logs: server/logs/server_$(date +%Y%m%d).log"
echo "Press Ctrl+C to stop all services"
echo ""

# Wait for all background processes to keep the script running
wait
