
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

interface PreparedMarksCrop {
    ocrImage: string | null;
    debugImage: string | null;
    boxImages: string[];
}

// Fixed crops work only when the sticker warp is perfect. In real scans the warp can drift,
// and the raw fallback is even less stable, so we evaluate a few nearby crop windows.
const WARPED_DIGIT_CANDIDATES: CropBounds[] = [
    { left: 0.38, top: 0.46, right: 0.86, bottom: 0.87 },
    { left: 0.36, top: 0.45, right: 0.84, bottom: 0.88 },
    { left: 0.40, top: 0.45, right: 0.88, bottom: 0.88 },
    { left: 0.34, top: 0.43, right: 0.86, bottom: 0.90 },
];

const RAW_DIGIT_CANDIDATES: CropBounds[] = [
    { left: 0.34, top: 0.38, right: 0.88, bottom: 0.88 },
    { left: 0.30, top: 0.36, right: 0.86, bottom: 0.88 },
    { left: 0.38, top: 0.36, right: 0.90, bottom: 0.90 },
    { left: 0.28, top: 0.34, right: 0.88, bottom: 0.92 },
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

    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
        img,
        marksStartX, digitBoxStartY,
        cropWidth, cropHeight,
        0, 0,
        canvas.width, canvas.height
    );

    return canvas;
}

function cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    ctx.drawImage(source, 0, 0);
    return canvas;
}

function normalizeCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
    const normalized = cloneCanvas(canvas);
    const ctx = normalized.getContext('2d');
    if (!ctx) return normalized;

    const imageData = ctx.getImageData(0, 0, normalized.width, normalized.height);
    const pixels = imageData.data;
    for (let i = 0; i < pixels.length; i += 4) {
        const gray = (pixels[i] * 0.299) + (pixels[i + 1] * 0.587) + (pixels[i + 2] * 0.114);

        let value = gray;
        if (gray > 228) {
            value = 255;
        } else if (gray < 105) {
            value = 0;
        } else {
            value = ((gray - 105) / 123) * 255;
        }

        const finalGray = Math.max(0, Math.min(255, Math.round(value)));
        pixels[i] = finalGray;
        pixels[i + 1] = finalGray;
        pixels[i + 2] = finalGray;
        pixels[i + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
    return normalized;
}

function trimDigitBounds(canvas: HTMLCanvasElement) {
    const { rowDark, columnDark } = getDarkProfiles(canvas, 210);
    const width = canvas.width;
    const height = canvas.height;

    let left = 0;
    while (left < width - 1 && columnDark[left] <= 1) left++;

    let right = width - 1;
    while (right > left && columnDark[right] <= 1) right--;

    let top = 0;
    while (top < height - 1 && rowDark[top] <= 1) top++;

    let bottom = height - 1;
    while (bottom > top && rowDark[bottom] <= 1) bottom--;

    return {
        left: Math.max(0, left - Math.floor(width * 0.06)),
        top: Math.max(0, top - Math.floor(height * 0.08)),
        right: Math.min(width, right + Math.floor(width * 0.06)),
        bottom: Math.min(height, bottom + Math.floor(height * 0.08)),
    };
}

function buildBoxImage(
    source: HTMLCanvasElement,
    srcX: number,
    srcY: number,
    srcW: number,
    srcH: number
): HTMLCanvasElement {
    const rawBox = document.createElement('canvas');
    rawBox.width = Math.max(1, srcW);
    rawBox.height = Math.max(1, srcH);
    const rawCtx = rawBox.getContext('2d');
    if (!rawCtx) return rawBox;

    rawCtx.fillStyle = '#FFFFFF';
    rawCtx.fillRect(0, 0, rawBox.width, rawBox.height);
    rawCtx.drawImage(source, srcX, srcY, srcW, srcH, 0, 0, rawBox.width, rawBox.height);

    // Remove the printed box frame and underline before looking for handwriting.
    const innerX = Math.floor(rawBox.width * 0.14);
    const innerY = Math.floor(rawBox.height * 0.12);
    const innerW = Math.max(1, Math.floor(rawBox.width * 0.72));
    const innerH = Math.max(1, Math.floor(rawBox.height * 0.68));

    const innerBox = document.createElement('canvas');
    innerBox.width = innerW;
    innerBox.height = innerH;
    const innerCtx = innerBox.getContext('2d');
    if (!innerCtx) return rawBox;

    innerCtx.fillStyle = '#FFFFFF';
    innerCtx.fillRect(0, 0, innerBox.width, innerBox.height);
    innerCtx.drawImage(rawBox, innerX, innerY, innerW, innerH, 0, 0, innerW, innerH);

    const normalizedBox = normalizeCanvas(innerBox);
    const { darkRatio } = getDarkProfiles(normalizedBox, 185);
    const output = document.createElement('canvas');
    output.width = 220;
    output.height = 260;
    const outputCtx = output.getContext('2d');
    if (!outputCtx) return normalizedBox;

    outputCtx.fillStyle = '#FFFFFF';
    outputCtx.fillRect(0, 0, output.width, output.height);

    if (darkRatio < 0.008 || darkRatio > 0.50) {
        return output;
    }

    const bounds = trimDigitBounds(normalizedBox);
    const trimmedW = Math.max(1, bounds.right - bounds.left);
    const trimmedH = Math.max(1, bounds.bottom - bounds.top);

    outputCtx.drawImage(
        normalizedBox,
        bounds.left,
        bounds.top,
        trimmedW,
        trimmedH,
        30,
        24,
        output.width - 60,
        output.height - 48
    );

    return normalizeCanvas(output);
}

function getDarkProfiles(canvas: HTMLCanvasElement, threshold = 185) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return {
            rowDark: [] as number[],
            columnDark: [] as number[],
            darkRatio: 0,
        };
    }

    const { width, height } = canvas;
    const { data } = ctx.getImageData(0, 0, width, height);
    const rowDark = new Array<number>(height).fill(0);
    const columnDark = new Array<number>(width).fill(0);
    let darkPixels = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = ((y * width) + x) * 4;
            const gray = data[idx];
            if (gray > threshold) continue;
            darkPixels += 1;
            rowDark[y] += 1;
            columnDark[x] += 1;
        }
    }

    const totalPixels = width * height;
    return {
        rowDark,
        columnDark,
        darkRatio: totalPixels > 0 ? darkPixels / totalPixels : 0,
    };
}

function sumRange(values: number[], start: number, end: number): number {
    let total = 0;
    const safeStart = Math.max(0, Math.floor(start));
    const safeEnd = Math.min(values.length, Math.ceil(end));
    for (let i = safeStart; i < safeEnd; i++) total += values[i];
    return total;
}

function smoothProfile(values: number[], radius: number): number[] {
    return values.map((_, index) => {
        const start = Math.max(0, index - radius);
        const end = Math.min(values.length, index + radius + 1);
        return sumRange(values, start, end) / Math.max(1, end - start);
    });
}

function scoreCrop(canvas: HTMLCanvasElement): number {
    const { rowDark, columnDark, darkRatio } = getDarkProfiles(canvas, 185);

    // Reject obviously broken crops: blank white, nearly solid black, or transparent/invalid-looking patches.
    if (darkRatio < 0.005 || darkRatio > 0.55) return Number.NEGATIVE_INFINITY;

    const width = canvas.width;
    const height = canvas.height;
    const centerDark = sumRange(columnDark, width * 0.18, width * 0.88);
    const edgeDark = sumRange(columnDark, 0, width * 0.08) + sumRange(columnDark, width * 0.92, width);
    const leftQrDark = sumRange(columnDark, 0, width * 0.24);
    const topDark = sumRange(rowDark, 0, height * 0.24);
    const lowerDark = sumRange(rowDark, height * 0.25, height * 0.90);

    return (centerDark * 1.35)
        + (lowerDark * 0.45)
        - (edgeDark * 1.8)
        - (topDark * 1.9)
        - (leftQrDark * 1.8);
}

function findPeakIndex(values: number[], start: number, end: number, minValue: number): number | null {
    let bestIndex: number | null = null;
    let bestValue = minValue;
    for (let i = Math.max(0, Math.floor(start)); i < Math.min(values.length, Math.ceil(end)); i++) {
        if (values[i] > bestValue) {
            bestValue = values[i];
            bestIndex = i;
        }
    }
    return bestIndex;
}

function detectMarksAnchors(canvas: HTMLCanvasElement) {
    const { columnDark } = getDarkProfiles(canvas, 175);
    const smoothed = smoothProfile(columnDark, 3);
    const width = canvas.width;
    const height = canvas.height;
    const minimumTallLine = height * 0.10;

    const divider = findPeakIndex(smoothed, width * 0.20, width * 0.60, minimumTallLine);
    const rightMarker = findPeakIndex(smoothed, width * 0.72, width * 0.98, minimumTallLine);

    return { divider, rightMarker };
}

function detectMarksBand(canvas: HTMLCanvasElement, left: number, right: number) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return { top: Math.floor(canvas.height * 0.22), bottom: Math.floor(canvas.height * 0.82) };

    const width = canvas.width;
    const height = canvas.height;
    const xStart = Math.max(0, Math.floor(left));
    const xEnd = Math.min(width, Math.ceil(right));
    const { data } = ctx.getImageData(0, 0, width, height);
    const rowDark = new Array<number>(height).fill(0);

    for (let y = 0; y < height; y++) {
        for (let x = xStart; x < xEnd; x++) {
            const idx = ((y * width) + x) * 4;
            if (data[idx] < 185) rowDark[y] += 1;
        }
    }

    const smoothed = smoothProfile(rowDark, 4);
    const peak = findPeakIndex(smoothed, height * 0.30, height * 0.82, (xEnd - xStart) * 0.06);
    if (peak == null) {
        return { top: Math.floor(height * 0.22), bottom: Math.floor(height * 0.82) };
    }

    const halfHeight = Math.floor(height * 0.24);
    return {
        top: Math.max(0, peak - halfHeight),
        bottom: Math.min(height, peak + halfHeight),
    };
}

function composeBoxStrip(canvas: HTMLCanvasElement): PreparedMarksCrop {
    const normalizedCanvas = normalizeCanvas(canvas);
    const { darkRatio } = getDarkProfiles(normalizedCanvas, 185);
    if (darkRatio < 0.01 || darkRatio > 0.55) {
        return { ocrImage: null, debugImage: canvas.toDataURL('image/jpeg', 0.98), boxImages: [] };
    }

    const { divider, rightMarker } = detectMarksAnchors(normalizedCanvas);
    const width = normalizedCanvas.width;
    const height = normalizedCanvas.height;

    let marksLeft = divider != null ? divider + (width * 0.04) : width * 0.30;
    let marksRight = rightMarker != null ? rightMarker - (width * 0.04) : width * 0.86;

    if (marksRight - marksLeft < width * 0.28) {
        marksLeft = width * 0.30;
        marksRight = width * 0.86;
    }

    const { top, bottom } = detectMarksBand(normalizedCanvas, marksLeft, marksRight);
    const stripWidth = marksRight - marksLeft;
    const stripHeight = bottom - top;

    if (stripWidth < width * 0.22 || stripHeight < height * 0.18) {
        return { ocrImage: null, debugImage: canvas.toDataURL('image/jpeg', 0.98), boxImages: [] };
    }

    const slotWidth = stripWidth / 3;
    const boxPaddingX = slotWidth * 0.14;
    const boxPaddingY = stripHeight * 0.08;

    const composed = document.createElement('canvas');
    composed.width = 720;
    composed.height = 250;
    const composedCtx = composed.getContext('2d');
    if (!composedCtx) {
        return { ocrImage: null, debugImage: canvas.toDataURL('image/jpeg', 0.98), boxImages: [] };
    }

    composedCtx.fillStyle = '#FFFFFF';
    composedCtx.fillRect(0, 0, composed.width, composed.height);
    const boxImages: string[] = [];

    for (let i = 0; i < 3; i++) {
        const srcX = Math.max(0, Math.floor(marksLeft + (i * slotWidth) + boxPaddingX));
        const srcY = Math.max(0, Math.floor(top + boxPaddingY));
        const srcW = Math.max(1, Math.floor(slotWidth - (boxPaddingX * 2)));
        const srcH = Math.max(1, Math.floor(stripHeight - (boxPaddingY * 2)));
        const destX = 20 + (i * 235);
        const destY = 18;
        const destW = 200;
        const destH = 214;

        const boxCanvas = buildBoxImage(normalizedCanvas, srcX, srcY, srcW, srcH);
        boxImages.push(boxCanvas.toDataURL('image/jpeg', 0.98));
        composedCtx.drawImage(boxCanvas, destX, destY, destW, destH);
        composedCtx.strokeStyle = '#D1D5DB';
        composedCtx.lineWidth = 2;
        composedCtx.strokeRect(destX, destY, destW, destH);
    }

    const finalNormalized = normalizeCanvas(composed);
    const finalProfiles = getDarkProfiles(finalNormalized, 185);
    if (finalProfiles.darkRatio < 0.01 || finalProfiles.darkRatio > 0.45) {
        return { ocrImage: null, debugImage: composed.toDataURL('image/jpeg', 0.98), boxImages: [] };
    }

    return {
        ocrImage: finalNormalized.toDataURL('image/jpeg', 0.98),
        debugImage: finalNormalized.toDataURL('image/jpeg', 0.98),
        boxImages,
    };
}

/**
 * Crops the sticker, chooses the best candidate region, then isolates the actual three marks boxes.
 */
async function cropMarksRegion(imageBase64: string, mode: 'warped' | 'raw'): Promise<PreparedMarksCrop> {
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
                resolve({ ocrImage: null, debugImage: imageBase64, boxImages: [] });
                return;
            }

            resolve(composeBoxStrip(bestCanvas));
        };
        img.onerror = () => resolve({ ocrImage: null, debugImage: imageBase64, boxImages: [] });
        img.src = imageBase64;
    });
}

async function sendImageToOCR(imageBase64: string, token: string, maxMarks?: number): Promise<{ score: string; confidence: number }> {
    const formData = new FormData();
    const fetchRes = await fetch(imageBase64);
    const blob = await fetchRes.blob();
    formData.append('image', blob, 'scan.jpg');
    if (maxMarks) formData.append('maxMarks', String(maxMarks));

    const response = await fetch('/api/scan-ocr', {
        method: 'POST',
        body: formData,
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (!response.ok) {
        throw new Error(`Server OCR Error: ${response.status} ${response.statusText}`);
    }

    return response.json();
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
    let debugPreview = "";
    let boxImages: string[] = [];

    if (imageOverride) {
        // Warp succeeded — crop just the marks region (right 58% of the warped sticker)
        // This gives Gemini a much larger, focused view of the 3 digit boxes
        imageBase64 = imageOverride;
        const prepared = await cropMarksRegion(imageBase64, 'warped');
        processedImage = prepared.ocrImage || "";
        debugPreview = prepared.debugImage || imageBase64;
        boxImages = prepared.boxImages;
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
            const prepared = await cropMarksRegion(prepped, 'raw');
            processedImage = prepared.ocrImage || "";
            debugPreview = prepared.debugImage || prepped;
            boxImages = prepared.boxImages;
            console.log("📸 Using raw fallback → preprocessed → marks-region crop for OCR");
        } catch (e) {
            console.warn("Preprocessing failed, using raw fallback image", e);
            const prepared = await cropMarksRegion(imageBase64, 'raw');
            processedImage = prepared.ocrImage || "";
            debugPreview = prepared.debugImage || imageBase64;
            boxImages = prepared.boxImages;
        }
    }

    if (!processedImage) {
        console.warn("⚠️ Crop rejected before OCR because the marks boxes could not be isolated.");
        return { score: "", confidence: 0, debugImage: debugPreview || imageBase64 };
    }


    // 🚀 SECURITY: Use Backend Proxy with Multipart Upload
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            console.error("❌ Not authenticated: Missing token for OCR");
            throw new Error("Authentication required for scanning");
        }

        const startTime = performance.now();
        let data: { score: string; confidence: number };

        if (boxImages.length === 3) {
            console.log("📤 Sending 3 per-box OCR requests...");
            const perBox = await Promise.all(
                boxImages.map(async (boxImage, index) => {
                    try {
                        const result = await sendImageToOCR(boxImage, token, 9);
                        const score = String(result.score || '').trim();
                        const digit = score.match(/^\d$/)?.[0] || '';
                        return { digit, confidence: Number(result.confidence || 0), index };
                    } catch (error) {
                        console.warn(`⚠️ OCR failed for box ${index + 1}`, error);
                        return { digit: '', confidence: 0, index };
                    }
                })
            );

            const mergedScore = perBox.map((entry) => entry.digit).join('');
            const mergedConfidence = perBox.length > 0
                ? perBox.reduce((sum, entry) => sum + entry.confidence, 0) / perBox.length
                : 0;

            data = {
                score: mergedScore,
                confidence: mergedConfidence,
            };
        } else {
            console.log("📤 Sending fallback strip OCR request...");
            data = await sendImageToOCR(processedImage, token, maxMarks);
        }

        const duration = Math.round(performance.now() - startTime);
        console.log(`⏱️ OCR Request took ${duration}ms`);
        console.log("✅ Backend OCR Result:", data);

        if (data.score && data.score !== "ERROR_UNCERTAIN" && data.score !== "0") {
            let finalScore = data.score;
            if (maxMarks && /^\d+$/.test(finalScore) && Number(finalScore) > maxMarks) {
                finalScore = '';
            }
            if (finalScore) {
                return { score: finalScore, confidence: data.confidence, debugImage: debugPreview || processedImage };
            }
        }
        console.warn("⚠️ Backend returned uncertain result.");

    } catch (e) {
        console.error("❌ OCR Proxy Failed:", e);
    }

    return { score: "", confidence: 0, debugImage: debugPreview || processedImage };
}
