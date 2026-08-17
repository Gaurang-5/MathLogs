export function isSupportFeatureEnabled(value = process.env.SUPPORT_FEATURE_ENABLED): boolean {
  return value?.trim().toLowerCase() === 'true';
}
