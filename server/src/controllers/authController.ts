import { Request, Response } from 'express';
import { prisma } from '../prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET environment variable must be set. Generate a secure secret with: openssl rand -base64 32');
}


export const loginAdmin = async (req: Request, res: Response) => {
    const { username, password } = req.body;

    try {
        const admin = await prisma.admin.findUnique({
            where: { username },
            include: { institute: true }
        });

        if (!admin) {
            console.warn(`[Auth] Failed login attempt for username: ${username} (User not found)`);
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
            console.warn(`[Auth] Failed login attempt for username: ${username} (Invalid password)`);
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

        const token = jwt.sign({
            id: admin.id,
            username: admin.username,
            passwordVersion: admin.passwordVersion,
            instituteId: admin.instituteId,
            role: admin.role
        }, JWT_SECRET, { expiresIn: '30d' });

        res.json({ success: true, adminId: admin.id, token, role: admin.role, message: "Login successful" });
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

            const currentYear = new Date().getFullYear();
            const yearName = `${currentYear}-${currentYear + 1}`;

            const academicYear = await tx.academicYear.create({
                data: {
                    name: yearName,
                    teacherId: admin.id,
                    isDefault: true,
                    startDate: new Date(`${currentYear}-04-01`),
                    endDate: new Date(`${currentYear + 1}-03-31`)
                }
            });

            const updatedAdmin = await tx.admin.update({
                where: { id: admin.id },
                data: { currentAcademicYearId: academicYear.id }
            });

            return updatedAdmin;
        });

        res.json({ id: result.id, username: result.username });
    } catch (e) {
        res.status(400).json({ error: 'Admin likely exists' });
    }
}

export const changePassword = async (req: Request, res: Response) => {
    const { currentPassword, newPassword } = req.body;
    const adminId = (req as any).user?.id;

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
        await prisma.admin.update({
            where: { id: adminId },
            data: {
                password: hashedPassword,
                passwordVersion: { increment: 1 }
            }
        });

        // Generate new token directly so user doesn't have to re-login immediately
        const token = jwt.sign({
            id: admin.id,
            username: admin.username,
            passwordVersion: admin.passwordVersion + 1
        }, JWT_SECRET, { expiresIn: '30d' });

        res.json({ success: true, message: 'Password changed successfully', token });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Failed to change password' });
    }
};

export const getProfile = async (req: Request, res: Response) => {
    const adminId = (req as any).user?.id;
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
            instituteName: admin.institute?.name || ''
        });
    } catch (e) {
        console.error('Profile fetch error:', e);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
};
