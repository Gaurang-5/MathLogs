import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureStickerFrame, extractMarksFromSticker, stickerFrameBlob } from './ocr';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); localStorage.clear(); });

describe('original sticker photo', () => {
  it('captures the entire native frame and encodes PNG without a resize or quality override', async () => {
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    const blob = new Blob(['original pixels'], { type: 'image/png' });
    const encode = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(blob));
    const video = { readyState: 2, videoWidth: 1920, videoHeight: 1080 } as HTMLVideoElement;
    const frame = captureStickerFrame(video);
    expect([frame.width, frame.height]).toEqual([1920, 1080]);
    expect(drawImage.mock.calls).toEqual([[video, 0, 0]]);
    expect(await stickerFrameBlob(frame)).toBe(blob);
    expect(encode).toHaveBeenCalledWith(expect.any(Function), 'image/png');
  });

  it.each(['0', '7.5', '45/50', 'ERROR_UNCERTAIN'])( 'uploads unchanged image bytes and handles score %s', async score => {
    localStorage.setItem('token', 'test-token');
    const image = new Blob(['original-image-bytes'], { type: 'image/png' });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ score, status: 'read' }) });
    vi.stubGlobal('fetch', fetchMock);
    const result = await extractMarksFromSticker(image, undefined, 'authorized-test');
    const form = fetchMock.mock.calls[0][1].body as FormData;
    expect(form.get('testId')).toBe('authorized-test');
    const uploaded = form.get('image') as File;
    const read = (blob: Blob) => new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsText(blob); });
    expect(await read(uploaded)).toBe(await read(image));
    expect(uploaded.type).toBe('image/png');
    expect(result.score).toBe(score === 'ERROR_UNCERTAIN' ? '' : score.split('/')[0]);
  });
});

it('bounds a stalled upload and aborts the underlying request', async () => {
  vi.useFakeTimers();
  localStorage.setItem('token', 'test-token');
  const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
  vi.stubGlobal('fetch', fetchMock);
  const result = extractMarksFromSticker(new Blob(['photo'])).catch(error => error.message);
  await vi.advanceTimersByTimeAsync(18001);
  expect(await result).toContain('timed out');
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
});

it('aborts an upload when capture is cancelled', async () => {
  localStorage.setItem('token', 'test-token');
  const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
  vi.stubGlobal('fetch', fetchMock);
  const controller = new AbortController();
  const result = extractMarksFromSticker(new Blob(['photo']), controller.signal).catch(error => error.name);
  controller.abort();
  expect(await result).toBe('AbortError');
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
});


it.each(['timeout', 'provider_error'])('reports provider %s separately from unclear handwriting', async reason => {
  localStorage.setItem('token', 'test-token');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ score: 'ERROR_UNCERTAIN', reason }) }));
  await expect(extractMarksFromSticker(new Blob(['photo']))).rejects.toThrow(reason === 'timeout' ? 'timed out' : 'unavailable');
});
