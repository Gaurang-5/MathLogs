
export interface OCRResult {
    score: string;
    confidence: number;
    debugImage?: string;
}

interface CropBounds {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

// Fixed crops work only when the sticker warp is perfect. In real scans the warp can drift,
// and the raw fallback is even less stable, so we evaluate a few nearby crop windows.
const WARPED_DIGIT_CANDIDATES: CropBounds[] = [
    { left: 0.36, top: 0.47, right: 0.86, bottom: 0.88 },
    { left: 0.32, top: 0.45, right: 0.84, bottom: 0.88 },
    { left: 0.40, top: 0.45, right: 0.90, bottom: 0.88 },
    { left: 0.28, top: 0.38, right: 0.92, bottom: 0.92 },
];

const RAW_DIGIT_CANDIDATES: CropBounds[] = [
    { left: 0.30, top: 0.38, right: 0.92, bottom: 0.90 },
    { left: 0.26, top: 0.36, right: 0.90, bottom: 0.90 },
    { left: 0.34, top: 0.38, right: 0.96, bottom: 0.92 },
    { left: 0.22, top: 0.30, right: 0.96, bottom: 0.94 },
];

// Helper for preprocessing (still used)
async function preprocessImage(imageBase64: string): Promise<string> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            // Double the resolution limit so the handwriting remains crisp
            const MAX_DIMENSION = 1200;
            let width = img.width;
            let height = img.height;

            if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
                if (width > height) {
                    height = MAX_DIMENSION * (height / width);
                    width = MAX_DIMENSION;
                } else {
                    width = MAX_DIMENSION * (width / height);
                    height = MAX_DIMENSION;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                resolve(imageBase64);
                return;
            }

            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            // High quality JPEG to avoid compression artifacts around handwritten lines
            resolve(canvas.toDataURL('image/jpeg', 0.95));
        };
        img.onerror = () => resolve(imageBase64);
        img.src = imageBase64;
    });
}

function renderCrop(img: HTMLImageElement, bounds: CropBounds): HTMLCanvasElement {
    const marksStartX = Math.max(0, Math.floor(img.width * bounds.left));
    const digitBoxStartY = Math.max(0, Math.floor(img.height * bounds.top));
    const marksEndX = Math.min(img.width, Math.ceil(img.width * bounds.right));
    const digitBoxEndY = Math.min(img.height, Math.ceil(img.height * bounds.bottom));

    const cropWidth = Math.max(1, marksEndX - marksStartX);
    const cropHeight = Math.max(1, digitBoxEndY - digitBoxStartY);
    const upscale = 2;

    const canvas = document.createElement('canvas');
    canvas.width = cropWidth * upscale;
    canvas.height = cropHeight * upscale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
        img,
        marksStartX, digitBoxStartY,
        cropWidth, cropHeight,
        0, 0,
        canvas.width, canvas.height
    );

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    for (let i = 0; i < pixels.length; i += 4) {
        const gray = (pixels[i] * 0.299) + (pixels[i + 1] * 0.587) + (pixels[i + 2] * 0.114);

        let normalized = gray;
        if (gray > 225) {
            normalized = 255;
        } else if (gray < 120) {
            normalized = 0;
        } else {
            normalized = ((gray - 120) / 105) * 255;
        }

        const finalGray = Math.max(0, Math.min(255, Math.round(normalized)));
        pixels[i] = finalGray;
        pixels[i + 1] = finalGray;
        pixels[i + 2] = finalGray;
        pixels[i + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);

    return canvas;
}

function scoreCrop(canvas: HTMLCanvasElement): number {
    const ctx = canvas.getContext('2d');
    if (!ctx) return Number.NEGATIVE_INFINITY;

    const { width, height } = canvas;
    const { data } = ctx.getImageData(0, 0, width, height);

    let centerDark = 0;
    let edgeDark = 0;
    let topDark = 0;
    let lowerDark = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = ((y * width) + x) * 4;
            const gray = data[idx];
            if (gray > 185) continue;

            const xNorm = x / width;
            const yNorm = y / height;

            if (xNorm > 0.08 && xNorm < 0.92 && yNorm > 0.18 && yNorm < 0.90) centerDark += 1;
            if (xNorm < 0.06 || xNorm > 0.94) edgeDark += 1;
            if (yNorm < 0.24) topDark += 1;
            if (yNorm > 0.28 && yNorm < 0.86) lowerDark += 1;
        }
    }

    return (centerDark * 1.3) + (lowerDark * 0.4) - (edgeDark * 1.7) - (topDark * 1.5);
}

/**
 * Crops the handwritten digit strip and chooses the crop window that best matches the box area.
 */
async function cropMarksRegion(imageBase64: string, mode: 'warped' | 'raw'): Promise<string> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const candidates = mode === 'warped' ? WARPED_DIGIT_CANDIDATES : RAW_DIGIT_CANDIDATES;
            let bestCanvas: HTMLCanvasElement | null = null;
            let bestScore = Number.NEGATIVE_INFINITY;

            for (const bounds of candidates) {
                const candidateCanvas = renderCrop(img, bounds);
                const score = scoreCrop(candidateCanvas);
                if (score > bestScore) {
                    bestScore = score;
                    bestCanvas = candidateCanvas;
                }
            }

            if (!bestCanvas) {
                resolve(imageBase64);
                return;
            }

            resolve(bestCanvas.toDataURL('image/jpeg', 0.98));
        };
        img.onerror = () => resolve(imageBase64);
        img.src = imageBase64;
    });
}


/**
 * Extracts marks from sticker image using Gemini AI Vision.
 * Captures the current video frame and sends to Gemini for OCR.
 */
export async function extractMarksFromSticker(
    videoElement: HTMLVideoElement,
    imageOverride?: string | null,
    maxMarks?: number
): Promise<OCRResult> {


    let imageBase64 = "";
    let processedImage = "";

    if (imageOverride) {
        // Warp succeeded — crop just the marks region (right 58% of the warped sticker)
        // This gives Gemini a much larger, focused view of the 3 digit boxes
        imageBase64 = imageOverride;
        processedImage = await cropMarksRegion(imageBase64, 'warped');
        console.log("📸 Using CV-warped → marks-region crop for OCR");
    } else {
        // Fallback: capture raw video frame cropped to sticker area
        const canvas = document.createElement('canvas');
        const sourceWidth = videoElement.videoWidth;
        const sourceHeight = videoElement.videoHeight;
        console.log(`Video Dimensions: ${sourceWidth}x${sourceHeight}`);

        // Crop center of frame to sticker aspect ratio (3.9cm × 2.1cm = 39/21)
        const cropWidth = sourceWidth * 0.9;
        const cropHeight = cropWidth / (39 / 21);

        const startX = (sourceWidth - cropWidth) / 2;
        const startY = (sourceHeight - cropHeight) / 2;

        canvas.width = cropWidth;
        canvas.height = cropHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Failed to create canvas context");

        ctx.drawImage(videoElement, startX, startY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

        imageBase64 = canvas.toDataURL('image/jpeg', 0.95);
        console.log(`Captured Raw Snippet Length: ${imageBase64.length}`);

        // Preprocess raw capture, THEN crop marks region so it behaves identically to warped version
        try {
            const prepped = await preprocessImage(imageBase64);
            processedImage = await cropMarksRegion(prepped, 'raw');
            console.log("📸 Using raw fallback → preprocessed → marks-region crop for OCR");
        } catch (e) {
            console.warn("Preprocessing failed, using raw fallback image", e);
            processedImage = await cropMarksRegion(imageBase64, 'raw');
        }
    }


    // 🚀 SECURITY: Use Backend Proxy with Multipart Upload
    try {
        const formData = new FormData();

        // Convert Base64 to Blob
        const fetchRes = await fetch(processedImage);
        const blob = await fetchRes.blob();
        formData.append('image', blob, 'scan.jpg');
        if (maxMarks) formData.append('maxMarks', String(maxMarks));

        const token = localStorage.getItem('token');
        if (!token) {
            console.error("❌ Not authenticated: Missing token for OCR");
            throw new Error("Authentication required for scanning");
        }

        console.log(`📤 Sending ${blob.size} bytes to OCR server...`);
        const startTime = performance.now();

        const response = await fetch('/api/scan-ocr', {
            method: 'POST',
            body: formData, // No Content-Type header needed, browser sets boundary
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const duration = Math.round(performance.now() - startTime);
        console.log(`⏱️ OCR Request took ${duration}ms`);

        if (!response.ok) {
            throw new Error(`Server OCR Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log("✅ Backend OCR Result:", data);

        if (data.score && data.score !== "ERROR_UNCERTAIN" && data.score !== "0") {
            return { score: data.score, confidence: data.confidence, debugImage: processedImage };
        } else {
            console.warn("⚠️ Backend returned uncertain result.");
        }

    } catch (e) {
        console.error("❌ OCR Proxy Failed:", e);
    }

    return { score: "", confidence: 0, debugImage: processedImage };
}
