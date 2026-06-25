# Log Management & Analysis Guide

## Overview
The server now persists all logs to files with automatic rotation, ensuring diagnostic data is preserved for post-session analysis.

---

## Starting Server with Logging

### Development Mode (Recommended)
```bash
# From project root
./dev.sh
```

This automatically:
- ✅ Starts server with logging to `server/logs/server_YYYYMMDD.log`
- ✅ Starts client (logs in browser DevTools)
- ✅ Creates logs directory if needed
- ✅ Cleans old logs (>7 days)
- ✅ Shows output to console AND saves to file

### Server Only (Advanced)
```bash
cd server
./start_with_logs.sh
```

---

## Log File Locations

### Server Logs
```
server/logs/server_20260126.log
```

**Format**: `server_YYYYMMDD.log` (one file per day)

### Client Logs
- Browser DevTools Console (F12)
- Not persisted to disk (client-side only)

---

## Real-Time Monitoring

### Watch Server Logs
```bash
# From project root
tail -f server/logs/server_$(date +%Y%m%d).log
```

### Filter for Specific Events
```bash
# Registration events only
tail -f server/logs/*.log | grep "REGISTRATION"

# Errors only
tail -f server/logs/*.log | grep "ERROR"

# Slow operations
tail -f server/logs/*.log | grep "SLOW"
```

---

## Post-Session Analysis

### Count Successful Registrations
```bash
grep -c "REGISTRATION_SUCCESS" server/logs/server_20260126.log
```

### Calculate Average Latency
```bash
grep "REGISTRATION_SUCCESS" server/logs/server_20260126.log \
  | grep -oP 'latencyMs: \K\d+' \
  | awk '{ sum += $1; n++ } END { print "Average:", sum/n, "ms" }'
```

### Calculate p95 Latency
```bash
grep "REGISTRATION_SUCCESS" server/logs/server_20260126.log \
  | grep -oP 'latencyMs: \K\d+' \
  | sort -n \
  | awk '{ a[NR]=$1 } END { print "p95:", a[int(NR*0.95)], "ms" }'
```

### Find Slow Operations (>3 seconds)
```bash
grep "SLOW_OPERATION" server/logs/server_20260126.log
```

### Count Idempotency Hits
```bash
grep -c "IDEMPOTENCY_HIT" server/logs/server_20260126.log
```

### Check for Rate Limit Events
```bash
grep "RATE_LIMIT" server/logs/server_20260126.log
```

### View Error Summary
```bash
grep "ERROR" server/logs/server_20260126.log \
  | cut -d']' -f3 \
  | sort | uniq -c | sort -rn
```

---

## Testing Session Checklist

### Before Session
```bash
# 1. Ensure server started with logging
./dev.sh

# 2. Verify log file created
ls -lh server/logs/

# 3. Open monitoring terminal
tail -f server/logs/server_$(date +%Y%m%d).log
```

### During Session
- ✅ Monitor real-time logs for errors
- ✅ Watch registration events
- ✅ Note any SLOW_OPERATION warnings

### After Session
```bash
# 1. Count registrations
grep -c "REGISTRATION_SUCCESS" server/logs/server_$(date +%Y%m%d).log

# 2. Check latency
grep "latencyMs:" server/logs/server_$(date +%Y%m%d).log \
  | grep -oP 'latencyMs: \K\d+' \
  | awk '{ sum+=$1; if($1>max)max=$1; if(min=="" || $1<min)min=$1; n++ } 
         END { print "Avg:", sum/n, "Min:", min, "Max:", max }'

# 3. Check for any errors
grep "ERROR" server/logs/server_$(date +%Y%m%d).log

# 4. Save analysis summary
echo "Session: $(date)" > session_summary.txt
echo "Registrations: $(grep -c REGISTRATION_SUCCESS server/logs/*.log)" >> session_summary.txt
echo "Errors: $(grep -c ERROR server/logs/*.log)" >> session_summary.txt
cat session_summary.txt
```

---

## Log Retention

### Automatic Cleanup
- ✅ Old logs (>7 days) deleted automatically on server start
- ✅ Location: `start_with_logs.sh` line 12
- ✅ Customizable: Edit `MAX_LOG_AGE_DAYS` variable

### Manual Cleanup
```bash
# Remove logs older than 7 days
find server/logs -name "server_*.log" -mtime +7 -delete

# Remove all logs
rm server/logs/*.log
```

---

## Correlation: Server + Client

### Match Registration Events
1. **Server log** shows `REGISTRATION_SUCCESS` with `humanId`
2. **Client console** shows `[REGISTRATION_LATENCY]` with same `humanId`
3. **Network overhead** = Client latency - Server latency

### Example Analysis
```
Server: [INFO] [REGISTRATION_SUCCESS] { latencyMs: 450, humanId: 'MTH26001' }
Client: [REGISTRATION_LATENCY] { latency: 520, humanId: 'MTH26001' }
Network overhead: 520 - 450 = 70ms
```

---

## Production Recommendations

### Log Storage
- ✅ Current: Local disk (`server/logs/`)
- 🔄 Future: Centralized logging (Papertrail, Logtail, CloudWatch)

### Log Format
- ✅ Current: Plain text (greppable)
- 🔄 Future: JSON structured logs (easier parsing)

### Alerting
- ⚠️ Current: Manual review
- 🔄 Future: Automated alerts (error rate, slow operations)

---

## Troubleshooting

### "No logs created"
- Check server started with `./dev.sh` or `./start_with_logs.sh`
- Verify `logs/` directory exists: `ls server/logs/`
- Check permissions: `ls -l server/start_with_logs.sh`

### "Cannot find log file"
- Use current date: `ls server/logs/server_$(date +%Y%m%d).log`
- List all logs: `ls server/logs/`

### "Logs disappeared after restart"
- Logs are persistent! Check retention (older than 7 days?)
- Verify not running `rm logs/*`

---

## Key Log Events

| Event | Meaning | Action |
|-------|---------|--------|
| `REGISTRATION_STARTED` | Student began registration | Normal |
| `REGISTRATION_SUCCESS` | Completed successfully | Normal |
| `REGISTRATION_IDEMPOTENCY_HIT` | Duplicate detected (safe) | Normal |
| `REGISTRATION_ID_COLLISION` | ID retry (should be rare) | Monitor frequency |
| `REGISTRATION_ERROR` | Failed registration | Investigate |
| `SLOW_OPERATION` | Latency >3s threshold | Monitor load |
| `RATE_LIMIT_EXCEEDED` | Too many requests | Should NOT occur in testing |

---

## Files Modified
- ✅ Created: `server/start_with_logs.sh`
- ✅ Updated: `dev.sh` (uses logging script)
- ✅ Updated: `server/.gitignore` (excludes logs/)

---

**Created**: 2026-01-26  
**Status**: Production Ready ✅
