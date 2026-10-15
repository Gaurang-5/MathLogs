import jsQR from 'jsqr';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import { scanDeadline } from './scanDeadline';

// Bundle the decoder with MathLogs: no third-party CDN or photo upload is needed.
const ready = scanDeadline(prepareZXingModule({
    overrides: { locateFile: () => wasmUrl }, fireImmediately: true,
}), 2000, 'QR decoder loading timed out').then(() => true, () => false);

self.onmessage = async (event: MessageEvent<{ pixels: Uint8ClampedArray; width: number; height: number; multiple?: boolean }>) => {
    const { pixels, width, height, multiple } = event.data;
    if (await ready) {
        try {
            const results = await readBarcodes({ data: pixels, width, height } as ImageData, {
                formats: ['QRCode'], tryHarder: true, tryRotate: true, tryInvert: true,
                maxNumberOfSymbols: multiple ? 0 : 2,
            });
            if (multiple) {
                self.postMessage({ codes: results.filter(result => result.isValid && result.text.trim()).map(result => ({
                    humanId: result.text.trim(), corners: [result.position.topLeft, result.position.topRight,
                        result.position.bottomRight, result.position.bottomLeft],
                })) });
                return;
            }
            const ids = [...new Set(results.filter(result => result.isValid).map(result => result.text.trim()).filter(Boolean))];
            if (ids.length > 1) {
                self.postMessage({ error: 'More than one student QR is visible. Capture one sticker at a time.' });
                return;
            }
            if (ids.length === 1) {
                self.postMessage({ data: ids[0] });
                return;
            }
        } catch {
            // Keep a JavaScript decoder available if WebAssembly is unavailable.
        }
    }
    // Multi-photo recognition needs all QR positions, not a first-code fallback.
    if (multiple) {
        self.postMessage({ error: 'The multiple-sticker QR reader could not load. Retry or photograph a smaller group.' });
        return;
    }
    try {
        const qr = jsQR(pixels, width, height, { inversionAttempts: 'attemptBoth' });
        self.postMessage({ data: qr?.data.trim() || null });
    } catch {
        self.postMessage({ data: null });
    }
};
