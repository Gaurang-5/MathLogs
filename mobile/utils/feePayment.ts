export interface PaymentOption {
  id: string;
  name: string;
  batchName: string;
  amount: number;
  paid: number;
  remaining: number;
}

export interface PaymentAllocation {
  installmentId: string;
  amount: number;
}

export type AllocationResult =
  | { ok: true; amount: number; allocations: PaymentAllocation[] }
  | { ok: false; message: string; allocations: PaymentAllocation[] };

export function paymentAmountInPaise(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, decimal = ''] = normalized.split('.');
  const paise = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
  return Number.isSafeInteger(paise) && paise > 0 ? paise : null;
}

export function selectedInstallmentTotal(selectedIds: string[], options: PaymentOption[]): number {
  const selected = new Set(selectedIds);
  const totalPaise = options.reduce(
    (total, option) => total + (selected.has(option.id) ? Math.round(option.remaining * 100) : 0),
    0,
  );
  return totalPaise / 100;
}

export function paymentInputValue(amount: number): string {
  return amount.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

export function buildPaymentAllocations(
  value: string,
  selectedIds: string[],
  options: PaymentOption[],
): AllocationResult {
  const amountPaise = paymentAmountInPaise(value);
  if (amountPaise === null) {
    return { ok: false, message: 'Enter a positive amount with at most two decimal places.', allocations: [] };
  }

  const selected = [...new Set(selectedIds)]
    .map(id => options.find(option => option.id === id))
    .filter((option): option is PaymentOption => Boolean(option && option.remaining > 0));
  if (selected.length === 0) {
    return { ok: false, message: 'Select at least one outstanding installment.', allocations: [] };
  }

  const availablePaise = selected.reduce((total, option) => total + Math.round(option.remaining * 100), 0);
  if (amountPaise > availablePaise) {
    return {
      ok: false,
      message: 'The amount is higher than the balance of the selected installments.',
      allocations: [],
    };
  }

  let unallocated = amountPaise;
  const allocations: PaymentAllocation[] = [];
  for (const option of selected) {
    if (unallocated <= 0) break;
    const allocatedPaise = Math.min(unallocated, Math.round(option.remaining * 100));
    if (allocatedPaise > 0) allocations.push({ installmentId: option.id, amount: allocatedPaise / 100 });
    unallocated -= allocatedPaise;
  }

  if (unallocated !== 0) {
    return { ok: false, message: 'Allocate the full amount before saving.', allocations };
  }
  return { ok: true, amount: amountPaise / 100, allocations };
}

export function createPaymentReference(studentId: string): string {
  return `mobile-${studentId}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}
