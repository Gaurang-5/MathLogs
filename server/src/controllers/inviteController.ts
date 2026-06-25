import { Request, Response } from 'express';
import { prisma } from '../prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { secureLogger } from '../utils/secureLogger';
import { getClientUrl } from '../utils/urlConfig';

const JWT_SECRET = process.env.JWT_SECRET!;

// SUPER ADMIN ONLY
export const generateInvite = async (req: Request, res: Response) => {
    const {
        instituteName,
        teacherName,
        phoneNumber,
        email,
        plan, // 'Basic', 'Pro', or 'Custom'
        customMaxStudents,
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

        let maxStudents = 100;
        let planName = 'Basic';
        let planEnum: any = 'FREE';

        if (plan === 'Pro') {
            maxStudents = 250;
            planName = 'Pro';
            planEnum = 'PRO';
        } else if (plan === 'Custom') {
            maxStudents = customMaxStudents ? Number(customMaxStudents) : 1000;
            planName = 'Custom';
            planEnum = 'ENTERPRISE';
        }

        // Set plan start/expiry dates (1 year by default)
        const startDate = new Date();
        const expiryDate = new Date();
        expiryDate.setFullYear(startDate.getFullYear() + 1);

        // Create Institute
        const institute = await prisma.institute.create({
            data: {
                name: instituteName,
                teacherName,
                phoneNumber,
                email,
                plan: planEnum,
                planStartDate: startDate,
                planExpiryDate: expiryDate,
                config: {
                    requiresGrades: requiresGrades,
                    maxStudents: maxStudents,
                    planName: planName,
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
            instituteName: invite.institute.name
        });
    } catch (e) {
        res.status(500).json({ error: 'Validation failed' });
    }
};

// PUBLIC
export const setupAccount = async (req: Request, res: Response) => {
    const { token, username, password, requiresGrades, allowedClasses, subjects } = req.body;

    if (!username || !password || !token) {
        return res.status(400).json({ error: 'All fields required' });
    }

    try {
        const invite = await prisma.inviteToken.findUnique({
            where: { token: String(token) },
            include: { institute: true }
        });

        if (!invite || invite.isUsed || new Date() > invite.expiresAt) {
            return res.status(400).json({ error: 'Invalid or expired token' });
        }

        // Check if username unique
        const existing = await prisma.admin.findUnique({ where: { username } });
        if (existing) {
            return res.status(400).json({ error: 'Username already taken' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Transaction: Create Admin + Invalidate Token + Create Default Year + Update Institute Config
        const result = await prisma.$transaction(async (tx) => {
            // 1. Update Institute Config with grade settings
            if (requiresGrades !== undefined && allowedClasses !== undefined) {
                const currentConfig = (invite.institute.config as any) || {};

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

                await tx.institute.update({
                    where: { id: invite.instituteId },
                    data: {
                        config: {
                            ...currentConfig,
                            requiresGrades: requiresGrades,
                            allowedClasses: classList.length > 0 ? classList : currentConfig.allowedClasses,
                            subjects: subjectList.length > 0 ? subjectList : currentConfig.subjects
                        }
                    }
                });
            }

            // 2. Create Admin
            const admin = await tx.admin.create({
                data: {
                    username,
                    password: hashedPassword,
                    instituteId: invite.instituteId,
                    role: 'INSTITUTE_ADMIN'
                }
            });



            // 5. Invalidate Token
            await tx.inviteToken.update({
                where: { id: invite.id },
                data: { isUsed: true }
                // Wait, I should check my schema update.
            });

            return admin;
        });

        // Generate Login Token
        const jwtToken = jwt.sign({
            id: result.id,
            username: result.username,
            passwordVersion: result.passwordVersion,
            instituteId: result.instituteId,
            role: result.role
        }, JWT_SECRET, { expiresIn: '8h' });

        res.json({ success: true, token: jwtToken, adminId: result.id });

    } catch (e) {
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
