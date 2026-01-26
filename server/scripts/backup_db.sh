#!/bin/bash

# Database Backup Script for Coaching Centre SaaS
# Usage: ./backup_db.sh [manual|auto]
# Creates timestamped backups and cleans old backups (>7 days)

set -e  # Exit on error

# Configuration
DB_PATH="./prisma/dev.db"
BACKUP_DIR="./prisma/backups"
RETENTION_DAYS=7
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_TYPE="${1:-manual}"  # manual or auto

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Check if database exists
if [ ! -f "$DB_PATH" ]; then
    echo -e "${RED}[ERROR] Database file not found: $DB_PATH${NC}"
    exit 1
fi

# Create backup
BACKUP_FILE="$BACKUP_DIR/dev.db.${BACKUP_TYPE}_${TIMESTAMP}"
echo -e "${YELLOW}[BACKUP] Creating backup: $BACKUP_FILE${NC}"

cp "$DB_PATH" "$BACKUP_FILE"

# Verify backup was created
if [ -f "$BACKUP_FILE" ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo -e "${GREEN}[SUCCESS] Backup created successfully (Size: $BACKUP_SIZE)${NC}"
    echo -e "${GREEN}[SUCCESS] Location: $BACKUP_FILE${NC}"
else
    echo -e "${RED}[ERROR] Backup failed!${NC}"
    exit 1
fi

# Clean old backups (keep only last 7 days)
echo -e "${YELLOW}[CLEANUP] Removing backups older than $RETENTION_DAYS days...${NC}"
DELETED_COUNT=$(find "$BACKUP_DIR" -name "dev.db.*" -mtime +$RETENTION_DAYS -delete -print | wc -l | tr -d ' ')

if [ "$DELETED_COUNT" -gt 0 ]; then
    echo -e "${GREEN}[CLEANUP] Removed $DELETED_COUNT old backup(s)${NC}"
else
    echo -e "${YELLOW}[CLEANUP] No old backups to remove${NC}"
fi

# List current backups
echo -e "${YELLOW}[INFO] Current backups:${NC}"
ls -lh "$BACKUP_DIR" | tail -n +2 | awk '{print "  " $9 " (" $5 ")"}'

# Count total backups
TOTAL_BACKUPS=$(ls -1 "$BACKUP_DIR" | wc -l | tr -d ' ')
echo -e "${GREEN}[INFO] Total backups: $TOTAL_BACKUPS${NC}"

echo -e "${GREEN}[DONE] Backup complete!${NC}"
