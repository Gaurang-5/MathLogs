import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ prepare: vi.fn(), read: vi.fn(), jsqr: vi.fn() }));
vi.mock('zxing-wasm/reader', () => ({ prepareZXingModule: mocks.prepare, readBarcodes: mocks.read }));
vi.mock('jsqr', () => ({ default: mocks.jsqr }));
const worker = { postMessage: vi.fn(), onmessage: undefined as undefined | ((event: MessageEvent) => Promise<void>) };
beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks(); vi.stubGlobal('self', worker);
    mocks.prepare.mockResolvedValue({}); mocks.read.mockResolvedValue([]); mocks.jsqr.mockReturnValue(null);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const scan = async () => {
    await import('./stickerQR.worker');
    await worker.onmessage!({ data: { pixels: new Uint8ClampedArray(16), width: 2, height: 2 } } as MessageEvent);
};

it('uses the local decoder and returns a checksum-valid QR', async () => {
    mocks.read.mockResolvedValue([{ isValid: true, text: ' DEMO-SCAN-001 ' }]);
    await scan();
    expect(worker.postMessage).toHaveBeenCalledWith({ data: 'DEMO-SCAN-001' });
    expect(mocks.jsqr).not.toHaveBeenCalled();
    const locate = mocks.prepare.mock.calls[0][0].overrides.locateFile;
    expect(locate()).not.toMatch(/^https?:/);
});
it('tries JavaScript when the first decoder cannot read the image', async () => {
    mocks.jsqr.mockReturnValue({ data: 'DEMO-SCAN-001' });
    await scan();
    expect(worker.postMessage).toHaveBeenCalledWith({ data: 'DEMO-SCAN-001' });
});
it('retains scanning when the WebAssembly asset fails to load', async () => {
    mocks.prepare.mockRejectedValue(new Error('Blocked'));
    mocks.jsqr.mockReturnValue({ data: 'DEMO-SCAN-002' });
    await scan();
    expect(worker.postMessage).toHaveBeenCalledWith({ data: 'DEMO-SCAN-002' });
});
it('rejects multiple decoded student IDs instead of picking the first', async () => {
    mocks.read.mockResolvedValue([{ isValid: true, text: 'A' }, { isValid: true, text: 'B' }]);
    await scan();
    expect(worker.postMessage).toHaveBeenCalledWith({ error: expect.stringContaining('More than one') });
    expect(mocks.jsqr).not.toHaveBeenCalled();
});
it('ignores decoder results with invalid checksums', async () => {
    mocks.read.mockResolvedValue([{ isValid: false, text: 'wrong-student' }]);
    await scan();
    expect(worker.postMessage).toHaveBeenCalledWith({ data: null });
});
it('bounds decoder startup and falls back if loading stalls', async () => {
    vi.useFakeTimers();
    mocks.prepare.mockReturnValue(new Promise(() => {}));
    mocks.jsqr.mockReturnValue({ data: 'DEMO-SCAN-003' });
    await import('./stickerQR.worker');
    const pending = worker.onmessage!({ data: { pixels: new Uint8ClampedArray(16), width: 2, height: 2 } } as MessageEvent);
    await vi.advanceTimersByTimeAsync(2001);
    await pending;
    expect(worker.postMessage).toHaveBeenCalledWith({ data: 'DEMO-SCAN-003' });
});
