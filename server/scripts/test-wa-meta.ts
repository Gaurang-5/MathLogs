import { sendWelcomeWhatsApp, sendFeeReminderWhatsApp, sendPaymentReceiptWhatsApp, sendTestMarksWhatsApp } from '../src/utils/whatsapp';
import { processWhatsappQueue } from '../src/utils/whatsappWorker';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const runTest = async () => {
    const phoneNumber = '919557940807';
    console.log(`\n======================================`);
    console.log(`🚀 META WHATSAPP MULTI-TEMPLATE BARRAGE TEST`);
    console.log(`======================================`);

    try {
        console.log(`\n[Step 1] Enqueuing realistic test messages for ${phoneNumber}...`);

        // 1. Welcome Approval
        await sendWelcomeWhatsApp(phoneNumber, {
            studentName: 'Gaurang (Welcome)',
            batchName: 'API Integration Batch',
            instituteName: 'MathLogs',
            whatsappLink: 'https://chat.whatsapp.com/testlinkxyz'
        });

        // 2. Fee Reminder
        await sendFeeReminderWhatsApp(phoneNumber, {
            studentName: 'Gaurang (Fee)',
            batchName: 'API Batch',
            feeBreakup: 'Admission ₹100, Tuition ₹400',
            totalAmount: '₹ 5,000',
            instituteName: 'MathLogs'
        });

        // 3. Payment Receipt
        await sendPaymentReceiptWhatsApp(phoneNumber, {
            studentName: 'Gaurang (Payment)',
            amountPaid: '₹ 5,000',
            installmentName: 'April Installment',
            instituteName: 'MathLogs'
        });

        // 4. Test Marks
        await sendTestMarksWhatsApp(phoneNumber, {
            studentName: 'Gaurang (Test)',
            instituteName: 'MathLogs',
            testName: 'Advanced Calculus Weekly Test',
            totalMarks: '100',
            marksObtained: '98'
        });

        // 5. Onboarding Invite with CTA Button!
        const { enqueueWhatsApp } = await import('../src/utils/whatsapp');
        await enqueueWhatsApp(
            phoneNumber, 
            process.env.WHATSAPP_TEMPLATE_SETUP || 'onboarding_invite', 
            ['Gaurang (Owner)', 'MathLogs Tutors', 'https://mathlogs.app/setup?token=12345ABCDE']
        );

        console.log("✅ Successfully enqueued all 5 message types into the PostgreSQL Database.");

        console.log(`\n[Step 2] Triggering background worker manually...`);
        // We manually trigger the worker so we don't have to wait for the cron schedule
        const processedCount = await processWhatsappQueue();

        console.log(`\n✅ TEST COMPLETE. Total jobs processed: ${processedCount}`);

    } catch (error) {
        console.error("\n❌ FATAL ERROR DURING TEST:", error);
    }

    process.exit(0);
};

runTest();
