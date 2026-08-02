type EnvOptions = {
    devDefault?: string;
    fallbackEnv?: string;
};

export function requireEnv(name: string, options: EnvOptions = {}): string {
    const value = process.env[name];
    if (value) return value;

    if (options.fallbackEnv) {
        const fallback = process.env[options.fallbackEnv];
        if (fallback) return fallback;
    }

    if (process.env.NODE_ENV !== 'production' && options.devDefault !== undefined) {
        return options.devDefault;
    }

    throw new Error(`FATAL: ${name} environment variable must be set.`);
}

export function getJwtSecret(): string {
    return requireEnv('JWT_SECRET');
}

export function getRazorpayConfig(): { keyId: string; keySecret: string } {
    return {
        keyId: requireEnv('RAZORPAY_KEY_ID', { devDefault: 'dummy_key' }),
        keySecret: requireEnv('RAZORPAY_KEY_SECRET', { devDefault: 'dummy_secret' }),
    };
}
