
export interface OCRResult {
    score: string;
    confidence: number;
    debugImage?: string;
}

/**
 * Crops ONLY the 3 digit-box area from the CV-warped sticker image.
 *
 * Sticker layout (warped to 1200×646):
 *   Left 42%  → QR code + divider (excluded)
 *   Right 58% → Student info area:
 *     - Top ~45%    → Student name + "MARKS:" label (excluded)
 *     - Bottom ~55% → The 3 handwritten digit boxes (KEPT)
 *
 * By cropping to ONLY the digit boxes we:
 *   1. Eliminate the student name (may contain numbers like "Class 10")
 *   2. Eliminate the "MARKS:" label text
 *   3. Eliminate any writing/numbers outside the sticker borders
 *   4. Give Gemini a focused image for faster, more accurate recognition
 */
async function cropMarksRegion(warpedBase64: string): Promise<string> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            // Horizontal: skip QR + divider (left 42%), keep digit area
            const marksStartX = Math.floor(img.width * 0.42);
            // Vertical: skip name (top 35%), leave MARKS label and full digits in frame
            // Since we use Gemini as primary, we don't need a super tight aggressive crop anymore.
            const digitBoxStartY = Math.floor(img.height * 0.35);

            const cropWidth = img.width - marksStartX;
            const cropHeight = img.height - digitBoxStartY;

            const canvas = document.createElement('canvas');
            canvas.width = cropWidth;
            canvas.height = cropHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) { resolve(warpedBase64); return; }

            // White background to avoid edge artifacts
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, cropWidth, cropHeight);
            ctx.drawImage(
                img,
                marksStartX, digitBoxStartY,   // source x, y
                cropWidth, cropHeight,          // source w, h
                0, 0,                           // dest x, y
                cropWidth, cropHeight            // dest w, h
            );

            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => resolve(warpedBase64);
        img.src = warpedBase64;
    });
}


/**
 * Extracts marks from sticker image using Gemini AI Vision.
 * Captures the current video frame and sends to Gemini for OCR.
 */
export async function extractMarksFromSticker(
    _videoElement: HTMLVideoElement,
    imageOverride?: string | null,
    maxMarks?: number,
    testId?: string
): Promise<OCRResult> {


    let imageBase64 = "";
    let processedImage = "";

    if (imageOverride) {
        // Warp succeeded — crop just the marks region (right 58% of the warped sticker)
        // This gives Gemini a much larger, focused view of the 3 digit boxes
        imageBase64 = imageOverride;
        processedImage = await cropMarksRegion(imageBase64);
        console.log("📸 Using CV-warped → marks-region crop for OCR");
    } else {
        return { score: '', confidence: 0 }; // Recapture a located sticker; never guess a center crop.
    }

    // 🚀 SECURITY: Use Backend Proxy with Multipart Upload
    try {
        const formData = new FormData();

        // Convert Base64 to Blob
        const fetchRes = await fetch(processedImage);
        const blob = await fetchRes.blob();
        formData.append('image', blob, 'scan.png');
        if (testId) formData.append('testId', testId);
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
            signal: AbortSignal.timeout(45000),
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

        if (data.score && data.score !== "ERROR_UNCERTAIN") {
            return { score: data.score, confidence: data.confidence, debugImage: processedImage };
        } else {
            console.warn("⚠️ Backend returned uncertain result.");
        }

    } catch (e) {
        console.error("❌ OCR Proxy Failed:", e);
    }

    return { score: "", confidence: 0, debugImage: processedImage };
}
