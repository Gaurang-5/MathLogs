import { processWhatsappQueue } from './src/utils/whatsappWorker';
import { prisma } from './src/prisma';
import * as dotenv from 'dotenv';
import path from 'path';
import { runNightlyReconciliation } from './src/utils/reconciliation';
import { startOcrCacheCleanup, stopOcrCacheCleanup } from './src/utils/ocrCache';

dotenv.config({ path: path.resolve(__dirname, '.env') });

let isShuttingDown = false;

const startWorker = () => {
    console.log('✅ Background Worker Started');

    // 1. WhatsApp Queue Polling
    const pollQueue = async () => {
        if (isShuttingDown) return;
        try {
            const processedCount = await processWhatsappQueue();
            if (processedCount !== undefined) {
                // If it processed something, poll faster, otherwise wait 2s
                setTimeout(pollQueue, processedCount > 0 ? 100 : 2000);
            } else {
                setTimeout(pollQueue, 2000);
            }
        } catch (err) {
            console.error('[Worker] Error in pollQueue:', err);
            setTimeout(pollQueue, 5000);
        }
    };
    pollQueue();

    // 2. OCR Cache Cleanup (every 5 minutes)
    startOcrCacheCleanup();

    // 3. Nightly Reconciliation Job
    const scheduleNextReconciliation = () => {
        if (isShuttingDown) return;
        const now = new Date();
        const nextRun = new Date();
        nextRun.setHours(2, 0, 0, 0); // 2 AM today
        if (now.getTime() >= nextRun.getTime()) {
            // If it's already past 2 AM, schedule for tomorrow
            nextRun.setDate(nextRun.getDate() + 1);
        }
        
        const delay = nextRun.getTime() - now.getTime();
        
        setTimeout(async () => {
            if (isShuttingDown) return;
            await runNightlyReconciliation();
            // Schedule the next one
            scheduleNextReconciliation();
        }, delay).unref();
    };
    
    scheduleNextReconciliation();

    // 3. Graceful Shutdown on SIGTERM
    process.on('SIGTERM', () => {
        console.log('SIGTERM received. Shutting down worker gracefully...');
        isShuttingDown = true;
        stopOcrCacheCleanup();
        process.exit(0);
    });
    
    // Also handle SIGINT (Ctrl+C) for local dev
    process.on('SIGINT', () => {
        console.log('SIGINT received. Shutting down worker gracefully...');
        isShuttingDown = true;
        stopOcrCacheCleanup();
        process.exit(0);
    });
};

startWorker();
