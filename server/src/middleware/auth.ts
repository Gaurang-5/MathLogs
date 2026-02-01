
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET environment variable must be set. Generate a secure secret with: openssl rand -base64 32');
}


export interface AuthRequest extends Request {
    user?: any;
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        res.sendStatus(401);
        return;
    }

    jwt.verify(token, JWT_SECRET, async (err: any, user: any) => {
        if (err) {
            res.sendStatus(403);
            return;
        }

        try {
            // Fetch fresh user data to get currentAcademicYearId
            // Import prisma dynamically to avoid circular dependency issues if any, 
            // though standard import at top is better. I'll add import at top.
            const { prisma } = await import('../prisma');

            const dbUser = await prisma.admin.findUnique({
                where: { id: user.id },
                select: {
                    id: true,
                    username: true,
                    currentAcademicYearId: true,
                    passwordVersion: true,
                    instituteId: true,
                    role: true
                }
            });

            if (!dbUser) {
                res.sendStatus(403);
                return;
            }

            // Invalidate token if password was changed (version mismatch)
            if (user.passwordVersion !== undefined && dbUser.passwordVersion !== user.passwordVersion) {
                console.warn(`[SECURITY] Token invalidated due to password change for user: ${user.username}`);
                res.sendStatus(403);
                return;
            }

            req.user = { ...user, ...dbUser };
            next();
        } catch (e) {
            console.error('Auth Middleware Error:', e);
            res.sendStatus(500);
        }
    });
};
