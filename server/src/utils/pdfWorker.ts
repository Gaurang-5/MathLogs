/**
 * pdfWorker.ts
 *
 * FIX (P0-C): PDFKit is CPU-synchronous and blocks the entire Express Event Loop
 * when run in the main thread. Under concurrent load (5 teachers exporting PDFs),
 * the main thread was frozen for 1-2.5 seconds, causing health check failures and
 * OCR timeouts.
 *
 * This module runs PDFKit in a Node.js worker_thread, keeping the main thread free.
 *
 * Usage:
 *   const pdfBuffer = await runPdfInWorker(workerScript, data);
 *   res.setHeader('Content-Type', 'application/pdf');
 *   res.send(pdfBuffer);
 */

import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import path from 'path';

/**
 * Run a PDF generation function in a separate worker thread.
 *
 * @param workerScriptPath - Absolute path to the worker script file
 * @param data - Serializable data to pass to the worker
 * @param timeoutMs - Max time to wait for PDF generation (default: 30s)
 * @returns Buffer containing the generated PDF
 */
export function runPdfInWorker(
    workerScriptPath: string,
    data: unknown,
    timeoutMs = 30_000
): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const worker = new Worker(workerScriptPath, {
            workerData: data,
        });

        let settled = false;

        const timeout = setTimeout(() => {
            if (!settled) {
                settled = true;
                worker.terminate();
                reject(new Error(`PDF worker timed out after ${timeoutMs}ms`));
            }
        }, timeoutMs);

        worker.on('message', (buffer: Buffer) => {
            if (!settled) {
                settled = true;
                clearTimeout(timeout);
                resolve(buffer);
            }
        });

        worker.on('error', (err) => {
            if (!settled) {
                settled = true;
                clearTimeout(timeout);
                reject(err);
            }
        });

        worker.on('exit', (code) => {
            if (!settled) {
                settled = true;
                clearTimeout(timeout);
                reject(new Error(`PDF worker exited unexpectedly with code ${code}`));
            }
        });
    });
}
