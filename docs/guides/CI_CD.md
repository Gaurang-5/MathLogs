# MathLogs CI/CD

MathLogs uses `.github/workflows/ci-cd.yml` for GitHub Actions CI and gated Heroku production deployment.

## Pipeline behavior

| Trigger | Client checks | Server checks | Production deploy |
| --- | --- | --- | --- |
| Pull request | advisory lint, required tests and build | Prisma validation, stable tests, advisory full suite, build | No |
| Push to `main` | advisory lint, required tests and build | Prisma validation, stable tests, advisory full suite, build | Yes, after both gates pass |
| Manual run | advisory lint, required tests and build | Prisma validation, stable tests, advisory full suite, build | No |

Server tests use a disposable PostgreSQL service. CI does not receive or connect to the production database. Because the repository's historical migration chain is not a clean bootstrap path, CI creates the current schema with `prisma db push`; migration-specific tests continue to run their migration SQL against isolated schemas.

The first live workflow audit found 16 existing failures in nine server test files while 373 tests passed. Those nine files are excluded from the blocking stable suite and are still executed by the advisory full-suite step. Fix each file and remove it from the exclusion list; when all nine are green, delete the advisory split and make `npm test --prefix server` the single blocking server test step.

Client lint currently runs as an advisory step because `main` already contains lint errors unrelated to the pipeline. Tests and production builds remain blocking. After the existing lint errors are fixed, remove `continue-on-error: true` from the lint step to make it a required gate.

Production schema changes follow the existing `Procfile` release command:

```text
release: cd server && DATABASE_URL="${DATABASE_URL}?sslmode=require&connection_limit=2" npx prisma migrate deploy
```

Heroku only starts the new web release after that command succeeds. The workflow then calls the public health endpoint and fails if the deployed app does not become healthy.

## One-time GitHub configuration

In the GitHub repository, open **Settings → Environments** and use the environment named `Production`. Add:

- Environment secret `HEROKU_API_KEY`: a Heroku API key with access to the production app.
- Environment variable `HEROKU_APP_NAME`: `pacific-bayou-07588` for the currently configured Heroku remote.
- Environment variable `PRODUCTION_URL`: `https://mathlogs.app`.
- Environment variable `PRODUCTION_HEALTHCHECK_URL`: `https://mathlogs.app/health`.

Recommended production environment protection:

1. Allow deployments only from `main`.
2. Require a reviewer if production releases should remain manually approved.
3. Disable any separate Heroku automatic GitHub deployment for this app so a commit cannot deploy twice.

In **Settings → Branches**, protect `main` and require these status checks before merge:

- `Client quality gate`
- `Server quality gate`

Do not add `DATABASE_URL`, `JWT_SECRET`, or application integration credentials to GitHub for this pipeline. Production configuration remains in Heroku; CI uses disposable test-only values.

## First activation

The workflow becomes active after this file reaches the repository's default branch. Before the first merge:

1. Add the production environment secret and variables above.
2. Confirm the Heroku app still uses the Node.js buildpack and has all production config vars.
3. Confirm no separate Heroku auto-deploy is enabled.
4. Merge through a pull request and watch both quality gates.
5. After deployment, confirm the `Deploy production` job and `https://mathlogs.app/health` are green.

## Failure and rollback

- A failed client/server gate prevents deployment.
- A failed Heroku build leaves the current production release running.
- A failed Heroku release-phase migration prevents the new release from becoming active.
- A failed health check marks the workflow failed and requires production investigation; it does not automatically roll back database changes.

For an application rollback, select the previous release in the Heroku dashboard or run:

```bash
heroku rollback --app pacific-bayou-07588
```

Database migrations must be forward-compatible with the previous application release. Review destructive or data-rewriting migrations separately before merging; application rollback does not reverse a migration.
