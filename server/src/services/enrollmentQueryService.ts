import type { EnrollmentCandidate } from '../domain/enrollments/types';
import { normalizeIdentityPhone, normalizeIdentityText } from '../domain/enrollments/identity';

type CandidateStudentRow = {
  id: string;
  humanId: string | null;
  name: string;
  parentName: string;
  parentWhatsapp: string;
  schoolName: string | null;
  balance: { balance: number } | null;
  enrollments: Array<{ status: 'ACTIVE' | 'ENDED'; batch: { id: string; name: string } }>;
};

type CandidateDb = {
  student: {
    findMany(args: unknown): Promise<CandidateStudentRow[]>;
  };
};

type MembershipDb = {
  enrollment: {
    findFirst(args: unknown): Promise<{ id: string } | null>;
    findMany(args: unknown): Promise<Array<{ batchId: string }>>;
  };
};

export async function searchEnrollmentCandidates(
  input: { instituteId: string; batchId: string; query: string },
  db: CandidateDb,
): Promise<EnrollmentCandidate[]> {
  const textQuery = normalizeIdentityText(input.query);
  const phoneQuery = normalizeIdentityPhone(input.query);
  if (textQuery.length < 2) return [];

  const rows = await db.student.findMany({
    where: {
      instituteId: input.instituteId,
      OR: [
        { humanId: { contains: input.query.trim(), mode: 'insensitive' } },
        { name: { contains: input.query.trim(), mode: 'insensitive' } },
        { parentName: { contains: input.query.trim(), mode: 'insensitive' } },
        { parentWhatsapp: { contains: phoneQuery || input.query.trim() } },
        { schoolName: { contains: input.query.trim(), mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      humanId: true,
      name: true,
      parentName: true,
      parentWhatsapp: true,
      schoolName: true,
      balance: { select: { balance: true } },
      enrollments: {
        select: { status: true, batch: { select: { id: true, name: true } } },
        orderBy: { startedAt: 'desc' },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: 25,
  });

  return rows.map(row => {
    const reasons: EnrollmentCandidate['matchReasons'] = [];
    if (normalizeIdentityText(row.humanId || '') === textQuery) reasons.push('HUMAN_ID');
    if (phoneQuery.length >= 7 && normalizeIdentityPhone(row.parentWhatsapp).includes(phoneQuery)) reasons.push('PARENT_PHONE');
    if (normalizeIdentityText(row.name).includes(textQuery)) reasons.push('STUDENT_NAME');
    if (normalizeIdentityText(row.parentName).includes(textQuery)) reasons.push('PARENT_NAME');
    if (row.schoolName && normalizeIdentityText(row.schoolName).includes(textQuery)) reasons.push('SCHOOL');

    const currentBatches = row.enrollments
      .filter(enrollment => enrollment.status === 'ACTIVE')
      .map(enrollment => enrollment.batch);
    const previousBatches = row.enrollments
      .filter(enrollment => enrollment.status === 'ENDED')
      .map(enrollment => enrollment.batch);

    return {
      studentId: row.id,
      humanId: row.humanId,
      name: row.name,
      parentName: row.parentName,
      parentWhatsapp: row.parentWhatsapp,
      schoolName: row.schoolName,
      currentBatches,
      previousBatches,
      balance: row.balance?.balance || 0,
      matchReasons: reasons,
    };
  });
}

export async function isStudentActiveInBatch(
  db: MembershipDb,
  studentId: string,
  batchId: string,
): Promise<boolean> {
  const enrollment = await db.enrollment.findFirst({
    where: { studentId, batchId, status: 'ACTIVE' },
    select: { id: true },
  });
  return Boolean(enrollment);
}

export async function listActiveBatchIds(
  db: MembershipDb,
  studentId: string,
): Promise<string[]> {
  const enrollments = await db.enrollment.findMany({
    where: { studentId, status: 'ACTIVE' },
    select: { batchId: true },
    orderBy: { startedAt: 'asc' },
  });
  return enrollments.map(enrollment => enrollment.batchId);
}
