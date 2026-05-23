# 🚀 How to Deploy MathLogs to Heroku

You can deploy MathLogs to Heroku in about 10 minutes. Because MathLogs uses a database, we need to switch from the local file-based database (SQLite) to a production database (PostgreSQL) for Heroku.

## ✅ Prerequisites
1. [Sign up for Heroku](https://signup.heroku.com/) (Free account is fine).
2. Install the [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli).
   ```bash
   brew tap heroku/brew && brew install heroku
   ```
3. Login to Heroku in your terminal:
   ```bash
   heroku login
   ```

## 🛠 Step 1: Prepare the App
We have already created the `Procfile` and `package.json` for you. You just need to configure the database.

1. **Edit `server/prisma/schema.prisma`**:
   Change the `provider` from `"sqlite"` to `"postgresql"`.

   ```prisma
   // BEFORE:
   datasource db {
     provider = "sqlite"
     url      = env("DATABASE_URL")
   }

   // AFTER:
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```

2. **Commit the Change**:
   ```bash
   git add .
   git commit -m "Switch to Postgres for Heroku"
   ```

## 🚀 Step 2: Create Heroku App

Run these commands in your project folder:

1. **Create the app**:
   ```bash
   heroku create mathlogs-app-NAME  # Replace NAME with something unique
   ```

2. **Add the Database** (Essential!):
   ```bash
   heroku addons:create heroku-postgresql:essential-0
   ```
   *Note: This creates a remote database for your live app.*

3. **Set Environment Variables**:
   You need to copy your generic secrets (like JWT_SECRET).
   ```bash
   heroku config:set JWT_SECRET="your_super_secret_key_here"
   heroku config:set NODE_ENV="production"
   ```

## 📦 Step 3: Deploy!

Push your code to Heroku's git server:

```bash
git push heroku main
```

Heroku will now:
1. Build your Frontend (React).
2. Build your Backend (Node.js).
3. Start the server.

### 🛑 One Final Step: Initialize Database
Once the deploy finishes, run this command to set up the database structure on Heroku:

```bash
heroku run npx prisma migrate deploy --schema=server/prisma/schema.prisma
```

## 🎉 Done!
Open your app:
```bash
heroku open
```

---

## 🔄 Switching Back to Local Development
If you want to work locally again:
1. Change `schema.prisma` provider back to `"sqlite"`.
2. Run `./dev.sh`.
