import { PrismaClient } from '@prisma/client';
import { sendEmail } from './email'; // Your existing email utility
import { secureLogger } from './secureLogger';

const prisma = new PrismaClient();

const BATCH_SIZE = 20; // Increased concurrency
const POLLING_INTERVAL = 2000; // Faster polling

export class EmailWorker {
    private isProcessing = false;

    start() {
        console.log('[EmailWorker] Starting robust background worker...');
        setInterval(() => this.processQueue(), POLLING_INTERVAL);
    }

    async processQueue() {
        // Remove 'isProcessing' check to allow true parallelism if we scaled horizontally.
        // But for single node, it prevents event loop starvation.
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            // 1. Transactional Claim: Select & Lock Rows
            // "FOR UPDATE SKIP LOCKED" is the gold standard for job queues in Postgres
            const claimedJobs = await prisma.$transaction(async (tx) => {
                // Fetch IDs of jobs we're claiming
                const lockedIds: { id: string }[] = await tx.$queryRaw`
                    SELECT id FROM "EmailJob" 
                    WHERE status = 'PENDING' 
                    ORDER BY "createdAt" ASC 
                    LIMIT ${BATCH_SIZE} 
                    FOR UPDATE SKIP LOCKED
                `;

                if (lockedIds.length === 0) return [];

                const ids = lockedIds.map(row => row.id);

                // Mark them as PROCESSING immediately so no one else sees them provided the transaction commits
                // UPDATE "EmailJob" SET status='PROCESSING' WHERE id IN (...)
                await tx.emailJob.updateMany({
                    where: { id: { in: ids } },
                    data: { status: 'PROCESSING' }
                });

                // Return the full job details
                return await tx.emailJob.findMany({
                    where: { id: { in: ids } }
                });
            });

            if (claimedJobs.length === 0) {
                this.isProcessing = false;
                return;
            }

            console.log(`[EmailWorker] Claimed ${claimedJobs.length} jobs.`);

            // 2. Process concurrently (outside transaction)
            // We use Promise.allSettled to ensure all get a chance to complete
            await Promise.allSettled(claimedJobs.map(job => this.processJob(job)));

        } catch (error) {
            console.error('[EmailWorker] Error processing queue:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    private async processJob(job: any) {
        try {
            // Send Email
            // Note: Job is already 'PROCESSING'
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
            // Exponential backoff could be implemented by updating 'createdAt' to future date, 
            // but current schema doesn't support 'scheduledAt'. PENDING will retry next cycle.

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
