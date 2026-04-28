import { prisma } from '../prisma';

/**
 * ============================================================================
 * WHATSAPP QUEUE INTEGRATION (Meta Graph API)
 * ============================================================================
 * ROLE: This file manages the queuing of WhatsApp messages.
 * We migrated to direct Meta Cloud API to ensure high
 * availability, fail-safety, and horizontal scaling via background workers.
 * 
 * Every function here translates named data into a positional string array
 * which is then enqueued to the `WhatsappJob` DB table.
 * 
 * The `whatsappWorker.ts` runs independently and processes this queue using
 * the official Meta Graph API.
 * ============================================================================
 */

export interface WelcomeWAData {
    studentName: string;
    batchName: string;
    whatsappLink: string;
    instituteName: string;
    instituteId?: string;
}

export interface FeeReminderWAData {
    studentName: string;
    batchName: string;
    feeBreakup: string;
    totalAmount: string;
    instituteName: string;
    instituteId?: string;
}

export interface FeeReminderUpiWAData {
    studentName: string;
    batchName: string;
    feeBreakup: string;
    totalAmount: string;
    instituteName: string;
    upiPaymentLink: string;
    instituteId?: string;
}

export interface TestMarksWAData {
    studentName: string;
    testName: string;
    marksObtained: string;
    totalMarks: string;
    instituteName: string;
    instituteId?: string;
}

export interface PaymentReceiptWAData {
    studentName: string;
    amountPaid: string;
    installmentName: string;
    instituteName: string;
    instituteId?: string;
}

export interface PaymentRejectionWAData {
    studentName: string;
    reason: string;
    paymentPortalLink: string;
    instituteName: string;
    instituteId?: string;
}

export interface AttendanceCheckInWAData {
    studentName: string;
    batchName: string;
    instituteName: string;
    checkInTime: string;
    photoUrl: string;
    instituteId?: string;
}

export interface AttendanceAbsentWAData {
    studentName: string;
    batchName: string;
    instituteName: string;
    scheduledTime: string;
    instituteId?: string;
}

/**
 * Enqueues a WhatsApp message using the DB queue pattern.
 * The `whatsappWorker.ts` script will pick this up and hit the Meta Graph API.
 * 
 * @param mobileNumber The remote mobile number
 * @param templateName The Template ID/Name registered in Meta Business Manager
 * @param componentValues Positional string parameters stringified in array [] format
 */
export const enqueueWhatsApp = async (mobileNumber: string, templateName: string, componentValues: string[], instituteId?: string) => {
    if (!templateName) {
        console.warn('[WhatsApp] Dropped: No template configured.');
        return false;
    }

    try {
        let formattedMobile = mobileNumber.replace(/\D/g, ''); // Remove non-numeric
        if (formattedMobile.length === 10) {
            formattedMobile = `91${formattedMobile}`;
        }

        await prisma.whatsappJob.create({
            data: {
                recipient: formattedMobile,
                templateId: templateName,
                data: componentValues,
                status: 'PENDING',
                instituteId: instituteId || null
            }
        });

        console.log(`[WhatsApp Queue] Enqueued template '${templateName}' for ${formattedMobile}`);
        return true;
    } catch (error: any) {
        console.error("[WhatsApp Queue] DB Enqueue Failed:", error.message);
        return false;
    }
};

export const sendWelcomeWhatsApp = async (mobileNumber: string, data: WelcomeWAData) => {
    const WELCOME_TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_WELCOME || 'welcome_approval_1';

    const componentValues = [
        data.studentName || "Student",
        data.batchName || "the batch",
        data.instituteName || "our institute",
        data.whatsappLink || "Contact admin for group link"
    ];

    return await enqueueWhatsApp(mobileNumber, WELCOME_TEMPLATE_NAME, componentValues, data.instituteId);
};

export const sendFeeReminderWhatsApp = async (mobileNumber: string, data: FeeReminderWAData) => {
    const FEE_TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_FEE || 'fee_breakup_alert_1';

    const componentValues = [
        data.studentName || "Student",
        data.batchName || "the batch",
        data.feeBreakup || "• Balance Due",
        data.totalAmount || "0",
        "Please contact admin for payment details.",
        data.instituteName || "our institute"
    ];

    return await enqueueWhatsApp(mobileNumber, FEE_TEMPLATE_NAME, componentValues, data.instituteId);
};

export const sendFeeReminderUpiWhatsApp = async (mobileNumber: string, data: FeeReminderUpiWAData) => {
    const FEE_UPI_TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_FEE || 'fee_breakup_alert_1';

    const componentValues = [
        data.studentName || "Student",
        data.batchName || "the batch",
        data.feeBreakup || "• Balance Due",
        data.totalAmount || "0",
        data.upiPaymentLink,
        data.instituteName || "our institute"
    ];

    return await enqueueWhatsApp(mobileNumber, FEE_UPI_TEMPLATE_NAME, componentValues, data.instituteId);
};

export const sendTestMarksWhatsApp = async (mobileNumber: string, data: TestMarksWAData) => {
    const TEST_TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_TEST || 'test_marks_update';

    const componentValues = [
        data.studentName || "Student",
        data.instituteName || "our institute",
        data.testName || "a test",
        data.totalMarks || "100",
        data.marksObtained || "0"
    ];

    return await enqueueWhatsApp(mobileNumber, TEST_TEMPLATE_NAME, componentValues, data.instituteId);
};

export const sendSetupLinkWhatsApp = async (mobileNumber: string, data: { ownerName: string, setupLink: string, tuitionName: string }) => {
    const SETUP_TEMPLATE = process.env.WHATSAPP_TEMPLATE_SETUP || 'onboarding_setup_link';

    const componentValues = [
        data.ownerName || "there",
        data.tuitionName || "your coaching center",
        data.setupLink
    ];

    return await enqueueWhatsApp(mobileNumber, SETUP_TEMPLATE, componentValues);
};

export const sendOtpWhatsApp = async (mobileNumber: string, otpCode: string) => {
    const OTP_TEMPLATE = process.env.WHATSAPP_TEMPLATE_OTP || 'mathlogs_login_otp';

    const componentValues = [
        otpCode
    ];

    return await enqueueWhatsApp(mobileNumber, OTP_TEMPLATE, componentValues);
};

export const sendPaymentReceiptWhatsApp = async (mobileNumber: string, data: PaymentReceiptWAData) => {
    const PAYMENT_TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_PAYMENT || 'payment_receipt_1';

    const componentValues = [
        data.studentName || "Student",
        data.amountPaid || "0",
        data.installmentName || "installment",
        data.instituteName || "our institute"
    ];

    return await enqueueWhatsApp(mobileNumber, PAYMENT_TEMPLATE_NAME, componentValues, data.instituteId);
};

export const sendPaymentRejectionWhatsApp = async (mobileNumber: string, data: PaymentRejectionWAData) => {
    const REJECT_TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_PAYMENT_REJECT || 'payment_rejected_alert';

    const componentValues = [
        data.studentName || "Student",
        data.reason || "Screenshot unclear",
        data.paymentPortalLink
    ];

    return await enqueueWhatsApp(mobileNumber, REJECT_TEMPLATE_NAME, componentValues, data.instituteId);
};

export const sendStudentInviteWhatsApp = async (mobileNumber: string, data: { instituteName: string, batchName: string, registrationLink: string, instituteId?: string }) => {
    const INVITE_TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_INVITE || 'student_registration_link';

    // The order of parameters should match your template defined in Meta Business Manager.
    const componentValues = [
        data.instituteName || "our institute",
        data.batchName || "the batch",
        data.registrationLink
    ];

    return await enqueueWhatsApp(mobileNumber, INVITE_TEMPLATE_NAME, componentValues, data.instituteId);
};

export const sendAttendanceCheckInWhatsApp = async (mobileNumber: string, data: AttendanceCheckInWAData) => {
    const ATTENDANCE_TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_ATTENDANCE_PRESENT || 'attendance_checkin_alert';

    const componentValues = [
        data.studentName || 'Student',
        data.batchName || 'the batch',
        data.instituteName || 'our institute',
        data.checkInTime || 'just now',
        data.photoUrl
    ];

    return await enqueueWhatsApp(mobileNumber, ATTENDANCE_TEMPLATE_NAME, componentValues, data.instituteId);
};

export const sendAttendanceAbsentWhatsApp = async (mobileNumber: string, data: AttendanceAbsentWAData) => {
    const ATTENDANCE_ABSENT_TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_ATTENDANCE_ABSENT || 'attendance_absent_alert';

    const componentValues = [
        data.studentName || 'Student',
        data.batchName || 'the batch',
        data.instituteName || 'our institute',
        data.scheduledTime || 'today'
    ];

    return await enqueueWhatsApp(mobileNumber, ATTENDANCE_ABSENT_TEMPLATE_NAME, componentValues, data.instituteId);
};
