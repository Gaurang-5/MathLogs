import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { secureLogger } from '../utils/secureLogger';

/**
 * Check if a student is registered in a batch
 * Public endpoint - no auth required
 * Used for: Students checking if their registration succeeded, partial batch recovery
 */
export const checkRegistrationStatus = async (req: Request, res: Response) => {
    try {
        const { whatsapp, batchId } = req.query;

        if (!whatsapp || !batchId) {
            return res.status(400).json({
                error: 'WhatsApp number and batch ID are required'
            });
        }

        // Sanitize whatsapp number (remove spaces, dashes, country codes)
        const sanitizedWhatsapp = String(whatsapp).replace(/[\s\-+]/g, '');

        // Find student by whatsapp and batch
        const student = await prisma.student.findFirst({
            where: {
                parentWhatsapp: {
                    contains: sanitizedWhatsapp.slice(-10) // Last 10 digits to handle country code variations
                },
                batchId: String(batchId)
            },
            select: {
                id: true,
                humanId: true,
                name: true,
                schoolName: true,
                status: true,
                createdAt: true
            }
        });

        if (student) {
            return res.json({
                registered: true,
                student: {
                    humanId: student.humanId,
                    name: student.name,
                    schoolName: student.schoolName,
                    status: student.status,
                    registeredAt: student.createdAt
                }
            });
        } else {
            secureLogger.debug('Registration status check - not found', {
                whatsappLast4: sanitizedWhatsapp.slice(-4),
                batchId,
                found: false
            });

            return res.json({
                registered: false,
                message: 'No registration found for this WhatsApp number in this batch'
            });
        }
    } catch (error: any) {
        secureLogger.error('Registration status check failed', error);
        res.status(500).json({ error: 'Failed to check registration status' });
    }
};
