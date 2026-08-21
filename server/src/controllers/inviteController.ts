import { CoachingFeeMode, Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { prisma } from '../prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import crypto from 'crypto';
import { secureLogger } from '../utils/secureLogger';
import { getClientUrl } from '../utils/urlConfig';
import { paidPlanExpiry } from '../domain/plans/entitlements';

const JWT_SECRET = process.env.JWT_SECRET!;

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

// PUBLIC
export const validateInvite = async (req: Request, res: Response) => {
    const { token } = req.params;

    try {
        const invite = await prisma.inviteToken.findUnique({
            where: { token: String(token) },
            include: { institute: true }
        });

        if (!invite) return res.status(404).json({ error: 'Invalid token' });
        if (invite.isUsed) return res.status(400).json({ error: 'Invite already used' });
        if (new Date() > invite.expiresAt) return res.status(400).json({ error: 'Invite expired' });

        res.json({
            valid: true,
            instituteName: invite.institute.name,
            plan: invite.institute.plan,
            config: invite.institute.config,
        });
    } catch (e) {
        res.status(500).json({ error: 'Validation failed' });
    }
};

// PUBLIC
export const setupAccount = async (req: Request, res: Response) => {
    const { token, username, password, requiresGrades, allowedClasses, subjects, coachingFeeMode } = req.body as {
        token?: string;
        username?: string;
        password?: string;
        requiresGrades?: boolean;
        allowedClasses?: string[] | string;
        subjects?: string[] | string;
        coachingFeeMode: CoachingFeeMode;
    };

    if (!token) {
        return res.status(400).json({ error: 'Invite token is required' });
    }

    try {
        const invite = await prisma.inviteToken.findUnique({
            where: { token: String(token) },
            include: { institute: true }
        });

        if (!invite || new Date() > invite.expiresAt) {
            return res.status(400).json({ error: 'Invalid or expired token' });
        }

        const sendSetupSuccess = (admin: {
            id: string;
            username: string;
            passwordVersion: number;
            role: string;
        }) => {
            const jwtToken = jwt.sign({
                id: admin.id,
                username: admin.username,
                passwordVersion: admin.passwordVersion,
                instituteId: invite.instituteId,
                role: admin.role,
            }, JWT_SECRET, { expiresIn: '8h' });

            const isQuizOnly = invite.institute.plan === 'QUIZ';
            return res.json({ success: true, token: jwtToken, adminId: admin.id, isQuizOnly });
        };

        if (invite.isUsed) {
            if (!invite.institute.coachingFeeModeSelectedAt) {
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

        const effectiveUsername = (username && username.trim()) ? username.trim() : (invite.institute.phoneNumber || '');
        const effectivePassword = password || crypto.randomBytes(16).toString('hex');

        // Check if existing admin for this institute already exists
        let existing = await prisma.admin.findFirst({
            where: { instituteId: invite.instituteId }
        });

        const hashedPassword = await bcrypt.hash(effectivePassword, 10);

        // Transaction: Create Admin + Invalidate Token + Create Default Year + Update Institute Config
        const result = await prisma.$transaction(async (tx) => {
            const institute = await tx.institute.findUnique({
                where: { id: invite.instituteId },
                select: { coachingFeeMode: true, coachingFeeModeSelectedAt: true, config: true },
            });
            if (!institute) throw new Error('Institute not found');

            if (institute.coachingFeeModeSelectedAt && institute.coachingFeeMode !== coachingFeeMode) {
                const error = new Error('Coaching fee mode has already been selected');
                error.name = 'CoachingFeeModeAlreadySelectedError';
                throw error;
            }

            const instituteData: Prisma.InstituteUpdateInput = {};

            // 1. Update Institute Config with grade settings
            if (requiresGrades !== undefined && allowedClasses !== undefined) {
                const currentConfig = (institute.config as Record<string, unknown>) || {};

                // Process Allowed Classes
                let classList: string[] = [];
                if (allowedClasses) {
                    if (Array.isArray(allowedClasses)) classList = allowedClasses;
                    else if (typeof allowedClasses === 'string') classList = allowedClasses.split(',').map(s => s.trim()).filter(Boolean);
                }

                // Process Subjects
                let subjectList: string[] = [];
                if (subjects) {
                    if (Array.isArray(subjects)) subjectList = subjects;
                    else if (typeof subjects === 'string') subjectList = subjects.split(',').map(s => s.trim()).filter(Boolean);
                }

                instituteData.config = {
                    ...currentConfig,
                    requiresGrades,
                    allowedClasses: classList.length > 0 ? classList : currentConfig.allowedClasses,
                    subjects: subjectList.length > 0 ? subjectList : currentConfig.subjects,
                } as Prisma.InputJsonValue;
            }

            if (!institute.coachingFeeModeSelectedAt) {
                const selection = await tx.institute.updateMany({
                    where: { id: invite.instituteId, coachingFeeModeSelectedAt: null },
                    data: {
                        ...instituteData,
                        coachingFeeMode,
                        coachingFeeModeSelectedAt: new Date(),
                    },
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
                    if (Object.keys(instituteData).length > 0) {
                        await tx.institute.update({
                            where: { id: invite.instituteId },
                            data: instituteData,
                        });
                    }
                }
            } else if (Object.keys(instituteData).length > 0) {
                await tx.institute.update({
                    where: { id: invite.instituteId },
                    data: instituteData,
                });
            }

            // 2. Create or reuse Admin
            let admin = existing;
            if (!admin) {
                admin = await tx.admin.create({
                    data: {
                        username: effectiveUsername,
                        password: hashedPassword,
                        instituteId: invite.instituteId,
                        role: 'INSTITUTE_ADMIN'
                    }
                });
            }



            // 5. Invalidate Token
            await tx.inviteToken.update({
                where: { id: invite.id },
                data: { isUsed: true }
                // Wait, I should check my schema update.
            });

            return admin;
        });

        return sendSetupSuccess(result);

    } catch (e) {
        if (e instanceof Error && e.name === 'CoachingFeeModeAlreadySelectedError') {
            return res.status(409).json({ error: e.message });
        }
        console.error(e);
        res.status(500).json({ error: 'Setup failed' });
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
