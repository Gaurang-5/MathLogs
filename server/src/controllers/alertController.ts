import { Request, Response } from 'express';
import { prisma } from '../prisma';

export const getSystemAlerts = async (req: Request, res: Response) => {
    try {
        const alerts = await prisma.systemAlert.findMany({
            where: {
                isActive: true,
                OR: [
                    { expiresAt: null },
                    { expiresAt: { gt: new Date() } }
                ]
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(alerts);
    } catch (error) {
        console.error('Failed to fetch system alerts:', error);
        res.status(500).json({ error: 'Failed to fetch alerts' });
    }
};

export const createSystemAlert = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        if (user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { title, message, type, expiresAt } = req.body;
        const alert = await prisma.systemAlert.create({
            data: {
                title,
                message,
                type: type || 'INFO',
                expiresAt: expiresAt ? new Date(expiresAt) : null,
                isActive: true
            }
        });
        res.status(201).json(alert);
    } catch (error) {
        console.error('Failed to create system alert:', error);
        res.status(500).json({ error: 'Failed to create alert' });
    }
};

export const dismissSystemAlert = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        if (user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const id = req.params.id as string;
        const alert = await prisma.systemAlert.update({
            where: { id },
            data: { isActive: false }
        });
        res.json(alert);
    } catch (error) {
        console.error('Failed to dismiss system alert:', error);
        res.status(500).json({ error: 'Failed to dismiss alert' });
    }
};
