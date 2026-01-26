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
            where: { username }
        });

        if (!admin) {
            console.warn(`[Auth] Failed login attempt for username: ${username} (User not found)`);
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }

        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
            console.warn(`[Auth] Failed login attempt for username: ${username} (Invalid password)`);
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }

        const token = jwt.sign({
            id: admin.id,
            username: admin.username,
            passwordVersion: admin.passwordVersion
        }, JWT_SECRET, { expiresIn: '8h' });

        res.json({ success: true, adminId: admin.id, token, message: "Login successful" });
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
