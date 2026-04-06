import axios from 'axios';
import { prisma } from '../prisma';

/**
 * ============================================================================
 * WHATSAPP WORKER (Meta Graph API)
 * ============================================================================
 * ROLE: This file is a BACKGROUND WORKER designed for the official Meta Graph API.
 * It polls the `WhatsappJob` database table to process messages concurrently.
 * 
 * WHY IS THIS DISTINCT FROM `whatsapp.ts`?
 * - `whatsapp.ts`: Used currently by controllers to push messages into the DB queue.
 * - `whatsappWorker.ts` (This file): Operates strictly on DB queue (`WhatsappJob`)
 *   and uses the Meta `v22.0` Graph API endpoint.
 * 
 * STATUS: This worker provides robust, lock-based concurrency control
 * (`FOR UPDATE SKIP LOCKED`) safe for horizontal scaling (e.g. multiple dynos).
 * ============================================================================
 */

const META_API_VERSION = 'v22.0';
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

console.log(`[Worker Boot] Loaded Access Token starting with: ${WHATSAPP_ACCESS_TOKEN ? WHATSAPP_ACCESS_TOKEN.substring(0, 15) : 'UNDEFINED'}`);

const BATCH_SIZE = 25; // Safely increased to 25 for higher throughput without hitting rate limits

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
        return 0;
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

        if (claimedJobs.length === 0) return 0;

        console.log(`[WhatsApp Worker] Claimed ${claimedJobs.length} jobs (lock-safe).`);

        // Process all claimed jobs concurrently (outside transaction to avoid long lock times)
        await Promise.allSettled(claimedJobs.map(job => processJob(job)));

        return claimedJobs.length;
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

        // Meta Graph API mapping for named variables across different templates.
        const TEMPLATE_VAR_MAP: Record<string, { body: string[], buttonIndex?: number }> = {
            'welcome_approval_1': { body: ['var_1', 'var_2', 'var_3', 'var_4'] },
            'payment_receipt_1': { body: ['student_name', 'amount_paid', 'installment_name', 'institute_name'] },
            'test_marks_update': { body: ['student_name', 'institute_name', 'test_name', 'total_marks', 'marks_obtained'] },
            'onboarding_invite': { body: ['owner_name', 'tuition_name', 'setup_link'], buttonIndex: 2 },
            'onboarding_setup_link': { body: ['owner_name', 'tuition_name', 'setup_link'], buttonIndex: 2 },
            'fee_breakup_alert_1': { body: ['student_name', 'batch_name', 'fee_breakup', 'total_amount', 'institute_name'] },
            'mathlogs_login_otp': { body: ['otp'] },
            'student_registration_link': { body: ['var_1', 'var_2', 'var_3'], buttonIndex: 2 },
            'attendance_checkin_alert': { body: ['student_name', 'batch_name', 'institute_name', 'checkin_time', 'photo_url'] },
            'attendance_absent_alert': { body: ['student_name', 'batch_name', 'institute_name', 'scheduled_time'] }
        };

        const mapConfig = TEMPLATE_VAR_MAP[job.templateId];
        const bodyValues = job.data as string[];
        const components: any[] = [];

        if (mapConfig) {
            // 1. Build the Body Component
            components.push({
                type: 'body',
                parameters: mapConfig.body.map((paramName, index) => ({
                    type: 'text',
                    parameter_name: paramName,
                    text: bodyValues[index] ? bodyValues[index].toString() : ''
                }))
            });

            // 2. Build the CTA Button Component (if configured)
            if (mapConfig.buttonIndex !== undefined && mapConfig.buttonIndex < bodyValues.length) {
                let buttonVal = bodyValues[mapConfig.buttonIndex]?.toString() || '';
                
                try {
                    // Meta strictly expects ONLY the suffix (e.g. from https://mathlogs.app/setup?token=123 -> setup?token=123)
                    const urlObj = new URL(buttonVal);
                    buttonVal = (urlObj.pathname + urlObj.search).replace(/^\/+/, '');
                } catch (e) {
                    buttonVal = buttonVal.replace(/^\/+/, '');
                }

                components.push({
                    type: 'button',
                    sub_type: 'url',
                    index: '0', 
                    parameters: [
                        { type: 'text', text: buttonVal }
                    ]
                });
            }
        } else {
            // Strict default mapping for completely unknown templates
            components.push({
                type: 'body',
                parameters: bodyValues.map((val, index) => ({
                    type: 'text',
                    parameter_name: `var_${index + 1}`,
                    text: val ? val.toString() : ''
                }))
            });
        }

        const payload = {
            messaging_product: 'whatsapp',
            to: job.recipient,
            type: 'template',
            template: {
                name: job.templateId,
                language: { code: 'en' },
                components: components
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
