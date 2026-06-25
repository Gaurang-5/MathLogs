#!/bin/bash

# Encrypted Database Backup Script for Coaching Centre SaaS
# Usage: ./backup_db_encrypted.sh [manual|auto]
# Creates timestamped, GPG-encrypted backups

set -e  # Exit on error

# Configuration
DB_PATH="./prisma/dev.db"
BACKUP_DIR="./prisma/backups"
RETENTION_DAYS=7
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_TYPE="${1:-manual}"  # manual or auto
GPG_RECIPIENT="${GPG_BACKUP_EMAIL:-backup@coaching.local}"

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

# Check if GPG is installed
if ! command -v gpg &> /dev/null; then
    echo -e "${YELLOW}[WARNING] GPG not installed. Falling back to unencrypted backup.${NC}"
    echo -e "${YELLOW}[INFO] Install GPG: brew install gnupg (macOS) or apt-get install gnupg (Linux)${NC}"
    exec ./backup_db.sh "$BACKUP_TYPE"
fi

# Create backup with encryption
BACKUP_FILE="$BACKUP_DIR/dev.db.${BACKUP_TYPE}_${TIMESTAMP}"
ENCRYPTED_FILE="${BACKUP_FILE}.gpg"

echo -e "${YELLOW}[BACKUP] Creating encrypted backup...${NC}"

# Create plaintext backup first
cp "$DB_PATH" "$BACKUP_FILE"

# Encrypt the backup
echo -e "${YELLOW}[ENCRYPT] Encrypting backup with GPG...${NC}"
gpg --batch --yes --cipher-algo AES256 --symmetric --passphrase-file <(echo "${GPG_PASSPHRASE:-backup-secret-key}") "$BACKUP_FILE"

# Verify encrypted file was created
if [ -f "$ENCRYPTED_FILE" ]; then
    BACKUP_SIZE=$(du -h "$ENCRYPTED_FILE" | cut -f1)
    echo -e "${GREEN}[SUCCESS] Encrypted backup created (Size: $BACKUP_SIZE)${NC}"
    echo -e "${GREEN}[SUCCESS] Location: $ENCRYPTED_FILE${NC}"
    
    # Remove plaintext backup for security
    rm "$BACKUP_FILE"
    echo -e "${GREEN}[SECURITY] Plaintext backup removed${NC}"
else
    echo -e "${RED}[ERROR] Encryption failed!${NC}"
    rm -f "$BACKUP_FILE"
    exit 1
fi

# Clean old encrypted backups (keep only last 7 days)
echo -e "${YELLOW}[CLEANUP] Removing encrypted backups older than $RETENTION_DAYS days...${NC}"
DELETED_COUNT=$(find "$BACKUP_DIR" -name "*.gpg" -mtime +$RETENTION_DAYS -delete -print | wc -l | tr -d ' ')

if [ "$DELETED_COUNT" -gt 0 ]; then
    echo -e "${GREEN}[CLEANUP] Removed $DELETED_COUNT old encrypted backup(s)${NC}"
else
    echo -e "${YELLOW}[CLEANUP] No old backups to remove${NC}"
fi

# List current backups
echo -e "${YELLOW}[INFO] Current encrypted backups:${NC}"
ls -lh "$BACKUP_DIR"/*.gpg 2>/dev/null | tail -n +1 | awk '{print "  " $9 " (" $5 ")"}' || echo "  No encrypted backups found"

# Count total backups
TOTAL_BACKUPS=$(ls -1 "$BACKUP_DIR"/*.gpg 2>/dev/null | wc -l | tr -d ' ')
echo -e "${GREEN}[INFO] Total encrypted backups: $TOTAL_BACKUPS${NC}"

echo -e "${GREEN}[DONE] Encrypted backup complete!${NC}"
echo -e "${YELLOW}[NOTE] To decrypt: gpg --decrypt $ENCRYPTED_FILE > restored.db${NC}"
