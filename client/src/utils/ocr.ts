
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
            // Cap max dimension to 1500px for optimal upload speed
            const MAX_DIMENSION = 1024;
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

            // Fill with white background
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(0, 0, width, height);

            // Draw image
            ctx.drawImage(img, 0, 0, width, height);

            // Return as high-quality JPEG
            resolve(canvas.toDataURL('image/jpeg', 0.9));
        };
        img.onerror = (e) => {
            console.warn("Image load error in preprocess, using original", e);
            resolve(imageBase64);
        };
        img.src = imageBase64;
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

    if (imageOverride) {
        // Use the smart CV detected image
        imageBase64 = imageOverride;
        console.log("📸 Using provided CV-dewarped image");
    } else {
        // Capture frame from video (Fallback)
        const canvas = document.createElement('canvas');
        const sourceWidth = videoElement.videoWidth;
        const sourceHeight = videoElement.videoHeight;
        console.log(`Video Dimensions: ${sourceWidth}x${sourceHeight}`);

        // The UI shows a scan guide of roughly 288x72 pixels (4:1 ratio for 46x11mm sticker)
        // We want to crop the center of the video feed to match this area
        // Sticker is ~4:1 ratio (width:height)
        const cropWidth = sourceWidth * 0.75; // Capture 75% of width
        const cropHeight = cropWidth / 4; // 4:1 ratio like the sticker

        const startX = (sourceWidth - cropWidth) / 2;
        const startY = (sourceHeight - cropHeight) / 2;

        canvas.width = cropWidth;
        canvas.height = cropHeight;

        const ctx = canvas.getContext('2d');

        if (!ctx) {
            throw new Error("Failed to create canvas context");
        }

        // Draw crop of video frame to canvas
        ctx.drawImage(
            videoElement,
            startX, startY, cropWidth, cropHeight, // Source crop
            0, 0, cropWidth, cropHeight            // Destination
        );

        imageBase64 = canvas.toDataURL('image/jpeg', 0.9);
        console.log(`Captured Image Length: ${imageBase64.length}`);
    }

    // Preprocess image (only if capturing from video, CV image is already good)
    let processedImage = imageBase64;
    if (!imageOverride) {
        try {
            processedImage = await preprocessImage(imageBase64);
        } catch (e) {
            console.warn("Preprocessing failed, using raw image", e);
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


