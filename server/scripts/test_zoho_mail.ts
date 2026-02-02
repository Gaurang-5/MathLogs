
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

async function testEmail(user: string, pass: string, host: string) {
    console.log(`\nTesting connection to ${host} for ${user}...`);

    const transporter = nodemailer.createTransport({
        host: host,
        port: 465,
        secure: true,
        auth: {
            user: user,
            pass: pass
        }
    });

    try {
        const info = await transporter.sendMail({
            from: `"${user}" <${user}>`,
            to: 'gaurangbhatia.work@gmail.com', // Sending to your likely personal email or we can use admin email
            subject: `Test Email from ${host}`,
            text: 'If you receive this, the email configuration is CORRECT!'
        });
        console.log(`✅ SUCCESS! Message sent: ${info.messageId}`);
        return true;
    } catch (error: any) {
        console.error(`❌ FAILED: ${error.message}`);
        return false;
    }
}

async function main() {
    const user = process.env.EMAIL_USER_NOREPLY || '';
    const pass = process.env.EMAIL_PASS_NOREPLY || '';

    if (!user || !pass) {
        console.error('Credentials missing in .env');
        return;
    }

    console.log('--- DIAGNOSING ZOHO EMAIL ---');
    console.log('User:', user);

    // Test 1: Standard Zoho (zoho.com)
    console.log('\n[Attempt 1] Trying standard US Server (smtp.zoho.com)...');
    const successUS = await testEmail(user, pass, 'smtp.zoho.com');

    if (!successUS) {
        // Test 2: India Zoho (zoho.in)
        console.log('\n[Attempt 2] Trying Indian Server (smtp.zoho.in)...');
        await testEmail(user, pass, 'smtp.zoho.in');
    }
}

main();
