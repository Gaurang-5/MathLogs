import { decodeStickerQR } from './stickerQR';
import { scanDeadline } from './scanDeadline';
import { API_URL } from './api';

export interface OCRResult {
    score: string;
    status: 'read' | 'needs_review';
}

/** Capture the entire camera frame at its native resolution, losslessly. */
export function captureStickerFrame(video: HTMLVideoElement): HTMLCanvasElement {
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
        throw new Error('Camera is not ready. Please try again.');
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not capture the camera image.');
    context.drawImage(video, 0, 0);
    return canvas;
}

/** QR decoding reads a copy of the captured pixels; it never alters the OCR image. */
export function readStudentQR(canvas: HTMLCanvasElement, signal?: AbortSignal): Promise<string> {
    return decodeStickerQR(canvas, signal);
}

export function stickerFrameBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return scanDeadline(new Promise<Blob>((resolve, reject) => canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('Could not capture the camera image.')),
        'image/png',
    )), 6000, 'Camera capture stalled. Try Use phone camera.');
}

/** Upload the original captured bytes, without crops, filters, warping, or recompression. */
export async function extractMarksFromSticker(image: Blob, signal?: AbortSignal, testId?: string): Promise<OCRResult> {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('Authentication required for scanning');
    const formData = new FormData();
    if (testId) formData.append('testId', testId);
    formData.append('image', image, image.type === 'image/jpeg' ? 'sticker.jpg' : image.type === 'image/webp' ? 'sticker.webp' : 'sticker.png');
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    try {
        const response = await scanDeadline(fetch(`${API_URL}/scan-ocr`, {
            method: 'POST', body: formData, signal: controller.signal,
            headers: { Authorization: `Bearer ${token}` },
        }), 28000, 'Reading marks timed out. Enter the marks manually or retry.', signal);
        if (!response.ok) {
            throw new Error(response.status === 401 ? 'Your session expired. Sign in again to read marks.' : response.status === 413
                ? 'Photo is too large to upload. Please enter the marks manually.'
                : 'Could not read marks. Please retry or enter them manually.');
        }
        const data = await scanDeadline(response.json(), 2000, 'The marks response stalled. Enter the marks manually.', signal);
        if (data.reason === 'timeout') throw new Error('The marks reader timed out. Enter the marks manually or retry.');
        if (data.reason === 'provider_error') throw new Error('The marks reader is unavailable. Enter the marks manually or retry.');
        // A fraction is the obtained score followed by the total, never their concatenation.
        const raw = String(data.score ?? '');
        const valid = /^\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?$/.test(raw);
        return { score: valid ? raw.split('/')[0] : '', status: valid ? 'read' : 'needs_review' };
    } finally {
        controller.abort();
        signal?.removeEventListener('abort', abort);
    }
}

/** Decode only for QR lookup; upload the original File separately, untouched. */
export async function readStudentQRFromPhoto(photo: File, signal?: AbortSignal): Promise<string> {
    const url = URL.createObjectURL(photo);
    try {
        const image = new Image();
        image.src = url;
        await scanDeadline(image.decode(), 6000, 'Photo could not be opened. Select the student manually.', signal);
        return await decodeStickerQR(image, signal);
    } finally { URL.revokeObjectURL(url); }
}
