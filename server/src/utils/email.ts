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
    // FORCE Indian Data Center for Zoho
    const commonConfig = {
        host: 'smtp.zoho.in', // CRITICAL FIX for India users
        port: 465,
        secure: true
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
            host: config.host,
            port: config.port,
            secure: config.secure,
            auth: {
                user: config.user,
                pass: config.pass
            }
        });
    }
    return transporters[config.user];
};

interface EmailOptions {
    replyTo?: string;
    senderName?: string; // Override default name if needed
    senderType?: SenderType;
}

export const sendEmail = async (to: string, subject: string, body: string, options: EmailOptions = {}) => {
    const senderType = options.senderType || 'DEFAULT';
    const config = getEmailConfig(senderType);

    if (!config) {
        console.warn('[EMAIL WARNING] No email credentials configured for ' + senderType + '. Falling back to mock.');
        secureLogger.debug('Email mock mode', { to, subject, senderType });
        return true;
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
        return true;
    } catch (error) {
        console.error(`[EMAIL ERROR] Failed to send to ${to} using ${senderType}:`, error);
        return false;
    }
};
