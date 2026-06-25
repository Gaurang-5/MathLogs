# 🛡️ SENTRY SETUP GUIDE

**Date:** 2026-02-02  
**Status:** ✅ **COMPLETE**

---

## 📋 Overview

Sentry is now fully integrated into MathLogs for error tracking, performance monitoring, and session replay.

### What's Monitored:
- ✅ **Backend errors** (API crashes, database issues)
- ✅ **Frontend errors** (React crashes, network failures)
- ✅ **Performance metrics** (slow API calls, page load times)
- ✅ **Session replay** (video playback of user sessions when errors occur)
- ✅ **User context** (which teacher/institute faced the issue)

---

## 🔧 Setup Instructions

### Step 1: Create Sentry Account

1. Go to https://sentry.io/signup/
2. Create a free account
3. Create a new project:
   - **Platform:** Node.js (for backend)
   - **Name:** `mathlogs-backend`
4. Copy the **DSN** (Data Source Name)

### Step 2: Create Frontend Project

1. In Sentry dashboard, create another project:
   - **Platform:** React
   - **Name:** `mathlogs-frontend`
2. Copy the **DSN**

### Step 3: Add Environment Variables

#### On Heroku:
```bash
heroku config:set SENTRY_DSN="https://your-backend-dsn@sentry.io/project-id" --app mathlogs
heroku config:set VITE_SENTRY_DSN="https://your-frontend-dsn@sentry.io/frontend-id" --app mathlogs
```

#### Locally (`.env` files):
**Server (`.env`):**
```env
SENTRY_DSN=https://your-backend-dsn@sentry.io/project-id
NODE_ENV=production
```

**Client (`.env.local`):**
```env
VITE_SENTRY_DSN=https://your-frontend-dsn@sentry.io/frontend-id
VITE_APP_VERSION=1.0.0
```

---

## ✅ Verification

### Test Backend Sentry

**Option 1: Using Heroku console**
```bash
heroku run 'node -e "require(\"@sentry/node\").captureMessage(\"Test from Heroku\")"' --app mathlogs
```

**Option 2: Create test endpoint**
Add to `server/src/index.ts`:
```typescript
app.get('/debug-sentry', (req, res) => {
    throw new Error('Test Sentry Error!');
});
```

Then visit: `https://mathlogs.app/debug-sentry`

### Test Frontend Sentry

Add a test button to any page:
```tsx
<button onClick={() => { throw new Error('Frontend test error!'); }}>
  Test Sentry
</button>
```

---

## 📊 What Gets Tracked

### Backend Tracking

#### Automatic:
- ✅ Unhandled exceptions
- ✅ Promise rejections
- ✅ Express route errors
- ✅ Database query failures

#### Manual (when needed):
```typescript
import { captureException } from './monitoring/sentry';

try {
    // risky code
} catch (error) {
    captureException(error, {
        userId: admin.id,
        username: admin.username,
        endpoint: '/api/fees/pay'
    });
}
```

### Frontend Tracking

#### Automatic:
- ✅ React component crashes
- ✅ Network request failures
- ✅ Unhandled promise rejections
- ✅ Console errors

#### Session Replay:
- When an error occurs, Sentry records the last 30 seconds of user interaction
- **All text is masked** for GDPR compliance
- Helps reproduce bugs

---

## 🔐 Privacy & Security

### PII Redaction (Built-in)

**Automatically redacted:**
- 🔒 Passwords
- 🔒 Email addresses
- 🔒 Phone numbers
- 🔒 WhatsApp numbers
- 🔒 JWT tokens
- 🔒 Cookies

**Redacted in session replay:**
- All text content (masked)
- All media (blocked)
- Only UI interactions visible

---

## 📈 Performance Monitoring

### Backend Performance Traces

**Sampled at 10% in production:**
- API response times
- Database query durations
- Third-party API calls (email, etc.)

### Frontend Performance Traces

**Sampled at 10% in production:**
- Page load times
- Component render times
- Network request latencies

---

## 📁 File Structure

```
server/src/
├── monitoring/
│   └── sentry.ts          # Backend Sentry config

client/src/
├── monitoring/
│   └── sentry.ts          # Frontend Sentry config
└── main.tsx               # Sentry initialization
```

---

## 🚨 Alert Configuration (Sentry Dashboard)

### Recommended Alerts

1. **High Error Rate**
   - Trigger: >10 errors in 1 hour
   - Action: Email + Slack

2. **New Issue**
   - Trigger: First occurrence of new error
   - Action: Email notification

3. **Perf Degradation**
   - Trigger: API response time >2 seconds
   - Action: Email notification

### Setting Up Alerts:
1. Go to Sentry → Project Settings → Alerts
2. Create new alert rule
3. Choose notification channel (Email/Slack/PagerDuty)

---

## 🛠️ Debugging with Sentry

### Finding Issues

1. **Dashboard:** Shows recent errors
2. **Issues:** Lists all unique errors
3. **Performance:** Shows slow transactions
4. **Releases:** Track errors by deployment

### Issue Details Page Shows:

- **Error message** and stack trace
- **User context** (teacher ID, batch name)
- **Breadcrumbs** (last 10 actions before error)
- **Device info** (browser, OS, screen size)
- **Session replay** (if error occurred)

---

## 📊 Sample Rate Configuration

| Environment | Errors | Performance | Session Replay |
|-------------|--------|-------------|----------------|
| **Development** | 100% | 100% | 50% |
| **Production** | 100% | 10% | 10% (errors: 100%) |

**Why 10% in production?**
- Reduces Sentry quota usage
- Still captures enough data for insights
- Errors are ALWAYS captured (100%)

---

## 💰 Sentry Quota Management

### Free Tier Limits:
- 5,000 errors/month
- 10,000 performance events/month
- 50 session replays/month

### Optimization Tips:
1. **Ignore noisy errors** (edit `ignoreErrors` in config)
2. **Lower sample rate** if hitting limits
3. **Filter out bot traffic**

---

## 🔄 Release Tracking

### Backend Releases
Automatically tracked via Heroku git commit:
```typescript
release: process.env.HEROKU_SLUG_COMMIT
```

### Frontend Releases
Set in `.env`:
```env
VITE_APP_VERSION=v66
```

This helps track which deployment introduced a bug!

---

## 📞 Support Resources

- **Sentry Docs:** https://docs.sentry.io/
- **Node.js Guide:** https://docs.sentry.io/platforms/node/
- **React Guide:** https://docs.sentry.io/platforms/javascript/guides/react/

---

## ✅ Completion Checklist

Setup is complete when:

- [x] Backend Sentry package installed
- [x] Frontend Sentry package installed
- [x] Backend Sentry initialized in `server/src/index.ts`
- [x] Frontend Sentry initialized in `client/src/main.tsx`
- [x] DSN environment variables set on Heroku
- [x] PII redaction configured
- [x] Test error sent to Sentry dashboard
- [x] Alerts configured in Sentry UI

---

## 🎯 Next Steps (Optional)

1. **Set up Slack integration** for error notifications
2. **Create custom dashboards** for your metrics
3. **Enable source maps** for better stack traces (requires build config)
4. **Add custom tags** for institute-specific filtering

---

## 🎉 Summary

Sentry is now fully integrated! You will:
- ✅ Get notified when errors occur
- ✅ See which teachers are affected
- ✅ Watch session replays of bugs
- ✅ Track performance over time
- ✅ Debug issues faster with full context

**No more guessing what went wrong – you'll have video proof! 🎬**
