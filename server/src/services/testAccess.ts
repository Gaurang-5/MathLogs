export function ownsTest(test: { instituteId: string | null; teacherId: string | null }, actor: { instituteId?: string; id?: string }): boolean {
    return Boolean(test.instituteId && actor.id && test.instituteId === actor.instituteId && test.teacherId === actor.id);
}
export function eligibleEnrollment<T extends { batchId: string; batch: { className: string | null; teacherId: string | null } }>(test: { batchId: string | null; className: string | null; batches: { id: string }[] }, enrollments: T[], teacherId: string) {
    const ids = new Set([test.batchId, ...test.batches.map(b => b.id)].filter(Boolean));
    return enrollments.find(e => e.batch.teacherId === teacherId && (ids.size ? ids.has(e.batchId) : !test.className || e.batch.className === test.className));
}
