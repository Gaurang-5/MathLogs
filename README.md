# MathLogs

MathLogs is a production-oriented tuition center management platform for institutes that need one system for admissions, batches, tests, fees, parent communication, student portals, and mobile-first classroom workflows.

The repository is a JavaScript/TypeScript monorepo with:

- A React web application for institute admins, super admins, students, parents, and public onboarding flows.
- A Node.js/Express API backed by PostgreSQL and Prisma.
- An Expo React Native mobile app for mobile-first institute operations.
- Capacitor Android/iOS projects for packaging the web client as a native app where needed.

## Table of Contents

- [Product Scope](#product-scope)
- [Architecture](#architecture)
- [Repository Structure](#repository-structure)
- [Technology Stack](#technology-stack)
- [Prerequisites](#prerequisites)
- [Local Development](#local-development)
- [Environment Configuration](#environment-configuration)
- [Database Workflow](#database-workflow)
- [Available Scripts](#available-scripts)
- [Testing and Quality Checks](#testing-and-quality-checks)
- [Deployment](#deployment)
- [Documentation](#documentation)
- [Contribution Workflow](#contribution-workflow)
- [Security Notes](#security-notes)

## Product Scope

### Plans and quiz credits

MathLogs has exactly three plans, and every plan supports unlimited students:

- Marketplace: ₹99 one-time, promotional free activation for now.
- Quiz: ₹249/month or ₹2,499/year, including Marketplace and five quiz credits refreshed monthly.
- Enterprise: ₹499/month or ₹4,999/year, including Marketplace, Quiz, and all coaching-management features.

Quiz and Enterprise each offer one 14-day trial with five credits. Included credits expire at the monthly refresh; purchased lifetime credit packs never expire. The public catalogue at `GET /api/plans` is the pricing source of truth.

MathLogs supports the operational lifecycle of a tuition center:

- Institute onboarding, trial activation, billing, plan management, and super-admin oversight.
- Admin authentication, invite-based setup, refresh-token session handling, and role-gated access.
- Batch creation, batch-level registration links, QR/PDF exports, and public registration status checks.
- Student registration, approval/rejection workflows, manual student creation, status tracking, and institute-scoped student IDs.
- Fee installments, custom invoices, payment collection, pending-fee reports, monthly transaction reports, and UPI payment verification.
- Test creation, mark entry, report downloads, AI-assisted test generation, online quizzes, quiz analytics, and live quiz monitoring.
- OCR-assisted score and receipt scanning using Gemini and optional AWS Textract comparison.
- Parent/student communication through email and WhatsApp templates, with queue processing in production.
- Student portal routes for institute-specific login, dashboards, payments, and online quiz taking.
- Health checks, Sentry monitoring hooks, secure logging, rate limiting, CORS allowlists, and production hardening utilities.

## Architecture

```text
                 +-----------------------+
                 |  React web client     |
                 |  Vite + Tailwind      |
                 +-----------+-----------+
                             |
                             | /api
                             v
+----------------+   +-------+--------+   +-------------------+
| Expo mobile    |-->| Express API    |-->| PostgreSQL        |
| React Native   |   | Prisma ORM     |   | Prisma migrations |
+----------------+   +-------+--------+   +-------------------+
                             |
          +------------------+-------------------+
          |                  |                   |
          v                  v                   v
   Email/SMTP          WhatsApp queue       S3/Textract/Gemini
   notifications       production worker    AI/OCR integrations
```

The Express server serves API routes under `/api`, exposes health endpoints, and serves the built web client in production. The Vite client uses `/api` in production and `VITE_API_URL` or localhost during development. The Expo app uses `EXPO_PUBLIC_API_URL` in development and the production MathLogs domain by default.

## Repository Structure

```text
.
|-- client/                 # Vite + React web application
|   |-- src/pages/          # Admin, public, billing, student portal, and quiz screens
|   |-- src/components/     # Shared UI and workflow components
|   |-- src/utils/          # API, auth, OCR, fee, and registration helpers
|   |-- android/            # Capacitor Android project
|   `-- ios/                # Capacitor iOS project
|-- server/                 # Express API, Prisma, workers, scripts, and tests
|   |-- src/controllers/    # Route handlers by domain
|   |-- src/routes/         # API route registration
|   |-- src/middleware/     # Auth, validation, security, query monitoring
|   |-- src/utils/          # Email, WhatsApp, OCR, PDF, Redis, logging, AI utilities
|   |-- prisma/             # Prisma schema, migrations, and seed script
|   `-- tests/              # Node test runner suites
|-- mobile/                 # Expo React Native app
|   |-- app/                # Expo Router screens
|   |-- components/         # Mobile components
|   |-- services/           # API, storage, and offline sync helpers
|   `-- constants/          # Theme and color constants
|-- docs/                   # Guides, plans, and operational notes
|-- dev.sh                  # Starts local API and web client together
|-- Procfile                # Heroku web and release process
`-- package.json            # Root setup, build, dev, and start scripts
```

## Technology Stack

| Area | Stack |
| --- | --- |
| Web client | React 19, Vite, TypeScript, React Router, TanStack Query, Tailwind CSS, Recharts, Framer Motion |
| Mobile app | Expo, React Native, Expo Router, NativeWind, AsyncStorage, Axios |
| API server | Node.js 22, Express 5, TypeScript, Prisma, PostgreSQL |
| Auth and security | JWT, refresh tokens, bcrypt, Helmet, CORS allowlists, rate limiting, Zod validation |
| Data and jobs | Prisma Client, PostgreSQL triggers/migrations, optional Redis, production WhatsApp worker |
| Files and reports | PDFKit, QR/barcode generation, S3-compatible payment screenshot storage |
| AI/OCR | Google Gemini, AWS Textract, AI test generation, OCR result caching |
| Monitoring | Sentry server/client integrations, health endpoints, slow request logging |
| Native packaging | Capacitor for client Android/iOS, Expo/EAS for mobile |

## Prerequisites

- Node.js 22.x. The root `package.json` declares `node: 22.x`.
- npm.
- PostgreSQL for local development.
- Git.
- Expo Go or native mobile tooling if working on `mobile/`.
- Xcode and Android Studio only when building native iOS/Android targets.

Optional services for full integration testing:

- Redis for production-style caching/rate-limit backing.
- Google Gemini API key for AI test generation and OCR.
- AWS credentials for Textract and payment screenshot storage.
- SMTP credentials for email delivery.
- Meta WhatsApp Cloud API credentials for WhatsApp messaging.
- Razorpay credentials for billing and onboarding payment flows.
- Sentry DSNs for frontend/backend monitoring.

## Local Development

### 1. Clone the repository

```bash
git clone https://github.com/Gaurang-5/MathLogs.git
cd MathLogs
```

### 2. Install dependencies

Install every workspace from the root:

```bash
npm run setup
```

Or install each app manually:

```bash
npm install
cd server && npm install
cd ../client && npm install
cd ../mobile && npm install
```

### 3. Configure the server environment

```bash
cd server
cp .env.example .env
```

At minimum, set:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/mathlogs_local?schema=public"
JWT_SECRET="replace-with-a-local-development-secret"
PORT=3001
NODE_ENV=development
CLIENT_URL=http://localhost:5173
```

Generate a stronger local JWT secret with:

```bash
openssl rand -base64 32
```

Never use production credentials in local development.

### 4. Prepare the database

```bash
cd server
npx prisma db push
```

For migration-based local work, use Prisma's migration commands instead:

```bash
npx prisma migrate dev
```

### 5. Start web and API together

From the repository root:

```bash
npm run dev
```

This runs `./dev.sh`, starts the API server, starts the Vite web client, and writes server logs to `server/logs/`.

Default local URLs:

- Web client: `http://127.0.0.1:5173/`
- API server: `http://localhost:3001`
- Health check: `http://localhost:3001/health`

### 6. Start the mobile app

In a separate terminal:

```bash
cd mobile
npm run start
```

For physical-device local API testing, create `mobile/.env` and point it at your computer's Wi-Fi IP:

```env
EXPO_PUBLIC_API_URL=http://192.168.x.x:3001
```

The mobile API client appends `/api`, so do not include `/api` in `EXPO_PUBLIC_API_URL`.

## Environment Configuration

The checked-in example file is `server/.env.example`. Important server variables include:

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string used by Prisma |
| `JWT_SECRET` | Yes | Signing secret for access and refresh-token flows |
| `PORT` | No | API port, defaults to `3001` |
| `NODE_ENV` | No | `development`, `test`, or `production` |
| `SUPPORT_FEATURE_ENABLED` | No | Enables ticket-based institute/Superadmin Support only when exactly `true`; defaults to disabled |
| `CLIENT_URL` | No | Local/web origin used by generated links |
| `FRONTEND_URL` | No | Public frontend base URL for payment and messaging links |
| `GEMINI_API_KEY` | Optional | AI test generation and OCR |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Optional | Textract and payment screenshot storage |
| `AWS_REGION` | Optional | AWS region, defaults to `ap-south-1` in several utilities |
| `PAYMENT_PHOTO_BUCKET` | Optional | S3 bucket for payment screenshots |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Optional | Billing and onboarding payment flows |
| `EMAIL_USER` / `EMAIL_PASS` | Optional | Default SMTP sender |
| `EMAIL_USER_NOREPLY`, `EMAIL_USER_WELCOME`, `EMAIL_USER_SUPPORT`, `EMAIL_USER_ADMIN` | Optional | Specialized SMTP sender accounts |
| `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_ACCESS_TOKEN` | Optional | Meta WhatsApp Cloud API worker |
| `SENTRY_DSN` | Optional | Backend monitoring |
| `REDIS_URL` | Optional | Redis connection URL |

Client-side variables:

| Variable | App | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | `client/` | Overrides the web client's API base URL during development |
| `VITE_SENTRY_DSN` | `client/` | Enables frontend Sentry |
| `VITE_APP_VERSION` | `client/` | Frontend release/version label |
| `VITE_SUPPORT_FEATURE_ENABLED` | `client/` | Shows ticket-based Support only when exactly `true`; defaults to disabled |
| `EXPO_PUBLIC_API_URL` | `mobile/` | Mobile development API base URL without `/api` |

## Database Workflow

Prisma schema source:

```text
server/prisma/schema.prisma
```

Common commands:

```bash
cd server
npx prisma db push
npx prisma migrate dev
npx prisma migrate deploy
npx prisma generate
```

Use `db push` for quick local schema sync when you do not need a migration. Use migrations for production-bound schema changes.

The schema is multi-tenant around `Institute` and includes admins, batches, students, tests, marks, fees, balances, attendance, online quizzes, student leads, WhatsApp jobs, refresh tokens, invoices, and UPI payment verification records.

## Available Scripts

Root scripts:

| Command | Description |
| --- | --- |
| `npm run setup` | Installs dependencies in root, `server/`, `client/`, and `mobile/` |
| `npm run dev` | Runs `./dev.sh` to start API and web client together |
| `npm run build` | Builds the web client and API server |
| `npm start` | Starts the built server from `server/dist` |
| `npm run heroku-postbuild` | Heroku build hook for client and server |

Server scripts:

| Command | Description |
| --- | --- |
| `cd server && npm run dev` | Starts the API with `tsx watch` |
| `cd server && npm run build` | Compiles TypeScript |
| `cd server && npm start` | Runs `dist/index.js` |
| `cd server && npm test` | Runs server tests with Node's test runner |

Client scripts:

| Command | Description |
| --- | --- |
| `cd client && npm run dev` | Starts Vite |
| `cd client && npm run build` | Builds production frontend assets |
| `cd client && npm run preview` | Serves the built frontend locally |
| `cd client && npm run lint` | Runs ESLint |
| `cd client && npm run test` | Runs Vitest in watch mode |
| `cd client && npm run test:run` | Runs Vitest once |

Mobile scripts:

| Command | Description |
| --- | --- |
| `cd mobile && npm run start` | Starts Expo on port 8081 |
| `cd mobile && npm run android` | Starts Expo for Android |
| `cd mobile && npm run ios` | Starts Expo for iOS |
| `cd mobile && npm run web` | Starts Expo web |
| `cd mobile && npm run tunnel` | Starts Expo through a tunnel |

## Testing and Quality Checks

Run targeted checks before opening a pull request:

```bash
cd server && npm test
cd client && npm run test:run
cd client && npm run lint
npm run build
```

The server test suite covers API behavior, fee calculations, security-sensitive fee paths, schemas, student IDs, class averages, and controller success paths. The client uses Vitest for utility-level tests.

## Deployment

The repository includes Heroku-oriented deployment files:

- `Procfile` starts the built server and runs Prisma migrations during the Heroku release phase.
- `npm run heroku-postbuild` installs and builds the client and server.
- The Express server serves `client/dist` in production.

Production deployments require:

- A production PostgreSQL database.
- `JWT_SECRET`, `DATABASE_URL`, `NODE_ENV=production`, and any integration-specific secrets.
- Prisma migrations deployed with `npx prisma migrate deploy`.
- Correct production origins in the server CORS allowlist.

Ticket-based Support is currently held back. Keep `SUPPORT_FEATURE_ENABLED=false` and `VITE_SUPPORT_FEATURE_ENABLED=false` in production. Operational communication preferences, plan lifecycle notices, billing reminders, and configured email/WhatsApp delivery remain active while Support is disabled. A later Support launch requires both flags to be `true`, with the client flag present during the production build.

See [Deploy to Heroku](./docs/guides/DEPLOY_TO_HEROKU.md) for the project deployment guide.

## Documentation

Important docs:

- [Contributing Guide](./CONTRIBUTING.md)
- [Local Development Guide](./docs/guides/LOCAL_DEVELOPMENT_GUIDE.md)
- [Deployment Guide](./docs/guides/DEPLOY_TO_HEROKU.md)
- [Domain Setup Guide](./docs/guides/DOMAIN_SETUP_GUIDE.md)
- [Backup and Recovery Guide](./docs/guides/BACKUP_RECOVERY_GUIDE.md)
- [Log Management Guide](./docs/guides/LOG_MANAGEMENT_GUIDE.md)
- [PWA Installation Guide](./docs/guides/PWA_INSTALLATION.md)
- [Sentry Setup](./docs/guides/SENTRY_SETUP.md)
- [Sentry Quickstart](./docs/guides/SENTRY_QUICKSTART.md)
- [WhatsApp Bot Setup](./docs/guides/WHATSAPP_BOT_SETUP.md)

Planning notes live under `docs/plans/` and task notes live under `docs/tasks/`.

## Contribution Workflow

This project is connected to a live production system. Read [CONTRIBUTING.md](./CONTRIBUTING.md) before pushing code.

Core rules:

- Do not use production database credentials for local development.
- Do not commit `.env` files, API keys, database URLs, or other secrets.
- Do not push directly to `main`.
- Create a feature branch for every change.
- Open a pull request and wait for review before production-bound changes are merged.
- Be especially careful when changing shared API responses used by both web and mobile clients.

Suggested branch format:

```bash
git checkout -b feat/short-description
```

## Security Notes

The server includes several production safety controls:

- Strict production CORS origin allowlist.
- Helmet security headers.
- API, auth, OCR, payment, public, and bulk-notification rate limits.
- Zod request validation on important routes.
- JWT authentication middleware and refresh-token flows.
- Slow-request logging and health endpoints.
- Sentry error capture when configured.
- DB-backed OCR deduplication to reduce repeated AI calls across server instances.
- Signed payment screenshot access helpers.

When working locally, keep test data separate from production data. When adding new integrations, document the environment variables and failure modes in the relevant guide.
