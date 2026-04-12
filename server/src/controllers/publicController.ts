import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { z } from 'zod';
import { storePaymentScreenshot } from '../utils/paymentStorage';
import fs from 'fs/promises';

const leadSchema = z.object({
    studentName: z.string().min(2, "Student name is required"),
    parentName: z.string().min(2, "Parent name is required"),
    parentPhone: z.string().min(10, "Valid phone number required").max(15),
    batchInterestId: z.string().optional()
});

export const getPublicInstituteProfile = async (req: Request, res: Response) => {
    try {
        const slug = req.params.slug as string;
        
        const institute = await prisma.institute.findUnique({
            where: { slug: slug.toLowerCase() },
            select: {
                id: true,
                name: true,
                aboutUs: true,
                config: true,
                websiteConfig: true,
                batches: {
                    where: {
                        isRegistrationOpen: true,
                        isRegistrationEnded: false
                    },
                    select: {
                        id: true,
                        name: true,
                        subject: true,
                        className: true,
                        feeAmount: true,
                        timeSlot: true,
                    }
                }
            }
        });

        if (!institute) {
            return res.status(404).json({ error: 'Institute not found. The path may be incorrect.' });
        }

        const wc = institute.websiteConfig as any;
        const config = institute.config as any;
        const showFees = wc?.theme?.showFees !== false && config?.showFeesOnWebsite !== false;

        const sanitizedBatches = institute.batches.map(b => ({
            ...b,
            feeAmount: showFees ? b.feeAmount : null
        }));

        res.json({
            id: institute.id,
            name: institute.name,
            aboutUs: institute.aboutUs || `Welcome to ${institute.name}! Reach out to us to learn more.`,
            showFees,
            logoUrl: config?.logo || null,
            batches: sanitizedBatches,
            websiteConfig: institute.websiteConfig
        });

    } catch (error) {
        console.error('Public Profile Fetch Error:', error);
        res.status(500).json({ error: 'Failed to fetch institute data' });
    }
};

export const submitPublicLead = async (req: Request, res: Response) => {
    try {
        const slug = req.params.slug as string;
        const parsed = leadSchema.parse(req.body);

        const institute = await prisma.institute.findUnique({
            where: { slug: slug.toLowerCase() }
        });

        if (!institute) {
            return res.status(404).json({ error: 'Institute not found.' });
        }

        const lead = await prisma.studentLead.create({
            data: {
                studentName: parsed.studentName,
                parentName: parsed.parentName,
                parentPhone: parsed.parentPhone,
                batchInterestId: parsed.batchInterestId || null,
                instituteId: institute.id,
                status: 'NEW'
            }
        });

        // Provide robust response
        res.status(201).json({ 
            success: true, 
            message: "Inquiry submitted successfully! The teacher will contact you soon." 
        });

        // Trigger Teacher WhatsApp alert (non-blocking) goes here in production
        
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.issues[0].message });
        }
        console.error('Public Lead Submit Error:', error);
        res.status(500).json({ error: 'Failed to submit inquiry. Please try again later.' });
    }
};

interface FeeCacheEntry {
    data: any;
    timestamp: number;
}
export const studentFeesCache = new Map<string, FeeCacheEntry>();

export const getPublicStudentFees = async (req: Request, res: Response) => {
    try {
        const slug = req.params.slug as string;
        const phone = req.query.phone as string;

        if (!phone) {
            return res.status(400).json({ error: 'Phone number is required' });
        }

        const cacheKey = `${slug.toLowerCase()}:${phone}`;
        const cached = studentFeesCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < 60000)) {
            return res.json(cached.data);
        }

        const institute = await prisma.institute.findUnique({
            where: { slug: slug.toLowerCase() },
            select: { id: true, name: true, config: true }
        });

        if (!institute) {
            return res.status(404).json({ error: 'Institute not found.' });
        }

        const logoUrl = (institute.config as any)?.logo || null;

        const digits = phone.replace(/\D/g, '');
        const last10 = digits.slice(-10);

        // Find standard active students by phone
        const students = await prisma.student.findMany({
            where: {
                instituteId: institute.id,
                parentWhatsapp: { contains: last10 },
                status: 'APPROVED'
            },
            include: {
                batch: {
                    include: {
                        feeInstallments: {
                            orderBy: { createdAt: 'asc' }
                        }
                    }
                },
                feePayments: true,
                upiPaymentVerifications: {
                    where: { status: 'PENDING' },
                    select: { id: true, amount: true, createdAt: true, status: true }
                }
            }
        });

        if (!students || students.length === 0) {
            return res.status(404).json({ error: 'No active student found with this phone number.' });
        }

        const studentData = students.map(student => ({
            studentId: student.id,
            studentName: student.name,
            batchName: student.batch?.name || 'N/A',
            feeInstallments: student.batch?.feeInstallments || [],
            feePayments: student.feePayments || [],
            pendingVerifications: student.upiPaymentVerifications || []
        }));

        const responseData = {
            students: studentData,
            institute: {
                name: institute.name,
                logoUrl
            }
        };

        // Cache cleanup strategy (OOM safety)
        if (studentFeesCache.size > 1000) {
            const now = Date.now();
            for (const [k, v] of studentFeesCache.entries()) {
                if (now - v.timestamp > 60000) {
                    studentFeesCache.delete(k);
                }
            }
        }

        studentFeesCache.set(cacheKey, { data: responseData, timestamp: Date.now() });

        res.json(responseData);
    } catch (error) {
        console.error('Public Student Fees Error:', error);
        res.status(500).json({ error: 'Failed to fetch student fees.' });
    }
};

export const submitUpiPayment = async (req: Request, res: Response) => {
    try {
        const slug = req.params.slug as string;
        const { studentId, installmentId, amount } = req.body;
        const file = req.file;

        if (!studentId || !amount || !file) {
            return res.status(400).json({ error: 'Missing required fields or screenshot.' });
        }

        const numericAmount = parseFloat(amount);
        if (isNaN(numericAmount) || numericAmount <= 0) {
            return res.status(400).json({ error: 'Invalid amount.' });
        }

        const institute = await prisma.institute.findUnique({
            where: { slug: slug.toLowerCase() }
        });

        if (!institute) {
            if (file.path) await fs.unlink(file.path).catch(e => console.error(e));
            return res.status(404).json({ error: 'Institute not found.' });
        }
        
        // P2 Fix: Duplicate Submission Guard
        if (installmentId) {
            const existing = await prisma.upiPaymentVerification.findFirst({
                where: {
                    studentId,
                    installmentId,
                    status: 'PENDING'
                }
            });
            if (existing) {
                if (file.path) await fs.unlink(file.path).catch(e => console.error(e));
                return res.status(400).json({ error: 'A pending verification already exists for this fee installment.' });
            }
        }

        const buffer = await fs.readFile(file.path);

        const key = await storePaymentScreenshot({
            instituteId: institute.id,
            studentId,
            buffer,
            contentType: file.mimetype
        });
        
        // Clean up the temp storage file
        await fs.unlink(file.path).catch(e => console.error('Failed to remove temp file', e));

        await prisma.upiPaymentVerification.create({
            data: {
                studentId,
                instituteId: institute.id,
                installmentId: installmentId || null,
                amount: numericAmount,
                storageKey: key,
                status: 'PENDING'
            }
        });

        res.json({ success: true, message: 'Payment submitted for review.' });
    } catch (error) {
        console.error('Submit UPI Payment Error:', error);
        if (req.file?.path) {
             await fs.unlink(req.file.path).catch(e => console.error('Failed to remove temp file on error', e));
        }
        res.status(500).json({ error: 'Failed to submit payment.' });
    }
};

import { readPaymentScreenshot } from '../utils/paymentStorage';

export const getPaymentScreenshot = async (req: Request, res: Response) => {
    try {
        const key = req.params.key as string; // e.g. base64 encoded or direct key if we handle slashes
        // Decode base64 to handle slashes correctly in URL
        const storageKey = Buffer.from(key, 'base64').toString('ascii');
        
        // Prevent directory traversal if local
        if (storageKey.includes('..')) {
            return res.status(400).send('Invalid key');
        }

        const buffer = await readPaymentScreenshot(storageKey);
        
        // Infer mimetype from extension
        const ext = storageKey.split('.').pop()?.toLowerCase();
        let mime = 'image/jpeg';
        if (ext === 'png') mime = 'image/png';
        if (ext === 'webp') mime = 'image/webp';
        
        res.setHeader('Content-Type', mime);
        res.setHeader('Cache-Control', 'private, max-age=86400'); // 1 day
        res.send(buffer);
    } catch (err) {
        console.error('Failed to serve payment screenshot:', err);
        res.status(404).send('Not found');
    }
};
