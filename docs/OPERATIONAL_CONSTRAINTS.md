# Operational Constraints & System Behavior
**Last Updated**: 2026-01-26  
**Status**: APPROVED FOR CONTROLLED TESTING

---

## System Architecture Model

### **Burst Registration with Sequential Processing**

This system uses **SQLite** as the database backend. SQLite enforces database-level write locks, which means:

- **Write operations are serialized** (processed one at a time)
- **NOT parallel/concurrent execution** - writes queue and execute sequentially
- **Burst capacity** is limited by total processing time, not simultaneous throughput

**Important**: When documentation refers to "60-70 concurrent registrations," this means:
- **"Burst event size"**: 60-70 students scanning QR codes within a short window (~60 seconds)
- **"Sequential processing"**: SQLite processes these as a queue, one write at a time
- **User experience**: First student sees ~400ms response, 70th student sees ~28s response

---

## Operational Limits for Controlled Testing

### **Registration Burst Capacity**

| Metric | Limit | Reason |
|--------|-------|--------|
| **Maximum burst size** | 75 students | SQLite write queue latency |
| **Expected latency (p50)** | 0.4-2 seconds | First half of queue |
| **Expected latency (p95)** | 25-30 seconds | Last quartile of queue |
| **Expected latency (p99)** | 30-32 seconds | Tail latency |
| **Client timeout** | 40 seconds | Allows for worst-case + network overhead |

### **Latency Calculation**

**Formula**: Total Time = (Number of Students) × (Avg Write Time)

**Example - 70 Student Burst**:
```
Write time per student: ~400ms (includes ID generation, constraint check, insert)
Total processing time: 70 × 400ms = 28 seconds
Student #1 wait time: 400ms
Student #35 wait time: 14s
Student #70 wait time: 28s
```

### **Rate Limiting Behavior**

**Configuration** (`publicLimiter`):
- Window: 60 minutes
- Max requests: 500 per IP
- Scope: Per-IP (NAT-aware)

**Classroom NAT Scenario**:
- 70 students share 1 IP address
- All submit within 60 seconds
- Rate limiter sees: 70 requests in period
- **Result**: No blocking (70 << 500 limit)

**When rate limiter triggers**:
- If >500 requests from same IP within 1 hour
- Example: Multiple classrooms using same Wi-Fi consecutively
- Mitigation: Wait 1 hour or use different network

---

## Multi-Tab Academic Year Switching

### **Behavior**

When a teacher switches academic years, the change is persisted to the database immediately. However:

**✅ What is guaranteed**:
- All API requests fetch **fresh year context** from database
- **No cross-year writes** due to enforcement checks
- **No data corruption** - data integrity maintained

**⚠️ What is NOT guaranteed**:
- UI cached data may be stale across tabs
- Create operations (batches, tests) use fresh year from API
- **User confusion possible**: UI shows old year, data created in new year

### **Constraint for Controlled Testing**

**Requirement**: **Single browser tab per teacher during year operations**

**Acceptable scenarios**:
- ✅ Single tab, switch years, continue working
- ✅ Multiple tabs viewing read-only data
- ❌ Tab 1 shows "Create Batch" form, Tab 2 switches year, Tab 1 submits

**Mitigation** (if multi-tab needed):
- Force page refresh after year switch
- Add client-side year validation before writes
- **For now**: Document as known constraint

---

## Monitoring & Alerting Thresholds

### **Registration Latency**

| Metric | Threshold | Action |
|--------|-----------|--------|
| p50 latency | > 3 seconds | Expected if >10 concurrent requests, monitor |
| p95 latency | > 35 seconds | Alert - burst size exceeded 85 students |
| p99 latency | > 40 seconds | Critical - investigate immediately |
| Timeout rate | > 2% | Check client timeout config, SQLite health |

### **Error Rates**

| Error | Pattern | Action |
|-------|---------|--------|
| P2002 (ID collision) | >1% of requests | Check IdCounter state, review logs |
| 409 (Concurrent modification) | Any occurrence | Log for analysis - rare edge case |
| 400 (Non-active year) | User-initiated | User education - not a system error |
| 500 (Server error) | >0.1% | Investigate logs immediately |

### **Rate Limiting**

| Metric | Threshold | Action |
|--------|-----------|--------|
| Public limiter rejections | >10% of classroom | Increase limit or extend window |
| Auth limiter rejections | Any from valid users | Verify not under attack, increase if needed |

---

## Client-Side Configuration

### **Timeout Settings**

**Registration endpoint**: Configured for 40-second timeout

**Location**: `client/src/utils/api.ts`

```typescript
const timeout = timeoutMs || (endpoint.includes('/public/register') ? 40000 : 30000);
```

**Reasoning**:
- Worst-case sequential processing: 28s for 70 students
- Network overhead: ~2-5s
- Buffer: ~5-10s
- **Total**: 40 seconds

**Other endpoints**: 30-second default (sufficient for normal operations)

---

## Migration Path to PostgreSQL

**When to migrate**:
- Registration burst >85 students observed
- p95 latency consistently >30s
- Multiple classrooms need simultaneous registration
- Multi-tenant deployment planned

**Expected improvement**:
- **From**: Sequential writes, 28s for 70 students
- **To**: Parallel writes (row-level locking), ~2s for 70 students
- **Throughput**: 35x improvement

**Migration effort**: ~2 hours
1. Update `prisma/schema.prisma` datasource to postgresql
2. Run `prisma migrate dev`
3. Update DATABASE_URL in environment
4. No code changes required (Prisma abstracts DB)

---

## Known Edge Cases

### **1. Concurrent Deletion During Idempotency Check**

**Scenario**: 
- Student submits registration (Request A)
- Database detects duplicate (natural key collision)
- Another admin deletes the student concurrently (Request B)
- Request A tries to return existing student → not found

**Handling**:
```
HTTP 409 Conflict
{
  "error": "Concurrent modification detected. Please retry registration."
}
```

**Client action**: Automatic retry or user resubmit
**Frequency**: Extremely rare (requires admin deletion during student submission)

### **2. ID Counter Exhaustion**

**Scenario**: Prefix "MTH26" reaches sequence 999

**Current behavior**: Will create "MTH26999", next ID would be "MTH261000" (4 digits)

**Mitigation**:
- Monitor counter values
- Alert when counter >900
- Manual intervention: Archive old students, reset counter
- Long-term: Switch to UUID-based IDs (no prefix collision)

---

## Controlled Testing Protocol

### **Phase 1: Single Classroom (20-30 students)**

**Objectives**:
- Validate registration flow
- Measure actual latency under burst load
- Verify rate limiting doesn't interfere

**Success criteria**:
- p95 latency < 15 seconds
- 0 timeouts
- 0 duplicate students
- User feedback: "smooth experience"

### **Phase 2: Large Classroom (60-75 students)**

**Objectives**:
- Test maximum documented capacity
- Validate p95 latency predictions
- Ensure no rate limit false positives

**Success criteria**:
- p95 latency 25-30 seconds (within prediction)
- Timeout rate < 1%
- No rate limiter blocks
- Last student successfully registered

### **Phase 3: Multiple Sessions (2-3 classrooms, staggered)**

**Objectives**:
- Verify rate limiting across separate events
- Test system recovery between bursts
- Multi-session stability

**Success criteria**:
- Same performance as Phase 2 per session
- No cross-session interference
- Rate limiter resets correctly

---

## Escalation & Support

### **Issues Requiring Immediate Fix**

1. **Timeout rate >5%** → Client timeout too low or SQLite issue
2. **Duplicate students created** → Constraint failure or race condition
3. **500 errors >1%** → Application bug
4. **Data in wrong academic year** → Year switching bug

### **Issues for Post-Testing Analysis**

1. **p95 latency >35s** → Consider PostgreSQL migration
2. **User reports multi-tab confusion** → Implement tab sync or force refresh
3. **Rate limiter blocks legitimate users** → Adjust limits

---

**Document Owner**: Engineering Team  
**Review Frequency**: After each testing phase  
**Next Update**: After Phase 1 testing completion
