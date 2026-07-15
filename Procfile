web: cd server && DATABASE_URL="${DATABASE_URL}?sslmode=require" npm start
release: cd server && DATABASE_URL="${DATABASE_URL}?sslmode=require&connection_limit=2" npx prisma migrate deploy
