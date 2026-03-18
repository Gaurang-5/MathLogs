import posthog from 'posthog-js';

export const initializePostHog = () => {
    // Only initialize in production or if explicitly enabled
    const posthogKey = import.meta.env.VITE_POSTHOG_KEY;
    const posthogHost = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

    if (posthogKey) {
        posthog.init(posthogKey, {
            api_host: posthogHost,
            person_profiles: 'identified_only', // or 'always' to track anonymous users
            capture_pageview: true,
            autocapture: true, // Captures clicks and interactions automatically
            loaded: (posthog_instance) => {
                if (import.meta.env.DEV) posthog_instance.opt_out_capturing(); // opt out in local dev by default
            } // To test locally, remove the conditional opt_out or use `posthog.opt_in_capturing()`
        });
        console.log('[PostHog] Initialized');
    } else {
        console.warn('[PostHog] Initialization skipped: Missing VITE_POSTHOG_KEY');
    }
};

export default posthog;
