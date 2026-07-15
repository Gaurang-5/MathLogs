import { Application } from 'express';

export const initializeSentry = () => {
    console.log('[SENTRY] Sentry disabled manually to prevent hang');
};

export const captureException = (error: any, context?: any) => {
    console.log('[SENTRY_MOCK] Exception captured:', error?.message);
};

export const captureMessage = (message: string, level: string = 'info') => {
    console.log(`[SENTRY_MOCK] Message [${level}]:`, message);
};

export const addBreadcrumb = (category: string, message: string, data?: any) => {
    // console.log(`[SENTRY_MOCK] Breadcrumb [${category}]:`, message);
};

export default {
    setupExpressErrorHandler: (app: Application) => {},
    captureException,
    captureMessage,
    addBreadcrumb
};
