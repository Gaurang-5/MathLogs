# 🚀 QUICK START - Testing Session

## ⚡ 2-Minute Setup

### 1. Create Backup (30 seconds)
```bash
cd /Users/gaurangbhatia/Desktop/new_project/server
./scripts/backup_db.sh manual
cd ..
```

### 2. Start System (30 seconds)
```bash
./dev.sh
```

### 3. Open Monitor (30 seconds - separate terminal)
```bash
cd /Users/gaurangbhatia/Desktop/new_project
tail -f server/logs/server_$(date +%Y%m%d).log | grep "REGISTRATION"
```

### 4. You're Ready! ✅

---

## 📊 Post-Session Analysis (1 minute)

### Quick Stats
```bash
cd /Users/gaurangbhatia/Desktop/new_project

# Count successful registrations
grep -c "REGISTRATION_SUCCESS" server/logs/server_$(date +%Y%m%d).log

# Max latency
grep "latencyMs:" server/logs/server_$(date +%Y%m%d).log \
  | grep -oP 'latencyMs: \K\d+' \
  | sort -n | tail -1

# Check for errors
grep -c "ERROR" server/logs/server_$(date +%Y%m%d).log
```

---

## 🆘 Emergency Commands

### Restore from backup
```bash
cd /Users/gaurangbhatia/Desktop/new_project/server
./scripts/restore_db.sh <backup_filename>
```

### List backups
```bash
ls -lh /Users/gaurangbhatia/Desktop/new_project/server/prisma/backups/
```

### View today's logs
```bash
cat /Users/gaurangbhatia/Desktop/new_project/server/logs/server_$(date +%Y%m%d).log
```

---

## ✅ Success Criteria (Phase 1)
- [ ] All students registered
- [ ] Max latency < 15s
- [ ] No errors in logs
- [ ] Teacher happy

---

## 📚 Full Docs
- `LAUNCH_CLEARANCE_FINAL.md` - Complete protocol
- `ISSUES_FIXED_SUMMARY.md` - What's new
- `BACKUP_RECOVERY_GUIDE.md` - Backup details
- `LOG_MANAGEMENT_GUIDE.md` - Log analysis
