import { CoachingFeeMode, Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { prisma } from '../prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { secureLogger } from '../utils/secureLogger';
import { getClientUrl } from '../utils/urlConfig';
import { paidPlanExpiry } from '../domain/plans/entitlements';

const SETUP_REPLAY_WINDOW_MS = 5 * 60 * 1000;

// SUPER ADMIN ONLY
export const generateInvite = async (req: Request, res: Response) => {
    const {
        instituteName,
        teacherName,
        phoneNumber,
        email,
        plan,
        billingCycle = 'MONTHLY',
        subjects,
        allowedClasses,
        requiresGrades = true // Default to true if not provided
    } = req.body;
    const user = req.user;

    // Strict Role Check
    if (user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Unauthorized: Only Super Admin can generate invites' });
    }

    if (!instituteName) {
        return res.status(400).json({ error: 'Institute name is required' });
    }

    // Process Subjects
    let subjectList = ['Math']; // Default fallback
    if (subjects) {
        if (Array.isArray(subjects)) {
            subjectList = subjects;
        } else if (typeof subjects === 'string') {
            subjectList = subjects.split(',').map((s: string) => s.trim()).filter(Boolean);
        }
    }

    // Process Allowed Classes
    let classList: string[] = [];
    if (allowedClasses) {
        if (Array.isArray(allowedClasses)) {
            classList = allowedClasses;
        } else if (typeof allowedClasses === 'string') {
            classList = allowedClasses.split(',').map((s: string) => s.trim()).filter(Boolean);
        }
    }

    try {
        secureLogger.debug('Generating invite', { instituteName, teacherName });

        const planEnum = String(plan || '').toUpperCase();
        const cycle = String(billingCycle || '').toUpperCase();
        if (!['MARKETPLACE', 'QUIZ', 'ENTERPRISE'].includes(planEnum)) return res.status(400).json({ error: 'Invalid canonical plan' });
        if ((planEnum === 'MARKETPLACE' && cycle !== 'ONE_TIME') || (planEnum !== 'MARKETPLACE' && !['MONTHLY', 'YEARLY'].includes(cycle))) return res.status(400).json({ error: 'Invalid billing cycle' });

        // Set plan start/expiry dates (1 year by default)
        const startDate = new Date();
        const expiryDate = planEnum === 'MARKETPLACE' ? null : paidPlanExpiry(startDate, cycle as 'MONTHLY' | 'YEARLY');

        // Create Institute
        const institute = await prisma.institute.create({
            data: {
                name: instituteName,
                teacherName,
                phoneNumber,
                email,
                plan: planEnum as any,
                billingCycle: cycle as any,
                planStartDate: startDate,
                planExpiryDate: expiryDate,
                marketplaceAccessGrantedAt: startDate,
                includedQuizCredits: planEnum === 'MARKETPLACE' ? 0 : 5,
                lifetimeQuizCredits: 0,
                quizCredits: planEnum === 'MARKETPLACE' ? 0 : 5,
                config: {
                    requiresGrades: requiresGrades,
                    allowedClasses: classList,
                    subjects: subjectList
                }
            }
        });

        // Generate Random Token
        const tokenString = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

        // Create Token
        const invite = await prisma.inviteToken.create({
            data: {
                token: tokenString,
                instituteId: institute.id,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
            }
        });

        secureLogger.info('Invite generated successfully', { instituteId: institute.id });

        res.json({
            success: true,
            inviteLink: `${getClientUrl(req)}/setup?token=${invite.token}`,
            token: invite.token,
            instituteId: institute.id
        });
    } catch (e: any) {
        console.error('Failed to generate invite', { error: e.message, stack: e.stack });
        res.status(500).json({ error: 'Failed to generate invite: ' + e.message });
    }
};

import { generateAuthTokens } from './authController';

// PUBLIC
export const validateInvite = async (req: Request, res: Response) => {
    const { token } = req.params;

    try {
        const invite = await prisma.inviteToken.findUnique({
            where: { token: String(token) },
            include: { institute: true }
        });

        if (!invite) return res.status(404).json({ error: 'Invalid token' });
        if (invite.isUsed) return res.status(400).json({ error: 'This setup link has already been used.' });
        if (new Date() > invite.expiresAt) return res.status(400).json({ error: 'This setup link has expired.' });

        res.json({
            valid: true,
            instituteName: invite.institute.name,
            teacherName: invite.institute.teacherName,
            phoneNumber: invite.institute.phoneNumber,
            email: invite.institute.email,
            plan: invite.institute.plan,
            billingCycle: invite.institute.billingCycle,
            city: invite.institute.city,
            area: invite.institute.area,
            subjectsOffered: invite.institute.subjectsOffered,
            googleMapsUrl: invite.institute.googleMapsUrl,
            isPubliclyListed: invite.institute.isPubliclyListed,
            config: invite.institute.config,
        });
    } catch (e) {
        res.status(500).json({ error: 'Validation failed' });
    }
};

// PUBLIC
export const setupAccount = async (req: Request, res: Response) => {
    const {
        token,
        city,
        area,
        subjectsOffered,
        allowedClasses,
        requiresGrades,
        googleMapsUrl,
        isPubliclyListed = true,
        tagline,
        description,
        coachingFeeMode,
    } = req.body as {
        token?: string;
        city?: string | null;
        area?: string | null;
        subjectsOffered?: string[] | string;
        allowedClasses?: string[] | string;
        requiresGrades?: boolean;
        googleMapsUrl?: string | null;
        isPubliclyListed?: boolean;
        tagline?: string | null;
        description?: string | null;
        coachingFeeMode: CoachingFeeMode;
    };

    if (!token) {
        return res.status(400).json({ error: 'Invite token is required' });
    }

    try {
        const invite = await prisma.inviteToken.findUnique({
            where: { token: String(token) },
            include: { institute: true },
        });

        if (!invite || new Date() > invite.expiresAt) {
            return res.status(400).json({ error: 'Invalid or expired token' });
        }

        const sendSetupSuccess = async (admin: {
            id: string;
            username: string;
            passwordVersion: number;
            instituteId: string | null;
            role: string;
        }) => {
            const tokens = await generateAuthTokens(admin, req);
            const isQuizOnly = invite.institute.plan === 'QUIZ';
            const isPageOnly = invite.institute.plan === 'MARKETPLACE';

            return res.json({
                success: true,
                token: tokens.token,
                refreshToken: tokens.refreshToken,
                adminId: admin.id,
                role: admin.role,
                isQuizOnly,
                isPageOnly,
                message: 'Account setup complete!',
            });
        };

        if (invite.isUsed) {
            const selectedAt = invite.institute.coachingFeeModeSelectedAt;
            if (!selectedAt) {
                return res.status(400).json({ error: 'Invalid or expired token' });
            }
            const selectionAgeMs = Date.now() - selectedAt.getTime();
            if (selectionAgeMs < 0 || selectionAgeMs > SETUP_REPLAY_WINDOW_MS) {
                return res.status(400).json({ error: 'Invalid or expired token' });
            }
            if (invite.institute.coachingFeeMode !== coachingFeeMode) {
                return res.status(409).json({ error: 'Coaching fee mode has already been selected' });
            }

            const existing = await prisma.admin.findFirst({
                where: { instituteId: invite.instituteId },
            });
            if (!existing || existing.instituteId !== invite.instituteId) {
                return res.status(400).json({ error: 'Invalid or expired token' });
            }
            return sendSetupSuccess(existing);
        }

        const effectiveUsername = invite.institute.phoneNumber
            || invite.institute.email
            || `admin_${invite.instituteId.slice(0, 8)}`;
        const randomPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
        const effectiveTagline = tagline !== undefined ? tagline : description;

        const admin = await prisma.$transaction(async (tx) => {
            const institute = await tx.institute.findUnique({
                where: { id: invite.instituteId },
                select: {
                    config: true,
                    coachingFeeMode: true,
                    coachingFeeModeSelectedAt: true,
                },
            });
            if (!institute) throw new Error('Institute not found');

            if (institute.coachingFeeModeSelectedAt && institute.coachingFeeMode !== coachingFeeMode) {
                const error = new Error('Coaching fee mode has already been selected');
                error.name = 'CoachingFeeModeAlreadySelectedError';
                throw error;
            }

            if (!institute.coachingFeeModeSelectedAt) {
                const selection = await tx.institute.updateMany({
                    where: { id: invite.instituteId, coachingFeeModeSelectedAt: null },
                    data: { coachingFeeMode, coachingFeeModeSelectedAt: new Date() },
                });
                if (selection.count === 0) {
                    const selectedInstitute = await tx.institute.findUnique({
                        where: { id: invite.instituteId },
                        select: { coachingFeeMode: true },
                    });
                    if (selectedInstitute?.coachingFeeMode !== coachingFeeMode) {
                        const error = new Error('Coaching fee mode has already been selected');
                        error.name = 'CoachingFeeModeAlreadySelectedError';
                        throw error;
                    }
                }
            }

            const currentConfig = (institute.config as Record<string, unknown>) || {};
            let classList = Array.isArray(currentConfig.allowedClasses)
                ? currentConfig.allowedClasses.filter((value): value is string => typeof value === 'string')
                : ['Class 9', 'Class 10', 'Class 11', 'Class 12'];
            if (allowedClasses) {
                classList = Array.isArray(allowedClasses)
                    ? allowedClasses
                    : allowedClasses.split(',').map(value => value.trim()).filter(Boolean);
            }

            let subjectList = Array.isArray(currentConfig.subjects)
                ? currentConfig.subjects.filter((value): value is string => typeof value === 'string')
                : ['Mathematics', 'Science', 'Physics', 'Chemistry'];
            if (subjectsOffered) {
                subjectList = Array.isArray(subjectsOffered)
                    ? subjectsOffered
                    : subjectsOffered.split(',').map(value => value.trim()).filter(Boolean);
            }

            await tx.institute.update({
                where: { id: invite.instituteId },
                data: {
                    ...(city !== undefined && { city: city ? String(city).trim() : null }),
                    ...(area !== undefined && { area: area ? String(area).trim() : null }),
                    subjectsOffered: subjectList,
                    ...(googleMapsUrl !== undefined && { googleMapsUrl: googleMapsUrl ? String(googleMapsUrl).trim() : null }),
                    ...(effectiveTagline !== undefined && { tagline: effectiveTagline ? String(effectiveTagline).trim() : null }),
                    isPubliclyListed: isPubliclyListed !== undefined ? Boolean(isPubliclyListed) : true,
                    config: {
                        ...currentConfig,
                        ...(requiresGrades !== undefined && { requiresGrades: Boolean(requiresGrades) }),
                        allowedClasses: classList,
                        subjects: subjectList,
                    } as Prisma.InputJsonValue,
                },
            });

            let adminUser = await tx.admin.findFirst({
                where: { instituteId: invite.instituteId },
            });
            if (!adminUser) {
                adminUser = await tx.admin.create({
                    data: {
                        username: effectiveUsername,
                        password: randomPassword,
                        instituteId: invite.instituteId,
                        role: 'INSTITUTE_ADMIN',
                    },
                });
            }

            await tx.inviteToken.update({
                where: { id: invite.id },
                data: { isUsed: true },
            });

            return adminUser;
        });

        return sendSetupSuccess(admin);
    } catch (error) {
        if (error instanceof Error && error.name === 'CoachingFeeModeAlreadySelectedError') {
            return res.status(409).json({ error: error.message });
        }
        console.error('Setup failed:', error);
        return res.status(500).json({ error: 'Setup failed' });
    }
};

// SUPER ADMIN ONLY
export const getInstitutes = async (req: Request, res: Response) => {
    const user = req.user;
    if (user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
        const institutes = await prisma.institute.findMany({
            include: {
                _count: {
                    select: { batches: true, students: true } // Stats to show functionality
                },
                admins: {
                    select: { username: true } // Show who manages it
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(institutes);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch institutes' });
    }
};
