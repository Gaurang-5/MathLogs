import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';
import { prisma } from '../src/prisma';

let server: Server;
let baseUrl: string;
const restores: Array<() => void> = [];

function replaceMethod<T extends object, K extends keyof T>(target: T, key: K, replacement: T[K]) {
    const original = target[key];
    target[key] = replacement;
    restores.push(() => {
        target[key] = original;
    });
}

before(async () => {
    const { app } = await import('../src/index');

    await new Promise<void>((resolve) => {
        server = app.listen(0, () => resolve());
    });

    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
    await new Promise<void>((resolve, reject) => {
        server.close((error) => {
            if (error) reject(error);
            else resolve();
        });
    });

    while (restores.length > 0) {
        restores.pop()?.();
    }
});

test('GET /api/stats/class-average returns correct class average marks percentage', async () => {
    replaceMethod(jwt, 'verify', (((token: string, secret: string, callback: (error: unknown, decoded?: unknown) => void) => {
        callback(null, {
            id: 'teacher-1',
            username: 'owner',
            passwordVersion: 1,
            instituteId: 'inst-1',
            role: 'ADMIN',
        });
    }) as unknown) as typeof jwt.verify);

    replaceMethod(prisma.admin, 'findUnique', (async () => ({
        id: 'teacher-1',
        username: 'owner',
        passwordVersion: 1,
        instituteId: 'inst-1',
        role: 'ADMIN',
        institute: {
            planExpiryDate: null,
            plan: 'ACTIVE',
        },
    }) as never) as typeof prisma.admin.findUnique);

    replaceMethod(prisma.test, 'findMany', (async () => [
        {
            id: 'test-1',
            name: 'Math Test 1',
            className: 'Class 9',
            maxMarks: 50,
            marks: [
                { id: 'm-1', score: 40 },
                { id: 'm-2', score: 35 }
            ]
        },
        {
            id: 'test-2',
            name: 'Math Test 2',
            className: 'Class 10',
            maxMarks: 100,
            marks: [
                { id: 'm-3', score: 90 },
                { id: 'm-4', score: 70 }
            ]
        }
    ] as never) as typeof prisma.test.findMany);

    const response = await fetch(`${baseUrl}/api/stats/class-average`, {
        headers: {
            Authorization: 'Bearer valid-token',
        }
    });

    assert.equal(response.status, 200);

    const json = await response.json() as Array<{ name: string; average: number }>;

    assert.deepEqual(json, [
        { name: 'Class 9', average: 75 },
        { name: 'Class 10', average: 80 }
    ]);
});
