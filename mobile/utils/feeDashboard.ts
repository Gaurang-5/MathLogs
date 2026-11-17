export type FeeStudentState = 'pending' | 'part_paid' | 'paid' | 'not_configured';
export type FeeStudentFilter = 'needs_payment' | 'all' | 'paid';

export interface FeeDashboardStudent {
  id: string;
  humanId: string | null;
  name: string;
  batchName: string;
  totalFee: number;
  totalPaid: number;
  balance: number;
  lastPaymentDate: string | null;
  oldestDue: string | null;
  breakdown?: Array<{ name: string; due: number }>;
}

export function feeStudentState(student: FeeDashboardStudent): FeeStudentState {
  if (student.totalFee <= 0 && student.balance <= 0) return 'not_configured';
  if (student.balance <= 0) return 'paid';
  if (student.totalPaid > 0) return 'part_paid';
  return 'pending';
}

export function filterFeeStudents(
  students: FeeDashboardStudent[],
  input: { search: string; status: FeeStudentFilter; batch: string },
): FeeDashboardStudent[] {
  const needle = input.search.trim().toLowerCase();
  return students
    .filter(student => {
      const state = feeStudentState(student);
      const matchesStatus = input.status === 'all'
        || (input.status === 'paid' ? state === 'paid' : state === 'pending' || state === 'part_paid');
      const matchesBatch = input.batch === 'All' || student.batchName.split(',').some(name => name.trim() === input.batch);
      const matchesSearch = !needle || [student.name, student.humanId ?? '', student.batchName]
        .some(value => value.toLowerCase().includes(needle));
      return matchesStatus && matchesBatch && matchesSearch;
    })
    .sort((left, right) => {
      const leftState = feeStudentState(left);
      const rightState = feeStudentState(right);
      if (leftState === 'part_paid' && rightState !== 'part_paid') return -1;
      if (rightState === 'part_paid' && leftState !== 'part_paid') return 1;
      if (left.balance !== right.balance) return right.balance - left.balance;
      return left.name.localeCompare(right.name);
    });
}

export function feeCollectionStats(students: FeeDashboardStudent[]) {
  const collected = students.reduce((sum, student) => sum + Math.max(0, student.totalPaid), 0);
  const outstanding = students.reduce((sum, student) => sum + Math.max(0, student.balance), 0);
  const expected = collected + outstanding;
  const rate = expected > 0 ? Math.min(100, Math.round((collected / expected) * 100)) : 0;
  const needsPayment = students.filter(student => ['pending', 'part_paid'].includes(feeStudentState(student))).length;
  const paid = students.filter(student => feeStudentState(student) === 'paid').length;
  return { collected, outstanding, expected, rate, needsPayment, paid };
}
