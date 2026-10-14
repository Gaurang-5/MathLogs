export type EnrollmentEvidenceKind = 'MONTH_PROFILE' | 'INSTALLMENT' | 'PAYMENT' | 'TEST';

export type EnrollmentBackfillStudent = {
  id: string;
  instituteId: string;
  batchId: string | null;
  status: string;
  createdAt: Date;
  leftAt?: Date | null;
};

export type EnrollmentEvidence = {
  batchId: string;
  instituteId: string;
  kind: EnrollmentEvidenceKind;
};

export type PlannedEnrollment = {
  migrationKey: string;
  instituteId: string;
  studentId: string;
  batchId: string;
  status: 'ACTIVE' | 'ENDED';
  startedAt: Date;
  endedAt: Date | null;
  endReason: string | null;
};

export type EnrollmentBackfillInput = {
  students: EnrollmentBackfillStudent[];
  evidenceByStudent: Record<string, EnrollmentEvidence[]>;
};

export type EnrollmentBackfillPlan = {
  enrollments: PlannedEnrollment[];
  unresolved: Array<{ studentId: string; reason: string; evidence: EnrollmentEvidence[] }>;
  crossTenantRows: string[];
};

function uniqueEvidence(evidence: EnrollmentEvidence[]): EnrollmentEvidence[] {
  const seen = new Set<string>();
  return evidence.filter(item => {
    const key = `${item.instituteId}:${item.batchId}:${item.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildEnrollmentBackfillPlan(input: EnrollmentBackfillInput): EnrollmentBackfillPlan {
  const enrollments: PlannedEnrollment[] = [];
  const unresolved: EnrollmentBackfillPlan['unresolved'] = [];
  const crossTenantRows: string[] = [];

  for (const student of input.students) {
    const evidence = uniqueEvidence(input.evidenceByStudent[student.id] || []);
    const crossTenant = evidence.filter(item => item.instituteId !== student.instituteId);
    if (crossTenant.length > 0) {
      crossTenantRows.push(student.id);
      unresolved.push({ studentId: student.id, reason: 'CROSS_TENANT_EVIDENCE', evidence });
      continue;
    }

    if (student.batchId && student.status !== 'LEFT') {
      enrollments.push({
        migrationKey: `legacy-active:${student.id}:${student.batchId}`,
        instituteId: student.instituteId,
        studentId: student.id,
        batchId: student.batchId,
        status: 'ACTIVE',
        startedAt: student.createdAt,
        endedAt: null,
        endReason: null,
      });
      continue;
    }

    const batchIds = [...new Set(evidence.map(item => item.batchId))];
    if (batchIds.length === 1) {
      enrollments.push({
        migrationKey: `legacy-ended:${student.id}:${batchIds[0]}`,
        instituteId: student.instituteId,
        studentId: student.id,
        batchId: batchIds[0],
        status: 'ENDED',
        startedAt: student.createdAt,
        endedAt: student.leftAt || student.createdAt,
        endReason: 'Migrated from legacy student history',
      });
      continue;
    }

    if (batchIds.length > 1) {
      unresolved.push({ studentId: student.id, reason: 'AMBIGUOUS_BATCH_EVIDENCE', evidence });
    }
  }

  return { enrollments, unresolved, crossTenantRows };
}
