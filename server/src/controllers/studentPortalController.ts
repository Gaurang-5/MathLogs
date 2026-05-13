import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';

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
                    include: {
                        installment: true
                    },
                    orderBy: { date: 'desc' }
                },
                marks: {
                    include: {
                        test: true
                    },
                    orderBy: {
                        test: { date: 'asc' }
                    }
                }
            }
        }) as any;

        if (!student) {
            res.status(404).json({ error: 'Student not found' });
            return;
        }

        res.json({
            student: {
                name: student.name,
                parentName: student.parentName,
                batchName: student.batch?.name,
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
                }))
            },
            performance: student.marks.map((mark: any) => ({
                testId: mark.test.id,
                testName: mark.test.name,
                subject: mark.test.subject,
                date: mark.test.date,
                score: mark.score,
                maxMarks: mark.test.maxMarks,
                percentage: (mark.score / mark.test.maxMarks) * 100
            }))
        });
    } catch (error) {
        console.error('Error fetching student dashboard:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
