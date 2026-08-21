import type { MonthCoverageDuration } from './types';

const DURATION_OPTIONS: Array<{ value: MonthCoverageDuration; label: string; months: number }> = [
  { value: 'MONTHLY', label: 'Monthly', months: 1 },
  { value: 'QUARTERLY', label: 'Quarterly', months: 3 },
  { value: 'HALF_YEARLY', label: 'Half yearly', months: 6 },
  { value: 'YEARLY', label: 'Yearly', months: 12 },
];

function parts(month: string): { year: number; month: number } {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) throw new Error('INVALID_MONTH_FORMAT');
  return { year: Number(match[1]), month: Number(match[2]) };
}

export function monthLabel(month: string): string {
  const value = parts(month);
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(value.year, value.month - 1, 1)));
}

export function listMonths(months: string[]): string {
  const labels = months.map(monthLabel);
  if (labels.length <= 1) return labels[0] ?? '';
  const years = new Set(labels.map(label => label.slice(-4)));
  if (years.size === 1) {
    const year = labels[0].slice(-4);
    const names = labels.map(label => label.replace(` ${year}`, ''));
    if (names.length === 2) return `${names[0]} and ${names[1]} ${year}`;
    return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]} ${year}`;
  }
  return labels.length === 2
    ? `${labels[0]} and ${labels[1]}`
    : `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

export const durationOptions = DURATION_OPTIONS;

export function availableDurations(remainingMonths: number) {
  return DURATION_OPTIONS.map(option => ({ ...option, disabled: option.months > remainingMonths }));
}

export function formatCoverageRange(months: string[]): string {
  if (months.length === 0) return 'No months selected';
  if (months.length === 1) return monthLabel(months[0]);
  const first = monthLabel(months[0]);
  const last = monthLabel(months[months.length - 1]);
  const firstYear = first.slice(-4);
  const lastYear = last.slice(-4);
  return firstYear === lastYear
    ? `${first.replace(` ${firstYear}`, '')}–${last}`
    : `${first}–${last}`;
}

export function paymentPreviewCopy(amount: number, duration: MonthCoverageDuration, months: string[]): string {
  const durationLabel = DURATION_OPTIONS.find(option => option.value === duration)?.label ?? duration;
  const formattedAmount = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(amount);
  return `₹${formattedAmount} received · ${durationLabel} · Covers ${listMonths(months)}`;
}

export function overlapMessage(month: string): string {
  return `${monthLabel(month)} fee has already been received. Please select another month.`;
}

export function monthStatusCopy(
  month: string | null,
  status: 'RECEIVED' | 'OVERDUE' | 'PENDING' | 'SETUP_REQUIRED',
): string {
  if (status === 'SETUP_REQUIRED') return 'Fee start month needs to be set';
  if (!month) return 'Fee month unavailable';
  const label = monthLabel(month);
  if (status === 'RECEIVED') return `${label} fee received`;
  if (status === 'OVERDUE') return `${label} fee pending · overdue`;
  return `${label} fee pending`;
}
