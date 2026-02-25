
import axios from 'axios';
import { prisma } from '../prisma';

const META_API_VERSION = 'v22.0'; // Or latest version
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID; // Your Meta Phone ID
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN; // Your System User Token

/**
 * Worker Function: Polls for pending WhatsApp jobs and sends them.
 * Should be called periodically (e.g., every 5 seconds).
 */
export const processWhatsappQueue = async () => {
    if (!WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_ACCESS_TOKEN) {
        console.warn('[WhatsApp Worker] API credentials missing in .env. Skipping...');
        return;
    }

    try {
        // Fetch pending jobs (limit 5 to avoid rate limits)
        const jobs = await prisma.whatsappJob.findMany({
            where: {
                status: 'PENDING',
                attempts: { lt: 3 } // Max 3 retries
            },
            take: 5,
            orderBy: { createdAt: 'asc' } // FIFO
        });

        if (jobs.length === 0) return; // No jobs

        console.log(`[WhatsApp Worker] Processing ${jobs.length} jobs...`);

        // Process jobs in parallel (careful with rate limits)
        await Promise.all(jobs.map(processJob));

    } catch (error) {
        console.error('[WhatsApp Worker] Queue processing error:', error);
    }
};

/**
 * Processes a single job
 */
const processJob = async (job: any) => {
    // 1. Mark as PROCESSING (Optimistic Locking)
    await prisma.whatsappJob.update({
        where: { id: job.id },
        data: { status: 'PROCESSING', attempts: { increment: 1 } }
    });

    try {
        // 2. Validate inputs
        if (!job.recipient || !job.templateId) {
            throw new Error('Missing recipient or template ID');
        }

        // 3. Format payload for Meta API
        // "template": { "name": "hello_world", "language": { "code": "en_US" } }
        const payload = {
            messaging_product: 'whatsapp',
            to: job.recipient,
            type: 'template',
            template: {
                name: job.templateId,
                language: { code: 'en_US' }, // Default language
                components: [
                    {
                        type: 'body',
                        parameters: (job.data as string[]).map(val => ({
                            type: 'text',
                            text: val.toString() // Ensure it's a string
                        }))
                    }
                ]
            }
        };

        // 4. Send Request to Meta
        const response = await axios.post(
            `https://graph.facebook.com/${META_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        // 5. Build success status
        const messageId = response.data.messages?.[0]?.id;
        console.log(`[WhatsApp Worker] Job ${job.id} Sent! MsgId: ${messageId}`);

        // 6. Mark COMPLETED
        await prisma.whatsappJob.update({
            where: { id: job.id },
            data: {
                status: 'COMPLETED',
                messageId: messageId,
                error: null // Clear previous errors
            }
        });

    } catch (error: any) {
        console.error(`[WhatsApp Worker] Job ${job.id} Failed:`, error.response?.data || error.message);

        // 7. Handle Failure
        const isRetryable = job.attempts < 3;

        await prisma.whatsappJob.update({
            where: { id: job.id },
            data: {
                status: isRetryable ? 'PENDING' : 'FAILED', // If retries left, put back to PENDING
                error: JSON.stringify(error.response?.data || error.message)
            }
        });
    }
};

// Start the worker loop if this file is run directly (or call from main server)
// In production, use a dedicated process manager or cron job.
// For now, we'll export it and hook it into server/index.ts
