
import axios from 'axios';
import { prisma } from '../prisma';

const META_API_VERSION = 'v22.0';
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

const BATCH_SIZE = 5; // Conservative to stay within Meta rate limits

/**
 * Worker Function: Polls for pending WhatsApp jobs and sends them.
 *
 * CRITICAL FIX (P0-B): Uses `FOR UPDATE SKIP LOCKED` to prevent duplicate messages
 * when running multiple server instances (e.g. 2 Heroku dynos).
 *
 * Old code: findMany(take: 5) → both dynos grab same 5 jobs → double-sends
 * New code: Postgres row-level locks ensure each job is claimed by exactly ONE worker
 */
export const processWhatsappQueue = async () => {
    if (!WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_ACCESS_TOKEN) {
        console.warn('[WhatsApp Worker] API credentials missing. Skipping...');
        return;
    }

    try {
        // CRITICAL: Transactional claim with advisory locking — safe for horizontal scaling
        const claimedJobs = await prisma.$transaction(async (tx) => {
            // 1. Atomically select and lock rows nobody else is processing
            const lockedIds: { id: string }[] = await tx.$queryRaw`
                SELECT id FROM "WhatsappJob"
                WHERE status = 'PENDING'
                  AND attempts < 3
                ORDER BY "createdAt" ASC
                LIMIT ${BATCH_SIZE}
                FOR UPDATE SKIP LOCKED
            `;

            if (lockedIds.length === 0) return [];

            const ids = lockedIds.map(row => row.id);

            // 2. Mark as PROCESSING inside the same transaction
            // This is committed atomically, so no other worker can grab these rows
            await tx.whatsappJob.updateMany({
                where: { id: { in: ids } },
                data: {
                    status: 'PROCESSING',
                    attempts: { increment: 1 }
                }
            });

            // 3. Return full job data for processing outside the transaction
            return await tx.whatsappJob.findMany({
                where: { id: { in: ids } }
            });
        });

        if (claimedJobs.length === 0) return;

        console.log(`[WhatsApp Worker] Claimed ${claimedJobs.length} jobs (lock-safe).`);

        // Process all claimed jobs concurrently (outside transaction to avoid long lock times)
        await Promise.allSettled(claimedJobs.map(job => processJob(job)));

    } catch (error) {
        console.error('[WhatsApp Worker] Queue processing error:', error);
    }
};

/**
 * Processes a single claimed job (status is already PROCESSING when this runs)
 */
const processJob = async (job: any) => {
    try {
        if (!job.recipient || !job.templateId) {
            throw new Error('Missing recipient or template ID');
        }

        const payload = {
            messaging_product: 'whatsapp',
            to: job.recipient,
            type: 'template',
            template: {
                name: job.templateId,
                language: { code: 'en' },
                components: [
                    {
                        type: 'body',
                        parameters: (job.data as string[]).map(val => ({
                            type: 'text',
                            text: val.toString()
                        }))
                    }
                ]
            }
        };

        const response = await axios.post(
            `https://graph.facebook.com/${META_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000 // 10s timeout to prevent hanging jobs
            }
        );

        const messageId = response.data.messages?.[0]?.id;
        console.log(`[WhatsApp Worker] Job ${job.id} Sent. MsgId: ${messageId}`);

        await prisma.whatsappJob.update({
            where: { id: job.id },
            data: {
                status: 'COMPLETED',
                messageId: messageId,
                error: null
            }
        });

    } catch (error: any) {
        const errorDetail = JSON.stringify(error.response?.data || error.message);
        console.error(`[WhatsApp Worker] Job ${job.id} Failed:`, errorDetail);

        // Note: attempts already incremented at claim time, so check current value
        const isExhausted = job.attempts >= 3; // job.attempts was incremented before this runs

        await prisma.whatsappJob.update({
            where: { id: job.id },
            data: {
                status: isExhausted ? 'FAILED' : 'PENDING',
                error: errorDetail.substring(0, 500) // Truncate to prevent DB bloat
            }
        });
    }
};
