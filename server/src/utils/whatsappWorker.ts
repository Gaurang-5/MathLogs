import axios from 'axios';
import { prisma } from '../prisma';
import { secureLogger } from './secureLogger';


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

export const getWhatsAppCredentialLogState = (
    phoneNumberId = WHATSAPP_PHONE_NUMBER_ID,
    accessToken = WHATSAPP_ACCESS_TOKEN
) => ({
    phoneNumberIdConfigured: Boolean(phoneNumberId),
    accessTokenConfigured: Boolean(accessToken)
});

secureLogger.info('[Worker Boot] WhatsApp API configuration', getWhatsAppCredentialLogState());

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
        secureLogger.warn('[WhatsApp Worker] API credentials missing. Skipping...');
        return 0;
    }

    try {
        // ── Step 1: Claim jobs with a short, tight transaction ────────────────
        // We intentionally keep this transaction as short as possible (two queries)
        // so it doesn't hold a pool connection while we fetch full job rows.
        // maxWait: how long to wait for a free connection before giving up (P2028).
        // timeout: max wall-clock time the transaction itself can run.
        const ids: string[] = await prisma.$transaction(async (tx) => {
            const lockedIds: { id: string }[] = await tx.$queryRaw`
                SELECT id FROM "WhatsappJob"
                WHERE status = 'PENDING'
                  AND attempts < 3
                ORDER BY "createdAt" ASC
                LIMIT ${BATCH_SIZE}
                FOR UPDATE SKIP LOCKED
            `;

            if (lockedIds.length === 0) return [];

            const claimedIds = lockedIds.map(row => row.id);

            await tx.whatsappJob.updateMany({
                where: { id: { in: claimedIds } },
                data: { status: 'PROCESSING', attempts: { increment: 1 } }
            });

            return claimedIds;
        }, {
            maxWait: 10_000, // wait up to 10 s for a free pool connection
            timeout: 15_000, // transaction must complete within 15 s
        });


        if (ids.length === 0) return 0;

        // ── Step 2: Fetch full job rows outside the transaction ───────────────
        // This read does NOT need a transaction; it releases the pool connection
        // before we do any network I/O (sending to Meta).
        const claimedJobs = await prisma.whatsappJob.findMany({
            where: { id: { in: ids } }
        });

        secureLogger.info(`[WhatsApp Worker] Claimed ${claimedJobs.length} jobs.`);

        // ── Step 3: Process jobs with capped concurrency ──────────────────────
        // Limit to CONCURRENCY_LIMIT simultaneous DB updates so the 3-connection
        // pool is never fully saturated while the email worker is also running.
        const CONCURRENCY_LIMIT = 5;
        for (let i = 0; i < claimedJobs.length; i += CONCURRENCY_LIMIT) {
            const batch = claimedJobs.slice(i, i + CONCURRENCY_LIMIT);
            await Promise.allSettled(batch.map(job => processWhatsappJob(job)));
        }

        return claimedJobs.length;
    } catch (error) {
        console.error('[WhatsApp Worker] Queue processing error:', error);
        return 0;
    }
};

/**
 * Processes a single claimed job (status is already PROCESSING when this runs)
 */
type MetaPost = typeof axios.post;

const POSITIONAL_TEMPLATE_ENV_KEYS = [
    'WHATSAPP_TEMPLATE_PLAN_PAYMENT_FAILED',
    'WHATSAPP_TEMPLATE_PLAN_PAYMENT_SUCCEEDED',
    'WHATSAPP_TEMPLATE_AUTOPAY_AUTHORIZED',
    'WHATSAPP_TEMPLATE_AUTOPAY_ACTIVATED',
    'WHATSAPP_TEMPLATE_AUTOPAY_CHARGE_UPCOMING',
    'WHATSAPP_TEMPLATE_AUTOPAY_GRACE_ENDING',
    'WHATSAPP_TEMPLATE_AUTOPAY_RECOVERED',
    'WHATSAPP_TEMPLATE_AUTOPAY_CANCELLED',
    'WHATSAPP_TEMPLATE_AUTOPAY_COMPLETED'
] as const;

export const buildDefaultTemplateParameters = (
    templateId: string,
    bodyValues: string[],
    env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
) => {
    const usesPositionalVariables = POSITIONAL_TEMPLATE_ENV_KEYS.some(
        key => env[key]?.trim() === templateId
    );

    return bodyValues.map((val, index) => ({
        type: 'text',
        ...(!usesPositionalVariables ? { parameter_name: `var_${index + 1}` } : {}),
        text: val ? val.toString() : ''
    }));
};

export const processWhatsappJob = async (job: any, post: MetaPost = axios.post) => {
    const claimLinkWhere = {
        OR: [
            { whatsappJobId: job.id },
            ...(job.marketplaceEntityType === 'MarketplaceClaim' && job.marketplaceEntityId
                ? [{ id: job.marketplaceEntityId }]
                : [])
        ]
    };
    const leadLinkWhere = {
        OR: [
            { notificationJobId: job.id },
            ...(job.marketplaceEntityType === 'LeadInquiry' && job.marketplaceEntityId
                ? [{ id: job.marketplaceEntityId }]
                : [])
        ]
    };

    try {
        if (!job.recipient || !job.templateId) {
            throw new Error('Missing recipient or template ID');
        }

        // Meta Graph API mapping for named variables across different templates.
        const TEMPLATE_VAR_MAP: Record<string, { body: string[], buttonIndex?: number, otpButton?: boolean }> = {
            'welcome_approval_1': { body: ['var_1', 'var_2', 'var_3', 'var_4'] },
            'payment_receipt_1': { body: ['student_name', 'amount_paid', 'installment_name', 'institute_name'] },
            'test_marks_update': { body: ['student_name', 'institute_name', 'test_name', 'total_marks', 'marks_obtained'] },
            'onboarding_invite': { body: ['owner_name', 'tuition_name', 'setup_link'], buttonIndex: 2 },
            'onboarding_setup_link': { body: ['owner_name', 'tuition_name', 'setup_link'], buttonIndex: 2 },
            'fee_breakup_alert_1': { body: ['student_name', 'batch_name', 'fee_breakup', 'total_amount', 'upi_payment_link', 'institute_name'] },
            'mathlogs_login_otp': { body: ['otp'], buttonIndex: 0 },
            'student_registration_link': { body: ['var_1', 'var_2', 'var_3'], buttonIndex: 2 },
            ...(process.env.WHATSAPP_TEMPLATE_MARKETPLACE_CLAIM_APPROVED
                ? { [process.env.WHATSAPP_TEMPLATE_MARKETPLACE_CLAIM_APPROVED]: { body: ['claimant_name', 'institute_name', 'login_url'], buttonIndex: 2 } }
                : {}),
            ...(process.env.WHATSAPP_TEMPLATE_MARKETPLACE_CLAIM_REJECTED
                ? { [process.env.WHATSAPP_TEMPLATE_MARKETPLACE_CLAIM_REJECTED]: { body: ['claimant_name', 'institute_name', 'rejection_reason', 'support_url'], buttonIndex: 3 } }
                : {}),
            ...(process.env.WHATSAPP_TEMPLATE_MARKETPLACE_LEAD
                ? { [process.env.WHATSAPP_TEMPLATE_MARKETPLACE_LEAD]: { body: ['owner_name', 'institute_name', 'student_name', 'class_subject_summary', 'settings_url'], buttonIndex: 4 } }
                : {}),
            ...(process.env.WHATSAPP_TEMPLATE_SUPERADMIN_OPERATIONAL
                ? { [process.env.WHATSAPP_TEMPLATE_SUPERADMIN_OPERATIONAL]: { body: ['owner_name', 'institute_name', 'message_title'] } }
                : {})
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

            // 2. Build Copy Code OTP Button (for OTP templates with a "Copy Code" button)
            if (mapConfig.otpButton) {
                const otpCode = bodyValues[0]?.toString() || '';
                components.push({
                    type: 'button',
                    sub_type: 'copy_code',
                    index: '0',
                    parameters: [
                        { type: 'coupon_code', coupon_code: otpCode }
                    ]
                });
            }

            // 3. Build the URL CTA Button Component (if configured)
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
                parameters: buildDefaultTemplateParameters(job.templateId, bodyValues)
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

        const response = await post(
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
        secureLogger.info(`[WhatsApp Worker] Job ${job.id} Sent. MsgId: ${messageId}`);

        const sentAt = new Date();
        await prisma.$transaction([
            prisma.whatsappJob.update({
                where: { id: job.id },
                data: { status: 'COMPLETED', messageId, error: null }
            }),
            prisma.marketplaceClaim.updateMany({
                where: claimLinkWhere,
                data: {
                    whatsappJobId: job.id,
                    communicationStatus: 'SENT', communicationSentAt: sentAt, communicationError: null
                }
            }),
            prisma.leadInquiry.updateMany({
                where: leadLinkWhere,
                data: {
                    notificationJobId: job.id,
                    deliveryStatus: 'DELIVERED', notificationSentAt: sentAt, notificationError: null
                }
            }),
            prisma.targetedCommunicationRecipient.updateMany({
                where: { id: job.superAdminEntityType === 'TargetedCommunicationRecipient' ? job.superAdminEntityId || '__none__' : '__none__' },
                data: { status: 'SENT', sentAt, error: null }
            }),
            prisma.planNotification.updateMany({
                where: { id: job.superAdminEntityType === 'PlanNotification' ? job.superAdminEntityId || '__none__' : '__none__' },
                data: { status: 'SENT', sentAt, error: null }
            })
        ]);

    } catch (error: any) {
        const errorDetail = JSON.stringify(error.response?.data || error.message);
        console.error(`[WhatsApp Worker] Job ${job.id} Failed:`, errorDetail);

        // Note: attempts already incremented at claim time, so check current value
        const isExhausted = job.attempts >= 3; // job.attempts was incremented before this runs

        const boundedError = errorDetail.substring(0, 500);
        const status = isExhausted ? 'FAILED' : 'PENDING';
        await prisma.$transaction([
            prisma.whatsappJob.update({ where: { id: job.id }, data: { status, error: boundedError } }),
            prisma.marketplaceClaim.updateMany({
                where: claimLinkWhere,
                data: {
                    whatsappJobId: job.id,
                    communicationStatus: isExhausted ? 'FAILED' : 'QUEUED', communicationError: boundedError
                }
            }),
            prisma.leadInquiry.updateMany({
                where: leadLinkWhere,
                data: {
                    notificationJobId: job.id,
                    deliveryStatus: isExhausted ? 'FAILED' : 'QUEUED', notificationError: boundedError
                }
            }),
            prisma.targetedCommunicationRecipient.updateMany({
                where: { id: job.superAdminEntityType === 'TargetedCommunicationRecipient' ? job.superAdminEntityId || '__none__' : '__none__' },
                data: { status: isExhausted ? 'FAILED' : 'PENDING', error: boundedError }
            }),
            prisma.planNotification.updateMany({
                where: { id: job.superAdminEntityType === 'PlanNotification' ? job.superAdminEntityId || '__none__' : '__none__' },
                data: { status: isExhausted ? 'FAILED' : 'QUEUED', ...(isExhausted ? { failedAt: new Date() } : {}), error: boundedError }
            })
        ]);
    }
};
