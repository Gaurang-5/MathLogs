export const initializeSentry = () => {
    console.log('[SENTRY] Sentry disabled manually to prevent hang');
};

export const captureException = (error, context) => {
    console.log('[SENTRY_MOCK] Exception captured:', error?.message);
};

export const captureMessage = (message, level = 'info') => {
    console.log(`[SENTRY_MOCK] Message [${level}]:`, message);
};

export const addBreadcrumb = (category, message, data) => {
    // console.log(`[SENTRY_MOCK] Breadcrumb [${category}]:`, message);
};

export default {
    setupExpressErrorHandler: (app) => {},
    captureException,
    captureMessage,
    addBreadcrumb
};
