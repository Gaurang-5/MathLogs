import { Request, Response } from 'express';
import { prisma } from '../prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { sendOtpEmail } from '../utils/email';
import { sendOtpWhatsApp } from '../utils/whatsapp';
import { invalidateAuthCache } from '../middleware/auth';
import { secureLogger } from '../utils/secureLogger';
import { getOrResetQuizCredits } from '../utils/quizCredits';
import { hashRequestIp, recordAuthenticationEvent, safeDeviceLabel } from '../services/superAdminAuthEventService';


const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET environment variable must be set. Generate a secure secret with: openssl rand -base64 32');
}

/**
 * Helper to generate and store Short-Lived Access Token (1h) + Long-Lived Refresh Token (30d)
 */
const generateAuthTokens = async (admin: any, req?: Request, existingSessionId?: string | null) => {
    // Refresh Token: Cryptographically secure string, 30 day expiry in DB
    const refreshTokenString = crypto.randomBytes(40).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    let sessionId = existingSessionId || null;
    if (sessionId) {
        const active = await prisma.adminSession.updateMany({
            where: { id: sessionId, adminId: admin.id, revokedAt: null, expiresAt: { gt: new Date() } },
            data: { lastSeenAt: new Date() }
        });
        if (active.count !== 1) throw new Error('AUTH_SESSION_REVOKED');
    } else {
        const session = await prisma.adminSession.create({
            data: {
                adminId: admin.id,
                deviceLabel: safeDeviceLabel(req?.get?.('user-agent')),
                ipHash: hashRequestIp(req?.ip),
                expiresAt
            }
        });
        sessionId = session.id;
    }

    // Access tokens are bound to the durable session so revocation is immediate.
    const token = jwt.sign({
        id: admin.id,
        username: admin.username,
        passwordVersion: admin.passwordVersion,
        instituteId: admin.instituteId,
        role: admin.role,
        sessionId
    }, JWT_SECRET, { expiresIn: '1h' });

    await prisma.refreshToken.create({
        data: {
            token: refreshTokenString,
            adminId: admin.id,
            sessionId,
            expiresAt
        }
    });

    return { token, refreshToken: refreshTokenString };
};

const quizCreditPayload = async (instituteId?: string | null) => {
    if (!instituteId) {
        return {
            quizCredits: 0,
            includedQuizCredits: 0,
            lifetimeQuizCredits: 0,
            includedQuizCreditsExpireAt: null,
            quizCreditsRenewAt: null
        };
    }

    const creditStatus = await getOrResetQuizCredits(instituteId);
    return {
        quizCredits: creditStatus.totalUsableCredits,
        includedQuizCredits: creditStatus.includedCredits,
        lifetimeQuizCredits: creditStatus.lifetimeCredits,
        includedQuizCreditsExpireAt: creditStatus.includedCreditsExpireAt,
        quizCreditsRenewAt: creditStatus.quizCreditsRenewAt
    };
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
            secureLogger.warn('[Auth] Failed login attempt', { reason: 'NOT_FOUND' });
            await recordAuthenticationEvent({ eventType: 'LOGIN_FAILED', success: false, ip: req.ip, userAgent: req.get?.('user-agent'), metadata: { reason: 'NOT_FOUND' } });
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
            secureLogger.warn('[Auth] Failed login attempt', { reason: 'INVALID_PASSWORD' });
            await recordAuthenticationEvent({ adminId: admin.id, eventType: 'LOGIN_FAILED', success: false, ip: req.ip, userAgent: req.get?.('user-agent'), metadata: { reason: 'INVALID_PASSWORD' } });
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

        const tokens = await generateAuthTokens(admin, req);
        await recordAuthenticationEvent({ adminId: admin.id, eventType: 'LOGIN', success: true, ip: req.ip, userAgent: req.get?.('user-agent') });

        const credits = await quizCreditPayload(admin.institute?.id);

        const isQuizOnly = admin.institute?.isQuizOnly || (admin.institute?.config as any)?.planName === 'QUIZ_ONLY';
        const isPageOnly = (admin.institute?.config as any)?.planName === 'listing' || (admin.institute?.config as any)?.planName === 'PAGE_ONLY';

        res.json({
            success: true,
            adminId: admin.id,
            token: tokens.token,
            refreshToken: tokens.refreshToken,
            role: admin.role,
            isQuizOnly,
            isPageOnly,
            ...credits,
            message: "Login successful"
        });
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
            await tx.adminSession.updateMany({
                where: { adminId, revokedAt: null },
                data: { revokedAt: new Date() }
            });
            return result;
        });

        // Invalidate auth cache so stale passwordVersion isn't served
        invalidateAuthCache(adminId);

        // Generate new token directly so user doesn't have to re-login immediately
        const tokens = await generateAuthTokens(updatedAdmin, req);

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

        // Search Admin or Institute by phone/email
        let admin: any = await prisma.admin.findFirst({
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

        let targetPhone = admin?.institute?.phoneNumber || ( /^\d{10}$/.test(cleanIdentifier) ? cleanIdentifier : null );
        let targetEmail = admin?.institute?.email || (cleanIdentifier.includes('@') ? cleanIdentifier : null);

        // If no Admin found, check if an Institute exists for this phone/email
        if (!admin) {
            const institute = await prisma.institute.findFirst({
                where: {
                    OR: [
                        { phoneNumber: cleanIdentifier },
                        { phoneNumber: identifier },
                        { email: cleanIdentifier },
                        { email: identifier }
                    ]
                }
            });

            if (!institute) {
                return res.status(404).json({ error: 'No coaching account found with this mobile number.' });
            }

            targetPhone = institute.phoneNumber;
            targetEmail = institute.email;
        }

        // Enforce 30-second cooldown on OTP resends
        const existingOtp = await prisma.otpToken.findUnique({
            where: { identifier: cleanIdentifier }
        });

        if (existingOtp) {
            const timeSinceCreated = Date.now() - new Date(existingOtp.createdAt).getTime();
            if (timeSinceCreated < 30_000) {
                const remainingSecs = Math.ceil((30_000 - timeSinceCreated) / 1000);
                return res.status(429).json({ error: `Please wait ${remainingSecs} seconds before requesting a new OTP.` });
            }
        }

        // Generate a fresh 6-digit cryptographic OTP code
        const otpCode = crypto.randomInt(100000, 1000000).toString();
        
        // Store OTP in Postgres (upsert = one active OTP per identifier)
        await prisma.otpToken.upsert({
            where: { identifier: cleanIdentifier },
            update: {
                otp: otpCode,
                createdAt: new Date(),
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
        
        if (targetPhone) {
            dispatchPromises.push(sendOtpWhatsApp(targetPhone, otpCode).catch(e => console.error('WA OTP Failed:', e)));
            dispatchMethods.push('WhatsApp');
        }

        if (targetEmail) {
            dispatchPromises.push(sendOtpEmail(targetEmail, otpCode).catch(e => console.error('Email OTP Failed:', e)));
            dispatchMethods.push('Email');
        }

        if (dispatchPromises.length === 0) {
            return res.status(400).json({ error: 'No phone number or email is configured to receive OTP for this account.' });
        }

        await Promise.allSettled(dispatchPromises);

        secureLogger.info('[OTP] Dispatch completed', { whatsapp: Boolean(targetPhone), email: Boolean(targetEmail) });

        res.json({ success: true, message: `OTP sent successfully to your WhatsApp (${targetPhone || cleanIdentifier}).` });
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
            secureLogger.info('[AUTH] OTP lookup failed');
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

        let admins: any[] = await prisma.admin.findMany({
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

        // Auto-provision Admin record if Institute exists but Admin not created yet
        if (admins.length === 0) {
            const institute = await prisma.institute.findFirst({
                where: {
                    OR: [
                        { phoneNumber: cleanIdentifier },
                        { phoneNumber: phone.trim() },
                        { email: cleanIdentifier },
                        { email: phone.trim() }
                    ]
                }
            });

            if (!institute) {
                return res.status(404).json({ error: 'Account not found' });
            }

            const randomPassword = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);
            const newAdmin = await prisma.admin.create({
                data: {
                    username: cleanIdentifier,
                    password: randomPassword,
                    instituteId: institute.id,
                    role: 'INSTITUTE_ADMIN'
                },
                include: { institute: true }
            });
            admins.push(newAdmin);
        }

        if (admins.length > 1) {
            // Multiple accounts found. Issue a short-lived token to select one.
            const tempAuthToken = jwt.sign({ verifiedPhone: cleanIdentifier }, JWT_SECRET, { expiresIn: '5m' });
            
            const accounts = admins.map(a => ({
                adminId: a.id,
                instituteName: a.institute?.name || 'Super Admin Portal',
                teacherName: a.institute?.teacherName || a.username,
                role: a.role,
                status: a.institute?.status || 'ACTIVE'
            }));

            return res.json({
                success: true,
                multipleAccounts: true,
                tempAuthToken,
                accounts,
                message: "Multiple accounts found. Please select one."
            });
        }

        const admin = admins[0];

        if (admin.institute && admin.institute.status === 'SUSPENDED') {
            return res.status(403).json({
                error: 'Your institute account has been suspended.',
                reason: admin.institute.suspensionReason
            });
        }

        const tokens = await generateAuthTokens(admin, req);

        const isQuizOnly = admin.institute?.isQuizOnly || (admin.institute?.config as any)?.planName === 'QUIZ_ONLY';
        const isPageOnly = (admin.institute?.config as any)?.planName === 'listing' || (admin.institute?.config as any)?.planName === 'PAGE_ONLY';
        const credits = await quizCreditPayload(admin.institute?.id);

        return res.json({
            success: true,
            adminId: admin.id,
            token: tokens.token,
            refreshToken: tokens.refreshToken,
            role: admin.role,
            isQuizOnly,
            isPageOnly,
            ...credits,
            message: "Login successful"
        });
    } catch (error) {
        console.error('Verify OTP Error:', error);
        return res.status(500).json({ error: 'Failed to verify OTP' });
    }
};

export const selectMobileAccount = async (req: Request, res: Response) => {
    const { adminId, tempAuthToken } = req.body;

    if (!adminId || !tempAuthToken) {
        return res.status(400).json({ error: 'adminId and tempAuthToken are required' });
    }

    try {
        let decoded: any;
        try {
            decoded = jwt.verify(tempAuthToken, JWT_SECRET);
        } catch (err) {
            return res.status(401).json({ error: 'Session expired. Please request a new OTP.' });
        }

        const verifiedPhone = decoded.verifiedPhone;
        
        const admin: any = await prisma.admin.findUnique({
            where: { id: adminId },
            include: { institute: true }
        });

        if (!admin) {
            return res.status(404).json({ error: 'Selected account not found' });
        }

        // Validate that this admin belongs to the verified phone
        const adminMatchesPhone = 
            admin.username === verifiedPhone ||
            admin.institute?.phoneNumber === verifiedPhone ||
            admin.institute?.email === verifiedPhone ||
            (admin.username && admin.username.replace(/\D/g, '') === verifiedPhone.replace(/\D/g, '')) ||
            (admin.institute?.phoneNumber && admin.institute.phoneNumber.replace(/\D/g, '') === verifiedPhone.replace(/\D/g, ''));
            
        if (!adminMatchesPhone) {
            return res.status(403).json({ error: 'Unauthorized to access this account' });
        }

        if (admin.institute && admin.institute.status === 'SUSPENDED') {
            return res.status(403).json({
                error: 'Your institute account has been suspended.',
                reason: admin.institute.suspensionReason
            });
        }

        const tokens = await generateAuthTokens(admin, req);

        const isQuizOnly = admin.institute?.isQuizOnly || (admin.institute?.config as any)?.planName === 'QUIZ_ONLY';
        const isPageOnly = (admin.institute?.config as any)?.planName === 'listing' || (admin.institute?.config as any)?.planName === 'PAGE_ONLY';
        const credits = await quizCreditPayload(admin.institute?.id);

        return res.json({
            success: true,
            adminId: admin.id,
            token: tokens.token,
            refreshToken: tokens.refreshToken,
            role: admin.role,
            isQuizOnly,
            isPageOnly,
            ...credits,
            message: "Login successful"
        });
    } catch (error) {
        console.error('Select Account Error:', error);
        return res.status(500).json({ error: 'Failed to select account' });
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
            include: { admin: { include: { institute: true } }, session: true }
        });

        if (!storedToken) {
            return res.status(401).json({ error: 'Invalid refresh token' });
        }

        if (storedToken.expiresAt < new Date()) {
            await prisma.refreshToken.delete({ where: { id: storedToken.id } });
            return res.status(401).json({ error: 'Refresh token expired' });
        }

        if (storedToken.session?.revokedAt || (storedToken.session && storedToken.session.expiresAt < new Date())) {
            await prisma.refreshToken.deleteMany({ where: { sessionId: storedToken.sessionId } });
            return res.status(401).json({ error: 'Session revoked' });
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
        const tokens = await generateAuthTokens(admin, req, storedToken.sessionId);
        await recordAuthenticationEvent({ adminId: admin.id, eventType: 'REFRESH', success: true, ip: req.ip, userAgent: req.get?.('user-agent') });

        res.json({ success: true, token: tokens.token, refreshToken: tokens.refreshToken });
    } catch (error) {
        console.error('Refresh Token Error:', error);
        res.status(500).json({ error: 'Failed to refresh token' });
    }
};

export const logoutUser = async (req: Request, res: Response) => {
    const refreshToken = String(req.body?.refreshToken || '').trim();
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token is required' });
    try {
        const stored = await prisma.refreshToken.findFirst({
            where: { token: refreshToken, adminId: req.user.id },
            select: { sessionId: true }
        });
        if (!stored) return res.status(401).json({ error: 'Invalid refresh token' });
        await prisma.$transaction(async tx => {
            if (stored.sessionId) {
                await tx.adminSession.updateMany({
                    where: { id: stored.sessionId, adminId: req.user.id, revokedAt: null },
                    data: { revokedAt: new Date() }
                });
                await tx.refreshToken.deleteMany({ where: { sessionId: stored.sessionId } });
            } else {
                await tx.refreshToken.deleteMany({ where: { token: refreshToken, adminId: req.user.id } });
            }
        });
        await recordAuthenticationEvent({ adminId: req.user.id, eventType: 'LOGOUT', success: true, ip: req.ip, userAgent: req.get?.('user-agent') });
        return res.json({ success: true });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to logout' });
    }
};

/**
 * Send OTP for signup (no existing account required).
 * Accepts any 10-digit mobile number and dispatches a WhatsApp OTP.
 */
export const sendSignupOtp = async (req: Request, res: Response) => {
    const { phone } = req.body;

    if (!phone) {
        return res.status(400).json({ error: 'Phone number is required' });
    }

    try {
        let cleanPhone = phone.trim().replace(/\D/g, '');
        if (cleanPhone.startsWith('91') && cleanPhone.length === 12) {
            cleanPhone = cleanPhone.slice(2);
        }

        if (!/^\d{10}$/.test(cleanPhone)) {
            return res.status(400).json({ error: 'Please enter a valid 10-digit Indian mobile number.' });
        }

        // Enforce 30-second cooldown
        const existingOtp = await prisma.otpToken.findUnique({
            where: { identifier: cleanPhone }
        });

        if (existingOtp) {
            const timeSinceCreated = Date.now() - new Date(existingOtp.createdAt).getTime();
            if (timeSinceCreated < 30_000) {
                const remainingSecs = Math.ceil((30_000 - timeSinceCreated) / 1000);
                return res.status(429).json({ error: `Please wait ${remainingSecs} seconds before requesting a new OTP.` });
            }
        }

        const otpCode = crypto.randomInt(100000, 1000000).toString();

        await prisma.otpToken.upsert({
            where: { identifier: cleanPhone },
            update: {
                otp: otpCode,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 5 * 60 * 1000),
                verified: false
            },
            create: {
                identifier: cleanPhone,
                otp: otpCode,
                expiresAt: new Date(Date.now() + 5 * 60 * 1000)
            }
        });

        await sendOtpWhatsApp(cleanPhone, otpCode).catch(e => console.error('Signup WA OTP Failed:', e));

        secureLogger.info('[SIGNUP_OTP] Dispatch completed');

        return res.json({ success: true, message: `OTP sent to ${cleanPhone} via WhatsApp.` });
    } catch (error) {
        console.error('Send Signup OTP Error:', error);
        return res.status(500).json({ error: 'Failed to send OTP' });
    }
};

/**
 * Verify signup OTP — does NOT create any account or issue auth tokens.
 * Simply validates the OTP and returns a short-lived signed proof of verification.
 */
export const verifySignupOtp = async (req: Request, res: Response) => {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
        return res.status(400).json({ error: 'Phone and OTP are required' });
    }

    try {
        let cleanPhone = phone.trim().replace(/\D/g, '');
        if (cleanPhone.startsWith('91') && cleanPhone.length === 12) {
            cleanPhone = cleanPhone.slice(2);
        }

        const storedOtp = await prisma.otpToken.findUnique({
            where: { identifier: cleanPhone }
        });

        if (!storedOtp) {
            return res.status(400).json({ error: 'OTP expired or not requested' });
        }

        if (storedOtp.expiresAt < new Date()) {
            await prisma.otpToken.delete({ where: { identifier: cleanPhone } }).catch(() => {});
            return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
        }

        const isDevBypass = process.env.NODE_ENV !== 'production' && otp === '000000';
        if (storedOtp.otp !== otp && !isDevBypass) {
            return res.status(400).json({ error: 'Invalid OTP code' });
        }

        // Delete OTP atomically to prevent reuse
        await prisma.otpToken.delete({ where: { identifier: cleanPhone } });

        // Issue a short-lived proof token (10 minutes) — client includes this when submitting signup form
        const verificationToken = jwt.sign(
            { verifiedPhone: cleanPhone, purpose: 'signup' },
            JWT_SECRET,
            { expiresIn: '10m' }
        );

        return res.json({
            success: true,
            verificationToken,
            message: 'Phone number verified successfully!'
        });
    } catch (error) {
        console.error('Verify Signup OTP Error:', error);
        return res.status(500).json({ error: 'Failed to verify OTP' });
    }
};
