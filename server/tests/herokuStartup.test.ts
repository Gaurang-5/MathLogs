import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const preload = path.resolve(__dirname, '../scripts/heroku-database-env.cjs');
const secret = 'startup-test-password';
const run = (url: string | undefined, release = false) => spawnSync(process.execPath, [
    '--require', preload, '-e', `
        const assert = require('node:assert/strict');
        const url = new URL(process.env.DATABASE_URL);
        assert.equal(url.password, '${secret}');
        assert.equal(url.searchParams.get('sslmode'), 'require');
        assert.equal(url.searchParams.getAll('sslmode').length, 1);
        assert.equal(url.searchParams.get('application_name'), 'sticker test');
        assert.equal(url.searchParams.get('connection_limit'), process.env.MATHLOGS_RELEASE === '1' ? '2' : '5');
        assert.ok(!process.argv.some(arg => arg.includes(url.password)));
        console.log('Database environment ready');
    `,
], { encoding: 'utf8', env: { PATH: process.env.PATH, DATABASE_URL: url, MATHLOGS_RELEASE: release ? '1' : '0' } });

test('Procfile never interpolates sensitive config into startup commands', () => {
    const procfile = readFileSync(path.resolve(__dirname, '../../Procfile'), 'utf8');
    assert.ok(!procfile.includes('$'));
    assert.ok(!/postgres(?:ql)?:\/\//.test(procfile));
    assert.equal((procfile.match(/--require .\/scripts\/heroku-database-env.cjs/g) || []).length, 2);
    assert.ok(procfile.includes('node_modules/prisma/build/index.js migrate deploy'));
});

for (const release of [false, true]) {
    test(`preloads database options silently for ${release ? 'release' : 'web'}`, () => {
        const result = run(`postgres://test:${secret}@localhost/example?application_name=sticker%20test&sslmode=disable&connection_limit=5`, release);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout, 'Database environment ready\n');
        assert.equal(result.stderr, '');
    });
}

for (const value of [undefined, '', `not-a-url-${secret}`, `https://test:${secret}@localhost/example`]) {
    test(`rejects invalid database configuration without printing it (${value === undefined ? 'missing' : value.length})`, () => {
        const result = run(value);
        assert.equal(result.status, 1);
        assert.equal(result.stdout, '');
        assert.equal(result.stderr, 'Database configuration is missing or invalid. Check DATABASE_URL.\n');
        assert.ok(!result.stderr.includes(secret));
    });
}
