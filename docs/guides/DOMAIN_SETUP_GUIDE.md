# Heroku Custom Domain Setup Guide

## Prerequisites
1. A purchased domain (e.g., `yourdomain.com`)
2. Access to your domain registrar's DNS settings
3. Heroku CLI installed
4. Your Heroku app name (check with `heroku apps`)

---

## Step 1: Add Domain to Heroku

### Option A: Using Heroku CLI (Recommended)
```bash
# Login to Heroku
heroku login

# Navigate to your project
cd /Users/gaurangbhatia/Desktop/new_project

# Add your root domain
heroku domains:add yourdomain.com

# Add www subdomain
heroku domains:add www.yourdomain.com

# Verify domains were added
heroku domains
```

### Option B: Using Heroku Dashboard
1. Go to https://dashboard.heroku.com
2. Select your app
3. Go to **Settings** tab
4. Scroll to **Domains** section
5. Click **Add Domain**
6. Enter `yourdomain.com` and `www.yourdomain.com`

After adding, Heroku will provide DNS targets. Note these down!

---

## Step 2: Configure DNS Records

### For Most Domain Registrars (GoDaddy, Namecheap, etc.)

#### A. Root Domain (`yourdomain.com`)

**If your registrar supports ALIAS/ANAME records:**
```
Type: ALIAS (or ANAME)
Name: @
Target: <your-heroku-dns-target>.herokudns.com
TTL: Automatic
```

**If your registrar only supports CNAME/A records:**
```
Type: A
Name: @
IP Address: (You'll need to use www redirect - see below)
```

#### B. WWW Subdomain (`www.yourdomain.com`)
```
Type: CNAME
Name: www
Target: <your-heroku-dns-target>.herokudns.com
TTL: Automatic
```

### Example for Common Registrars:

#### GoDaddy:
1. Go to DNS Management
2. Click "Add" under Records
3. For root: Type=Forwarding, Forward to=http://www.yourdomain.com
4. For www: Type=CNAME, Name=www, Value=<heroku-target>

#### Namecheap:
1. Go to Advanced DNS
2. Add Record:
   - Type: CNAME Record
   - Host: www
   - Value: `<heroku-dns-target>.herokudns.com`
   - TTL: Automatic
3. For root (@), use URL Redirect to www.yourdomain.com

#### Cloudflare (Recommended for SSL):
1. Add site to Cloudflare
2. Set nameservers at your registrar
3. Add DNS records:
   ```
   Type: CNAME
   Name: @
   Target: <heroku-target>.herokudns.com
   Proxy: ON
   ```
4. Cloudflare will handle SSL automatically

---

## Step 3: Enable Automated Certificate Management (ACM)

Heroku provides free SSL certificates:

```bash
# Check if ACM is enabled
heroku certs:auto

# If not enabled, enable it
heroku certs:auto:enable
```

This will automatically provision SSL certificates for your domain.

---

## Step 4: Verify Setup

### A. DNS Propagation (Takes 0-48 hours)
Check DNS status:
```bash
# Check if CNAME is resolving
dig www.yourdomain.com

# Check if domain points to Heroku
nslookup www.yourdomain.com
```

### B. Test in Browser
1. Wait 10-30 minutes for initial propagation
2. Visit `http://www.yourdomain.com`
3. Check if it redirects to `https://www.yourdomain.com`

---

## Step 5: Update Application URLs (If Needed)

If your app uses hardcoded URLs for API calls or redirects:

1. **Environment Variables:**
   ```bash
   heroku config:set BASE_URL=https://yourdomain.com
   ```

2. **Update Frontend (if needed):**
   - Check `client/src/utils/api.ts`
   - Ensure API calls use relative paths or environment variables

---

## Troubleshooting

### Issue: "DNS not found"
**Solution:** Wait longer (DNS can take up to 48 hours). Check your DNS records are correct.

### Issue: "SSL certificate error"
**Solution:**
```bash
# Force ACM refresh
heroku certs:auto:refresh

# Check certificate status
heroku certs
```

### Issue: "Too many redirects"
**Solution:** Ensure you're not creating a redirect loop. Check:
- Cloudflare SSL mode is set to "Full" (not Flexible)
- Remove any custom redirects

### Issue: "App not loading"
**Solution:**
```bash
# Check app logs
heroku logs --tail

# Restart app
heroku restart
```

---

## Quick Reference: DNS Record Types

| Record Type | Use Case | Example |
|-------------|----------|---------|
| **CNAME** | Subdomain (www) | `www.yourdomain.com` → `app.herokudns.com` |
| **ALIAS/ANAME** | Root domain (if supported) | `yourdomain.com` → `app.herokudns.com` |
| **A Record** | Root domain IP (less flexible) | `yourdomain.com` → `35.123.45.67` |

---

## Final Checklist

- [ ] Domain added to Heroku (`heroku domains`)
- [ ] DNS records configured at registrar
- [ ] SSL/ACM enabled (`heroku certs:auto`)
- [ ] Waited for DNS propagation (10-30 min minimum)
- [ ] Site loads on `https://www.yourdomain.com`
- [ ] Root domain redirects to www (or vice versa)

---

## Need Help?

1. Check Heroku DNS target: `heroku domains`
2. Verify DNS records: https://dnschecker.org
3. Check SSL status: `heroku certs`
4. View app logs: `heroku logs --tail`

**Common DNS Targets Format:**
- `<random-name>-<random-id>.herokudns.com`
- Example: `shining-mountain-1234.herokudns.com`
