import test from 'node:test';
import assert from 'node:assert/strict';
import { auditEnrollmentCutover, CUTOVER_QUERIES } from '../scripts/auditEnrollmentCutover';

test('cutover audit blocks on unresolved or inconsistent enrollment data', async () => {
  const counts = new Map<string, number>([
    [CUTOVER_QUERIES.approvedStudents, 12],
    [CUTOVER_QUERIES.activeEnrollments, 14],
    [CUTOVER_QUERIES.unlinkedMonthCoverageRows, 1],
    [CUTOVER_QUERIES.unresolvedIdentityReviews, 1],
    [CUTOVER_QUERIES.lifecycleNotificationFailures, 2],
  ]);
  const report = await auditEnrollmentCutover({
    count: async sql => counts.get(sql) || 0,
  });

  assert.deepEqual(report.blockers, [
    { code: 'UNRESOLVED_IDENTITY_REVIEW', count: 1 },
    { code: 'UNLINKED_MONTH_COVERAGE_ROW', count: 1 },
  ]);
  assert.deepEqual(report.warnings, [
    { code: 'LIFECYCLE_NOTIFICATION_FAILURE', count: 2 },
  ]);
  assert.equal(report.counts.approvedStudents, 12);
  assert.equal(report.counts.activeEnrollments, 14);
  assert.equal(report.ready, false);
});

test('cutover audit is ready only when every structural blocker is zero', async () => {
  const report = await auditEnrollmentCutover({ count: async () => 0 });
  assert.equal(report.ready, true);
  assert.deepEqual(report.blockers, []);
});
