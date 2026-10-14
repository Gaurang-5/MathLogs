import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const migratedFiles = [
  'src/controllers/dashboardController.ts',
  'src/controllers/batchController.ts',
  'src/controllers/feeController.ts',
  'src/controllers/publicController.ts',
  'src/controllers/studentPortalController.ts',
  'src/controllers/testController.ts',
  'src/services/batchExportService.ts',
  'src/services/monthCoverageSummaryService.ts',
  'src/services/monthCoverageReportService.ts',
  'src/utils/feeCalculations.ts',
  'src/utils/quizBroadcasts.ts',
];

test('batch membership reads use Enrollment rather than Student.batchId', () => {
  const source = migratedFiles.map(file => readFileSync(path.join(process.cwd(), file), 'utf8')).join('\n');
  assert.doesNotMatch(source, /student\.batchId|s\."batchId"|s\.batchId/);
});
