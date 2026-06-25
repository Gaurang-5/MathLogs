# Database Backup & Recovery Guide

## Overview
This system includes automated database backup and restore capabilities for the SQLite database.

---

## Backup Scripts

### Automatic Backup
```bash
cd server
./scripts/backup_db.sh auto
```

### Manual Backup
```bash
cd server
./scripts/backup_db.sh manual
```

### Features
- ✅ Timestamped backups (`dev.db.auto_20260126_093538`)
- ✅ Automatic retention (deletes backups older than 7 days)
- ✅ Verification (checks backup was created successfully)
- ✅ Size reporting
- ✅ Backup listing

---

## Backup Location
All backups are stored in:
```
server/prisma/backups/
```

**Naming Convention**:
- Auto: `dev.db.auto_YYYYMMDD_HHMMSS`
- Manual: `dev.db.manual_YYYYMMDD_HHMMSS`

---

## Restore Database

### List Available Backups
```bash
cd server
ls -lh prisma/backups/
```

### Restore from Backup
```bash
cd server
./scripts/restore_db.sh dev.db.auto_20260126_093538
```

### Restore Process
1. Script lists available backups if no filename provided
2. Prompts for confirmation (type `yes`)
3. Creates safety backup of current database (before_restore_TIMESTAMP)
4. Restores selected backup
5. Prompts to restart server

### Safety Features
- ✅ Confirmation prompt before restore
- ✅ Safety backup created automatically
- ✅ Rollback available if restore fails
- ✅ Clear error messages

---

## Testing Procedures

### Pre-Testing Backup
**ALWAYS create a backup before testing sessions:**
```bash
cd server
./scripts/backup_db.sh manual
```

### Post-Testing Restore (if needed)
```bash
cd server
./scripts/restore_db.sh <backup_filename>
# Restart server after restore
```

---

## Backup Schedule Recommendations

### Development
- Manual backup before each testing session
- Manual backup after significant data entry

### Production (Future)
- Automated daily backups (add to cron/systemd timer)
- Retention: 30 days minimum
- Off-site backup storage recommended

### Example Cron Job (Production)
```cron
# Daily backup at 2 AM
0 2 * * * cd /path/to/server && ./scripts/backup_db.sh auto
```

---

## Disaster Recovery

### Scenario: Database Corruption
1. Stop the server
2. List recent backups: `ls -lh prisma/backups/`
3. Identify last known good backup
4. Restore: `./scripts/restore_db.sh <backup_filename>`
5. Restart server
6. Verify functionality

### Scenario: Accidental Data Deletion
1. Immediately create backup of current state
2. Identify backup from before deletion
3. Restore using script
4. Restart server

### Scenario: Testing Data Cleanup
1. Restore from backup before testing session
2. Server will have clean state

---

## Backup Verification

### Verify Backup Integrity
```bash
cd server/prisma/backups
sqlite3 dev.db.auto_20260126_093538 "SELECT COUNT(*) FROM Student;"
```

Expected: Should return count without errors

---

## Files Modified
- ✅ Created: `server/scripts/backup_db.sh`
- ✅ Created: `server/scripts/restore_db.sh`
- ✅ Updated: `server/.gitignore` (excludes backups from git)

---

## Retention Policy
- **Default**: 7 days
- **Location**: `backup_db.sh` line 8
- **Customization**: Edit `RETENTION_DAYS` variable

---

## Troubleshooting

### "Database file not found"
- Ensure you're in the `server` directory
- Check `prisma/dev.db` exists

### "Permission denied"
- Make scripts executable: `chmod +x scripts/*.sh`

### "Backup directory full"
- Manually clean old backups: `rm prisma/backups/dev.db.auto_202601*`
- Adjust retention policy

---

**Created**: 2026-01-26  
**Status**: Production Ready ✅
