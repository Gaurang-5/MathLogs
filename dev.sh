#!/bin/bash

# Development Environment Startup
# This script starts both server and client contemporaneously using concurrently
# It provides prefixed, colored log outputs in a single terminal window.

echo "========================================="
echo "  🚀 Starting Fullstack Dev Environment"
echo "========================================="
echo ""

# Use concurrently to run both development servers side-by-side
npx concurrently \
  -c "cyan.bold,magenta.bold" \
  -n "SERVER,CLIENT" \
  --kill-others \
  "cd server && npm run dev" \
  "cd client && npm run dev"
