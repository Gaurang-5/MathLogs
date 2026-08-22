import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { downloadBatchPDF } from '../src/controllers/batchController';
import { prisma } from '../src/prisma';
import { buildBatchExportRows, resolveBatchExportColumns } from '../src/services/batchExportService';

const originalFindUnique = prisma.batch.findUnique;
afterEach(() => { prisma.batch.findUnique = originalFindUnique; });

function response() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    headers: new Map<string, string>(),
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    setHeader(name: string, value: string) { this.headers.set(name, value); },
    send(body: unknown) { this.body = body; return this; },
  };
}

test('batch PDF rejects malformed export column keys before reading batch data', async () => {
  prisma.batch.findUnique = (async () => assert.fail('malformed columns must fail before the database query')) as typeof prisma.batch.findUnique;
  const res = response();

  await downloadBatchPDF({
    params: { id: 'batch-1' },
    query: { columns: 'studentName,__privateField' },
    user: { id: 'teacher-1', instituteId: 'inst-1' },
  } as never, res as never);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'INVALID_EXPORT_COLUMNS' });
});

test('batch PDF rejects syntactically valid columns that are not configured for the institute', async () => {
  prisma.batch.findUnique = (async () => ({
    id: 'batch-1', name: 'Target', subject: 'Math', feeAmount: 0, instituteId: 'inst-1',
    institute: { coachingFeeMode: 'MONTH_COVERAGE', timezone: 'Asia/Kolkata', config: { registrationForm: { fields: [
      { id: 'studentName', label: 'Student Name', system: true },
    ] } } },
    students: [], feeInstallments: [],
  })) as typeof prisma.batch.findUnique;
  const res = response();

  await downloadBatchPDF({
    params: { id: 'batch-1' },
    query: { columns: 'studentName,custom:privateNotes' },
    user: { id: 'teacher-1', instituteId: 'inst-1' },
  } as never, res as never);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'INVALID_EXPORT_COLUMNS' });
});

test('selected configured columns keep teacher order and exclude every unselected field', () => {
  const columns = resolveBatchExportColumns({
    requested: ['studentName', 'parentWhatsapp', 'custom:studentPhone'],
    registrationFields: [
      { id: 'studentName', label: 'Student Name', system: true },
      { id: 'parentWhatsapp', label: 'Parent WhatsApp', system: true },
      { id: 'studentPhone', label: 'Student Phone', system: false },
      { id: 'privateNotes', label: 'Private Notes', system: false },
    ],
    installments: [],
    feeMode: 'MONTH_COVERAGE',
  });

  const rows = buildBatchExportRows({
    columns,
    installments: [],
    students: [{
      id: 'student-1', humanId: 'MTH-1', name: 'Aarav', parentName: 'Parent', parentWhatsapp: '9557940807',
      parentEmail: 'parent@example.com', schoolName: 'Example School', createdAt: new Date('2026-06-01'),
      additionalData: { studentPhone: '9000000000', privateNotes: 'must not leak' }, marks: [], fees: [], feePayments: [],
    }],
  });

  assert.deepEqual(columns.map(column => column.id), ['studentName', 'parentWhatsapp', 'custom:studentPhone']);
  assert.deepEqual(rows, [['Aarav', '9557940807', '9000000000']]);
});

test('fee columns from the other fee model cannot be exported', () => {
  assert.throws(() => resolveBatchExportColumns({
    requested: ['studentName', 'totalDue'],
    registrationFields: [{ id: 'studentName', label: 'Student Name', system: true }],
    installments: [],
    feeMode: 'MONTH_COVERAGE',
  }), /INVALID_EXPORT_COLUMNS/);
});
