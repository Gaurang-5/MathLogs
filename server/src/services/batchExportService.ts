const CORE_COLUMN_IDS = new Set([
  'humanId', 'studentName', 'parentName', 'parentWhatsapp', 'parentEmail', 'schoolName',
  'averageMarks', 'totalDue', 'feeStartMonth', 'feeEndMonth', 'receivedMonths', 'pendingMonths', 'overdueMonths',
]);
const DYNAMIC_COLUMN = /^(custom|installment):[A-Za-z0-9_-]{1,128}$/;

export function parseBatchExportColumnIds(value: unknown): string[] | null {
  if (value === undefined) return null;
  if (typeof value !== 'string') throw new Error('INVALID_EXPORT_COLUMNS');
  const values = value.split(',').map(item => item.trim()).filter(Boolean);
  if (values.length === 0 || values.length > 40) throw new Error('INVALID_EXPORT_COLUMNS');
  const unique = [...new Set(values)];
  if (unique.length !== values.length || unique.some(id => !CORE_COLUMN_IDS.has(id) && !DYNAMIC_COLUMN.test(id))) {
    throw new Error('INVALID_EXPORT_COLUMNS');
  }
  return unique;
}

export type BatchExportColumnDefinition = { id: string; label: string };
type RegistrationField = { id?: unknown; label?: unknown; system?: unknown };
type Installment = { id: string; name: string; amount: number; createdAt: Date | string };

const SYSTEM_LABELS: Record<string, string> = {
  studentName: 'Student Name', parentName: 'Parent / Guardian Name', parentWhatsapp: 'Parent WhatsApp',
  parentEmail: 'Parent Email', schoolName: 'School Name',
};
const MONTH_COLUMNS: BatchExportColumnDefinition[] = [
  { id: 'feeStartMonth', label: 'Fee Start Month' }, { id: 'feeEndMonth', label: 'Fee End Month' },
  { id: 'receivedMonths', label: 'Months Received' }, { id: 'pendingMonths', label: 'Months Pending' },
  { id: 'overdueMonths', label: 'Months Overdue' },
];

export function resolveBatchExportColumns(input: {
  requested: string[] | null;
  registrationFields: RegistrationField[];
  installments: Installment[];
  feeMode: 'CURRENT_DUE_BASED' | 'MONTH_COVERAGE';
}): BatchExportColumnDefinition[] {
  const available = new Map<string, BatchExportColumnDefinition>();
  available.set('humanId', { id: 'humanId', label: 'Student ID' });
  for (const field of input.registrationFields) {
    if (typeof field.id !== 'string' || typeof field.label !== 'string') continue;
    const id = field.system ? field.id : `custom:${field.id}`;
    if (field.system && !(field.id in SYSTEM_LABELS)) continue;
    available.set(id, { id, label: field.label });
  }
  for (const [id, label] of Object.entries(SYSTEM_LABELS)) {
    if (input.registrationFields.length === 0) available.set(id, { id, label });
  }
  available.set('averageMarks', { id: 'averageMarks', label: 'Average Marks' });
  if (input.feeMode === 'MONTH_COVERAGE') {
    for (const column of MONTH_COLUMNS) available.set(column.id, column);
  } else {
    for (const installment of input.installments) available.set(`installment:${installment.id}`, { id: `installment:${installment.id}`, label: installment.name });
    available.set('totalDue', { id: 'totalDue', label: 'Total Due' });
  }

  const fallback = input.feeMode === 'MONTH_COVERAGE'
    ? ['studentName', 'schoolName', 'parentWhatsapp', 'averageMarks', ...MONTH_COLUMNS.map(column => column.id)]
    : ['studentName', 'schoolName', 'parentWhatsapp', 'averageMarks', ...input.installments.map(item => `installment:${item.id}`), 'totalDue'];
  const requested = input.requested ?? fallback.filter(id => available.has(id));
  const resolved = requested.map(id => available.get(id));
  if (resolved.some(column => !column)) throw new Error('INVALID_EXPORT_COLUMNS');
  return resolved as BatchExportColumnDefinition[];
}

type ExportStudent = {
  id: string; humanId: string | null; name: string; parentName: string | null; parentWhatsapp: string | null;
  parentEmail: string | null; schoolName: string | null; createdAt: Date | string; additionalData: unknown;
  marks: Array<{ score: number; test?: { maxMarks: number } | null }>;
  fees: Array<{ amount: number; status: string }>;
  feePayments: Array<{ amountPaid: number; date: Date | string; installmentId: string }>;
};
type MonthMetrics = { studentId: string; feeStartMonth: string | null; feeEndMonth: string | null; receivedMonths: number; pendingMonths: number; overdueMonths: number };

function legacyFeeValue(student: ExportStudent, installment: Installment): string {
  if (new Date(installment.createdAt) < new Date(student.createdAt)) return '-';
  const payments = student.feePayments.filter(payment => payment.installmentId === installment.id);
  const paid = payments.reduce((sum, payment) => sum + payment.amountPaid, 0);
  if (paid >= installment.amount - 0.01) {
    const latest = [...payments].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())[0];
    return latest ? `Paid ${new Date(latest.date).toLocaleDateString('en-IN')}` : 'Paid';
  }
  return paid > 0 ? `Due ₹${Math.round(installment.amount - paid)}` : 'Unpaid';
}

export function buildBatchExportRows(input: {
  students: ExportStudent[];
  columns: BatchExportColumnDefinition[];
  installments: Installment[];
  monthMetrics?: MonthMetrics[];
}): string[][] {
  const installments = new Map(input.installments.map(item => [item.id, item]));
  const metrics = new Map((input.monthMetrics ?? []).map(item => [item.studentId, item]));
  return input.students.map(student => input.columns.map(column => {
    if (column.id === 'humanId') return student.humanId || '-';
    if (column.id === 'studentName') return student.name || '-';
    if (column.id === 'parentName') return student.parentName || '-';
    if (column.id === 'parentWhatsapp') return student.parentWhatsapp || '-';
    if (column.id === 'parentEmail') return student.parentEmail || '-';
    if (column.id === 'schoolName') return student.schoolName || '-';
    if (column.id.startsWith('custom:')) {
      const data = student.additionalData && typeof student.additionalData === 'object' ? student.additionalData as Record<string, unknown> : {};
      const value = data[column.id.slice('custom:'.length)];
      return value === undefined || value === null || value === '' ? '-' : String(value);
    }
    if (column.id === 'averageMarks') {
      if (student.marks.length === 0) return '-';
      const total = student.marks.reduce((sum, mark) => sum + (mark.test?.maxMarks ? mark.score / mark.test.maxMarks * 100 : mark.score), 0);
      return `${Math.round(total / student.marks.length)}%`;
    }
    if (column.id.startsWith('installment:')) {
      const installment = installments.get(column.id.slice('installment:'.length));
      return installment ? legacyFeeValue(student, installment) : '-';
    }
    if (column.id === 'totalDue') {
      const applicable = input.installments.filter(item => new Date(item.createdAt) >= new Date(student.createdAt));
      const expected = applicable.reduce((sum, item) => sum + item.amount, 0);
      const paid = student.feePayments.reduce((sum, payment) => sum + payment.amountPaid, 0)
        + student.fees.filter(fee => fee.status === 'PAID').reduce((sum, fee) => sum + fee.amount, 0);
      return `₹${Math.max(0, Math.round(expected - paid))}`;
    }
    const month = metrics.get(student.id);
    if (!month) return '-';
    if (column.id === 'feeStartMonth') return month.feeStartMonth || '-';
    if (column.id === 'feeEndMonth') return month.feeEndMonth || '-';
    if (column.id === 'receivedMonths') return String(month.receivedMonths);
    if (column.id === 'pendingMonths') return String(month.pendingMonths);
    if (column.id === 'overdueMonths') return String(month.overdueMonths);
    return '-';
  }));
}
