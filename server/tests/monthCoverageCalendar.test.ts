import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MonthCoverageError,
  compareMonths,
  currentMonthInTimezone,
  defaultFeeStartMonth,
  enumerateMonths,
  parseMonth,
  validateFeePeriod,
} from '../src/domain/monthCoverage/calendar';

test('enumerates inclusive months across a year boundary', () => {
  assert.deepEqual(enumerateMonths('2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02']);
});

test('default fee start uses the batch start for a pre-batch admission', () => {
  assert.equal(defaultFeeStartMonth('2026-06-20T00:00:00.000Z', '2026-07', 'Asia/Kolkata'), '2026-07');
});

test('default fee start uses the joining month for a post-start admission', () => {
  assert.equal(defaultFeeStartMonth('2026-08-20T00:00:00.000Z', '2026-07', 'Asia/Kolkata'), '2026-08');
});

test('current month uses institute timezone', () => {
  assert.equal(currentMonthInTimezone(new Date('2026-08-31T20:00:00.000Z'), 'Asia/Kolkata'), '2026-09');
});

test('rejects malformed canonical months with a typed error', () => {
  assert.throws(
    () => parseMonth('2026-13'),
    (error: unknown) => error instanceof MonthCoverageError && error.code === 'INVALID_MONTH_FORMAT',
  );
});

test('rejects inverted month periods', () => {
  assert.throws(
    () => validateFeePeriod('2026-08', '2026-07'),
    (error: unknown) => error instanceof MonthCoverageError && error.code === 'INVALID_MONTH_RANGE',
  );
});

test('compares canonical months by calendar position', () => {
  assert.equal(compareMonths('2027-01', '2026-12'), 1);
  assert.equal(compareMonths('2026-12', '2026-12'), 0);
  assert.equal(compareMonths('2026-11', '2026-12'), -1);
});
