import { Request, Response } from 'express';
import { prisma } from '../prisma';

export const getLeads = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const instituteId = user.instituteId;

        if (!instituteId) {
            return res.status(400).json({ error: 'No institute associated with this account.' });
        }

        const leads = await prisma.studentLead.findMany({
            where: { instituteId },
            include: {
                batch: { select: { id: true, name: true, subject: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(leads);
    } catch (error) {
        console.error('Failed to fetch leads:', error);
        res.status(500).json({ error: 'Failed to fetch leads' });
    }
};

export const updateLeadStatus = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const instituteId = user.instituteId;
        const leadId = req.params.id as string;
        const { status } = req.body;

        if (!['NEW', 'CONTACTED', 'CONVERTED', 'LOST'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status.' });
        }

        const lead = await prisma.studentLead.findFirst({
            where: { id: leadId, instituteId }
        });

        if (!lead) {
            return res.status(404).json({ error: 'Lead not found.' });
        }

        const updated = await prisma.studentLead.update({
            where: { id: leadId },
            data: { status }
        });

        res.json(updated);
    } catch (error) {
        console.error('Failed to update lead:', error);
        res.status(500).json({ error: 'Failed to update lead' });
    }
};

export const convertLead = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const instituteId = user.instituteId;
        const leadId = req.params.id as string;
        const { batchId } = req.body;

        if (!batchId) {
            return res.status(400).json({ error: 'Batch ID is required for conversion.' });
        }

        const lead = await prisma.studentLead.findFirst({
            where: { id: leadId, instituteId }
        });

        if (!lead) {
            return res.status(404).json({ error: 'Lead not found.' });
        }

        // Check for duplicate student in same batch
        const existing = await prisma.student.findFirst({
            where: {
                name: lead.studentName,
                parentWhatsapp: lead.parentPhone,
                batchId
            }
        });

        if (existing) {
            return res.status(409).json({ error: 'This student already exists in the selected batch.' });
        }

        // Create the student and mark lead as converted in a transaction
        const [student] = await prisma.$transaction([
            prisma.student.create({
                data: {
                    name: lead.studentName,
                    parentName: lead.parentName,
                    parentWhatsapp: lead.parentPhone,
                    batchId,
                    instituteId,
                    status: 'ACTIVE'
                }
            }),
            prisma.studentLead.update({
                where: { id: leadId },
                data: { status: 'CONVERTED' }
            })
        ]);

        res.json({ success: true, student });
    } catch (error) {
        console.error('Failed to convert lead:', error);
        res.status(500).json({ error: 'Failed to convert lead to student.' });
    }
};

export const getInstituteSlug = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const instituteId = user.instituteId;

        const institute = await prisma.institute.findUnique({
            where: { id: instituteId },
            select: { slug: true, name: true, aboutUs: true, websiteConfig: true }
        });

        if (!institute) {
            return res.status(404).json({ error: 'Institute not found.' });
        }

        res.json(institute);
    } catch (error) {
        console.error('Failed to fetch slug:', error);
        res.status(500).json({ error: 'Failed to fetch institute info.' });
    }
};

export const updateInstituteSlug = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const instituteId = user.instituteId;
        const { slug, aboutUs, websiteConfig } = req.body;

        const updateData: any = {};

        if (slug) {
            const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/(^-|-$)+/g, '');
            const existing = await prisma.institute.findUnique({ where: { slug: cleanSlug } });
            if (existing && existing.id !== instituteId) {
                return res.status(409).json({ error: 'This URL is already taken. Choose a different one.' });
            }
            updateData.slug = cleanSlug;
        }

        if (aboutUs !== undefined) updateData.aboutUs = aboutUs;
        if (websiteConfig !== undefined) updateData.websiteConfig = websiteConfig;

        if (Object.keys(updateData).length > 0) {
            await prisma.institute.update({
                where: { id: instituteId },
                data: updateData
            });
        }

        res.json({ success: true, slug: updateData.slug || undefined });
    } catch (error) {
        console.error('Failed to update website settings:', error);
        res.status(500).json({ error: 'Failed to update website settings.' });
    }
};
