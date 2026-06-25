#!/bin/bash

# Production-Ready Server Startup Script with Logging
# Creates logs directory, rotates old logs, and persists all output

set -e

# Configuration
LOGS_DIR="./logs"
LOG_FILE="$LOGS_DIR/server_$(date +%Y%m%d).log"
MAX_LOG_AGE_DAYS=7

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Create logs directory
mkdir -p "$LOGS_DIR"

# Clean old logs
echo -e "${YELLOW}[LOGGING] Cleaning logs older than $MAX_LOG_AGE_DAYS days...${NC}"
find "$LOGS_DIR" -name "server_*.log" -mtime +$MAX_LOG_AGE_DAYS -delete 2>/dev/null || true

# Log startup
echo -e "${GREEN}[LOGGING] Starting server with logging to: $LOG_FILE${NC}"
echo -e "${YELLOW}[INFO] Press Ctrl+C to stop server${NC}"
echo ""

# Start server with output to both console and log file
# The 'tee' command duplicates output to both stdout and the log file
echo "=== SERVER STARTED AT $(date) ===" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

npm run dev 2>&1 | tee -a "$LOG_FILE"
