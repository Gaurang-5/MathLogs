# ⚡ Quick Start: Heroku Production Setup

**Time to Complete:** 10 minutes  
**Prerequisites:** Heroku CLI installed, Heroku account created

---

## 🚀 STEP-BY-STEP DEPLOYMENT

### **1. Create Heroku App (If Not Done)**
```bash
# Login to Heroku
heroku login

# Create app
heroku create mathlogs-app

# Verify
heroku apps:info --app mathlogs-app
```

---

### **2. Add PostgreSQL Database**
```bash
# Add Heroku Postgres (Standard plan recommended for production)
heroku addons:create heroku-postgresql:standard-0 --app mathlogs-app

# Wait for provisioning (1-2 minutes)
heroku pg:wait --app mathlogs-app

# Verify
heroku pg:info --app mathlogs-app
```

---

### **3. Configure Environment Variables**
```bash
# Required variables
heroku config:set NODE_ENV=production --app mathlogs-app
heroku config:set CLIENT_URL=https://mathlogs.app --app mathlogs-app

# Generate secure JWT secret
heroku config:set JWT_SECRET=$(openssl rand -base64 32) --app mathlogs-app

# Email configuration (if using Gmail)
heroku config:set EMAIL_SERVICE=gmail --app mathlogs-app
heroku config:set EMAIL_USER=your-email@gmail.com --app mathlogs-app
heroku config:set EMAIL_PASS=your-app-specific-password --app mathlogs-app

# Verify all variables are set
heroku config --app mathlogs-app
```

**⚠️ IMPORTANT: Gmail App Password**
- Go to: https://myaccount.google.com/apppasswords
- Generate app-specific password
- Use that password, NOT your regular Gmail password

---

### **4. Configure Automated Backups** ✅ CRITICAL
```bash
# Schedule daily backups at 2 AM UTC
heroku pg:backups:schedule DATABASE_URL --at '02:00 UTC' --app mathlogs-app

# Set 30-day retention
heroku pg:backups:retention 30d --app mathlogs-app

# Verify schedule
heroku pg:backups:schedules --app mathlogs-app

# Test immediate backup
heroku pg:backups:capture --app mathlogs-app

# Verify backup succeeded
heroku pg:backups --app mathlogs-app
```

**Expected Output:**
```
=== Backup Schedules
DATABASE_URL: daily at 2:00 UTC

=== Backups
ID    Created at                 Size      Database          
────  ─────────────────────────  ────────  ──────────────────
b001  2026-02-01 21:00 UTC       1.2MB     DATABASE_URL
```

---

### **5. Add Custom Domain**
```bash
# Add custom domain
heroku domains:add www.mathlogs.app --app mathlogs-app
heroku domains:add mathlogs.app --app mathlogs-app

# Get DNS target
heroku domains --app mathlogs-app

# Configure DNS (at your domain registrar):
# Type  Name     Target
# CNAME www      <heroku-dns-target>
# ANAME @        <heroku-dns-target>

# Enable automatic SSL
heroku certs:auto:enable --app mathlogs-app

# Verify SSL (wait 5-10 minutes after DNS propagation)
heroku certs:auto --app mathlogs-app
```

---

### **6. Deploy Application**
```bash
# Ensure on main branch
git checkout main

# Add Heroku remote (if not already added)
heroku git:remote --app mathlogs-app

# Deploy
git push heroku main

# Watch logs during deployment
heroku logs --tail --app mathlogs-app
```

---

### **7. Run Database Migrations**
```bash
# Generate Prisma client on Heroku
heroku run npx prisma generate --app mathlogs-app

# Run migrations
heroku run npx prisma migrate deploy --app mathlogs-app

# Verify migration status
heroku run npx prisma migrate status --app mathlogs-app
```

---

### **8. Create SuperAdmin Account**
```bash
# Run the super admin creation script
heroku run node dist/scripts/create_super_admin.js --app mathlogs-app

# Or connect to Heroku bash and run:
heroku run bash --app mathlogs-app
# Then in the Heroku shell:
node dist/scripts/create_super_admin.js
exit
```

---

### **9. Verify Deployment**
```bash
# Check app status
heroku ps --app mathlogs-app

# Test health endpoint 
curl https://mathlogs-app.herokuapp.com/health
# Expected: {"status":"ok","timestamp":"2026-02-01T..."}

# Test with custom domain
curl https://mathlogs.app/health
```

---

### **10. Set Up Monitoring**

#### **A. Heroku Metrics (Built-in)**
```bash
# View in dashboard
heroku open --app mathlogs-app
# Go to: Metrics tab
```

#### **B. Log Management (Recommended)**
```bash
# Option 1: Papertrail (Free tier: 50MB/month)
heroku addons:create papertrail:choklad --app mathlogs-app
heroku addons:open papertrail --app mathlogs-app

# Option 2: Coralogix (Free tier available)
heroku addons:create coralogix --app mathlogs-app
```

#### **C. Error Monitoring with Sentry**
```bash
# In your project
npm install @sentry/node --save

# Get Sentry DSN from https://sentry.io
heroku config:set SENTRY_DSN=https://your-sentry-dsn --app mathlogs-app
```

Then add to `server/src/index.ts`:
```typescript
import * as Sentry from "@sentry/node";

if (process.env.SENTRY_DSN) {
    Sentry.init({ dsn: process.env.SENTRY_DSN });
}
```

---

## ✅ POST-DEPLOYMENT CHECKLIST

### **Immediate (First 10 Minutes)**
- [ ] App loads at https://mathlogs.app
- [ ] Health endpoint returns 200 OK
- [ ] SuperAdmin login works
- [ ] Can create test institute
- [ ] No errors in logs: `heroku logs --tail --app mathlogs-app`

### **First Hour**
- [ ] Create test teacher account
- [ ] Create test batch
- [ ] Register test student
- [ ] Record test payment
- [ ] Generate PDF report
- [ ] Verify email sending works

### **First 24 Hours**
- [ ] Monitor error logs every 2 hours
- [ ] Check database performance: `heroku pg:outliers --app mathlogs-app`
- [ ] Verify automated backup completed
- [ ] Test rate limiting (try 25 login attempts)
- [ ] Verify cross-tenant isolation (create 2 institutes, test data separation)

---

## 🚨 COMMON ISSUES & FIXES

### **Issue: "Application Error" on page load**
```bash
# Check logs
heroku logs --tail --app mathlogs-app

# Common fixes:
# 1. Missing environment variable
heroku config --app mathlogs-app  # Verify all required vars

# 2. Build failed
heroku releases --app mathlogs-app  # Check recent releases
heroku builds --app mathlogs-app    # Check build status

# 3. Restart app
heroku restart --app mathlogs-app
```

### **Issue: Database connection fails**
```bash
# Check database status
heroku pg:info --app mathlogs-app

# Check connection limit
heroku pg:ps --app mathlogs-app

# If too many connections, restart app
heroku restart --app mathlogs-app
```

### **Issue: SSL certificate not activating**
```bash
# Check DNS propagation
dig mathlogs.app
dig www.mathlogs.app

# Check SSL status
heroku certs:auto --app mathlogs-app

# If pending, wait 10-15 minutes
# If failed, verify DNS is pointing to Heroku correctly
```

### **Issue: Migrations fail**
```bash
# Check current migration status
heroku run npx prisma migrate status --app mathlogs-app

# Reset database (⚠️ DESTRUCTIVE - only use in emergency)
heroku pg:reset DATABASE --confirm mathlogs-app
heroku run npx prisma migrate deploy --app mathlogs-app
```

---

## 📊 USEFUL HEROKU COMMANDS

### **Monitoring**
```bash
# Real-time logs
heroku logs --tail --app mathlogs-app

# Filter logs
heroku logs --source app --app mathlogs-app
heroku logs --ps web.1 --app mathlogs-app

# Last 1000 lines
heroku logs -n 1000 --app mathlogs-app
```

### **Database**
```bash
# Connection info
heroku pg:credentials:url DATABASE --app mathlogs-app

# Database size
heroku pg:info --app mathlogs-app

# Slow queries
heroku pg:outliers --app mathlogs-app

# Active queries
heroku pg:ps --app mathlogs-app

# Kill long-running query
heroku pg:kill <pid> --app mathlogs-app
```

### **App Management**
```bash
# Restart app
heroku restart --app mathlogs-app

# Scale dynos
heroku ps:scale web=1 --app mathlogs-app

# Check dyno status
heroku ps --app mathlogs-app

# Open app in browser
heroku open --app mathlogs-app
```

---

## 🎯 SUCCESS CRITERIA

**✅ Your deployment is successful if:**
1. App loads at custom domain (mathlogs.app)
2. SSL certificate shows "Secure" in browser
3. Health endpoint returns 200 OK
4. SuperAdmin can login
5. Can create institutes and teachers
6. Automated backups are scheduled
7. No errors in first hour of logs
8. API response times < 500ms

---

## 📞 SUPPORT

**Heroku Status:** https://status.heroku.com  
**Heroku Support:** https://help.heroku.com  
**PostgreSQL Issues:** https://devcenter.heroku.com/articles/heroku-postgres

---

**Last Updated:** 2026-02-01  
**Estimated Setup Time:** 10-15 minutes  
**Difficulty:** Beginner-Friendly
