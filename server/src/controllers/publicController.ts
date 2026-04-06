import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { z } from 'zod';

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
