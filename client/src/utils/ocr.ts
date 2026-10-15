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

export type OCRProgress = { stage: 'preparing' | 'uploading' | 'receiving' | 'reading'; percent?: number };

/** Keep the full photo; make only the OCR upload smaller. QR and review use the original. */
export async function prepareOCRUpload(original: Blob, signal?: AbortSignal): Promise<Blob> {
    if (signal?.aborted) throw new DOMException('Capture cancelled', 'AbortError');
    // Already-small photos gain little from another lossy encoding.
    if (original.size <= 350 * 1024) return original;
    const url = URL.createObjectURL(original);
    const photo = new Image();
    try {
        photo.src = url;
        await scanDeadline(photo.decode(), 8000, 'Photo preparation stalled. Try another photo.', signal);
        const scale = Math.min(1, 3200 / Math.max(photo.naturalWidth, photo.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(photo.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(photo.naturalHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) return original;
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(photo, 0, 0, canvas.width, canvas.height);
        const jpeg = await scanDeadline(new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9)),
            8000, 'Photo preparation stalled. Try another photo.', signal);
        return jpeg && jpeg.size < original.size ? jpeg : original;
    } finally {
        photo.src = '';
        URL.revokeObjectURL(url);
    }
}

/** Separate upload time from the server's OCR allowance, including on slow mobile connections. */
export async function uploadStickerPhoto<T>(image: Blob, signal?: AbortSignal, testId?: string,
    onProgress?: (progress: OCRProgress) => void, mode: 'single' | 'multiple' = 'single'): Promise<T> {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('Authentication required for scanning');
    onProgress?.({ stage: 'preparing' });
    const upload = await prepareOCRUpload(image, signal);
    if (upload.size > 14 * 1024 * 1024) throw new Error('Photo is too large to upload. Please enter the marks manually.');
    const formData = new FormData();
    if (testId) formData.append('testId', testId);
    if (mode === 'multiple') { formData.append('mode', mode); formData.append('progress', '1'); }
    formData.append('image', upload, upload.type === 'image/jpeg' ? 'sticker.jpg' : upload.type === 'image/webp' ? 'sticker.webp' : 'sticker.png');
    return new Promise<T>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        let settled = false;
        let reading = false;
        let uploaded = false;
        let stageTimer: ReturnType<typeof setTimeout>;
        let stallTimer: ReturnType<typeof setTimeout>;
        const finish = (error?: Error, result?: T) => {
            if (settled) return;
            settled = true;
            clearTimeout(stageTimer);
            clearTimeout(stallTimer);
            signal?.removeEventListener('abort', abort);
            if (error) { xhr.abort(); reject(error); }
            else resolve(result!);
        };
        const abort = () => finish(new DOMException('Capture cancelled', 'AbortError'));
        const uploadStalled = () => finish(new Error('Photo upload stalled. Check your connection and retry, or enter marks manually.'));
        const resetStall = () => { clearTimeout(stallTimer); stallTimer = setTimeout(uploadStalled, 25000); };
        // Register before open/send for upload-event compatibility across browsers.
        xhr.upload.onprogress = event => {
            if (settled || uploaded || reading) return;
            resetStall();
            onProgress?.({ stage: 'uploading', percent: event.lengthComputable ? Math.min(100, Math.round(event.loaded / event.total * 100)) : undefined });
        };
        const startReading = () => {
            if (settled || reading) return;
            reading = true;
            clearTimeout(stallTimer); clearTimeout(stageTimer);
            onProgress?.({ stage: 'reading' });
            stageTimer = setTimeout(() => finish(new Error('The marks reader timed out. Enter the marks manually or retry.')), mode === 'multiple' ? 35000 : 28000);
        };
        xhr.upload.onload = () => {
            if (settled || reading) return;
            uploaded = true;
            clearTimeout(stallTimer);
            if (mode === 'single') { startReading(); return; }
            // Upload completion may only mean the proxy received the bytes. Keep
            // the original 90s transfer budget until the origin acknowledges them.
            onProgress?.({ stage: 'receiving' });
        };
        xhr.onreadystatechange = () => {
            if (mode === 'multiple' && xhr.readyState >= 2 && xhr.getResponseHeader('X-OCR-Stage') === 'reading') startReading();
        };
        xhr.onload = () => {
            if (settled) return;
            if (xhr.status < 200 || xhr.status >= 300) {
                finish(new Error(xhr.status === 401 ? 'Your session expired. Sign in again to read marks.' : xhr.status === 413
                    ? 'Photo is too large to upload. Please enter the marks manually.'
                    : 'Could not read marks. Please retry or enter them manually.'));
                return;
            }
            try {
                const data = JSON.parse(xhr.responseText);
                if (data.reason === 'timeout') throw new Error('The marks reader timed out. Enter the marks manually or retry.');
                if (data.reason === 'provider_error') throw new Error('The marks reader is unavailable. Enter the marks manually or retry.');
                finish(undefined, data as T);
            } catch (error) {
                finish(error instanceof SyntaxError ? new Error('Could not read the marks response. Retry or enter marks manually.') : error as Error);
            }
        };
        xhr.onerror = () => finish(new Error('Connection lost. Retry the photo or enter marks manually.'));
        xhr.onabort = abort;
        xhr.open('POST', `${API_URL}/scan-ocr`);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) { abort(); return; }
        onProgress?.({ stage: 'uploading', percent: 0 });
        stageTimer = setTimeout(() => finish(new Error('Photo upload took too long. Check your connection and retry, or enter marks manually.')), 90000);
        resetStall();
        try { xhr.send(formData); } catch (error) { finish(error as Error); }
    });
}

export async function extractMarksFromSticker(image: Blob, signal?: AbortSignal, testId?: string,
    onProgress?: (progress: OCRProgress) => void): Promise<OCRResult> {
    const data = await uploadStickerPhoto<{ score?: unknown }>(image, signal, testId, onProgress);
    const raw = String(data.score ?? '');
    const valid = /^\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?$/.test(raw);
    return { score: valid ? raw.split('/')[0] : '', status: valid ? 'read' : 'needs_review' };
}

/** Decode the original photo for QR lookup independently of the optimized OCR upload. */
export async function readStudentQRFromPhoto(photo: File, signal?: AbortSignal): Promise<string> {
    const url = URL.createObjectURL(photo);
    try {
        const image = new Image();
        image.src = url;
        await scanDeadline(image.decode(), 6000, 'Photo could not be opened. Select the student manually.', signal);
        return await decodeStickerQR(image, signal);
    } finally { URL.revokeObjectURL(url); }
}
