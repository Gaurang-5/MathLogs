import { CameraView, scanFromURLAsync } from 'expo-camera';
import { Platform } from 'react-native';
import api from './api';

interface CapturedStudent {
  id: string;
  name: string;
  humanId: string | null;
  batch?: { name: string };
  marks?: Array<{ testId: string; score: number }>;
}

export function createResearchCaptureId(): string {
  const nativeUuid = (globalThis as any).crypto?.randomUUID?.();
  if (typeof nativeUuid === 'string') return nativeUuid;
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const random = Math.floor(Math.random() * 16);
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}

function deadline<T>(work: Promise<T>, ms: number, message: string, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const finish = (action: () => void) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      action();
    };
    const abort = () => finish(() => reject(new Error('Capture cancelled')));
    const timer = setTimeout(() => finish(() => reject(new Error(message))), ms);
    work.then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}

/** Take one original photo. Report identity immediately while OCR runs independently. */
export async function captureMarksSticker(camera: CameraView, testId: string, signal: AbortSignal, researchCaptureId: string, onStudent?: (student: CapturedStudent) => void) {
  const photo = await deadline(camera.takePictureAsync({ skipProcessing: true }), 15000, 'Camera capture timed out. Please restart the camera.', signal);
  if (!photo?.uri) throw new Error('Could not take a photo. Please try again.');
  if (signal.aborted) throw new Error('Capture cancelled');
  const upload = new AbortController();
  const abort = () => upload.abort();
  signal.addEventListener('abort', abort, { once: true });
  const form = new FormData();
  // React Native streams the original file. No base64 conversion, crop, or recompression.
  form.append('image', { uri: photo.uri, name: 'sticker.jpg', type: 'image/jpeg' } as unknown as Blob);
  form.append('researchCaptureId', researchCaptureId);
  form.append('captureSource', 'mobile_camera');
  form.append('clientPlatform', Platform.OS === 'ios' ? 'ios' : 'android');
  const ocrPromise = deadline(api.post('/scan-ocr', form, {
    signal: upload.signal, headers: { 'Content-Type': 'multipart/form-data' }, timeout: 18000,
  }), 20000, 'Reading marks timed out. Enter the marks manually or retry.', signal).then(response => {
    if (response.data?.reason === 'timeout') throw new Error('The marks reader timed out. Enter the marks manually or retry.');
    if (response.data?.reason === 'provider_error') throw new Error('The marks reader is unavailable. Enter the marks manually or retry.');
    const value = String(response.data?.score ?? '');
    return {
      score: /^\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?$/.test(value) ? value.split('/')[0] : '',
      error: '',
      researchCaptureId: typeof response.data?.researchCaptureId === 'string' ? response.data.researchCaptureId : researchCaptureId,
    };
  }).catch((error: Error) => ({ score: '', error: error.message || 'Could not read marks. Enter them manually.' }));

  const identityPromise = deadline(scanFromURLAsync(photo.uri, ['qr']), 8000, 'QR reading timed out. Please retake the photo.', signal).then(async codes => {
    const ids = [...new Set(codes.map(code => code.data).filter(Boolean))];
    if (ids.length !== 1) throw new Error('Keep one full sticker in view with its QR code readable, then capture again.');
    const student = (await deadline(api.get<CapturedStudent>(`/students/lookup/${encodeURIComponent(ids[0])}?testId=${encodeURIComponent(testId)}`, { signal, timeout: 15000 }), 15000, 'Student lookup timed out. Please retry.', signal)).data;
    if (!signal.aborted) onStudent?.(student);
    return student;
  });
  try {
    const [student, ocr] = await Promise.all([identityPromise, ocrPromise]);
    return { student, score: ocr.score, error: ocr.error, researchCaptureId: 'researchCaptureId' in ocr ? ocr.researchCaptureId : researchCaptureId };
  } finally {
    upload.abort();
    signal.removeEventListener('abort', abort);
  }
}
