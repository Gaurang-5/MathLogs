import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ScanMarks from './ScanMarks';

const mocks = vi.hoisted(() => ({ api: vi.fn(), capture: vi.fn(), blob: vi.fn(), qr: vi.fn(), photoQR: vi.fn(), ocr: vi.fn() }));
vi.mock('../utils/api', () => ({ apiRequest: mocks.api }));
vi.mock('../components/Layout', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('../utils/ocr', () => ({ captureStickerFrame: mocks.capture, stickerFrameBlob: mocks.blob, readStudentQR: mocks.qr, readStudentQRFromPhoto: mocks.photoQR, extractMarksFromSticker: mocks.ocr }));
let container: HTMLDivElement;
let root: Root;
const stop = vi.fn();
const getUserMedia = vi.fn();
const enumerateDevices = vi.fn();
const applyConstraints = vi.fn();
const track = { stop, addEventListener: vi.fn(), getCapabilities: () => ({ focusMode: ['continuous'] }), applyConstraints };
const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
const click = async (label: string) => {
  const button = [...document.body.querySelectorAll('button')].find(node => node.textContent?.trim() === label)!;
  expect(button).toBeTruthy();
  await act(async () => button.click());
};
beforeEach(async () => {
  vi.clearAllMocks();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(2);
  vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(1920);
  vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(1080);
  getUserMedia.mockResolvedValue(stream);
  enumerateDevices.mockResolvedValue([{ kind: 'videoinput', deviceId: 'wide', label: 'Rear camera' }, { kind: 'videoinput', deviceId: 'ultra', label: 'Ultra-wide camera' }]);
  applyConstraints.mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia, enumerateDevices } });
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.stubGlobal('URL', { createObjectURL: vi.fn().mockReturnValue('blob:photo'), revokeObjectURL: vi.fn() });
  mocks.api.mockImplementation(async (path: string) => path === '/tests'
    ? [{ id: 'test', className: '10', maxMarks: 100 }]
    : { id: 'student', name: 'Aarav', batch: { className: '10' }, marks: [] });
  mocks.capture.mockReturnValue({});
  mocks.blob.mockResolvedValue(new Blob(['photo']));
  mocks.qr.mockReturnValue('student-qr');
  mocks.photoQR.mockResolvedValue('student-qr');
  mocks.ocr.mockResolvedValue({ score: '0', status: 'read' });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<MemoryRouter initialEntries={['/scan?testId=test']}><ScanMarks /></MemoryRouter>));
  await click('📷 Start Camera');
  await act(async () => document.body.querySelector('video')!.dispatchEvent(new Event('loadeddata')));
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('never scans automatically, captures once on click, accepts zero and saves only after review', async () => {
  expect(mocks.capture).not.toHaveBeenCalled();
  expect(mocks.ocr).not.toHaveBeenCalled();
  await click('Capture');
  expect(mocks.capture).toHaveBeenCalledTimes(1);
  expect(mocks.ocr).toHaveBeenCalledTimes(1);
  expect(document.body.querySelector<HTMLInputElement>('input:not([type="file"])')?.value).toBe('0');
  expect(mocks.api).not.toHaveBeenCalledWith('/marks', expect.anything(), expect.anything());
  await click('Save');
  expect(mocks.api).toHaveBeenCalledWith('/marks', 'POST', { testId: 'test', studentId: 'student', score: '0', expectedScore: null });
  expect(mocks.capture).toHaveBeenCalledTimes(1);
  expect(document.body.querySelector('video')).not.toBeNull();
  expect(getUserMedia).toHaveBeenCalledTimes(1);
  expect(stop).not.toHaveBeenCalled();
});

it('locks repeated capture clicks and discards OCR results after cancellation', async () => {
  let finish!: (value: { score: string; status: 'read' | 'needs_review' }) => void;
  mocks.ocr.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  await click('Capture');
  const capture = [...document.body.querySelectorAll('button')].find(button => button.textContent?.includes('Reading marks'))!;
  await act(async () => capture.click());
  expect(mocks.capture).toHaveBeenCalledTimes(1);
  await click('Retake');
  await act(async () => finish({ score: '42', status: 'read' }));
  expect(document.body.querySelector<HTMLInputElement>('input:not([type="file"])')).toBeNull();
  expect(stop).not.toHaveBeenCalled();
});

it('starts QR decoding and marks OCR concurrently before either one finishes', async () => {
  let finishQR!: (value: string) => void;
  let finishOCR!: (value: { score: string; status: string }) => void;
  mocks.qr.mockReturnValueOnce(new Promise(resolve => { finishQR = resolve; }));
  mocks.ocr.mockReturnValueOnce(new Promise(resolve => { finishOCR = resolve; }));
  await click('Capture');
  expect(mocks.qr).toHaveBeenCalledTimes(1);
  expect(mocks.ocr).toHaveBeenCalledTimes(1);
  expect(mocks.api.mock.calls.some(([path]) => path.startsWith('/students/lookup'))).toBe(false);
  await act(async () => finishOCR({ score: '72', status: 'read' }));
  await act(async () => finishQR('IS-MTH26-001'));
  expect(document.body.querySelector<HTMLInputElement>('input[aria-label="Obtained marks"]')?.value).toBe('72');
});

it('allows retaking a photo when the QR cannot be read', async () => {
  mocks.qr.mockImplementationOnce(() => { throw new Error('QR code not readable'); });
  await click('Capture');
  expect(document.body.textContent).toContain('QR code not readable');
  expect(document.body.textContent).toContain('Marks read: 0');
  expect(document.body.querySelector('img[alt="Photo kept for marks review"]')).not.toBeNull();
  await click('Retake photo');
  await click('Capture');
  expect(document.body.querySelector<HTMLInputElement>('input:not([type="file"])')?.value).toBe('0');
});

it('shows a blank field for uncertain OCR rather than retaining a previous score', async () => {
  mocks.ocr.mockResolvedValue({ score: '', status: 'needs_review' });
  await click('Capture');
  expect(document.body.querySelector<HTMLInputElement>('input:not([type="file"])')?.value).toBe('');
});


it('retakes and saves without reopening the camera', async () => {
  const video = document.body.querySelector('video');
  await click('Capture');
  expect(document.body.textContent).toContain('Read successfully');
  await click('Retake');
  expect(document.body.querySelector('video')).toBe(video);
  await click('Capture');
  expect(getUserMedia).toHaveBeenCalledTimes(1);
  expect(stop).not.toHaveBeenCalled();
});

it('releases the camera in the background and reopens when visible', async () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  expect(stop).toHaveBeenCalledTimes(1);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  expect(getUserMedia).toHaveBeenCalledTimes(2);
});

it('selects a lens by its actual device ID and requests supported continuous autofocus', async () => {
  expect(applyConstraints).toHaveBeenCalledWith({ advanced: [{ focusMode: 'continuous' }] });
  const select = document.body.querySelector('select')!;
  await act(async () => { select.value = 'ultra'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(stop).toHaveBeenCalledTimes(1);
  expect(getUserMedia.mock.calls[1][0].video.deviceId).toEqual({ exact: 'ultra' });
});

it('restarts a stuck camera only when requested', async () => {
  await click('Restart camera');
  expect(stop).toHaveBeenCalledTimes(1);
  expect(getUserMedia).toHaveBeenCalledTimes(2);
  expect(mocks.ocr).not.toHaveBeenCalled();
});

it('sends the original phone-camera file to OCR and reads QR from that same file', async () => {
  const file = new File(['unaltered original camera photo'], 'photo.jpg', { type: 'image/jpeg' });
  const input = document.body.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { value: [file] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(mocks.ocr).toHaveBeenCalledWith(file, expect.any(AbortSignal), 'test');
  expect(mocks.photoQR).toHaveBeenCalledWith(file, expect.any(AbortSignal));
  expect(mocks.capture).not.toHaveBeenCalled();
  expect(document.body.querySelector<HTMLInputElement>('input:not([type="file"])')?.value).toBe('0');
});

it('captures a real ready frame without needing the loadeddata event', async () => {
  await click('Restart camera');
  await click('Capture');
  expect(mocks.capture).toHaveBeenCalledTimes(1);
  expect(document.body.querySelector<HTMLInputElement>('input[aria-label="Obtained marks"]')?.value).toBe('0');
});

it('explains an unready capture instead of silently disabling the button', async () => {
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(0);
  await click('Restart camera');
  await click('Capture');
  expect(document.body.querySelector('[role="alert"]')?.textContent).toContain('Camera is starting');
  expect(mocks.capture).not.toHaveBeenCalled();
});

it('keeps the photo and marks when QR fails and requires choosing a student before save', async () => {
  mocks.qr.mockRejectedValueOnce(new Error('QR not readable'));
  mocks.api.mockImplementation(async (path: string) => path.startsWith('/students/search')
    ? [{ id: 'student', humanId: 'AB123', name: 'Aarav', batch: { name: '10 A' } }]
    : { id: 'student', humanId: 'AB123', name: 'Aarav', batch: { className: '10' }, marks: [] });
  await click('Capture');
  expect(document.body.querySelector<HTMLInputElement>('input[aria-label="Obtained marks"]')).toBeNull();
  const input = document.getElementById('sticker-student-search') as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Aarav');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click('Search students');
  await click('Aarav · AB123 · 10 A');
  expect(document.body.querySelector<HTMLInputElement>('input[aria-label="Obtained marks"]')?.value).toBe('0');
  expect(mocks.api).toHaveBeenCalledWith('/students/lookup/AB123?testId=test', 'GET', undefined, { timeoutMs: 15000 });
  expect(mocks.api.mock.calls.some(([path]) => path === '/marks')).toBe(false);
});

it('exits a stalled OCR operation into manual entry and ignores its late result', async () => {
  vi.useFakeTimers();
  let finish!: (value: {score: string; status: string}) => void;
  mocks.ocr.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  await click('Capture');
  await act(async () => { await vi.advanceTimersByTimeAsync(30001); });
  expect(document.body.textContent).toContain('Reading marks timed out');
  expect(document.body.querySelector<HTMLInputElement>('input[aria-label="Obtained marks"]')?.value).toBe('');
  await act(async () => finish({ score: '91', status: 'read' }));
  expect(document.body.querySelector<HTMLInputElement>('input[aria-label="Obtained marks"]')?.value).toBe('');
});

it('stops a camera whose permission request finishes after the scanner is closed', async () => {
  let finish!: (value: typeof stream) => void;
  getUserMedia.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  await click('Restart camera');
  const lateStop = vi.fn();
  const lateTrack = { ...track, stop: lateStop };
  await click('Cancel Scan');
  await act(async () => finish({ getTracks: () => [lateTrack], getVideoTracks: () => [lateTrack] }));
  expect(lateStop).toHaveBeenCalledTimes(1);
  expect(document.body.querySelector('video')).toBeNull();
});

it('keeps scanning available when a browser rejects optional focus constraints', async () => {
  applyConstraints.mockRejectedValueOnce(new Error('Focus control unsupported'));
  await click('Restart camera');
  await act(async () => document.body.querySelector('video')!.dispatchEvent(new Event('loadeddata')));
  await click('Capture');
  expect(document.body.querySelector<HTMLInputElement>('input:not([type="file"])')?.value).toBe('0');
});


it('shows the identified student before OCR finishes and preserves a manual mark', async () => {
  let finish!: (value: {score: string; status: string}) => void;
  mocks.ocr.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  await click('Capture');
  expect(document.body.textContent).toContain('Aarav');
  expect(document.body.textContent).toContain('You can enter them now');
  const input = document.querySelector<HTMLInputElement>('input[aria-label="Obtained marks"]')!;
  expect(input.value).toBe('');
  expect([...document.querySelectorAll('button')].find(b => b.textContent === 'Save')?.disabled).toBe(true);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '4');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(mocks.ocr.mock.calls[0][1].aborted).toBe(true);
  await act(async () => finish({ score: '9', status: 'read' }));
  expect(input.value).toBe('4');
  await click('Save');
  expect(mocks.api).toHaveBeenCalledWith('/marks', 'POST', { testId: 'test', studentId: 'student', score: '4', expectedScore: null });
});

it('explains an out-of-range reading instead of calling it unreadable', async () => {
  mocks.ocr.mockResolvedValueOnce({ score: '101', status: 'read' });
  await click('Capture');
  expect(document.body.textContent).toContain("Read 101, which exceeds this test's maximum of 100");
  expect(document.querySelector<HTMLInputElement>('input[aria-label="Obtained marks"]')?.value).toBe('');
});

it('uses server eligibility for a shared test spanning different classes', async () => {
  mocks.api.mockResolvedValueOnce({ id: 'student', name: 'Aarav', batch: { className: '9' }, testEligible: true, marks: [] });
  await click('Capture');
  expect(document.body.querySelector<HTMLInputElement>('input[aria-label="Obtained marks"]')?.value).toBe('0');
  expect(document.getElementById('sticker-student-search')).toBeNull();
});

it('preserves the reviewed previous score when explicitly overwriting an existing mark', async () => {
  mocks.api.mockResolvedValueOnce({ id: 'student', name: 'Aarav', batch: { className: '10' }, marks: [{ testId: 'test', score: 12 }] });
  await click('Capture');
  await click('Overwrite');
  await click('Save');
  expect(mocks.api).toHaveBeenCalledWith('/marks', 'POST', { testId: 'test', studentId: 'student', score: '0', expectedScore: 12 });
});

it('resumes the web camera when the native photo picker is cancelled', async () => {
  await click('Use phone camera');
  expect(stop).toHaveBeenCalled();
  await act(async () => document.querySelector('input[type="file"]')!.dispatchEvent(new Event('cancel')));
  expect(getUserMedia).toHaveBeenCalledTimes(2);
});
