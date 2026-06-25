import { Request, Response } from 'express';
import { prisma } from '../prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { sendOtpEmail } from '../utils/email';
import { sendOtpWhatsApp } from '../utils/whatsapp';
import { invalidateAuthCache } from '../middleware/auth';
import { secureLogger } from '../utils/secureLogger';


const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET environment variable must be set. Generate a secure secret with: openssl rand -base64 32');
}

/**
 * Helper to generate and store Short-Lived Access Token (1h) + Long-Lived Refresh Token (30d)
 */
const generateAuthTokens = async (admin: any) => {
    // Access Token: 1 hour expiry (reduced from 30 days for security)
    const token = jwt.sign({
        id: admin.id,
        username: admin.username,
        passwordVersion: admin.passwordVersion,
        instituteId: admin.instituteId,
        role: admin.role
    }, JWT_SECRET, { expiresIn: '1h' });

    // Refresh Token: Cryptographically secure string, 30 day expiry in DB
    const refreshTokenString = crypto.randomBytes(40).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await prisma.refreshToken.create({
        data: {
            token: refreshTokenString,
            adminId: admin.id,
            expiresAt
        }
    });

    return { token, refreshToken: refreshTokenString };
};
export const loginAdmin = async (req: Request, res: Response) => {
    const { username, password } = req.body;

    try {
        // M4 fix: Support login by username, phone, or email
        // Try findUnique first (fast path for username), fall back to broader search
        let admin = await prisma.admin.findUnique({
            where: { username },
            include: { institute: true }
        });

        if (!admin) {
            // Fallback: search by institute phone or email
            admin = await prisma.admin.findFirst({
                where: {
                    OR: [
                        { institute: { phoneNumber: username } },
                        { institute: { email: username } }
                    ]
                },
                include: { institute: true }
            });
        }

        if (!admin) {
            secureLogger.warn(`[Auth] Failed login attempt for identifier: ${username} (User not found)`);
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
            secureLogger.warn(`[Auth] Failed login attempt for identifier: ${username} (Invalid password)`);
            res.status(401).json({ error: 'Incorrect password' });
            return;
        }

        // Check Suspension
        if (admin.institute && admin.institute.status === 'SUSPENDED') {
            return res.status(403).json({
                error: 'Your institute account has been suspended.',
                reason: admin.institute.suspensionReason
            });
        }

        const tokens = await generateAuthTokens(admin);

        res.json({ success: true, adminId: admin.id, token: tokens.token, refreshToken: tokens.refreshToken, role: admin.role, message: "Login successful" });
    } catch (error) {
        res.status(500).json({ error: 'Login failed' });
    }
};

export const createInitialAdmin = async (req: Request, res: Response) => {
    const { username, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await prisma.$transaction(async (tx) => {
            const admin = await tx.admin.create({
                data: { username, password: hashedPassword }
            });

            return admin;
        });

        res.json({ id: result.id, username: result.username });
    } catch (e) {
        res.status(400).json({ error: 'Admin likely exists' });
    }
}

export const changePassword = async (req: Request, res: Response) => {
    const { currentPassword, newPassword } = req.body;
    const adminId = req.user?.id;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current and new password are required' });
    }

    try {
        const admin = await prisma.admin.findUnique({
            where: { id: adminId }
        });

        if (!admin) return res.status(404).json({ error: 'Admin not found' });

        const isMatch = await bcrypt.compare(currentPassword, admin.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Incorrect current password' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password and increment version to invalidate old tokens
        const updatedAdmin = await prisma.$transaction(async (tx) => {
            const result = await tx.admin.update({
                where: { id: adminId },
                data: {
                    password: hashedPassword,
                    passwordVersion: { increment: 1 }
                }
            });
            await tx.refreshToken.deleteMany({
                where: { adminId }
            });
            return result;
        });

        // Invalidate auth cache so stale passwordVersion isn't served
        invalidateAuthCache(adminId);

        // Generate new token directly so user doesn't have to re-login immediately
        const tokens = await generateAuthTokens(updatedAdmin);

        res.json({ 
            success: true, 
            message: 'Password changed successfully', 
            token: tokens.token, 
            refreshToken: tokens.refreshToken 
        });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Failed to change password' });
    }
};

export const getProfile = async (req: Request, res: Response) => {
    const adminId = req.user?.id;
    try {
        const admin = await prisma.admin.findUnique({
            where: { id: adminId },
            include: { institute: true }
        });
        if (!admin) return res.status(404).json({ error: 'User not found' });

        res.json({
            username: admin.institute?.teacherName || admin.username,
            email: admin.institute?.email || '',
            phone: admin.institute?.phoneNumber || '',
            instituteName: admin.institute?.name || '',
            planName: (admin.institute?.config as any)?.planName || 'Basic',
            maxStudents: (admin.institute?.config as any)?.maxStudents || 100,
            planStartDate: admin.institute?.planStartDate || null,
            planExpiryDate: admin.institute?.planExpiryDate || null,
            logo: (admin.institute?.config as any)?.logo || null
        });
    } catch (e) {
        console.error('Profile fetch error:', e);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
};

// ─── POSTGRES-BACKED OTP STORE ───────────────────────────────────
// Replaces the previous in-memory Map which was:
// - Lost on server restart (all pending OTPs gone)
// - Broken on multi-dyno Heroku (OTP sent via Dyno A, verified on Dyno B)
// - A memory leak vector under DDoS
//
// Now uses the OtpToken table with upsert (one active OTP per identifier).

// Periodic cleanup of expired OTP tokens (runs every 5 minutes)
if (process.env.NODE_ENV !== 'test') {
    const otpCleanupInterval = setInterval(async () => {
        try {
            const result = await prisma.otpToken.deleteMany({
                where: { expiresAt: { lt: new Date() } }
            });
            if (result.count > 0) {
                secureLogger.info(`[OTP] Cleaned ${result.count} expired tokens from DB`);
            }
        } catch (e) {
            console.error('[OTP] Cleanup error:', e);
        }
    }, 5 * 60_000);
    otpCleanupInterval.unref();
}

export const sendMobileOtp = async (req: Request, res: Response) => {
    const { phone: identifier } = req.body;

    if (!identifier) {
        return res.status(400).json({ error: 'Phone number or email is required' });
    }

    try {
        let cleanIdentifier = identifier.trim();
        if (/^\+?\d+$/.test(cleanIdentifier)) {
            cleanIdentifier = cleanIdentifier.replace(/\D/g, ''); 
            if (cleanIdentifier.startsWith('91') && cleanIdentifier.length === 12) {
                cleanIdentifier = cleanIdentifier.slice(2);
            }
        }

        const admin: any = await prisma.admin.findFirst({
            where: {
                OR: [
                    { username: cleanIdentifier },
                    { username: identifier },
                    { institute: { phoneNumber: cleanIdentifier } },
                    { institute: { phoneNumber: identifier } },
                    { institute: { email: cleanIdentifier } },
                    { institute: { email: identifier } }
                ]
            },
            include: { institute: true }
        });

        if (!admin) {
            return res.status(404).json({ error: 'No account found with this credential' });
        }

        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Store OTP in Postgres (upsert = one active OTP per identifier)
        await prisma.otpToken.upsert({
            where: { identifier: cleanIdentifier },
            update: {
                otp: otpCode,
                expiresAt: new Date(Date.now() + 5 * 60 * 1000),
                verified: false
            },
            create: {
                identifier: cleanIdentifier,
                otp: otpCode,
                expiresAt: new Date(Date.now() + 5 * 60 * 1000)
            }
        });

        // Parallel Dispatch System
        const dispatchPromises = [];
        const dispatchMethods = [];
        
        const waPhone = admin.institute?.phoneNumber || ( /^\d{10}$/.test(cleanIdentifier) ? cleanIdentifier : null );
        if (waPhone) {
            dispatchPromises.push(sendOtpWhatsApp(waPhone, otpCode).catch(e => console.error('WA OTP Failed:', e)));
            dispatchMethods.push('WhatsApp');
        }

        const email = admin.institute?.email || (cleanIdentifier.includes('@') ? cleanIdentifier : null);
        if (email) {
            dispatchPromises.push(sendOtpEmail(email, otpCode).catch(e => console.error('Email OTP Failed:', e)));
            dispatchMethods.push('Email');
        }

        if (dispatchPromises.length === 0) {
            // Silent failure fix: Abort if no channels exist
            return res.status(400).json({ error: 'No phone number or email is configured to receive the OTP for this account.' });
        }

        await Promise.allSettled(dispatchPromises);

        if (process.env.NODE_ENV !== 'production') {
            secureLogger.info(`\n========================================`);
            secureLogger.info(`🔑 OTP DISPATCH FIRED:`);
            secureLogger.info(`🆔 FOR: ${cleanIdentifier}`);
            secureLogger.info(`💬 WA?: ${!!waPhone} | 📧 EMAIL?: ${!!email}`);
            secureLogger.info(`🔒 YOUR CODE IS: ${otpCode}`);
            secureLogger.info(`========================================\n`);
        } else {
            secureLogger.info(`[OTP] Dispatched to ${cleanIdentifier} via WA:${!!waPhone} Email:${!!email}`);
        }

        res.json({ success: true, message: `OTP sent successfully to your ${dispatchMethods.join(' and ')}.` });
    } catch (error) {
        console.error('Send OTP Error:', error);
        res.status(500).json({ error: 'Failed to send OTP' });
    }
};

export const verifyMobileOtp = async (req: Request, res: Response) => {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
        return res.status(400).json({ error: 'Phone and OTP are required' });
    }

    try {
        let cleanIdentifier = phone.trim();
        if (/^\+?\d+$/.test(cleanIdentifier)) {
            cleanIdentifier = cleanIdentifier.replace(/\D/g, ''); 
            if (cleanIdentifier.startsWith('91') && cleanIdentifier.length === 12) {
                cleanIdentifier = cleanIdentifier.slice(2);
            }
        }

        // Look up OTP from Postgres
        const storedOtp = await prisma.otpToken.findUnique({
            where: { identifier: cleanIdentifier }
        });
        
        if (!storedOtp) {
            secureLogger.info(`[AUTH] OTP lookup failed for: ${cleanIdentifier} (raw: ${phone})`);
            return res.status(400).json({ error: 'OTP expired or not requested' });
        }
        
        if (storedOtp.expiresAt < new Date()) {
            await prisma.otpToken.delete({ where: { identifier: cleanIdentifier } }).catch(() => {});
            return res.status(400).json({ error: 'OTP has expired' });
        }

        if (storedOtp.verified) {
            return res.status(400).json({ error: 'OTP has already been used' });
        }

        const isDevBypass = process.env.NODE_ENV !== 'production' && otp === "000000";
        if (storedOtp.otp !== otp && !isDevBypass) { 
            return res.status(400).json({ error: 'Invalid OTP code' });
        }

        // Delete OTP atomically (prevents reuse)
        await prisma.otpToken.delete({ where: { identifier: cleanIdentifier } });

        const admin = await prisma.admin.findFirst({
            where: {
                OR: [
                    { username: cleanIdentifier },
                    { username: phone.trim() },
                    { institute: { phoneNumber: cleanIdentifier } },
                    { institute: { phoneNumber: phone.trim() } },
                    { institute: { email: cleanIdentifier } },
                    { institute: { email: phone.trim() } }
                ]
            },
            include: { institute: true }
        });

        if (!admin) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (admin.institute && admin.institute.status === 'SUSPENDED') {
            return res.status(403).json({
                error: 'Your institute account has been suspended.',
                reason: admin.institute.suspensionReason
            });
        }

        const tokens = await generateAuthTokens(admin);

        res.json({ success: true, adminId: admin.id, token: tokens.token, refreshToken: tokens.refreshToken, role: admin.role, message: "Login successful" });
    } catch (error) {
        console.error('Verify OTP Error:', error);
        res.status(500).json({ error: 'Failed to verify OTP' });
    }
};

export const refreshTokenUser = async (req: Request, res: Response) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        return res.status(400).json({ error: 'Refresh token is required' });
    }

    try {
        const storedToken = await prisma.refreshToken.findUnique({
            where: { token: refreshToken },
            include: { admin: { include: { institute: true } } }
        });

        if (!storedToken) {
            return res.status(401).json({ error: 'Invalid refresh token' });
        }

        if (storedToken.expiresAt < new Date()) {
            await prisma.refreshToken.delete({ where: { id: storedToken.id } });
            return res.status(401).json({ error: 'Refresh token expired' });
        }

        const admin = storedToken.admin;

        if (admin.institute && admin.institute.status === 'SUSPENDED') {
            return res.status(403).json({
                error: 'Your institute account has been suspended.',
                reason: admin.institute.suspensionReason
            });
        }

        // Token rotation: destroy the old refresh token immediately
        await prisma.refreshToken.delete({ where: { id: storedToken.id } });

        // Generate a fresh pair
        const tokens = await generateAuthTokens(admin);

        res.json({ success: true, token: tokens.token, refreshToken: tokens.refreshToken });
    } catch (error) {
        console.error('Refresh Token Error:', error);
        res.status(500).json({ error: 'Failed to refresh token' });
    }
};
