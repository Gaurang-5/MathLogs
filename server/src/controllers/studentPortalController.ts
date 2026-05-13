import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';

// GET /api/student-portal/branding/:slug — public, no auth
export const getInstituteBranding = async (req: Request, res: Response): Promise<void> => {
    try {
        const slug = req.params.slug as string;
        const institute = await prisma.institute.findUnique({
            where: { slug: slug.toLowerCase() },
            select: { name: true, config: true, websiteConfig: true }
        });

        if (!institute) {
            res.status(404).json({ error: 'Institute not found' });
            return;
        }

        const config = institute.config as any;
        const wc = institute.websiteConfig as any;

        res.json({
            name: institute.name,
            logoUrl: config?.logo || null,
            primaryColor: wc?.theme?.primaryColor || config?.primaryColor || null,
        });
    } catch (error) {
        console.error('Error fetching branding:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// POST /api/student-portal/login
// Body: { instituteSlug: string, mobileNumber: string }
export const loginStudent = async (req: Request, res: Response): Promise<void> => {
    try {
        const { instituteSlug, mobileNumber } = req.body;
        
        if (!instituteSlug || !mobileNumber) {
            res.status(400).json({ error: 'Institute slug and mobile number are required' });
            return;
        }

        const institute = await prisma.institute.findUnique({
            where: { slug: instituteSlug }
        });

        if (!institute) {
            res.status(404).json({ error: 'Institute not found' });
            return;
        }

        // Find student(s) with matching mobile number in this institute
        const students = await prisma.student.findMany({
            where: {
                instituteId: institute.id,
                parentWhatsapp: mobileNumber
            },
            include: {
                batch: true
            }
        });

        if (students.length === 0) {
            res.status(404).json({ error: 'No student found with this mobile number in this institute' });
            return;
        }

        // Generate token for the first student found (or allow selection if multiple, but keep simple for now)
        const student = students[0];

        const token = jwt.sign(
            { 
                studentId: student.id,
                instituteId: institute.id,
                role: 'STUDENT'
            }, 
            JWT_SECRET, 
            { expiresIn: '30d' }
        );

        res.json({
            token,
            student: {
                id: student.id,
                name: student.name,
                batchName: student.batch?.name || 'N/A',
                instituteName: institute.name
            }
        });
    } catch (error) {
        console.error('Error logging in student:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// GET /api/student-portal/dashboard
export const getStudentDashboard = async (req: Request, res: Response): Promise<void> => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const token = authHeader.split(' ')[1];
        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET) as any;
        } catch (e) {
            res.status(401).json({ error: 'Invalid token' });
            return;
        }

        const studentId = decoded.studentId;

        const student = await prisma.student.findUnique({
            where: { id: studentId },
            include: {
                batch: true,
                balance: true,
                feePayments: {
                    include: { installment: true },
                    orderBy: { date: 'desc' }
                },
                marks: {
                    include: { test: true }
                }
            }
        }) as any;

        if (!student) {
            res.status(404).json({ error: 'Student not found' });
            return;
        }

        const studentJoinDate = new Date(student.createdAt);

        // Fetch installments for this student (batch + custom)
        const batchInstallments = student.batchId ? await prisma.feeInstallment.findMany({
            where: { batchId: student.batchId },
            include: {
                payments: { where: { studentId } }
            }
        }) : [];

        const eligibleInstallments = batchInstallments.filter((inst: any) => {
            if (inst.studentId && inst.studentId !== studentId) return false;
            if (inst.studentId === studentId) return true;
            return new Date(inst.createdAt) >= studentJoinDate || inst.payments.length > 0;
        });

        // Fetch all tests in the student's batch, or tests they have marks for, sorted by date ascending
        const batchTests = await prisma.test.findMany({
            where: {
                OR: [
                    student.batchId ? { batchId: student.batchId } : {},
                    student.batchId ? { batches: { some: { id: student.batchId } } } : {},
                    { marks: { some: { studentId: studentId } } }
                ].filter(condition => Object.keys(condition).length > 0)
            },
            orderBy: { date: 'asc' }
        }) as any[];

        // Build a map of testId -> mark for fast lookup
        const markMap = new Map<string, any>();
        for (const mark of student.marks) {
            markMap.set(mark.test.id, mark);
        }

        // Only include tests that happened on or after the student joined, OR if the student has a mark for it
        const joinDate = new Date(student.createdAt);
        joinDate.setHours(0, 0, 0, 0);

        const eligibleTests = batchTests.filter((test: any) => {
            if (markMap.has(test.id)) return true;
            
            const testDate = new Date(test.date);
            testDate.setHours(0, 0, 0, 0);
            return testDate >= joinDate;
        });

        // Build the performance array: scored or absent
        const performance = eligibleTests.map((test: any) => {
            const mark = markMap.get(test.id);
            if (mark) {
                return {
                    testId: test.id,
                    testName: test.name,
                    subject: test.subject,
                    date: test.date,
                    status: 'SCORED' as const,
                    score: mark.score,
                    maxMarks: test.maxMarks,
                    percentage: (mark.score / test.maxMarks) * 100
                };
            }
            return {
                testId: test.id,
                testName: test.name,
                subject: test.subject,
                date: test.date,
                status: 'ABSENT' as const,
                score: null,
                maxMarks: test.maxMarks,
                percentage: null
            };
        });

        res.json({
            student: {
                name: student.name,
                parentName: student.parentName,
                parentWhatsapp: student.parentWhatsapp,
                parentEmail: student.parentEmail || null,
                batchName: student.batch?.name || 'N/A',
                schoolName: student.schoolName || null,
                humanId: student.humanId || null,
                status: student.status,
            },
            fees: {
                balance: student.balance?.balance || 0,
                totalFees: student.balance?.totalFees || 0,
                totalPaid: student.balance?.totalPaid || 0,
                transactions: student.feePayments.map((payment: any) => ({
                    id: payment.id,
                    amount: payment.amountPaid,
                    date: payment.date,
                    type: 'PAYMENT',
                    label: payment.installment?.name || 'Fee Payment',
                    status: 'PAID'
                })),
                installmentBreakdown: eligibleInstallments.map((inst: any) => {
                    const paid = inst.payments.reduce((sum: number, p: any) => sum + p.amountPaid, 0);
                    const pending = Math.max(0, inst.amount - paid);
                    return {
                        id: inst.id,
                        name: inst.name,
                        totalAmount: inst.amount,
                        paid,
                        pending,
                        status: pending <= 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID'
                    };
                }).filter((inst: any) => inst.pending > 0) // Only show unpaid/partial
            },
            performance
        });
    } catch (error) {
        console.error('Error fetching student dashboard:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
