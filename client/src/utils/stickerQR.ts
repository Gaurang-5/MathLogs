import { scanDeadline } from './scanDeadline';

/** Only QR analysis uses smaller copies. The photo uploaded for marks is untouched. */
export async function decodeStickerQR(source: HTMLCanvasElement | HTMLImageElement, signal?: AbortSignal): Promise<string> {
    const width = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
    const height = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
    if (!width || !height) throw new Error('This photo has no readable image.');
    const worker = new Worker(new URL('./stickerQR.worker.ts', import.meta.url), { type: 'module' });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) { worker.terminate(); throw new Error('Could not read this photo.'); }
    const decode = async () => {
        // Whole-photo passes are fast. If a sticker is small in a high-resolution photo,
        // inspect original-resolution tiles: reducing every pass can erase its modules.
        const tileSize = 1280;
        const positions = (length: number) => {
            if (length <= tileSize) return [0];
            const values = [];
            for (let offset = 0; offset + tileSize < length; offset += 1024) values.push(offset);
            values.push(length - tileSize);
            return values;
        };
        const tiles = positions(width).flatMap(x => positions(height).map(y => ({
            x, y, w: Math.min(width, tileSize), h: Math.min(height, tileSize), max: tileSize,
        }))).sort((a, b) =>
            Math.hypot(a.x + a.w / 2 - width / 2, a.y + a.h / 2 - height / 2)
            - Math.hypot(b.x + b.w / 2 - width / 2, b.y + b.h / 2 - height / 2));
        const regions = [
            { x: 0, y: 0, w: width, h: height, max: 1280 },
            { x: 0, y: 0, w: width, h: height, max: 1920 },
            ...tiles,
        ];
        for (const region of regions) {
            if (signal?.aborted) throw new DOMException('Capture cancelled', 'AbortError');
            const scale = Math.min(1, region.max / Math.max(region.w, region.h));
            canvas.width = Math.max(1, Math.round(region.w * scale));
            canvas.height = Math.max(1, Math.round(region.h * scale));
            context.drawImage(source, region.x, region.y, region.w, region.h, 0, 0, canvas.width, canvas.height);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
            const data = await new Promise<string | null>((resolve, reject) => {
                worker.onmessage = event => event.data.error
                    ? reject(new Error(event.data.error)) : resolve(event.data.data);
                worker.onerror = () => reject(new Error('QR reader could not start. Select the student manually.'));
                worker.postMessage({ pixels: pixels.data, width: pixels.width, height: pixels.height }, [pixels.data.buffer]);
            });
            if (data) return data;
        }
        throw new Error('QR not readable. Select the student below or retake a clearer photo.');
    };
    try {
        return await scanDeadline(decode(), 8000, 'QR reading timed out. Select the student below.', signal);
    } finally {
        worker.terminate();
        canvas.width = canvas.height = 0;
    }
}
