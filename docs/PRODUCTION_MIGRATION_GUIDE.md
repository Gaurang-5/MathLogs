# 🦅 Production Database Migration Guide (SQLite -> PostgreSQL)

**Objective**: Migrate all data from local SQLite to Heroku PostgreSQL with **Zero Data Loss**.
**Role**: Senior Backend Engineer execution plan.

## ⚠️ Critical Warnings
1.  **Do NOT delete** your `server/prisma/dev.db` file until verified.
2.  This process involves an **intermediate export** to JSON files.
3.  We will **reset** the migration history for PostgreSQL to ensure strictly valid SQL.

---

## 🛠 Phase 1: Local Export (Safety First)

1.  **Verify Current Data Integrity**
    Run the count verification script to know exactly what we have.
    ```bash
    npx ts-node server/scripts/migration/0_verify_counts.ts
    ```
    *Screenshot or save this output.*

2.  **Export Data to JSON**
    This script extracts all tables and creates a `manifest.json`.
    ```bash
    npx ts-node server/scripts/migration/1_export_sqlite.ts
    ```
    **Verify**: Check the `server/migration-data` folder. Ensure all files exist and valid data is inside.

3.  **Backup SQLite Artifacts**
    ```bash
    cp server/prisma/dev.db server/prisma/dev.db.backup
    mv server/prisma/migrations server/prisma/migrations_sqlite_archived
    ```
    *We move the old migrations because SQLite SQL is not compatible with PostgreSQL.*

---

## ⚙️ Phase 2: Schema Switch

1.  **Update `server/prisma/schema.prisma`**
    Change the provider to PostgreSQL.
    ```prisma
    datasource db {
      provider = "postgresql"
      url      = env("DATABASE_URL")
    }
    ```

2.  **Set Connection String**
    In your `.env` file (create if missing), set `DATABASE_URL` to your target PostgreSQL database.
    *   If deploying to Heroku, you will get this URL from Heroku config.
    *   *For local validation, you can use a local Postgres instance.*

3.  **Generate New Prisma Client**
    ```bash
    npx prisma generate
    ```

4.  **Initialize PostgreSQL Schema**
    We create a fresh migration history for the new DB engine.
    ```bash
    npx prisma migrate dev --name init_postgres
    ```
    *This creates the tables in Postgres.*

---

## 📥 Phase 3: Import & Verify

1.  **Import Data**
    This script reads the JSON files and strictly inserts them into Postgres.
    ```bash
    npx ts-node server/scripts/migration/2_import_postgres.ts
    ```
    *Watch the console for any errors. The script stops on first error.*

2.  **Verify PostgreSQL Data**
    Run the count script again (now connected to Postgres).
    ```bash
    npx ts-node server/scripts/migration/0_verify_counts.ts
    ```
    **Validation**: Compare these numbers with Phase 1. They must be **Identical**.

---

## 🚀 Phase 4: Deploy to Heroku

1.  **Commit the Changes**
    ```bash
    git add .
    git commit -m "Migrate database to PostgreSQL"
    ```

2.  **Push to Heroku**
    ```bash
    git push heroku main
    ```

3.  **Apply Migrations on Heroku**
    ```bash
    heroku run npx prisma migrate deploy
    ```
    *(Note: Since we already aligned the schema locally or via the import phase, this ensures Heroku is in sync).*

4.  **Import Data on Heroku (If not done locally against remote URL)**
    *Option A (Recommended)*: Run the import script locally ONLY IF your `.env` `DATABASE_URL` points to Heroku Postgres.
    *Option B*: Commit the `migration-data` folder (not recommended for sensitive data) and run the script on Heroku console.

    **Best Approach**: Point your local `.env` to the Heroku Database URL temporarily to run the import script from your machine.

---

## ↩️ Rollback Plan (Emergency)

If verification fails or data looks wrong:

1.  **Restore Schema**: Change `provider` back to `"sqlite"`.
2.  **Restore Artifacts**:
    ```bash
    rm -rf server/prisma/migrations
    mv server/prisma/migrations_sqlite_archived server/prisma/migrations
    cp server/prisma/dev.db.backup server/prisma/dev.db
    ```
3.  **Regenerate Client**: `npx prisma generate`.
4.  **Verify**: Run `0_verify_counts.ts`.
5.  **Redeploy**: Push the reverted code to Heroku (note: Heroku will still need Postgres, so you can't really "rollback" to SQLite on Heroku easily without data loss, but you can restore your **Local Development** state instantly).

---

## ✅ Final Sign-Off Checklist
- [ ] Row counts match exactly between SQLite and Postgres.
- [ ] "Student Natural Key" constraints are active in Postgres.
- [ ] Application login works.
- [ ] Dashboards load correct Academic Year data.
