import { Request, Response } from 'express';
import { prisma } from '../prisma';
import bcrypt from 'bcryptjs';
import { secureLogger } from '../utils/secureLogger';

export const listAcademicYears = async (req: Request, res: Response) => {
    const teacherId = (req as any).user?.id;
    try {
        secureLogger.debug('Fetching academic years', { teacherId });
        const years = await prisma.academicYear.findMany({
            where: { teacherId },
            // orderBy: { startDate: 'desc' } // Temporarily removed for debugging
        });
        secureLogger.debug('Academic years found', { count: years.length });
        const currentId = (req as any).user?.currentAcademicYearId;

        res.json({
            years,
            currentAcademicYearId: currentId
        });
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch academic years' });
    }
};

export const createAcademicYear = async (req: Request, res: Response) => {
    const teacherId = (req as any).user?.id;
    const { name, startDate, endDate } = req.body;

    if (!name) return res.status(400).json({ error: 'Name is required' });

    try {
        const existing = await prisma.academicYear.findUnique({
            where: { teacherId_name: { teacherId, name } }
        });
        if (existing) return res.status(400).json({ error: 'Academic year already exists' });

        const year = await prisma.academicYear.create({
            data: {
                name,
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : undefined,
                teacherId
            }
        });
        res.json(year);
    } catch (e) {
        res.status(500).json({ error: 'Failed to create academic year' });
    }
};

export const switchAcademicYear = async (req: Request, res: Response) => {
    const teacherId = (req as any).user?.id;
    const { id } = req.body;

    if (!id) return res.status(400).json({ error: 'Year ID is required' });

    try {
        // Verify ownership
        const year = await prisma.academicYear.findUnique({ where: { id } });
        if (!year || year.teacherId !== teacherId) {
            return res.status(403).json({ error: 'Invalid academic year' });
        }

        await prisma.admin.update({
            where: { id: teacherId },
            data: { currentAcademicYearId: id }
        });

        res.json({ success: true, currentAcademicYearId: id, name: year.name });
    } catch (e) {
        res.status(500).json({ error: 'Failed to switch academic year' });
    }
};

export const backupAcademicYear = async (req: Request, res: Response) => {
    const teacherId = (req as any).user?.id;
    const { id } = req.params;

    try {
        // Verify ownership
        const year = await prisma.academicYear.findUnique({ where: { id: String(id) } });
        if (!year || year.teacherId !== teacherId) {
            return res.status(403).json({ error: 'Invalid academic year' });
        }

        // Fetch all data for this year
        const batches = await prisma.batch.findMany({
            where: { academicYearId: String(id) },
            include: {
                students: {
                    include: {
                        fees: true,
                        feePayments: true,
                        marks: true
                    }
                },
                feeInstallments: true
            }
        });

        const tests = await prisma.test.findMany({
            where: { academicYearId: String(id) },
            include: { marks: true }
        });

        // Also fetch orphaned students if any (though logic says they should be linked)
        // But listing students by batch covers most. 
        // If we want all students:
        const students = await prisma.student.findMany({
            where: { academicYearId: String(id) },
            include: { fees: true, feePayments: true, marks: true }
        });

        const backupData = {
            academicYear: year,
            batches,
            students,
            tests,
            exportedAt: new Date()
        };

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="backup-${year.name}.json"`);
        res.send(JSON.stringify(backupData, null, 2));

    } catch (e) {
        secureLogger.error('Academic year backup failed', e as Error);
        res.status(500).json({ error: 'Failed to create backup' });
    }
};

export const deleteAcademicYear = async (req: Request, res: Response) => {
    const teacherId = (req as any).user?.id;
    const { id } = req.params;
    const { password } = req.body;

    if (!password) {
        return res.status(400).json({ error: 'Password is required to confirm deletion' });
    }

    try {
        const yearId = String(id);

        // Verify Admin Password
        const admin = await prisma.admin.findUnique({
            where: { id: teacherId }
        });

        if (!admin) return res.status(404).json({ error: 'User not found' });

        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Incorrect password' });
        }

        const year = await prisma.academicYear.findUnique({ where: { id: yearId } });
        if (!year || year.teacherId !== teacherId) {
            return res.status(404).json({ error: 'Academic year not found' });
        }

        // Prevent deleting the active year
        if (admin.currentAcademicYearId === yearId) {
            return res.status(400).json({ error: 'Cannot delete the currently active academic year. Switch to another year first.' });
        }

        // Transaction: Delete dependent entities in correct order to respect foreign keys
        // Order matters: marks -> tests -> payments -> installments -> batches -> students (unlink) -> year
        await prisma.$transaction([
            // 1. Delete marks (references students and tests)
            prisma.mark.deleteMany({
                where: { test: { academicYearId: yearId } }
            }),

            // 2. Delete tests (now safe, no marks referencing them)
            prisma.test.deleteMany({
                where: { academicYearId: yearId }
            }),

            // 3. Delete fee payments (references students and installments)
            prisma.feePayment.deleteMany({
                where: { student: { academicYearId: yearId } }
            }),

            // 4. Delete fee installments (references batches)
            prisma.feeInstallment.deleteMany({
                where: { batch: { academicYearId: yearId } }
            }),

            // 5. Delete batches (now safe, no installments/students referencing them)
            prisma.batch.deleteMany({
                where: { academicYearId: yearId }
            }),

            // 6. Unlink students (set their academicYearId and batchId to null)
            prisma.student.updateMany({
                where: { academicYearId: yearId },
                data: {
                    academicYearId: null,
                    batchId: null
                }
            }),

            // 7. Finally delete the academic year itself
            prisma.academicYear.delete({
                where: { id: yearId }
            })
        ]);

        res.json({ success: true });
    } catch (e) {
        secureLogger.error('Academic year deletion failed', e as Error);
        res.status(500).json({ error: 'Failed to delete academic year' });
    }
};
