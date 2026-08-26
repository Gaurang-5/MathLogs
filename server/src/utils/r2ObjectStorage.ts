import { AwsClient } from 'aws4fetch';

type SignedFetch = (input: Request | URL | string, init?: RequestInit) => Promise<Response>;

export type R2Config = {
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
};

export function loadR2Config(env: Record<string, string | undefined> = process.env): R2Config | null {
    const accountId = env.R2_ACCOUNT_ID?.trim();
    const accessKeyId = env.R2_ACCESS_KEY_ID?.trim();
    const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim();

    if (!accountId || !accessKeyId || !secretAccessKey) {
        if (env.NODE_ENV === 'production') {
            throw new Error('R2 object storage is not configured');
        }
        return null;
    }

    return {
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        accessKeyId,
        secretAccessKey,
    };
}

function encodeObjectKey(key: string): string {
    return key.split('/').map(encodeURIComponent).join('/');
}

export class R2ObjectStorage {
    private readonly endpoint: string;

    constructor(endpoint: string, private readonly signedFetch: SignedFetch) {
        this.endpoint = endpoint.replace(/\/+$/, '');
    }

    private objectUrl(bucket: string, key: string): string {
        return `${this.endpoint}/${encodeURIComponent(bucket)}/${encodeObjectKey(key)}`;
    }

    async putObject(input: { bucket: string; key: string; body: Buffer; contentType: string }): Promise<void> {
        const response = await this.signedFetch(this.objectUrl(input.bucket, input.key), {
            method: 'PUT',
            headers: { 'content-type': input.contentType },
            body: new Uint8Array(input.body),
        });
        if (!response.ok) {
            throw new Error(`R2 PUT failed with status ${response.status}`);
        }
    }

    async getObject(bucket: string, key: string): Promise<Buffer | null> {
        const response = await this.signedFetch(this.objectUrl(bucket, key), { method: 'GET' });
        if (response.status === 404) return null;
        if (!response.ok) {
            throw new Error(`R2 GET failed with status ${response.status}`);
        }
        return Buffer.from(await response.arrayBuffer());
    }

    async deleteObject(bucket: string, key: string): Promise<void> {
        const response = await this.signedFetch(this.objectUrl(bucket, key), { method: 'DELETE' });
        if (!response.ok && response.status !== 404) {
            throw new Error(`R2 DELETE failed with status ${response.status}`);
        }
    }
}

let storage: R2ObjectStorage | null = null;

export function getR2ObjectStorage(): R2ObjectStorage {
    if (storage) return storage;
    const config = loadR2Config();
    if (!config) throw new Error('R2 object storage is not configured');

    const client = new AwsClient({
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        service: 's3',
        region: 'auto',
        retries: 3,
    });
    storage = new R2ObjectStorage(config.endpoint, (input, init) => client.fetch(input, init));
    return storage;
}
