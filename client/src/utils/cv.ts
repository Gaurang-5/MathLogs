
// Utility to load and interface with OpenCV.js via Web Worker
// Avoids UI jank by offloading heavy processing

export interface StickerCoordinates {
    topLeft: { x: number, y: number };
    topRight: { x: number, y: number };
    bottomRight: { x: number, y: number };
    bottomLeft: { x: number, y: number };
}

interface PendingTask {
    resolve: (val: string | null) => void;
    reject: (err: unknown) => void;
}

interface WorkerInitSuccessMessage {
    type: 'INIT_SUCCESS';
    id?: number;
}

interface WorkerDetectSuccessMessage {
    type: 'DETECT_SUCCESS';
    id: number;
    data: Uint8Array;
    width: number;
    height: number;
}

interface WorkerDetectFailMessage {
    type: 'DETECT_FAIL';
    id: number;
}

interface WorkerErrorMessage {
    type: 'ERROR';
    id?: number;
    error?: string;
}

type WorkerMessage = WorkerInitSuccessMessage | WorkerDetectSuccessMessage | WorkerDetectFailMessage | WorkerErrorMessage;

class CVWorkerManager {
    private worker: Worker | null = null;
    private initialized = false;
    private processing = false;
    private idCounter = 0;
    private pending: Record<number, PendingTask> = {};

    constructor() {
        if (typeof Worker !== 'undefined') {
            this.worker = new Worker(new URL('../workers/cv.worker.ts', import.meta.url), { type: 'module' });
            this.worker.onmessage = this.handleMessage.bind(this);
            this.worker.postMessage({ type: 'INIT' });
        }
    }

    private handleMessage(e: MessageEvent<WorkerMessage>) {
        const { type, id } = e.data;
        const task = this.pending[id];

        if (type === 'INIT_SUCCESS') {
            this.initialized = true;
            console.log("✅ OpenCV Worker Initialized");
        } else if (task) {
            delete this.pending[id];

            if (type === 'DETECT_SUCCESS') {
                const { data, width, height } = e.data;
                // Reconstruct ImageData or use Canvas to get Base64
                // For now, let's create a temporary canvas to get the data URL
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    const imgData = new ImageData(new Uint8ClampedArray(data), width, height);
                    ctx.putImageData(imgData, 0, 0);
                    task.resolve(canvas.toDataURL('image/jpeg', 0.95));
                } else {
                    task.reject(new Error("Failed to create canvas context"));
                }

            } else if (type === 'DETECT_FAIL') {
                task.resolve(null);
            } else {
                const { error } = e.data;
                task.reject(new Error(error || "Worker Error"));
            }
        }
    }

    public async detect(video: HTMLVideoElement): Promise<string | null> {
        if (!this.worker || !this.initialized) return null;
        if (this.processing) return null; // Simple drop if busy

        this.processing = true;

        // Capture frame efficiently
        // We need to send pure data, not the video element
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        if (!ctx) {
            this.processing = false;
            return null;
        }

        ctx.drawImage(video, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Prepare Transferable
        // Note: ImageData.data is ReadOnly, so we might need to copy buffer if we want zero-copy
        // PostMessage copies by default unless transferred.

        return (new Promise<string | null>((resolve, reject) => {
            const id = ++this.idCounter;
            this.pending[id] = { resolve, reject };
            const transferable = imageData.data.buffer as ArrayBuffer;

            this.worker!.postMessage({
                type: 'DETECT',
                id,
                imageData: imageData
            }, [transferable]);
        })).finally(() => {
            this.processing = false;
        });
    }
}


export const cvManager = new CVWorkerManager();

export function loadOpenCV(): Promise<void> {
    // No-op for main thread compatibility in existing components
    return Promise.resolve();
}

/**
 * Processes a video frame to find the sticker using Worker.
 */
export async function detectAndWarpSticker(
    video: HTMLVideoElement,
    canvas?: HTMLCanvasElement // Deprecated, kept for signature compat
): Promise<string | null> {
    void canvas;
    return cvManager.detect(video);
}
