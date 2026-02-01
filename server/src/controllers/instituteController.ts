import { Request, Response } from 'express';
import { prisma } from '../prisma';

export const getGlobalAnalytics = async (req: Request, res: Response) => {
    // Only Super Admin should see global stats
    const user = (req as any).user;
    if (user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
        const [totalStudents, totalInstitutes, totalBatches, revenueResult] = await Promise.all([
            prisma.student.count(),
            prisma.institute.count(),
            prisma.batch.count(),
            prisma.feePayment.aggregate({
                _sum: { amountPaid: true }
            })
        ]);

        // Mock DB Size Estimate (1 student record ~= 2KB incl related data)
        const estimatedDBSizeMB = ((totalStudents * 2048) / (1024 * 1024)).toFixed(2);

        res.json({
            totalStudents,
            totalInstitutes,
            totalBatches,
            totalRevenue: revenueResult._sum.amountPaid || 0,
            dbUsageMB: estimatedDBSizeMB
        });
    } catch (error) {
        console.error('Failed to fetch analytics:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
};

export const updateInstituteConfig = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { config } = req.body;
    const user = (req as any).user;

    if (user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
        const updated = await prisma.institute.update({
            where: { id },
            data: { config }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update config' });
    }
};

export const getInstituteDetails = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const user = (req as any).user;

    if (user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
        const institute = await prisma.institute.findUnique({
            where: { id },
            include: {
                _count: {
                    select: { students: true, batches: true, admins: true }
                },
                admins: {
                    select: { id: true, username: true, role: true }
                }
            }
        });

        if (!institute) return res.status(404).json({ error: 'Institute not found' });

        // Calculate Detailed DB Usage
        const [studentCount, paymentCount, batchCount, testCount] = await Promise.all([
            prisma.student.count({ where: { instituteId: id } }),
            prisma.feePayment.count({ where: { student: { instituteId: id } } }),
            prisma.batch.count({ where: { instituteId: id } }),
            prisma.test.count({ where: { instituteId: id } })
        ]);

        // Rough size estimates (Bytes)
        const SIZES = { STUDENT: 2048, PAYMENT: 1024, BATCH: 4096, TEST: 5120 };
        const totalBytes = (studentCount * SIZES.STUDENT) +
            (paymentCount * SIZES.PAYMENT) +
            (batchCount * SIZES.BATCH) +
            (testCount * SIZES.TEST);

        const usageMB = (totalBytes / (1024 * 1024)).toFixed(3);

        res.json({
            ...institute,
            stats: {
                dbUsageMB: usageMB,
                recordCounts: {
                    students: studentCount,
                    payments: paymentCount,
                    batches: batchCount,
                    tests: testCount
                }
            }
        });

    } catch (error) {
        console.error('Failed to fetch institute details:', error);
        res.status(500).json({ error: 'Failed to fetch details' });
    }
};

export const suspendInstitute = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { action, reason } = req.body; // action: 'SUSPEND' | 'ACTIVATE'
    const user = (req as any).user;

    if (user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
        const status = action === 'SUSPEND' ? 'SUSPENDED' : 'ACTIVE';
        const updated = await prisma.institute.update({
            where: { id },
            data: {
                status,
                suspensionReason: action === 'SUSPEND' ? reason : null
            }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update suspension status' });
    }
};

export const deleteInstitute = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const user = (req as any).user;

    if (user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
        // ✅ AUDIT LOG: Record deletion attempt BEFORE action
        console.log(`[AUDIT] Institute Deletion Initiated`, {
            instituteId: id,
            superAdminId: user.id,
            superAdminUsername: user.username,
            timestamp: new Date().toISOString(),
            ip: req.ip || req.socket.remoteAddress
        });

        // Get institute details for audit
        const institute = await prisma.institute.findUnique({
            where: { id },
            select: { name: true, createdAt: true }
        });

        if (!institute) {
            return res.status(404).json({ error: 'Institute not found' });
        }

        // ✅ COMPLETE CASCADE DELETE: Delete all related data
        // Order matters: delete children before parents
        await prisma.$transaction([
            // Delete fee payments first (children of students)
            prisma.feePayment.deleteMany({ where: { student: { instituteId: id } } }),
            // Delete fee records (children of students)
            prisma.feeRecord.deleteMany({ where: { student: { instituteId: id } } }),
            // Delete marks (children of students via tests)
            prisma.mark.deleteMany({ where: { student: { instituteId: id } } }),
            // Delete students
            prisma.student.deleteMany({ where: { instituteId: id } }),
            // Delete fee installments (children of batches)
            prisma.feeInstallment.deleteMany({ where: { batch: { instituteId: id } } }),
            // Delete batches
            prisma.batch.deleteMany({ where: { instituteId: id } }),
            // Delete tests
            prisma.test.deleteMany({ where: { instituteId: id } }),
            // Delete academic years
            prisma.academicYear.deleteMany({ where: { instituteId: id } }),
            // Delete admins
            prisma.admin.deleteMany({ where: { instituteId: id } }),
            // Delete invite tokens
            prisma.inviteToken.deleteMany({ where: { instituteId: id } }),
            // Finally, delete the institute itself
            prisma.institute.delete({ where: { id } })
        ]);

        // ✅ AUDIT LOG: Successful deletion
        console.log(`[AUDIT] Institute Deletion Completed`, {
            instituteId: id,
            instituteName: institute.name,
            superAdminId: user.id,
            timestamp: new Date().toISOString()
        });

        res.json({
            success: true,
            message: `Institute "${institute.name}" and all related data deleted permanently`
        });
    } catch (error) {
        console.error('[AUDIT] Institute Deletion FAILED:', {
            instituteId: id,
            superAdminId: user.id,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
        res.status(500).json({ error: 'Failed to delete institute. Data constraints exist.' });
    }
};

export const getMyInstitute = async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (!user.instituteId) return res.status(400).json({ error: 'No institute assigned' });

    try {
        const institute = await prisma.institute.findUnique({
            where: { id: user.instituteId },
            select: {
                id: true,
                name: true,
                config: true
            }
        });
        if (!institute) return res.status(404).json({ error: 'Institute not found' });
        res.json(institute);
    } catch (e) {
        console.error('Failed to fetch my institute:', e);
        res.status(500).json({ error: 'Failed to fetch institute details' });
    }
};
