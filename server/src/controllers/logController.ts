import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { JobStatus } from '@prisma/client';

export const getSystemLogs = async (req: Request, res: Response) => {
    try {
        const instituteId = (req as any).user?.instituteId;
        const { type } = req.query; // 'STUDENT'
        
        let typeFilter = undefined;
        if (type === 'STUDENT') {
            typeFilter = { in: ['STUDENT_JOIN', 'STUDENT_LEAVE'] };
        }

        const logs = await prisma.systemLog.findMany({
            where: {
                instituteId,
                ...(typeFilter && { action: typeFilter })
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(logs);
    } catch (e) {
        console.error('Failed to get system logs', e);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
};

export const getCommunicationLogs = async (req: Request, res: Response) => {
    try {
        const instituteId = (req as any).user?.instituteId;
        const { status } = req.query; // 'COMPLETED' | 'FAILED' | 'PENDING'
        
        const logs = await prisma.whatsappJob.findMany({
            where: {
                instituteId,
                ...(status && { status: status as JobStatus })
            },
            orderBy: { createdAt: 'desc' }
        });

        const mappedLogs = logs.map(job => ({
            id: job.id,
            phone: job.recipient,
            type: job.templateId,
            status: job.status,
            context: job.data,
            error: job.error,
            createdAt: job.createdAt
        }));

        res.json(mappedLogs);
    } catch (e) {
        console.error('Failed to get communication logs', e);
        res.status(500).json({ error: 'Failed to fetch communication logs' });
    }
};
