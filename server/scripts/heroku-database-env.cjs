// Run inside Node, never in the Procfile: Heroku expands Procfile variables into logs.
// Keep the existing TLS requirement and the release task's two-connection limit.
try {
    const database = new URL(process.env.DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(database.protocol) || !database.hostname) {
        throw new Error('Invalid database configuration');
    }
    database.searchParams.set('sslmode', 'require');
    if (process.env.MATHLOGS_RELEASE === '1') {
        database.searchParams.set('connection_limit', '2');
    }
    process.env.DATABASE_URL = database.toString();
} catch {
    // URL parsing errors can contain the input, so never print the original error.
    console.error('Database configuration is missing or invalid. Check DATABASE_URL.');
    process.exit(1);
}
