# Production Deployment & Security Hardening Guide

**Date**: 2026-01-26  
**Status**: Production-Ready Configuration  
**Security Level**: Enterprise-Grade

---

## 🔐 CRITICAL: Pre-Deployment Security Checklist

### 1. HTTPS/TLS Configuration (MANDATORY)

#### Option A: Using Let's Encrypt with Nginx (Recommended)

**Install Certbot**:
```bash
# Ubuntu/Debian
sudo apt-get install certbot python3-certbot-nginx

# macOS
brew install certbot
```

**Generate Certificate**:
```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

**Nginx Configuration** (`/etc/nginx/sites-available/coaching-app`):
```nginx
# Force HTTPS redirect
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL certificates (auto-managed by certbot)
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Modern SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers off;

    # HSTS (force HTTPS for 1 year)
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    # Security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Proxy to Node.js application
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Serve React frontend
    location / {
        root /var/www/coaching-app/client/dist;
        try_files $uri /index.html;
    }
}
```

**Enable Configuration**:
```bash
sudo ln -s /etc/nginx/sites-available/coaching-app /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

**Auto-Renewal**:
```bash
# Certbot auto-renews via systemd timer (check status)
sudo systemctl status certbot.timer

# Test renewal
sudo certbot renew --dry-run
```

#### Option B: Cloudflare (Simplest)
1. Add your domain to Cloudflare (free plan)
2. Set DNS records to point to your server
3. Enable "Full (strict)" SSL/TLS mode
4. Cloudflare handles TLS certificates automatically

---

## 🔑 Secrets Management (Production)

### Option A: AWS Secrets Manager (Recommended for AWS deployments)

**Install AWS CLI**:
```bash
brew install awscli  # macOS
pip install awscli   # Linux
```

**Store Secrets**:
```bash
aws secretsmanager create-secret \
    --name coaching-app/production \
    --secret-string '{
        "JWT_SECRET": "your-generated-secret-here",
        "EMAIL_PASS": "your-email-app-password",
        "DATABASE_URL": "your-database-url",
        "GPG_PASSPHRASE": "encryption-passphrase"
    }'
```

**Retrieve in Application** (`server/src/config/secrets.ts`):
```typescript
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const client = new SecretsManagerClient({ region: "us-east-1" });

export async function loadSecrets() {
    if (process.env.NODE_ENV !== 'production') {
        return; // Use .env in development
    }

    try {
        const response = await client.send(
            new GetSecretValueCommand({ SecretId: "coaching-app/production" })
        );
        
        const secrets = JSON.parse(response.SecretString!);
        process.env.JWT_SECRET = secrets.JWT_SECRET;
        process.env.EMAIL_PASS = secrets.EMAIL_PASS;
        process.env.DATABASE_URL = secrets.DATABASE_URL;
        process.env.GPG_PASSPHRASE = secrets.GPG_PASSPHRASE;
    } catch (error) {
        console.error("Failed to load secrets from AWS:", error);
        process.exit(1);
    }
}
```

**Update server/src/index.ts**:
```typescript
import { loadSecrets } from './config/secrets';

async function start() {
    await loadSecrets();
    // ... rest of server startup
}

start();
```

### Option B: Google Cloud Secret Manager

**Install gcloud CLI**:
```bash
brew install google-cloud-sdk  # macOS
```

**Store Secrets**:
```bash
echo -n "your-jwt-secret" | gcloud secrets create JWT_SECRET --data-file=-
echo -n "your-email-password" | gcloud secrets create EMAIL_PASS --data-file=-
```

**Retrieve in Application**:
```typescript
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const client = new SecretManagerServiceClient();

async function getSecret(name: string): Promise<string> {
    const [version] = await client.accessSecretVersion({
        name: `projects/PROJECT_ID/secrets/${name}/versions/latest`,
    });
    return version.payload?.data?.toString() || '';
}

export async function loadSecrets() {
    process.env.JWT_SECRET = await getSecret('JWT_SECRET');
    process.env.EMAIL_PASS = await getSecret('EMAIL_PASS');
}
```

### Option C: HashiCorp Vault (Advanced)

**Install Vault**:
```bash
brew install vault  # macOS
```

**Start Vault Server** (dev mode for testing):
```bash
vault server -dev
export VAULT_ADDR='http://127.0.0.1:8200'
```

**Store Secrets**:
```bash
vault kv put secret/coaching-app \
    JWT_SECRET="your-secret" \
    EMAIL_PASS="your-password"
```

**Retrieve**:
```bash
vault kv get -field=JWT_SECRET secret/coaching-app
```

---

## 📊 Redis for Rate Limiting (Production)

### Install Redis

**macOS**:
```bash
brew install redis
brew services start redis
```

**Ubuntu/Debian**:
```bash
sudo apt-get install redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
```

### Update Rate Limiting Configuration

**Install Redis client**:
```bash
cd server
npm install ioredis rate-limit-redis
```

**Update `server/src/middleware/security.ts`**:
```typescript
import Redis from 'ioredis';
import RedisStore from 'rate-limit-redis';

// Initialize Redis client
const redisClient = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    retryStrategy: (times) => Math.min(times * 50, 2000)
});

// Update rate limiters to use Redis
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
        client: redisClient,
        prefix: 'rl:api:'
    }),
    message: { error: 'Too many requests, please try again later.' }
});

export const publicLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 500,
    store: new RedisStore({
        client: redisClient,
        prefix: 'rl:public:'
    }),
    // ... rest of config
});
```

**Benefits**:
- ✅ Rate limits persist across server restarts
- ✅ Works in multi-instance deployments
- ✅ Better performance at scale

---

## 🛡️ Environment Variables (Production)

**Create `.env.production`**:
```bash
# Application
NODE_ENV=production
PORT=3001

# Security (load from secrets manager instead)
# JWT_SECRET=loaded-from-secrets-manager
# EMAIL_PASS=loaded-from-secrets-manager

# Database
DATABASE_URL="file:./production.db"

# Client URL (update with your domain)
CLIENT_URL=https://yourdomain.com

# Redis (if using)
REDIS_HOST=localhost
REDIS_PORT=6379
# REDIS_PASSWORD=loaded-from-secrets-manager

# Email
EMAIL_SERVICE=gmail
EMAIL_USER=notifications@yourdomain.com

# Backup encryption (optional)
GPG_BACKUP_EMAIL=backup@yourdomain.com
```

---

## 🔒 Encrypted Backups (Production)

### Setup GPG Encryption

**Install GPG**:
```bash
brew install gnupg  # macOS
sudo apt-get install gnupg  # Ubuntu
```

**Generate Key Pair** (first time only):
```bash
gpg --full-generate-key
# Choose: RSA and RSA, 4096 bits, no expiration
# Real name: Coaching App Backups
# Email: backup@yourdomain.com
```

**Set Passphrase in Environment**:
```bash
export GPG_PASSPHRASE="your-secure-passphrase"
# Store in secrets manager for production
```

**Use Encrypted Backup**:
```bash
cd server
./scripts/backup_db_encrypted.sh manual
```

**Decrypt When Needed**:
```bash
gpg --decrypt prisma/backups/dev.db.manual_20260126_120000.gpg > restored.db
```

---

## 📋 Production Deployment Checklist

### Before Deployment
- [ ] Generate TLS certificate (Let's Encrypt or Cloudflare)
- [ ] Configure Nginx or reverse proxy with HTTPS
- [ ] Set up secrets manager (AWS/GCP/Vault)
- [ ] Install and configure Redis
- [ ] Generate GPG key for encrypted backups
- [ ] Update CLIENT_URL in .env.production
- [ ] Test all environment variables
- [ ] Run database migration: `npx prisma migrate deploy`

### Security Verification
- [ ] HTTPS enforced (test: curl http://domain.com → 301 redirect)
- [ ] CORS restricted to production domain only
- [ ] Rate limiting uses Redis (survives restart)
- [ ] JWT_SECRET loaded from secrets manager
- [ ] Email credentials loaded from secrets manager
- [ ] GPG encryption working for backups
- [ ] Security headers present (test with securityheaders.com)
- [ ] CSP headers configured correctly

### Monitoring Setup
- [ ] Configure log aggregation (Papertrail, Logtail, CloudWatch)
- [ ] Set up uptime monitoring (UptimeRobot, Pingdom)
- [ ] Configure error tracking (Sentry, Rollbar)
- [ ] Set up automated backup cron job
- [ ] Configure alerts for rate limit exceeded
- [ ] Monitor disk space (database growth)

### Post-Deployment
- [ ] Verify HTTPS certificate auto-renewal
- [ ] Test rate limiting with load test
- [ ] Verify encrypted backups are created
- [ ] Test restore from encrypted backup
- [ ] Confirm CORS blocks unauthorized origins
- [ ] Review security headers with online scanner
- [ ] Document runbook for common issues

---

## 🚀 Quick Production Start (PM2)

**Install PM2**:
```bash
npm install -g pm2
```

**Start Application**:
```bash
cd server
pm2 start npm --name "coaching-api" -- run start
pm2 save
pm2 startup  # Configure auto-start on boot
```

**Monitor**:
```bash
pm2 status
pm2 logs coaching-api
pm2 monit
```

---

## 📞 Security Incident Response

### If Secrets Compromised:
1. **Immediately** rotate JWT_SECRET (invalidates all sessions)
2. Change email password
3. Review access logs for unauthorized activity
4. Generate new GPG key if passphrase leaked
5. Notify users of potential breach if PII exposed

### If Rate Limit Bypassed:
1. Check Redis connectivity (may have fallen back to memory)
2. Review IP-based limiting effectiveness
3. Consider adding CAPTCHA to public endpoints
4. Implement additional validation (email verification)

### If CORS Misconfigured:
1. Check allowed origins list
2. Verify CLIENT_URL environment variable
3. Test with curl from unauthorized domain
4. Review server logs for blocked requests

---

**Created**: 2026-01-26  
**Maintained By**: DevOps/Security Team  
**Review Frequency**: Quarterly or after security incidents
