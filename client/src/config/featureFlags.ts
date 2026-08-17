export function parseSupportFeatureFlag(value?: string): boolean {
  return value?.trim().toLowerCase() === 'true';
}

export const supportFeatureEnabled = parseSupportFeatureFlag(import.meta.env.VITE_SUPPORT_FEATURE_ENABLED);
