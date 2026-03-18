import nodemailer from 'nodemailer';
import { secureLogger } from './secureLogger';

export type SenderType = 'NOREPLY' | 'WELCOME' | 'SUPPORT' | 'ADMIN' | 'DEFAULT';

interface EmailConfig {
    user: string;
    pass: string;
    host: string;
    port: number;
    secure: boolean;
    name: string;
}

const getEmailConfig = (type: SenderType): EmailConfig | null => {
    // Zoho SMTP configuration - trying TLS on port 587
    const commonConfig = {
        host: 'smtp.zoho.in',
        port: 587, // Using STARTTLS instead of SSL
        secure: false // false for port 587, true for 465
    };

    switch (type) {
        case 'NOREPLY':
            if (process.env.EMAIL_USER_NOREPLY && process.env.EMAIL_PASS_NOREPLY) {
                return {
                    user: process.env.EMAIL_USER_NOREPLY,
                    pass: process.env.EMAIL_PASS_NOREPLY,
                    ...commonConfig,
                    name: 'MathLogs Notification'
                };
            }
            break;
        case 'WELCOME':
            if (process.env.EMAIL_USER_WELCOME && process.env.EMAIL_PASS_WELCOME) {
                return {
                    user: process.env.EMAIL_USER_WELCOME,
                    pass: process.env.EMAIL_PASS_WELCOME,
                    ...commonConfig,
                    name: 'Team MathLogs'
                };
            }
            break;
        case 'SUPPORT':
            if (process.env.EMAIL_USER_SUPPORT && process.env.EMAIL_PASS_SUPPORT) {
                return {
                    user: process.env.EMAIL_USER_SUPPORT,
                    pass: process.env.EMAIL_PASS_SUPPORT,
                    ...commonConfig,
                    name: 'MathLogs Support'
                };
            }
            break;
        case 'ADMIN':
            if (process.env.EMAIL_USER_ADMIN && process.env.EMAIL_PASS_ADMIN) {
                return {
                    user: process.env.EMAIL_USER_ADMIN,
                    pass: process.env.EMAIL_PASS_ADMIN,
                    ...commonConfig,
                    name: 'Gaurang from MathLogs'
                };
            }
            break;
    }

    // Fallback to default
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        return {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
            ...commonConfig,
            name: 'MathLogs'
        };
    }

    return null;
};

// Cache transporters to avoid recreating them constantly
const transporters: Record<string, nodemailer.Transporter> = {};

const getTransporter = (config: EmailConfig) => {
    if (!transporters[config.user]) {
        transporters[config.user] = nodemailer.createTransport({
            pool: true, // Use a connection pool
            maxConnections: 5, // Limit concurrent connections
            maxMessages: 100, // Messages per connection
            host: config.host,
            port: config.port,
            secure: config.secure,
            auth: {
                user: config.user,
                pass: config.pass
            },
            debug: process.env.NODE_ENV === 'development',
            logger: process.env.NODE_ENV === 'development'
        });
    }
    return transporters[config.user];
};

interface EmailOptions {
    replyTo?: string;
    senderName?: string; // Override default name if needed
    senderType?: SenderType;
}

export const sendEmail = async (to: string, subject: string, body: string, options: EmailOptions = {}): Promise<{ success: boolean; error?: string }> => {
    const senderType = options.senderType || 'DEFAULT';
    const config = getEmailConfig(senderType);

    if (!config) {
        console.warn('[EMAIL WARNING] No email credentials configured for ' + senderType + '. Falling back to mock.');
        secureLogger.debug('Email mock mode', { to, subject, senderType });
        return { success: true };
    }

    try {
        const transporter = getTransporter(config);
        const fromName = options.senderName || config.name;
        const from = `"${fromName}" <${config.user}>`;

        // Default reply-to to support if not specified
        const replyTo = options.replyTo || (process.env.EMAIL_USER_SUPPORT || process.env.EMAIL_USER);

        await transporter.sendMail({
            from,
            to,
            subject,
            text: body,
            replyTo
        });
        secureLogger.info('Email sent successfully', { to, sender: fromName, type: senderType });
        return { success: true };
    } catch (error: any) {
        console.error(`[EMAIL ERROR] Failed to send to ${to} using ${senderType}:`, error);
        return { success: false, error: error.message || 'Unknown error' };
    }
};

/**
 * Sends the onboarding setup link email after payment verification.
 * Professional, welcoming email with clear CTA.
 */
export const sendSetupLinkEmail = async (
    to: string,
    data: { ownerName: string; setupLink: string; tuitionName: string }
): Promise<{ success: boolean; error?: string }> => {
    if (!to || !to.includes('@')) {
        console.warn('[EMAIL] Skipping setup link email — invalid email:', to);
        return { success: true };
    }

    const subject = `Welcome to MathLogs — Complete Your Setup, ${data.ownerName}!`;

    const body = `Hi ${data.ownerName},

Welcome to MathLogs! 🎉

Your coaching center "${data.tuitionName}" has been successfully registered. You're just one step away from getting started.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

COMPLETE YOUR SETUP:
${data.setupLink}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

What happens next?
1. Click the link above to set up your account
2. Configure your classes and subjects
3. Create your login credentials
4. Start managing your students!

This link is valid for 7 days. If it expires, you can request a new one from our onboarding page.

Need help? Simply reply to this email and our team will assist you.

Best regards,
Team MathLogs
www.mathlogs.app`;

    return await sendEmail(to, subject, body, {
        senderType: 'WELCOME',
        senderName: 'Team MathLogs'
    });
};

/**
 * Sends a Login OTP Email.
 */
export const sendOtpEmail = async (
    to: string,
    otp: string
): Promise<{ success: boolean; error?: string }> => {
    if (!to || !to.includes('@')) {
        console.warn('[EMAIL] Skipping OTP email — invalid email:', to);
        return { success: true };
    }

    const subject = `Your MathLogs Login Code is ${otp}`;

    const body = `Hello,

Your MathLogs login verification code is:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    ${otp}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This code is valid for 5 minutes. Please do not share this code with anyone.

If you did not request this code, you can safely ignore this email.

Best regards,
Team MathLogs
www.mathlogs.app`;

    return await sendEmail(to, subject, body, {
        senderType: 'NOREPLY',
        senderName: 'MathLogs Security'
    });
};
