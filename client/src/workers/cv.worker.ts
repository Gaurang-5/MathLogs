
// Web Worker for OpenCV Image Processing
// This prevents UI freezes during heavy CV operations

// We need to import OpenCV.js inside the worker environment
// self.importScripts is standard in workers
declare function importScripts(...urls: string[]): void;

interface OpenCVMat {
    rows: number;
    cols: number;
    data: Uint8Array;
    delete(): void;
}

interface OpenCVMatVector {
    size(): number;
    get(index: number): OpenCVMat;
    delete(): void;
}

interface OpenCVMoments {
    m00: number;
    m10: number;
    m01: number;
}

interface OpenCVModule {
    Mat: new () => OpenCVMat;
    MatVector: new () => OpenCVMatVector;
    Size: new (width: number, height: number) => unknown;
    Scalar: new () => unknown;
    COLOR_RGBA2GRAY: number;
    ADAPTIVE_THRESH_GAUSSIAN_C: number;
    THRESH_BINARY: number;
    THRESH_BINARY_INV: number;
    RETR_TREE: number;
    CHAIN_APPROX_SIMPLE: number;
    CV_32FC2: number;
    INTER_LINEAR: number;
    BORDER_CONSTANT: number;
    onRuntimeInitialized?: () => void;
    getBuildInformation?: () => string;
    matFromImageData(imageData: ImageData): OpenCVMat;
    cvtColor(src: OpenCVMat, dst: OpenCVMat, code: number, dstCn: number): void;
    GaussianBlur(src: OpenCVMat, dst: OpenCVMat, ksize: unknown, sigmaX: number): void;
    adaptiveThreshold(src: OpenCVMat, dst: OpenCVMat, maxValue: number, adaptiveMethod: number, thresholdType: number, blockSize: number, c: number): void;
    findContours(image: OpenCVMat, contours: OpenCVMatVector, hierarchy: OpenCVMat, mode: number, method: number): void;
    contourArea(contour: OpenCVMat): number;
    boundingRect(contour: OpenCVMat): { width: number; height: number };
    convexHull(curve: OpenCVMat, hull: OpenCVMat, clockwise: boolean, returnPoints: boolean): void;
    arcLength(curve: OpenCVMat, closed: boolean): number;
    approxPolyDP(curve: OpenCVMat, approxCurve: OpenCVMat, epsilon: number, closed: boolean): void;
    moments(array: OpenCVMat, binaryImage: boolean): OpenCVMoments;
    matFromArray(rows: number, cols: number, type: number, data: number[]): OpenCVMat;
    getPerspectiveTransform(src: OpenCVMat, dst: OpenCVMat): OpenCVMat;
    warpPerspective(src: OpenCVMat, dst: OpenCVMat, m: OpenCVMat, dsize: unknown, flags: number, borderMode: number, borderValue: unknown): void;
}

interface WorkerWithCv extends DedicatedWorkerGlobalScope {
    cv?: OpenCVModule;
}

let cv: OpenCVModule | null = null;
const workerScope = self as WorkerWithCv;

// Initialize OpenCV
function loadOpenCV() {
    if (cv) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
        // We'll load from CDN or local public folder
        // Using the same URL as the main thread for caching benefits
        try {
            importScripts('https://docs.opencv.org/4.8.0/opencv.js');

            // Wait for runtime initialization
            if (workerScope.cv) {
                cv = workerScope.cv;
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
        } catch (error: unknown) {
            reject(error);
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
        cv.adaptiveThreshold(blurred, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 11, 2);

        // 4. Find Contours
        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();
        cv.findContours(binary, contours, hierarchy, cv.RETR_TREE, cv.CHAIN_APPROX_SIMPLE);

        const markers: Array<{ x: number, y: number; area: number }> = [];
        const frameArea = src.rows * src.cols;
        const minMarkerArea = Math.max(80, frameArea * 0.00005);
        const maxMarkerArea = Math.max(5000, frameArea * 0.02);

        // 5. Hierarchical Contour Analysis for 'L' Marker Detection
        // An 'L' marker is an irregular polygon (usually 6 vertices)
        // Check size, bounding rect, and solidity to find the 4 markers.
        for (let i = 0; i < contours.size(); ++i) {
            const cnt = contours.get(i);
            const area = cv.contourArea(cnt);

            // Filter by area relative to the frame so high-res cameras do not get rejected.
            if (area < minMarkerArea || area > maxMarkerArea) continue;

            const rect = cv.boundingRect(cnt);
            const aspectRatio = rect.width / rect.height;

            // L markers are roughly square in bounding box aspect ratio
            if (aspectRatio < 0.6 || aspectRatio > 1.6) continue;

            // Check Solidity (Contour Area / Convex Hull Area)
            // A solid square has solidity ~1.0, but an "L" has empty space inside its bounds.
            // Solidity for an L shape is typically between 0.3 and 0.75.
            const hull = new cv.Mat();
            cv.convexHull(cnt, hull, false, true);
            const hullArea = cv.contourArea(hull);
            const solidity = area / hullArea;
            hull.delete();

            if (solidity > 0.3 && solidity < 0.75) {
                // Approximate the polygon and verify ~6 vertices
                const peri = cv.arcLength(cnt, true);
                const approx = new cv.Mat();
                cv.approxPolyDP(cnt, approx, 0.04 * peri, true);
                
                // Allow some tolerance for scanned/noisy shapes (5-8 vertices)
                if (approx.rows >= 5 && approx.rows <= 8) {
                    const M = cv.moments(cnt, false);
                    if (M.m00 !== 0) {
                        const cx = M.m10 / M.m00;
                        const cy = M.m01 / M.m00;
                        markers.push({ x: cx, y: cy, area });
                    }
                }
                approx.delete();
            }
        }

        // Cleanup detection mats
        gray.delete(); blurred.delete(); binary.delete(); contours.delete(); hierarchy.delete();

        if (markers.length >= 4) {
            const pickClosestToCorner = (
                candidates: Array<{ x: number, y: number; area: number }>,
                targetX: number,
                targetY: number
            ) => {
                let best: { x: number, y: number; area: number } | null = null;
                let bestScore = Infinity;

                for (const candidate of candidates) {
                    const distance = Math.hypot(candidate.x - targetX, candidate.y - targetY);
                    const areaBonus = candidate.area * 0.0005;
                    const score = distance - areaBonus;
                    if (score < bestScore) {
                        bestScore = score;
                        best = candidate;
                    }
                }

                return best;
            };

            const centerX = src.cols / 2;
            const centerY = src.rows / 2;

            const topLeft = pickClosestToCorner(markers.filter((p) => p.x <= centerX && p.y <= centerY), 0, 0);
            const topRight = pickClosestToCorner(markers.filter((p) => p.x >= centerX && p.y <= centerY), src.cols, 0);
            const bottomRight = pickClosestToCorner(markers.filter((p) => p.x >= centerX && p.y >= centerY), src.cols, src.rows);
            const bottomLeft = pickClosestToCorner(markers.filter((p) => p.x <= centerX && p.y >= centerY), 0, src.rows);

            if (!topLeft || !topRight || !bottomRight || !bottomLeft) {
                src.delete();
                return { success: false };
            }

            const orderedPoints = [topLeft, topRight, bottomRight, bottomLeft];

            // Destination coordinates match 3.9cm × 2.1cm sticker ratio (39/21 ≈ 1.857)
            // 1200px wide for high-res sharpness → height = 1200 / (39/21) ≈ 646px
            const dstWidth = 1200;
            const dstHeight = 646;

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
            const imgData = new Uint8Array(dst.data); // Copy data
            const cols = dst.cols;
            const rows = dst.rows;

            // Cleanup
            srcTri.delete(); dstTri.delete(); M.delete(); src.delete(); dst.delete();

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
        } catch (error: unknown) {
            postMessage({ type: 'ERROR', error: error instanceof Error ? error.message : 'OpenCV init failed', id });
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
            }, [result.data.buffer as ArrayBuffer]);
        } else {
            postMessage({ type: 'DETECT_FAIL', id });
        }
    }
};
