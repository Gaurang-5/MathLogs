import { beforeEach, describe, expect, it, vi } from 'vitest';
import { API_URL, apiRequest } from './api';

function jsonResponse(body: unknown, init?: ResponseInit): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        ...init,
    });
}

describe('apiRequest', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
    });

    it('attaches the auth token to requests', async () => {
        localStorage.setItem('token', 'token-123');
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ ok: true }));

        await expect(apiRequest<{ ok: boolean }>('/secure')).resolves.toEqual({ ok: true });

        expect(fetchMock).toHaveBeenCalledWith(
            `${API_URL}/secure`,
            expect.objectContaining({
                method: 'GET',
                headers: expect.objectContaining({
                    Authorization: 'Bearer token-123',
                }),
            }),
        );
    });

    it('refreshes the session and retries after a 401', async () => {
        localStorage.setItem('token', 'expired-token');
        localStorage.setItem('refreshToken', 'refresh-token');

        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse({ message: 'expired' }, { status: 401 }))
            .mockResolvedValueOnce(jsonResponse({ token: 'new-token', refreshToken: 'new-refresh-token' }))
            .mockResolvedValueOnce(jsonResponse({ ok: true }));

        await expect(apiRequest<{ ok: boolean }>('/secure')).resolves.toEqual({ ok: true });

        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            `${API_URL}/auth/refresh`,
            expect.objectContaining({
                method: 'POST',
            }),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            3,
            `${API_URL}/secure`,
            expect.objectContaining({
                method: 'GET',
                headers: expect.objectContaining({
                    Authorization: 'Bearer new-token',
                }),
            }),
        );
        expect(localStorage.getItem('token')).toBe('new-token');
        expect(localStorage.getItem('refreshToken')).toBe('new-refresh-token');
    });

    it('surfaces server validation messages', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ error: 'Invalid amount' }, { status: 400 }));

        await expect(apiRequest('/fees/pay-installment', 'POST', { amount: -1 })).rejects.toThrow('Invalid amount');
    });
});
