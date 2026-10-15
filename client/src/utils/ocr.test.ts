import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractPhotoMarks } from './multiSticker';
import { captureStickerFrame, extractMarksFromSticker, stickerFrameBlob, prepareOCRUpload } from './ocr';

class FakeXHR {
  static last: FakeXHR;
  upload = { onprogress: null as ((event: { loaded: number; total: number; lengthComputable: boolean }) => void) | null, onload: null as (() => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 200;
  responseText = '';
  body!: FormData;
  aborted = false;
  open = vi.fn();
  setRequestHeader = vi.fn();
  constructor() { FakeXHR.last = this; }
  send(body: FormData) { this.body = body; }
  abort() { this.aborted = true; this.onabort?.(); }
  respond(data: unknown, status = 200) { this.status = status; this.responseText = JSON.stringify(data); this.onload?.(); }
}
const start = async (signal?: AbortSignal, progress?: (value: unknown) => void) => {
  localStorage.setItem('token', 'test-token');
  vi.stubGlobal('XMLHttpRequest', FakeXHR);
  const promise = extractMarksFromSticker(new Blob(['original-image-bytes'], { type: 'image/png' }), signal, 'authorized-test', progress);
  await Promise.resolve();
  return { promise, xhr: FakeXHR.last };
};

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
    const image = new Blob(['original-image-bytes'], { type: 'image/png' });
    const { promise, xhr } = await start();
    xhr.upload.onload?.();
    xhr.respond({ score, status: 'read' });
    const result = await promise;
    const form = xhr.body;
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
  const { promise, xhr } = await start();
  const result = promise.catch(error => error.message);
  await vi.advanceTimersByTimeAsync(25001);
  expect(await result).toContain('upload stalled');
  expect(xhr.aborted).toBe(true);
});

it('gives OCR its own deadline after an upload exceeding the old 30 second limit', async () => {
  vi.useFakeTimers();
  const progress = vi.fn();
  const { promise, xhr } = await start(undefined, progress);
  for (let i = 1; i <= 4; i++) {
    await vi.advanceTimersByTimeAsync(10000);
    xhr.upload.onprogress?.({ loaded: i, total: 4, lengthComputable: true });
  }
  xhr.upload.onload?.();
  await vi.advanceTimersByTimeAsync(22000);
  expect(xhr.aborted).toBe(false);
  xhr.respond({ score: '4' });
  expect(await promise).toEqual({ score: '4', status: 'read' });
  expect(progress.mock.calls.map(([p]) => p.stage)).toEqual(['preparing', 'uploading', 'uploading', 'uploading', 'uploading', 'uploading', 'reading']);
});

it('bounds the reading stage independently', async () => {
  vi.useFakeTimers();
  const { promise, xhr } = await start();
  const result = promise.catch(error => error.message);
  xhr.upload.onload?.();
  await vi.advanceTimersByTimeAsync(28001);
  expect(await result).toContain('reader timed out');
  expect(xhr.aborted).toBe(true);
});

it('caps uploads even when they keep making progress', async () => {
  vi.useFakeTimers();
  const { promise, xhr } = await start();
  const result = promise.catch(error => error.message);
  for (let i = 0; i < 9; i++) {
    await vi.advanceTimersByTimeAsync(10000);
    xhr.upload.onprogress?.({ loaded: i, total: 100, lengthComputable: true });
  }
  expect(await result).toContain('upload took too long');
  expect(xhr.aborted).toBe(true);
});

it('aborts an upload when capture is cancelled', async () => {
  const controller = new AbortController();
  const { promise, xhr } = await start(controller.signal);
  const result = promise.catch(error => error.name);
  controller.abort();
  expect(await result).toBe('AbortError');
  expect(xhr.aborted).toBe(true);
});

it.each(['timeout', 'provider_error'])('reports provider %s separately from unclear handwriting', async reason => {
  const { promise, xhr } = await start();
  xhr.respond({ score: 'ERROR_UNCERTAIN', reason });
  await expect(promise).rejects.toThrow(reason === 'timeout' ? 'timed out' : 'unavailable');
});

it.each([[401, 'session expired'], [413, 'too large'], [503, 'Could not read']])('handles HTTP %s without inventing a mark', async (status, message) => {
  const { promise, xhr } = await start();
  xhr.respond({}, Number(status));
  await expect(promise).rejects.toThrow(String(message));
});

it('optimizes a large photo without cropping and keeps already-small originals', async () => {
  const large = new Blob([new Uint8Array(600000)], { type: 'image/png' });
  const jpeg = new Blob(['jpeg'], { type: 'image/jpeg' });
  const drawImage = vi.fn();
  vi.stubGlobal('Image', class { naturalWidth = 4032; naturalHeight = 3024; src = ''; decode = async () => {}; });
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:photo'), revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage, fillRect: vi.fn() } as unknown as CanvasRenderingContext2D);
  const encode = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(jpeg));
  expect(await prepareOCRUpload(large)).toBe(jpeg);
  expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 3200, 2400);
  expect(encode).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.9);
  expect(await prepareOCRUpload(jpeg)).toBe(jpeg);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo');
});

it('cancels preparation without starting an upload and releases the preview URL', async () => {
  localStorage.setItem('token', 'test-token');
  vi.stubGlobal('XMLHttpRequest', vi.fn());
  vi.stubGlobal('Image', class { src = ''; decode = () => new Promise<void>(() => {}); });
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:photo'), revokeObjectURL: vi.fn() });
  const controller = new AbortController();
  const result = extractMarksFromSticker(new Blob([new Uint8Array(600000)]), controller.signal);
  controller.abort();
  await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  expect(XMLHttpRequest).not.toHaveBeenCalled();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo');
});

it('multi-photo upload retains progress and a separate OCR budget after a slow upload', async () => {
 vi.useFakeTimers();localStorage.setItem('token','fixture');vi.stubGlobal('XMLHttpRequest',FakeXHR);
 const progress=vi.fn();const result=extractPhotoMarks(new Blob(['photo']),'test',undefined,progress);await Promise.resolve();
 const xhr=FakeXHR.last;expect(xhr.body.get('mode')).toBe('multiple');expect(xhr.body.get('testId')).toBe('test');
 for(let i=1;i<=4;i++){await vi.advanceTimersByTimeAsync(10000);xhr.upload.onprogress?.({loaded:i,total:4,lengthComputable:true});}
 xhr.upload.onload?.();await vi.advanceTimersByTimeAsync(30000);expect(xhr.aborted).toBe(false);
 xhr.respond({stickers:[{x:100,y:200,score:'0'}]});expect(await result).toEqual([{x:100,y:200,score:'0'}]);
 expect(progress).toHaveBeenLastCalledWith({stage:'reading'});
});
