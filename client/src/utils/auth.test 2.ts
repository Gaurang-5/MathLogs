import { describe, expect, it } from 'vitest';
import { readTokenPayload } from './auth';

function createToken(payload: object): string {
    const encodedPayload = btoa(JSON.stringify(payload));
    return `header.${encodedPayload}.signature`;
}

describe('readTokenPayload', () => {
    it('parses a valid JWT payload', () => {
        expect(readTokenPayload(createToken({ role: 'SUPER_ADMIN' }))).toEqual({ role: 'SUPER_ADMIN' });
    });

    it('returns null for malformed tokens', () => {
        expect(readTokenPayload('not-a-jwt')).toBeNull();
        expect(readTokenPayload('header.invalid.signature')).toBeNull();
        expect(readTokenPayload(null)).toBeNull();
    });
});
