import { CanonicalMonth, MonthCoverageError } from './types';

export { DURATION_MONTHS, MonthCoverageError } from './types';
export type { CanonicalMonth, MonthCoverageDuration, MonthCoverageErrorCode } from './types';

const CANONICAL_MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

function ordinalFor(year: number, month: number): number {
  return year * 12 + month - 1;
}

function formatOrdinal(ordinal: number): string {
  const year = Math.floor(ordinal / 12);
  const month = ordinal % 12 + 1;
  return formatMonth({ year, month });
}

export function parseMonth(value: string): CanonicalMonth {
  const match = CANONICAL_MONTH.exec(value);
  if (!match) throw new MonthCoverageError('INVALID_MONTH_FORMAT');

  const year = Number(match[1]);
  const month = Number(match[2]);
  return { year, month, ordinal: ordinalFor(year, month) };
}

export function formatMonth(value: Pick<CanonicalMonth, 'year' | 'month'>): string {
  if (
    !Number.isInteger(value.year)
    || value.year < 0
    || value.year > 9999
    || !Number.isInteger(value.month)
    || value.month < 1
    || value.month > 12
  ) {
    throw new MonthCoverageError('INVALID_MONTH_FORMAT');
  }
  return `${String(value.year).padStart(4, '0')}-${String(value.month).padStart(2, '0')}`;
}

export function compareMonths(left: string, right: string): -1 | 0 | 1 {
  const difference = parseMonth(left).ordinal - parseMonth(right).ordinal;
  return difference === 0 ? 0 : difference < 0 ? -1 : 1;
}

export function enumerateMonths(start: string, end: string): string[] {
  const from = parseMonth(start);
  const to = parseMonth(end);
  if (from.ordinal > to.ordinal) throw new MonthCoverageError('INVALID_MONTH_RANGE');
  return Array.from({ length: to.ordinal - from.ordinal + 1 }, (_, index) => formatOrdinal(from.ordinal + index));
}

export function validateFeePeriod(start: string, end: string): { start: string; end: string } {
  enumerateMonths(start, end);
  return { start, end };
}

function monthInTimezone(value: Date, timezone: string): string {
  if (Number.isNaN(value.getTime())) throw new MonthCoverageError('INVALID_DATE');
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(value);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    if (!year || !month) throw new MonthCoverageError('INVALID_TIMEZONE');
    return `${year}-${month}`;
  } catch (error) {
    if (error instanceof MonthCoverageError) throw error;
    throw new MonthCoverageError('INVALID_TIMEZONE');
  }
}

export function currentMonthInTimezone(now: Date, timezone: string): string {
  return monthInTimezone(now, timezone);
}

export function defaultFeeStartMonth(joinedAt: Date | string, batchStartMonth: string, timezone: string): string {
  parseMonth(batchStartMonth);
  const joinMonth = monthInTimezone(new Date(joinedAt), timezone);
  return compareMonths(joinMonth, batchStartMonth) < 0 ? batchStartMonth : joinMonth;
}
