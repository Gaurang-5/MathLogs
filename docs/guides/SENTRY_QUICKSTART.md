# ✅ SENTRY SETUP - QUICK START

**Version:** v67  
**Status:** 🟡 **AWAITING CONFIGURATION**

---

## 🚀 3-Step Setup

### Step 1: Create Sentry Projects (5 minutes)

1. **Go to** https://sentry.io/signup/
2. **Create account** (free tier is fine)
3. **Create 2 projects:**
   - Project 1: **Node.js** → Name: `mathlogs-backend`
   - Project 2: **React** → Name: `mathlogs-frontend`
4. **Copy both DSNs** (you'll see them after creating each project)

---

### Step 2: Add DSNs to Heroku (2 minutes)

Run these commands (replace with your actual DSNs):

```bash
# Backend DSN
heroku config:set SENTRY_DSN="https://your-backend-key@o123456.ingest.sentry.io/789" --app pacific-bayou-07588

# Frontend DSN
heroku config:set VITE_SENTRY_DSN="https://your-frontend-key@o123456.ingest.sentry.io/7890" --app pacific-bayou-07588
```

After setting these, Heroku will automatically restart the app.

---

### Step 3: Test It Works (1 minute)

**Backend Test:**
```bash
# Visit this URL to trigger a test error
https://mathlogs.app/debug-sentry
```

You should see an error in your Sentry backend project dashboard within 10 seconds.

**Frontend Test:**
```bash
# Open browser console on mathlogs.app and run:
throw new Error('Frontend Sentry Test');
```

You should see this error in your Sentry frontend project dashboard.

---

## ✅ Verification Checklist

- [ ] Sentry account created
- [ ] Backend project created (Node.js)
- [ ] Frontend project created (React)
- [ ] Backend DSN set on Heroku (`SENTRY_DSN`)
- [ ] Frontend DSN set on Heroku (`VITE_SENTRY_DSN`)
- [ ] Test error appears in backend dashboard
- [ ] Test error appears in frontend dashboard

---

## 🎯 What You Get

Once configured, you'll automatically receive:

### Error Alerts
- Email when new errors occur
- Grouped by error type
- Full stack traces

### Performance Tracking
- Slow API calls highlighted
- Page load times tracked
- Database query performance

### Session Replay (Frontend)
- Video playback when errors happen
- See exactly what user did
- All text masked for privacy

---

## 📊 Sentry Dashboard Tour

### Backend Dashboard
**URL:** https://sentry.io/organizations/YOUR_ORG/issues/?project=mathlogs-backend

**Sections:**
- **Issues:** All unique errors
- **Performance:** API response times
- **Releases:** Errors by deployment

### Frontend Dashboard
**URL:** https://sentry.io/organizations/YOUR_ORG/issues/?project=mathlogs-frontend

**Sections:**
- **Issues:** All unique errors
- **Performance:** Page load times
- **Replays:** Session recordings when errors occur

---

## 🔔 Set Up Alerts (Optional)

1. Go to Sentry → **Settings** → **Alerts**
2. Create new alert:
   - **Condition:** When a new issue is created
   - **Action:** Send email notification
   - **Save**

Now you'll get emailed every time a new type of error occurs!

---

## 💡 Pro Tips

### Ignore Noisy Errors
If you get spammed with errors you don't care about:
1. Click the error in Sentry
2. Click **"Ignore"**
3. Choose "Forever" or until next release

### Create Slack Integration
For real-time alerts in Slack:
1. Sentry → **Settings** → **Integrations**
2. Search "Slack"
3. Connect your workspace
4. Choose which errors go to Slack

### Track Deployments
Every time you deploy, Sentry tracks it automatically via:
- Backend: Heroku git commit hash
- Frontend: Version from package.json

This helps you see which deployment broke things!

---

## 📖 Full Documentation

For detailed setup, privacy, and advanced features:
👉 **See:** `docs/SENTRY_SETUP.md`

---

## ⚡ Summary

**What's Done:**
- ✅ Sentry code integrated (backend + frontend)
- ✅ Privacy/PII filtering configured
- ✅ Performance monitoring ready
- ✅ Test endpoint created

**What's Needed:**
- ⏳ Create Sentry account
- ⏳ Set up 2 projects (backend + frontend)
- ⏳ Add DSNs to Heroku
- ⏳ Test with /debug-sentry

**Time:** ~8 minutes total
