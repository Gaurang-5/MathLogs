import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from '../prisma';
import { ownsTest, eligibleEnrollment } from '../services/testAccess';
import { secureLogger } from '../utils/secureLogger';
import { submitMarksBatchSchema } from '../schemas';

type Result = { studentId: string; saved: boolean; error?: string; conflict?: boolean; currentScore?: number | null };

/** One bounded transaction and set-based writes for a photo's marks. */
export async function submitMarksBatch(req: Request, res: Response) {
    // Validation middleware checks the request but does not replace it with transformed values.
    const { testId, marks } = submitMarksBatchSchema.parse({ body: req.body }).body;
    const actor = req.user;
    const started = Date.now();
    try {
        const response = await prisma.$transaction(async tx => {
            // Same lock as single-mark saves: concurrent corrections cannot bypass expectedScore.
            await tx.$queryRaw`SELECT id FROM "Test" WHERE id=${testId} AND "instituteId"=${actor.instituteId} AND "teacherId"=${actor.id} FOR UPDATE`;
            const test = await tx.test.findUnique({ where: { id: testId }, include: { batches: { select: { id: true } } } });
            if (!test || !ownsTest(test, actor)) return { status: 403, body: { error: 'Test is not available for this account' } };
            const students = await tx.student.findMany({
                where: { id: { in: marks.map(m => m.studentId) }, instituteId: actor.instituteId },
                include: { enrollments: { include: { batch: true } }, marks: { where: { testId } } },
            });
            const byId = new Map(students.map(s => [s.id, s]));
            const changes: { studentId: string; score: number; name: string; previous: number | null }[] = [];
            const results: Result[] = marks.map(input => {
                const student = byId.get(input.studentId), previous = student?.marks[0];
                const eligible = student?.enrollments.filter(e => e.status === 'ACTIVE' || (previous && e.startedAt <= test.date && (!e.endedAt || e.endedAt >= test.date)));
                if (!student || !eligibleEnrollment(test, eligible || [], actor.id)) return { studentId: input.studentId, saved: false, error: 'Student is not enrolled for this test.' };
                if (!Number.isFinite(input.score) || input.score < 0 || input.score > test.maxMarks) return { studentId: input.studentId, saved: false, error: `Enter a mark between 0 and ${test.maxMarks}.` };
                if (previous?.score === input.score) return { studentId: input.studentId, saved: true };
                if ((previous?.score ?? null) !== input.expectedScore) return { studentId: input.studentId, saved: false, conflict: true, currentScore: previous?.score ?? null, error: 'The saved mark changed. Review it before replacing.' };
                changes.push({ studentId: input.studentId, score: input.score, name: student.name, previous: previous?.score ?? null });
                return { studentId: input.studentId, saved: true };
            });
            if (changes.length) {
                await tx.$executeRaw(Prisma.sql`INSERT INTO "Mark" ("id", "studentId", "testId", "score") VALUES ${Prisma.join(changes.map(m => Prisma.sql`(${randomUUID()}, ${m.studentId}, ${testId}, ${m.score})`))} ON CONFLICT ("studentId", "testId") DO UPDATE SET "score" = EXCLUDED."score"`);
                await tx.systemLog.createMany({ data: changes.map(m => ({ instituteId: actor.instituteId, action: m.previous === null ? 'MARK_RECORDED' : 'MARK_CORRECTED', entityId: m.studentId, entityName: m.name, details: { testId, actorId: actor.id, previousScore: m.previous, score: m.score } })) });
            }
            return { status: 200, body: { results } };
        }, { maxWait: 3000, timeout: 15000 });
        secureLogger.info('Batch marks save completed', { count: marks.length, elapsedMs: Date.now() - started, status: response.status });
        return res.status(response.status).json(response.body);
    } catch (error) {
        // Log only safe diagnostics, never connection strings or student records.
        secureLogger.warn('Batch marks save failed', { count: marks.length, elapsedMs: Date.now() - started, code: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : 'unknown' });
        return res.status(503).json({ error: 'Saving could not finish. Your entries are kept; Confirm to retry safely.' });
    }
}
