import { PrismaClient } from '@prisma/client';
import { sendEmail } from './email'; // Your existing email utility
import { secureLogger } from './secureLogger';

const prisma = new PrismaClient();

const BATCH_SIZE = 5; // Process 5 emails at a time
const POLLING_INTERVAL = 5000; // Check every 5 seconds

export class EmailWorker {
    private isProcessing = false;

    start() {
        console.log('[EmailWorker] Starting background worker...');
        setInterval(() => this.processQueue(), POLLING_INTERVAL);
    }

    async processQueue() {
        if (this.isProcessing) return; // Prevent overlapping runs
        this.isProcessing = true;

        try {
            // 1. Fetch PENDING jobs
            const jobs = await prisma.emailJob.findMany({
                where: { status: 'PENDING' },
                take: BATCH_SIZE,
                orderBy: { createdAt: 'asc' }
            });

            if (jobs.length === 0) {
                this.isProcessing = false;
                return;
            }

            console.log(`[EmailWorker] Processing ${jobs.length} emails...`);

            // 2. Process concurrently
            await Promise.all(jobs.map(job => this.processJob(job)));

        } catch (error) {
            console.error('[EmailWorker] Error processing queue:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    private async processJob(job: any) {
        // Lock the job immediately
        try {
            await prisma.emailJob.update({
                where: { id: job.id },
                data: { status: 'PROCESSING' }
            });

            // Send Email
            const { senderName, replyTo, senderType } = job.options || {};

            const start = Date.now();
            const result = await sendEmail(
                job.recipient,
                job.subject,
                job.body,
                { senderName, replyTo, senderType }
            );
            const duration = Date.now() - start;

            if (result.success) {
                await prisma.emailJob.update({
                    where: { id: job.id },
                    data: {
                        status: 'COMPLETED',
                        updatedAt: new Date()
                    }
                });
                secureLogger.info(`[EmailWorker] Job ${job.id} sent to ${job.recipient} in ${duration}ms`);
            } else {
                throw new Error(result.error);
            }

        } catch (error: any) {
            console.error(`[EmailWorker] Failed job ${job.id}:`, error.message);

            const attempts = job.attempts + 1;
            const status = attempts >= job.maxAttempts ? 'FAILED' : 'PENDING';

            await prisma.emailJob.update({
                where: { id: job.id },
                data: {
                    status,
                    attempts,
                    error: error.message,
                    updatedAt: new Date()
                }
            });
        }
    }
}

export const emailWorker = new EmailWorker();
