web: cd server && node --require ./scripts/heroku-database-env.cjs dist/index.js
release: cd server && MATHLOGS_RELEASE=1 node --require ./scripts/heroku-database-env.cjs node_modules/prisma/build/index.js migrate deploy
