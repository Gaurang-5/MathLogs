import nodemailer from 'nodemailer';
import { secureLogger } from './secureLogger';

const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

interface EmailOptions {
    replyTo?: string;
    senderName?: string;
}

export const sendEmail = async (to: string, subject: string, body: string, options: EmailOptions = {}) => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.warn('[EMAIL WARNING] No email credentials configured. Falling back to mock.');
        secureLogger.debug('Email mock mode', { to, subject });
        return true;
    }

    try {
        const from = options.senderName
            ? `"${options.senderName}" <${process.env.EMAIL_USER}>`
            : process.env.EMAIL_USER;

        await transporter.sendMail({
            from,
            to,
            subject,
            text: body,
            replyTo: options.replyTo
        });
        secureLogger.info('Email sent successfully', { to, sender: options.senderName });
        return true;
    } catch (error) {
        console.error(`[EMAIL ERROR] Failed to send to ${to}:`, error);
        return false;
    }
};
