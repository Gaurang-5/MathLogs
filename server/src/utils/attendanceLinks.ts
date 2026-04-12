import { randomBytes } from 'crypto';

/**
 * Utility functions for generating and validating attendance link tokens
 */

export const generateAttendanceToken = (instituteId: string, timestamp: number): string => {
    // A simple deterministic token for temporary attendance links.
    // In production, consider using JWTs or similar securely signed strings.
    return Buffer.from(`${instituteId}:${timestamp}:${process.env.JWT_SECRET || 'dev-secret'}`).toString('base64');
};

export const validateAttendanceToken = (token: string, instituteId: string): boolean => {
    try {
        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        const [tokenInstId, timestampStr, secret] = decoded.split(':');
        
        if (tokenInstId !== instituteId || secret !== (process.env.JWT_SECRET || 'dev-secret')) {
            return false;
        }

        // Links are valid for 24 hours (86400000 ms)
        const timestamp = parseInt(timestampStr, 10);
        if (Date.now() - timestamp > 86400000) {
            return false;
        }

        return true;
    } catch {
        return false;
    }
};
