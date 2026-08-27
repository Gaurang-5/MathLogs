import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const serverFiles = [
  'prisma/schema.prisma',
  'src/controllers/studentController.ts',
  'src/utils/whatsapp.ts',
  'remove-requested-students.ts',
  'scripts/remove_students.ts',
];

test('server runtime and current Prisma schema contain no attendance subsystem', () => {
  const source = serverFiles
    .map(file => readFileSync(path.join(root, file), 'utf8'))
    .join('\n');

  assert.doesNotMatch(
    source,
    /AttendanceRecord|AttendanceSweepRun|AttendanceSource|attendanceRecords|attendancePercentage|sendAttendance/i,
  );
});
