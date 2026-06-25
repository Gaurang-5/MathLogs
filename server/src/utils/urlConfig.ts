import { Request } from 'express';

/**
 * Determines the client URL based on the request host.
 * Supports multiple domains (mathlogs.in, mathlogs.app) and falls back to env var.
 */
export const getClientUrl = (req: Request): string => {
    const host = req.get('host') || '';

    // Check if the request is coming from one of our known custom domains
    if (host.includes('mathlogs.in')) {
        return 'https://mathlogs.in';
    }
    if (host.includes('mathlogs.app')) {
        return 'https://mathlogs.app';
    }

    // Fallback to configured CLIENT_URL or dev default
    return process.env.CLIENT_URL || 'http://localhost:5173';
};
