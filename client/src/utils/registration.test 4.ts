import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCachedRegistration } from './registration';

describe('getCachedRegistration', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it('returns cached registration for standard mode', () => {
        localStorage.setItem('registered_batch_batch-1', JSON.stringify({ name: 'Aarav', humanId: 'MTH26001' }));

        expect(getCachedRegistration('batch-1', 'standard')).toEqual({ name: 'Aarav', humanId: 'MTH26001' });
    });

    it('skips cache lookup for kiosk mode or missing batch id', () => {
        localStorage.setItem('registered_batch_batch-1', JSON.stringify({ name: 'Aarav' }));

        expect(getCachedRegistration('batch-1', 'kiosk')).toBeNull();
        expect(getCachedRegistration(undefined, 'standard')).toBeNull();
    });

    it('returns null for invalid cached JSON', () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        localStorage.setItem('registered_batch_batch-1', '{invalid');

        expect(getCachedRegistration('batch-1', 'standard')).toBeNull();
        expect(consoleErrorSpy).toHaveBeenCalled();
    });
});
