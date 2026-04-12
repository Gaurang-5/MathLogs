# Contributing to MathLogs

Welcome to the MathLogs development team! Since this codebase is tied to a **Live Production System** serving actual users, we enforce a strict set of rules to ensure mobile app developers and web developers do not accidentally disrupt the live platform or corrupt real database records.

## 🚨 Golden Rules

1. **NEVER CONNECT LITERALLY TO `main` DATABASE:** Never use the production `DATABASE_URL` in your `.env` file for local testing of mobile or web features. You must use a local Postgres database, a local Docker instance, or a designated "staging" database branch provided by the team lead.
2. **NEVER COMMIT API KEYS/SECRETS:** If you hardcode a production key (e.g. MSG91, Postgres tokens) or commit your `.env` file to Github, it is an immediate security breach. 
3. **NEVER PUSH STRAIGHT TO MAIN:** All changes must go through a branching strategy and be approved via a Pull Request (PR).

---

## 🛠 Branching Strategy & Pull Requests

We follow a classic Git Flow strategy. As a mobile or backend contributor, you do not have direct push access to the `main` branch. 

1. **Update `main` Locally:**
   ```bash
   git checkout main
   git pull origin main
   ```
2. **Create a Feature Branch:** Branch names should describe what you're working on (e.g., `feat/mobile-login`, `fix/whatsapp-link-bug`, `chore/native-deps`).
   ```bash
   git checkout -b feat/your-feature-name
   ```
3. **Commit your changes:** Write clear and concise commit messages.
   ```bash
   git commit -m "feat: implemented OTP login logic on mobile hooks"
   ```
4. **Push your branch:**
   ```bash
   git push origin feat/your-feature-name
   ```
5. **Open a Pull Request:** Go to GitHub and open a PR pointing your feature branch to `main`.
6. **Code Review:** The repository owner/lead developer must review and "Squash & Merge" the pull request before it goes live.

---

## 📡 API Versioning (Backend Mobile Interaction)

Since our web and mobile applications share the same Node/Express Server, changing how an endpoint works for mobile might crash the live web application.

- **For new mobile logic:** Create new endpoints prefixed with `/api/v2/mobile/` instead of overriding `/api/v1/` routes. 
- **Modifying shared Logic:** If modifying a shared Prisma method/controller (like `studentController.ts`), rigorously test that standard web endpoints (`/students`, etc.) still format their JSON responses properly. 

---

## 🏗 Setup & Environment Variables (.env)

When you clone the repository, your `.env` files are missing (this is intentional, as they are securely listed in `.gitignore`).

1. **Server (`server/.env`):**
   Copy the `server/.env.example` file to create your own `server/.env`.
   Configure a local database for Prisma to migrate to. 
   ```bash
   DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/mathlogs_local?schema=public"
   ```
   **To sync your database schema:** Run `npx prisma db push` or `npx prisma migrate dev`.

2. **Mobile (`mobile/.env`):**
   Ensure `EXPO_PUBLIC_API_URL` points to your local machine network IP during testing (e.g., `http://192.168.X.X:3001/api`), *not* the live Heroku URL, so you don't corrupt real data!

---

## ✅ Deployment Pipeline

1. Pull Requests are merged into `main` by repo admins.
2. Changes to `main` are first deployed to the **Staging Environment** to ensure mobile and web apps function harmoniously.
3. Once staging QA passes, the admin promotes the branch to Heroku `Production`. 

If you have questions, please contact the repository owner before submitting code changes!
