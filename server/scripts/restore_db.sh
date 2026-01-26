#!/bin/bash

# Database Restore Script for Coaching Centre SaaS
# Usage: ./restore_db.sh [backup_filename]
# Restores database from a backup file

set -e  # Exit on error

# Configuration
DB_PATH="./prisma/dev.db"
BACKUP_DIR="./prisma/backups"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if backup filename provided
if [ -z "$1" ]; then
    echo -e "${RED}[ERROR] No backup file specified${NC}"
    echo ""
    echo "Usage: ./restore_db.sh [backup_filename]"
    echo ""
    echo "Available backups:"
    ls -lh "$BACKUP_DIR" 2>/dev/null | tail -n +2 | awk '{print "  " $9 " (" $5 ", " $6 " " $7 ")"}'
    exit 1
fi

BACKUP_FILE="$BACKUP_DIR/$1"

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}[ERROR] Backup file not found: $BACKUP_FILE${NC}"
    echo ""
    echo "Available backups:"
    ls -lh "$BACKUP_DIR" 2>/dev/null | tail -n +2 | awk '{print "  " $9 " (" $5 ", " $6 " " $7 ")"}'
    exit 1
fi

# Confirmation prompt
echo -e "${YELLOW}[WARNING] This will REPLACE the current database!${NC}"
echo -e "${YELLOW}[WARNING] Current database: $DB_PATH${NC}"
echo -e "${YELLOW}[WARNING] Restore from: $BACKUP_FILE${NC}"
echo ""
read -p "Are you sure? (type 'yes' to confirm): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo -e "${RED}[CANCELLED] Restore aborted${NC}"
    exit 0
fi

# Create safety backup of current database
SAFETY_BACKUP="$BACKUP_DIR/dev.db.before_restore_$(date +%Y%m%d_%H%M%S)"
echo -e "${YELLOW}[SAFETY] Creating safety backup of current database...${NC}"
cp "$DB_PATH" "$SAFETY_BACKUP"
echo -e "${GREEN}[SAFETY] Safety backup: $SAFETY_BACKUP${NC}"

# Restore database
echo -e "${YELLOW}[RESTORE] Restoring database from backup...${NC}"
cp "$BACKUP_FILE" "$DB_PATH"

# Verify restore
if [ -f "$DB_PATH" ]; then
    DB_SIZE=$(du -h "$DB_PATH" | cut -f1)
    echo -e "${GREEN}[SUCCESS] Database restored successfully (Size: $DB_SIZE)${NC}"
    echo -e "${GREEN}[SUCCESS] Safety backup saved as: $SAFETY_BACKUP${NC}"
    echo ""
    echo -e "${YELLOW}[IMPORTANT] Please restart the server for changes to take effect!${NC}"
else
    echo -e "${RED}[ERROR] Restore failed!${NC}"
    echo -e "${YELLOW}[RECOVERY] Restoring from safety backup...${NC}"
    cp "$SAFETY_BACKUP" "$DB_PATH"
    exit 1
fi
