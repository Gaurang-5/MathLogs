/**
 * Reset FAILED WhatsApp jobs back to PENDING so the worker retries them
 * after the access token is refreshed.
 *
 * Usage: node reset_failed_whatsapp_jobs.mjs
 * Run from: server/ directory
 */
import pg from 'pg';
const { Client } = pg;

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
}

const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

await client.connect();
console.log('✅ Connected to production DB');

// Show failed jobs before reset
const { rows: failed } = await client.query(`
    SELECT COUNT(*) as count, MIN("createdAt") as oldest, MAX("createdAt") as newest
    FROM "WhatsappJob"
    WHERE status = 'FAILED'
`);
console.log(`\n📊 Failed jobs: ${failed[0].count}`);
if (parseInt(failed[0].count) === 0) {
    console.log('✅ No failed jobs to reset. Done.');
    await client.end();
    process.exit(0);
}
console.log(`   Oldest: ${failed[0].oldest}`);
console.log(`   Newest: ${failed[0].newest}`);

// Reset: put them back to PENDING with 0 attempts so they get 3 fresh tries
const { rowCount } = await client.query(`
    UPDATE "WhatsappJob"
    SET status = 'PENDING',
        attempts = 0,
        error = NULL
    WHERE status = 'FAILED'
`);

console.log(`\n✅ Reset ${rowCount} failed jobs → PENDING (0 attempts)`);
console.log('   Worker will pick them up within 5 seconds of next server tick.\n');

await client.end();
