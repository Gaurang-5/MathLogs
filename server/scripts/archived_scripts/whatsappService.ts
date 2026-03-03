import { prisma } from '../prisma';

/**
 * Queues a WhatsApp message to be sent asynchronously by the worker.
 * 
 * @param recipient Phone number in E.164 format (e.g., "+919876543210")
 * @param templateId The template name registered in Meta Business Manager
 * @param variables Array of strings to replace {{1}}, {{2}}, etc. in the template
 * @param instituteId Optional institute ID for tracking usage
 */
export const queueWhatsappMessage = async (
    recipient: string,
    templateId: string,
    variables: string[],
    instituteId?: string
) => {
    try {
        console.log(`[WhatsApp] Queuing message for ${recipient} (Template: ${templateId})`);

        // Basic validation
        if (!recipient || !templateId) {
            throw new Error('Recipient and Template ID are required');
        }

        // Clean phone number (ensure no spaces, dashes)
        const cleanRecipient = recipient.replace(/[^0-9+]/g, '');

        await prisma.whatsappJob.create({
            data: {
                recipient: cleanRecipient,
                templateId,
                data: variables, // Store variables as JSON array
                status: 'PENDING',
                instituteId
            }
        });

        console.log(`[WhatsApp] Message queued successfully for ${recipient}`);
        return true;
    } catch (error) {
        console.error('[WhatsApp] Failed to queue message:', error);
        return false;
    }
};

/**
 * Dedicated helper for Fee Reminders
 */
export const sendFeeReminderWhatsapp = async (
    studentName: string,
    amount: number,
    phone: string,
    dueDate: string,
    instituteId?: string
) => {
    // Template: fee_reminder_v1
    // "Hello {{1}}, this is a reminder that your fee of ₹{{2}} is due on {{3}}. Please pay to avoid late fees."
    return queueWhatsappMessage(
        phone,
        'fee_reminder_v1',
        [studentName, amount.toString(), dueDate],
        instituteId
    );
};

/**
 * Dedicated helper for Exam Results
 */
export const sendExamResultWhatsapp = async (
    studentName: string,
    testName: string,
    score: number,
    maxMarks: number,
    phone: string,
    instituteId?: string
) => {
    // Template: exam_result_v1
    // "Hello {{1}}, the results for {{2}} are out. You scored {{3}}/{{4}}. Keep up the good work!"
    return queueWhatsappMessage(
        phone,
        'exam_result_v1',
        [studentName, testName, score.toString(), maxMarks.toString()],
        instituteId
    );
};

/**
 * Dedicated helper for Welcome Message
 */
export const sendWelcomeWhatsapp = async (
    studentName: string,
    instituteName: string,
    phone: string,
    instituteId?: string
) => {
    // Template: student_welcome_v1
    // "Welcome {{1}} to {{2}}! We are excited to have you on board."
    return queueWhatsappMessage(
        phone,
        'student_welcome_v1',
        [studentName, instituteName],
        instituteId
    );
};
