export const UNLIMITED_ACCOUNT_PHONE = '9557940807';

function normalizePhone(value: string): string {
  const raw = String(value || '').trim();
  if (!/^[+()\d\s-]+$/.test(raw)) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

export function hasUnlimitedAccountCreation(phone: string): boolean {
  return normalizePhone(phone) === UNLIMITED_ACCOUNT_PHONE;
}

export function scopedAccountOwnerIdentity(ownerIdentity: string, scope: string): string {
  return hasUnlimitedAccountCreation(ownerIdentity)
    ? `${UNLIMITED_ACCOUNT_PHONE}+${scope}@account.mathlogs.internal`
    : ownerIdentity;
}

export function instituteAdminUsername(phone: string | null, email: string | null, instituteId: string): string {
  if (phone && hasUnlimitedAccountCreation(phone)) {
    return `${UNLIMITED_ACCOUNT_PHONE}_${instituteId}`;
  }
  return phone || email || `admin_${instituteId.slice(0, 8)}`;
}
