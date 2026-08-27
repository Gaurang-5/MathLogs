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

const productFiles = [
  '../client/index.html',
  '../client/src/pages/AboutUs.tsx',
  '../client/src/pages/Home.tsx',
  '../client/src/pages/MarketplaceSettings.tsx',
  '../client/src/pages/Onboarding.tsx',
  '../client/src/pages/StudentPortalLogin.tsx',
  '../client/src/pages/TeacherRegistration.tsx',
  '../client/src/pages/StudentProfile.tsx',
  '../client/src/components/StudentProfileDrawer.tsx',
  '../README.md',
  'src/index.ts',
];

test('client contracts and product copy make no attendance claim', () => {
  const source = productFiles
    .map(file => readFileSync(path.join(root, file), 'utf8'))
    .join('\n');

  assert.doesNotMatch(source, /attendance/i);
});
