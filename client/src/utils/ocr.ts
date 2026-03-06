
export interface OCRResult {
    score: string;
    confidence: number;
    debugImage?: string;
}

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
 *   4. Give Textract a tiny, focused image → faster + more accurate
 */
async function cropMarksRegion(warpedBase64: string): Promise<string> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            // Horizontal: skip QR + divider (left 42%), keep digit area
            const marksStartX = Math.floor(img.width * 0.42);
            // Vertical: skip name + "MARKS:" label (top 45%), keep digit boxes
            const digitBoxStartY = Math.floor(img.height * 0.45);

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

            resolve(canvas.toDataURL('image/jpeg', 0.92));
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
    videoElement: HTMLVideoElement,
    imageOverride?: string | null
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
            let prepped = await preprocessImage(imageBase64);
            processedImage = await cropMarksRegion(prepped);
            console.log("📸 Using raw fallback → preprocessed → marks-region crop for OCR");
        } catch (e) {
            console.warn("Preprocessing failed, using raw fallback image", e);
            processedImage = await cropMarksRegion(imageBase64);
        }
    }


    // 🚀 SECURITY: Use Backend Proxy with Multipart Upload
    try {
        const formData = new FormData();

        // Convert Base64 to Blob
        const fetchRes = await fetch(processedImage);
        const blob = await fetchRes.blob();
        formData.append('image', blob, 'scan.jpg');

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


