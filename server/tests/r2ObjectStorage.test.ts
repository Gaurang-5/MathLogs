import test from 'node:test';
import assert from 'node:assert/strict';
import { R2ObjectStorage, loadR2Config } from '../src/utils/r2ObjectStorage';

test('R2ObjectStorage writes a private object to the configured bucket and key', async () => {
    let request: Request | undefined;
    const storage = new R2ObjectStorage(
        'https://account-id.r2.cloudflarestorage.com',
        async (input, init) => {
            request = new Request(input, init);
            return new Response(null, { status: 200 });
        },
    );

    await storage.putObject({
        bucket: 'private-receipts',
        key: 'payments/institute 1/receipt.jpg',
        body: Buffer.from('receipt-bytes'),
        contentType: 'image/jpeg',
    });

    assert.ok(request);
    assert.equal(request.url, 'https://account-id.r2.cloudflarestorage.com/private-receipts/payments/institute%201/receipt.jpg');
    assert.equal(request.method, 'PUT');
    assert.equal(request.headers.get('content-type'), 'image/jpeg');
    assert.equal(Buffer.from(await request.arrayBuffer()).toString(), 'receipt-bytes');
});

test('R2ObjectStorage returns private object bytes and treats a missing key as absent', async () => {
    const responses = [
        new Response(Buffer.from('stored-image'), { status: 200 }),
        new Response(null, { status: 404 }),
    ];
    const storage = new R2ObjectStorage(
        'https://account-id.r2.cloudflarestorage.com',
        async () => responses.shift() as Response,
    );

    assert.equal((await storage.getObject('private-receipts', 'payments/one.jpg'))?.toString(), 'stored-image');
    assert.equal(await storage.getObject('private-receipts', 'payments/missing.jpg'), null);
});

test('R2ObjectStorage surfaces storage failures instead of reporting a successful upload', async () => {
    const storage = new R2ObjectStorage(
        'https://account-id.r2.cloudflarestorage.com',
        async () => new Response('denied', { status: 403 }),
    );

    await assert.rejects(
        storage.putObject({
            bucket: 'private-receipts',
            key: 'payments/one.jpg',
            body: Buffer.from('image'),
            contentType: 'image/jpeg',
        }),
        /R2 PUT failed with status 403/,
    );
});

test('loadR2Config requires Cloudflare credentials in production', () => {
    assert.throws(
        () => loadR2Config({ NODE_ENV: 'production' }),
        /R2 object storage is not configured/,
    );
});

test('loadR2Config builds the account-specific R2 endpoint without AWS settings', () => {
    assert.deepEqual(
        loadR2Config({
            NODE_ENV: 'production',
            R2_ACCOUNT_ID: 'cloudflare-account',
            R2_ACCESS_KEY_ID: 'r2-access-key',
            R2_SECRET_ACCESS_KEY: 'r2-secret',
        }),
        {
            endpoint: 'https://cloudflare-account.r2.cloudflarestorage.com',
            accessKeyId: 'r2-access-key',
            secretAccessKey: 'r2-secret',
        },
    );
});
