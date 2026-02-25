
// Web Worker for OpenCV Image Processing
// This prevents UI freezes during heavy CV operations

// We need to import OpenCV.js inside the worker environment
// self.importScripts is standard in workers
declare function importScripts(...urls: string[]): void;

// Define OpenCV global variable for TS
declare global {
    interface Window {
        cv: any;
    }
}
let cv: any = null;

// Initialize OpenCV
function loadOpenCV() {
    if (cv) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
        // We'll load from CDN or local public folder
        // Using the same URL as the main thread for caching benefits
        try {
            importScripts('https://docs.opencv.org/4.8.0/opencv.js');

            // Wait for runtime initialization
            if (self.cv) {
                cv = self.cv;
                if (cv.getBuildInformation) {
                    resolve();
                } else {
                    cv.onRuntimeInitialized = () => {
                        resolve();
                    };
                }
            } else {
                reject(new Error("Failed to load OpenCV script in worker"));
            }
        } catch (e) {
            reject(e);
        }
    });
}

// Processing Logic (Migrated from cv.ts)
function detectAndWarp(imageData: ImageData): { success: boolean, data?: Uint8Array, width?: number, height?: number } {
    if (!cv) return { success: false };

    try {
        const src = cv.matFromImageData(imageData);
        const gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

        // 2. Blur to reduce noise
        const blurred = new cv.Mat();
        cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

        // 3. Adaptive Threshold (works better for varying lighting)
        const binary = new cv.Mat();
        cv.adaptiveThreshold(blurred, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);

        // 4. Find Contours
        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();
        cv.findContours(binary, contours, hierarchy, cv.RETR_TREE, cv.CHAIN_APPROX_SIMPLE);

        let bestContour = null;
        let maxArea = 0;

        // sticker aspect ratio = 42mm / 23mm = ~1.826
        const TARGET_RATIO = 1.826;
        const RATIO_TOLERANCE = 0.5; // Stricter tolerance now that it's less extreme

        for (let i = 0; i < contours.size(); ++i) {
            const cnt = contours.get(i);
            const area = cv.contourArea(cnt);

            if (area < 5000) continue;

            const peri = cv.arcLength(cnt, true);
            const approx = new cv.Mat();
            cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

            if (approx.rows === 4) {
                const rect = cv.boundingRect(approx);
                const aspectRatio = rect.width / rect.height;

                if (aspectRatio > (TARGET_RATIO - RATIO_TOLERANCE) &&
                    aspectRatio < (TARGET_RATIO + RATIO_TOLERANCE)) {

                    if (area > maxArea) {
                        maxArea = area;
                        bestContour = approx.clone();
                    }
                }
            }
            approx.delete();
        }

        // Cleanup detection mats
        gray.delete(); blurred.delete(); binary.delete(); contours.delete(); hierarchy.delete();

        if (bestContour) {
            // Found candidate!
            const pointsData = [];
            let sumX = 0;
            let sumY = 0;

            for (let i = 0; i < 4; i++) {
                const px = bestContour.data32S[i * 2];
                const py = bestContour.data32S[i * 2 + 1];
                pointsData.push({ x: px, y: py });
                sumX += px;
                sumY += py;
            }

            // Calculate Centroid
            const centerX = sumX / 4;
            const centerY = sumY / 4;

            // Sort points by angle from centroid (-PI to PI)
            // This gives us points in counter-clockwise order (usually BR -> TR -> TL -> BL or similar depending on start)
            // We need to identify Top-Left first.

            // In a wide rectangle (4.18 ratio), the points are distinct.
            // We can sort by angle:
            // TL should be around -135 deg (-3PI/4) or similar relative to center?
            // Actually simpler:
            // Top-Left:  x < cx, y < cy
            // Top-Right: x > cx, y < cy
            // Bot-Right: x > cx, y > cy
            // Bot-Left:  x < cx, y > cy

            // BUT this fails if rotated 45 degrees.

            // Robust Method: Sort by Y first to separate Top/Bottom? No that fails on 90 deg rotation.

            // Robust Method 2: Sum of (x + y) is min for TL, max for BR.
            // Diff (y - x) is min for TR, max for BL.
            // This works for moderate rotations (< 45 deg).

            // Robust Method 3 (General):
            // Sort angularly around center.
            pointsData.sort((a, b) => {
                return Math.atan2(a.y - centerY, a.x - centerX) - Math.atan2(b.y - centerY, b.x - centerX);
            });

            // Now points are ordered angularly. We need to find the "first" point (Top-Left).
            // Since the sticker is very wide (4:1), the "Top" edge and "Bottom" edge are long.
            // The distance between [0]-[1] should be large (width) or small (height).

            // Let's assume the user holds it ROUGHLY upright (+/- 45 deg).
            // In that case, we can find TL by min(x+y).

            // Let's use the sum/diff approach for now as it's robust for handheld scanning (+/- 45 deg).
            // If we want FULL 360 freedom, we need L-marker detection (Phase 3).

            const sortedPoints = [
                { x: 0, y: 0 }, // TL
                { x: 0, y: 0 }, // TR
                { x: 0, y: 0 }, // BR
                { x: 0, y: 0 }  // BL
            ];

            // sums = x + y  (min = TL, max = BR)
            // diffs = y - x (min = TR, max = BL)

            let minSum = Infinity, maxSum = -Infinity;
            let minDiff = Infinity, maxDiff = -Infinity;

            pointsData.forEach(p => {
                const sum = p.x + p.y;
                const diff = p.y - p.x;

                if (sum < minSum) { minSum = sum; sortedPoints[0] = p; }
                if (sum > maxSum) { maxSum = sum; sortedPoints[2] = p; }
                if (diff < minDiff) { minDiff = diff; sortedPoints[1] = p; }
                if (diff > maxDiff) { maxDiff = diff; sortedPoints[3] = p; }
            });

            const orderedPoints = sortedPoints;

            // Destination coordinates (600x328 matches ~1.826 ratio, shrunk for speed)
            const dstWidth = 600;
            const dstHeight = 328;

            const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
                orderedPoints[0].x, orderedPoints[0].y,
                orderedPoints[1].x, orderedPoints[1].y,
                orderedPoints[2].x, orderedPoints[2].y,
                orderedPoints[3].x, orderedPoints[3].y
            ]);

            const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
                0, 0,
                dstWidth, 0,
                dstWidth, dstHeight,
                0, dstHeight
            ]);

            const M = cv.getPerspectiveTransform(srcTri, dstTri);
            const dsize = new cv.Size(dstWidth, dstHeight);
            const dst = new cv.Mat();

            cv.warpPerspective(src, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

            // Convert result to raw pixel data to send back
            // We can't send Mat back, and toDataURL is slow in worker (no canvas DOM)
            // Best practice: Send ImageData buffer

            // However, OpenCv.js doesn't have easy Mat->ArrayBuffer without Canvas in some versions
            // We can use data() to get the raw pointer.

            // For simplicity in this P1 refactor, we will rely on a neat trick:
            // Respond with raw bytes. Main thread converts to Canvas.

            const imgData = new Uint8Array(dst.data); // Copy data
            // const channels = dst.channels(); // Should be 4 (RGBA)
            const cols = dst.cols;
            const rows = dst.rows;

            // Cleanup
            srcTri.delete(); dstTri.delete(); M.delete(); bestContour.delete(); src.delete(); dst.delete();

            return {
                success: true,
                data: imgData,
                width: cols,
                height: rows
            };
        }

        src.delete();
        return { success: false };

    } catch (e) {
        console.error("Worker CV Error:", e);
        return { success: false };
    }
}

// Message Handler
self.onmessage = async (e: MessageEvent) => {
    const { type, imageData, id } = e.data;

    if (type === 'INIT') {
        try {
            await loadOpenCV();
            postMessage({ type: 'INIT_SUCCESS', id });
        } catch (err: any) {
            postMessage({ type: 'ERROR', error: err.message, id });
        }
    } else if (type === 'DETECT') {
        if (!cv) {
            postMessage({ type: 'ERROR', error: 'OpenCV not initialized', id });
            return;
        }

        const result = detectAndWarp(imageData);

        if (result.success && result.data) {
            // Transfer buffer ownership for performance
            postMessage({
                type: 'DETECT_SUCCESS',
                id,
                width: result.width,
                height: result.height,
                data: result.data
            }, [result.data.buffer] as any);
        } else {
            postMessage({ type: 'DETECT_FAIL', id });
        }
    }
};
