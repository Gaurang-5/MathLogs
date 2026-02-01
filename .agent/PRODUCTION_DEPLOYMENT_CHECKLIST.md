# 🚀 MathLogs Production Deployment Checklist

**Platform:** Heroku + PostgreSQL  
**Deployment Date:** 2026-02-01  
**Security Clearance:** ✅ CONDITIONALLY SECURE (Meta Standards)

---

## ✅ PRE-DEPLOYMENT CHECKLIST

### **1. Security Fixes Verification**
- [x] CRIT-1: instituteId added to test creation
- [x] CRIT-2: Complete cascade delete implemented
- [x] CRIT-3: Payment validation includes instituteId
- [x] HIGH-2: Rate limiting on payment endpoints
- [x] HIGH-3: Audit logging for institute deletions
- [x] MED-1: instituteId filter in dashboard queries
- [x] Prisma client regenerated

### **2. Production Logging (IMMEDIATE)**
- [x] Created `secureLogger.ts` utility
- [x] Replaced DEBUG logs in `feeController.ts`
- [ ] **ACTION REQUIRED:** Replace DEBUG logs in other controllers:
  - `statusController.ts`
  - `academicYearController.ts`
  - `batchController.ts` (line 448, 459, 533)

### **3. Environment Variables**
Verify all required variables are set on Heroku:

```bash
heroku config:set NODE_ENV=production --app mathlogs-app
heroku config:set JWT_SECRET=<your-secret-here> --app mathlogs-app
heroku config:set DATABASE_URL=<heroku-postgres-url> --app mathlogs-app
heroku config:set CLIENT_URL=https://mathlogs.app --app mathlogs-app
heroku config:set EMAIL_SERVICE=gmail --app mathlogs-app
heroku config:set EMAIL_USER=<your-email> --app mathlogs-app
heroku config:set EMAIL_PASS=<app-password> --app mathlogs-app
```

**Verify:**
```bash
heroku config --app mathlogs-app
```

### **4. Database Backup Configuration**
```bash
# Enable automated daily backups (2 AM UTC)
heroku pg:backups:schedule DATABASE_URL --at '02:00 UTC' --app mathlogs-app

# Set retention to 30 days
heroku pg:backups:retention 30d --app mathlogs-app

# Verify backup schedule
heroku pg:backups:schedules --app mathlogs-app

# Test manual backup
heroku pg:backups:capture --app mathlogs-app

# Verify backup exists
heroku pg:backups --app mathlogs-app
```

### **5. SSL/TLS Configuration**
- [x] Heroku provides automatic SSL
- [ ] Verify custom domain (mathlogs.app) has SSL certificate
- [ ] Test HTTPS redirect works

```bash
curl -I http://mathlogs.app
# Should return 301 redirect to https://
```

### **6. Build & Test**
```bash
cd /Users/gaurangbhatia/Desktop/new_project

# Backend build test
cd server
npm run build
npm run test  # If tests exist

# Frontend build test
cd ../client
npm run build

# Verify dist folder size
du -sh dist/
```

---

## 🚀 DEPLOYMENT STEPS

### **Step 1: Pre-Deploy Verification**
```bash
# Run security scan
python .agent/skills/vulnerability-scanner/scripts/security_scan.py .

# Run lint
python .agent/skills/lint-and-validate/scripts/lint_runner.py .

# Verify no pending migrations
cd server
npx prisma migrate status
```

### **Step 2: Deploy to Heroku**
```bash
# Ensure you're on main/master branch
git checkout main
git status  # Verify clean state

# Deploy
git push heroku main

# Watch deployment logs
heroku logs --tail --app mathlogs-app
```

### **Step 3: Run Migrations**
```bash
# Run migrations on production DB
heroku run npx prisma migrate deploy --app mathlogs-app

# Verify migration status
heroku run npx prisma migrate status --app mathlogs-app
```

### **Step 4: Verify Deployment**
```bash
# Check app status
heroku ps --app mathlogs-app

# Check recent logs
heroku logs --tail --app mathlogs-app

# Test health endpoint
curl https://mathlogs.app/health
# Expected: {"status":"ok","timestamp":"..."}
```

---

## 🔍 POST-DEPLOYMENT VERIFICATION

### **Immediate (Within 1 Hour)**

#### **1. Smoke Tests**
- [ ] Visit https://mathlogs.app - loads correctly
- [ ] Login as SuperAdmin works
- [ ] Login as Teacher works
- [ ] Create test batch
- [ ] Register test student
- [ ] Record test payment
- [ ] Generate PDF report
- [ ] Verify email sending (if configured)

#### **2. Security Verification**
- [ ] Verify HTTPS is enforced
- [ ] Test rate limiting (try 25 login attempts - should block at 20)
- [ ] Test CORS (only mathlogs.app should work)
- [ ] Verify JWT expiration (8 hours)
- [ ] Test cross-tenant isolation (create 2 institutes, verify data separation)

#### **3. Monitoring Setup**
- [ ] Set up Sentry (error monitoring)
  ```bash
  npm install @sentry/node
  # Add to server/src/index.ts
  ```
- [ ] Configure Heroku log drains (optional - Papertrail/Loggly)
- [ ] Set up uptime monitoring (UptimeRobot / Pingdom)

#### **4. Performance Checks**
- [ ] Test initial page load (<3 seconds)
- [ ] Test dashboard load (<2 seconds)
- [ ] Test API response times (<500ms)
- [ ] Verify Gzip compression is active

```bash
curl -I -H "Accept-Encoding: gzip" https://mathlogs.app/api/dashboard/summary
# Look for: Content-Encoding: gzip
```

---

## 📊 MONITORING (First 24 Hours)

### **Metrics to Watch**

#### **1. Error Rates**
```bash
# Check for errors every hour
heroku logs --tail --app mathlogs-app | grep ERROR

# Look for:
# - 500 errors (server crashes)
# - 403 errors (authorization issues)
# - Rate limit triggers
# - Failed DB queries
```

#### **2. Performance**
```bash
# Check slow request warnings
heroku logs --tail --app mathlogs-app | grep SLOW_REQUEST

# Target: <1000ms for most endpoints
```

#### **3. Audit Logs**
```bash
# Monitor SuperAdmin actions
heroku logs --tail --app mathlogs-app | grep AUDIT

# Expected on institute deletion:
# [AUDIT] Institute Deletion Initiated
# [AUDIT] Institute Deletion Completed
```

#### **4. Database Performance**
```bash
# Check DB connection count
heroku pg:info --app mathlogs-app

# Check active queries
heroku pg:ps --app mathlogs-app

# Check slow queries
heroku pg:outliers --app mathlogs-app
```

---

## 🚨 ROLLBACK PROCEDURE

**If critical issues arise:**

### **Option 1: Quick Rollback**
```bash
# Rollback to previous release
heroku releases --app mathlogs-app
heroku rollback v<previous-version> --app mathlogs-app
```

### **Option 2: Database Restore**
```bash
# List available backups
heroku pg:backups --app mathlogs-app

# Restore from specific backup
heroku pg:backups:restore b<backup-id> DATABASE_URL --app mathlogs-app
```

### **Option 3: Complete Reset**
```bash
# Scale down app
heroku ps:scale web=0 --app mathlogs-app

# Restore backup
heroku pg:backups:restore <backup-id> DATABASE_URL --confirm mathlogs-app

# Scale back up
heroku ps:scale web=1 --app mathlogs-app
```

---

## 📅 POST-LAUNCH SCHEDULE

### **Week 1: Intensive Monitoring**
- **Daily:** Review error logs (morning + evening)
- **Daily:** Check performance metrics
- **Daily:** Verify backup completion
- **Friday:** Full security re-check

### **Week 2-4: Regular Monitoring**
- **Every 2 days:** Check error rates
- **Weekly:** Review audit logs
- **Weekly:** Performance profiling
- **End of Month:** User feedback session

### **Month 2+: Steady State**
- **Weekly:** Error log review
- **Monthly:** Security audit
- **Quarterly:** Performance optimization
- **Quarterly:** Disaster recovery drill

---

## 🛠️ IMMEDIATE POST-LAUNCH ACTIONS

### **Priority 1 (Within 24 Hours)**
1. ✅ Configure automated backups
2. ✅ Replace remaining DEBUG logs
3. ✅ Set up error monitoring (Sentry)
4. ✅ Document recovery procedures

### **Priority 2 (Within 1 Week)**
1. Implement soft delete for institutes
2. Add progressive delay to auth rate limiter
3. Wrap payment logic in Prisma transaction
4. Create admin user guide

### **Priority 3 (Within 1 Month)**
1. Load test with 100+ concurrent users
2. Optimize slow database queries
3. Set up CI/CD pipeline
4. Create disaster recovery runbook

---

## ✅ DEPLOYMENT SIGN-OFF

**Pre-Deployment Checks:**
- [ ] All critical security fixes verified
- [ ] Environment variables configured
- [ ] Automated backups enabled
- [ ] DEBUG logs wrapped
- [ ] SSL certificate active
- [ ] Health endpoint responds

**Deployment Approval:**
- [ ] Security Engineer: ________________ Date: ______
- [ ] Lead Developer: __________________ Date: ______
- [ ] Product Owner: ___________________ Date: ______

**Post-Deployment Confirmation:**
- [ ] Smoke tests passed
- [ ] No critical errors in first hour
- [ ] Performance within acceptable range
- [ ] Monitoring tools active

---

## 📞 EMERGENCY CONTACTS

**Platform Issues:**
- Heroku Support: https://help.heroku.com

**Database Issues:**
- Heroku Postgres Support: Status page

**Application Issues:**
- Lead Developer: [Your Contact]
- Security Team: [Contact]

---

## 📄 RELATED DOCUMENTATION

- Security Audit: `.agent/FINAL_SECURITY_AUDIT_META_STANDARDS.md`
- Security Fixes: `.agent/SECURITY_AUDIT_FIXES.md`
- Architecture: `ARCHITECTURE.md` (if exists)
- API Documentation: `README.md`

---

**Deployment Status:** ⏳ PENDING  
**Last Updated:** 2026-02-01  
**Next Review:** Post-Launch +24 hours
