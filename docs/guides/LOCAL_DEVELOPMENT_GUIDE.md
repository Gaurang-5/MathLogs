# Local Development & Onboarding Guide

Welcome to the team! This guide is written specifically for the **Web and Mobile developers** to get the entire project running perfectly on your own computer without touching the live website.

If you haven't read `CONTRIBUTING.md` in the root folder yet, **read that first**!

## 🖥 Prerequisites
Before you start, make sure you have the following installed on your laptop:
1. **Node.js**: (Version 22 or higher) - Download from `nodejs.org`
2. **Git**: To version control - Download from `git-scm.com`
3. **Local Database**: 
   - We use PostgreSQL. You have two options for your local development database:
     1. Download **Postgres.app** (for Mac) or install via PostgreSQL official installer (for Windows/Linux).
     2. Create a free temporary database table online at **Supabase** or **Neon**.

## 🛠 Step 1: Clone & Install Everything
Open your terminal and clone the repo. Note: Do *not* push straight to main!

```bash
git clone https://github.com/Gaurang-5/MathLogs.git
cd MathLogs
```

To install all Node Modules quickly across all folders (client, server, and mobile), run:
```bash
# Wait an extra minute for all 3 directories to finish installing
cd server && npm install
cd ../client && npm install
cd ../mobile && npm install
```

## 🔐 Step 2: Environment Variables (.env)
Since you are testing, you should **never** have the production API keys. You must create `.env` files locally.

### Server Env file
```bash
cd server
cp .env.example .env
```
Open `server/.env`. Look for the `DATABASE_URL` variable. 
Change it to your actual local or staging Postgres string. Ask the project lead if you need a staging database URL, or use your local host like this:
`DATABASE_URL="postgresql://postgres:postgres@localhost:5432/mathlogs_local?schema=public"`

Ensure you have a `JWT_SECRET` string in your `.env`. You can make it any random word for local testing like `JWT_SECRET="supersafesecret123"`.

### Mobile Env File
Create an `.env` file in the `mobile` folder.
*Crucial Step*: Since you will be running the mobile app on a physical device, `localhost` will not work. You need to use your computer's local Wi-Fi IP.

Find your IP:
- Mac: `ipconfig getifaddr en0`
- Windows: `ipconfig` (Look for IPv4)

Put this into `mobile/.env`:
```
EXPO_PUBLIC_API_URL=http://<YOUR_WIFI_IP>:3001/api
```

## 🗄 Step 3: Database Synchronization

Because your local database is completely empty right now, we need to inject the "Schema" (Database structure) from the project code into your local DB.

```bash
cd server
npx prisma db push
```
This tells Prisma: "Hey, read our `schema.prisma` file, and create all the tables like Batches, Users, Students natively on my local Postgres!"

*(Tip: In development, we use `npx prisma db push`. In production, do not run this—run `prisma migrate deploy` instead. But that's Heroku's job, not yours).*

### Fee model isolation and migration checks

Every institute has one immutable fee model:

- `CURRENT_DUE_BASED` keeps the existing fee records, installments, balances, invoices, and parent payment flow.
- `MONTH_COVERAGE` uses student month profiles, month allocations, teacher-entered payments, and audit events. Parent payment controls are unavailable.

Existing institutes are backfilled to `CURRENT_DUE_BASED`. Never change an institute's fee model after setup or copy data between the two models.

Before deploying, verify the migration against a disposable database or schema:

```bash
cd server
npx prisma migrate deploy
npx prisma validate
npx prisma generate
```

Record legacy fee totals before and after migration; the values must be identical:

```sql
SELECT COUNT(*) AS records, COALESCE(SUM("amount"), 0) AS total FROM "FeeRecord";
SELECT COUNT(*) AS payments, COALESCE(SUM("amountPaid"), 0) AS total FROM "FeePayment";
SELECT "coachingFeeMode", COUNT(*) FROM "Institute" GROUP BY "coachingFeeMode";
```

For acceptance testing, create two disposable institutes. Confirm that current-mode pages still use only the legacy fee APIs, while month-mode pages show batch dates, student fee-start setup, 1/3/6/12-month payment previews, coverage progress, history, edit/void, and the neutral parent-unavailable state. Also attempt both cross-mode API calls and confirm each returns `409 FEE_MODE_MISMATCH`.

The migration is additive, so application rollback is safe while the new tables remain. Do not drop the month-coverage tables after they contain payments; preserve them for audit and recovery.

## 🔥 Step 4: Run the App!

Finally, start the servers. You have two options:

### Option A: The "All-in-One" Script (For Mac/Linux)
Go back to the root folder of the project. We have a helper shell script to launch the backend server and the web frontend at the exact same time.
```bash
cd .. 
./dev.sh
```

### Option B: The Manual Way (Best to see separate error logs)
Open 3 separate terminal tabs.

**Tab 1 (Backend Server):**
```bash
cd server
npm run dev
# Server will start on http://localhost:3001
```

**Tab 2 (Web Client Frontend):**
```bash
cd client
npm run dev
# Website will open on http://localhost:5173
```

**Tab 3 (Mobile Framework):**
```bash
cd mobile
npx expo start
# Scan the QR Code on your phone using the 'Expo Go' app to test features!
```

---

## 🙋‍♂️ Next Steps & Support
You are officially up and running! 
Make sure you create a separate branch (`git checkout -b feat/my-new-feature`) before you start coding.
If you get database errors during step 3, double-check your `DATABASE_URL` string formatting.
For any architectural decisions (Changing schema, V1 vs V2 APIs), ask Gaurang first!
